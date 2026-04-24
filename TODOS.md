# TODOs

## 学习驾驶舱全局重构主线

**Status:** completed
**设计文档：** 以仓库内全局计划为准
**全局计划：** `docs/plans/2026-04-23-learning-cockpit-global-reframe-plan.md`
**建议分支：** `feat/learning-cockpit-reframe`

### Phase 0 - 分支与约束

1. 从 `main` 开新分支 `feat/learning-cockpit-reframe`
2. 保留现有 `learning` contract 和社区运行时派生路线
3. 不回退到 primary-only 预计算社区逻辑

### Phase 1 - 收结构与 13 寸布局

1. 左侧重排成 5 段正式功能区
   - `nav-communities`
   - `nav-focus`
   - `nav-search`
   - `nav-queue`
   - `nav-start`
2. 顶部工具栏移除主搜索框，模式入口降级为二级入口
3. 收紧三列宽度，形成 `>=1440 / 1180-1439 / <1180` 三档布局
4. 让桌面 close 按钮有真实行为，或只在 overlay 态显示
5. 洞察 / 图例 / 小地图归并为统一二级入口
6. 删除右侧学习三段说明，以及对应旧渲染逻辑和旧测试

### Phase 2 - 打通社区 / 聚焦 / 搜索

1. 把社区、聚焦、搜索、边过滤统一收口到 `state.visible`
2. 增加 3 个 focus mode
   - `all`
   - `core`
   - `one_hop`
   - `high_confidence`
3. 搜索范围跟随当前 visible snapshot
4. 保留全局入口，但不再抢主叙事
5. 新增运行时状态测试文件 `tests/js/graph-wash-runtime-state.test.js`

### Phase 3 - 学习队列 MVP

1. 节点详情支持收藏
2. 节点详情支持加入学习笔记
3. 左侧显示收藏数量、笔记数量和最近几条
4. localStorage 全部改成稳定 wiki namespace 隔离
5. 为 queue 持久化和 namespace 隔离补测试

### Phase 3 进度（2026-04-24）

- 已落地：抽屉收藏、加入学习笔记、左侧队列摘要、最近条目点击回跳
- 已落地：queue 持久化与小地图/相邻节点折叠状态统一改为 wiki namespace 隔离
- 已落地：新增 `tests/js/graph-wash-queue.test.js`，并修正邻居折叠回归以匹配新存储 key
- 当前下一步：进入 Phase 4，收推荐起点弱化展示与最终文档/样本验证

### Phase 4 - 推荐起点弱化保留 + 最终验证

1. 推荐起点降级到底部辅助模块
2. 用 3 个真实 wiki 样本做 30 秒首次打开演练
3. 完成受影响回归
4. 功能落地后在 push 前更新：
   - `CHANGELOG.md`
   - `README.md`
   - 必要时版本号

### Phase 4 进度（2026-04-24）

- 已落地：图谱首次打开回到全局视图，推荐起点只作为左侧底部辅助入口
- 已落地：推荐卡片按当前上下文只显示一个起点，全局态不再强制进入路径视图
- 已落地：`CHANGELOG.md`、`README.md` / `README.en.md` 与 `SKILL.md` 版本标识同步到 v3.3.0
- 当前下一步：跑最终验证与推送前检查

## 当前审查已锁定的实现约束

- 终局不缩，只拆阶段，不把全局 plan 缩回 MVP
- `路径 / 社区 / 全局` 模式保留，但降级
- 删除右侧学习三段说明时，要同步删除死 contract、死逻辑、死测试
- 洞察 / 图例 / 小地图必须归并到统一二级入口
- 不能继续使用全局 `wiki-*` localStorage key
- 运行时状态联动不能只靠 helper test，必须有专门 runtime-state test

## 本轮完成定义

满足下面几点，才算这轮重构完成：

1. 左侧正式 5 段信息架构落地
2. `state.visible` 成为单一真相源
3. 学习队列能收藏、能记、能持久化
4. 13 寸场景下正文、画布、左右栏不再互相挤压
5. 新旧回归都对齐当前实现，不留 `dr-learning` 兼容壳

## After Multi-Platform Adaptation

- 修复 Windows / PowerShell 下的中文乱码问题（#16），至少先明确 PowerShell 5.1 / 7 的支持边界，并补安装与使用提示。
- 规划素材提取能力的内收顺序，先评估网页、PDF、本地文件、YouTube，再评估 X 等高波动来源。
- 评估是否需要为 OpenClaw 增加 workspace-skill fallback，而不只支持 shared skill 路径。
- 评估是否需要把安装器拆分成更正式的 `doctor` / `migrate` / `uninstall` 子命令。
- 评估第四个平台接入时的适配层模板，确保不回流到“复制一套主逻辑”。

## 引入 JS 单测框架（已完成）

- **Completed:** v3.0.6 (2026-04-22)
- **Decision**：采用 `node:test`，零额外依赖，直接复用项目现有 Node 运行时。
- **Delivered**：新增 `templates/graph-styles/wash/graph-wash-helpers.js` 和 `tests/js/graph-wash-helpers.test.js`，覆盖 `truncateLabel`、`createSafeStorage`、`cardDims` 以及底层字素簇/宽度 helper。
- **Result**：纯函数边界行为不再只靠 shell + HTML 回归间接兜底，`tests/regression.sh` 也已接入该 JS 单测。

