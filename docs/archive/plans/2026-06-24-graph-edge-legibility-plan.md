# 全局图边线"分主次" + 调参面板 plan

- 日期：2026-06-24
- 分支：`feat/graph-edge-legibility`
- 状态：⏸ 待用户确认后实施（动代码前会再给一次文件级清单，遵守 workbench「不要自由发挥」规则）
- 范围：**只改全局图（Sigma 全景）的边线 + 顶栏加一个"调参"按钮和面板**。社区聚焦图、节点、布局、其它交互一律不动。

> 本文件取代同名旧版（旧版只覆盖边样式；本版扩到按钮+面板+数据通路，是同一功能的完整版）。
> 设计稿与取值依据：`designs/graph-edge-legibility/graph-edge-treatments.html`（已和用户在亮/暗双主题下确认）。

---

## 1. 背景与目标（基于代码诊断）

两套渲染、共用一个图例：

| 视图 | 渲染器 | 边差异化现状 |
|---|---|---|
| 全局图（默认路由 `sigma-global`，WebGL） | `sigma-global-renderer.ts` | ❌ 写死 `#8a8175` 灰实线，扑脸，图例承诺没兑现 |
| 社区聚焦图（DOM） | `dom-svg-renderer.ts` + `edges.ts` + CSS | ✅ 已实现（颜色+虚线），不动 |

证据：`sigma-global-renderer.ts:1199` 的 `sigmaGlobalEdgeAttributes` 颜色写死 `#8a8175`，`opacity` 字段是死代码（Sigma 默认边程序不读它，只读 `color` 的 rgba alpha）。

**目标**：
1. 全局图边线"分主次"，不再扑脸；图例的**关系类型**在全局图变成真的（置信度见 §2.2 决定）。
2. 顶栏（`重置布局`/`重构` 旁，[GraphPanel.tsx:540](../../workbench/web/src/components/GraphPanel.tsx) 的 `graph-shell-toolbar-actions`）加一个 **"调参"按钮**，点开一个面板。
3. 面板 = **底座 + 2 个开关**：
   - **分主次**：默认底座，始终生效（不是开关，是边本来的样子）。
   - 🔘 **语义强调**：普通边压成发丝、对比/矛盾更突出。
   - 🔘 **聚焦点亮**：选中某社区时，只点亮它的连线、其余压暗。
4. 全程单一真源，不与社区图那套已生效逻辑打架。

> **曲线方案已砍**（需新依赖 `@sigma/edge-curve` + 双运行边界，触发 workbench 新依赖红线，不做）。本次**零新依赖**。

## 2. 总体设计

### 2.1 边样式 = 一个数据结构，单向流动

新增一个边样式选项对象，从 React 面板一路传到 Sigma：

```
GraphEdgeStyleOptions {
  semanticEmphasis: boolean;  // 语义强调开关，默认 false
  focusHighlight: boolean;    // 聚焦点亮开关，默认 false
}
```

数据通路（**唯一真源，单向**）：

```
React 面板状态 (GraphPanel)
  → engine.setEdgeStyle(style)            // 新增 GraphEngine 方法
  → facade 存 options.edgeStyle           // facade.ts
  → sigma 渲染器 update({ edgeStyle })     // SigmaGlobalRendererUpdateOptions 扩字段
  → buildSigmaGlobalGraphologyGraph(..., style)
  → sigmaGlobalEdgeAttributes(edge, theme, style, selectedCommunityIds)  // 算 color/size
```

**关键点（防打架）**：边样式**只在算 Sigma 边属性这一处生效**，不再有第二处写死。DOM 社区图的 `edgeStyle` 直接忽略（社区图不动）。

### 2.2 "分主次"底座算法（始终生效）

每条边按"关系类型 + 圈内/跨圈"算出 rgba 颜色（透明度烤进 alpha）与线宽：

- 关系→颜色（复用 `model.ts` 的 `edgeRelationClass()` + 主题 token，三处同源）：
  - 中性（实现/依赖/衍生）：亮 `--night #315f72` / 暗 `--line #8e8778`
  - 对比：亮 `--amber #b7791f` / 暗 `#e0b35e`
  - 矛盾：亮 `#d94693` / 暗 `#f472b6`
- 基础透明度：圈内中性 `α≈0.10`，跨圈中性 `α≈0.34`，对比/矛盾 `α≈0.5`（跨圈再高一点）。
- 权重微调 + 钳制 `α∈[0.05,0.7]`、`width∈[0.6,4]`。

> **【eng-review V2 决定】全局图不表达置信度。** 全局边本就很淡，再用"更淡"区分低置信，人眼在占多数的圈内边上根本看不出（0.062 vs 0.10）。置信度只在社区聚焦图用虚线表达（那里 legible）。所以：边算法**不含置信度系数**；全局图例**隐藏"置信度"栏**，只留"关系类型"。
>
> **默认回落**：`edgeStyle` 为 `undefined`（DOM 路由 / 初始 / 离线导出）时，边样式回落到本节"分主次"底座（两个开关皆 false）。

