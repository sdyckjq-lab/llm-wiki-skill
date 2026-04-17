#!/bin/bash
# build-graph-html.sh — 拼接交互式图谱 HTML
#
# 用法：bash scripts/build-graph-html.sh <wiki_root> [output_html]
#   wiki_root     包含 wiki/ 子目录的知识库根路径
#   output_html   可选，默认 <wiki_root>/wiki/knowledge-graph.html
#
# 前置：需要先运行 build-graph-data.sh 生成 wiki/graph-data.json
#
# 行为：
#   1. 读 templates/graph-template-header.html
#   2. 替换品牌栏占位符（__WIKI_TITLE__ / __NODE_COUNT__ / __EDGE_COUNT__ / __BUILD_DATE__）
#   3. 把 wiki/graph-data.json 内嵌到 <script id="graph-data"> 块内部
#      （事先做 </script> → <\/script> 转义，防 JSON 字符串里含 </script>
#        提前关闭标签 — JSON-in-HTML 标准做法）
#   4. 追加 templates/graph-template-footer.html
#   5. 复制 templates/ 下 vendor 三件套 + LICENSE 到 HTML 同级目录
#
# 退出码：0 成功；1 依赖/文件缺失

set -eu

WIKI_ROOT="${1:-.}"
DEFAULT_OUTPUT="$WIKI_ROOT/wiki/knowledge-graph.html"
OUTPUT="${2:-$DEFAULT_OUTPUT}"

command -v jq >/dev/null 2>&1 || {
  echo "ERROR: jq 未安装。运行 brew install jq" >&2
  exit 1
}

# 定位当前 skill 的 templates/ 目录（脚本所在目录的上一级）
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATES_DIR="$SKILL_DIR/templates"

HEADER="$TEMPLATES_DIR/graph-template-header.html"
FOOTER="$TEMPLATES_DIR/graph-template-footer.html"
DATA="$WIKI_ROOT/wiki/graph-data.json"

for f in "$HEADER" "$FOOTER"; do
  [ -f "$f" ] || {
    echo "ERROR: 找不到模板 $f" >&2
    echo "       重装 skill 可修复（bash install.sh --platform claude）" >&2
    exit 1
  }
done

[ -f "$DATA" ] || {
  echo "ERROR: 未找到 $DATA" >&2
  echo "       请先运行 build-graph-data.sh 生成图谱数据" >&2
  exit 1
}

# 三个 vendor 资产 + LICENSE（缺一不可）
VENDORS=(vis-network.min.js marked.min.js purify.min.js
         LICENSE-vis-network.txt LICENSE-marked.txt LICENSE-purify.txt)
for asset in "${VENDORS[@]}"; do
  [ -f "$TEMPLATES_DIR/$asset" ] || {
    echo "ERROR: 缺少 $TEMPLATES_DIR/$asset" >&2
    echo "       重装 skill 可修复（bash install.sh --platform claude）" >&2
    exit 1
  }
done

# ─── 提取 meta 字段用于 header 占位符替换 ─────────────────────
WIKI_TITLE=$(jq -r '.meta.wiki_title // "知识库"' "$DATA")
NODE_COUNT=$(jq -r '.meta.total_nodes // 0' "$DATA")
EDGE_COUNT=$(jq -r '.meta.total_edges // 0' "$DATA")
BUILD_DATE=$(jq -r '.meta.build_date // ""' "$DATA")
BUILD_DATE_SHORT="${BUILD_DATE:0:10}"
[ -n "$BUILD_DATE_SHORT" ] || BUILD_DATE_SHORT="未知"

mkdir -p "$(dirname "$OUTPUT")"
OUTPUT_TMP="$OUTPUT.partial"
trap 'rm -f "$OUTPUT_TMP"' EXIT

# ─── Step 1: header 占位符替换 ───────────────────────────────
# perl -pe 对中文 / 空格 / 特殊字符比 sed 更稳（参考 init-wiki.sh）
WIKI_TITLE_VAL="$WIKI_TITLE" \
NODE_COUNT_VAL="$NODE_COUNT" \
EDGE_COUNT_VAL="$EDGE_COUNT" \
BUILD_DATE_VAL="$BUILD_DATE_SHORT" \
perl -pe '
  s/__WIKI_TITLE__/$ENV{WIKI_TITLE_VAL}/g;
  s/__NODE_COUNT__/$ENV{NODE_COUNT_VAL}/g;
  s/__EDGE_COUNT__/$ENV{EDGE_COUNT_VAL}/g;
  s/__BUILD_DATE__/$ENV{BUILD_DATE_VAL}/g;
' "$HEADER" > "$OUTPUT_TMP"

# ─── Step 2: JSON 内嵌 + </script> 转义 ─────────────────────
# JSON 本身不会含字面 </script>，但 node.content 字段可能，必须转义。
# 对 JSON 字符串里的反斜杠，JSON parser 透明；但 HTML 解析器不再命中
# </script> 字面量，所以标签不会提前闭合。这是 JSON-in-HTML 标准做法。
perl -pe 's|</script>|<\\/script>|gi' "$DATA" >> "$OUTPUT_TMP"

# ─── Step 3: 追加 footer ─────────────────────────────────────
cat "$FOOTER" >> "$OUTPUT_TMP"

mv "$OUTPUT_TMP" "$OUTPUT"

# ─── Step 4: 复制 vendor 资产到 HTML 同级 ────────────────────
OUTPUT_DIR="$(dirname "$OUTPUT")"
for asset in "${VENDORS[@]}"; do
  cp "$TEMPLATES_DIR/$asset" "$OUTPUT_DIR/$asset"
done

OUTPUT_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
OUTPUT_KB=$((OUTPUT_SIZE / 1024))

echo "交互式图谱已生成：$OUTPUT"
echo "  大小：${OUTPUT_KB} KB · 节点 $NODE_COUNT · 关联 $EDGE_COUNT"
echo ""
echo "查看方式："
echo "  1. 双击 $OUTPUT"
echo "     （建议 Chrome / Firefox；Safari 可能因 file:// 策略拒绝本地脚本）"
echo "  2. 如浏览器拒绝本地脚本，在 $OUTPUT_DIR 下跑："
echo "       python3 -m http.server 8000"
echo "     再访问 http://localhost:8000/$(basename "$OUTPUT")"
