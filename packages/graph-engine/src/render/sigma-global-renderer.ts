import type { GraphEdgeStyleOptions, PinMap, PinPosition, ThemeId } from "../types";
import { createGraphSpatialIndex, type GraphSpatialIndex, type GraphSpatialIndexInput } from "../layout";
import { getThemeTokens } from "../themes";
import type {
  GraphRendererAdapterAggregation,
  GraphRendererAdapterCommunity,
  GraphRendererAdapterData,
  GraphRendererAdapterEdge,
  GraphRendererAdapterNode
} from "./adapter";
import {
  bindSigmaGlobalOverlayMouseDrag,
  bindSigmaGlobalOverlayPointerDrag,
  createSigmaGlobalNodeDragSession,
  gestureTargetFromSigmaRenderedObject,
  moveSigmaGlobalNodeDragSession,
  sigmaAdapterDataWithNodePoint,
  sigmaCommunityLabels,
  type SigmaGlobalRenderedObject,
  type SigmaGlobalNodeDragSession
} from "./sigma-global-drag";
import { screenPointToWorldPoint, type GraphScreenPoint } from "./geometry";
import { graphSpatialHitToGestureTarget, type GraphGestureTarget } from "./gestures";
import { edgeRelationClass } from "./model";
import { DEFAULT_RENDERER_VIEWPORT, type RendererViewport, type RendererViewportSize } from "./viewport";
import { overlayPointerScreenPoint, sigmaScreenPointToWorldPoint, sigmaWorldPointToScreenPoint } from "./sigma-coordinates";
import {
  sigmaCommunityCloud,
  sigmaCommunityCloudBasisById,
  sigmaCommunityCloudBasisByIdWithNodePoint,
  sigmaCommunityCloudBasisByIdWithReuse,
  sigmaProjectedCloudHullPoints
} from "./community-cloud-geometry";
import {
  applyOverlayBox,
  createSigmaOverlayRoot,
  nextSigmaCloudFilterSequence,
  sigmaCloudSvg,
  sigmaOverlayButton,
  sigmaOverlayPassiveElement,
  sigmaSharedCloudFilterDef
} from "./sigma-overlay-svg";

export const SIGMA_GLOBAL_RENDERER_ID = "sigma-global" as const;

export const SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER = "facade" as const;

const SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT = 8;
const SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT = 160;

export const SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY = {
  sigma: "runtime-loaded-by-sigma-global-renderer",
  graphology: "runtime-loaded-by-sigma-global-renderer",
  workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
  offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
} as const;

export interface SigmaGlobalRendererRuntimeBoundary {
  Sigma: typeof import("sigma").default;
  GraphologyGraph: typeof import("graphology").default;
}

export type SigmaGlobalGraphologyGraph = InstanceType<SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"]>;

