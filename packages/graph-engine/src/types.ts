export type NodeId = string;
export type EdgeId = string;
export type CommunityId = string;
export type WikiPath = string;

export const UNGROUPED_COMMUNITY_ID = "_none";
export const UNGROUPED_COMMUNITY_LABEL = "未分组";

export type GraphCommunityStructureState = "clear" | "loose" | "ungrouped";

export interface GraphCommunityCoreNode {
  nodeId: NodeId;
  label: string;
  type: GraphNodeType;
  role: "核心" | "主题" | "相关";
}

export type ThemeId = "shan-shui" | "mo-ye";

export interface GraphEdgeStyleOptions {
  semanticEmphasis: boolean;
  focusHighlight: boolean;
}

export type GraphNodeType =
  | "entity"
  | "topic"
  | "source"
  | "comparison"
  | "synthesis"
  | "query"
  | string;

export type Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS" | "UNVERIFIED" | string;
export type GraphRelationType = "实现" | "依赖" | "对比" | "矛盾" | "衍生" | string;

export interface GraphData {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights?: GraphInsights;
  learning?: GraphLearning;
}

export interface GraphMeta {
  build_date: string;
  wiki_title: string;
  total_nodes: number;
  total_edges: number;
  initial_view?: NodeId[];
  degraded?: boolean;
  insights_degraded?: boolean;
}

export interface GraphNode {
  id: NodeId;
  label: string;
  type: GraphNodeType;
  community?: CommunityId | null;
  content?: string;
  source_path?: string;
  source?: string;
  path?: string;
  summary?: string;
  confidence?: Confidence;
  type_confidence?: Confidence;
  weight?: number;
  score?: number;
  x?: number | string | null;
  y?: number | string | null;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  confidence?: Confidence;
  relation_type?: GraphRelationType;
  type: Confidence;
  weight?: number;
  source_signal_available?: boolean;
  signals?: GraphEdgeSignals;
  [key: string]: unknown;
}

export interface GraphEdgeSignals {
  co_citation?: number;
  source_overlap?: number | null;
  type_affinity?: number;
  [key: string]: number | boolean | string | null | undefined;
}

export interface GraphInsights {
  surprising_connections: SurprisingConnection[];
  isolated_nodes: IsolatedNodeInsight[];
  bridge_nodes: BridgeNodeInsight[];
  sparse_communities: SparseCommunityInsight[];
  meta: GraphInsightsMeta;
}

export interface GraphInsightsMeta {
  degraded: boolean;
  node_count: number;
  edge_count: number;
  max_insight_nodes: number;
  max_insight_edges: number;
}

export interface SurprisingConnection {
  from: NodeId;
  to: NodeId;
  weight: number;
  from_community: CommunityId | null;
  to_community: CommunityId | null;
}

export interface IsolatedNodeInsight {
  id: NodeId;
  label: string;
  degree: number;
  community: CommunityId | null;
}

export interface BridgeNodeInsight {
  id: NodeId;
  label: string;
  community: CommunityId | null;
  connected_communities: CommunityId[];
  community_count: number;
}

export interface SparseCommunityInsight {
  id: CommunityId;
  label: string;
  node_count: number;
  density: number;
  members: NodeId[];
  internal_edges: number;
}

export interface GraphLearning {
  version?: 1;
  entry: GraphLearningEntry;
  views: GraphLearningViews;
  communities: Community[];
  degraded?: {
    path_to_community: boolean;
    community_to_global: boolean;
  };
}

export interface GraphLearningEntry {
  recommended_start_node_id: NodeId | null;
  recommended_start_reason: string | null;
  default_mode: GraphLearningMode;
}

export type GraphLearningMode = "path" | "community" | "global";

export interface GraphLearningViews {
  path: GraphLearningPathView;
  community: GraphLearningCommunityView;
  global: GraphLearningGlobalView;
}

export interface GraphLearningPathView {
  enabled: boolean;
  start_node_id: NodeId | null;
  node_ids: NodeId[];
  degraded: boolean;
}

