#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file_contains() {
    local file="$1"
    local text="$2"

    if ! grep -F -- "$text" "$file" > /dev/null; then
        fail "Expected $file to contain: $text"
    fi
}

assert_file_not_contains() {
    local file="$1"
    local text="$2"

    if grep -F -- "$text" "$file" > /dev/null; then
        fail "Expected $file to not contain: $text"
    fi
}

assert_text_contains() {
    local text="$1"
    local expected="$2"

    if ! printf '%s' "$text" | grep -F -- "$expected" > /dev/null; then
        fail "Expected output to contain: $expected"
    fi
}

assert_text_not_contains() {
    local text="$1"
    local unexpected="$2"

    if printf '%s' "$text" | grep -F -- "$unexpected" > /dev/null; then
        fail "Expected output to not contain: $unexpected"
    fi
}

assert_path_exists() {
    local path="$1"

    [ -e "$path" ] || fail "Expected path to exist: $path"
}

each_registry_label() {
    local category="$1"

    bash "$REPO_ROOT/scripts/source-registry.sh" list-by-category "$category" \
        | awk -F '\t' 'NF { print $2 }'
}

assert_registry_labels_present_in_text() {
    local text="$1"
    local category="$2"
    local label

    while IFS= read -r label; do
        [ -n "$label" ] || continue
        assert_text_contains "$text" "$label"
    done <<EOF
$(each_registry_label "$category")
EOF
}

assert_registry_labels_present_in_file() {
    local file="$1"
    local category="$2"
    local label

    while IFS= read -r label; do
        [ -n "$label" ] || continue
        assert_file_contains "$file" "$label"
    done <<EOF
$(each_registry_label "$category")
EOF
}

make_stub() {
    local path="$1"
    local body="$2"

    printf '%s\n' "$body" > "$path"
    chmod +x "$path"
}

make_legacy_wiki() {
    local wiki_root="$1"

    mkdir -p "$wiki_root"/raw/{articles,tweets,wechat,pdfs,notes,assets}
    mkdir -p "$wiki_root"/wiki/{entities,topics,sources,comparisons,synthesis}

    cat > "$wiki_root/.wiki-schema.md" <<'EOF'
# Wiki Schema（知识库配置规范）

- 主题：旧知识库
- 创建日期：2026-04-01
EOF

    printf '# 索引\n' > "$wiki_root/index.md"
    printf '# 日志\n' > "$wiki_root/log.md"
    printf '# 总览\n' > "$wiki_root/wiki/overview.md"
}

test_setup_runs_on_bash_3_2() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills" "$tmp_dir/bin"

    make_stub "$tmp_dir/bin/bun" "#!/bin/sh
printf '%s\n' bun >> \"$tmp_dir/tool.log\"
mkdir -p node_modules
exit 0"

    make_stub "$tmp_dir/bin/lsof" '#!/bin/sh
exit 1'

    make_stub "$tmp_dir/bin/uv" "#!/bin/sh
printf '%s\n' uv >> \"$tmp_dir/tool.log\"
exit 0"

    output="$(
        HOME="$tmp_dir/home" \
        PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
        bash "$REPO_ROOT/setup.sh" 2>&1
    )" || fail "setup.sh should run successfully under bash 3.2"

    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki/SKILL.md"
    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki-upgrade/SKILL.md"
    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki/deps/baoyu-url-to-markdown"
    [ ! -d "$tmp_dir/home/.claude/skills/baoyu-url-to-markdown" ] || fail "Did not expect optional adapters to be enabled by default"
    [ ! -f "$tmp_dir/tool.log" ] || fail "Did not expect bun or uv to run for core-only setup"

    assert_text_contains "$output" "当前只准备了知识库核心主线"
    assert_text_contains "$output" "--with-optional-adapters"
    assert_text_contains "$output" "/llm-wiki-upgrade"
}

test_install_with_optional_adapters_bootstraps_dependencies() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills" "$tmp_dir/bin"

    make_stub "$tmp_dir/bin/bun" '#!/bin/sh
mkdir -p node_modules
exit 0'

    make_stub "$tmp_dir/bin/lsof" '#!/bin/sh
exit 1'

    make_stub "$tmp_dir/bin/uv" "#!/bin/sh
printf '%s\n' \"\$*\" >> \"$tmp_dir/uv.log\"
printf '%s\n' '#!/bin/sh' 'exit 0' > \"$tmp_dir/bin/wechat-article-to-markdown\"
chmod +x \"$tmp_dir/bin/wechat-article-to-markdown\"
exit 0"

    output="$(
        HOME="$tmp_dir/home" \
        PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
        bash "$REPO_ROOT/install.sh" --platform claude --with-optional-adapters 2>&1
    )" || fail "install.sh should support explicit optional adapter bootstrap"

    [ -d "$tmp_dir/home/.claude/skills/baoyu-url-to-markdown" ] || fail "Expected baoyu-url-to-markdown to be installed when explicitly enabled"
    [ -d "$tmp_dir/home/.claude/skills/youtube-transcript" ] || fail "Expected youtube-transcript to be installed when explicitly enabled"
    assert_path_exists "$tmp_dir/bin/wechat-article-to-markdown"
    assert_file_contains "$tmp_dir/uv.log" "tool install git+https://github.com/jackwener/wechat-article-to-markdown.git"

    assert_text_contains "$output" "未检测到 Chrome 调试端口 9222"
    assert_text_contains "$output" "仍可自动拉起临时浏览器"
    assert_text_contains "$output" "open -na \"Google Chrome\" --args --remote-debugging-port=9222"
    assert_text_contains "$output" "wechat-article-to-markdown 安装完成"
}

test_install_dry_run_for_claude() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --platform claude --dry-run 2>&1
    )" || fail "install.sh dry-run for Claude should succeed"

    assert_text_contains "$output" "平台：claude"
    assert_text_contains "$output" "$tmp_dir/home/.claude/skills/llm-wiki"
    assert_text_contains "$output" "--with-optional-adapters"
    assert_text_not_contains "$output" "uv tool install"
    assert_text_not_contains "$output" "bun install"
}

test_install_auto_refuses_ambiguous_platforms() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills" "$tmp_dir/home/.codex/skills"

    if output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --platform auto 2>&1
    )"; then
        fail "install.sh auto should fail when multiple platform homes are present"
    fi

    assert_text_contains "$output" "检测到多个可用平台"
    assert_text_contains "$output" "--platform"
}

test_install_openclaw_copies_bundle() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.openclaw/skills" "$tmp_dir/bin"

    make_stub "$tmp_dir/bin/bun" '#!/bin/sh
mkdir -p node_modules
exit 0'

    make_stub "$tmp_dir/bin/lsof" '#!/bin/sh
exit 1'

    HOME="$tmp_dir/home" \
    PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    bash "$REPO_ROOT/install.sh" --platform openclaw > /dev/null 2>&1 || fail "install.sh should install for OpenClaw"

    assert_path_exists "$tmp_dir/home/.openclaw/skills/llm-wiki/SKILL.md"
    assert_path_exists "$tmp_dir/home/.openclaw/skills/llm-wiki/install.sh"
    assert_path_exists "$tmp_dir/home/.openclaw/skills/llm-wiki/scripts/source-registry.sh"
    assert_path_exists "$tmp_dir/home/.openclaw/skills/llm-wiki/deps/baoyu-url-to-markdown"
    [ ! -d "$tmp_dir/home/.openclaw/skills/llm-wiki-upgrade" ] || fail "Did not expect Claude-only companion skill to be installed for OpenClaw"
    [ ! -d "$tmp_dir/home/.openclaw/skills/baoyu-url-to-markdown" ] || fail "Did not expect optional adapters to be enabled by default"
}

