# Paper UI 移植 — 分阶段执行计划（L）

日期：2026-06-20
状态：plan-eng-review 已完成，待实现
分支：`feat/paper-ui`
进度文件：`docs/plans/2026-06-20-paper-ui-port-progress.json`

## 目标

把已定稿的 Paper 设计（v2 视觉 + 布局）移植进 `workbench/web`，作为新默认外观：统一 TopBar、气泡对话、单卡 Composer、Paper 阅读抽屉、外观调参（真实用户偏好，localStorage），默认浅色暖纸。图谱画布内部与真实搜索后端**不在本次**，列为后续子任务。

## 源文档

- 设计 spec：`docs/spark/2026-06-20-paper-ui-port-design.md`（设计意图来源；执行细节以本 plan 为准）
- 视觉原型：`/Users/kangjiaqi/designs/llm-wiki-skill/bright/paper-final-v2.html`（独立 design 仓库，视觉/交互参照）
- 产品文档：`workbench/PRODUCT.md`（§5 UI 原则、§7 ADR）。本计划已把 Paper 方向同步进 §5.2 / §5.4 / ADR-24 / ADR-25；Phase 6 只做终检。
- 项目规则：`workbench/CLAUDE.md`（协作规则强约束）。

## 与 PRODUCT.md 的冲突（须随实现同步更新文档）

| PRODUCT.md 既有 | 本计划 | 处理 |
|---|---|---|
| §5.4 默认深色模式 | 默认浅色暖纸 | Phase 1 task 1.0 更新 §5.4 + §10 changelog |
| §5.4 工具感优先、不追求产品级精致、参考 Codex/Linear；中文 UI 系统字体 | Paper 暖纸视觉 + Plus Jakarta Sans/Caveat 字体 | Phase 1 task 1.0 更新 §5.4 + 新 ADR-24（Paper 视觉方向 & 外观偏好） |
| §5.2 顶栏 `[库▼][模型▼][设置]` | 库静态无下拉、模型保留、加外观齿轮、设置仍在侧栏 | Phase 1 task 1.0 更新 §5.2 |
| §5.4 不改三栏心智 / omp 工具折叠 / §5.5 严禁项 | 保留 | 无冲突 |

这些是文档同步，不是重新决策（Paper + 浅色已由作者多轮确认）。Phase 1 task 1.0 不完成不得进入样式实现；Phase 6 再做终检。

## 执行规则（/goal 协议）

- 在 `feat/paper-ui` 上执行（已建，spec 已 commit）。不在 main 上跑。
- **专项授权**：Paper UI goal 执行期间，以本 plan/progress 的自动推进规则为准；它覆盖 `workbench/CLAUDE.md` / `PRODUCT.md §10` 里旧的“每步都等作者确认”通用规则。只有目标受阻、验收失败三次、或遇到会改变已锁定产品决策的选择题时才停下来问作者。
- 每个工作单元验证通过后，**代码改动 + 进度文件更新放进同一个 commit**，message 带任务 id（如 `feat: TopBar 组件 [task 2.1]`）。不在此文件存 commit hash，靠 `git log` + 任务 id 追溯。
- 验证不过不 commit。**绝不** push / merge / amend（合并 main 需作者复核）。
- 一个 phase 的 acceptance 全过即记录并自动进入下一 phase，**不在 phase 之间停下等确认**。
- 每个 /goal turn 先读本 plan + progress + `workbench/PRODUCT.md` §5/§7/§10。若 progress 指针与任务状态冲突，以任务状态为准先修 ledger，不跳过 pending 的前置任务。
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
├─ src/index.css                   [改] Paper token（浅纸/夜灯）映射进 --app-*/shadcn 变量 + 纸张层；就地演进现有 .msg-*/.chat-*/.tool-*/.drawer-* 等组件类到 Paper（不引入 .pw-* 并行层）+ data-* 变体选择器（含 data-accent 预设）
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
workbench/PRODUCT.md                [改] §5.2 / §5.4 / §10 + 新 ADR-24 / ADR-25
```

### 数据流（外观偏好）

```
AppearancePanel（受控）──set(field,value)──▶ App 持有 AppearancePrefs
                                              │
                          applyAppearance(prefs) effect
                                              ▼
        documentElement: data-theme/data-paper/data-userbubble/data-hand/data-density/data-accent
                                              ▼
                       index.css 的 [data-*] 选择器 + 演进后的现有组件类生效
        localStorage  ◀── 持久化（llm-wiki-agent-theme + llm-wiki-agent-appearance-*）
