import type { ThemeId } from "../types";
import { createGraphSpatialIndex, type GraphSpatialIndex, type GraphSpatialIndexInput } from "../layout";
import type {
  GraphRendererAdapterAggregation,
  GraphRendererAdapterCommunity,
  GraphRendererAdapterData,
  GraphRendererAdapterEdge,
  GraphRendererAdapterNode
} from "./adapter";
import { screenPointToWorldPoint, worldPointToCssPercentPoint, type GraphScreenPoint } from "./geometry";
import { graphSpatialHitToGestureTarget, type GraphGestureTarget } from "./gestures";
import { DEFAULT_RENDERER_VIEWPORT, type RendererViewport, type RendererViewportSize } from "./viewport";

export const SIGMA_GLOBAL_RENDERER_ID = "sigma-global" as const;

export const SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER = "facade" as const;

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
  opacity: number;
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

export type SigmaGlobalRenderedObject =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "community-wash"; id: string }
  | { kind: "aggregation-container"; id: string; communityId?: string | null };

export interface SigmaGlobalHitInput {
  nodeId?: string | null;
  screenPoint?: GraphScreenPoint | null;
  renderedObject?: SigmaGlobalRenderedObject | null;
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
  onHitTarget?: (target: GraphGestureTarget) => void;
  onFatalError?: (error: unknown) => void;
  runtime?: SigmaGlobalRendererRuntime;
  viewport?: RendererViewport;
  viewportSize?: RendererViewportSize;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
}

