# Paper 视觉 + 布局 移植设计（图谱后置）

日期：2026-06-20
状态：已转执行计划（被 plan 的评审修订更新）
当前分支：`feat/paper-ui`

> **执行以 plan 为准**：本 spec 是设计意图；几处实现细节已被 `docs/plans/2026-06-20-paper-ui-port-phased-plan.md` 的 plan-eng-review + Codex 修订**取代**——①不引入 `.pw-*` 并行类，就地演进现有 `.msg-*/.chat-*` 等类；②强调色用 `data-accent` 预设而非行内变量；③`ModelSelector` 组件不存在，需新建（复用 SettingsPanel 的 config 路径）；④TopBar 不显示「篇数」（`KnowledgeBaseInfo` 无此字段）；⑤搜索 ⌘K 做客户端真搜索；⑥PRODUCT.md 对齐提前到实现第一步。以 plan 为实现真相。

## 目的

把已定稿的 Paper 设计原型（`/Users/kangjiaqi/designs/llm-wiki-skill/bright/paper-final-v2.html`，独立 design 仓库）的**视觉语言 + 布局**移植并复刻进 `workbench/web`，作为产品的新默认外观。

这份文档只确定移植的产品与工程边界，方便后续直接写实施计划。它**不**重新评估视觉方向（方向已通过 baoyu-design 多轮迭代锁定），**不**包含图谱画布内部视觉（明确后置），**不**做 MVP 取舍（除图谱外尽量一步到位）。

设计原型与真实 app **同组件架构、同「CSS 变量 + 语义类名」范式**——原型本就是照 workbench 真实结构画的（同名组件 ChatPanel / Sidebar / Composer / ToolStatus / RightDrawer；真实 app 没有 ModelSelector，需要新建 TopBar 模型选择控件并复用 SettingsPanel 的配置路径）。因此本次是「换皮 + 按 v2 重排布局」，不是重写业务逻辑。

## 设计结论

1. **以 v2 的视觉 + 布局为准做像素级复刻**，而不是「v2 视觉套真实结构」。引入 v2 的统一顶栏、药丸 Tab、气泡对话、单卡 Composer、右抽屉阅读视觉、外观调参面板。
2. **默认浅色暖纸主题**（真实 app 现在默认 dark，本次改默认 light）；夜灯（暖深色）一键切换保留。
3. **Tweaks 外观调参做成真实用户偏好**：纸张质感 / 强调色 / 用户气泡 / 手写体点缀 / 密度，随时切换、localStorage 持久化，零后端改动。
4. **真实 app 已有但 v2 没有的功能全部保留并 Paper 化**：导出、批量消化、产物 Artifacts、素材消化 input-chip、拖拽消化、抽屉 resize/tab/全屏、批量消化面板等。
5. **图谱后置**：本次只把图谱 Tab 入口 / 工具条 / 图例 Paper 化到与整体不突兀；**图谱画布内部（Sigma 渲染配色）不动**。图谱活地图 Paper 化作为独立后续任务（见末节）。
6. **未实现的功能留 UI + 接口，后期接真功能**，不在本次强行做后端。

一句话：**v2 的样子，真实的功能，图谱留到下一程。**

## 为什么引入统一 TopBar 是最优解，而不是沿用 statusbar

v2 的布局里，模型选择器、新对话、主题切换、外观调参、搜索这些控件是**横跨「对话」和「图谱」两个视图共享的一条顶栏**，位于 Tab 之上。

真实 app 现在没有顶栏：知识库信息分散在 Sidebar（库列表）和每个视图各自的 statusbar（`ChatPanel` 顶部有一条 `.statusbar` 显示库名 + 模型 pill；`GraphPanel` 另有自己的头部）。其后果是**主题切换按钮被复制传进 ChatPanel 和 GraphPanel 两处**（`App.tsx` 里 `onToggleTheme` 分别传给两个面板）。

引入一条**共享 TopBar** 不只是为了像 v2，它本身是更干净的架构：

