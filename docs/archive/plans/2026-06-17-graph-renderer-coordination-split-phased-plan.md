# Graph Renderer 协调逻辑拆分执行计划

日期：2026-06-17

## 目标

落实 `docs/spark/2026-06-17-static-renderer-coordination-split-design.md`（B 路线）：把 `packages/graph-engine/src/render/static-renderer.ts`（2481 行、四职责混合）按职责拆成边界清楚的模块——`controller`（决策）/ `render-pipeline`（画图编排）/ `overlays-presenter`（hover/阅读器/面板），并把连接组织收进显式的 `GraphRenderContext`，最后把 `static-renderer.ts` 改名瘦身为 `graph-renderer-root.ts`（组装根）。

这是**纯代码搬家**：不改任何用户可见行为、不做性能优化、不引入新依赖。行为不变由现有 265 个单元测试 + 4 套浏览器回归 + stage-4.5 帧率门槛锁定。

## 源文档

- `docs/spark/2026-06-17-static-renderer-coordination-split-design.md`（本计划的设计来源，含核心原则、共享渲染上下文、模块表）
- `AGENTS.md`、`workbench/CLAUDE.md`（项目规则）
- 上一轮成果：`docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md`（六层架构，已合并进 main）

## 规格评审

结论：**可以执行（ready）**。

- 阻塞决策：无。设计已经过 brainstorm + 自审两轮，核心方向（B + 三模块 + 改名 + 停手线 + 共享上下文）已用户确认。
- 已解析的不确定点：
  - `GraphRenderContext` 的字段在本计划 Phase 1.1 定稿（不再是开放项）。
  - `architecture.ts` 是否新增 `controller` 层：本计划决定**新增** `controller` 层 id（见决策记录），因为 controller 是设计中明确的独立 owner。
- 主要漂移风险：把"画图搬家"做成"顺手改逻辑/优化"。本计划把"纯搬家、行为零变化"列为每个 phase 的硬约束。

## 任务规模

L 级 phased plan。理由：跨多个新模块 + 一次大文件改名 + 共享状态重构，有自然阶段边界（建上下文→抽 controller→抽 pipeline→抽 presenter→改名→边界与验收），约 12 个工作单元，预计跨多个 `/goal` turn 与上下文压缩。

## 执行分支策略

实现分支：`feat/graph-renderer-coordination-split`，**从当前 `spark/static-renderer-coordination-split` 创建**（这样实现分支带着设计与本计划文件）。

- 第一项动作（Phase 0.1）：创建该分支并做 clean-start commit（只记录基线，不写功能代码）。
- 不在 `main`、不在 `spark/...` 分支上直接跑实现。
- 不自动 push / merge / amend；合并进 main 需用户复核。

## 执行规则

- 每个工作单元开始前跑基线 smoke check。
- 完成并验证每个工作单元后，把代码改动和 progress 文件更新放进同一个提交，提交信息里带任务号（例如 `feat: split controller [task 1.2]`）。不要把具体提交编号记进 progress 文件；`git log` 按任务号就是审计记录。这样每个工作单元只产生一个提交，不再有配对的记账提交。
- 验证失败不提交。
- 阶段验收通过后直接进入下一阶段，不要求用户逐阶段确认。
- 执行者只能更新 progress 文件的 `status` / `baseline` / `verification` / `evidence` / `decision_log` / `turn_log` / `residual_risk`；不能改写任务定义、验收标准、范围边界。
- 不引入新 npm 依赖、新测试框架。
- 不改 `facade.ts` 公开 API 形状（只更新它对内部函数/类型的引用名）。
- 不动画图零件模块、`gestures.ts`、`viewport.ts`、`state.ts`、`spatial-index.ts`、`hit-testing.ts` 的行为。
- 不顺手重构无关代码、不做性能优化。

## /goal 协议

每次继续工作时：

1. 读 progress 文件，确认当前 phase/task。
2. 跑 `git log --oneline -15` 和基线 smoke check；先修复破损状态再开新工作。
3. 只处理当前工作单元。
4. 验证通过后更新 progress，并把代码改动和这次 progress 更新放进同一个提交，提交信息带任务号。
5. 阶段验收全部通过后记录并自动进入下一阶段，不询问。

## Progress 文件

`docs/plans/2026-06-17-graph-renderer-coordination-split-progress.json`

## 基线 Smoke Check

每个工作单元开始前运行：

```bash
npm run test --workspace=@llm-wiki/graph-engine
```

若 smoke check 在原始状态已失败，progress 记录失败输出，先修复与本计划相关的破损再开新工作。

## 完整验收命令（最终交付前 + Phase 5）

```bash
npm run test --workspace=@llm-wiki/graph-engine
npm run typecheck --workspace=@llm-wiki/graph-engine
npm run build --workspace=@llm-wiki/graph-engine
npm run test --workspace=@llm-wiki-agent/web
npm run typecheck --workspace=@llm-wiki-agent/web
npm run build --workspace=@llm-wiki-agent/web
bash tests/graph-workbench-interactions.regression-1.sh
bash tests/graph-offline-phase-6.regression-1.sh
bash tests/graph-community-wash-interactions.regression-1.sh
bash tests/graph-browser-stage-4-5.regression-1.sh --target offline
```

