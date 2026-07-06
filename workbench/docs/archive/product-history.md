# Product History Archive

本文件从 `workbench/PRODUCT.md` 拆出，保存旧阶段记录、提交表、验收实况和历史 changelog。

这里是历史账本，不是当前产品方向的唯一依据。恢复当前方向时先读 `workbench/PRODUCT.md`；需要追溯某个阶段为什么这样做，再读本文件。

本文件里的 `§4`、`§10` 等章节引用保留拆分前的原始语境，可能指向当时的 `PRODUCT.md` 结构。文中的 `server/`、`web/` 等路径可能是旧独立仓库时期路径，当前实际路径以 `workbench/PRODUCT.md` 和 `workbench/AGENTS.md` 为准。

---

## 10. 进度追踪

### 阶段一：主干打通 ✅ 已完成 2026-05-26

| # | 任务 | Commit |
|---|---|---|
| 1 | 仓库骨架：`package.json` / `.gitignore` / `README.md` / `LICENSE` / `tsconfig.json` | `81ddb29` |
| 2 | 后端骨架：Node + Hono，最小 `/api/echo` | `5ffd2c0` |
| 3 | 前端骨架：Vite + React + shadcn/ui + SSE echo 排练 | `3662b60` |
| 4 | 接入 pi-coding-agent SDK，实现真 agent 对话 | `c4e0dad` |
| 5 | 第一个 Extension：注入 `currentKnowledgeBase` 上下文 | `ebe054b` |
| 6 | 知识库扫描接口：扫 `~/llm-wiki/` + 读 `config.json` 外部库 | `daebc62` |
| 7 | 前端知识库选择 UI + 三栏布局雏形 | `49dc00e` |
| 8 | 同库多对话 + 切换 + 持久化（阶段一完结） | `75e176b` |
| – | review 修补：一行 `npm run dev` / auto-restore / 默认深色 / 顶部状态条占位 | `f835433` |
| – | TBD-2 删 Sonnet 表述 + 光标真闪烁 | `dd021bc` |

阶段一完成情况详见 §4 阶段一末尾的"完成情况"小节。

### 阶段二：核心循环（@、/、结晶、消化）✅ 已完成 2026-05-27