test_upgrade_refreshes_claude_companion_skill() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills/llm-wiki" "$tmp_dir/home/.claude/skills/llm-wiki-upgrade"
    printf '# Changelog\n\n## v2.3.0 (2026-04-15)\n' > "$tmp_dir/home/.claude/skills/llm-wiki/CHANGELOG.md"
    printf 'old\n' > "$tmp_dir/home/.claude/skills/llm-wiki-upgrade/SKILL.md"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --upgrade --platform claude 2>&1
    )" || fail "install.sh --upgrade should refresh the Claude companion skill"

    assert_text_contains "$output" "/llm-wiki-upgrade"
    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki-upgrade/SKILL.md"
    assert_file_contains "$tmp_dir/home/.claude/skills/llm-wiki-upgrade/SKILL.md" "--with-optional-adapters"
    assert_file_contains "$tmp_dir/home/.claude/skills/llm-wiki-upgrade/SKILL.md" 'bash "$TMP_DIR/llm-wiki-skill/install.sh" --upgrade --platform claude'
}

test_init_fills_language_placeholder() {
    local tmp_dir wiki_root
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/Test Wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "测试主题" "English" > /dev/null

    assert_file_contains "$wiki_root/.wiki-schema.md" "- 语言：English"
    assert_file_not_contains "$wiki_root/.wiki-schema.md" "{{LANGUAGE}}"
}

test_phase1_templates_exist() {
    assert_path_exists "$REPO_ROOT/templates/purpose-template.md"
    assert_path_exists "$REPO_ROOT/templates/purpose-en-template.md"
    assert_path_exists "$REPO_ROOT/templates/query-template.md"

    assert_file_contains "$REPO_ROOT/templates/purpose-template.md" "# 研究目的与方向"
    assert_file_contains "$REPO_ROOT/templates/purpose-template.md" "## 核心目标"
    assert_file_contains "$REPO_ROOT/templates/purpose-en-template.md" "# Research Purpose and Direction"
    assert_file_contains "$REPO_ROOT/templates/purpose-en-template.md" "## Core Goal"
    assert_file_contains "$REPO_ROOT/templates/query-template.md" "type: query"
    assert_file_contains "$REPO_ROOT/templates/query-template.md" "derived: true"
}

test_init_creates_purpose_and_cache_files() {
    local tmp_dir wiki_root
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/English Wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "测试主题" "English" > /dev/null

    assert_path_exists "$wiki_root/purpose.md"
    assert_path_exists "$wiki_root/.wiki-cache.json"
    assert_file_contains "$wiki_root/purpose.md" "# Research Purpose and Direction"
    assert_file_contains "$wiki_root/.wiki-cache.json" '"version": 1'
    assert_file_contains "$wiki_root/.wiki-cache.json" '"entries": {}'
}

test_cache_script_handles_miss_hit_and_invalidate() {
    local tmp_dir wiki_root file_path output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/cache-wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "缓存测试" "中文" > /dev/null

    file_path="$wiki_root/raw/articles/example.md"
    printf '缓存测试内容\n' > "$file_path"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$file_path" 2>&1
    )" || fail "cache.sh check should work for uncached files"
    [ "$output" = "MISS:no_entry" ] || fail "Expected initial cache check to be MISS:no_entry, got: $output"

    printf '# 来源页\n' > "$wiki_root/wiki/sources/example.md"
    bash "$REPO_ROOT/scripts/cache.sh" update "$file_path" "wiki/sources/example.md" > /dev/null 2>&1 \
        || fail "cache.sh update should succeed"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$file_path" 2>&1
    )" || fail "cache.sh check should work for cached files"
    [ "$output" = "HIT" ] || fail "Expected updated cache check to be HIT, got: $output"

    bash "$REPO_ROOT/scripts/cache.sh" invalidate "$file_path" > /dev/null 2>&1 \
        || fail "cache.sh invalidate should succeed"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$file_path" 2>&1
    )" || fail "cache.sh check should work after invalidation"
    # 自愈：invalidate 后 source 页面仍存在，stem 匹配 → HIT(repaired)
    [ "$output" = "HIT(repaired)" ] || fail "Expected invalidated cache check to be HIT(repaired), got: $output"
}

test_skill_md_phase2_init_mentions_purpose_and_cache() {
    local section
    section="$(sed -n '/## 工作流 1：init/,/## 工作流 2：ingest/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "purpose.md"
    assert_text_contains "$section" ".wiki-cache.json"
    assert_text_contains "$section" "填写核心目标和关键问题"
}

test_skill_md_phase2_ingest_mentions_two_step_cache_and_confidence() {
    local section
    section="$(sed -n '/## 工作流 2：ingest/,/## 工作流 3：batch-ingest/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" '`purpose.md` > `.wiki-schema.md` > `index.md`'
    assert_text_contains "$section" 'bash ${SKILL_DIR}/scripts/cache.sh check'
    assert_text_contains "$section" "Step 1：结构化分析"
    assert_text_contains "$section" "Step 2：页面生成"
    assert_text_contains "$section" '"confidence": "EXTRACTED"'
    assert_text_contains "$section" "<!-- confidence: UNVERIFIED -->"
    assert_text_contains "$section" "页面顶部加注释说明本次处理因格式问题降级"
}

test_skill_md_phase2_batch_ingest_mentions_cache_skip_summary() {
    local section
    section="$(sed -n '/## 工作流 3：batch-ingest/,/## 工作流 4：query/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" '每个文件先 `cache check`'
    assert_text_contains "$section" "已跳过 N 个（无变化），处理 M 个（新增/更新）"
}

test_skill_md_phase2_status_mentions_purpose_presence() {
    local section
    section="$(sed -n '/## 工作流 6：status/,/## 工作流 7：digest/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "purpose.md 是否存在"
}

test_skill_md_phase2_has_delete_workflow_and_route() {
    local route_section delete_section
    route_section="$(sed -n '/## 工作流路由/,/## 通用前置检查/p' "$REPO_ROOT/SKILL.md")"
    delete_section="$(sed -n '/## 工作流 9：delete/,$p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$route_section" '"删除素材"、"remove"、"delete source"、"移除"'
    assert_text_contains "$route_section" "→ **delete**"
    assert_text_contains "$delete_section" "影响超过 5 个页面时"
    assert_text_contains "$delete_section" 'bash ${SKILL_DIR}/scripts/delete-helper.sh scan-refs'
    assert_text_contains "$delete_section" "cache.sh invalidate"
}

test_delete_helper_scans_reference_files() {
    local tmp_dir wiki_root output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/delete-wiki"
    mkdir -p "$wiki_root"/raw/articles
    mkdir -p "$wiki_root"/wiki/{sources,entities,topics}

    printf '原文\n' > "$wiki_root/raw/articles/2024-01-15-ai-article.md"
    cat > "$wiki_root/wiki/sources/2024-01-15-ai-article.md" <<'EOF'
---
sources: ["raw/articles/2024-01-15-ai-article.md"]
---

[source: AI 文章](../raw/articles/2024-01-15-ai-article.md)
EOF
    printf '见 raw/articles/2024-01-15-ai-article.md\n' > "$wiki_root/wiki/entities/AI-Agent.md"
    printf '引用 [source: AI 文章](../raw/articles/2024-01-15-ai-article.md)\n' > "$wiki_root/wiki/topics/大语言模型.md"

    output="$(
        bash "$REPO_ROOT/scripts/delete-helper.sh" scan-refs "$wiki_root" "2024-01-15-ai-article.md" 2>&1
    )" || fail "delete-helper scan-refs should succeed"

    assert_text_contains "$output" "wiki/entities/AI-Agent.md"
    assert_text_contains "$output" "wiki/sources/2024-01-15-ai-article.md"
    assert_text_contains "$output" "wiki/topics/大语言模型.md"
}

