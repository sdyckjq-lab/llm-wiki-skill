import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveGraphRelationFocus, resolveGraphSelectedNodeRelations } from "../src/render/relation-focus";

describe("graph relation focus", () => {
  it("classifies focus, first-degree, second-degree, and unrelated nodes", () => {
    const focus = resolveGraphRelationFocus({
      activeNodeId: "A",
      nodes: [
        { id: "A" },
        { id: "B" },
        { id: "C" },
        { id: "D" },
        { id: "E" },
        { id: "F" }
      ],
      edges: [
        { id: "A-B", source: "A", target: "B" },
        { id: "A-C", source: "A", target: "C" },
        { id: "B-D", source: "B", target: "D" },
        { id: "C-E", source: "C", target: "E" },
        { id: "D-F", source: "D", target: "F" }
      ]
    });

    assert.equal(focus.activeNodeId, "A");
    assert.equal(focus.nodeDepthById.get("A"), "focus");
    assert.equal(focus.nodeDepthById.get("B"), "first");
    assert.equal(focus.nodeDepthById.get("C"), "first");
    assert.equal(focus.nodeDepthById.get("D"), "second");
    assert.equal(focus.nodeDepthById.get("E"), "second");
    assert.equal(focus.nodeDepthById.get("F"), "unrelated");
    assert.equal(focus.edgeDepthById.get("A-B"), "first");
    assert.equal(focus.edgeDepthById.get("A-C"), "first");
    assert.equal(focus.edgeDepthById.get("B-D"), "second");
    assert.equal(focus.edgeDepthById.get("C-E"), "second");
    assert.equal(focus.edgeDepthById.get("D-F"), "unrelated");
  });

  it("keeps first-neighbor cross links as faint second-degree context", () => {
    const focus = resolveGraphRelationFocus({
      activeNodeId: "A",
      nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
      edges: [
        { id: "A-B", source: "A", target: "B" },
        { id: "A-C", source: "A", target: "C" },
        { id: "B-C", source: "B", target: "C" }
      ]
    });

    assert.equal(focus.edgeDepthById.get("A-B"), "first");
    assert.equal(focus.edgeDepthById.get("A-C"), "first");
    assert.equal(focus.edgeDepthById.get("B-C"), "second");
  });

  it("handles an isolated active node without inventing relations", () => {
    const focus = resolveGraphRelationFocus({
      activeNodeId: "A",
      nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
      edges: []
    });

    assert.equal(focus.activeNodeId, "A");
    assert.equal(focus.nodeDepthById.get("A"), "focus");
    assert.equal(focus.nodeDepthById.get("B"), "unrelated");
    assert.equal(focus.nodeDepthById.get("C"), "unrelated");
    assert.deepEqual([...focus.edgeDepthById.values()], []);
  });

  it("returns none states when there is no active node or the node is missing", () => {
    const graph = {
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ id: "A-B", source: "A", target: "B" }]
    };

    const inactive = resolveGraphRelationFocus({ ...graph, activeNodeId: null });
    const missing = resolveGraphRelationFocus({ ...graph, activeNodeId: "missing" });

    assert.equal(inactive.activeNodeId, null);
    assert.deepEqual([...inactive.nodeDepthById.values()], ["none", "none"]);
    assert.deepEqual([...inactive.edgeDepthById.values()], ["none"]);
    assert.equal(missing.activeNodeId, null);
    assert.deepEqual([...missing.nodeDepthById.values()], ["none", "none"]);
    assert.deepEqual([...missing.edgeDepthById.values()], ["none"]);
  });

  it("treats a self-loop on the active node as a direct first-degree edge", () => {
    const focus = resolveGraphRelationFocus({
      activeNodeId: "A",
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ id: "A-A", source: "A", target: "A" }]
    });

    assert.equal(focus.activeNodeId, "A");
    assert.equal(focus.nodeDepthById.get("A"), "focus");
    assert.equal(focus.nodeDepthById.get("B"), "unrelated");
    assert.equal(focus.edgeDepthById.get("A-A"), "first");
  });

  it("treats parallel edges between the same pair as first-degree", () => {
    const focus = resolveGraphRelationFocus({
      activeNodeId: "A",
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [
        { id: "A-B-1", source: "A", target: "B" },
        { id: "B-A-2", source: "B", target: "A" }
      ]
    });

    assert.equal(focus.nodeDepthById.get("B"), "first");
    assert.equal(focus.edgeDepthById.get("A-B-1"), "first");
    assert.equal(focus.edgeDepthById.get("B-A-2"), "first");
  });
});

// #136 Shift multi-select: emphasize only real relations whose BOTH endpoints
// are in the selected set. No invented links, no single-endpoint fan-out.
describe("graph selected-node relations (Shift multi-select)", () => {
  const edges = [
    { id: "A-B", source: "A", target: "B" },
    { id: "B-C", source: "B", target: "C" },
    { id: "C-D", source: "C", target: "D" },
    { id: "D-E", source: "D", target: "E" }
  ];

  it("keeps only real edges whose both endpoints are selected", () => {
    const result = resolveGraphSelectedNodeRelations({
      selectedNodeIds: ["B", "C", "D"],
      edges
    });

    // B-C and C-D have both endpoints selected; A-B (A not selected) and D-E (E not) do not.
    assert.deepEqual([...result.betweenSelectedEdgeIds].sort(), ["B-C", "C-D"]);
  });

  it("ignores edges that touch only one selected node (no fan-out)", () => {
    const result = resolveGraphSelectedNodeRelations({
      selectedNodeIds: ["B", "D"],
      edges
    });

    // No edge directly connects B and D, so nothing is emphasized — even though
    // both are selected and each has its own first-degree neighbors.
    assert.deepEqual([...result.betweenSelectedEdgeIds], []);
  });

  it("never invents edges: output is always a subset of input edge ids", () => {
    const result = resolveGraphSelectedNodeRelations({
      selectedNodeIds: ["A", "B", "C", "D", "E"],
      edges
    });

    const inputIds = new Set(edges.map((edge) => edge.id));
    for (const id of result.betweenSelectedEdgeIds) {
      assert.ok(inputIds.has(id), `invented edge ${id} must not appear`);
    }
    assert.deepEqual([...result.betweenSelectedEdgeIds].sort(), ["A-B", "B-C", "C-D", "D-E"]);
  });

  it("returns no between-selected edges for a single selected node", () => {
    const result = resolveGraphSelectedNodeRelations({
      selectedNodeIds: ["B"],
      edges
    });

    assert.deepEqual([...result.betweenSelectedEdgeIds], []);
  });
});
