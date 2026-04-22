#!/bin/bash
# Regression: long card labels should truncate safely and expose full title text

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

test_graph_html_has_truncate_label_markup_hooks() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    assert_file_contains "$output_dir/graph-wash.js" 'gg.append("title").text(label);'

    # helpers file copied to output
    [ -f "$output_dir/graph-wash-helpers.js" ] || fail "helpers file should be copied to output"

    # helpers loads before wash in HTML
    local html="$output_dir/knowledge-graph.html"
    local helpers_line wash_line
    helpers_line=$(grep -n 'graph-wash-helpers.js' "$html" | head -1 | cut -d: -f1)
    wash_line=$(grep -n 'src="graph-wash.js"' "$html" | head -1 | cut -d: -f1)
    [ -n "$helpers_line" ] || fail "HTML should reference graph-wash-helpers.js"
    [ -n "$wash_line" ] || fail "HTML should reference graph-wash.js"
    [ "$helpers_line" -lt "$wash_line" ] || fail "helpers.js must load before wash.js in HTML"

    rm -rf "$tmp_dir"
}

test_graph_html_truncate_label_runtime_behavior() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    # Use extracted helpers module directly (no vm extraction)
    node - <<'NODE' "$output_dir/graph-wash-helpers.js" || exit 1
const path = require('path');
const helpers = require(path.resolve(process.argv[2]));

const { truncateLabel, cardDims } = helpers;

const wide = cardDims({ id: '1', label: '超级超级超级超级超级超级长标签AlphaBeta', type: 'entity' });
if (wide.w > 180) throw new Error('cardDims should respect max width');
if (wide.w < 72) throw new Error('cardDims should respect min width');

const truncated = truncateLabel('节点A👨‍👩‍👧‍👦AlphaBeta超长标签', 120);
if (!truncated.truncated) throw new Error('expected long label to truncate');
if (!truncated.text.endsWith('…')) throw new Error('truncated label should end with ellipsis');
if (truncated.text.includes('undefined')) throw new Error('truncate output corrupted');
if (/\uD800(?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncated.text)) throw new Error('truncate should not emit unmatched surrogate halves');
NODE

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_truncate_label_markup_hooks
    test_graph_html_truncate_label_runtime_behavior
    echo "PASS: graph HTML long label regression coverage"
}

main "$@"
