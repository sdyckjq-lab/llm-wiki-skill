import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAtlasModel, projectGraphInput } from "../src/model/atlas";
import { buildGraphRendererAdapterData } from "../src/render/adapter";
import { resolveSelectionForCapabilities } from "../src/select";
import { summarizeGraphNode } from "../src/summary";

describe("runtime graph input projection", () => {
  it("turns unknown roots and non-array collections into an empty compatible graph", () => {
    for (const input of [
      undefined,
      null,
      false,
      17,
      "graph",
      {},
      { nodes: { id: "not-an-array" }, edges: "not-an-array" }
    ]) {
      const projection = projectGraphInput(input);

      assert.deepEqual(projection.data.nodes, []);
      assert.deepEqual(projection.data.edges, []);
      assert.deepEqual(projection.regularSearchByNode, []);
      assert.deepEqual(projection.data.meta, {
        build_date: "",
        wiki_title: "知识库",
        total_nodes: 0,
        total_edges: 0
      });
    }
  });

  it("keeps object order and legacy generated-ID collisions while making entries safe", () => {
    const projection = projectGraphInput({
      future_top_level_field: { preserved: true },
      meta: { wiki_title: "Malformed", future_meta_field: "kept" },
      nodes: [
        null,
        { label: "missing id", future_node_field: "kept" },
        "not-an-object",
        { id: "node-1", label: "real collision", type: "topic" }
      ],
      edges: [
        null,
        { source: { id: "node-0" }, target: "node-1", future_edge_field: "kept" }
      ],
      learning: {
        communities: [
          null,
          { id: "c1", label: "first" },
          { id: "c1", label: "second" },
          { label: "missing id" }
        ]
      }
    });

    assert.deepEqual(projection.data.nodes.map((node) => node.id), ["node-0", "node-1", "node-2", "node-1"]);
    assert.equal(projection.data.nodes[1]?.future_node_field, "kept");
    assert.deepEqual(projection.data.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })), [
      { id: "edge-0", from: "", to: "" },
      { id: "edge-1", from: "node-0", to: "node-1" }
    ]);
    assert.equal(projection.data.edges[1]?.future_edge_field, "kept");
    assert.deepEqual(projection.data.learning?.communities.map((community) => community.id), ["c1", "c1"]);
    assert.deepEqual((projection.data as Record<string, unknown>).future_top_level_field, { preserved: true });
    assert.equal((projection.data.meta as unknown as Record<string, unknown>).future_meta_field, "kept");

    const drawing = buildGraphRendererAdapterData(projection.data);
    assert.deepEqual(drawing.nodes.map((node) => node.id), ["node-0", "node-1", "node-2", "node-1"]);
    assert.deepEqual(drawing.edges.map((edge) => edge.id), ["edge-1"]);
  });

  it("keeps empty and community-free graphs deterministic", () => {
    const empty = projectGraphInput({ meta: {}, nodes: [], edges: [] });
    const communityFree = projectGraphInput({
      nodes: [{ id: "a", label: "A", type: "entity" }],
      edges: []
    });

    assert.deepEqual(buildAtlasModel(empty.data).nodes, []);
    assert.deepEqual(buildAtlasModel(communityFree.data).communities.map((community: { id: string }) => community.id), ["_none"]);
  });

  it("handles undefined, NaN, Infinity, and -Infinity without losing legacy ID results", () => {
    const projection = projectGraphInput({
      nodes: [
        { id: undefined, label: "missing", x: undefined, y: NaN, weight: Infinity },
        { id: NaN, label: "nan", x: NaN, y: Infinity, weight: -Infinity },
        { id: Infinity, label: "positive", x: Infinity, y: -Infinity, score: NaN },
        { id: -Infinity, label: "negative", x: -Infinity, y: undefined }
      ],
      edges: [
        { id: undefined, from: NaN, to: Infinity, weight: NaN },
        { id: Infinity, from: Infinity, to: -Infinity, weight: Infinity }
      ]
    });

    assert.deepEqual(projection.data.nodes.map((node) => node.id), ["node-0", "NaN", "Infinity", "-Infinity"]);
    assert.deepEqual(projection.data.edges.map((edge) => edge.id), ["edge-0", "Infinity"]);

    const model = buildAtlasModel(projection.data);
    assert.deepEqual(model.nodes.map((node: { id: string; x: number | null; y: number | null; weight: number }) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      weight: node.weight
    })), [
      { id: "node-0", x: null, y: null, weight: 50 },
      { id: "NaN", x: null, y: null, weight: 50 },
      { id: "Infinity", x: null, y: null, weight: 50 },
      { id: "-Infinity", x: null, y: null, weight: 50 }
    ]);
    assert.deepEqual(model.edges.map((edge: { id: string }) => edge.id), ["edge-0", "Infinity"]);
  });

  it("stays total when unknown numeric values reject conversion", () => {
    const rejectsConversion = {
      valueOf() {
        throw new Error("conversion rejected");
      },
      toString() {
        throw new Error("conversion rejected");
      }
    };

    const projection = projectGraphInput({
      meta: { total_nodes: Symbol("nodes"), total_edges: rejectsConversion },
      nodes: [{ id: "a", label: "A", type: "entity" }],
      edges: [],
      insights: {
        surprising_connections: [{ from: "a", to: "b", weight: Symbol("weight") }],
        sparse_communities: [{ id: "c1", density: rejectsConversion }]
      }
    });

    assert.equal(projection.data.meta.total_nodes, 1);
    assert.equal(projection.data.meta.total_edges, 0);
    assert.equal(projection.data.insights?.surprising_connections[0]?.weight, 0);
    assert.equal(projection.data.insights?.sparse_communities[0]?.density, 0);
  });

  it("returns an empty compatible graph when hostile accessors reject inspection", () => {
    const hostileInput = Object.defineProperty({}, "nodes", {
      enumerable: true,
      get() {
        throw new Error("nodes unavailable");
      }
    });

    const projection = projectGraphInput(hostileInput);

    assert.deepEqual(projection.data.nodes, []);
    assert.deepEqual(projection.data.edges, []);
    assert.deepEqual(projection.regularSearchByNode, []);
  });

  it("keeps an enumerable __proto__ field from becoming inherited graph data", () => {
    const inheritedId = Object.defineProperty({}, "id", {
      get() {
        throw new Error("inherited id must not be read");
      }
    });
    const rawNode = Object.create(null) as Record<string, unknown>;
    rawNode.__proto__ = inheritedId;
    rawNode.label = "Safe node";

    const projection = projectGraphInput({ nodes: [rawNode], edges: [] });

    assert.equal(projection.data.nodes.length, 1);
    assert.equal(projection.data.nodes[0]?.id, "node-0");
    assert.equal(Object.hasOwn(projection.data.nodes[0]!, "__proto__"), true);
    assert.equal(projection.regularSearchByNode[0]?.haystack, "safe node\n");
  });

  it("isolates hostile entry fields and keeps the compatible graph safe for every downstream consumer", () => {
    const rejectsConversion = {
      valueOf() {
        throw new Error("conversion rejected");
      },
      toString() {
        throw new Error("conversion rejected");
      }
    };
    const hostileNode = Object.defineProperty({ id: "hostile", community: "c1" }, "label", {
      enumerable: true,
      get() {
        throw new Error("label unavailable");
      }
    });
    const projection = projectGraphInput({
      nodes: [
        hostileNode,
        {
          id: "safe",
          label: rejectsConversion,
          type: rejectsConversion,
          community: rejectsConversion,
          source_path: rejectsConversion,
          content: rejectsConversion,
          summary: rejectsConversion,
          x: Symbol("x"),
          y: rejectsConversion,
          weight: Symbol("weight")
        }
      ],
      edges: [{
        id: "hostile-edge",
        from: "hostile",
        to: "safe",
        confidence: rejectsConversion,
        relation_type: rejectsConversion,
        weight: Symbol("weight")
      }]
    });

    assert.deepEqual(projection.data.nodes.map((node) => node.id), ["hostile", "safe"]);
    assert.doesNotThrow(() => buildAtlasModel(projection.data));
    assert.doesNotThrow(() => buildGraphRendererAdapterData(projection.data));
    assert.deepEqual(resolveSelectionForCapabilities(projection.data, { kind: "node", id: "safe" }, { canAsk: false }).nodeIds, ["safe"]);
    assert.equal(summarizeGraphNode(projection.data, "safe").kind, "node-summary");
  });
});
