import type {
  GraphRendererAdapterData,
  GraphRendererAdapterNode
} from "./adapter";
import {
  SIGMA_READING_COMMUNITY_CLOUD_MIN_HEIGHT,
  SIGMA_READING_COMMUNITY_CLOUD_MIN_WIDTH,
  sigmaCommunityCloud,
  sigmaCommunityCloudBasisById,
  sigmaProjectedCloudHullPoints,
  type SigmaCommunityCloud
} from "./community-cloud-geometry";
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
const SIGMA_COMMUNITY_NODE_LABEL_HIT_MAX_WIDTH = 180;
const SIGMA_COMMUNITY_NODE_LABEL_HIT_MIN_WIDTH = 32;
const SIGMA_COMMUNITY_NODE_LABEL_HIT_HEIGHT = 28;
const SIGMA_COMMUNITY_NODE_LABEL_GUTTER = 8;
const SIGMA_COMMUNITY_NODE_LABEL_GAP = 3;

export interface SigmaOverlayDomController {
  rebuild(): void;
  reposition(): void;
  repositionForCameraAnimation(): boolean;
  invalidateAnimationBaseline(): void;
  clearActiveDragListeners(): void;
  destroy(): void;
}

export interface SigmaOverlayHitContext {
  additive?: boolean;
}

export interface SigmaOverlayDomControllerInput {
  overlayRoot: HTMLElement;
  cloudFilterId: string;
  getAdapterData: () => GraphRendererAdapterData;
  getSigma: () => SigmaGlobalSigmaLike;
  getOptions: () => Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">;
  communityCloudFor: (communityId: string, wash: { cx: number; cy: number; rx: number; ry: number }) => SigmaCommunityCloud;
  isDestroyed: () => boolean;
  onHit: (object: SigmaGlobalRenderedObject, context?: SigmaOverlayHitContext) => void;
  onNodeHover: (nodeId: string | null) => void;
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
    const spotlightCommunityIds = sigmaSpotlightCommunityIds(adapterData);
    // Region/label highlight = active community selections (may be several) plus
    // the returned source-community context, so multi-select still works and the
    // source community stays highlighted after returning to global.
    const highlightCommunityIds = new Set([
      ...sigmaSelectedCommunityIds(adapterData),
      ...spotlightCommunityIds
    ]);

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
      // Phase 2: region highlight follows the spotlight community, which unifies
      // an active community selection AND the returned source-community context,
      // so the source community stays highlighted after returning to global.
      const selected = highlightCommunityIds.has(community.id);
      const dim = highlightCommunityIds.size > 0 && !selected;
      entry.element.dataset.selected = selected ? "true" : "false";
      const regionInteractive = adapterData.renderable.communityMap?.active ? "false" : "true";
      entry.element.dataset.interactive = regionInteractive;
      entry.shape.style.pointerEvents = regionInteractive === "true" ? "fill" : "none";
      entry.shape.style.cursor = regionInteractive === "true" ? "pointer" : "default";
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
      element.dataset.labelVisible = node.render.labelVisible ? "true" : "false";
      element.dataset.relationFocusDepth = node.relationFocusDepth ?? "none";
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
      const labelSelected = highlightCommunityIds.has(community.id);
      element.dataset.selected = labelSelected ? "true" : "false";
      element.dataset.dim = highlightCommunityIds.size > 0 && !labelSelected ? "true" : "false";
      element.textContent = community.label || community.id;
      ordered.push(element);
    }
    pruneOverlayEntries(overlayLabelEntries, nextLabelIds);

    input.overlayRoot.replaceChildren(...ordered);
    appendMissingOverlayChildren(ordered);
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
      applyOverlayBox(element, sigmaNodeHitTargetBox(node, center, size, adapterData, options.viewportSize));
    }
    for (const community of sigmaCommunityLabels(adapterData, SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT)) {
      if (!community.wash) continue;
      const element = overlayLabelEntries.get(community.id);
      if (!element) continue;
      const center = communityLabelScreenPoint(community, adapterData, sigma, options);
      const labelWidth = sigmaCommunityLabelWidth(options.viewportSize);
      applyOverlayBox(element, clampCommunityLabelBox({
        left: center.x,
        top: center.y,
        width: labelWidth,
        height: 22
      }, options.viewportSize, input.overlayRoot));
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
      input.onHit({ kind: "node", id: nodeId }, { additive: event.shiftKey });
    });
    element.addEventListener("pointerenter", () => input.onNodeHover(nodeId));
    element.addEventListener("pointerleave", () => input.onNodeHover(null));
    element.addEventListener("focus", () => input.onNodeHover(nodeId));
    element.addEventListener("blur", () => input.onNodeHover(null));
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.shiftKey) {
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      input.beginNodeDrag(nodeId, input.screenPointFromEvent(event), event);
      if (input.activeNodeDragId() === nodeId) {
        bindOverlayPointerDragListeners(element.ownerDocument, element, nodeId, event.pointerId);
      }
    });
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (element.ownerDocument.defaultView?.PointerEvent) return;
      if (event.shiftKey) {
        event.stopPropagation();
        return;
      }
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

  function appendMissingOverlayChildren(children: HTMLElement[]): void {
    for (const child of children) {
      if (overlayRootContains(child)) continue;
      input.overlayRoot.append(child);
    }
  }

  function overlayRootContains(child: HTMLElement): boolean {
    return Array.prototype.includes.call(input.overlayRoot.children, child);
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

function sigmaNodeHitTargetBox(
  node: GraphRendererAdapterNode,
  center: GraphScreenPoint,
  nodeHitSize: number,
  adapterData: GraphRendererAdapterData,
  viewportSize?: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const dotBox = {
    left: center.x - nodeHitSize / 2,
    top: center.y - nodeHitSize / 2,
    width: nodeHitSize,
    height: nodeHitSize
  };
  if (!adapterData.renderable.communityMap?.active || !node.render.labelVisible) return dotBox;

  const labelWidth = sigmaEstimatedNodeLabelWidth(node.label || node.id);
  const nodeSize = sigmaGlobalNodeSize(node);
  const rightX = center.x + nodeSize + SIGMA_COMMUNITY_NODE_LABEL_GAP;
  const leftX = center.x - nodeSize - SIGMA_COMMUNITY_NODE_LABEL_GAP - labelWidth;
  const viewportWidth = viewportSize?.width ?? 0;
  const shouldDrawLeft = viewportWidth > 0
    && rightX + labelWidth > viewportWidth - SIGMA_COMMUNITY_NODE_LABEL_GUTTER
    && leftX >= SIGMA_COMMUNITY_NODE_LABEL_GUTTER;
  const labelBox = {
    left: (shouldDrawLeft ? leftX : rightX) - 4,
    top: center.y - SIGMA_COMMUNITY_NODE_LABEL_HIT_HEIGHT / 2,
    width: labelWidth + 8,
    height: SIGMA_COMMUNITY_NODE_LABEL_HIT_HEIGHT
  };
  return unionOverlayBoxes(dotBox, labelBox);
}

function sigmaEstimatedNodeLabelWidth(label: string): number {
  const width = [...label].reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    return sum + (code > 255 ? 12 : 7);
  }, 12);
  return Math.min(SIGMA_COMMUNITY_NODE_LABEL_HIT_MAX_WIDTH, Math.max(SIGMA_COMMUNITY_NODE_LABEL_HIT_MIN_WIDTH, width));
}

