# Sigma 相机动画帧合同设计

日期：2026-07-01
状态：已按用户确认的方案成稿，等待 review
关联 issue：#86
相关背景：#75、#79、PR #87

## 背景

#75 已经在主线实现了 Sigma overlay 相机动画快路径：动画期间用 overlay root transform 轻量跟随，动画结束后再精确 `reposition()` 校准。这个方向仍然正确，但 #86 暴露出另一个更底层的问题：这条快路径目前依赖 Sigma renderer 事件来驱动，项目自己没有定义“相机动画期间每一帧应该发生什么”的合同。

当前主线里，`sigma-global-renderer.ts` 仍然绑定了 `sigma.on("cameraUpdated", ...)`。但 Sigma 3.0.3 的相机事件是 camera 自身的 `"updated"`，不是 Sigma renderer 上的 `"cameraUpdated"`。因此，这个 listener 事实上不是可靠的相机事件来源。

当前 overlay 能在部分路径中移动，主要依赖 `afterRender`。这让行为变成“Sigma 刚好渲染时 overlay 跟着动”，而不是“项目发起相机动画后 overlay 必须在每个可用动画帧跟随”。对于图谱基建来说，这个边界太隐式。

## 核验结论

本次排查不直接照抄 #86 的全部判断，而是按源码和当前主线重新核实。

### 已确认成立

- `sigma-global-renderer.ts` 绑定了不存在的 `cameraUpdated` 事件。
- `SigmaGlobalCameraLike` 只描述了 `getState`、`setState`、`isAnimated`、`animate`，没有描述 camera 的 `on/off` 事件能力。
- #75 的单元测试证明了“收到 `afterRender` 后快路径会生效”，但没有证明“项目发起的 `camera.animate()` 本身会持续驱动 overlay”。
- 浏览器生产脚本已有 `spotlight_animation`，但当前只看 fps、最终选中和最终 transform 清空；它没有硬性断言动画中段 overlay transform 非空，也没有断言选中社区 overlay 在动画中实际移动。

### 需要修正的判断

#86 issue 正文里有一个需要谨慎处理的说法：`camera.animate` 不触发 camera `"updated"`。

本地 Sigma 3.0.3 源码显示：

- `Camera.animate()` 在每个 rAF tick 中调用 `setState(newState)`。
- `Camera.setState()` 在状态变化时 `emit("updated", this.getState())`。
- Sigma 主类自己通过 `camera.on("updated", ...)` 调 `scheduleRender()`。

因此，后续实现不能建立在“Sigma animate 一定不发 updated”这个未成立前提上。更稳妥的设计是：项目既修正事件绑定，也建立自己的动画帧驱动合同；Sigma 事件可以作为辅助信号，但不能是唯一保证。

## 影响

这个问题的用户影响不是单点崩溃，而是动画一致性和测试可信度问题：

- spotlight 动画期间，overlay 跟随行为缺少项目级保证。只要 Sigma 没有按预期派发 render 事件，社区云团、节点命中框、标签就可能停在旧位置，动画结束后再跳回精确位置。
- #75 的性能优化在单元层面有效，但浏览器层面还没有证明“spotlight 动画中 overlay 确实走了快路径”。
- fps 达标不一定代表体验正确。overlay 不动时也可能很流畅，所以必须验证动画中段的跟随状态。
- 错误事件名会误导后续维护者，让人以为 renderer 正在监听相机变化，实际没有。

## 联动范围判断

建议本次只联动 #75 的验证口和事件驱动口，不合并其他功能 issue。

应联动：

- #75：保留已实现的 overlay 快路径，但补上项目自己的动画帧合同和真实浏览器中段验证。#86 是 #75 的基建收口。
- #79：继续遵守 Sigma 全局路线子系统边界，frame driver 只做调度，不把 overlay 计算、选择语义、抽屉行为塞回主入口。

不应联动：

- #70：节点标签截断是另一个视觉问题，可能也受相机影响，但不是同一条根因链。混进来会扩大验证面。
- #80：长期架构整理不应借 #86 启动。#86 只补相机动画合同。
- 社区点击、抽屉、路由、DOM/SVG 社区阅读视图：这些语义保持不变。

## 目标

