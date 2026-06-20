# Paper UI 移植 — 分阶段执行计划（L）

日期：2026-06-20
状态：待用户复核
分支：`feat/paper-ui`
进度文件：`docs/plans/2026-06-20-paper-ui-port-progress.json`

## 目标

把已定稿的 Paper 设计（v2 视觉 + 布局）移植进 `workbench/web`，作为新默认外观：统一 TopBar、气泡对话、单卡 Composer、Paper 阅读抽屉、外观调参（真实用户偏好，localStorage），默认浅色暖纸。图谱画布内部与真实搜索后端**不在本次**，列为后续子任务。

## 源文档

- 设计 spec：`docs/spark/2026-06-20-paper-ui-port-design.md`（source of truth，最新方向）
- 视觉原型：`/Users/kangjiaqi/designs/llm-wiki-skill/bright/paper-final-v2.html`（独立 design 仓库，视觉/交互参照）
- 产品文档：`workbench/PRODUCT.md`（§5 UI 原则、§7 ADR）。**注意**：本计划与 §5.4 既有决策冲突，见「与 PRODUCT.md 的冲突」与 Phase 6。
- 项目规则：`workbench/CLAUDE.md`（协作规则强约束）。

## 与 PRODUCT.md 的冲突（须随实现同步更新文档）

| PRODUCT.md 既有 | 本计划 | 处理 |
|---|---|---|
| §5.4 默认深色模式 | 默认浅色暖纸 | Phase 6 更新 §5.4 + §10 changelog |
| §5.4 工具感优先、不追求产品级精致、参考 Codex/Linear；中文 UI 系统字体 | Paper 暖纸视觉 + Plus Jakarta Sans/Caveat 字体 | Phase 6 更新 §5.4 + 新 ADR-23（Paper 视觉方向 & 外观偏好） |
| §5.2 顶栏 `[库▼][模型▼][设置]` | 库静态无下拉、模型保留、加外观齿轮、设置仍在侧栏 | Phase 6 更新 §5.2 |
| §5.4 不改三栏心智 / omp 工具折叠 / §5.5 严禁项 | 保留 | 无冲突 |

这些是文档同步，不是重新决策（Paper + 浅色已由作者多轮确认）。Phase 6 不通过则计划不算完成。

## 执行规则（/goal 协议）

- 在 `feat/paper-ui` 上执行（已建，spec 已 commit）。不在 main 上跑。
- 每个工作单元验证通过后，**代码改动 + 进度文件更新放进同一个 commit**，message 带任务 id（如 `feat: TopBar 组件 [task 2.1]`）。不在此文件存 commit hash，靠 `git log` + 任务 id 追溯。
- 验证不过不 commit。**绝不** push / merge / amend（合并 main 需作者复核）。
- 一个 phase 的 acceptance 全过即记录并自动进入下一 phase，**不在 phase 之间停下等确认**。
- 执行 agent 只能翻 `status`、填 `verification` / `decision_log` / `turn_log`；任务定义与 acceptance 只读。

## 验证命令（真实存在）

从 `workbench/web` 运行（或 monorepo 根用 `-w @llm-wiki-agent/web`）：

- 类型检查（也是 smoke）：`cd workbench/web && npm run typecheck`（`tsc -b --noEmit`，pretypecheck 会先 build `@llm-wiki/graph-engine`）
- 构建：`cd workbench/web && npm run build`
- 单测：`cd workbench/web && npm test`（`node --import tsx --test test/*.test.ts test/*.test.tsx`）
- Lint：`cd workbench/web && npm run lint`
- 浏览器：从 monorepo 根 `npm run dev` → web 在 `http://localhost:5180`；浏览器检查视口 **1440 / 1024 / 768**。

每个 /goal turn 开始：`git log --oneline -15` + `cd workbench/web && npm run typecheck`，先修好坏状态再开新活。

## 实现面地图

