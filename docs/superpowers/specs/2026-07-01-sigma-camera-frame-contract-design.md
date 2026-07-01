# Sigma 相机动画帧合同设计

日期：2026-07-01
状态：已按用户确认的方案成稿，等待 review
关联 issue：#86
相关背景：#75、#79、PR #87

## 背景

#75 已经在主线实现了 Sigma overlay 相机动画快路径：动画期间用 overlay root transform 轻量跟随，动画结束后再精确 `reposition()` 校准。这个方向仍然正确，但 #86 暴露出另一个更底层的问题：这条快路径目前依赖 Sigma renderer 事件来驱动，项目自己没有定义“相机动画期间每一帧应该发生什么”的合同。

当前主线里，`sigma-global-renderer.ts` 仍然绑定了 `sigma.on("cameraUpdated", ...)`。但 Sigma 3.0.3 的相机事件是 camera 自身的 `"updated"`，不是 Sigma renderer 上的 `"cameraUpdated"`。因此，这个 listener 事实上不是可靠的相机事件来源。

当前 overlay 能在部分路径中移动，主要依赖 `afterRender`。这让行为变成“Sigma 刚好渲染时 overlay 跟着动”，而不是“项目发起相机动画后 overlay 必须跟着每一帧动”。对于图谱基建来说，这个边界太隐式。

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

- 明确项目自己的相机动画帧合同：项目发起相机动画后，overlay 必须在动画期间逐帧轻量跟随，动画结束后精确归位。
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

### 新增相机动画帧驱动

在 Sigma 全局 renderer 内部新增一个小的 frame driver，作为 runtime shell 的私有调度单元。它负责管理“当前是否有项目发起的相机动画需要驱动 overlay”。

建议职责：

- `startCameraFrameTracking(reason)`：项目调用 `camera.animate()` 后启动。
- `tick()`：每个 rAF 检查相机状态。
- 动画中调用 `overlayDomController.repositionForCameraAnimation()`。
- 动画停止后调用 `overlayDomController.reposition()`，清除临时 transform 并刷新精确基线。
- `stop/invalidate`：destroy、resize、drag、数据更新等边界停止或失效。
- 所有异常继续走 `options.onFatalError`。

这个 driver 可以先作为 `sigma-global-renderer.ts` 内部 helper，若实现后主文件明显变复杂，再拆成 `sigma-camera-frame-driver.ts`。是否拆文件由实现时的复杂度决定，但边界必须清楚：它只做帧调度。

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

Sigma 的 `"updated"` / `afterRender` 到来时可以复用同一个 `refreshOverlayForCameraFrame()`，但即使事件没有到，driver 也要继续 tick。

### 相机模块接口

`sigma-global-camera.ts` 继续负责计算目标和调用相机移动，但需要让 renderer 知道是否真的启动了动画。

建议把相机移动结果表达清楚，例如：

```text
animated | immediate | skipped
```

语义：

- `animated`：调用了 `camera.animate()`，renderer 必须启动 frame driver。
- `immediate`：reduced motion 或缺少 animate，已 `setState()`，renderer 必须精确 `reposition()`。
- `skipped`：目标已稳定或没有目标，不启动动画。

这样 renderer 不需要靠猜测 target 或 reduced motion 状态来决定是否追帧。

### Overlay controller 继续保持 #75 边界

`sigma-overlay-dom.ts` 已经具备两条路径：

- `reposition()`：精确重排，清除 transform，刷新基线。
- `repositionForCameraAnimation()`：基于已有精确基线写 overlay root transform。

#86 不应该重写这层。它只需要确保这两条路径在正确时间被调用。

### 打断与边界规则

以下入口必须让 driver 停止或失效，并确保最终精确校准：

- **wheel / 触控板**：即时 `setState()`，不进入动画快路径；若之前有动画残留，继续 suppress 快路径直到相机稳定，并做精确重排。
- **resetView**：如果走动画，启动 driver；如果即时 setState，精确重排。
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
- 动画结束后执行精确 `reposition()`，清除 overlay transform。
- destroy 后晚到 rAF 不写 overlay。
- wheel / reset / resize / drag / update 打断后不会继续使用旧基线。
- reduced motion 下不启动动画帧，但最终位置正确。

### 模块行为测试

保留并扩展现有 `sigma-global-renderer.test.ts`：

- spotlight animation：从项目入口触发，而不是直接手动 emit afterRender。
- zoom button animation：复用同一 driver。
- settle watcher：动画结束没有 afterRender 也能归位。
- active drag：动画快路径禁用。
- data update / rebuild：基线失效后不会用旧 transform。

`sigma-overlay-dom.test.ts` 继续保护 #75 的 overlay 快路径本身，不需要承担 frame driver 行为。

### 浏览器验证

`tests/browser/graph-sigma-global-production.ts` 的 `spotlight_animation` 需要补中段断言：

- 点击社区后，在动画窗口中采样 overlay root transform。
- 采样期间 transform 至少出现一次非空。
- 选中社区 region 的 `left/top` 在动画中发生可测变化。
- 动画结束后 transform 清空。
- 最终社区仍选中，region 尺寸有效。
- fps / p95 继续作为性能指标，但不能替代跟随正确性。

这样才能避免“overlay 没动但 fps 很高”的假阳性。

## 验收标准

- 代码中不再依赖 `cameraUpdated`。
- 项目发起 spotlight 相机动画后，即使不依赖 `afterRender`，overlay 也会在动画期间跟随。
- 动画结束后 overlay transform 被清空，最终位置稳定。
- wheel、drag、resize、reset、destroy、reduced motion 都有测试覆盖。
- 浏览器生产脚本能证明 spotlight 动画中段 overlay 发生跟随，而不只是最终对齐。
- 不改变社区点击、抽屉、进入社区、路由等现有行为。

## 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| rAF driver 与 Sigma render 事件重复触发 | 多做一次 overlay transform | `refreshOverlayForCameraFrame()` 保持幂等；动画中 transform 写入成本低 |
| 相机动画被 wheel / setState 插入打断 | overlay 使用旧基线 | 复用 suppress + baseline invalidate，稳定后精确重排 |
| destroy 后晚到 tick | 写已销毁 DOM | driver 每帧检查 destroyed，并在 destroy 中 cancel |
| 只修事件名仍有盲区 | spotlight 行为继续依赖 Sigma 内部事件 | 项目发起 animate 时主动启动 driver |
| 浏览器测试只看最终状态 | fps 假阳性 | 增加中段 transform 和 region 位移断言 |

## 实施顺序建议

1. 先补失败测试：证明没有 `afterRender` 时 spotlight 动画期间 overlay 不会被项目主动驱动。
2. 扩展 camera-like 类型，允许绑定 camera `"updated"`。
3. 引入 frame driver，并让 spotlight / zoom button 动画启动它。
4. 替换错误的 `cameraUpdated` 绑定，保留 `afterRender` 辅助刷新。
5. 补齐打断路径测试。
6. 加强浏览器 `spotlight_animation` 中段验证。
7. 跑 graph-engine 单元测试和 Sigma 浏览器生产脚本。

## 后续文档关系

本设计不替代 #75 文档。#75 仍描述 overlay 快路径“怎么低成本移动”；本设计补的是 #75 之上的“谁来保证动画期间每一帧调用它”。

若本设计实现完成，需要在 issue #86 中回写核验结论：原 issue 对错误事件名和浏览器验收缺口的判断成立，但“Sigma animate 必然不触发 updated”不应作为修复前提。最终修复点应表述为：项目拥有自己的相机动画帧合同，不再把 overlay 跟随寄托在隐式 Sigma renderer 事件上。
