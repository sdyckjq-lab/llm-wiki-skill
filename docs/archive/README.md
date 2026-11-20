# docs/archive

本目录在 `v3.7.0` 维护收尾时建立，用于归档项目演进过程中产生的历史 AI 协作设计稿、分阶段执行计划、审计记录与阶段性性能试验报告。这些文件仅保留作为历史上下文参考，**不代表当前活跃路线或待执行计划**。

## 目录内容

| 目录 | 说明 |
|---|---|
| `plans/` | 早期分阶段执行计划与进度账本（`*-phased-plan.md` / `*-progress.json`） |
| `spark/` | 图谱架构、交互与 Paper UI 等历史构想设计稿及静态原型 |
| `superpowers/` | 历史规格说明（`specs/`）与对应实现计划（`plans/`） |
| `audits/` | 历史安全与浏览器主流程审计记录（如 Issue #158、#235） |
| `graph/` | 图谱交互风险审计、路径身份验证与性能对比报告 |

## 仍在原位保留的活跃文档与基线

以下目录仍位于各自原路径，供维护、测试或架构回溯使用：

- [docs/adr/](../adr/) — 架构与产品决策记录（ADR）
- [docs/agents/](../agents/) — 仓库维护与协作约定（含 Skill 维护说明）
- [docs/contexts/](../contexts/) — 领域词表上下文
- [docs/design/](../design/) — 东方编辑部 / 数字山水图谱视觉设计源
- `docs/graph/performance/artifacts/issue-159/baseline/` — 不可变性能回归基线（由 `tests/issue-282-performance-acceptance.sh` 与 `tests/browser/capture-issue-159-hover-baseline.mjs` 直接引用）
- [workbench/PRODUCT.md](../../workbench/PRODUCT.md) — `workbench/` 实验原型的产品边界与决策索引
