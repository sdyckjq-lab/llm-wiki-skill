#!/bin/bash
# Regression: production Sigma global renderer browser performance path

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

artifact_dir="${GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR:-}"
if [ -z "$artifact_dir" ]; then
  artifact_dir="$(mktemp -d)"
fi
mkdir -p "$artifact_dir"

npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1

playwright_node_path="${GRAPH_TRIAL_PLAYWRIGHT_NODE_PATH:-}"
if [ -z "$playwright_node_path" ]; then
  playwright_node_path="$(
    node -e 'const path=require("path"); try { console.log(path.dirname(path.dirname(require.resolve("playwright/package.json")))); } catch { process.exit(1); }' 2>/dev/null || true
  )"
fi
if [ -z "$playwright_node_path" ] || [ ! -d "$playwright_node_path/playwright" ]; then
  echo "ERROR: Playwright is not installed locally. Install Playwright for this checkout, or set GRAPH_TRIAL_PLAYWRIGHT_NODE_PATH." >&2
  exit 1
fi

chrome_executable="${GRAPH_SIGMA_PRODUCTION_CHROME_EXECUTABLE:-}"
if [ -z "$chrome_executable" ]; then
  candidate="$(
    NODE_PATH="$playwright_node_path" node -e 'const { chromium } = require("playwright"); console.log(chromium.executablePath())'
  )"
  if [ -x "$candidate" ]; then
    chrome_executable="$candidate"
  elif [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    chrome_executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  fi
fi

cd "$REPO_ROOT"
NODE_PATH="$playwright_node_path" \
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR="$artifact_dir" \
GRAPH_SIGMA_PRODUCTION_CHROME_EXECUTABLE="$chrome_executable" \
node --import tsx tests/browser/graph-sigma-global-production.ts

node tests/browser/validate-graph-trial-result.mjs "$artifact_dir/sigma-global-production-results.json"
node - "$artifact_dir/sigma-global-production-results.json" <<'NODE'
const fs = require("fs");
const resultPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const failures = [];
if (data.production_path !== true) failures.push("top-level production_path is not true");
for (const record of data.records || []) {
  if (record.production_path !== true) failures.push(`${record.graph_shape}/${record.action}: production_path is not true`);
  if (!record.loading_state) failures.push(`${record.graph_shape}/${record.action}: missing loading_state`);
  if (!record.thresholds) failures.push(`${record.graph_shape}/${record.action}: missing thresholds`);
}
if (failures.length) {
  console.error(`FAIL: production-path artifact validation found ${failures.length} issue(s)`);
  for (const failure of failures.slice(0, 20)) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS: production-path artifact fields (${resultPath})`);
NODE
echo "PASS: Sigma global production performance trial ($artifact_dir/sigma-global-production-results.json)"
