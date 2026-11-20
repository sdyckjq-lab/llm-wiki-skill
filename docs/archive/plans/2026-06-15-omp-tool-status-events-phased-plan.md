# OMP 风格动态工具状态执行计划

日期：2026-06-15

## 目标

实现 `docs/spark/2026-06-15-omp-tool-status-events-design.md`：升级项目内部使用的 `pi-agent` 依赖，对齐新版 `omp` 更细的工具事件模型，并在当前 assistant 回复内部实现彩色动态工具条和丰富折叠历史摘要。

这不是 MVP。最终效果必须接近 `omp`：当前动作活跃、清楚、有节奏；历史动作不铺满屏幕，而是可折叠、可检查。

## 源文档

- `docs/spark/2026-06-15-omp-tool-status-events-design.md`
- `AGENTS.md`
- `workbench/AGENTS.md`
- `workbench/PRODUCT.md`

## 任务规模

L 级 phased plan。理由：该工作跨项目依赖迁移、后端事件协议、前端状态模型、视觉组件、历史消息兼容、自动测试和浏览器验收，且自然分阶段验证。

## 规格评审

结论：可以执行。

- 没有阻塞性产品决策缺口：用户已经确认升级对象是项目内部依赖，目标是对齐新版 `omp` 的动态当前工具条和折叠历史摘要。
- 主要漂移风险：实现时退回只包装旧 start/end 事件的轻量方案；本计划通过阶段 1 的依赖迁移验收和阶段 2 的稳定事件协议避免这个漂移。
- 主要技术风险：新版 `pi-agent` API 或事件字段与当前项目不兼容；本计划把依赖/API 勘查和后端适配层放在最前面，并要求迁移验收不过不得进入 UI 阶段。

## 执行规则

- 执行分支：`codex/feat-omp-tool-status-events`。
- 不在 `main` 上执行本计划。
- 执行开始前确认当前分支是专用分支，工作区除 `.superpowers/` 临时草图外没有无法分离的用户改动。
- 每完成一个已验证工作单元就提交一次，并把提交哈希记录到 `docs/plans/2026-06-15-omp-tool-status-events-progress.json`。
- 验证失败时不提交。
- 不自动 push、merge、amend。
- 阶段验收通过后直接进入下一阶段，不要求用户逐阶段确认。
- 执行者只能更新 progress 文件里的状态、证据、提交哈希、决策记录和 turn log，不能改写任务定义和验收标准。

## /goal 协议

每次继续工作时：

1. 读取 progress 文件，确认当前 phase/task。
2. 运行 `git log --oneline -15` 和本计划的基线 smoke check。
3. 只处理当前工作单元。
4. 验证通过后更新 progress、提交该工作单元、记录提交哈希。
5. 阶段验收全部通过后，记录阶段完成并进入下一阶段。

## Progress 文件

`docs/plans/2026-06-15-omp-tool-status-events-progress.json`

## 基线 Smoke Check

每个工作单元开始前运行：

```bash
npm run typecheck
```

如果依赖迁移中途导致全量 typecheck 暂时无法运行，当前工作单元必须先记录失败原因，并改跑该阶段指定的更小检查。恢复全量 `npm run typecheck` 是阶段验收条件，不能跳过。

## 实现面地图

### 后端

- `workbench/server/package.json`
- `package-lock.json`
- `workbench/server/src/agent.ts`
- `workbench/server/src/index.ts`
- `workbench/server/src/conversations.ts`
- 新增建议：`workbench/server/src/tool-status-events.ts`
- 新增建议：`workbench/server/src/tool-status-events.test.ts`
- 可能涉及 extension 类型导入：
  - `workbench/server/src/extensions/knowledge-base.ts`
  - `workbench/server/src/extensions/artifacts.ts`
  - `workbench/server/src/extensions/new-wiki.ts`
  - `workbench/server/src/extensions/synthesis.ts`
  - `workbench/server/src/digest/subagent.ts`

### 前端

- `workbench/web/src/lib/api.ts`
- `workbench/web/src/components/ChatPanel.tsx`
- `workbench/web/src/index.css`
- 新增建议：`workbench/web/src/lib/tool-status-model.ts`
- 新增建议：`workbench/web/src/lib/tool-status-format.ts`
- 新增建议：`workbench/web/src/components/ToolStatusRunway.tsx`
- 新增建议：`workbench/web/src/components/ToolHistorySummary.tsx`
- 新增测试：
  - `workbench/web/test/tool-status-model.test.ts`
  - `workbench/web/test/tool-status-format.test.ts`

### 文档

- `README.md`
- `CHANGELOG.md`
- 必要时更新 `workbench/PRODUCT.md` 的阶段记录或 ADR 摘要。

## 数据流

