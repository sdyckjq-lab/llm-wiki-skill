#!/bin/bash
# Regression: ISSUE-001 / ISSUE-002 — mobile opt-in must use a real narrow-screen mode
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

test_graph_html_mobile_mode_has_layout_and_focus_guards() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" ".layout.layout--mobile {"
    assert_file_contains "$html" "dom.layout.inert = show;"
    assert_file_contains "$html" "document.body.style.overflow = show ? \"hidden\" : \"\";"
    assert_file_contains "$html" "focusNode(params.nodes[0], { pulse: true, openDrawer: false });"
    assert_file_contains "$html" "if (dom.overlayMobile.getAttribute(\"data-show\") === \"1\") return;"

    rm -rf "$tmp_dir"
}

test_graph_html_mobile_mode_hides_desktop_drawer() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" ".layout.layout--mobile .drawer {"
    assert_file_contains "$html" ".layout.layout--mobile .footer__right {"
    assert_file_contains "$html" "setMobileCanvasMode(true);"

    rm -rf "$tmp_dir"
}

test_graph_html_mobile_mode_has_user_feedback_copy() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" "手机模式仅查看图谱轮廓；节点详情请在桌面浏览器打开"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_mobile_mode_has_layout_and_focus_guards
    test_graph_html_mobile_mode_hides_desktop_drawer
    test_graph_html_mobile_mode_has_user_feedback_copy
    echo "PASS: graph HTML mobile regression coverage"
}

main "$@"