export interface SigmaGlobalCameraState {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

export interface SigmaGlobalCameraLike {
  getState?: () => SigmaGlobalCameraState;
  setState?: (state: Partial<SigmaGlobalCameraState>) => unknown;
}

export interface SigmaGlobalSigmaLike {
  getCamera?: () => SigmaGlobalCameraLike;
  getGraph?: () => unknown;
  setGraph?: (graph: SigmaGlobalGraphologyGraph) => unknown;
  getSetting?: (key: string) => unknown;
  setSetting?: (key: string, value: unknown) => unknown;
  viewportToGraph?: (point: GraphScreenPoint) => { x: number; y: number };
  graphToViewport?: (point: { x: number; y: number }) => GraphScreenPoint;
  refresh?: () => unknown;
  on?: (event: string, listener: (payload?: unknown) => void) => unknown;
  off?: (event: string, listener: (payload?: unknown) => void) => unknown;
  kill?: () => unknown;
}

export interface SigmaGlobalGraphologyRuntime {
  GraphologyGraph: SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"];
}

export interface SigmaGlobalRendererRuntime extends SigmaGlobalGraphologyRuntime {
  Sigma: new (graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) => SigmaGlobalSigmaLike;
}

export interface SigmaGlobalGraphologyNodeAttributes {
  x: number;
  y: number;
  label: string;
  size: number;
  color: string;
  type: string;
  graphNodeType: string;
  communityId: string | null;
  sourcePath: string;
  selected: boolean;
  searchHit: boolean;
  pinned: boolean;
  aggregationIds: string[];
  labelVisible: boolean;
  displayMode: string;
  visualRole: string;
  priority: number;
  drawerTarget: GraphRendererAdapterNode["drawerTarget"];
}

export interface SigmaGlobalGraphologyEdgeAttributes {
  size: number;
  color: string;
  relationType: string | null;
  confidence: string | null;
  weight: number;
  sourceCommunityId: string | null;
  targetCommunityId: string | null;
}

export interface SigmaGlobalGraphologyCommunityAttributes {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  nodeCount: number;
  selected: boolean;
  searchResultIds: string[];
  pinnedNodeIds: string[];
  aggregationIds: string[];
  drawerTarget: GraphRendererAdapterCommunity["drawerTarget"];
  commands: GraphRendererAdapterCommunity["commands"];
}

export interface SigmaGlobalGraphologyAggregationAttributes {
  id: string;
  label: string;
  communityId: string | null;
  nodeIds: string[];
  selectedNodeIds: string[];
  searchResultIds: string[];
  pinnedNodeIds: string[];
  totalCount: number;
  selected: boolean;
  color: string;
  point: { x: number; y: number } | null;
  radius: number | null;
  drawerTarget: GraphRendererAdapterAggregation["drawerTarget"];
  commands: GraphRendererAdapterAggregation["commands"];
}

export interface SigmaGlobalHitInput {
  nodeId?: string | null;
  screenPoint?: GraphScreenPoint | null;
  renderedObject?: SigmaGlobalRenderedObject | null;
}

interface SigmaGlobalPointerEventPayload {
  node?: unknown;
  event?: { x?: unknown; y?: unknown; preventSigmaDefault?: () => void };
  x?: unknown;
  y?: unknown;
  preventSigmaDefault?: () => void;
}

export interface SigmaGlobalHitProjectorInput {
  adapterData: GraphRendererAdapterData;
  viewport: RendererViewport;
  viewportSize: RendererViewportSize;
  screenPointToWorldPoint?: (point: GraphScreenPoint) => { x: number; y: number };
}

export interface SigmaGlobalHitProjector {
  targetFromSigmaHit(input: SigmaGlobalHitInput): GraphGestureTarget;
  index(): GraphSpatialIndex;
}

export interface SigmaGlobalRendererCreateOptions {
  container: HTMLElement;
  adapterData: GraphRendererAdapterData;
  theme: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  onHitTarget?: (target: GraphGestureTarget) => void;
  onPinsChanged?: (pins: PinMap) => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onFatalError?: (error: unknown) => void;
  pins?: PinMap;
  runtime?: SigmaGlobalRendererRuntime;
  viewport?: RendererViewport;
  viewportSize?: RendererViewportSize;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  pins?: PinMap;
}

export interface SigmaGlobalRenderer {
  readonly id: typeof SIGMA_GLOBAL_RENDERER_ID;
  readonly root: HTMLElement;
  readonly overlayRoot: HTMLElement;
  readonly graph: SigmaGlobalGraphologyGraph;
  readonly updateStrategy: "rebuild-graph-preserve-camera";
  readonly lastHitTarget: GraphGestureTarget | null;
  isDragging(): boolean;
  update(options: SigmaGlobalRendererUpdateOptions): void;
  destroy(): void;
}

export interface SigmaGlobalEdgeStyle {
  color: string;
  size: number;
}

export async function sigmaGlobalRendererRuntimeBoundary(): Promise<SigmaGlobalRendererRuntimeBoundary> {
  const [{ default: Sigma }, { default: GraphologyGraph }] = await Promise.all([
    import("sigma"),
    import("graphology")
  ]);

  return {
    Sigma,
    GraphologyGraph
  };
}

export function buildSigmaGlobalGraphologyGraph(
  adapterData: GraphRendererAdapterData,
  runtime: SigmaGlobalGraphologyRuntime,
  theme: ThemeId = "shan-shui",
  edgeStyle?: GraphEdgeStyleOptions
): SigmaGlobalGraphologyGraph {
  const graph = new runtime.GraphologyGraph({ multi: true, type: "mixed" });
  const communityColorById = new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
  const aggregationRenderById = new Map(adapterData.renderable.aggregationContainers.map((aggregation) => [aggregation.id, aggregation]));
  const selectedCommunityIds = new Set(adapterData.communities.filter((community) => community.selected).map((community) => community.id));

  for (const node of adapterData.nodes) {
    graph.addNode(node.id, sigmaGlobalNodeAttributes(node, communityColorById));
  }

  for (const edge of adapterData.edges) {
    graph.addEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, sigmaGlobalEdgeAttributes(edge, theme, edgeStyle, selectedCommunityIds));
  }

  graph.setAttribute("counts", adapterData.counts);
  graph.setAttribute("selection", adapterData.selection);
  graph.setAttribute(
    "communities",
    adapterData.communities.map((community) => sigmaGlobalCommunityAttributes(community, communityColorById))
  );
  graph.setAttribute(
    "aggregations",
    adapterData.aggregations.map((aggregation) => sigmaGlobalAggregationAttributes(aggregation, aggregationRenderById))
  );

  return graph;
}

export function createSigmaGlobalHitProjector(input: SigmaGlobalHitProjectorInput): SigmaGlobalHitProjector {
  const knownNodeIds = new Set(input.adapterData.nodes.map((node) => node.id));
  const spatialIndex = createGraphSpatialIndex(spatialInputFromAdapterData(input.adapterData));

  return {
    targetFromSigmaHit(hit) {
      if (hit.nodeId && knownNodeIds.has(hit.nodeId)) {
        return { kind: "node", id: hit.nodeId };
      }

      const renderedObjectTarget = hit.renderedObject ? gestureTargetFromSigmaRenderedObject(hit.renderedObject, input.adapterData) : null;
      if (renderedObjectTarget) return renderedObjectTarget;

      if (hit.screenPoint) {
        const worldPoint = input.screenPointToWorldPoint
          ? input.screenPointToWorldPoint(hit.screenPoint)
          : screenPointToWorldPoint(
              hit.screenPoint,
              input.viewport,
              input.viewportSize,
              input.adapterData.renderable.worldBounds
            );
        return graphSpatialHitToGestureTarget(spatialIndex.hitTest(worldPoint));
      }

      return { kind: "graph-blank" };
    },
    index() {
      return spatialIndex;
    }
  };
}

