---
title: feat: 学习驾驶舱全局重构计划
type: feature
status: reviewed
date: 2026-04-23
origin: 用户基于学习驾驶舱补全过程提出的信息架构重排、13 寸小屏优化与学习队列需求
---

# feat: 学习驾驶舱全局重构计划

## Overview

这次不是继续给当前图谱页零散补功能，而是把现有学习驾驶舱收成一套真正可用的学习工作区。

当前仓库已经有一批可复用地基：

- `scripts/graph-analysis.js` 的 `buildLearning()` 已能生成 `learning.entry`、`learning.views`、`learning.communities`
- `templates/graph-styles/wash/graph-wash-helpers.js` 已有 `normalizeLearning()`、`resolveInitialMode()`、`getCommunityNodeIds()`、`createSafeStorage()`、`getVisibleLinks()`、`shouldAutoOpenDrawer()`
- `templates/graph-styles/wash/graph-wash.js` 已有 `setActiveCommunity()`、`setLearningMode()`、`updateVisibleSnapshot()`、`setupSearch()`、`applyMinimapCollapsed()` 等运行时基础设施
- 左侧导航骨架、右侧抽屉、小地图折叠、社区运行时派生都已经存在实现痕迹

但当前体验还有 5 个核心问题：

1. 左侧像半成品入口，不像正式功能区
2. 社区、搜索、筛选、推荐起点还没有收成统一上下文
3. 洞察、图例、小地图抢占画布，13 寸屏尤其难受
4. 右侧抽屉里“这是什么 / 为什么现在看 / 下一步看什么”三大块说明占掉正文空间
5. 左侧关闭按钮在桌面态没有真实收起行为，用户会感觉“点了没反应”

本轮已确认的产品决定：

1. “查看全部社区”采用**左栏内展开**，不弹独立层
2. 右侧三段大说明**直接删掉**
3. 推荐起点**先弱化保留**，不抢主位置
4. 学习笔记第一版**先做到能收进去**，左侧只显示数量或最近几条

## Goal

把页面收成三层主叙事：

- **左侧**：学习上下文，回答“我现在学哪块、怎么收窄范围、存了什么”
- **中间**：当前上下文下的可见图谱，回答“这块知识里有哪些节点和关系”
- **右侧**：当前节点正文与动作，回答“我现在读什么、能收藏什么、能记什么”

画布上的洞察、图例、小地图都退居二线，不再抢首页叙事。

## Target Information Architecture

### 左侧固定顺序

1. **社区分类**
   - 按节点数排序
   - 默认只展示 Top 3-4 个重要社区
   - 提供“查看全部社区”，在左栏内展开完整列表，左栏自身滚动
   - 点击社区后，中间只显示该社区节点

2. **当前主题聚焦**
   - 它是“当前社区内过滤器”，不是独立系统
   - 第一版只做 3 个选项：`只看核心节点`、`只看一级关联`、`只看高置信度`
   - 没选社区时退化为全局过滤器

3. **学习搜索**
   - 默认跟随当前上下文
   - 选了社区就在当前社区内搜
   - 开了主题聚焦后，只搜当前聚焦后的可见节点
   - 搜索框旁显示一句短提示，说明当前搜索范围

4. **学习队列**
   - 第一版只做：`收藏`、`学习笔记`
   - 左侧先显示数量和最近几条，不做完整笔记系统

5. **推荐起点**
   - 降级到底部辅助模块
   - 每次只显示一个当前上下文下的推荐起点
   - 先保留，不抢主位置

### 右侧抽屉

右侧抽屉回到“正文优先”：

- 保留：标题、元信息、正文、收藏、加入学习笔记、相邻节点
- 删除：`#dr-learning` 及其三块大说明（这是什么 / 为什么现在看 / 下一步看什么）
- 相邻节点保留，但默认折叠

### 画布二级信息

- **洞察**：保留，但默认折叠
- **图例**：不再常驻占屏，改成折叠或并入帮助/设置入口
- **小地图**：默认折叠，`<1180px` 直接隐藏
- **全局返回**：保留明确入口，用来回到全局视图

## State Model

推荐把运行时状态整理成 4 层，避免继续散落在各个按钮逻辑里。

### 1. 学习上下文 `state.learning`

复用现有 `activeMode` / `activeCommunityId`，补齐：

- `activeCommunityId`
- `focusMode`，取值：`all | core | one_hop | high_confidence`
- `searchQuery`
- `allCommunitiesExpanded`
- `recommendedStartNodeId`