test_skill_md_phase3_query_mentions_persistence_and_duplicate_handling() {
    local section
    section="$(sed -n '/## 工作流 4：query/,/## 工作流 5：lint/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "wiki/queries/{date}-{short-hash}.md"
    assert_text_contains "$section" "derived: true"
    assert_text_contains "$section" "引用了 3 个及以上来源"
    assert_text_contains "$section" "通过 frontmatter tags 和 title 匹配"
    assert_text_contains "$section" "superseded-by"
    assert_text_contains "$section" "不作为主要知识来源"
}

test_hook_session_start_outputs_context_when_wiki_exists() {
    local tmp_dir output wiki_root
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/my-wiki"
    mkdir -p "$tmp_dir/home" "$wiki_root"
    printf '# schema\n' > "$wiki_root/.wiki-schema.md"
    printf '# index\n' > "$wiki_root/index.md"
    printf '%s\n' "$wiki_root" > "$tmp_dir/home/.llm-wiki-path"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/scripts/hook-session-start.sh" 2>&1
    )" || fail "hook-session-start.sh should succeed when wiki exists"

    assert_text_contains "$output" "hookSpecificOutput"
    assert_text_contains "$output" "SessionStart"
    assert_text_contains "$output" "[llm-wiki] 检测到知识库"
}

test_hook_session_start_returns_empty_json_without_wiki() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/scripts/hook-session-start.sh" 2>&1
    )" || fail "hook-session-start.sh should succeed without wiki"

    [ "$output" = "{}" ] || fail "Expected hook-session-start.sh to return {} without wiki"
}

test_install_registers_and_uninstalls_session_start_hook() {
    local tmp_dir settings_path output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills" "$tmp_dir/bin"
    settings_path="$tmp_dir/home/.claude/settings.json"
    cat > "$settings_path" <<'EOF'
{
  "enabledPlugins": {
    "demo": true
  }
}
EOF

    make_stub "$tmp_dir/bin/bun" '#!/bin/sh
mkdir -p node_modules
exit 0'

    make_stub "$tmp_dir/bin/lsof" '#!/bin/sh
exit 1'

    make_stub "$tmp_dir/bin/uv" '#!/bin/sh
printf "%s\n" "#!/bin/sh" "exit 0" > "'"$tmp_dir"'/bin/wechat-article-to-markdown"
chmod +x "'"$tmp_dir"'/bin/wechat-article-to-markdown"
exit 0'

    HOME="$tmp_dir/home" \
    PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    bash "$REPO_ROOT/install.sh" --platform claude --install-hooks > /dev/null 2>&1 \
      || fail "install.sh should register session hook for Claude"

    assert_path_exists "$tmp_dir/home/.claude/settings.json.bak.llm-wiki"
    assert_file_contains "$settings_path" '"SessionStart"'
    assert_file_contains "$settings_path" "$tmp_dir/home/.claude/skills/llm-wiki/scripts/hook-session-start.sh"

    HOME="$tmp_dir/home" \
    PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    bash "$REPO_ROOT/install.sh" --uninstall-hooks > /dev/null 2>&1 \
      || fail "install.sh should remove session hook"

    assert_file_not_contains "$settings_path" "hook-session-start.sh"
    assert_file_contains "$settings_path" '"enabledPlugins"'
}

test_platform_entries_mention_hook_and_wiki_context() {
    assert_file_contains "$REPO_ROOT/platforms/claude/CLAUDE.md" "/llm-wiki-upgrade"
    assert_file_contains "$REPO_ROOT/platforms/claude/CLAUDE.md" "--install-hooks"
    assert_file_contains "$REPO_ROOT/platforms/codex/AGENTS.md" "优先查阅 wiki/index.md"
    assert_file_contains "$REPO_ROOT/platforms/openclaw/README.md" "--upgrade --platform openclaw --target-dir <你的技能目录>/llm-wiki"
}

test_root_entries_explain_core_only_optional_and_target_dir() {
    assert_file_contains "$REPO_ROOT/AGENTS.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/AGENTS.md" "默认只准备知识库核心主线"
    assert_file_contains "$REPO_ROOT/AGENTS.md" "--target-dir <你的技能目录>/llm-wiki"
    assert_file_contains "$REPO_ROOT/CLAUDE.md" "/llm-wiki-upgrade"
    assert_file_contains "$REPO_ROOT/CLAUDE.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/CLAUDE.md" "默认只准备知识库核心主线"
}

test_skill_md_phase5_lint_mentions_confidence_audit() {
    local section
    section="$(sed -n '/## 工作流 5：lint/,/## 工作流 6：status/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "置信度报告"
    assert_text_contains "$section" "AMBIGUOUS"
    assert_text_contains "$section" "抽查标注为 EXTRACTED 的条目"
}

test_changelog_mentions_wiki_core_upgrades() {
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "purpose.md"
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "SessionStart hook"
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "delete 工作流"
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "/llm-wiki-upgrade"
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/CHANGELOG.md" "核心主线"
}

test_readme_sections() {
    assert_file_contains "$REPO_ROOT/README.md" "## 前置条件"
    assert_file_contains "$REPO_ROOT/README.md" "## 常见问题"
    assert_file_contains "$REPO_ROOT/README.md" "bash install.sh --platform claude"
    assert_file_contains "$REPO_ROOT/README.md" "bash install.sh --platform codex"
    assert_file_contains "$REPO_ROOT/README.md" "bash install.sh --platform openclaw"
    assert_file_contains "$REPO_ROOT/README.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/README.md" "/llm-wiki-upgrade"
    assert_file_contains "$REPO_ROOT/README.md" "--target-dir <你的技能目录>/llm-wiki"
    assert_file_contains "$REPO_ROOT/README.md" "--upgrade --platform openclaw --target-dir <你的技能目录>/llm-wiki"
    assert_file_contains "$REPO_ROOT/README.md" "wechat-article-to-markdown"
    assert_file_not_contains "$REPO_ROOT/README.md" "bash setup.sh"
    assert_file_not_contains "$REPO_ROOT/README.md" "x-article-extractor"
    assert_file_not_contains "$REPO_ROOT/README.md" "baoyu-danger-x-to-markdown"
}

test_claude_upgrade_companion_source_exists() {
    assert_path_exists "$REPO_ROOT/platforms/claude/companions/llm-wiki-upgrade/SKILL.md"
    assert_file_contains "$REPO_ROOT/platforms/claude/companions/llm-wiki-upgrade/SKILL.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/platforms/claude/companions/llm-wiki-upgrade/SKILL.md" 'bash "$TMP_DIR/llm-wiki-skill/install.sh" --upgrade --platform claude'
}

test_uv_tool_install_failure_is_graceful() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills" "$tmp_dir/bin"

    make_stub "$tmp_dir/bin/bun" '#!/bin/sh
