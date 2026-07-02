# 社区视觉对齐设计 · 全局↔社区不割裂

> 状态：Phase 1 待实施（含 fit-aware worldBounds）/ Phase 2 方向已定（方案 A），待评估，不预设推进
> 设计稿：`designs/community-view-visual-alignment/index.html`（分支 `feat/community-view-visual-alignment`）
> 日期：2026-07-02

## 1. 背景与问题

全局图谱用 Sigma（Canvas）渲染，社区内部用 DOM/SVG 渲染。用户反馈：从全局切到社区时视觉割裂，"像换了个应用"。

代码审查定位根因——**三套并行色系打架** + **切换是跨渲染器硬切**：

- 外层 UI（工具条/抽屉）：`--app-accent #e07a5f` 赤陶橙（`workbench/web/src/index.css`）
- 社区图谱节点：按**类型**上色（`--cinnabar/--jade/--amber/--violet` 实色 + 同色硬环常显，`render-styles.ts:1175-1200`）
- 全局 Sigma 状态色：硬编码 Tailwind `#ef4444 / #f59e0b / #0ea5e9`（`sigma-graphology-model.ts:355-360`）
- 进入社区 = `facade.ts` `switchRoute` 从 `sigma-global` 切到 `dom-svg-community`，**默认硬切**（仅 160ms `opacity 0.82→1` 微淡入，`render-styles.ts:39-60`），不是镜头推进。

设计稿探索了"同源延续"方案并被用户认可。本 spec 把设计稿落地到真实代码，**分两阶段**：Phase 1 视觉对齐 + 社区畸变修复（本 spec 重点），Phase 2 镜头推进过渡（方案 A，已调研，待评估）。

## 2. 设计哲学

把全局和社区当作**同一张知识宣纸的两个观察尺度**：

- 全局 = 远景，看社区分布与整体结构
- 社区 = 近景，看清簇内节点与关系
- 切换 = 镜头推进，不是换页

**不割裂 ≠ 高度一致。** 延续的是：纸张底色、强调色、字体、光感语言。因功能而变的是：信息密度、节点大小、标签显隐、边清晰度。两者承担不同功能，允许合理差异。

落地原则（用户明确要求）：**只改必须改的，完整落实到位，不把不需要改的也改了。** 设计稿是示意性原型，不是改动清单——必须逐条对照真实代码确定边界（见 §3）。

## 3. 已澄清的边界（设计稿 vs 真实代码）

### 3.1 颠覆设计稿的发现（不用改）

- **全局 Sigma 节点本来就没光晕**：用 Sigma 默认 circle renderer（纯色圆盘无描边，`sigma-graphology-model.ts:178`）。设计稿里"全局去光晕"是为与"当前现状"对比而虚构的改动，真实代码零工作量。
- **全局底色 `#f4efe4` 已极接近设计稿 `#fdfaf2`**（`tokens.ts:17`，差 5 个色阶，肉眼几乎一样）。不必改 token，改了反而牵动全站。
- **`sigmaLabelColor` 主题逻辑正确**（`sigma-global-renderer.ts:781-783`：暗主题白字 / 亮主题深字），之前怀疑的"倒置"非 bug。
- **节点布局算法两系统共享，但视觉分布不共享**（用户实测确认，纠正先前误导结论）：全局 Sigma 与社区 DOM 都取同一套 atlas 全图坐标（`buildRenderableGraph` 的 `node.point`，`legacy-helpers.ts:1078-1128`），社区**不重新布局**，只改 `focus` 入参影响可见性/预算/显示模式。**但** DOM 社区视图的 `worldBounds` 是仅含社区节点的**紧致包围盒**（`worldBoundsForPoints`，`model.ts:413`），CSS% 坐标 = worldPoint 经该紧致 bounds 各轴归一化（`geometry.ts:112-117`），把社区节点云拉伸铺满屏幕；Sigma 则直接用全图坐标 + 相机。因此同一批节点在两视图的视觉间距/形状不同（实测：全局散布 → 社区聚成椭圆一簇）。**这既造成社区视图肉眼畸变（Phase 1 §4.2⑥ 修），也动摇了 Phase 2 镜头衔接的前提**（两系统坐标同尺度），需原型验证（见 §5.2）。