### 2. 可见快照 `state.visible`

继续以 `updateVisibleSnapshot()` 为中心，但统一成一个真相源：

- `nodeIds`
- `nodes`
- `links`
- `searchIndex`

推荐计算顺序：

`当前社区范围 × 当前主题聚焦 × 搜索结果 × 边过滤`

这样搜索、小地图、底栏统计、fit、抽屉同步都只看同一份 visible snapshot。

### 3. 学习队列 `state.queue`

第一版直接走浏览器本地持久化：

- `favorites`
- `notes`
- `recentNoteIds`

持久化复用 `createSafeStorage()`，不引入新的写回系统。

### 4. 布局状态 `state.ui`

现有 `navOpen` 继续保留，补齐：

- `navCollapsed`
- `drawerOpen`
- `insightsCollapsed`
- `legendCollapsed`
- `minimapCollapsed`

## Key Decisions

1. **继续复用 learning contract，不重做上游数据结构。**
   - `buildLearning()` 仍然是推荐起点、社区排序、默认模式的上游来源
   - 推荐起点理由若需要展示，优先复用 `recommended_start_reason = community_hub` 做前端模板映射

2. **社区切换继续走运行时派生，不回退到 primary-only 预计算。**
   - 继续复用 `getCommunityNodeIds()`
   - 任意社区的可见节点集合都按当前 `nodes[].community` 运行时派生

3. **所有收窄逻辑统一汇入 visible snapshot。**
   - 社区分类、主题聚焦、搜索、边过滤必须收口到同一份 `state.visible`
   - 避免左侧说在社区 A，搜索却搜到社区 B，或小地图仍显示全图

4. **`路径 / 社区 / 全局` 模式继续保留，但降级为二级入口。**
   - 运行时仍保留 `activeMode`
   - 入口位置不再和左侧 5 段学习结构抢主叙事

5. **右侧大说明直接删除，不改成第二种大块。**
   - 若后续需要补学习引导，只允许做成一行短提示，不恢复三大块说明
   - 删除时要同步删掉死掉的 drawer contract、渲染逻辑和旧测试，不留兼容壳

6. **桌面态的关闭按钮必须有真实行为。**
   - 要么桌面支持收成窄 rail
   - 要么桌面不显示 close 按钮
   - 不再保留“按钮在，但视觉没变化”的状态

7. **洞察 / 图例 / 小地图归并成统一二级入口。**
   - 不再保留三个彼此独立、同时争抢画布的常驻块
   - 小地图仍保留自身折叠状态和 `<1180px` 隐藏规则，但入口归并到同一组辅助信息里

8. **localStorage 必须按稳定 wiki namespace 隔离。**
   - 不能继续用 `wiki-minimap-collapsed` 这类全局 key
   - namespace 需要稳定且跨刷新可复用，避免多个图谱互相污染

## Phase Roadmap

### Phase 0: 分支与约束

在真正改代码前先做两件事：

1. 从 `main` 开新分支，建议 `feat/learning-cockpit-reframe`
2. 先保留现有 `learning` contract 和社区运行时派生路线，不回退到 precomputed primary-only 逻辑

这是地基约束，不是功能批次。

### Phase 1: 先收结构，不先堆功能

**目标**：把页面改成“正式学习驾驶舱”的骨架，同时解决 13 寸最难受的问题。

**Files:**
- `templates/graph-styles/wash/header.html`
- `templates/graph-styles/wash/graph-wash.js`
- `tests/graph-html-learning-cockpit.regression-1.sh`
- `tests/graph-html-minimap.regression-1.sh`

**Approach:**

1. **左侧重排成正式功能区**
   - 在现有 `nav-panel` 内重组 5 个 section：
     - `nav-communities`
     - `nav-focus`
     - `nav-search`
     - `nav-queue`
     - `nav-start`
   - “查看全部社区”在左栏内展开，不开独立层

2. **顶部工具栏降噪**
   - 把主搜索框从顶部工具栏移到左侧学习搜索
   - 顶部工具栏只保留与画布直接相关的操作：返回全局、重排、居中、设置
   - `path/community/global` 不再作为同等级主按钮抢叙事，内部仍保留 `activeMode`

3. **修 13 寸布局**
   - 缩小桌面态固定宽度，建议把 `--nav-w` 从 280 收到约 248-260，把 `--drawer-w` 从 440 收到约 360-380
   - 不再只靠 `<1024px` 才切 overlay，新增紧凑桌面阈值
   - 推荐 3 档：
     - `>=1440px` 完整三列
     - `1180px-1439px` 紧凑三列
     - `<1180px` 左右侧改 overlay