export function createSigmaGlobalRenderer(options: SigmaGlobalRendererCreateOptions): SigmaGlobalRenderer {
  if (!options.container) {
    throw new Error("createSigmaGlobalRenderer requires a container element");
  }
  if (!options.runtime) {
    throw new Error("createSigmaGlobalRenderer requires a loaded Sigma runtime boundary");
  }

  const runtime = options.runtime;
  let destroyed = false;
  let currentTheme = options.theme;
  let currentEdgeStyle = options.edgeStyle;
  let adapterData = options.adapterData;
  let graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime, currentTheme, currentEdgeStyle);
  const sigmaRoot = createSigmaRoot(options.container, currentTheme);
  const overlayRoot = createSigmaOverlayRoot(sigmaRoot);
  // 云团模糊滤镜内容与帧无关，挂到独立的 filterHost 只建一次，renderSigmaOverlays
  // 每帧 replaceChildren(overlayRoot) 不会动到它。随 sigmaRoot.remove() 一并回收。
  const cloudFilterId = `sigma-community-cloud-blur-${nextSigmaCloudFilterSequence()}`;
  const filterHost = sigmaRoot.ownerDocument.createElement("div");
  filterHost.setAttribute("aria-hidden", "true");
  filterHost.style.position = "absolute";
  filterHost.style.inset = "0";
  filterHost.style.pointerEvents = "none";
  filterHost.append(sigmaSharedCloudFilterDef(sigmaRoot.ownerDocument, cloudFilterId));
  sigmaRoot.append(filterHost);
  let cloudBasisByCommunityId = sigmaCommunityCloudBasisById(adapterData);
  let projector = createSigmaGlobalHitProjector({
    adapterData,
    viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    viewportSize: options.viewportSize ?? { width: 1, height: 1 },
    screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
  });
  let sigma: SigmaGlobalSigmaLike;
  let generation = 0;
  let lastHitTarget: GraphGestureTarget | null = null;
  let activeNodeDrag: SigmaGlobalNodeDragSession | null = null;
  let currentPins: PinMap = { ...(options.pins ?? {}) };
  let suppressNextNodeClickId: string | null = null;
  let overlayPointerDragCleanup: (() => void) | null = null;
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeAnimationFrame: number | null = null;
  let lastObservedRootSize: RendererViewportSize | null = null;

  try {
    sigma = new runtime.Sigma(graph, sigmaRoot, sigmaSettingsForTheme(currentTheme));
    bindSigmaEvents();
    bindSigmaResizeObserver();
    renderSigmaOverlays();
  } catch (error) {
    options.onFatalError?.(error);
    sigmaRoot.remove();
    throw error;
  }

  const renderer: SigmaGlobalRenderer = {
    id: SIGMA_GLOBAL_RENDERER_ID,
    root: sigmaRoot,
    overlayRoot,
    get graph() {
      return graph;
    },
    updateStrategy: "rebuild-graph-preserve-camera",
    get lastHitTarget() {
      return lastHitTarget;
    },
    isDragging() {
      return Boolean(activeNodeDrag);
    },
    update(updateOptions) {
      assertActive();
      const cameraState = readCameraState(sigma);
      cancelNodeDrag();
      generation += 1;
      adapterData = updateOptions.adapterData;
      cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithReuse(cloudBasisByCommunityId, adapterData);
      currentTheme = updateOptions.theme ?? currentTheme;
      currentEdgeStyle = updateOptions.edgeStyle ?? currentEdgeStyle;
      currentPins = { ...(updateOptions.pins ?? currentPins) };
      graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime, currentTheme, currentEdgeStyle);
      projector = createSigmaGlobalHitProjector({
        adapterData,
        viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
        viewportSize: options.viewportSize ?? { width: 1, height: 1 },
        screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
      });
      try {
        sigma.setGraph?.(graph);
        if (updateOptions.theme) {
          sigmaRoot.dataset.theme = currentTheme;
          sigma.setSetting?.("labelColor", sigmaLabelColor(currentTheme));
        }
        restoreCameraState(sigma, cameraState);
        sigma.refresh?.();
        renderSigmaOverlays();
      } catch (error) {
        options.onFatalError?.(error);
      }
    },
    destroy() {
      if (destroyed) return;
      cancelNodeDrag();
      destroyed = true;
      generation += 1;
      unbindSigmaEvents();
      cancelScheduledResizeRefresh();
      resizeObserver?.disconnect();
      resizeObserver = null;
      try {
        sigma.kill?.();
      } catch (error) {
        options.onFatalError?.(error);
      }
      sigmaRoot.remove();
    }
  };

  return renderer;

  function bindSigmaEvents(): void {
    const nodeClick = (payload?: unknown): void => {
      const nodeId = sigmaNodeIdFromPayload(payload);
      if (consumeSuppressedNodeClick(nodeId)) return;
      handleSigmaHit({ nodeId });
    };
    const stageClick = (payload?: unknown): void => handleSigmaHit({ screenPoint: sigmaScreenPointFromPayload(payload) });
    const cameraUpdated = (): void => renderSigmaOverlays();
    const nodeDown = (payload?: unknown): void => beginNodeDrag(sigmaNodeIdFromPayload(payload), sigmaScreenPointFromPayload(payload), payload);
    const nodeMove = (payload?: unknown): void => moveNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    const nodeUp = (payload?: unknown): void => commitNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    eventBindings = [
      { event: "clickNode", listener: nodeClick },
      { event: "clickStage", listener: stageClick },
      { event: "downNode", listener: nodeDown },
      { event: "moveBody", listener: nodeMove },
      { event: "upNode", listener: nodeUp },
      { event: "upStage", listener: nodeUp },
      { event: "cameraUpdated", listener: cameraUpdated },
      { event: "afterRender", listener: cameraUpdated }
    ];
    for (const binding of eventBindings) {
      sigma.on?.(binding.event, binding.listener);
    }
  }

  function unbindSigmaEvents(): void {
    for (const binding of eventBindings) {
      sigma.off?.(binding.event, binding.listener);
    }
    eventBindings = [];
  }

  function bindSigmaResizeObserver(): void {
    const view = sigmaRoot.ownerDocument.defaultView;
    const ViewResizeObserver = view?.ResizeObserver;
    if (!ViewResizeObserver) return;
    lastObservedRootSize = readObservedRootSize();
    resizeObserver = new ViewResizeObserver((entries) => {
      if (destroyed) return;
      const nextSize = readResizeEntrySize(entries) ?? readObservedRootSize();
      if (nextSize && lastObservedRootSize && sameRendererViewportSize(nextSize, lastObservedRootSize)) return;
      if (nextSize) lastObservedRootSize = nextSize;
      scheduleResizeRefresh();
    });
    resizeObserver.observe(sigmaRoot);
  }

  function scheduleResizeRefresh(): void {
    if (resizeAnimationFrame !== null) return;
    const view = sigmaRoot.ownerDocument.defaultView;
    const run = () => {
      resizeAnimationFrame = null;
      try {
        if (destroyed) return;
        sigma.refresh?.();
        renderSigmaOverlays();
      } catch (error) {
        options.onFatalError?.(error);
      }
    };
    if (view?.requestAnimationFrame) {
      resizeAnimationFrame = view.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function cancelScheduledResizeRefresh(): void {
    if (resizeAnimationFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(resizeAnimationFrame);
    resizeAnimationFrame = null;
  }

  function readResizeEntrySize(entries: ResizeObserverEntry[]): RendererViewportSize | null {
    const entry = entries.find((item) => item.target === sigmaRoot) ?? entries[0];
    if (!entry?.contentRect) return null;
    const width = finiteNumber(entry.contentRect.width, 0);
    const height = finiteNumber(entry.contentRect.height, 0);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function readObservedRootSize(): RendererViewportSize | null {
    const rect = typeof sigmaRoot.getBoundingClientRect === "function" ? sigmaRoot.getBoundingClientRect() : null;
    const width = finiteNumber(rect?.width, 0);
    const height = finiteNumber(rect?.height, 0);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function handleSigmaHit(input: SigmaGlobalHitInput): void {
    if (destroyed) return;
    const eventGeneration = generation;
    const target = projector.targetFromSigmaHit(input);
    if (destroyed || eventGeneration !== generation) return;
    lastHitTarget = target;
    options.onHitTarget?.(target);
  }

  function beginNodeDrag(nodeId: string | null, screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    if (destroyed || !nodeId || !screenPoint || !graph.hasNode(nodeId)) return;
    preventSigmaDefault(payload);
    cancelNodeDrag();
    const startPoint = sigmaNodeWorldPoint(nodeId);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, options);
    activeNodeDrag = createSigmaGlobalNodeDragSession({
      nodeId,
      pinKey: sigmaPinKeyForNode(nodeId),
      startPoint,
      pointerStart: screenPoint,
      pointerWorldPoint,
      initiallyPinned: Boolean(graph.getNodeAttribute(nodeId, "pinned")),
      initialPinPosition: sigmaPinPositionForNode(nodeId),
      previousCameraPanning: sigma.getSetting?.("enableCameraPanning")
    });
    sigma.setSetting?.("enableCameraPanning", false);
    sigmaRoot.dataset.draggingNodeId = nodeId;
    options.onDragActiveChange?.(true);
  }

  function moveNodeDrag(screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    const drag = activeNodeDrag;
    if (!drag || destroyed || !screenPoint) return;
    preventSigmaDefault(payload);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, options);
    moveSigmaGlobalNodeDragSession(drag, screenPoint, pointerWorldPoint);
    if (drag.moved) {
      applyNodeDragPoint(drag.nodeId, drag.currentPoint, drag.initiallyPinned, drag.initialPinPosition);
    }
  }

  function commitNodeDrag(screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    const drag = activeNodeDrag;
    if (!drag || destroyed) return;
    preventSigmaDefault(payload);
    if (screenPoint) moveNodeDrag(screenPoint, payload);
    clearOverlayPointerDragListeners();
    restoreNodeDragCamera(drag);
    activeNodeDrag = null;
    delete sigmaRoot.dataset.draggingNodeId;
    options.onDragActiveChange?.(false);
    if (!drag.moved) {
      return;
    }
    suppressNextNodeClickId = drag.nodeId;
    const finalPin: PinPosition = {
      x: drag.currentPoint.x,
      y: drag.currentPoint.y,
      coordinateSpace: "world"
    };
    currentPins = {
      ...currentPins,
      [drag.pinKey]: finalPin
    };
    applyNodeDragPoint(drag.nodeId, drag.currentPoint, true, finalPin);
    options.onPinsChanged?.(currentPins);
  }

  function cancelNodeDrag(): void {
    const drag = activeNodeDrag;
    if (!drag) return;
    clearOverlayPointerDragListeners();
    restoreNodeDragCamera(drag);
    activeNodeDrag = null;
    delete sigmaRoot.dataset.draggingNodeId;
    applyNodeDragPoint(drag.nodeId, drag.startPoint, Boolean(currentPins[drag.pinKey]), currentPins[drag.pinKey] ?? null);
    options.onDragActiveChange?.(false);
  }

  function restoreNodeDragCamera(drag: SigmaGlobalNodeDragSession): void {
    const nextValue = typeof drag.previousCameraPanning === "boolean" ? drag.previousCameraPanning : true;
    sigma.setSetting?.("enableCameraPanning", nextValue);
  }

  function applyNodeDragPoint(nodeId: string, point: { x: number; y: number }, pinned: boolean, pinPosition: PinPosition | null = null): void {
    const dragging = Boolean(activeNodeDrag);
    if (!graph.hasNode(nodeId)) return;
    graph.mergeNodeAttributes(nodeId, {
      x: finiteNumber(point.x, 0),
      y: finiteNumber(point.y, 0),
      pinned
    });
    adapterData = sigmaAdapterDataWithNodePoint(adapterData, nodeId, point, pinned, pinPosition);
    sigma.refresh?.();
    if (!dragging) {
      cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithNodePoint(cloudBasisByCommunityId, adapterData, nodeId);
      renderSigmaOverlays();
    }
  }

  function sigmaNodeWorldPoint(nodeId: string): { x: number; y: number } {
    return {
      x: finiteNumber(graph.getNodeAttribute(nodeId, "x"), 0),
      y: finiteNumber(graph.getNodeAttribute(nodeId, "y"), 0)
    };
  }

  function sigmaPinKeyForNode(nodeId: string): string {
    const sourcePath = graph.getNodeAttribute(nodeId, "sourcePath");
    return typeof sourcePath === "string" && sourcePath ? sourcePath : nodeId;
  }

  function sigmaPinPositionForNode(nodeId: string): PinPosition | null {
    const pinKey = sigmaPinKeyForNode(nodeId);
    return currentPins[pinKey] ?? null;
  }

  function consumeSuppressedNodeClick(nodeId: string | null): boolean {
    if (!nodeId || suppressNextNodeClickId !== nodeId) return false;
    suppressNextNodeClickId = null;
    return true;
  }

  function renderSigmaOverlays(): void {
    if (destroyed) return;
    overlayRoot.replaceChildren();
    const selectedCommunityIds = new Set(adapterData.communities.filter((item) => item.selected).map((item) => item.id));
    for (const community of adapterData.renderable.communities) {
      if (!community.wash) continue;
      const selected = selectedCommunityIds.has(community.id);
      const dim = selectedCommunityIds.size > 0 && !selected;
      const fallbackBox = overlayBoxFromWorldEllipse(community.wash.cx, community.wash.cy, community.wash.rx, community.wash.ry);
      const cloud = sigmaCommunityCloud(
        sigmaProjectedCloudHullPoints(cloudBasisByCommunityId.get(community.id), sigma, options),
        fallbackBox
      );
      const element = sigmaOverlayPassiveElement(overlayRoot.ownerDocument, "community-region", community.id);
      element.className = "sigma-global-community-region";
      element.dataset.communityId = community.id;
      element.dataset.selected = selected ? "true" : "false";
      element.style.overflow = "visible";
      applyOverlayBox(element, cloud.box);
      element.append(sigmaCloudSvg(overlayRoot.ownerDocument, community.color, cloud, dim, cloudFilterId, () => {
        handleSigmaHit({ renderedObject: { kind: "community-wash", id: community.id } });
      }));
      overlayRoot.append(element);
    }
    for (const node of sigmaOverlayNodes(adapterData.nodes)) {
      const element = sigmaOverlayButton(overlayRoot.ownerDocument, "node", node.id, node.label || node.id);
      const size = Math.max(16, sigmaGlobalNodeSize(node) * 3);
      const center = sigmaWorldPointToScreenPoint(sigma, node.point, options);
      element.className = "sigma-global-node-hit-target";
      element.dataset.nodeId = node.id;
      element.dataset.searchHit = node.searchHit ? "true" : "false";
      element.dataset.selected = node.selected ? "true" : "false";
      element.dataset.pinned = node.pinHint.pinned ? "true" : "false";
      applyOverlayBox(element, {
        left: center.x - size / 2,
        top: center.y - size / 2,
        width: size,
        height: size
      });
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (consumeSuppressedNodeClick(node.id)) return;
        handleSigmaHit({ renderedObject: { kind: "node", id: node.id } });
      });
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        beginNodeDrag(node.id, overlayPointerScreenPoint(event, sigmaRoot), event);
        if (activeNodeDrag?.nodeId === node.id) {
          bindOverlayPointerDragListeners(element.ownerDocument, element, node.id, event.pointerId);
        }
      });
      element.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        if (element.ownerDocument.defaultView?.PointerEvent) return;
        event.preventDefault();
        event.stopPropagation();
        if (activeNodeDrag?.nodeId !== node.id) {
          beginNodeDrag(node.id, overlayPointerScreenPoint(event, sigmaRoot), event);
        }
        if (activeNodeDrag?.nodeId === node.id) {
          bindOverlayMouseDragListeners(element.ownerDocument, node.id);
        }
      });
      element.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });
      overlayRoot.append(element);
    }
    for (const community of sigmaCommunityLabels(adapterData, SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT)) {
      if (!community.wash) continue;
      const element = sigmaOverlayPassiveElement(overlayRoot.ownerDocument, "community-label", community.id);
      element.className = "sigma-global-community-label";
      element.dataset.communityId = community.id;
      const labelSelected = selectedCommunityIds.has(community.id);
      element.dataset.selected = labelSelected ? "true" : "false";
      element.dataset.dim = selectedCommunityIds.size > 0 && !labelSelected ? "true" : "false";
      element.textContent = community.label || community.id;
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
      overlayRoot.append(element);
    }
  }

  function overlayBoxFromWorldEllipse(x: number, y: number, rx: number, ry: number): { left: number; top: number; width: number; height: number } {
    const topLeft = sigmaWorldPointToScreenPoint(sigma, { x: x - rx, y: y - ry }, options);
    const bottomRight = sigmaWorldPointToScreenPoint(sigma, { x: x + rx, y: y + ry }, options);
    const left = Math.min(topLeft.x, bottomRight.x);
    const top = Math.min(topLeft.y, bottomRight.y);
    return {
      left,
      top,
      width: Math.max(8, Math.abs(bottomRight.x - topLeft.x)),
      height: Math.max(8, Math.abs(bottomRight.y - topLeft.y))
    };
  }

  function bindOverlayPointerDragListeners(ownerDocument: Document, element: HTMLElement, nodeId: string, pointerId: number): void {
    clearOverlayPointerDragListeners();
    const cleanup = bindSigmaGlobalOverlayPointerDrag({
      ownerDocument,
      element,
      nodeId,
      pointerId,
      isActive: isActiveOverlayDrag,
      screenPointFromEvent: (event) => overlayPointerScreenPoint(event, sigmaRoot),
      onMove: moveNodeDrag,
      onEnd: commitNodeDrag,
      onCancel: cancelNodeDrag
    });
    overlayPointerDragCleanup = () => {
      cleanup();
      overlayPointerDragCleanup = null;
    };
  }

  function bindOverlayMouseDragListeners(ownerDocument: Document, nodeId: string): void {
    clearOverlayPointerDragListeners();
    const cleanup = bindSigmaGlobalOverlayMouseDrag({
      ownerDocument,
      nodeId,
      isActive: isActiveOverlayDrag,
      screenPointFromEvent: (event) => overlayPointerScreenPoint(event, sigmaRoot),
      onMove: moveNodeDrag,
      onEnd: commitNodeDrag
    });
    overlayPointerDragCleanup = () => {
      cleanup();
      overlayPointerDragCleanup = null;
    };
  }

  function isActiveOverlayDrag(nodeId: string): boolean {
    return activeNodeDrag?.nodeId === nodeId;
  }

  function clearOverlayPointerDragListeners(): void {
    overlayPointerDragCleanup?.();
  }

  function assertActive(): void {
    if (destroyed) {
      throw new Error("Sigma global renderer has been destroyed");
    }
  }

}

