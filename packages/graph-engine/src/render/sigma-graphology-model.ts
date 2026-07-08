import type { GraphEdgeStyleOptions, ThemeId } from "../types";
import { getThemeTokens } from "../themes";
import type { GraphRelationFocusDepth } from "./relation-focus";
import { truncateLabel } from "../model/labels";
import type {
  GraphRendererAdapterAggregation,
  GraphRendererAdapterCommunity,
  GraphRendererAdapterData,
  GraphRendererAdapterEdge,
  GraphRendererAdapterNode
} from "./adapter";
import { edgeRelationClass } from "./model";
import type { CommunityMapEdgeLayer, CommunityMapNodeTier } from "./model";
import type { SigmaGlobalGraphologyGraph, SigmaGlobalGraphologyRuntime } from "./sigma-global-types";

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
  relationFocusDepth: GraphRelationFocusDepth;
  pinned: boolean;
  communityDimmed: boolean;
  communitySpotlightVisible: boolean;
  aggregationIds: string[];
  labelVisible: boolean;
  displayMode: string;
  visualRole: string;
  priority: number;
  communityMapTier: CommunityMapNodeTier;
  communityMapImportance: number;
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
  communityMapLayer: CommunityMapEdgeLayer;
  relationFocusDepth: GraphRelationFocusDepth;
  selectedRelation: boolean;
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

export interface SigmaGlobalEdgeStyle {
  color: string;
  size: number;
}

export interface SigmaGlobalEdgeStyleContext {
  communityReading?: boolean;
  relationFocusActive?: boolean;
}

const SIGMA_COMMUNITY_READING_LABEL_MAX_WIDTH = 180;
const SIGMA_COMMUNITY_READING_NARROW_LABEL_MAX_WIDTH = 128;

