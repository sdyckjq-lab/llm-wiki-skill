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
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function currentDensityMode()"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function nodeCollisionRadius(node)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "function nodeBoundsRadius(node)"
    assert_file_contains "$REPO_ROOT/templates/graph-styles/wash/graph-wash.js" "const idx = state.visible.ready ? state.visible.searchIndex : state.searchIndex;"
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
    assert_file_contains "$output_dir/graph-wash.js" "data-density-mode"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_runtime_has_density_rules
    test_graph_html_builds_large_density_fixture
    echo "PASS: graph HTML density regression coverage"
}

main "$@"
