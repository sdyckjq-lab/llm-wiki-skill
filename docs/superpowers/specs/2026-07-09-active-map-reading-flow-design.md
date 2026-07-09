# 活地图阅读流程地基加深设计

GitHub Issue: https://github.com/sdyckjq-lab/llm-wiki-skill/issues/157

## 结论

本次只做内部地基，不改变用户看到的活地图阅读体验。

推荐方案是在现有 `planActiveMapReadingWorkflow` 规则之上，再加一层工作台侧的活地图阅读流程适配器。现有规则继续负责判断“下一步该做什么”；新适配器负责取用当前图谱阅读上下文，并统一执行规则产出的结果。

完成后，工作台主页面只表达用户动作，例如“点了节点”“关闭抽屉”“从选区发问”。它不再反复手动拼同一批图谱数据、右抽屉状态、选区状态、临时显示对象和命令编号。

## 背景

#146-#150 已经把活地图阅读流程做过一轮收拢，当前已有：

- `workbench/web/src/lib/active-map-reading-workflow.ts`：集中规划节点、社区、选区、节点阅读、右抽屉关闭、发问和图谱刷新等行为。
- `workbench/web/test/active-map-reading-workflow.test.ts`：覆盖核心用户路径，证明旧行为不能退化。
- `workbench/docs/active-map-reading-workflow-internal-refactor-spec.md`：定义了活地图阅读流程的边界。

但 `workbench/web/src/App.tsx` 仍然在很多地方直接调用 `planActiveMapReadingWorkflow`，并反复传入同一批上下文：图谱数据、图谱固定位置、图谱可见性、右抽屉、临时显示对象、退场保护和命令编号生成器。

这说明第一轮重构已经把“规则”集中起来，但“谁负责拿状态、套规则、执行结果”还散在主页面里。#157 要解决的正是这一层。

## 目标

- 活地图阅读流程有一个清楚的工作台侧总入口。
- 主页面不再反复手动拼同一批图谱阅读上下文。
- 节点阅读、社区摘要、进入社区、返回全图、关闭抽屉、选区发问、社区发问、节点发问和图谱刷新行为保持不变。
- 继续遵守“一个图谱引擎、两个宿主”：图谱引擎不拥有工作台右抽屉和对话跳转。
- 测试证明这次只是收口地基，没有改变用户路径。

## 不做

- 不改活地图视觉、按钮、文案、布局或动效。
- 不改节点、社区、选区、社区阅读的用户规则。
- 不改对话真正发送消息的流程。
- 不改知识库扫描、图谱构建、文件读取规则。
- 不把工作台专属状态塞进 `@llm-wiki/graph-engine`。
- 不新增 npm 依赖。

## 比较过的方案

### 方案 A：加深现有流程，新增工作台侧流程适配器

这是推荐方案。保留当前纯规则模块，再新增一个工作台侧流程适配器来负责：

- 持有或读取活地图阅读需要的当前状态。
- 对外提供“用户动作”级别的方法。
- 调用现有规则模块得到下一步结果。
- 统一执行这些结果，例如更新右抽屉、下发图谱命令、切回对话、打开节点阅读。

优点是风险小、边界清楚，也正好补上当前缺口。

### 方案 B：只把重复传参抽成 helper

这种方式能让 `App.tsx` 短一点，但主页面仍然知道太多流程细节。后续 AI 继续改图谱体验时，仍容易在多个 handler 里改漏。

不推荐作为 #157 的主方案。

### 方案 C：把更多规则挪进图谱引擎

这种方式看起来更彻底，但方向不对。图谱引擎应该负责图谱语义、渲染和交互事实；右抽屉、对话入口、新对话和页面读取都是工作台宿主的事情。

不推荐。

## 设计

### 1. 保留现有纯规则模块

`planActiveMapReadingWorkflow` 继续作为活地图阅读规则的核心。它接收当前上下文和一个事件，产出下一步计划。

这层保持无副作用：不直接读文件、不直接发消息、不直接操作图谱引擎、不直接改 React 状态。

### 2. 新增工作台侧流程适配器

新增一个工作台侧模块，命名为 `useActiveMapReadingWorkflow`。它服务于工作台，不属于共享图谱引擎。

它不是全局状态中心，也不是第二个 App。它负责把工作台已有状态、已有能力和 `planActiveMapReadingWorkflow` 接起来，让活地图阅读流程有一个清楚入口。

它负责取用和维护当前活地图阅读上下文：

- 当前图谱数据。
- 当前图谱固定位置。
- 当前图谱可见性。
- 当前右抽屉。
- 当前临时显示对象。
- 当前图谱阅读焦点。
- 当前要下发给图谱画布的命令。
- 右抽屉退场保护状态。

