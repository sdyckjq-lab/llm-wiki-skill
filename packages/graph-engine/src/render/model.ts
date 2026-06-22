import type { GraphAggregationMarker, GraphData, GraphFocusInput, GraphPinHint, GraphTypeFilters, NodeId, PinMap, SelectionInput, ThemeId, WikiPath } from "../types";
import {
  atlasNodePoint,
  buildAtlasModel,
  deriveAtlasLayout,
  getAtlasDensityMode,
  resolveAtlasVisibleSnapshot
} from "../model";
import { graphEdgeControlPoint } from "../layout/edge-geometry";
import { wikiPathForGraphNode } from "../graph-node";
import { getCommunityColor } from "../themes";
import { computeCommunityWash } from "./community-wash";
import { GRAPH_WORLD_SIZE, worldBoundsForPoints, worldPointToCssPercentPoint, worldPointToMinimapPoint, type GraphWorldBounds } from "./geometry";
import { pinPositionToWorldPoint } from "./pin-position";

export type DensityMode = "card" | "compact-card" | "point-plus-focus" | "overview";
export type NodeDisplayMode = "card" | "compact-card" | "point" | "overview";
export type NodeVisualRole = "landmark" | "index-slip" | "cinnabar-note" | "map-pin";
export type GraphRenderBudgetView = "global" | "community";
export type GraphCommunityFocusSizeBand = "small" | "medium" | "large" | "oversized";
export type GraphCommunityFocusRepresentation = "cards-and-labels" | "points-with-cards" | "outline-with-caps" | "internal-map-entry";
export type GraphCommunityQualityLevel = "good" | "moderate" | "poor";
export type GraphCommunityBoundaryCertainty = "high" | "reduced" | "low";
export type GraphCommunityQualitySignalId =
  | "oversized-community"
  | "many-tiny-communities"
  | "mixed-cross-community-edges"
  | "weak-community-labels"
  | "abnormal-community-count";

export interface GraphRenderBudgetLimits {
  maxVisibleNodes: number;
  maxVisibleEdges: number;
  maxLabels: number;
  maxCards: number;
  maxInteractionUpdates: number;
}

export interface GraphRenderBudget {
  view: GraphRenderBudgetView;
  limits: GraphRenderBudgetLimits;
  usage: GraphRenderBudgetLimits;
}

export interface GraphRenderOverflowBucket {
  total: number;
  hidden: number;
  ids: string[];
}

export interface GraphRenderOverflow {
  nodes: GraphRenderOverflowBucket;
  edges: GraphRenderOverflowBucket;
  labels: GraphRenderOverflowBucket;
  cards: GraphRenderOverflowBucket;
  interactionUpdates: {
    total: number;
    hidden: number;
  };
}

export interface GraphInteractionDegradation {
  mode: "idle" | "active";
  maxUpdatedObjects: number;
  updateCandidates: number;
  updatedObjects: number;
  hiddenObjects: number;
  labelsVisibleDuringInteraction: number;
  edgesVisibleDuringInteraction: number;
  preservedNodeIds: string[];
}

export interface GraphCommunityFocusScale {
  communityId: string;
  nodeCount: number;
  sizeBand: GraphCommunityFocusSizeBand;
  representation: GraphCommunityFocusRepresentation;
  completePresence: "nodes" | "outline" | "internal-map";
  thresholds: {
    smallMax: number;
    mediumMax: number;
    largeMax: number;
  };
}

export interface GraphCommunityQualitySignal {
  id: GraphCommunityQualitySignalId;
  severity: "moderate" | "poor";
  value: number;
  threshold: number;
}

export interface GraphCommunityAuxiliaryView {
  id: "core-structure-connectivity";
  label: "核心结构 / 连通性";
}

export interface GraphCommunityQuality {
  level: GraphCommunityQualityLevel;
  boundaryCertainty: GraphCommunityBoundaryCertainty;
  warning: "moderate-community-quality" | "poor-community-quality" | null;
  signals: GraphCommunityQualitySignal[];
  auxiliaryViews: GraphCommunityAuxiliaryView[];
}

export interface RenderableGraph {
  model: Record<string, unknown>;
  layout: Record<string, unknown>;
  worldBounds: GraphWorldBounds;
  selectedNodeId: string | null;
  focus: GraphFocusInput;
  typeFilters: GraphTypeFilters;
  densityMode: DensityMode;
  counts: {
    visibleNodes: number;
    visibleEdges: number;
    totalNodes: number;
    totalEdges: number;
    totalCommunities: number;
  };
  nodes: RenderableNode[];
  edges: RenderableEdge[];
  communities: RenderableCommunity[];
  aggregationContainers: RenderableAggregationContainer[];
  minimap: RenderableMinimap;
  budget: GraphRenderBudget;
  overflow: GraphRenderOverflow;
  interaction: GraphInteractionDegradation;
  importance: {
    stableCoreNodeIds: string[];
    stableSkeletonEdgeIds: string[];
    temporaryBoostNodeIds: string[];
  };
  communityFocus: GraphCommunityFocusScale | null;
  communityQuality: GraphCommunityQuality;
}

export interface RenderableNode {
  id: string;
  label: string;
  type: string;
  kind: string;
  community: string;
  sourcePath: string;
  x: number;
  y: number;
  point: { x: number; y: number };
  displayMode: NodeDisplayMode;
  visualRole: NodeVisualRole;
  priority: number;
  weight: number;
  stableImportance: number;
  temporaryBoost: number;
  coreAnchor: boolean;
  unavailable: boolean;
  selected: boolean;
  startNode: boolean;
  previewStart: boolean;
  labelVisible: boolean;
  interactionLabelVisible: boolean;
}

export interface RenderableEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: string;
  relationType: string;
  relationClass: string;
  path: string;
  curveOffset: number;
  strokeWidth: number;
  opacity: number;
  simulationWeight: number;
  skeleton: boolean;
  traceable: boolean;
}

export interface RenderableCommunity {
  id: string;
  label: string;
  color: string;
  nodeCount: number;
  boundaryCertainty: GraphCommunityBoundaryCertainty;
  wash: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    opacity: number;
  } | null;
}

