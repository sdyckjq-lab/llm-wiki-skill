import { wikiPathForGraphNode } from "../graph-node";
import { resolveSelectionForCapabilities } from "../select";
import { UNGROUPED_COMMUNITY_ID } from "../types";
import type {
  CommunityId,
  Confidence,
  EdgeId,
  GraphAggregationMarker,
  GraphData,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  GraphPinHint,
  GraphRelationType,
  GraphSummaryCommand,
  GraphSummaryObjectRef,
  GraphSummarySelectionState,
  GraphTypeFilters,
  GraphFocusInput,
  NodeId,
  PinMap,
  SelectionInput,
  ThemeId,
  WikiPath
} from "../types";
import { buildRenderableGraph, type CommunityMapEdgeLayer, type CommunityMapLabelSide, type CommunityMapNodeTier, type RenderPosition, type RenderPositionMap, type RenderableGraph } from "./model";
import type { RendererViewportSize } from "./viewport";
import type { GraphRelationFocusDepth } from "./relation-focus";

export const GRAPH_RENDERER_ADAPTER_ROUTES = ["dom-svg", "candidate-global", "aggregation-fallback"] as const;

export type GraphRendererAdapterRoute = typeof GRAPH_RENDERER_ADAPTER_ROUTES[number];

export interface GraphRendererAdapterOptions {
  theme?: ThemeId;
  pins?: PinMap;
  selection?: SelectionInput | null;
  searchResultIds?: NodeId[];
  aggregationMarkers?: GraphAggregationMarker[];
  focus?: GraphFocusInput;
  typeFilters?: GraphTypeFilters;
  positions?: RenderPositionMap;
  viewportSize?: RendererViewportSize;
  sourceCommunityId?: string | null;
  relationFocusNodeId?: NodeId | null;
  temporaryObject?: GraphSummaryObjectRef | null;
}

export interface GraphRendererAdapterData {
  renderable: RenderableGraph;
  counts: RenderableGraph["counts"];
  selection: GraphSummarySelectionState;
  sourceCommunityId: string | null;
  nodes: GraphRendererAdapterNode[];
  edges: GraphRendererAdapterEdge[];
  communities: GraphRendererAdapterCommunity[];
  aggregations: GraphRendererAdapterAggregation[];
}

export interface GraphRendererDrawerTarget {
  summaryKind: "node-summary" | "community-summary" | "excluded-object";
  object: GraphSummaryObjectRef;
  reason?: "aggregation";
}

export interface GraphRendererAdapterNode {
  id: NodeId;
  object: { kind: "node"; nodeId: NodeId };
  label: string;
  type: GraphNodeType;
  communityId: CommunityId | null;
  sourcePath: WikiPath;
  point: RenderPosition;
  selected: boolean;
  searchHit: boolean;
  relationFocusDepth: GraphRelationFocusDepth;
  pinHint: GraphPinHint;
  aggregationIds: string[];
  drawerTarget: GraphRendererDrawerTarget;
  render: {
    displayMode: string;
    visualRole: string;
    priority: number;
    labelVisible: boolean;
    communityMapTier: CommunityMapNodeTier;
    communityMapImportance: number;
    communityMapDotSize: number;
    communityMapLabelSide: CommunityMapLabelSide;
    communityMapRelationLabel: boolean;
  };
}

export interface GraphRendererAdapterEdge {
  id: EdgeId;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  sourceCommunityId: CommunityId | null;
  targetCommunityId: CommunityId | null;
  relationType: GraphRelationType | null;
  confidence: Confidence | null;
  weight: number;
  render: {
    strokeWidth: number;
    opacity: number;
    communityMapLayer: CommunityMapEdgeLayer;
    relationFocusDepth: GraphRelationFocusDepth;
    skeleton: boolean;
    traceable: boolean;
    selectedRelation: boolean;
  };
}

export interface GraphRendererAdapterCommunity {
  id: CommunityId;
  object: { kind: "community"; communityId: CommunityId };
  label: string;
  nodeIds: NodeId[];
  nodeCount: number;
  selected: boolean;
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  aggregationIds: string[];
  drawerTarget: GraphRendererDrawerTarget;
  commands: GraphSummaryCommand[];
}

