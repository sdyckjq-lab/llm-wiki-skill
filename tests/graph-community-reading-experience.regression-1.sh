#!/bin/bash
# Regression: first real Sigma community reading experience path and screenshot review.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_ROOT/tests/lib/graph-html-engine-helpers.sh"

tmp_dir="$(mktemp -d)"
server_pid=""
web_pid=""
server_port="${GRAPH_COMMUNITY_EXPERIENCE_SERVER_PORT:-18790}"
web_port="${GRAPH_COMMUNITY_EXPERIENCE_WEB_PORT:-15183}"
artifact_dir="${GRAPH_COMMUNITY_EXPERIENCE_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/llm-wiki-community-experience.XXXXXX")}"

cleanup() {
    if [ -d "$artifact_dir" ]; then
        cp "$tmp_dir/server.log" "$artifact_dir/server.log" 2>/dev/null || true
        cp "$tmp_dir/web.log" "$artifact_dir/web.log" 2>/dev/null || true
    fi
    if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
    if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

if lsof -i TCP:"$server_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $server_port is already in use"
fi
if lsof -i TCP:"$web_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $web_port is already in use"
fi

npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
    || fail "graph-engine build should succeed before community reading experience regression"

workbench_kb="$tmp_dir/home/llm-wiki/sigma-community-experience"
mkdir -p "$workbench_kb/wiki/entities" "$tmp_dir/home/.llm-wiki-agent"

cat > "$workbench_kb/.wiki-schema.md" <<'EOF'
# Test schema
EOF

cat > "$workbench_kb/purpose.md" <<'EOF'
# Sigma Community Experience
EOF

node - "$workbench_kb" <<'NODE'
const fs = require("fs");
const path = require("path");

const kb = process.argv[2];
const nodes = [];
const edges = [];
const communities = [
  { id: "dense-agent", label: "AI Agent 对比分析", color_index: 0 },
  { id: "small-chain", label: "小型概念链", color_index: 1 },
  { id: "long-title", label: "长标题节点社区", color_index: 2 },
  { id: "edge-dense", label: "高密关系社区", color_index: 3 },
  { id: "flat-core", label: "无明显核心社区", color_index: 4 }
];

function addNode(community, id, label, type, x, y, weight) {
  const sourcePath = `wiki/entities/${id}.md`;
  nodes.push({
    id,
    label,
    title: label,
    type,
    community,
    path: sourcePath,
    source_path: sourcePath,
    content: `${label} 是 ${community} 社区里的测试节点。`,
    x,
    y,
    weight
  });
}

function addEdge(id, from, to, relation_type = "依赖", weight = 0.8, confidence = "EXTRACTED") {
  edges.push({ id, from, to, type: confidence, confidence, relation_type, weight });
}

[
  ["dense-overview", "AI Agent 对比分析总览", "topic", 40, 38, 96],
  ["dense-source-1", "AI Agent 实践案例", "source", 31, 48, 88],
  ["dense-framework", "Agent 框架谱系", "entity", 47, 46, 82],
  ["dense-eval", "Agent 评测维度", "topic", 58, 39, 76],
  ["dense-tools", "工具调用编排", "entity", 54, 54, 72],
  ["dense-memory", "长期记忆策略", "entity", 68, 51, 66],
  ["dense-rag", "RAG 协作边界", "topic", 70, 64, 64],
  ["dense-orchestration", "多代理协作", "entity", 38, 62, 60],
  ["dense-agent-benchmark", "Agent Benchmark 来源", "source", 24, 60, 56],
  ["dense-cost", "成本对比", "comparison", 79, 43, 52],
  ["dense-latency", "延迟瓶颈", "comparison", 84, 55, 48],
  ["dense-safety", "安全边界", "topic", 61, 73, 46],
  ["dense-copilot", "Copilot 模式", "entity", 46, 75, 44],
  ["dense-autonomy", "自主性等级", "topic", 30, 73, 42],
  ["dense-workflow", "工作流代理", "entity", 18, 47, 40],
  ["dense-handoff", "人机交接", "entity", 22, 34, 38]
].forEach(([id, label, type, x, y, weight]) => addNode("dense-agent", id, label, type, x, y, weight));

[
  ["dense-e1", "dense-overview", "dense-source-1", "实现", 1],
  ["dense-e2", "dense-overview", "dense-framework", "依赖", 1],
  ["dense-e3", "dense-overview", "dense-eval", "依赖", 0.95],
  ["dense-e4", "dense-framework", "dense-tools", "实现", 0.9],
  ["dense-e5", "dense-tools", "dense-memory", "依赖", 0.8],
  ["dense-e6", "dense-memory", "dense-rag", "衍生", 0.75],
  ["dense-e7", "dense-tools", "dense-orchestration", "实现", 0.85],
  ["dense-e8", "dense-source-1", "dense-agent-benchmark", "对比", 0.82, "INFERRED"],
  ["dense-e9", "dense-eval", "dense-cost", "对比", 0.72],
  ["dense-e10", "dense-cost", "dense-latency", "对比", 0.7],
  ["dense-e11", "dense-eval", "dense-safety", "矛盾", 0.64, "AMBIGUOUS"],
  ["dense-e12", "dense-safety", "dense-copilot", "依赖", 0.6],
  ["dense-e13", "dense-copilot", "dense-autonomy", "衍生", 0.56],
  ["dense-e14", "dense-autonomy", "dense-workflow", "实现", 0.54],
  ["dense-e15", "dense-workflow", "dense-handoff", "依赖", 0.52],
  ["dense-e16", "dense-handoff", "dense-source-1", "补充", 0.5],
  ["dense-e17", "dense-rag", "dense-eval", "桥接", 0.48],
  ["dense-e18", "dense-orchestration", "dense-autonomy", "桥接", 0.46],
  ["dense-e19", "dense-agent-benchmark", "dense-cost", "对比", 0.44],
  ["dense-e20", "dense-memory", "dense-safety", "矛盾", 0.42, "AMBIGUOUS"]
].forEach(([id, from, to, relation, weight, confidence]) => addEdge(id, from, to, relation, weight, confidence));

[
  ["small-a", "小社区入口", "topic", 128, 28, 70],
  ["small-b", "小社区证据", "source", 140, 40, 55],
  ["small-c", "小社区结论", "entity", 152, 30, 50]
].forEach(([id, label, type, x, y, weight]) => addNode("small-chain", id, label, type, x, y, weight));
addEdge("small-e1", "small-a", "small-b", "依赖", 0.8);
addEdge("small-e2", "small-b", "small-c", "衍生", 0.7);

[
  ["long-a", "一个标题非常长用来测试社区阅读标签截断是否稳定的核心节点", "topic", 33, 132, 76],
  ["long-b", "另一个同样很长的标题用于观察窄屏里文字不会盖住关系线", "entity", 53, 146, 70],
  ["long-c", "长标题来源材料节点带有补充说明", "source", 70, 126, 62],
  ["long-d", "标题长度接近边界的对比分析节点", "comparison", 84, 146, 56],
  ["long-e", "短标题锚点", "entity", 103, 132, 50]
].forEach(([id, label, type, x, y, weight]) => addNode("long-title", id, label, type, x, y, weight));
addEdge("long-e1", "long-a", "long-b", "依赖", 0.8);
addEdge("long-e2", "long-b", "long-c", "补充", 0.7);
addEdge("long-e3", "long-c", "long-d", "对比", 0.65);
addEdge("long-e4", "long-d", "long-e", "衍生", 0.55);

["A", "B", "C", "D", "E", "F", "G"].forEach((letter, index) => {
  addNode("edge-dense", `edge-${letter}`, `高密关系节点${letter}`, index % 3 === 0 ? "topic" : index % 3 === 1 ? "entity" : "source", 132 + (index % 3) * 16, 126 + Math.floor(index / 3) * 16, 68 - index);
});
[
  ["edge-e1", "edge-A", "edge-B"], ["edge-e2", "edge-A", "edge-C"], ["edge-e3", "edge-A", "edge-D"],
  ["edge-e4", "edge-B", "edge-C"], ["edge-e5", "edge-B", "edge-E"], ["edge-e6", "edge-C", "edge-F"],
  ["edge-e7", "edge-D", "edge-E"], ["edge-e8", "edge-D", "edge-G"], ["edge-e9", "edge-E", "edge-F"],
  ["edge-e10", "edge-F", "edge-G"], ["edge-e11", "edge-C", "edge-G"], ["edge-e12", "edge-B", "edge-G"]
].forEach(([id, from, to], index) => addEdge(id, from, to, index % 3 === 0 ? "实现" : index % 3 === 1 ? "对比" : "依赖", 0.45 + index * 0.03));

[
  ["flat-a", "平权节点A", "topic", 194, 70],
  ["flat-b", "平权节点B", "entity", 218, 75],
  ["flat-c", "平权节点C", "source", 236, 92],
  ["flat-d", "平权节点D", "topic", 228, 116],
  ["flat-e", "平权节点E", "entity", 204, 120],
  ["flat-f", "平权节点F", "source", 188, 98]
].forEach(([id, label, type, x, y]) => addNode("flat-core", id, label, type, x, y, 50));
[
  ["flat-e1", "flat-a", "flat-b"], ["flat-e2", "flat-b", "flat-c"], ["flat-e3", "flat-c", "flat-d"],
  ["flat-e4", "flat-d", "flat-e"], ["flat-e5", "flat-e", "flat-f"], ["flat-e6", "flat-f", "flat-a"]
].forEach(([id, from, to]) => addEdge(id, from, to, "补充", 0.58));

for (const node of nodes) {
  const file = path.join(kb, node.source_path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${node.label}\n\n${node.content}\n\n它属于 ${node.community} 社区。\n`);
}

const communityPayload = communities.map((community) => {
  const members = nodes.filter((node) => node.community === community.id).map((node) => node.id);
  const first = members[0] || null;
  return {
    id: community.id,
    label: community.label,
    node_count: members.length,
    color_index: community.color_index,
    recommended_start_node_id: first,
    members,
    is_primary: community.id === "dense-agent"
  };
});

const graph = {
  meta: {
    build_date: "2026-07-05T00:00:00.000Z",
    wiki_title: "Sigma Community Experience",
    total_nodes: nodes.length,
    total_edges: edges.length
  },
  nodes,
  edges,
  learning: {
    version: 1,
    entry: { recommended_start_node_id: "dense-overview", recommended_start_reason: "密集社区入口", default_mode: "global" },
    views: {
      path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
      community: { enabled: true, community_id: "dense-agent", label: "AI Agent 对比分析", node_ids: communityPayload[0].members, is_weak: false, degraded: false },
      global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
    },
    communities: communityPayload
  }
};

fs.writeFileSync(path.join(kb, "wiki/graph-data.json"), `${JSON.stringify(graph, null, 2)}\n`);
NODE

cat > "$tmp_dir/home/.llm-wiki-agent/config.json" <<JSON
{
  "version": 1,
  "externalKnowledgeBases": [],
  "lastUsedKbPath": "$workbench_kb"
}
JSON

HOME="$tmp_dir/home" HOST=127.0.0.1 PORT="$server_port" "$REPO_ROOT/node_modules/.bin/tsx" "$REPO_ROOT/workbench/server/src/index.ts" > "$tmp_dir/server.log" 2>&1 &
server_pid="$!"
HOME="$tmp_dir/home" LLM_WIKI_AGENT_API_ORIGIN="http://127.0.0.1:$server_port" LLM_WIKI_AGENT_DISABLE_HMR=1 npm run dev -w @llm-wiki-agent/web -- --host 127.0.0.1 --port "$web_port" --force > "$tmp_dir/web.log" 2>&1 &
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

playwright_node_path="${GRAPH_COMMUNITY_EXPERIENCE_PLAYWRIGHT_NODE_PATH:-}"
if [ -z "$playwright_node_path" ]; then
    playwright_node_path="$(
        node -e 'const path=require("path"); try { console.log(path.dirname(path.dirname(require.resolve("playwright/package.json")))); } catch { process.exit(1); }' 2>/dev/null || true
    )"
fi
if [ -z "$playwright_node_path" ] || [ ! -d "$playwright_node_path/playwright" ]; then
    fail "Playwright is not installed locally. Install Playwright or set GRAPH_COMMUNITY_EXPERIENCE_PLAYWRIGHT_NODE_PATH."
fi

chrome_executable="${GRAPH_COMMUNITY_EXPERIENCE_CHROME_EXECUTABLE:-}"
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

GRAPH_COMMUNITY_EXPERIENCE_URL="http://127.0.0.1:$web_port" \
GRAPH_COMMUNITY_EXPERIENCE_CHROME_EXECUTABLE="$chrome_executable" \
GRAPH_COMMUNITY_EXPERIENCE_ARTIFACT_DIR="$artifact_dir" \
NODE_PATH="$playwright_node_path" \
node "$REPO_ROOT/tests/browser/graph-community-reading-experience.mjs" \
    || fail "Sigma community reading experience browser regression should pass"

echo "PASS: graph community reading experience regression"
echo "ARTIFACTS: $artifact_dir"
