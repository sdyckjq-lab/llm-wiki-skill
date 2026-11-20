# Graph Interaction Test Coverage Map

日期：2026-06-16

适用计划：`docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md`

前置审计：`docs/graph/2026-06-16-interaction-risk-audit.md`

## 目标

这份文档把交互风险映射到现有测试、缺口测试和后续阶段。它用于防止后续重构只移动代码、不建立保护网。

判定规则：

- `Covered`：已有单元测试或浏览器脚本能直接防住该风险。
- `Partial`：已有测试覆盖了核心数学或状态，但没有覆盖真实浏览器行为或最终架构边界。
- `Missing`：当前没有明确测试，必须在目标阶段新增。

## 覆盖总览

| 风险组 | 当前状态 | 已有保护 | 必补保护 | 目标阶段 |
|---|---|---|---|---|
| 节点/边/社区/空白 wheel zoom | Partial | `gestures.test.ts` target policy；`graph-workbench-interactions.mjs` 和 `graph-offline-phase-6.mjs` 覆盖部分 wheel target | trackpad-like wheel、`ctrl/meta + wheel` 不触发页面 zoom 的浏览器证据 | Phase 2 |
| 浏览器默认行为隔离 | Missing | root scroll reset 有部分浏览器检查 | native selection、body scroll、root scroll、browser zoom 指标统一记录 | Phase 2 |
| 点击/拖拽状态机 | Partial | `gestures.test.ts` 覆盖阈值、cancel、Escape；`simulation-bridge.test.ts` 覆盖 grabbed offset | 快速 release 用 final pointer 坐标提交 pin 的浏览器证据 | Phase 2 |
| SpatialIndex 命中 | Missing | 现有 target classifier 不依赖 DOM mock，但仍不是真实空间命中 | 新增 `spatial-index.test.ts`，覆盖节点、边、社区、空白、重叠优先级、旧世界外命中 | Phase 1 |
| 坐标和相机 | Partial | `geometry.test.ts`、`viewport.test.ts`、`simulation-bridge.test.ts`、`overlays.test.ts` | layout-driven world bounds、drawer resize 后 hover/selection anchor 的浏览器证据 | Phase 3 |
| 图谱运行状态 | Partial | `runtime-state.test.ts`、`queue.test.ts` 覆盖基础状态和 diff queue | 数据刷新期间 active drag 的最终 pin 不被 stale snapshot 覆盖 | Phase 3 |
| 社区色块软边界 | Partial | `community-wash.test.ts`、`render-model.test.ts`、`graph-community-wash-interactions.mjs` | SpatialIndex priority 接管社区命中；expanded bounds 下 cap 不无限放大 | Phase 6 |
| 工具栏/search/legend/minimap/drawer 边界 | Partial | `gestures.test.ts` blocker policy；toolbar tests；workbench/offline browser 覆盖部分 UI | keyboard focus、wheel blocker、pointer blocker、drawer resize anchor 的一组统一回归 | Phase 2 / Phase 3 |
| hover preview anchor | Partial | `overlays.test.ts` 和 browser hover checks | zoom、pan、drag、drawer resize、community focus 后统一 anchor gap 证据 | Phase 3 |
| keyboard/touch | Missing | Escape 基础 state machine 覆盖 | graph focus 内快捷键、text-control blocker、touch-like pointer sequence | Phase 2 / Phase 4 |
| renderer 旧责任清理 | Missing | 计划内 `rg` 命令尚未转成阶段测试 | renderer boundary test + final cleanup `rg`，禁止 root interaction 和 coordinate owner 回到 renderer | Phase 5 / Phase 7 |
| workbench/offline parity | Partial | `graph-workbench-interactions.mjs`、`graph-offline-phase-6.mjs`、`graph-community-wash-interactions.mjs` | 每个核心交互在两端都留下证据 artifact | Phase 7 |

## 现有测试归位

### GraphGestures

已有：