改名后的旧责任/旧名清理检查（最终必须通过）：

```bash
# 应无输出：旧文件名与旧函数名已全部清除
rg -n "static-renderer|createStaticGraphRenderer" packages/graph-engine/src packages/graph-engine/test
# 应有输出：新名已就位
rg -n "graph-renderer-root|createGraphRenderer|GraphRenderContext|controller\.ts|render-pipeline\.ts|overlays-presenter\.ts" packages/graph-engine/src
```

> 浏览器回归需 Chrome + Playwright；workbench 目标还需空闲端口 8787 / 5180。若环境无法运行浏览器回归，progress 标记该项 `blocked` 并说明，**不得跳过当作通过**。

### 帧率门槛（性能不退化）

- 硬门槛：`bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` exits 0（脚本内置相对下限）。
- 记录证据：捕获密集图连续缩放的实测 fps，必须 ≥ 45（基线约 50.5，留 10% 波动）。脚本默认清理 artifact，按下法保留后读取：

```bash
cp tests/graph-browser-stage-4-5.regression-1.sh /tmp/s45.sh
sed -i '' "s|tmp_dir=\"\$(mktemp -d)\"|tmp_dir=\"/tmp/s45run\"; mkdir -p \"/tmp/s45run\"|; s|rm -rf \"\$tmp_dir\"|true|; s|REPO_ROOT=\"\$(cd \"\$(dirname \"\$0\")/..\" \&\& pwd)\"|REPO_ROOT=\"$PWD\"|" /tmp/s45.sh
rm -rf /tmp/s45run && bash /tmp/s45.sh --target offline
cat /tmp/s45run/stage-4.5-artifacts/stage-4.5-offline-dense-wheel.json   # 读 "fps" 字段
rm -rf /tmp/s45run /tmp/s45.sh
```

## 实现面地图

### 现有文件（会改）

- `packages/graph-engine/src/render/static-renderer.ts` → 拆出三模块后改名 `graph-renderer-root.ts`
- `packages/graph-engine/src/facade.ts`（更新对 `createGraphRenderer` 的引用名）
- `packages/graph-engine/src/render/index.ts`（更新 re-export）
- `packages/graph-engine/src/architecture.ts`（owner map：新增 controller 层、更新 renderer entrypoints）
- `packages/graph-engine/test/renderer-boundary.test.ts`（更新路径字符串 + 扩展边界测试）

### 新增文件

- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`
- `packages/graph-engine/src/render/overlays-presenter.ts`
- `packages/graph-engine/src/render/render-context.ts`（`GraphRenderContext` 定义，或并入 root，实现时定）
- 视需要：`packages/graph-engine/test/controller.test.ts`（若现有测试已覆盖则不强求新增）

### 保持不动

`gestures.ts` / `viewport.ts` / `geometry.ts` / `state.ts` / `spatial-index.ts` / `hit-testing.ts` / `simulation-bridge.ts` / `node-drag-lifecycle.ts` / `keyboard.ts` / 所有画图零件模块（`nodes` `edges` `community-washes` `minimap` `controls` `offline-reader` `hover-card` `toolbar` `legend` `search` `preview` `overlays`）。

### 函数归属（代表清单，私有 helper 随主调用者迁移，按铁律归位）

- **controller.ts**：`applyGestureIntents`、`handleNodeClick`、`focusRenderedNode`、`handleNodeDragStart/Move/End/Cancel`、`handleBlankClick`、`syncRuntimeGestureState`、`runtimeGestureFromActiveGesture`、`bindViewportHandlers`、node-drag 计算 helper（`nodeDragSession`/`nodeDragGrabOffset*`/`nodeDragStartWorldPoint`/`nodeDragWasPinned`/`nodeDragStartSnapshot`/`isRuntimeNodeDrag`/`nodeDragTargetFromScreenPoint`）、语义命令（`selectCommunity`/`focusCommunity`/`resetViewState`/`retreatFocusedView`/`openSearch`/`applySearchQuery`/`focusNextSearchResult`/`closeSearch`/`closeToolbarPanel`）、键盘（`handleDocumentKeydown`/`isGraphKeyboardFocusActive`）、`clearInteractionState`/`clearTransientInteractionForDataRefresh`/`hasInteractionState`。
- **render-pipeline.ts**：`render`（拆成 apply + rebuild/paint 两段）、`paint`、`mountSearchControl`/`mountGraphToolbar`/`mountCommunityLegend`、`applyCommunityHover`、`restartSimulation`/`applyMotionFrame`/`markPinnedNodes`、`commitViewport`/`updateEffectiveDensity`/`renderMotionOverlays`/`updateMinimapViewport`/`setViewportAnimating`、`markDiffElements`/`settleDiffElements`/`animateDiff`、`semanticAnchorForNode`、纯 helper（`positionsFromRenderableGraph`/`setGraphSvgViewBox`/`sameWorldBounds`/`emptyPaintedDom`）。
- **overlays-presenter.ts**：`scheduleHoverPreview`/`showEdgeHoverPreview`/`clearHoverPreview`/`setGraphHover`/`renderHoverPreview`/`positionHoverPreview`/`positionEdgeHoverPreview`、`renderReader`/`renderSelectionPanel`。
- **graph-renderer-root.ts**：`createGraphRenderer`（创建上下文与各模块、接线、返回引擎对象）、对外方法委派、`bindResizeObserver`、`resetRootScroll`、`viewportSize`、选择映射 helper（`rendererSelectionFromRuntimeState`/`panelSelection`/`readerNodeId`，作为共享只读 helper）。

## 架构流向

```text
Browser event -> gestures -> controller(决策) -> 改 state / 通知 simulation
                                            -> 请求重画