### 3.2 真正必改 → Phase 1 范围（见 §4）

### 3.3 设计稿夸大项（不照搬）

| 夸大项 | 真实情况 | 处置 |
|---|---|---|
| 规则环形布局（A 社区 5 节点等距环绕） | 真实 atlas 布局（每社区一中心 + 确定性环形，`legacy-helpers.ts:1078-1128`），非力导向；且两系统已共享同坐标（§3.1） | 不动布局算法 |
| 示意性节点数据（14 个手写） | 真实数据来自 adapter | 忽略 |
| Tweaks 面板（halo 强度/edge 透明度/font 切换） | 设计演示控件，非产品功能 | 不落地为 UI |
| "当前现状" variant 复刻的细节 | 仅对比演示，真实基线以代码为准 | 忽略 |
| 节点尺寸"全程不变 r=9" | 真实按状态/importance 分档（有意义） | 不抹平 |

### 3.4 评估项（Phase 1 暂不动，需单独决策）

- **Sigma 标签加底框**：大改（Sigma v3 canvas label 无原生背景，需自定义 label renderer）。远景标签只显 core/selected 且现状裸字可读；远景裸字 / 近景底框的差异本就符合"因功能而变"。**收益低、成本高，暂不做。**
- **抽屉 `--app-accent #e07a5f` 与图谱 `--cinnabar #8b2e24` 两套红**：跨子系统（应用 UI vs 图谱引擎），需产品定夺是否统一。**Phase 1 只统一图谱内部。**
- **conflict 关系色 token 化**：原 Phase 1 评估项，本次砍除。`#d94693` 散落于 DOM 边（`render-styles.ts:651`）/图例 swatch（`render-styles.ts:363`）/Sigma 边（`sigma-graphology-model.ts:287`，深主题 `#f472b6`）共 3 处，社区态另有一组 rgba（`render-styles.ts:1127`）。其属关系边上色系统（ADR-23），该系统尚欠数据管线，待整体演进时一并统一，不为单色提前立项。

## 4. Phase 1：视觉对齐 + 社区畸变修复（本 spec 重点 · 准备实施）

### 4.1 目标

消除切换割裂的视觉与几何基础：配色维度同源、底色不断裂、状态色统一、字体不跳、社区形状不畸变。**不含镜头推进过渡动画**（Phase 2 待评估）。

验收标准：真实数据下从全局进入社区，不再出现**非预期的**"配色维度跳变 / 方格纸突然出现 / 状态红换色 / 字体跳变 / 社区形状畸变"五类割裂感。topic 节点进入社区时由社区色变朱砂属预期差异（§4.2①"已知权衡"），不计入"配色维度跳变"；选中态（朱砂）与 topic（朱砂）在社区视图通过保留的 `scale(1.32)` + 朱砂光晕 vs 底色填充区分，跨视图可读。

### 4.2 改动清单

所有路径相对仓库根。引擎源码在 `packages/graph-engine/src/`。

#### ① 社区 DOM 节点：社区色底 + 光晕仅 hover/选中〔中 · 核心〕