export interface RenderableAggregationContainer {
  id: string;
  role: "aggregation-container";
  label: string;
  communityId: string | null;
  nodeIds: string[];
  nodeCount: number;
  searchHitCount: number;
  pinnedCount: number;
  selectedCount: number;
  selected: boolean;
  searchResultIds: string[];
  pinnedNodeIds: string[];
  selectedNodeIds: string[];
  pinHints: GraphPinHint[];
  point: { x: number; y: number };
  x: number;
  y: number;
  radius: number;
  color: string;
}

export interface RenderableMinimap {
  path: string;
  nodes: Array<{ id: string; x: number; y: number; r: number; fill: string; selected: boolean }>;
}

interface BuildRenderableGraphOptions {
  pins?: PinMap;
  theme?: ThemeId;
  selectedNodeId?: string | null;
  selection?: SelectionInput | null;
  focus?: GraphFocusInput;
  typeFilters?: GraphTypeFilters;
  positions?: RenderPositionMap;
  pathCache?: RenderPathCache;
  searchResultIds?: NodeId[];
  aggregationMarkers?: GraphAggregationMarker[];
}

type AtlasNode = {
  id: string;
  label: string;
  type: string;
  kind: string;
  community: string;
  source_path?: string;
  x: number;
  y: number;
  priority?: number;
  weight?: number;
  unavailable?: boolean;
};

type AtlasEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence?: string;
  relation_type?: string;
  weight?: number;
};

type AtlasCommunity = {
  id: string;
  label?: string;
  node_count?: number;
  color_index?: number;
};

export interface RenderPosition {
  x: number;
  y: number;
}

export type RenderPositionMap = Record<NodeId, RenderPosition>;

export interface RenderPathCache {
  getEdgeCurve(edge: { id: string; source: string; target: string; weight?: number }, source: RenderPosition, target: RenderPosition): number;
  clear(): void;
}

const MINIMAP_PATH = "M8 40 C34 20 54 36 76 22 C98 8 118 24 150 12";

export const GRAPH_RENDER_BUDGETS: Record<GraphRenderBudgetView, GraphRenderBudgetLimits> = {
  global: {
    maxVisibleNodes: 10000,
    maxVisibleEdges: 1000,
    maxLabels: 40,
    maxCards: 0,
    maxInteractionUpdates: 1200
  },
  community: {
    maxVisibleNodes: 2500,
    maxVisibleEdges: 1500,
    maxLabels: 120,
    maxCards: 60,
    maxInteractionUpdates: 1800
  }
};

export const GRAPH_COMMUNITY_FOCUS_THRESHOLDS = {
  smallMax: 40,
  mediumMax: 250,
  largeMax: 1000
} as const;

export const GRAPH_COMMUNITY_FOCUS_BUDGETS: Record<GraphCommunityFocusSizeBand, GraphRenderBudgetLimits> = {
  small: {
    maxVisibleNodes: 2500,
    maxVisibleEdges: 1500,
    maxLabels: 160,
    maxCards: 80,
    maxInteractionUpdates: 1800
  },
  medium: {
    maxVisibleNodes: 2500,
    maxVisibleEdges: 1500,
    maxLabels: 60,
    maxCards: 40,
    maxInteractionUpdates: 1800
  },
  large: {
    maxVisibleNodes: 2500,
    maxVisibleEdges: 1200,
    maxLabels: 80,
    maxCards: 20,
    maxInteractionUpdates: 1500
  },
  oversized: {
    maxVisibleNodes: 2500,
    maxVisibleEdges: 800,
    maxLabels: 40,
    maxCards: 0,
    maxInteractionUpdates: 1200
  }
};

export function createRenderPathCache(): RenderPathCache {
  const edgeCurves = new Map<string, number>();
  return {
    getEdgeCurve(edge, source, target): number {
      const key = edge.id || `${edge.source}->${edge.target}`;
      const existing = edgeCurves.get(key);
      if (existing != null) return existing;
      const curve = edgeCurveOffset(source, target, edge);
      edgeCurves.set(key, curve);
      return curve;
    },
    clear(): void {
      edgeCurves.clear();
    }
  };
}