```
workbench/web/
├─ index.html                      [改] <html> 去 class="dark"（默认浅）；引 Plus Jakarta Sans + Caveat + JetBrains Mono
├─ src/index.css                   [改] Paper token（浅纸/夜灯）映射进 --app-*/shadcn 变量 + 纸张层 + .pw-* 组件 CSS 层
├─ src/App.tsx                     [改] 挂 TopBar；外观偏好状态+effect；移除 statusbar 控件双传；默认 theme=light
├─ src/lib/appearance.ts           [新] AppearancePrefs 类型/默认/localStorage/applyAppearance
├─ src/components/TopBar.tsx        [新] 左 kb 头(静态) + 右控件组
├─ src/components/AppearancePanel.tsx [新] 复刻 v2 TweaksPanel（纸张/配色/气泡/手写/密度/主题）
├─ src/components/ChatPanel.tsx     [改] 去 statusbar；扁平消息→气泡；导出栏 Paper 化+凸显；Composer 单卡化；搜索⌘K入口
├─ src/components/MarkdownView.tsx  [改] 概念链接 .at 样式 + 荧光笔 .hl
├─ src/components/ToolStatusRunway.tsx / ToolHistorySummary.tsx [改] 暖化（保 omp 折叠语义）
├─ src/components/RefMenu.tsx / CommandMenu.tsx [改] @// 浮层 Paper 化
├─ src/components/ExportButtons.tsx [改] Paper 化 + 凸显
├─ src/components/Sidebar.tsx       [改] Paper 化；移除「夜灯模式」项
├─ src/components/RightDrawer.tsx + 摘要/节点视图 [改] Paper 阅读视觉（摘要去左竖条）；保留 resize/tab/全屏
├─ src/components/GraphPanel.tsx    [改] 仅 Tab 入口/工具条/图例 Paper 化（画布内部不动）
└─ src/components/BatchDigestPanel.tsx [改] Paper 化 + 入口上浮
workbench/PRODUCT.md                [改] §5.2 / §5.4 / §10 + 新 ADR-23
```

### 数据流（外观偏好）

```
AppearancePanel（受控）──set(field,value)──▶ App 持有 AppearancePrefs
                                              │
                          applyAppearance(prefs) effect
                                              ▼
        documentElement: data-theme/data-paper/data-userbubble/data-hand/data-density
                          + 行内 --accent/--accent-deep/--user/--accent-soft
                                              ▼
                       index.css 的 [data-*] 选择器 + .pw-* 组件 CSS 生效
        localStorage  ◀── 持久化（llm-wiki-agent-theme + llm-wiki-agent-appearance-*）
```

## 阶段

### Phase 1 — 样式地基（token + 字体 + 外观偏好基础设施）

落地结果：app 首屏变浅色暖纸；偏好可程序化应用（面板下一阶段接）。

实现面：`index.html`、`src/index.css`、`src/lib/appearance.ts`、`src/App.tsx`、新增 `test/appearance.test.ts`。

任务：
- 1.1 Paper token 映射进 `index.css`（浅纸 `[data-theme="light"]` / 夜灯 `:root`+`.dark`），补全 v2 实际用到的 `--comm-*`、纸张层 `--paper-glow/vignette/mottle/grain`、`--dot`、暖 `--shadow/--shadow-lg`；引入 v2 `.pw-*` 组件 CSS 层（含 `data-paper/userbubble/hand/density` 变体）；`index.html` 去 `class="dark"` + 引三套字体。
- 1.2 `lib/appearance.ts`：类型、默认值、localStorage 读写、`applyAppearance`（写 data 属性 + 强调色行内变量，强调色用 `color-mix(... var(--card))` 推导 soft，浅/夜灯通用）。
- 1.3 App 接入：新增外观偏好状态 + effect 应用到 `documentElement`；`theme` 默认改 `light`（沿用现有 `THEME_STORAGE_KEY`）。

Acceptance：
- `cd workbench/web && npm run typecheck` 退出 0；`npm run build` 退出 0；`npm test` 退出 0。
- 新增 `test/appearance.test.ts`：读默认=light/clean/terracotta/soft/on/cozy；写入后再读一致；`applyAppearance` 后 `documentElement.dataset` 四属性正确、`--accent` 行内值正确。
- 浏览器 1440：首屏为浅色暖纸底（非深色）。

### Phase 2 — TopBar + AppearancePanel + Sidebar

落地结果：统一顶栏可用，外观齿轮开面板实时切换全部偏好；侧栏去夜灯项。

实现面：新 `TopBar.tsx`、新 `AppearancePanel.tsx`、`App.tsx`、`Sidebar.tsx`、`ChatPanel.tsx`/`GraphPanel.tsx`（移除 statusbar 控件与 `onToggleTheme` 双传）。

