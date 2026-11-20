# Graph Interaction Risk Audit

日期：2026-06-16

适用计划：`docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md`

## 审计目标

这份审计把本轮图谱重构要覆盖的交互风险集中记录下来。它不是普通 bug list，而是后续每个阶段的验收清单：每个风险都要明确期望行为、owner layer、验证方法和目标阶段。

核心原则：

- 图谱拥有自己的交互空间。节点、边、社区色块、空白画布上的滚轮、拖拽、hover、点击、键盘取消都先进入图谱交互链路。
- 浏览器默认行为只在明确允许的文本、输入、阅读区域发生。
- 命中、坐标、状态、渲染不能各算各的。
- 工作台和离线 HTML 是同等目标，不能只修其中一个。

## Owner Layer 约定

| Owner layer | 负责范围 |
|---|---|
| GraphGestures | 原始 pointer、wheel、keyboard、touch 事件；点击/拖拽/缩放意图；阻止浏览器默认行为 |
| SpatialIndex / GraphLayout | 节点、边、社区色块、空白图谱区域命中；布局边界；社区色块软边界 |
| GraphViewport | 世界坐标、屏幕坐标、小地图坐标转换；相机缩放、平移、fit、resize anchor |
| GraphState | hover、selection、active drag、pins、positions、viewport 等图谱运行状态 |
| GraphRenderer | 节点、边、社区色块、小地图、hover 卡片、工具栏、离线 reader 的绘制 |
| GraphFacade | workbench/offline 公开 API、宿主回调、持久化 pin、抽屉/选择语义协调 |

## 风险矩阵