```

## 阶段

### Phase 1 — 样式地基（token + 字体 + 外观偏好基础设施）

落地结果：app 首屏变浅色暖纸；偏好可程序化应用（面板下一阶段接）。

实现面：`index.html`、`src/index.css`、`src/lib/appearance.ts`、`src/App.tsx`、新增 `test/appearance.test.ts`。

任务：
- 1.0 **PRODUCT.md 先对齐**（Codex #10：实现从 Phase 1 起就偏离旧方向，文档不能拖到最后）：更新 §5.2（顶栏形态）、§5.4（默认浅色 + Paper 视觉方向 + 字体）、§10 changelog，新增 ADR-24（Paper 视觉方向 & 外观偏好 localStorage）+ ADR-25（前端测试栈引入 jsdom / @testing-library/react / Playwright 视觉回归）。
- 1.1 Paper token 映射进 `index.css`（浅纸 `[data-theme="light"]` / 夜灯 `:root`+`.dark`），补全 v2 实际用到的 `--comm-*`、纸张层 `--paper-glow/vignette/mottle/grain`、`--dot`、暖 `--shadow/--shadow-lg`；**就地演进现有组件类**（`.msg-*/.chat-*/.tool-*/.drawer-*` 等）到 Paper（**不引入 `.pw-*` 并行层**），`data-paper/userbubble/hand/density/accent` 变体加在现有类上；`index.html` 去 `class="dark"` + 引三套字体。纸张纹理只能做少量全局层，不允许挂到每条消息/卡片上。
- 1.2 `lib/appearance.ts`：类型、默认值、localStorage 读写、`applyAppearance`（写 `data-*` 属性，强调色用 `data-accent` 预设——CSS 里定义各预设的 `--accent/--accent-deep/--accent-soft`，soft 用 `color-mix(... var(--card))` 推导，浅/夜灯通用）。
- 1.3 `lib/appearance.ts` 成**唯一外观 writer**（含 theme）：**删除** `App.tsx` 现有 theme effect，`applyAppearance` 统一写 `dataset.theme` + `.dark` class + `data-*`；`theme` 默认 `light`（沿用 `THEME_STORAGE_KEY`）。
- 1.4 **测试栈**（Codex #7，用户批准加依赖）：装 `jsdom` + `@testing-library/react`（dev），新增统一 `test/setup-dom.ts` / `test/render.tsx`（含 cleanup、localStorage/window/documentElement 重置、真实 click/keyboard helper），配 `node:test` 用 DOM 环境，让交互测试可行。
- 1.5 **视觉回归基础设施**（用户已授权可装 Playwright）：把 `playwright` 纳入 `workbench/web` dev dependency，新增 `npm run visual:paper` 脚本与固定目录（建议 `test/visual/paper-ui.ts`、`test-results/paper-ui/actual/`、`test-results/paper-ui/baseline/`）。首次只要求能在 dev server 上抓 1440 浅纸/夜灯 smoke 截图；Phase 6 再扩到关键组合。

Acceptance：
- `cd workbench/web && npm run typecheck` 退出 0；`npm run build` 退出 0；`npm test` 退出 0。
- 新增 `test/appearance.test.ts`：读默认=light/clean/terracotta/soft/on/cozy；写入后再读一致；`applyAppearance` 后 `documentElement.dataset` 六属性（theme/paper/userbubble/hand/density/accent）正确。
- `PRODUCT.md` §5.2/§5.4/§10 + ADR-24/25 已落；与本 plan、spec 无 stale 冲突。
- 新增 DOM 测试 setup 可被 `TopBar.test.tsx` / `AppearancePanel.test.tsx` 复用；`npm run visual:paper` 能产出最小 smoke 截图。
- 浏览器 1440：首屏为浅色暖纸底（非深色）。

### Phase 2 — TopBar + AppearancePanel + Sidebar

落地结果：统一顶栏可用，外观齿轮开面板实时切换全部偏好；侧栏去夜灯项。

实现面：新 `TopBar.tsx`、新 `AppearancePanel.tsx`、`App.tsx`、`Sidebar.tsx`、`ChatPanel.tsx`/`GraphPanel.tsx`（移除 statusbar 控件与 `onToggleTheme` 双传）。

任务：
- 2.0 **外壳改竖向**（Codex #6）：现 `.app-shell` 是单横排；改成 `TopBar` 在上 + `body` 行包裹（Sidebar + Main + Drawer）。`index.css` 的 `.app-shell` 与 `App.tsx` 结构同步改，列为显式任务。
- 2.1 `TopBar.tsx`：左 kb 头（书本图标 + 库名 + **origin/valid 标记**，静态、无下拉、不显示模型名；**KnowledgeBaseInfo 无篇数字段，不显示篇数、不碰后端** — Codex #3）；右控件组（搜索⌘K 入口、模型选择器、新对话、主题切换、外观齿轮）。
- 2.2 **TopBar 模型选择器**（Codex #2：真实 app 无 ModelSelector 组件，模型在 SettingsPanel/config）：新建顶栏模型选择控件，**复用** `SettingsPanel` 读 `getConfig().modelRoles.main` + 写 config 的路径，真能切换并保存（非只读）。保存成功后必须走 `handleConfigChanged` 同源刷新路径，让顶栏显示的当前模型立即更新；建议抽共享 `modelRoleValue` / `valueToModelRef` helper，避免和 SettingsPanel 复制转换逻辑。
- 2.3 `AppearancePanel.tsx`：复刻 v2 TweaksPanel（分段控件 + 配色色板 + 显隐），齿轮触发、右上展开、受控于 App。
- 2.4 App 接线：挂 TopBar + AppearancePanel；从 `ChatPanel`/`GraphPanel` 移除 statusbar 控件与 `onToggleTheme`，主题/模型/新对话回流 TopBar。
- 2.5 **状态快照上报**（Codex #4 修订）：ChatPanel / GraphPanel 继续拥有自己的生命周期状态（abort controller、图谱加载、动画队列不搬到 App），只通过 callback 向 App 上报 TopBar 需要的快照：chat `idle|streaming|error` + error summary，graph `idle|loading|building|ready|error` + build/animation summary。App 持有快照并喂给 TopBar（原 statusbar 的 dot/提示不丢）。**图谱专属控件**（重置布局、重建图谱 — Codex #5）**留在 GraphPanel 视图内**，不进全局 TopBar。
- 2.6 `Sidebar.tsx` Paper 化 + **移除「夜灯模式」项**（保留图谱/设置入口与折叠）。
- 2.7 **测试**（依赖已在 1.4 装好）：`TopBar.test.tsx`（真实点击主题切换仍生效=回归、开/关外观面板、模型切换写 config 后触发当前模型刷新、状态快照显示）+ `AppearancePanel.test.tsx`（真实点击分段/色板 → 偏好 + `documentElement.dataset` 更新）。

Acceptance：
- typecheck / build / test 三命令退出 0；新增 `TopBar.test.tsx` + `AppearancePanel.test.tsx` 通过；现有 Sidebar/相关测试不回归。
- 浏览器 1440 / 1024 / 768：顶栏控件可点；模型选择器真能切换并持久化；外观面板切「纸张/气泡/配色/手写/密度/主题」**实时生效**；连接/状态指示在 TopBar 可见；切对话 / 切库 / 新对话不回归；侧栏无「夜灯模式」项。

### Phase 3 — 对话区气泡化 + 工具状态暖化

落地结果：对话呈现 v2 气泡，概念可点开抽屉，工具调用暖色折叠。

实现面：`ChatPanel.tsx`、`MarkdownView.tsx`、`ToolStatusRunway.tsx`、`ToolHistorySummary.tsx`。

任务：
- 3.1 ChatPanel 消息：扁平 → 气泡，**就地演进现有 `.msg-row/.msg-avatar/.msg-body/.msg-content` 等类**（不新建 `.pw-*`）；用户 `data-userbubble` soft/solid；头像 user/agent 区分；节奏 `data-density`；**气泡不用 `backdrop-filter:blur()`**（Codex/P1：长对话每条一个 = 合成掉帧，实色卡片同效）。
- 3.2 `MarkdownView` 概念链接补 `.at` Paper 下划线（点击开抽屉逻辑已存在）+ 荧光笔 `.hl`。
- 3.3 `ToolStatusRunway`/`ToolHistorySummary` 暖化（脉冲竖条+微光轨道→折叠 chips），**保留 §5.4 omp 折叠语义与信息量**。

Acceptance：
- typecheck / build / test 退出 0；现有 `tool-status-*`、`tool-history-summary`、`chat-panel-tool-status`、`wiki-links` 测试全绿。
- 浏览器 1440：发一条消息流式正常；用户/助手气泡正确；点概念词右抽屉打开；工具运行态→完成折叠态正确。
- 长对话性能 smoke：用固定 200-500 条消息样本（含工具摘要、代码块、wiki 引用）检查首屏渲染、滚动、输入聚焦不卡顿；确认每条气泡/消息没有 `backdrop-filter`、独立纹理层或高成本阴影。

### Phase 4 — Composer 单卡 + 菜单 + 导出/批量/搜索入口

落地结果：v2 单卡输入，@// 菜单 Paper 化，导出/批量凸显，搜索入口就位。

实现面：`ChatPanel.tsx`（Composer 区）、`RefMenu.tsx`、`CommandMenu.tsx`、`ExportButtons.tsx`、`BatchDigestPanel.tsx`、`TopBar.tsx`（搜索入口）。

任务：
- 4.1 Composer 分离式 → v2 单卡（内嵌发送、focus 暖光环、占位符随 `data-hand` 切手写/正文）；保留素材消化 input-chip 与拖拽消化。
- 4.2 `RefMenu`/`CommandMenu`（@//）浮层 Paper 化。
- 4.3 `ExportButtons` Paper 化并凸显放输入区显眼处；`BatchDigestPanel` Paper 化 + 入口上浮凸显。
- 4.4 搜索 ⌘K **客户端真搜索**（Codex #8：不做假按钮）：对**当前库页面引用 metadata** 做本地模糊过滤，数据源明确为 App/TopBar 级 refs cache，而不是 ChatPanel `@` 菜单的局部 20 条状态。实现可复用 `/api/refs` 扫描能力，但需新增/调整前端 helper 让当前库能取足够多 refs（目标 5k，跨库/全文内容检索仍不做）。⌘K 打开面板、输入即过滤、回车/点击开抽屉或插入引用；处理无知识库、空结果、接口失败、快捷键冲突。**跨库 / 全文检索后端** = 后续子任务（本次不做），但本次交付的是**能用的当前库 refs 本地搜索**，非空态占位。新增 `test/search-filter.test.ts`（过滤函数单测）。

Acceptance：
- typecheck / build / test 退出 0；发送/流式/`@`/`/` 不回归（现有 api/chat 测试绿）；`search-filter.test.ts` 覆盖 1k/5k refs、CJK、路径、标题、空 query、空结果、排序；DOM/浏览器交互测试覆盖 ⌘K 打开、输入过滤、键盘上下选择、Enter/点击动作。
- 浏览器 1440 / 768：单卡 Composer + 内嵌发送 + focus 态；`@` 插 wiki 链接、`/` 插命令；导出与批量入口可见可点；`⌘K` 打开搜索、输入能**真过滤**当前库页面/引用并跳转（非空态）。

### Phase 5 — RightDrawer 阅读视觉

落地结果：抽屉阅读为 v2 Paper 视觉，且 resize/tab/全屏不回归。

实现面：`RightDrawer.tsx` + 摘要/节点/wiki 渲染、`GraphSummaryDrawer.tsx`/`GraphSelection.tsx`（仅样式）。

任务：
- 5.1 抽屉阅读 Paper 化：摘要改「带标签柔卡」（**去掉左竖条 AI slop**）、meta chip 带社区圆点、关联列表带关系药丸、操作按钮抬升态。
- 5.2 保留 resize / tab / 全屏交互与现有 drawer 状态逻辑不回归。

Acceptance：
- typecheck / build / test 退出 0；现有 `graph-drawer-state`、`right-drawer-graph-summary`、`graph-selection-drawer`、`graph-summary-actions` 测试全绿。
- 浏览器 1440：打开 wiki/节点抽屉阅读正常；拖动 resize、切 tab、切全屏均可用；摘要无左竖条。
- 新增 DOM 或 Playwright 交互测试：实际拖动 resize handle、切 tab、切全屏、关闭抽屉，并断言状态/尺寸变化。

### Phase 6 — 图谱 Tab 外壳 Paper 化 + 全量回归 + 文档终检

落地结果：整页 Paper 一致（图谱画布内部除外）；全量绿；文档自洽。

实现面：`GraphPanel.tsx`（仅外壳）。（PRODUCT.md 已在 Phase 1 task 1.0 对齐，此处只做终检。）

任务：
- 6.1 `GraphPanel` 的 Tab 入口 / 工具条 / 图例 Paper 化到不突兀；**画布内部 Sigma 渲染配色不动**。
- 6.2 **脚本化视觉回归**（Codex #9：96 组合手测是 busywork）：扩展 Phase 1 的 `npm run visual:paper` Playwright 脚本，对关键组合截图——至少 {浅/夜灯} × {纯净/网格/纹理纸} 主轴 6 张 + {soft/solid 气泡、cozy/compact、hand on/off、4 配色}各代表 1 张；固定命名、固定输出目录、baseline 目录、`--update` 更新基线规则。不追求 96 张全排列。若浏览器未安装，执行 `npx playwright install chromium` 并记录。
- 6.3 全量回归：`typecheck / build / test / lint / visual:paper` 全绿；主流程手动过一遍（发消息→@/→⌘K 搜索→导出→批量→切库→切模型→抽屉 resize/全屏）。

Acceptance：
- `cd workbench/web && npm run typecheck && npm run build && npm test && npm run lint && npm run visual:paper` 全退出 0。
- 视觉回归脚本产出关键组合截图（命名固定），首屏浅纸、夜灯可切；字体正常加载和字体失败兜底各有截图；网格/纹理纸不降低正文可读性。
- `docs/spark/2026-06-20-paper-ui-port-design.md`、本 plan、`PRODUCT.md`（§5.2/§5.4/§10/ADR-24/25）三者一致，无 stale 措辞冲突。

## 已存在（复用，勿重建）

- 主题机制：`App.tsx` 的 `theme` 状态 + `THEME_STORAGE_KEY` + `dataset.theme`/`.dark`（默认改 light，其余沿用）。
- UI 偏好持久化范式：现有 localStorage 键（sidebar-collapsed / drawer-width / main-view）。
- 概念链接开抽屉：`MarkdownView` 的 `onOpenPage`（功能已在，补样式）。
- 工具状态：`ToolStatusRunway`/`ToolHistorySummary`（omp 语义已实现，套皮即可）。
- 抽屉 resize/tab/全屏、导出、批量消化、@//菜单：均已存在，套皮 + 重排，勿重写逻辑。
- **模型切换数据/保存路径**：`SettingsPanel` 已有（`getConfig().modelRoles.main` + 写 config）——TopBar 模型选择器复用这条路径，**但 `ModelSelector` 组件本身不存在，需新建**（Codex #2）。
- shadcn/Tailwind v4/React 19/Vite（ADR-8/9），不引新 UI 框架；测试新增 jsdom + @testing-library/react + Playwright（dev，ADR-25）。

## 不在本次范围（后续子任务）

1. **图谱活地图 Paper 化**：社区/节点配色在 `packages/graph-engine/render/render-styles.ts`（Sigma），与图谱体验一起规划。
2. **真实跨库 / 全文搜索后端**：本次 ⌘K 只做当前库页面引用 metadata 的本地搜索；跨库、全文内容索引、后端搜索 API 另列子任务。

## 失败模式与残余风险

- **TopBar 重构漏接控件**（如 statusbar 里的状态 dot / 当前模型来源提示）→ silent failure。缓解：Phase 2 浏览器回归逐项点检 + 现有测试；把 statusbar 原有信息位在 TopBar 找到对应落点或明确丢弃。
- **默认改 light 触发依赖 `.dark` 的旧样式异常**：缓解：typecheck/build + 两主题视觉回归。
- **强调色 `data-accent` 预设在夜灯下 accent-soft 异常**：soft 用 `color-mix(... var(--card))` 推导，Phase 1 单测 + Phase 6 视觉回归覆盖。
- **字体加载失败**：font stack 兜底（Plus Jakarta → 系统 sans；CJK 系统字体兜底），不阻塞。
- **PRODUCT.md 不同步**导致后人以为仍是「默认深色/工具感」：**Phase 1 task 1.0** 先对齐文档（Codex #10），不拖到最后。
- **TopBar 状态漏接**（连接 dot / 流式 / 图谱状态）→ silent failure。缓解：task 2.5 显式状态快照上报 + Phase 2 浏览器回归逐项点检。

## 决策日志（初始）

- 引入统一 TopBar：v2 布局要求 + 消除 ChatPanel/GraphPanel 的 `onToggleTheme` 双传；弃「沿用 per-view statusbar」；来源：用户 + spec。
- 默认浅色暖纸：与 PRODUCT.md §5.4「默认深色」冲突 → Phase 1 task 1.0 先改文档；来源：用户多轮确认。
- Paper 视觉方向取代 §5.4「工具感优先/不追求精致/系统字体」→ 新 ADR-24 + 改 §5.4；来源：用户（baoyu-design 多轮迭代定稿）。
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

### Codex 外部第二意见修订（10 条，全部采纳并入；事实硬伤已核实）

- **#1 plan 自相矛盾** → 已改正文：实现面地图(line 55)、Phase 1 task 1.1、Phase 3 task 3.1、数据流图全部去 `.pw-*`/行内强调色，无残留矛盾。
- **#2 ModelSelector 不存在**（核实属实，真实 app 模型切换在 `SettingsPanel`/`config.modelRoles.main`）→ Phase 2 task 2.2 改为「新建 TopBar 模型选择器，复用设置的读写路径，真能切并保存」（用户选 A）。
- **#3 KnowledgeBaseInfo 无篇数**（核实：仅 path/name/origin/valid/reason）→ TopBar 左侧去篇数，改 origin/valid 标记，不碰后端。
- **#4 TopBar 状态未定义** → Phase 2 task 2.5：ChatPanel/GraphPanel 保持状态所有权，只向 App 上报 TopBar 需要的状态快照。
- **#5 图谱专属控件归属** → task 2.5：重置布局/重建图谱留在 GraphPanel 视图内，不进全局 TopBar。
- **#6 竖向外壳改动被低估** → Phase 2 task 2.0：`.app-shell` 单横排 → TopBar + body 行包裹，列为显式任务。
- **#7 测试栈做不了交互**（核实：测试用 `renderToStaticMarkup`，无 jsdom）→ Phase 1 task 1.4：装 `jsdom` + `@testing-library/react`（用户批准，ADR-25）。
- **#8 搜索太虚** → Phase 4 task 4.4 改为**客户端真搜索**（本地过滤已加载页面/引用，用户选 A），跨库后端仍 defer。
- **#9 视觉回归无自动化** → Phase 1 task 1.5 先落 Playwright 脚本入口；Phase 6 task 6.2 抓关键组合，不做 96 张手测全排列。
- **#10 PRODUCT.md 拖太晚** → 文档对齐**提到 Phase 1 task 1.0**（含新 ADR-24 视觉方向 + ADR-25 测试栈）。

### 并行化策略

**大体顺序执行**。Phase 1（token + 单一类系统 + 外观）是地基，必须先行。Phase 2-5 虽触及不同组件，但单一类系统下都改 `index.css` 同一文件 → 共享热点，跨 worktree 并行会撞 `index.css` 合并冲突。建议串行；若要并行，仅 Phase 2（TopBar/Sidebar 组件文件）与 Phase 5（RightDrawer 组件文件）可错开，但 `index.css` 改动需串行协调。Phase 6 收尾最后。

## Plan-Eng-Review Refresh Outputs

日期：2026-06-20
状态：本次 refresh 的确定性修订已并入 plan / progress / spec / PRODUCT / workbench 入口文档。
外部声音：3 个只读子代理并行审查（一致性、可落地性、测试/性能）。

### Step 0 — Scope Challenge

- 现有能力复用充分：主题键、localStorage 偏好范式、SettingsPanel 模型配置、`/api/refs` 页面引用扫描、导出、批量消化、抽屉 resize/fullscreen、工具状态和图谱外壳都已存在，计划是迁移外观和上提全局控件，不重写业务链路。
- 计划触及文件多于 8 个，这是 UI 外观迁移的必要复杂度；削到 8 个以内会变成半套皮，无法交付统一顶栏、气泡、Composer、抽屉和外观偏好。
- 作用域不缩：Paper v2 已锁定为默认外观，本次不做 MVP 取舍；但图谱画布内部、跨库/全文搜索后端仍保持后置。
- 搜索改清：本次不是“搜索入口 + 假接口”，而是当前库 refs metadata 的本地搜索；跨库/全文内容检索后置。
- 新依赖已纳入 ADR-25：`jsdom` / `@testing-library/react` / `playwright` 都是 dev 依赖，服务于交互和视觉验收。

### What Already Exists

| 子问题 | 已有实现 | 本计划如何复用 |
|---|---|---|
| 主题切换 | `App.tsx` 的 `THEME_STORAGE_KEY`、`dataset.theme`、`.dark` | `lib/appearance.ts` 接管为唯一 writer，默认改 light |
| 模型配置 | `SettingsPanel` 读写 `getConfig().modelRoles.main`，保存后 `onConfigChanged` 刷新 active | TopBar 新建模型控件，复用同一路径并刷新当前显示模型 |
| 页面引用候选 | `/api/refs` + `listRefs` + `pages.ts` cache | Phase 4 建 App/TopBar refs cache，避免只搜 ChatPanel 局部 20 条 |
| `@` / `/` 菜单 | `RefMenu` / `CommandMenu` / `cmdk` | Paper 化，不重写插入逻辑 |
| 导出与批量消化 | `ExportButtons` / `BatchDigestPanel` / batch digest SSE | Paper 化 + 入口凸显，不改能力归属 |
| 工具状态 | `ToolStatusRunway` / `ToolHistorySummary` + omp 语义 | 暖化外观，不减信息量 |
| 抽屉交互 | `RightDrawer` resize / tab / fullscreen | Paper 阅读视觉 + 新交互测试 |
| 图谱画布 | `GraphPanel` + `@llm-wiki/graph-engine` Sigma | 仅改外壳；画布内部后置 |

### NOT In Scope

- 图谱画布内部 Paper 化：Sigma 节点、社区、边颜色在 `packages/graph-engine/render/render-styles.ts`，另开图谱体验任务。
- 跨库 / 全文搜索后端：本次只做当前库页面引用 metadata 的本地搜索，不做内容索引、跨库查询或后端排名。
- 后端偏好存储：外观偏好走 localStorage，不写 `~/.llm-wiki-agent/config.json`，避免把视觉偏好和应用配置混在一起。
- 新 UI 框架：继续 shadcn/Tailwind v4/React 19，不引入新的组件框架。
- 96 组合全排列视觉测试：用关键组合截图覆盖主轴，不做机械全排列。

### Test Coverage Diagram

```
CODE PATHS                                             USER FLOWS
[+] appearance.ts                                       [+] 外观调参
  ├── [★★★ planned] defaults/read/write                  ├── [★★★ planned] 齿轮打开/关闭
  ├── [★★★ planned] applyAppearance data-*                ├── [★★★ planned] 分段/色板真实点击
  └── [★★★ planned] theme + .dark single writer           └── [★★★ planned] localStorage 恢复

