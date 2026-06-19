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

export interface SigmaTrialDrawerItem {
  id: string;
  label: string;
  meta: string;
}

export interface SigmaTrialDrawerPayload {
  kind: "node" | "community" | "global";
  title: string;
  kicker: string;
  // Representative workbench-like drawer facts (counts the React drawer shows).
  facts: { label: string; value: string }[];
  // Representative list rows (core nodes / pinned nodes / search hits), capped.
  items: SigmaTrialDrawerItem[];
}

export interface SigmaTrialModel {
  nodes: SigmaTrialNode[];
  edges: SigmaTrialEdge[];
  communities: SigmaTrialCommunity[];
  aggregations: SigmaTrialAggregation[];
  // Pre-computed drawer payloads so the trial HTML renders a workbench-weight
  // summary card instead of a single text node.
  drawer: {
    global: SigmaTrialDrawerPayload;
    nodes: Record<string, SigmaTrialDrawerPayload>;
    communities: Record<string, SigmaTrialDrawerPayload>;
  };
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

  const drawer = buildTrialDrawer(adapter);

  return {
    nodes,
    edges,
    communities,
    aggregations,
    drawer,
    behavior: buildGraphRendererBehaviorContract(adapter, "candidate-global")
  };
}

// Representative workbench-weight drawer payloads derived only from adapter
// render data. The trial HTML renders these as a real summary card + list so the
// drawer/overlay DOM cost is comparable to the production GraphSummaryDrawer.
function buildTrialDrawer(adapter: ReturnType<typeof buildGraphRendererAdapterData>): SigmaTrialModel["drawer"] {
  const adjacency = new Map<string, number>();
  for (const edge of adapter.edges) {
    adjacency.set(edge.sourceNodeId, (adjacency.get(edge.sourceNodeId) ?? 0) + 1);
    adjacency.set(edge.targetNodeId, (adjacency.get(edge.targetNodeId) ?? 0) + 1);
  }
  const trim = (values: string[]): string[] => values.slice(0, 8);

  const nodePayloads: Record<string, SigmaTrialDrawerPayload> = {};
  for (const node of adapter.nodes) {
    const meta = node.type ? String(node.type) : "node";
    nodePayloads[node.id] = {
      kind: "node",
      kicker: "节点",
      title: node.label || node.id,
      facts: [
        { label: "类型", value: meta },
        { label: "连接", value: String(adjacency.get(node.id) ?? 0) },
        { label: "社区", value: node.communityId == null ? "—" : String(node.communityId) }
      ],
      items: trim(node.aggregationIds).map((id) => ({ id, label: id, meta: "aggregation" }))
    };
  }

  const communityPayloads: Record<string, SigmaTrialDrawerPayload> = {};
  for (const community of adapter.communities) {
    const labelById = new Map(adapter.nodes.map((node) => [node.id, node.label || node.id]));
    const coreNodes = community.nodeIds
      .map((id) => ({ id, label: labelById.get(id) ?? id, degree: adjacency.get(id) ?? 0 }))
      .sort((a, b) => b.degree - a.degree);
    communityPayloads[community.id] = {
      kind: "community",
      kicker: "社区",
      title: community.label || community.id,
      facts: [
        { label: "节点数", value: String(community.nodeCount) },
        { label: "命中", value: String(community.searchResultIds.length) },
        { label: "置顶", value: String(community.pinHints.length) }
      ],
      items: trim(coreNodes.map((node) => ({ id: node.id, label: node.label, meta: "core" })))
    };
  }

  const globalPayload: SigmaTrialDrawerPayload = {
    kind: "global",
    kicker: "全局",
    title: "全局图谱概览",
    facts: [
      { label: "节点", value: String(adapter.counts.nodes) },
      { label: "边", value: String(adapter.counts.edges) },
      { label: "社区", value: String(adapter.communities.length) }
    ],
    items: trim(adapter.communities.map((community) => ({ id: community.id, label: community.label || community.id, meta: "community" })))
  };

  return { global: globalPayload, nodes: nodePayloads, communities: communityPayloads };
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