function createSigmaRoot(container: HTMLElement, theme: ThemeId): HTMLElement {
  const root = container.ownerDocument.createElement("div");
  root.className = "sigma-global-renderer";
  root.dataset.renderer = SIGMA_GLOBAL_RENDERER_ID;
  root.dataset.theme = theme;
  root.tabIndex = 0;
  container.append(root);
  return root;
}

function sigmaSettingsForTheme(theme: ThemeId): Record<string, unknown> {
  return {
    renderEdgeLabels: false,
    allowInvalidContainer: false,
    labelColor: sigmaLabelColor(theme)
  };
}

function sigmaLabelColor(theme: ThemeId): { color: string } {
  return { color: theme === "mo-ye" ? "#f8fafc" : "#6b6256" };
}

function readCameraState(sigma: SigmaGlobalSigmaLike): SigmaGlobalCameraState | null {
  const state = sigma.getCamera?.().getState?.();
  if (!state) return null;
  return {
    x: finiteNumber(state.x, 0),
    y: finiteNumber(state.y, 0),
    angle: finiteNumber(state.angle, 0),
    ratio: finiteNumber(state.ratio, 1)
  };
}

function restoreCameraState(sigma: SigmaGlobalSigmaLike, state: SigmaGlobalCameraState | null): void {
  if (!state) return;
  sigma.getCamera?.().setState?.(state);
}