- **现状**：`render-styles.ts:1175-1200` 的 `.dot-core` 按 `data-type` 上**类型实色**（topic=`--cinnabar` / source=`--jade` / synthesis,comparison=`--amber` / query=`--violet` / 默认=`--night`），且 `box-shadow: 0 0 0 4px color-mix(...15%)` 同色**硬环常显**。社区色变量未下发到 DOM（`nodes.ts:57` 仅下发 `--node-size`）。
- **改法**：
  - `nodes.ts`：把节点所属社区色下发为 CSS 变量 `--node-community-color`（复用 `model.ts` 已有的 `getCommunityColor(theme, color_index)`；当前 `nodes.ts:57` 只下发 `--node-size`）。
  - `render-styles.ts:1175-1195`：去掉各 `.dot-core` 默认的 `box-shadow` 同色硬环（**默认无光晕**）；非 topic 节点底色改 `var(--node-community-color)`（社区色），topic 保持 `--cinnabar`。
  - 新增 hover 态：`.node[data-type="X"]:hover .dot-core { box-shadow: 0 0 8px 1px color-mix(in srgb, <对应类型 token> 45%, transparent) }`——类型色柔光晕，按现有 `data-type` 选择器机制取 token（topic=`--cinnabar` / source=`--jade` / …），**无需额外 JS 下发类型色**。
  - `render-styles.ts:1196-1200` 的 selected/focus 朱砂光晕 + `scale(1.32)` 保留（本就是状态触发，无需改默认）。
- **文件**：`packages/graph-engine/src/render/nodes.ts`、`packages/graph-engine/src/render/render-styles.ts`
- **风险**：中。`.dot-core` 当前结构与设计稿光晕语义不同构，但全程用 `box-shadow` 状态化实现，无需新增 DOM 子元素。JS 侧只需新增社区色下发，类型色仍走 `data-type` CSS 选择器。
- **已知权衡**：非 topic 节点对齐 Sigma 的"社区色填充"消除大部分跳变；但 topic 保持朱砂（设计稿"近景强调核心"语义），进入社区时 topic 会从 Sigma 的社区色跳到朱砂——属 §2"因功能而变"的合理差异，非 bug。若后续追求零跳变可让 topic 也走社区色，代价是弱化核心突出。

#### ② Sigma 状态色硬编码 → 引擎 token〔小〕

- **现状**：`sigma-graphology-model.ts:355-360` `sigmaGlobalNodeColor` 硬编码 `selected=#ef4444 / searchHit=#f59e0b / pinned=#0ea5e9 / fallback=#64748b`。
- **改法**：映射到引擎 token——`selected→--cinnabar`、`searchHit→--amber`、`pinned→--violet`、`fallback→--muted`（pinned 用 `--violet` 紫而非 `--night`：`--night` 与默认/community 色可辨识度不足，/review 发现并修订）。需给 `sigmaGlobalNodeColor` 补 `theme` 参数（当前无），从 `getThemeTokens(theme).vars` 取值。
- **文件**：`packages/graph-engine/src/render/sigma-graphology-model.ts`
- **风险**：低，纯取值替换。
- **语义说明**：`selected→--cinnabar` 后，朱砂在 Sigma 表"选中"、在社区 DOM 表"topic 核心"（§4.2①）。两者跨视图不冲突：社区视图里选中态额外带 `scale(1.32)` + 朱砂光晕（§4.2① 保留），topic 用底色填充，视觉可区分。

#### ③ 社区方格纸底 → 全局同源釉面〔小〕

- **现状**：`render-styles.ts:1083-1097` `[data-community-map-state="lightweight"]` 覆盖背景为 `--community-map-paper #f8f1e6` + 两层 42px 方格 `linear-gradient` + radial 高光。
- **改法**：删方格两行 `linear-gradient` 及对应 `background-size`；底色改用与全局同源的 `var(--bg)` + `var(--paper-glow)` 组合（`--bg` 即 §3.1 全局底色 token，亮主题 `#f4efe4`、暗主题自动跟随；社区云 `community-wash` 椭圆仍提供分区感，不依赖方格）。**附带收益**：现 `--community-map-paper #f8f1e6` 是硬编码浅色，墨夜主题进入 lightweight 态纸色不匹配；改 `var(--bg)` 后深主题纸色自动跟随，顺带消除该隐患。
- **文件**：`packages/graph-engine/src/render/render-styles.ts`
- **风险**：低，纯 CSS 删除/替换。

#### ④ 社区边 0.32→0.5 + token 化〔小〕