mkdir -p node_modules
exit 0'

    make_stub "$tmp_dir/bin/lsof" '#!/bin/sh
exit 1'

    make_stub "$tmp_dir/bin/uv" '#!/bin/sh
exit 1'

    output="$(
        HOME="$tmp_dir/home" \
        PATH="$tmp_dir/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
        bash "$REPO_ROOT/install.sh" --platform claude --with-optional-adapters 2>&1
    )" || fail "install.sh should keep going when optional adapter bootstrap fails"

    assert_text_contains "$output" "wechat-article-to-markdown 安装失败"
    assert_text_contains "$output" "llm-wiki 已准备完成"
    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki/SKILL.md"
}

test_upgrade_auto_refuses_ambiguous_installed_platforms() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills/llm-wiki" "$tmp_dir/home/.codex/skills/llm-wiki"

    if output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --upgrade --platform auto 2>&1
    )"; then
        fail "install.sh --upgrade --platform auto should fail when multiple installs exist"
    fi

    assert_text_contains "$output" "检测到多个已安装平台"
    assert_text_contains "$output" "--platform"
}

test_upgrade_uses_explicit_target_dir() {
    local tmp_dir output custom_target
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    custom_target="$tmp_dir/custom/llm-wiki"
    mkdir -p "$tmp_dir/home/.openclaw/skills" "$custom_target"
    printf 'stale\n' > "$custom_target/README.md"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --upgrade --platform openclaw --target-dir "$custom_target" 2>&1
    )" || fail "install.sh --upgrade should support explicit target directories"

    assert_text_contains "$output" "目标目录：$custom_target"
    assert_text_contains "$output" "llm-wiki 升级完成"
    assert_path_exists "$custom_target/install.sh"
    assert_file_contains "$custom_target/README.md" "llm-wiki - 多平台知识库构建 Skill"
    [ ! -d "$tmp_dir/home/.openclaw/skills/llm-wiki" ] || fail "Did not expect upgrade to write into the default OpenClaw skill path"
}

test_upgrade_fails_when_explicit_target_dir_is_missing() {
    local tmp_dir output custom_target
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    custom_target="$tmp_dir/custom/llm-wiki"
    mkdir -p "$tmp_dir/home/.openclaw/skills"

    if output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --upgrade --platform openclaw --target-dir "$custom_target" 2>&1
    )"; then
        fail "install.sh --upgrade should fail when the explicit target directory is missing"
    fi

    assert_text_contains "$output" "尚未安装 llm-wiki"
    assert_text_contains "$output" "升级失败"
}

test_skill_md_routes_wechat_to_new_tool() {
    assert_file_contains "$REPO_ROOT/SKILL.md" "scripts/source-registry.sh match-url"
    assert_file_contains "$REPO_ROOT/SKILL.md" "scripts/source-registry.sh match-file"
    assert_file_contains "$REPO_ROOT/SKILL.md" '`adapter_name`'
    assert_file_not_contains "$REPO_ROOT/SKILL.md" "x-article-extractor"
}

test_templates_have_no_empty_links() {
    assert_file_not_contains "$REPO_ROOT/templates/entity-template.md" "- [[]]"
    assert_file_not_contains "$REPO_ROOT/templates/source-template.md" "- [[]]"
    assert_file_not_contains "$REPO_ROOT/templates/topic-template.md" "- [[]]"
}

test_batch_ingest_has_step_two() {
    local section
    section="$(sed -n '/## 工作流 3：batch-ingest/,/## 工作流 4：query/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "1. **确认知识库路径**"
    assert_text_contains "$section" "2. **列出所有可处理文件**"
    assert_text_contains "$section" "3. **展示文件列表**"
}

test_english_templates_exist_and_have_placeholders() {
    assert_path_exists "$REPO_ROOT/templates/index-en-template.md"
    assert_path_exists "$REPO_ROOT/templates/overview-en-template.md"
    assert_path_exists "$REPO_ROOT/templates/log-en-template.md"

    assert_file_contains "$REPO_ROOT/templates/index-en-template.md" "{{DATE}}"
    assert_file_contains "$REPO_ROOT/templates/index-en-template.md" "{{TOPIC}}"
    assert_file_contains "$REPO_ROOT/templates/overview-en-template.md" "{{DATE}}"
    assert_file_contains "$REPO_ROOT/templates/overview-en-template.md" "{{TOPIC}}"
    assert_file_contains "$REPO_ROOT/templates/log-en-template.md" "{{DATE}}"
    assert_file_contains "$REPO_ROOT/templates/log-en-template.md" "{{TOPIC}}"
}

test_english_templates_have_no_empty_links() {
    assert_file_not_contains "$REPO_ROOT/templates/index-en-template.md" "[[]]"
    assert_file_not_contains "$REPO_ROOT/templates/overview-en-template.md" "[[]]"
    assert_file_not_contains "$REPO_ROOT/templates/log-en-template.md" "[[]]"
}

test_skill_md_has_shared_preflight_and_language_rules() {
    assert_file_contains "$REPO_ROOT/SKILL.md" "## 通用前置检查"
    assert_file_contains "$REPO_ROOT/SKILL.md" "## 输出语言规则"
    assert_file_contains "$REPO_ROOT/SKILL.md" "素材 → Source"
    assert_file_contains "$REPO_ROOT/SKILL.md" "知识图谱 → Knowledge Graph"
}

test_skill_md_uses_external_english_templates_and_no_english_output_blocks() {
    assert_file_contains "$REPO_ROOT/SKILL.md" "templates/index-en-template.md"
    assert_file_contains "$REPO_ROOT/SKILL.md" "templates/overview-en-template.md"
    assert_file_contains "$REPO_ROOT/SKILL.md" "templates/log-en-template.md"
    assert_file_not_contains "$REPO_ROOT/SKILL.md" "**English（en）**："
}

test_setup_wrapper_is_marked_deprecated() {
    assert_file_contains "$REPO_ROOT/setup.sh" "已废弃：请使用 bash install.sh --platform claude"
}

test_source_registry_contract_is_frozen() {
    local output

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" fields 2>&1
    )" || fail "source-registry fields should be readable"

    assert_text_contains "$output" "source_id"
    assert_text_contains "$output" "source_label"
    assert_text_contains "$output" "source_category"
    assert_text_contains "$output" "input_mode"
    assert_text_contains "$output" "raw_dir"
    assert_text_contains "$output" "original_ref"
    assert_text_contains "$output" "ingest_text"
    assert_text_contains "$output" "adapter_name"
    assert_text_contains "$output" "fallback_hint"
}

test_source_registry_groups_core_optional_and_manual_sources() {
    local output

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" list 2>&1
    )" || fail "source-registry list should be readable"

    assert_text_contains "$output" "core_builtin"
    assert_text_contains "$output" "optional_adapter"
    assert_text_contains "$output" "manual_only"
    assert_text_contains "$output" "local_pdf"
    assert_text_contains "$output" "plain_text"
    assert_text_contains "$output" "web_article"
    assert_text_contains "$output" "wechat_article"
    assert_text_contains "$output" "xiaohongshu_post"
}

test_source_registry_exposes_install_dependency_groups() {
    local bundled_output install_time_output

    bundled_output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" unique-dependencies bundled 2>&1
    )" || fail "source-registry should list bundled dependencies"

    install_time_output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" unique-dependencies install_time 2>&1
    )" || fail "source-registry should list install-time dependencies"

    assert_text_contains "$bundled_output" "baoyu-url-to-markdown"
    assert_text_contains "$bundled_output" "youtube-transcript"
    assert_text_contains "$install_time_output" "wechat-article-to-markdown"
}

