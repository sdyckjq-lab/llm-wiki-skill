import { applySearchToNodeIds, buildSearchIndex } from "../model/legacy-helpers";
import type { GraphNode, NodeId } from "../types";

export type GraphSearchNodeState = "none" | "match" | "faded";

export interface GraphSearchNodeView {
  id: NodeId;
  searchState: GraphSearchNodeState;
}

export interface GraphSearchState {
  query: string;
  matchIds: NodeId[];
  nodes: GraphSearchNodeView[];
  searchIndex: Array<{ node: GraphNode; haystack: string }>;
}

export interface GraphSearchFocus {
  id: NodeId | null;
  index: number;
}

export function resolveGraphSearchState(
  nodes: GraphNode[],
  query: string,
  cachedIndex?: Array<{ node: GraphNode; haystack: string }>
): GraphSearchState {
  const searchIndex = cachedIndex ?? buildSearchIndex(nodes);
  const normalizedQuery = query.trim();
  // 空查询表示“没有搜索”，命中集应为空（而非全部）。否则它作为“搜索命中集”
  // 被全局视图当成 searchHit，会让无搜索时所有节点被标成命中（橙色）。
  const matchIds = normalizedQuery ? applySearchToNodeIds(searchIndex, normalizedQuery) : [];
  const matches = new Set(matchIds);
  return {
    query: normalizedQuery,
    matchIds,
    nodes: nodes.map((node) => ({
      id: node.id,
      searchState: normalizedQuery ? (matches.has(node.id) ? "match" : "faded") : "none"
    })),
    searchIndex
  };
}

export function resolveNextGraphSearchFocus(matchIds: NodeId[], currentId: NodeId | null | undefined): GraphSearchFocus {
  if (!matchIds.length) return { id: null, index: -1 };
  const currentIndex = currentId ? matchIds.indexOf(currentId) : -1;
  const nextIndex = (currentIndex + 1) % matchIds.length;
  return { id: matchIds[nextIndex], index: nextIndex };
}

export function resolvePreviousGraphSearchFocus(matchIds: NodeId[], currentId: NodeId | null | undefined): GraphSearchFocus {
  if (!matchIds.length) return { id: null, index: -1 };
  const currentIndex = currentId ? matchIds.indexOf(currentId) : -1;
  const previousIndex = currentIndex <= 0 ? matchIds.length - 1 : currentIndex - 1;
  return { id: matchIds[previousIndex], index: previousIndex };
}