function unionOverlayBoxes(
  leftBox: { left: number; top: number; width: number; height: number },
  rightBox: { left: number; top: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(leftBox.left, rightBox.left);
  const top = Math.min(leftBox.top, rightBox.top);
  const right = Math.max(leftBox.left + leftBox.width, rightBox.left + rightBox.width);
  const bottom = Math.max(leftBox.top + leftBox.height, rightBox.top + rightBox.height);
  return { left, top, width: right - left, height: bottom - top };
}

function communityLabelScreenPoint(
  community: GraphRendererAdapterData["renderable"]["communities"][number],
  adapterData: GraphRendererAdapterData,
  sigma: SigmaGlobalSigmaLike,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint {
  if (adapterData.renderable.communityMap?.active && community.wash) {
    const fallbackBox = overlayBoxFromWorldEllipse(community.wash, sigma, options);
    const cloud = sigmaCommunityCloud(
      sigmaProjectedCloudHullPoints(
        sigmaCommunityCloudBasisById(adapterData).get(community.id),
        sigma,
        options
      ),
      fallbackBox,
      {
        minBoxWidth: SIGMA_READING_COMMUNITY_CLOUD_MIN_WIDTH,
        minBoxHeight: SIGMA_READING_COMMUNITY_CLOUD_MIN_HEIGHT
      }
    );
    return {
      x: cloud.box.left + cloud.box.width / 2,
      y: cloud.box.top + 15
    };
  }
  return sigmaWorldPointToScreenPoint(sigma, {
    x: community.wash?.cx ?? 0,
    y: (community.wash?.cy ?? 0) - (community.wash?.ry ?? 0) * 0.16
  }, options);
}

function overlayBoxFromWorldEllipse(
  wash: { cx: number; cy: number; rx: number; ry: number },
  sigma: SigmaGlobalSigmaLike,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): { left: number; top: number; width: number; height: number } {
  const topLeft = sigmaWorldPointToScreenPoint(sigma, { x: wash.cx - wash.rx, y: wash.cy - wash.ry }, options);
  const bottomRight = sigmaWorldPointToScreenPoint(sigma, { x: wash.cx + wash.rx, y: wash.cy + wash.ry }, options);
  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  return {
    left,
    top,
    width: Math.max(8, Math.abs(bottomRight.x - topLeft.x)),
    height: Math.max(8, Math.abs(bottomRight.y - topLeft.y))
  };
}

function sigmaCommunityLabelWidth(viewportSize?: { width: number; height: number }): number {
  const width = finiteOverlayNumber(viewportSize?.width, 0);
  if (width <= 0) return 160;
  return Math.min(160, Math.max(72, width - 8));
}

function clampCommunityLabelBox(
  box: { left: number; top: number; width: number; height: number },
  viewportSize?: { width: number; height: number },
  overlayRoot?: HTMLElement
): { left: number; top: number; width: number; height: number } {
  const bounds = communityLabelClampBounds(box, viewportSize, overlayRoot);
  if (!bounds) return box;
  return {
    ...box,
    left: clampOverlayCoordinate(box.left, bounds.minX, bounds.maxX),
    top: clampOverlayCoordinate(box.top, bounds.minY, bounds.maxY)
  };
}

function communityLabelClampBounds(
  box: { width: number; height: number },
  viewportSize?: { width: number; height: number },
  overlayRoot?: HTMLElement
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const width = finiteOverlayNumber(viewportSize?.width, 0);
  const height = finiteOverlayNumber(viewportSize?.height, 0);
  if (width <= 0 || height <= 0) return null;
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const fallback = {
    minX: halfWidth,
    maxX: Math.max(halfWidth, width - halfWidth),
    minY: halfHeight,
    maxY: Math.max(halfHeight, height - halfHeight)
  };
  const rootRect = overlayRootRect(overlayRoot);
  const windowSize = overlayWindowSize(overlayRoot);
  if (!rootRect || !windowSize) return fallback;
  const minX = Math.max(fallback.minX, halfWidth - rootRect.left);
  const maxX = Math.min(fallback.maxX, windowSize.width - rootRect.left - halfWidth);
  const minY = Math.max(fallback.minY, halfHeight - rootRect.top);
  const maxY = Math.min(fallback.maxY, windowSize.height - rootRect.top - halfHeight);
  return {
    minX,
    maxX: Math.max(minX, maxX),
    minY,
    maxY: Math.max(minY, maxY)
  };
}

function overlayRootRect(overlayRoot?: HTMLElement): { left: number; top: number } | null {
  const getBoundingClientRect = overlayRoot?.getBoundingClientRect;
  if (typeof getBoundingClientRect !== "function") return null;
  const rect = getBoundingClientRect.call(overlayRoot);
  if (!rect) return null;
  return {
    left: finiteOverlayNumber(rect.left, 0),
    top: finiteOverlayNumber(rect.top, 0)
  };
}

function overlayWindowSize(overlayRoot?: HTMLElement): { width: number; height: number } | null {
  const view = overlayRoot?.ownerDocument?.defaultView;
  if (!view) return null;
  const width = finiteOverlayNumber(view.innerWidth, 0);
  const height = finiteOverlayNumber(view.innerHeight, 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function clampOverlayCoordinate(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteOverlayNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sigmaOverlayNodes(adapterData: GraphRendererAdapterData): GraphRendererAdapterNode[] {
  const nodes = adapterData.nodes;
  const seen = new Set<string>();
  const output: GraphRendererAdapterNode[] = [];
  const sourceContextCommunityId = sigmaOverlaySourceContextCommunityId(adapterData);
  const totalLimit = adapterData.renderable.communityMap?.active || sourceContextCommunityId
    ? Number.POSITIVE_INFINITY
    : SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT;
  const append = (candidates: GraphRendererAdapterNode[], limit: number) => {
    let count = 0;
    for (const node of candidates) {
      if (output.length >= totalLimit || count >= limit || seen.has(node.id)) continue;
      seen.add(node.id);
      output.push(node);
      count += 1;
    }
  };
  if (adapterData.selection.input?.kind !== "community") {
    append(nodes.filter((node) => node.selected), Number.POSITIVE_INFINITY);
  }
  if (adapterData.renderable.communityMap?.active) {
    append(nodes, Number.POSITIVE_INFINITY);
  }
  if (sourceContextCommunityId) {
    append(nodes.filter((node) => node.communityId === sourceContextCommunityId), Number.POSITIVE_INFINITY);
  }
  append(nodes.filter((node) => node.searchHit), 80);
  append(nodes.filter((node) => node.pinHint.pinned), 80);
  if (
    !adapterData.renderable.communityMap?.active
    && !sourceContextCommunityId
    && adapterData.selection.input?.kind !== "community"
  ) {
    append(nodes, SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT);
  }
  return output;
}

function sigmaOverlaySourceContextCommunityId(adapterData: GraphRendererAdapterData): string | null {
  const communityMap = adapterData.renderable.communityMap;
  if (communityMap?.active) return null;
  if (communityMap?.current?.source === "source-context") return communityMap.current.communityId;
  return adapterData.sourceCommunityId ?? null;
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
