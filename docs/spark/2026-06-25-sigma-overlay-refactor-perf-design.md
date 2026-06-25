# Sigma 覆盖层重构 + 性能改造 设计文档

- 日期：2026-06-25
- 分支：`feat/sigma-overlay-refactor-perf`
- 关联 issue：#64 拆分 `sigma-global-renderer.ts`、#63 第 2 条（DOM 重绘重建节点）
- 范围：本 spec 覆盖 Phase 1（#64）+ Phase 2（#63.2）两阶段。#63 第 1 条（云层签名全量遍历）与 #65（无障碍）**不在本 spec 范围内**，后续单独处理。

---

## 1. 背景与动机

全局视角的知识图谱用 Sigma 在 canvas 上画点和边，再在上面盖一层 DOM/SVG 覆盖物（社区云团、节点命中框、社区标签）。这层覆盖物的全部逻辑集中在
`packages/graph-engine/src/render/sigma-global-renderer.ts`，当前 **1386 行**，存在两个已确认的问题：

1. **单文件过大（#64）**：云层几何、SVG 渲染、凸包计算、坐标变换都堆在一个文件里。仓库已把 wash 逻辑拆到
   `community-wash.ts` / `community-washes.ts`，本文件应顺势拆分。
2. **每帧重建 DOM（#63 第 2 条）**：`renderSigmaOverlays()` 绑在 Sigma 的 `afterRender` 事件上
   （`sigma-global-renderer.ts:426`），**平移/缩放的每一帧**都先 `overlayRoot.replaceChildren()` 清空
   （`:623`），再全量重建所有节点命中框、云层 SVG，并重新绑定 click / pointerdown / mousedown / dragstart
   监听（`:621-715`）。但相机移动时节点集合并未改变，只有屏幕坐标变了——这是典型的 DOM 抖动热路径。

> 注：PR #60 的 1000 节点回归已通过，当前规模不卡。本改造目标是降低维护成本、消除架构坏味道，为更大规模做准备。

### 设计原则

- 两个 Phase 相互独立、可分别合并。**Phase 1 是纯搬迁（零行为变化），Phase 2 才动行为。**
- 先拆后优化：在 1000+ 行单文件里直接改性能热路径风险叠加；拆完后 Phase 2 改动面更小、更好测。
- 依赖单向：`sigma-coordinates` ← `community-cloud-geometry` ← `sigma-overlay-svg` ← 主文件（编排）。
- 不改对外接口（`SigmaGlobalRenderer`），workbench 侧零感知。
- 遵循 YAGNI：不做通用 diff 框架、不顺手重构无关代码。

---

## 2. Phase 1（#64）：按职责拆 3 个 helper

从 `sigma-global-renderer.ts` 抽出三组纯函数 / 无状态工厂。主文件只保留编排核心：
`createSigmaGlobalRenderer`、生命周期、拖拽会话、事件接线、Graphology 属性映射、hit projector、edge style。

| 新文件 | 搬入内容 | 性质 |
|---|---|---|
| `render/sigma-coordinates.ts` | `sigmaWorldPointToScreenPoint`、`sigmaScreenPointToWorldPoint`、`overlayPointerScreenPoint` | 坐标变换 |
| `render/community-cloud-geometry.ts` | `SigmaCommunityCloud` / `SigmaCommunityCloudBasis` 接口、`sigmaCommunityCloudBasisById` + `...WithReuse` + `...WithNodePoint`、`sigmaCommunityCloudSignature`、`sigmaProjectedCloudHullPoints`、`clampPointToWorldEllipse`、`clampPointToScreenEllipse`、`sigmaCommunityCloud`、`convexHull2d` | 几何 / 凸包，多为纯函数 |
| `render/sigma-overlay-svg.ts` | `SIGMA_OVERLAY_SVG_NS`、`nextSigmaCloudFilterSequence`、`sigmaSharedCloudFilterDef`、`sigmaCloudSvg`，及 overlay 元素工厂 `sigmaOverlayButton` / `sigmaOverlayPassiveElement` / `applyOverlayBox` / `createSigmaOverlayRoot` | DOM / SVG 构造 |