任务：
- 2.1 `TopBar.tsx`：左 kb 头（书本图标+库名+篇数，静态、无下拉、不显示模型名）；右控件组（搜索⌘K 入口[占位接口]、`ModelSelector`、新对话、主题切换、外观齿轮）。
- 2.2 `AppearancePanel.tsx`：复刻 v2 TweaksPanel（分段控件 + 配色色板 + 显隐），齿轮触发、右上展开、受控于 App。
- 2.3 App 接线：挂 TopBar + AppearancePanel；从 `ChatPanel`/`GraphPanel` 移除 statusbar 控件与 `onToggleTheme`，主题/模型/新对话回流 TopBar。
- 2.4 `Sidebar.tsx` Paper 化 + **移除「夜灯模式」项**（保留图谱/设置入口与折叠）。

Acceptance：
- typecheck / build / test 三命令退出 0；现有 Sidebar/相关测试不回归。
- 浏览器 1440 / 1024 / 768：顶栏控件可点；外观面板切「纸张/气泡/配色/手写/密度/主题」**实时生效**；切对话 / 切库 / 新对话不回归；侧栏无「夜灯模式」项。

### Phase 3 — 对话区气泡化 + 工具状态暖化

落地结果：对话呈现 v2 气泡，概念可点开抽屉，工具调用暖色折叠。

实现面：`ChatPanel.tsx`、`MarkdownView.tsx`、`ToolStatusRunway.tsx`、`ToolHistorySummary.tsx`。

任务：
- 3.1 ChatPanel 消息：扁平 → 气泡（`.pw-rowmsg/.pw-av/.pw-bubble`；用户 `data-userbubble` soft/solid；头像 user/agent 区分；节奏 `data-density`）。
- 3.2 `MarkdownView` 概念链接补 `.at` Paper 下划线（点击开抽屉逻辑已存在）+ 荧光笔 `.hl`。
- 3.3 `ToolStatusRunway`/`ToolHistorySummary` 暖化（脉冲竖条+微光轨道→折叠 chips），**保留 §5.4 omp 折叠语义与信息量**。

Acceptance：
- typecheck / build / test 退出 0；现有 `tool-status-*`、`tool-history-summary`、`chat-panel-tool-status`、`wiki-links` 测试全绿。
- 浏览器 1440：发一条消息流式正常；用户/助手气泡正确；点概念词右抽屉打开；工具运行态→完成折叠态正确。

### Phase 4 — Composer 单卡 + 菜单 + 导出/批量/搜索入口

落地结果：v2 单卡输入，@// 菜单 Paper 化，导出/批量凸显，搜索入口就位。

实现面：`ChatPanel.tsx`（Composer 区）、`RefMenu.tsx`、`CommandMenu.tsx`、`ExportButtons.tsx`、`BatchDigestPanel.tsx`、`TopBar.tsx`（搜索入口）。

任务：
- 4.1 Composer 分离式 → v2 单卡（内嵌发送、focus 暖光环、占位符随 `data-hand` 切手写/正文）；保留素材消化 input-chip 与拖拽消化。
- 4.2 `RefMenu`/`CommandMenu`（@//）浮层 Paper 化。
- 4.3 `ExportButtons` Paper 化并凸显放输入区显眼处；`BatchDigestPanel` Paper 化 + 入口上浮凸显。
- 4.4 搜索 ⌘K：TopBar 入口 + 前端接口/空态 UI（真实跨库检索后端是后续子任务，本任务只交付入口与前端契约，⌘K 能打开搜索面板并显示空态或占位）。

Acceptance：
- typecheck / build / test 退出 0；发送/流式/`@`/`/` 不回归（现有 api/chat 测试绿）。
- 浏览器 1440 / 768：单卡 Composer + 内嵌发送 + focus 态；`@` 插 wiki 链接、`/` 插命令；导出与批量入口可见可点；`⌘K` 打开搜索面板（空态可接受）。

### Phase 5 — RightDrawer 阅读视觉

落地结果：抽屉阅读为 v2 Paper 视觉，且 resize/tab/全屏不回归。

实现面：`RightDrawer.tsx` + 摘要/节点/wiki 渲染、`GraphSummaryDrawer.tsx`/`GraphSelection.tsx`（仅样式）。

