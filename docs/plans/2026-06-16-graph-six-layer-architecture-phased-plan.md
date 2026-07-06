# Graph Six-Layer Architecture Execution Plan

日期：2026-06-16

## 目标

落实 `docs/spark/2026-06-16-graph-six-layer-architecture-design.md`：把图谱从“旧 renderer 里集中处理很多事”的状态，推进到六层架构真正接管。

完成后，图谱必须成为一个边界清楚的独立交互模块：数据、布局、相机、渲染、手势、宿主协调各自有明确 owner。用户已经发现的缩放、拖拽、hover 漂移、文字被选中、节点被社区色块限制等问题，都必须作为同一类“图谱没有完全拥有自己的交互空间”的问题一起解决。

这不是 MVP 修补计划。每个阶段都必须拿走一块旧责任，不能只新增接口然后让旧逻辑继续决定行为。

## 源文档

- `docs/spark/2026-06-16-graph-six-layer-architecture-design.md`
- `docs/spark/2026-06-16-graph-interaction-geometry-design.md`
- `docs/plans/2026-06-16-graph-interaction-architecture-phased-plan.md`
- `docs/plans/2026-06-16-graph-interaction-architecture-progress.json`
- `AGENTS.md`
- `workbench/AGENTS.md`
- `workbench/PRODUCT.md`
- local graph architecture research note: `00-README.md`
- local graph architecture research note: `A-项目研究摘要.md`
- local graph architecture research note: `C-最终建议.md`
- local graph architecture research note: `D-模块边界.md`
- local graph architecture research note: `E-反模式清单.md`
- local graph architecture research note: `F-落地路线.md`

## 规格评审

结论：可以执行。

- 阻塞决策：无。用户明确要求架构合理、长期正确、不要为了修一个 bug 引出另一个 bug。
- 路线已定：保留 DOM + SVG；不切 WebGL；使用完整六层；采用 continuous takeover；工作台与离线 HTML 同等验收。
- 分支策略已定：计划文件先留在当前分支；真正动代码前，从当前分支新开实现分支 `codex/graph-six-layer-architecture`。
- 测试策略已定：复用现有 Node 测试与 browser regression 脚本。SpatialIndex 允许把 `d3-quadtree` 补为 graph-engine 的直接依赖；除该成熟空间索引依赖外，默认不新增 npm package。若执行中证明还必须引入其他新依赖，停止并说明原因和替代方案。
- 主要漂移风险：旧 `static-renderer.ts` 保留文件名后继续拥有交互、坐标或命中判断。本计划把旧责任清理列为硬验收。

## 任务规模

L 级 phased plan。理由：该工作跨共享图谱引擎、工作台宿主、离线 HTML、浏览器交互脚本、测试夹具和旧 renderer 清理，天然有阶段边界，预计会跨多个 `/goal` turn。

## 执行分支策略

计划写在当前分支 `codex/graph-interaction-architecture`。

实现开始前，第一项动作必须是从当前 HEAD 新开子分支：

```bash
git switch -c codex/graph-six-layer-architecture
```

如果该分支已存在，只有在它包含本计划提交、工作区干净、且没有无法分离的用户改动时才能继续；否则停止并报告。不要在 `main` 上执行本计划。不要先把当前分支合入 `main`。

第一个执行单元要做 clean-start commit：只记录“已在实现分支开始执行、基线 smoke check 通过”的 progress 更新，不写功能代码。

## 执行规则

- 执行分支：`codex/graph-six-layer-architecture`。
- 每个工作单元开始前运行基线 smoke check。
- 每完成一个已验证工作单元就提交一次，并把提交哈希记录到 `docs/plans/2026-06-16-graph-six-layer-architecture-progress.json`。
- 验证失败时不提交。
- 不自动 push、merge、amend。
- 阶段验收通过后直接进入下一阶段，不要求用户逐阶段确认。
- 执行者只能更新 progress 文件里的 status、verification、evidence、commit、decision_log、turn_log 字段；不能改写任务定义、验收标准或范围边界。
- 除 `d3-quadtree` 作为 SpatialIndex 直接依赖外，不新增 npm package、测试框架或配置来源；确实必须新增其他依赖时停止并报告。
- 不把 graph-engine 行为复制到 workbench；共享行为必须留在 `packages/graph-engine/`。
- 不让 `static-renderer.ts` 继续成为新增图谱交互的入口。

## /goal 协议

每次继续工作时：

1. 读取 progress 文件，确认当前 phase/task。
2. 运行 `git log --oneline -15` 和基线 smoke check。
3. 只处理当前工作单元。
4. 验证通过后更新 progress、提交该工作单元、记录提交哈希。
5. 阶段验收全部通过后，记录阶段完成并进入下一阶段。

## Progress 文件

`docs/plans/2026-06-16-graph-six-layer-architecture-progress.json`

## 基线 Smoke Check

每个工作单元开始前运行：

```bash
npm run test --workspace=@llm-wiki/graph-engine
```