export interface GraphLearningCommunityView {
  enabled: boolean;
  community_id: CommunityId | null;
  label: string | null;
  node_ids: NodeId[];
  is_weak: boolean;
  degraded: boolean;
}

export interface GraphLearningGlobalView {
  enabled: boolean;
  node_ids: NodeId[];
  degraded: boolean;
}

export interface Community {
  id: CommunityId;
  label: string;
  node_count: number;
  source_count?: number;
  internal_edge_weight?: number;
  is_primary?: boolean;
  is_weak?: boolean;
  recommended_start_node_id?: NodeId | null;
  color_index?: number;
  members?: NodeId[];
}

export const WORLD_PIN_COORDINATE_SPACE = "world";
export const LEGACY_PERCENT_PIN_COORDINATE_SPACE = "legacy-percent";

export type PinCoordinateSpace = typeof WORLD_PIN_COORDINATE_SPACE | typeof LEGACY_PERCENT_PIN_COORDINATE_SPACE;

export function isPinCoordinateSpace(value: unknown): value is PinCoordinateSpace {
  return value === WORLD_PIN_COORDINATE_SPACE || value === LEGACY_PERCENT_PIN_COORDINATE_SPACE;
}

export interface PinPosition {
  x: number;
  y: number;
  coordinateSpace?: PinCoordinateSpace;
}

export type PinMap = Record<WikiPath, PinPosition>;

export interface GraphLayoutFile {
  version: 1 | 2;
  pins: PinMap;
  updatedAt: string;
}

export interface GraphDiff {
  addedNodes: NodeId[];
  removedNodes: NodeId[];
  recoloredNodes: Array<{ id: NodeId; from: CommunityId; to: CommunityId }>;
  addedEdges: EdgeId[];
  removedEdges: EdgeId[];
  newCommunities: CommunityId[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    communityCount: number;
  };
}

export interface SelectionFacts {
  pageCount: number;
  internalLinkCount: number;
  communityCount: number;
  isolatedCount: number;
}

export type SelectionActionId =
  | "summarize_page"
  | "find_related_pages"
  | "quote_page"
  | "summarize_cluster"
  | "summarize_group"
  | "explore_group_relationships"
  | "find_knowledge_gaps"
  | "create_topic_page"
  | "why_no_connection"
  | "find_potential_bridges"
  | "compare_communities"
  | "explore_potential_links"
  | "compare_differences"
  | "link_island";

export type SelectionActionTone = "digest" | "lint" | "write" | "bridge" | "compare" | "repair";

export interface SelectionAction {
  id: SelectionActionId;
  label: string;
  tone: SelectionActionTone;
}

export interface Selection {
  id: string;
  nodeIds: NodeId[];
  communityIds: CommunityId[];
  facts: SelectionFacts;
  input: SelectionInput;
  actions?: SelectionAction[];
}

export type SelectionInput =
  | { kind: "node"; id: NodeId }
  | { kind: "community"; id: CommunityId }
  | { kind: "neighbors"; id: NodeId }
  | { kind: "nodes"; ids: NodeId[] };

export type GraphSummaryObjectRef =
  | { kind: "node"; nodeId: NodeId }
  | { kind: "community"; communityId: CommunityId }
  | { kind: "aggregation"; aggregationId: string; nodeIds: NodeId[]; communityId?: CommunityId | null };

export interface GraphSummarySelectionState {
  input: SelectionInput | null;
  selectionId: string | null;
  selectedNodeIds: NodeId[];
  selectedCommunityIds: CommunityId[];
  containsCurrentObject: boolean;
}

export interface GraphPinHint {
  nodeId: NodeId;
  wikiPath: WikiPath;
  pinned: boolean;
  position: PinPosition | null;
}

export interface GraphAggregationMarker {
  id: string;
  label?: string;
  communityId?: CommunityId | null;
  nodeIds: NodeId[];
  selectedNodeIds?: NodeId[];
  searchResultIds?: NodeId[];
  pinnedNodeIds?: NodeId[];
  totalCount?: number;
}

