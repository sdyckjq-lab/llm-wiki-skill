# Domain Docs

本仓库使用多上下文领域文档。新协作者不要只读一个 `CONTEXT.md` 就开工，先看地图，再进入具体区域。

开始改某个区域前，先读对应的本地说明：

- 根目录协作规则：Claude Code 读 `CLAUDE.md`，Codex 读 `AGENTS.md`。
- 工作台协作规则：Claude Code 读 `workbench/CLAUDE.md`，Codex 读 `workbench/AGENTS.md`。
- 工作台产品上下文：`workbench/PRODUCT.md`。

做领域相关改动前，先读 `CONTEXT-MAP.md`，再读你要改的区域对应的 `CONTEXT.md`。
改产品方向、能力归属、存储边界或图谱语义前，先读 `docs/adr/README.md` 和相关 ADR。工作台内部决策可从 `workbench/PRODUCT.md` 第 7 节索引进入。

## Reading Path

| 场景 | 路径 |
|---|---|
| 统一项目术语 | `CONTEXT-MAP.md` → 根 `CONTEXT.md` → 区域 `CONTEXT.md` |
| 改工作台体验 | `workbench/AGENTS.md` / `workbench/CLAUDE.md` 冷启动表 → `workbench/PRODUCT.md` 相关章节 → 必要时读相关 ADR |
| 改 Skill 工作流 | `docs/agents/skill-maintenance.md` → `docs/contexts/skill-package/CONTEXT.md` → 根 `SKILL.md` |
| 改图谱语义 | `packages/graph-engine/CONTEXT.md` → `docs/adr/README.md` |
| 查旧阶段原计划 | `workbench/docs/archive/product-roadmap.md` |
| 查实际完成经过 | `workbench/docs/archive/product-history.md` |

## Contexts

- 共用产品语言：根目录 `CONTEXT.md`。
- Skill 形态：`docs/contexts/skill-package/CONTEXT.md` 和根目录 `SKILL.md`。
- Skill 维护规则：`docs/agents/skill-maintenance.md`。
- agent 工作台：`workbench/CONTEXT.md` 和 `workbench/PRODUCT.md`。
- 共享图谱引擎：`packages/graph-engine/CONTEXT.md`。
- 决策正文：`docs/adr/`。
- 工作台决策索引：`workbench/PRODUCT.md` 第 7 节。

## Vocabulary And Decisions

优先使用已经写下来的名称和边界。当前行动先用 `workbench/PRODUCT.md` 判断方向；如果未来计划和现有词表、ADR 或代码事实冲突，先指出冲突，不要静悄悄绕过去。

## Pre-PR Checks

领域文档改动准备提交或开 PR 前，至少做这几项：

- 跑 `git diff --check`。
- 检查本分支改过的 Markdown 相对链接是否还能打开。
- 扫描旧产品名、旧视觉方向、旧入口规则是否从归档漏回当前入口；保留的包名、workspace 名和 `~/.llm-wiki-agent/` 除外。
- 如果改了 ADR 正文，同时检查 `docs/adr/README.md` 和 `workbench/PRODUCT.md` 第 7 节是否需要同步状态说明。
- 如果改了入口规则，同时检查根 `AGENTS.md` / `CLAUDE.md`、`workbench/AGENTS.md` / `workbench/CLAUDE.md`、`CONTEXT-MAP.md` 是否还互相一致。
