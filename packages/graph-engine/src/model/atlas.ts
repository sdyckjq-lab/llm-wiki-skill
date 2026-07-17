import type {
  Community,
  GraphData,
  GraphEdge,
  GraphInsights,
  GraphLearning,
  GraphNode
} from "../types";
import { normalizeLearning } from "./legacy-helpers";

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
  const rawGraph = objectRecord(input);
  const rawNodes = Array.isArray(rawGraph.nodes) ? rawGraph.nodes : [];
  const nodes = rawNodes.map(projectNode);
  const rawEdges = Array.isArray(rawGraph.edges) ? rawGraph.edges : [];
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
  return {
    ...raw,
    id: raw.id == null ? `node-${index}` : compatibleString(raw.id, `node-${index}`)
  } as GraphNode;
}

function projectEdge(value: unknown, index: number): GraphEdge {
  const raw = objectRecord(value);
  const from = endpointId(raw.from != null ? raw.from : raw.source);
  const to = endpointId(raw.to != null ? raw.to : raw.target);
  return {
    ...raw,
    id: raw.id == null ? `edge-${index}` : compatibleString(raw.id, `edge-${index}`),
    from,
    to,
    type: compatibleString(raw.type ?? raw.confidence ?? raw.type_confidence, "UNVERIFIED")
  } as GraphEdge;
}

function projectLearning(value: unknown): GraphLearning {
  const normalized = normalizeLearning(value) as GraphLearning;
  const communities = Array.isArray(normalized.communities)
    ? normalized.communities.flatMap((community) => projectCommunity(community))
    : [];
  return {
    ...normalized,
    communities
  };
}

function projectCommunity(value: unknown): Community[] {
  const raw = objectRecord(value);
  if (raw.id == null) return [];
  return [{
    ...raw,
    id: compatibleString(raw.id, ""),
    label: compatibleString(raw.label, compatibleString(raw.id, "")),
    node_count: compatibleCount(raw.node_count, 0)
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
    ? value.filter((entry) => entry != null && typeof entry === "object").map((entry) => ({ ...objectRecord(entry) }))
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
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compatibleNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : compatibleString(value, "");
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
  return value != null && typeof value === "object" ? value as Record<string, unknown> : {};
}