test_source_registry_validation_passes() {
    bash "$REPO_ROOT/scripts/source-registry.sh" validate > /dev/null 2>&1 \
        || fail "source-registry validate should succeed"
}

test_source_registry_matches_urls_and_files_from_shared_table() {
    local output

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" match-url "https://x.com/openai/status/1" 2>&1
    )" || fail "source-registry should match X/Twitter URLs"
    assert_text_contains "$output" "x_twitter"

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" match-url "https://mp.weixin.qq.com/s/example" 2>&1
    )" || fail "source-registry should match WeChat URLs"
    assert_text_contains "$output" "wechat_article"

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" match-url "https://example.com/post" 2>&1
    )" || fail "source-registry should match generic web URLs"
    assert_text_contains "$output" "web_article"

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" match-file "/tmp/example.md" 2>&1
    )" || fail "source-registry should match local document files"
    assert_text_contains "$output" "local_document"

    output="$(
        bash "$REPO_ROOT/scripts/source-registry.sh" match-file "/tmp/paper.pdf" 2>&1
    )" || fail "source-registry should match PDF files"
    assert_text_contains "$output" "local_pdf"
}

test_legacy_wiki_defaults_missing_fields_without_forcing_migration() {
    local tmp_dir wiki_root output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/legacy-wiki"
    make_legacy_wiki "$wiki_root"

    output="$(
        bash "$REPO_ROOT/scripts/wiki-compat.sh" inspect "$wiki_root" 2>&1
    )" || fail "legacy wiki inspect should succeed without migration"

    assert_text_contains "$output" "schema_version=1.0"
    assert_text_contains "$output" "language=zh"
    assert_text_contains "$output" "migration_required=no"
    assert_text_contains "$output" "missing_optional_raw_dirs=raw/xiaohongshu,raw/zhihu"
    assert_text_contains "$output" "purpose_file=missing"
    assert_text_contains "$output" "cache_file=missing"

    bash "$REPO_ROOT/scripts/wiki-compat.sh" validate "$wiki_root" > /dev/null 2>&1 \
        || fail "legacy wiki validate should accept the old layout"
}

test_legacy_wiki_lazily_creates_new_source_dirs_without_moving_old_materials() {
    local tmp_dir wiki_root output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/legacy-wiki"
    make_legacy_wiki "$wiki_root"
    printf '旧素材\n' > "$wiki_root/raw/articles/2026-04-01-old-source.md"

    bash "$REPO_ROOT/scripts/wiki-compat.sh" ensure-source-dir "$wiki_root" xiaohongshu_post > /dev/null 2>&1 \
        || fail "legacy wiki should lazily create missing source directories"

    assert_path_exists "$wiki_root/raw/xiaohongshu"
    assert_path_exists "$wiki_root/raw/articles/2026-04-01-old-source.md"

    output="$(
        bash "$REPO_ROOT/scripts/wiki-compat.sh" inspect "$wiki_root" 2>&1
    )" || fail "inspect should still succeed after lazily creating a source directory"

    assert_text_contains "$output" "missing_optional_raw_dirs=raw/zhihu"
}

test_new_wiki_compat_reports_purpose_and_cache_present() {
    local tmp_dir wiki_root output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/new-wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "新知识库" "中文" > /dev/null

    output="$(
        bash "$REPO_ROOT/scripts/wiki-compat.sh" inspect "$wiki_root" 2>&1
    )" || fail "new wiki inspect should succeed"

    assert_text_contains "$output" "purpose_file=present"
    assert_text_contains "$output" "cache_file=present"
}

test_readme_aligns_source_boundary_to_registry() {
    assert_file_contains "$REPO_ROOT/README.md" "scripts/source-registry.tsv"
    assert_file_contains "$REPO_ROOT/README.md" "核心主线"
    assert_file_contains "$REPO_ROOT/README.md" "可选外挂"
    assert_file_contains "$REPO_ROOT/README.md" "手动入口"
    assert_registry_labels_present_in_file "$REPO_ROOT/README.md" "core_builtin"
    assert_registry_labels_present_in_file "$REPO_ROOT/README.md" "optional_adapter"
    assert_registry_labels_present_in_file "$REPO_ROOT/README.md" "manual_only"
}

test_skill_status_and_ingest_align_to_registry() {
    assert_file_contains "$REPO_ROOT/SKILL.md" "scripts/source-registry.sh list"
    assert_file_contains "$REPO_ROOT/SKILL.md" "scripts/source-registry.sh get"
    assert_file_contains "$REPO_ROOT/SKILL.md" "source_id"
    assert_file_contains "$REPO_ROOT/SKILL.md" "recovery_action"
    assert_file_contains "$REPO_ROOT/SKILL.md" "install_hint"
    assert_file_contains "$REPO_ROOT/SKILL.md" '按来源总表中的 `source_label` 和 `raw_dir`'
    assert_file_contains "$REPO_ROOT/SKILL.md" "外挂状态直接使用"
}

test_schema_template_aligns_source_boundary_to_registry() {
    assert_file_contains "$REPO_ROOT/templates/schema-template.md" "核心主线"
    assert_file_contains "$REPO_ROOT/templates/schema-template.md" "可选外挂"
    assert_file_contains "$REPO_ROOT/templates/schema-template.md" "手动入口"
    assert_registry_labels_present_in_file "$REPO_ROOT/templates/schema-template.md" "core_builtin"
    assert_registry_labels_present_in_file "$REPO_ROOT/templates/schema-template.md" "optional_adapter"
    assert_registry_labels_present_in_file "$REPO_ROOT/templates/schema-template.md" "manual_only"
}

test_install_prints_source_boundary_from_registry() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/home/.claude/skills"

    output="$(
        HOME="$tmp_dir/home" \
        bash "$REPO_ROOT/install.sh" --platform claude --dry-run 2>&1
    )" || fail "install.sh dry-run should print shared source boundary"

    assert_text_contains "$output" "来源边界"
    assert_text_contains "$output" "核心主线"
    assert_text_contains "$output" "可选外挂"
    assert_text_contains "$output" "手动入口"
    assert_registry_labels_present_in_text "$output" "core_builtin"
    assert_registry_labels_present_in_text "$output" "optional_adapter"
    assert_registry_labels_present_in_text "$output" "manual_only"
    assert_text_contains "$output" "--with-optional-adapters"
}

test_install_warns_when_managed_source_is_missing() {
    assert_file_contains "$REPO_ROOT/install.sh" "安装源文件缺失，跳过"
}

test_validate_step1_no_args_exits_with_usage() {
    local output
    if output="$(bash "$REPO_ROOT/scripts/validate-step1.sh" 2>&1)"; then
        fail "validate-step1.sh should exit non-zero with no args"
    fi
    assert_text_contains "$output" "usage"
}

test_validate_step1_valid_json_passes() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    printf '%s\n' '{"entities":[{"name":"test","confidence":"EXTRACTED"}],"topics":[],"connections":[],"contradictions":[],"new_vs_existing":{}}' \
        > "$tmp_dir/step1.json"
    bash "$REPO_ROOT/scripts/validate-step1.sh" "$tmp_dir/step1.json" \
        || fail "validate-step1.sh should pass with valid JSON"
}