4. **把死按钮变成真行为**
   - 桌面态：左侧要么支持真实收起成窄 rail，要么不显示关闭按钮
   - overlay 态：`nav-close` 继续作为关闭按钮
   - 不再让用户看到“点了没反应”的叉号

5. **画布二级信息降级**
   - 洞察、图例、小地图归并到统一二级入口
   - 默认整体收起
   - 小地图默认折叠，且 `<1180px` 直接隐藏
   - 相邻节点默认折叠

6. **右侧抽屉瘦身**
   - 删除 `#dr-learning`、`#dr-what-body`、`#dr-why-body`、`#dr-next-body`
   - 删掉 `renderDrawerLearning()` 及其调用链
   - 正文、收藏/笔记动作和相邻节点留在抽屉里
   - 同批删除旧 `drawer.section_order` 依赖和对应回归断言

**Verification:**
- 首屏终于像正式功能区
- 13 寸屏正文能看，图谱不再被浮层挤死
- 左侧关闭行为和响应式逻辑统一

### Phase 2: 打通社区、聚焦、搜索

**目标**：让左侧 3 块能力共用同一套上下文，而不是各管各的。

**Files:**
- `templates/graph-styles/wash/graph-wash.js`
- `templates/graph-styles/wash/graph-wash-helpers.js`
- `tests/js/graph-wash-learning.test.js`
- `tests/js/graph-wash-runtime-state.test.js`

**Approach:**

1. **社区分类继续复用运行时派生**
   - 继续以 `getCommunityNodeIds()` 派生任意社区的 visible node ids
   - 不回退到 `learning.views.community.node_ids` 只代表 primary 的旧问题

2. **加入“当前主题聚焦”三种过滤器**
   - `只看核心节点`
     - 在当前社区内按度数/连接中心性做轻量排序，只保留少量关键节点
   - `只看一级关联`
     - 若当前已有选中节点，显示“选中节点 + 社区内一跳邻居”
     - 若当前还没选中节点，回退为“推荐起点 + 一跳邻居”，复用现有 path 思路
   - `只看高置信度`
     - 复用现有边权重，只保留高于阈值的连接及其节点

3. **搜索跟随上下文**
   - 继续复用 `setupSearch()` 里的 `state.visible.searchIndex`
   - 但让 visible snapshot 真正包含“社区 + 聚焦 + 搜索 + 边过滤”的最终结果
   - 这样搜索结果、底栏计数、小地图和 fit 都是一致的

4. **保留“全局”入口，但不让它抢主叙事**
   - 回到全局时清掉当前社区高亮
   - 左侧仍显示社区列表和当前队列

**Verification:**
- 左侧 3 块能力变成一套逻辑
- 用户选了社区以后，搜索和聚焦都真的是“在这块里继续缩小范围”
- 中间图谱、底栏、小地图不再互相打架

### Phase 3: 学习队列 MVP

**目标**：让学习驾驶舱从“看图工具”变成“能留下学习痕迹的工具”。

**Files:**
- `templates/graph-styles/wash/header.html`
- `templates/graph-styles/wash/graph-wash.js`
- `templates/graph-styles/wash/graph-wash-helpers.js`
- `tests/js/graph-wash-runtime-state.test.js`

**Approach:**

1. **收藏**
   - 节点详情里加“收藏”动作
   - 左侧学习队列显示收藏数量和最近几个节点

2. **学习笔记**
   - 节点详情里加“加入学习笔记”动作
   - 第一版只做“能收进去”
   - 无选中文本时，默认把节点标题 + 摘要/正文前段写入笔记
   - 有选中文本时，把选中内容写入笔记
   - 左侧只显示数量和最近几条，不做完整预览编辑器

3. **本地持久化**
   - 全部走 localStorage
   - key 命名按 wiki 维度隔离，避免多个图谱互相污染

**Verification:**
- 用户可以把节点“收起来”和“记下来”
- 左侧学习队列成为有用模块，而不是装饰

### Phase 4: 弱化保留推荐起点 + 最终验证

**目标**：把推荐起点降到合适位置，并做真实样本验证。

**Files:**
- `templates/graph-styles/wash/graph-wash.js`
- `scripts/graph-analysis.js`（只有当需要丰富推荐理由时才改）
- `tests/fixtures/graph-interactive-multicomm/wiki/graph-data.json`
- `CHANGELOG.md`
- `README.md`

