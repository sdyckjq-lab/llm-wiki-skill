# Sigma/Graphology 全局图谱正式接入执行计划

日期：2026-06-19
规格来源：`docs/spark/2026-06-19-sigma-global-graph-renderer-design.md`
Progress：`docs/plans/2026-06-19-sigma-global-renderer-integration-progress.json`

## 目标

把 Sigma/Graphology 正式接入 llm-wiki 的全局图谱视角：

- 所有全局视角统一走 Sigma/Graphology。
- 社区阅读、离线详情和富信息内容继续走现有 DOM/SVG 阅读路径。
- Sigma 只负责全局地图绘制、视口交互和命中投射；图谱语义继续由 `packages/graph-engine/` 负责。
- 开工前先通过 Phase 0 门槛；如果发现 Sigma 本身存在硬阻塞，停止本实施方向并记录 blocker，不在本计划内改接 vis-network。
- 发布前证明 1000 / 5000 / 10000 等 11 类图谱形状的行为和性能，拖动/缩放目标稳定在 45 FPS 以上。

## 源文档

- `docs/spark/2026-06-19-sigma-global-graph-renderer-design.md`
- `docs/spark/2026-06-18-large-graph-global-community-design.md`
- `docs/graph/performance/2026-06-19-phase-6-4-global-renderer-route-decision.md`
- `docs/graph/performance/2026-06-19-phase-6-1-sigma-graphology-trial.md`
- `docs/plans/2026-06-17-graph-renderer-coordination-split-phased-plan.md`
- `AGENTS.md`
- `workbench/AGENTS.md`
- `workbench/PRODUCT.md`

## 规格评审

结论：**ready，可以写执行计划**。

阻塞决策：无。

已定方向：

- Sigma/Graphology 是首选正式全局路线。
- Phase 0 是开工门槛，不是重新选型。
- 大图失败兜底是最低可用安全视图，不是第二套完整图谱产品。
- 生产 Sigma 必须使用图谱引擎适配层输出的受控渲染数据，不能直接遍历原始 `GraphData` 自己决定画什么。
- 当前主要隐性工作量不只在 `controller.ts`，还包括 renderer root、pipeline、controls 和全局/社区路由点。

漂移风险：

- 把 Phase 0 做成无限测试项目。
- 把聚合安全视图扩成第三套产品。
- 把语义逻辑写进 Sigma 回调。
- 保留两个用户可见的全局主路径。

本计划用阶段边界和验收阻止这些漂移。

## 任务规模

L 级 phased plan。理由：本任务跨性能 harness、图谱引擎渲染边界、Sigma 生产路径、workbench 集成、浏览器回归和发布清理，超过 10 个工作单元，且预计跨多个 `/goal` turn。

## 执行分支策略

实现分支：`codex/sigma-global-renderer-integration`

执行从包含本计划文件的分支开始，第一项动作创建或切换到实现分支，并做 clean-start commit。不要在 `main` 上跑本 ledger。

如果执行时当前分支已经是 `codex/sigma-global-renderer-integration`，任务 `0.1` 只需验证分支和记录基线。

## 执行规则

- 每个工作单元开始前读 progress 文件，确认当前 phase/task。
- 每个工作单元开始前运行 `git log --oneline -15` 和基线 smoke check。
- 基线 smoke check：`npm run test --workspace=@llm-wiki/graph-engine`
- 若 smoke check 已失败，先修复与当前计划相关的破损；无法安全修复则停止汇报。
- 只处理当前工作单元，不跳任务。
- 每个工作单元完成并验证后，把代码改动和 progress 更新放进同一个 commit，提交信息带 task id，例如 `feat: harden sigma trial gate [task 1.1]`。
- 不要把 commit hash 写进 progress；`git log` 里的 task id 是审计记录。
- 验证失败不提交。
- 阶段验收通过后记录并自动进入下一阶段，不要求用户确认。
- 不自动 push、merge、amend。
- progress 文件只能更新 status、verification、evidence、decision_log、turn_log、residual_risk 等日志字段；不能改任务定义或验收标准。
- `.superpowers/` 若仍为未跟踪目录，保持不碰；它不是本计划工作内容。

## Progress 文件

`docs/plans/2026-06-19-sigma-global-renderer-integration-progress.json`

## 基线 Smoke Check

每个工作单元开始前运行：

```bash
npm run test --workspace=@llm-wiki/graph-engine
```

## 完整验收命令

发布前必须记录这些命令的结果：

```bash
npm run test --workspace=@llm-wiki/graph-engine
npm run typecheck --workspace=@llm-wiki/graph-engine
npm run build --workspace=@llm-wiki/graph-engine
npm run test --workspace=@llm-wiki-agent/web
npm run typecheck --workspace=@llm-wiki-agent/web
npm run build --workspace=@llm-wiki-agent/web
node --import tsx --check tests/browser/graph-sigma-graphology-trial.ts
node --import tsx --check tests/browser/graph-sigma-global-production.ts
GRAPH_SIGMA_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-sigma-global-final bash tests/graph-sigma-graphology-trial.regression-1.sh
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-sigma-global-production-final bash tests/graph-sigma-global-production.regression-1.sh
bash tests/graph-workbench-interactions.regression-1.sh
bash tests/graph-offline-phase-6.regression-1.sh
bash tests/graph-community-wash-interactions.regression-1.sh
bash tests/graph-browser-stage-4-5.regression-1.sh --target offline
bash tests/graph-html-a11y.regression-1.sh
```