右抽屉状态必须继续复用或组合现有 `useDrawerExitRail`，不能在 `useActiveMapReadingWorkflow` 里另起第二套抽屉状态。社区进入退场依赖“当前抽屉”和“退场快照”一起变化；如果新适配器复制一份 drawer 状态，关闭按钮、Escape、图谱清选择和退场保护会重新分叉。

它对外提供用户动作级别的方法：

- 图谱选择变化。
- 图谱可见性变化。
- 图谱数据变化。
- 图谱视图重置。
- 图谱摘要按钮动作。
- 社区摘要核心节点选择和预览。
- 选区发问。
- 社区发问。
- 节点阅读动作。
- 关闭右抽屉。
- 选区和社区补充说明变化。
- 清理活地图阅读状态。

真正会改变活地图阅读流程的事件，例如图谱选择、图谱可见性、图谱数据刷新、节点阅读动作、摘要命令、发问和关闭抽屉，应统一通过 `planActiveMapReadingWorkflow`。只是在当前抽屉里改文字的动作，例如选区补充说明、社区补充说明，可以继续走同一个适配器暴露的抽屉更新方法，但不需要强行进入规则层。

主页面不再手动传一长串上下文，也不再直接知道这些事件需要哪些图谱阅读细节。

清理入口只负责清掉活地图阅读相关状态，例如图谱数据、固定位置、可见性、临时显示对象、阅读焦点、待下发图谱命令和图谱相关右抽屉。知识库或对话切换仍由工作台主页面发起；主页面在切换成功后调用这个清理入口，避免旧知识库的图谱状态残留到新上下文。

### 3. 适配器只转交工作台能力，不拥有能力本身

适配器可以接收工作台传入的能力，但不直接拥有这些能力的底层实现。

它可以统一触发或转交这些工作台能力：

- 设置右抽屉。
- 暂存右抽屉退场快照。
- 下发图谱命令。
- 打开图谱节点阅读。
- 创建新对话并交接待提问内容。
- 切回对话主区。
- 设置侧边栏错误。

这里的“触发或转交”是硬边界：适配器负责把 `planActiveMapReadingWorkflow` 的计划结果转成清楚的工作台动作，但底层动作由外部传入的能力完成。实现时应让能力名表达结果，例如 `openGraphPage(payload, options)`、`handoffGraphPrompt(input)`、`setSidebarError(message)`，而不是让适配器自己知道这些能力内部怎么读文件、怎么建对话、怎么刷新列表。

它不应该自己实现：

- 文件读取。
- 对话发送。
- 图谱渲染。
- 图谱数据构建。
- 知识库切换。

它也不应该把这些底层流程重新包成自己的私有副本：

- 不直接调用 `readPage`。
- 不直接调用 `createNewConversation` 或 `refreshConversations`。
- 不直接理解知识库路径归一化规则。
- 不直接持有对话列表、知识库列表、产出物列表或设置面板状态。
- 不直接处理图谱数据构建事件流。
- 不直接发起知识库切换或对话切换。

换句话说，`useActiveMapReadingWorkflow` 的职责是让活地图阅读流程少接线，不是把整个工作台搬进一个新 hook，也不是把简单输入变化伪装成复杂流程事件。

### 4. 主页面变成连接层

调整后，`App.tsx` 仍然负责整个工作台外壳，例如知识库、对话、布局、设置面板和产出物。

但活地图阅读相关部分应变成：

- 把适配器返回的 `drawer`、`selectionCommand`、`focusPath` 等状态传给 `GraphPanel` 和 `RightDrawer`。
- 把 `GraphPanel` 和 `RightDrawer` 的回调直接接到适配器提供的方法。
- 保留对话、知识库、产出物等非活地图逻辑在主页面。

主页面不再散落十几处 `planActiveMapReadingWorkflow` 调用。

### 5. 图谱画布和右抽屉职责不变

`GraphPanel` 继续作为图谱画布适配层：

- 接收图谱命令。
- 执行图谱引擎能力。
- 回报选择、可见性、图谱数据和视图重置。

`RightDrawer` 继续作为展示层：

- 展示当前右抽屉状态。
- 回传用户按钮动作和输入变化。

它们都不拥有跨图谱、右抽屉和对话的流程规则。

### 6. 对话交接规则不变

从活地图发问时，适配器只交出待提问内容和是否新对话。

真正创建新对话、切回对话主区、把内容塞进对话输入框，继续使用工作台现有能力。不会改变消息发送、流式回复、工具状态或知识库检索注入。

### 7. 异步页面读取保护必须保留

打开图谱节点阅读时，页面内容读取是异步的。用户可能在读取完成前点到另一个节点、关闭抽屉、进入社区或切回对话。

因此实现必须保留现有匹配保护：读取结果只能写回仍然指向同一个图谱节点和同一页路径的节点阅读抽屉。旧读取结果不能覆盖新的右抽屉状态，也不能在抽屉关闭后重新打开旧内容。

