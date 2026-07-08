export type GraphRelationFocusDepth = "none" | "focus" | "first" | "second" | "unrelated";

export interface GraphRelationFocusNodeLike {
  id: string;
}

export interface GraphRelationFocusEdgeLike {
  id: string;
  source: string;
  target: string;
}

export interface ResolveGraphRelationFocusInput {
  activeNodeId: string | null;
  nodes: GraphRelationFocusNodeLike[];
  edges: GraphRelationFocusEdgeLike[];
}

export interface GraphRelationFocusState {
  activeNodeId: string | null;
  nodeDepthById: Map<string, GraphRelationFocusDepth>;
  edgeDepthById: Map<string, GraphRelationFocusDepth>;
  firstNodeIds: Set<string>;
  secondNodeIds: Set<string>;
  directEdgeIds: Set<string>;
}

export interface ResolveGraphFirstOrderRelationFocusInput {
  activeNodeId: string | null;
  hasNode: (id: string) => boolean;
  incidentEdgeIds: (nodeId: string) => Iterable<string>;
  edgeSource: (edgeId: string) => string;
  edgeTarget: (edgeId: string) => string;
}

export interface GraphFirstOrderRelationFocusTouched {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export interface GraphFirstOrderRelationFocusState {
  activeNodeId: string | null;
  nodeDepthById: Map<string, GraphRelationFocusDepth>;
  edgeDepthById: Map<string, GraphRelationFocusDepth>;
  touched: GraphFirstOrderRelationFocusTouched;
}

export function resolveGraphRelationFocus(input: ResolveGraphRelationFocusInput): GraphRelationFocusState {
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const activeNodeId = input.activeNodeId && nodeIds.has(input.activeNodeId) ? input.activeNodeId : null;
  const nodeDepthById = new Map<string, GraphRelationFocusDepth>();
  const edgeDepthById = new Map<string, GraphRelationFocusDepth>();
  const firstNodeIds = new Set<string>();
  const secondNodeIds = new Set<string>();
  const directEdgeIds = new Set<string>();

  if (!activeNodeId) {
    for (const node of input.nodes) nodeDepthById.set(node.id, "none");
    for (const edge of input.edges) edgeDepthById.set(edge.id, "none");
    return { activeNodeId: null, nodeDepthById, edgeDepthById, firstNodeIds, secondNodeIds, directEdgeIds };
  }

  for (const edge of input.edges) {
    if (edge.source === activeNodeId && nodeIds.has(edge.target)) {
      firstNodeIds.add(edge.target);
      directEdgeIds.add(edge.id);
    }
    if (edge.target === activeNodeId && nodeIds.has(edge.source)) {
      firstNodeIds.add(edge.source);
      directEdgeIds.add(edge.id);
    }
  }

  for (const edge of input.edges) {
    const sourceIsFirst = firstNodeIds.has(edge.source);
    const targetIsFirst = firstNodeIds.has(edge.target);
    if (sourceIsFirst && edge.target !== activeNodeId && !firstNodeIds.has(edge.target) && nodeIds.has(edge.target)) {
      secondNodeIds.add(edge.target);
    }
    if (targetIsFirst && edge.source !== activeNodeId && !firstNodeIds.has(edge.source) && nodeIds.has(edge.source)) {
      secondNodeIds.add(edge.source);
    }
  }

  secondNodeIds.delete(activeNodeId);
  for (const id of firstNodeIds) secondNodeIds.delete(id);

  for (const node of input.nodes) {
    if (node.id === activeNodeId) nodeDepthById.set(node.id, "focus");
    else if (firstNodeIds.has(node.id)) nodeDepthById.set(node.id, "first");
    else if (secondNodeIds.has(node.id)) nodeDepthById.set(node.id, "second");
    else nodeDepthById.set(node.id, "unrelated");
  }

  for (const edge of input.edges) {
    if (directEdgeIds.has(edge.id)) {
      edgeDepthById.set(edge.id, "first");
      continue;
    }
    const sourceDepth = nodeDepthById.get(edge.source);
    const targetDepth = nodeDepthById.get(edge.target);
    const hasFirstEndpoint = sourceDepth === "first" || targetDepth === "first";
    const hasSecondEndpoint = sourceDepth === "second" || targetDepth === "second";
    const bothEndpointsInContext =
      (sourceDepth === "first" || sourceDepth === "second") &&
      (targetDepth === "first" || targetDepth === "second");
    edgeDepthById.set(edge.id, hasFirstEndpoint && (hasSecondEndpoint || bothEndpointsInContext) ? "second" : "unrelated");
  }

  return { activeNodeId, nodeDepthById, edgeDepthById, firstNodeIds, secondNodeIds, directEdgeIds };
}

export function emptyGraphFirstOrderRelationFocusTouched(): GraphFirstOrderRelationFocusTouched {
  return { nodeIds: new Set(), edgeIds: new Set() };
}

export function resolveGraphFirstOrderRelationFocus(
  input: ResolveGraphFirstOrderRelationFocusInput
): GraphFirstOrderRelationFocusState {
  const nodeDepthById = new Map<string, GraphRelationFocusDepth>();
  const edgeDepthById = new Map<string, GraphRelationFocusDepth>();
  const activeNodeId = input.activeNodeId && input.hasNode(input.activeNodeId) ? input.activeNodeId : null;
  if (!activeNodeId) {
    return {
      activeNodeId: null,
      nodeDepthById,
      edgeDepthById,
      touched: emptyGraphFirstOrderRelationFocusTouched()
    };
  }

  nodeDepthById.set(activeNodeId, "focus");
  for (const edgeId of input.incidentEdgeIds(activeNodeId)) {
    edgeDepthById.set(edgeId, "first");
    const source = input.edgeSource(edgeId);
    const target = input.edgeTarget(edgeId);
    if (source !== activeNodeId && input.hasNode(source)) nodeDepthById.set(source, "first");
    if (target !== activeNodeId && input.hasNode(target)) nodeDepthById.set(target, "first");
  }

  return {
    activeNodeId,
    nodeDepthById,
    edgeDepthById,
    touched: {
      nodeIds: new Set(nodeDepthById.keys()),
      edgeIds: new Set(edgeDepthById.keys())
    }
  };
}

// Shift multi-select classifier (#136): emphasizes only REAL relations whose
// both endpoints are in the selected set. Unlike resolveGraphRelationFocus (a
// single active node fanning out to first/second degree), this never reaches
// beyond the selected set and never invents edges — it only filters input edges
// by endpoint membership, so user stories #32 / #52 (no fabricated selection
// links) hold by construction. Invalid selected ids are ignored automatically:
// they can never be a real edge endpoint, so they contribute nothing.
export interface ResolveGraphSelectedNodeRelationsInput {
  selectedNodeIds: string[];
  edges: GraphRelationFocusEdgeLike[];
}

export interface GraphSelectedNodeRelationsState {
  betweenSelectedEdgeIds: Set<string>;
}

export function resolveGraphSelectedNodeRelations(
  input: ResolveGraphSelectedNodeRelationsInput
): GraphSelectedNodeRelationsState {
  const selected = new Set(input.selectedNodeIds);
  const betweenSelectedEdgeIds = new Set<string>();
  for (const edge of input.edges) {
    if (selected.has(edge.source) && selected.has(edge.target)) {
      betweenSelectedEdgeIds.add(edge.id);
    }
  }
  return { betweenSelectedEdgeIds };
}
