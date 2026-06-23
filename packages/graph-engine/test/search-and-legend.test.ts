import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCommunityLegend,
  buildRenderableGraph,
  resolveGraphSearchState,
  resolveNextGraphSearchFocus,
  resolvePreviousGraphSearchFocus
} from "../src/render";
import type { GraphNode } from "../src/types";

describe("graph scoped search", () => {
  it("matches nodes through the shared search helpers and marks non-matches faded", () => {
    const nodes = searchNodes();
    const state = resolveGraphSearchState(nodes, "attention");

    assert.equal(state.query, "attention");
    assert.deepEqual(state.matchIds, ["A"]);
    assert.deepEqual(
      state.nodes.map((node) => [node.id, node.searchState]),
      [["A", "match"], ["B", "faded"], ["C", "faded"]]
    );
  });

  it("treats an empty query as no matches and reuses a cached index", () => {
    const nodes = searchNodes();
    const first = resolveGraphSearchState(nodes, "source");
    const second = resolveGraphSearchState(nodes, "", first.searchIndex);

    assert.equal(second.searchIndex, first.searchIndex);
    assert.deepEqual(second.matchIds, []);
    assert.deepEqual(second.nodes.map((node) => node.searchState), ["none", "none", "none"]);
  });

  it("cycles focus through search matches and handles empty results", () => {
    assert.deepEqual(resolveNextGraphSearchFocus(["A", "B", "C"], null), { id: "A", index: 0 });
    assert.deepEqual(resolveNextGraphSearchFocus(["A", "B", "C"], "A"), { id: "B", index: 1 });
    assert.deepEqual(resolveNextGraphSearchFocus(["A", "B", "C"], "C"), { id: "A", index: 0 });
    assert.deepEqual(resolveNextGraphSearchFocus([], "A"), { id: null, index: -1 });
  });

  it("cycles search focus backward for keyboard result navigation", () => {
    assert.deepEqual(resolvePreviousGraphSearchFocus(["A", "B", "C"], null), { id: "C", index: 2 });
    assert.deepEqual(resolvePreviousGraphSearchFocus(["A", "B", "C"], "C"), { id: "B", index: 1 });
    assert.deepEqual(resolvePreviousGraphSearchFocus(["A", "B", "C"], "A"), { id: "C", index: 2 });
    assert.deepEqual(resolvePreviousGraphSearchFocus([], "A"), { id: null, index: -1 });
  });
});

describe("community legend", () => {
  it("builds visible legend rows with color, label, page count, and node ids", () => {
    const rows = buildCommunityLegend([
      {
        id: "c1",
        label: "核心主题",
        color: "#c33",
        nodeCount: 3,
        wash: { cx: 100, cy: 120, rx: 60, ry: 40, opacity: 0.11 }
      },
      {
        id: "empty",
        label: "空社区",
        color: "#999",
        nodeCount: 0,
        wash: null
      },
      {
        id: "hidden",
        label: "隐藏社区",
        color: "#555",
        nodeCount: 2,
        wash: null
      }
    ], [
      { id: "A", community: "c1" },
      { id: "B", community: "c1" },
      { id: "C", community: "c2" }
    ]);

    assert.deepEqual(rows, [{
      id: "c1",
      label: "核心主题",
      color: "#c33",
      pageCount: 3,
      nodeIds: ["A", "B"]
    }, {
      id: "hidden",
      label: "隐藏社区",
      color: "#555",
      pageCount: 2,
      nodeIds: []
    }]);
  });

  it("community selection highlights all nodes in that community", () => {
    const graph = buildRenderableGraph({
      meta: {
        build_date: "2026-06-13T00:00:00.000Z",
        wiki_title: "Legend",
        total_nodes: 3,
        total_edges: 1
      },
      nodes: [
        { id: "A", label: "A", type: "entity", community: "c1" },
        { id: "B", label: "B", type: "entity", community: "c1" },
        { id: "C", label: "C", type: "entity", community: "c2" }
      ],
      edges: [{ id: "AB", from: "A", to: "B", type: "EXTRACTED" }]
    }, { selection: { kind: "community", id: "c1" } });

    assert.deepEqual(
      graph.nodes.map((node) => [node.id, node.selected]),
      [["A", true], ["B", true], ["C", false]]
    );
  });
});

function searchNodes(): GraphNode[] {
  return [
    { id: "A", label: "Attention", type: "topic", content: "Transformer attention notes." },
    { id: "B", label: "Embeddings", type: "entity", content: "Vector source material." },
    { id: "C", label: "Retrieval", type: "source", content: "Indexing and recall." }
  ];
}
