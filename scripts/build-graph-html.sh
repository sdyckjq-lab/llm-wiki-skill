#!/bin/bash
# build-graph-html.sh — 拼接交互式图谱 HTML
#
# 用法：
#   bash scripts/build-graph-html.sh [--style classic|paper|wash|all] <wiki_root> [output_html]
#
#   - 不传 --style 且不传 output_html：默认生成 classic + paper + wash 三份
#   - 传 output_html 但不传 --style：兼容旧用法，仅生成 classic 到指定路径
#   - --style all 不接受单独 output_html（会同时生成三份默认命名文件）
#
# 前置：需要先运行 build-graph-data.sh 生成 wiki/graph-data.json
#
# 行为：
#   1. 选择对应风格模板 header/footer
#   2. 替换品牌栏占位符（__WIKI_TITLE__ / __NODE_COUNT__ / __EDGE_COUNT__ / __BUILD_DATE__）
#   3. 把 wiki/graph-data.json 内嵌到 <script id="graph-data"> 块内部
#      （事先做 </script> → <\/script> 转义，防 JSON 字符串里含 </script>
#        提前关闭标签 — JSON-in-HTML 标准做法）
#   4. 追加对应风格 footer
#   5. 复制该风格运行所需 vendor 资产到 HTML 同级目录
#
# 退出码：0 成功；1 依赖/文件缺失/参数错误

set -eu

print_usage() {
  cat <<'EOF'
用法：
  bash scripts/build-graph-html.sh [--style classic|paper|wash|all] <wiki_root> [output_html]

示例：
  bash scripts/build-graph-html.sh /path/to/wiki-root
  bash scripts/build-graph-html.sh --style classic /path/to/wiki-root
  bash scripts/build-graph-html.sh --style paper /path/to/wiki-root
  bash scripts/build-graph-html.sh /path/to/wiki-root /path/to/wiki/knowledge-graph.html
EOF
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

ensure_template() {
  local file="$1"
  [ -f "$file" ] || {
    echo "ERROR: 找不到模板 $file" >&2
    echo "       重装 skill 可修复（bash install.sh --platform claude）" >&2
    exit 1
  }
}

ensure_vendor() {
  local file="$1"
  [ -f "$file" ] || {
    echo "ERROR: 缺少 $file" >&2
    echo "       重装 skill 可修复（bash install.sh --platform claude）" >&2
    exit 1
  }
}

STYLE=""
POSITIONAL=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --style)
      [ "$#" -ge 2 ] || die "--style 需要传 classic、paper、wash 或 all"
      STYLE="$2"
      shift 2
      ;;
    --style=*)
      STYLE="${1#*=}"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        POSITIONAL+=("$1")
        shift
      done
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

[ "${#POSITIONAL[@]}" -ge 1 ] && [ "${#POSITIONAL[@]}" -le 2 ] || {
  print_usage >&2
  exit 1
}

WIKI_ROOT="${POSITIONAL[0]}"
OUTPUT_ARG="${POSITIONAL[1]:-}"

if [ -n "$OUTPUT_ARG" ] && [ -z "$STYLE" ]; then
  STYLE="classic"
elif [ -z "$STYLE" ]; then
  STYLE="all"
fi

case "$STYLE" in
  classic|paper|wash|all) ;;
  *)
    die "--style 仅支持 classic、paper、wash、all"
    ;;
esac

[ "$STYLE" = "all" ] && [ -n "$OUTPUT_ARG" ] && \
  die "--style all 会同时生成三份 HTML，不接受单独 output_html"

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

WIKI_TITLE=$(jq -r '.meta.wiki_title // "知识库"' "$DATA")
NODE_COUNT=$(jq -r '.meta.total_nodes // 0' "$DATA")
EDGE_COUNT=$(jq -r '.meta.total_edges // 0' "$DATA")
BUILD_DATE=$(jq -r '.meta.build_date // ""' "$DATA")
BUILD_DATE_SHORT="${BUILD_DATE:0:10}"
[ -n "$BUILD_DATE_SHORT" ] || BUILD_DATE_SHORT="未知"

HEADER=""
FOOTER=""
OUTPUT_DEFAULT=""
ASSET_SPECS=()
GENERATED_OUTPUTS=()