若浏览器回归因环境缺少 Chrome、端口占用或 sandbox 限制无法运行，不能标记通过；progress 记录 blocked 和具体原因。

## 性能验收硬门槛

这些门槛同时适用于 Phase 1 的隔离 trial 和 Phase 6/7 的生产路径回归。若某项指标为必测但 artifact 缺失、为 `null`、为 `not run`，或超过阈值，本任务不能标记通过。

### Artifact schema

每条性能记录必须包含：

- `schema_version`
- `renderer`
- `production_path`
- `graph_shape`
- `action`
- `pass`
- `fps`
- `frame_p95_ms`
- `duration_ms`
- `memory_growth_mb`
- `failure_class`
- `failure_detail`
- `thresholds`
- `artifact_path`
- `browser`
- `build_commit`
- `run_started_at`
- `run_finished_at`

其中 `thresholds` 至少记录本次 action 使用的 fps、frame p95、duration 和 memory 上限；生产路径 artifact 的 `production_path` 必须为 `true`。

### Thresholds

| Scale | Initial render | Search highlight | Drawer open | Return global | Wheel/drag FPS | Wheel/drag frame p95 | Memory growth |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1000 nodes | <= 500 ms | <= 200 ms | <= 200 ms | <= 250 ms | >= 45 | <= 22.3 ms | <= 50 MB |
| 5000 nodes | <= 1200 ms | <= 400 ms | <= 400 ms | <= 500 ms | >= 45 | <= 22.3 ms | <= 75 MB |
| 10000 nodes | <= 2000 ms | <= 700 ms | <= 500 ms | <= 800 ms | >= 45 | <= 22.3 ms | <= 100 MB |

10000 节点首次进入全局图时，250 ms 内必须出现明确加载状态，不能长时间空白。浏览器性能脚本要记录 warmup 后至少 3 次重复运行：median 必须通过，worst run 必须写入 artifact；任何 failed record、缺失 action、缺失 shape、缺失 mandatory metric 都阻止进入下一阶段。

## 实现面地图

### 主要代码面

- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/index.ts`
- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/render/index.ts`
- `packages/graph-engine/src/render/adapter.ts`
- `packages/graph-engine/src/render/graph-renderer-root.ts`
- `packages/graph-engine/src/render/render-context.ts`
- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`
- `packages/graph-engine/src/render/controls.ts`
- `packages/graph-engine/src/render/hit-testing.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/aggregation-containers.ts`
- `packages/graph-engine/src/layout/spatial-index.ts`
- `packages/graph-engine/package.json`
- `workbench/web/src/components/GraphPanel.tsx`
- `workbench/web/src/components/GraphSummaryDrawer.tsx`
- `workbench/web/src/lib/graph-summary-actions.ts`

### 可能新增代码面

- `packages/graph-engine/src/render/renderer-surface.ts`
- `packages/graph-engine/src/render/dom-svg-renderer.ts`
- `packages/graph-engine/src/render/sigma-global-renderer.ts`
- `packages/graph-engine/src/render/sigma-global-adapter.ts`
- `packages/graph-engine/src/render/sigma-hit-testing.ts`
- `packages/graph-engine/src/render/renderer-route-manager.ts`
- `packages/graph-engine/src/render/aggregation-safety-renderer.ts`

具体文件名可按实现时的本地命名调整，但职责边界不能漂移。

### 测试与回归面

- `packages/graph-engine/test/renderer-adapter-contract.test.ts`
- `packages/graph-engine/test/sigma-trial-adapter.test.ts`
- `packages/graph-engine/test/renderer-lifecycle.test.ts`
- `packages/graph-engine/test/renderer-boundary.test.ts`
- `packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/interaction-contract.test.ts`
- `packages/graph-engine/test/keyboard.test.ts`
- `packages/graph-engine/test/large-fixtures.test.ts`
- `packages/graph-engine/test/aggregation-fallback-trial-adapter.test.ts`
- `workbench/web/test/graph-summary-actions.test.ts`
- `workbench/web/test/graph-selection.test.ts`
- `workbench/web/test/right-drawer-graph-summary.test.tsx`
- `tests/browser/graph-sigma-graphology-trial.ts`
- `tests/browser/graph-renderer-trial-shared.ts`
- `tests/browser/validate-graph-trial-result.mjs`
- `tests/graph-sigma-graphology-trial.regression-1.sh`
- `tests/graph-workbench-interactions.regression-1.sh`
- `tests/graph-offline-phase-6.regression-1.sh`
- `tests/graph-browser-stage-4-5.regression-1.sh`

## 现有能力必须复用

- `buildGraphRendererAdapterData` / `buildGraphRendererBehaviorContract`
- `buildRenderableGraph`
- `buildCommunityAggregationMarkers`
- `createGraphSpatialIndex`
- `createGraphRuntimeState`
- `createGraphFacadeFromRenderer`
- `resolveSelectionForCapabilities`
- `summarizeGraphNode` / `summarizeGraphCommunity` / `summarizeGraphGlobal`
- `generateLargeGraphFixture` 与完整 11 类 fixture
- 现有 workbench `GraphPanel` 数据加载、Pin 持久化、选择回调和抽屉回调

## 数据和状态流

```text
GraphData + pins + filters + selection + search
        |
        v