- **现状**：`render-styles.ts:1111` `.edge { opacity: .32 !important }`；`1114-1128` 按关系类型硬编码 rgba（`rgba(76,109,118,.34)` 等），与全局边 `render-styles.ts:642-648` 用 `color-mix(var(--night)…)` 是两套写法。
- **改法**：opacity `0.32→0.5`；rgba 改 `color-mix(in srgb, var(--night) X%, transparent)` 与全局边共享 token（按关系类型调 X）。
- **文件**：`packages/graph-engine/src/render/render-styles.ts`
- **风险**：低。

#### ⑤ Sigma 标签字体 → 对齐 DOM 主体 sans〔小〕

- **现状**：`sigma-global-renderer.ts:766-783` `sigmaSettingsForTheme` 只设 `labelColor`，未设 `labelFont/labelSize/labelWeight`，Sigma 标签走浏览器默认 Arial。DOM 侧节点标签和绝大多数 UI 用 `--font-ui`（Noto Sans SC 无衬线，`render-styles.ts` 几十处），`--font-serif` 只用在少数装饰标题。
- **改法**：`sigmaSettingsForTheme` 加 `labelFont`，取 `getThemeTokens(theme).vars["--font-ui"]` 字符串传入（Sigma v3 canvas label 不吃 CSS var，需字符串化）。视情况补 `labelSize`/`labelWeight`。
- **关键纠正**：原稿曾写"→ serif"，那是照搬设计稿纸面调性，会与 DOM 主体的 sans 冲突、**制造新的字体跳变**。反转方向，对齐 DOM 主体 = sans，才消除切换割裂。
- **文件**：`packages/graph-engine/src/render/sigma-global-renderer.ts`
- **风险**：低，仅文字渲染外观。

#### ⑥ 社区视图形状畸变 → fit-aware worldBounds〔中 · 几何基础〕

- **现状**：`model.ts:413` `worldBounds = worldBoundsForPoints([...pointById.values()])` 取**紧致包围盒**（仅包社区节点）。DOM 层 CSS% 坐标 = worldPoint 经该紧致 bounds **各轴独立归一化**（`geometry.ts:112-117`），是各向异性仿射；社区云宽高比与 viewport 宽高比相差越大，畸变越重（实测宽屏 1600×900 下 y 方向压缩约 19%，肉眼可见椭圆压扁）。
- **改法**：`focus=community` 时，worldBounds 改用 **aspect-locked** 版（扩展短轴 padding 到与 viewport 同宽高比，不丢节点、不改中心）。改动集中在 `model.ts:413` 一处 + `focus.kind` 条件化（**不得影响 sigma-global 路由**，该路由仍用全图坐标 + 相机）。几何论证与数值实证见 §5.2。
- **文件**：`packages/graph-engine/src/render/model.ts`（及 `geometry.ts:302` `worldBoundsForPoints` 若需加 aspect 选项）
- **风险**：中。牵连面已调研（§5.2）：边/社区云/minimap/hover/hit-test 全走 world 坐标 + viewBox 自动跟随，无需改；节点 CSS% 与 labelSide（`model.ts:1247-1253`）因 bounds 仍包住社区基本不变。**最坏回退**：恢复紧致 bounds（=当前现状，仅形状畸变，不崩溃）。
- **为何纳入 Phase 1**：独立可测、独立消除肉眼畸变；且是 Phase 2 镜头衔接的几何基础（§5.2 实证：fit-aware 下 DOM layer 与 Sigma 同为相似变换，单一 scale 衔接才成立）。提前落地让 Phase 2 依赖面更窄。

### 4.3 不纳入 Phase 1（理由见 §3.4 / §3.3）

Sigma 标签底框、两套红统一、节点尺寸抹平——均不动。布局算法亦不动（两系统共享同一套 atlas **坐标**，但视觉分布因紧致 bounds 各向异性而不共享，见 §3.1；该各向异性由 §4.2⑥ fit-aware 消除）。

### 4.4 验证