- 跨视图共享的控件（模型、新对话、主题、外观、搜索）只需要在一处声明，消除当前的双份传递与潜在不一致。
- 视图切换（对话/图谱）只切 Tab 下面的主区，顶栏稳定不动，符合「顶栏是全局控件、Tab 是视图、主区是内容」的清晰分层。
- `ChatPanel` 的 `.statusbar` 与 `GraphPanel` 的头部职责被上提，两个面板回归「只渲染各自内容」，边界更单一。

因此 TopBar 是「顺手把结构理顺」，不是为了好看的妥协。**采用。**

## 用户拍板的具体决策（硬约束）

- **去掉**顶栏左侧知识库头里的「模型名 + 下拉」。左侧只保留：书本图标 + 库名 + origin/valid 标记，纯展示，不可点、无 chevron；不显示篇数（`KnowledgeBaseInfo` 无此字段）。模型展示与切换只在右侧 TopBar 模型控件，控件需新建并复用 SettingsPanel 的 `config.modelRoles.main` 读写路径。
- **去掉**侧栏左下角的「夜灯模式」项（与右上角主题切换功能重合）。主题切换只保留在右上角顶栏。
- **默认主题 = 浅色暖纸**。
- **主页凸显三个现有功能**：导出（HTML/PDF/PPTX…）、搜索 ⌘K、批量消化。
- **搜索 ⌘K**：本次做当前库页面引用 metadata 的本地真搜索，数据来自 App/TopBar 级 refs cache；真实跨库 / 全文搜索后端拆为子任务，不在本次扩 scope。
- 其余 v2 元素**全部保留复刻**。

## 范围

### 本次做

- 全局 Paper token 层（浅纸 + 夜灯）映射到现有 `--app-*` 与 shadcn 变量。
- 新 TopBar 组件 + 移除/上提原 statusbar 控件。
- Sidebar Paper 化（去夜灯项）。
- 对话区：扁平消息 → 气泡；工具状态暖化；Composer 单卡化；概念链接 / 荧光笔样式。
- RightDrawer 阅读视觉 Paper 化（保留 resize/tab/全屏）。
- 外观偏好系统（`lib/appearance.ts` + `AppearancePanel`）+ localStorage 持久化。
- 导出 / 批量消化入口凸显并 Paper 化；搜索 ⌘K 做当前库 refs 本地过滤。
- 图谱 Tab 外壳 / 工具条 / 图例 Paper 化到不突兀。

### 本次不做（后续任务）

- 图谱**画布内部**视觉（Sigma 节点 / 社区配色，在 `packages/graph-engine` 的 `render/render-styles.ts`）。
- 真实跨库 / 全文搜索后端。
- 任何与外观无关的后端改动。

## 布局骨架（以 v2 为准）

```
app-shell（竖向 flex）
├─ TopBar（新增）
│   ├─ 左：知识库头 = 书本图标 + 库名 + origin/valid（纯展示，不显示模型名 / 不下拉 / 不显示篇数）
│   └─ 右：搜索⌘K · 模型选择器(新建) · 新对话 · 主题切换 · 外观齿轮(Tweaks)
├─ body（横向 flex）
│   ├─ Sidebar：笔记本列表 + 会话列表 + footer(图谱活地图 · 设置)【去「夜灯模式」】
│   ├─ Main：药丸 Tab(对话 / 图谱) + 对话视图 ｜ 图谱视图
│   └─ RightDrawer：阅读抽屉（节点 / wiki / 产物，保留 resize / tab / 全屏）
├─ AppearancePanel（右上齿轮触发的 Tweaks 浮层，右上角展开）
├─ SettingsPanel（侧栏「设置」→ 现有配置模态，沿用）
└─ BatchDigestPanel（沿用，Paper 化）
```

落地分工（避免功能重合）：

- **右上角齿轮 = 外观调参（AppearancePanel）**：纸张 / 配色 / 气泡 / 手写 / 密度 / 主题。
- **侧栏「设置」= 现有 SettingsPanel 配置模态**（模型凭证、库登记等），不变。

## 样式与 token 策略