graph-engine adapter/budget layer
        |
        +--> Sigma global renderer data -> Graphology -> Sigma canvas
        |                                  |
        |                                  v
        |                           canvas event / object id / screen point
        |                                  |
        v                                  v
graph-engine commands <--------- hit projection / command bridge
        |
        +--> summaries / selection / pins / visibility callbacks
        |
        v
Workbench drawer and controls

Community reading route:
GraphEngine facade -> DOM/SVG community renderer -> reader/detail drawer

Failure route:
Sigma unavailable -> small graph DOM/SVG fallback
                  -> large graph aggregation safety view
```

## Phase 0：执行起点与基线

目标：确保实现从专用分支开始，记录可复现基线。

可见结果：分支清楚，基线测试结果写入 progress。

### Task 0.1 — 创建实现分支与 clean-start 基线

范围：

- 创建或切换到 `codex/sigma-global-renderer-integration`。
- 运行 `git log --oneline -15`。
- 运行基线 smoke check。
- 更新 progress，做 clean-start commit。

验收：

- `git branch --show-current` 输出 `codex/sigma-global-renderer-integration`。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `git log --oneline -15` 能看到包含 `[task 0.1]` 的 clean-start commit。

自动推进：验收记录后进入 Phase 1。

## Phase 1：Phase 0 开工门槛与 harness 加固

目标：在写生产渲染代码前，确认 Sigma 仍可作为正式接入路线。

可见结果：harness 能按本文档验收，不再用过低阈值或极简 drawer 得出虚假通过。

### Task 1.1 — 提高 trial 判定标准和结果校验

范围：

- 更新 `tests/browser/graph-renderer-trial-shared.ts`、`tests/browser/graph-sigma-graphology-trial.ts`、`tests/browser/validate-graph-trial-result.mjs` 或对应 wrapper。
- 把 Sigma wheel/drag 判定提升到本文档要求的 45 FPS 目标。
- 按“性能验收硬门槛”校验 `frame_p95_ms`、action duration、memory growth、schema version、thresholds、browser、build commit 和 mandatory metric。
- 确保失败记录、缺失 action、缺失 shape、空 artifact 都会导致命令失败。
- 让结果 JSON 记录 `fps`、`frame_p95_ms`、`duration_ms`、`memory_growth_mb`、`failure_class`、`failure_detail` 和 artifact 路径。

验收：

- `node --import tsx --check tests/browser/graph-sigma-graphology-trial.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- 使用单一轻量 shape 运行 `GRAPH_SIGMA_TRIAL_SHAPES=nodes-1000-sparse GRAPH_SIGMA_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-sigma-task-1-1 bash tests/graph-sigma-graphology-trial.regression-1.sh` exits 0，并产生包含上述字段、schema、thresholds 和 browser/build 信息的 JSON。

### Task 1.2 — 让 Sigma trial 使用适配层受控数据

范围：

- 更新 `packages/graph-engine/test/sigma-trial-adapter.ts` 和 `packages/graph-engine/test/sigma-trial-adapter.test.ts`。
- Sigma trial model 的节点、边、标签可见性、选中、搜索、Pin、聚合状态来自 `buildGraphRendererAdapterData`。
- 禁止 trial 路径直接遍历原始 `data.nodes` / `data.edges` 自己决定显示预算。

验收：

- `node --import tsx --test packages/graph-engine/test/sigma-trial-adapter.test.ts packages/graph-engine/test/renderer-adapter-contract.test.ts` exits 0。
- `rg -n "data\\.nodes\\.map|data\\.edges\\s*\\." packages/graph-engine/test/sigma-trial-adapter.ts` 无生产绘制路径命中；若有命中，progress 记录为什么只是索引或校验，不是预算决策。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 1.3 — 补代表性 drawer/overlay 负载和大图内存周期

范围：

- 在 Sigma trial HTML 中加入接近 workbench 的 drawer/overlay 负载，不再只用极简文本。
- 在 5000 / 10000 形状上执行重复搜索、社区、抽屉、返回全局循环并记录内存增长。
- 默认 shape 集保持完整 11 类。

验收：

- `GRAPH_SIGMA_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-sigma-task-1-3 bash tests/graph-sigma-graphology-trial.regression-1.sh` exits 0。
- `/tmp/llm-wiki-sigma-task-1-3/sigma-graphology-trial-results.json` 包含 11 类 shape 和全部 required actions。
- 5000 / 10000 shape 的 repeated cycle 记录不是 `not run`。
- 结果中无 `pass=false`、无非空 `failure_class`，wheel/drag 相关 fps 记录均不低于 45。

