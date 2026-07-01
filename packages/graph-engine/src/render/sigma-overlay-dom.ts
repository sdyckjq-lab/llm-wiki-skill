import type {
  GraphRendererAdapterData,
  GraphRendererAdapterNode
} from "./adapter";
import type { SigmaCommunityCloud } from "./community-cloud-geometry";
import type { GraphScreenPoint } from "./geometry";
import {
  bindSigmaGlobalOverlayMouseDrag,
  bindSigmaGlobalOverlayPointerDrag
} from "./sigma-global-drag";
import {
  sigmaWorldPointToScreenPoint,
  sigmaWorldPointToScreenPointForCameraState
} from "./sigma-coordinates";
import {
  projectSigmaOverlayCameraAnchors,
  sigmaOverlayCameraAnchorWorldPoints,
  sigmaOverlayCameraTransform,
  sigmaOverlayCameraTransformCss,
  type SigmaOverlayCameraAnchorProjection,
  type SigmaOverlayCameraAnchorWorldPoints
} from "./sigma-overlay-camera-transform";
import {
  sigmaGlobalNodeSize,
  sigmaGlobalNodeSpotlightState,
  sigmaSelectedCommunityIds,
  sigmaSpotlightCommunityIds
} from "./sigma-graphology-model";
import type {
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
import type { SigmaGlobalRenderedObject } from "./sigma-hit-projector";
import {
  applyOverlayBox,
  applySigmaCloudColor,
  applySigmaCloudGeometry,
  createSigmaCloudSvg,
  sigmaOverlayButton,
  sigmaOverlayPassiveElement,
  type SigmaCloudKind
} from "./sigma-overlay-svg";

const SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT = 8;
const SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT = 160;

export interface SigmaOverlayDomController {
  rebuild(): void;
  reposition(): void;
  repositionForCameraAnimation(): boolean;
  invalidateAnimationBaseline(): void;
  clearActiveDragListeners(): void;
  destroy(): void;
}

export interface SigmaOverlayDomControllerInput {
  overlayRoot: HTMLElement;
  cloudFilterId: string;
  getAdapterData: () => GraphRendererAdapterData;
  getSigma: () => SigmaGlobalSigmaLike;
  getOptions: () => Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">;
  communityCloudFor: (communityId: string, wash: { cx: number; cy: number; rx: number; ry: number }) => SigmaCommunityCloud;
  isDestroyed: () => boolean;
  onHit: (object: SigmaGlobalRenderedObject) => void;
  beginNodeDrag: (nodeId: string, point: GraphScreenPoint, payload?: unknown) => void;
  moveNodeDrag: (point: GraphScreenPoint, payload?: unknown) => void;
  commitNodeDrag: (point: GraphScreenPoint | null, payload?: unknown) => void;
  cancelNodeDrag: () => void;
  screenPointFromEvent: (event: MouseEvent | PointerEvent) => GraphScreenPoint;
  consumeSuppressedNodeClick: (nodeId: string | null) => boolean;
  activeNodeDragId: () => string | null;
}

export function createSigmaOverlayDomController(input: SigmaOverlayDomControllerInput): SigmaOverlayDomController {
  const overlayRegionEntries = new Map<string, { element: HTMLElement; shape: SVGElement; kind: SigmaCloudKind }>();
  const overlayNodeEntries = new Map<string, HTMLButtonElement>();
  const overlayLabelEntries = new Map<string, HTMLElement>();
  let overlayPointerDragCleanup: (() => void) | null = null;
  let cameraAnimationBaseline: {
    world: SigmaOverlayCameraAnchorWorldPoints;
    screen: SigmaOverlayCameraAnchorProjection;
  } | null = null;

  return {
    rebuild,
    reposition,
    repositionForCameraAnimation,
    invalidateAnimationBaseline,
    clearActiveDragListeners,
    destroy
  };

  function rebuild(): void {
    if (input.isDestroyed()) return;
    const adapterData = input.getAdapterData();
    const ordered: HTMLElement[] = [];
    const selectedCommunityIds = sigmaSelectedCommunityIds(adapterData);
    const spotlightCommunityIds = sigmaSpotlightCommunityIds(adapterData);

    const nextRegionIds = new Set<string>();
    for (const community of adapterData.renderable.communities) {
      if (!community.wash) continue;
      nextRegionIds.add(community.id);
      const cloud = input.communityCloudFor(community.id, community.wash);
      const kind: SigmaCloudKind = cloud.localPoints ? "polygon" : "ellipse";
      let entry = overlayRegionEntries.get(community.id);
      if (!entry || entry.kind !== kind) {
        const element = sigmaOverlayPassiveElement(input.overlayRoot.ownerDocument, "community-region", community.id);
        element.className = "sigma-global-community-region";
        element.dataset.communityId = community.id;
        element.style.overflow = "visible";
        const handle = createSigmaCloudSvg(input.overlayRoot.ownerDocument, cloud, input.cloudFilterId, () => {
          input.onHit({ kind: "community-wash", id: community.id });
        });
        element.append(handle.svg);
        entry = { element, shape: handle.shape, kind: handle.kind };
        overlayRegionEntries.set(community.id, entry);
      }
      const selected = selectedCommunityIds.has(community.id);
      const dim = selectedCommunityIds.size > 0 && !selected;
      entry.element.dataset.selected = selected ? "true" : "false";
      applySigmaCloudColor(entry.shape, community.color, dim);
      ordered.push(entry.element);
    }
    pruneOverlayEntries(overlayRegionEntries, nextRegionIds);

    const nextNodeIds = new Set<string>();
    for (const node of sigmaOverlayNodes(adapterData)) {
      nextNodeIds.add(node.id);
      let element = overlayNodeEntries.get(node.id);
      if (!element) {
        element = createSigmaNodeHitTarget(node.id, node.label || node.id);
        overlayNodeEntries.set(node.id, element);
      }
      element.setAttribute("aria-label", node.label || node.id);
      element.dataset.nodeId = node.id;
      element.dataset.searchHit = node.searchHit ? "true" : "false";
      element.dataset.selected = node.selected ? "true" : "false";
      element.dataset.pinned = node.pinHint.pinned ? "true" : "false";
      element.dataset.communityDimmed = sigmaGlobalNodeSpotlightState(node, spotlightCommunityIds).dimmed ? "true" : "false";
      ordered.push(element);
    }
    pruneOverlayEntries(overlayNodeEntries, nextNodeIds);

    const nextLabelIds = new Set<string>();
    for (const community of sigmaCommunityLabels(adapterData, SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT)) {
      if (!community.wash) continue;
      nextLabelIds.add(community.id);
      let element = overlayLabelEntries.get(community.id);
      if (!element) {
        element = sigmaOverlayPassiveElement(input.overlayRoot.ownerDocument, "community-label", community.id);
        element.className = "sigma-global-community-label";
        element.dataset.communityId = community.id;
        overlayLabelEntries.set(community.id, element);
      }
      const labelSelected = selectedCommunityIds.has(community.id);
      element.dataset.selected = labelSelected ? "true" : "false";
      element.dataset.dim = selectedCommunityIds.size > 0 && !labelSelected ? "true" : "false";
      element.textContent = community.label || community.id;
      ordered.push(element);
    }
    pruneOverlayEntries(overlayLabelEntries, nextLabelIds);

    input.overlayRoot.replaceChildren(...ordered);
    reposition();
  }

  function reposition(): void {
    if (input.isDestroyed()) return;
    clearCameraAnimationTransform();
    const adapterData = input.getAdapterData();
    const sigma = input.getSigma();
    const options = input.getOptions();
    for (const community of adapterData.renderable.communities) {
      if (!community.wash) continue;
      const entry = overlayRegionEntries.get(community.id);
      if (!entry) continue;
      const cloud = input.communityCloudFor(community.id, community.wash);
      applyOverlayBox(entry.element, cloud.box);
      applySigmaCloudGeometry(entry.shape, entry.kind, cloud);
    }
    for (const node of sigmaOverlayNodes(adapterData)) {
      const element = overlayNodeEntries.get(node.id);
      if (!element) continue;
      const size = Math.max(16, sigmaGlobalNodeSize(node) * 3);
      const center = sigmaWorldPointToScreenPoint(sigma, node.point, options);
      applyOverlayBox(element, {
        left: center.x - size / 2,
        top: center.y - size / 2,
        width: size,
        height: size
      });
    }
    for (const community of sigmaCommunityLabels(adapterData, SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT)) {
      if (!community.wash) continue;
      const element = overlayLabelEntries.get(community.id);
      if (!element) continue;
      const center = sigmaWorldPointToScreenPoint(sigma, {
        x: community.wash.cx,
        y: community.wash.cy - community.wash.ry * 0.16
      }, options);
      applyOverlayBox(element, {
        left: center.x,
        top: center.y,
        width: 160,
        height: 22
      });
    }
    refreshCameraAnimationBaseline(adapterData, sigma, options);
  }

  function repositionForCameraAnimation(): boolean {
    if (input.isDestroyed()) return false;
    if (!cameraAnimationBaseline) {
      reposition();
      return false;
    }
    const sigma = input.getSigma();
    const options = input.getOptions();
    const cameraState = sigma.getCamera?.().getState?.();
    const current = projectSigmaOverlayCameraAnchors(
      cameraAnimationBaseline.world,
      (point) => cameraState
        ? sigmaWorldPointToScreenPointForCameraState(sigma, point, cameraState, options)
        : sigmaWorldPointToScreenPoint(sigma, point, options)
    );
    const transform = sigmaOverlayCameraTransform(cameraAnimationBaseline.screen, current);
    const css = sigmaOverlayCameraTransformCss(transform);
    if (!css) {
      reposition();
      return false;
    }
    input.overlayRoot.style.transformOrigin = "0 0";
    input.overlayRoot.style.transform = css;
    input.overlayRoot.style.willChange = "transform";
    return true;
  }

  function invalidateAnimationBaseline(): void {
    cameraAnimationBaseline = null;
    clearCameraAnimationTransform();
  }

  function refreshCameraAnimationBaseline(
    adapterData: GraphRendererAdapterData,
    sigma: SigmaGlobalSigmaLike,
    options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
  ): void {
    const world = sigmaOverlayCameraAnchorWorldPoints(adapterData.renderable.worldBounds);
    cameraAnimationBaseline = {
      world,
      screen: projectSigmaOverlayCameraAnchors(world, (point) => sigmaWorldPointToScreenPoint(sigma, point, options))
    };
  }

  function clearCameraAnimationTransform(): void {
    input.overlayRoot.style.transform = "";
    input.overlayRoot.style.transformOrigin = "";
    input.overlayRoot.style.willChange = "";
  }

  function destroy(): void {
    invalidateAnimationBaseline();
    clearActiveDragListeners();
    overlayRegionEntries.clear();
    overlayNodeEntries.clear();
    overlayLabelEntries.clear();
    input.overlayRoot.replaceChildren();
  }

  function createSigmaNodeHitTarget(nodeId: string, label: string): HTMLButtonElement {
    const element = sigmaOverlayButton(input.overlayRoot.ownerDocument, "node", nodeId, label);
    element.className = "sigma-global-node-hit-target";
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      if (input.consumeSuppressedNodeClick(nodeId)) return;
      input.onHit({ kind: "node", id: nodeId });
    });
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      input.beginNodeDrag(nodeId, input.screenPointFromEvent(event), event);
      if (input.activeNodeDragId() === nodeId) {
        bindOverlayPointerDragListeners(element.ownerDocument, element, nodeId, event.pointerId);
      }
    });
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (element.ownerDocument.defaultView?.PointerEvent) return;
      event.preventDefault();
      event.stopPropagation();
      if (input.activeNodeDragId() !== nodeId) {
        input.beginNodeDrag(nodeId, input.screenPointFromEvent(event), event);
      }
      if (input.activeNodeDragId() === nodeId) {
        bindOverlayMouseDragListeners(element.ownerDocument, nodeId);
      }
    });
    element.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    return element;
  }

  function bindOverlayPointerDragListeners(ownerDocument: Document, element: HTMLElement, nodeId: string, pointerId: number): void {
    clearActiveDragListeners();
    const cleanup = bindSigmaGlobalOverlayPointerDrag({
      ownerDocument,
      element,
      nodeId,
      pointerId,
      isActive: isActiveOverlayDrag,
      screenPointFromEvent: input.screenPointFromEvent,
      onMove: input.moveNodeDrag,
      onEnd: (point, event) => {
        input.commitNodeDrag(point, event);
        clearActiveDragListeners();
      },
      onCancel: () => {
        input.cancelNodeDrag();
        clearActiveDragListeners();
      }
    });
    overlayPointerDragCleanup = () => {
      cleanup();
      overlayPointerDragCleanup = null;
    };
  }

  function bindOverlayMouseDragListeners(ownerDocument: Document, nodeId: string): void {
    clearActiveDragListeners();
    const cleanup = bindSigmaGlobalOverlayMouseDrag({
      ownerDocument,
      nodeId,
      isActive: isActiveOverlayDrag,
      screenPointFromEvent: input.screenPointFromEvent,
      onMove: input.moveNodeDrag,
      onEnd: (point, event) => {
        input.commitNodeDrag(point, event);
        clearActiveDragListeners();
      }
    });
    overlayPointerDragCleanup = () => {
      cleanup();
      overlayPointerDragCleanup = null;
    };
  }

  function isActiveOverlayDrag(nodeId: string): boolean {
    return input.activeNodeDragId() === nodeId;
  }

  function clearActiveDragListeners(): void {
    overlayPointerDragCleanup?.();
  }
}