```text
prompt request(runId)
  -> ordered server writer
     ├─ knowledge retrieval events
     ├─ pi-agent raw events
     ├─ artifact events
     └─ done/error/cancel
  -> server adapter: tool-status-events.ts
  -> /api/prompt SSE stable v1 events
  -> web api.ts typed events
  -> tool-status-model.ts reducer keyed by runId/messageId
  -> ChatPanel assistant message state
  -> ToolStatusRunway + ToolHistorySummary
```

前端不得直接绑定底层 `pi-agent` 原始事件字段。后端负责把版本差异整理成工作台自己的稳定事件。

同一次 assistant 回复必须有稳定 `runId` 和 `messageId`，文本、工具、artifact、错误、完成、取消事件都必须带同一个边界 ID。前端只允许把事件归到匹配的当前 assistant 消息里，迟到事件不能污染下一条回复。

## 事件协议契约

后端和前端必须共享同一份工作台 Tool Status 事件定义，避免两边各自手写字段后漂移。

要求：

- 新增或明确一份稳定 v1 事件契约，覆盖 `assistant_text_delta`、`tool_status_start`、`tool_status_update`、`tool_status_end`、`tool_status_summary`、`assistant_done`、`assistant_error`、`assistant_cancelled`。
- 契约至少包含 `schemaVersion`、`runId`、`messageId`、单调递增 `seq`、工具调用 ID、工具名、用户可读动作、目标、状态、分组、摘要可见性、错误信息。
- 不能使用“或等价事件”作为实现逃口；阶段 2 之后 `/api/prompt` 对前端只输出 v1 契约事件，legacy 事件只能作为临时兼容或 feature flag fallback。
- 后端输出前先做隐私脱敏，不能把完整用户 home 绝对路径、原始长命令或敏感路径只交给前端截断。
- 后端适配器测试必须用样例原始事件证明能输出契约事件。
- 前端 reducer/formatter 测试必须复用同一批样例契约事件，证明能生成当前工具条和折叠摘要。
- 历史消息转换必须输出同一套摘要数据，不恢复运行中跑马灯；旧历史缺少参数、目标、错误时只能做“尽力摘要”，不能伪造丰富明细。
- 取消和断开连接必须是一等状态：客户端主动停止、浏览器断开、后端 abort 都要清理当前运行工具；前端不能留下永远运行中的工具条。

## 并发、排序和降级

- `/api/prompt` 必须对同一 active session 做并发保护：已有 prompt 运行时，新 prompt 要么返回明确错误，要么进入显式队列；不得让两个 prompt 共享同一全局 active session 并交错写事件。
- 后端必须为每个 prompt 建立单一有序 writer。知识库检索、pi-agent 订阅、artifact、done/error/cancel 都通过这个 writer 分配 `seq`，避免 `done` 先于工具结束、artifact 插错回复等乱序。
- 取消分两层处理：前端本地立即把当前 runway 标为 cancelled；后端对 session 执行 abort 和资源清理。浏览器已经断开时，后端不承诺还能把 cancelled 事件写回该浏览器。
- 迁移期可以有显式 feature flag fallback，例如 `legacy` / `tool-status-v1`，但阶段 5 结束时默认路径必须是 v1；fallback 的存在不能成为跳过验收的理由。
- 真实模型浏览器验收之外，还必须提供可重复的假事件流或测试入口，用固定事件脚本验证 UI 动态、折叠、取消、长历史和窄屏表现。

## 阶段 1：依赖迁移和事件能力验证

目标：把项目内部 `pi-agent` 依赖迁移到能对齐新版 `omp` 事件模型的包版本，并证明现有主链路没有被破坏。

实现面：

- `workbench/server/package.json`
- `package-lock.json`
- `workbench/server/src/agent.ts`
- `workbench/server/src/conversations.ts`
- `workbench/server/src/extensions/*`
- `workbench/server/src/digest/subagent.ts`

任务：

### 1.1 依赖和 API 勘查

确认当前项目使用的 `@earendil-works/*` 包、全局 `omp` 使用的 `@oh-my-pi/*` 包、npm 上可用目标版本，以及新版 SDK 的导出路径和事件类型。正式改项目依赖前，先做一个隔离探针，证明目标包能在本项目的 Node 后端环境里被导入、创建会话，并产出需要的工具事件。

验收：

