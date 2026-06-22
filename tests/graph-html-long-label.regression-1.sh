#!/bin/bash
# Regression: long card labels should truncate safely and expose full title text

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/tests/lib/graph-html-engine-helpers.sh"

test_graph_html_has_truncate_label_markup_hooks() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" ".node-name"
    assert_file_contains "$html" "text-overflow: ellipsis;"
    assert_file_contains "$html" "white-space: nowrap;"
    grep -Eq "title=[a-z]+\.label" "$html" || fail "Expected $html to contain minified node title assignment (title=<var>.label)"
    assert_file_contains "$html" "node-kind"
    assert_file_contains "$html" "node-meta"
    assert_file_contains "$html" "display: none;"
    assert_file_contains "$html" ".node:hover .node-kind"
    assert_file_contains "$html" ".node:hover .node-meta"
    assert_file_contains "$html" "graph-hover-preview"
    assert_file_contains "$html" "graph-hover-preview-summary"
    assert_file_contains "$html" "-webkit-line-clamp: 3;"
    assert_file_contains "$html" "graph-reader-body pre"
    assert_file_contains "$html" "overflow-wrap: anywhere;"

    rm -rf "$tmp_dir"
}

test_default_nodes_hide_details_until_hover_or_selection() {
    local tmp_dir html playwright_node_path
    tmp_dir="$(mktemp -d)"

    npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
        || fail "graph-engine build should succeed before node slim browser regression"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"
    node - "$tmp_dir/wiki/graph-data.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const graph = JSON.parse(fs.readFileSync(file, "utf8"));
graph.nodes.push({
  id: "empty-preview",
  label: "空内容节点",
  type: "topic",
  community: "t1",
  content: "",
  source_path: "/fake/wiki/topics/empty-preview.md"
});
graph.meta.total_nodes = graph.nodes.length;
fs.writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`);
NODE
    bash "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on node preview fixture"
    playwright_node_path="$(
        npx --yes -p playwright -c 'node -e "const path=require(\"path\"); console.log(path.dirname(process.env.PATH.split(\":\")[0]))"'
    )"

    GRAPH_NODE_SLIM_HTML="$html" NODE_PATH="$playwright_node_path" node "$REPO_ROOT/tests/browser/graph-node-slim.mjs" \
        || fail "default node slim browser regression should pass"

    rm -rf "$tmp_dir"
}

test_label_truncation_helpers_are_carried_by_engine_bundle() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" "truncateLabel"
    assert_file_contains "$html" "splitLabelGraphemes"
    assert_file_contains "$html" "cardDims"

    rm -rf "$tmp_dir"
}

main() {
    npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
        || fail "graph-engine build should succeed before long-label regression"
    test_graph_html_has_truncate_label_markup_hooks
    test_label_truncation_helpers_are_carried_by_engine_bundle
    test_default_nodes_hide_details_until_hover_or_selection
    echo "PASS: graph HTML long-label regression coverage"
}

main "$@"
