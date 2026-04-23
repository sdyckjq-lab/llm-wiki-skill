---
title: feat: Learning cockpit for wash graph
type: feature
status: approved
date: 2026-04-23
origin: 2026-04-23 in-session design review and implementation planning
deepened: 2026-04-23
---

# feat: Learning cockpit for wash graph

## Overview

这次改动的目标，不是给现有图谱页再补一个左栏，而是把首页第一分钟的叙事从“看图”改成“开始学”。

现有 wash 页面已经有稳定的图谱渲染、搜索、过滤、Insights、小地图和右侧抽屉，但默认打开时仍然更像一个“看图器”：

- 不会主动告诉用户该从哪里开始
- 不能稳定解释“为什么先看这个”
- 默认状态仍然把全局图和既有工具能力摆在首页叙事中心

本轮的目标，是在保留“中间图谱 + 右侧抽屉”主结构的前提下，把它升级成一个**学习驾驶舱**：

- 首页先给推荐起点和当前最重社区
- 中间默认显示局部学习子图，而不是完整大图
- 右侧抽屉先回答“这是什么 / 为什么现在看 / 下一步看什么”

## Problem Frame

现有实现已经解决了“图谱能生成、能看、能搜、能展开”的问题，但还没有解决“用户第一次打开时不迷路”的问题。

从现有骨架看：

- `templates/graph-styles/wash/header.html` 已有稳定的 `.app` 两列布局和成熟的右侧 drawer
- `templates/graph-styles/wash/graph-wash.js` 已经有完整的节点选中、高亮、drawer 打开、search、filters、Insights、小地图与 Tweaks
- `scripts/build-graph-data.sh` + `scripts/graph-analysis.js` 已经能预计算社区、边权与洞察

所以这轮真正缺的，不是新的渲染引擎，而是一个明确的**默认进入协议**：

1. 用户打开页面后应该先看到什么
2. 默认聚焦哪个社区、哪个节点、哪种视图
3. 右侧抽屉怎么把节点点击翻译成学习动作
4. 图规模、社区质量或路径生成不足时怎么降级

## Requirements Trace

- R1. 首屏默认进入学习入口，不再直接把完整图谱作为默认叙事。
- R2. V1 必须支持 `path / community / global` 三种显式模式切换。
- R3. 默认推荐起点、当前最重社区和降级规则必须走预计算，而不是前端现算。
- R4. 右侧抽屉必须稳定展示“这是什么 / 为什么现在看 / 下一步看什么”这三个学习区块。
- R5. 这轮不能把现有 wash 图谱拆成第二套系统；所有学习入口都要复用既有 graph runtime 主链路。
- R6. 现有 graph-data、HTML shell 与 JS bootstrap 回归必须继续稳定，不能让首页叙事改造把已有功能回归打碎。

## Scope Boundaries

- 不重写 graph renderer，不替换 d3/rough/marked/purify 现有技术栈。
- 不把页面改成新的三栏主布局；保留 `.app` 两列结构。
- 不在前端重新计算社区、路径或学习推荐规则。
- 不引入 reducer 或新的状态管理框架，第一版先用显式状态。
- 不把分享 / 导出 / 截图传播能力绑进同一轮。
- 不做实时 LLM 解释生成；学习解释先用规则和模板。
- 不在这一轮处理搜索升级、深色模式、真正响应式重排等后续增强项。

## Context & Research

### Relevant code and patterns

- `templates/graph-styles/wash/header.html`
  - `:132-149` 顶层 `.app` 现在是主区 + drawer 两列 grid
  - `:1210-1254` `tools` 区已有 search / filters / fit / refit / tweaks
  - `:1256-1299` `canvas-wrap` 内已有 Insights、小地图、图例、toast、loading 等浮层宿主
  - `:1312-1334` 右侧 drawer DOM 骨架已经成熟