依赖说明：`community-cloud-geometry` 中的投影函数（`sigmaProjectedCloudHullPoints`、`sigmaCommunityCloud`）
依赖坐标变换，故 import `sigma-coordinates`，单向依赖。

预计主文件从 1386 行降到约 1000 行。

### Phase 1 验收

- 行为零变化。
- 现有 8 个 graph-engine 测试全绿（`npm test`），`npm run typecheck` 通过。
- 几何纯函数补独立单测（凸包、签名、clamp、坐标往返）——这些此前埋在主文件内未单独测。

> 这些函数当前均为**模块私有、未对外导出**，搬到新 helper 后由新 helper 各自 `export`（供单测直接
> import），主文件再 import 回来使用。**公开 API（`SigmaGlobalRenderer` 等）与 `src/index.ts`
> barrel 不变**，workbench 侧零感知。模块级计数器 `sigmaCloudFilterSequence` 随 SVG 函数整组搬走，
> 仍是同一个计数器，行为不变。

---

## 3. Phase 2（#63.2）：拆"结构更新"与"位置更新"

把唯一的 `renderSigmaOverlays()`（每帧 `replaceChildren` 全量重建）拆成两条路径。

### `rebuildSigmaOverlays()` — 仅数据 / 选中变化时调用

- 按 id 做 diff：复用已存在元素，新增缺失的、移除多余的；维护三张
  `Map<id, element>`（节点命中框、社区云层 region、社区标签各一张）。
- 监听器（click / pointerdown / mousedown / dragstart）**只在元素创建时绑一次**。
- 处理由数据决定的状态：selected / dim / searchHit / pinned、label 文本等。

> 覆盖层只渲染**这 3 类** DOM 元素。aggregation 容器画在 Sigma canvas 上（走 Graphology
> 属性），不属于本覆盖层，本改造不涉及。

### `repositionSigmaOverlays()` — 绑 `afterRender` / resize / 拖拽移动，每帧调用

- 遍历已存在元素，只更新屏幕坐标（`applyOverlayBox`）与云层 SVG 的 `points` 属性。
- **绝不** `replaceChildren` / `createElement` / `addEventListener`。

### 调用点改造

| 位置 | 现状 | 改为 |
|---|---|---|
| 初始渲染（`:336`） | `renderSigmaOverlays()` | `rebuildSigmaOverlays()` |
| 数据更新（`:382`） | `renderSigmaOverlays()` | `rebuildSigmaOverlays()` |
| `afterRender` 相机移动（`:426`） | `renderSigmaOverlays()` | `repositionSigmaOverlays()` |
| resize raf（`:463`） | `renderSigmaOverlays()` | `repositionSigmaOverlays()` |
| 拖拽移动（`:594`） | `renderSigmaOverlays()` | `repositionSigmaOverlays()` |

选中变化走数据更新路径（触发 rebuild），因此 dim / selected 不进每帧热路径。

### 状态归属与不变量（防止双路径打架）

覆盖层完全自封闭：生产代码里只有本文件操作 `overlayRoot` 与几何/SVG 函数，无第二处
监听 `afterRender`。因此冲突风险只在文件内部的 rebuild / reposition 之间，必须守住以下不变量：

- **rebuild 是元素生命周期的唯一权威**：只有它能增删元素、维护三张 `Map<id, element>`、绑监听。
- **reposition 对结构只读、且幂等**：只改已存在元素的位置/box 与云 hull 投影；遇到表里有、
  但当前 `adapterData` 已无的 id，安全跳过（不报错、不创建）。
- **reposition 每帧从 `cloudBasisByCommunityId` 重新投影云 hull**：拖拽中 basis 冻结、松手才重算，
  reposition 必须每次重投影才能让云层跟手（与现有行为一致）。