**最终 PR**：[#1 feat: complete stage 2 core loop](https://github.com/sdyckjq-lab/llm-wiki-agent/pull/1)（base: main, head: stage-2）

**8 step commit + 5 fix commit + 1 doc 修订 commit**：

| # | 任务 | Commit |
|---|---|---|
| 1 | `/sediment` Extension：结晶对话到 `wiki/synthesis/sessions/` | `fe54d47` |
| 2 | `/new-wiki` Extension：spawn `init-wiki.sh` 新建库 | `5ab13dc` |
| 3 | `/api/refs`：候选页面列表（递归 fingerprint 缓存） | `b0802b8` |
| 4 | `/api/commands`：内置 + Skill 命令合并（TBD-1 方案 B） | `202bf4d` |
| 5 | 设置面板：API key 三层认证 + 测试连接（TBD-2 方案 B） | `3654791` |
| 6 | `/` 命令补全 UI（cmdk） | `b6dffc0` |
| 7 | `@` 补全 + 右抽屉 + markdown 渲染（react-markdown） | `7801d2c` |
| 8 | 消化新素材 chip | `7a46f4b` |
| – | fix: 设置面板可关闭 | `c045b9e` |
| – | fix: `/api/commands` 包含 Claude skill | `791d73a` |
| – | fix: agent resource loader 加载 Claude skill 目录 | `f990229` |
| – | fix: 新建库 UI 端点 + refs cache fingerprint 升级 + Sidebar 加按钮 | `a088b97` |
| – | fix: 右抽屉支持 Esc 关闭 | `2686b51` |
| – | docs(stage-2): 闭合验收 issue #2/#3/#4 + 标 TBD-3 已解决 | `208ad4d` |

**阶段二完成情况** ✅ 2026-05-27（合并 PR #1 后）
- 范围 7 项全部交付（@、/、/sediment、/new-wiki、链接预览、消化、设置面板）
- 验收 3 条全过：建库 / 消化→讨论→结晶 闭环 / API key 落 `~/.pi/agent/auth.json`
- 关键架构决策：**D9 能力归属原则**（消化等知识库本职 → Skill；对话结晶等 agent 元能力 → Extension）落地，对应 ADR-16 长期合并愿景
- **超出原设计的增强**：
  - `POST /api/knowledge-bases/new` + `NewWikiDialog`（UI 直接建库，不必先与 agent 对话）
  - `pages.ts` cache 升级 mtime → 递归 fingerprint（修了"嵌套新建后 refs 看不到"的潜在 bug）
  - `wiki-init.ts::findInitScript()` 兼容 init-wiki.sh 在 skill 根目录或 `scripts/` 两种位置
- **接受的妥协**（不阻塞阶段三）：
  - 设置面板只做认证 Tab（默认模型 / 根目录 / 外部库管理推迟）
  - Anthropic 测试连接未跑（缺 key），但代码路径同 DeepSeek 一致
- **新增依赖**：见 §3.2 + ADR-17

### 阶段三：产出能力（产品亮点）✅ 已完成 2026-05-27

**最终分支**：`stage-3`（base: main, head: `1f1f591`）

**8 step commit + 1 fix commit**：

| # | 任务 | Commit |
|---|---|---|
| 1 | vendor 4 个 anthropics Skills + 收紧命令源标签 | `6d2e218` |
| 2 | 产物 manifest 存储 + CRUD API | `f19687c` |
| 3 | 导出按钮 + prompt 模板（3 通道触发） | `bf6b878` |
| 4 | 产物右抽屉多 Tab 切换 | `bc70b2c` |
| 5 | HtmlRenderer：iframe sandbox 预览 | `862265a` |
| 6 | DownloadOnlyRenderer：元数据卡片 + 下载 | `38006a7` |
| 7 | 全局 Skill 可见性开关（settings toggle） | `1016601` |
| 8 | 产物工作流 UX 打磨 | `91a9761` |
| – | fix: 修复导出工作流 review 问题 | `1f1f591` |

**阶段三完成情况** ✅ 2026-05-27（审查通过，合并到 main）
- 范围全部交付：5 个导出按钮（PDF/Word/PPT/Excel/HTML）+ 4 个 vendored Skills + 2 个 Extension 工具 + 6 个新 API + 1 个新 SSE event
- 关键架构决策：**E13（D9 落地）**——产出操作走 Skill，`prepare_artifact` / `finalize_artifact` 作为 agent 元能力 Extension；HTML 导出不依赖 Skill，由 agent 内置能力直接生成
- 新增 4 个端点：`GET /api/artifacts`、`GET /api/artifacts/:id`、`GET /api/artifacts/:id/files/:filename`、`POST /api/config` + `GET /api/config` 扩展 `showUserGlobalSkills`
- 安全验证通过：path traversal 防护、iframe sandbox（无 `allow-same-origin`）、UIID 验证、文件名净化
- **接受的妥协**（不阻塞阶段四）：
  - PPTX 在浏览器内无预览（DownloadOnlyRenderer），设计文档原定的 PPTXjs 方案未落地
  - HTML 导出不依赖外部 Skill，由 agent 内置 fs 能力直接生成（TBD-5 方案）
- **新增依赖**：无（0 个新 npm package）

### 阶段 3.5：导航 UX 重构 + 多模型子代理批量消化 ✅ 已完成 2026-05-27

**当前状态**：已合并到 `main` 并推送；阶段性分支已清理

**7 step 概览**：

| # | 任务 | 状态 |
|---|---|---|
| 1 | 侧栏重构：统一 KB 列表 + 折叠对话子树 | ✅ |
| 2 | 拖拽 + 输入框路径填充（含 inspect 端点） | ✅ |
| 3 | 非 wiki 目录初始化引导 | ✅ |
| 4 | 多模型双角色（main / digest） | ✅ |
| 5 | 后端子代理批量消化框架 | ✅ |
| 6 | 批量消化 UI + SSE 进度推送 | ✅ |
| 7 | 总验收 + UX 体感打磨 | ✅ |

**关键风险**：
- TBD-3.5-1：子代理 session 共享 `authStorage` / `modelRegistry` 的资源生命周期未实测（codex 起手第一件事写 60 行验证）
- TBD-3.5-2：`init-wiki.sh` 就地初始化会写入固定文件，必须先做冲突检测与备份（Step 3 起手看源码确认文件列表）
- TBD-3.5-3：main 角色已接管主对话；设置切换后重载当前活跃对话

**验收实况**：
- `npm run --silent typecheck` 通过
- `node --import tsx --test server/src/digest/concurrency.test.ts` 通过
- 本地接口实测通过：目录 inspect、初始化冲突 409、就地初始化成功、模型列表、模型角色保存、批量消化参数校验
- 单文件批量消化真实跑通，SSE 返回 start / file_start / file_complete / done，并写入 `wiki/synthesis/sessions/`
- 验收后补强：批量消化改为逐文件失败隔离，进度面板显示每个文件状态、生成字数和结果入口；外部目录批量消化改用 inspect 扫描凭据，不再信任前端传任意 sourceRoot；初始化后批量消化可临时选择 digest 模型
- 收尾补强：当前知识库自动检索已落地；批量消化后直接提问会先检索当前知识库，普通寒暄和导出指令不会误触发检索
- UI 视觉迁移补强：基于本地原型 `index.html` 统一工作台视觉，补齐浅色 / 深色主题切换；保持原有侧栏、对话、引用、命令、产物抽屉、设置、批量消化流程不变，不新增依赖
- 预览布局补强：侧栏可折叠为 52px 窄图标栏，右抽屉支持拖动调宽和双击恢复默认宽度；折叠状态与抽屉宽度保存在本机；移动端继续使用全屏抽屉
- 设置面板补强：设置弹窗限制最大高度，标题区保留在顶部，设置内容在弹窗内部滚动；底部 Skill 加载区在较矮屏幕下也可达

### 阶段四：monorepo 合并 + 图谱活地图 ✅ 已完成 2026-06-12

**当前状态**：已在主仓库 `stage-4` 分支完成。8 个 Step 均有提交或人工验收证据，最终自动化检查全绿；视觉一致性、拖动手感、墨夜观感保留为验收人主观判断项。

**8 Step 概览**：

| # | 任务 | 状态 |
|---|---|---|
| 0 | monorepo 搬家（subtree + workspace 根 + 冒烟） | ✅ |
| 1 | 引擎包骨架 + helpers TS 化 + 测试迁移 | ✅ |
| 2 | 工作台图谱视图静态复现（安全网基线）+ 主题 token | ✅ |
| 3 | 活模拟 + 钉扎 + 持久化 | ✅ |
| 4 | 选区系统 + 对话联动 | ✅ |
| 5 | 文件监听 + 重算链 + 生长动画 | ✅ |
| 6 | Skill 离线 HTML 切换引擎产物 | ✅ |
| 7 | 总验收 + 墨夜打磨 | ✅ |

**关键风险处理结果**（详见设计文档 §7）：根 package.json 未设置 type:module；手绘路径采用帧缓存；macOS Node 22 原生 `fs.watch` recursive 实测可用，未引入 chokidar；subtree 与提交前隐私路径检查均通过。

**设计来源**：2026-06-12 四轮设计对话（战略定位 → 选区 → 钉扎持久化 → 生长事件链 → 引擎抽取），关键结论沉淀为 ADR-20 / ADR-21。

### 阶段 4.5：图谱可用性收尾 ✅ 已合入 2026-06-14

**当前状态**：已合入。决策记录见 ADR-22。

**设计来源**：作者实测五问题（缩放缺失 / 点击语义错位 / Shift 不可发现 / 无搜索图例 / 节点过胖）+ 阶段四验收的离线功能减配裁决。两处上游盲区已在设计中修正：stage-4 plan 漏列画布导航 WU；stage-4 D6 映射表缺单节点行。

### 阶段 4.6：图谱演进第一批 ✅ 已完成 2026-06-14

**当前状态**：已完成并通过总验收。关系类型和置信度已分字段，渲染用关系类型控制颜色、置信度控制虚实；社区聚焦、类型筛选、顶部工具条、边图例、双宿主分工均已落地。决策记录见 ADR-23，ADR-21 已同步 4.6 对社区交互和工具条的修订。

### 阶段 4.7：图谱交互地基重构 ✅ 已完成 2026-06-16

**当前状态**：已完成核心交互地基。滚轮缩放、拖拽、点击、悬停、社区色块、小地图边界在工作台与离线 HTML 中保持同一套行为；社区色块是视觉提示，不是拖动围栏。

**后续触发门**：空间索引、Canvas/WebGL、密度策略重做、小地图拖拽导航都不属于本阶段；只有真实使用或性能证据证明需要时再启动。

### 阶段 4.8：图谱演进——全局社区高亮（spotlight）✅ 已落地

**当前状态**：已落地。点社区先在全局高亮并打开摘要；点击「进入社区」后进入 Sigma 社区阅读，只显示当前社区内部结构。#75 已补齐动画期间 overlay 轻量跟随和结束后精确校准。

### 阶段五：未开始（Tauri 打包已决策推迟，见 ADR-20）

### 协作约定（历史记录，当前规则见工作台 AGENTS / CLAUDE）

以下是当时阶段性协作约定，不作为当前执行规则。当前规则以 `workbench/AGENTS.md` 和 `workbench/CLAUDE.md` 为准。

当时约定为：每一步动手前 AI 先说计划，由作者确认后再进入下一步。每完成一步：

- AI 列改动清单（文件、依赖、决策）
- 作者确认理解
- AI 创建 git commit（commit message 含本步范围 + 实测验收要点）
- 进入下一步

---

## 附录 A：术语表

| 术语 | 解释 |
|---|---|
| **Skill** | Anthropic 提出的能力包格式：一个目录 + 一份 SKILL.md。详见 [agentskills.io](https://agentskills.io/) |
| **pi-agent** | TypeScript agent runtime，原生支持 Skill 标准。`@earendil-works/pi-coding-agent` |
| **SSE** | Server-Sent Events，服务器单向推送事件给浏览器的 HTTP 标准 |
| **Extension** | pi-agent 的扩展机制：TS 模块，能注册自定义 tool / 命令 / 拦截事件 / 持有状态 |
| **Tauri** | 用系统 webview + Rust 后端打包跨平台桌面应用的框架，二进制和内存占用通常显著低于 Electron |
| **Hono** | 轻量 TypeScript web 框架，跑 Node / Bun / Deno / Cloudflare 都行 |
| **shadcn/ui** | 组件库，但代码是直接复制到你仓库的（不是 npm 黑盒），方便修改 |
| **对话结晶 / 沉淀** | 把工作台当前对话内容固化为 wiki 页面的动作；Skill 侧另有手动结晶 / crystallize |

---

## 附录 B：参考链接

- pi-agent 仓库：https://github.com/earendil-works/pi
- pi-agent Skill 文档：`packages/coding-agent/docs/skills.md`
- pi-agent SDK 文档：`packages/coding-agent/docs/sdk.md`
- pi-agent Extension 文档：`packages/coding-agent/docs/extensions.md`
- llm-wiki-skill 仓库：https://github.com/sdyckjq-lab/llm-wiki-skill
- Anthropic Skill 标准：https://agentskills.io/specification
- Anthropic 官方 Skills：https://github.com/anthropics/skills
- pi-skills：https://github.com/badlogic/pi-skills
- Tauri 文档：https://tauri.app/
- shadcn/ui：https://ui.shadcn.com/

---

> 本文档第一版完成于 2026-05-26。现在只作历史归档，不再追加 changelog；新的发布记录写入根目录 `CHANGELOG.md`。

## Changelog

- **2026-06-27 v22（全局 Sigma 缩放手感修复 #73）**：修掉全局图谱触控板/滚轮缩放的"按档位卡顿"
  - 根因：wheel 路径在相机动画进行中时改走 `animate({duration:1})`，被 Sigma 的 rAF 重入切成离散跳变，违背设计 §5"滚轮直接更新相机、不排队动画"
  - 修复：wheel 无条件走 `camera.setState`（即时）；`handleSigmaWheelZoom` 补 `destroyed` 守卫；同步更新测试断言与盲区注释
  - 验证：单元 460 pass；浏览器生产回归 33 records / 3 shapes PASS；实机确认手感改善
  - 已知局限：合成 wheel 事件测不准真实触控板"积压"，手感以实机为准（测试已加注释）
  - 分支 `codex/fix-global-graph-zoom-controls`，9 个 commit（`05be23d`..`9c897cf`）
  - 后续债务：sigma-global-renderer.ts 又涨到 1566 行，拆分已立项 #77（承接 #64）
- **2026-06-20 v21（Paper UI 立项与文档对齐）**：确认工作台默认外观迁移为 Paper 暖纸
  - §5.2 顶部状态条改为统一顶栏：知识库静态展示，搜索、模型、新对话、主题、外观和设置集中在全局操作区
  - §5.4 视觉风格改为默认浅色暖纸、夜灯可切、Plus Jakarta Sans / Caveat / JetBrains Mono 字体组合
  - §7 新增 **ADR-24**（Paper 暖纸视觉方向与外观偏好）与 **ADR-25**（前端交互测试与 Paper 视觉回归栈）
  - 明确图谱画布内部 Paper 化和真实跨库 / 全文搜索后端后置
- **2026-06-16 v20（阶段 4.7 图谱交互地基完成）**：补记图谱交互地基重构
  - §4 新增阶段 4.7：记录缩放、拖拽、点击、悬停、社区色块、小地图边界统一为同一张地图心智
  - 明确社区色块是视觉提示，不是拖动围栏；节点可离开色块，社区归属仍由真实链接决定
  - 明确空间索引、Canvas/WebGL、密度策略重做、小地图拖拽导航均需真实使用或性能证据触发，不属于本阶段
  - §10 新增阶段 4.7 状态，方便后续恢复上下文
- **2026-06-14 v19（阶段 4.6 实施完成）**：图谱演进第一批完成并同步文档
  - §4 / §10 阶段 4.6 状态改为已完成，记录工具条、社区聚焦、类型筛选、关系边图例、双宿主分工的验收结果
  - §4 图谱演进候选池标注首批已落地项；图谱增强检索明确移交 ADR-19 检索线
  - §7 ADR-19 增补检索线归属说明，ADR-21 增补社区聚焦与顶部工具条修订，新增 **ADR-23**（关系边可视化：关系类型控制颜色、置信度控制虚实）
- **2026-06-14 v18（阶段 4.6 立项 + plan 审查加固）**：图谱演进第一批进入执行准备
  - §4 新增/修正"阶段 4.6：图谱演进第一批"：G1-1 改为先补齐关系类型 + 置信度边契约，再用关系类型控制颜色、置信度控制虚实；G1-2/G1-3/G1-4/G1-5 保持日常可用性方向
  - §10 新增阶段 4.6 状态；阶段 4.5 状态同步为已合入，避免后续执行误判基线
  - 图谱演进候选池修正"关系类型上边"的现状描述：关系词汇表与置信度体系已有，但当前边 `type` 不是关系类型
- **2026-06-15 v18（对话工具状态体验）**：补记 `omp` 风格动态工具状态已落地
  - §5.4 增加工作台对话区工具状态原则：当前 assistant 回复只保留一个动态工具条，完成后折叠为分组摘要，停止时保留取消状态
  - §5.5 更新等待状态表述：不做空白思考动画，改用动态工具状态和流式文本
- **2026-06-13 v17（图谱演进候选池）**：行业全景分析沉淀进"阶段后规划"
  - §4 阶段后规划新增"图谱演进候选池"：统领判断（两条行业尸检教训）+ 推荐切片 7 项（局部图/路径讲解/lint 上图/关系类型上边/过滤器/导出美图/图谱增强检索）+ 远期池 4 项（绑定消化管线升级批次）+ 明确不做 3 项（3D/白板化/WebGL 重写）+ 竞品技术参考存档
  - 定位：4.5 之后再排期，防止思考成果丢失；4.5 范围不受影响
- **2026-06-13 v16（阶段 4.5 设计完成）**：图谱可用性收尾设计定稿
  - §4 新增"阶段 4.5：图谱可用性收尾"小节（P0 画布导航 + P0 点击语义重构 + P1 搜索/图例/Shift + P2 节点瘦身 + 抽屉瘦身定稿）
  - §7 新增 **ADR-22**（图谱交互模型："点击即阅读，选区即升级"；抽屉负责内容、图谱负责关系、派生信息不重复；动作映射表必须全覆盖；画布导航为地基能力）——修订 ADR-21 第 5 条选区面板形态
  - §10 新增阶段 4.5 小节
  - 上游盲区修正记录：stage-4 plan 漏列画布导航；stage-4 D6 映射表缺单节点行
- **2026-06-12 v15（阶段四实施完成）**：阶段四 8 Step 完成并回填进度
  - §4 / §10 阶段四状态改为完成；记录总验收自动化检查通过，主观视觉/手感项交由验收人判断
  - §10 阶段四 8 Step 全部打勾；补记 fs.watch、根 package 类型、路径隐私检查等关键风险处理结果
- **2026-06-12 v14（阶段四设计完成）**：monorepo 合并 + 图谱活地图设计定稿
  - §4 阶段四整节改写："图谱集成" → "monorepo 合并 + 图谱活地图"（8 Step + 7 条验收）
  - §7 新增 **ADR-20**（阶段四启动 monorepo 合并丙方案：subtree 进 `workbench/`、引擎落 `packages/graph-engine/`、只做工程合并不做品牌动作、Tauri 推迟）与 **ADR-21**（图谱引擎与活地图：一个引擎两个宿主、新骨架旧器官、活模拟+钉扎、位置/结构分权、选区=批量@、文件监听重算链、diff 生长动画、山水/墨夜双主题）
  - §1.3 补"阶段四起合并启动"段落（一个产品、两扇门）
  - §10 阶段四小节：设计完成状态 + 8 Step 占位 + 4 项关键风险；阶段五标注 Tauri 推迟
  - 阶段四设计细则已归档为本地资料
- **2026-05-28 v13（设置面板滚动修复）**：补记设置弹窗高度与内部滚动修复
  - 设置面板限制最大高度，避免底部设置被屏幕遮住
  - 设置内容区改为内部滚动，标题和关闭按钮保留在顶部
  - 设置面板滚动修复的设计与验证记录已归档为本地资料
- **2026-05-28 v12（阶段 3.5 预览布局收尾）**：补记可拖动预览区与侧栏折叠
  - 右抽屉支持拖动左边缘调整预览宽度，双击恢复默认宽度；宽度保存在本机
  - 左侧栏支持折叠为 52px 窄图标栏，保留核心入口并提供悬停提示；折叠状态保存在本机
  - 小屏幕下保持原有全屏抽屉方式，不启用拖动
  - 可调预览布局的设计与验证记录已归档为本地资料
- **2026-05-28 v11（阶段 3.5 UI 收尾）**：补记原计划外的 UI 原型迁移
  - 基于本地原型 `index.html` 统一工作台视觉，覆盖侧栏、顶部状态条、对话区、输入区、`@` / `/` 菜单、右抽屉、设置和批量消化面板
  - 增加浅色 / 深色主题切换，默认深色，用户选择保存在本机
  - 保持阶段 3.5 既有产品范围，不新增 npm 依赖；本次属于收尾视觉补强，不改变知识库和 agent 行为
- **2026-05-28 v10（阶段 3.5 收尾）**：阶段 3.5 收尾补强完成，准备合并推送
  - 新增当前知识库自动检索：主对话提问时后端先检索当前 KB 并注入上下文，避免批量消化后模型反问用户提供文章
  - `query_knowledge_base` 工具与 `/api/prompt` 共用同一套检索逻辑，ADR-19 已写入 §7
  - 检索失败降级为普通对话并写 retrieval 日志；寒暄、`/` 命令、导出产物指令不会误触发检索
  - 验证覆盖：检索单测、并发单测、类型检查、真实接口总结/寒暄/导出三条路径
- **2026-05-27 v9（阶段 3.5 完成）**：阶段 3.5 实施完成并本地验证
  - 侧栏统一、拖拽/输入路径检查、非 wiki 目录初始化、多模型角色、批量消化子代理、SSE 进度浮窗均已落地
  - 保持零新增 npm 依赖；main 角色已接管主对话，digest 角色用于批量消化
- **2026-05-27 v8（阶段 3.5 设计完成）**：阶段 3.5 设计完成，待 codex 实施
  - §4 新增"阶段 3.5：导航 UX 重构 + 多模型子代理批量消化"小节，列出背景、7 step 范围、5 条验收标准、设计文档指引
  - §7 新增 **ADR-18：阶段 3.5 多模型双角色 + 轻量子代理框架**（9 条核心决策 + 与既有 ADR 关系 + 重新评估触发条件）
  - §9 TBD-2 状态更新："阶段三再做"→"阶段 3.5 落地中"
  - §10 新增"阶段 3.5"小节：当前分支 `stage-3.5`、设计文档链接、7 step 占位、3 个关键风险
  - 阶段 3.5 设计细则已归档为本地资料
- **2026-05-26 v7（阶段一完成标记）**：阶段一全部 step + review 修补完成，作者确认 MVP 可用
  - §4 阶段一标题加 `✅ 已完成 2026-05-26`
  - §4 阶段一末尾新增"完成情况"小节：含最终 commit、验收实况、接受的妥协、**启动 & 运行速查表**（compact 后从这里恢复上下文）
  - §10 重命名 "下一步行动" → "进度追踪"：阶段一 8 step + 2 review commit 全部 ✅ + commit hash 表；阶段二预占骨架（7 项待办）；阶段三/四/五标 "未开始"
  - 协作约定当时移到 §10 末尾，并在历史文档里称为长期条款；当前规则见工作台 AGENTS / CLAUDE
- **2026-05-26 v6**：
  - TBD-2 表述改：删"阶段一固定 Claude Sonnet"，改为"沿用 pi-agent 默认设置"。实际作者通过 pi-agent 的 provider 体系接入了其他 provider（如 zai/glm-5.1），llm-wiki-agent 本不该假设固定 Sonnet
  - §阶段后规划"多模型路由"措辞更通用，不锁死 Anthropic
  - 微调：ChatPanel 流式光标 `animate-pulse` → 自定义 `animate-cursor-blink`（1s steps 真闪烁，原 pulse 在 ▍ 粗块上视觉太弱）
- **2026-05-26 v5（阶段一完结 review 修补）**：实际 review 阶段一代码对照文档，发现并修复 3 项硬 gap、4 项偏差对齐
  - 修 Gap 1：根 `package.json` 加 `npm run dev` 一行起两个服务（用 `concurrently`，符合 §4 阶段一范围第 1 条）
  - 修 Gap 2：`AppConfig` 加 `lastUsedKbPath`；`selectKb/selectConversation/createNewConversation` 写入；`agent.bootstrapFromConfig()` 启动时 await 恢复（符合 §5.1.1）
  - 修 Gap 3：`web/index.html` `<html class="dark">`（符合 §5.4 "默认深色"）
  - §5.2 顶部状态条占位：ChatPanel header 加 `🤖 模型` 显示（disabled，从后端返回的 `active.model` 拿真实 provider/id）+ `⚙ 设置` 占位按钮，tooltip 标注"阶段二/三补"
  - §5.5 严禁项对齐：删除 "等待 agent 响应…" 文字提示；streaming 时最后一个 assistant 气泡显示 `▍` 光标
  - §5.4 等宽字体：`index.css` 加 `--font-mono` (JetBrains Mono / SF Mono stack) 给 `code/pre/kbd/samp` 元素
  - 后端 `/api/knowledge-base` GET/POST、`/api/conversations` POST、`/api/conversations/new` POST 全部在 `active` 上返回 `model: { provider, id } | null`
  - **明确推迟到阶段二/三**：§5.1 侧栏底部"图谱入口"延迟（阶段四，作者要重新构思）；"设置入口"占位放在 ChatPanel header（阶段二补完整面板）
- **2026-05-26 v4 (review pass)**：基于源码/文档验证，修复 5 项事实错误 + 4 项精确化 + 3 项软化/标注
  - 修：§3.1 架构图知识库路径 `~/wikis/` → `~/llm-wiki/`，并补充 `~/.pi/agent/auth.json`
  - 修：§6.2 知识库目录补 `wiki/comparisons/`、`wiki/overview.md`、`.wiki-tmp/`、`.gitignore`（依据 `scripts/init-wiki.sh` 实际行为）
  - 修：§8.1 删除"API key 走 config.json"过期描述，改为引用 ADR-13
  - 修：§9 TBD-5 已定描述同步到 ADR-13 现状
  - 加：Node 版本要求 `>=22.19.0`（pi-coding-agent 0.75.x 硬要求，写入 §3.2、§3.4、§8.1）
  - 加：§3.4 补充 Extension 注入方式（SDK 用 `bindExtensions` / `ResourceLoader`，不依赖 CLI 全局发现）
  - 加：§6.4 Obsidian 忽略列表补 `.wiki-tmp/` 和 dev 类目录
  - 加：§2.3 anthropics/skills 列出 17+ 个实际 Skill，不止"四件套"
  - 软：§3.2 "Tauri 比 Electron 轻 10×" → "二进制和内存通常显著低于 Electron（5-30 MB vs 100+ MB）"
  - 软：§3.2 mise 描述更准确为"多语言版本管理（含 Node）"
  - 标：§3.3 流程中的 `/api/*` 路径标注为"建议命名，最终以实现为准"
  - 标：§阶段三 PPTX 渲染库删除错误链接，明确"阶段三选型"
- **2026-05-26 v1**：第一版完成，确立产品定位、5 阶段路线、9 条 ADR、协作规则。
- **2026-05-26 v2**：
  - 新增 3.4 节《pi-agent 的使用方式》，明确"npm 依赖，不 clone 不 fork"
  - 新增 5.1.1 节《会话与切换行为》，定义并行对话与切库自动保存
  - 重写 6.1 节《知识库存储策略》，从单一目录改为"默认 `~/llm-wiki/` + 外部登记"混合策略
  - 新增 6.4 节《Obsidian 共存规则》，明确 agent 不碰的文件类型
  - 新增 6.6 节《中文路径与 UTF-8 铁律》
  - 新增 ADR-10 ~ ADR-15 六条决策
  - TBD-1 / TBD-3 / TBD-5 / TBD-7 关闭并归档到 ADR
  - TBD-2 改为阶段三才决定（阶段一固定 Sonnet）
  - 阶段一范围补充：知识库扫描含外部库登记、多并行对话支持
  - 阶段二范围补充：内置 `/new-wiki` 命令、设置面板 UI
- **2026-05-26 v3**：
  - 新增 6.7 节《边界场景行为约定》：单实例、无网络/无 key、崩溃恢复、后端未起、目录失效
  - **重写 ADR-13**：模型认证完全复用 pi-agent 的 `~/.pi/agent/auth.json`，三层 fallback（pi CLI 登录 / UI 填 key / env var）；`config.json` 不再存任何凭证
  - 新增 ADR-13b：明确不抄 open-design 的多 CLI 子进程模式
  - 重写 6.3 应用数据目录，澄清"应用数据 / 知识库数据 / 模型凭证"三类彻底分离
  - 阶段二范围细化：设置面板 UI 改为"三层认证 + 偏好"，验收标准更新
- **2026-05-27 v9（阶段三完成标记）**：阶段三全部 8 step + 1 fix commit 完成，审查通过合并到 main
  - §4 阶段三标题加 `✅ 已完成 2026-05-27`
  - §10 阶段三标记已完成，补充 9 commit 表 + 完成情况（范围、决策、妥协）
  - CLAUDE.md 更新"项目当前阶段"：阶段二 → 阶段三
