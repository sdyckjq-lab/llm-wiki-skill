#!/bin/bash
# Regression: focused community view renders as a lightweight node relationship map.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_ROOT/tests/lib/graph-html-engine-helpers.sh"

tmp_dir="$(mktemp -d)"
cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
    || fail "graph-engine build should succeed before community node map regression"

build_graph_html_fixture "$tmp_dir"

node - "$tmp_dir/wiki/graph-data.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const graph = JSON.parse(fs.readFileSync(file, "utf8"));
const coreNodes = [
  { id: "A", label: "节点A", type: "topic", community: "t1", content: "# 节点A\n\n这是节点A。", source_path: "/fake/wiki/entities/A.md", x: 24, y: 42, weight: 90 },
  { id: "B", label: "节点B", type: "entity", community: "t1", content: "# 节点B\n\n这是节点B。", source_path: "/fake/wiki/entities/B.md", x: 36, y: 32, weight: 70 },
  { id: "C", label: "节点C", type: "source", community: "t1", content: "# 节点C\n\n这是节点C。", source_path: "/fake/wiki/entities/C.md", x: 38, y: 56, weight: 60 },
  { id: "D", label: "节点D", type: "entity", community: "t1", content: "# 节点D\n\n这是节点D。", source_path: "/fake/wiki/entities/D.md", x: 55, y: 34, weight: 50 },
  { id: "E", label: "节点E", type: "entity", community: "t1", content: "# 节点E\n\n这是节点E。", source_path: "/fake/wiki/entities/E.md", x: 68, y: 38, weight: 40 },
  { id: "F", label: "节点F", type: "comparison", community: "t1", content: "# 节点F\n\n这是节点F。", source_path: "/fake/wiki/entities/F.md", x: 80, y: 46, weight: 30 }
];
const fillerNodes = Array.from({ length: 18 }, (_, index) => {
  const id = `N${index + 1}`;
  const column = index % 6;
  const row = Math.floor(index / 6);
  return {
    id,
    label: `普通节点${index + 1}`,
    type: index % 7 === 0 ? "topic" : index % 5 === 0 ? "source" : "entity",
    community: "t1",
    content: `# 普通节点${index + 1}\n\n这是用于验证默认标签稀疏度的普通节点。`,
    source_path: `/fake/wiki/entities/${id}.md`,
    x: 18 + column * 12,
    y: 18 + row * 21,
    weight: Math.max(5, 28 - index)
  };
});
graph.nodes = [...coreNodes, ...fillerNodes];
const aNeighborEdges = Array.from({ length: 10 }, (_, index) => ({
  id: `eAN${index + 1}`,
  from: "A",
  to: `N${index + 1}`,
  type: "EXTRACTED",
  confidence: "EXTRACTED",
  relation_type: index % 2 === 0 ? "实现" : "依赖",
  weight: 0.6
}));
graph.edges = [
  { id: "eAB", from: "A", to: "B", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
  { id: "eAC", from: "A", to: "C", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.8 },
  { id: "eBD", from: "B", to: "D", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.7 },
  { id: "eDE", from: "D", to: "E", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.5 },
  { id: "eEF", from: "E", to: "F", type: "AMBIGUOUS", confidence: "AMBIGUOUS", relation_type: "矛盾", weight: 0.4 },
  ...aNeighborEdges
];
graph.meta.total_nodes = graph.nodes.length;
graph.meta.total_edges = graph.edges.length;
graph.learning = {
  version: 1,
  entry: { recommended_start_node_id: "A", recommended_start_reason: "fixture", default_mode: "global" },
  views: {
    path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
    community: { enabled: true, community_id: "t1", label: "测试社区", node_ids: graph.nodes.map((node) => node.id), is_weak: false, degraded: false },
    global: { enabled: true, node_ids: graph.nodes.map((node) => node.id), degraded: false }
  },
  communities: [
    { id: "t1", label: "测试社区", node_count: graph.nodes.length, color_index: 0, recommended_start_node_id: "A" }
  ]
};
fs.writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`);
NODE

bash "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir" > /dev/null 2>&1 \
    || fail "build-graph-html.sh should succeed on community node map fixture"

playwright_node_path="$(
    npx --yes -p playwright -c 'node -e "const path=require(\"path\"); console.log(path.dirname(process.env.PATH.split(\":\")[0]))"'
)"

chrome_executable="${GRAPH_COMMUNITY_NODE_MAP_CHROME_EXECUTABLE:-}"
if [ -z "$chrome_executable" ] && [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    chrome_executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

artifact_dir="${GRAPH_COMMUNITY_NODE_MAP_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/llm-wiki-community-node-map.XXXXXX")}"
screenshot_path="${GRAPH_COMMUNITY_NODE_MAP_SCREENSHOT:-$artifact_dir/community-node-map.png}"

GRAPH_COMMUNITY_NODE_MAP_HTML="$tmp_dir/wiki/knowledge-graph.html" \
GRAPH_COMMUNITY_NODE_MAP_CHROME_EXECUTABLE="$chrome_executable" \
GRAPH_COMMUNITY_NODE_MAP_SCREENSHOT="$screenshot_path" \
NODE_PATH="$playwright_node_path" \
node "$REPO_ROOT/tests/browser/graph-community-node-map.mjs" \
    || fail "community node map browser regression should pass"

echo "PASS: graph community node map regression"
echo "SCREENSHOT: $screenshot_path"
