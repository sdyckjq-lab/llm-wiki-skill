# Sigma 全局路线子系统边界与测试分层设计

日期：2026-06-30
状态：已按用户确认的设计方向成稿，等待 review
关联 issue：#79
相关背景：#75、#77、PR #81、PR #82

## 背景

#77 / PR #81 已经完成 `sigma-global-renderer.ts` 的中深度拆分。当前主文件约 626 行，已经不再是 1566 行的大杂烩；相机、wheel 缩放、overlay DOM、Graphology 模型、hit projector、拖拽和共享类型都已有独立模块。

#79 不应再做一轮大拆文件。当前真正缺的是“路线边界”和“测试分层”没有被正式固化：后来者能看到一些文件名和测试，但还缺一份明确规则说明每个子系统负责什么、不能碰什么、行为该在哪一层测试。没有这层地基，后续 #75 这类性能优化或新的全局 Sigma 功能仍可能把逻辑塞回主文件，或者把抽屉、选择、外部回调等产品决策混进 Sigma 内部。

本设计的目标是把已经形成的代码事实正式文档化，并补上自动守卫，让 Sigma 全局路线后续继续演进时有清晰边界。

## 目标

本次 #79 要交付的是地基，不是新功能：

- 明确 Sigma 全局路线由哪些子系统组成。
- 明确每个子系统负责什么、不负责什么。
- 明确测试分层：纯逻辑、模块行为、主入口生命周期、边界守卫、浏览器回归分别保护什么。
- 加强自动边界守卫，防止未来改动破坏子系统边界。
- 收口测试里仍从主入口导入内部 helper 的旧口子。
- 修正产品文档里已过期的 spotlight 状态描述，避免文档和实现脱节。
- 为 #75 性能优化留下清晰落点，但不在 #79 内改性能行为。

## 非目标

- 不实现 #75 的相机动画性能优化。
- 不改变用户可见图谱行为。
- 不再次大拆 `sigma-global-renderer.ts`。
- 不改变 Sigma / Graphology 作为全局路线的选择。
- 不把社区阅读视图迁移到 Sigma。
- 不重写 facade、web 抽屉、选择模型或图谱路由。
- 不新增第三套图谱路线。

## 当前代码事实

当前 Sigma 全局路线已经形成以下模块：

- `sigma-global-renderer.ts`：Sigma 全局主入口，负责 lifecycle、update、destroy、reset、zoom、事件绑定、当前活状态串联和统一错误上报。
- `sigma-graphology-model.ts`：负责把 `GraphRendererAdapterData` 映射为 Graphology 渲染模型，并支持同结构 patch。
- `sigma-hit-projector.ts`：负责把 Sigma payload、overlay rendered object、screen point 翻译成 `GraphGestureTarget`。
- `sigma-global-camera.ts`：负责相机状态读取/恢复、回全图状态、社区 spotlight 构图和降级动画。
- `sigma-wheel-zoom.ts`：负责 Sigma mouse captor wheel 监听、payload 解析、缩放控件避让和销毁。
- `sigma-overlay-dom.ts`：负责社区云团、社区标签、节点 hit target 的 DOM 结构更新和位置更新。
- `sigma-global-drag.ts`：负责节点拖拽会话、document-level pointer/mouse 拖拽绑定和拖拽后的 adapter data 更新。
- `community-cloud-geometry.ts`：负责社区云团 hull、ellipse fallback、局部 polygon 点和签名。
- `sigma-overlay-svg.ts`：负责低层 SVG / DOM 元素工厂。
- `sigma-coordinates.ts`：负责 Sigma 与 fallback 的坐标转换。
- `sigma-zoom.ts`：负责纯缩放数学和比例边界。
- `sigma-global-types.ts`：共享 Sigma-like 类型和主入口选项类型，应保持 type-only。
- `sigma-events.ts`：共享无状态事件 payload 防御工具。

当前测试已经覆盖不少行为，但边界守卫还不够完整：