- **引擎单测**（`node --test`）：社区节点 DOM 结构与 `--node-community-color` 下发、`sigmaGlobalNodeColor` 的 theme→token 映射、`sigmaSettingsForTheme` 含 `labelFont`（取自 `--font-ui`）、`focus=community` 时 worldBounds 为 aspect-locked（与 viewport 同宽高比）且 sigma-global 路由不受影响。
- **前端视觉回归**（`npm run visual:paper -w @llm-wiki-agent/web`，playwright）：覆盖全局 + 社区两态的纸面快照；**新增宽屏（如 1600×900）社区快照**确认形状畸变消除。
- **手动**：真实数据下切换全局↔社区，对照设计稿确认五类割裂感消除（含社区形状畸变）。
- **回归**：`npm run typecheck`（前端/后端 typecheck 会自动带上最新引擎产物）、引擎 `npm run test -w @llm-wiki/graph-engine`。
- **双宿主**：Phase 1 全部改动落在引擎内部（CSS 经 `ensureGraphRendererStyles` 自注入、token 经 `applyTheme` 自写到引擎根元素，不依赖宿主）。前端 web 与 Skill 离线 HTML 两个宿主自动同享，离线 HTML 侧零额外动作。

## 5. Phase 2：镜头推进过渡（路线图 · 已调研 · 待评估）

> 本节写明设计意图与方案 A 完整设计。Phase 2 是否推进待 Phase 1 上线后真实使用评估（§8），不预设。

### 5.1 设计意图

现状进入社区是 Sigma→DOM 跨渲染器**硬切**。要让切换像设计稿那样"镜头推进"：节点位置不动、画面平滑放大聚焦到该社区。设计稿里的丝滑过渡是同一 SVG 内 `transform: scale()` 动画（天然平滑），真实代码是跨渲染器切换——Phase 2 补上这个差距。

### 5.2 可行性结论：fit-aware worldBounds 已实证（先前"成立"结论经纠正 + 几何验证）

> **归属变更**：本节的 fit-aware worldBounds 改动**已纳入 Phase 1 §4.2⑥ 落地**（独立消除社区畸变 + 为 Phase 2 镜头衔接提供几何基础）。以下几何论证保留作为 §4.2⑥ 的依据，并支撑 Phase 2 方案 A 的相似变换前提。
>
> 先前"零件齐全、接线即可"的乐观判断已被用户实测推翻。经原型几何验证，方向收敛并被数值证实。

**根因（已定位）**：DOM 社区视图把 worldPoint 经**紧致 worldBounds**各轴归一化为 CSS%（§3.1）。DOM layer 坐标是 worldPoint 的**各向异性仿射**（x/y 各自归一化到社区云宽/高）；Sigma 是全图坐标的**相似变换**（x/y 同尺度）。两族不同 → 方案 A 单一 scale 衔接畸变。

**几何原型实证**（临时脚本，不进产品；合成社区云宽高比 2.25）：

| viewport | 紧致 bounds 各向异性 scale_y/scale_x | fit-aware 各向异性 |
|---|---|---|
| 1600×900 (1.78) | **0.81（y 压缩 19%，肉眼可见畸变）** | 1.0000 |
| 1200×800 (1.50) | 0.96（轻微） | 1.0000 |
| 1000×680 (1.47) | 0.98（轻微） | 1.0000 |

畸变程度 = 社区云宽高比与 viewport 宽高比之差。**fit-aware bounds（与 viewport 同宽高比）三种 viewport 下各向异性均 = 1.0000**（严格相似变换）→ DOM layer 与 Sigma 同族，方案 A 单一 scale 镜头衔接几何成立。

**依赖面调研**：fit-aware 牵连极小——边/社区云/minimap/hover/hit-test 全走 world 坐标 + viewBox 自动跟随，无需改；节点 CSS% 与 labelSide（`model.ts:1247-1253`）因 bounds 仍"包住社区"基本不变。**全图** worldBounds 牵连大（CSS% 体系重写），不取。