[+] TopBar                                               [+] 顶栏全局操作
  ├── [★★★ planned] KB origin/valid display               ├── [★★★ planned] 主题切换
  ├── [★★★ planned] model save + active refresh            ├── [★★★ planned] 模型切换后显示刷新
  ├── [★★★ planned] chat/graph status snapshots            └── [★★★ planned] 新对话 / 搜索 / 外观
  └── [★★★ planned] no duplicated per-view statusbar

[+] Search                                               [+] ⌘K 搜索
  ├── [★★★ planned] 1k/5k refs fuzzy filter               ├── [★★★ planned] ⌘K 打开
  ├── [★★★ planned] CJK/path/title/sort/empty              ├── [★★★ planned] 输入过滤
  ├── [★★★ planned] no-kb/interface-failure states         ├── [★★★ planned] Arrow/Enter
  └── [★★★ planned] current-kb refs only                   └── [★★★ planned] 点击开抽屉/插引用

[+] RightDrawer                                          [+] 阅读抽屉
  ├── [★★ planned] static summary rendering                ├── [★★★ planned] resize drag
  ├── [★★★ planned] resize/tab/fullscreen interaction      ├── [★★★ planned] tab switch
  └── [★★★ planned] close/fullscreen state                 └── [★★★ planned] fullscreen toggle