- 明确项目自己的相机动画帧合同：项目发起相机动画后，overlay 必须在动画期间每个可用动画帧轻量跟随，动画结束后精确归位。
- 去掉对不存在 `cameraUpdated` 事件的依赖。
- 正确接入 Sigma camera `"updated"` 事件能力，但不把它当作唯一驱动。
- 让 spotlight、缩放按钮、未来程序化相机动画复用同一套帧合同。
- 让 wheel、拖拽、reset、resize、destroy、reduced motion 等打断路径有明确规则。
- 补强浏览器验证，让测试证明动画中段 overlay 真的在动。

## 非目标

- 不升级 Sigma 版本。
- 不修改 `node_modules/`。
- 不重做 #75 的 overlay transform 算法。
- 不改变社区高亮、抽屉、路由、进入社区的产品语义。
- 不修 #70 节点标签截断。
- 不启动 #80 长期拆分。
- 不新增 npm 依赖。

## 设计原则

1. **动画帧由项目负责兜底。**
   Sigma 事件可以帮助减少重复工作，但不能决定项目是否履行 overlay 跟随。

2. **动画中轻量，结束后精确。**
   沿用 #75 的两段式策略：动画中只做 transform，稳定后清除 transform 并完整 `reposition()`。

3. **帧驱动只调度，不接管业务。**
   frame driver 不知道选中了谁，不打开抽屉，不计算云团形状，不写 Graphology。

4. **打断必须可解释。**
   用户滚轮、拖拽、reset、resize、数据更新、destroy 都要有明确的停止、失效或精确校准路径。

5. **验收必须看动画中段。**
   只看最终对齐不够；必须证明 overlay 在动画期间跟随相机。

## 架构设计

### 升级现有相机动画帧循环

Sigma 全局 renderer 里已经有 `scheduleOverlayAnimationSettleCheck()`：它用 rAF 等相机动画结束，然后做最终精确校准。#86 不应再新增一套并行 rAF 循环，而应把这条现有 settle watcher 升级成完整的动画帧循环。它仍是 runtime shell 的私有调度单元，负责管理“当前是否有项目发起的相机动画需要驱动 overlay”。

建议职责：

- `startCameraFrameTracking(reason)`：项目调用 `camera.animate()` 后启动。
- `tick()`：每个 rAF 检查相机状态。
- 动画中调用 `overlayDomController.repositionForCameraAnimation()`。
- 动画帧计算必须基于当前 camera state，而不是依赖 Sigma 上一次 render 留下的投影矩阵。若复用 `sigma.graphToViewport()` / `viewportToFramedGraph()`，实现必须显式传入当前 camera state；否则 frame driver 虽然持续 tick，overlay 仍可能按旧矩阵计算。
- 相机稳定后调用 `overlayDomController.reposition()`，清除临时 transform 并刷新精确基线。
- `invalidate/suppress`：destroy、resize、drag、数据更新等边界让当前动画基线失效，必要时 suppress 快路径直到相机稳定。
- 所有异常继续走 `options.onFatalError`。

实现可以先沿用当前 `overlayAnimationSettleFrame` 槽位和取消函数，避免出现“旧 settle watcher + 新 frame driver”两套 rAF 同时写 overlay。这个循环还需要一个 generation / owner token：新的 spotlight、zoom、reset、wheel、resize、update 发生后，旧动画帧即使晚到也只能被忽略或走精确重排，不能继续写旧 transform。若升级后主文件明显变复杂，再拆成 `sigma-camera-frame-driver.ts`；是否拆文件由实现时的复杂度决定，但边界必须清楚：它只做帧调度。

### Sigma 事件接入

事件处理调整为两层：

1. 绑定正确的 camera `"updated"` 事件，用它作为外部相机变化的辅助刷新信号。
2. 保留 `afterRender` 作为 Sigma 已完成渲染后的辅助信号。

但 project-owned frame driver 才是程序化动画期间的主保证。也就是说：

```text
项目调用 camera.animate()
→ frame driver start
→ requestAnimationFrame tick while camera.isAnimated()
→ overlay fast path
→ camera stable
→ exact reposition
→ driver stop
```

Sigma 的 `"updated"` / `afterRender` 到来时可以复用同一个刷新入口，但不能在同一浏览器帧内重复写多次 overlay。事件只负责请求一次下一帧刷新；真正写 transform 的路径由 frame driver 合并执行。即使事件没有到，driver 也要继续 tick。

