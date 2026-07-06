# Domain Docs

本仓库使用多上下文领域文档。新协作者不要只读一个 `CONTEXT.md` 就开工，先看地图，再进入具体区域。

开始改某个区域前，先读对应的本地说明：

- 根目录协作规则：Claude Code 读 `CLAUDE.md`，Codex 读 `AGENTS.md`。
- 工作台协作规则：Claude Code 读 `workbench/CLAUDE.md`，Codex 读 `workbench/AGENTS.md`。
- 工作台产品上下文：`workbench/PRODUCT.md`。

做领域相关改动前，先读 `CONTEXT-MAP.md`，再读你要改的区域对应的 `CONTEXT.md`。
改产品方向、能力归属、存储边界或图谱语义前，先读 `docs/adr/README.md` 和相关 ADR。工作台内部决策还要继续读 `workbench/PRODUCT.md` 第 7 节。

## Contexts

- 共用产品语言：根目录 `CONTEXT.md`。
- Skill 形态：`docs/contexts/skill-package/CONTEXT.md` 和根目录 `SKILL.md`。
- agent 工作台：`workbench/CONTEXT.md` 和 `workbench/PRODUCT.md`。
- 共享图谱引擎：`packages/graph-engine/CONTEXT.md`。
- 跨区域决策：`docs/adr/`。
- 旧工作台决策：`workbench/PRODUCT.md` 第 7 节。

## Vocabulary And Decisions

优先使用已经写下来的名称和边界。如果未来计划和现有词表或 ADR 冲突，先指出冲突，不要静悄悄绕过去。