- `templates/graph-styles/wash/graph-wash.js`
  - `:31-52` 当前 state 只有 graph/runtime 基础状态，没有学习模式状态
  - `:895-1000` `selectNode()` / `openDetailDrawer()` 是现有“选中节点 + 打开抽屉”的主链路
  - `:1025-1030` `focusNode()` 已经把“选中 + 打开 + 居中”收敛成统一入口
  - `:1032-1116` `renderInsights()` 适合作为学习入口 panel 的宿主
  - `:1430-1442` boot 流程稳定，但当前默认不会自动选中学习入口

- `scripts/build-graph-data.sh`
  - `:304-328` 目前输出 `meta / nodes / edges / insights`
  - `:274-295` 已有 `meta.initial_view`，可作为简化全局视图底座

- `scripts/graph-analysis.js`
  - `:103-149` 已有边权计算
  - `:282-359` 已有 Louvain 社区划分与标签选择
  - `:361-495` 已有基础洞察生成
  - `:497-547` `analyzeGraph()` 是新增 `learning` 预计算的合适入口

### Test surface

- `tests/regression.sh:1293-1584`
  - 已覆盖 graph-data golden、graph html assembly、build failure、drawer/search/minimap/insights/a11y/mobile 等回归
- `tests/js/graph-wash-bootstrap.test.js`
  - 已覆盖 helpers 缺失、localStorage 抛错等 bootstrap 容错
- `tests/graph-html-insights.regression-1.sh`
  - 当前专门保护 `insights-panel` shell 和 weighted neighbor hooks

### Institutional learnings

- `docs/solutions/ui-bugs/graph-wash-null-safety-and-label-truncation-fix-2026-04-21.md`
  - 新增可选 DOM / 折叠状态时，要补 Node 运行时断言，不要只靠 grep 检查字符串存在
- `docs/solutions/developer-experience/graph-style-simplification-to-wash-only-2026-04-20.md`
  - graph shell 改造时，回归应更新到新边界，但不要继续保护已经不重要的旧实现细节

## Key Technical Decisions

- learning metadata 必须走预计算，并新增顶层 `learning` contract。
  - 理由：推荐起点、社区强弱、模式降级和 drawer 学习解释顺序都属于默认协议，不该在前端临时推导。

- 只增不改现有 `meta / nodes / edges / insights`。
  - 理由：现有 graph-data golden 和 HTML build 依赖这些字段，新增顶层 `learning` 的破坏面最小。

- 首页学习入口优先复用现有 `insights-panel` 壳，而不是新开第三主列。
  - 理由：当前 `.app` 两列布局和右侧 drawer 已经稳定，真正需要重排的是 `canvas-wrap` 内的信息层级，而不是整页骨架。

- 所有学习入口必须汇聚到现有 `selectNode()` / `openDetailDrawer()` / `focusNode()` 主链路。
  - 理由：这样能避免把学习驾驶舱做成第二套系统，减少左右不同步与测试倍增问题。

- 第一版只做显式状态扩展，不上 reducer。
  - 理由：当前新增状态仍然可以被清晰写成显式字段和小函数；过早上 reducer 只会把首页叙事改造和状态架构升级绑死。

- 路径视图 V1 固定定义为“推荐起点驱动的受限学习子图”。
  - 理由：这能把 scope 收住，避免在这轮把 path 语义膨胀成 shortest path、教程章节、个性化推荐等多种概念混合体。

- `path / community / global` 必须驱动**真子图模式**，不是只在全局图上做弱高亮。
  - 理由：这轮的产品目标是让首页第一眼变成“开始学”，不是继续让用户被整张大图压住。

- `activeMode` 必须是前端当前模式的唯一真相，panel 激活态不再单独存第二份状态。
  - 理由：同一页面不该同时维护 `activeMode + panelTab` 两份模式值，否则按钮高亮和实际子图很容易漂移。

- 子图模式下的 search / fit / minimap / footer 必须共享同一份 visible snapshot。
  - 理由：如果只有画布隐藏了节点，而外围能力仍按全图工作，页面语义会变成“看起来是子图，实际还是全图”。

- mode 切换默认只更新 visible snapshot 与居中，不重启力导向 simulation。
  - 理由：学习驾驶舱更像同一张图上的视角切换，不该每点一次模式按钮都像重新布一张图。

## Open Questions

### Resolved during planning

- 这轮要不要把学习入口做成新的左侧主列？
  - 结论：不要。保留 `.app` 两列，优先重排 `canvas-wrap` 内的首屏叙事。

- learning metadata 是不是应该前端现算？
  - 结论：不要。社区强弱、推荐起点、默认模式和降级规则都走预计算。

- 右侧抽屉要不要新做一套学习 drawer？
  - 结论：不要。复用现有 drawer，只升级内容顺序。

- 第一版要不要直接上 reducer？
  - 结论：不要。先用显式状态与明确升级门槛。

### Deferred to implementation

- `learning` 里是否在第一版就加入 `nodes[].learning` 粒度的逐节点教学元数据。
  - 当前建议先不做，先把顶层默认进入协议立住。

- 学习入口 panel 是否保留一小块“次级洞察”区，还是完全让 Insights 退到二级入口。
  - 当前建议保留，但不再占首页主叙事位。

## High-level technical design

### Recommended contract shape

`graph-data.json` 顶层新增 `learning`：

```json
"learning": {
  "version": 1,
  "entry": {
    "recommended_start_node_id": "Transformer",
    "recommended_start_reason": "community_hub",
    "default_mode": "path"
  },
  "views": {
    "path": {
      "enabled": true,
      "start_node_id": "Transformer",
      "node_ids": ["Transformer", "Attention", "Encoder"],
      "degraded": false
    },
    "community": {
      "enabled": true,
      "community_id": "arch",
      "label": "深度学习架构",
      "node_ids": ["Transformer", "Encoder", "Decoder", "arch"],
      "is_weak": false,
      "degraded": false
    },
    "global": {
      "enabled": true,
      "node_ids": ["Attention", "Transformer", "GPT"],
      "degraded": false
    }
  },
  "communities": [
    {
      "id": "arch",
      "label": "深度学习架构",
      "node_count": 4,
      "source_count": 0,
      "internal_edge_weight": 2.8,
      "is_primary": true,
      "is_weak": false,
      "recommended_start_node_id": "Transformer"
    }
  ],
  "drawer": {
    "section_order": [
      "what_this_is",
      "why_now",
      "next_steps",
      "raw_content",
      "neighbors"
    ]
  },
  "degraded": {
    "path_to_community": false,
    "community_to_global": false
  }
}
```

### Minimal front-end state extension

在现有 `state` 上最小扩展：

```js
state.learning = {
  data: normalizeLearning(DATA.learning || defaultLearning()),
  activeMode: null,
  activeCommunityId: null,
  recommendedStartNodeId: null,
  pathDegraded: false,
  communityDegraded: false
};

state.visible = {
  nodeIds: new Set(),
  nodes: [],
  links: [],
  searchIndex: []
};

state.ui = {
  bootstrappedEntry: false
};
```

约束：

- `state.learning.activeMode` 是当前模式的唯一真相，不再单独维护 `panelTab`
- `state.visible` 是子图模式的共享快照，search / fit / minimap / footer 全部消费它
- learning 的纯逻辑优先放进 `graph-wash-helpers.js`，例如：`defaultLearning()`、`normalizeLearning()`、`resolveInitialMode()`、`getVisibleNodeIds()`、`getVisibleLinks()`、`shouldAutoOpenDrawer()`

### Event flow

- boot 结束后执行 `bootstrapLearningEntry()`：
  - path 可用 → 进入 `path` 并聚焦推荐起点
  - path 不可用 → `community`
  - 社区过弱 / 无可用社区 → `global`
- path 失败时固定降级到 `community`，不引入 `start-only` 第二套降级语义
- panel 切 mode：更新 `activeMode`、visible snapshot、panel 激活态和 drawer 上下文
- 图中点击节点：保持当前 mode，只刷新 `selected` 与 drawer
- drawer 内 next step：继续复用 `selectNode()` + zoom translate
- 只有 `path` 模式默认自动展开 drawer；`community / global` 默认不强制展开