- `packages/graph-engine/test/gestures.test.ts`
  - graph target 分类：blank、node、community wash、edge、minimap、toolbar、search、legend、drawer、text-control。
  - wheel target policy：blank/node/community/edge 可 zoom；controls/drawer/minimap/text-control 阻断。
  - pointerdown target policy：node drag、community click、blank pan、controls blocker。
  - gesture state machine：node click、node drag、community click cancel、blank pan、pointercancel、lostpointercapture、Escape。

缺口：

- 当前 `ctrl/meta + wheel` 在单元测试里是 blocked，但本轮设计要求 graph-owned surface 内必须阻止浏览器页面 zoom 并转为图谱意图；Phase 2 必须重做该策略并补浏览器证据。
- 缺 touch-like pointer sequence。
- 缺 keyboard focus 和 text-control blocker 的真实浏览器证据。
- 缺 active gesture 期间 native selection 清理证据。

### GraphViewport / Geometry

已有：

- `packages/graph-engine/test/geometry.test.ts`
  - world/screen round trip。
  - drawer-style resize 后 layer point round trip。
  - minimap projection。
  - 不在投影 helper 内静默 clamp。
- `packages/graph-engine/test/viewport.test.ts`
  - wheel zoom around pointer。
  - pan、fit、center、resize anchor、minimap rect、frame commit coalescing。
- `packages/graph-engine/test/simulation-bridge.test.ts`
  - grabbed point stays under pointer。
  - drag start 不跳到 pointer center。
  - off-world drag 不在 projection/bridge 层 clamp。
- `packages/graph-engine/test/overlays.test.ts`
  - node/edge hover anchor 使用投影点。
  - preview card stay inside viewport。

缺口：

- GraphViewport 还需要接入 layout-driven world bounds，不再让固定世界尺寸决定拖拽范围。
- Browser 需要证明 zoom、pan、drag、drawer resize 后 hover preview 仍与节点/边锚定。
- Minimap 点击和当前 viewport rect 需要在新 world bounds 下验证。

### GraphState / Diff Queue

已有：

- `packages/graph-engine/test/runtime-state.test.ts`
  - viewport、hover、selection、focus、pins、positions、active gesture 一处更新。
  - simulation proposal 不直接变成 committed positions。
  - snapshot clone 防止外部改 hidden state。
- `packages/graph-engine/test/queue.test.ts`
  - graph hidden 时 diff queue 合并。
  - drag 期间 hold diff，释放后 consume。

缺口：

- active drag release 同时遇到 data refresh 时，最终 release position 必须优先于 stale replay。
- GraphState 与 GraphFacade 之间需要一个明确的 commit path 测试，证明 fast release 不回弹。

### GraphLayout / Community Wash

已有：

- `packages/graph-engine/test/community-wash.test.ts`
  - small communities remain selectable。
  - dragged outlier influences wash but does not chase it without cap。
  - multi-direction outlier cap。
- `packages/graph-engine/test/render-model.test.ts`
  - pinned member outside wash cap 时 community membership 稳定。
  - member dragged beyond cap 后 community focus 稳定。
- `tests/browser/graph-community-wash-interactions.mjs`
  - community wash 上 wheel zoom。
  - 点击 community wash 进入社区。
  - 超过阈值移动取消 community click。
  - 节点可以拖出初始 wash 并提交 pin。

缺口：

- SpatialIndex 接管后，community hit 不能再依赖 DOM stacking。
- expanded layout bounds 下，wash cap 仍然不能无限扩张。
- 节点拖出 wash 后，wash soft-boundary 更新要和 membership 稳定同时验证。

### GraphRenderer / Boundary

已有：

- `packages/graph-engine/test/render-model.test.ts`
  - renderable graph、selected state、density、community focus、pinned positions。
- `packages/graph-engine/test/toolbar.test.ts`
  - toolbar panel state 和 blank click close。
- `packages/graph-engine/test/search-and-legend.test.ts`
  - search helpers 和 legend selection。
- `tests/browser/graph-stage-4-5.mjs`
  - 旧阶段的 wheel、selection、drawer、hover、edge preview、responsive checks。

缺口：

