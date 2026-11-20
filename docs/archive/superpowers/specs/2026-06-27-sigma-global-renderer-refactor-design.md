# Sigma Global Renderer 中深度拆分设计

日期：2026-06-27
状态：已自检，准备进入实施计划
关联 issue：#77
后续方向：#79、#80

## 背景

`packages/graph-engine/src/render/sigma-global-renderer.ts` 已经从 PR #66 结束时的约 1065 行增长到 1570 行以上。增长主要来自后续全局 Sigma 功能：

- PR #76：全局社区高亮，引入相机读取、回全图、社区高亮构图动画。
- PR #78 / #73：平滑 wheel 缩放与左下缩放按钮，引入 wheel 接管、缩放锚点、相机边界。
- PR #67：覆盖层 rebuild / reposition 双路径，改善相机移动时的 DOM 重建问题。

#77 原建议是继续抽 `sigma-camera.ts`、`sigma-wheel-zoom.ts`、`sigma-overlay-dom.ts`。本设计在这个方向上加深一层：除了相机、缩放、覆盖层，还要把 Graphology 属性映射和 hit projector 拆出去。原因是它们未来也会继续承载标签、边样式、多选、命中优先级等功能，如果继续留在主文件，会成为下一轮膨胀源头。

本次不是大架构重整。更大的“Sigma 全局路线子系统边界文档化”已记录为 #79；更长期的 facade / gesture / controller / renderer 边界收口已记录为 #80。

## 目标

本次目标是把 `sigma-global-renderer.ts` 从“大杂烩”收束成 Sigma 全局图的装配入口。

完成后它仍负责：

- Sigma runtime 懒加载入口。
- `createSigmaGlobalRenderer` 生命周期。
- 对外 `SigmaGlobalRenderer` 接口。
- update / destroy / reset / zoom 的流程编排。
- 当前活状态串联，例如 `adapterData`、`graph`、`pins`、drag session、destroy guard、generation guard。
- 统一错误上报。

它不再长期承载：

- 相机算法和社区高亮构图计算。
- wheel payload 解析与 wheel 监听细节。
- overlay DOM 元素表、rebuild / reposition 细节。
- Graphology 节点/边/社区/聚合属性映射。
- hit projector 和 Sigma event payload 解析。

## 非目标

> 2026-07-05 补记：下面“不把社区阅读视图迁移到 Sigma”只约束本次渲染器拆分任务；后续已被 `2026-07-04-sigma-community-reading-mode-design.md` 和 ADR-26 覆盖。当前结论是社区阅读主路径已经迁到 Sigma，DOM/SVG 只保留为回退或对照。

- 不改变用户可见行为。
- 不改变 workbench / facade 调用的公开入口。
- 不重写 facade、controller、gestures 或图谱七层架构。
- 不新增 npm 依赖。
- 不重选渲染技术。
- 不把社区阅读视图迁移到 Sigma。
- 不顺手修复 #70、#74、#75、#71、#72；这些后续按各自 issue 处理。

## 模块拆分

### 1. `sigma-global-camera.ts`

负责 Sigma 全局相机相关逻辑：

- 读取和恢复相机状态。
- 回全图相机目标。
- 社区高亮相机构图目标。
- 相机移动执行。
- `prefers-reduced-motion` 降级。
- graph point 到 camera point 的投影兜底。

后续 #75 的相机动画性能优化，优先落在这个模块。

### 2. `sigma-wheel-zoom.ts`

负责把 Sigma wheel 输入变成项目自己的缩放动作：

- wheel payload 解析。
- 缺失 pointer 坐标时的视口中心 fallback。
- 缩放控件区域防误触。
- mouse captor wheel 监听绑定与解绑。
- 调用传入的 `onZoomAtPoint` 回调。

现有 `sigma-zoom.ts` 继续只保存纯缩放数学，例如 wheel delta 标准化、ratio 计算、边界常量、按钮步长。`sigma-wheel-zoom.ts` 不重复这些数学，只负责事件接管。

### 3. `sigma-overlay-dom.ts`

负责 Sigma 覆盖层 DOM controller：

- 管理社区云团 region、节点 hit target、社区标签三类元素表。
- `rebuild()`：按数据更新元素结构、dataset、文本、颜色和监听。
- `reposition()`：只更新位置和云团几何，不创建 DOM、不 replace children、不重绑监听。
- 节点 hit target 创建。
- overlay 元素 prune。
- `destroy()`：清理内部元素表。

它可以持有 overlay 元素表，因为这是它自己的 DOM 生命周期状态；但不持有业务真相，不写 graph，不写 pins，不直接调用 host callbacks。

现有 `sigma-overlay-svg.ts` 保持为更底层的 SVG / DOM 工厂；`sigma-overlay-dom.ts` 负责“什么时候创建、什么时候移动、什么时候销毁”。

### 4. `sigma-graphology-model.ts`

负责把 `GraphRendererAdapterData` 转成 Graphology 渲染模型：

- `buildSigmaGlobalGraphologyGraph`
- Graphology node / edge / community / aggregation attributes
- edge style
- selected / spotlight community helper
- same-structure patch 判断
- patch graph attributes
- node size / node color / rgba helper 等渲染模型函数