render-context(graph/pinState/dom/simulation, 根持有)
  controller/presenter: 只读
  graph/dom = pipeline 重建时写的渲染产物（其余只读）
  pinState/simulation = controller 与 pipeline 都写的共享协调对象（eng-review C1 修正）
  runtimeState = selection/focus/hover/pins/viewport 唯一权威
render-pipeline(重建模型 + 绘制) -> overlays-presenter(hover/阅读器/面板贴位置)
graph-renderer-root: 组装 + 委派; facade: 公开 API + host 回调
```

## 模块接口与共享上下文（Phase 1.0 定稿，eng-review 后写入）

这是 Phase 1.0 定稿、其余阶段依赖的契约。后续实现必须按这里搬迁；如果发现字段或入口缺口，先更新本节再移动代码。

### GraphRenderContext（root 创建并持有）

| 类别 | 字段 | 写权 |
|---|---|---|
| 输入与选项 | `data`, `theme`, `typeFilters`, `availableTypeFilters`, `callbacks` | root/命令侧经 `applyOptionChanges` 写；`callbacks` 只由 root 建立或替换 |
| 渲染产物 | `graph`, `dom` | **仅 pipeline 重建/重绘时写**；controller/presenter/root 只读 |
| 运行期权威 | `runtimeState` | semantic state 唯一权威；controller 调命令写，pipeline/presenter 读 snapshot |
| 共享协调 | `pinState`, `simulation` | **controller 与 pipeline 都写**；controller 处理拖拽/unpin/reset，pipeline 处理重建/运动帧 |
| 搜索态 | `searchOpen`, `searchQuery`, `searchFocusedNodeId`, `searchIndex` | controller 的搜索命令写；pipeline mount search control 时只读并经 `GraphCommands` 回调 |
| UI 态 | `toolbarPanelState`, `legendCollapsed`, `lastEffectiveDensityMode`, `lastViewportSize` | toolbar/legend 命令写面板态；pipeline 写 density/viewportSize 缓存 |
| diff 与生命周期 | `activeDiff`, `renderEpoch`, `destroyed` | pipeline 写 diff/epoch；root 写 destroyed；异步回调必须校验 epoch 或 destroyed |
| 定时器与监听器 | `previewTimer`, `viewportAnimationTimer`, `resizeObserver`, `gestureMachine`, `gestureController` | 对应持有模块写；root `destroy` 统一清理并置空 |
| 宿主平台 | `root`, `ownerDocument`, `toolbarContainer`, `hasExternalToolbarContainer` | root 创建后只读 |
| 运行期协作 | `hitTargetResolver`, `viewportCommitter`, `pathCache` | root 创建；pipeline 重建后刷新 resolver/cache；controller 通过 resolver/committer 发起交互 |

`callbacks` 包含 `onNodeOpen`、`onSelectionInput`、`onSelectionClearRequested`、`onPinsChanged`、`onDragActiveChange`。这些是 host 边界，不作为 controller/pipeline/presenter 之间的直接依赖。

注：selection/focus/hover/pins/viewport **不作为平行字段进入 context**，由 `runtimeState` 唯一持有；context 只持有 `runtimeState` 引用，避免双份状态。

### 四个接口（签名 Phase 1.0 定稿）

文档里的类型名沿用现有代码；实现时可把局部别名落到 `render-context.ts` 或相邻模块，但边界不变。

```ts
interface GraphController {
  onGestureIntents(intents: GraphGestureIntent[], event: PointerEvent | null): void;
  syncRuntimeGestureState(): void;
  handleDocumentKeydown(event: KeyboardEvent): void;
  isGraphKeyboardFocusActive(): boolean;

  openSearch(): void;
  applySearchQuery(query: string): void;
  focusNextSearchResult(): void;
  closeSearch(): void;

  selectCommunity(id: CommunityId): void;
  focusCommunity(id: CommunityId): void;
  resetViewState(): void;
  retreatFocusedView(): void;
  clearInteractionState(): void;
  clearTransientInteractionForDataRefresh(): void;
  hasInteractionState(): boolean;

  handleNodeClick(id: NodeId, additive: boolean): void;
  handleNodeDragStart(id: NodeId, screenPoint: GraphScreenPoint): void;
  handleNodeDragMove(id: NodeId, pointerId: number, screenPoint: GraphScreenPoint): void;
  handleNodeDragEnd(id: NodeId, pointerId: number, screenPoint: GraphScreenPoint): void;
  handleNodeDragCancel(id: NodeId, pointerId: number): void;
  handleBlankClick(): void;