### 2.3 语义强调（开关）

在底座上：中性边再压（×0.6 透明度、更细），对比/矛盾边加粗、提亮。**不加箭头**（对比/矛盾是对称关系，箭头语义错）。

### 2.4 聚焦点亮（开关，复用已有选中态，不需 edgeReducer）

架构事实：选中社区时，facade 会用新的 `adapterData` 重建 Sigma 图（`adapterData.communities[].selected` 已带选中信息，云团调暗已经在用，见 `sigma-global-renderer.ts:611`）。所以：

- 开关开 + 有社区被选中：算边属性时读 `selectedCommunityIds`，**触及选中社区的边**保持/提亮，**其余边** ×0.05。
- 开关关：选中只高亮云团（现状行为），不动边。

> 因为边在选中时本就会重建，**这一步在建图时算即可，不必引入 per-frame edgeReducer**，比预想的更简单、更低风险。鼠标 hover 的瞬时点亮留作以后增强，不在本次范围。

## 3. 分 commit（一个分支，第一步后暂停给用户看）

| commit | 内容 | 文件 |
|---|---|---|
| **C1 通路+按钮+面板骨架** | 加 `GraphEdgeStyleOptions` 类型、`setEdgeStyle` 方法、facade 透传、sigma update 扩字段（先不改样式逻辑，保证零回归）；顶栏"调参"按钮 + 空面板（2 个开关 UI，暂不接效果） | types.ts、facade.ts、sigma-global-renderer.ts、GraphPanel.tsx、样式 |
| **C2 分主次 + 语义强调** | `sigmaGlobalEdgeAttributes` 用新算法（底座 + 语义强调，**不含置信度**）；删死字段 `opacity`；全局图例隐藏"置信度"栏（CSS 限 `.sigma-global-route`）；接通面板"语义强调"开关 | sigma-global-renderer.ts、render-styles.ts、测试 |
| **C3 聚焦点亮** | 边属性读 `selectedCommunityIds` 做聚焦压暗；接通面板"聚焦点亮"开关 | sigma-global-renderer.ts、测试 |

➡️ **C2 完成后停下**，在真实图谱里截图给用户确认，OK 再做 C3。

## 4. 文件级改动清单（精确）

**引擎（packages/graph-engine）**
1. `src/types.ts`：加 `GraphEdgeStyleOptions`；`GraphEngineOptions.edgeStyle?`；`GraphEngine.setEdgeStyle(style)`。
2. `src/facade.ts`：`GraphEngine` 实现加 `setEdgeStyle`（存 `options.edgeStyle`，调 `updateSigmaRenderer()`）；sigma facade 的 create/update 把 `edgeStyle` 传给渲染器；DOM 路由忽略。
3. `src/render/sigma-global-renderer.ts`：
   - `SigmaGlobalRendererCreateOptions` / `SigmaGlobalRendererUpdateOptions` 加 `edgeStyle?`。
   - `buildSigmaGlobalGraphologyGraph(adapterData, runtime, theme?, style?)`：传 theme/style 与 `selectedCommunityIds` 给边属性函数。
   - `sigmaGlobalEdgeAttributes(edge, theme, style, selectedCommunityIds)`：新算法；删 `opacity` 字段（接口同步删）。
   - 新增纯函数 `sigmaGlobalEdgeStyle(edge, theme, style, selectedCommunityIds)`（配色表 + 圈内/跨圈 + 语义强调 + 聚焦逻辑，**不含置信度**），纯函数便于单测。
   - import `edgeRelationClass`（来自 `./model`）。
4. `src/render/render-styles.ts`：新增一小段 `.sigma-global-route` 限定 CSS，**在全局视图隐藏图例"置信度"栏**（`display:none`）；社区图图例（不在 `.sigma-global-route` 内）保留虚线、不受影响。

**前端（workbench/web）**
5. `src/components/GraphPanel.tsx`：
   - `graph-shell-toolbar-actions` 加"调参"按钮（lucide 图标，沿用 `graph-shell-toolbar-button` 样式）。
   - 一个轻量 popover/面板（2 个开关），React state；变化时 `engineRef.current?.setEdgeStyle(...)`；建引擎时把当前 style 一起传入。
   - state 持久化到 localStorage（和现有 UI 偏好一致）。
6. 对应少量 CSS（按钮激活态、面板）——放进 web 既有样式文件，匹配现有视觉。

## 5. 防"逻辑打架"