- 记录目标包名和版本选择依据到 progress 的 `decision_log`；依据以 npm 版本、package 元数据、源码导出和 lockfile 证据为准，全局 `omp` 只能作为参考样本，不能作为唯一依据。
- 把新版包当成潜在 runtime migration 审核，不只当小版本 bump；必须逐项确认 SessionManager、auth/model 配置、ResourceLoader、extensions、message types、artifact 事件、abort 能力是否仍可用。
- 隔离探针在不修改项目正式依赖的前提下证明：Node 能导入目标 SDK、创建最小 session、订阅并观察到 `tool_execution_start` / `tool_execution_update` / `tool_execution_end` 中可用的工具名、参数、意图和结束状态；如果探针失败，progress 必须记录失败点，且不得进入 1.2。
- 隔离探针必须在临时目录执行，记录命令、目标版本、Node 版本和可复现证据；不能修改项目 `package.json`、`package-lock.json` 或 `node_modules`。
- 不修改功能代码。
- `npm run typecheck` 在原状态下 exits 0；如果原状态已经失败，progress 必须记录失败输出，并且 1.2 的验收必须先恢复迁移相关 typecheck。

### 1.2 迁移项目依赖和导入路径

把项目内部依赖迁移到目标 `pi-agent` 包族，更新导入路径和类型使用，直到后端可以编译。

验收：

- `npm install` exits 0。
- `npm run typecheck --workspace=@llm-wiki-agent/server` exits 0。
- 不修改用户全局 `omp` 或全局 `pi-agent`。
- 不直接修改 `node_modules`。

### 1.3 后端运行烟测

启动后端和前端，证明基础会话、知识库上下文、Skill 注册、会话历史读取仍然可用。

验收：

- `npm run dev` 能启动前端和后端，前端端口为 `5180`，后端端口为 `8787`。
- `npm run dev` 烟测必须有明确 readiness 检查和进程清理记录；不能只看长运行命令没有退出。
- 浏览器打开 `http://localhost:5180/` 能加载。
- 选中一个知识库后能看到当前模型和对话区域。
- 发送一个普通问题能收到 assistant 回复。
- 发送一个会触发当前知识库检索的问题，后端没有报错。
- `npm run typecheck` exits 0。

阶段 1 完成规则：1.1、1.2、1.3 全部验收通过并提交后，自动进入阶段 2。

## 阶段 2：后端稳定工具事件协议

目标：后端提供工作台自己的稳定工具事件，不让前端依赖底层事件差异。

实现面：

- `workbench/server/src/index.ts`
- `workbench/server/src/tool-status-events.ts`
- `workbench/server/src/tool-status-events.test.ts`
- `workbench/server/src/conversations.ts`

任务：

### 2.1 建立 Tool Status 事件适配器

新增后端适配器，把新版 `pi-agent` 原始事件转换为稳定事件：`assistant_text_delta`、`tool_status_start`、`tool_status_update`、`tool_status_end`、`tool_status_summary`、`assistant_done`、`assistant_error`。

验收：

- 契约事件固定为 v1 schema，所有事件都有 `schemaVersion`、`runId`、`messageId`、`seq`。
- 适配器能处理工具开始、参数更新、工具结束、工具失败、缺参数事件。
- 适配器能从 read/write/bash/search/skill 常见参数生成用户可读动作和目标。
- 适配器输出前完成路径和命令脱敏；测试覆盖用户 home 绝对路径、长路径、长命令。
- 并行工具状态规则明确：runway 显示最近活跃工具，同时记录仍在运行的其他工具数量；工具 B 结束时不能误关仍在运行的工具 A。
- 后端测试覆盖并快照一组契约事件样例，作为前端解析和历史摘要测试的同源输入。
- `node --import tsx --test workbench/server/src/tool-status-events.test.ts` exits 0。

### 2.2 接入 `/api/prompt` SSE

把 `/api/prompt` 从旧的 `tool_start` / `tool_end` 输出改为稳定工具事件。当前知识库检索也要作为同一套工具状态事件进入前端，而不是单独塞进旧工具列表。

验收：

- `text_delta` 或等价正文增量仍能正常流式输出。
- 知识库检索开始、完成、为空、失败都有工具状态事件。
- artifact_created 事件不被破坏。
- 所有事件通过单一 ordered writer 输出，`seq` 单调递增；done/error/cancel 只能在当前 writer flush 后输出。
- 同一 active session 的并发 prompt 被明确拒绝或排队，测试覆盖并发请求不会混写事件。
- 客户端断开或主动停止时，后端调用新版 session abort 能力；若底层不支持，必须记录降级理由，并至少停止继续写 SSE。
- 中断时后端清理当前运行工具状态；如果客户端仍连接则发送 `assistant_cancelled` 和 active tools 的 `cancelled` 收尾事件，如果已断开则只做后端清理和持久化安全处理。
- `npm run typecheck --workspace=@llm-wiki-agent/server` exits 0。

### 2.3 历史消息摘要兼容

更新会话历史转换，让历史 assistant 消息能显示完成后的工具摘要，而不是恢复动态跑马灯或旧的一长串工具。

验收：