  destroy(): void;
}
```

`GraphController` 读 context，写 `runtimeState`/`pinState`/`simulation`，可在已存在的 DOM 元素上切 `is-dragging`/focus 附着；**不调用 `paint`/`mount*`，不创建画图元素，不计算 render model**。

```ts
interface GraphRenderPipeline {
  rebuildAndPaint(next?: GraphRenderNextOptions): void;
  paint(graph: RenderableGraph, options: PaintOptions): PaintedGraphDom;

  mountSearchControl(commands: GraphCommands): void;
  mountGraphToolbar(commands: GraphCommands): void;
  mountCommunityLegend(commands: GraphCommands): void;

  commitViewport(nextViewport: RendererViewport, options?: ViewportFrameCommitOptions): void;
  bindResizeObserver(): void;
  resetRootScroll(): void;
  updateEffectiveDensity(): void;
  renderMotionOverlays(): void;
  updateMinimapViewport(): void;
  setViewportAnimating(enabled: boolean): void;

  restartSimulation(): void;
  applyMotionFrame(positions: RenderPositionMap): void;
  markPinnedNodes(pinnedNodeIds: NodeId[]): void;

  animateDiff(diff: GraphDiff, options?: GraphDiffAnimationOptions): Promise<void>;
  markDiffElements(diff: GraphDiff): void;
  settleDiffElements(): void;
  semanticAnchorForNode(id: NodeId): GraphWorldPoint | null;

  destroy(): void;
}
```

`GraphRenderPipeline` 写 `context.graph`/`context.dom`/pipeline-owned lifecycle fields；可读 `runtimeState.snapshot()` 生成视图；**不做手势分类，不写 selection/focus/hover/pin 语义状态**。`mount*` 只拿 `GraphCommands`，不 import controller。

```ts
interface GraphOverlaysPresenter {
  scheduleHoverPreview(id: NodeId): void;
  showEdgeHoverPreview(id: string): void;
  clearHoverPreview(): void;
  setGraphHover(hover: GraphRuntimeStateSnapshot["hover"]): GraphRuntimeStateSnapshot;

  renderHoverPreview(): void;
  positionHoverPreview(preview: HTMLElement, node: RenderableNode): void;
  positionEdgeHoverPreview(preview: HTMLElement, edge: RenderableGraph["edges"][number]): void;

  renderReader(): void;
  renderSelectionPanel(): void;

  destroy(): void;
}
```

`GraphOverlaysPresenter` 读 context + viewport + runtime snapshot，管理 hover preview 定时器和 overlay 贴位；**不画主图、不创建 graph node/edge/community/minimap 元素、不做语义决策**。

```ts
interface GraphCommands {
  render(next?: GraphRenderNextOptions): void;
  resetView(): void;
  resetLayout(): void;
  clearInteraction(): void;

  openSearch(): void;
  applySearchQuery(query: string): void;
  focusNextSearchResult(): void;
  closeSearch(): void;

  selectCommunity(id: CommunityId): void;
  focusCommunity(id: CommunityId): void;
  toggleTypeFilter(type: string, enabled: boolean): void;
  toggleToolbarPanel(panel: Exclude<GraphToolbarPanelState, "closed">): void;
  closeToolbarPanel(): void;

