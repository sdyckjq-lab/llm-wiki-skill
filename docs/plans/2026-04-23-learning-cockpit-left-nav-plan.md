---
title: feat: 学习驾驶舱左侧社区导航与联动
type: feature
status: draft
date: 2026-04-23
origin: TODOS.md 学习驾驶舱补全 A-C 项
---

# feat: 学习驾驶舱左侧社区导航与联动

## Overview

学习驾驶舱核心骨架已落地（`feat/learning-cockpit`），三模式切换、子图渲染、右侧学习解释、降级链路都已工作。但用户打开页面后，仍然没有"先从哪开始学"的明确导航入口。

本轮要做的，是把当前 `insights-panel` 里简略的学习入口，替换成一个独立的**左侧社区导航面板**，并接通左中右联动。

## Scope

- **A. 左侧社区导航面板**：社区榜（名称、节点数、source 数）+ 推荐起点列表
- **B. 社区榜展示前 3 个社区**：多社区列表，不过度断言
- **C. 点击社区触发左中右联动**：6 种触发动作的完整联动

不在这轮做的：
- 信息层级重排（D 项，搜索/过滤/Insights 默认折叠）
- 推荐起点附带理由（E 项）
- Design Validation（F 项，功能做完后验证）

## Current State

### 布局

`header.html:132-149` 的 `.app` grid：

```
grid-template-areas:
  "brand   drawer"
  "tools   drawer"
  "canvas  drawer"
  "footer  drawer";
grid-template-columns: 1fr 0fr;  /* drawer-open 时 1fr var(--drawer-w) */
```

两列：左边是 brand + tools + canvas + footer，右边是 drawer。没有左侧导航区域。

### 学习入口

`graph-wash.js:1104-1182` 的 `renderLearningPanel()` 把学习入口塞在 `insights-panel`（`#learning-body`）里。它只在 path/community 模式时显示，展示推荐起点和当前社区的简略信息。

### 数据

`graph-data.json` 的 `learning` contract 已稳定提供：

- `learning.communities[]`：每个社区有 `id`, `label`, `node_count`, `source_count`, `is_primary`, `is_weak`, `recommended_start_node_id`
- `learning.views.path/community/global`：每个模式有 `node_ids`, `start_node_id`, `community_id`
- `learning.entry`：`recommended_start_node_id`, `default_mode`

这些数据足以支撑左侧社区导航面板，不需要新增预计算字段。

### 状态

`graph-wash.js:52-68` 的 state 已有 `learning.activeMode`, `learning.activeCommunityId`, `learning.data`。联动所需的模式切换、社区切换、visible snapshot 都已有基础设施（`setLearningMode()`, `updateVisibleSnapshot()`, `applySubgraph()`）。

## Key Decisions

1. **布局方案：在 `.app` grid 中加一列 `nav`，改成三列布局。**

   不在 `canvas-wrap` 内部做左侧导航，因为：
   - `canvas-wrap` 内已有 SVG、insights-panel、legend、minimap、toast、loading 等浮层
   - 在浮层堆叠里再加一个导航面板会让 `canvas-wrap` 的定位逻辑变得更复杂
   - `.app` grid 本身就是用来管页面级区域划分的，加一列是它的正常用法

2. **社区导航桌面端固定宽度，窄屏改成 overlay，不让三列硬挤中间画布。**

   桌面端仍按三列：`nav | main | drawer`。但在 `< 1024px` 时，左侧导航不继续常驻占列，而是切成覆盖层，通过单独的 nav toggle 打开/关闭。这样保留桌面端的学习叙事，同时不把窄屏画布挤坏。

3. **社区切换复用 `setLearningMode("community")` + `focusNode()`，但 community 可见集必须按 `activeCommunityId` 运行时派生。**

   点击左侧社区 = 切到该社区的 community 视图 + 聚焦该社区推荐起点。这和点 mode-switch 的"社区"按钮效果一样，只是同时切换了 activeCommunityId。

   关键补充：不能继续直接复用预计算的 `learning.views.community.node_ids`，因为那只稳定代表 primary 社区。切任意社区时，要通过 helper 按当前 `nodes[].community` 动态派生该社区的可见节点集合。