export function buildRenderableGraph(data: GraphData, options: BuildRenderableGraphOptions = {}): RenderableGraph {
  const theme = options.theme || "shan-shui";
  const model = buildAtlasModel(data) as {
    nodes: AtlasNode[];
    edges: AtlasEdge[];
    byId: Record<string, AtlasNode>;
    communities: AtlasCommunity[];
    communityById: Record<string, AtlasCommunity>;
  };
  const layout = deriveAtlasLayout(model) as Record<string, unknown>;
  const selectedNodeIds = resolveSelectedNodeIds(model, options);
  const selectedNodeSet = new Set(selectedNodeIds);
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const focus = normalizeGraphFocus(options.focus, model);
  const focusedCommunityNodeCount = focus?.kind === "community" ? model.nodes.filter((node) => node.community === focus.id).length : 0;
  const communityFocus = resolveCommunityFocusScale(focus, focusedCommunityNodeCount);
  const communityQuality = evaluateCommunityQuality(data);
  const budgetLimits = resolveGraphRenderBudget(focus, focusedCommunityNodeCount);
  const budgetView: GraphRenderBudgetView = focus?.kind === "community" ? "community" : "global";
  const typeFilters = normalizeGraphTypeFilters(options.typeFilters, model.nodes);
  const visible = resolveAtlasVisibleSnapshot(model, layout, {
    activeCommunityId: focus?.kind === "community" ? focus.id : "all",
    selectedNodeId
  }) as {
    nodes: AtlasNode[];
    edges: AtlasEdge[];
    densityMode: DensityMode;
    labelNodeIds: Record<string, boolean>;
    importantNodeIds: Record<string, boolean>;
    startNodeIds: Record<string, boolean>;
    starts: Array<{ node: AtlasNode }>;
    counts: {
      visible_nodes: number;
      visible_edges: number;
      total_nodes: number;
      total_edges: number;
      total_communities: number;
    };
  };
  const previewNodeId = selectedNodeId ? null : firstPreviewNodeId(visible);
  const importantIds = visible.importantNodeIds || {};
  const labelIds = visible.labelNodeIds || {};
  const startIds = visible.startNodeIds || {};

  const filteredVisibleNodes = applyNodeTypeFilters(visible.nodes, typeFilters);
  const filteredVisibleNodeIds = new Set(filteredVisibleNodes.map((node) => node.id));
  const filteredVisibleEdges = visible.edges.filter((edge) => filteredVisibleNodeIds.has(edge.source) && filteredVisibleNodeIds.has(edge.target));
  const filteredDensityMode = getAtlasDensityMode(filteredVisibleNodes.length) as DensityMode;
  const filteredVisibleCounts = {
    visible_nodes: filteredVisibleNodes.length,
    visible_edges: filteredVisibleEdges.length,
    total_nodes: visible.counts.total_nodes,
    total_edges: visible.counts.total_edges,
    total_communities: visible.counts.total_communities
  };

  const allFilteredNodes = applyNodeTypeFilters(model.nodes, typeFilters);
  const pointById = new Map(allFilteredNodes.map((node) => [node.id, renderPointForNode(node, options)]));
  const worldBounds = worldBoundsForPoints([...pointById.values()]);
  const pinnedNodeSet = resolvePinnedNodeIds(model.nodes, options.pins);
  const searchResultSet = new Set(options.searchResultIds || []);
  const aggregationMarkers = options.aggregationMarkers ?? [];
  const stableCoreNodeIds = selectStableCoreNodeIds(filteredVisibleNodes, budgetLimits.maxLabels, {
    labelNodeIds: labelIds,
    importantNodeIds: importantIds,
    startNodeIds: startIds,
    previewNodeId
  });
  const stableCoreNodeSet = new Set(stableCoreNodeIds);
  const stableSkeletonEdgeSet = selectBudgetedIds(filteredVisibleEdges, budgetLimits.maxVisibleEdges, (edge) =>
    stableEdgeImportance(edge, { importantNodeIds: importantIds, coreNodeIds: stableCoreNodeSet })
  );
  const temporaryBoostNodeSet = new Set(
    filteredVisibleNodes
      .filter((node) => temporaryNodeBoost(node, { selectedNodeIds: selectedNodeSet, pinnedNodeIds: pinnedNodeSet, searchResultIds: searchResultSet }) > 0)
      .map((node) => node.id)
  );
  const budgetedNodeIds = selectBudgetedIds(filteredVisibleNodes, budgetLimits.maxVisibleNodes, (node) =>
    nodeRenderPriority(node, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      labelNodeIds: labelIds,
      importantNodeIds: importantIds,
      startNodeIds: startIds,
      previewNodeId,
      coreNodeIds: stableCoreNodeSet
    })
  );
  const budgetedVisibleNodes = filteredVisibleNodes.filter((node) => budgetedNodeIds.has(node.id));
  const labelCandidateNodes = budgetedVisibleNodes.filter((node) =>
    labelIds[node.id] === true ||
    selectedNodeSet.has(node.id) ||
    pinnedNodeSet.has(node.id) ||
    searchResultSet.has(node.id) ||
    importantIds[node.id] === true ||
    startIds[node.id] === true ||
    node.id === previewNodeId
  );
  const labelNodeSet = selectBudgetedIds(labelCandidateNodes, budgetLimits.maxLabels, (node) =>
    nodeRenderPriority(node, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      labelNodeIds: labelIds,
      importantNodeIds: importantIds,
      startNodeIds: startIds,
      previewNodeId,
      coreNodeIds: stableCoreNodeSet
    })
  );
  const cardCandidateNodes = budgetedVisibleNodes.filter((node) =>
    shouldPreferCard(node, budgetView, filteredDensityMode, selectedNodeSet, pinnedNodeSet, searchResultSet, importantIds, previewNodeId)
  );
  const cardNodeSet = selectBudgetedIds(cardCandidateNodes, budgetLimits.maxCards, (node) =>
    nodeRenderPriority(node, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      labelNodeIds: labelIds,
      importantNodeIds: importantIds,
      startNodeIds: startIds,
      previewNodeId,
      coreNodeIds: stableCoreNodeSet
    })
  );
  const traceableNodeIds = new Set([
    ...stableCoreNodeSet,
    ...selectedNodeSet,
    ...pinnedNodeSet,
    ...searchResultSet
  ]);
  const interactionLabelBudget = Math.max(4, Math.min(labelNodeSet.size, Math.ceil(budgetLimits.maxLabels * 0.35)));
  const interactionLabelNodeSet = selectBudgetedIds(
    budgetedVisibleNodes.filter((node) => traceableNodeIds.has(node.id)),
    interactionLabelBudget,
    (node) => nodeRenderPriority(node, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      labelNodeIds: labelIds,
      importantNodeIds: importantIds,
      startNodeIds: startIds,
      previewNodeId,
      coreNodeIds: stableCoreNodeSet
    })
  );

  const nodes = budgetedVisibleNodes.map((node) => {
    const isSelected = selectedNodeSet.has(node.id);
    const displayMode = budgetedNodeDisplayMode(node, {
      view: budgetView,
      densityMode: filteredDensityMode,
      selectedNodeIds: selectedNodeSet,
      cardNodeIds: cardNodeSet,
      labelNodeIds: labelNodeSet
    });
    const point = pointById.get(node.id) || renderPointForNode(node, options);
    const cssPoint = worldPointToCssPercentPoint(point, worldBounds);
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      kind: node.kind,
      community: node.community,
      sourcePath: wikiPathForGraphNode(node),
      x: round(cssPoint.x),
      y: round(cssPoint.y),
      point,
      displayMode,
      visualRole: nodeVisualRole(node, displayMode, isSelected ? node.id : selectedNodeId, previewNodeId, importantIds),
      priority: Number(node.priority || 0),
      weight: Number(node.weight || 0),
      stableImportance: stableNodeImportance(node, {
        labelNodeIds: labelIds,
        importantNodeIds: importantIds,
        startNodeIds: startIds,
        previewNodeId,
        coreNodeIds: stableCoreNodeSet
      }),
      temporaryBoost: temporaryNodeBoost(node, {
        selectedNodeIds: selectedNodeSet,
        pinnedNodeIds: pinnedNodeSet,
        searchResultIds: searchResultSet
      }),
      coreAnchor: stableCoreNodeSet.has(node.id),
      unavailable: node.unavailable === true,
      selected: isSelected,
      startNode: startIds[node.id] === true,
      previewStart: node.id === previewNodeId,
      labelVisible: labelNodeSet.has(node.id),
      interactionLabelVisible: interactionLabelNodeSet.has(node.id)
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const isFocusedView = focus?.kind === "community";
  const renderableEdgeCandidates = filteredVisibleEdges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));
  const edgeIdSet = selectBudgetedIds(renderableEdgeCandidates, budgetLimits.maxVisibleEdges, (edge) =>
    edgeRenderPriority(edge, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      importantNodeIds: importantIds,
      coreNodeIds: stableCoreNodeSet
    })
  );
  const interactionEdgeBudget = Math.max(8, Math.min(edgeIdSet.size, Math.ceil(budgetLimits.maxVisibleEdges * 0.22)));
  const interactionEdgeIdSet = selectBudgetedIds(
    renderableEdgeCandidates.filter((edge) => edgeIdSet.has(edge.id) && (traceableNodeIds.has(edge.source) || traceableNodeIds.has(edge.target) || stableSkeletonEdgeSet.has(edge.id))),
    interactionEdgeBudget,
    (edge) => edgeRenderPriority(edge, {
      selectedNodeIds: selectedNodeSet,
      pinnedNodeIds: pinnedNodeSet,
      searchResultIds: searchResultSet,
      importantNodeIds: importantIds,
      coreNodeIds: stableCoreNodeSet
    })
  );
  const edges = renderableEdgeCandidates.filter((edge) => edgeIdSet.has(edge.id)).flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
    const curveOffset = options.pathCache?.getEdgeCurve(edge, source.point, target.point) ?? edgeCurveOffset(source.point, target.point, edge, worldBounds);
    const confidence = normalizeEdgeConfidence(edge);
    const relationType = normalizeEdgeRelationType(edge);
    return [{
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: confidence,
      confidence,
      relationType,
      relationClass: edgeRelationClass(relationType),
      path: makeEdgePathFromPoints(source.point, target.point, curveOffset),
      curveOffset,
      strokeWidth: edgeVisualStrokeWidth(edge, isFocusedView),
      opacity: edgeVisualOpacity(edge, isFocusedView),
      simulationWeight: edgeStrokeWidth(edge),
      skeleton: stableSkeletonEdgeSet.has(edge.id),
      traceable: interactionEdgeIdSet.has(edge.id)
    }];
  });
  const renderedEdgeIds = new Set(edges.map((edge) => edge.id));

  const communities = model.communities.map((community, index) => {
    const communityNodes = nodes.filter((node) => node.community === community.id);
    const allCommunityNodes = allFilteredNodes.filter((node) => node.community === community.id);
    const wash = computeCommunityWash(communityNodes);
    return {
      id: community.id,
      label: community.label || community.id,
      color: getCommunityColor(theme, Number(community.color_index ?? index)),
      nodeCount: Number(community.node_count ?? allCommunityNodes.length),
      boundaryCertainty: communityQuality.boundaryCertainty,
      wash: wash ? { ...wash, opacity: communityWashOpacity(wash.opacity, communityQuality.boundaryCertainty) } : null
    };
  });
  const communityById = new Map(communities.map((community) => [community.id, community]));
  const aggregationContainers: RenderableAggregationContainer[] = [];
  void aggregationMarkers;

  const labelUsage = nodes.filter((node) => node.labelVisible).length;
  const cardUsage = nodes.filter((node) => node.displayMode === "card").length;
  const interactionUpdateCandidates = nodes.length + edges.length + labelUsage + cardUsage;
  const interactionUpdateUsage = Math.min(interactionUpdateCandidates, budgetLimits.maxInteractionUpdates);
  const activeLabels = nodes.filter((node) => node.interactionLabelVisible).length;
  const activeEdges = edges.filter((edge) => edge.traceable).length;
  const activeInteractionCandidates = nodes.length + activeEdges + activeLabels;
  const activeInteractionUsage = Math.min(activeInteractionCandidates, budgetLimits.maxInteractionUpdates);

  return {
    model,
    layout,
    worldBounds,
    selectedNodeId,
    focus,
    typeFilters,
    densityMode: filteredDensityMode,
    counts: {
      visibleNodes: filteredVisibleCounts.visible_nodes,
      visibleEdges: filteredVisibleCounts.visible_edges,
      totalNodes: filteredVisibleCounts.total_nodes,
      totalEdges: filteredVisibleCounts.total_edges,
      totalCommunities: filteredVisibleCounts.total_communities
    },
    nodes,
    edges,
    communities,
    aggregationContainers,
    minimap: {
      path: MINIMAP_PATH,
      nodes: nodes.slice(0, 60).map((node) => {
        const point = worldPointToMinimapPoint(node.point, undefined, worldBounds);
        return {
          id: node.id,
          x: point.x,
          y: point.y,
          r: node.selected ? 3.2 : 2.2,
          fill: communityById.get(node.community)?.color || getCommunityColor(theme, 0),
          selected: node.selected
        };
      })
    },
    budget: {
      view: budgetView,
      limits: { ...budgetLimits },
      usage: {
        maxVisibleNodes: nodes.length,
        maxVisibleEdges: edges.length,
        maxLabels: labelUsage,
        maxCards: cardUsage,
        maxInteractionUpdates: interactionUpdateUsage
      }
    },
    overflow: {
      nodes: overflowBucket(filteredVisibleNodes.map((node) => node.id), new Set(nodes.map((node) => node.id))),
      edges: overflowBucket(filteredVisibleEdges.map((edge) => edge.id), renderedEdgeIds),
      labels: overflowBucket(labelCandidateNodes.map((node) => node.id), labelNodeSet),
      cards: overflowBucket(cardCandidateNodes.map((node) => node.id), cardNodeSet),
      interactionUpdates: {
        total: interactionUpdateCandidates,
        hidden: Math.max(0, interactionUpdateCandidates - budgetLimits.maxInteractionUpdates)
      }
    },
    interaction: {
      mode: "idle",
      maxUpdatedObjects: budgetLimits.maxInteractionUpdates,
      updateCandidates: activeInteractionCandidates,
      updatedObjects: activeInteractionUsage,
      hiddenObjects: Math.max(0, activeInteractionCandidates - budgetLimits.maxInteractionUpdates),
      labelsVisibleDuringInteraction: activeLabels,
      edgesVisibleDuringInteraction: activeEdges,
      preservedNodeIds: nodes.filter((node) => traceableNodeIds.has(node.id)).map((node) => node.id)
    },
    importance: {
      stableCoreNodeIds,
      stableSkeletonEdgeIds: filteredVisibleEdges.filter((edge) => stableSkeletonEdgeSet.has(edge.id)).map((edge) => edge.id),
      temporaryBoostNodeIds: filteredVisibleNodes.filter((node) => temporaryBoostNodeSet.has(node.id)).map((node) => node.id)
    },
    communityFocus,
    communityQuality
  };
}