任务：
- 5.1 抽屉阅读 Paper 化：摘要改「带标签柔卡」（**去掉左竖条 AI slop**）、meta chip 带社区圆点、关联列表带关系药丸、操作按钮抬升态。
- 5.2 保留 resize / tab / 全屏交互与现有 drawer 状态逻辑不回归。

Acceptance：
- typecheck / build / test 退出 0；现有 `graph-drawer-state`、`right-drawer-graph-summary`、`graph-selection-drawer`、`graph-summary-actions` 测试全绿。
- 浏览器 1440：打开 wiki/节点抽屉阅读正常；拖动 resize、切 tab、切全屏均可用；摘要无左竖条。

### Phase 6 — 图谱 Tab 外壳 Paper 化 + PRODUCT.md 对齐 + 全量回归

落地结果：整页 Paper 一致（图谱画布内部除外）；文档与实现一致；全量绿。

实现面：`GraphPanel.tsx`（仅外壳）、`workbench/PRODUCT.md`。

任务：
- 6.1 `GraphPanel` 的 Tab 入口 / 工具条 / 图例 Paper 化到不突兀；**画布内部 Sigma 渲染配色不动**。
- 6.2 PRODUCT.md 对齐：§5.2（顶栏：库静态无下拉 + 模型 + 新对话 + 主题 + 外观齿轮；设置仍在侧栏）；§5.4（默认改浅色；视觉方向更新为 Paper；字体加 Plus Jakarta Sans/Caveat）；§10 changelog 加条目；新增 **ADR-23：Paper 视觉方向 & 外观偏好（localStorage）**，记录与旧 §5.4 的关系与理由。
- 6.3 全量回归：typecheck / build / test / lint 全绿；视觉回归 2 主题 × 3 纸张 × 4 配色 × 2 气泡 × 2 密度 × 手写开关，逐项截图；主流程手动过一遍（发消息→@/→导出→批量→切库→抽屉 resize/全屏）。

Acceptance：
- `cd workbench/web && npm run typecheck && npm run build && npm test && npm run lint` 全退出 0。
- 视觉回归截图齐全（上述组合），首屏浅纸；夜灯可切。
- `docs/spark/2026-06-20-paper-ui-port-design.md`、本 plan、PRODUCT.md（§5.2/§5.4/§10/ADR-23）三者一致，无 stale 措辞冲突。

## 已存在（复用，勿重建）

- 主题机制：`App.tsx` 的 `theme` 状态 + `THEME_STORAGE_KEY` + `dataset.theme`/`.dark`（默认改 light，其余沿用）。
- UI 偏好持久化范式：现有 localStorage 键（sidebar-collapsed / drawer-width / main-view）。
- 概念链接开抽屉：`MarkdownView` 的 `onOpenPage`（功能已在，补样式）。
- 工具状态：`ToolStatusRunway`/`ToolHistorySummary`（omp 语义已实现，套皮即可）。
- 抽屉 resize/tab/全屏、导出、批量消化、@//菜单、ModelSelector：均已存在，套皮 + 重排，勿重写逻辑。
- shadcn/Tailwind v4/React 19/Vite（ADR-8/9），不引新 UI 框架。

## 不在本次范围（后续子任务）

1. **图谱活地图 Paper 化**：社区/节点配色在 `packages/graph-engine/render/render-styles.ts`（Sigma），与图谱体验一起规划。
2. **真实跨库/页面搜索后端**：若现有后端无搜索 API，⌘K 真实检索单列子任务（本次只交付入口 + 前端契约）。

## 失败模式与残余风险

- **TopBar 重构漏接控件**（如 statusbar 里的状态 dot / 当前模型来源提示）→ silent failure。缓解：Phase 2 浏览器回归逐项点检 + 现有测试；把 statusbar 原有信息位在 TopBar 找到对应落点或明确丢弃。
- **默认改 light 触发依赖 `.dark` 的旧样式异常**：缓解：typecheck/build + 两主题视觉回归。
- **强调色行内覆盖在夜灯下 accent-soft 异常**：用 `color-mix(... var(--card))` 推导，Phase 1 单测 + Phase 6 视觉回归覆盖。
- **字体加载失败**：font stack 兜底（Plus Jakarta → 系统 sans；CJK 系统字体兜底），不阻塞。
- **PRODUCT.md 不同步**导致后人以为仍是「默认深色/工具感」：Phase 6 强制文档对齐为 acceptance。

## 决策日志（初始）