### 相机模块接口

`sigma-global-camera.ts` 继续负责计算目标和调用相机移动，但需要让 renderer 知道是否真的启动了动画。

当前 `maybeAnimateSigmaCommunitySpotlightCamera()` 同时承担两个事实：一是“当前 spotlight 社区是谁”，二是“是否发起了相机移动”。#86 实现不能只返回移动状态，否则 renderer 会丢掉 `cameraSpotlightCommunityId` 这条状态。建议改成复合结果，例如：

```text
{
  communityId: string | null,
  movement: "animated" | "immediate" | "skipped",
  skipReason?: "no-community" | "already-settled" | "no-target" | "camera-unavailable" | "animate-unavailable" | "animate-error"
}
```

语义：

- `communityId`：renderer 应记录的当前 spotlight 社区；没有社区时为 null。
- `animated`：调用了 `camera.animate()`，renderer 必须启动 frame driver。
- `immediate`：reduced motion 或缺少 animate，已 `setState()`，renderer 必须精确 `reposition()`。
- `skipped`：目标已稳定或没有目标，不启动动画。
- `skipReason`：只在 skipped 或异常降级时出现，避免“已经稳定”和“相机不可用”被同一个 `skipped` 掩盖。

这样 renderer 不需要靠猜测 target 或 reduced motion 状态来决定是否追帧，也不会在接口改造时丢掉“上一次 spotlight 社区”这个现有行为。

`camera.animate()` 返回 promise；实现不能继续 `void` 掉后完全不处理。即使 Sigma 当前实现通常 resolve，项目自己的调用也要 `.catch(options.onFatalError)` 或等价处理，避免未来 Sigma 行为变化时异步错误静默丢失。

### Overlay controller 继续保持 #75 边界

`sigma-overlay-dom.ts` 已经具备两条路径：

- `reposition()`：精确重排，清除 transform，刷新基线。
- `repositionForCameraAnimation()`：基于已有精确基线写 overlay root transform。

#86 不应该重写这层。它只需要确保这两条路径在正确时间被调用，并确保动画快路径读取的是当前动画帧的相机状态。现有 `sigmaWorldPointToScreenPoint()` 默认调用 `sigma.graphToViewport(point)`，Sigma 在没有 override 时可能复用上一轮 render 的矩阵；后续实现需要扩展一条仅供动画 anchor 使用的投影路径，让动画帧可以显式传入当前 camera state。不要把这个 override 全局扩散到普通 hit testing、spotlight target 计算、云团布局和标签精确重排路径。

### 打断与边界规则

以下入口必须让 driver 停止或失效，并确保最终精确校准：

- **wheel / 触控板**：即时 `setState()`，不进入动画快路径；若之前有动画残留，继续 suppress 快路径直到相机稳定，并做精确重排。Sigma 没有公开 cancel animate 能力，本设计不能承诺真正取消旧动画，只能用 generation / suppress 让旧动画帧不再写旧 overlay。
- **resetView**：本次不新增 reset 动画；保持当前即时 `setState()`，精确重排，并让旧动画帧失效。
- **zoomIn / zoomOut**：如果走动画，启动 driver。
- **spotlight**：如果启动相机动画，启动 driver。
- **节点拖拽**：拖拽中禁用动画快路径，节点世界坐标变化必须精确 reposition。
- **resize**：失效基线，刷新 Sigma 后精确 reposition。
- **adapterData update / rebuild**：失效基线，rebuild 后精确 reposition。
- **destroy**：取消 rAF、解绑 camera 事件、清空 overlay，不允许晚到 tick 再写 DOM。
- **reduced motion**：不启动动画帧，直接 setState 后精确 reposition。

## 测试设计

### 单元测试

需要覆盖：

- renderer 不再绑定 `cameraUpdated`。
- camera `"updated"` 事件能触发 overlay refresh。
- 程序化 `camera.animate()` 后，即使没有手动 `sigma.emit("afterRender")`，driver 也会在 rAF tick 中调用动画快路径。
- 动画快路径投影使用当前 camera state；测试要能区分“相机状态变了但 Sigma render 矩阵未刷新”的情况。
- `sigma-global-renderer.test.ts` 的 `FakeCamera` / `FakeSigma` 需要随本次一起升级，能模拟真实 Sigma 的逐帧动画、camera `"updated"` 事件和未刷新 render 矩阵；不能继续只用“animate 立刻 setState 到终点”的假动画证明 #86。
- 动画结束后执行精确 `reposition()`，清除 overlay transform。
- destroy 后晚到 rAF 不写 overlay。
- wheel / reset / resize / drag / update 打断后不会继续使用旧基线。
- reduced motion 下不启动动画帧，但最终位置正确。

