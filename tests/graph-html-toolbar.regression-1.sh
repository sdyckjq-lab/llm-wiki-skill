#!/bin/bash
# Regression: oriental atlas toolbar keeps readable graph controls

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

test_graph_html_has_readable_canvas_controls() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="fit-view"'
    assert_file_contains "$html" "回到全图"
    assert_file_contains "$html" 'id="toggle-dim"'
    assert_file_contains "$html" "弱化未选中"
    assert_file_contains "$html" 'class="state-dock"'

    rm -rf "$tmp_dir"
}

test_graph_html_has_toolbar_runtime_hooks() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" '@media (max-width: 900px) {'
    assert_file_contains "$html" '.canvas-toolbar,'
    assert_file_contains "$html" '.canvas-actions,'
    assert_file_contains "$tmp_dir/wiki/graph-wash.js" 'getElementById("fit-view")'
    assert_file_contains "$tmp_dir/wiki/graph-wash.js" 'getElementById("toggle-dim")'
    assert_file_contains "$tmp_dir/wiki/graph-wash.js" "function setupViewportInteractions()"
    assert_file_contains "$tmp_dir/wiki/graph-wash.js" "function fitVisibleViewport()"
    assert_file_contains "$tmp_dir/wiki/graph-wash-helpers.js" "function zoomAtlasViewport(viewport, factor, screenPoint, viewportSize, options)"
    assert_file_contains "$tmp_dir/wiki/graph-wash-helpers.js" "function atlasViewportRect(viewport, viewportSize)"

    node - <<'NODE' "$tmp_dir/wiki/graph-wash.js" || exit 1
const fs = require('fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const readingIndex = source.indexOf('if (app) app.dataset.reading = state.ui.selectedNodeId ? "1" : "0";');
const fitIndex = source.indexOf('if (opts.fitViewport || !state.viewportReady) fitVisibleViewport();');
if (readingIndex === -1) throw new Error('reading state sync is missing');
if (fitIndex === -1) throw new Error('viewport fit call is missing');
if (readingIndex > fitIndex) throw new Error('reading layout must settle before viewport fit');
NODE

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_readable_canvas_controls
    test_graph_html_has_toolbar_runtime_hooks
    echo "PASS: graph HTML toolbar label regression coverage"
}

main "$@"