export function evaluateCommunityQuality(data: GraphData): GraphCommunityQuality {
  const nodeCount = data.nodes.length;
  const communityCounts = new Map<string, number>();
  const communityLabels = new Map<string, string>();
  for (const node of data.nodes) {
    const communityId = normalizeCommunityId(node.community);
    if (!communityId) continue;
    communityCounts.set(communityId, (communityCounts.get(communityId) || 0) + 1);
  }
  for (const community of data.learning?.communities || []) {
    communityCounts.set(community.id, Math.max(communityCounts.get(community.id) || 0, Number(community.node_count) || 0));
    communityLabels.set(community.id, community.label || "");
  }
  const communityCount = communityCounts.size;
  const largestCommunity = Math.max(0, ...communityCounts.values());
  const tinyCommunityCount = [...communityCounts.values()].filter((count) => count <= 2).length;
  const weakLabelCount = [...communityCounts.keys()].filter((id) => isWeakCommunityLabel(communityLabels.get(id), id)).length;
  const crossEdgeRatio = crossCommunityEdgeRatio(data);
  const signals: GraphCommunityQualitySignal[] = [];

  if (largestCommunity > GRAPH_COMMUNITY_FOCUS_THRESHOLDS.largeMax || (nodeCount >= 80 && largestCommunity / Math.max(1, nodeCount) >= 0.72)) {
    signals.push({
      id: "oversized-community",
      severity: "poor",
      value: largestCommunity,
      threshold: GRAPH_COMMUNITY_FOCUS_THRESHOLDS.largeMax
    });
  }
  if (communityCount >= 8 && tinyCommunityCount / communityCount >= 0.55) {
    signals.push({
      id: "many-tiny-communities",
      severity: "moderate",
      value: round(tinyCommunityCount / communityCount),
      threshold: 0.55
    });
  }
  if (data.edges.length >= 6 && crossEdgeRatio >= 0.42) {
    signals.push({
      id: "mixed-cross-community-edges",
      severity: "poor",
      value: round(crossEdgeRatio),
      threshold: 0.42
    });
  }
  if (communityCount > 0 && weakLabelCount / communityCount >= 0.35) {
    signals.push({
      id: "weak-community-labels",
      severity: "moderate",
      value: round(weakLabelCount / communityCount),
      threshold: 0.35
    });
  }
  if ((nodeCount >= 60 && communityCount <= 1) || communityCount > Math.max(48, Math.ceil(Math.sqrt(Math.max(1, nodeCount)) * 4))) {
    signals.push({
      id: "abnormal-community-count",
      severity: "moderate",
      value: communityCount,
      threshold: nodeCount >= 60 && communityCount <= 1 ? 1 : Math.max(48, Math.ceil(Math.sqrt(Math.max(1, nodeCount)) * 4))
    });
  }

  const score = signals.reduce((sum, signal) => sum + (signal.severity === "poor" ? 2 : 1), 0);
  const level: GraphCommunityQualityLevel = score >= 3 ? "poor" : score >= 1 ? "moderate" : "good";
  return {
    level,
    boundaryCertainty: level === "poor" ? "low" : level === "moderate" ? "reduced" : "high",
    warning: level === "poor" ? "poor-community-quality" : level === "moderate" ? "moderate-community-quality" : null,
    signals,
    auxiliaryViews: level === "poor" ? [{ id: "core-structure-connectivity", label: "核心结构 / 连通性" }] : []
  };
}