export interface GraphRendererAdapterAggregation {
  id: string;
  object: { kind: "aggregation"; aggregationId: string; nodeIds: NodeId[]; communityId?: CommunityId | null };
  label: string;
  communityId: CommunityId | null;
  nodeIds: NodeId[];
  selectedNodeIds: NodeId[];
  searchResultIds: NodeId[];
  pinnedNodeIds: NodeId[];
  totalCount: number;
  selected: boolean;
  pinHints: GraphPinHint[];
  drawerTarget: GraphRendererDrawerTarget;
  commands: GraphSummaryCommand[];
}

export interface GraphRendererBehaviorContract {
  route: GraphRendererAdapterRoute;
  pointSelect: GraphRendererPointSelectBehavior[];
  containerSelect: GraphRendererContainerSelectBehavior[];
  searchHighlight: GraphRendererSearchHighlightBehavior[];
  selectedObjectInsideAggregation: GraphRendererSelectedAggregationBehavior[];
  pinInsideAggregation: GraphRendererPinnedAggregationBehavior[];
  enterCommunity: GraphRendererEnterCommunityBehavior[];
}

export interface GraphRendererPointSelectBehavior {
  nodeId: NodeId;
  object: { kind: "node"; nodeId: NodeId };
  drawerTarget: GraphRendererDrawerTarget;
  selected: boolean;
  searchHit: boolean;
  pinHint: GraphPinHint;
  aggregationIds: string[];
}

export interface GraphRendererContainerSelectBehavior {
  containerId: CommunityId | string;
  object: GraphSummaryObjectRef;
  drawerTarget: GraphRendererDrawerTarget;
  selected: boolean;
  searchResultIds: NodeId[];
  pinHintNodeIds: NodeId[];
}

export interface GraphRendererSearchHighlightBehavior {
  nodeId: NodeId;
  object: { kind: "node"; nodeId: NodeId };
  aggregationIds: string[];
  drawerTarget: GraphRendererDrawerTarget;
}

export interface GraphRendererSelectedAggregationBehavior {
  aggregationId: string;
  object: { kind: "aggregation"; aggregationId: string; nodeIds: NodeId[]; communityId?: CommunityId | null };
  selectedNodeIds: NodeId[];
  selected: boolean;
  drawerTarget: GraphRendererDrawerTarget;
}

export interface GraphRendererPinnedAggregationBehavior {
  aggregationId: string;
  pinnedNodeIds: NodeId[];
  pinHints: GraphPinHint[];
  drawerTarget: GraphRendererDrawerTarget;
}

export interface GraphRendererEnterCommunityBehavior {
  communityId: CommunityId;
  command: Extract<GraphSummaryCommand, { kind: "enter-community" }>;
}

