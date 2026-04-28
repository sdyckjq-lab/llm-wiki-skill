const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveVisibleSnapshot,
  buildAtlasModel,
  deriveAtlasLayout,
  resolveAtlasVisibleSnapshot,
  resolveAtlasSelectedNodeId,
  getAtlasDensityMode,
  atlasNodePoint,
  getAtlasModelBounds,
  fitAtlasViewport,
  centerAtlasViewportOnPoint,
  zoomAtlasViewport,
  atlasViewportRect,
  atlasPointToMinimap,
  minimapPointToAtlasPoint,
  atlasViewportToMinimapRect
} = require("../../templates/graph-styles/wash/graph-wash-helpers");

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

  it("keeps an explicitly empty current range empty", () => {
    const snapshot = resolveVisibleSnapshot({
      nodes,
      links,
      baseNodeIds: [],
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: false },
      focusMode: "all",
      searchQuery: "机器"
    });

    assert.deepEqual(snapshot.node_ids, []);
    assert.deepEqual(snapshot.nodes, []);
    assert.deepEqual(snapshot.links, []);
    assert.deepEqual(snapshot.searchIndex, []);
  });
});

describe("atlas state contract", () => {
  const rawGraph = {
    meta: { wiki_title: "测试知识库", build_date: "2026-04-27" },
    nodes: [
      { id: "a", label: "知识编译", type: "topic", community: "method", confidence: "EXTRACTED", content: "# 知识编译\n\n整理一次，持续维护。" },
      { id: "b", label: "素材消化", type: "topic", community: "method", confidence: "INFERRED", source_path: "wiki/topics/b.md" },
      { id: "c", label: "网页文章", type: "source", community: "source", confidence: "AMBIGUOUS" }
    ],
    edges: [
      { id: "ab", from: "a", to: "b", type: "EXTRACTED", weight: 0.9 },
      { id: "ac", from: "a", to: "c", type: "INFERRED", weight: 0.6 }
    ],
    learning: {
      entry: { recommended_start_node_id: "a" },
      communities: [
        { id: "method", label: "方法论", node_count: 2, is_primary: true, recommended_start_node_id: "a" },
        { id: "source", label: "素材来源", node_count: 1, recommended_start_node_id: "c" }
      ]
    }
  };

  it("normalizes raw graph into one atlas model", () => {
    const model = buildAtlasModel(rawGraph);

    assert.equal(model.meta.wiki_title, "测试知识库");
    assert.equal(model.nodes.length, 3);
    assert.equal(model.edges.length, 2);
    assert.equal(model.byId.a.degree, 2);
    assert.equal(model.byId.a.summary, "整理一次，持续维护。");
    assert.deepEqual(model.communities.map((community) => community.label), ["方法论", "素材来源"]);
    assert.equal(model.starts[0].node.id, "a");
  });

  it("treats null atlas coordinates as missing layout input", () => {
    const model = buildAtlasModel({
      nodes: [
        { id: "nullish", label: "Nullish", x: null, y: null },
        { id: "origin", label: "Origin", x: 0, y: 0 }
      ],
      edges: []
    });
    deriveAtlasLayout(model);

    assert.notDeepEqual(
      { x: model.byId.nullish.x, y: model.byId.nullish.y },
      { x: 5, y: 8 }
    );
    assert.deepEqual(
      { x: model.byId.origin.x, y: model.byId.origin.y },
      { x: 5, y: 8 }
    );
  });

  it("uses one visible snapshot for filters, search, density, and starts", () => {
    const model = buildAtlasModel(rawGraph);
    const layout = deriveAtlasLayout(model);
    const snapshot = resolveAtlasVisibleSnapshot(model, layout, {
      activeCommunityId: "method",
      focusMode: "all",
      query: "素材",
      selectedNodeId: "a",
      filters: { EXTRACTED: true, INFERRED: true }
    });

    assert.deepEqual(snapshot.node_ids, ["b"]);
    assert.deepEqual(snapshot.nodes.map((node) => node.id), ["b"]);
    assert.deepEqual(snapshot.edges, []);
    assert.equal(snapshot.densityMode, "card");
    assert.equal(snapshot.starts[0].node.id, "b");
    assert.equal(snapshot.importantNodeIds.b, true);
    assert.equal(snapshot.counts.total_nodes, 3);
  });

  it("keeps recommended starts and high-priority nodes readable as atlas index slips", () => {
    const model = buildAtlasModel(rawGraph);
    const layout = deriveAtlasLayout(model);
    const snapshot = resolveAtlasVisibleSnapshot(model, layout, {
      activeCommunityId: "all",
      focusMode: "all",
      query: "",
      selectedNodeId: null,
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
    });

    assert.equal(snapshot.starts[0].node.id, "a");
    assert.equal(snapshot.startNodeIds.a, true);
    assert.equal(snapshot.importantNodeIds.a, true);
    assert.equal(snapshot.labelNodeIds.a, true);
  });

  it("preserves only explicit selections inside the current visible atlas range", () => {
    const model = buildAtlasModel(rawGraph);
    const layout = deriveAtlasLayout(model);
    const methodSnapshot = resolveAtlasVisibleSnapshot(model, layout, {
      activeCommunityId: "source",
      focusMode: "all",
      query: "",
      selectedNodeId: "a",
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
    });
    const emptySnapshot = resolveAtlasVisibleSnapshot(model, layout, {
      activeCommunityId: "source",
      focusMode: "all",
      query: "没有结果",
      selectedNodeId: "c",
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
    });

    assert.equal(resolveAtlasSelectedNodeId(model, methodSnapshot, "a"), null);
    assert.equal(resolveAtlasSelectedNodeId(model, methodSnapshot, "c"), "c");
    assert.equal(resolveAtlasSelectedNodeId(model, emptySnapshot, "c"), null);
  });

  it("does not auto-select a recommended start on first open", () => {
    const model = buildAtlasModel(rawGraph);
    const layout = deriveAtlasLayout(model);
    const snapshot = resolveAtlasVisibleSnapshot(model, layout, {
      activeCommunityId: "all",
      focusMode: "all",
      query: "",
      selectedNodeId: null,
      filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
    });

    assert.equal(snapshot.starts[0].node.id, "a");
    assert.equal(resolveAtlasSelectedNodeId(model, snapshot, null), null);
  });

  it("selects density mode by visible node budget", () => {
    assert.equal(getAtlasDensityMode(50), "card");
    assert.equal(getAtlasDensityMode(120), "compact-card");
    assert.equal(getAtlasDensityMode(300), "point-plus-focus");
    assert.equal(getAtlasDensityMode(800), "overview");
  });

  it("derives one model coordinate space for nodes and bounds", () => {
    const model = buildAtlasModel(rawGraph);
    deriveAtlasLayout(model);
    const point = atlasNodePoint(model.byId.a);
    const bounds = getAtlasModelBounds(model.nodes, 0);

    assert.equal(point.x, model.byId.a.x * 10);
    assert.equal(point.y, model.byId.a.y * 6.8);
    assert.ok(bounds.width > 0);
    assert.ok(bounds.height > 0);
    assert.ok(bounds.minX <= point.x && point.x <= bounds.maxX);
    assert.ok(bounds.minY <= point.y && point.y <= bounds.maxY);
  });

  it("fits, zooms, and reports the current viewport rectangle", () => {
    const viewportSize = { width: 1000, height: 680 };
    const bounds = { minX: 250, minY: 180, maxX: 750, maxY: 500, width: 500, height: 320 };
    const fitted = fitAtlasViewport(bounds, viewportSize, { padding: 0.8 });
    const zoomed = zoomAtlasViewport(fitted, 1.5, { x: 500, y: 340 }, viewportSize);
    const rect = atlasViewportRect(zoomed, viewportSize);

    assert.ok(fitted.scale > 1);
    assert.ok(zoomed.scale > fitted.scale);
    assert.ok(rect.width < 1000);
    assert.ok(rect.height < 680);
    assert.ok(rect.minX >= 0 && rect.maxX <= 1000);
    assert.ok(rect.minY >= 0 && rect.maxY <= 680);
  });

  it("centers viewport on model points and maps minimap clicks back to atlas coordinates", () => {
    const viewportSize = { width: 800, height: 500 };
    const point = { x: 250, y: 170 };
    const centered = centerAtlasViewportOnPoint(point, viewportSize, 1.4);
    const rect = atlasViewportRect(centered, viewportSize);
    const miniPoint = atlasPointToMinimap(point);
    const restored = minimapPointToAtlasPoint(miniPoint);
    const miniRect = atlasViewportToMinimapRect(centered, viewportSize);

    assert.ok(rect.minX <= point.x && point.x <= rect.maxX);
    assert.ok(rect.minY <= point.y && point.y <= rect.maxY);
    assert.deepEqual(restored, point);
    assert.ok(miniRect.width > 0);
    assert.ok(miniRect.height > 0);
  });
});