[+] Visual regression                                    [+] 浏览器主流程
  ├── [★★★ planned] visual:paper smoke in Phase 1          ├── [★★★ planned] 1440/1024/768
  ├── [★★★ planned] key theme/paper combinations           ├── [★★★ planned] long chat scroll
  ├── [★★★ planned] font success/failure fallback          └── [★★★ planned] export/batch/drawer
  └── [★★★ planned] baseline/actual/update rule

COVERAGE TARGET: 100% of planned branches either unit-tested, DOM-tested, or browser-verified.
```

Legend: ★★★ behavior + edge/error path; ★★ happy path; ★ smoke.

### Failure Modes

| Flow | Failure mode | Plan coverage |
|---|---|---|
| Appearance writer | `.dark` class and `data-theme` drift | Single `applyAppearance` writer + unit tests |
| TopBar model selector | Config saves but current model pill stays stale | Save calls `handleConfigChanged`; TopBar test asserts refreshed display |
| Status indicators | Moving status ownership into App breaks abort/graph lifecycle | Revised to status snapshot callbacks only |
| Search | Only local 20 refs searched, making ⌘K look broken in real libraries | App/TopBar refs cache + enough-current-kb refs fetch + 1k/5k tests |
| Search | Empty/error states silently render blank | Phase 4 requires no-kb, empty, error states and DOM interaction tests |
| Long chat | Paper cards/texture cause scroll jank | Phase 3 long-chat smoke + no per-message filter/texture rule |
| Drawer | Resize/tab/fullscreen visually present but click/drag broken | Phase 5 DOM/Playwright interaction tests |
| Visual regression | Screenshots exist but are not repeatable | Phase 1 visual harness + Phase 6 baseline/actual/update rules |
| PRODUCT drift | Future agents think default dark/tool shell is still the target | ADR-24/25 and §5.2/§5.4 updated before style implementation |

Critical silent gaps after refresh: 0.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Codex goal execution; checkbox as shipped.

- [ ] **T1 (P1, human: ~20min / CC: ~5min)** — Ledger — Keep Phase 1 pointer and task statuses coherent
  - Surfaced by: Coherence review — progress pointed at 1.1 while 1.0 was pending
  - Files: `docs/plans/2026-06-20-paper-ui-port-progress.json`
  - Verify: JSON parses; current task has no pending prerequisite
- [ ] **T2 (P1, human: ~1h / CC: ~15min)** — Docs — Use ADR-24/25 for Paper UI and testing stack
  - Surfaced by: Coherence review — ADR-23 already belongs to graph edge visualization
  - Files: `workbench/PRODUCT.md`, plan, progress, spec
  - Verify: `! rg "ADR-[2]3.*Paper|ADR-[2]3/24" docs workbench && rg "ADR-[2]5.*测试栈" docs workbench`
- [ ] **T3 (P1, human: ~1h / CC: ~20min)** — Search — Define current-kb refs cache and enough-ref fetch
  - Surfaced by: Feasibility review — ChatPanel currently only holds local 20 refs for `@`
  - Files: `workbench/web/src/lib/api.ts`, `workbench/web/src/App.tsx`, new search helper/tests
  - Verify: `search-filter.test.ts` covers 1k/5k refs + CJK/path/title/empty/error
- [ ] **T4 (P1, human: ~45min / CC: ~15min)** — TopBar state — Use status snapshots instead of lifting lifecycles
  - Surfaced by: Feasibility review — moving abort controller / graph lifecycle to App would over-expand Phase 2
  - Files: `ChatPanel.tsx`, `GraphPanel.tsx`, `App.tsx`, `TopBar.tsx`
  - Verify: TopBar tests cover chat streaming/error and graph loading/building/error snapshots
- [ ] **T5 (P1, human: ~1h / CC: ~20min)** — Test infra — Add shared DOM test setup and Playwright visual harness
  - Surfaced by: Testing review — no reusable DOM setup or visual script exists
  - Files: `workbench/web/package.json`, `workbench/web/test/setup-dom.ts`, `workbench/web/test/render.tsx`, `workbench/web/test/visual/paper-ui.ts`
  - Verify: `npm test` and `npm run visual:paper`
- [ ] **T6 (P2, human: ~45min / CC: ~15min)** — Performance smoke — Add long chat browser sample
  - Surfaced by: Testing review — avoiding `backdrop-filter` alone does not prove long-chat performance
  - Files: visual script/test fixture
  - Verify: 200-500 message fixture scroll/input smoke passes

### Worktree Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 docs/token/appearance/test harness | `workbench/PRODUCT.md`, `workbench/web/src`, `workbench/web/test`, `workbench/web/package.json` | — |
| Phase 2 TopBar/Appearance/Sidebar | `workbench/web/src/components`, `workbench/web/src/App.tsx`, `workbench/web/src/index.css` | Phase 1 |
| Phase 3 chat/tool styling | `workbench/web/src/components`, `workbench/web/src/index.css` | Phase 1 |
| Phase 4 Composer/search/export/batch | `workbench/web/src/components`, `workbench/web/src/lib`, `workbench/web/test`, maybe `workbench/server/src/pages.ts` | Phase 1/2 for TopBar search entry |
| Phase 5 RightDrawer | `workbench/web/src/components`, `workbench/web/src/lib`, `workbench/web/src/index.css` | Phase 1 |
| Phase 6 Graph shell/regression | `workbench/web/src/components`, visual scripts, docs | Phases 1-5 |

Parallel lanes: mostly sequential because `index.css` and `App.tsx` are shared hotspots. If splitting worktrees, only run Phase 5 component work in parallel with Phase 2/3 after Phase 1 lands, and serialize CSS merges.

## /goal starter

```text
/goal Implement docs/plans/2026-06-20-paper-ui-port-phased-plan.md by following docs/plans/2026-06-20-paper-ui-port-progress.json.