function sigmaNodeIdFromPayload(payload: unknown): string | null {
  const candidate = payload as { node?: unknown } | null;
  return typeof candidate?.node === "string" ? candidate.node : null;
}

function sigmaScreenPointFromPayload(payload: unknown): GraphScreenPoint | null {
  const candidate = payload as { event?: { x?: unknown; y?: unknown }; x?: unknown; y?: unknown } | null;
  const x = candidate?.event?.x ?? candidate?.x;
  const y = candidate?.event?.y ?? candidate?.y;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}

function preventSigmaDefault(payload: unknown): void {
  const eventPayload = payload as SigmaGlobalPointerEventPayload | null;
  eventPayload?.preventSigmaDefault?.();
  eventPayload?.event?.preventSigmaDefault?.();
  if (payload instanceof Event) payload.preventDefault();
}

function spatialInputFromAdapterData(adapterData: GraphRendererAdapterData): GraphSpatialIndexInput {
  const renderableEdgeById = new Map(adapterData.renderable.edges.map((edge) => [edge.id, edge]));
  return {
    nodes: adapterData.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      point: node.point,
      displayMode: node.render.displayMode,
      visualRole: node.render.visualRole
    })),
    edges: adapterData.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      curveOffset: renderableEdgeById.get(edge.id)?.curveOffset ?? 0
    })),
    communities: adapterData.renderable.communities.map((community) => ({
      id: community.id,
      wash: community.wash
    })),
    aggregationContainers: adapterData.renderable.aggregationContainers.map((aggregation) => ({
      id: aggregation.id,
      communityId: aggregation.communityId,
      point: aggregation.point,
      radius: aggregation.radius
    }))
  };
}