- 旧会话中已有工具调用仍能显示为摘要。
- 旧会话缺少目标、参数、结果、错误时显示“历史工具调用”这类 best-effort 摘要，不伪造不存在的细节。
- 新会话摘要的持久化策略明确：要么从 pi session messages 可再生，要么保存工作台摘要字段；刷新页面后折叠摘要不能凭空消失。
- 没有工具调用的历史消息不显示空摘要。
- `node --import tsx --test workbench/server/src/tool-status-events.test.ts workbench/server/src/retrieval.test.ts` exits 0。

阶段 2 完成规则：所有任务验收通过，`npm run typecheck` exits 0，并提交后自动进入阶段 3。

## 阶段 3：前端工具状态模型

目标：前端建立独立的工具状态模型，当前工具条和历史摘要由模型驱动，不再把实时工具直接塞进消息数组。

实现面：

- `workbench/web/src/lib/api.ts`
- `workbench/web/src/lib/tool-status-model.ts`
- `workbench/web/src/lib/tool-status-format.ts`
- `workbench/web/src/components/ChatPanel.tsx`
- `workbench/web/test/tool-status-model.test.ts`
- `workbench/web/test/tool-status-format.test.ts`

任务：

### 3.1 定义前端 Tool Status 类型和 reducer

新增前端类型和 reducer，把 start/update/end/summary 事件归并成当前运行项、完成项、分组摘要、失败项。

验收：

- reducer 单测覆盖连续工具切换、缺参数、失败、取消、并行工具、摘要截断。
- reducer 按 `runId` / `messageId` 归属事件，迟到、重复、未知 run 的事件不会污染当前 assistant 消息。
- reducer 单测复用阶段 2 的契约事件样例；如果后端事件字段变化，前端测试必须失败。
- 高频 `tool_status_update` 不得逐条触发昂贵渲染：模型或 ChatPanel 必须合并短时间内的更新，目标刷新节奏控制在约 80-150ms，视觉上顺滑但不刷屏。
- 完成历史和摘要必须有容量上限；超过上限时折叠为“还有 N 项”，不能让一次长任务把消息对象或 DOM 无限撑大。
- `npm run test --workspace=@llm-wiki-agent/web -- tool-status-model.test.ts` exits 0，或若 npm test 不支持文件过滤，则 `npm run test --workspace=@llm-wiki-agent/web` exits 0。

### 3.2 格式化用户可读工具动作

新增格式化逻辑，保证 read/write/bash/search/skill 的动作标签和目标短句稳定、可截断、可分组。

验收：

- 格式化单测覆盖长路径、长命令、空参数、未知工具。
- 输出不包含私密绝对路径的完整用户目录；长路径默认保留相对路径或文件名尾部。
- `npm run test --workspace=@llm-wiki-agent/web` exits 0。

### 3.3 重接 ChatPanel 流式事件

ChatPanel 使用新工具状态模型驱动当前 assistant 回复。旧的 `message.tools` 实时追加逻辑停止用于运行中工具展示。

验收：

- 文本流仍显示在当前 assistant 回复中。
- 同一时间当前回复只显示一个当前工具状态。
- 工具完成后进入摘要，不再生成一长串 `.msg-tool` 行。
- streaming 期间提供明确的停止入口，触发 AbortController，并立即在前端本地把当前工具条收尾为取消状态；后端成功 abort 是额外确认，不作为前端清理的前置条件。
- prompt 运行中的按钮和输入状态清楚，不允许用户误以为可以发起第二个并发 prompt；如果后端返回并发拒绝，前端显示可理解错误。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。

阶段 3 完成规则：所有任务验收通过，`npm run typecheck` exits 0，并提交后自动进入阶段 4。

## 阶段 4：OMP 风格视觉组件

目标：实现当前 assistant 回复内部的彩色动态工具条，以及丰富但折叠的历史摘要。

实现面：

- `workbench/web/src/components/ToolStatusRunway.tsx`
- `workbench/web/src/components/ToolHistorySummary.tsx`
- `workbench/web/src/components/ChatPanel.tsx`
- `workbench/web/src/index.css`

任务：

### 4.1 实现 ToolStatusRunway

新增彩色动态工具条，显示动作动词、目标、状态；支持运行中、完成、失败、取消；支持深色和浅色主题。

验收：

- 运行中状态有彩色动态效果。
- 失败和取消状态视觉上可区分。
- 目标过长时不会撑破布局。
- 明确视觉指标：默认折叠摘要最多展示 3 个关键目标，展开明细最多直接渲染 50 项，超过显示剩余数量；工具条更新节奏约 80-150ms；窄屏 390px 无横向滚动。
- 支持 reduced-motion：系统减少动态效果时取消跑马灯动画，但保留清楚状态、颜色和文本。
- 深浅主题下状态色和文字对比度可读。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。

### 4.2 实现 ToolHistorySummary

新增折叠摘要组件，默认展示分组、数量和少量关键目标；展开后展示完整清单。