  openNode(id: NodeId): void;
  submitSelection(selection: SelectionInput): void;
  clearSelectionRequest(): void;
  pinsChanged(pins: PinMap): void;
  dragActiveChanged(active: boolean): void;
}
```

`GraphCommands` 由 root 打包并注入 pipeline/presenter 需要接线的地方；内部委派到 controller、root state-apply 或 host callback，保持 controller ↔ pipeline 无循环依赖。

## 阶段计划

### Phase 0：基线

目标：在实现分支记录"改之前"的绿色基线，不写功能代码。

任务：

1. `0.1` 从 `spark/static-renderer-coordination-split` 创建 `feat/graph-renderer-coordination-split`，跑基线 smoke check，提交 clean-start progress。
2. `0.2` 跑完整验收命令集 + 帧率捕获，把基线结果（测试数、各命令退出码、实测 fps）记进 progress 的 `baseline` 字段。

验收：

- 当前分支为 `feat/graph-renderer-coordination-split`，工作区无未分离的用户改动。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0（265 通过）。
- progress 记录基线 fps（应 ≈ 50，记录实测值作为后续门槛参照）；验证证明完成，`git log` 按任务号显示哪个提交完成该项。

自动前进：记录后进入 Phase 1。

### Phase 1：建立 GraphRenderContext + 抽出 Controller

目标：把连接组织收进显式上下文，把"决策/命令/键盘"搬进 `controller.ts`。

任务：

1. `1.0`（先做，**[eng-review C1]**）设计 `GraphRenderContext` 全集与四个模块接口，定稿后再动手搬码。列出完整共享字段：`data`/`theme`/`typeFilters`/`graph`/`dom`/`pinState`/`simulation`/搜索态(`searchOpen`/`searchQuery`/`searchFocusedNodeId`/`searchIndex`)/`activeDiff`/各定时器(`previewTimer`/`viewportAnimationTimer`)/`toolbarPanelState`/`legendCollapsed`/density/viewportSize/`hitTargetResolver`/`viewportCommitter`/`pathCache`/`root`/`ownerDocument`/`destroyed`。定义四个接口签名：`GraphController`、`GraphRenderPipeline`、`GraphOverlaysPresenter`、`GraphCommands`（root 注入给 pipeline 的命令回调集）。本任务只产出接口与字段清单（写进本计划的"模块接口与共享上下文"节），不写实现。
2. `1.1` 落地 `GraphRenderContext`：root 创建并持有。**写权（已按 eng-review C1 修正）**：`graph`/`dom` 是 pipeline 重建时写的渲染产物（controller/presenter 只读）；`pinState`/`simulation` 是**双方都写的共享协调对象**（controller 拖拽/unpin/reset 写、pipeline 重建写）；selection/focus/hover/pins/viewport 仍以 `runtimeState` 为唯一权威。把 `static-renderer.ts` 内部从裸闭包变量改为使用上下文对象（机械、行为保持）。
3. `1.2` 抽出 `controller.ts`：搬迁手势意图派发、`handleNode*`/`handleBlankClick`、node-drag 计算 helper、`syncRuntimeGestureState`、`bindViewportHandlers` 接线；`static-renderer.ts` 创建并委派给它。controller 用 state 改语义状态、写 pinState/驱动 simulation、仅在已画元素上切 `is-dragging`/`focus`；**不调用 `paint`/`mount*`、不计算渲染模型**（node-drag helper 读 graph 几何/pins/viewport 算拖拽目标属允许：render-model-**依赖**而非 render-model-**计算**）。
4. `1.3` 把语义命令与键盘路由搬进 controller（`selectCommunity`/`focusCommunity`/`resetViewState`/`retreatFocusedView`/搜索命令/`clearInteraction*`/`handleDocumentKeydown`）；搜索态字段随命令进 context。

验收：

- Phase 1.0 产出：context 全集字段清单 + 四接口签名已写进本计划"模块接口与共享上下文"节。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- `controller.ts` 不含 `paint`/`mount*` 调用、不引用画图零件模块的 `create*`、不计算渲染模型（允许写 pinState/驱动 simulation、切 `is-dragging`/`focus`）。

自动前进：验收通过并记录后进入 Phase 2。

### Phase 2：抽出 Render-pipeline

目标：把"重建模型 + 绘制"独立成 `render-pipeline.ts`，与"应用改动到 state"分离。

任务：

1. `2.1`（**[eng-review A2+CQ3]**）在 root 上保留**单一编排入口** `render(opts)` = `applyOptionChanges(opts)`（把传入改动写进 `runtimeState`，**归 root/命令侧，不进 pipeline**）+ `pipeline.rebuildAndPaint()`。18 个调用点与 controller 命令都走这一个入口，apply 逻辑只一份。行为保持。
2. `2.2` 抽出 `render-pipeline.ts`：搬迁 `rebuildAndPaint`/`paint`/`mount*`/`applyCommunityHover`/相机提交与 `update*`/`restartSimulation`/`applyMotionFrame`/`markPinnedNodes`/diff 动画/`semanticAnchorForNode`/CSS 注入 `ensureStaticRendererStyles`(**[eng-review C3]** 样式属渲染，归 pipeline，root 保持薄)及纯 helper。`rebuildAndPaint` **只读 state、不写 selection/focus/pin**；`mount*` 通过 root 注入的 `GraphCommands` 接口回调命令(**[eng-review A1]** 避免 controller↔pipeline 循环依赖)。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- `bash tests/graph-community-wash-interactions.regression-1.sh` exits 0（**[eng-review C3]** community wash 绘制随本 phase 迁移，提前验）。
- 帧率门槛通过：stage-4.5 offline exits 0 且实测 fps ≥ 45（记进 progress）。
- `render-pipeline.ts` 不调用 gesture 分类、不写 selection/focus/pin 等语义；`mount*` 只经 `GraphCommands` 接口、不 import controller。

自动前进：验收通过并记录后进入 Phase 3。

### Phase 3：抽出 Overlays-presenter

目标：把 hover/边预览/阅读器/选择面板独立成 `overlays-presenter.ts`。

任务：

1. `3.1` 抽出 `overlays-presenter.ts`：搬迁 hover/edge preview（`scheduleHoverPreview`/`showEdgeHoverPreview`/`clearHoverPreview`/`setGraphHover`/`renderHoverPreview`/`position*Preview`）与 `renderReader`/`renderSelectionPanel`；通过 viewport 投影贴锚点、只读 state。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0（含 `overlays.test.ts`/`preview.test.ts`）。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0（缩放/平移/拖拽/抽屉 resize 后 hover 仍贴目标）。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- `overlays-presenter.ts` 不调用 gesture 分类、不写语义状态。

自动前进：验收通过并记录后进入 Phase 4。

### Phase 4：改名 + 瘦身组装根 + 更新 architecture owner map

目标：`static-renderer.ts` 缩成薄组装根并改名；owner map 如实反映新结构。

任务：

1. `4.1` 把 `static-renderer.ts` 改名为 `graph-renderer-root.ts`；导出函数 `createStaticGraphRenderer` → `createGraphRenderer`，公开类型 `StaticGraphRenderer`/`StaticRendererOptions` 一并更名为 `GraphRenderer`/`GraphRendererOptions`；同步更新 `facade.ts`、`render/index.ts`、`renderer-boundary.test.ts`（路径字符串）。**[eng-review C3]** 注意 `createStaticGraphRenderer` 经 `src/index.ts` 的 `export * from "./render"` 在包公开面上；为避免破坏既有导入，保留兼容别名，且把旧文件名彻底清掉。确认根文件只剩组装 + 委派。
2. `4.2` 更新 `architecture.ts`：`GraphArchitectureLayerId` 新增 `controller`；`controller` 层 entrypoints 指向 `render/controller.ts`；`renderer` 层 entrypoints 改为 `render/render-pipeline.ts`/`render/overlays-presenter.ts` 及画图零件；`facade`/root 归属相应更新。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0（含 `architecture.test.ts`、`renderer-boundary.test.ts`）。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。
- `rg -n "static-renderer" packages/graph-engine/src packages/graph-engine/test` 无输出；`createStaticGraphRenderer` 作为兼容别名保留，并由导出测试覆盖。
- `bash tests/graph-workbench-interactions.regression-1.sh` 与 `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。