**方向定为 fit-aware worldBounds**（已纳入 Phase 1 §4.2⑥）：改 `model.ts:413` `worldBounds = worldBoundsForPoints(...)`，`focus=community` 时改用 aspect-locked 版（与 viewport 同宽高比）。改动仅此一处 + `focus.kind` 条件化（不得影响 sigma-global 路由），其余消费者自动跟随。**附带收益**：即便不做镜头衔接，fit-aware 也消除当前社区视图的形状畸变（紧致的 0.81 各向异性）——这也是它纳入 Phase 1 的理由。

**sim 仍无需衔接**（不受 worldBounds 影响）。几何相似性是真机无缝的必要条件、已证实；充分性（切换时序/相机读取/CSS transition）属实施工程，留 writing-plans 实施步骤验证。

**sim（d3-force 柔性扰动）已验证无需衔接**：DOM/SVG 管线的 `LiveGraphSimulation` 只在 DOM renderer 跑，Sigma 全局不跑；但切换瞬间 DOM 首帧 paint 用的是干净 atlas 坐标——`rebuildAndPaint` 顺序为 `buildRenderableGraph`（不传 positions，走 atlas）→ `paint` → 末尾才 `restartSimulation`（`render-pipeline.ts:114,134,189`），sim 回写（`applyMotionFrame`）走 d3-timer 独立 RAF、最早下一帧才发生。且冷启动 `coldStartAlpha=0.08`（`sim/index.ts:120`，d3 默认 1.0）+ forceX/Y 以 `baseX/baseY` 为锚（`sim/index.ts:105`），首帧位移亚像素级、肉眼无感；sim 与 viewport fit 动画作用对象正交（前者移节点相对位移，后者移 content layer），不打架。因此 Phase 2 只做镜头衔接，**不碰 sim 启动逻辑**。

### 5.3 两条独立路径（避免混淆）

- **点社区高亮（spotlight）**：`sigma-global-camera.ts` `maybeAnimateSigmaCommunitySpotlightCamera`，Sigma 内部相机放大（380ms），**不切渲染器**，本就平滑。
- **点"进入社区"按钮**：`facade.ts:337-342` `focusCommunity` → `switchRoute("dom-svg-community")`，**跨渲染器切 DOM**——Phase 2 的目标。

### 5.4 方案 A 完整设计

#### 5.4.1 核心思路

> 前提（两系统坐标同变换族）已由 §5.2 的 fit-aware worldBounds 实证满足：DOM layer 与 Sigma 均为 worldPoint 的相似变换，单一 scale 衔接成立。

**前置改动**：fit-aware worldBounds（`model.ts:413` aspect-lock）已在 Phase 1 §4.2⑥ 落地，消除各向异性——本节换算依赖此几何基础。

切换时读 Sigma 末帧相机 → 几何换算成 DOM `RendererViewport` 初始态 → DOM 的 `focusCommunity` fit 动画从该初态推进到目标 fit，呈现镜头推进。

#### 5.4.2 换算函数（新文件，独立可单测）

**推荐"两点几何法"**——量纲无关，绕开 Sigma `ratio` 与 DOM `scale` 的标定难题：

```
对两个不重合的世界点 w1, w2：
  sigmaScreen(w) = sigmaWorldPointToScreenPointForCameraState(sigma, w, cameraState)  // 已存在
  layerPoint(w)  = worldPointToLayerPoint(w, viewportSize, worldBounds)                // 已存在
  scale = |sigmaScreen(w2)-sigmaScreen(w1)| / |layerPoint(w2)-layerPoint(w1)|
  vp.x  = sigmaScreen(w1).x - scale * layerPoint(w1).x
  vp.y  = sigmaScreen(w1).y - scale * layerPoint(w1).y
```

新函数签名（放新文件 `packages/graph-engine/src/render/route-transition-viewport.ts`）：

```ts
export function sigmaCameraToDomViewport(inputs: {
  sigma: SigmaGlobalSigmaLike;
  cameraState: SigmaGlobalCameraState;
  viewportSize: RendererViewportSize;
  worldBounds: GraphWorldBounds;
}): RendererViewport | null;   // angle≠0 / 投影异常 / sigma 不可用时返回 null → 调用方回落 DEFAULT
```

