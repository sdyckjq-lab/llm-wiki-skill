import type {
  Community,
  GraphData,
  GraphEdge,
  GraphInsights,
  GraphLearning,
  GraphNode
} from "../types";

export {
  buildAtlasModel,
  deriveAtlasLayout,
  resolveAtlasVisibleSnapshot,
  resolveAtlasSelectedNodeId,
  getAtlasDensityMode,
  normalizeAtlasViewport,
  atlasNodePoint,
  getAtlasModelBounds,
  clampAtlasViewport,
  fitAtlasViewport,
  centerAtlasViewportOnPoint,
  zoomAtlasViewport,
  atlasViewportRect,
  atlasPointToMinimap,
  minimapPointToAtlasPoint,
  atlasViewportToMinimapRect
} from './legacy-helpers';

export interface RegularSearchNodeProjection {
  node: GraphNode;
  haystack: string;
}

export interface GraphInputProjection {
  data: GraphData;
  regularSearchByNode: RegularSearchNodeProjection[];
}

export function projectGraphInput(input: unknown): GraphInputProjection {
  try {
    return projectGraphInputUnchecked(input);
  } catch {
    return projectGraphInputUnchecked({});
  }
}

function projectGraphInputUnchecked(input: unknown): GraphInputProjection {
  const rawGraph = { ...objectRecord(input) };
  const rawNodes = arrayValues(rawGraph.nodes);
  const nodes = rawNodes.map(projectNode);
  const rawEdges = arrayValues(rawGraph.edges);
  const edges = rawEdges.map(projectEdge);
  const rawMeta = objectRecord(rawGraph.meta);
  const learning = rawGraph.learning == null ? undefined : projectLearning(rawGraph.learning);
  const insights = rawGraph.insights == null ? undefined : projectInsights(rawGraph.insights);
  const data = {
    ...rawGraph,
    meta: {
      ...rawMeta,
      build_date: compatibleString(rawMeta.build_date, ""),
      wiki_title: compatibleString(rawMeta.wiki_title, "知识库"),
      total_nodes: compatibleCount(rawMeta.total_nodes, nodes.length),
      total_edges: compatibleCount(rawMeta.total_edges, edges.length)
    },
    nodes,
    edges,
    ...(learning ? { learning } : {}),
    ...(insights ? { insights } : {})
  } as GraphData;

  return {
    data,
    regularSearchByNode: nodes.map((node, index) => ({
      node,
      haystack: regularSearchHaystack(objectRecord(rawNodes[index]), node.id)
    }))
  };
}

function projectNode(value: unknown, index: number): GraphNode {
  const raw = objectRecord(value);
  const node = {
    ...raw,
    id: raw.id == null ? `node-${index}` : compatibleString(raw.id, `node-${index}`)
  } as Record<string, unknown>;
  copyCompatibleStrings(node, raw, [
    "label",
    "type",
    "community",
    "source_path",
    "source",
    "path",
    "content",
    "summary",
    "date",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
    "source_title",
    "source_url",
    "url",
    "author",
    "source_name",
    "confidence",
    "type_confidence"
  ]);
  copyCompatibleNumbers(node, raw, ["x", "y", "weight", "score"]);
  return node as GraphNode;
}

function projectEdge(value: unknown, index: number): GraphEdge {
  const raw = objectRecord(value);
  const from = endpointId(raw.from != null ? raw.from : raw.source);
  const to = endpointId(raw.to != null ? raw.to : raw.target);
  const edge = {
    ...raw,
    id: raw.id == null ? `edge-${index}` : compatibleString(raw.id, `edge-${index}`),
    from,
    to,
    type: compatibleString(raw.type ?? raw.confidence ?? raw.type_confidence, "UNVERIFIED")
  } as Record<string, unknown>;
  copyCompatibleStrings(edge, raw, [
    "confidence",
    "type_confidence",
    "relation_type",
    "relationship_type",
    "relation"
  ]);
  copyCompatibleNumbers(edge, raw, ["weight"]);
  return edge as GraphEdge;
}

function projectLearning(value: unknown): GraphLearning {
  const raw = objectRecord(value);
  const entry = objectRecord(raw.entry);
  const views = objectRecord(raw.views);
  const pathView = objectRecord(views.path);
  const communityView = objectRecord(views.community);
  const globalView = objectRecord(views.global);
  const degraded = objectRecord(raw.degraded);
  const communities = Array.isArray(raw.communities)
    ? arrayValues(raw.communities).flatMap((community) => projectCommunity(community))
    : [];
  return {
    version: compatibleCount(raw.version, 1),
    entry: {
      recommended_start_node_id: compatibleNullableString(entry.recommended_start_node_id),
      recommended_start_reason: compatibleNullableString(entry.recommended_start_reason),
      default_mode: compatibleString(entry.default_mode, "global")
    },
    views: {
      path: {
        enabled: presentValue(pathView.enabled, false),
        start_node_id: compatibleNullableString(pathView.start_node_id),
        node_ids: compatibleStringArray(pathView.node_ids),
        degraded: presentValue(pathView.degraded, true)
      },
      community: {
        enabled: presentValue(communityView.enabled, false),
        community_id: compatibleNullableString(communityView.community_id),
        label: compatibleNullableString(communityView.label),
        node_ids: compatibleStringArray(communityView.node_ids),
        is_weak: presentValue(communityView.is_weak, false),
        degraded: presentValue(communityView.degraded, true)
      },
      global: {
        enabled: presentValue(globalView.enabled, true),
        node_ids: compatibleStringArray(globalView.node_ids),
        degraded: presentValue(globalView.degraded, false)
      }
    },
    communities,
    degraded: {
      path_to_community: presentValue(degraded.path_to_community, true),
      community_to_global: presentValue(degraded.community_to_global, true)
    }
  } as GraphLearning;
}

