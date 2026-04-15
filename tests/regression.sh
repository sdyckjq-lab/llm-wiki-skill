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
    assert_path_exists "$tmp_dir/home/.claude/skills/llm-wiki/deps/baoyu-url-to-markdown"
    [ ! -d "$tmp_dir/home/.claude/skills/baoyu-url-to-markdown" ] || fail "Did not expect optional adapters to be enabled by default"
    [ ! -f "$tmp_dir/tool.log" ] || fail "Did not expect bun or uv to run for core-only setup"

    assert_text_contains "$output" "当前只准备了知识库核心主线"
    assert_text_contains "$output" "--with-optional-adapters"
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
    assert_text_contains "$output" "Chrome 调试端口 9222 未监听"
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
    [ ! -d "$tmp_dir/home/.openclaw/skills/baoyu-url-to-markdown" ] || fail "Did not expect optional adapters to be enabled by default"
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
    [ "$output" = "MISS" ] || fail "Expected initial cache check to be MISS"

    printf '# 来源页\n' > "$wiki_root/wiki/sources/example.md"
    bash "$REPO_ROOT/scripts/cache.sh" update "$file_path" "wiki/sources/example.md" > /dev/null 2>&1 \
        || fail "cache.sh update should succeed"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$file_path" 2>&1
    )" || fail "cache.sh check should work for cached files"
    [ "$output" = "HIT" ] || fail "Expected updated cache check to be HIT"

    bash "$REPO_ROOT/scripts/cache.sh" invalidate "$file_path" > /dev/null 2>&1 \
        || fail "cache.sh invalidate should succeed"

    output="$(
        bash "$REPO_ROOT/scripts/cache.sh" check "$file_path" 2>&1
    )" || fail "cache.sh check should work after invalidation"
    [ "$output" = "MISS" ] || fail "Expected invalidated cache check to be MISS"
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
    assert_file_contains "$REPO_ROOT/platforms/claude/CLAUDE.md" "--install-hooks"
    assert_file_contains "$REPO_ROOT/platforms/codex/AGENTS.md" "优先查阅 wiki/index.md"
    assert_file_contains "$REPO_ROOT/platforms/openclaw/README.md" "--upgrade --platform openclaw --target-dir <你的技能目录>/llm-wiki"
}

test_root_entries_explain_core_only_optional_and_target_dir() {
    assert_file_contains "$REPO_ROOT/AGENTS.md" "--with-optional-adapters"
    assert_file_contains "$REPO_ROOT/AGENTS.md" "默认只准备知识库核心主线"
    assert_file_contains "$REPO_ROOT/AGENTS.md" "--target-dir <你的技能目录>/llm-wiki"
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
    assert_file_contains "$REPO_ROOT/README.md" "--target-dir <你的技能目录>/llm-wiki"
    assert_file_contains "$REPO_ROOT/README.md" "--upgrade --platform openclaw --target-dir <你的技能目录>/llm-wiki"
    assert_file_contains "$REPO_ROOT/README.md" "wechat-article-to-markdown"
    assert_file_not_contains "$REPO_ROOT/README.md" "bash setup.sh"
    assert_file_not_contains "$REPO_ROOT/README.md" "x-article-extractor"
    assert_file_not_contains "$REPO_ROOT/README.md" "baoyu-danger-x-to-markdown"
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

test_setup_runs_on_bash_3_2
test_install_with_optional_adapters_bootstraps_dependencies
test_install_dry_run_for_claude
test_install_auto_refuses_ambiguous_platforms
test_upgrade_auto_refuses_ambiguous_installed_platforms
test_upgrade_uses_explicit_target_dir
test_upgrade_fails_when_explicit_target_dir_is_missing
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

bash "$REPO_ROOT/tests/adapter-state.sh" || fail "adapter-state.sh 测试失败"

echo "All regression checks passed."