自动前进：验收通过并记录后进入 Phase 5。

### Phase 5：边界测试 + 最终双端验收

目标：用测试锁死铁律，完成完整验收。

任务：

1. `5.1` 扩展 `renderer-boundary.test.ts`（或新增边界测试）：① `controller.ts` 不引用画图零件 `create*`、不调用 `paint`/`mount*`、不计算渲染模型（**允许** `is-dragging`/`focus` 附着、允许写 pinState/驱动 simulation）；② `render-pipeline.ts`/`overlays-presenter.ts` 不调用 gesture 分类、不写 selection/focus/pin；③ **[eng-review C3]** 运行时探针为**强制**（不再"尽量"），至少覆盖"mutation 所有权"与"拆卸"；④ **[eng-review Test4]** 命令注入接线单测：用 fake `GraphCommands` mount 控件，断言 reset/search/社区选择回调到正确命令；⑤ **[eng-review C2]** 生命周期测试：重复 mount/destroy 不泄漏监听器与定时器、`applyDiff` 与 `setData` 竞态、hover 定时器未到期就 destroy。
2. `5.2` 跑完整验收命令集 + 帧率捕获，记录输出摘要、实测 fps、残余风险；progress 标记 overall completed；验证证明完成，`git log` 按任务号显示哪个提交完成该项。不 push/merge/amend。

验收：

- 完整验收命令集全部 exits 0。
- 帧率 fps ≥ 45 且 ≥ 基线 × 0.9（记进 progress）。
- 旧名清理检查通过；新名就位检查有输出。
- 新边界测试通过。
- progress overall status = completed，residual risk 明确记录。

自动前进：此阶段完成后计划结束。

## 测试与 Eval 计划

- 每 phase：基线 smoke（graph-engine 单测）必过；涉及交互/渲染的 phase（1/2/3/4）加 workbench + offline 浏览器回归。
- **[eng-review C3]** 触及 community 渲染的 phase（Phase 2 搬 community wash 绘制/`applyCommunityHover`）一并跑 `graph-community-wash-interactions.regression-1.sh`，不拖到最后。
- Phase 2 与 Phase 5：加 stage-4.5 帧率门槛。
- Phase 5：完整命令集 + community-wash 回归 + 帧率 + 边界/接线/生命周期测试。
- 边界测试运行时探针为**强制**（覆盖 mutation 所有权与拆卸）；不新增测试框架，沿用现有 `node:test` 与 `renderer-boundary.test.ts` 模式。

## 已有基础

- `gestures.ts`/`viewport.ts`/`state.ts`/`spatial-index.ts`/`hit-testing.ts` 已是独立 owner，本计划不动其行为。
- 画图零件模块已拆分完成。
- `renderer-boundary.test.ts`/`architecture.test.ts` 已有边界与 owner-map 测试基础，本计划扩展它们。
- 4 套浏览器回归脚本与 stage-4.5 帧率脚本已存在且可运行（offline 已实测 ~50.5fps）。

## 不在范围内

- 不改任何用户可见行为；不做性能优化。
- 不动画图零件模块与 `gestures`/`viewport`/`state`/`spatial-index`/`hit-testing` 的行为。
- 不改 `facade.ts` 公开 API 形状。
- 不引入新依赖、新测试框架。
- 不为凑文件数继续拆碎（守"停手线"：模块就这四个）。
- 不 push / merge / amend。

## 失败模式与残余风险