### 模块行为测试

保留并扩展现有 `sigma-global-renderer.test.ts`：

- spotlight animation：从项目入口触发，而不是直接手动 emit afterRender。
- zoom button animation：复用同一 driver。
- fake runtime：动画中间帧必须可控推进，camera `"updated"` listener 必须真实触发，`graphToViewport` 默认路径必须能暴露旧矩阵问题。
- settle watcher：动画结束没有 afterRender 也能归位。
- active drag：动画快路径禁用。
- data update / rebuild：基线失效后不会用旧 transform。

`sigma-overlay-dom.test.ts` 继续保护 #75 的 overlay 快路径本身，不需要承担 frame driver 行为。

### 浏览器验证

`tests/browser/graph-sigma-global-production.ts` 的 `spotlight_animation` 需要补中段断言：

- 点击社区后，在动画窗口中采样 overlay root transform。
- 采样期间 transform 至少出现一次非空。
- 选中社区 region 的 `left/top` 在动画中发生可测变化；这个变化来自 overlay root transform，是视觉跟随验证，不是 region 自身 layout 重算验证。
- 测试目标社区必须离当前相机状态足够远，或者先 reset 到全图后选择一个会产生可测相机位移的社区；否则“region 没动”可能只是目标已经稳定。
- 动画结束后 transform 清空。
- 最终社区仍选中，region 尺寸有效。
- fps / p95 继续作为性能指标，但不能替代跟随正确性。
- 建议把 spotlight 专用采样从通用 `sampleAnimationFrames()` 中拆出或包一层：返回帧率、p95、transform 样本、region 位移距离、最终 settle 状态，避免只记录性能指标。
- 失败分类要能直接指出问题：`overlay_transform_missing`、`region_not_moving`、`overlay_transform_not_cleared`、`region_missing`、`region_not_selected`。这些失败必须让 record 的 `pass` 为 false，并进入现有结果校验脚本的失败聚合，不能只写进 detail 文本。

这样才能避免“overlay 没动但 fps 很高”的假阳性。

## 验收标准

- 代码中不再依赖 `cameraUpdated`。
- 项目发起 spotlight 相机动画后，即使不依赖 `afterRender`，overlay 也会在动画期间跟随。
- overlay 动画帧计算不能依赖旧 render 矩阵；必须使用当前 camera state 投影。
- 动画结束后 overlay transform 被清空，最终位置稳定。
- wheel、drag、resize、reset、destroy、reduced motion 都有测试覆盖。
- 浏览器生产脚本能证明 spotlight 动画中段 overlay 发生跟随，而不只是最终对齐。
- 不改变社区点击、抽屉、进入社区、路由等现有行为。

## 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| rAF driver 与 Sigma render 事件重复触发 | 同一帧多次写 overlay | camera `"updated"` / `afterRender` 只请求下一帧刷新，写入由 driver 合并 |
| 相机动画被 wheel / setState 插入打断 | overlay 使用旧基线 | 复用 suppress + baseline invalidate，稳定后精确重排 |
| destroy 后晚到 tick | 写已销毁 DOM | driver 每次 tick 检查 destroyed，并在 destroy 中 cancel |
| 新旧 rAF 循环并存 | 两套循环同时写 overlay，状态难推理 | 升级现有 settle watcher，不新增并行循环 |
| 只修事件名仍有盲区 | spotlight 行为继续依赖 Sigma 内部事件 | 项目发起 animate 时主动启动 driver |
| 浏览器测试只看最终状态 | fps 假阳性 | 增加中段 transform 和 region 位移断言 |

## 实施顺序建议

