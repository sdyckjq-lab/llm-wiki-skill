import {
  buildGraphRendererAdapterData,
  buildGraphRendererBehaviorContract,
  type GraphRendererBehaviorContract
} from "../src/render";
import type {
  GraphAggregationMarker,
  GraphData,
  GraphFocusInput,
  GraphPinHint,
  GraphTypeFilters,
  NodeId,
  PinMap,
  SelectionInput
} from "../src/types";

export interface SigmaTrialOptions {
  pins?: PinMap;
  selection?: SelectionInput | null;
  searchResultIds?: NodeId[];
  aggregationMarkers?: GraphAggregationMarker[];
  focus?: GraphFocusInput;
  typeFilters?: GraphTypeFilters;
}

export interface SigmaTrialModel {
  nodes: SigmaTrialNode[];
  edges: SigmaTrialEdge[];
  communities: SigmaTrialCommunity[];
  aggregations: SigmaTrialAggregation[];
  behavior: GraphRendererBehaviorContract;
}

export interface SigmaTrialNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  communityId: string | null;
  sourcePath: string;
  selected: boolean;
  searchHit: boolean;
  pinned: boolean;
  pinHint: GraphPinHint;
  aggregationIds: string[];
}

export interface SigmaTrialEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  size: number;
  relationType: string | null;
}

export interface SigmaTrialCommunity {
  id: string;
  label: string;
  nodeIds: string[];
  selected: boolean;
  searchResultIds: string[];
  pinnedNodeIds: string[];
}

export interface SigmaTrialAggregation {
  id: string;
  communityId: string | null;
  nodeIds: string[];
  selectedNodeIds: string[];
  searchResultIds: string[];
  pinnedNodeIds: string[];
  totalCount: number;
}

const COMMUNITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#65a30d"
];

export function buildSigmaGraphologyTrialModel(data: GraphData, options: SigmaTrialOptions = {}): SigmaTrialModel {
  // The trial model must consume adapter-controlled render data only. Node and
  // edge budgets (which objects exist, their positions, sizes, colors, label
  // visibility, selection/search/pin/aggregation state) all come from the
  // adapter output; the raw GraphData is no longer traversed to decide what to
  // draw. 'data' is still threaded to the adapter for graph semantics.
  const adapter = buildGraphRendererAdapterData(data, options);

  const nodes = adapter.nodes.map((node): SigmaTrialNode => {
    const communityId = node.communityId == null ? null : String(node.communityId);
    return {
      id: node.id,
      label: node.label,
      x: finiteNumber(node.point.x, 0),
      y: finiteNumber(node.point.y, 0),
      size: trialNodeSize(node),
      color: trialNodeColor(node, communityId),
      communityId,
      sourcePath: node.sourcePath,
      selected: node.selected,
      searchHit: node.searchHit,
      pinned: node.pinHint.pinned,
      pinHint: node.pinHint,
      aggregationIds: node.aggregationIds
    };
  });

  const edges = adapter.edges.map((edge): SigmaTrialEdge => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    color: "#9ca3af",
    size: finiteNumber(edge.render.strokeWidth, 1),
    relationType: edge.relationType == null ? null : String(edge.relationType)
  }));

  const communities = adapter.communities.map((community): SigmaTrialCommunity => ({
    id: community.id,
    label: community.label,
    nodeIds: community.nodeIds,
    selected: community.selected,
    searchResultIds: community.searchResultIds,
    pinnedNodeIds: community.pinHints.map((hint) => hint.nodeId)
  }));

  const aggregations = adapter.aggregations.map((aggregation): SigmaTrialAggregation => ({
    id: aggregation.id,
    communityId: aggregation.communityId == null ? null : String(aggregation.communityId),
    nodeIds: aggregation.nodeIds,
    selectedNodeIds: aggregation.selectedNodeIds,
    searchResultIds: aggregation.searchResultIds,
    pinnedNodeIds: aggregation.pinnedNodeIds,
    totalCount: aggregation.totalCount
  }));

  return {
    nodes,
    edges,
    communities,
    aggregations,
    behavior: buildGraphRendererBehaviorContract(adapter, "candidate-global")
  };
}

// Visual budget for a trial node, derived only from adapter render state.
function trialNodeSize(node: { pinHint: GraphPinHint; selected: boolean; searchHit: boolean; render: { priority: number } }): number {
  if (node.pinHint.pinned) return 5;
  if (node.selected) return 5;
  if (node.searchHit) return 4;
  return 2;
}

// Color budget for a trial node, derived only from adapter render state.
function trialNodeColor(node: { selected: boolean; searchHit: boolean }, communityId: string | null): string {
  if (node.selected) return "#ef4444";
  if (node.searchHit) return "#f59e0b";
  return colorForCommunity(communityId);
}

function colorForCommunity(communityId: string | null): string {
  if (!communityId) return "#64748b";
  const index = Math.abs(hashString(communityId)) % COMMUNITY_COLORS.length;
  return COMMUNITY_COLORS[index];
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
