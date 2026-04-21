#!/bin/bash
# Regression: minimap should be collapsible and expose accessible state

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

test_graph_html_has_minimap_toggle_markup() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" 'id="minimap"'
    assert_file_contains "$html" 'data-collapsed="0"'
    assert_file_contains "$html" 'id="minimap-toggle"'
    assert_file_contains "$html" 'aria-label="折叠小地图"'
    assert_file_contains "$html" 'aria-expanded="true"'

    rm -rf "$tmp_dir"
}

test_graph_html_minimap_runtime_guards_and_state() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    output_dir="$tmp_dir/wiki"

    build_graph_html_fixture "$tmp_dir"

    node - <<'NODE' "$output_dir/graph-wash.js" || exit 1
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');

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

function makeEl(initial = {}) {
  return {
    attrs: { ...initial },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; }
  };
}

const context = {
  minimapEl: null,
  minimapToggle: null,
  console
};
vm.createContext(context);
vm.runInContext(`${extractFunction('applyMinimapCollapsed')}; this.applyMinimapCollapsed = applyMinimapCollapsed;`, context);
context.applyMinimapCollapsed(true);

context.minimapEl = makeEl({ 'data-collapsed': '0' });
context.minimapToggle = makeEl({ 'aria-expanded': 'true', 'aria-label': '折叠小地图' });
context.applyMinimapCollapsed(true);
if (context.minimapEl.attrs['data-collapsed'] !== '1') throw new Error('minimap collapsed state not updated');
if (context.minimapToggle.attrs['aria-expanded'] !== 'false') throw new Error('minimap aria-expanded not collapsed');
if (context.minimapToggle.attrs['aria-label'] !== '展开小地图') throw new Error('minimap aria-label not collapsed');
context.applyMinimapCollapsed(false);
if (context.minimapEl.attrs['data-collapsed'] !== '0') throw new Error('minimap expanded state not updated');
if (context.minimapToggle.attrs['aria-expanded'] !== 'true') throw new Error('minimap aria-expanded not expanded');
if (context.minimapToggle.attrs['aria-label'] !== '折叠小地图') throw new Error('minimap aria-label not expanded');
NODE

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_minimap_toggle_markup
    test_graph_html_minimap_runtime_guards_and_state
    echo "PASS: graph HTML minimap regression coverage"
}

main "$@"