test_validate_step1_missing_confidence_fails() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    printf '%s\n' '{"entities":[{"name":"test"}],"topics":[],"connections":[],"contradictions":[],"new_vs_existing":{}}' \
        > "$tmp_dir/step1.json"
    if output="$(bash "$REPO_ROOT/scripts/validate-step1.sh" "$tmp_dir/step1.json" 2>&1)"; then
        fail "validate-step1.sh should fail when confidence is missing"
    fi
    assert_text_contains "$output" "MISSING"
}

test_validate_step1_invalid_confidence_value_fails() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    printf '%s\n' '{"entities":[{"name":"test","confidence":"HIGH"}],"topics":[],"connections":[],"contradictions":[],"new_vs_existing":{}}' \
        > "$tmp_dir/step1.json"
    if output="$(bash "$REPO_ROOT/scripts/validate-step1.sh" "$tmp_dir/step1.json" 2>&1)"; then
        fail "validate-step1.sh should fail with invalid confidence value"
    fi
    assert_text_contains "$output" "HIGH"
}

test_validate_step1_entities_not_array_fails() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    printf '%s\n' '{"entities":{},"topics":[],"connections":[],"contradictions":[],"new_vs_existing":{}}' \
        > "$tmp_dir/step1.json"
    if output="$(bash "$REPO_ROOT/scripts/validate-step1.sh" "$tmp_dir/step1.json" 2>&1)"; then
        fail "validate-step1.sh should fail when entities is not an array"
    fi
    assert_text_contains "$output" "entities"
}

test_validate_step1_empty_entities_array_passes() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    printf '%s\n' '{"entities":[],"topics":[],"connections":[],"contradictions":[],"new_vs_existing":{}}' \
        > "$tmp_dir/step1.json"
    bash "$REPO_ROOT/scripts/validate-step1.sh" "$tmp_dir/step1.json" \
        || fail "validate-step1.sh should pass with empty entities array"
}

test_skill_md_ingest_has_confidence_assignment_rules() {
    local section
    section="$(sed -n '/## 工作流 2：ingest/,/## 工作流 3：batch-ingest/p' "$REPO_ROOT/SKILL.md")"
    assert_text_contains "$section" "EXTRACTED：信息直接出现在原文里"
    assert_text_contains "$section" "INFERRED："
    assert_text_contains "$section" "AMBIGUOUS："
    assert_text_contains "$section" "UNVERIFIED："
    assert_text_contains "$section" "validate-step1.sh"
}

test_skill_md_has_crystallize_workflow_and_route() {
    local route_section crystallize_section
    route_section="$(sed -n '/## 工作流路由/,/## 通用前置检查/p' "$REPO_ROOT/SKILL.md")"
    crystallize_section="$(sed -n '/## 工作流 10：crystallize/,$p' "$REPO_ROOT/SKILL.md")"
    assert_text_contains "$route_section" "crystallize"
    assert_text_contains "$crystallize_section" "wiki/synthesis/sessions/"
    assert_text_contains "$crystallize_section" "INFERRED"
}

test_init_creates_synthesis_sessions_subdir() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$tmp_dir/wiki" "测试知识库" > /dev/null 2>&1 \
        || fail "init-wiki.sh should succeed"
    assert_path_exists "$tmp_dir/wiki/wiki/synthesis/sessions"
}

test_create_source_page_writes_and_updates_cache() {
    local tmp_dir wiki_root raw_file content_file output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "缓存测试" "中文" > /dev/null

    raw_file="$wiki_root/raw/articles/test-article.md"
    printf '素材原始内容\n' > "$raw_file"

    content_file="$tmp_dir/content.tmp"
    printf '# 测试摘要页\n\n这是测试内容。\n' > "$content_file"

    output="$(
        bash "$REPO_ROOT/scripts/create-source-page.sh" "$raw_file" "wiki/sources/test-article.md" "$content_file" 2>&1
    )" || fail "create-source-page.sh should succeed"
    assert_text_contains "$output" "SUCCESS"

    # 验证页面文件已写入
    assert_path_exists "$wiki_root/wiki/sources/test-article.md"
    assert_file_contains "$wiki_root/wiki/sources/test-article.md" "这是测试内容"

    # 验证缓存已更新（check 返回 HIT）
    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$raw_file" 2>&1
    )"
    [ "$output" = "HIT" ] || fail "Expected HIT after create-source-page, got: $output"
}

test_create_source_page_rollback_on_cache_failure() {
    local tmp_dir wiki_root raw_file content_file
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/wiki"
    mkdir -p "$wiki_root/raw/articles" "$wiki_root/wiki/sources"
    # 使用损坏的 cache 文件（不是合法 JSON），让 cache update 失败
    printf 'not json\n' > "$wiki_root/.wiki-cache.json"
    printf '# Schema\n' > "$wiki_root/.wiki-schema.md"

    raw_file="$wiki_root/raw/articles/test-article.md"
    printf '素材原始内容\n' > "$raw_file"

    content_file="$tmp_dir/content.tmp"
    printf '# 测试摘要页\n' > "$content_file"

    bash "$REPO_ROOT/scripts/create-source-page.sh" "$raw_file" "wiki/sources/test-article.md" "$content_file" 2>/dev/null \
        && fail "create-source-page.sh should fail when cache update fails"

    # 验证页面文件已被回滚删除
    [ ! -f "$wiki_root/wiki/sources/test-article.md" ] || fail "Output file should be rolled back on cache failure"
}

test_cache_check_self_heals_with_matching_stem() {
    local tmp_dir wiki_root raw_file output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "缓存测试" "中文" > /dev/null

    raw_file="$wiki_root/raw/articles/rlhf-paper.md"
    printf 'RLHF 论文内容\n' > "$raw_file"

    # 直接写 source 页面（不通过脚本，模拟 AI 忘了 update）
    printf '# RLHF 摘要\n' > "$wiki_root/wiki/sources/rlhf-paper.md"

    # cache check 应该自愈
    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$raw_file" 2>&1
    )"
    [ "$output" = "HIT(repaired)" ] || fail "Expected HIT(repaired) for self-heal, got: $output"

    # 再次 check 应返回普通 HIT
    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$raw_file" 2>&1
    )"
    [ "$output" = "HIT" ] || fail "Expected HIT after repair, got: $output"
}

test_cache_check_miss_no_source_when_page_deleted() {
    local tmp_dir wiki_root raw_file output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "缓存测试" "中文" > /dev/null

    raw_file="$wiki_root/raw/articles/example.md"
    printf '原始内容\n' > "$raw_file"

    # 正常建 cache
    printf '# 来源页\n' > "$wiki_root/wiki/sources/example.md"
    bash "$REPO_ROOT/scripts/cache.sh" update "$raw_file" "wiki/sources/example.md" > /dev/null 2>&1

    # 删掉 source 页面
    rm "$wiki_root/wiki/sources/example.md"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$raw_file" 2>&1
    )"
    [ "$output" = "MISS:no_source" ] || fail "Expected MISS:no_source, got: $output"
}

test_cache_check_miss_hash_changed_when_content_differs() {
    local tmp_dir wiki_root raw_file output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    wiki_root="$tmp_dir/wiki"
    bash "$REPO_ROOT/scripts/init-wiki.sh" "$wiki_root" "缓存测试" "中文" > /dev/null

    raw_file="$wiki_root/raw/articles/example.md"
    printf '原始内容 v1\n' > "$raw_file"

    printf '# 来源页\n' > "$wiki_root/wiki/sources/example.md"
    bash "$REPO_ROOT/scripts/cache.sh" update "$raw_file" "wiki/sources/example.md" > /dev/null 2>&1

    # 修改素材内容
    printf '原始内容 v2 已变化\n' > "$raw_file"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$raw_file" 2>&1
    )"
    [ "$output" = "MISS:hash_changed" ] || fail "Expected MISS:hash_changed, got: $output"
}

