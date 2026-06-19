import type { ThemeId } from "../types";
import type {
  GraphRendererAdapterAggregation,
  GraphRendererAdapterCommunity,
  GraphRendererAdapterData,
  GraphRendererAdapterEdge,
  GraphRendererAdapterNode
} from "./adapter";
import type { GraphRendererSurface } from "./renderer-surface";

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

export interface SigmaGlobalGraphologyRuntime {
  GraphologyGraph: SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"];
}

export interface SigmaGlobalGraphologyNodeAttributes {
  x: number;
  y: number;
  label: string;
  size: number;
  color: string;
  type: string;
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

export interface SigmaGlobalRendererCreateOptions {
  container: HTMLElement;
  surface: GraphRendererSurface;
  adapterData: GraphRendererAdapterData;
  theme: ThemeId;
  onFatalError?: (error: unknown) => void;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
}

export interface SigmaGlobalRenderer {
  readonly id: typeof SIGMA_GLOBAL_RENDERER_ID;
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

export function createSigmaGlobalRenderer(_options: SigmaGlobalRendererCreateOptions): SigmaGlobalRenderer {
  throw new Error("Sigma global renderer lifecycle is established in Task 3.4 after adapter and hit projection work land.");
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
    type: node.type,
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