export function buildGraphRendererAdapterData(
  data: GraphData,
  options: GraphRendererAdapterOptions = {}
): GraphRendererAdapterData {
  const renderable = buildRenderableGraph(data, {
    theme: options.theme,
    pins: options.pins,
    selection: options.selection,
    focus: options.focus,
    typeFilters: options.typeFilters,
    positions: options.positions,
    viewportSize: options.viewportSize,
    searchResultIds: options.searchResultIds,
    sourceCommunityId: options.sourceCommunityId,
    relationFocusNodeId: options.relationFocusNodeId,
    temporaryObject: options.temporaryObject
  });
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const renderNodeById = new Map(renderable.nodes.map((node) => [node.id, node]));
  const searchResultIds = options.searchResultIds ?? [];
  const searchSet = new Set(searchResultIds);
  const selection = adapterSelectionState(data, options.selection);
  const selectedNodeSet = new Set(selection.selectedNodeIds);
  const selectedCommunitySet = new Set(selection.selectedCommunityIds);
  const markers = options.aggregationMarkers ?? [];

  const nodes = renderable.nodes.map((renderNode): GraphRendererAdapterNode => {
    const rawNode = nodeById.get(renderNode.id);
    const communityId = rawNode?.community ?? renderNode.community ?? null;
    const pinHint = pinHintForNode(rawNode, renderNode.id, renderNode.sourcePath, options.pins);
    return {
      id: renderNode.id,
      object: { kind: "node", nodeId: renderNode.id },
      label: renderNode.label,
      type: renderNode.type,
      communityId,
      sourcePath: renderNode.sourcePath,
      point: renderNode.point,
      selected: selectedNodeSet.has(renderNode.id),
      searchHit: searchSet.has(renderNode.id),
      relationFocusDepth: renderNode.relationFocusDepth,
      pinHint,
      aggregationIds: markersContainingNode(markers, renderNode.id).map((marker) => marker.id),
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: renderNode.id }
      },
      render: {
        displayMode: renderNode.displayMode,
        visualRole: renderNode.visualRole,
        priority: renderNode.priority,
        labelVisible: renderNode.labelVisible,
        communityMapTier: renderNode.communityMapTier,
        communityMapImportance: renderNode.communityMapImportance,
        communityMapDotSize: renderNode.communityMapDotSize,
        communityMapLabelSide: renderNode.communityMapLabelSide,
        communityMapRelationLabel: renderNode.communityMapRelationLabel
      }
    };
  });

  const communities = renderable.communities.map((community): GraphRendererAdapterCommunity => {
    const nodeIds = renderable.nodes.filter((node) => node.community === community.id).map((node) => node.id);
    const communityMarkers = markersContainingCommunity(markers, community.id);
    const pinHints = nodeIds.map((id) => pinHintForNode(nodeById.get(id), id, null, options.pins)).filter((hint) => hint.pinned);
    return {
      id: community.id,
      object: { kind: "community", communityId: community.id },
      label: community.label,
      nodeIds,
      nodeCount: community.nodeCount,
      selected: selectedCommunitySet.has(community.id),
      searchResultIds: stableIntersection(nodeIds, searchResultIds),
      pinHints,
      aggregationIds: communityMarkers.map((marker) => marker.id),
      drawerTarget: {
        summaryKind: "community-summary",
        object: { kind: "community", communityId: community.id }
      },
      commands: community.id === UNGROUPED_COMMUNITY_ID ? [] : [enterCommunityCommand(community.id)]
    };
  });

  const edges = renderable.edges.map((edge): GraphRendererAdapterEdge => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const rawEdge = data.edges.find((item) => item.id === edge.id);
    return {
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceCommunityId: source?.community ?? null,
      targetCommunityId: target?.community ?? null,
      relationType: rawEdge?.relation_type ?? edge.relationType ?? null,
      confidence: rawEdge?.confidence ?? rawEdge?.type ?? edge.confidence ?? null,
      weight: numericWeight(rawEdge?.weight),
      render: {
        strokeWidth: edge.strokeWidth,
        opacity: edge.opacity,
        communityMapLayer: edge.communityMapLayer,
        relationFocusDepth: edge.relationFocusDepth,
        skeleton: edge.skeleton,
        traceable: edge.traceable,
        selectedRelation: edge.selectedRelation
      }
    };
  });

  const aggregations = markers.map((marker): GraphRendererAdapterAggregation => {
    const object = { kind: "aggregation" as const, aggregationId: marker.id, nodeIds: [...marker.nodeIds], communityId: marker.communityId ?? null };
    const drawerTarget: GraphRendererDrawerTarget = marker.communityId
      ? {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: marker.communityId }
        }
      : {
          summaryKind: "excluded-object",
          object,
          reason: "aggregation"
        };
    const selectedNodeIds = stableIntersection(marker.nodeIds, marker.selectedNodeIds ?? selection.selectedNodeIds);
    const pinnedNodeIds = stableIntersection(marker.nodeIds, marker.pinnedNodeIds ?? pinnedNodeIdsForMarker(marker, nodeById, options.pins));
    const pinHints = pinnedNodeIds.map((id) => pinHintForNode(nodeById.get(id), id, null, options.pins)).filter((hint) => hint.pinned);
    return {
      id: marker.id,
      object,
      label: marker.label ?? marker.id,
      communityId: marker.communityId ?? null,
      nodeIds: [...marker.nodeIds],
      selectedNodeIds,
      searchResultIds: stableIntersection(marker.nodeIds, marker.searchResultIds ?? searchResultIds),
      pinnedNodeIds,
      totalCount: marker.totalCount ?? marker.nodeIds.length,
      selected: selectedNodeIds.length > 0 || Boolean(marker.communityId && selectedCommunitySet.has(marker.communityId)),
      pinHints,
      drawerTarget,
      commands: [
        { kind: "show-this-object", object, label: "显示这个对象" },
        { kind: "clear-temporary-object-display", label: "清除临时显示" }
      ]
    };
  });

  return {
    renderable,
    counts: renderable.counts,
    selection,
    sourceCommunityId: options.sourceCommunityId ?? null,
    nodes,
    edges: edges.filter((edge) => renderNodeById.has(edge.sourceNodeId) && renderNodeById.has(edge.targetNodeId)),
    communities,
    aggregations
  };
}

