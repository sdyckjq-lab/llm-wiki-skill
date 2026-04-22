#!/bin/bash
# Regression: graph build should fail clearly when node/helper path is broken

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRAPH_DATA_SAMPLE="$REPO_ROOT/tests/fixtures/graph-data-sample-wiki"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_text_contains() {
    local text="$1"
    local expected="$2"

    if ! printf '%s' "$text" | grep -F -- "$expected" > /dev/null; then
        fail "Expected output to contain: $expected"
    fi
}

test_graph_data_exits_without_node() {
    local tmp_dir fake_bin output
    tmp_dir="$(mktemp -d)"
    fake_bin="$tmp_dir/bin"
    mkdir -p "$fake_bin"

    ln -s /bin/bash "$fake_bin/bash"
    ln -s "$(command -v jq)" "$fake_bin/jq"

    if output="$(PATH="$fake_bin" bash "$REPO_ROOT/scripts/build-graph-data.sh" "$GRAPH_DATA_SAMPLE" 2>&1)"; then
        fail "build-graph-data.sh should fail when node is unavailable"
    fi

    assert_text_contains "$output" "node"
    assert_text_contains "$output" "图谱 2.0 构建需要 node"

    rm -rf "$tmp_dir"
}

test_graph_data_exits_when_helper_missing() {
    local tmp_dir repo_copy output
    tmp_dir="$(mktemp -d)"
    repo_copy="$tmp_dir/repo"

    cp -R "$REPO_ROOT" "$repo_copy"
    rm -rf "$repo_copy/.git"
    rm "$repo_copy/scripts/graph-analysis.js"

    if output="$(LLM_WIKI_TEST_MODE=1 bash "$repo_copy/scripts/build-graph-data.sh" "$repo_copy/tests/fixtures/graph-data-sample-wiki" 2>&1)"; then
        fail "build-graph-data.sh should fail when helper is missing"
    fi

    assert_text_contains "$output" "graph-analysis.js"
    assert_text_contains "$output" "图谱分析 helper"

    rm -rf "$tmp_dir"
}

test_graph_html_keeps_existing_html_when_helper_copy_fails() {
    local tmp_dir repo_copy output html_path
    tmp_dir="$(mktemp -d)"
    repo_copy="$tmp_dir/repo"

    cp -R "$REPO_ROOT" "$repo_copy"
    rm -rf "$repo_copy/.git"
    rm "$repo_copy/templates/graph-styles/wash/graph-wash-helpers.js"

    html_path="$repo_copy/tests/fixtures/graph-interactive-basic/wiki/knowledge-graph.html"
    printf 'stable old html\n' > "$html_path"

    if output="$(bash "$repo_copy/scripts/build-graph-html.sh" "$repo_copy/tests/fixtures/graph-interactive-basic" 2>&1)"; then
        fail "build-graph-html.sh should fail when helper asset is missing"
    fi

    assert_text_contains "$output" "graph-wash-helpers.js"
    assert_text_contains "$output" "找不到vendor"
    assert_text_contains "$(cat "$html_path")" "stable old html"

    rm -rf "$tmp_dir"
}

main() {
    test_graph_data_exits_without_node
    test_graph_data_exits_when_helper_missing
    test_graph_html_keeps_existing_html_when_helper_copy_fails
    echo "PASS: graph build failure regression coverage"
}

main "$@"
