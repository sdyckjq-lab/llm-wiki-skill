#!/bin/bash
# Regression: wash graph HTML should expose insights panel wiring and weighted neighbor cues

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

test_graph_html_has_insights_panel_shell() {
    local tmp_dir html js
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"
    js="$tmp_dir/wiki/graph-wash.js"

    assert_file_contains "$html" 'id="insights-panel"'
    assert_file_contains "$html" 'id="insights-body"'
    assert_file_contains "$html" 'id="panel-title"'
    assert_file_contains "$js" 'renderInsights()'
    assert_file_contains "$js" 'focusNode(nodeId, openDrawer)'
    assert_file_contains "$js" 'insight-item'

    rm -rf "$tmp_dir"
}

test_graph_html_has_weighted_edge_and_neighbor_hooks() {
    local tmp_dir js
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    js="$tmp_dir/wiki/graph-wash.js"

    assert_file_contains "$js" 'edgeStrokeWidth(edge)'
    assert_file_contains "$js" 'edgeOpacity(edge)'
    assert_file_contains "$js" 'nb-item__strength'
    assert_file_contains "$js" 'clampWeight(o.weight)'

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_insights_panel_shell
    test_graph_html_has_weighted_edge_and_neighbor_hooks
    echo "PASS: graph HTML insights regression coverage"
}

main "$@"