这条规则可以继续通过工作台传入的 `openGraphPage` 能力完成；`useActiveMapReadingWorkflow` 不直接读文件，但它的设计和测试必须保证这个保护不会在迁移中丢失。

## 数据流

```
GraphPanel / RightDrawer 用户动作
        |
        v
useActiveMapReadingWorkflow（工作台侧流程适配器）
        |
        v
planActiveMapReadingWorkflow
        |
        v
计划结果：右抽屉 / 图谱命令 / 页面读取请求 / 对话交接 / 焦点清理 / 临时对象
        |
        v
工作台已有能力执行结果
```

## 测试方案

继续保留并扩展现有 `active-map-reading-workflow.test.ts`。这些测试证明具体规则没有变。

新增一组工作台侧流程适配器测试，重点证明主页面不再需要亲自拼上下文：

- 图谱选择变化能通过适配器打开原来的节点摘要、社区摘要和选区抽屉。
- 图谱可见性变化和图谱数据刷新能通过适配器保留、更新或清理临时显示对象。
- 进入社区时仍保留右抽屉退场保护。
- 打开节点阅读时仍产出页面读取请求，并保持图谱焦点同步规则不变。
- 节点阅读页面异步读取完成时，只能更新仍然匹配的节点阅读抽屉；快速切换、关闭抽屉或切到别处时，旧读取结果不能覆盖新状态。
- 知识库或对话切换后，活地图阅读状态可以通过适配器清理入口一次性清干净，不留下旧图谱焦点、临时对象、命令或图谱抽屉。
- 选区、社区、节点阅读发问仍关闭图谱交互并交接给对话入口。
- 关闭按钮和 Escape 的差异保持不变。

实现完成后至少运行：

- `npm run test -w @llm-wiki-agent/web`
- `npm run typecheck`
- `bash tests/graph-community-reading-experience.regression-1.sh`
- `bash tests/graph-workbench-interactions.regression-1.sh`

这两条浏览器回归脚本是本 issue 的硬门槛，不是可选项。原因是 #157 会迁移社区阅读、节点阅读、右抽屉、选区和发问交接路径；这些路径的风险不只在纯函数里，必须用真实工作台交互再跑一遍。

## 风险和护栏

### 风险：只是把乱线搬到新文件

护栏：新适配器必须对外暴露用户动作级别的方法，不能让主页面继续传一长串内部上下文。

### 风险：适配器变成另一个大而全的 App

护栏：适配器只管活地图阅读流程，不接管知识库、对话列表、设置、产出物、批量消化等工作台其它领域。

### 风险：不小心改变用户体验

护栏：本次不改 `GraphPanel` 和 `RightDrawer` 的展示结构；测试按用户路径断言行为不变。

### 风险：状态过期导致抽屉或图谱不同步

护栏：当前右抽屉、临时显示对象、图谱可见性和图谱数据由适配器集中读取和更新，避免多个 handler 各自维护副本。

### 风险：侵入后续对话发送重构

护栏：适配器只做“把内容交给对话入口”，不改真正发送消息的规则。

## 验收标准

- `App.tsx` 不再直接调用 `planActiveMapReadingWorkflow`；调用集中在 `useActiveMapReadingWorkflow` 或等价的活地图阅读流程适配器里。
- 活地图阅读流程有一个工作台侧总入口。
- 点节点、点社区、手动单选、手动多选、进入社区、返回社区摘要、打开节点阅读、找相关页面、临时显示对象、关闭抽屉和图谱刷新行为保持不变。
- 选区、社区、节点阅读发问仍按原规则交给对话入口。
- 图谱引擎仍不拥有工作台右抽屉和对话跳转。
- 自动测试覆盖规则层和适配器层。

## 后续实施拆分建议

1. 先建立 `useActiveMapReadingWorkflow` 的最小骨架，把计划执行和重复上下文拼装集中进去。
2. 再迁移 `GraphPanel` 相关事件：选择变化、可见性变化、图谱数据变化、视图重置。
3. 再迁移 `RightDrawer` 相关事件：摘要命令、节点选择、节点预览、选区/社区/节点发问、关闭抽屉。
4. 最后收尾测试和回归，确认用户路径没有变化。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not needed: no product scope or user-facing behavior change. |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | clear | Outside voice found boundary, async, cleanup, test, and acceptance gaps; all material findings were folded into this design. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 6 issues found, 0 critical gaps, 0 unresolved decisions. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Not needed: this issue explicitly avoids visible UI changes. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not needed: no developer workflow or tooling change. |

- **CODEX:** Outside voice agreed the plan needed harder adapter boundaries, async read protection, cleanup rules, test gates, and measurable acceptance.
- **CROSS-MODEL:** No remaining tension; the outside voice's substantive objections were incorporated.
- **VERDICT:** ENG CLEARED — ready to write the implementation plan.

NO UNRESOLVED DECISIONS