prepare_style() {
  local style="$1"

  case "$style" in
    classic)
      HEADER="$TEMPLATES_DIR/graph-template-header.html"
      FOOTER="$TEMPLATES_DIR/graph-template-footer.html"
      OUTPUT_DEFAULT="$WIKI_ROOT/wiki/knowledge-graph.html"
      ASSET_SPECS=(
        "$TEMPLATES_DIR/vis-network.min.js|vis-network.min.js"
        "$TEMPLATES_DIR/marked.min.js|marked.min.js"
        "$TEMPLATES_DIR/purify.min.js|purify.min.js"
        "$TEMPLATES_DIR/LICENSE-vis-network.txt|LICENSE-vis-network.txt"
        "$TEMPLATES_DIR/LICENSE-marked.txt|LICENSE-marked.txt"
        "$TEMPLATES_DIR/LICENSE-purify.txt|LICENSE-purify.txt"
      )
      ;;
    paper)
      HEADER="$TEMPLATES_DIR/graph-styles/paper/header.html"
      FOOTER="$TEMPLATES_DIR/graph-styles/paper/footer.html"
      OUTPUT_DEFAULT="$WIKI_ROOT/wiki/knowledge-graph-paper.html"
      ASSET_SPECS=(
        "$DEPS_DIR/d3.min.js|d3.min.js"
        "$DEPS_DIR/rough.min.js|rough.min.js"
        "$DEPS_DIR/marked.min.js|marked.min.js"
        "$DEPS_DIR/purify.min.js|purify.min.js"
        "$DEPS_DIR/LICENSE-d3.txt|LICENSE-d3.txt"
        "$DEPS_DIR/LICENSE-roughjs.txt|LICENSE-roughjs.txt"
        "$DEPS_DIR/LICENSE-marked.txt|LICENSE-marked.txt"
        "$DEPS_DIR/LICENSE-purify.txt|LICENSE-purify.txt"
        "$TEMPLATES_DIR/graph-styles/paper/graph-paper.js|graph-paper.js"
      )
      ;;
    wash)
      HEADER="$TEMPLATES_DIR/graph-styles/wash/header.html"
      FOOTER="$TEMPLATES_DIR/graph-styles/wash/footer.html"
      OUTPUT_DEFAULT="$WIKI_ROOT/wiki/knowledge-graph-wash.html"
      ASSET_SPECS=(
        "$DEPS_DIR/d3.min.js|d3.min.js"
        "$DEPS_DIR/rough.min.js|rough.min.js"
        "$DEPS_DIR/marked.min.js|marked.min.js"
        "$DEPS_DIR/purify.min.js|purify.min.js"
        "$DEPS_DIR/LICENSE-d3.txt|LICENSE-d3.txt"
        "$DEPS_DIR/LICENSE-roughjs.txt|LICENSE-roughjs.txt"
        "$DEPS_DIR/LICENSE-marked.txt|LICENSE-marked.txt"
        "$DEPS_DIR/LICENSE-purify.txt|LICENSE-purify.txt"
        "$TEMPLATES_DIR/graph-styles/wash/graph-wash.js|graph-wash.js"
      )
      ;;
  esac
}

copy_assets() {
  local output_dir="$1"
  local spec src name

  for spec in "${ASSET_SPECS[@]}"; do
    src="${spec%%|*}"
    name="${spec#*|}"
    ensure_vendor "$src"
    cp "$src" "$output_dir/$name"
  done
}

build_one() {
  local style="$1"
  local output="$2"
  local output_dir output_tmp

  prepare_style "$style"
  [ -n "$output" ] || output="$OUTPUT_DEFAULT"

  ensure_template "$HEADER"
  ensure_template "$FOOTER"

  output_dir="$(dirname "$output")"
  mkdir -p "$output_dir"
  output_tmp="$output.partial"
  rm -f "$output_tmp"

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

  perl -pe 's|</script>|<\\/script>|gi' "$DATA" >> "$output_tmp"
  cat "$FOOTER" >> "$output_tmp"

  mv "$output_tmp" "$output"
  copy_assets "$output_dir"
  GENERATED_OUTPUTS+=("$output")
}

if [ "$STYLE" = "all" ]; then
  build_one classic ""
  build_one paper ""
  build_one wash ""
else
  build_one "$STYLE" "$OUTPUT_ARG"
fi

echo "交互式图谱已生成："
for output in "${GENERATED_OUTPUTS[@]}"; do
  output_size=$(wc -c < "$output" | tr -d ' ')
  output_kb=$((output_size / 1024))
  echo "  - $output (${output_kb} KB)"
done
echo "  节点 $NODE_COUNT · 关联 $EDGE_COUNT"
echo ""
echo "查看方式："
if [ "${#GENERATED_OUTPUTS[@]}" -gt 1 ]; then
  echo "  1. 推荐双击三个 HTML，对比 classic / paper / wash 三种风格"
else
  echo "  1. 双击 ${GENERATED_OUTPUTS[0]}"
fi
echo "     （建议 Chrome / Firefox；Safari 可能因 file:// 策略拒绝本地脚本）"
OUTPUT_DIR="$(dirname "${GENERATED_OUTPUTS[0]}")"
echo "  2. 如浏览器拒绝本地脚本，在 $OUTPUT_DIR 下跑："
echo "       python3 -m http.server 8000"
echo "     再访问："
for output in "${GENERATED_OUTPUTS[@]}"; do
  echo "       http://localhost:8000/$(basename "$output")"
done