1. 先升级 `FakeCamera` / `FakeSigma`，让测试能推进中间帧、触发 camera `"updated"`，并模拟旧 render 矩阵。
2. 先补失败测试：证明没有 `afterRender` 时 spotlight 动画期间 overlay 不会被项目主动驱动；同时补“camera state 已变但旧矩阵未变”的投影失败测试。
3. 扩展 camera-like 类型，允许绑定 camera `"updated"`。
4. 升级现有 settle watcher 为动画帧循环，并让 spotlight / zoom button 动画启动它。
5. 替换错误的 `cameraUpdated` 绑定，保留 `afterRender` 辅助刷新。
6. 补齐打断路径回归测试。
7. 加强浏览器 `spotlight_animation` 中段验证和结果校验脚本。
8. 跑 graph-engine 单元测试和 Sigma 浏览器生产脚本。

## 工程审查补充

### 事实核验结果

远端 #86 的现象描述成立：spotlight 动画期间 overlay 跟随没有项目级保证，当前测试也可能把“不跟随但很流畅”误判为通过。

但 #86 里“Sigma 3.0.3 的 `camera.animate` 不触发 camera `updated`”不能作为修复前提。源码显示 `animate()` 的 rAF tick 会调用 `setState()`，`setState()` 会 emit camera `"updated"`，Sigma 主类也监听 camera `"updated"` 来排渲染。本设计的修复基线应表述为：

```text
当前项目绑定错了事件名，并且缺少项目自己的动画帧合同。
Sigma 事件可以辅助刷新，但项目发起 camera.animate 后必须自己保证 overlay 在每个可用动画帧跟随。
```

### 已存在能力

| 已存在能力 | 当前状态 | 本设计如何复用 |
|---|---|---|
| `refreshOverlayForCameraFrame()` | 已能在 camera animated 时走快路径，稳定后精确重排 | 保留为动画刷新入口 |
| `scheduleOverlayAnimationSettleCheck()` | 已用 rAF 等动画结束，但动画中不写 overlay | 升级成完整动画帧循环 |
| `overlayAnimationSettleFrame` | 已有单一 rAF 槽位和 cancel | 继续复用，避免两套 rAF 并存 |
| `repositionForCameraAnimation()` | 已能用 root transform 做轻量跟随 | 扩展为可使用当前 camera state 投影 |
| `reposition()` | 已能清空 transform 并精确重排 | 继续作为 settle、打断、resize、destroy 后的最终校准 |
| 浏览器 `communityRegionState()` | 已能返回 transform 与 region rect | 扩展采样逻辑，用它验证中段跟随 |
| #75 单元测试 | 覆盖了 afterRender 驱动、settle、打断、destroy 等路径 | 改成不依赖手动 afterRender 的真实动画驱动测试 |

### 测试覆盖图

```text
CODE PATHS                                                   USER FLOWS
[+] sigma-global-renderer.ts                                 [+] Spotlight 选择社区
  ├── [GAP] camera.on("updated") 绑定/解绑                     ├── [GAP][→E2E] 点击社区后中段 overlay transform 非空
  ├── [GAP] 项目调用 camera.animate 后主动启动帧循环             ├── [GAP][→E2E] 选中社区视觉位置在动画中移动
  ├── [GAP] rAF tick 中使用当前 camera state 投影                ├── [★★] 最终社区仍选中、transform 清空
  ├── [★★] afterRender 辅助刷新                                 └── [GAP] 无 afterRender 时仍能跟随
  ├── [★★] settle 后精确 reposition
  ├── [★★] wheel/reset/resize/update/drag 打断
  └── [★★] destroy cancel 晚到 rAF

[+] sigma-global-camera.ts                                    [+] Zoom button
  ├── [GAP] 返回 { communityId, movement }                      ├── [GAP] zoomIn/zoomOut 复用同一帧循环
  ├── [★★] reduced motion 走 setState                           └── [★★] wheel 立即覆盖并精确重排
  └── [★★] settled target 不重复动画

[+] sigma-overlay-dom.ts                                      [+] Reduced motion / 无 animate
  ├── [GAP] 快路径投影可传当前 camera state                      ├── [GAP] 不启动帧循环
  ├── [★★★] transform 推导和清空                                 └── [GAP] 最终位置正确
  └── [★★] baseline 失效后回到精确重排

[+] FakeCamera / FakeSigma                                    [+] 维护者调试体验
  ├── [GAP] 逐帧动画，不再 animate 立刻到终点                     ├── [GAP] 测试失败能区分事件缺失、投影旧矩阵、未跟随
  ├── [GAP] setState 触发 camera "updated"                       └── [GAP] 失败分类不再只报 spotlight_animation_settle_failed
  └── [GAP] graphToViewport 默认路径可暴露旧 render 矩阵

COVERAGE TARGET: P1 GAP 必须在本次实现内补测试，不作为 follow-up；wheel/reset/resize/update/drag/destroy/reduced motion 属于被触达路径的回归保护，不扩大成 renderer 长期重整。
Legend: ★★★ 行为 + 边界 + 失败路径；★★ 已有行为测试但需要随新合同调整；GAP 待补。
```

