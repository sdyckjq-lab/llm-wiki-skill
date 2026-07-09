#!/bin/bash
# Regression: workbench uses the shared graph interaction stack for zoom, drag, hover, drawer, minimap, and reset.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_ROOT/tests/lib/graph-html-engine-helpers.sh"

tmp_dir="$(mktemp -d)"
server_pid=""
web_pid=""
server_port="${GRAPH_WORKBENCH_SERVER_PORT:-18787}"
web_port="${GRAPH_WORKBENCH_WEB_PORT:-15180}"

cleanup() {
    if [ -n "$server_pid" ]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    if [ -n "$web_pid" ]; then
        kill "$web_pid" 2>/dev/null || true
        wait "$web_pid" 2>/dev/null || true
    fi
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

dump_dev_logs() {
    echo "--- workbench server log ---" >&2
    tail -n 120 "$tmp_dir/server.log" >&2 2>/dev/null || true
    echo "--- workbench web log ---" >&2
    tail -n 120 "$tmp_dir/web.log" >&2 2>/dev/null || true
}

if lsof -i TCP:"$server_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $server_port is already in use"
fi
if lsof -i TCP:"$web_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $web_port is already in use"
fi

npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
    || fail "graph-engine build should succeed before workbench browser regression"

workbench_kb="$tmp_dir/home/llm-wiki/phase-6-workbench"
mkdir -p "$workbench_kb/wiki/entities" "$tmp_dir/home/.llm-wiki-agent"
cp "$REPO_ROOT/tests/fixtures/graph-interactive-basic/wiki/graph-data.json" "$workbench_kb/wiki/graph-data.json"
cat > "$workbench_kb/.wiki-schema.md" <<'EOF'
# Test schema
EOF
cat > "$workbench_kb/purpose.md" <<'EOF'
# Phase 6 Workbench Test
EOF
cat > "$workbench_kb/wiki/entities/A.md" <<'EOF'
# 节点A

这是节点A的正文。参见 [[wiki/entities/B.md]]。
EOF
cat > "$workbench_kb/wiki/entities/B.md" <<'EOF'
# 节点B

这是节点B的正文。
EOF
cat > "$workbench_kb/wiki/entities/C.md" <<'EOF'
# 节点C

这是节点C的正文。
EOF
node - "$workbench_kb/wiki/graph-data.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(data.nodes.map((node) => [node.id, node]));
const base = byId.get("A") || data.nodes[0];
const communityPositions = new Map(Object.entries({
  D: [38, 56],
  E: [48, 34],
  F: [58, 42],
  G: [66, 54],
  H: [42, 70],
  I: [55, 72],
  J: [72, 40],
  K: [80, 52],
  L: [70, 68],
  M: [60, 84]
}));
for (const id of ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]) {
  if (byId.has(id)) continue;
  const [x, y] = communityPositions.get(id) || [50, 50];
  data.nodes.push({
    ...base,
    id,
    label: `节点${id}`,
    type: "entity",
    community: "t1",
    source_path: `wiki/entities/${id}.md`,
    x,
    y
  });
}
const existingEdges = new Set(data.edges.map((edge) => edge.id));
for (const id of ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]) {
  const edgeId = `A-${id}`;
  if (existingEdges.has(edgeId)) continue;
  data.edges.push({ id: edgeId, from: "A", to: id, type: "EXTRACTED", relation_type: "同社区", weight: 0.5 });
}
for (const edge of [
  { id: "D-E-contrast", from: "D", to: "E", relation_type: "对比", weight: 0.7 },
  { id: "E-F-conflict", from: "E", to: "F", relation_type: "矛盾", weight: 0.85 },
  { id: "J-K-context", from: "J", to: "K", relation_type: "同社区", weight: 0.18 },
  { id: "K-L-context", from: "K", to: "L", relation_type: "同社区", weight: 0.16 },
  { id: "L-M-context", from: "L", to: "M", relation_type: "同社区", weight: 0.14 },
  { id: "J-M-context", from: "J", to: "M", relation_type: "同社区", weight: 0.12 }
]) {
  if (existingEdges.has(edge.id)) continue;
  data.edges.push({ ...edge, type: "EXTRACTED" });
}
for (const node of data.nodes) {
  node.source_path = `wiki/entities/${node.id}.md`;
  node.content = `# ${node.label}\n\n这是${node.label}的内容。\n`;
  if (node.id === "C" || node.id === "D") node.type = "source";
  if (node.id === "C") node.community = "t2";
}
const t1Members = data.nodes.filter((node) => node.community === "t1").map((node) => node.id);
const t2Members = data.nodes.filter((node) => node.community === "t2").map((node) => node.id);
if (!data.learning) {
  data.learning = {
    version: 1,
    entry: {
      recommended_start_node_id: "A",
      recommended_start_reason: "测试入口",
      default_mode: "global"
    },
    views: {
      path: { enabled: false, start_node_id: null, node_ids: [], degraded: false },
      community: { enabled: true, community_id: "t1", label: "t1", node_ids: t1Members, is_weak: false, degraded: false },
      global: { enabled: true, node_ids: data.nodes.map((node) => node.id), degraded: false }
    },
    communities: []
  };
}
let community = data.learning.communities.find((item) => item.id === "t1");
if (!community) {
  community = { id: "t1", label: "t1", node_count: t1Members.length, members: t1Members };
  data.learning.communities.push(community);
}
if (community) {
  community.members = t1Members;
  community.label = community.label || "t1";
  community.is_primary = true;
  community.recommended_start_node_id = "A";
  community.color_index = 0;
  community.node_count = community.members.length;
}
if (data.learning.views?.community) {
  data.learning.views.community.enabled = true;
  data.learning.views.community.community_id = "t1";
  data.learning.views.community.label = "t1";
  data.learning.views.community.node_ids = t1Members;
  data.learning.views.community.is_weak = false;
  data.learning.views.community.degraded = false;
}
if (data.learning.views?.global) {
  data.learning.views.global.enabled = true;
  data.learning.views.global.node_ids = data.nodes.map((node) => node.id);
  data.learning.views.global.degraded = false;
}
if (data.learning.entry) {
  data.learning.entry.recommended_start_node_id = "A";
  data.learning.entry.recommended_start_reason = "测试入口";
  data.learning.entry.default_mode = "global";
}
community.summary = "t1 测试社区";
let bridgeCommunity = data.learning.communities.find((item) => item.id === "t2");
if (!bridgeCommunity) {
  bridgeCommunity = { id: "t2", label: "t2", node_count: t2Members.length, members: t2Members };
  data.learning.communities.push(bridgeCommunity);
}
if (bridgeCommunity) {
  bridgeCommunity.members = t2Members;
  bridgeCommunity.label = bridgeCommunity.label || "t2";
  bridgeCommunity.node_count = bridgeCommunity.members.length;
}
if (data.meta) {
  data.meta.total_nodes = data.nodes.length;
  data.meta.total_edges = data.edges.length;
}
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
NODE
for id in D E F G H I J K L M; do
cat > "$workbench_kb/wiki/entities/$id.md" <<EOF
# 节点$id