- 边样式**只有一处生效**（Sigma 边属性计算），不再有写死分支。
- 关系配色取自 `edgeRelationClass()` + 主题 token = 三处（全局/社区/图例）唯一真源。
- 删掉 Sigma 边里没人读的 `opacity` 死字段，避免"color 带透明度 + opacity 字段"并存。
- 聚焦点亮复用**已存在的** `selectedCommunityIds`，不新开第二套选中状态、不加 edgeReducer。
- 图例视图差异纯靠 `.sigma-global-route` CSS 作用域，**零 JS 分叉**，社区图图例零影响。
- DOM 社区图渲染、CSS（`edges.ts` + `render-styles.ts:602-615`）完全不碰。

## 6. 新依赖

**无。** 曲线已砍；其余全用现有 sigma 3.0.3 默认能力 + 现有 token。

## 7. 测试与验证

- 单测：`packages/graph-engine/test/sigma-global-renderer.test.ts` 更新边属性断言（旧的 `#8a8175`/`opacity`），新增"语义强调""聚焦点亮（带 selectedCommunityIds）"用例；facade 加 `setEdgeStyle` 透传用例。源码文本断言（无 `GraphData`、签名以 `adapterData: GraphRendererAdapterData` 开头）保持通过。
- 跑 `npm test`（graph-engine）+ web 构建不报错。
- 起 `npm run dev`（5180/8787）人眼验：
  - 全局图：圈内边退背景、跨圈边可见、对比/矛盾有色、不再扑脸；亮/暗主题都正常。
  - 开"语义强调"：普通边变发丝、对比/矛盾跳出。
  - 开"聚焦点亮"：选中一个社区，只剩它的连线亮。
  - 全局图例**只有"关系类型"栏**，没有"置信度"栏（V2 决定）。
  - **点进一个社区**：边线（颜色+虚线）与图例（含置信度虚线栏）**无任何变化**。
  - **离线 HTML 导出**（offline-reader 路径）：边以"分主次"底座渲染、无调参面板、不报错（验证默认回落）。

## 8. 回滚

改动集中在 4 个引擎文件 + GraphPanel + 少量 CSS + 测试，全在 `feat/graph-edge-legibility`，按 commit 粒度可逐步回退。

## 9. 用户已确认的决定

1. ✅ 一个分支 / C1→C2→C3 / **C2 后暂停看效果**。
2. ✅ 面板形态：分主次常开底座 + 语义强调 / 聚焦点亮 两个开关（可叠加）。
3. ✅ 聚焦点亮绑**点击选中社区**（复用现有 `selectedCommunityIds`，不上 edgeReducer）；hover 瞬时点亮留作以后增强。
4. ✅【eng-review V2】全局图不表达置信度，全局图例隐藏"置信度"栏；社区图保留虚线。

## 10. Eng-review 补充（required outputs）

### 10.1 NOT in scope（明确不做）

- **曲线边**：需新依赖 `@sigma/edge-curve` + 双运行边界，触发 workbench 新依赖红线 → 砍。
- **鼠标 hover 瞬时点亮**：需 edgeReducer（第二套样式机制），与"选中重建"打架 → 留作以后增强。
- **全局图置信度可视化**：淡边上人眼不可分 → 只在社区图用虚线（V2）。
- **社区聚焦图的边/图例**：已生效，本次完全不碰。

### 10.2 What already exists（复用，不重造）

| 子问题 | 已有 | 本次 |
|---|---|---|
| 关系→颜色 | `model.ts` `edgeRelationClass()` + 主题 token；DOM CSS `render-styles.ts:602-615` | 复用为唯一真源 |
| 选中社区状态 | `sigma-global-renderer.ts:611` `selectedCommunityIds`（云团调暗在用） | 聚焦点亮复用，不新建 |
| 引擎 setter 模式 | `setTheme/setData/setAggregationMarkers`（facade.ts） | `setEdgeStyle` 同构新增 |
| 选中触发重建 | `select/focusCommunity → updateSigmaRenderer → 重建` | 顺手在重建里算边样式，零新机制 |

### 10.3 测试覆盖图（新增代码路径）

```
[+] sigmaGlobalEdgeStyle(edge, theme, style, selectedCommunityIds)   ← 纯函数，全分支单测
  ├── 关系: neutral / contrast / conflict ............ [需测 ×3]
  ├── 结构: 圈内(intra) / 跨圈(bridge) ................ [需测 ×2]
  ├── 主题: shan-shui(亮) / mo-ye(暗) 配色 ............ [需测 ×2]
  ├── 语义强调: off / on（普通边压细、语义边提亮）..... [需测 ×2]
  ├── 聚焦点亮: off / on×未选中 / on×选中(触及/不触及) . [需测 ×3]
  └── 钳制: α∈[0.05,0.7]、width∈[0.6,4] 边界 ......... [需测 ×2]
[+] sigmaGlobalEdgeAttributes：删 opacity 后断言对齐（含 selectedCommunityIds 入参）
[+] facade.setEdgeStyle：透传到 sigma update（含 DOM 路由忽略）...... [→集成]
[+] 源码文本断言：无 `GraphData`、签名以 `adapterData: GraphRendererAdapterData` 开头 ... [保持通过]
[+] CSS：`.sigma-global-route` 隐藏置信度栏、社区图图例不受影响 .... [快照/存在性]

COVERAGE 目标：sigmaGlobalEdgeStyle 全分支 100%；facade 透传 1 条集成。
```

