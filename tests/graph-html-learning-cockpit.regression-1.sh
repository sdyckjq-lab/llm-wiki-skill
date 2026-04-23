#!/bin/bash
# Regression: learning cockpit HTML shell and runtime hooks

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

test_learning_cockpit_html_has_mode_switch() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="mode-switch"'
    assert_file_contains "$html" 'data-mode="path"'
    assert_file_contains "$html" 'data-mode="community"'
    assert_file_contains "$html" 'data-mode="global"'
    assert_file_contains "$html" 'class="mode-btn"'

    rm -rf "$tmp_dir"
}

test_learning_cockpit_html_has_drawer_learning_sections() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="dr-learning"'
    assert_file_contains "$html" 'id="dr-what-body"'
    assert_file_contains "$html" 'id="dr-why-body"'
    assert_file_contains "$html" 'id="dr-next-body"'
    assert_file_contains "$html" 'drawer-learning__label'

    rm -rf "$tmp_dir"
}

test_learning_cockpit_html_has_nav_panel_shell() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="nav-panel"'
    assert_file_contains "$html" 'id="nav-communities"'
    assert_file_contains "$html" 'id="nav-start"'
    assert_file_contains "$html" 'id="nav-inline-hint"'
    assert_file_contains "$html" 'id="nav-toggle"'
    assert_file_contains "$html" 'id="panel-title"'
    assert_file_contains "$html" 'id="insights-body"'

    rm -rf "$tmp_dir"
}

test_learning_cockpit_js_has_runtime_hooks() {
    local tmp_dir js
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    js="$tmp_dir/wiki/graph-wash.js"

    assert_file_contains "$js" 'bootstrapLearningEntry()'
    assert_file_contains "$js" 'setLearningMode('
    assert_file_contains "$js" 'renderNavPanel()'
    assert_file_contains "$js" 'setActiveCommunity('
    assert_file_contains "$js" 'updateInsightsTitle()'
    assert_file_contains "$js" 'renderDrawerLearning('
    assert_file_contains "$js" 'applySubgraph()'
    assert_file_contains "$js" 'updateVisibleSnapshot()'
    assert_file_contains "$js" 'state.learning'
    assert_file_contains "$js" 'state.visible'

    rm -rf "$tmp_dir"
}

test_learning_cockpit_preserves_existing_hooks() {
    local tmp_dir html js
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"
    js="$tmp_dir/wiki/graph-wash.js"

    assert_file_contains "$html" 'id="insights-panel"'
    assert_file_contains "$html" 'id="insights-body"'
    assert_file_contains "$js" 'renderInsights()'
    assert_file_contains "$js" 'focusNode(nodeId, openDrawer)'

    assert_file_contains "$html" 'id="dr-close"'
    assert_file_contains "$html" 'id="dr-body"'
    assert_file_contains "$html" 'id="dr-title"'
    assert_file_contains "$html" 'id="dr-kicker"'
    assert_file_contains "$html" 'id="nb-list"'

    rm -rf "$tmp_dir"
}

main() {
    test_learning_cockpit_html_has_mode_switch
    test_learning_cockpit_html_has_drawer_learning_sections
    test_learning_cockpit_html_has_nav_panel_shell
    test_learning_cockpit_js_has_runtime_hooks
    test_learning_cockpit_preserves_existing_hooks
    echo "PASS: learning cockpit HTML regression coverage"
}

main "$@"
