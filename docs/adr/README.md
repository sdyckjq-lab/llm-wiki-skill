# ADR Index

本目录保存会影响多个区域的关键决定。旧的工作台决策记录仍在 `workbench/PRODUCT.md` 第 7 节，编号为 ADR-1 到 ADR-26；本目录从 `0027` 接着写，避免同一个仓库里出现两个不同的 ADR-1。

## Records

- [0027 一个产品，两种入口](./0027-one-product-two-entry-points.md) — Skill 形态和工作台都是 llm-wiki 的入口，不是两个产品。
- [0028 Skill 与工作台的能力边界](./0028-skill-and-workbench-capability-boundary.md) — 成熟知识库流程留在 Skill，工作台专属状态留在工作台。
- [0029 图谱是 wiki 结构的视图](./0029-graph-is-a-view-of-wiki-structure.md) — 图谱展示知识结构，但不自己成为知识来源。
- [0030 本地优先与数据边界](./0030-local-first-data-boundaries.md) — 知识库、应用状态和模型凭证分开放，产品不走云服务主线。
- [0031 根目录保持 CommonJS 兼容](./0031-monorepo-root-keeps-commonjs-compatibility.md) — 根目录不整体切到 ESM，避免破坏成熟 Skill 脚本和测试。
- [0032 一个图谱引擎，两个宿主](./0032-one-graph-engine-two-hosts.md) — 工作台图谱和 Skill 离线 HTML 共用同一个图谱引擎。

## When To Add One

只有同时满足这些条件时才新增 ADR：

- 以后推翻成本比较高。
- 不解释的话，后来的人会疑惑为什么这样做。
- 当时确实有别的可选方案，并且做了取舍。

如果只是普通实现细节、临时计划或容易反悔的偏好，不写 ADR。

## How To Use

改产品方向、能力归属、数据边界、图谱语义或跨区域结构前，先读这里。只改工作台内部体验时，也要继续读 `workbench/PRODUCT.md` 第 7 节里的旧 ADR。

如果这里和产品文档说法不一致，不要直接猜谁对；先把冲突讲清楚，再修改文档或代码。
