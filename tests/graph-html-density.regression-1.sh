#!/bin/bash
# Regression: oriental graph runtime must include density controls for larger real graphs

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file_contains() {
    local file="$1"
    local text="$2"

    if ! grep -F -- "$text" "$file" > /dev/null; then
        fail "Expected $file to contain: $text"
    fi
}

write_density_fixture() {
    local output="$1"
    local count="$2"

    node - <<'NODE' "$output" "$count"
const fs = require("fs");
const output = process.argv[2];
const count = Number(process.argv[3]);
const nodes = Array.from({ length: count }, (_, index) => {
  const type = index % 8 === 0 ? "source" : index % 3 === 0 ? "topic" : "entity";
  const community = String(index % 6);
  return {
    id: `node-${index}`,
    label: `Density Node ${index}`,
    type,
    community,
    confidence: "EXTRACTED",
    content: `# Density Node ${index}\n\n这是第 ${index} 个密度测试节点，用来验证大量节点时不会全部铺成大卡片。\n\n关联到 [[node-${Math.max(0, index - 1)}|前一个节点]]。`
  };
});
const edges = [];
for (let index = 1; index < count; index++) {
  edges.push({
    id: `edge-${index}`,
    from: `node-${index - 1}`,
    to: `node-${index}`,
    type: index % 5 === 0 ? "INFERRED" : "EXTRACTED",
    weight: index % 5 === 0 ? 0.6 : 0.9
  });
}
const communities = Array.from({ length: 6 }, (_, index) => ({
  id: String(index),
  label: `社区 ${index}`,
  node_count: nodes.filter((node) => node.community === String(index)).length,
  source_count: 1,
  is_primary: index === 0,
  recommended_start_node_id: `node-${index}`
}));
const graph = {
  meta: {
    wiki_title: "密度测试知识库",
    build_date: "2026-04-27",
    total_nodes: nodes.length,
    total_edges: edges.length
  },
  nodes,
  edges,
  learning: {
    entry: { recommended_start_node_id: "node-0" },
    views: {
      path: { enabled: true, degraded: false, node_ids: ["node-0", "node-1", "node-2"] },
      community: { enabled: true, degraded: false, node_ids: communities[0].node_count ? nodes.filter((node) => node.community === "0").map((node) => node.id) : [] },
      global: { enabled: true, degraded: false, node_ids: nodes.map((node) => node.id) }
    },
    communities
  },
  insights: {
    surprising_connections: [],
    isolated_nodes: [],
    bridge_nodes: [],
    sparse_communities: [],
    meta: { degraded: false }
  }
};
fs.writeFileSync(output, JSON.stringify(graph, null, 2));
NODE
}

test_graph_runtime_has_density_rules() {
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "const DENSITY_SMALL_LIMIT = 80;"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "const DENSITY_MEDIUM_LIMIT = 200;"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "const DENSITY_LARGE_LIMIT = 500;"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function currentDensityMode()"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function nodeDisplayMode(node, previewNodeId)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function nodeVisualRole(node, displayMode, previewNodeId)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "dataset.densityMode"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "dataset.visualRole"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash-helpers.js" "function getAtlasDensityMode(count)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash-helpers.js" "function atlasLabelBudget(mode, count)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash-helpers.js" "function atlasEdgeBudget(mode, count)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/header.html" 'data-visual-role="landmark"'
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/header.html" 'data-visual-role="index-slip"'
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/header.html" 'data-visual-role="cinnabar-note"'
}

test_graph_html_builds_large_density_fixture() {
    local tmp_dir output_dir html
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"
    mkdir -p "$output_dir"

    write_density_fixture "$output_dir/graph-data.json" 200
    bash "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on 200-node density fixture"

    html="$output_dir/knowledge-graph.html"
    assert_file_contains "$html" "密度测试知识库"
    assert_file_contains "$html" "Density Node 199"
    assert_file_contains "$output_dir/graph-wash.js" "point-plus-focus"
    assert_file_contains "$output_dir/graph-wash.js" "overview"

    rm -rf "$tmp_dir"
}

test_graph_density_thresholds_and_budgets() {
    node - <<'NODE' "$REPO_ROOT" || fail "density thresholds and budgets should hold"
const assert = require("node:assert/strict");
const path = require("node:path");
const repoRoot = process.argv[2];
const {
  buildAtlasModel,
  deriveAtlasLayout,
  resolveAtlasVisibleSnapshot
} = require(path.join(repoRoot, "templates/graph-styles/wash/graph-wash-helpers.js"));

function makeGraph(count, edgeCount) {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: `node-${index}`,
    label: `Density Node ${index}`,
    type: index % 8 === 0 ? "source" : index % 3 === 0 ? "topic" : "entity",
    community: String(index % 6),
    confidence: "EXTRACTED",
    content: `# Density Node ${index}\n\n节点 ${index}。`
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge-${index}`,
    from: `node-${index % count}`,
    to: `node-${(index * 7 + 1) % count}`,
    type: index % 5 === 0 ? "INFERRED" : "EXTRACTED",
    weight: index % 9 === 0 ? 0.4 : 0.9
  })).filter((edge) => edge.from !== edge.to);
  return {
    meta: { wiki_title: "密度预算测试" },
    nodes,
    edges,
    learning: { entry: { recommended_start_node_id: "node-0" } }
  };
}

function snapshotFor(count, edgeCount, selectedNodeId) {
  const model = buildAtlasModel(makeGraph(count, edgeCount));
  const layout = deriveAtlasLayout(model);
  return resolveAtlasVisibleSnapshot(model, layout, {
    activeCommunityId: "all",
    focusMode: "all",
    query: "",
    selectedNodeId,
    filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
  });
}

const pointSnapshot = snapshotFor(201, 900, "node-200");
assert.equal(pointSnapshot.densityMode, "point-plus-focus");
assert.ok(Object.keys(pointSnapshot.labelNodeIds).length <= 61, "201-node mode should cap labels while allowing the selected node");
assert.ok(pointSnapshot.labelNodeIds["node-200"], "selected node should stay readable in point mode");
assert.ok(pointSnapshot.importantNodeIds["node-0"], "recommended starts should remain important in point mode");
assert.ok(pointSnapshot.edges.length <= 800, "point mode should cap edges at 800");

const overviewSnapshot = snapshotFor(501, 1500, "node-500");
assert.equal(overviewSnapshot.densityMode, "overview");
assert.ok(Object.keys(overviewSnapshot.labelNodeIds).length <= 41, "501-node mode should cap labels while allowing the selected node");
assert.ok(overviewSnapshot.labelNodeIds["node-500"], "selected node should stay readable in overview mode");
assert.ok(overviewSnapshot.importantNodeIds["node-0"], "recommended starts should remain important in overview mode");
assert.ok(overviewSnapshot.edges.length <= 1000, "overview mode should cap edges at 1000");
NODE
}

main() {
    test_graph_runtime_has_density_rules
    test_graph_html_builds_large_density_fixture
    test_graph_density_thresholds_and_budgets
    [ -f "$REPO_ROOT/tests/fixtures/graph-interactive-dense/wiki/graph-data.json" ] || fail "dense fixture should exist"
    echo "PASS: graph HTML density regression coverage"
}

main "$@"
