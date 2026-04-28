#!/bin/bash
# Regression: oriental atlas HTML must have responsive stacked layout

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

    bash "$REPO_ROOT/scripts/build-graph-html.sh" \
        "$tmp_dir" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on basic fixture"
}

test_graph_html_has_responsive_css() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" "@media (max-width: 900px)"
    assert_file_contains "$html" "body {"
    assert_file_contains "$html" "overflow: auto;"
    assert_file_contains "$html" "grid-template-columns: 1fr;"
    assert_file_contains "$html" "mobile-atlas-preview"
    assert_file_contains "$html" "button.chip {"
    assert_file_contains "$html" "min-height: 44px;"
    assert_file_contains "$html" ".app[data-reading=\"1\"]"

    rm -rf "$tmp_dir"
}

test_graph_html_has_stacked_persistent_drawer() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" ".drawer {"
    assert_file_contains "$html" "min-height: 560px;"
    assert_file_contains "$html" 'id="drawer"'
    assert_file_contains "$tmp_dir/wiki/graph-wash.js" "renderDrawer"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_responsive_css
    test_graph_html_has_stacked_persistent_drawer
    echo "PASS: graph HTML mobile regression coverage"
}

main "$@"