阶段验收：

- Task 1.1 到 1.3 全部完成并记录证据。
- 若 Task 1.3 暴露 Sigma 硬阻塞，progress 标为 blocked，停止本实施方向，不进入 Phase 2。

自动推进：阶段验收通过后进入 Phase 2。

## Phase 2：渲染边界解耦

目标：把当前 DOM/SVG 假设收敛到清晰边界，让 controller、root、pipeline、controls 不再阻塞 Sigma。

可见结果：当前 DOM/SVG 行为不变，但内部已经能承接新的全局 renderer。

### Task 2.1 — 定义 renderer-neutral surface 和命令边界

范围：

- 建立或扩展 `renderer-surface` 类边界，覆盖 focus、drag class、search state、selection state、viewport state、destroy lifecycle。
- `controller.ts` 通过 renderer surface 命令表达意图，不直接依赖每个节点都是 DOM button。
- 不做泛化框架，只覆盖当前已知 DOM 附着点。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `rg -n "context\\.dom\\.(nodeElements|edgeElements|aggregationContainerElements).*\\.(focus|classList)" packages/graph-engine/src/render/controller.ts` 无输出；若存在命中，必须记录为保留原因并由测试覆盖。

### Task 2.2 — 拆清 root、pipeline、controls 的 DOM/SVG 边界

范围：

- 明确 DOM/SVG root、节点按钮、SVG 边、搜索框、图例、小地图由哪一层创建。
- 让 pipeline 只通过明确接口挂载图形内容和控制 UI。
- 保持社区/详情 DOM/SVG 路径行为不变。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `node --import tsx --test packages/graph-engine/test/renderer-lifecycle.test.ts packages/graph-engine/test/renderer-boundary.test.ts` exits 0。

### Task 2.3 — 保留基础键盘和焦点语义

范围：

- 保证基础键盘路径仍可用：打开/关闭搜索、清除选择、返回全局、焦点不丢失。
- 不做完整键盘漫游。
- Sigma canvas 后续接入时必须有可聚焦容器和状态提示，不依赖 per-node DOM focus。

验收：

- `node --import tsx --test packages/graph-engine/test/keyboard.test.ts packages/graph-engine/test/interaction-contract.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

阶段验收：

- DOM/SVG 行为测试保持通过。
- controller 的已知 DOM 附着点已收敛到 renderer surface 或记录保留原因。

自动推进：阶段验收通过后进入 Phase 3。

## Phase 3：生产级 Sigma 全局 renderer

目标：实现只负责全局地图的 Sigma renderer，不让 Sigma 接管产品语义。

可见结果：Sigma global renderer 可以独立创建、更新、销毁，并使用适配层输出的数据。

### Task 3.1 — 建立 Sigma production module 和依赖边界

范围：

- 将 `sigma`、`graphology` 放到生产运行所需的包边界。
- 在本任务明确 route manager 归属：优先放在 facade 内部，由 facade 管理全局 Sigma、社区 DOM/SVG 和 fallback renderer；若实现发现必须放到 render root，必须在 progress 记录原因和边界。
- 明确 Sigma/Graphology 的打包方式：是否进入 `engine.iife.js`、是否拆成单独 entry/lazy load、离线单文件 HTML 是否加载它，以及对应构建体积和离线加载证据。
- 新增 Sigma global renderer 模块骨架和导出。
- 保持 DOM/SVG renderer 可独立构建。

验收：

- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- progress 记录 route manager 归属、Sigma/Graphology 包边界、offline HTML 是否加载 Sigma，以及对应证据。
- 若 Sigma/Graphology 被打进 `engine.iife.js`，必须记录打包体积变化；若拆分或 lazy load，必须记录 workbench 和 offline 两条路径如何加载。

### Task 3.2 — 用适配层输出构建 Graphology 图

范围：

- Sigma renderer 使用 `GraphRendererAdapterData` 的 nodes、edges、communities、aggregations。
- Graphology 只保存渲染用结构，不成为真实业务状态源。
- 标签、边、节点大小、颜色、选中、搜索、Pin、聚合提示来自图谱引擎预算。

验收：

- 新增或更新 Sigma renderer 单元测试，证明它不直接遍历原始 `GraphData` 决定预算。
- 新增或更新生产 Sigma adapter-boundary 测试或静态检查，证明生产 renderer 消费 `GraphRendererAdapterData`，不从原始 `GraphData` 自行决定节点、边、标签、聚合预算。
- `node --import tsx --test packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/sigma-trial-adapter.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 3.3 — 实现 Sigma 命中投射和社区区域命中

范围：

- Sigma 上报 node id、screen point 或渲染对象 id。
- 节点、聚合/社区区域、空白的命中优先级由图谱引擎或适配层决定。
- 社区区域命中使用节点位置、community hull / 聚合区域或空间索引，不在 Sigma 回调里重算语义。

验收：