export function buildSigmaGlobalGraphologyGraph(
  adapterData: GraphRendererAdapterData,
  runtime: SigmaGlobalGraphologyRuntime,
  theme: ThemeId = "shan-shui",
  edgeStyle?: GraphEdgeStyleOptions
): SigmaGlobalGraphologyGraph {
  const graph = new runtime.GraphologyGraph({ multi: true, type: "mixed" });
  const communityColorById = new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
  const aggregationRenderById = new Map(adapterData.renderable.aggregationContainers.map((aggregation) => [aggregation.id, aggregation]));
  const selectedCommunityIds = sigmaSelectedCommunityIds(adapterData);
  const spotlightCommunityIds = sigmaSpotlightCommunityIds(adapterData);
  const edgeContext = sigmaGlobalEdgeStyleContext(adapterData);
  const communityReadingLabelBudget = adapterData.renderable.communityMap?.active
    ? adapterData.renderable.communityMap.current?.labelBudget.limit ?? null
    : null;

  for (const node of adapterData.nodes) {
    graph.addNode(node.id, sigmaGlobalNodeAttributes(node, communityColorById, spotlightCommunityIds, theme, { communityReadingLabelBudget }));
  }

  for (const edge of adapterData.edges) {
    graph.addEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, sigmaGlobalEdgeAttributes(
      edge,
      theme,
      edgeStyle,
      selectedCommunityIds,
      edgeContext
    ));
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

export function canPatchSigmaGlobalGraphAttributes(
  current: GraphRendererAdapterData,
  next: GraphRendererAdapterData,
  currentTheme: ThemeId,
  nextTheme: ThemeId
): boolean {
  if (currentTheme !== nextTheme) return false;
  if (current.nodes.length !== next.nodes.length || current.edges.length !== next.edges.length) return false;
  return current.nodes.every((node, index) => node.id === next.nodes[index]?.id)
    && current.edges.every((edge, index) => {
      const nextEdge = next.edges[index];
      return Boolean(nextEdge)
        && edge.id === nextEdge.id
        && edge.sourceNodeId === nextEdge.sourceNodeId
        && edge.targetNodeId === nextEdge.targetNodeId;
    });
}

export function patchSigmaGlobalGraphAttributes(
  graph: SigmaGlobalGraphologyGraph,
  adapterData: GraphRendererAdapterData,
  theme: ThemeId,
  edgeStyle?: GraphEdgeStyleOptions
): void {
  const communityColorById = new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
  const aggregationRenderById = new Map(adapterData.renderable.aggregationContainers.map((aggregation) => [aggregation.id, aggregation]));
  const selectedCommunityIds = sigmaSelectedCommunityIds(adapterData);
  const spotlightCommunityIds = sigmaSpotlightCommunityIds(adapterData);
  const edgeContext = sigmaGlobalEdgeStyleContext(adapterData);
  const communityReadingLabelBudget = adapterData.renderable.communityMap?.active
    ? adapterData.renderable.communityMap.current?.labelBudget.limit ?? null
    : null;

  for (const node of adapterData.nodes) {
    if (!graph.hasNode(node.id)) continue;
    graph.mergeNodeAttributes(node.id, sigmaGlobalNodeAttributes(node, communityColorById, spotlightCommunityIds, theme, { communityReadingLabelBudget }));
  }
  for (const edge of adapterData.edges) {
    graph.mergeEdgeAttributes(edge.id, sigmaGlobalEdgeAttributes(
      edge,
      theme,
      edgeStyle,
      selectedCommunityIds,
      edgeContext
    ));
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
}

export function sigmaGlobalNodeAttributes(
  node: GraphRendererAdapterNode,
  communityColorById: Map<string, string>,
  selectedCommunityIds: ReadonlySet<string> = new Set(),
  theme: ThemeId,
  options: { communityReadingLabelBudget?: number | null } = {}
): SigmaGlobalGraphologyNodeAttributes {
  const spotlight = sigmaGlobalNodeSpotlightState(node, selectedCommunityIds);
  const baseSize = sigmaGlobalNodeSize(node);
  const baseColor = sigmaGlobalNodeColor(node, communityColorById, theme);
  // Community-reading interaction emphasis (#136). relationFocusDepth is only
  // resolved for a focused community (it is "none" on the global route), so this
  // is implicitly scoped to community reading without a flag. The focus node and
  // first-degree neighbors grow; second-degree reads as faint context; unrelated
  // recedes. Composed on top of the spotlight/structural baseline, never erasing
  // the static community-map dot, and never changing the relation-type color.
  const depth = node.relationFocusDepth ?? "none";
  let nodeSize = spotlight.dimmed ? baseSize * 0.72 : baseSize;
  let nodeAlpha = spotlight.dimmed ? 0.2 : 1;
  if (depth === "focus") {
    nodeSize *= 1.4;
  } else if (depth === "first") {
    nodeSize *= 1.15;
  } else if (depth === "second") {
    nodeAlpha *= 0.55;
  } else if (depth === "unrelated") {
    nodeSize *= 0.8;
    nodeAlpha *= 0.16;
  }
  return {
    x: finiteNumber(node.point.x, 0),
    y: finiteNumber(node.point.y, 0),
    label: sigmaGlobalNodeCanvasLabel(node, options),
    size: roundNumber(nodeSize, 2),
    color: nodeAlpha >= 1 ? baseColor : rgbaColor(baseColor, nodeAlpha),
    type: "circle",
    graphNodeType: node.type,
    communityId: node.communityId,
    sourcePath: node.sourcePath,
    selected: node.selected,
    searchHit: node.searchHit,
    relationFocusDepth: node.relationFocusDepth ?? "none",
    pinned: node.pinHint.pinned,
    communityDimmed: spotlight.dimmed,
    communitySpotlightVisible: spotlight.forceVisible,
    aggregationIds: [...node.aggregationIds],
    labelVisible: node.render.labelVisible,
    displayMode: node.render.displayMode,
    visualRole: node.render.visualRole,
    priority: finiteNumber(node.render.priority, 0),
    communityMapTier: node.render.communityMapTier,
    communityMapImportance: finiteNumber(node.render.communityMapImportance, 0),
    drawerTarget: node.drawerTarget
  };
}

export function sigmaGlobalNodeCanvasLabel(
  node: GraphRendererAdapterNode,
  options: { communityReadingLabelBudget?: number | null } = {}
): string {
  if (!node.render.labelVisible) return "";
  const label = node.label || node.id;
  const labelBudget = options.communityReadingLabelBudget;
  if (!labelBudget || labelBudget <= 0) return label;
  const maxWidth = labelBudget <= 4
    ? SIGMA_COMMUNITY_READING_NARROW_LABEL_MAX_WIDTH
    : SIGMA_COMMUNITY_READING_LABEL_MAX_WIDTH;
  return truncateLabel(label, maxWidth).text;
}

export function sigmaSelectedCommunityIds(adapterData: GraphRendererAdapterData): Set<string> {
  return new Set(adapterData.communities.filter((community) => community.selected).map((community) => community.id));
}

export function sigmaSpotlightCommunityIds(adapterData: GraphRendererAdapterData): Set<string> {
  const communityId = sigmaSpotlightCommunityId(adapterData);
  return communityId ? new Set([communityId]) : new Set();
}

export function sigmaGlobalEdgeStyleContext(
  adapterData: GraphRendererAdapterData,
  options: { relationFocusPreviewActive?: boolean; relationFocusActive?: boolean } = {}
): SigmaGlobalEdgeStyleContext {
  return {
    communityReading: adapterData.renderable.communityMap?.active === true,
    relationFocusActive: options.relationFocusActive ?? (options.relationFocusPreviewActive === true || sigmaAdapterDataHasRelationFocus(adapterData))
  };
}

export function sigmaAdapterDataHasRelationFocus(adapterData: GraphRendererAdapterData): boolean {
  return adapterData.nodes.some((node) => (node.relationFocusDepth ?? "none") !== "none")
    || adapterData.edges.some((edge) =>
      (edge.render.relationFocusDepth ?? "none") !== "none"
    );
}

export function sigmaSpotlightCommunityId(adapterData: GraphRendererAdapterData): string | null {
  if (adapterData.selection.input?.kind === "community") return adapterData.selection.input.id;
  // Phase 2: after returning to global, no selection exists but the source
  // community context still drives the highlight so users see where they came from.
  return adapterData.sourceCommunityId ?? null;
}

export function sigmaGlobalNodeSpotlightState(
  node: GraphRendererAdapterNode,
  selectedCommunityIds: ReadonlySet<string>
): { dimmed: boolean; forceVisible: boolean } {
  const forceVisible = node.selected || node.searchHit || node.pinHint.pinned;
  const inSelectedCommunity = Boolean(node.communityId && selectedCommunityIds.has(node.communityId));
  return {
    forceVisible,
    dimmed: selectedCommunityIds.size > 0 && !inSelectedCommunity && !forceVisible
  };
}

export function sigmaGlobalEdgeAttributes(
  edge: GraphRendererAdapterEdge,
  theme: ThemeId = "shan-shui",
  style?: GraphEdgeStyleOptions,
  selectedCommunityIds: ReadonlySet<string> = new Set(),
  context: SigmaGlobalEdgeStyleContext = {}
): SigmaGlobalGraphologyEdgeAttributes {
  const edgeStyle = sigmaGlobalEdgeStyle(edge, theme, style, selectedCommunityIds, context);
  return {
    size: edgeStyle.size,
    color: edgeStyle.color,
    relationType: edge.relationType == null ? null : String(edge.relationType),
    confidence: edge.confidence == null ? null : String(edge.confidence),
    weight: finiteNumber(edge.weight, 0),
    sourceCommunityId: edge.sourceCommunityId,
    targetCommunityId: edge.targetCommunityId,
    communityMapLayer: edge.render.communityMapLayer,
    relationFocusDepth: edge.render.relationFocusDepth ?? "none",
    selectedRelation: edge.render.selectedRelation ?? false
  };
}

export function sigmaGlobalEdgeStyle(
  edge: GraphRendererAdapterEdge,
  theme: ThemeId = "shan-shui",
  style?: GraphEdgeStyleOptions,
  selectedCommunityIds: ReadonlySet<string> = new Set(),
  context: SigmaGlobalEdgeStyleContext = {}
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

  if (!style?.focusHighlight && !context.communityReading && selectedCommunityIds.size > 0) {
    const sourceSelected = Boolean(edge.sourceCommunityId && selectedCommunityIds.has(edge.sourceCommunityId));
    const targetSelected = Boolean(edge.targetCommunityId && selectedCommunityIds.has(edge.targetCommunityId));
    const touchesSelectedCommunity = sourceSelected || targetSelected;
    const internalSelectedCommunity = sourceSelected && targetSelected;
    if (internalSelectedCommunity) {
      const layer = edge.render?.communityMapLayer;
      if (layer === "skeleton") {
        size += 0.55;
        alpha = alpha * 1.18 + 0.04;
      } else if (layer === "related") {
        size += 0.15;
        alpha = alpha * 1.05 + 0.01;
      } else {
        size *= 0.78;
        alpha *= 0.62;
      }
    } else if (touchesSelectedCommunity && sigmaSelectedCommunityPreviewBridgeEdge(edge)) {
      size += 0.35;
      alpha = alpha * 1.16 + 0.04;
    } else if (touchesSelectedCommunity) {
      size *= 0.78;
      alpha *= 0.62;
    } else {
      size *= 0.72;
      alpha *= 0.42;
    }
  }

  if (context.communityReading) {
    const confidence = String(edge.confidence || "EXTRACTED").toUpperCase();
    if (confidence === "INFERRED") {
      alpha *= 0.78;
      size *= 0.88;
    } else if (confidence === "AMBIGUOUS") {
      alpha *= 0.62;
      size *= 0.78;
    } else if (confidence === "UNVERIFIED") {
      alpha *= 0.5;
      size *= 0.68;
    }
  }

  // Community reading edge emphasis (#135 + #136). Two orthogonal dimensions,
  // composed so the static structure is never quietly dropped by interaction:
  //
  // 1. STATIC structural layer (#135) — `communityMapLayer`, stable across
  //    hover/selection. skeleton (structure line) reads clearly, background
  //    recedes, related is baseline. This is the at-rest readability.
  // 2. INTERACTION (#136) — `relationFocusDepth` (hover/single-select: first is
  //    strongest, second is faint context, unrelated recedes) plus
  //    `selectedRelation` (Shift multi-select: real edges between selected
  //    nodes). Applied on top of the static layer, so a skeleton edge that is
  //    first-degree to a hover keeps its skeleton boost AND gains first-degree
  //    emphasis — it is never demoted below its rest state (the #135↔#136
  //    regression). Color still means relation type only (ADR-23); only weight
  //    (size) and presence (alpha) move. Global route opts into the interaction
  //    dimension for selected-node focus and lightweight hover previews, while
  //    the static structure layer remains community-reading scoped.
  const relationFocusActive = context.communityReading || context.relationFocusActive === true;
  if (context.communityReading) {
    const layer = edge.render?.communityMapLayer;
    if (layer === "skeleton") {
      size += 0.7;
      alpha = alpha * 1.18 + 0.04;
    } else if (layer === "background") {
      size *= 0.7;
      alpha *= 0.55;
    }
  }

  if (relationFocusActive) {
    const depth = edge.render?.relationFocusDepth ?? "none";
    if (depth === "first") {
      size += 0.9;
      alpha = alpha * 1.25 + 0.12;
    } else if (depth === "second") {
      size *= 0.85;
      alpha *= 0.5;
    } else if (depth === "unrelated") {
      size *= 0.55;
      alpha *= 0.14;
    }

    if (edge.render?.selectedRelation) {
      size += 0.8;
      alpha = alpha * 1.2 + 0.1;
    }
  }

  alpha = roundNumber(clamp(alpha, 0.05, 0.7), 3);
  size = roundNumber(clamp(size, 0.6, 4), 2);

  return {
    color: rgbaColor(sigmaGlobalEdgeRelationColor(relationClass, theme), alpha),
    size
  };
}

function sigmaSelectedCommunityPreviewBridgeEdge(edge: GraphRendererAdapterEdge): boolean {
  const layer = edge.render?.communityMapLayer;
  return edge.render?.skeleton === true || edge.render?.traceable === true || layer === "skeleton" || layer === "related";
}

export function sigmaGlobalEdgeRelationColor(relationClass: string, theme: ThemeId): string {
  const vars = getThemeTokens(theme).vars;
  if (relationClass === "relation-contrast") return vars["--amber"] ?? (theme === "mo-ye" ? "#e0b35e" : "#b7791f");
  if (relationClass === "relation-conflict") return theme === "mo-ye" ? "#f472b6" : "#d94693";
  if (theme === "mo-ye") return vars["--line"] ?? "#8e8778";
  return vars["--night"] ?? "#315f72";
}

export function rgbaColor(hexColor: string, alpha: number): string {
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

export function sigmaGlobalCommunityAttributes(
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

export function sigmaGlobalAggregationAttributes(
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

export function sigmaGlobalNodeSize(node: GraphRendererAdapterNode): number {
  if (node.pinHint.pinned || node.selected) return 10;
  if (node.searchHit) return 9;
  if (node.render.displayMode === "card") return 8;
  if (node.render.displayMode === "compact-card") return 7;
  if (node.render.displayMode === "overview") return 6;
  return 5;
}

export function sigmaGlobalNodeColor(
  node: GraphRendererAdapterNode,
  communityColorById: Map<string, string>,
  theme: ThemeId
): string {
  const vars = getThemeTokens(theme).vars;
  return node.communityId ? communityColorById.get(node.communityId) ?? vars["--muted"] : vars["--muted"];
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
