#!/bin/bash
# Regression: wash-style graph HTML must build locally and stay offline-friendly

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRAPH_HTML_BASIC="tests/fixtures/graph-interactive-basic"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file_exists() {
    local file="$1"

    [ -f "$file" ] || fail "Expected file to exist: $file"
}

assert_file_contains() {
    local file="$1"
    local text="$2"

    if ! grep -F -- "$text" "$file" > /dev/null; then
        fail "Expected $file to contain: $text"
    fi
}

assert_file_not_contains() {
    local file="$1"
    local text="$2"

    if grep -F -- "$text" "$file" > /dev/null; then
        fail "Expected $file to not contain: $text"
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

test_graph_html_wash_output_exists() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_exists "$output_dir/knowledge-graph.html"
    assert_file_exists "$output_dir/d3.min.js"
    assert_file_exists "$output_dir/rough.min.js"
    assert_file_exists "$output_dir/marked.min.js"
    assert_file_exists "$output_dir/purify.min.js"
    assert_file_exists "$output_dir/graph-wash.js"
    assert_file_exists "$output_dir/graph-wash-helpers.js"
    assert_file_exists "$output_dir/LICENSE-d3.txt"
    assert_file_exists "$output_dir/LICENSE-roughjs.txt"
    assert_file_exists "$output_dir/LICENSE-marked.txt"
    assert_file_exists "$output_dir/LICENSE-purify.txt"

    rm -rf "$tmp_dir"
}

test_graph_html_wash_uses_local_assets() {
    local tmp_dir output_dir html
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"
    html="$output_dir/knowledge-graph.html"

    assert_file_contains "$html" '<script id="graph-data" type="application/json">'
    assert_file_contains "$html" 'src="d3.min.js"'
    assert_file_contains "$html" 'src="rough.min.js"'
    assert_file_contains "$html" 'src="marked.min.js"'
    assert_file_contains "$html" 'src="purify.min.js"'
    assert_file_contains "$html" 'src="graph-wash.js"'
    assert_file_contains "$html" 'src="graph-wash-helpers.js"'

    local helpers_line wash_line
    helpers_line=$(grep -n 'graph-wash-helpers.js' "$html" | head -1 | cut -d: -f1)
    wash_line=$(grep -n 'src="graph-wash.js"' "$html" | head -1 | cut -d: -f1)
    [ -n "$helpers_line" ] || fail "HTML should reference graph-wash-helpers.js"
    [ -n "$wash_line" ] || fail "HTML should reference graph-wash.js"
    [ "$helpers_line" -lt "$wash_line" ] || fail "helpers.js must load before wash.js in HTML"

    assert_file_not_contains "$html" 'cdn.jsdelivr.net'
    assert_file_not_contains "$html" 'fonts.googleapis.com'
    assert_file_not_contains "$html" 'fonts.gstatic.com'
    assert_file_not_contains "$html" 'sample-data.js'
    assert_file_not_contains "$html" 'vis-network.min.js'

    rm -rf "$tmp_dir"
}

test_graph_html_wash_runtime_reads_injected_data_and_sanitizes_html() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_contains "$output_dir/graph-wash.js" 'const dataEl = document.getElementById("graph-data");'
    assert_file_contains "$output_dir/graph-wash.js" 'JSON.parse(dataEl.textContent)'
    assert_file_contains "$output_dir/graph-wash.js" 'window.SAMPLE_GRAPH'
    assert_file_contains "$output_dir/graph-wash.js" 'DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-target", "tabindex"] });'

    rm -rf "$tmp_dir"
}

test_graph_html_oriental_visual_contract() {
    local tmp_dir output_dir html
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"
    html="$output_dir/knowledge-graph.html"

    assert_file_contains "$html" "国风知识库·数字山水图"
    assert_file_contains "$html" "class=\"brand__github\""
    assert_file_contains "$html" "直接提取"
    assert_file_contains "$html" "推断关联"
    assert_file_contains "$html" "存在歧义"
    assert_file_contains "$html" "drawer-summary"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_wash_output_exists
    test_graph_html_wash_uses_local_assets
    test_graph_html_wash_runtime_reads_injected_data_and_sanitizes_html
    test_graph_html_oriental_visual_contract
    echo "PASS: graph HTML wash-only regression coverage"
}

main "$@"