function communityWashOpacity(opacity: number, certainty: GraphCommunityBoundaryCertainty): number {
  if (certainty === "low") return round(opacity * 0.48);
  if (certainty === "reduced") return round(opacity * 0.72);
  return opacity;
}

function normalizeCommunityId(value: unknown): string | null {
  const id = String(value || "").trim();
  return id ? id : null;
}

function isWeakCommunityLabel(label: unknown, id: string): boolean {
  const normalized = String(label || "").trim().toLowerCase();
  const normalizedId = id.trim().toLowerCase();
  if (!normalized || normalized === normalizedId) return true;
  return /^(community|cluster|group|社区|社群|群组)[\s:_-]*[a-z0-9._-]*$/i.test(normalized);
}

function crossCommunityEdgeRatio(data: GraphData): number {
  const communityByNode = new Map(data.nodes.map((node) => [node.id, normalizeCommunityId(node.community)]));
  let comparableEdges = 0;
  let crossEdges = 0;
  for (const edge of data.edges) {
    const sourceCommunity = communityByNode.get(edge.from);
    const targetCommunity = communityByNode.get(edge.to);
    if (!sourceCommunity || !targetCommunity) continue;
    comparableEdges += 1;
    if (sourceCommunity !== targetCommunity) crossEdges += 1;
  }
  return comparableEdges ? crossEdges / comparableEdges : 0;
}