**Approach:**

1. **推荐起点弱化保留**
   - 放在左侧底部
   - 每次只显示一个当前上下文下的起点
   - 如果要显示理由，优先复用现有 `recommended_start_reason = community_hub`，在前端做固定模板文案映射，不急着扩 `buildLearning()`

2. **Design Validation**
   - 用 3 个真实 wiki 样本演练“第一次打开只看 30 秒”
   - 每个样本记录 4 行：
     - 左侧第一社区
     - 当前推荐起点
     - 中间默认子图
     - 右侧正文首屏可读性

3. **文档与版本**
   - 如果最终落地是功能改动，按项目规则在 push 前更新：
     - `CHANGELOG.md`
     - `README.md` 功能列表
     - 必要时版本号

## What to Delete vs Collapse vs Keep

### 建议直接删除
- 右侧抽屉的三段大说明
- 顶部工具栏里的主搜索框
- 左侧任何残留的旧学习入口占位结构
- `renderDrawerLearning()`、`drawer.section_order` 及其旧断言

### 建议默认折叠
- 统一二级入口本身
- 统一二级入口里的洞察
- 统一二级入口里的小地图
- 相邻节点
- 全部社区扩展列表（默认收起，点击后在左栏内展开）

### 建议保留但降级
- 推荐起点
- `路径 / 社区 / 全局` 模式入口
- 统一二级入口里的洞察 / 图例 / 小地图

## Not in Scope

本轮不做下面这些，避免重构中途继续膨胀：

- 不改 `learning` 上游 contract 的主结构，不重做第二套预计算 schema
- 不做完整学习笔记系统，不做笔记编辑器、富文本、导出、跨设备同步
- 不做新的 AI 推荐理由生成，不引入第二阶段 deep-analysis
- 不做真正的移动端重设计，本轮只收 13 寸到窄桌面的布局与 overlay 行为
- 不做新的图谱视觉风格迁移，继续保留现有 wash / paper 气质
- 不把社区、聚焦、队列逻辑拆进新的状态管理框架

## What Already Exists

这些已经在当前仓库里存在，本轮应直接复用，而不是推倒重来：

- `scripts/graph-analysis.js` 的 `buildLearning()` 已能生成推荐起点、默认模式和社区排序
- `templates/graph-styles/wash/graph-wash-helpers.js` 已有 `normalizeLearning()`、`resolveInitialMode()`、`getCommunityNodeIds()`、`getVisibleLinks()`、`createSafeStorage()`、`shouldAutoOpenDrawer()`
- `templates/graph-styles/wash/graph-wash.js` 已有学习模式切换、社区运行时派生、`updateVisibleSnapshot()`、搜索索引、小地图折叠等基础设施
- `tests/graph-html-minimap.regression-1.sh` 已经验证小地图 aria 与折叠状态，不需要重写为另一套测试形式
- `tests/js/graph-wash-bootstrap.test.js` 已经证明可以用 Node `vm` 做运行时状态片段测试

## Critical Files

### 必改
- `templates/graph-styles/wash/header.html`
- `templates/graph-styles/wash/graph-wash.js`
- `templates/graph-styles/wash/graph-wash-helpers.js`

### 视批次决定是否改
- `scripts/graph-analysis.js`
- `tests/js/graph-wash-learning.test.js`
- `tests/js/graph-wash-runtime-state.test.js`
- `tests/js/graph-wash-bootstrap.test.js`
- `tests/graph-html-learning-cockpit.regression-1.sh`
- `tests/graph-html-minimap.regression-1.sh`
- `tests/regression.sh`

### 样本与金文件
- `tests/fixtures/graph-interactive-multicomm/wiki/graph-data.json`

### 最终文档更新
- `CHANGELOG.md`
- `README.md`
- `TODOS.md`

## Test Review Addendum

当前测试现状有一个很直接的问题，旧回归仍然把 `dr-learning` 当成必存在结构，而本轮计划已经明确要把它整块删除。这意味着测试不能只是“补新断言”，而要同步清理旧时代的预期。

### 当前覆盖到的部分

- `tests/js/graph-wash-learning.test.js` 已覆盖 helper 层的 learning 默认值、降级模式、社区运行时派生、visible links 过滤
- `tests/js/graph-wash-bootstrap.test.js` 已覆盖 helpers 缺失和 `localStorage` getter 抛错时的 bootstrap 边界
- `tests/graph-html-minimap.regression-1.sh` 已覆盖小地图静态 hook 和 aria 折叠状态

