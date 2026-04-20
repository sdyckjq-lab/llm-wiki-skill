#!/bin/bash
# Regression: three graph HTML styles must build locally and stay offline-friendly

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

test_graph_html_all_style_outputs_exist() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_exists "$output_dir/knowledge-graph.html"
    assert_file_exists "$output_dir/knowledge-graph-paper.html"
    assert_file_exists "$output_dir/knowledge-graph-wash.html"
    assert_file_exists "$output_dir/vis-network.min.js"
    assert_file_exists "$output_dir/d3.min.js"
    assert_file_exists "$output_dir/rough.min.js"
    assert_file_exists "$output_dir/marked.min.js"
    assert_file_exists "$output_dir/purify.min.js"
    assert_file_exists "$output_dir/graph-paper.js"
    assert_file_exists "$output_dir/graph-wash.js"
    assert_file_exists "$output_dir/LICENSE-vis-network.txt"
    assert_file_exists "$output_dir/LICENSE-d3.txt"
    assert_file_exists "$output_dir/LICENSE-roughjs.txt"
    assert_file_exists "$output_dir/LICENSE-marked.txt"
    assert_file_exists "$output_dir/LICENSE-purify.txt"

    rm -rf "$tmp_dir"
}

test_graph_html_hand_drawn_outputs_use_local_assets() {
    local tmp_dir output_dir paper_html wash_html
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"
    paper_html="$output_dir/knowledge-graph-paper.html"
    wash_html="$output_dir/knowledge-graph-wash.html"

    assert_file_contains "$paper_html" '<script id="graph-data" type="application/json">'
    assert_file_contains "$paper_html" 'src="d3.min.js"'
    assert_file_contains "$paper_html" 'src="rough.min.js"'
    assert_file_contains "$paper_html" 'src="marked.min.js"'
    assert_file_contains "$paper_html" 'src="purify.min.js"'
    assert_file_contains "$paper_html" 'src="graph-paper.js"'
    assert_file_not_contains "$paper_html" 'cdn.jsdelivr.net'
    assert_file_not_contains "$paper_html" 'sample-data.js'

    assert_file_contains "$wash_html" '<script id="graph-data" type="application/json">'
    assert_file_contains "$wash_html" 'src="d3.min.js"'
    assert_file_contains "$wash_html" 'src="rough.min.js"'
    assert_file_contains "$wash_html" 'src="marked.min.js"'
    assert_file_contains "$wash_html" 'src="purify.min.js"'
    assert_file_contains "$wash_html" 'src="graph-wash.js"'
    assert_file_not_contains "$wash_html" 'cdn.jsdelivr.net'
    assert_file_not_contains "$wash_html" 'sample-data.js'

    rm -rf "$tmp_dir"
}

test_graph_html_hand_drawn_runtime_reads_injected_data_and_sanitizes_html() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_contains "$output_dir/graph-paper.js" 'const dataEl = document.getElementById("graph-data");'
    assert_file_contains "$output_dir/graph-paper.js" 'const DATA = dataEl ? JSON.parse(dataEl.textContent) : window.SAMPLE_GRAPH;'
    assert_file_contains "$output_dir/graph-paper.js" 'DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-target", "tabindex"] });'

    assert_file_contains "$output_dir/graph-wash.js" 'const dataEl = document.getElementById("graph-data");'
    assert_file_contains "$output_dir/graph-wash.js" 'const DATA = dataEl ? JSON.parse(dataEl.textContent) : window.SAMPLE_GRAPH;'
    assert_file_contains "$output_dir/graph-wash.js" 'DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-target", "tabindex"] });'

    rm -rf "$tmp_dir"
}

test_graph_html_classic_output_keeps_vis_network() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'src="vis-network.min.js"'

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_all_style_outputs_exist
    test_graph_html_hand_drawn_outputs_use_local_assets
    test_graph_html_hand_drawn_runtime_reads_injected_data_and_sanitizes_html
    test_graph_html_classic_output_keeps_vis_network
    echo "PASS: graph HTML styles regression coverage"
}

main "$@"