function sigmaGlobalNodeAttributes(
  node: GraphRendererAdapterNode,
  communityColorById: Map<string, string>
): SigmaGlobalGraphologyNodeAttributes {
  return {
    x: finiteNumber(node.point.x, 0),
    y: finiteNumber(node.point.y, 0),
    label: node.render.labelVisible ? node.label : "",
    size: sigmaGlobalNodeSize(node),
    color: sigmaGlobalNodeColor(node, communityColorById),
    type: "circle",
    graphNodeType: node.type,
    communityId: node.communityId,
    sourcePath: node.sourcePath,
    selected: node.selected,
    searchHit: node.searchHit,
    pinned: node.pinHint.pinned,
    aggregationIds: [...node.aggregationIds],
    labelVisible: node.render.labelVisible,
    displayMode: node.render.displayMode,
    visualRole: node.render.visualRole,
    priority: finiteNumber(node.render.priority, 0),
    drawerTarget: node.drawerTarget
  };
}

function sigmaGlobalEdgeAttributes(
  edge: GraphRendererAdapterEdge,
  theme: ThemeId = "shan-shui",
  style?: GraphEdgeStyleOptions,
  selectedCommunityIds: ReadonlySet<string> = new Set()
): SigmaGlobalGraphologyEdgeAttributes {
  const edgeStyle = sigmaGlobalEdgeStyle(edge, theme, style, selectedCommunityIds);
  return {
    size: edgeStyle.size,
    color: edgeStyle.color,
    relationType: edge.relationType == null ? null : String(edge.relationType),
    confidence: edge.confidence == null ? null : String(edge.confidence),
    weight: finiteNumber(edge.weight, 0),
    sourceCommunityId: edge.sourceCommunityId,
    targetCommunityId: edge.targetCommunityId
  };
}

