#!/bin/bash
# Regression: build-graph-data.sh should upgrade edge type from default EXTRACTED
# to explicit INFERRED / AMBIGUOUS when the same (from, to) pair is referenced
# multiple times within a single source file.
#
# Motivates fix for:
#   scripts/build-graph-data.sh edge-merge awk block —
#   previously the condition `saved_conf[key] == ""` was always false once the
#   key had been seen (because the ternary in the same branch always filled
#   it with "EXTRACTED" or the current conf), so the first occurrence locked
#   the edge type forever. Any later `<!-- confidence: INFERRED -->` annotation
#   on the same [[link]] in subsequent lines was silently ignored.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/build-graph-data.sh"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

test_explicit_confidence_overrides_default_on_same_page() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    # A.md: first reference to B has no annotation (default EXTRACTED),
    # later reference in the 相关页面 list carries explicit INFERRED.
    # Before the fix, first occurrence locks type to EXTRACTED forever.
    cat > "$tmp_dir/wiki/entities/A.md" <<'EOF'
---
tags: [test]
---

# A

正文中提到 [[B]] 是一个相关的模块。

## 相关页面

- [[B]] <!-- confidence: INFERRED --> — 推断关联
EOF

    cat > "$tmp_dir/wiki/entities/B.md" <<'EOF'
---
tags: [test]
---

# B

## 相关页面

- [[A]] <!-- confidence: INFERRED --> — 推断关联
EOF

    # Minimal purpose.md so build-graph-data doesn't bail
    cat > "$tmp_dir/purpose.md" <<'EOF'
# 研究目的
test
EOF

    LLM_WIKI_TEST_MODE=1 \
        bash "$SCRIPT" "$tmp_dir" "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on fixture"

    local a_to_b_type b_to_a_type
    a_to_b_type=$(jq -r '.edges[] | select(.from == "A" and .to == "B") | .type' "$tmp_dir/graph-data.json")
    b_to_a_type=$(jq -r '.edges[] | select(.from == "B" and .to == "A") | .type' "$tmp_dir/graph-data.json")

    [ "$a_to_b_type" = "INFERRED" ] \
        || fail "A→B should be INFERRED after merging (default + explicit INFERRED on same page), got: $a_to_b_type"

    [ "$b_to_a_type" = "INFERRED" ] \
        || fail "B→A should be INFERRED (only one reference, explicitly annotated), got: $b_to_a_type"
}

test_ambiguous_overrides_default_when_mixed() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    # X.md references Y multiple times: plain body + AMBIGUOUS annotation
    cat > "$tmp_dir/wiki/entities/X.md" <<'EOF'
---
tags: [test]
---

# X

See [[Y]] in context.
Also mention [[Y]] again.

## 相关页面

- [[Y]] <!-- confidence: AMBIGUOUS --> — 待确认
EOF

    cat > "$tmp_dir/wiki/entities/Y.md" <<'EOF'
---
tags: [test]
---

# Y

## 相关页面

- [[X]]
EOF

    cat > "$tmp_dir/purpose.md" <<'EOF'
# 研究目的
test
EOF

    LLM_WIKI_TEST_MODE=1 \
        bash "$SCRIPT" "$tmp_dir" "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on fixture"

    local x_to_y_type
    x_to_y_type=$(jq -r '.edges[] | select(.from == "X" and .to == "Y") | .type' "$tmp_dir/graph-data.json")

    [ "$x_to_y_type" = "AMBIGUOUS" ] \
        || fail "X→Y should be AMBIGUOUS (default + default + AMBIGUOUS merge), got: $x_to_y_type"
}

test_default_extracted_when_no_annotation() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    cat > "$tmp_dir/wiki/entities/P.md" <<'EOF'
---
tags: [test]
---

# P

See [[Q]].

## 相关页面

- [[Q]]
EOF

    cat > "$tmp_dir/wiki/entities/Q.md" <<'EOF'
---
tags: [test]
---

# Q

## 相关页面

- [[P]]
EOF

    cat > "$tmp_dir/purpose.md" <<'EOF'
# 研究目的
test
EOF

    LLM_WIKI_TEST_MODE=1 \
        bash "$SCRIPT" "$tmp_dir" "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on fixture"

    local p_to_q_type
    p_to_q_type=$(jq -r '.edges[] | select(.from == "P" and .to == "Q") | .type' "$tmp_dir/graph-data.json")

    [ "$p_to_q_type" = "EXTRACTED" ] \
        || fail "P→Q should default to EXTRACTED when no annotation exists, got: $p_to_q_type"
}

test_first_explicit_wins_among_multiple_explicit() {
    # When two different explicit confidence values appear for the same
    # (from, to) pair within the same page, the first-seen one should win
    # (stable + deterministic). This keeps semantics aligned with the
    # existing "first occurrence" comment in the awk block.
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    cat > "$tmp_dir/wiki/entities/M.md" <<'EOF'
---
tags: [test]
---

# M

See [[N]] <!-- confidence: INFERRED --> in the body.

## 相关页面

- [[N]] <!-- confidence: AMBIGUOUS --> — should NOT override INFERRED
EOF

    cat > "$tmp_dir/wiki/entities/N.md" <<'EOF'
---
tags: [test]
---

# N

## 相关页面

- [[M]]
EOF

    cat > "$tmp_dir/purpose.md" <<'EOF'
# 研究目的
test
EOF

    LLM_WIKI_TEST_MODE=1 \
        bash "$SCRIPT" "$tmp_dir" "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on fixture"

    local m_to_n_type
    m_to_n_type=$(jq -r '.edges[] | select(.from == "M" and .to == "N") | .type' "$tmp_dir/graph-data.json")

    [ "$m_to_n_type" = "INFERRED" ] \
        || fail "M→N should keep first explicit INFERRED, got: $m_to_n_type"
}

test_explicit_confidence_overrides_default_on_same_page
test_ambiguous_overrides_default_when_mixed
test_default_extracted_when_no_annotation
test_first_explicit_wins_among_multiple_explicit

echo "PASS: graph-data-confidence-merge.regression-1"
