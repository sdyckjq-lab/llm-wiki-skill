# Context Map

本仓库使用多份领域词表。先读这张图，再按你要改的区域进入对应 `CONTEXT.md`；只有当某个区域长出一批独有概念时，才新增局部词表。

## How To Read This Map

| 你要确认什么 | 先读哪里 | 再读哪里 |
|---|---|---|
| 项目里的词该怎么用 | [Shared Product Language](./CONTEXT.md) | 相关区域的 `CONTEXT.md` |
| 工作台当前产品事实 | [workbench/PRODUCT.md](./workbench/PRODUCT.md) | [workbench/CONTEXT.md](./workbench/CONTEXT.md) |
| Skill 形态的工作流语言 | [Skill Package](./docs/contexts/skill-package/CONTEXT.md) | [SKILL.md](./SKILL.md) |
| 图谱语义或交互边界 | [Shared Graph Engine](./packages/graph-engine/CONTEXT.md) | [docs/adr/README.md](./docs/adr/README.md) |
| 为什么做过某个取舍 | [docs/adr/README.md](./docs/adr/README.md) | 相关 ADR 正文 |
| 旧阶段原计划、范围或验收标准 | [workbench/docs/archive/product-roadmap.md](./workbench/docs/archive/product-roadmap.md) | 必要时再看相关阶段设计 |
| 实际完成记录、提交表或变更经过 | [workbench/docs/archive/product-history.md](./workbench/docs/archive/product-history.md) | 必要时对照 git log |

## Contexts

- [Shared Product Language](./CONTEXT.md) — Skill 形态、agent 工作台和图谱体验都会用到的共用概念。
- [Skill Package](./docs/contexts/skill-package/CONTEXT.md) — 根目录 `SKILL.md`、`scripts/`、`templates/` 和 `platforms/` 共用的工作流语言。
- [Agent Workbench](./workbench/CONTEXT.md) — 本地工作台里用户直接面对的产品语言。
- [Shared Graph Engine](./packages/graph-engine/CONTEXT.md) — 工作台图谱视图和 Skill 离线 HTML 共用的图谱语言。

## Relationships

- **Skill Package -> Shared Product Language**: Skill 形态维护核心知识库流程，并复用共用词描述用户能看到的概念。
- **Agent Workbench -> Shared Product Language**: 工作台是进入同一份知识库的另一种入口，围绕它增加对话、图谱和产出物体验。
- **Shared Graph Engine -> Shared Product Language**: 图谱展示 wiki 页面及其关系，不定义另一套知识来源。

## Decision Records

- ADR 正文统一放在 [docs/adr/](./docs/adr/)；[workbench/PRODUCT.md §7](./workbench/PRODUCT.md) 只保留决策索引。
- ADR-1 到 ADR-26 和 ADR-13b 是旧工作台决策；ADR-27 起是领域文档拆分后新增的跨区域决策。
- 当前行动先用 `workbench/PRODUCT.md` 判断方向；如果词表、ADR、产品文档或代码事实之间出现冲突，先停下来说明冲突点，再决定改哪一份。