export function buildGraphRendererBehaviorContract(
  adapter: GraphRendererAdapterData,
  route: GraphRendererAdapterRoute
): GraphRendererBehaviorContract {
  return {
    route,
    pointSelect: adapter.nodes.map((node) => ({
      nodeId: node.id,
      object: node.object,
      drawerTarget: node.drawerTarget,
      selected: node.selected,
      searchHit: node.searchHit,
      pinHint: node.pinHint,
      aggregationIds: node.aggregationIds
    })),
    containerSelect: [
      ...adapter.communities.map((community) => ({
        containerId: community.id,
        object: community.object,
        drawerTarget: community.drawerTarget,
        selected: community.selected,
        searchResultIds: community.searchResultIds,
        pinHintNodeIds: community.pinHints.map((hint) => hint.nodeId)
      })),
      ...adapter.aggregations.map((aggregation) => ({
        containerId: aggregation.id,
        object: aggregation.object,
        drawerTarget: aggregation.drawerTarget,
        selected: aggregation.selected,
        searchResultIds: aggregation.searchResultIds,
        pinHintNodeIds: aggregation.pinHints.map((hint) => hint.nodeId)
      }))
    ],
    searchHighlight: adapter.nodes
      .filter((node) => node.searchHit)
      .map((node) => ({
        nodeId: node.id,
        object: node.object,
        aggregationIds: node.aggregationIds,
        drawerTarget: node.drawerTarget
      })),
    selectedObjectInsideAggregation: adapter.aggregations
      .filter((aggregation) => aggregation.selectedNodeIds.length > 0)
      .map((aggregation) => ({
        aggregationId: aggregation.id,
        object: aggregation.object,
        selectedNodeIds: aggregation.selectedNodeIds,
        selected: aggregation.selected,
        drawerTarget: aggregation.drawerTarget
      })),
    pinInsideAggregation: adapter.aggregations
      .filter((aggregation) => aggregation.pinnedNodeIds.length > 0)
      .map((aggregation) => ({
        aggregationId: aggregation.id,
        pinnedNodeIds: aggregation.pinnedNodeIds,
        pinHints: aggregation.pinHints,
        drawerTarget: aggregation.drawerTarget
      })),
    enterCommunity: adapter.communities
      .filter((community) => community.id !== UNGROUPED_COMMUNITY_ID)
      .map((community) => ({
        communityId: community.id,
        command: enterCommunityCommand(community.id)
      }))
  };
}

function adapterSelectionState(data: GraphData, input?: SelectionInput | null): GraphSummarySelectionState {
  if (!input) {
    return {
      input: null,
      selectionId: null,
      selectedNodeIds: [],
      selectedCommunityIds: [],
      containsCurrentObject: false
    };
  }
  const selection = resolveSelectionForCapabilities(data, input, { canAsk: false });
  return {
    input,
    selectionId: selection.id,
    selectedNodeIds: selection.nodeIds,
    selectedCommunityIds: selection.communityIds,
    containsCurrentObject: selection.nodeIds.length > 0 || selection.communityIds.length > 0
  };
}

function pinHintForNode(node: GraphNode | undefined, nodeId: NodeId, sourcePath: WikiPath | null, pins?: PinMap): GraphPinHint {
  const wikiPath = node ? wikiPathForGraphNode(node) : sourcePath ?? nodeId;
  const position = pins?.[wikiPath] ?? null;
  return {
    nodeId,
    wikiPath,
    pinned: Boolean(position),
    position
  };
}

function pinnedNodeIdsForMarker(marker: GraphAggregationMarker, nodeById: Map<NodeId, GraphNode>, pins?: PinMap): NodeId[] {
  if (!pins) return [];
  return marker.nodeIds.filter((id) => {
    const node = nodeById.get(id);
    if (!node) return false;
    return Boolean(pins[wikiPathForGraphNode(node)]);
  });
}

function markersContainingNode(markers: GraphAggregationMarker[], nodeId: NodeId): GraphAggregationMarker[] {
  return markers.filter((marker) => marker.nodeIds.includes(nodeId));
}

function markersContainingCommunity(markers: GraphAggregationMarker[], communityId: CommunityId): GraphAggregationMarker[] {
  return markers.filter((marker) => marker.communityId === communityId);
}

function stableIntersection(sourceIds: NodeId[], candidateIds: NodeId[]): NodeId[] {
  const candidates = new Set(candidateIds);
  return sourceIds.filter((id) => candidates.has(id));
}

function enterCommunityCommand(communityId: CommunityId): Extract<GraphSummaryCommand, { kind: "enter-community" }> {
  return { kind: "enter-community", communityId, label: "进入社区" };
}

function numericWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