- 已有 `sigma-refactor-boundaries.test.ts` 防止 helper 反向 import 主入口，并防止 helper 进入 render barrel。
- 已有 `renderer-boundary.test.ts` 保护大层级边界，如 host callback、raw graph event、overlay DOM 不拥有选择等。
- 已有各模块直接测试，如 camera、wheel、overlay、hit projector、Graphology model。
- 仍存在 `sigma-global-renderer.test.ts` 从主入口导入内部 helper 的旧口子，这会弱化“主入口只是外层生命周期入口”的边界。

## 子系统边界

### Sigma runtime shell

对应文件：`sigma-global-renderer.ts`

负责：

- 加载 runtime 后创建 Sigma 实例。
- 创建和销毁 root / overlay root。
- 持有当前活状态：`adapterData`、Graphology graph、theme、edge style、pins、drag session、destroyed flag、generation guard、controller cleanup。
- 绑定 Sigma 生命周期事件，并把事件交给对应子系统处理。
- 串联 graphology model、hit projector、camera、wheel、overlay、drag。
- 统一捕获不可恢复错误并交给外层 route。
- 暴露 `createSigmaGlobalRenderer`、runtime boundary、主入口类型和稳定常量。

不负责：

- 不实现 Graphology 属性映射。
- 不实现 hit priority / spatial fallback 细节。
- 不实现 wheel payload 解析。
- 不实现 overlay DOM 元素表。
- 不决定抽屉内容。
- 不决定业务选择语义。
- 不对外转出口内部 helper。

### Graphology render model

对应文件：`sigma-graphology-model.ts`

负责：

- 从 `GraphRendererAdapterData` 构建 Graphology graph。
- 节点、边、社区、聚合属性映射。
- 选中社区 / spotlight 节点弱化规则。
- edge style 和语义强调。
- 同结构 patch 的资格判断与属性更新。

不负责：

- 不接触 DOM。
- 不接触 Sigma 实例。
- 不处理点击、滚轮、拖拽。
- 不知道抽屉、host callback 或路由。
- 不读取原始 `GraphData`。

### Hit projector

对应文件：`sigma-hit-projector.ts`

负责：

- 从 Sigma node payload、overlay rendered object、screen point 推出 `GraphGestureTarget`。
- 解析 additive / Shift 等事件上下文。
- 使用 spatial index 做 fallback 命中。
- 定义 node、edge、community wash、aggregation、blank 等命中翻译。

不负责：

- 不决定选中谁。
- 不打开抽屉。
- 不写 facade state。
- 不读写 pins。
- 不持有 DOM 元素。

### Camera / spotlight

对应文件：`sigma-global-camera.ts`

负责：

- 读取和恢复相机状态。
- 计算全图相机状态。
- 计算社区 spotlight 相机目标。
- 执行相机移动。
- 尊重 reduced motion。
- 在 Sigma 投影不可用时做安全 fallback。

不负责：

- 不决定当前选中的社区。
- 不改变 selection / focus。
- 不直接触发 overlay 重建。
- 不处理 #75 的 overlay 性能策略本身。

### Wheel zoom controller

对应文件：`sigma-wheel-zoom.ts`

负责：

- 接管 Sigma mouse captor wheel。
- 解析 wheel payload。
- 识别缩放控件区域并避免误触。
- 缺少指针坐标时用视口中心 fallback。
- 调用主入口传入的 zoom callback。
- destroy 后即使收到晚到事件也 no-op。

不负责：

- 不直接决定相机动画策略。
- 不处理选择、抽屉或社区。
- 不读取业务数据。
- 不维护 pins。

### Overlay DOM controller

对应文件：`sigma-overlay-dom.ts`

负责：

- 管理社区云团 region、社区标签、节点 hit target。
- `rebuild()` 更新元素结构、dataset、文本、颜色和监听。
- `reposition()` 更新位置和几何，不创建 DOM、不 replace children、不重绑监听。
- 触发 rendered object hit 回调。
- 绑定节点 hit target 的 pointer/mouse drag 入口。
- 清理 overlay 拖拽监听。