- 新增或更新 hit testing / Sigma bridge 测试，覆盖节点优先于社区、社区区域命中、空白点击。
- `node --import tsx --test packages/graph-engine/test/spatial-index.test.ts packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/interaction-contract.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 3.4 — 完成 Sigma 生命周期和错误上报

范围：

- 支持 create、update data、update pins、update theme、update selection/search/filter、destroy。
- 明确 Graphology 更新策略：哪些变更增量更新，哪些变更重建 graph；更新时必须保留合理 camera/viewport 状态。
- 捕获 WebGL/Sigma 初始化失败和运行时不可恢复错误。
- 错误只进入 route/fallback 层，不由 Sigma 自己决定用户看到什么。

验收：

- 新增或更新 lifecycle 测试，覆盖 destroy 后不再响应事件、重复 setData 不泄漏旧实例、初始化失败可被上层捕获、stale Sigma/Graphology 事件不能修改新 renderer、update data 后 camera/selection/search/pin 状态按设计保留。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。

阶段验收：

- Sigma production module 能独立通过单元测试、typecheck、build。
- Sigma 内部没有摘要、社区进入、抽屉内容等产品语义决策。

自动推进：阶段验收通过后进入 Phase 4。

## Phase 4：全局/社区路由和失败兜底

目标：让全局视角走 Sigma，社区阅读和详情走 DOM/SVG，并让失败兜底真实可测。

可见结果：facade 对外能力保持稳定，内部能按全局/社区/失败状态切换 renderer。

### Task 4.1 — 实现 renderer route manager

范围：

- 实现 Task 3.1 已记录的 route manager 归属，不在本任务重新做架构选择。
- 全局视角创建 Sigma global renderer。
- 进入社区时切到 DOM/SVG 社区阅读路径。
- 返回全局时回到 Sigma；若当前环境已判定 Sigma 不可用，回到对应兜底。

验收：

- `node --import tsx --test packages/graph-engine/test/facade.test.ts packages/graph-engine/test/renderer-lifecycle.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- 测试证明 `focusCommunity` 进入社区阅读路径，`resetView` 或返回全局不创建用户可见第二套主路径。
- 测试证明全局 Sigma -> 社区 DOM/SVG -> 返回全局 Sigma 的路径保留 selection、search、filters、pins；若 Sigma 已知不可用，返回全局进入对应 fallback 且不反复重试已知失败实例。

### Task 4.2 — 同步选择、搜索、筛选、Pin 和临时对象状态

范围：

- route 切换时共享 selection、focus、search query/results、type filters、pins、temporary object。
- 切换不清空当前选择，除非用户明确清除。
- 筛选排除当前对象时保留抽屉并显示 excluded object payload。

验收：

- `node --import tsx --test packages/graph-engine/test/state.test.ts packages/graph-engine/test/search-and-legend.test.ts packages/graph-engine/test/select.test.ts packages/graph-engine/test/summary-contract.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 4.3 — 实现分层失败兜底

范围：

- 定义小图/大图兜底阈值，初始判断使用节点数、边数和社区规模。
- 阈值必须证明不会把已知会卡死的大图退回 DOM/SVG；progress 记录阈值、依据和测试 fixture。
- 小图 Sigma 失败退回现有 DOM/SVG 全局图。
- 大图 Sigma 失败进入最低可用聚合安全视图。
- 聚合安全视图只支持：社区摘要、搜索/Pin/选中列表、进入社区阅读、清除选择、重试 Sigma。
- 用户看到轻提示，不看到空白死图或卡死大图。

验收：

- 新增或更新 fallback 测试，覆盖 WebGL unavailable、Sigma 初始化失败、canvas/runtime abnormal failure、小图 fallback、大图 aggregation safety view、阈值 guard、返回全局继续使用兜底、retry Sigma、已知失败实例不被反复重试。
- `node --import tsx --test packages/graph-engine/test/aggregation-fallback-trial-adapter.test.ts packages/graph-engine/test/facade.test.ts packages/graph-engine/test/renderer-lifecycle.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 4.4 — 保持 workbench GraphPanel 对外边界稳定

范围：

- `GraphPanel` 继续使用 `createGraphEngine`、Pin 持久化、选择回调、打开详情、可见状态通知。
- 不把 renderer 细节泄漏到 workbench 业务层。
- 加开发期内部开关时，不暴露用户切换按钮。

验收：

- `npm run test --workspace=@llm-wiki-agent/web` exits 0。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。
- `rg -n "Sigma|sigma|graphology|rendererRoute|renderer route" workbench/web/src/components/GraphPanel.tsx` 无用户产品开关相关命中；若有命中，progress 说明它只是内部状态或测试 hook。

阶段验收：

- 全局/社区/兜底路由有自动化测试。
- workbench 对外 API 未扩大为用户选择题。

自动推进：阶段验收通过后进入 Phase 5。

## Phase 5：交互语义和用户体验回归

目标：证明 Sigma 全局路径里的用户动作含义与设计一致。

可见结果：用户看到的是同一套图谱规则，只是全局图更顺滑。

### Task 5.1 — 节点、社区、搜索、筛选、Pin 语义一致

范围：