- 搬家漏接一根线导致行为变化：一次搬一块 + 每块跑单测与 workbench/offline 回归；红了不提交。
- 画图搬错导致视觉/帧率退化：stage-4.5 帧率门槛 + 浏览器回归把关；fps < 45 视为失败。
- 改名遗漏引用：旧名清理检查（rg 无输出）+ typecheck/build 兜底；`renderer-boundary.test.ts`/`architecture.ts` 路径串必须手动同步。
- 模块仍互相伸手（边界不干净）：铁律 + 新边界测试强制"只读上下文 / 请求重画"。
- 以后又把调度塞回画图层：边界测试 + owner map 持续守门。
- **[eng-review C2]** render 再入 / stale callback：render 可被挂载回调触发；拆分后用 render-epoch（每次 rebuild 递增，旧异步回调按 epoch 失效）保证单次重画、旧回调不污染。
- **[eng-review C2]** `animateDiff` 异步竞态：await 期间若 `setData`/`render`/`applyDiff` 插入，settle 不能作用到已变的 DOM；用 epoch/`destroyed` 守卫并测试覆盖。
- **[eng-review C2]** destroy 拆卸顺序：定时器/document keydown/scroll/resizeObserver/手势/sim tick/外部 toolbar/hover 定时器分散到不同模块；root 的 `destroy` 按显式契约逐项拆，测试验证无泄漏。
- 残余风险：`controller` 允许切 `is-dragging`/`focus` 附着、写 pinState、驱动 simulation；边界测试需精确区分"附着/协调"与"画图/语义决策"，避免误判或漏判。
- **[eng-review C3]** 残余风险：现有测试只证明**选定路径**行为不变，不证明执行顺序、拆卸、公开类型面兼容——这些由新增的生命周期/接线/边界测试与 rg 检查补齐。

## 决策记录

| 决策 | 结论 | 理由 | 否决的替代 |
|---|---|---|---|
| 实现分支 | `feat/graph-renderer-coordination-split`，从 spark 分支创建 | 让实现分支带着设计+计划；符合 repo "代码改动走 feat/ 分支" | 直接在 spark 分支上跑实现 |
| `architecture.ts` 是否加 controller 层 | 新增 `controller` 层 id | controller 是设计中明确的独立 owner，owner map 应如实反映 | 并入 gestures 层描述（会掩盖"决策"独立性） |
| `render()` 处理 | 先拆成 apply + rebuild/paint 两段再迁移 | "应用改动"属命令侧、"重建并画"属 pipeline，混在一起无法干净归属 | 整块塞给 pipeline（违背铁律） |
| 共享状态写权（eng-review C1 修正） | `graph`/`dom` = pipeline 写的渲染产物（其余只读）；`pinState`/`simulation` = 双方都写的共享协调对象；`runtimeState` 是语义状态唯一权威 | Codex 证明 controller 拖拽结束就写 pinState、驱动 simulation，"pipeline-only 写"是错的 | 原计划"pipeline 写、其余只读"（与真实行为不符） |
| controller 碰 DOM | 允许切 `is-dragging`/`focus` 附着，禁止建/画图 DOM | 真实代码本就如此；强禁会一上手违规且导致过度间接 | 每个 class 切换都包 presenter 方法（过度设计） |
| 控件接线（eng-review A1） | root 把 controller 命令打包成 `GraphCommands` 接口注入 pipeline 的 `mount*` | 避免 controller↔pipeline 循环依赖；root 是接线 owner | mount 直调 controller（双向依赖）/ mount 挪进 controller（要建 DOM） |
| apply 归属（eng-review A2+CQ3） | 单一 `root.render(opts)` = apply 到 state + pipeline 纯重画；18 调用点共用 | pipeline 不写语义状态、apply 不在 18 处重复 | apply 留 pipeline（违铁律）/ 各点各写（违 DRY） |
| 上手前先设计接口（eng-review C1） | Phase 1.0 先列 context 全集 + 四接口签名再搬码 | 否则 Phase1 拼临时回调包、Phase2 重写 = 藏在搬家里的接口重设计 | 边做边发现（Codex 警告会返工） |
| 生命周期守护（eng-review C2） | 显式 render-epoch + 拆卸契约 + 对应测试 | render 再入 / animateDiff 竞态 / destroy 顺序都是静默失败缝 | 仅靠现有测试与人工小心 |
| 公开面改名（eng-review C3） | `createStaticGraphRenderer` 经 `export * from './render'` 在包公开面；为避免破坏现有导入，保留兼容别名，同时清掉旧文件名 | 包公开面需要向后兼容，别名是稳定入口 | 直接删别名（会破坏既有导入） |
| 帧率门槛 | stage-4.5 offline exits 0 且实测 fps ≥ 45 | 设计要求"≥ 基线（~50）留 10%"；脚本内置相对下限 + 捕获绝对值双保险 | 仅靠脚本相对下限（可能在基线下滑时仍通过） |
| 进度记录粒度 | 每个已验证工作单元更新一次，且和代码改动放进同一个提交 | 上一轮逐提交配套记账过重；0.3 规则改为任务提交本身带进度更新 | 单独配套进度提交 |

## 提交规则

- Phase 0.1 做 clean-start commit（仅基线 progress，无功能代码）。
- 完成并验证每个工作单元后，把代码改动和 progress 文件更新放进同一个提交，提交信息里带任务号（例如 `feat: split controller [task 1.2]`）。不要把具体提交编号记进 progress 文件；`git log` 按任务号就是审计记录。这样每个工作单元只产生一个提交，不再有配对的记账提交。
- 验证失败不提交。
- 不自动 push / merge / amend；合并 main 需用户复核。

## /goal starter