### 10.4 失败模式（每条新路径一个真实故障 + 是否兜底）

| 路径 | 真实故障 | 测试 | 兜底 | 用户可见 |
|---|---|---|---|---|
| `edgeStyle = undefined` | 面板未挂载/DOM 路由/离线导出 | ✅ 默认回落用例 | ✅ 回落到分主次底座 | 看到正常底座，非崩溃 |
| `selectedCommunityIds` 为空 + 聚焦开 | 开了聚焦但没选社区 | ✅ on×未选中用例 | ✅ 全边按底座（不全压暗） | 正常底座，非空白 |
| 边 `sourceCommunityId/targetCommunityId` 为 null | 脏数据 | ✅ 既有 null 用例 | ✅ 当作非跨圈中性处理 | 中性淡边 |
| 主题切换 | 暗色下 night 蓝糊掉 | ✅ 双主题用例 | ✅ 暗色中性改 `--line` 灰 | 边在黑底可见 |

> 无"无测试 + 无兜底 + 静默失败"的关键缺口。

### 10.5 并行化

**Sequential implementation, no parallelization opportunity** —— C1/C2/C3 都串在同一条"React→facade→Sigma"通路上，且 C2/C3 都改 `sigma-global-renderer.ts`，共享主模块，必须顺序做（C1→C2→暂停→C3）。

### 10.6 Implementation Tasks（从审查结论同步）

- [ ] **T1 (P1, CC ~15min)** — engine — 加 `GraphEdgeStyleOptions` 类型 + `GraphEngine.setEdgeStyle` + facade 透传到 sigma（C1 通路）
  - Files: `packages/graph-engine/src/types.ts`, `src/facade.ts`, `src/render/sigma-global-renderer.ts`
  - Verify: `npm test`（graph-engine）+ web 构建
- [ ] **T2 (P1, CC ~10min)** — web — 顶栏"调参"按钮 + 2 开关面板（锚定/点外关/localStorage）+ 建引擎时传入 style（C1）
  - Files: `workbench/web/src/components/GraphPanel.tsx` + web 样式
  - Verify: 面板开关，`setEdgeStyle` 被调用
- [ ] **T3 (P1, CC ~20min)** — engine — `sigmaGlobalEdgeStyle` 分主次+语义强调算法、删 `opacity`、全局图例隐藏置信度栏 + 全分支单测（C2）
  - Files: `src/render/sigma-global-renderer.ts`, `src/render/render-styles.ts`, `test/sigma-global-renderer.test.ts`
  - Verify: `npm test`；人眼验亮/暗 + 语义强调 + 社区图无变化；**暂停给用户看**
- [ ] **T4 (P2, CC ~10min)** — engine — 聚焦点亮：边样式读 `selectedCommunityIds` 压暗非触及边 + 用例（C3）
  - Files: `src/render/sigma-global-renderer.ts`, `test/sigma-global-renderer.test.ts`
  - Verify: 选中社区只剩其连线亮；未选中=底座
- [ ] **T5 (P2, CC ~5min)** — verify — 离线 HTML 导出走默认回落（分主次、无面板、不报错）
  - Files: `src/render/offline-reader.ts`（仅验证，预计无改）
  - Verify: 导出一份离线 HTML 打开检查

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 5 issues, 0 critical gaps |

- **Step 0 范围**：scope accepted as-is（5 文件、0 新依赖、未触发复杂度红线）
- **架构**：1 note（聚焦绑选中重建而非 edgeReducer = 正确；hover 划出范围）— 已采纳
- **代码质量**：1 修正（`edgeStyle=undefined` 默认回落到分主次底座）— 已写入 §2.2
- **测试**：覆盖图见 §10.3，`sigmaGlobalEdgeStyle` 要求全分支 100% + facade 透传 1 集成
- **视觉设计**：1 关键发现 V2（置信度深浅在淡边不可见）→ 决议 B：全局不做置信度、图例隐藏该栏
- **失败模式**：见 §10.4，无"无测试+无兜底+静默"关键缺口
- **并行化**：Sequential，无并行机会（共享 sigma-global-renderer.ts）
- **VERDICT**：ENG CLEARED — 计划可实施；按 C1→C2→（暂停看效果）→C3 推进

NO UNRESOLVED DECISIONS