4. **左侧面板渲染逻辑拆成 `renderNavPanel()`，原 `renderLearningPanel()` 改名为只表达 insights 标题同步的函数。**

   当前的 `renderLearningPanel()` 既管 insights-panel 的标题切换，又管学习入口列表，职责不清。拆开后：
   - `renderNavPanel()`：负责左侧社区导航面板
   - `updateInsightsTitle()`（或等价命名）：只负责 insights-panel 标题切换
   - 不再需要 `#learning-body` DOM

5. **社区切换后如果当前选中节点不在新的 visible snapshot 内，主动关闭 drawer。**

   当前 `activeCommunityId` 已存在于 state 但没有被写入。本轮让它成为左侧面板和模式切换的共享状态。

   关键约束：左中右状态必须一致。如果用户从社区 A 切到社区 B，而右侧还停在社区 A 的旧节点，就会出现状态漂移。所以切社区后要检查 `selected` 是否仍在当前 visible snapshot 内；如果不在，直接关闭 drawer。
## Implementation Units

- [ ] **Unit 1: grid 布局改成三列 + 左侧导航 DOM 骨架**

  **Files:**
  - Modify: `templates/graph-styles/wash/header.html`（CSS + DOM）
  - Test: `tests/graph-html-learning-cockpit.regression-1.sh`
  - Test: `tests/graph-html-insights.regression-1.sh`

  **Approach:**

  CSS 改动：
  ```css
  .app {
    grid-template-columns: var(--nav-w, 240px) 1fr 0fr;
    grid-template-areas:
      "nav     brand   drawer"
      "nav     tools   drawer"
      "nav     canvas  drawer"
      "nav     footer  drawer";
  }
  .app.drawer-open {
    grid-template-columns: var(--nav-w, 240px) 1fr var(--drawer-w);
  }

  @media (max-width: 1023px) {
    .app,
    .app.drawer-open {
      grid-template-columns: 1fr 0fr; /* nav 改 overlay，不再占列 */
    }
  }
  ```

  DOM 改动：
  - 在 `.app` 内部最前面加 `<aside class="nav-panel" id="nav-panel">`
  - 内含两个 section：`nav-communities`（社区榜）和 `nav-start`（推荐起点）
  - 新增窄屏 nav toggle，用来打开/关闭 overlay
  - 删除 `canvas-wrap` 内的 `#learning-body` div（不再需要）
  - insights-panel 只保留 `#insights-body`

  样式：
  - 复用 wash 风格变量（`--paper-cream`, `--paper-ink`, `--font-hand` 等）
  - 社区项用 `commPalette` 对应的颜色做左边框指示条
  - 选中社区用加粗 + 背景色高亮，参考 `mode-btn[data-on="1"]` 的样式
  - `.brand` 左侧 padding 从当前 100px 收到约 24px，避免三列布局后 brand 区出现大块无效留白

  **Verification:**
  - graph HTML shell 回归更新后通过
  - 三列布局在 1280px+ 宽度下不挤压 canvas
  - `<1024px` 时 nav 变 overlay，不继续挤压中间图
  - 左侧导航在无社区数据时显示空态提示

