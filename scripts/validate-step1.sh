#!/bin/bash
# 验证 ingest Step 1 的 JSON 输出格式
# 用法：bash validate-step1.sh <json_file>
# 返回：0 = 格式正确，1 = 格式有问题（触发回退）

JSON_FILE="$1"

# 参数检查
[ -z "$1" ] && { echo "ERROR: usage: validate-step1.sh <json_file>"; exit 1; }

# 检查 jq 是否可用（必需依赖）
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found. Run: brew install jq"; exit 1; }

# 检查文件是否存在
[ -f "$JSON_FILE" ] || { echo "ERROR: file not found: $JSON_FILE"; exit 1; }

# 检查是否是有效 JSON
jq empty "$JSON_FILE" 2>/dev/null || { echo "ERROR: invalid JSON format"; exit 1; }

# 检查必需字段存在且类型正确
jq -e '.entities | type == "array"' "$JSON_FILE" >/dev/null 2>&1 || { echo "ERROR: 'entities' must be an array"; exit 1; }
jq -e '.topics | type == "array"' "$JSON_FILE" >/dev/null 2>&1 || { echo "ERROR: 'topics' must be an array"; exit 1; }
jq -e '.connections | type == "array"' "$JSON_FILE" >/dev/null 2>&1 || { echo "ERROR: 'connections' must be an array"; exit 1; }
jq -e '.contradictions | type == "array"' "$JSON_FILE" >/dev/null 2>&1 || { echo "ERROR: 'contradictions' must be an array"; exit 1; }
jq -e '.new_vs_existing | type == "object"' "$JSON_FILE" >/dev/null 2>&1 || { echo "ERROR: 'new_vs_existing' must be an object"; exit 1; }

# 检查每个 entity 的必需子字段
VALID_CONFIDENCE="EXTRACTED|INFERRED|AMBIGUOUS|UNVERIFIED"

ENTITY_COUNT=$(jq '.entities | length' "$JSON_FILE" 2>/dev/null)
if [ "$ENTITY_COUNT" -gt 0 ] 2>/dev/null; then
    # name, type, confidence 必须存在且非空
    BAD_ENTITY_COUNT=$(jq '
        [.entities[] | select(
            (.name // "" | length) == 0 or
            (.type // "" | length) == 0 or
            (.confidence // "" | length) == 0
        )] | length
    ' "$JSON_FILE" 2>/dev/null)
    if [ "$BAD_ENTITY_COUNT" -gt 0 ] 2>/dev/null; then
        echo "ERROR: $BAD_ENTITY_COUNT entity/entities missing required fields (name/type/confidence)"
        exit 1
    fi

    # confidence 值必须是四个有效值之一
    INVALID=$(jq -r '.entities[]? | (.confidence // "MISSING")' "$JSON_FILE" 2>/dev/null | \
        grep -v -E "^($VALID_CONFIDENCE)$" | head -3)
    if [ -n "$INVALID" ]; then
        echo "ERROR: invalid entity confidence value(s): $INVALID"
        echo "       Valid values: EXTRACTED | INFERRED | AMBIGUOUS | UNVERIFIED"
        exit 1
    fi
fi

# 检查每个 topic 的必需子字段
TOPIC_COUNT=$(jq '.topics | length' "$JSON_FILE" 2>/dev/null)
if [ "$TOPIC_COUNT" -gt 0 ] 2>/dev/null; then
    BAD_TOPIC_COUNT=$(jq '
        [.topics[] | select(
            (.name // "" | length) == 0
        )] | length
    ' "$JSON_FILE" 2>/dev/null)
    if [ "$BAD_TOPIC_COUNT" -gt 0 ] 2>/dev/null; then
        echo "ERROR: $BAD_TOPIC_COUNT topic(s) missing required 'name' field"
        exit 1
    fi
fi

# 检查每个 connection 的必需子字段（from, to, confidence）
CONN_COUNT=$(jq '.connections | length' "$JSON_FILE" 2>/dev/null)
if [ "$CONN_COUNT" -gt 0 ] 2>/dev/null; then
    BAD_CONN_COUNT=$(jq '
        [.connections[] | select(
            (.from // "" | length) == 0 or
            (.to // "" | length) == 0 or
            (.confidence // "" | length) == 0
        )] | length
    ' "$JSON_FILE" 2>/dev/null)
    if [ "$BAD_CONN_COUNT" -gt 0 ] 2>/dev/null; then
        echo "ERROR: $BAD_CONN_COUNT connection(s) missing required fields (from/to/confidence)"
        exit 1
    fi

    INVALID_CONN_CONF=$(jq -r '.connections[]? | (.confidence // "MISSING")' "$JSON_FILE" 2>/dev/null | \
        grep -v -E "^($VALID_CONFIDENCE)$" | head -3)
    if [ -n "$INVALID_CONN_CONF" ]; then
        echo "ERROR: invalid connection confidence value(s): $INVALID_CONN_CONF"
        echo "       Valid values: EXTRACTED | INFERRED | AMBIGUOUS | UNVERIFIED"
        exit 1
    fi
fi

echo "OK: Step 1 JSON validation passed"
exit 0