1. **Paper token 层**：把 v2 的 `:root` / `[data-theme="light"]` / `[data-theme="dark"]` 暖纸 / 夜灯变量，映射到 `workbench/web/src/index.css` 现有的 `--app-*` 与 shadcn 变量（沿用 design 仓库 `bright/paper-theme.css` 的映射思路，但**补全 v2 实际用到、`paper-theme.css` 漏掉的**：社区色 `--comm-*`、纸张层 `--paper-glow / --paper-vignette / --paper-mottle / --paper-grain`、`--dot`、暖阴影 `--shadow / --shadow-lg`）。
2. **组件样式层**：不引入 `.pw-*` 并行层；把现有 `.msg-*` / `.chat-*` / `.tool-*` / `.drawer-*` 等组件类就地演进为 Paper 外观。真实独有组件（导出栏、批量面板、抽屉 resize 把手等）保留既有类并 Paper 化对齐。
3. **字体**：`index.html` 引入 Plus Jakarta Sans（正文）+ Caveat（手写点缀）+ JetBrains Mono（路径 / 代码）。注意 CJK：Latin 在前、CJK 系统字体兜底，CJK 正文 line-height 放大。
4. **data 属性**：`documentElement` 上 `data-theme`（已有）+ 新增 `data-paper` / `data-userbubble` / `data-hand` / `data-density` / `data-accent`；强调色由 CSS 里的 `data-accent` 预设统一驱动（`--accent` / `--accent-deep` / `--accent-soft`），不用行内 JS 变量。

token 替换只换「颜色 / 字体」，达不到复刻；真正复刻需要组件级结构改动（气泡、单卡 Composer、药丸 Tab、摘要卡去左竖条等），本设计的组件清单即覆盖这些。

## 外观偏好（Tweaks = 真实功能）

- 新 `workbench/web/src/lib/appearance.ts`：
  - `AppearancePrefs` 类型：`{ theme, paper, accent, userbubble, hand, density }`。
  - 取值：`theme: light|dark`；`paper: clean|grid|laid`；`accent: terracotta|clay|amber|rose`；`userbubble: soft|solid`；`hand: on|off`；`density: cozy|compact`。
  - 读写 localStorage（键前缀 `llm-wiki-agent-appearance-*`，SSR-safe，`typeof window` 守卫），并提供 `applyAppearance(prefs)`：把上述写成 `documentElement` 的 data 属性；强调色通过 `data-accent` 预设生效。
  - 复用现有 `theme` 机制：`theme` 仍走现有 `THEME_STORAGE_KEY` 与 `dataset.theme` + `.dark` class，但**默认值改为 `light`**；其余外观项新增。
- 新 `AppearancePanel` 组件：复刻 v2 `TweaksPanel`（分段控件 + 配色色板），右上齿轮 popover，右上角展开，带显隐。
- 状态归属：偏好状态由 `App` 持有（与现有 `theme` 并列），通过一个 effect 应用到 `documentElement`（仿现有 theme effect），`AppearancePanel` 受控。
- **默认值**：`theme=light` · `paper=clean` · `accent=terracotta` · `userbubble=soft` · `hand=on` · `density=cozy`。

## 组件改造清单