export function sigmaGlobalEdgeStyle(
  edge: GraphRendererAdapterEdge,
  theme: ThemeId = "shan-shui",
  style?: GraphEdgeStyleOptions,
  selectedCommunityIds: ReadonlySet<string> = new Set()
): SigmaGlobalEdgeStyle {
  const relationClass = edgeRelationClass(edge.relationType);
  const semantic = relationClass === "relation-contrast" || relationClass === "relation-conflict";
  const bridge = Boolean(edge.sourceCommunityId && edge.targetCommunityId && edge.sourceCommunityId !== edge.targetCommunityId);
  const weight = clamp(finiteNumber(edge.weight, 0), 0, 1);
  let alpha = semantic ? (bridge ? 0.58 : 0.5) + weight * 0.08 : (bridge ? 0.34 : 0.1) + weight * (bridge ? 0.08 : 0.06);
  let size = semantic ? (bridge ? 1.65 : 1.25) + weight * 0.6 : (bridge ? 1.1 : 0.72) + weight * (bridge ? 0.85 : 0.55);

  if (style?.semanticEmphasis) {
    if (semantic) {
      alpha = alpha * 1.16 + 0.04;
      size += 0.45;
    } else {
      alpha *= 0.6;
      size *= 0.75;
    }
  }

  if (style?.focusHighlight && selectedCommunityIds.size > 0) {
    const touchesSelectedCommunity =
      Boolean(edge.sourceCommunityId && selectedCommunityIds.has(edge.sourceCommunityId))
      || Boolean(edge.targetCommunityId && selectedCommunityIds.has(edge.targetCommunityId));
    if (touchesSelectedCommunity) {
      alpha = alpha * 1.12 + 0.02;
      size += semantic ? 0.2 : 0.12;
    } else {
      alpha *= 0.05;
      size *= 0.55;
    }
  }

  alpha = roundNumber(clamp(alpha, 0.05, 0.7), 3);
  size = roundNumber(clamp(size, 0.6, 4), 2);

  return {
    color: rgbaColor(sigmaGlobalEdgeRelationColor(relationClass, theme), alpha),
    size
  };
}