这个模块不碰 DOM、不碰 Sigma 实例、不知道抽屉、不处理事件。后续标签截断、边样式、高亮规则等应优先落在这里。

### 5. `sigma-hit-projector.ts`

负责把渲染命中翻译成图谱语义对象：

- `createSigmaGlobalHitProjector`
- Sigma node id payload 解析
- Sigma screen point payload 解析
- spatial index input from adapter data
- rendered object 到 `GraphGestureTarget` 的投射
- 空白 / node / community wash / aggregation 等命中优先级

它只做翻译，不拥有选择语义。主文件收到 hit target 后再调用 `onHitTarget`。

### 6. `sigma-events.ts`

这是轻量支撑文件，不是新的业务子系统。它只放多个模块都会用到的 Sigma event payload 防御工具，避免 wheel、hit、drag 之间互相 import：

- `preventSigmaDefault`
- Sigma pointer event payload 类型
- 其他无业务语义、无状态、仅用于解包事件 payload 的工具

它不做 hit 判断，不做 wheel 缩放，不做选择语义。

### 7. 继续沿用的既有 helper

- `sigma-zoom.ts`：纯缩放数学。
- `sigma-global-drag.ts`：拖拽会话、overlay pointer/mouse 拖拽绑定、拖拽后的 adapter data 更新。
- `sigma-coordinates.ts`：Sigma 与 fallback 坐标转换。
- `community-cloud-geometry.ts`：云团几何与 hull。
- `sigma-overlay-svg.ts`：SVG / DOM 基础工厂。

## 模块通信

### 主文件持有活状态

`sigma-global-renderer.ts` 继续持有高频变化的状态：

- 当前 `adapterData`
- 当前 Graphology `graph`
- 当前 theme / edge style
- 当前 pins
- 当前 drag session
- destroyed flag
- generation guard
- 当前 overlay controller / wheel controller cleanup

子模块不偷偷复制这些业务状态。需要最新数据时，通过函数参数或 getter 读取。

### 纯模型模块无副作用

`sigma-graphology-model.ts` 输入 adapter data、theme、edge style，输出 graph 或 patch。它不关心 DOM 与 Sigma lifecycle。

### 相机模块只处理相机

`sigma-global-camera.ts` 输入 Sigma 实例、adapter data、root/window，输出或应用相机状态。它不决定哪个社区被选中；社区 id 由主文件从 adapter data 推导后传入。

### wheel 模块只管事件接管

`sigma-wheel-zoom.ts` 创建时传入：

- Sigma-like 实例。
- root element。
- `onZoomAtPoint(point, target, animated)` 回调。
- fatal error 回调。

它负责监听和解绑，不直接保存业务选择，不直接更新 overlay。

### overlay 模块只管覆盖层 DOM

`sigma-overlay-dom.ts` 创建时传入：

- overlay root。
- filter id。
- 获取当前 adapter data / cloud basis / Sigma / options 的函数。
- hit 回调。
- drag begin/move/end/cancel 回调。
- 点击抑制回调。

它暴露：

- `rebuild()`
- `reposition()`
- `destroy()`

它内部可以复用元素表，但不写 graph / pins / adapter data。

### 避免运行时循环依赖

允许 `import type` 引用，但要避免 helper 运行时反向 import 主文件。若 `sigma-global-renderer.ts` 里的 Sigma-like 类型导致 helper 必须反向依赖主文件，则把这些类型抽到轻量类型文件，例如 `sigma-global-types.ts`。

类型和事件工具的约束：

- `sigma-global-types.ts` 只放类型，不放运行时代码。
- `sigma-events.ts` 只放无状态事件解包工具，不 import camera / wheel / overlay / graphology / hit projector。
- 新 helper 默认不从 `render/index.ts` 对外导出；测试可以从 `src/render/...` 直接 import。
- workbench 和 facade 仍然只能通过现有 `createSigmaGlobalRenderer` 入口使用 Sigma 全局渲染器。

## 实施顺序

实现开始前先从当前主线创建代码分支，建议命名为 `codex/refactor-sigma-global-renderer-boundaries`。本文档提交本身是纯文档提交，不代表可以在 `main` 上继续改代码。

### Step 1：抽纯模型

新建：

- `sigma-graphology-model.ts`
- `sigma-hit-projector.ts`
- 必要时新建 `sigma-global-types.ts` 和 `sigma-events.ts`

把 Graphology 构建、属性映射、edge style、hit projector、payload 解析先搬出去。这个阶段最接近纯搬迁，风险最低。

验证：

- `node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts`
- `npm run typecheck -w @llm-wiki/graph-engine`

### Step 2：抽相机与 wheel controller

新建：

- `sigma-global-camera.ts`
- `sigma-wheel-zoom.ts`

保留现有缩放手感和社区高亮相机行为。`sigma-zoom.ts` 继续保存纯数学。

验证重点：

- wheel 连续缩放仍按 deltaY 工作。
- 缩放控件区域不误触。
- `zoomIn` / `zoomOut` 仍按中心点缩放。
- 社区高亮相机动画仍按现状运行。
- 减少动态效果仍直接 setState。

