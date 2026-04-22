#!/bin/bash
# build-graph-html.sh — 拼接交互式知识图谱 HTML（wash 水彩卡片风）
#
# 用法：
#   bash scripts/build-graph-html.sh <wiki_root>
#
# 前置：需要先运行 build-graph-data.sh 生成 wiki/graph-data.json
#
# 行为：
#   1. 读取 wash 模板 header/footer
#   2. 替换品牌栏占位符（__WIKI_TITLE__ / __NODE_COUNT__ / __EDGE_COUNT__ / __BUILD_DATE__）
#   3. 把 wiki/graph-data.json 内嵌到 <script id="graph-data"> 块内部
#      （事先做 </script> → <\/script> 转义，防 JSON 字符串里含 </script>
#        提前关闭标签 — JSON-in-HTML 标准做法）
#   4. 追加 footer
#   5. 复制 wash 运行所需 vendor 资产到 HTML 同级目录
#
# 退出码：0 成功；1 依赖/文件缺失/参数错误

set -eu

print_usage() {
  cat <<'EOF'
用法：
  bash scripts/build-graph-html.sh <wiki_root>

示例：
  bash scripts/build-graph-html.sh /path/to/wiki-root
EOF
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

ensure_file() {
  local file="$1"
  local label="${2:-文件}"
  [ -f "$file" ] || {
    echo "ERROR: 找不到${label} $file" >&2
    echo "       重装 skill 可修复（bash install.sh --platform claude）" >&2
    exit 1
  }
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      die "未知选项: $1"
      ;;
    *)
      break
      ;;
  esac
done

[ "$#" -eq 1 ] || {
  print_usage >&2
  exit 1
}

WIKI_ROOT="$1"

command -v jq >/dev/null 2>&1 || {
  echo "ERROR: jq 未安装。运行 brew install jq" >&2
  exit 1
}

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATES_DIR="$SKILL_DIR/templates"
DEPS_DIR="$SKILL_DIR/deps"
DATA="$WIKI_ROOT/wiki/graph-data.json"

[ -f "$DATA" ] || {
  echo "ERROR: 未找到 $DATA" >&2
  echo "       请先运行 build-graph-data.sh 生成图谱数据" >&2
  exit 1
}

HEADER="$TEMPLATES_DIR/graph-styles/wash/header.html"
FOOTER="$TEMPLATES_DIR/graph-styles/wash/footer.html"
OUTPUT="$WIKI_ROOT/wiki/knowledge-graph.html"

ensure_file "$HEADER" "模板"
ensure_file "$FOOTER" "模板"

WIKI_TITLE=$(jq -r '.meta.wiki_title // "知识库"' "$DATA")
NODE_COUNT=$(jq -r '.meta.total_nodes // 0' "$DATA")
EDGE_COUNT=$(jq -r '.meta.total_edges // 0' "$DATA")
BUILD_DATE=$(jq -r '.meta.build_date // ""' "$DATA")
BUILD_DATE_SHORT="${BUILD_DATE:0:10}"
[ -n "$BUILD_DATE_SHORT" ] || BUILD_DATE_SHORT="未知"

ASSET_SPECS=(
  "$DEPS_DIR/d3.min.js|d3.min.js"
  "$DEPS_DIR/rough.min.js|rough.min.js"
  "$DEPS_DIR/marked.min.js|marked.min.js"
  "$DEPS_DIR/purify.min.js|purify.min.js"
  "$DEPS_DIR/LICENSE-d3.txt|LICENSE-d3.txt"
  "$DEPS_DIR/LICENSE-roughjs.txt|LICENSE-roughjs.txt"
  "$DEPS_DIR/LICENSE-marked.txt|LICENSE-marked.txt"
  "$DEPS_DIR/LICENSE-purify.txt|LICENSE-purify.txt"
  "$TEMPLATES_DIR/graph-styles/wash/graph-wash-helpers.js|graph-wash-helpers.js"
  "$TEMPLATES_DIR/graph-styles/wash/graph-wash.js|graph-wash.js"
)

output_dir="$(dirname "$OUTPUT")"
mkdir -p "$output_dir"
output_tmp="$OUTPUT.partial"
output_next="$OUTPUT.next"
rm -f "$output_tmp" "$output_next"

# 替换占位符
WIKI_TITLE_VAL="$WIKI_TITLE" \
NODE_COUNT_VAL="$NODE_COUNT" \
EDGE_COUNT_VAL="$EDGE_COUNT" \
BUILD_DATE_VAL="$BUILD_DATE_SHORT" \
perl -pe '
  s/__WIKI_TITLE__/$ENV{WIKI_TITLE_VAL}/g;
  s/__NODE_COUNT__/$ENV{NODE_COUNT_VAL}/g;
  s/__EDGE_COUNT__/$ENV{EDGE_COUNT_VAL}/g;
  s/__BUILD_DATE__/$ENV{BUILD_DATE_VAL}/g;
' "$HEADER" > "$output_tmp"

# 内嵌 graph-data.json，转义 </script>
perl -pe 's|</script>|<\\/script>|gi' "$DATA" >> "$output_tmp"

cat "$FOOTER" >> "$output_tmp"

# 先复制 vendor 资产，全部成功后再替换 HTML
for spec in "${ASSET_SPECS[@]}"; do
  src="${spec%%|*}"
  name="${spec#*|}"
  ensure_file "$src" "vendor"
  cp "$src" "$output_dir/$name"
done

mv "$output_tmp" "$output_next"
mv "$output_next" "$OUTPUT"

output_size=$(wc -c < "$OUTPUT" | tr -d ' ')
output_kb=$((output_size / 1024))

echo "交互式图谱已生成："
echo "  - $OUTPUT (${output_kb} KB)"
echo "  节点 $NODE_COUNT · 关联 $EDGE_COUNT"
echo ""
echo "查看方式："
echo "  1. 双击 $OUTPUT"
echo "     （建议 Chrome / Firefox；Safari 可能因 file:// 策略拒绝本地脚本）"
echo "  2. 如浏览器拒绝本地脚本，在 $output_dir 下跑："
echo "       python3 -m http.server 8000"
echo "     再访问："
echo "       http://localhost:8000/$(basename "$OUTPUT")"