export interface GraphRelationSummary {
  edgeId: EdgeId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  relationType: GraphRelationType | null;
  confidence: Confidence | null;
  weight: number;
  bridge: boolean;
}

export type GraphSummaryCommand =
  | {
      kind: "enter-community";
      communityId: CommunityId;
      label: string;
    }
  | {
      kind: "enter-node-community";
      communityId: CommunityId;
      nodeId: NodeId;
      path: WikiPath;
      label: string;
    }
  | {
      kind: "select-neighbors";
      nodeId: NodeId;
      label: string;
    }
  | {
      kind: "open-detail-read";
      nodeId: NodeId;
      path: WikiPath;
      label: string;
    }
  | {
      kind: "show-this-object";
      object: GraphSummaryObjectRef;
      label: string;
    }
  | {
      kind: "clear-temporary-object-display";
      label: string;
    }
  | {
      kind: "set-fixed-position";
      mode: "fix" | "unfix";
      nodeId: NodeId;
      wikiPath: WikiPath;
      label: string;
    };

export interface GraphSummaryOptions {
  selection?: SelectionInput | null;
  searchResultIds?: NodeId[];
  pins?: PinMap;
  aggregationMarkers?: GraphAggregationMarker[];
  temporaryObject?: GraphSummaryObjectRef | null;
}