- 点击节点只打开轻量摘要，不自动进社区。
- 点击社区区域或图例只打开社区摘要。
- 搜索不重排整图，只更新高亮、淡化、列表和摘要。
- Pin 是持久标记，不等于选中。

验收：

- `node --import tsx --test packages/graph-engine/test/interaction-contract.test.ts packages/graph-engine/test/search-and-legend.test.ts packages/graph-engine/test/summary-contract.test.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 5.2 — 社区阅读、打开详情、返回全局一致

范围：

- 全局节点“打开详情 / 阅读”进入所属社区并选中节点。
- “进入社区”进入社区概览，不自动打开节点阅读。
- 返回全局保留合理上下文；Sigma 不可用时返回兜底全局视图。

验收：

- `npm run test --workspace=@llm-wiki-agent/web` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。

### Task 5.3 — 基础键盘、焦点和无障碍状态

范围：

- Canvas/global container 可聚焦。
- 搜索键盘路径可打开、关闭和导航。
- 清除选择、返回全局、关闭浮层不丢失可恢复焦点。
- 不做完整键盘漫游。

验收：

- `node --import tsx --test packages/graph-engine/test/keyboard.test.ts` exits 0。
- `bash tests/graph-html-a11y.regression-1.sh` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 5.4 — 视觉状态和轻提示

范围：

- Sigma 正常全局图、社区阅读、聚合安全视图的状态区分清楚。
- 失败兜底轻提示不打断使用。
- 没有用户可见的新旧图切换按钮。

验收：

- `bash tests/graph-community-wash-interactions.regression-1.sh` exits 0。
- `bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` exits 0。
- `npm run test --workspace=@llm-wiki-agent/web` exits 0。

阶段验收：

- 核心交互自动化和浏览器回归通过。
- progress 记录至少一个正常全局、一个社区阅读、一个 fallback 状态的验证证据。

自动推进：阶段验收通过后进入 Phase 6。

## Phase 6：性能和发布回归

目标：用完整 11 类图谱形状证明生产接入后的行为和性能。

可见结果：有可查 artifact，证明 fps、内存、初始化、搜索、抽屉、社区、返回全局都达标。

### Task 6.1 — 建立生产路径大图回归

范围：

- 新增或更新 `tests/browser/graph-sigma-global-production.ts` 和 `tests/graph-sigma-global-production.regression-1.sh`，让浏览器性能回归覆盖生产 Sigma 全局路径，而不是只覆盖隔离 trial。
- 记录 11 类 shape 的首次渲染、拖动、缩放、搜索、点选、社区/聚合、抽屉、进入社区、返回全局、重复循环。
- artifact 写入 `/tmp/llm-wiki-sigma-global-production-*` 或明确路径。
- 按“性能验收硬门槛”写入 schema、thresholds、browser、build commit、production_path、fps、frame p95、duration、memory 和 failure fields。

验收：

- 新增或更新生产路径浏览器回归脚本，并可用单一 shape 快速运行。
- `node --import tsx --check tests/browser/graph-sigma-global-production.ts` exits 0。
- `GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-sparse GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-sigma-global-production-task-6-1 bash tests/graph-sigma-global-production.regression-1.sh` exits 0。
- `/tmp/llm-wiki-sigma-global-production-task-6-1/sigma-global-production-results.json` 或本任务记录的等价 artifact 存在，且 `production_path=true`、schema/thresholds 字段完整。
- `node --import tsx --check tests/browser/graph-sigma-graphology-trial.ts` exits 0。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。

### Task 6.2 — 跑完整 11 类性能回归

范围：

- 运行完整 Sigma trial 和生产路径回归。
- 记录 fps、frame p95、memory growth、失败类别、artifact 路径。
- 任何 failed record 都阻止进入下一任务。

验收：

- `GRAPH_SIGMA_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-sigma-global-task-6-2 bash tests/graph-sigma-graphology-trial.regression-1.sh` exits 0。
- `GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-sigma-global-production-task-6-2 bash tests/graph-sigma-global-production.regression-1.sh` exits 0。
- 生产路径 11 类回归命令和 artifact 路径写入 progress。
- 11 类 shape 的 wheel/drag fps 记录均不低于 45，frame p95、initial render、search、drawer、return global、memory growth 均满足“性能验收硬门槛”，且无 failed record。

### Task 6.3 — 跑完整工作台和离线回归

范围：

- 跑 graph-engine、web 的 test/typecheck/build。
- 跑 workbench、offline、community、stage-4.5 浏览器回归。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run test --workspace=@llm-wiki-agent/web` exits 0。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。
- `npm run build --workspace=@llm-wiki-agent/web` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- `bash tests/graph-community-wash-interactions.regression-1.sh` exits 0。
- `bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` exits 0。
- `bash tests/graph-html-a11y.regression-1.sh` exits 0。

阶段验收：

- 所有发布前命令通过并记录。
- 生产路径 artifact 证明 fps、frame p95、duration、memory、loading state、no failed record 全部满足“性能验收硬门槛”。

自动推进：阶段验收通过后进入 Phase 7。

## Phase 7：全局主路径清理和最终收口