| 风险 | 期望行为 | Owner layer | 验证方法 | 目标阶段 |
|---|---|---|---|---|
| Trackpad wheel 在图谱内被页面滚动或页面缩放抢走 | 鼠标或触控板停在节点、边、社区色块、空白画布上时，wheel 都只改变图谱相机；页面尺寸、页面滚动位置和浏览器缩放不变 | GraphGestures + GraphViewport | Node test 覆盖 wheel target policy；workbench/offline browser 脚本记录 transform 变化、root scroll、页面 viewport 指标 | Phase 2 |
| `ctrl/meta + wheel` 触发浏览器页面缩放 | 图谱拥有的 surface 内，pinch-like wheel 被图谱接管；输入框、阅读正文等 blocker 内不接管 | GraphGestures | Browser 脚本 dispatch cancelable wheel，记录 `visualViewport.scale`、`devicePixelRatio`、clientWidth 和 graph transform | Phase 2 |
| 鼠标在节点上滚轮不能缩放 | 节点命中优先，但节点上的 wheel 仍走 graph zoom，不因为节点可点击/可拖拽而阻断缩放 | GraphGestures + SpatialIndex | `gestures.test.ts` 覆盖 node target wheel；workbench/offline 真实节点上滚轮验证 transform 改变 | Phase 2 |
| 鼠标在社区色块上滚轮不能缩放 | 社区色块可点击选择整个社区，但 wheel 仍走 graph zoom；点击和滚轮互不抢语义 | GraphGestures + SpatialIndex | `gestures.test.ts` 覆盖 community target wheel；community wash browser regression | Phase 2 |
| 空白拖动画布时选中工具栏或页面文字 | active pan/drag 期间禁止 native selection；结束或取消后清理锁定状态 | GraphGestures + GraphRenderer | Browser 脚本拖动画布后断言 `window.getSelection().toString()` 为空、toolbar/search 文本未被选中、root dataset 无 stuck active | Phase 2 |
| 原生 drag selection 或页面 scroll 泄漏进图谱 | 图谱 owned surface 在 active gesture 期间阻止默认拖选、滚动和 scroll chaining；root scroll 被复位 | GraphGestures | Browser 脚本拖拽空白、拖节点、拖社区色块，检查 root scroll、document selection、body scroll | Phase 2 |
| 快速松开节点后节点回到原位 | drag end intent 必须带最终 pointer 坐标；即使最后一帧 move 没来得及提交，release 坐标也会提交成 pin | GraphGestures + GraphViewport + GraphState + GraphFacade | State machine test 覆盖 final screen point；browser 脚本快速 mouse down/move/up，检查节点位置和 pinned 状态 | Phase 2 |
| 节点拖拽不跟手或跳到别处 | 拖拽以 grabbed offset 为基准，屏幕点经 GraphViewport 反投影；节点中心不突然吸到鼠标中心，也不使用旧坐标公式 | GraphViewport + GraphState + GraphFacade | `simulation-bridge.test.ts` 覆盖 offset；browser 脚本记录 pointer 与节点中心距离上限 | Phase 3 |
| 节点被社区色块或固定世界尺寸锁住 | 社区色块是软视觉区域；节点可拖出色块；世界 bounds 由布局和 pin/outlier 推导，不用 `1000x680` 当硬笼子 | GraphLayout + GraphViewport | render model/community wash tests；community wash browser regression 拖出初始 wash 并检查 pin | Phase 3 / Phase 6 |
| 社区色块无限追随远处离群节点 | 色块可受拖出节点影响，但有上限；不会变成覆盖全屏的巨大色块；社区成员关系不因拖拽改变 | GraphLayout + GraphRenderer | `community-wash.test.ts` 覆盖 outlier cap；browser 脚本检查 wash 大小上限和成员稳定 | Phase 6 |
| 点击社区和拖动社区阈值冲突 | 小位移点击选中社区并打开选区语义；超过阈值不触发社区点击，也不误启动节点拖拽 | GraphGestures + SpatialIndex | `gestures.test.ts` 覆盖 community move cancel；browser 脚本 move past threshold 后 visible nodes 不变 | Phase 2 / Phase 6 |
| DOM stacking order 改变后命中不同 | 节点命中优先于边和社区；社区优先于空白；命中来源是 SpatialIndex，不是 `elementFromPoint` 或 DOM 层级 | SpatialIndex / GraphLayout + GraphGestures | 新增 `spatial-index.test.ts`，构造重叠节点/边/社区并打乱 DOM 顺序；renderer boundary test 禁止旧 DOM hit owner | Phase 1 / Phase 7 |
| Hover 简介位置漂移 | hover anchor 来自节点/边的世界坐标，经 GraphViewport 投影；zoom、pan、drag、resize、drawer open 后重新计算 | GraphViewport + GraphState + GraphRenderer | `overlays.test.ts` 扩展投影；workbench/offline browser 测 preview 和 anchor gap、viewport 内不溢出 | Phase 3 |
| Hover 卡片与节点不同步 | hover 状态存于 GraphState，Renderer 只绘制；节点位置更新后卡片 anchor 跟随同一状态快照 | GraphState + GraphRenderer | Browser 脚本在拖拽后 hover，记录卡片相对节点距离；state test 覆盖 hover snapshot | Phase 3 |
| Search 输入框边界误接管 | search 内 wheel、pointer、keyboard 不触发图谱 zoom/pan/shortcut；离开 search 后恢复图谱控制 | GraphGestures + GraphFacade | `gestures.test.ts` blocker 覆盖 search；browser 脚本打开 search 后滚轮不改变图谱 transform | Phase 2 |
| Toolbar/legend 边界误接管 | 工具栏和图例作为图谱控件：点击按控件语义走；wheel/pointer 不误触发画布 pan；空白点击可关闭 popover | GraphGestures + GraphRenderer | toolbar state tests；browser 脚本覆盖 toolbar panel、legend row、blank close | Phase 2 |
| Minimap 边界误接管 | minimap 有自己的点击/导航语义；不被 blank pan 或 graph wheel 错认；minimap 投影只走 GraphViewport | GraphGestures + GraphViewport + GraphRenderer | viewport minimap tests；browser 脚本 wheel over minimap 不 zoom graph，minimap click/viewport rect 稳定 | Phase 3 |
| Drawer/reader 边界误接管 | workbench drawer 和 offline reader 内允许文本阅读/滚动/按钮；不触发 graph drag/zoom；图谱 anchor 不因 drawer resize 漂移 | GraphGestures + GraphFacade + GraphViewport | Browser 脚本 drawer wheel 不 zoom graph，drawer resize 后选中节点保持可见且 hover 不溢出 | Phase 2 / Phase 3 |
| 数据刷新时正在拖拽 | active drag 期间 diff queue 暂存或合并；释放后以最终 pin/position 重建 layout 和 SpatialIndex，不用旧 snapshot 覆盖用户拖拽 | GraphState + GraphFacade + GraphLayout | GraphDiffQueue tests 已有基础，扩展 active drag release 后 replay；browser 可用 mock refresh 验证无回弹 | Phase 3 |
| Pointer cancel / lost pointer capture 后状态卡住 | 取消事件只清理 active gesture，不误提交 click/pin；root dataset、cursor、selection lock 都恢复 | GraphGestures + GraphState | `gestures.test.ts` 已覆盖基础，扩展 DOM cleanup；browser 脚本 dispatch pointercancel/lostpointercapture 后继续可操作 | Phase 2 |
| Escape 行为混乱 | active drag/pan 优先取消当前手势；无 active gesture 时清理 hover/selection/drawer/search，具体语义由 GraphFacade 统一 | GraphGestures + GraphFacade + GraphState | State machine test；workbench/offline browser 脚本覆盖 drawer、selection、search、active drag | Phase 2 / Phase 4 |
| 键盘快捷键抢输入框 | search、drawer、text-control 内的 Tab/Enter/Space/Arrow/plus/minus/zero 不触发图谱快捷键；图谱 focus 内才响应 | GraphGestures + GraphFacade | gestures blocker tests；browser 脚本聚焦 search/drawer 按键验证不改变 graph transform/selection | Phase 2 |
| Graph focus 不明确 | 点击/Tab 进入图谱后键盘归图谱；离开图谱或进入文本控件后键盘归宿主/浏览器 | GraphGestures + GraphFacade | Browser 脚本检查 focus ring、keyboard commands only under graph focus | Phase 4 |
| Touch 一指拖动画布和拖节点不稳定 | 支持 pointer events 的触摸：一指空白 pan、一指节点 drag；pointercancel 清理；没有复杂多指编辑时提供按钮 fallback | GraphGestures + GraphViewport | Browser 脚本模拟 pointerType touch；Node state machine test 覆盖 touch-like pointer sequence | Phase 2 |
| 双击或连续点击语义散落 | 双击 fit/reset 或其他图谱命令必须由 GraphGestures 发 intent，Renderer 不直接绑定 root dblclick | GraphGestures + GraphFacade | Final cleanup `rg` 检查 static-renderer 不再绑定 root dblclick；browser 脚本覆盖 reset/fit | Phase 5 / Phase 7 |
| 旧 renderer 继续偷偷拥有交互 | `static-renderer.ts` 终态只能是 composition/compat shell；不能保留 root wheel/pointer/dblclick/keydown/hit-test/coordinate owner | GraphFacade + GraphRenderer | Final cleanup `rg` 检查；renderer-boundary test 用 runtime contract 防止换文件名复发 | Phase 5 / Phase 7 |
| Workbench 与离线 HTML 行为分叉 | graph-engine 内的行为同源；workbench 只负责宿主抽屉和能力，offline 只负责离线 reader；核心交互测试两端都跑 | GraphFacade | `tests/graph-workbench-interactions.regression-1.sh` 和 `tests/graph-offline-phase-6.regression-1.sh` 同时通过 | Phase 7 |