function pinHintForNode(node: AtlasNode | undefined, nodeId: NodeId, pins?: PinMap): GraphPinHint {
  const wikiPath = node ? wikiPathForGraphNode(node) : nodeId;
  const position = pins?.[wikiPath] ?? null;
  return {
    nodeId,
    wikiPath,
    pinned: Boolean(position),
    position
  };
}

function averagePoint(points: RenderPosition[]): RenderPosition {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return {
    x: round(total.x / Math.max(1, points.length)),
    y: round(total.y / Math.max(1, points.length))
  };
}

function stableIntersection(baseIds: readonly string[], candidateIds: readonly string[]): string[] {
  const candidates = new Set(candidateIds);
  return baseIds.filter((id) => candidates.has(id));
}

function aggregationContainerRadius(nodeCount: number): number {
  return round(Math.max(34, Math.min(88, 28 + Math.sqrt(Math.max(1, nodeCount)) * 7)));
}

export function resolveGraphRenderBudget(focus: GraphFocusInput, focusedCommunityNodeCount = 0): GraphRenderBudgetLimits {
  if (focus?.kind !== "community") return { ...GRAPH_RENDER_BUDGETS.global };
  return { ...GRAPH_COMMUNITY_FOCUS_BUDGETS[communityFocusSizeBand(focusedCommunityNodeCount)] };
}

export function resolveCommunityFocusScale(focus: GraphFocusInput, focusedCommunityNodeCount: number): GraphCommunityFocusScale | null {
  if (focus?.kind !== "community") return null;
  const nodeCount = Math.max(0, Math.floor(Number(focusedCommunityNodeCount) || 0));
  const sizeBand = communityFocusSizeBand(nodeCount);
  return {
    communityId: focus.id,
    nodeCount,
    sizeBand,
    representation: communityFocusRepresentation(sizeBand),
    completePresence: communityFocusCompletePresence(sizeBand),
    thresholds: { ...GRAPH_COMMUNITY_FOCUS_THRESHOLDS }
  };
}

export function makeEdgePath(source: AtlasNode, target: AtlasNode, edge: { weight?: number }): string {
  const sourcePoint = atlasNodePoint(source) as { x: number; y: number };
  const targetPoint = atlasNodePoint(target) as { x: number; y: number };
  return makeEdgePathFromPoints(sourcePoint, targetPoint, edgeCurveOffset(sourcePoint, targetPoint, edge));
}

export function makeEdgePathFromPoints(sourcePoint: RenderPosition, targetPoint: RenderPosition, curveOffset: number): string {
  const x1 = sourcePoint.x;
  const y1 = sourcePoint.y;
  const x2 = targetPoint.x;
  const y2 = targetPoint.y;
  const control = graphEdgeControlPoint(sourcePoint, targetPoint, curveOffset);
  return `M ${round(x1)} ${round(y1)} Q ${round(control.x)} ${round(control.y)} ${round(x2)} ${round(y2)}`;
}

export function edgeStrokeWidth(edge: { weight?: number }): number {
  return round(1.1 + clampWeight(edge.weight) * 1.8);
}

export function edgeOpacity(edge: { weight?: number }): number {
  return round(0.32 + clampWeight(edge.weight) * 0.44);
}

export function edgeVisualStrokeWidth(edge: { weight?: number }, focusedView: boolean): number {
  if (focusedView) return edgeStrokeWidth(edge);
  return round(0.95 + clampWeight(edge.weight) * 0.75);
}

export function edgeVisualOpacity(edge: { weight?: number }, focusedView: boolean): number {
  if (focusedView) return edgeOpacity(edge);
  return round(0.2 + clampWeight(edge.weight) * 0.22);
}

export function edgeRelationClass(relationType: unknown): string {
  switch (normalizeEdgeRelationText(relationType)) {
    case "实现":
      return "relation-implementation";
    case "依赖":
      return "relation-dependency";
    case "衍生":
      return "relation-derivation";
    case "对比":
      return "relation-contrast";
    case "矛盾":
      return "relation-conflict";
    default:
      return "relation-dependency";
  }
}

export function screenEffectiveDensityMode(visibleNodeCount: number, viewportScale: number): DensityMode {
  const count = Number.isFinite(Number(visibleNodeCount)) ? Math.max(0, Number(visibleNodeCount)) : 0;
  const scale = Number.isFinite(Number(viewportScale)) ? clamp(Number(viewportScale), 0.25, 4) : 1;
  return getAtlasDensityMode(Math.ceil(count / (scale * scale))) as DensityMode;
}

export function nodeDisplayModeForDensity(
  node: Pick<RenderableNode, "selected" | "labelVisible" | "visualRole">,
  densityMode: DensityMode
): NodeDisplayMode {
  if (node.selected) return "card";
  if (densityMode === "card") return "card";
  if (densityMode === "compact-card") return "compact-card";
  const shouldShowLabel = node.labelVisible || node.visualRole !== "map-pin";
  if (densityMode === "point-plus-focus") return shouldShowLabel ? "compact-card" : "point";
  return shouldShowLabel ? "compact-card" : "overview";
}

function normalizeGraphFocus(
  focus: GraphFocusInput | undefined,
  model: { communityById: Record<string, AtlasCommunity> }
): GraphFocusInput {
  if (!focus || focus.kind !== "community") return null;
  const id = String(focus.id || "");
  return id && model.communityById[id] ? { kind: "community", id } : null;
}

function normalizeGraphTypeFilters(filters: GraphTypeFilters | undefined, nodes: AtlasNode[]): GraphTypeFilters {
  const normalized: GraphTypeFilters = {};
  for (const node of nodes) {
    normalized[node.type] = filters?.[node.type] !== false;
  }
  return normalized;
}

function applyNodeTypeFilters(nodes: AtlasNode[], filters: GraphTypeFilters): AtlasNode[] {
  return nodes.filter((node) => filters[node.type] !== false);
}

