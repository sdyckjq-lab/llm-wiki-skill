#!/bin/bash
# build-graph-data.sh — 扫描 wiki/ 生成交互式图谱所需的 graph-data.json
#
# 用法：bash scripts/build-graph-data.sh <wiki_root> [output_path]
#   wiki_root     包含 wiki/ 子目录的知识库根路径
#   output_path   可选，默认 <wiki_root>/wiki/graph-data.json
#
# 环境变量：
#   LLM_WIKI_TEST_MODE=1   启用稳定输出（nodes/edges 按 id 字典序 + 时间戳固定）
#
# 退出码：0 成功；1 路径/依赖错误；2 wiki 结构不完整

set -eu
shopt -s nullglob

WIKI_ROOT="${1:-.}"
DEFAULT_OUTPUT="$WIKI_ROOT/wiki/graph-data.json"
OUTPUT="${2:-$DEFAULT_OUTPUT}"

command -v jq >/dev/null 2>&1 || {
  echo "ERROR: jq 未安装。运行 brew install jq" >&2
  exit 1
}

WIKI_DIR="$WIKI_ROOT/wiki"
[ -d "$WIKI_DIR" ] || {
  echo "ERROR: wiki 目录不存在：$WIKI_DIR" >&2
  echo "       请先运行 init-wiki.sh 初始化知识库。" >&2
  exit 2
}

TMPDIR=$(mktemp -d -t llm-wiki-graph.XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

# ─── 1. 构建时间戳 ────────────────────────────────────────────
if [ "${LLM_WIKI_TEST_MODE:-0}" = "1" ]; then
  BUILD_DATE="2026-01-01T00:00:00Z"
else
  BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

# ─── 2. wiki_title（优先 purpose.md 第一个 # 标题，否则用目录名）───
WIKI_TITLE=""
if [ -f "$WIKI_ROOT/purpose.md" ]; then
  WIKI_TITLE=$(awk '/^# / { sub(/^# +/, ""); print; exit }' "$WIKI_ROOT/purpose.md")
fi
[ -n "$WIKI_TITLE" ] || WIKI_TITLE=$(basename "$(cd "$WIKI_ROOT" && pwd)")

# ─── 3. 扫描所有 md 节点 ──────────────────────────────────────
# nodes.tsv 字段：id<TAB>label<TAB>type<TAB>abs_path
NODES_TSV="$TMPDIR/nodes.tsv"
: > "$NODES_TSV"

scan_kind() {
  local subdir="$1" type="$2"
  local dir="$WIKI_DIR/$subdir"
  [ -d "$dir" ] || return 0
  local f id label
  # 用 find + sort 保证跨平台稳定顺序（macOS/Linux 默认 glob 顺序不同）
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    id=$(basename "$f" .md)
    case "$id" in
      index|log|purpose|.wiki-schema|README) continue ;;
    esac
    label=$(awk '/^# / { sub(/^# +/, ""); gsub(/[[:space:]]+$/, ""); print; exit }' "$f")
    [ -n "$label" ] || label="$id"
    printf '%s\t%s\t%s\t%s\n' "$id" "$label" "$type" "$f" >> "$NODES_TSV"
  done < <(find "$dir" -type f -name '*.md' | LC_ALL=C sort)
}

scan_kind entities    entity
scan_kind topics      topic
scan_kind sources     source
scan_kind comparisons comparison
scan_kind synthesis   synthesis
scan_kind queries     query

if [ ! -s "$NODES_TSV" ]; then
  # 空图谱：输出合法 JSON（footer.html 的 EMPTY 状态会接管）
  jq -n \
    --arg build_date "$BUILD_DATE" \
    --arg wiki_title "$WIKI_TITLE" \
    '{
      meta: {
        build_date: $build_date,
        wiki_title: $wiki_title,
        total_nodes: 0,
        total_edges: 0,
        initial_view: []
      },
      nodes: [],
      edges: []
    }' > "$OUTPUT"
  echo "空图谱已写入：${OUTPUT}（wiki/ 下无可纳入节点）"
  exit 0
fi

# ─── 4. 扫描每个节点内的 [[wikilink]] ─────────────────────────
# edges_raw.tsv 字段：from_id<TAB>from_line<TAB>to_target<TAB>line_has_confidence_kind
EDGES_RAW="$TMPDIR/edges_raw.tsv"
: > "$EDGES_RAW"

