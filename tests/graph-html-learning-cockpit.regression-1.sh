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

test_learning_cockpit_html_removes_old_drawer_learning_sections() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    if grep -F -- 'id="dr-learning"' "$html" > /dev/null; then
        fail "Expected $html to remove dr-learning shell"
    fi
    if grep -F -- 'id="dr-what-body"' "$html" > /dev/null; then
        fail "Expected $html to remove dr-what-body"
    fi
    if grep -F -- 'id="dr-why-body"' "$html" > /dev/null; then
        fail "Expected $html to remove dr-why-body"
    fi
    if grep -F -- 'id="dr-next-body"' "$html" > /dev/null; then
        fail "Expected $html to remove dr-next-body"
    fi

    rm -rf "$tmp_dir"
}

test_learning_cockpit_html_has_nav_panel_shell() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="nav-panel"'
    assert_file_contains "$html" 'id="nav-communities"'
    assert_file_contains "$html" 'id="nav-all-communities"'
    assert_file_contains "$html" 'id="nav-focus"'
    assert_file_contains "$html" 'id="nav-search-shell"'
    assert_file_contains "$html" 'id="nav-queue"'
    assert_file_contains "$html" 'id="nav-start"'
    assert_file_contains "$html" 'id="nav-secondary-entry"'
    assert_file_contains "$html" 'id="nav-inline-hint"'
    assert_file_contains "$html" 'id="nav-toggle"'
    assert_file_contains "$html" 'id="nav-close"'

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
    assert_file_contains "$js" 'setNavCollapsed('
    assert_file_contains "$js" 'setSecondaryOpen('
    assert_file_contains "$js" 'getContextRecommendedStartNodeId('
    assert_file_contains "$js" '全局辅助起点'
    assert_file_contains "$js" 'applySubgraph()'
    assert_file_contains "$js" 'updateVisibleSnapshot()'
    assert_file_contains "$js" 'syncResponsiveUI()'
    assert_file_contains "$js" 'state.learning'
    assert_file_contains "$js" 'state.visible'

    if grep -F -- 'renderDrawerLearning(' "$js" > /dev/null; then
        fail "Expected $js to remove renderDrawerLearning hook"
    fi

    rm -rf "$tmp_dir"
}

test_learning_cockpit_preserves_existing_hooks() {
    local tmp_dir html js
    tmp_dir="$(mktemp -d)"
    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"
    js="$tmp_dir/wiki/graph-wash.js"

    assert_file_contains "$html" 'id="secondary-panel"'
    assert_file_contains "$html" 'id="secondary-toggle"'
    assert_file_contains "$html" 'id="insights-panel"'
    assert_file_contains "$html" 'id="insights-body"'
    assert_file_contains "$html" 'id="legend-panel"'
    assert_file_contains "$html" 'id="minimap"'
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
    test_learning_cockpit_html_removes_old_drawer_learning_sections
    test_learning_cockpit_html_has_nav_panel_shell
    test_learning_cockpit_js_has_runtime_hooks
    test_learning_cockpit_preserves_existing_hooks
    echo "PASS: learning cockpit HTML regression coverage"
}

main "$@"
