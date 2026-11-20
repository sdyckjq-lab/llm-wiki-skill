#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

kb_root="$tmp_dir/portable wiki"
mkdir -p "$kb_root/wiki/topics" "$tmp_dir/home"
printf '# schema\n' > "$kb_root/.wiki-schema.md"
printf '# Foo\n' > "$kb_root/wiki/topics/foo.md"

for platform in codex claude; do
  target_dir="$tmp_dir/$platform skills/llm-wiki"

  HOME="$tmp_dir/home" \
    bash "$REPO_ROOT/install.sh" \
      --platform "$platform" \
      --target-dir "$target_dir" > /dev/null 2>&1 \
    || fail "$platform real install should succeed"

  output="$(
    node "$target_dir/scripts/wiki-link-cli.js" \
      rename-scan "$kb_root" "wiki/topics/foo.md" " leading" 2>&1
  )" || fail "$platform installed rename-scan should load its shared filename rule: $output"

  assert_text_contains "$output" '"target_path": "wiki/topics/ leading.md"'

  dry_run="$(
    HOME="$tmp_dir/home" \
      bash "$REPO_ROOT/install.sh" \
        --platform "$platform" \
        --target-dir "$target_dir" \
        --dry-run 2>&1
  )" || fail "$platform dry-run should succeed"

  assert_text_contains "$dry_run" "packages/workbench-contracts/src/graph-rename-filename.js"

  shared_rule="$target_dir/packages/workbench-contracts/src/graph-rename-filename.js"
  graph_engine_iife="$target_dir/packages/graph-engine/dist/engine.iife.js"
  [ -f "$shared_rule" ] || fail "$platform install should carry the shared filename rule"
  [ ! -e "$target_dir/packages/graph-engine/package.json" ] \
    || fail "$platform install must not carry the graph-engine package metadata"
  [ ! -e "$target_dir/packages/graph-engine/src" ] \
    || fail "$platform install must not carry graph-engine sources"
  [ ! -e "$target_dir/packages/graph-engine/dist/engine.esm.js" ] \
    || fail "$platform install must not carry the workbench ESM graph-engine bundle"
  [ ! -e "$target_dir/packages/workbench-contracts/package.json" ] \
    || fail "$platform install must not carry the workbench-contracts package"
  if [ -f "$REPO_ROOT/packages/graph-engine/dist/engine.iife.js" ]; then
    [ -f "$graph_engine_iife" ] || fail "$platform install should carry the built graph-engine IIFE bundle"
    cmp "$REPO_ROOT/packages/graph-engine/dist/engine.iife.js" "$graph_engine_iife" > /dev/null \
      || fail "$platform installed graph-engine IIFE should match its built source"
    [ "$(find "$target_dir/packages" -type f | wc -l | tr -d ' ')" = "2" ] \
      || fail "$platform install should carry only the two shared runtime files under packages"
  else
    [ ! -e "$target_dir/packages/graph-engine" ] \
      || fail "$platform install should not create graph-engine files when the IIFE bundle is absent"
    [ "$(find "$target_dir/packages" -type f | wc -l | tr -d ' ')" = "1" ] \
      || fail "$platform install should carry only the one shared runtime file under packages"
  fi
  cmp "$REPO_ROOT/packages/workbench-contracts/src/graph-rename-filename.js" "$shared_rule" > /dev/null \
    || fail "$platform installed shared filename rule should match its only source"

  printf 'stale\n' > "$shared_rule"
  HOME="$tmp_dir/home" \
    bash "$REPO_ROOT/install.sh" \
      --platform "$platform" \
      --target-dir "$target_dir" > /dev/null 2>&1 \
    || fail "$platform repeated install should refresh managed files"
  cmp "$REPO_ROOT/packages/workbench-contracts/src/graph-rename-filename.js" "$shared_rule" > /dev/null \
    || fail "$platform repeated install should replace a stale shared filename rule"
done

echo "PASS: installed wiki-link CLI loads the shared filename rule for Codex and Claude"
