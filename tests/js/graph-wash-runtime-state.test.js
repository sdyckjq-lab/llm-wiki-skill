const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resolveVisibleSnapshot } = require("../../templates/graph-styles/wash/graph-wash-helpers");

describe("resolveVisibleSnapshot", () => {
  const nodes = [
    { id: "n1", label: "机器学习基础", content: "监督学习与数据预处理", degree: 2 },
    { id: "n2", label: "深度学习", content: "神经网络与 Transformer", degree: 3 },
    { id: "n3", label: "Transformer", content: "语言模型核心架构", degree: 2 },
    { id: "n4", label: "数据清洗", content: "数据预处理的一部分", degree: 1 }
  ];

  const links = [
    { id: "e1", source: "n1", target: "n2", type: "EXTRACTED", weight: 0.95 },
    { id: "e2", source: "n2", target: "n3", type: "EXTRACTED", weight: 0.91 },
    { id: "e3", source: "n1", target: "n4", type: "INFERRED", weight: 0.55 }
  ];

  it("combines edge filtering, focus mode, and search query", () => {
    const snapshot = resolveVisibleSnapshot({
      nodes,
      links,
      baseNodeIds: ["n1", "n2", "n3", "n4"],
      filters: { EXTRACTED: true, INFERRED: false, AMBIGUOUS: false },
      focusMode: "high_confidence",
      searchQuery: "transformer",
      anchorNodeId: "n2",
      highConfidenceThreshold: 0.9
    });

    assert.deepEqual(snapshot.node_ids, ["n2", "n3"]);
    assert.deepEqual(snapshot.nodes.map((node) => node.id), ["n2", "n3"]);
    assert.deepEqual(snapshot.links.map((link) => link.id), ["e2"]);
    assert.deepEqual(snapshot.searchIndex.map((entry) => entry.node.id), ["n1", "n2", "n3"]);
  });

  it("keeps one-hop scope around the selected anchor", () => {
    const snapshot = resolveVisibleSnapshot({
      nodes,
      links,
      baseNodeIds: ["n1", "n2", "n3"],
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: false },
      focusMode: "one_hop",
      searchQuery: "",
      anchorNodeId: "n2"
    });

    assert.deepEqual(snapshot.node_ids, ["n1", "n2", "n3"]);
    assert.deepEqual(snapshot.links.map((link) => link.id), ["e1", "e2"]);
  });

  it("returns empty visible nodes when search has no matches", () => {
    const snapshot = resolveVisibleSnapshot({
      nodes,
      links,
      baseNodeIds: ["n1", "n2", "n3"],
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: false },
      focusMode: "all",
      searchQuery: "不存在",
      anchorNodeId: "n2"
    });

    assert.deepEqual(snapshot.node_ids, []);
    assert.deepEqual(snapshot.nodes, []);
    assert.deepEqual(snapshot.links, []);
    assert.equal(snapshot.searchIndex.length, 3);
  });
});