如果 smoke check 在原始状态已经失败，progress 必须记录失败输出，先修复与本计划相关的破损状态，再开始新工作。

## 完整验收命令

最终交付前运行：

```bash
npm run test --workspace=@llm-wiki/graph-engine
npm run typecheck --workspace=@llm-wiki/graph-engine
npm run build --workspace=@llm-wiki/graph-engine
npm run test --workspace=@llm-wiki-agent/web
npm run typecheck --workspace=@llm-wiki-agent/web
npm run build --workspace=@llm-wiki-agent/web
bash tests/graph-community-wash-interactions.regression-1.sh
bash tests/graph-workbench-interactions.regression-1.sh
bash tests/graph-offline-phase-6.regression-1.sh
```

最终交付还必须运行旧责任清理检查：

```bash
! rg -n "root\\.addEventListener\\(\"(wheel|pointerdown|pointermove|pointerup|pointercancel|lostpointercapture|dblclick)" packages/graph-engine/src/render/static-renderer.ts
rg -n "screenPointToWorldPoint|worldPointToScreenPoint|rootClientPointToScreenPoint|classifyGraphWheelTarget|classifyGraphPointerDownTarget|SpatialIndex" packages/graph-engine/src
```

第一条命令必须退出 0，表示旧 renderer 里找不到 root 图谱事件绑定；第二条命令必须显示这些能力由专门层使用，而不是由旧 renderer 直接重新接管。

## 实现面地图

### 共享图谱引擎

- `packages/graph-engine/src/index.ts`
- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/src/render/index.ts`
- `packages/graph-engine/src/render/geometry.ts`
- `packages/graph-engine/src/render/viewport.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/src/render/gestures.ts`
- `packages/graph-engine/src/render/simulation-bridge.ts`
- `packages/graph-engine/src/render/overlays.ts`
- `packages/graph-engine/src/render/community-wash.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/toolbar.ts`
- `packages/graph-engine/src/render/search.ts`
- `packages/graph-engine/src/sim/index.ts`
- `packages/graph-engine/src/sim/pins.ts`

### 计划新增或成形的模块

具体文件名由执行者按现有结构选择，但必须能映射到这六层：

- GraphData：现有 `types.ts`、`model/`、`graph-node.ts`，不拥有屏幕、hover、drawer、DOM。
- GraphLayout：从 `render/model.ts`、`sim/`、`community-wash.ts` 中收敛布局产物，并新增 SpatialIndex。
- GraphViewport：现有 `render/viewport.ts` 与 `render/geometry.ts`，作为唯一坐标转换入口；世界尺寸必须可配置，并由布局 bounds 推导，不再把 `1000 x 680` 当作所有交互的硬边界。
- GraphRenderer：拆出节点、边、社区色块、minimap、overlay、toolbar、offline reader 等绘制模块。
- GraphGestures：现有 `render/gestures.ts` 继续扩展为唯一原始输入与意图分类入口。
- GraphFacade：从 `index.ts` 与 `static-renderer.ts` 中抽出协调层，保护 `createGraphEngine` 公开 API。

### 测试

- `packages/graph-engine/test/geometry.test.ts`
- `packages/graph-engine/test/viewport.test.ts`
- `packages/graph-engine/test/state.test.ts`
- `packages/graph-engine/test/gestures.test.ts`
- `packages/graph-engine/test/simulation-bridge.test.ts`
- `packages/graph-engine/test/overlays.test.ts`
- `packages/graph-engine/test/community-wash.test.ts`
- `packages/graph-engine/test/render-model.test.ts`
- 新增建议：`packages/graph-engine/test/spatial-index.test.ts`
- 新增建议：`packages/graph-engine/test/facade.test.ts`
- 新增建议：`packages/graph-engine/test/renderer-boundary.test.ts`

### 工作台与离线 HTML

- `workbench/web/src/components/GraphPanel.tsx`
- `workbench/web/src/components/RightDrawer.tsx`
- `scripts/build-graph-html.sh`
- `tests/browser/graph-workbench-interactions.mjs`
- `tests/browser/graph-offline-phase-6.mjs`
- `tests/browser/graph-community-wash-interactions.mjs`
- `tests/graph-workbench-interactions.regression-1.sh`
- `tests/graph-offline-phase-6.regression-1.sh`
- `tests/graph-community-wash-interactions.regression-1.sh`
- `tests/fixtures/graph-interactive-basic/`
- `tests/fixtures/graph-interactive-dense/`
- `tests/fixtures/graph-interactive-multicomm/`

## 架构流向

```text
GraphData
  -> GraphLayout
     -> world positions
     -> community wash geometry
     -> edge routes
     -> SpatialIndex
  -> GraphFacade
     -> GraphViewport camera
     -> GraphState runtime state
     -> GraphGestures intents
     -> GraphRenderer draw calls
     -> host callbacks