function sigmaGlobalEdgeRelationColor(relationClass: string, theme: ThemeId): string {
  const vars = getThemeTokens(theme).vars;
  if (relationClass === "relation-contrast") return vars["--amber"] ?? (theme === "mo-ye" ? "#e0b35e" : "#b7791f");
  if (relationClass === "relation-conflict") return theme === "mo-ye" ? "#f472b6" : "#d94693";
  if (theme === "mo-ye") return vars["--line"] ?? "#8e8778";
  return vars["--night"] ?? "#315f72";
}

function rgbaColor(hexColor: string, alpha: number): string {
  const hex = hexColor.trim().replace(/^#/, "");
  const normalized = hex.length === 3
    ? hex.split("").map((part) => `${part}${part}`).join("")
    : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if (![red, green, blue].every(Number.isFinite)) return `rgba(49, 95, 114, ${alpha})`;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function sigmaGlobalCommunityAttributes(
  community: GraphRendererAdapterCommunity,
  communityColorById: Map<string, string>
): SigmaGlobalGraphologyCommunityAttributes {
  return {
    id: community.id,
    label: community.label,
    color: communityColorById.get(community.id) ?? "#64748b",
    nodeIds: [...community.nodeIds],
    nodeCount: community.nodeCount,
    selected: community.selected,
    searchResultIds: [...community.searchResultIds],
    pinnedNodeIds: community.pinHints.map((hint) => hint.nodeId),
    aggregationIds: [...community.aggregationIds],
    drawerTarget: community.drawerTarget,
    commands: community.commands
  };
}

function sigmaGlobalAggregationAttributes(
  aggregation: GraphRendererAdapterAggregation,
  aggregationRenderById: Map<string, GraphRendererAdapterData["renderable"]["aggregationContainers"][number]>
): SigmaGlobalGraphologyAggregationAttributes {
  const render = aggregationRenderById.get(aggregation.id);
  return {
    id: aggregation.id,
    label: aggregation.label,
    communityId: aggregation.communityId,
    nodeIds: [...aggregation.nodeIds],
    selectedNodeIds: [...aggregation.selectedNodeIds],
    searchResultIds: [...aggregation.searchResultIds],
    pinnedNodeIds: [...aggregation.pinnedNodeIds],
    totalCount: aggregation.totalCount,
    selected: aggregation.selected,
    color: render?.color ?? "#64748b",
    point: render ? { ...render.point } : null,
    radius: render ? finiteNumber(render.radius, 0) : null,
    drawerTarget: aggregation.drawerTarget,
    commands: aggregation.commands
  };
}

function sigmaGlobalNodeSize(node: GraphRendererAdapterNode): number {
  if (node.pinHint.pinned || node.selected) return 10;
  if (node.searchHit) return 9;
  if (node.render.displayMode === "card") return 8;
  if (node.render.displayMode === "compact-card") return 7;
  if (node.render.displayMode === "overview") return 6;
  return 5;
}

function sigmaOverlayNodes(nodes: readonly GraphRendererAdapterNode[]): GraphRendererAdapterNode[] {
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
  append(nodes.filter((node) => node.selected), Number.POSITIVE_INFINITY);
  append(nodes.filter((node) => node.searchHit), 80);
  append(nodes.filter((node) => node.pinHint.pinned), 80);
  return output;
}

function sigmaGlobalNodeColor(node: GraphRendererAdapterNode, communityColorById: Map<string, string>): string {
  if (node.selected) return "#ef4444";
  if (node.searchHit) return "#f59e0b";
  if (node.pinHint.pinned) return "#0ea5e9";
  return node.communityId ? communityColorById.get(node.communityId) ?? "#64748b" : "#64748b";
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sameRendererViewportSize(left: RendererViewportSize, right: RendererViewportSize): boolean {
  return Math.abs(left.width - right.width) < 1 && Math.abs(left.height - right.height) < 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