## Phase 1b - 交互式图谱进阶功能（Phase 1 落地后再评）

- **What**（Phase 1 eng review 原列 3 项）：为已落地的交互式图谱新增 AI 隐含关系推断、图谱健康摘要（孤立节点 / 最大连通分量 / 脆弱桥接）、以及边置信度分级着色。
- **What（2026-04-17 design review 追加 5 项）**：
  1. 搜索升级：fuzzy 匹配 + 中英跨语言 alias（Phase 1 只做 prefix + case-insensitive）
  2. 深色模式：`prefers-color-scheme` 自动切；节点 palette 和边 opacity 要再调一次
  3. 设计系统抽离：把 Pass 4 CSS 变量块从 graph-template 抽到 `templates/design-tokens.css`，根目录写正式 `DESIGN.md`
  4. 真正的响应式：替换掉 Phase 1 的 MOBILE opt-out 覆盖层，做 `< 768px` 下单栏堆叠 + 触摸手势 pan/zoom
  5. 图谱演化指标（5-year 视图）：对比上次 graph 的节点度变化、新社区、新孤立节点；写入 `wiki/graph-history/{date}.json`
- **Why**：Phase 1 MVP 先验证有人会用本地 HTML 图谱，避免一步吃下所有 token 成本与维护负担。上面 8 项都是"截图再升级一档"的加戏。
- **Pros**：让图谱更接近 llm-wiki-agent 的能力覆盖；健康摘要给可量化质量信号；搜索和响应式覆盖更多使用场景；演化指标让用户看到"我的知识形状"变化。
- **Cons**：AI 推断每次 graph 要读全部实体页，100+ 节点时 token 消耗明显；深色模式要双份 CSS；演化指标要引入历史数据目录和对比逻辑。
- **Context**：Phase 1（2026-04-17 设计文档 approved，含 Eng Review Addenda + Design Review Addenda）只复用 ingest 已有的 confidence 数据，不重新调 AI。
- **Depends on / blocked by**：Phase 1（交互式图谱 MVP）落地并有至少一位真实用户反馈。

## Graph 2.0 deferred follow-ups

- **What**：给 graph 工作流加第二阶段 deep-analysis，读取候选边后做 LLM 语义分析，并把结果稳定写入 `insights.llm_surprises`。
- **Why**：当前阶段只能靠公式和规则看图，做不到“看起来没直接关系但语义上很值得挖”的洞察。
- **Pros**：真正把 agent skill 的优势打出来，形成和竞品最不一样的能力。
- **Cons**：需要 prompt 设计、失败路径、结果 merge 和成本控制，不能混进当前主实现。
- **Context**：本次 `/plan-eng-review` 已明确把 deep-analysis 从图谱 2.0 第一段交付拿掉，防止把最不稳定的模型编排绑进主实现；完成来源契约、权重、Louvain、Insights 主线后再进入第二阶段更稳。
- **Depends on / blocked by**：先完成本轮的来源契约、权重、Louvain、Insights 主线，并验证 `graph-data.json` 的新结构稳定。

- ~~**What**：在 lint / status 一类工作流里增加”缺 `sources` 的页面提示”，明确哪些旧页面当前没有参与 source signal 计算。~~
- **Completed:** v3.0.5 (2026-04-22) — `feat/source-signal-coverage` 分支落地

## Review follow-ups

### Edge-level same-source summary

**What:** Add a separate status/lint follow-up that reports how many graph edges actually used the same-source overlap signal, rather than only which pages were eligible.

**Why:** Page eligibility answers “which pages can participate,” but it does not answer whether the edge-level source overlap signal is doing useful work in real graph output.

**Context:** The 2026-04-22 `/plan-eng-review` reduced Batch 1 to page-level eligibility coverage only. Outside voice review flagged that “coverage summary” and “same-source signal summary” are different questions. This follow-up should stay separate from the first batch so the current change stays honest and small.

**Effort:** M
**Priority:** P2
**Depends on:** Shared eligibility/coverage landing first

### Document source-signal applicable page types

**What:** Write down the canonical rule for which page types are applicable vs not_applicable for source-signal, including exclusions like query pages and any synthesis subdirectories that should never count.

**Why:** Without an explicit project-level rule, future work can silently drift and re-include derived pages, which would pollute the evidence-quality meaning of source overlap.

**Context:** The 2026-04-22 `/plan-eng-review` changed `query` from applicable to not_applicable after outside voice review pointed out that query pages are derived content (`derived: true`) and are treated as secondary sources in `SKILL.md`. The same review also flagged that recursive synthesis scanning needs a clearly documented boundary.

**Effort:** S
**Priority:** P1
**Depends on:** Final first-batch implementation rules being settled

### Deconflict graph node IDs across page types

**What:** Define and implement a strategy so graph node IDs cannot silently collide when different page types share the same filename.

**Why:** Today the graph uses basename-derived IDs, so `entities/Foo.md` and `topics/Foo.md` would collide and make both graph output and any eligibility coverage misleading.

**Context:** The 2026-04-22 outside voice review flagged this as an existing structural risk in `build-graph-data.sh` and `graph-analysis.js`. It is not part of the first batch because that batch is intentionally limited to source-signal eligibility coverage and lint/status explanation.

**Effort:** M
**Priority:** P2
**Depends on:** None