function normalizeEdgeConfidence(edge: AtlasEdge): string {
  const value = String(edge.confidence || edge.type || "EXTRACTED").toUpperCase();
  if (value === "INFERRED" || value === "AMBIGUOUS" || value === "UNVERIFIED") return value.toLowerCase();
  return "extracted";
}

function normalizeEdgeRelationType(edge: AtlasEdge): string {
  return normalizeEdgeRelationText(edge.relation_type || "依赖");
}

function normalizeEdgeRelationText(relationType: unknown): string {
  const value = String(relationType || "依赖").trim();
  return value || "依赖";
}

function pinKeyForNode(node: { source_path?: unknown; path?: unknown; source?: unknown; id: string }): WikiPath {
  return wikiPathForGraphNode(node);
}

function renderPointForNode(node: AtlasNode, options: Pick<BuildRenderableGraphOptions, "positions" | "pins">): RenderPosition {
  const position = options.positions?.[node.id];
  if (position) {
    return {
      x: finitePositionCoordinate(position.x),
      y: finitePositionCoordinate(position.y)
    };
  }
  const pin = options.pins?.[pinKeyForNode(node)];
  if (pin) {
    return pinPositionToWorldPoint(pin);
  }
  return atlasNodePoint(node) as RenderPosition;
}

function edgeCurveOffset(sourcePoint: RenderPosition, targetPoint: RenderPosition, edge: { weight?: number }, worldBounds: GraphWorldBounds = {
  minX: 0,
  minY: 0,
  maxX: GRAPH_WORLD_SIZE.width,
  maxY: GRAPH_WORLD_SIZE.height,
  width: GRAPH_WORLD_SIZE.width,
  height: GRAPH_WORLD_SIZE.height
}): number {
  const sourceYPercent = (sourcePoint.y - worldBounds.minY) / worldBounds.height * 100;
  const targetYPercent = (targetPoint.y - worldBounds.minY) / worldBounds.height * 100;
  return Math.max(-76, Math.min(76, (sourceYPercent - targetYPercent) * 1.8 + (clampWeight(edge.weight) - 0.5) * 24));
}

function finitePositionCoordinate(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function resolveSelectedNodeIds(
  model: { byId: Record<string, AtlasNode>; nodes: AtlasNode[] },
  options: BuildRenderableGraphOptions
): string[] {
  if (options.selection?.kind === "node" && model.byId[options.selection.id]) return [options.selection.id];
  if (options.selection?.kind === "community") {
    const communityId = options.selection.id;
    return model.nodes.filter((node) => node.community === communityId).map((node) => node.id);
  }
  if (options.selection?.kind === "nodes") {
    const selected = new Set(options.selection.ids);
    return model.nodes.map((node) => node.id).filter((id) => selected.has(id));
  }
  if (options.selectedNodeId && model.byId[options.selectedNodeId]) return [options.selectedNodeId];
  return [];
}

function firstPreviewNodeId(visible: { starts: Array<{ node: AtlasNode }>; nodes: AtlasNode[] }): string | null {
  const firstStart = visible.starts.find((entry) => entry?.node);
  if (firstStart?.node) return firstStart.node.id;
  const fallback = visible.nodes.slice().sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0];
  return fallback ? fallback.id : null;
}

function nodeDisplayMode(
  node: AtlasNode,
  densityMode: DensityMode,
  selectedNodeId: string | null,
  previewNodeId: string | null,
  labelNodeIds: Record<string, boolean>,
  importantNodeIds: Record<string, boolean>
): NodeDisplayMode {
  if (node.id === selectedNodeId) return "card";
  if (previewNodeId && node.id === previewNodeId && (densityMode === "overview" || densityMode === "point-plus-focus")) return "compact-card";
  if (importantNodeIds[node.id] && (densityMode === "overview" || densityMode === "point-plus-focus")) return "compact-card";
  if (densityMode === "overview") return labelNodeIds[node.id] ? "compact-card" : "overview";
  if (densityMode === "point-plus-focus") return labelNodeIds[node.id] ? "compact-card" : "point";
  return densityMode;
}

function budgetedNodeDisplayMode(
  node: AtlasNode,
  options: {
    view: GraphRenderBudgetView;
    densityMode: DensityMode;
    selectedNodeIds: Set<string>;
    cardNodeIds: Set<string>;
    labelNodeIds: Set<string>;
  }
): NodeDisplayMode {
  if (options.cardNodeIds.has(node.id)) return "card";
  if (options.labelNodeIds.has(node.id)) return "compact-card";
  if (options.view === "global") return options.densityMode === "overview" ? "overview" : "point";
  if (options.densityMode === "overview") return "overview";
  return "point";
}

function communityFocusSizeBand(nodeCount: number): GraphCommunityFocusSizeBand {
  const count = Math.max(0, Math.floor(Number(nodeCount) || 0));
  if (count <= GRAPH_COMMUNITY_FOCUS_THRESHOLDS.smallMax) return "small";
  if (count <= GRAPH_COMMUNITY_FOCUS_THRESHOLDS.mediumMax) return "medium";
  if (count <= GRAPH_COMMUNITY_FOCUS_THRESHOLDS.largeMax) return "large";
  return "oversized";
}

function communityFocusRepresentation(sizeBand: GraphCommunityFocusSizeBand): GraphCommunityFocusRepresentation {
  if (sizeBand === "small") return "cards-and-labels";
  if (sizeBand === "medium") return "points-with-cards";
  if (sizeBand === "large") return "outline-with-caps";
  return "internal-map-entry";
}

function communityFocusCompletePresence(sizeBand: GraphCommunityFocusSizeBand): GraphCommunityFocusScale["completePresence"] {
  if (sizeBand === "large") return "outline";
  if (sizeBand === "oversized") return "internal-map";
  return "nodes";
}

