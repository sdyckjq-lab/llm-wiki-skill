#!/bin/bash
# Regression: ISSUE-003 — drawer wikilinks must keep search state in sync
# Found by /qa on 2026-04-18
# Report: .gstack/qa-reports/qa-report-localhost-2026-04-18.md

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
        "$tmp_dir" \
        "$output_dir/knowledge-graph.html" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on basic fixture"
}

test_graph_html_syncs_search_when_drawer_link_is_clicked() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" "syncSearchWithNode(targetId);"
    assert_file_contains "$html" "function syncSearchWithNode(nodeId) {"
    assert_file_contains "$html" "dom.search.value = n.label || n.id;"
    assert_file_contains "$html" "dom.searchDropdown.setAttribute(\"data-open\", \"0\");"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_syncs_search_when_drawer_link_is_clicked
    echo "PASS: graph HTML search sync regression coverage"
}

main "$@"