- 缺 renderer boundary test：Renderer 不能直接拥有 root wheel/pointer/dblclick/keydown。
- 缺 final `rg` 检查转成可重复的测试证据。
- 缺 DOM order 改变但 SpatialIndex 命中不变的测试。

### Workbench / Offline

已有：

- `tests/browser/graph-workbench-interactions.mjs`
  - workbench desktop/narrow、wheel targets、blocker targets、hover、drawer resize、community drag、pan/minimap reset。
- `tests/browser/graph-offline-phase-6.mjs`
  - offline hover、drag under pointer、selection panel、reader boundary、root scroll 等。
- `tests/browser/graph-community-wash-interactions.mjs`
  - offline community wash 专项。

缺口：

- 两端都需要记录页面 zoom 没有变化。
- 两端都需要记录 native selection 没有泄漏。
- 两端都需要记录快速 release 后 pin 位置稳定。
- 两端都需要记录 pointercancel/lostpointercapture 后不留下 stuck state。

## 必须新增或扩展的测试

| 测试文件 | 类型 | 覆盖内容 | 目标阶段 |
|---|---|---|---|
| `packages/graph-engine/test/spatial-index.test.ts` | Node unit | node/edge/community/blank hit；overlap priority；out-of-old-world hit；DOM order independent fixtures | Phase 1 |
| `packages/graph-engine/test/gestures.test.ts` | Node unit | graph-owned `ctrl/meta + wheel` policy；touch-like pointer sequence；keyboard focus blocker contract | Phase 2 |
| `tests/browser/graph-workbench-interactions.mjs` | Browser | graph-owned wheel does not zoom page；native selection stays empty；fast release pin persists；pointercancel cleanup | Phase 2 |
| `tests/browser/graph-offline-phase-6.mjs` | Browser | same as workbench for offline HTML | Phase 2 / Phase 7 |
| `packages/graph-engine/test/runtime-state.test.ts` | Node unit | data refresh while dragging keeps final release position | Phase 3 |
| `packages/graph-engine/test/viewport.test.ts` | Node unit | layout-driven world bounds; minimap and fit under expanded bounds | Phase 3 |
| `packages/graph-engine/test/overlays.test.ts` | Node unit | hover anchor after viewport resize, zoom, pan, and dragged node update | Phase 3 |
| `packages/graph-engine/test/facade.test.ts` | Node unit | facade is the only host callback owner; workbench/offline capability contract remains compatible | Phase 4 |
| `packages/graph-engine/test/renderer-boundary.test.ts` | Node unit / static check | renderer modules do not bind root graph events or perform graph hit testing | Phase 5 / Phase 7 |
| `tests/browser/graph-community-wash-interactions.mjs` | Browser | SpatialIndex node > community > blank priority; wash cap under expanded bounds | Phase 6 |

## Phase Gate Mapping

Phase 1 can pass only when:

- SpatialIndex exists as a real hit-testing source.
- `spatial-index.test.ts` covers nodes, edges, communities, blank, overlap priority, old-world outliers.

Phase 2 can pass only when:

- Node tests cover graph-owned wheel/pointer/key policy.
- Workbench and offline browser tests prove graph-owned wheel does not change page zoom.
- Workbench and offline browser tests prove native selection does not leak during graph gestures.
- Fast release drag persists the final position.

Phase 3 can pass only when:

- GraphViewport owns all coordinate conversion under drag, hover, resize, minimap, fit.
- Layout-driven bounds replace fixed world-size drag cage.
- Data refresh while dragging cannot overwrite final user intent.

Phase 4 can pass only when:

- GraphFacade owns host coordination.
- Workbench and offline use the same graph-engine capability contract.

Phase 5 can pass only when:

- Renderer modules draw from snapshots and do not decide interaction meaning.
- `static-renderer.ts` is reduced to compatibility/composition responsibilities.

Phase 6 can pass only when:

- Community wash remains soft, capped, and non-blocking.
- SpatialIndex priority drives node/community/blank behavior.

Phase 7 can pass only when:

- Full command set passes.
- Browser artifacts exist for workbench, narrow, and offline paths.
- Static cleanup checks show old renderer-owned interaction paths are gone.