- [ ] **Unit 2: 社区导航面板渲染逻辑**

  **Files:**
  - Modify: `templates/graph-styles/wash/graph-wash.js`（新增 `renderNavPanel()`）
  - Modify: `templates/graph-styles/wash/graph-wash-helpers.js`（新增 helper 如果需要）
  - Test: `tests/js/graph-wash-learning.test.js`

  **Approach:**

  新增 `renderNavPanel()`：
  ```
  1. 取 learning.communities，按 is_primary 优先、node_count 降序排
  2. 取前 3 个社区渲染为社区榜
     - 每个社区：颜色指示条 + label + "N 个节点 · M 个来源"
     - is_primary 的社区左侧加一个小标记（如 ★ 或加粗）
     - 点击社区项 → setActiveCommunity(community.id) → setLearningMode("community")
  3. 推荐起点区
     - 取当前 activeCommunityId 对应社区的 recommended_start_node_id
     - 显示为可点击的入口项
     - 点击 → focusNode(recommendedStartNodeId)
  4. activeCommunityId 变化时重新渲染高亮
  5. 若当前 selected 节点属于未展示社区（不在 top 3），在左侧面板内联显示轻提示，而不是强行切换高亮
  ```

  修改 insights 标题同步函数（原 `renderLearningPanel()`，建议改名为 `updateInsightsTitle()`）：
  - 删除对 `#learning-body` 的操作
  - 只管 insights-panel 标题切换：非 global 模式时标题改为"洞察"，global 模式时为 "Insights"
  - `#insights-body` 始终可见，不再 hidden

  新增 helper：
  - `getCommunityNodeIds(nodes, communityId)`：按运行时 `nodes[].community` 派生任意社区的 node ids，不能继续只依赖 `learning.views.community.node_ids`

  修改 `updateVisibleSnapshot()`：
  - 如果当前是 community 模式，从 `state.learning.activeCommunityId` 派生 visible node ids
  - 如果 activeCommunityId 为空，取 primary 社区

  新增 `setActiveCommunity(communityId)`：
  - 更新 `state.learning.activeCommunityId`
  - 调用 `setLearningMode("community")`
  - `renderNavPanel()` 刷新高亮
  - 聚焦该社区推荐起点
  - 如果当前 drawer 中的 selected 节点不在新的 visible snapshot 内，关闭 drawer

  **Verification:**
  - 社区榜显示前 3 个社区，primary 排第一
  - 点击社区项切到正确的 community 视图，而不是停留在 primary 社区子图
  - 点击推荐起点进入 path 视图并展开 drawer
  - 社区过弱（is_weak=true）时仍可点击
  - selected 节点离开当前社区可见集时，drawer 正确关闭

- [ ] **Unit 3: 左中右联动**

  **Files:**
  - Modify: `templates/graph-styles/wash/graph-wash.js`
  - Test: `tests/js/graph-wash-learning.test.js`

  **Approach:**

  按 6 种触发动作逐一实现联动：

  | 触发 | 左侧 | 中间 | 右侧 |
  |---|---|---|---|
  | 首次打开 | 选中 primary 社区；显示推荐起点 | path（或 community/global 降级） | path 时展开 drawer，否则不强制 |
  | 点击左侧社区 | 高亮切到该社区 | community 视图 | 若已打开则保留，刷新为该社区推荐起点 |
  | 点击推荐起点 | 保持当前社区高亮 | path 视图 | 自动展开，展示学习解释 |
  | 点击图中节点 | 左侧保持 | 维持当前模式 | 自动展开并刷新 |
  | 点击 mode-switch | 左侧保持 | 切换模式 | 若已打开则保留 |
  | 切到 global | 左侧保留社区上下文但不高亮 | 全局图 | 保留当前节点内容 |

  关键修改点：

  - `bootstrapLearningEntry()`：boot 时调用 `renderNavPanel()`，设置 `activeCommunityId` 为 primary 社区
  - `selectNode()`：选中节点时调用 `renderNavPanel()` 刷新左侧
  - `setLearningMode("global")`：左侧社区不高亮任何项，但仍显示社区列表
  - 节点点击时如果该节点属于当前 top 3 社区之一且不在 global 模式，可切换左侧高亮
  - 节点点击时如果该节点属于未展示社区，不切换左侧高亮，只在左侧面板给出内联提示
  - 社区切换后若当前 drawer 节点不在新的 visible snapshot 内，主动关闭 drawer，避免左中右漂移

  **Verification:**
  - 6 种触发动作的行为与设计文档联动表一致
  - 左中右不会出现状态漂移（高亮不一致）
  - 快速连续点击不同社区不会造成面板抖动
  - 点击未展示社区节点时左侧高亮保持稳定，并出现内联提示