复用：`sigmaWorldPointToScreenPointForCameraState`（`sigma-coordinates.ts:50-61`）、`worldPointToLayerPoint`（`geometry.ts:99`）、`normalizeRendererViewport`（`viewport.ts:73`）。anchor 构造与旋转检测参照 `sigma-overlay-camera-transform.ts:30-47,109-114`。

#### 5.4.3 接口扩展

`SigmaGlobalRenderer`（`sigma-global-types.ts:96-109`）新增两个可选 getter，实现于 `sigma-global-renderer.ts:206-314`（闭包内 `sigma` 与 `readCameraState` 已在作用域）：

```ts
interface SigmaGlobalRenderer {
  getSigma?(): SigmaGlobalSigmaLike | null;
  readCameraState?(): SigmaGlobalCameraState | null;   // sigma-global-camera.ts:28-37 已有逻辑
}
```

#### 5.4.4 switchRoute 改造（`facade.ts:534-544`）

当前已是"先 `createNext` 后 `destroy previous`"顺序（利好：读相机可在 destroy 前）。改造：

- `switchRoute` 签名加 `RouteHandoff`：`createNext: (handoff: RouteHandoff) => GraphFacadeRenderer`，`RouteHandoff = { initialViewport?: RendererViewport | null }`。
- switchRoute 内、调 `createNext()` 前：若 `previous` 是 Sigma renderer，调 `previous.readCameraState()` + `sigmaCameraToDomViewport(...)` 算出 `handoff.initialViewport`。
- `focusCommunity`（`facade.ts:337-342`）把 `handoff.initialViewport` 透传给 `createDomSvgCommunity`。
- 其余 4 处 `switchRoute` 调用点（`switchToGlobalRoute` 等，`facade.ts:438-532`）签名适配，忽略 handoff。

#### 5.4.5 createGraphRenderer 接受 initialViewport（`graph-renderer-root.ts`）

- `GraphRendererOptions` 加 `initialViewport?: RendererViewport | null`。
- `:122-129` 初始化 `runtimeState` 时用 `options.initialViewport ?? DEFAULT_RENDERER_VIEWPORT`，并首帧 `commitViewport` 写到 DOM（确保首屏在初始 viewport，非默认 `{0,0,1}`）。
- `GraphFacadeRouteRendererFactoryInput`（`facade.ts:135-140`）加 `initialViewport?`，`createDomSvgFacadeRenderer`（`facade.ts:632-662`）透传。

#### 5.4.6 fit 动画链路（已核实成立）

`focusCommunity` → `controller.focusCommunity`（`controller.ts:468-478`）→ `fitRendererViewportToPoints` 算目标 fit → `viewportCommitter.schedule` + `setViewportAnimating(true)` → CSS `transition: transform .2s`（`render-styles.ts:578-580`）。若初态 = Sigma 末帧换算值，这段 transition 即"镜头推进"。

建议为推进单独引入类（如 `is-route-push-animating`）用更慢曲线（`.42s cubic-bezier(.22,.61,.36,1)`），并配 `@media (prefers-reduced-motion: reduce)` 关闭（参照 `render-styles.ts:44-50`）。

#### 5.4.7 风险清单（均已有缓解）

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 读相机须在 destroy 前 | switchRoute 已是 createNext→destroy 顺序，handoff 推导放 createNext 前 |
| R2 | Sigma `ratio` 与 DOM `scale` 量纲不同 | 两点几何法绕开标定 |
| R3 | angle≠0 退化（用户旋转过） | 检测旋转返回 null → fallback DEFAULT |
| R4 | 两 renderer 短暂并存指针冲突 | createNext 后先 `previous.disableInteraction?.()` 再 destroy |
| R5 | prefers-reduced-motion | 媒体查询关 transition，或不传 initialViewport 直接 fit |
| R6 | viewportSize 时机 | 取 facade container.getBoundingClientRect()，此时 Sigma 已挂载 |
| R7 | Sigma 未加载完就点"进入社区"按钮 | getSigma 返回 null → 无 initialViewport → fallback 到当前硬切（**不退化**） |
| R8 | focusCommunity 双重 fit | createGraphRenderer 首帧不调 `fitRendererViewportToPoints`（initialViewport 仍由 §5.4.5 commitViewport 写入）；fit 仅 controller.focusCommunity 触发 |