| 组件 / 文件 | 改造 | 备注 |
|---|---|---|
| `App.tsx` | 新增 TopBar 挂载、外观偏好状态 + effect、移除分散的 `onToggleTheme` 双传 | 顶栏控件回流到此处统一编排 |
| **TopBar（新）** | 左 kb 头（静态，不显示模型名 / 不下拉 / 不显示篇数）+ 右控件组（搜索⌘K 当前库 refs 本地搜索、模型选择器[新建]、新对话、主题、外观齿轮） | 共享于对话 / 图谱两视图 |
| `ChatPanel.tsx` | 移除 `.statusbar`（控件上提 TopBar）；扁平消息 → 气泡（就地演进 `.msg-row/.msg-avatar/.msg-body/.msg-content` 等类，用户 soft/solid 两态、头像区分）；导出栏 Paper 化并凸显；保留 input-chip / 拖拽消化 | 最大块 |
| `MarkdownView.tsx` | 概念链接补 `.at` Paper 下划线样式（点击开抽屉逻辑已存在）；荧光笔 `.hl` | 功能已在，补样式 |
| `ToolStatusRunway.tsx` / `ToolHistorySummary.tsx` | 暖化对齐 v2（脉冲竖条 + 微光轨道 → 折叠 chips），保留真实信息量 | runway 比 v2 更全，套皮不减信息 |
| Composer（在 `ChatPanel` 内） | 分离式 → v2 单卡（内嵌发送 + focus 暖光环 + 占位符随 `data-hand` 切手写 / 正文）；`RefMenu` / `CommandMenu` Paper 化 | |
| `Sidebar.tsx` | 笔记本 / 会话 / footer(图谱 · 设置) Paper 化；**移除「夜灯模式」项**；保留折叠 | |
| `RightDrawer.tsx` + 摘要 / 节点视图 | v2 阅读视觉：摘要改「带标签柔卡」（**去掉左竖条 AI slop**）、meta chip 带社区圆点、关联列表、操作按钮；保留 resize / tab / 全屏 | |
| `TopBar` 模型选择器 | 新建控件，Paper 化（分组、打勾、pop 动画），复用 SettingsPanel 的 config 读写路径 | 真实 app 无现成 ModelSelector |
| `BatchDigestPanel.tsx` | Paper 化；入口上浮凸显 | |
| `GraphPanel.tsx` | 仅 Tab 入口 / 工具条 / 图例 Paper 化；画布内部不动 | 后置任务的边界 |
| **`lib/appearance.ts`（新）** / **`AppearancePanel`（新）** | 见上节 | |

## 持久化

- 外观偏好与现有 UI 偏好一致走 **localStorage**（现有：`llm-wiki-agent-theme` / sidebar-collapsed / drawer-width / main-view）。
- 不写后端、不进 `~/.llm-wiki-agent/`。

## 测试 / 验收

- `npm run build`（含 `tsc -b`）、`npm run typecheck`、现有 `npm test`（node:test / vitest）全绿。
- **真实功能不回归**：消息流式（SSE）、`@` 引用 / `/` 命令、导出、批量消化、产物抽屉、抽屉 resize/tab/全屏、切库 / 切对话、概念链接开抽屉。
- **视觉回归**：2 主题 × 3 纸张 × 4 配色 × 2 气泡 × 2 密度 × 手写开关，逐项截图核对；浅 / 夜灯首屏。
- 过一遍主流程（手动或 Playwright）。

## 落地节奏

一步到位，单分支 `feat/paper-ui`，内部按逻辑单元分 commit：

1. Paper token 层（`index.css` 变量 + 字体）
2. 外观偏好系统（`lib/appearance.ts` + `AppearancePanel` + App 接线）
3. TopBar 新增 + statusbar 控件上提
4. Sidebar Paper 化（去夜灯项）
5. 对话区气泡化 + 工具状态暖化
6. Composer 单卡化 + 菜单 / 导出 Paper 化
7. RightDrawer 阅读视觉
8. 图谱 Tab 外壳 Paper 化 + 收尾回归

## 后续任务（不在本次，记录在案）

1. **图谱活地图 Paper 化**：把社区 / 节点配色对齐暖纸调，配色在 `packages/graph-engine` 的 `render/render-styles.ts`（Sigma 渲染），与图谱体验一起规划，不在 CSS 层。
2. **真实跨库 / 全文搜索后端**：本次只做当前库 refs metadata 的本地搜索；跨库、全文内容索引、后端搜索 API 作为独立子任务。

## 风险 / 边界

- 引入 TopBar 涉及 `App.tsx` 与 `ChatPanel` / `GraphPanel` 的控件回流，是真实重构；已确认接受（理由见上）。属可控范围，因「不以 MVP 处理」而值得一次做对。
- v2 原型用极简 `tinyMd` 渲染抽屉正文，`## 标题` / `- 列表` 当纯文本；真实 app 用 `MarkdownView`（正常 markdown），移植后此问题不存在。
- 强调色 `data-accent` 预设需要同时覆盖浅 / 夜灯；用 `color-mix(... var(--card))` 推导 `--accent-soft` 保证两主题都成立。