function projectCommunity(value: unknown): Community[] {
  const raw = objectRecord(value);
  if (raw.id == null) return [];
  return [{
    ...raw,
    id: compatibleString(raw.id, ""),
    label: compatibleString(raw.label, compatibleString(raw.id, "")),
    node_count: compatibleCount(raw.node_count, 0),
    source_count: compatibleCount(raw.source_count, 0),
    recommended_start_node_id: compatibleNullableString(raw.recommended_start_node_id)
  } as Community];
}

function projectInsights(value: unknown): GraphInsights {
  const raw = objectRecord(value);
  const meta = objectRecord(raw.meta);
  return {
    surprising_connections: objectEntries(raw.surprising_connections).map((item) => ({
      ...item,
      from: compatibleString(item.from, ""),
      to: compatibleString(item.to, ""),
      weight: compatibleNumber(item.weight, 0),
      from_community: nullableString(item.from_community),
      to_community: nullableString(item.to_community)
    })),
    isolated_nodes: objectEntries(raw.isolated_nodes).map((item) => ({
      ...item,
      id: compatibleString(item.id, ""),
      label: compatibleString(item.label, compatibleString(item.id, "")),
      degree: compatibleCount(item.degree, 0),
      community: nullableString(item.community)
    })),
    bridge_nodes: objectEntries(raw.bridge_nodes).map((item) => ({
      ...item,
      id: compatibleString(item.id, ""),
      label: compatibleString(item.label, compatibleString(item.id, "")),
      community: nullableString(item.community),
      connected_communities: Array.isArray(item.connected_communities)
        ? item.connected_communities.map((id) => compatibleString(id, ""))
        : [],
      community_count: compatibleCount(item.community_count, 0)
    })),
    sparse_communities: objectEntries(raw.sparse_communities).map((item) => ({
      ...item,
      id: compatibleString(item.id, ""),
      label: compatibleString(item.label, compatibleString(item.id, "")),
      node_count: compatibleCount(item.node_count, 0),
      density: compatibleNumber(item.density, 0),
      members: Array.isArray(item.members) ? item.members.map((id) => compatibleString(id, "")) : [],
      internal_edges: compatibleCount(item.internal_edges, 0)
    })),
    meta: {
      ...meta,
      degraded: meta.degraded === true,
      node_count: compatibleCount(meta.node_count, 0),
      edge_count: compatibleCount(meta.edge_count, 0),
      max_insight_nodes: compatibleCount(meta.max_insight_nodes, 0),
      max_insight_edges: compatibleCount(meta.max_insight_edges, 0)
    }
  };
}

function objectEntries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? arrayValues(value).filter((entry) => entry != null && typeof entry === "object").map((entry) => objectRecord(entry))
    : [];
}

function regularSearchHaystack(rawNode: Record<string, unknown>, fallbackId: string): string {
  const title = rawNode.label || fallbackId || "";
  const content = rawNode.content || "";
  return `${compatibleString(title, "")}\n${compatibleString(content, "").slice(0, 500)}`.toLowerCase();
}

function endpointId(value: unknown): string {
  const endpoint = objectRecord(value);
  if (endpoint.id != null) return compatibleString(endpoint.id, "");
  return value == null ? "" : compatibleString(value, "");
}

function compatibleCount(value: unknown, fallback: number): number {
  return finiteNumber(value, fallback);
}

function compatibleNumber(value: unknown, fallback: number): number {
  return finiteNumber(value, fallback);
}

function finiteNumber(value: unknown, fallback: number): number {
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  } catch {
    return fallback;
  }
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : compatibleString(value, "");
}

function compatibleNullableString(value: unknown): string | null {
  return value == null ? null : compatibleString(value, "") || null;
}

function compatibleStringArray(value: unknown): string[] {
  return arrayValues(value).map((item) => compatibleString(item, ""));
}

function presentValue<T>(value: unknown, fallback: T): T {
  return (value == null ? fallback : value) as T;
}

function compatibleString(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object") return {};
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  try {
    for (const key of Object.keys(value)) {
      try {
        output[key] = (value as Record<string, unknown>)[key];
      } catch {
        // A hostile field is omitted while the rest of the object remains usable.
      }
    }
  } catch {
    return {};
  }
  return output;
}

function arrayValues(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const output: unknown[] = [];
  try {
    for (let index = 0; index < value.length; index += 1) {
      try {
        output.push(value[index]);
      } catch {
        output.push(undefined);
      }
    }
  } catch {
    return [];
  }
  return output;
}

function copyCompatibleStrings(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): void {
  for (const key of keys) {
    if (source[key] != null) target[key] = compatibleString(source[key], "");
  }
}

function copyCompatibleNumbers(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): void {
  for (const key of keys) {
    if (source[key] != null) target[key] = compatibleNumericInput(source[key]);
  }
}

function compatibleNumericInput(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  try {
    return Number(value);
  } catch {
    return undefined;
  }
}
