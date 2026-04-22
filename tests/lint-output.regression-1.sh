#!/bin/bash
# lint-output.regression-1.sh — 验证 lint 输出结构（排除时间和路径）
set -eu

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$SKILL_DIR/tests/fixtures/lint-sample-wiki"
EXPECTED="$SKILL_DIR/tests/expected/lint-output.txt"

if [ ! -f "$EXPECTED" ]; then
  echo "FAIL: expected output not found: $EXPECTED"
  exit 1
fi

# 运行 lint，捕获输出
ACTUAL=$(bash "$SKILL_DIR/scripts/lint-runner.sh" "$FIXTURE" 2>/dev/null)

# 稳定化：替换时间为占位符，替换绝对路径为相对路径
ACTUAL_STABLE=$(echo "$ACTUAL" | \
  sed -E 's/时间：[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}/时间：YYYY-MM-DD HH:MM/' | \
  sed "s|$FIXTURE|tests/fixtures/lint-sample-wiki|g")

EXPECTED_STABLE=$(cat "$EXPECTED")

if [ "$ACTUAL_STABLE" = "$EXPECTED_STABLE" ]; then
  echo "PASS: lint output regression"
  exit 0
else
  echo "FAIL: lint output does not match expected"
  echo "--- diff (actual vs expected) ---"
  diff <(echo "$ACTUAL_STABLE") <(echo "$EXPECTED_STABLE") || true
  exit 1
fi