# 用 awk 同行解析 [[link]] 和 <!-- confidence: X -->
while IFS=$'\t' read -r id label type path; do
  awk -v src="$id" '
    {
      line = $0
      # 提取同行 confidence 注释（若有）
      conf = ""
      if (match(line, /<!--[[:space:]]*confidence:[[:space:]]*[A-Z]+[[:space:]]*-->/)) {
        kind_str = substr(line, RSTART, RLENGTH)
        if (match(kind_str, /[A-Z]+/)) {
          conf = substr(kind_str, RSTART, RLENGTH)
        }
      }
      # 逐个抓 [[...]]
      rest = line
      while (match(rest, /\[\[[^]]+\]\]/)) {
        inner = substr(rest, RSTART+2, RLENGTH-4)
        rest  = substr(rest, RSTART+RLENGTH)
        # 处理 [[target|label]] — 只取 target
        n = index(inner, "|")
        if (n > 0) inner = substr(inner, 1, n-1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", inner)
        if (inner == "" || inner == src) continue
        print src "\t" NR "\t" inner "\t" conf
      }
    }
  ' "$path" >> "$EDGES_RAW"
done < "$NODES_TSV"

# ─── 5. 建立有效节点 id 的集合（死链不纳入 edges） ────────────
VALID_IDS="$TMPDIR/valid_ids.txt"
cut -f1 "$NODES_TSV" | sort -u > "$VALID_IDS"

# ─── 6. 生成 edges.tsv（from<TAB>to<TAB>type） ──────────────
# 规则：
#   - 若同行 confidence 注释存在 → type = 该注释值
#   - 否则 type = EXTRACTED
#   - 死链（to 不在 VALID_IDS）丢弃
#   - 同 from+to 的重复边按首次出现保留（优先取有 confidence 的那条）
EDGES_TSV="$TMPDIR/edges.tsv"
awk -F'\t' -v valids="$VALID_IDS" '
  BEGIN {
    while ((getline line < valids) > 0) valid[line] = 1
    close(valids)
  }
  {
    from = $1; to = $3; conf = $4
    if (!(to in valid)) next
    if (from == to) next
    key = from "\t" to
    if (!(key in seen) || (conf != "" && saved_conf[key] == "")) {
      seen[key] = 1
      saved_conf[key] = (conf != "" ? conf : (saved_conf[key] == "" ? "EXTRACTED" : saved_conf[key]))
      order[++count] = key
    }
  }
  END {
    for (i = 1; i <= count; i++) {
      split(order[i], parts, "\t")
      t = saved_conf[order[i]]
      if (t != "EXTRACTED" && t != "INFERRED" && t != "AMBIGUOUS") t = "EXTRACTED"
      print parts[1] "\t" parts[2] "\t" t
    }
  }
' "$EDGES_RAW" > "$EDGES_TSV"

# ─── 7. 社区聚类（topic 页 → 其链接到的节点属于该 topic 社区）
# 对每个节点：遍历所有 topic，选 link 次数最多的那个作为 primary community
COMMUNITY_TSV="$TMPDIR/community.tsv"
awk -F'\t' '
  NR==FNR { if ($3 == "topic") topics[$1] = 1; next }
  {
    if (topics[$1]) {
      # 这是 topic → target 的链接
      print $3 "\t" $1  # node_id, topic_id
    }
  }
' "$NODES_TSV" "$EDGES_RAW" > "$COMMUNITY_TSV"

NODE_COMMUNITY="$TMPDIR/node_community.tsv"
awk -F'\t' '
  { count[$1 "|" $2]++ }
  END {
    for (key in count) {
      split(key, parts, "|")
      node = parts[1]; topic = parts[2]; n = count[key]
      if (n > best[node] || (n == best[node] && topic < best_topic[node])) {
        best[node] = n
        best_topic[node] = topic
      }
    }
    for (n in best_topic) print n "\t" best_topic[n]
  }
' "$COMMUNITY_TSV" > "$NODE_COMMUNITY"

# 给每个 topic 自己分配社区 id = 自己
awk -F'\t' '$3 == "topic" { print $1 "\t" $1 }' "$NODES_TSV" >> "$NODE_COMMUNITY"

# 去重
sort -u "$NODE_COMMUNITY" -o "$NODE_COMMUNITY"

# ─── 8. 决定是否降级（总 content > 2MB 截 500 行/节点）────────
TOTAL_SIZE=0
while IFS=$'\t' read -r id label type path; do
  sz=$(wc -c < "$path" 2>/dev/null || echo 0)
  TOTAL_SIZE=$((TOTAL_SIZE + sz))
done < "$NODES_TSV"
DEGRADE=0
if [ "$TOTAL_SIZE" -gt $((2 * 1024 * 1024)) ]; then
  DEGRADE=1
fi

# ─── 9. 组装 nodes 数组（每个节点一行 JSON） ──────────────────
NODES_JSONL="$TMPDIR/nodes.jsonl"
: > "$NODES_JSONL"