验收：

- 默认折叠态空间占用小。
- Read/Write/Bash/Search/Skill 能按组展示。
- 超过展示上限时显示剩余数量。
- 极长任务的展开明细也要有可控上限，避免一次消息渲染上百行工具明细导致页面卡顿。
- 展开/收起不影响正文 Markdown 排版。
- `npm run test --workspace=@llm-wiki-agent/web` exits 0。

### 4.3 替换旧工具列表视觉

移除或停用当前 `.msg-tools` 实时流水账展示，确保新组件挂在当前 assistant 回复内部、正文之前。

验收：

- 复杂任务运行时主聊天区不会出现连续几十行工具名。
- 历史消息显示折叠摘要，不显示动态跑马灯。
- 窄屏下没有横向滚动。
- `npm run typecheck` exits 0。

阶段 4 完成规则：所有任务验收通过，`npm run typecheck` exits 0，并提交后自动进入阶段 5。

## 阶段 5：端到端验收、文档和收尾

目标：真实跑通长任务，确认体验接近 `omp`，并更新用户可见文档。

实现面：

- `README.md`
- `CHANGELOG.md`
- 必要时 `workbench/PRODUCT.md`
- 浏览器验证记录写入 progress 文件

任务：

### 5.1 真实任务浏览器验收

启动应用并运行一个会触发多次 read/write/bash 或 Skill 工具调用的代表性任务。

验收：

- Browser 打开 `http://localhost:5180/`。
- 使用假事件流或测试入口跑固定脚本，稳定覆盖 start/update/end/fail/cancel/long-history/parallel-tools；真实模型长任务作为补充验收。
- 在 1440px、768px、390px 视口下检查聊天区。
- 运行任务期间当前 assistant 回复中始终只有一个当前工具条。
- 工具切换时工具条内容更新。
- 点击停止后当前工具条显示取消状态，后端不继续向该次请求写入工具事件。
- 工具结束后出现折叠摘要。
- 展开摘要后能看到分组和明细。
- 没有明显文字溢出、遮挡输入框、横向滚动。
- 验收截图或文字证据记录到 progress。

### 5.2 回归验证

跑自动检查和核心后端/前端测试。

验收：

- `npm run typecheck` exits 0。
- `npm run test --workspace=@llm-wiki-agent/web` exits 0。
- `node --import tsx --test workbench/server/src/*.test.ts` exits 0，或如果某些既有 server 测试因环境前置条件失败，记录失败测试名、失败原因，并至少证明本次新增/修改的 server 测试 exits 0。
- 不允许本次新增/修改的 server 测试被“既有环境问题”豁免；新增测试必须稳定通过。

### 5.3 文档更新

按仓库规则更新用户可见文档。

验收：

- `CHANGELOG.md` 顶部增加本次功能条目。
- `README.md` 的功能列表提到 `omp` 风格动态工具状态和折叠摘要。
- 如果实现中改变了产品阶段或 ADR 决策，`workbench/PRODUCT.md` 有对应说明；如果没有改变，progress 记录“不需要更新 PRODUCT.md”的理由。
- `git diff --check` exits 0。

阶段 5 完成规则：所有验收通过，progress 记录最终状态和残余风险，提交最后一个工作单元后停止并汇报。

## 测试计划

自动测试：

- `npm run typecheck`
- `npm run typecheck --workspace=@llm-wiki-agent/server`
- `npm run typecheck --workspace=@llm-wiki-agent/web`
- `npm run test --workspace=@llm-wiki-agent/web`
- `node --import tsx --test workbench/server/src/tool-status-events.test.ts`
- `node --import tsx --test workbench/server/src/*.test.ts`

浏览器测试：

- `http://localhost:5180/`
- 视口：1440px desktop、768px tablet、390px mobile
- 场景：普通问答、当前知识库检索、多工具长任务、停止/取消、并行工具事件脚本、长历史摘要、历史会话恢复、深色/浅色主题切换、reduced-motion

## 不在范围内

- 不修改用户本机全局 `omp`。
- 不直接修改 `node_modules`。
- 不把工具完整输出铺进主聊天区。
- 不重做整个聊天系统。
- 不新增桌面打包能力。
- 不新增无关知识库功能。

## 失败模式和恢复