Each turn:
1. Read this plan, the progress JSON, docs/spark/2026-06-20-paper-ui-port-design.md supersede note, and workbench/PRODUCT.md §5/§7/§10.
2. Resume from the progress JSON current phase/task. If the pointer and task statuses disagree, fix the ledger first; do not skip a pending prerequisite. Task 1.0 is already complete, so the next implementation task is 1.1 unless the ledger says otherwise.
3. Run `git log --oneline -15` and `cd workbench/web && npm run typecheck`; repair a broken state before starting new work.
4. Work only on the current work unit. Keep graph canvas internals and real cross-kb/fulltext backend search out of scope.
5. When a task requires dev tooling, install it without asking: jsdom, @testing-library/react, Playwright, and `npx playwright install chromium` if Chromium is missing.
6. After verification passes, update the progress JSON status/evidence/turn log and commit the code/docs plus that ledger update together with the task id in the message. Never commit on failed verification. Never push, merge, or amend.
7. When a phase's acceptance checks all pass, record it and continue to the next phase without asking.

Stop only if the goal is blocked, the same verification fails three times, or a new choice would change a locked product/design decision. Done when all six phases are complete, all acceptance checks are proven, and the progress file records final status and residual risk.
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | 未运行（可选） |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 10 findings，全部采纳并入；3 条事实硬伤（ModelSelector 不存在 / KB 无篇数 / 测试栈无 DOM）已核实 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | issues_found | 初审 6 issues + refresh 17 issues，全部采纳并入；0 unresolved，0 critical gap |
| Outside Voice | subagents | Consistency / feasibility / testing challenge | 1 | issues_found | 3 个只读子代理，发现 ledger、ADR、搜索、状态快照、视觉回归、DOM 测试等缺口，全部并入 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 未运行（可选，UI 改动大可考虑） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 未运行 |

- **CODEX:** 第二次以 `gpt-5.5` 跑通（首次因本机 codex 误指 `glm-5.2` 404）。10 findings，核实后全部采纳——含 3 条 Eng Review 漏掉的事实硬伤（#2 ModelSelector 组件不存在、#3 KnowledgeBaseInfo 无篇数、#7 测试栈用 `renderToStaticMarkup` 无 jsdom）。
- **CROSS-MODEL:** Codex #7 纠正了 Eng Review 的 T1——T1 原以为「已有 .tsx 测试 ⇒ 可做交互测试」，实则现有测试是静态 markup，交互测试需新增 jsdom + @testing-library/react（用户批准，ADR-25）。本次子代理进一步补充 Playwright、长对话、搜索大列表、抽屉交互和状态快照风险；方向一致，无冲突。
- **VERDICT:** ENG + CODEX + OUTSIDE VOICES CLEARED — 既有 16 findings + 本次 refresh 17 findings 全部采纳并入计划，0 未决、0 critical gap，可进入实现。UI 改动较大，`/plan-design-review` 可选。

NO UNRESOLVED DECISIONS