- 引入统一 TopBar：v2 布局要求 + 消除 ChatPanel/GraphPanel 的 `onToggleTheme` 双传；弃「沿用 per-view statusbar」；来源：用户 + spec。
- 默认浅色暖纸：与 PRODUCT.md §5.4「默认深色」冲突 → Phase 6 改文档；来源：用户多轮确认。
- Paper 视觉方向取代 §5.4「工具感优先/不追求精致/系统字体」→ 新 ADR-23 + 改 §5.4；来源：用户（baoyu-design 多轮迭代定稿）。
- 外观偏好走 localStorage：复用现有 theme/UI 偏好范式，零后端；弃「后端存偏好」；来源：spec。
- 搜索后端 / 图谱画布 Paper 化 = out of scope 子任务：避免 scope 爆炸，符合「未实现留接口后接」；来源：用户。
- Tweaks 复刻 v2 单文件原型的视觉层，不搬其 mock 逻辑（假流式/假数据）；来源：spec。

## Commit 规则

- 每个验证通过的任务：代码 + 进度文件同一 commit，message 带任务 id（如 `feat: Composer 单卡化 [task 4.1]`）。
- 验证不过不 commit；绝不 push/merge/amend；合并 main 需作者复核。

## 评审修订（plan-eng-review 2026-06-20，已采纳并入计划）

1. **A1 — 单一 CSS 类系统**（用户拍板 A）：不引入 v2 `.pw-*` 并行层；把现有 `.msg-*/.chat-*/.tool-runway/.drawer-*` 等组件类**就地演进**为 Paper 外观，`data-paper/userbubble/hand/density/accent` 变体选择器加在现有类上。理由：一套类、无死 CSS、CSS/组件/测试自洽，避免两套命名屎山（项目 CLAUDE.md 强约束）。
2. **A2 — 外观状态单一 writer**：`lib/appearance.ts` 成为唯一外观写入方（含 theme）。**删除** `App.tsx:235-240` 现有 theme effect，`applyAppearance` 统一写 `dataset.theme` + `.dark` class + `data-*`。消除「`.dark` class 与 `data-theme` 双主漂移」。
3. **A3 — statusbar 状态不丢**：删 `ChatPanel` 的 `.statusbar` 前，把其连接状态 dot、库名、「当前模型来自设置」提示在 TopBar 找到落点（Phase 2 task 2.1）。
4. **Q1 — 强调色用 `data-accent`**：强调色从「行内 JS CSS 变量」改为 `data-accent` 属性 + CSS 预设，与其余 `data-*` 一致（explicit > clever）。
5. **T1 — 补组件测试**：新增 `TopBar.test.tsx`（主题切换回归 + 开关外观面板）、`AppearancePanel.test.tsx`（点分段→偏好 + `documentElement.dataset` 更新）；Phase 2 acceptance 纳入（Phase 1 已有 `appearance.test.ts`）。
6. **P1 — 气泡去 backdrop-filter**：助手气泡不用 `backdrop-filter:blur()`（长对话每条一个 = 合成掉帧），暖纸上实色卡片同效；最多 composer 单实例保留。

### 并行化策略

**大体顺序执行**。Phase 1（token + 单一类系统 + 外观）是地基，必须先行。Phase 2-5 虽触及不同组件，但单一类系统下都改 `index.css` 同一文件 → 共享热点，跨 worktree 并行会撞 `index.css` 合并冲突。建议串行；若要并行，仅 Phase 2（TopBar/Sidebar 组件文件）与 Phase 5（RightDrawer 组件文件）可错开，但 `index.css` 改动需串行协调。Phase 6 收尾最后。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | 未运行（可选） |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | 未运行 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_found | 6 issues（A1·A2·A3·Q1·T1·P1），全部采纳并入；0 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 未运行（可选，UI 改动大可考虑） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 未运行 |

- **OUTSIDE VOICE:** Codex 尝试失败——本机 codex 指向 `glm-5.2`（`localhost:58684` 代理），key 无该模型权限（404）。未 spawn 同模型子代理顶替。无跨模型第二意见；如需补，修正 codex 模型配置后重跑。
- **VERDICT:** ENG CLEARED — 6 findings 全部采纳并入计划，0 未决、0 critical gap，可进入实现。UI 改动较大，`/plan-design-review` 可选。

NO UNRESOLVED DECISIONS