- 依赖升级后 SDK API 不兼容：阶段 1 必须先修 imports/typecheck，不能进入 UI 阶段；必要时锁定可用新版版本并记录理由。
- 新版事件缺少某些工具参数：后端适配器必须降级显示工具名和通用动作，不能让前端空白。
- 两个 prompt 并发进入同一 session：后端必须拒绝或排队，不能混写事件；前端收到拒绝时显示清楚错误。
- 多来源异步写 SSE 乱序：所有输出必须经过 ordered writer，done/error/cancel 是最后的终态事件。
- 迟到事件污染下一条回复：事件契约必须带 `runId` / `messageId` / `seq`，前端 reducer 丢弃不匹配事件。
- 多工具并行导致当前工具跳动过快：前端模型显示最近活跃项，摘要保留全部，必要时显示“另有 N 项运行中”。
- 高频工具更新导致前端卡顿：前端必须合并短时间内的 update 事件，并限制历史摘要容量；完整原始输出不进入主聊天 DOM。
- 历史会话缺少新摘要字段：历史转换必须从已有 assistant tool calls 生成摘要，不能破坏旧会话展示。
- 用户中断请求但后台继续跑：`/api/prompt` 必须把客户端 abort 传到底层 session 并做后端清理；前端本地立即收尾为 cancelled，如果底层 abort 不可用，必须记录降级并确保 UI 不显示假运行。
- 旧历史缺少丰富工具信息：只显示 best-effort 摘要，不伪造参数、目标或错误。
- 隐私路径泄露：后端适配器在事件输出和历史摘要生成前脱敏，前端截断只是第二道保护。
- 动画影响可读性或性能：CSS 动效必须可读，长文本截断；如果系统减少动态效果，仍要保留清楚状态。

## 决策记录

- 决策：采用项目内依赖升级，而不是只做前端包装。
  原因：用户明确要求对齐新版 `omp` 事件模型，不接受 MVP 版。
  拒绝方案：只用旧 start/end 事件做粗粒度工具条。
  来源：用户确认“升级这个项目里依赖的那份 pi-agent，然后对齐新版 omp 的事件模型”。

- 决策：前端不直接绑定 `pi-agent` 原始事件。
  原因：底层依赖升级可能带来事件字段变化，工作台需要稳定协议。
  拒绝方案：ChatPanel 直接识别所有底层事件字段。
  来源：spec 的“事件设计”和现有 SSE 结构。

- 决策：工具条放在当前 assistant 回复内部、正文之前。
  原因：用户在视觉草图中选择 A。
  拒绝方案：悬浮输入框上方或顶部状态栏。
  来源：用户选择。

## /goal Starter

```text
/goal Implement docs/plans/2026-06-15-omp-tool-status-events-phased-plan.md by following its execution ledger.

Each turn:
1. Read docs/plans/2026-06-15-omp-tool-status-events-progress.json, then the current task in the plan.
2. Run `git log --oneline -15` and `npm run typecheck`; repair a broken state before starting new work.
3. Work only on the current work unit.
4. After verification passes: update the progress file (status, evidence, and log fields only), commit that unit, record the commit hash. Never commit on failed verification. Never push, merge, or amend.
5. When a phase's acceptance checks all pass, record it and continue to the next phase without asking.

Done when every task is complete, every acceptance check is proven, and the progress file records final status and residual risk.
```

## 工程审核补充

### Review 状态

- Step 0 scope challenge：复杂度确实高，但用户已确认不要 MVP，保留完整 `omp` 级体验。
- Architecture review：发现 4 组必须加固点，均已写入计划：依赖隔离探针、共享事件契约、停止/取消收尾、请求边界与事件排序。
- Code quality review：没有要求删减模块；当前拆分方向合理，关键是不要把新状态逻辑继续堆进 ChatPanel。
- Test review：需要从计划阶段就绑定契约 fixture、取消路径、性能上限和浏览器验收。
- Performance review：已补充高频 update 合并和历史摘要上限。
- Outside voice：Codex 独立审核已运行，采纳其关于 run/message ID、ordered writer、并发保护、假事件流、历史 best-effort 和后端脱敏的建议。

### What Already Exists

- `/api/prompt` 已经把 pi-agent 事件转成 SSE，但目前只有粗粒度 `tool_start` / `tool_end`。
- 当前知识库检索已经有 start / done / empty / error 事件，但它走的是旧工具列表逻辑。
- 前端 `ChatPanel` 已经有 `AbortController`，但没有清楚的停止入口，也没有把中断传成工具取消状态。
- `parseSSE` 已经支持 `POST + fetch + ReadableStream`，适合保留，不需要改成 EventSource。
- 历史会话转换已经能提取 assistant 里的工具名，但只能输出扁平 done 列表，需要升级为摘要数据。

### Tool Status State Machine

```text
raw pi-agent event
  ├─ tool_execution_start
  │    -> running(toolCallId)
  ├─ tool_execution_update
  │    -> running(toolCallId, latest args/result)
  ├─ tool_execution_end(isError=false)
  │    -> done(toolCallId) -> summary
  ├─ tool_execution_end(isError=true)
  │    -> failed(toolCallId) -> summary
  └─ client abort / session abort
       -> cancelled(active toolCallIds) -> summary

frontend render
  running latest active item -> ToolStatusRunway
  done/failed/cancelled items -> ToolHistorySummary
  old persisted messages -> summary only, never live runway
```