### Step 3：抽 overlay controller

新建：

- `sigma-overlay-dom.ts`

把 rebuild / reposition、元素表、节点 hit target 创建和 prune 移出主文件。保留现有双路径不变量：

- rebuild 是元素生命周期唯一权威。
- reposition 只读结构，只更新位置和云团几何。
- 相机移动不 replace children、不 create element、不重绑监听。
- drag 过程继续由 Sigma refresh / afterRender 驱动 reposition。
- drag commit / cancel 继续通过 rebuild 刷新 dataset 和 pin 状态。

验证重点：

- camera update 不重建 overlay DOM。
- data update 复用可复用元素并 prune stale 元素。
- 点击社区云团仍触发社区 hit。
- 节点 hit target 点击仍触发 node hit。
- overlay 节点拖拽仍写入 pin。
- destroy 后清理内部引用。

### Step 4：收尾整理

- 清理临时重复 helper。
- 检查循环依赖。
- 检查主文件职责是否收束成生命周期编排。
- 更新 #77 评论，说明实际拆分边界与验证结果。
- 若全程纯重构且行为未变，不更新 README / CHANGELOG。
- 若实施过程中出现行为调整或公开能力变化，按仓库规则更新文档。

## 测试计划

### 每步局部验证

每个 step 完成后至少运行：

```bash
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

### 最终自动验证

最终必须运行：

```bash
npm run test -w @llm-wiki/graph-engine
npm run typecheck -w @llm-wiki/graph-engine
```

如实现过程中新增独立测试文件，推荐命名：

- `sigma-graphology-model.test.ts`
- `sigma-global-camera.test.ts`
- `sigma-wheel-zoom.test.ts`
- `sigma-overlay-dom.test.ts`

若某个模块继续依赖 fake Sigma runtime 或 fake DOM 基础设施，也可以暂时把测试留在 `sigma-global-renderer.test.ts`，但测试名称必须写清楚模块边界。

### 浏览器验证

因为这是全局图交互地基，最终还需要启动工作台实际验证：

- 打开全局图。
- wheel / trackpad 缩放不猛跳。
- 左下缩放按钮可用。
- 点击社区后仍停留全局图，社区高亮和抽屉同步。
- 回全图恢复普通全局构图。
- 节点拖拽后 pin 仍生效。
- 切换主题或更新选择时没有明显破坏。

若浏览器验证因端口、Chrome、环境等原因不能运行，最终汇报必须明确说明。

## 完成标准

本任务完成时必须同时满足：

- `sigma-global-renderer.ts` 主要保留生命周期和流程编排。
- 新增模块的责任单一、命名清楚、后续功能有明确落点。
- 新增 helper 没有运行时循环依赖。
- 新增 helper 没有扩大公开 API。
- 用户可见行为不变。
- graph-engine 全量测试通过。
- graph-engine 类型检查通过。
- 浏览器关键路径验证通过，或明确记录无法验证的环境原因。
- #77 可关闭，并有评论说明拆分内容与验证结果。

## 风险与应对

### 风险 1：跨文件循环依赖

应对：优先用 `import type`；必要时抽 `sigma-global-types.ts`。不让 helper 运行时反向依赖主文件。

### 风险 2：overlay controller 与拖拽耦合深

应对：overlay 放在第三步，前两步稳定后再动；沿用现有测试，新增针对 overlay 元素复用、点击、拖拽的边界测试。

### 风险 3：纯搬迁时误改行为

应对：每步小提交；每步跑局部测试和类型检查；最终跑全量测试和浏览器验证。

### 风险 4：主文件行数下降但边界仍不清

应对：完成标准不只看行数。主文件应读起来像装配入口；Graphology model、camera、wheel、overlay、hit projector 都要有清晰落点。

## 与后续 issue 的关系

- #77：本次实施目标。
- #79：在本次拆分后，进一步文档化 Sigma 全局路线的子系统边界和测试分层。
- #80：更长期的图谱渲染层重整，不阻塞本次任务。
- #75：后续相机动画性能优化，预计受益于 `sigma-global-camera.ts` 和 `sigma-overlay-dom.ts`。
- #74 / #71：多选与 shift 行为，后续应受益于更清楚的 hit projector / renderer 边界。
- #70：标签长度兜底，后续应优先落在 `sigma-graphology-model.ts` 或更专门的标签模块中。

## 自检结论

已按“方便后续写 plan”的标准复核：

- 范围清楚：本次只做 #77 的中深度拆分，不吞并 #79 / #80。
- 模块落点清楚：相机、wheel、overlay、Graphology model、hit projector 分工明确。
- 共享事件工具已单独收口，避免 wheel 与 hit projector 互相依赖。
- 实施顺序清楚：先纯模型，再相机和 wheel，最后 overlay，最后收尾。
- 验证门槛清楚：每步局部测试，最终 graph-engine 全量测试、类型检查和浏览器关键路径验证。
- 分支边界清楚：后续代码实现需要先开 `codex/` 分支。