这是节点$id 的正文。
EOF
done
cat > "$tmp_dir/home/.llm-wiki-agent/config.json" <<JSON
{
  "version": 1,
  "externalKnowledgeBases": [],
  "lastUsedKbPath": "$workbench_kb"
}
JSON

(
    cd "$REPO_ROOT/workbench/server"
    HOME="$tmp_dir/home" HOST=127.0.0.1 PORT="$server_port" "$REPO_ROOT/node_modules/.bin/tsx" src/index.ts
) > "$tmp_dir/server.log" 2>&1 &
server_pid="$!"
HOME="$tmp_dir/home" LLM_WIKI_AGENT_DISABLE_HMR=1 LLM_WIKI_AGENT_API_ORIGIN="http://127.0.0.1:$server_port" npm run dev -w @llm-wiki-agent/web -- --host 127.0.0.1 --port "$web_port" --force > "$tmp_dir/web.log" 2>&1 &
web_pid="$!"

for _ in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:$server_port/api/knowledge-bases" >/dev/null 2>&1 \
        && curl -fsS "http://127.0.0.1:$web_port" >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done

curl -fsS "http://127.0.0.1:$server_port/api/knowledge-bases" >/dev/null 2>&1 \
    || fail "workbench server did not start; see $tmp_dir/server.log"
curl -fsS "http://127.0.0.1:$web_port" >/dev/null 2>&1 \
    || fail "workbench web did not start; see $tmp_dir/web.log"

artifact_dir="$tmp_dir/artifacts"
mkdir -p "$artifact_dir"

playwright_node_path="$(
    npx --yes -p playwright -c 'node -e "const path=require(\"path\"); console.log(path.dirname(process.env.PATH.split(\":\")[0]))"'
)"

chrome_executable="${GRAPH_WORKBENCH_CHROME_EXECUTABLE:-}"
if [ -z "$chrome_executable" ] && [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    chrome_executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

GRAPH_WORKBENCH_URL="http://127.0.0.1:$web_port" \
GRAPH_WORKBENCH_ARTIFACT_DIR="$artifact_dir" \
GRAPH_WORKBENCH_CHROME_EXECUTABLE="$chrome_executable" \
NODE_PATH="$playwright_node_path" \
node "$REPO_ROOT/tests/browser/graph-workbench-interactions.mjs" \
    || { dump_dev_logs; fail "workbench graph interaction browser regression should pass"; }

echo "Artifacts: $artifact_dir"
echo "PASS: graph workbench interaction regression"
