const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultLearning,
  normalizeLearning,
  resolveInitialMode,
  getCommunityNodeIds,
  getVisibleNodeIds,
  getVisibleLinks,
  shouldAutoOpenDrawer
} = require("../../templates/graph-styles/wash/graph-wash-helpers");

describe("defaultLearning", () => {
  it("returns a stable empty learning structure", () => {
    const d = defaultLearning();
    assert.equal(d.version, 1);
    assert.equal(d.entry.default_mode, "global");
    assert.equal(d.entry.recommended_start_node_id, null);
    assert.equal(d.views.path.enabled, false);
    assert.equal(d.views.path.degraded, true);
    assert.equal(d.views.community.enabled, false);
    assert.equal(d.views.community.degraded, true);
    assert.equal(d.views.global.enabled, true);
    assert.equal(d.views.global.degraded, false);
    assert.deepEqual(d.communities, []);
    assert.equal(d.degraded.path_to_community, true);
    assert.equal(d.degraded.community_to_global, true);
  });
});

describe("normalizeLearning", () => {
  it("returns default when input is null", () => {
    const n = normalizeLearning(null);
    assert.equal(n.version, 1);
    assert.equal(n.entry.default_mode, "global");
  });

  it("returns default when input is undefined", () => {
    const n = normalizeLearning(undefined);
    assert.equal(n.version, 1);
  });

  it("preserves valid learning data", () => {
    const raw = {
      version: 1,
      entry: { recommended_start_node_id: "A", recommended_start_reason: "community_hub", default_mode: "path" },
      views: {
        path: { enabled: true, start_node_id: "A", node_ids: ["A", "B"], degraded: false },
        community: { enabled: true, community_id: "c1", label: "Community 1", node_ids: ["A", "B", "C"], is_weak: false, degraded: false },
        global: { enabled: true, node_ids: ["A", "B", "C"], degraded: false }
      },
      communities: [{ id: "c1", label: "Community 1", node_count: 3, source_count: 1, is_primary: true }],
      drawer: { section_order: ["what_this_is", "why_now", "next_steps", "raw_content", "neighbors"] },
      degraded: { path_to_community: false, community_to_global: false }
    };
    const n = normalizeLearning(raw);
    assert.equal(n.entry.recommended_start_node_id, "A");
    assert.deepEqual(n.views.path.node_ids, ["A", "B"]);
    assert.equal(n.communities.length, 1);
  });

  it("fills missing views with defaults", () => {
    const n = normalizeLearning({ version: 1 });
    assert.equal(n.views.path.enabled, false);
    assert.equal(n.views.community.enabled, false);
    assert.equal(n.views.global.enabled, true);
  });

  it("handles missing node_ids arrays", () => {
    const n = normalizeLearning({ views: { path: { enabled: true }, community: {}, global: {} } });
    assert.deepEqual(n.views.path.node_ids, []);
  });
});

describe("resolveInitialMode", () => {
  it("returns global when learning is null", () => {
    assert.equal(resolveInitialMode(null), "global");
  });

  it("returns path when path is not degraded", () => {
    const learning = { entry: { default_mode: "path" }, views: { path: { degraded: false }, community: { degraded: false } } };
    assert.equal(resolveInitialMode(learning), "path");
  });

  it("falls back to community when path is degraded", () => {
    const learning = { entry: { default_mode: "path" }, views: { path: { degraded: true }, community: { degraded: false } } };
    assert.equal(resolveInitialMode(learning), "community");
  });

  it("falls back to global when both path and community are degraded", () => {
    const learning = { entry: { default_mode: "path" }, views: { path: { degraded: true }, community: { degraded: true } } };
    assert.equal(resolveInitialMode(learning), "global");
  });

  it("returns global when default_mode is community but community is degraded", () => {
    const learning = { entry: { default_mode: "community" }, views: { path: { degraded: true }, community: { degraded: true } } };
    assert.equal(resolveInitialMode(learning), "global");
  });
});

describe("getCommunityNodeIds", () => {
  it("returns sorted node ids for a matching community", () => {
    const nodes = [
      { id: "B", community: "c2" },
      { id: "A", community: "c1" },
      { id: "C", community: "c1" },
      { id: "D", community: null }
    ];
    assert.deepEqual(getCommunityNodeIds(nodes, "c1"), ["A", "C"]);
  });

  it("returns empty array for missing community", () => {
    const nodes = [{ id: "A", community: "c1" }];
    assert.deepEqual(getCommunityNodeIds(nodes, "c9"), []);
  });

  it("returns empty array when community id is absent", () => {
    const nodes = [{ id: "A", community: "c1" }];
    assert.deepEqual(getCommunityNodeIds(nodes, null), []);
  });
});

describe("getVisibleNodeIds", () => {
  it("returns empty array when learning is null", () => {
    assert.deepEqual(getVisibleNodeIds(null, "path"), []);
  });

  it("returns node_ids for valid mode", () => {
    const learning = { views: { path: { enabled: true, node_ids: ["A", "B"] } } };
    assert.deepEqual(getVisibleNodeIds(learning, "path"), ["A", "B"]);
  });

  it("returns empty when view is disabled", () => {
    const learning = { views: { path: { enabled: false, node_ids: ["A"] } } };
    assert.deepEqual(getVisibleNodeIds(learning, "path"), []);
  });

  it("returns empty for global mode when view node_ids is empty", () => {
    const learning = { views: { global: { enabled: true, node_ids: [] } } };
    assert.deepEqual(getVisibleNodeIds(learning, "global"), []);
  });
});

describe("getVisibleLinks", () => {
  it("returns all links when visibleIds is empty", () => {
    const links = [{ source: "A", target: "B" }];
    assert.deepEqual(getVisibleLinks(links, []), links);
  });

  it("filters links to only those with both endpoints visible", () => {
    const links = [
      { source: { id: "A" }, target: { id: "B" } },
      { source: { id: "A" }, target: { id: "C" } },
      { source: { id: "B" }, target: { id: "C" } }
    ];
    const result = getVisibleLinks(links, ["A", "B"]);
    assert.equal(result.length, 1);
    assert.equal(result[0].source.id, "A");
    assert.equal(result[0].target.id, "B");
  });
});

describe("shouldAutoOpenDrawer", () => {
  it("returns true for path mode", () => {
    assert.equal(shouldAutoOpenDrawer("path"), true);
  });

  it("returns false for community mode", () => {
    assert.equal(shouldAutoOpenDrawer("community"), false);
  });

  it("returns false for global mode", () => {
    assert.equal(shouldAutoOpenDrawer("global"), false);
  });
});