export interface SigmaGlobalRenderer {
  readonly id: typeof SIGMA_GLOBAL_RENDERER_ID;
  readonly root: HTMLElement;
  readonly overlayRoot: HTMLElement;
  readonly graph: SigmaGlobalGraphologyGraph;
  readonly updateStrategy: "rebuild-graph-preserve-camera";
  readonly lastHitTarget: GraphGestureTarget | null;
  update(options: SigmaGlobalRendererUpdateOptions): void;
  destroy(): void;
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
  runtime: SigmaGlobalGraphologyRuntime
): SigmaGlobalGraphologyGraph {
  const graph = new runtime.GraphologyGraph({ multi: true, type: "mixed" });
  const communityColorById = new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
  const aggregationRenderById = new Map(adapterData.renderable.aggregationContainers.map((aggregation) => [aggregation.id, aggregation]));

  for (const node of adapterData.nodes) {
    graph.addNode(node.id, sigmaGlobalNodeAttributes(node, communityColorById));
  }

  for (const edge of adapterData.edges) {
    graph.addEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, sigmaGlobalEdgeAttributes(edge));
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

      const renderedObjectTarget = hit.renderedObject ? gestureTargetFromRenderedObject(hit.renderedObject, input.adapterData) : null;
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
  let adapterData = options.adapterData;
  let graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime);
  const sigmaRoot = createSigmaRoot(options.container, currentTheme);
  const overlayRoot = createSigmaOverlayRoot(sigmaRoot);
  let projector = createSigmaGlobalHitProjector({
    adapterData,
    viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    viewportSize: options.viewportSize ?? { width: 1, height: 1 },
    screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
  });
  let sigma: SigmaGlobalSigmaLike;
  let generation = 0;
  let lastHitTarget: GraphGestureTarget | null = null;
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];

  try {
    sigma = new runtime.Sigma(graph, sigmaRoot, sigmaSettingsForTheme(currentTheme));
    bindSigmaEvents();
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
    update(updateOptions) {
      assertActive();
      const cameraState = readCameraState(sigma);
      generation += 1;
      adapterData = updateOptions.adapterData;
      currentTheme = updateOptions.theme ?? currentTheme;
      graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime);
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
      destroyed = true;
      generation += 1;
      unbindSigmaEvents();
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
    const nodeClick = (payload?: unknown): void => handleSigmaHit({ nodeId: sigmaNodeIdFromPayload(payload) });
    const stageClick = (payload?: unknown): void => handleSigmaHit({ screenPoint: sigmaScreenPointFromPayload(payload) });
    const cameraUpdated = (): void => renderSigmaOverlays();
    eventBindings = [
      { event: "clickNode", listener: nodeClick },
      { event: "clickStage", listener: stageClick },
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

  function handleSigmaHit(input: SigmaGlobalHitInput): void {
    if (destroyed) return;
    const eventGeneration = generation;
    const target = projector.targetFromSigmaHit(input);
    if (destroyed || eventGeneration !== generation) return;
    lastHitTarget = target;
    options.onHitTarget?.(target);
  }

  function renderSigmaOverlays(): void {
    if (destroyed) return;
    overlayRoot.replaceChildren();
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
        handleSigmaHit({ renderedObject: { kind: "node", id: node.id } });
      });
      overlayRoot.append(element);
    }
    for (const community of adapterData.renderable.communities) {
      if (!community.wash) continue;
      const element = sigmaOverlayButton(overlayRoot.ownerDocument, "community-wash", community.id, community.label || community.id);
      element.className = "sigma-global-community-wash";
      element.dataset.communityId = community.id;
      element.dataset.selected = adapterData.communities.find((item) => item.id === community.id)?.selected ? "true" : "false";
      element.style.borderColor = community.color;
      element.style.background = community.color;
      const box = overlayBoxFromWorldEllipse(community.wash.cx, community.wash.cy, community.wash.rx, community.wash.ry);
      applyOverlayBox(element, box);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        handleSigmaHit({ screenPoint: { x: event.clientX, y: event.clientY } });
      });
      overlayRoot.append(element);
    }
    for (const aggregation of adapterData.renderable.aggregationContainers) {
      const element = sigmaOverlayButton(overlayRoot.ownerDocument, "aggregation-container", aggregation.id, aggregation.label || aggregation.id);
      element.className = "sigma-global-aggregation-container";
      element.dataset.aggregationId = aggregation.id;
      element.dataset.communityId = aggregation.communityId || "";
      element.dataset.nodeCount = String(aggregation.nodeCount);
      element.dataset.searchInside = aggregation.searchHitCount > 0 ? "true" : "false";
      element.dataset.selected = aggregation.selected ? "true" : "false";
      element.style.borderColor = aggregation.color;
      const box = overlayBoxFromWorldEllipse(aggregation.point.x, aggregation.point.y, aggregation.radius, aggregation.radius);
      applyOverlayBox(element, box);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        handleSigmaHit({
          renderedObject: {
            kind: "aggregation-container",
            id: aggregation.id,
            communityId: aggregation.communityId
          }
        });
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

function createSigmaOverlayRoot(root: HTMLElement): HTMLElement {
  const overlay = root.ownerDocument.createElement("div");
  overlay.className = "sigma-global-overlay";
  overlay.dataset.role = "sigma-global-overlay";
  root.append(overlay);
  return overlay;
}

function sigmaOverlayButton(ownerDocument: Document, kind: string, id: string, label: string): HTMLButtonElement {
  const element = ownerDocument.createElement("button");
  element.type = "button";
  element.dataset.kind = kind;
  element.dataset.id = id;
  element.setAttribute("aria-label", label);
  return element;
}

function applyOverlayBox(element: HTMLElement, box: { left: number; top: number; width: number; height: number }): void {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

function sigmaScreenPointToWorldPoint(
  sigma: SigmaGlobalSigmaLike,
  point: GraphScreenPoint,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): { x: number; y: number } {
  const projected = sigma.viewportToGraph?.(point);
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  return screenPointToWorldPoint(
    point,
    options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    options.viewportSize ?? { width: 1, height: 1 },
    options.adapterData.renderable.worldBounds
  );
}

function sigmaWorldPointToScreenPoint(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number },
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint {
  const projected = sigma.graphToViewport?.(point);
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  const percent = worldPointToCssPercentPoint(point, options.adapterData.renderable.worldBounds);
  const size = options.viewportSize ?? { width: 1, height: 1 };
  return {
    x: (percent.x / 100) * size.width,
    y: (percent.y / 100) * size.height
  };
}

function sigmaSettingsForTheme(theme: ThemeId): Record<string, unknown> {
  return {
    renderEdgeLabels: false,
    allowInvalidContainer: false,
    labelColor: sigmaLabelColor(theme)
  };
}

function sigmaLabelColor(theme: ThemeId): { color: string } {
  return { color: theme === "mo-ye" ? "#f8fafc" : "#1f2937" };
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

function gestureTargetFromRenderedObject(
  object: SigmaGlobalRenderedObject,
  adapterData: GraphRendererAdapterData
): GraphGestureTarget | null {
  switch (object.kind) {
    case "node":
      return adapterData.nodes.some((node) => node.id === object.id) ? { kind: "node", id: object.id } : null;
    case "edge":
      return adapterData.edges.some((edge) => edge.id === object.id) ? { kind: "edge", id: object.id } : null;
    case "community-wash":
      return adapterData.communities.some((community) => community.id === object.id) ? { kind: "community-wash", id: object.id } : null;
    case "aggregation-container": {
      const aggregation = adapterData.aggregations.find((item) => item.id === object.id);
      if (!aggregation) return null;
      return { kind: "aggregation-container", id: object.id, communityId: object.communityId ?? aggregation.communityId };
    }
    default:
      return null;
  }
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

function sigmaGlobalEdgeAttributes(edge: GraphRendererAdapterEdge): SigmaGlobalGraphologyEdgeAttributes {
  return {
    size: Math.max(1, finiteNumber(edge.render.strokeWidth, 1)),
    color: "#64748b",
    opacity: clamp(finiteNumber(edge.render.opacity, 1), 0, 1),
    relationType: edge.relationType == null ? null : String(edge.relationType),
    confidence: edge.confidence == null ? null : String(edge.confidence),
    weight: finiteNumber(edge.weight, 0),
    sourceCommunityId: edge.sourceCommunityId,
    targetCommunityId: edge.targetCommunityId
  };
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
  if (node.pinHint.pinned || node.selected) return 8;
  if (node.searchHit) return 7;
  if (node.render.displayMode === "card") return 6;
  if (node.render.displayMode === "compact-card") return 5;
  if (node.render.displayMode === "overview") return 4;
  return 3;
}

function sigmaOverlayNodes(nodes: readonly GraphRendererAdapterNode[]): GraphRendererAdapterNode[] {
  const seen = new Set<string>();
  const output: GraphRendererAdapterNode[] = [];
  const append = (candidates: GraphRendererAdapterNode[], limit: number) => {
    let count = 0;
    for (const node of candidates) {
      if (count >= limit || seen.has(node.id)) continue;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