### 失败模式

| 新路径 | 真实失败方式 | 测试要求 | 用户表现 |
|---|---|---|---|
| camera `"updated"` 绑定 | 绑在 sigma renderer 上而不是 camera 上 | 断言不再绑定 `cameraUpdated`，并断言 camera `"updated"` 会触发刷新 | overlay 停在旧位置或最终跳动 |
| 动画帧循环 | 新旧 rAF 同时写 overlay | 单测断言只使用一个 rAF 槽位，destroy 后晚到 tick 不写 DOM | 动画抖动、偶发位置回跳 |
| 当前 camera state 投影 | rAF tick 运行，但投影仍读旧 render 矩阵 | FakeSigma 模拟“camera 变了但 render 矩阵没变” | overlay 看似被调用，实际不动 |
| spotlight helper 返回值 | 只返回 movement，丢掉 communityId | 单测覆盖 selected community 仍被记录 | 社区高亮状态错误或重复动画 |
| browser 中段验证 | 只看 fps 与最终 settle | `overlay_transform_missing` / `region_not_moving` 失败分类 | CI 绿但用户看到 overlay 不跟随 |
| 打断路径 | wheel、drag、resize、update 后继续用旧 baseline | 单测覆盖每个打断入口后 transform 清空并最终重排 | overlay 和节点命中框错位 |
| 重叠动画 | 第二个 spotlight / zoom 到来，旧动画晚到 tick 覆盖新状态 | generation / owner token 单测 | overlay 短暂跳回旧位置 |
| animate 异步失败 | `camera.animate()` promise reject 未进入 `onFatalError` | promise reject fake 单测 | 控制台或 CI 静默错过真实失败 |

当前设计已把这些失败方式都纳入测试要求；不再留下“无测试、无处理、用户也看不到原因”的 critical gap。

### 性能约束

- 动画中只允许做 anchor 投影和 overlay root transform，不重算社区云团几何，不 rebuild overlay DOM。
- 每个 renderer 同时只允许一个相机动画 rAF 槽位；camera `"updated"` 和 `afterRender` 只能作为辅助刷新信号，不能再各自启动独立循环。
- `will-change: transform` 只在动画中设置，settle 后必须清空。
- current camera state 投影会比复用旧矩阵多一次矩阵计算，但只针对少量 anchor 点；这是为正确性付出的可控成本，不能退回旧矩阵。
- 浏览器验收继续保留 fps / p95 阈值，但性能通过不能覆盖跟随失败。
- camera `"updated"`、`afterRender` 和 owned rAF 同时到来时，必须合并成同一浏览器帧内最多一次 overlay 写入。

### 不在本次范围

| 不做 | 原因 |
|---|---|
| #70 节点标签截断 | 同属 Sigma 视觉层，但不是相机帧合同问题 |
| #80 长期 renderer 重整 | 会扩大改动面；本次只补合同和测试 |
| #68 云层签名增量重算 | 性能方向相关，但不影响相机动画帧保证 |
| #65 键盘和无障碍访问 | 产品能力相关，但不是本 bug 根因 |
| #72 红色固定点视觉 | 另一个视觉设计问题，不能混入本修复 |
| 升级 Sigma | 当前源码已能支持正确事件；先修项目边界 |
| 重写 overlay transform 算法 | #75 的快路径方向仍成立，本次只补驱动与投影输入 |
| 改抽屉、路由、社区点击语义 | 它们是现有产品行为，#86 不应改变 |

### 联动 issue 判断

本次应联动 #75：#86 是 #75 的基建收口，必须把 #75 的快路径从“afterRender 刚好触发”升级为“项目发起相机动画后必然逐帧调用”。

本次只引用 #79 的边界原则，不重新打开 #79；#79 已关闭，设计只需要继续遵守 Sigma 全局路线子系统边界。

