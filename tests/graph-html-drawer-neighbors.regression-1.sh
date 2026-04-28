#!/bin/bash
# Regression: drawer neighbor section should support independent collapse and bounded height

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

test_graph_html_has_bounded_neighbor_region() {
    local tmp_dir html
    tmp_dir="$(mktemp -d)"

    build_graph_html_fixture "$tmp_dir"
    html="$tmp_dir/wiki/knowledge-graph.html"

    assert_file_contains "$html" '.drawer-body {'
    assert_file_contains "$html" 'min-height: 0;'
    assert_file_contains "$html" 'overflow-x: hidden;'
    assert_file_contains "$html" '.app[data-reading="1"]'
    assert_file_contains "$html" '.neighbor-section[open] .neighbor-list {'
    assert_file_contains "$html" 'max-height: 168px;'
    assert_file_contains "$html" 'overflow-y: auto;'
    assert_file_contains "$html" 'id="neighbor-details"'
    assert_file_contains "$html" 'id="neighbor-list"'
    assert_file_contains "$html" 'data-collapsed="1"'

    rm -rf "$tmp_dir"
}

test_graph_html_neighbor_toggle_runtime_guards_and_state() {
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

const persisted = [];
const context = {
  drawerNeighbors: null,
  drawerNeighborsHeading: null,
  safeLocalStorage: { set(key, value) { persisted.push([key, value]); } },
  queueStorageKey: (name) => `llm-wiki:test:${name}`,
  console
};
vm.createContext(context);
vm.runInContext(`${extractFunction('applyNeighborsCollapsed')}; ${extractFunction('toggleNeighbors')}; this.applyNeighborsCollapsed = applyNeighborsCollapsed; this.toggleNeighbors = toggleNeighbors;`, context);
context.applyNeighborsCollapsed(true);
context.toggleNeighbors();

context.drawerNeighbors = makeEl({ 'data-collapsed': '0' });
context.drawerNeighbors.open = true;
context.drawerNeighborsHeading = makeEl({ 'aria-expanded': 'true' });
context.applyNeighborsCollapsed(true);
if (context.drawerNeighbors.attrs['data-collapsed'] !== '1') throw new Error('neighbors collapsed state not updated');
if (context.drawerNeighborsHeading.attrs['aria-expanded'] !== 'false') throw new Error('neighbors aria-expanded not collapsed');
context.toggleNeighbors();
if (context.drawerNeighbors.attrs['data-collapsed'] !== '0') throw new Error('neighbors toggle did not expand');
if (context.drawerNeighborsHeading.attrs['aria-expanded'] !== 'true') throw new Error('neighbors aria-expanded not expanded');
if (!persisted.some(([key, value]) => key === 'llm-wiki:test:neighbors-collapsed' && value === '0')) throw new Error('neighbors state not persisted');
NODE

    rm -rf "$tmp_dir"
}

main() {
    test_graph_html_has_bounded_neighbor_region
    test_graph_html_neighbor_toggle_runtime_guards_and_state
    echo "PASS: graph HTML drawer neighbors regression coverage"
}

main "$@"