test_skill_md_ingest_uses_create_source_page() {
    local section
    section="$(sed -n '/## 工作流 2：ingest/,/## 工作流 3：batch-ingest/p' "$REPO_ROOT/SKILL.md")"

    assert_text_contains "$section" "create-source-page.sh"
    assert_text_contains "$section" "MISS:no_entry"
    assert_text_contains "$section" "MISS:hash_changed"
    assert_text_contains "$section" "MISS:no_source"
    assert_text_contains "$section" "HIT(repaired)"
}

test_skill_md_step12_does_not_call_cache_update() {
    local section step12
    section="$(sed -n '/## 工作流 2：ingest/,/## 工作流 3：batch-ingest/p' "$REPO_ROOT/SKILL.md")"
    step12="$(printf '%s' "$section" | sed -n '/^12\. \*\*更新 log\.md/,/^13\./p')"

    # Step 12 不应包含可执行的 cache.sh update 代码块（只在说明文字里提到）
    # 检查没有以 "bash" 开头并含 "cache.sh update" 的行
    if printf '%s' "$step12" | grep -E 'bash.*cache\.sh update' > /dev/null; then
        fail "Step 12 should not contain executable cache.sh update call"
    fi
    # 应提到缓存已由 create-source-page.sh 完成
    assert_text_contains "$step12" "create-source-page.sh"
}

test_setup_runs_on_bash_3_2
test_install_with_optional_adapters_bootstraps_dependencies
test_install_dry_run_for_claude
test_install_auto_refuses_ambiguous_platforms
test_upgrade_auto_refuses_ambiguous_installed_platforms
test_upgrade_uses_explicit_target_dir
test_upgrade_fails_when_explicit_target_dir_is_missing
test_upgrade_refreshes_claude_companion_skill
test_install_openclaw_copies_bundle
test_init_fills_language_placeholder
test_phase1_templates_exist
test_init_creates_purpose_and_cache_files
test_cache_script_handles_miss_hit_and_invalidate
test_skill_md_phase2_init_mentions_purpose_and_cache
test_skill_md_phase2_ingest_mentions_two_step_cache_and_confidence
test_skill_md_phase2_batch_ingest_mentions_cache_skip_summary
test_skill_md_phase2_status_mentions_purpose_presence
test_skill_md_phase2_has_delete_workflow_and_route
test_delete_helper_scans_reference_files
test_skill_md_phase3_query_mentions_persistence_and_duplicate_handling
test_hook_session_start_outputs_context_when_wiki_exists
test_hook_session_start_returns_empty_json_without_wiki
test_install_registers_and_uninstalls_session_start_hook
test_platform_entries_mention_hook_and_wiki_context
test_root_entries_explain_core_only_optional_and_target_dir
test_skill_md_phase5_lint_mentions_confidence_audit
test_changelog_mentions_wiki_core_upgrades
test_readme_sections
test_claude_upgrade_companion_source_exists
test_uv_tool_install_failure_is_graceful
test_skill_md_routes_wechat_to_new_tool
test_templates_have_no_empty_links
test_batch_ingest_has_step_two
test_english_templates_exist_and_have_placeholders
test_english_templates_have_no_empty_links
test_skill_md_has_shared_preflight_and_language_rules
test_skill_md_uses_external_english_templates_and_no_english_output_blocks
test_setup_wrapper_is_marked_deprecated
test_source_registry_contract_is_frozen
test_source_registry_groups_core_optional_and_manual_sources
test_source_registry_exposes_install_dependency_groups
test_source_registry_validation_passes
test_source_registry_matches_urls_and_files_from_shared_table
test_legacy_wiki_defaults_missing_fields_without_forcing_migration
test_legacy_wiki_lazily_creates_new_source_dirs_without_moving_old_materials
test_new_wiki_compat_reports_purpose_and_cache_present
test_readme_aligns_source_boundary_to_registry
test_skill_status_and_ingest_align_to_registry
test_schema_template_aligns_source_boundary_to_registry
test_install_prints_source_boundary_from_registry
test_install_warns_when_managed_source_is_missing
test_validate_step1_no_args_exits_with_usage
test_validate_step1_valid_json_passes
test_validate_step1_missing_confidence_fails
test_validate_step1_invalid_confidence_value_fails
test_validate_step1_entities_not_array_fails
test_validate_step1_empty_entities_array_passes
test_skill_md_ingest_has_confidence_assignment_rules
test_skill_md_has_crystallize_workflow_and_route
test_init_creates_synthesis_sessions_subdir
test_create_source_page_writes_and_updates_cache
test_create_source_page_rollback_on_cache_failure
test_cache_check_self_heals_with_matching_stem
test_cache_check_miss_no_source_when_page_deleted
test_cache_check_miss_hash_changed_when_content_differs
test_skill_md_ingest_uses_create_source_page
test_skill_md_step12_does_not_call_cache_update

# ─── 交互式图谱测试 ────────────────────────────────────────────

GRAPH_DATA_SAMPLE="tests/fixtures/graph-data-sample-wiki"
GRAPH_DATA_EMPTY="tests/fixtures/graph-data-empty-wiki"
GRAPH_HTML_BASIC="tests/fixtures/graph-interactive-basic"

test_graph_data_sample_wiki_matches_expected() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_SAMPLE" \
        "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on sample wiki"

    jq 'del(.nodes[].source_path)' "$tmp_dir/graph-data.json" > "$tmp_dir/normalized.json"
    diff "$tmp_dir/normalized.json" "$REPO_ROOT/tests/expected/graph-data-sample.json" \
        || fail "sample wiki graph-data output differs from expected"
}

test_graph_data_empty_wiki_matches_expected() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_EMPTY" \
        "$tmp_dir/graph-data.json" > /dev/null 2>&1 \
        || fail "build-graph-data.sh should succeed on empty wiki"

    diff "$tmp_dir/graph-data.json" "$REPO_ROOT/tests/expected/graph-data-empty.json" \
        || fail "empty wiki graph-data output differs from expected"
}

test_graph_data_test_mode_is_stable() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_SAMPLE" \
        "$tmp_dir/run1.json" > /dev/null 2>&1

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_SAMPLE" \
        "$tmp_dir/run2.json" > /dev/null 2>&1

    diff "$tmp_dir/run1.json" "$tmp_dir/run2.json" \
        || fail "TEST_MODE output should be identical across runs"
}

test_graph_data_has_three_confidence_types() {
    local tmp_dir edges
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_SAMPLE" \
        "$tmp_dir/graph-data.json" > /dev/null 2>&1

    edges=$(jq -r '.edges[].type' "$tmp_dir/graph-data.json" | sort -u)
    assert_text_contains "$edges" "EXTRACTED"
    assert_text_contains "$edges" "INFERRED"
    assert_text_contains "$edges" "AMBIGUOUS"
}

