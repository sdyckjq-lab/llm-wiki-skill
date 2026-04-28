#!/bin/bash
# Regression: oriental atlas design grammar hooks must survive HTML generation

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRAPH_HTML_BASIC="tests/fixtures/graph-interactive-basic"

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

build_graph_html_fixture() {
    local tmp_dir="$1"
    local output_dir="$tmp_dir/wiki"

    mkdir -p "$output_dir"
    cp "$REPO_ROOT/$GRAPH_HTML_BASIC/wiki/graph-data.json" "$output_dir/graph-data.json"

    bash "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on basic fixture"
}

test_oriental_design_contract_hooks() {
    local tmp_dir output_dir html js helpers
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"
    html="$output_dir/knowledge-graph.html"
    js="$output_dir/graph-wash.js"
    helpers="$output_dir/graph-wash-helpers.js"

    assert_file_contains "$html" 'data-visual-role="landmark"'
    assert_file_contains "$html" 'data-visual-role="index-slip"'
    assert_file_contains "$html" 'data-visual-role="cinnabar-note"'
    assert_file_contains "$html" '.node.is-preview-start'
    assert_file_contains "$html" '.start-card[data-preview-start="true"]'
    assert_file_contains "$html" '.drawer[data-state="start-preview"]'
    assert_file_contains "$html" '.queue-item__marker'
    assert_file_contains "$html" '.mini-map .mini-map-viewport'

    assert_file_contains "$js" "function getPreviewStartEntry"
    assert_file_contains "$js" "function nodeVisualRole(node, displayMode, previewNodeId)"
    assert_file_contains "$js" "dataset.visualRole"
    assert_file_contains "$js" "dataset.previewStart"
    assert_file_contains "$js" "drawer.dataset.state"
    assert_file_contains "$js" "从这里开始"
    assert_file_contains "$js" "focusNode(previewEntry.node.id, true)"

    assert_file_contains "$helpers" "importantNodeIds"
    assert_file_contains "$helpers" "startNodeIds"
    assert_file_contains "$helpers" "return null;"

    rm -rf "$tmp_dir"
}

test_first_open_selection_contract() {
    node - <<'NODE' "$REPO_ROOT" || fail "first-open selection contract should hold"
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  buildAtlasModel,
  deriveAtlasLayout,
  resolveAtlasVisibleSnapshot,
  resolveAtlasSelectedNodeId
} = require(path.join(process.argv[2], "templates/graph-styles/wash/graph-wash-helpers.js"));

const graph = {
  meta: { wiki_title: "首屏预览测试" },
  nodes: [
    { id: "start", label: "推荐起点", type: "topic", community: "main", confidence: "EXTRACTED", content: "# 推荐起点\n\n从这里开始。" },
    { id: "next", label: "相邻节点", type: "entity", community: "main", confidence: "EXTRACTED" }
  ],
  edges: [{ id: "edge", from: "start", to: "next", type: "EXTRACTED", weight: 0.9 }],
  learning: { entry: { recommended_start_node_id: "start" } }
};

const model = buildAtlasModel(graph);
const layout = deriveAtlasLayout(model);
const snapshot = resolveAtlasVisibleSnapshot(model, layout, {
  activeCommunityId: "all",
  focusMode: "all",
  query: "",
  selectedNodeId: null,
  filters: { EXTRACTED: true, INFERRED: true, AMBIGUOUS: true, UNVERIFIED: true }
});

assert.equal(snapshot.starts[0].node.id, "start");
assert.equal(snapshot.startNodeIds.start, true);
assert.equal(snapshot.importantNodeIds.start, true);
assert.equal(resolveAtlasSelectedNodeId(model, snapshot, null), null);
assert.equal(resolveAtlasSelectedNodeId(model, snapshot, "start"), "start");
NODE
}

main() {
    test_oriental_design_contract_hooks
    test_first_open_selection_contract
    echo "PASS: oriental design contract regression coverage"
}

main "$@"