### 当前缺口

- 没有测试 `state.visible` 真正收口 `社区 × 聚焦 × 搜索 × 边过滤`
- 没有测试左侧 5 段结构、全部社区展开、模式入口降级后的新 DOM 壳子
- 没有测试桌面 close 按钮到底是真的收成 rail，还是只在 overlay 态出现
- 没有测试统一二级入口的展开/折叠和 `<1180px` 下小地图隐藏
- 没有测试收藏 / 学习笔记 / recent 列表 / 刷新后持久化
- 没有测试 localStorage wiki namespace 隔离
- 旧 `graph-html-learning-cockpit.regression-1.sh` 还在要求 `dr-learning`、`dr-what-body`、`dr-why-body`、`dr-next-body` 存在

### 测试策略

1. **保留 helper 单测，但不再把运行时状态联动塞进 helper 测试里。**
   - `tests/js/graph-wash-learning.test.js` 继续测纯函数

2. **新增专门的运行时状态测试文件。**
   - 新文件：`tests/js/graph-wash-runtime-state.test.js`
   - 重点覆盖：
     - `updateVisibleSnapshot()` 的组合收窄语义
     - `focusMode` 切换
     - 搜索范围跟随当前 visible snapshot
     - queue 状态写入 / 读取
     - wiki namespace key 生成与隔离
     - 桌面 nav 收起状态与二级入口折叠状态

3. **保留 shell regression，但更新断言对象。**
   - `tests/graph-html-learning-cockpit.regression-1.sh` 改为验证：
     - 左侧 5 段正式结构
     - 模式入口仍存在，但不再是顶层主叙事块
     - 旧 `dr-learning` 相关 DOM 已消失
     - 新二级入口壳子存在
   - `tests/graph-html-minimap.regression-1.sh` 继续保留，重点验证小地图行为没退化

4. **把入口级验证挂回主回归。**
   - `tests/regression.sh` 继续串上：
     - shell regression
     - helper test
     - bootstrap test
     - 新的 runtime-state test

### 通过标准

- 删除 `dr-learning` 后，旧断言全部同步替换，不允许靠兼容空壳让测试过
- `state.visible` 至少要有一组组合测试能证明社区 / 聚焦 / 搜索 / 边过滤不会互相打架
- queue 至少要有一组持久化测试能证明收藏 / 笔记不会跨 wiki 串号
- 二级入口和桌面 nav 收起要有运行时行为断言，不能只 grep 静态 HTML

## Performance Review Addendum

这轮改造的性能重点不是“跑分”，而是别把本来还能用的图谱页改成每切一次聚焦都卡一下的状态。

### 主要压力点

1. **visible snapshot 变成唯一真相源后，计算频率会变高。**
   - 社区切换、聚焦切换、搜索输入、边过滤切换，都会触发 `updateVisibleSnapshot()`

2. **搜索会跟着当前上下文收窄。**
   - 如果每次输入都重扫全量节点 + 全量边，13 寸设备上最先感到迟钝的是输入反馈，不是 D3

3. **统一二级入口如果做成三个面板都同时常驻 DOM，只是视觉藏起来，收益会打折。**
   - 真正影响体验的是布局占位和重复渲染，不是名字换了

4. **桌面 rail / overlay 双模式会放大布局 thrash 风险。**
   - 如果每次开关都同时触发 grid 重排、drawer 重算、minimap 重画，页面会发飘

### 控制原则

1. **先过滤 node ids，再派生 nodes / links / searchIndex。**
   - 不要每一步都重建完整对象数组

2. **搜索只对当前 `state.visible.searchIndex` 做匹配。**
   - 不回退到全量 `state.searchIndex`，除非 visible snapshot 为空且这是明确设计

3. **高置信度过滤和一跳过滤继续走轻量运行时派生。**
   - 第一版不引入新预计算，不做复杂中心性算法
   - 核心节点优先复用现有 degree / link count 一类便宜指标

4. **二级入口默认收起，关闭时不做无意义渲染。**
   - 至少避免隐藏状态下仍持续更新小地图和洞察 DOM

5. **把 13 寸场景当主约束，不当边角 case。**
   - `1180px-1439px` 的紧凑三列是这轮真正要打磨的档位
   - `<1180px` 直接切 overlay，比在窄桌面强撑三列更稳

### 性能验收点