- [ ] **Unit 4: 回归测试与 golden 更新**

  **Files:**
  - Modify: `tests/graph-html-learning-cockpit.regression-1.sh`
  - Modify: `tests/js/graph-wash-learning.test.js`
  - Modify: `tests/regression.sh`（如果需要）

  **Approach:**

  - 更新 HTML 回归：检查 `nav-panel`, `nav-communities`, `nav-start` DOM hook 存在
  - 新增带多社区 learning 数据的 fixture，不能继续只依赖当前 `learning: null` 的基础 fixture
  - 补 JS 单测：`renderNavPanel()` 的社区排序、前 3 截断、activeCommunityId 联动
  - 补 JS 单测：`getCommunityNodeIds()` 的纯函数边界（空输入 / 不存在社区 / 正常社区）
  - 补 JS 单测：`setActiveCommunity()` 切换后的 mode 和 visible snapshot 一致性
  - 补 JS 单测：selected 节点离开 visible snapshot 后 drawer 自动关闭
  - 补 JS 单测：点击未展示社区节点后左侧高亮保持不变，并出现内联提示
  - 补 JS 单测：6 种触发动作的联动断言
  - 确保 empty wiki 的左侧面板显示空态提示，不报错

  **Verification:**
  - `bash tests/regression.sh` 全绿
  - `node --test tests/js/graph-wash-learning.test.js` 全绿
  - graph HTML 独立回归全绿
  - 多社区 fixture 能真实覆盖 community 切换，而不是只测空 learning

## Suggested execution order

建议按 2 个 commit 边界实施：

1. **Unit 1 + Unit 2**：布局改造 + 渲染逻辑（DOM + CSS + JS 渲染，一起改 header.html 和 graph-wash.js）
2. **Unit 3 + Unit 4**：联动逻辑 + 回归测试（JS 行为 + 测试补齐）

## Risks

- **三列布局在窄屏下挤压 canvas**：本轮已决定 `< 1024px` 时 nav-panel 改 overlay，不继续常驻占列；实现时重点验证 toggle、层级和 drawer 并存状态。
- **社区切换如果仍复用 primary 的预计算 view，会导致左高亮变了但中间图没变**：必须通过 `activeCommunityId + nodes[].community` 动态派生 community 可见集。
- **社区切换与 mode-switch 语义冲突**：点击左侧社区 = 切到 community 模式，但用户可能期望只是高亮该社区而保持 path 模式。V1 统一为切 community 模式，后续可以加"仅高亮"模式。
- **非 top-3 社区节点点击导致左侧解释缺失**：本轮已决定不让左侧高亮乱跳，改为内联提示说明“当前节点属于未展示社区”。
- **空社区数据时左侧面板空白**：需要有空态 UI（"暂无社区信息"），不能显示一个空壳。
- **drawer 状态漂移**：社区切换后若当前 selected 节点不在新的 visible snapshot 内，必须主动关闭 drawer，否则会出现左中右不一致。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | OPEN | mode: SELECTIVE_EXPANSION, 2 critical gaps |
| Codex Review | `/codex review` | Independent 2nd opinion | 5 | ISSUES_FOUND | outside voice found runtime community-view gap, drawer drift, and fixture gap |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 7 | CLEAR | 9 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4/10 → 9/10, 22 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | OPEN | score: 4/10 → 4/10, TTHW: 15-20min → 5min |

- **CODEX:** 指出了 primary 社区预计算 view 不能直接复用到任意社区切换，这一点已并入本 plan
- **CROSS-MODEL:** Claude 与 Codex 对“任意社区切换必须运行时派生 visible snapshot”达成一致；对“三列 grid vs 浮动卡片”有分歧，已按用户决定保留三列 grid
- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement
