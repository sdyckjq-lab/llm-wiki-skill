#!/bin/bash
# Regression: graph a11y hooks should remain in generated HTML and JS

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

test_graph_html_has_reduced_motion_and_keyboard_markup() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" '@media (prefers-reduced-motion: reduce) {'
    assert_file_contains "$html" '<h4 tabindex="0" role="button" aria-expanded="true">相邻节点</h4>'
    assert_file_contains "$html" 'id="minimap-toggle"'
    assert_file_contains "$html" 'aria-label="折叠小地图" aria-expanded="true"'

    rm -rf "$tmp_dir"
}

test_graph_html_has_keyboard_toggle_runtime() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_contains "$output_dir/graph-wash.js" 'drawerNeighborsHeading.addEventListener("keydown", (e) => {'
    assert_file_contains "$output_dir/graph-wash.js" 'if (e.key === "Enter" || e.key === " ") {'
    assert_file_contains "$output_dir/graph-wash.js" 'drawerNeighborsHeading.setAttribute("aria-expanded", collapsed ? "false" : "true")'

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_reduced_motion_and_keyboard_markup
    test_graph_html_has_keyboard_toggle_runtime
    echo "PASS: graph HTML a11y regression coverage"
}

main "$@"