- 搜索输入时，结果面板响应不应明显慢于当前版本
- 社区 / 聚焦 / 高置信度切换后，底栏统计、小地图、画布可见子图保持同一语义，不出现一边更新一边没更新
- 桌面态 nav 收起 / 展开时，正文首屏和画布不出现明显跳闪
- 统一二级入口关闭时，不应继续占掉正文可视宽度

## Failure Modes

1. **左侧显示“当前社区”，但搜索结果跑出当前社区。**
   - 原因：搜索没走 `state.visible.searchIndex`
   - 控制：把上下文收口到 `updateVisibleSnapshot()` 后再生成 searchIndex

2. **删掉右侧学习说明后，旧 contract 和测试残留。**
   - 原因：只删 DOM，没删 `renderDrawerLearning()`、`drawer.section_order`、旧回归断言
   - 控制：同批删代码、删 contract、改测试

3. **桌面 close 按钮还是“点了没反应”。**
   - 原因：只保留 overlay 逻辑，没有桌面 rail 或显隐策略
   - 控制：为桌面态定义真实的 `navCollapsed` 行为，或桌面不显示 close

4. **多个 wiki 共享一套 localStorage key，互相污染折叠和队列状态。**
   - 原因：继续使用 `wiki-*` 这种全局 key
   - 控制：先定义稳定 namespace，再统一封装 key 生成

5. **二级入口名义上合并了，实际还是三个独立块同时抢屏。**
   - 原因：只是挪位置，没有统一入口和默认收起策略
   - 控制：入口级别统一，默认关闭，关闭态不占主布局宽度

## Parallel Worktree Lanes

如果要并行推进，实现上建议最多拆 3 条 lane，别拆成一堆互相打架的小分支。

1. **Lane A，结构与布局**
   - `header.html`
   - `graph-wash.js` 里 nav / drawer / 二级入口 / rail / overlay 相关部分

2. **Lane B，上下文与状态**
   - `graph-wash.js` 里 visible snapshot / focus / search / queue / namespace
   - `graph-wash-helpers.js` 里必要的轻量 helper

3. **Lane C，测试与文档**
   - shell regression
   - `node:test` 运行时状态测试
   - `TODOS.md`、`README.md`、`CHANGELOG.md`

约束：
- Lane A 先定 DOM id 和状态名，Lane B 再接状态语义，不然测试会反复返工
- Lane C 不要先写死旧 DOM，必须等 Phase 1 的壳子稳定后再补最终断言

## Verification

### 代码级
- `node --test tests/js/graph-wash-learning.test.js`
- `node --test tests/js/graph-wash-bootstrap.test.js`
- `node --test tests/js/graph-wash-runtime-state.test.js`
- 受影响的 graph HTML regression 脚本全跑通
- 继续跑 `tests/regression.sh`

### 交互级
- 生成/打开实际图谱页面，手动验证：
  1. 选社区
  2. 切“当前主题聚焦”
  3. 在当前上下文里搜索
  4. 打开节点详情
  5. 收藏
  6. 加入学习笔记
  7. 展开/收起全部社区
  8. 折叠/展开统一二级入口、小地图、相邻节点
  9. 桌面态收起/展开左侧导航
- 至少在 3 档宽度验证：`>=1440`、约 `1280`、`<1180`
- 重点看 13 寸笔记本场景：正文首屏、图谱画布、左侧导航、右侧抽屉是否还互相挤压

### Push 前项目规则
每次真正要 `git push` 前，按仓库规则执行：
- `bash install.sh --dry-run --platform codex`
- 跑受影响的 fixtures / regression
- `grep -r '/Users/kangjiaqi\|康佳琦' scripts/ templates/ tests/ SKILL.md`
- 更新 `CHANGELOG.md` / `README.md` / 版本号（如果属于 feat/fix）

## Risks

1. **风险：继续把“社区 / 聚焦 / 搜索 / 边过滤”拆着算**
   - 控制：所有收窄逻辑统一汇入 `updateVisibleSnapshot()`

2. **风险：为了做“当前主题聚焦”又去扩一套重型预计算**
   - 控制：第一版尽量复用现有 degree、edge weight、community、path 逻辑，先走运行时轻量派生

3. **风险：左侧信息变多，反而更挤**
   - 控制：左栏只保留 5 个 section，推荐起点弱化，全部社区默认收起，队列先做轻量版

4. **风险：右侧抽屉删除大说明后，完全没有学习引导**
   - 控制：后续若需要，只加一行短提示，不恢复大块说明