function shouldPreferCard(
  node: AtlasNode,
  view: GraphRenderBudgetView,
  densityMode: DensityMode,
  selectedNodeIds: Set<string>,
  pinnedNodeIds: Set<string>,
  searchResultIds: Set<string>,
  importantNodeIds: Record<string, boolean>,
  previewNodeId: string | null
): boolean {
  if (view === "global") return false;
  return (
    densityMode === "card" ||
    selectedNodeIds.has(node.id) ||
    pinnedNodeIds.has(node.id) ||
    searchResultIds.has(node.id) ||
    importantNodeIds[node.id] === true ||
    node.id === previewNodeId
  );
}

function selectBudgetedIds<T extends { id: string }>(
  items: T[],
  budget: number,
  score: (item: T, index: number) => number
): Set<string> {
  if (budget <= 0 || items.length === 0) return new Set();
  if (items.length <= budget) return new Set(items.map((item) => item.id));
  return new Set(
    items
      .map((item, index) => ({ item, index, score: score(item, index) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, budget)
      .map((entry) => entry.item.id)
  );
}

function nodeRenderPriority(
  node: AtlasNode,
  signals: {
    selectedNodeIds: Set<string>;
    pinnedNodeIds: Set<string>;
    searchResultIds: Set<string>;
    labelNodeIds: Record<string, boolean>;
    importantNodeIds: Record<string, boolean>;
    startNodeIds: Record<string, boolean>;
    previewNodeId: string | null;
    coreNodeIds: Set<string>;
  }
): number {
  return stableNodeImportance(node, signals) + temporaryNodeBoost(node, signals);
}

function edgeRenderPriority(
  edge: AtlasEdge,
  signals: {
    selectedNodeIds: Set<string>;
    pinnedNodeIds: Set<string>;
    searchResultIds: Set<string>;
    importantNodeIds: Record<string, boolean>;
    coreNodeIds: Set<string>;
  }
): number {
  const endpoints = [edge.source, edge.target];
  let score = stableEdgeImportance(edge, signals);
  for (const id of endpoints) {
    if (signals.selectedNodeIds.has(id)) score += 100000;
    if (signals.searchResultIds.has(id)) score += 50000;
    if (signals.pinnedNodeIds.has(id)) score += 40000;
    if (signals.importantNodeIds[id]) score += 12000;
  }
  return score;
}

function selectStableCoreNodeIds(
  nodes: AtlasNode[],
  budget: number,
  signals: {
    labelNodeIds: Record<string, boolean>;
    importantNodeIds: Record<string, boolean>;
    startNodeIds: Record<string, boolean>;
    previewNodeId: string | null;
  }
): string[] {
  if (budget <= 0) return [];
  const representativeIds = new Set<string>();
  const bestByCommunity = new Map<string, { node: AtlasNode; score: number; index: number }>();
  nodes.forEach((node, index) => {
    const score = stableNodeImportance(node, { ...signals, coreNodeIds: new Set() });
    const existing = bestByCommunity.get(node.community);
    if (!existing || score > existing.score || (score === existing.score && index < existing.index)) {
      bestByCommunity.set(node.community, { node, score, index });
    }
  });
  for (const entry of [...bestByCommunity.values()].sort((left, right) => right.score - left.score || left.index - right.index)) {
    if (representativeIds.size >= budget) break;
    representativeIds.add(entry.node.id);
  }
  const ranked = selectBudgetedIds(nodes, budget, (node) => stableNodeImportance(node, { ...signals, coreNodeIds: representativeIds }));
  const ordered = new Set([...representativeIds, ...ranked]);
  return nodes.filter((node) => ordered.has(node.id)).slice(0, budget).map((node) => node.id);
}

function stableNodeImportance(
  node: AtlasNode,
  signals: {
    labelNodeIds: Record<string, boolean>;
    importantNodeIds: Record<string, boolean>;
    startNodeIds: Record<string, boolean>;
    previewNodeId: string | null;
    coreNodeIds: Set<string>;
  }
): number {
  let score = Number(node.priority || 0) * 10 + Number(node.weight || 0);
  if (signals.coreNodeIds.has(node.id)) score += 20000;
  return score;
}

function temporaryNodeBoost(
  node: AtlasNode,
  signals: {
    selectedNodeIds: Set<string>;
    pinnedNodeIds: Set<string>;
    searchResultIds: Set<string>;
  }
): number {
  let score = 0;
  if (signals.selectedNodeIds.has(node.id)) score += 100000;
  if (signals.searchResultIds.has(node.id)) score += 50000;
  if (signals.pinnedNodeIds.has(node.id)) score += 40000;
  return score;
}

function stableEdgeImportance(
  edge: AtlasEdge,
  signals: {
    importantNodeIds: Record<string, boolean>;
    coreNodeIds: Set<string>;
  }
): number {
  const endpoints = [edge.source, edge.target];
  let score = clampWeight(edge.weight) * 1000;
  for (const id of endpoints) {
    if (signals.coreNodeIds.has(id)) score += 10000;
  }
  return score;
}

function resolvePinnedNodeIds(nodes: AtlasNode[], pins: PinMap | undefined): Set<string> {
  if (!pins) return new Set();
  const pinnedPaths = new Set(Object.keys(pins));
  return new Set(nodes.filter((node) => pinnedPaths.has(pinKeyForNode(node))).map((node) => node.id));
}

function overflowBucket(ids: string[], keptIds: Set<string>): GraphRenderOverflowBucket {
  const hiddenIds = ids.filter((id) => !keptIds.has(id));
  return {
    total: ids.length,
    hidden: hiddenIds.length,
    ids: hiddenIds
  };
}

function nodeVisualRole(
  node: AtlasNode,
  displayMode: NodeDisplayMode,
  selectedNodeId: string | null,
  previewNodeId: string | null,
  importantNodeIds: Record<string, boolean>
): NodeVisualRole {
  if (node.id === selectedNodeId) return "cinnabar-note";
  if (displayMode === "point" || displayMode === "overview") return "map-pin";
  if (previewNodeId && node.id === previewNodeId) return "index-slip";
  if (importantNodeIds[node.id]) return "index-slip";
  return "landmark";
}

function clampWeight(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.6;
  return clamp(numeric, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