test_graph_data_community_clustering() {
    local tmp_dir communities
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_SAMPLE" \
        "$tmp_dir/graph-data.json" > /dev/null 2>&1

    # Transformer/Attention/Encoder/Decoder 属于 arch 社区
    local arch_nodes
    arch_nodes=$(jq -r '.nodes[] | select(.community == "arch") | .id' "$tmp_dir/graph-data.json" | sort | tr '\n' ' ')
    assert_text_contains "$arch_nodes" "Attention"
    assert_text_contains "$arch_nodes" "Decoder"
    assert_text_contains "$arch_nodes" "Encoder"
    assert_text_contains "$arch_nodes" "Transformer"

    # GPT 属于 finetune 社区
    local finetune_nodes
    finetune_nodes=$(jq -r '.nodes[] | select(.community == "finetune") | .id' "$tmp_dir/graph-data.json")
    assert_text_contains "$finetune_nodes" "GPT"

    # paper 没有社区（null）
    local paper_comm
    paper_comm=$(jq -r '.nodes[] | select(.id == "paper") | .community' "$tmp_dir/graph-data.json")
    [ "$paper_comm" = "null" ] || fail "Expected paper community to be null, got: $paper_comm"
}

test_graph_data_empty_wiki_has_zero_nodes_and_edges() {
    local tmp_dir nodes_count edges_count
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" \
        "$REPO_ROOT/$GRAPH_DATA_EMPTY" \
        "$tmp_dir/graph-data.json" > /dev/null 2>&1

    nodes_count=$(jq '.meta.total_nodes' "$tmp_dir/graph-data.json")
    edges_count=$(jq '.meta.total_edges' "$tmp_dir/graph-data.json")
    [ "$nodes_count" = "0" ] || fail "Expected 0 nodes in empty wiki, got: $nodes_count"
    [ "$edges_count" = "0" ] || fail "Expected 0 edges in empty wiki, got: $edges_count"
}

test_graph_html_basic_assembly() {
    local tmp_dir output_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    output_dir="$tmp_dir/wiki"
    mkdir -p "$output_dir"
    cp "$REPO_ROOT/$GRAPH_HTML_BASIC/wiki/graph-data.json" "$output_dir/graph-data.json"

    bash "$REPO_ROOT/scripts/build-graph-html.sh" \
        "$tmp_dir" \
        "$output_dir/knowledge-graph.html" > /dev/null 2>&1 \
        || fail "build-graph-html.sh should succeed on basic fixture"

    # HTML 文件存在
    assert_path_exists "$output_dir/knowledge-graph.html"

    # 包含品牌栏占位符替换结果
    assert_file_contains "$output_dir/knowledge-graph.html" "HTML测试知识库"
    assert_file_contains "$output_dir/knowledge-graph.html" "3"
    assert_file_contains "$output_dir/knowledge-graph.html" "2"

    # vendor 资产已复制
    assert_path_exists "$output_dir/vis-network.min.js"
    assert_path_exists "$output_dir/marked.min.js"
    assert_path_exists "$output_dir/purify.min.js"
    assert_path_exists "$output_dir/LICENSE-vis-network.txt"
    assert_path_exists "$output_dir/LICENSE-marked.txt"
    assert_path_exists "$output_dir/LICENSE-purify.txt"
}

test_graph_html_escapes_script_tag_in_content() {
    local tmp_dir output_dir html
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    output_dir="$tmp_dir/wiki"
    mkdir -p "$output_dir"
    cp "$REPO_ROOT/$GRAPH_HTML_BASIC/wiki/graph-data.json" "$output_dir/graph-data.json"

    bash "$REPO_ROOT/scripts/build-graph-html.sh" \
        "$tmp_dir" \
        "$output_dir/knowledge-graph.html" > /dev/null 2>&1

    # </script> 必须被转义为 <\/script>
    html=$(cat "$output_dir/knowledge-graph.html")
    assert_text_not_contains "$html" '</script> 标签'
    assert_text_contains "$html" '<\/script> 标签'
}

test_graph_html_missing_data_exits_with_error() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki"

    if bash "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir" > /dev/null 2>&1; then
        fail "build-graph-html.sh should fail when graph-data.json is missing"
    fi
}

test_graph_html_missing_template_exits_with_error() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/scripts" "$tmp_dir/wiki"
    printf '{}' > "$tmp_dir/wiki/graph-data.json"

    # 把脚本复制到临时目录，让它找不到 templates/
    cp "$REPO_ROOT/scripts/build-graph-html.sh" "$tmp_dir/wiki/scripts/"
    chmod +x "$tmp_dir/wiki/scripts/build-graph-html.sh"

    if bash "$tmp_dir/wiki/scripts/build-graph-html.sh" "$tmp_dir/wiki" > /dev/null 2>&1; then
        fail "build-graph-html.sh should fail when templates are missing"
    fi
}

test_graph_data_dead_links_are_ignored() {
    local tmp_dir output
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    printf '# Alpha\n\n链接到 [[NonExistent]] 实体。\n' > "$tmp_dir/wiki/entities/Alpha.md"

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" "$tmp_dir" "$tmp_dir/wiki/graph-data.json" > /dev/null 2>&1

    # 应该只有 Alpha 一个节点，0 条边（NonExistent 不存在）
    local node_count edge_count
    node_count=$(jq '.meta.total_nodes' "$tmp_dir/wiki/graph-data.json")
    edge_count=$(jq '.meta.total_edges' "$tmp_dir/wiki/graph-data.json")
    [ "$node_count" = "1" ] || fail "Expected 1 node, got: $node_count"
    [ "$edge_count" = "0" ] || fail "Expected 0 edges (dead link ignored), got: $edge_count"
}

test_graph_data_self_links_are_ignored() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    printf '# Self\n\n自引用 [[Self]]。\n' > "$tmp_dir/wiki/entities/Self.md"

    LLM_WIKI_TEST_MODE=1 \
        bash "$REPO_ROOT/scripts/build-graph-data.sh" "$tmp_dir" "$tmp_dir/wiki/graph-data.json" > /dev/null 2>&1

    local edge_count
    edge_count=$(jq '.meta.total_edges' "$tmp_dir/wiki/graph-data.json")
    [ "$edge_count" = "0" ] || fail "Expected 0 edges (self-link ignored), got: $edge_count"
}

test_graph_data_exits_without_jq() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    mkdir -p "$tmp_dir/wiki/entities"

    # 用 PATH 只含 /bin（无 jq）来测试依赖缺失
    if output="$(PATH=/bin bash "$REPO_ROOT/scripts/build-graph-data.sh" "$tmp_dir" 2>&1)"; then
        fail "build-graph-data.sh should fail when jq is not available"
    fi
    assert_text_contains "$output" "jq"
}

test_graph_data_wiki_dir_missing_exits() {
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' RETURN

    if bash "$REPO_ROOT/scripts/build-graph-data.sh" "$tmp_dir" 2>/dev/null; then
        fail "build-graph-data.sh should fail when wiki/ directory is missing"
    fi
}

test_graph_data_sample_wiki_matches_expected
test_graph_data_empty_wiki_matches_expected
test_graph_data_test_mode_is_stable
test_graph_data_has_three_confidence_types
test_graph_data_community_clustering
test_graph_data_empty_wiki_has_zero_nodes_and_edges
test_graph_html_basic_assembly
test_graph_html_escapes_script_tag_in_content
test_graph_html_missing_data_exits_with_error
test_graph_html_missing_template_exits_with_error
test_graph_data_dead_links_are_ignored
test_graph_data_self_links_are_ignored
test_graph_data_exits_without_jq
test_graph_data_wiki_dir_missing_exits

bash "$REPO_ROOT/tests/adapter-state.sh" || fail "adapter-state.sh 测试失败"

echo "All regression checks passed."