- **`update()` 的执行顺序安全前提**：现状 `sigma.refresh()`（`:381`）→ 真实 Sigma 触发 `afterRender`
  → reposition，**早于** 紧随其后的 rebuild（`:382`）。因 reposition 满足"只读+容忍不同步+幂等"，
  这次提前的 reposition 至多对旧元素做一次无害定位，rebuild 随后纠正为准。
- **`afterRender` 与 `cameraUpdated` 都绑同一处理器**（`:425-426`），reposition 一帧可能跑 2 次；
  因幂等无害，暂不做 rAF 去重（YAGNI，后续按需）。

### 关键风险点

云层每帧的 hull 投影点会变，所以 reposition 必须更新 polygon 的 `points` 属性和容器 box，
同时保留同一个 shape 元素及其 click 监听。这是整个改造里最需要小心的一处，测试需专门覆盖。

---

## 4. 错误处理与边界

- 两条路径都保留 `destroyed` 守卫。
- 销毁时清空三张 `Map<id, element>`，避免悬挂引用。
- diff 按 id 增删；id 不变但内容变（如 label 文本）在 rebuild 内更新属性。
- 不改对外接口 `SigmaGlobalRenderer`。

---

## 5. 测试方案

### Phase 1

- 现有回归全绿 + 几何纯函数新单测（凸包、签名、clamp、坐标往返）。

### Phase 2（验收标准：可量化性能基线）

在 `test/sigma-global-renderer.test.ts` 复用现有 `fakeContainer()` / `fakeRuntime()` / `sigma.emit()`
基础设施（fake 元素内部已用 Map 记录子节点与监听，无需引入 jsdom）：

1. **量化基线断言**（核心）：渲染后记录元素引用与 createElement / addEventListener 调用计数 →
   多次 `sigma.emit("afterRender")` → 断言**元素实例不变、createElement 计数不增、监听计数不增、
   `replaceChildren` 在 reposition 路径未被调用**。
2. **行为保持**：点击云层 → 社区选中、点击节点 → 节点选中、拖拽仍生效（沿用现有 emit 用例）。
3. **结构 diff**：数据更新增 / 删节点后，元素表正确增删。
4. **需更新的现有断言**：现有 resize 测试（`test/sigma-global-renderer.test.ts:574`）当前断言
   resize 后覆盖层元素被**新建**（`assert.notEqual`）。Phase 2 后元素改为**复用**，这条须改成
   `assert.equal`。这是**预期内的行为变更，不是回归**——它恰好验证了"reposition 不再重建元素"。
5. **第三层手动回归**：在 codex 跑 1000 节点平移 / 缩放，主观确认不卡 + 基线测试通过
   （按 CLAUDE.md 推送前测试规则）。

---

## 6. 分 Phase 推进计划

- **Phase 0（本次 spark）**：写本 spec，分支 `feat/sigma-overlay-refactor-perf`。
- **Phase 1**：拆 3 个 helper → 跑回归 → 分步 commit → 可单独开 PR 合入（纯重构、低风险）。
- **Phase 2**：基于 Phase 1 改双路径 + 量化基线测试 → codex 回归 → commit → PR。
- **文档**：每个含功能改动的 Phase，按 CLAUDE.md 更新 CHANGELOG / README / 版本号。

---

## 7. 验收清单（汇总）

- [ ] Phase 1：主文件显著瘦身、行为零变化、现有测试与 typecheck 全绿、几何函数有独立单测。
- [ ] Phase 2：`afterRender` 路径不再销毁 / 重建 DOM、不重绑监听（量化测试断言通过）。
- [ ] Phase 2：点选社区 / 点选节点 / 拖拽行为与改造前一致。
- [ ] Phase 2：1000 节点 codex 手动回归平移缩放不卡。
- [ ] 对外接口 `SigmaGlobalRenderer` 无变化，workbench 无需改动。