### Test Coverage Diagram

```text
CODE PATHS                                               USER FLOWS
[+] Dependency migration                                  [+] Normal prompt
  ├── [GAP] Node import/session probe [Phase 1.1]             └── [GAP] text streams, no tool UI regression
  ├── [GAP] package/import migration [Phase 1.2]          [+] Knowledge-base retrieval
  └── [GAP] backend smoke [Phase 1.3]                         ├── [GAP] start/done/empty/error as tool status
                                                              └── [GAP] retrieval failure degrades visibly
[+] Backend stable events
  ├── [GAP] raw start/update/end -> contract [Phase 2.1]   [+] Multi-tool long task [->E2E]
  ├── [GAP] failure/missing args fallback [Phase 2.1]          ├── [GAP] one live runway, not a wall of tools
  ├── [GAP] prompt SSE emits v1 contract [Phase 2.2]           ├── [GAP] tool switching stays readable
  ├── [GAP] ordered seq writer [Phase 2.2]                     ├── [GAP] parallel tool status stays coherent
  ├── [GAP] concurrent prompt guard [Phase 2.2]                └── [GAP] finished folded summary expands
  ├── [GAP] abort/disconnect -> cleanup [Phase 2.2]
  └── [GAP] old history -> best-effort summary [Phase 2.3]
                                                          [+] Stop/cancel [->E2E]
[+] Frontend model/render                                     ├── [GAP] stop button aborts current request
  ├── [GAP] reducer: switch/parallel/fail/cancel [3.1]         ├── [GAP] active runway becomes cancelled
  ├── [GAP] run/message ID event ownership [3.1]               └── [GAP] backend stops writing that stream
  ├── [GAP] shared fixture compatibility [3.1]
  ├── [GAP] update coalescing/history cap [3.1]
  ├── [GAP] safe labels/truncation/privacy [3.2]           [+] Responsive visual QA
  └── [GAP] ChatPanel integration [3.3]                       ├── [GAP] 1440px / 768px / 390px
                                                              ├── [GAP] no overflow or input overlap
[+] Visual components                                         ├── [GAP] dark/light states readable
  ├── [GAP] ToolStatusRunway states [4.1]
  ├── [GAP] ToolHistorySummary fold/expand [4.2]
  ├── [GAP] fake event stream visual script [5.1]
  └── [GAP] old .msg-tools disabled [4.3]

COVERAGE NOW: plan-stage only, implementation not started.
REQUIRED BEFORE SHIP: all GAP lines above must have unit, server, or browser evidence in progress.json.
```

### Failure Modes

| Flow | Realistic failure | Planned coverage | User impact if missed |
|---|---|---|---|
| Dependency upgrade | Target package imports in Bun but fails under project Node | Phase 1.1 isolated probe | Upgrade breaks backend before UI work starts |
| Event adapter | Bottom-layer event fields change names | Shared contract fixture tests | Frontend silently stops showing tools |
| Prompt boundary | Late event from one reply lands in another reply | runId/messageId/seq reducer tests | Wrong tool appears under the wrong answer |
| Prompt concurrency | Two API prompts share one active session | same-session prompt guard test | Tool events and history mix together |
| Event ordering | done/artifact/tool end race each other | ordered writer test | Summary appears before the tool actually ends |
| Prompt SSE | Client disconnect does not abort session | Phase 2.2 abort test and browser stop QA | User thinks task stopped while backend keeps running |
| Frontend reducer | Parallel tools leave stale running item | Reducer tests for parallel and cancel | Runway spins forever or shows wrong current action |
| Formatter | Long absolute path leaks local home path | Formatter tests for long path privacy | Private path appears in chat UI |
| History conversion | Old sessions restore live-looking tools | History summary compatibility test | Old messages look like they are still running |
| Visual components | Long command stretches layout | 390px/768px/1440px browser QA | Chat text overlaps or horizontal scroll appears |
| High-frequency updates | Every update forces visible re-render | Coalescing and history cap tests | Long tasks feel laggy and visually noisy |

No silent critical gap remains after the added requirements, assuming implementation follows the acceptance checks.

### Parallelization Strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 dependency probe/migration | server dependencies, server imports | — |
| Phase 2 backend contract | server prompt route, server adapter, history conversion | Phase 1 |
| Phase 3 frontend model | web API/types, reducer, formatter | Phase 2 contract fixture |
| Phase 4 visual components | web components, CSS, ChatPanel | Phase 3 model |
| Phase 5 QA/docs | browser QA, README, CHANGELOG | Phases 1-4 |

Recommended order: Phase 1 is sequential. After Phase 2 contract fixtures exist, Phase 3 reducer/formatter and Phase 4 visual styling can partially overlap only if both use the same fixture contract. Final ChatPanel integration and browser QA stay sequential.