不负责：

- 不写 Graphology graph。
- 不写 pins。
- 不直接调用 host callbacks。
- 不决定 selection / focus。
- 不构建 `GraphRendererAdapterData`。
- 不拥有抽屉行为。

### Drag controller

对应文件：`sigma-global-drag.ts`

负责：

- 创建和推进节点拖拽会话。
- 维护拖拽阈值、grab offset、拖拽中的世界坐标。
- 绑定 document-level pointer/mouse move/up/cancel。
- 提供拖拽后的 adapter data 更新 helper。

不负责：

- 不做 hit projector。
- 不打开抽屉。
- 不决定 selection。
- 不直接持有 Sigma renderer lifecycle。

### Cloud geometry

对应文件：`community-cloud-geometry.ts`

负责：

- 云团 hull 点、ellipse fallback、polygon local points。
- 云团签名与复用依据。
- world / screen 几何转换中与云团形状相关的纯计算。

不负责：

- 不创建 DOM。
- 不绑定事件。
- 不决定何时 rebuild / reposition。
- 不处理相机动画。

### Support modules

`sigma-coordinates.ts` 只负责坐标转换。
`sigma-zoom.ts` 只负责纯缩放数学。
`sigma-overlay-svg.ts` 只负责低层 SVG / DOM 工厂。
`sigma-global-types.ts` 必须保持 type-only。
`sigma-events.ts` 只放无状态 payload 防御工具，不承载业务含义。

## Facade 与 Sigma 的边界

Sigma 内部只应该上报“点到了什么”和必要上下文。选择语义、抽屉、进入社区、回全图路由继续由 facade / web 层处理。

允许：

- Sigma 上报 `{ kind: "node" }`、`{ kind: "community-wash" }`、`{ kind: "aggregation-container" }`、`{ kind: "graph-blank" }`。
- Sigma 传递 additive / Shift 上下文。
- Sigma 把节点拖拽后的 pins 通过既有回调交回外层。

不允许：

- Sigma 内部直接打开抽屉。
- Sigma 内部决定社区是否进入阅读视图。
- Sigma 内部调用 host capabilities。
- Sigma 内部保存另一份业务选择状态。

## 测试分层

### 第一层：纯逻辑测试

用于不依赖 DOM 或 Sigma 实例的规则：

- `sigma-zoom.test.ts`
- `sigma-coordinates.test.ts`
- `community-cloud-geometry.test.ts`
- `sigma-graphology-model.test.ts` 中的属性映射和 patch 规则
- `sigma-hit-projector.test.ts` 中的 payload / target 翻译

这层应该快、稳定，适合每次改小逻辑时先跑。

### 第二层：模块行为测试

用于子系统自身职责：

- `sigma-global-camera.test.ts`
- `sigma-wheel-zoom.test.ts`
- `sigma-overlay-dom.test.ts`
- `sigma-hit-projector.test.ts`
- `sigma-graphology-model.test.ts`

这层验证模块是否守住输入输出，不要求真实浏览器完整路线。

### 第三层：主入口生命周期测试

用于 `createSigmaGlobalRenderer` 的组合行为：

- runtime required
- 创建 / 更新 / 销毁
- graph patch / rebuild
- camera reset / spotlight
- resize refresh
- overlay rebuild / reposition 调用时机
- stale event guard
- fatal error 上报
- node drag 与 pins 回写
- wheel 与按钮缩放组合

这层继续放在 `sigma-global-renderer.test.ts`，但应逐步只保留组合行为。内部 helper 的纯逻辑测试应搬到真实模块测试。

### 第四层：边界守卫测试

用于防止架构回退：