## Implementation units

- [ ] **Unit 1: 预计算 learning metadata contract**

**Goal:** 给 wash graph 提供稳定的学习入口输入，而不是让前端临时推导。

**Requirements:** R1, R2, R3, R6

**Dependencies:** None

**Files:**
- Modify: `scripts/graph-analysis.js`
- Modify: `scripts/build-graph-data.sh`
- Modify: `tests/expected/graph-data-sample.json`
- Modify: `tests/expected/graph-data-empty.json`
- Test: `tests/regression.sh`

**Approach:**
- 在 `analyzeGraph()` 产出的顶层新增 `learning`
- 复用现有社区划分、边权、`initial_view` 与 `insights` 作为 learning 生成输入
- 固定推荐起点、当前最重社区、三种模式入口、drawer 区块顺序与降级标志
- 保持现有字段不变，`empty wiki` 也输出稳定空 `learning`

**Verification:**
- sample / empty graph-data golden 更新后稳定通过
- test mode 两次输出完全一致
- 现有 community clustering 与 confidence type 回归不回退

- [ ] **Unit 2: 把 wash 首页改成学习入口优先**

**Goal:** 让首屏先给学习入口，而不是把 generic insights 和全局图作为默认叙事。

**Requirements:** R1, R2, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `templates/graph-styles/wash/header.html`
- Test: `tests/graph-html-insights.regression-1.sh`
- Test: `tests/graph-html-toolbar.regression-1.sh`
- Test: `tests/graph-html-search.regression-1.sh`
- Test: `tests/graph-html-a11y.regression-1.sh`

**Approach:**
- 保留 `.app` 两列布局和现有 drawer
- 复用 `insights-panel` 作为学习入口 panel 宿主
- 在 `tools` 区加入 `path / community / global` 显式模式切换
- 让右侧 drawer 内容顺序变成“这是什么 / 为什么现在看 / 下一步看什么 / 原始内容 / 相邻节点”

**Verification:**
- graph HTML shell 回归更新后通过
- 关键 DOM hook 仍存在，不把现有 tests 全部推倒重写

- [ ] **Unit 3: 接入学习模式状态与默认进入链路**

**Goal:** 用最小状态扩展支撑默认自动进入、三种模式切换和左中右联动。

**Requirements:** R1, R2, R4, R5

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `templates/graph-styles/wash/graph-wash.js`
- Optional: `templates/graph-styles/wash/graph-wash-helpers.js`
- Test: `tests/js/graph-wash-bootstrap.test.js`
- Optional test: new JS test for learning state/fallback logic

**Approach:**
- 在现有 state 上新增 `learning`、`visible` 与 `ui` 三小块显式状态，但当前模式只保留 `learning.activeMode` 一个真相源
- 把默认模式选择、降级规则、visible set 计算和 drawer 默认展开规则优先抽到 `graph-wash-helpers.js`
- 新增 `defaultLearning()`、`normalizeLearning()`、`hydrateLearningState()`、`bootstrapLearningEntry()`、`setLearningMode()`、`renderLearningPanel()`、`renderDrawerLearningSection()`
- 所有学习入口最终复用 `selectNode()` / `openDetailDrawer()` / `focusNode()`
- 不在前端重新计算 path/community 强弱，只应用预计算结果
- mode 切换默认只更新 visible snapshot 与居中，不重启 simulation；显式“重排”按钮继续承担 restart

**Verification:**
- 缺失 `DATA.learning` 时不白屏
- boot 默认进入推荐起点
- path 失败固定退到 `community`，弱社区固定退到 `global`
- 只有 `path` 模式默认自动展开 drawer
- 切 mode 与点击节点不会把 panel / graph / drawer 弄乱
- search / fit / minimap / footer 在子图模式下与 visible snapshot 保持一致

- [ ] **Unit 4: 补齐学习驾驶舱回归与降级保护**

