---
title: 从三风格图谱简化为 wash-only 单风格的决策与实施
date: 2026-04-20
category: developer-experience
module: interactive-graph
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - 用户测试后对多选项中的部分效果不满意，需要快速裁剪已实现的功能
  - 图谱模板或 UI 风格需要根据实际视觉效果做取舍
tags: [graph, knowledge-graph, wash, refactor, template, vis-network, d3, roughjs]
---

# 从三风格图谱简化为 wash-only 单风格的决策与实施

## Context

`llm-wiki-skill` 的交互式知识图谱经历了三个分支的视觉迭代：

1. **`feat/interactive-graph`**（4月17日）：vis-network 经典版，PR #15 合并。自动化测试全过，但用户实际打开后发现节点重叠、连线交叉成"毛线球"、标签叠在一起。
2. **`feat/sketchy-graph-redesign`**（4月18-19日）：对 vis-network 做了多轮布局优化（力导向参数自适应、孤立节点计数、移动端 overlay），但 vis-network 渲染效果天花板明显，用户放弃。
3. **`feat/graph-html-styles-v3`**（4月20日）：引入 D3 + Rough.js 的 paper（手绘笔记本）和 wash（水彩卡片）两套模板，计划三风格并存。端到端测试后只有 wash 视觉可接受，最终裁剪为 wash-only。

关键教训：**自动化测试通过不等于用户可接受**。图谱必须视觉可读才算达标。

## Guidance

### 1. 删除多余模板和 vendor

删除 11 个文件（classic 的 header/footer/vis-network/license + paper 整个目录 + 从 templates/ 移出的 marked/purify）：

```bash
git rm templates/graph-template-header.html \
       templates/graph-template-footer.html \
       templates/vis-network.min.js \
       templates/LICENSE-vis-network.txt \
       templates/marked.min.js \
       templates/purify.min.js \
       templates/LICENSE-marked.txt \
       templates/LICENSE-purify.txt
rm -rf templates/graph-styles/paper/
```

`deps/` 下的 d3.min.js、rough.min.js、marked.min.js、purify.min.js 及 LICENSE 保留——wash 依赖这些。

### 2. 简化构建脚本

`scripts/build-graph-html.sh` 从 275 行（`--style` 参数 + 三分支 prepare_style + build_one 循环）简化到 ~155 行：

- 移除 `--style classic|paper|wash|all` 参数解析和 `POSITIONAL` 数组
- 移除 `prepare_style()` 函数
- 硬编码 wash 路径：`graph-styles/wash/header.html`、`graph-styles/wash/footer.html`
- 输出统一为 `wiki/knowledge-graph.html`（不是 `knowledge-graph-wash.html`）
- `ASSET_SPECS` 固定为 wash 的 vendor 列表
- 保留：`__WIKI_TITLE__` 占位符替换、`</script>` 转义、vendor 复制

```bash
# 之前：三种风格分支
prepare_style() {
  case "$style" in
    classic) HEADER="$TEMPLATES_DIR/graph-template-header.html" ... ;;
    paper)   HEADER="$TEMPLATES_DIR/graph-styles/paper/header.html" ... ;;
    wash)    HEADER="$TEMPLATES_DIR/graph-styles/wash/header.html" ... ;;
  esac
}

# 之后：直接写死 wash
HEADER="$TEMPLATES_DIR/graph-styles/wash/header.html"
FOOTER="$TEMPLATES_DIR/graph-styles/wash/footer.html"
OUTPUT="$WIKI_ROOT/wiki/knowledge-graph.html"
```

### 3. 重写回归测试

三个独立回归测试文件和 `tests/regression.sh` 里的四个 graph 测试函数全部改为 wash 断言：

- **styles 回归**：断言 `knowledge-graph.html` 存在、d3/rough/marked/purify/graph-wash.js 存在、HTML 含 `<script id="graph-data"`、不含 `cdn.jsdelivr.net`、不含 `vis-network.min.js`
- **mobile 回归**：断言 `@media (max-width: 900px)` 响应式规则、`.drawer` 类、`closeDrawer` 在 graph-wash.js 里（不在 HTML 里——它通过 `<script src>` 加载）
- **search 回归**：断言 HTML 含 `search__input`/`search-dropdown`、graph-wash.js 含 `setupSearch`/`getElementById("search")`
- **regression.sh**：两参数经典调用改为单参数 wash 调用，vis-network 资产断言改为 d3/rough 资产断言

踩坑：mobile 测试最初在 HTML 里找 `closeDrawer()` 失败，因为 wash 的 JS 逻辑在 `graph-wash.js`（`<script src>` 外链）而不是内联在 HTML 里。解决：断言改为检查 `graph-wash.js` 文件。

## Why This Matters

- **用户只关心结果**：三种风格并存是工程上的优雅，但用户只需要一个能看的图。裁剪比修补更果断。
- **install.sh 自动适配**：它用 `cp -R templates/` 和 `cp -R deps/`，不需要改——删除文件后新安装自动不含旧文件。
- **保留分支草稿**：`feat/sketchy-graph-redesign` 分支保留了 vis-network 的多轮布局优化尝试（11 个提交），未删除。如果以后需要重新评估 vis-network 方案，可以从这里恢复。

## When to Apply

- 多选项功能经过实际使用测试后，部分选项效果不达标时，果断裁剪
- 模板/vendor 文件的批量删除：先 `git rm`，确认 `install.sh` 的 `cp -R` 不受影响
- 回归测试重写：当测试断言了被删除代码的具体实现细节（如函数名、CSS 类名），需要同步更新到新实现

## Examples

**删除多余 README 条目**（合并重复行）：

```markdown
# 之前（重复）
- **交互式知识图谱**：生成自包含 HTML...
- **水彩卡片风知识图谱**：生成自包含 HTML...

# 之后（合并）
- **水彩卡片风交互式知识图谱**：生成自包含 HTML...
```

**CHANGELOG 版本号跳到 v3.0**：

```markdown
## v3.0.0 (2026-04-20)

### 新增
- **水彩卡片风交互式知识图谱**：`build-graph-html.sh` 生成 `wiki/knowledge-graph.html`...

### 移除
- classic（vis-network）和 paper（手绘笔记本）图谱风格及相关模板
- `--style` 参数和二参数兼容调用方式
```

## Related

- Session history: `feat/sketchy-graph-redesign` 分支保留了 vis-network 布局优化尝试（未合并）
- 前置工作: `docs/solutions/integration-issues/claude-code-hook-pretooluse-to-sessionstart-2026-04-11.md`（SessionStart hook 基础设施）
- 前置工作: `docs/solutions/workflow-issues/cache-update-reliability-2026-04-16.md`（缓存可靠性机制）
- 后续修复: `docs/solutions/ui-bugs/graph-wash-null-safety-and-label-truncation-fix-2026-04-21.md`（wash-only 简化后遗漏的空引用防护和标签截断统一）