- 内部 Sigma helper 不能 import `sigma-global-renderer.ts`。
- 内部 Sigma helper 不能从 `render/index.ts` 对外导出。
- `sigma-global-types.ts` 只能导出类型。
- `sigma-global-renderer.ts` 不能转出口内部 helper，如 Graphology model builder、edge style、hit projector。
- Sigma 内部模块不能直接使用 host callback 名称。
- `sigma-overlay-dom.ts` 不能拥有 selection / focus / pins / adapter build。
- raw pointer / wheel 例外必须限制在 `sigma-global-drag.ts`、`sigma-wheel-zoom.ts` 或 overlay 节点 hit target 的明确入口。

这层是 #79 的重点。

### 第五层：浏览器回归

用于验证真实页面和真实 Sigma 路线：

- 初始进入全局 Sigma 路线。
- 社区点击打开抽屉并保留全局高亮。
- 节点点击、Shift 多选、空白退出高亮。
- 进入社区后回全图回到 Sigma。
- wheel / button zoom 在真实页面可用。
- 大图性能回归仍在预算内。

这层不应该替代前四层。只有触及真实渲染路径、路由、性能或交互闭环时才必须跑。

## #79 实施交付

实施时按以下范围推进：

1. 新增本设计文档并提交。
2. 调整 `sigma-global-renderer.test.ts` 中内部 helper 的导入来源：
   - `buildSigmaGlobalGraphologyGraph`、`sigmaGlobalEdgeStyle` 从 `sigma-graphology-model.ts` 导入。
   - `createSigmaGlobalHitProjector` 从 `sigma-hit-projector.ts` 导入。
   - 主入口测试只从 `sigma-global-renderer.ts` 导入主入口、runtime boundary、稳定常量和类型。
3. 移除或收口 `sigma-global-renderer.ts` 中内部 helper 的转出口。
4. 强化 `sigma-refactor-boundaries.test.ts`：
   - 断言主入口不转出口内部 helper。
   - 断言内部 helper 不经 render barrel 暴露。
   - 断言共享类型文件继续 type-only。
5. 必要时强化 `renderer-boundary.test.ts` 中 Sigma 内部不得拥有 host callback / selection / pins 的规则。
6. 更新 `workbench/PRODUCT.md` 中过期的 spotlight 状态描述，把“待实现”改成当前已落地事实，并注明 #75 是后续性能优化。
7. 运行相关测试和推送前基础检查。

## #75 的后续落点

#75 不在本 issue 内实现，但 #79 完成后，#75 应按下列边界推进：

- 相机动画目标、动画触发和 reduced motion：归 `sigma-global-camera.ts`。
- overlay 每帧 reposition 策略：归 `sigma-overlay-dom.ts`。
- 云团 hull / polygon 几何缓存或签名：归 `community-cloud-geometry.ts`。
- 主入口只负责在 Sigma camera event / afterRender 时调用 overlay controller，不承载性能算法。
- 性能验证应包含浏览器生产回归，不只靠单元测试。

## 验收标准

- 文档清楚说明 Sigma 全局子系统边界和测试分层。
- 主入口不再对外转出口内部 helper。
- 现有测试不再从主入口导入内部 helper。
- 新增或强化的边界测试能防止上述问题回退。
- 产品文档不再把已实现的 spotlight 写成未实现。
- Sigma 相关单元测试通过。
- 不改变用户可见行为。
- 不混入 #75 性能实现。

## 最小验证命令

实施完成后至少运行：

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts \
  packages/graph-engine/test/renderer-boundary.test.ts \
  packages/graph-engine/test/architecture.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts \
  packages/graph-engine/test/sigma-hit-projector.test.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/sigma-wheel-zoom.test.ts \
  packages/graph-engine/test/sigma-zoom.test.ts \
  packages/graph-engine/test/sigma-coordinates.test.ts \
  packages/graph-engine/test/community-cloud-geometry.test.ts
```

推送前按仓库规则补跑：

```bash
bash install.sh --dry-run --platform codex
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
git diff --check
```

若后续实施触及真实浏览器路径或性能相关代码，再补跑：

```bash
bash tests/graph-sigma-global-production.regression-1.sh
```