目标：移除长期双维护风险，留下明确主路径和明确兜底。

可见结果：旧 DOM/SVG 不再作为全局主路径，但仍可作为小图异常兜底、社区阅读和详情能力保留。

### Task 7.1 — 移除旧 DOM/SVG 全局主路径分叉

范围：

- 清理用户可见或常规代码路径上的旧全局主 renderer 分叉。
- 保留小图异常兜底、社区阅读和详情 DOM/SVG 路径。
- 删除临时开发对比开关，除非已记录非用户可见应急开关边界：owner、触发条件、谁能开启、用户会看到什么、何时关闭、何时删除。

验收：

- 用测试或 targeted static checks 证明 Sigma 是常规全局主路径；DOM/SVG 只出现在社区/详情/小图异常兜底；aggregation 只出现在大图安全兜底。不要使用会误伤合法 route enum、测试名或 fallback 名称的宽泛 grep 作为唯一验收。
- 若保留非用户可见应急开关，progress 记录 owner、触发条件、启用方式、用户可见影响、关闭规则和删除计划；否则确认所有临时对比开关已删除。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。

### Task 7.2 — 更新文档和发布说明

范围：

- 更新 `docs/graph/performance/` 中 Sigma 正式接入结果文档。
- 若用户可见行为或功能列表变化，按仓库规则检查 `CHANGELOG.md`、`README.md` 和版本说明是否需要更新。
- 文档说明 Phase 0 结果、最终 route、fallback 边界、残余风险和 artifact 路径。

验收：

- 新增或更新的文档与本计划、设计文档、progress 状态一致。
- `rg -n "TB[D]|TO[D]O|待[定]|占[位]|FIXM[E]" docs/plans/2026-06-19-sigma-global-renderer-integration-phased-plan.md docs/plans/2026-06-19-sigma-global-renderer-integration-progress.json` 无输出。
- 本任务新增或修改的结果文档已人工核对：没有把 vis-network 写成本计划内改接路线，也没有把聚合安全视图写成第二套全局主产品。
- `git diff --check` exits 0。

### Task 7.3 — 最终验收和 progress 收口

范围：

- 重跑完整验收命令。
- progress 记录 final status、所有 phase/task done、最终 evidence、residual risk。
- 不 push、不 merge、不 amend。

验收：

- 完整验收命令全部 exits 0。
- `/tmp/llm-wiki-sigma-global-production-final` 或 progress 记录的最终生产路径 artifact 存在，且证明 11 类 shape 全部满足“性能验收硬门槛”。
- progress 文件 `status.phase` 为 `complete`，`status.task` 为 `complete`。
- progress 文件记录最终 residual risk。
- `git status --short --branch` 仅允许本任务提交后的干净状态或明确无关的 `.superpowers/` 未跟踪目录。

阶段验收：

- Task 7.1 到 7.3 全部完成。
- 所有计划内 acceptance 证据写入 progress。

自动推进：无，计划完成。

## 不在范围

- 在本计划内改接 vis-network。
- 把聚合安全视图做成完整可选全局图谱产品。
- 把社区阅读也改成 Sigma。
- 新增用户可见的新旧图切换按钮。
- 新增 Agent 提问入口。
- 新增边点击关系详情。
- 移动端专项体验。
- 桌面壳专项实现。
- 完整键盘漫游。
- 类型、来源、时间等备用组织视角。

## 故障模式和恢复

- Sigma 初始化失败：小图退 DOM/SVG，大图进入聚合安全视图，用户看到轻提示。
- Phase 0 未达标：停止本实施方向，记录 blocker，不进入生产接入。
- 生产路径大图 fps 低于 45：不进入发布收口，修当前 phase 或回到最近相关 phase。
- route 切换丢失选择或 Pin：不进入下一 phase，补状态同步测试。
- fallback 变成完整产品：停止并删减 scope，只保留最低可用安全状态。
- workbench GraphPanel 泄漏 renderer 细节：不进入下一 phase，回到 facade/render 边界修正。

## 决策记录

| 决策 | 结论 | 理由 | 拒绝项 | 来源 |
|---|---|---|---|---|
| 全局 renderer | Sigma/Graphology 是首选正式路线 | 1000/5000/10000 历史试验表现最好，且语义可留在 graph-engine | vis-network 并行接入、聚合-only 主产品 | `2026-06-19-phase-6-4-global-renderer-route-decision.md` |
| Phase 0 | 是开工门槛，不是重新选型 | 避免带病硬接，也避免回到无限评估 | 在同一计划内临时转向 vis-network | `2026-06-19-sigma-global-graph-renderer-design.md` |
| 社区阅读 | 继续 DOM/SVG | 社区承担阅读和富信息，不只是画点 | 全部一次性改 Sigma | `2026-06-18-large-graph-global-community-design.md` |
| 兜底 | 小图 DOM/SVG，大图聚合安全视图 | 大图退 DOM/SVG 会进入已知卡死路径 | 大图失败一律退旧图、聚合做第二主产品 | `2026-06-19-sigma-global-graph-renderer-design.md` |
| workbench 边界 | GraphPanel 对外能力尽量不变 | renderer 细节应留在 graph-engine/facade 内部 | 把 renderer route 泄漏到 React 业务层 | `workbench/AGENTS.md` |