```text
/goal Implement docs/plans/2026-06-17-graph-renderer-coordination-split-phased-plan.md by following its execution ledger.

Each turn:
1. Read docs/plans/2026-06-17-graph-renderer-coordination-split-progress.json, then the current task in the plan.
2. Run `git log --oneline -15` and `npm run test --workspace=@llm-wiki/graph-engine`; repair a broken state before starting new work.
3. Work only on the current work unit. This is a pure code-move: never change user-visible behavior.
4. After verification passes: update the progress file (status, baseline when relevant, verification/evidence, log fields, and residual risk when relevant) and commit the code change and that update together in one commit, with the task id in the message. Never commit on failed verification. Never push, merge, or amend.
5. When a phase's acceptance checks all pass, record it and continue to the next phase without asking for approval.

Done when every item in the plan is complete, every acceptance check is proven, fps >= 45, and the progress file records final status and residual risk.

Stop and report if a product decision is missing, the plan conflicts with the latest direction, or the worktree holds unrelated changes that cannot be safely separated.
```

## Worktree 并行化

Sequential implementation, no parallelization opportunity —— 所有 phase 都改 `packages/graph-engine/src/render/`，且每一阶段建立在前一阶段的模块边界与共享上下文上（Phase 1.0 接口 → 1 controller → 2 pipeline → 3 presenter → 4 改名 → 5 边界测试）。必须串行，不拆 worktree。

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — Phase 1.0：先设计 `GraphRenderContext` 全集 + 四接口签名再搬码。
  - Surfaced by: Outside voice C1 —— "pure move hides interface redesign; context underspecified"。
  - Files: 本计划"模块接口与共享上下文"节。
  - Verify: context 全字段清单 + 四接口签名写入计划。
- [ ] **T2 (P1, human: ~1h / CC: ~15min)** — 修正所有权：`pinState`/`simulation` 是 controller 与 pipeline 都写的共享对象，不是 pipeline-only。
  - Surfaced by: Cross-model tension —— codex 证明 controller 拖拽结束写 pinState、驱动 simulation。
  - Files: `controller.ts`, `render-context.ts`。
  - Verify: 边界测试允许 controller 写 pinState/驱动 simulation；workbench+offline 回归绿。
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — root 注入 `GraphCommands` 接口给 pipeline 的 `mount*`，消除 controller↔pipeline 循环。
  - Surfaced by: Architecture A1 —— mount* 回调 controller 命令（`static-renderer.ts:470-473,547,567`）。
  - Files: `render-pipeline.ts`, `graph-renderer-root.ts`。
  - Verify: 接线单测 + `mount*` 不 import controller。
- [ ] **T4 (P1, human: ~1h / CC: ~10min)** — 单一 `root.render(opts)` = applyOptionChanges + pipeline.rebuildAndPaint（纯）。
  - Surfaced by: Architecture A2 + CQ3 —— render() 顶部写 selection/focus/pin（`:255-262`）、18 调用点。
  - Files: `graph-renderer-root.ts`, `render-pipeline.ts`。
  - Verify: 边界测试证明 pipeline 不写语义状态；apply 只一份。
- [ ] **T5 (P2, human: ~2h / CC: ~20min)** — render-epoch + 显式拆卸契约（跨模块定时器/监听器）。
  - Surfaced by: Outside voice C2 —— render 再入 / animateDiff 竞态 / destroy 顺序。
  - Files: `render-pipeline.ts`, `graph-renderer-root.ts`。
  - Verify: 生命周期测试（见 T6）。
- [ ] **T6 (P1, human: ~1.5h / CC: ~20min)** — Phase 5.1 测试集：命令接线 + 生命周期 + 强制运行时探针。
  - Surfaced by: Test4 + C2 + C3。
  - Files: `renderer-boundary.test.ts`。
  - Verify: 新测试全绿（fake GraphCommands、重复 mount/destroy、applyDiff↔setData 竞态、destroy-with-pending-hover、mutation/teardown 探针）。
- [ ] **T7 (P2, human: ~20min / CC: ~5min)** — CSS 块 `ensureStaticRendererStyles` 迁入 render-pipeline，root 保持薄。
  - Surfaced by: Outside voice C3 —— 巨型 CSS 块未安排去处。
  - Files: `render-pipeline.ts`。
  - Verify: `graph-renderer-root.ts` 不含 CSS 注入；样式回归（offline HTML 渲染）绿。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | 不需要：内部重构、无产品/用户面变化 |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | absorbed | ~19 findings；折进 C1（上下文/所有权修正）、C2（生命周期缝）、C3（5 项硬化） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 4 findings（A1 循环依赖 / A2 apply 归属 / CQ3 DRY / Test4 接线测试），0 critical gaps，全部 resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | 无 UI 变化 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | 不适用 |

- **CODEX:** 外部声音修正了上下文写权模型（pinState/simulation 为共享可变，非 pipeline-only），并指出上下文字段被低估、生命周期缝（render 再入/animateDiff 竞态/destroy 顺序）、CSS 块去处；全部已折进计划。
- **CROSS-MODEL:** 唯一张力——计划原说"pipeline-only 写 pinState"，codex 证明 controller 也写；codex 正确，计划已改正。
- **VERDICT:** ENG CLEARED —— 计划已按 7 项决策硬化，可进入实现（`feat/graph-renderer-coordination-split`）。

NO UNRESOLVED DECISIONS