**Goal:** 把这轮改动从“能跑”收口成“不会把现有 wash 图谱搞坏”。

**Requirements:** R6

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `tests/regression.sh`
- Modify: `tests/graph-html-insights.regression-1.sh`
- Modify: `tests/js/graph-wash-bootstrap.test.js`
- Add: `tests/js/graph-wash-learning.test.js`
- Add: `tests/graph-html-learning-cockpit.regression-1.sh`
- Optional: add runtime assertion coverage for visible snapshot consumers

**Approach:**
- 先锁 data contract，再锁 HTML shell，再补 bootstrap / fallback / visible snapshot 单测，最后做运行时回归
- 对新增可交互状态优先补 Node `vm` 断言，而不是只靠 grep
- 新增 dedicated learning 纯逻辑单测，避免把所有规则都塞进 bootstrap test
- 新增 learning cockpit 专门 HTML 回归，锁学习 panel shell、mode switch hooks 和 drawer 学习区块顺序
- 重点看自动默认选中后的 `drawer-open` / `aria-hidden` / fit / search / minimap / footer 初始行为

**Verification:**
- `bash tests/regression.sh` 全绿
- graph HTML 独立回归全绿
- `graph-wash-bootstrap` 与 `graph-wash-learning` 单测全绿
- 子图模式下 search / fit / minimap / footer 与 visible snapshot 保持一致
- 手工打开生成后的 `wiki/knowledge-graph.html`，验证默认入口、模式切换、drawer 学习解释与降级路径

## Risks and failure modes

- **做成第二套系统**：panel click、graph click、drawer click 各自维护状态，最终导致左右不同步。
- **前端现算学习规则**：社区强弱与默认入口在浏览器里重新推导，和预计算结果漂移。
- **顶层布局改太大**：把 `.app` 改成三栏主布局，导致 drawer/mobile/search/a11y 回归一起炸。
- **path 语义漂移**：一会儿是学习序列，一会儿是 shortest path，一会儿是推荐链，导致实现和测试都无法收口。
- **自动默认选中副作用**：旧默认态从“无选中节点”变成“默认选中推荐起点”，容易影响 fit、search、minimap、drawer 初始行为。
- **contract 膨胀过快**：第一版就把节点级教学元数据、路径文案、个性化逻辑全塞进 `learning`，导致 golden 和前后端边界同时失稳。

## Testing strategy

推荐按下面顺序执行验证：

1. **data contract**
   - 更新并通过 sample / empty graph-data golden
   - 确保 test mode 稳定

2. **HTML shell**
   - 更新 `graph-html-*` 回归，确认学习入口 shell、toolbar、search、drawer、a11y hook 仍稳定

3. **runtime / bootstrap**
   - 补 `graph-wash-bootstrap` 相关 JS 单测
   - 覆盖 learning 缺失、path/community/global 降级、默认自动进入推荐起点

4. **manual verification**
   - 运行 `bash scripts/build-graph-data.sh <wiki_root>`
   - 运行 `bash scripts/build-graph-html.sh <wiki_root>`
   - 打开 `wiki/knowledge-graph.html`，验证推荐起点、模式切换、drawer 学习解释与降级路径

## Suggested execution order

建议按 3 个提交边界实施，便于后续 review：

1. `graph-data contract + golden`
2. `HTML shell + runtime wiring`
3. `tests + fallback hardening`

实施约束：

- Unit 1 先落 `learning` contract，并把 sample / empty golden 锁住
- Unit 2 与 Unit 3 顺序执行，不并行拆 worktree；两者都会重改 `templates/graph-styles/wash/`
- Unit 3 落地时同时引入 visible snapshot，不要先做“假子图模式”再回头补外围同步
- Unit 4 最后统一收口 dedicated learning tests、learning cockpit HTML regression 与 visible snapshot 一致性断言

这样能把“数据层决定了什么”和“UI 如何消费这些数据”分开审，不会把 contract、layout、状态、测试四种变化混成一个无法 review 的大 diff。