## /goal starter

```text
/goal Implement docs/plans/2026-06-19-sigma-global-renderer-integration-phased-plan.md by following its execution ledger.

Each turn:
1. Read docs/plans/2026-06-19-sigma-global-renderer-integration-progress.json, then the current task in the plan.
2. Before implementation, confirm the plan's GSTACK REVIEW REPORT ends with `NO UNRESOLVED DECISIONS`; if not, amend the plan before touching production code.
3. Run `git log --oneline -15` and `npm run test --workspace=@llm-wiki/graph-engine`; repair a broken state before starting new work.
4. Work only on the current work unit. Do not shrink scope into an MVP, do not add a user-visible old/new renderer switch, and do not change product behavior beyond the planned global renderer replacement.
5. After verification passes: update the progress file (status, baseline when relevant, verification/evidence, decision_log, turn_log, and residual_risk when relevant) and commit the code change and that update together in one commit, with the task id in the message. Never commit on failed verification. Never push, merge, or amend.
6. When a phase's acceptance checks all pass, record it and continue to the next phase without asking for approval.

Done when every item in the plan is complete, every acceptance check is proven, the full acceptance command list passes, and the final production-path artifact proves all 11 graph shapes satisfy the performance hard gates: fps >= 45, frame p95, action duration, memory growth, loading state, schema/threshold fields, and no failed records. The progress file must record final status and residual risk.

Stop and report if a product decision is missing, the plan conflicts with the latest direction, or the worktree holds unrelated changes that cannot be safely separated.
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Optional; current eng review found no reason to shrink scope. |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | addressed in plan body | Codex CLI was rate-limited; fallback adversarial document review found issues now folded into the ledger. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | cleared after amendments | 8 amendments were folded into the plan body; no scope reduction was made. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Optional; current plan keeps the agreed product direction and adds verification gates. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Optional; command and artifact expectations are now explicit in the ledger. |

**AMENDMENT STATUS:** ENG CLEARED AFTER PLAN AMENDMENTS.

**SCOPE CHALLENGE:** Scope remains accepted as-is. This is intentionally a complete, non-MVP integration plan. The amendments harden verification; they do not shrink the Sigma/Graphology global renderer rollout.

**AMENDMENT AUDIT**

| Original issue | Plan body resolution |
|---|---|
| Final gate could pass without production Sigma browser regression. | Complete acceptance commands now include `tests/browser/graph-sigma-global-production.ts` check and `tests/graph-sigma-global-production.regression-1.sh`; Task 7.3 requires final production artifact proof. |
| Performance gates only named fps and did not fail on jank or missing metrics. | Added "性能验收硬门槛" with schema fields, p95 frame time, action duration, memory ceilings, loading-state requirement, warmup/repeated runs, and failed/missing metric blockers. |
| Task 6.1 created a production regression but did not prove it could run. | Task 6.1 now requires a single-shape production-path smoke command and artifact validation before the full 11-shape run. |
| Route manager ownership was decided too late. | Task 3.1 now records route manager ownership before production Sigma lifecycle work; Task 4.1 implements that recorded decision. |
| Sigma/Graphology package and offline loading boundary were implicit. | Task 3.1 now requires package boundary, offline loading choice, and build-size or load-path evidence. |
| Fallback tests missed WebGL unavailable, canvas/runtime abnormal state, large-graph threshold guard, and repeated retry behavior. | Task 4.3 now requires all of those fallback cases and proof that known-large graphs are not sent back to DOM/SVG. |
| Production Sigma adapter boundary and Graphology update behavior were under-specified. | Task 3.2 now requires production adapter-boundary checks; Task 3.4 now requires explicit Graphology update strategy, stale-event suppression, and camera/state preservation tests. |
| Internal rollback/comparison switch and cleanup checks were vague. | Task 7.1 now requires a documented non-user-facing emergency boundary if retained, or removal confirmation, plus targeted assertions instead of broad grep-only cleanup. |

**REVIEW EVIDENCE**

- `npm run test --workspace=@llm-wiki/graph-engine` passed during review: 324 tests, 0 failures.
- Feasibility, testing, performance, and adversarial document review lanes were used.
- Codex CLI outside review was attempted but hit upstream 429; fallback adversarial document review completed.
- Test plan artifact: `~/.gstack/projects/sdyckjq-lab-llm-wiki-skill/kangjiaqi-codex-pr52-sigma-global-renderer-design-eng-review-test-plan-20260619-164122.md`
- Task artifact: `~/.gstack/projects/sdyckjq-lab-llm-wiki-skill/tasks-eng-review-20260619-164122.jsonl`

**EXECUTION RECOMMENDATION:** Start implementation from Task 0.1 on `codex/sigma-global-renderer-integration`, then proceed sequentially through boundary, route ownership, production Sigma, fallback, browser performance, and final cleanup. Parallel work is only safe after the route API stabilizes.

NO UNRESOLVED DECISIONS