Conflict flags: Phase 3 and Phase 4 both touch `workbench/web/src/components/ChatPanel.tsx`; keep that integration in one lane to avoid merge churn.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — dependency — Prove target pi-agent package in isolated Node probe before migration
  - Surfaced by: Architecture review D2 — `@oh-my-pi` package is Bun-oriented, so project migration needs a Node import/session/event probe first.
  - Files: `workbench/server/package.json`, `package-lock.json`, progress ledger.
  - Verify: isolated probe evidence recorded, then `npm run typecheck` still passes in the pre-migration state.
- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — event contract — Create shared backend/frontend tool status contract fixtures
  - Surfaced by: Architecture review D3 — backend and frontend would otherwise hand-write event fields and drift silently.
  - Files: `workbench/server/src/tool-status-events.ts`, `workbench/server/src/tool-status-events.test.ts`, `workbench/web/src/lib/tool-status-model.ts`, `workbench/web/test/tool-status-model.test.ts`.
  - Verify: backend adapter tests and frontend reducer tests reuse the same fixture data.
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — cancel flow — Propagate stop/disconnect to session abort and cancelled tool endings
  - Surfaced by: Architecture review D4 — current UI has an AbortController but no stop path, and `/api/prompt` does not call `session.abort()` on disconnect.
  - Files: `workbench/server/src/index.ts`, `workbench/server/src/tool-status-events.ts`, `workbench/web/src/components/ChatPanel.tsx`, `workbench/web/src/lib/tool-status-model.ts`.
  - Verify: server abort test plus browser stop/cancel QA.
- [ ] **T4 (P2, human: ~1h / CC: ~10min)** — frontend performance — Coalesce rapid tool updates and cap long history summaries
  - Surfaced by: Performance review D5 — raw tool update bursts can cause flicker, DOM bloat, and sluggish long-task rendering.
  - Files: `workbench/web/src/lib/tool-status-model.ts`, `workbench/web/src/components/ToolStatusRunway.tsx`, `workbench/web/src/components/ToolHistorySummary.tsx`, `workbench/web/test/tool-status-model.test.ts`.
  - Verify: reducer tests simulate rapid update bursts and long histories.
- [ ] **T5 (P1, human: ~2h / CC: ~20min)** — stream boundary — Add run/message IDs, ordered writer, and prompt concurrency guard
  - Surfaced by: Outside voice D6 — without request ownership and ordered writing, late events or parallel prompts can land in the wrong assistant reply.
  - Files: `workbench/server/src/index.ts`, `workbench/server/src/tool-status-events.ts`, `workbench/web/src/lib/api.ts`, `workbench/web/src/lib/tool-status-model.ts`.
  - Verify: server tests cover monotonic `seq`, done-after-flush, and same-session concurrent prompt rejection or queueing.
- [ ] **T6 (P1, human: ~2h / CC: ~20min)** — QA harness — Add deterministic fake event stream for visual and cancellation QA
  - Surfaced by: Outside voice D6 — real model/browser QA is necessary but not stable enough as the only acceptance signal.
  - Files: `workbench/server/src/index.ts`, `workbench/web/src/components/ChatPanel.tsx`, `workbench/web/test/tool-status-model.test.ts`, progress evidence.
  - Verify: fake script covers start/update/end/fail/cancel/parallel-tools/long-history at 1440px, 768px, and 390px.

### Review Completion Summary

- Step 0: Scope Challenge — scope accepted as-is; no MVP reduction.
- Architecture Review: 4 issue groups found and folded into the plan.
- Code Quality Review: 0 new issues; keep ChatPanel from absorbing the new state machine.
- Test Review: diagram produced, 6 core gaps converted into acceptance checks and tasks.
- Performance Review: 1 issue found and folded into the plan.
- Outside voice: ran (Codex), accepted D6 hardening set.
- NOT in scope: already written in this plan; no new out-of-scope item added.
- TODOS.md updates: 0 items proposed; no standalone follow-up is needed before implementation.
- Failure modes: 0 silent critical gaps after the added requirements.
- Parallelization: 5 workstreams, mostly sequential until the shared contract fixture exists.
- Lake Score: 6/6 recommendations chose the complete option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | REVIEWED | Found request-boundary, ordering, concurrency, fake-QA, legacy-history, and privacy hardening; accepted into plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues, 0 critical gaps; all folded into plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

- **CODEX:** Outside voice ran and D6 hardening was accepted into the plan.
- **CROSS-MODEL:** Both reviews agree the complete path needs dependency probing, a stable event contract, cancellation handling, and browser proof; Codex added stricter request ownership, ordering, concurrency, and deterministic fake-event QA.
- **VERDICT:** ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
