# ADR Index

本目录保存项目关键决定。

- ADR-1 到 ADR-26，以及历史特殊编号 ADR-13b，是从 `workbench/PRODUCT.md` 拆出的旧工作台决策。
- ADR-27 起，是领域文档拆分后新增的跨区域决策。
- 主产品文档只保留索引；完整原因和取舍都放在这里。

旧工作台 ADR 保留当时的决策语境，可能出现合并前仓库名、旧路径或已被后续 ADR 修订的说法。当前执行路径以 `workbench/PRODUCT.md`、`AGENTS.md`、`CLAUDE.md` 和本索引的状态提示为准；同一主题冲突时，优先看较新的 ADR 或正文顶部的修订状态。

## Workbench Records

- [ADR-1 选 pi-agent 而非 Vercel AI SDK / Mastra](./0001-select-pi-agent-not-vercel-ai-sdk-or-mastra.md)
- [ADR-2 对话中心而非图谱中心](./0002-conversation-center-not-graph-center.md)
- [ADR-3 SSE 而非 WebSocket](./0003-sse-not-websocket.md)
- [ADR-4 先 web 再 Tauri 打包](./0004-web-first-tauri-later.md)
- [ADR-5 不用 MCP](./0005-no-mcp.md)
- [ADR-6 完全进化为 agent，不维护双通道（已被 ADR-20/27 收窄）](./0006-evolve-to-agent-no-dual-channel.md)
- [ADR-7 知识库上下文用 Extension 注入，不拼 prompt](./0007-kb-context-via-extension-not-prompt.md)
- [ADR-8 React + Vite 而非 Next.js](./0008-react-vite-not-nextjs.md)
- [ADR-9 UI 用 shadcn/ui（组件选型仍有效；视觉理由已由 ADR-24 修订）](./0009-shadcn-ui.md)
- [ADR-10 pi-agent 作为 npm 依赖，不 fork、不 clone 源码](./0010-pi-agent-npm-dependency-no-fork.md)
- [ADR-11 知识库采用混合存储策略（默认根 + 外部登记）](./0011-hybrid-knowledge-base-storage.md)
- [ADR-12 会话绑定知识库，同库支持多并行对话](./0012-sessions-bound-to-knowledge-base.md)
- [ADR-13 模型认证完全复用 pi-agent 的 auth 体系（三层 fallback）](./0013-pi-agent-auth-system.md)
- [ADR-13b 不抄 open-design 的"多 CLI 子进程"模式](./0013b-no-open-design-cli-subprocesses.md)
- [ADR-14 app 内一键新建知识库](./0014-in-app-create-knowledge-base.md)
- [ADR-15 Obsidian 共存（agent 忽略非 markdown 与第三方元数据）](./0015-obsidian-coexistence.md)
- [ADR-16 长期与 llm-wiki 仓库合并（仓库布局已由 ADR-20 落地）](./0016-merge-with-llm-wiki-repo.md)
- [ADR-17 阶段二新增前端依赖（react-markdown + cmdk）](./0017-stage-2-frontend-dependencies.md)
- [ADR-18 阶段 3.5 多模型双角色 + 轻量子代理框架](./0018-stage-3-5-model-roles-and-subagents.md)
- [ADR-19 主对话引入“系统检索 + 上下文注入”](./0019-system-retrieval-context-injection.md)
- [ADR-20 阶段四启动 monorepo 合并（丙方案，已落地；入口叙事看 ADR-27）](./0020-monorepo-merge.md)
- [ADR-21 图谱引擎与活地图（一个引擎、两个宿主）](./0021-graph-engine-living-map.md)
- [ADR-22 图谱交互模型——轻量摘要优先，明确动作进入阅读](./0022-graph-interaction-click-read-selection-upgrade.md)
- [ADR-23 关系边可视化采用“关系类型控制颜色、置信度控制虚实”](./0023-relation-type-color-confidence-stroke.md)
- [ADR-24 Paper 暖纸视觉方向与外观偏好](./0024-paper-visual-direction.md)
- [ADR-25 前端交互测试与 Paper 视觉回归栈](./0025-frontend-interaction-and-visual-regression.md)
- [ADR-26 Sigma 主路线与 DOM/SVG 回退](./0026-sigma-primary-dom-svg-fallback.md)

## Repo-Wide Records

- [ADR-27 一个产品，两种入口](./0027-one-product-two-entry-points.md)
- [ADR-28 Skill 与工作台的能力边界](./0028-skill-and-workbench-capability-boundary.md)
- [ADR-29 图谱是 wiki 结构的视图](./0029-graph-is-a-view-of-wiki-structure.md)
- [ADR-30 本地优先与数据边界](./0030-local-first-data-boundaries.md)
- [ADR-31 根目录保持 CommonJS 兼容](./0031-monorepo-root-keeps-commonjs-compatibility.md)
- [ADR-32 一个图谱引擎，两个宿主（repo-wide 摘要，细节以 ADR-21 为准）](./0032-one-graph-engine-two-hosts.md)

## When To Add One

只有同时满足这些条件时才新增 ADR：

- 以后推翻成本比较高。
- 不解释的话，后来的人会疑惑为什么这样做。
- 当时确实有别的可选方案，并且做了取舍。

如果只是普通实现细节、临时计划或容易反悔的偏好，不写 ADR。

## How To Use

改产品方向、能力归属、数据边界、图谱语义或跨区域结构前，先读这里。只改工作台内部体验时，也要继续读 `workbench/PRODUCT.md` 的决策索引。

如果这里和产品文档说法不一致，不要直接猜谁对；先看 ADR 顶部状态、较新编号和产品文档当前章节，再把冲突讲清楚，最后修改文档或代码。