export function sigmaOverlayNodes(adapterData: GraphRendererAdapterData): GraphRendererAdapterNode[] {
  const nodes = adapterData.nodes;
  const seen = new Set<string>();
  const output: GraphRendererAdapterNode[] = [];
  const append = (candidates: GraphRendererAdapterNode[], limit: number) => {
    let count = 0;
    for (const node of candidates) {
      if (output.length >= SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT || count >= limit || seen.has(node.id)) continue;
      seen.add(node.id);
      output.push(node);
      count += 1;
    }
  };
  if (adapterData.selection.input?.kind !== "community") {
    append(nodes.filter((node) => node.selected), Number.POSITIVE_INFINITY);
  }
  append(nodes.filter((node) => node.searchHit), 80);
  append(nodes.filter((node) => node.pinHint.pinned), 80);
  return output;
}

export function sigmaCommunityLabels(adapterData: GraphRendererAdapterData, limit: number): GraphRendererAdapterData["renderable"]["communities"] {
  const selectedCommunityIds = new Set(adapterData.communities.filter((community) => community.selected).map((community) => community.id));
  return adapterData.renderable.communities
    .filter((community) => community.wash)
    .map((community, index) => ({
      community,
      index,
      selected: selectedCommunityIds.has(community.id)
    }))
    .sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (left.community.nodeCount !== right.community.nodeCount) return right.community.nodeCount - left.community.nodeCount;
      return left.index - right.index;
    })
    .slice(0, limit)
    .map((candidate) => candidate.community);
}

function pruneOverlayEntries(entries: Map<string, unknown>, keep: Set<string>): void {
  for (const id of [...entries.keys()]) {
    if (!keep.has(id)) entries.delete(id);
  }
}