while IFS=$'\t' read -r id label type path; do
  # 查社区
  community=$(awk -F'\t' -v n="$id" '$1 == n { print $2; exit }' "$NODE_COMMUNITY")
  # 读 content
  if [ "$DEGRADE" = "1" ]; then
    content=$(head -500 "$path")
  else
    content=$(cat "$path")
  fi
  abs_path=$(cd "$(dirname "$path")" && pwd)/$(basename "$path")

  jq -n \
    --arg id "$id" \
    --arg label "$label" \
    --arg type "$type" \
    --arg community "$community" \
    --arg content "$content" \
    --arg source_path "$abs_path" \
    '{
      id: $id,
      label: $label,
      type: $type,
      community: ($community | if . == "" then null else . end),
      content: $content,
      source_path: $source_path
    }' >> "$NODES_JSONL"
done < "$NODES_TSV"

# ─── 10. 组装 edges 数组 ──────────────────────────────────────
EDGES_JSONL="$TMPDIR/edges.jsonl"
: > "$EDGES_JSONL"

idx=0
while IFS=$'\t' read -r from to etype; do
  idx=$((idx + 1))
  jq -n \
    --arg id "e$idx" \
    --arg from "$from" \
    --arg to "$to" \
    --arg etype "$etype" \
    '{id: $id, from: $from, to: $to, type: $etype}' >> "$EDGES_JSONL"
done < "$EDGES_TSV"

# ─── 11. 按 TEST_MODE 排序（稳定 diff）────────────────────────
# TEST_MODE 下还要给 edge 重新按 sorted 顺序赋连续 id，避免 scan 顺序影响
if [ "${LLM_WIKI_TEST_MODE:-0}" = "1" ]; then
  jq -s 'sort_by(.id)' "$NODES_JSONL" > "$TMPDIR/nodes.sorted.json"
  jq -s 'sort_by(.from, .to, .type)
         | to_entries
         | map(.value + {id: ("e" + ((.key + 1) | tostring))})' \
         "$EDGES_JSONL" > "$TMPDIR/edges.sorted.json"
else
  jq -s '.' "$NODES_JSONL" > "$TMPDIR/nodes.sorted.json"
  jq -s '.' "$EDGES_JSONL" > "$TMPDIR/edges.sorted.json"
fi

# ─── 12. U2 算法：initial_view top 30 ────────────────────────
# 步骤：按社区分组 → 每社区取度数最高 1 个 → 不足 30 按全图度数降序补齐
INITIAL_VIEW=$(
  jq \
    --argjson nodes "$(cat "$TMPDIR/nodes.sorted.json")" \
    '
    # $nodes 是节点数组；输入是 edges 数组
    . as $edges
    | ($nodes | map(.id) | length) as $total_nodes
    | (
        # 计算每个节点的 degree
        reduce $edges[] as $e (
          {}; .[$e.from] = (.[$e.from] // 0) + 1 | .[$e.to] = (.[$e.to] // 0) + 1
        )
      ) as $deg
    | ($nodes | group_by(.community // "_")) as $groups
    | (
        [ $groups[] | max_by(($deg[.id] // 0)) | .id ]
      ) as $reps
    | (
        $nodes
        | sort_by(- ($deg[.id] // 0))
        | map(.id)
        | map(select(. as $x | $reps | index($x) | not))
      ) as $rest
    | ($reps + $rest)[0:30]
    ' \
    "$TMPDIR/edges.sorted.json"
)

# ─── 13. 最终组装 ────────────────────────────────────────────
NODE_COUNT=$(jq 'length' "$TMPDIR/nodes.sorted.json")
EDGE_COUNT=$(jq 'length' "$TMPDIR/edges.sorted.json")

mkdir -p "$(dirname "$OUTPUT")"

jq -n \
  --arg build_date "$BUILD_DATE" \
  --arg wiki_title "$WIKI_TITLE" \
  --argjson total_nodes "$NODE_COUNT" \
  --argjson total_edges "$EDGE_COUNT" \
  --argjson initial_view "$INITIAL_VIEW" \
  --argjson nodes "$(cat "$TMPDIR/nodes.sorted.json")" \
  --argjson edges "$(cat "$TMPDIR/edges.sorted.json")" \
  --argjson degraded "$DEGRADE" \
  '{
    meta: {
      build_date: $build_date,
      wiki_title: $wiki_title,
      total_nodes: $total_nodes,
      total_edges: $total_edges,
      initial_view: $initial_view,
      degraded: ($degraded == 1)
    },
    nodes: $nodes,
    edges: $edges
  }' > "$OUTPUT"

echo "图谱数据已生成：$OUTPUT"
echo "  节点：$NODE_COUNT"
echo "  关联：$EDGE_COUNT"
echo "  初始视图：$(echo "$INITIAL_VIEW" | jq 'length') 个节点"
[ "$DEGRADE" = "1" ] && echo "  ⚠ 降级模式：内嵌内容 > 2MB，每节点仅保留前 500 行"
exit 0