## 当前覆盖与缺口

已有覆盖：

- `packages/graph-engine/test/gestures.test.ts` 已覆盖基础 target 分类、节点拖拽、社区点击取消、空白 pan、pointer cancel、Escape。
- `packages/graph-engine/test/viewport.test.ts` 已覆盖 zoom/pan/fit/minimap/resize anchor。
- `packages/graph-engine/test/simulation-bridge.test.ts` 已覆盖 dragged point under pointer 和 off-world drag 不被投影层 clamp。
- `packages/graph-engine/test/community-wash.test.ts` 与 `render-model.test.ts` 已覆盖社区色块 outlier cap、拖出后成员稳定。
- `tests/browser/graph-workbench-interactions.mjs`、`graph-offline-phase-6.mjs`、`graph-community-wash-interactions.mjs` 已有真实浏览器检查基础。

必须补齐：

- SpatialIndex 作为真实命中来源，而不是 DOM target 的接口包装。
- 图谱内 `ctrl/meta + wheel` 和 trackpad pinch-like wheel 不改变浏览器页面 zoom 的浏览器证据。
- 空白 pan、节点 drag 后无 native text selection 的浏览器证据。
- 快速 release 用最终 pointer 坐标提交 pin 的浏览器证据。
- hover preview 在 drag、zoom、pan、drawer resize 后仍锚定节点/边的浏览器证据。
- renderer boundary 检查，防止旧 `static-renderer.ts` 或新 renderer 文件重新接管交互。

## 阶段入口条件

Phase 1 之前必须满足：

- 本审计文档已提交。
- 进度账本记录 Phase 0 task 0.2 的验证和提交号。
- 不开始行为改动，直到 task 0.3 把现有测试与缺口映射到目标阶段。

后续每阶段完成时，progress 文件必须把本审计中的相关风险标成已有验证证据，不能只写“实现完成”。