export interface GraphNodeSummaryPayload {
  kind: "node-summary";
  object: { kind: "node"; nodeId: NodeId };
  nodeId: NodeId;
  label: string;
  type: GraphNodeType;
  communityId: CommunityId | null;
  sourcePath: WikiPath;
  summary: string | null;
  connectionCount: number;
  searchHit: boolean;
  pinHint: GraphPinHint;
  selection: GraphSummarySelectionState;
  strongestRelations: GraphRelationSummary[];
  bridgeRelations: GraphRelationSummary[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export interface GraphCommunitySummaryPayload {
  kind: "community-summary";
  object: { kind: "community"; communityId: CommunityId };
  communityId: CommunityId;
  label: string;
  nodeCount: number;
  facts: SelectionFacts;
  structureState: GraphCommunityStructureState;
  description: string;
  canEnterCommunity: boolean;
  coreNodeIds: NodeId[];
  coreNodes: GraphCommunityCoreNode[];
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  selection: GraphSummarySelectionState;
  strongestRelations: GraphRelationSummary[];
  bridgeRelations: GraphRelationSummary[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export interface GraphGlobalOverviewPayload {
  kind: "global-overview";
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  coreNodeIds: NodeId[];
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  selection: GraphSummarySelectionState;
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export interface GraphSearchResultsPayload {
  kind: "search-results";
  query: string;
  searchResultIds: NodeId[];
  visibleResultIds: NodeId[];
  unavailableResultIds: NodeId[];
  selection: GraphSummarySelectionState;
  pinHints: GraphPinHint[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export interface GraphExcludedObjectPayload {
  kind: "excluded-object";
  object: GraphSummaryObjectRef;
  reason: "filter" | "aggregation" | "search" | "community-scope";
  selection: GraphSummarySelectionState;
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export interface GraphUnavailableObjectPayload {
  kind: "unavailable-object";
  object: GraphSummaryObjectRef;
  reason: "missing-node" | "missing-community" | "missing-aggregation";
  selection: GraphSummarySelectionState;
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}

export type GraphSummaryPayload =
  | GraphNodeSummaryPayload
  | GraphCommunitySummaryPayload
  | GraphGlobalOverviewPayload
  | GraphSearchResultsPayload
  | GraphExcludedObjectPayload
  | GraphUnavailableObjectPayload;

export interface GraphVisibilityState {
  searchQuery: string;
  searchResultIds: NodeId[];
  typeFilters: GraphTypeFilters;
  temporaryObject: GraphSummaryObjectRef | null;
  focusCommunityId?: CommunityId | null;
  hiddenReadingNodeId?: NodeId | null;
}

export type GraphFocusInput =
  | { kind: "community"; id: CommunityId }
  | null;

export type GraphTypeFilters = Record<GraphNodeType, boolean>;

export interface GraphOpenPageNode {
  id: NodeId;
  title: string;
  type: GraphNodeType;
  typeLabel: string;
  sourcePath: WikiPath;
  community?: CommunityId | null;
  date?: string | null;
  source?: string | null;
  isolated: boolean;
}

export interface GraphOpenPagePayload {
  path: WikiPath;
  node: GraphOpenPageNode;
  origin?: "community-node-click" | "community-search-result";
}

export interface GraphEngineCapabilities {
  persistPins?: (pins: PinMap) => Promise<void>;
  onAsk?: (selection: Selection) => void;
  onOpenPage?: (payload: GraphOpenPagePayload) => void;
  onSelectionChange?: (selection: Selection) => void;
  onSelectionClear?: () => void;
  onViewReset?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onVisibilityStateChange?: (state: GraphVisibilityState) => void;
}

export interface GraphEngineOptions {
  data: GraphData;
  pins?: PinMap;
  theme: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  focus?: GraphFocusInput;
  typeFilters?: GraphTypeFilters;
  aggregationMarkers?: GraphAggregationMarker[];
  toolbarContainer?: HTMLElement | null;
  capabilities?: GraphEngineCapabilities;
}

export interface GraphEngine {
  applyDiff(diff: GraphDiff, options?: { reducedMotion?: boolean; durationMs?: number }): Promise<void>;
  isDragging(): boolean;
  setData(data: GraphData, pins?: PinMap): void;
  setEdgeStyle(style: GraphEdgeStyleOptions): void;
  setAggregationMarkers(markers: GraphAggregationMarker[]): void;
  focusNode(path: WikiPath): void;
  focusCommunity(id: CommunityId): Selection;
  // #122：社区阅读单击节点打开右侧详情抽屉时，把镜头让位到剩余画布的舒适位置。
  // 宽屏并排抽屉生效；窄屏覆盖抽屉/非社区阅读/reduced motion 由实现短路。
  accommodateNodeForDrawer(nodeId: string, options?: { durationMs?: number }): void;
  // Phase 2: the community the user entered from. Kept separate from selection so
  // returning to the global Sigma view can keep that community highlighted without
  // marking every community node as selected/core.
  readonly sourceCommunityId: string | null;
  setSourceCommunityContext(id: string | null): void;
  setTypeFilters(filters: GraphTypeFilters): void;
  showTemporaryObject(object: GraphSummaryObjectRef): void;
  clearTemporaryObjectDisplay(): void;
  resetView(): void;
  select(selector: SelectionInput): Selection;
  previewNode(id: NodeId | null): void;
  summarizeNode(id: NodeId, options?: GraphSummaryOptions): GraphNodeSummaryPayload | GraphUnavailableObjectPayload;
  summarizeCommunity(
    id: CommunityId,
    options?: GraphSummaryOptions
  ): GraphCommunitySummaryPayload | GraphUnavailableObjectPayload;
  summarizeGlobal(options?: GraphSummaryOptions): GraphGlobalOverviewPayload;
  summarizeSearchResults(query: string, resultIds: NodeId[], options?: GraphSummaryOptions): GraphSearchResultsPayload;
  summarizeExcludedObject(
    object: GraphSummaryObjectRef,
    reason: GraphExcludedObjectPayload["reason"],
    options?: GraphSummaryOptions
  ): GraphExcludedObjectPayload;
  summarizeUnavailableObject(
    object: GraphSummaryObjectRef,
    reason: GraphUnavailableObjectPayload["reason"],
    options?: GraphSummaryOptions
  ): GraphUnavailableObjectPayload;
  clearSelection(): void;
  clearInteraction(): void;
  setNodeFixed(id: NodeId, mode: "fix" | "unfix"): boolean;
  setTheme(theme: ThemeId): void;
  setPins(pins: PinMap): void;
  resetLayout(): void;
  destroy(): void;
}