本次不联动 #70、#80、#68、#65、#72。它们可以后续排期，但混入会让这次验收从“动画帧合同是否可靠”扩散成多个视觉/架构主题。

### 并行策略

Sequential implementation, no parallelization opportunity.

原因：核心改动都集中在 `packages/graph-engine/src/render/` 的同一条 Sigma 相机/overlay 路径，测试和浏览器脚本又依赖同一个合同。并行拆 worktree 容易互相覆盖接口和假运行时，建议按实施顺序串行做。

### Implementation Tasks

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — Fake runtime — 让 FakeCamera/FakeSigma 模拟逐帧动画、camera `"updated"` 和旧矩阵。
  - Surfaced by: Test — 当前 fake animate 立刻到终点，无法证明 #86。
  - Files: `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: 不手动 emit `afterRender` 时，测试能先失败。
- [ ] **T2 (P1, human: ~1.5h / CC: ~15min)** — Overlay projection — 动画 anchor 投影使用当前 camera state，而不是旧 render 矩阵。
  - Surfaced by: Architecture/Test — tick 运行但投影旧矩阵会造成假修复。
  - Files: `packages/graph-engine/src/render/sigma-global-types.ts`, `packages/graph-engine/src/render/sigma-coordinates.ts`, `packages/graph-engine/src/render/sigma-overlay-dom.ts`, `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  - Verify: 新增“camera state 已变但 render 矩阵未刷新”的单测；普通 hit testing 和精确 reposition 不走新 override。
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — Sigma renderer — 升级现有 settle watcher 为项目 owned 的相机动画帧循环。
  - Surfaced by: Architecture — 不新增第二套 rAF，复用现有 `overlayAnimationSettleFrame`，并加入 generation / owner token 与同帧合并。
  - Files: `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: `npm run test -w @llm-wiki/graph-engine`
- [ ] **T4 (P2, human: ~1h / CC: ~10min)** — Camera helper contract — 返回 `{ communityId, movement, skipReason }`，保留 spotlight 社区状态。
  - Surfaced by: Code Quality — 只返回移动状态会丢掉现有 `cameraSpotlightCommunityId` 行为；单个 `skipped` 也会掩盖相机不可用等坏状态。
  - Files: `packages/graph-engine/src/render/sigma-global-camera.ts`, `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-global-camera.test.ts`
  - Verify: spotlight 社区记录、reduced motion、settled target、no camera、animate reject 五类单测。
- [ ] **T5 (P1, human: ~1.5h / CC: ~15min)** — Browser production test — spotlight 动画中段验证 transform 和视觉位移。
  - Surfaced by: Test — fps 不能证明 overlay 跟随。
  - Files: `tests/browser/graph-sigma-global-production.ts`, `tests/browser/validate-graph-trial-result.mjs`
  - Verify: `GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense node --import tsx tests/browser/graph-sigma-global-production.ts`

## 后续文档关系

本设计不替代 #75 文档。#75 仍描述 overlay 快路径“怎么低成本移动”；本设计补的是 #75 之上的“谁来保证动画期间每个可用动画帧调用它”。

若本设计实现完成，需要在 issue #86 中回写核验结论：原 issue 对错误事件名和浏览器验收缺口的判断成立，但“Sigma animate 必然不触发 updated”不应作为修复前提。最终修复点应表述为：项目拥有自己的相机动画帧合同，不再把 overlay 跟随寄托在隐式 Sigma renderer 事件上。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not needed for this infra bug design |
| Codex Review | outside voice | Independent 2nd opinion | 1 | CLEAR | 14 concerns reviewed; ordering, projection isolation, owner token, async errors, browser preconditions folded into design |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 5 implementation tasks, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Not a visual redesign |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not needed for this design-only change |

- **CODEX:** Outside voice agreed the hard risks were fake-green tests, stale projection, overlapping animations, async animate errors, and flaky browser mid-animation checks. Those are now explicit in the design.
- **CROSS-MODEL:** Outside voice argued the plan risked over-scoping. Final design keeps #86 focused by making P1 gaps mandatory and treating wheel/reset/resize/update/drag/destroy/reduced motion as touched-path regression protection, not renderer-wide hardening.
- **VERDICT:** ENG CLEARED — ready to implement #86 from this design.

NO UNRESOLVED DECISIONS
