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

    assert_file_contains "$output_dir/graph-wash.js" 'const labelSegmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });'
    assert_file_contains "$output_dir/graph-wash.js" 'const LABEL_CJK_WIDTH = 15;'
    assert_file_contains "$output_dir/graph-wash.js" 'const widthByLabel = measureLabelWidth(splitLabelGraphemes(label));'
    assert_file_contains "$output_dir/graph-wash.js" 'function truncateLabel(label, maxWidth) {'
    assert_file_contains "$output_dir/graph-wash.js" 'gg.append("title").text(label);'

    rm -rf "$tmp_dir"
}

test_graph_html_truncate_label_runtime_behavior() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    node - <<'NODE' "$output_dir/graph-wash.js" || exit 1
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');

function extractConst(name) {
  const pattern = new RegExp(`const ${name} = [^;]+;`);
  const match = source.match(pattern);
  if (!match) throw new Error(`missing const ${name}`);
  return match[0];
}

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`missing ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const context = { Intl, console };
vm.createContext(context);
vm.runInContext(`
${extractConst('labelSegmenter')}
${extractConst('LABEL_CJK_WIDTH')}
${extractConst('LABEL_LATIN_WIDTH')}
${extractConst('LABEL_PADDING')}
${extractConst('LABEL_MIN_WIDTH')}
${extractConst('LABEL_MAX_WIDTH')}
${extractConst('LABEL_ELLIPSIS')}
${extractConst('LABEL_ELLIPSIS_WIDTH')}
${extractFunction('splitLabelGraphemes')}
${extractFunction('labelCharWidth')}
${extractFunction('measureLabelWidth')}
${extractFunction('cardDims')}
${extractFunction('truncateLabel')}
this.cardDims = cardDims;
this.truncateLabel = truncateLabel;
`, context);

const invalid = context.truncateLabel('', 100);
if (invalid.text !== '' || invalid.truncated !== false) throw new Error('invalid input should return empty safe result');

const wide = context.cardDims({ id: '1', label: '超级超级超级超级超级超级长标签AlphaBeta', type: 'entity' });
if (wide.w > 180) throw new Error('cardDims should respect max width');
if (wide.w < 72) throw new Error('cardDims should respect min width');

const truncated = context.truncateLabel('节点A👨‍👩‍👧‍👦AlphaBeta超长标签', 120);
if (!truncated.truncated) throw new Error('expected long label to truncate');
if (!truncated.text.endsWith('…')) throw new Error('truncated label should end with ellipsis');
if (truncated.text.includes('undefined')) throw new Error('truncate output corrupted');
if (/\uD800(?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncated.text)) throw new Error('truncate should not emit unmatched surrogate halves');

const untouched = context.truncateLabel('短标签', 120);
if (untouched.truncated) throw new Error('short label should stay untouched');
if (untouched.text !== '短标签') throw new Error('short label text changed');
NODE

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_truncate_label_markup_hooks
    test_graph_html_truncate_label_runtime_behavior
    echo "PASS: graph HTML long label regression coverage"
}

main "$@"