```

```text
Browser event
  -> GraphGestures
  -> SpatialIndex hit target when graph-owned
  -> graph intent
  -> GraphFacade
  -> GraphState / GraphViewport / GraphLayout update
  -> GraphRenderer paint
  -> host callback only for semantic actions
```

## 已有基础

- `render/geometry.ts` 已有显式坐标空间 helper。
- `render/viewport.ts` 已有相机、fit、pan、wheel zoom、resize、minimap viewport helper。
- `render/state.ts` 已有 runtime state 基础。
- `render/gestures.ts` 已有 target classifier 与 click/drag state machine。
- `render/simulation-bridge.ts` 已有 screen-to-world drag bridge。
- `render/community-wash.ts` 已有 capped wash 逻辑。
- `tests/browser/` 下已有 workbench、offline、community wash 的 browser regression。
- `static-renderer.ts` 仍有约 3000 行，并且仍直接绑定 wheel、pointer、dblclick、keydown、hover、click 等事件。这是本计划要继续接管和清理的核心。

## 决策记录

| 决策 | 结论 | 理由 |
|---|---|---|
| 实现分支何时开 | 计划提交后、实现第一步开 `codex/graph-six-layer-architecture` | 计划是文档，可留在当前分支；代码实现需要专用子分支，避免污染上一轮成果 |
| 渲染技术 | 继续 DOM + SVG | 当前问题是交互所有权，不是渲染吞吐瓶颈 |
| 测试依赖 | 除 `d3-quadtree` 作为 SpatialIndex 直接依赖外，默认不新增 npm package | 现有 Node tests 与 npx Playwright browser scripts 已覆盖主要验证面；`d3-quadtree` 已随 `d3-force` 出现在锁文件里，但要补为 graph-engine 显式依赖，避免依赖隐式传递 |
| 图谱区域缩放所有权 | graph-owned surface 内的普通 wheel、trackpad wheel、pinch-like `ctrl/meta + wheel` 都由 GraphGestures 接管；页面不能缩放 | 图谱必须像独立功能一样拥有自己的交互空间，不能让浏览器默认缩放抢走节点、社区、边、空白画布上的缩放 |
| SpatialIndex 核心 | 使用 `d3-quadtree` 作为节点空间索引核心；edge 与 community wash 使用同一 SpatialIndex facade 暴露命中，不让 GraphGestures 直接碰 DOM | D3 quadtree 是成熟二维空间搜索方案，适合节点附近查询和碰撞/命中；比自写网格更符合业界标准 |
| SpatialIndex 更新策略 | 拖拽和 pin 变化后重建当前可命中对象索引，直到性能测试证明需要增量更新 | D3 quadtree 中点坐标变化后不能原地改坐标；重建策略更明确、更少隐式状态 |
| 世界边界 | `GRAPH_WORLD_SIZE` 只能作为默认初始尺寸；GraphLayout 输出 layout bounds，GraphViewport 用 bounds 计算世界尺寸、fit、pan、minimap 和 screen/world 投影 | 节点不能被社区色块锁住，也不能被旧固定世界尺寸静默夹回去；世界范围要跟真实布局一致 |
| Edge 命中距离 | 初始 edge hit tolerance = 10 world units | 足够覆盖细边点击，同时不大到抢走节点与社区点击 |
| Node 命中 | 优先使用渲染模型中的节点交互 bounds；缺失时用 32 world units 半径兜底 | 命中逻辑应贴近用户看到的卡片，而不是只看中心点 |
| Community 命中 | 使用社区 wash 椭圆方程命中，节点命中优先于社区命中 | 社区色块可点选，但不能抢走节点拖拽与点击 |
| Community wash cap | 沿用现有默认上限：rx 不超过世界宽度 19%，ry 不超过世界高度 21% | 已有 capped wash 基础，先把它纳入架构测试与浏览器验收 |
| `static-renderer.ts` 终态 | 文件名可以保留为兼容 shell，但不能拥有原始图谱交互、坐标转换、命中判断或隐藏状态 | 用户要的是删除旧 renderer 责任；强删文件名不是目标，清掉旧所有权才是目标 |

## 失败模式与恢复

- 失败模式：trackpad pinch 或 `ctrl/meta + wheel` 仍触发浏览器页面缩放。恢复要求：GraphGestures 与 graph root 必须在节点、边、社区色块、空白画布等 graph-owned surface 阻止默认浏览器行为；输入框、抽屉正文等文本编辑区才允许浏览器默认行为。Browser regression 必须证明 `window.devicePixelRatio`、`visualViewport.scale`、页面 zoom 和 `document.documentElement.clientWidth` 没有被图谱内缩放改变。
- 失败模式：快速松开拖拽后节点回弹。恢复要求：drag end 使用 intent 内最终 screen point 计算最终 world position，并在释放当帧提交 pin。
- 失败模式：空白拖动画布时选中工具栏文字。恢复要求：graph-owned surface 在 active pan/drag 期间禁止 native selection，toolbar 作为图谱控制不能泄漏浏览器选区。
- 失败模式：SpatialIndex 只是存在，但 DOM target 仍决定节点、边、社区、空白命中。恢复要求：删除或隔离旧 DOM hit classification，并用测试证明不同 DOM stacking 下命中一致。
- 失败模式：节点可以拖出社区色块，但被固定 `1000 x 680` 世界或 render model clamp 静默夹回。恢复要求：GraphLayout 产出包含 dragged/pinned outlier 的 layout bounds，GraphViewport 以 bounds 驱动世界尺寸和相机；render model 不能在未经过 GraphLayout/GraphViewport 的情况下把节点位置 clamp 回默认世界。
- 失败模式：工作台通过了但离线 HTML 退化。恢复要求：任何 graph-engine 行为变更都跑 workbench 与 offline 两组 browser regression。

## 阶段计划

阶段顺序采用“先交互竖切链，后门面和拆分”的执行路线。完整六层架构不缩减，但第一条真实链路必须先闭环：Browser event -> GraphGestures -> SpatialIndex -> GraphViewport/GraphState -> GraphRenderer。这样每一层都先承接真实用户动作，再扩展到完整模块边界。

### Phase 0: 开实现分支与交互风险审计

目标：在专用实现分支上记录真实风险、现有覆盖、缺口和验证路径。此阶段不做功能修复。

实现面：

- `docs/plans/2026-06-16-graph-six-layer-architecture-progress.json`
- 新增建议：`docs/graph/2026-06-16-interaction-risk-audit.md`
- `packages/graph-engine/src/render/static-renderer.ts`
- `tests/browser/*.mjs`
- `tests/*.regression-1.sh`

任务：

1. `0.1` 创建 `codex/graph-six-layer-architecture` 子分支，运行基线 smoke check，提交 clean-start progress。
2. `0.2` 写交互风险审计，逐项记录 trackpad zoom、browser zoom、native selection、fast release、pointer cancel、toolbar/search/drawer/minimap 边界、hover anchor、data refresh、键盘和 touch 行为。
3. `0.3` 对照现有 Node tests 与 browser scripts，列出已覆盖和缺失覆盖，并给每个缺口分配目标 phase。

验收：

- `git status --short --branch` 显示当前分支是 `codex/graph-six-layer-architecture` 且无未分离用户改动。
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- 风险审计文档存在，并且每一项都有 expected behavior、owner layer、verification method、target phase。
- progress 记录 clean-start commit hash。

自动前进：验收通过并记录后进入 Phase 1。

### Phase 1: 交互竖切链基础与 SpatialIndex

目标：先建立真实用户交互链路的底层契约，避免先抽 facade 只得到一层空壳。

实现面：

- `packages/graph-engine/package.json`
- `package-lock.json`
- 新增建议：`packages/graph-engine/src/layout/spatial-index.ts`
- 新增建议：`packages/graph-engine/test/spatial-index.test.ts`
- `packages/graph-engine/src/render/gestures.ts`
- `packages/graph-engine/src/render/geometry.ts`
- `packages/graph-engine/src/render/viewport.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/test/gestures.test.ts`
- `packages/graph-engine/test/state.test.ts`

任务：

1. `1.1` 把 `d3-quadtree` 补成 graph-engine 的直接依赖，更新 lockfile，并用 graph-engine test/typecheck/build 证明依赖进入共享包构建路径。
2. `1.2` 定义 graph-owned target 与 blocker contract：节点、边、社区色块、空白画布归图谱；search、text control、drawer editable content、minimap、宿主控件为 blocker。
3. `1.3` 实现 SpatialIndex facade：用 `d3-quadtree` 作为节点空间索引核心，支持 node、edge、community wash、blank 查询；edge 与 community wash 可使用专门结构或候选列表，但 GraphGestures 只能依赖统一 SpatialIndex API。
4. `1.4` 建立 interaction contract tests，证明 DOM stacking order 改变不会改变 graph object 命中；renderer boundary 先测运行时 contract，不只靠 grep 或 import 禁令。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `spatial-index.test.ts` 覆盖 node、edge、community wash、blank、overlap priority、out-of-world drag target、drag/pin 后重建索引、D3 quadtree 节点移动不能原地改坐标的保护用例。
- GraphGestures 的 graph-owned object target 来源可以切到 SpatialIndex；DOM target 只用于 blocker 边界。

自动前进：验收通过并记录后进入 Phase 2。

### Phase 2: GraphGestures 完全接管原始输入与浏览器默认行为

目标：wheel、trackpad、pointer 的原始事件意义由 GraphGestures 决定，浏览器默认行为不能干扰 graph-owned surface。

实现面：

- `packages/graph-engine/src/render/gestures.ts`
- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/src/render/simulation-bridge.ts`
- `packages/graph-engine/test/gestures.test.ts`
- `packages/graph-engine/test/node-drag-lifecycle.test.ts`
- `tests/browser/graph-workbench-interactions.mjs`
- `tests/browser/graph-offline-phase-6.mjs`

任务：

1. `2.1` 把 root wheel/pointer 绑定迁出旧 renderer，形成 GraphGestures controller；旧 renderer 只接收 intent 或状态。
2. `2.2` 实现 graph-owned surface default policy：节点、边、社区色块、空白、图谱工具栏都阻止冲突的 page zoom、text selection、native drag selection；普通 wheel、trackpad wheel、pinch-like `ctrl/meta + wheel` 在 graph-owned surface 内都必须缩放图谱，不能缩放浏览器页面。
3. `2.3` 修正 fast release：drag end 使用 intent 的最终 screen point，经过 GraphViewport/Simulation bridge 提交最终位置和 pin。
4. `2.4` 明确 keyboard policy：GraphGestures 只在 graph focus/active gesture 下处理 Escape 等图谱键；search、drawer、text controls、Cmd/Ctrl+F 和宿主快捷键不被图谱层吞掉。
5. `2.5` 补齐 pointercancel、lostpointercapture、click-vs-drag threshold、toolbar/search/drawer/minimap 边界测试。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- Browser evidence 证明 graph 内普通 wheel、trackpad-like wheel、pinch-like `ctrl/meta + wheel` 都缩放图谱且不触发页面缩放；证据必须记录 `devicePixelRatio`、`visualViewport.scale`、`document.documentElement.clientWidth` 和图谱 transform 变化。
- Browser evidence 证明空白 pan 不产生 native text selection，快速释放拖拽能固定节点。
- 真实触控板 pinch 无法完全由 Playwright 证明时，必须在风险审计或 final evidence 中记录 Chrome 手动 dogfood 结果；若无法执行，标为残余风险，不得假装自动化已覆盖。
- `gestures.test.ts` 中旧的 `ctrl/meta + wheel` blocked 语义必须改为 graph-owned target zoom；只有 search、text-control、drawer editable content、minimap 等 blocker 继续阻止图谱缩放。
- `static-renderer.ts` 不再直接拥有 wheel/pointer 原始语义判断。

自动前进：验收通过并记录后进入 Phase 3。

### Phase 3: GraphViewport 与 GraphState 关闭坐标和状态回路

目标：坐标转换只走 GraphViewport/Geometry，hover、selection、focus、drag、pins、viewport 只走 GraphState；世界尺寸和可视 bounds 只由 GraphLayout/GraphViewport 决定。

实现面：

- `packages/graph-engine/src/render/geometry.ts`
- `packages/graph-engine/src/render/viewport.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/src/render/overlays.ts`
- `packages/graph-engine/src/render/simulation-bridge.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/test/geometry.test.ts`
- `packages/graph-engine/test/viewport.test.ts`
- `packages/graph-engine/test/state.test.ts`
- `packages/graph-engine/test/overlays.test.ts`

任务：

1. `3.1` 清除旧 renderer 中绕过 GraphViewport 的节点、边、hover、minimap、drawer resize 坐标计算。
2. `3.2` 让 active drag、hover target、selected item、focused community、pin snapshot、viewport 都由 GraphState snapshot 驱动。
3. `3.3` 把固定 `GRAPH_WORLD_SIZE` 降级为默认初始值：GraphLayout 输出 layout bounds，GraphViewport 使用 bounds 计算世界尺寸、fit、pan、minimap、screen/world 投影；render model 不得直接 clamp dragged/pinned 节点回默认世界。
4. `3.4` 保持旧 pin 与离线 HTML 兼容：现有 percent pins、world pins、localStorage pins 都必须可解释；若需要版本字段，必须同时提供旧数据读路径。
5. `3.5` 处理 data refresh while dragging：结束 active gesture，关闭 hover，清理 stale selection/focus，保留可解析 pins。
6. `3.6` 补 browser checks：zoom、pan、drag、drawer resize 后 hover/edge preview 仍贴住目标；节点拖到默认世界边界外后仍能 hover、命中、固定、在 minimap/fit 中可见。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- `rg -n "rootRect\\.width \\*|rootRect\\.height \\*|eventToGraphPoint|clientX.*WORLD|clientY.*WORLD" packages/graph-engine/src/render/static-renderer.ts` 无旧坐标计算命中。
- hover 卡片和边预览在缩放、平移、拖拽、抽屉 resize 后仍跟随目标。
- 节点拖到旧默认世界边界外不会被 clamp 回去；fit、minimap、SpatialIndex 和 hover anchor 都使用扩展后的 layout bounds。
- 旧离线 HTML pin 数据和工作台 pin 数据在新版 world bounds 下仍可读，不丢失用户拖拽位置。

自动前进：验收通过并记录后进入 Phase 4。

### Phase 4: GraphFacade 与六层边界成形

目标：在真实交互链路已经收敛后抽出 GraphFacade，保护公开 API，同时避免旧 renderer 继续藏协调责任。

实现面：

- `packages/graph-engine/src/index.ts`
- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/render/index.ts`
- `packages/graph-engine/src/render/static-renderer.ts`
- 新增建议：`packages/graph-engine/src/facade/graph-facade.ts`
- 新增建议：`packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/renderer-boundary.test.ts`
- `workbench/web/src/components/GraphPanel.tsx`
- `scripts/build-graph-html.sh`

任务：

1. `4.1` 抽出 GraphFacade，保护 `createGraphEngine(root, options)`、GraphEngine methods、capabilities 回调、workbench 与 offline 调用方式。
2. `4.2` 建立六层 owner map，在代码导出和测试中固定“谁拥有数据、布局、相机、渲染、手势、宿主协调”。
3. `4.3` 定义 host/offline capability contract：工作台宿主、离线 HTML、无宿主模式都必须走同一 facade，不复制 graph-engine 行为。
4. `4.4` 加边界测试，证明 host callbacks 不进入 GraphLayout/GraphRenderer，Renderer 不调用 gesture classifier，GraphFacade 是唯一知道 host callbacks 的层。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0。
- `packages/graph-engine/src/index.ts` 仍导出兼容的 `createGraphEngine`。
- Workbench 与 offline HTML 通过同一 facade 能力表运行；离线 HTML 不依赖 React 宿主或服务端能力。
- `static-renderer.ts` 不能新增 host callback 协调责任。

自动前进：验收通过并记录后进入 Phase 5。

### Phase 5: GraphRenderer 拆分与 `static-renderer.ts` 瘦身

目标：renderer 只负责绘制，不再决定手势意义、坐标转换、状态所有权或 host 协调。

实现面：

- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/toolbar.ts`
- `packages/graph-engine/src/render/search.ts`
- `packages/graph-engine/src/render/legend.ts`
- `packages/graph-engine/src/render/preview.ts`
- 新增建议：node renderer、edge renderer、community renderer、minimap renderer、overlay renderer、offline reader renderer
- `packages/graph-engine/test/renderer-boundary.test.ts`

任务：

1. `5.1` 拆出 node、edge、community wash、minimap、overlay 绘制模块，并让它们只接收 snapshot 或 render model。
2. `5.2` 拆出 toolbar、search、legend、offline reader 绘制模块，明确哪些 control 是 graph control，哪些是 blocker。
3. `5.3` 把旧 renderer 缩成 composition shell；新增图谱交互不得再写入 `static-renderer.ts`。
4. `5.4` 增加 renderer boundary 检查，阻止 renderer 模块调用 gesture classifier、viewport conversion、host callbacks；边界测试必须包含运行时 contract，不只做 import/grep。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0。
- `static-renderer.ts` 不再包含 root wheel/pointer/dblclick listener 绑定。
- `static-renderer.ts` 不再包含 GraphGestures target classifier 调用。
- renderer boundary test exits 0，并证明绘制模块不会接管交互意义。

自动前进：验收通过并记录后进入 Phase 6。

### Phase 6: Community wash 软边界完成

目标：社区色块是可点击、可被拖拽影响的视觉区域，不是节点拖拽围栏，也不能无限膨胀。

实现面：

- `packages/graph-engine/src/render/community-wash.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/test/community-wash.test.ts`
- `packages/graph-engine/test/render-model.test.ts`
- `tests/browser/graph-community-wash-interactions.mjs`
- `tests/browser/graph-offline-phase-6.mjs`

任务：

1. `6.1` 固定 community wash caps：cap 基于默认世界尺寸或社区局部基准，不随 dragged outlier 扩展后的 layout bounds 无限变大；fixture 必须证明单个远离节点不会拉爆画布。
2. `6.2` 让 dragged/pinned outlier 在 caps 内影响 wash，但不改变 community membership。
3. `6.3` 用 SpatialIndex 保持节点优先、社区色块次之、空白最后的命中优先级。
4. `6.4` 更新 workbench/offline browser checks：节点可被拖出 wash，wash 可有限变形，社区点击仍进入社区焦点。

验收：

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0。
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0。
- `bash tests/graph-community-wash-interactions.regression-1.sh` exits 0。
- `bash tests/graph-workbench-interactions.regression-1.sh` exits 0。
- `bash tests/graph-offline-phase-6.regression-1.sh` exits 0。
- 节点拖出社区色块后不会被自动锁回。
- 社区 membership 不因拖拽改变。
- Dense community 加一个 dragged outlier 仍可读。
- 社区 wash cap 不随 layout bounds 扩展而无限变大。

自动前进：验收通过并记录后进入 Phase 7。

### Phase 7: 旧路径删除与双端最终验收

目标：清理旧 renderer 所有权，完成工作台与离线 HTML 双端验收。

实现面：

- `packages/graph-engine/src/render/static-renderer.ts`
- `packages/graph-engine/src/render/`
- `packages/graph-engine/src/facade/`
- `packages/graph-engine/src/layout/`
- `tests/browser/`
- `tests/*.regression-1.sh`
- `docs/plans/2026-06-16-graph-six-layer-architecture-progress.json`

任务：

1. `7.1` 删除旧 renderer-owned pointer/wheel/keyboard/dblclick classification、手写坐标、DOM graph hit classification、隐藏 hover/drag/selection/focus state。
2. `7.2` 更新 browser regression evidence，覆盖桌面 1440x960、窄屏 390x844、离线 basic/dense/multicomm。
3. `7.3` 运行完整验收命令，记录输出摘要、artifact 路径、残余风险。
4. `7.4` 最终 progress 标记完成，记录最后一个提交哈希；不 push、不 merge、不 amend。

验收：

- 完整验收命令全部 exits 0。
- 旧责任清理检查通过：`static-renderer.ts` 不再拥有原始图谱交互、坐标转换或 graph hit testing。
- 架构责任检查通过：旧责任不能换名挪到新 renderer；GraphGestures、GraphViewport、GraphState、SpatialIndex、GraphFacade、GraphRenderer 的运行时 contract tests 必须一起通过。
- 工作台 browser regression 通过并记录 evidence artifact。
- 离线 HTML browser regression 通过并记录 evidence artifact。
- progress 文件 overall status 为 completed，residual risk 明确记录。

自动前进：此阶段完成后计划结束。

## 不在范围内

- 不迁移 WebGL、Pixi.js、Three.js、Canvas。
- 不引入图数据库、CRDT、事件溯源、LLM 自动重建图谱。
- 不新增 lasso selection、右键菜单、复杂多指编辑。
- 不让拖拽改变社区 membership。
- 不改知识库 markdown 数据结构。
- 不改 pi-agent 或 `node_modules/`。
- 不 push、merge、amend。

## Plan Eng Review Hardening

本节来自 `/plan-eng-review` 与外部二审，已经折回执行计划。它不新增产品范围，只把容易返工的工程风险写成硬验收。

### What Already Exists

- `render/geometry.ts`、`render/viewport.ts` 已有坐标与相机 helper；本计划复用并收敛为唯一入口。
- `render/gestures.ts` 已有 target classifier 与 gesture state machine；本计划把它升级为原始输入 owner。
- `render/state.ts` 已有 runtime state 基础；本计划让 hover、selection、focus、drag、pins、viewport 都走它。
- `render/community-wash.ts` 已有 capped wash 逻辑；本计划固定 cap 与 outlier 行为，不重写社区模型。
- `tests/browser/graph-workbench-interactions.mjs`、`graph-offline-phase-6.mjs`、`graph-community-wash-interactions.mjs` 已覆盖主要浏览器路径；本计划扩展它们，不另起测试框架。

### Test Coverage Diagram

```text
CODE PATHS                                      USER FLOWS
[+] SpatialIndex facade                         [+] Zoom inside graph
  ├── [GAP] node/edge/wash/blank priority         ├── [GAP] wheel over node/community/edge/blank
  ├── [GAP] DOM stacking independence             ├── [GAP] ctrl/meta wheel does graph zoom
  └── [GAP] rebuild after drag/pin                └── [GAP] page zoom metrics unchanged
[+] GraphGestures controller                    [+] Drag nodes
  ├── [GAP] blocker vs graph-owned target         ├── [GAP] fast release pins final position
  ├── [GAP] pointercancel/lostcapture/Escape      ├── [GAP] drag outside wash and world default
  └── [GAP] keyboard focus policy                 └── [GAP] no text selection while panning
[+] GraphViewport / GraphState                  [+] Hover and drawer resize
  ├── [GAP] layout-driven world bounds            ├── [GAP] hover follows after zoom/pan/resize
  ├── [GAP] legacy pin compatibility              └── [GAP] offline HTML parity
  └── [GAP] minimap/fit use expanded bounds
```

Coverage target: every GAP above must become either a Node test, a browser regression assertion, or an explicitly recorded residual risk before Phase 7 completes.

### Performance Gates

- SpatialIndex rebuild on dense fixture must stay under 8 ms p95 for 1k nodes on local dev hardware; if it fails, switch to incremental index updates before Phase 5 completes.
- Drag move handling must not rebuild community wash or SpatialIndex more than once per animation frame.
- Dense browser wheel/pan regression must stay at or above 50 fps, matching the existing stage 4.5 expectation.
- Browser regression artifacts must include timing summary for workbench dense, offline dense, and multicomm fixtures.

### Failure Modes

- Browser default zoom escapes GraphGestures: covered by browser metrics for `devicePixelRatio`, `visualViewport.scale`, `clientWidth`, and graph transform.
- Fast release loses final pointer position: covered by node drag lifecycle tests and browser drag evidence.
- DOM stacking changes graph target: covered by SpatialIndex priority tests and browser assertions over node/community/edge/blank.
- Old pins misread after layout bounds change: covered by render-model and offline HTML pin compatibility tests.
- Community wash cap expands with world bounds: covered by community wash fixture proving cap uses a stable baseline.
- Offline HTML becomes second-class: covered by facade contract tests and offline browser regression.

### Worktree Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 SpatialIndex | `packages/graph-engine/src/layout`, `packages/graph-engine/test` | Phase 0 |
| Phase 2 Gestures | `packages/graph-engine/src/render`, `tests/browser` | Phase 1 |
| Phase 3 Viewport/State | `packages/graph-engine/src/render`, `tests/browser` | Phase 1, Phase 2 |
| Phase 4 Facade | `packages/graph-engine/src/facade`, `workbench/web`, `scripts` | Phase 2, Phase 3 |
| Phase 5 Renderer | `packages/graph-engine/src/render` | Phase 4 |
| Phase 6 Community wash | `packages/graph-engine/src/render`, `packages/graph-engine/src/layout` | Phase 1, Phase 3 |

Parallelization: Phase 1 through Phase 5 should be sequential because they share the interaction modules and build on the same responsibility transfer. Phase 6 can start in a separate worktree after Phase 1 and Phase 3 contracts are stable, but should merge after Phase 5 to avoid renderer conflicts.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — Phase order — execute the interaction vertical chain before GraphFacade.
  - Surfaced by: Outside voice finding on facade-first risk.
  - Files: `docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md`, `docs/plans/2026-06-16-graph-six-layer-architecture-progress.json`.
  - Verify: Phase 1/2/3 acceptance checks reference SpatialIndex, gestures, viewport, and state before facade.
- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — Browser defaults — prove graph-owned wheel/pinch behavior does not zoom the page.
  - Surfaced by: User-reported browser zoom and outside voice test gap.
  - Files: `packages/graph-engine/src/render/gestures.ts`, `tests/browser/graph-workbench-interactions.mjs`, `tests/browser/graph-offline-phase-6.mjs`.
  - Verify: Browser evidence records page zoom metrics and graph transform changes.
- [ ] **T3 (P1, human: ~3h / CC: ~30min)** — SpatialIndex — use `d3-quadtree` as the graph hit-testing source.
  - Surfaced by: Architecture review and user choice D2 A.
  - Files: `packages/graph-engine/package.json`, `package-lock.json`, `packages/graph-engine/src/layout/spatial-index.ts`, `packages/graph-engine/test/spatial-index.test.ts`.
  - Verify: graph-engine test/typecheck/build plus DOM stacking independence tests.
- [ ] **T4 (P1, human: ~3h / CC: ~30min)** — World bounds — make layout bounds drive world size without breaking old pins.
  - Surfaced by: Architecture review and outside voice world-size risk.
  - Files: `packages/graph-engine/src/render/geometry.ts`, `packages/graph-engine/src/render/viewport.ts`, `packages/graph-engine/src/render/model.ts`, `tests/browser/graph-offline-phase-6.mjs`.
  - Verify: old pin compatibility tests and drag outside default world browser evidence.
- [ ] **T5 (P2, human: ~2h / CC: ~20min)** — Performance — add dense interaction timing gates.
  - Surfaced by: Performance review and outside voice performance gap.
  - Files: `tests/browser/*.mjs`, `packages/graph-engine/test/spatial-index.test.ts`.
  - Verify: dense wheel/pan fps and SpatialIndex rebuild p95 evidence.

## /goal starter

```text
/goal Implement docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md by following its execution ledger.

Each turn:
1. Read docs/plans/2026-06-16-graph-six-layer-architecture-progress.json, then the current task in the plan.
2. Run `git log --oneline -15` and `npm run test --workspace=@llm-wiki/graph-engine`; repair a broken state before starting new work.
3. Work only on the current work unit.
4. After verification passes: update the progress file status, evidence, and log fields only; commit that unit; record the commit hash. Never commit on failed verification. Never push, merge, or amend.
5. When a phase's acceptance checks all pass, record it and continue to the next phase without asking for approval.

Done when every item in the plan is complete, every acceptance check is proven, and the progress file records final status and residual risk.

Stop and report if a product decision is missing, the plan conflicts with the latest direction, or the worktree holds unrelated changes that cannot be safely separated.
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not required for this implementation plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | absorbed | 16 findings; accepted phase-order, browser-test, dependency, SpatialIndex timing, world-bounds, community-cap, keyboard, offline, performance hardening |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 5 implementation tasks, 0 unresolved decisions, 0 critical gaps after plan updates |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Not required before implementation; browser UX is covered by eng acceptance |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not required before implementation |

- **CODEX:** Outside voice challenged facade-first ordering, weak browser evidence, late SpatialIndex, world-bounds migration, cap stability, keyboard ownership, offline parity, and performance gates; accepted items are folded into phases.
- **CROSS-MODEL:** Both reviews agree the complete six-layer architecture stays, but execution must start with a real interaction chain instead of a facade shell.
- **VERDICT:** ENG CLEARED — ready to implement after committing this reviewed plan and starting `codex/graph-six-layer-architecture`.
NO UNRESOLVED DECISIONS