#### 5.4.8 工作量

约 **150 行新增/修改 + 1 个新文件**（`route-transition-viewport.ts` ~70-90 行）。核心逻辑集中在换算函数，独立可单测。（fit-aware worldBounds 已计入 Phase 1，不含于此。）

#### 5.4.9 实施顺序（供 writing-plans）

1. 换算函数 + 单测（独立先绿）
2. SigmaGlobalRenderer 接口扩展（getSigma/readCameraState）+ 测试
3. createGraphRenderer 接受 initialViewport + 测试
4. switchRoute 签名 + handoff 推导 + 4 调用点适配 + 测试
5. CSS 推进动画类 + reduced-motion
6. 手动视觉验证（真机切换无缝）

> 前置：fit-aware worldBounds 已在 Phase 1 §4.2⑥ 完成。

#### 5.4.10 测试策略

- 新增 `route-transition-viewport.test.ts`：单位态、纯缩放 round-trip、纯平移、angle≠0 返回 null、NaN 保护、两点重合保护。
- 扩展 `route-continuity.test.ts`：handoff 传递、Sigma 不可用 fallback、switchRoute 调用顺序（readCameraState 在 destroy 前）。
- 扩展 `sigma-global-renderer.test.ts`：getSigma/readCameraState 在 destroy 前后行为。
- 手动：真实切换视觉为推进、reduced-motion 即时定位、Sigma 未加载完不报错。

## 6. 设计稿说明

`designs/community-view-visual-alignment/index.html`（分支 `feat/community-view-visual-alignment`，commit `3ea1d7c`）是**示意性可交互原型**，用于验证视觉方向（同源色板、光晕语义、字体、底色、切换过渡感受），**不是改动清单**。其规则环形布局、Tweaks 面板、"当前现状"对比 variant 均为演示用途，落地以本 spec §3 边界为准。

## 7. 风险与回滚

- **Phase 1**：6 项改动（5 项 token/CSS/取值级 + 1 项几何 bounds），相互独立，每项可单独回滚；无架构改动。fit-aware worldBounds 最坏回退即恢复紧致 bounds（=当前现状，仅形状畸变，不崩溃）。
- **Phase 2**：镜头换算失败/Sigma 未加载时自动 fallback 到当前硬切行为，**不退化**。换算函数独立、先行、单测覆盖，风险最低的模块先落地。

## 8. 后续与未决

- **Phase 2 实施（待评估，不预设推进）**：方向已定（方案 A，§5.2 实证），但镜头推进的"真机无缝充分性"属实施工程、spec 未证实。建议 Phase 1（含 fit-aware）上线后真实使用 1-2 周，再判断"同源化 + 畸变消除后，硬切是否已可接受"——若是，Phase 2 可不做或降级为更轻的 opacity 淡入拉长；若仍割裂，再据 §5 writing-plans。近期 Sigma 主线（性能/稳定性）刚收敛，Phase 2 宜推到下一个稳定窗口。
- **评估项**（单独决策，不阻塞 Phase 1/2）：
  - Sigma 标签底框是否值得 custom label renderer 的成本。
  - 抽屉 `--app-accent` 是否对齐图谱 `--cinnabar`（跨子系统，产品定夺）。
  - conflict 关系色 token 化（原 §4.2⑥，本次砍除）：待关系边上色系统（ADR-23）整体演进时，一并统一散落于 DOM 边/图例/Sigma 边的 3 处 conflict 色。
