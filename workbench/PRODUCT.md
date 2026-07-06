# llm-wiki 工作台产品文档

> 本文档是项目的**当前事实锚点**。当你（作者）或任何 AI 协作者思路断裂时，先按 `workbench/AGENTS.md` / `workbench/CLAUDE.md` 的冷启动表和 git 记录恢复上下文，再读本文档的相关章节。
>
> **维护原则**：决策或功能定义变化时，**先改文档，再改代码**。文档与实现、ADR 或词表冲突时，先说明冲突点，再决定改哪一份。

---

## 0. 这份文档怎么用

- 作者是 0 代码基础的产品设计者。开发由 AI 协作完成。
- 文档不写代码细节，只写**意图、约定、决策理由**。
- 这份文档现在只保留当前产品事实、边界和关键决策；旧阶段路线见 [product-roadmap.md](docs/archive/product-roadmap.md)，历史提交和验收记录见 [product-history.md](docs/archive/product-history.md)。
- 快速恢复上下文时，优先读：产品定位、数据边界、ADR、当前状态。
- 不要在本文末尾继续追加流水账；旧路线、阶段提交表和旧 changelog 进归档。
- 历史旧名是 `llm-wiki-agent`；当前产品名统一称 `llm-wiki 工作台`。磁盘上的 `~/.llm-wiki-agent/` 是保留的应用数据目录名，不代表产品名。

### 0.1 内容放哪里

| 内容类型 | 放哪里 | 不放哪里 |
|---|---|---|
| 稳定产品事实、用户边界、当前路线 | 本文件 | 归档、临时 plan |
| 长期决策和取舍原因 | [docs/adr/](../docs/adr/) | 本文件正文长篇展开 |
| 术语和能力边界词表 | `CONTEXT.md` / 区域 `CONTEXT.md` | ADR、历史归档 |
| 运行时、接口和 SDK 接入细节 | [pi-agent-runtime-notes.md](docs/pi-agent-runtime-notes.md) | 本文件热路径 |
| 当前实现计划、阶段设计、验收步骤 | `workbench/docs/` 下独立设计或计划文档 | 本文件、ADR |
| 已完成阶段记录、提交表、旧 changelog | `workbench/docs/archive/` | 本文件末尾 |
| 功能改动后的发布记录 | 根目录 `CHANGELOG.md` | `workbench/PRODUCT.md` |

---

## 1. 产品定位

### 1.1 一句话定位

**本地运行的知识库工作台。以对话为中心，通过 `@` 引用知识库内容、`/` 调用工具能力，把对话沉淀为可读可分享的产物（笔记、HTML、PPT、Word 等）。**

### 1.2 核心场景

用户打开 llm-wiki 工作台，看到自己的若干知识库列表，选一个进入。在对话框里和 agent 对话：

- agent 知道当前在哪个知识库里，可以基于该库内容回答问题
- 输入 `@` 弹出页面列表，引用具体 wiki 页面进 prompt
- 输入 `/` 弹出命令列表，调用工具（搜索、消化新素材、生成 HTML/PPT/Doc）
- 对话结束后一键"对话结晶"为新的 wiki 页面，写回知识库
- 产出物（HTML/PPT/Doc）在右抽屉直接预览，一键下载或分享

整个工具运行在本地，所有知识库数据是本地 markdown 文件；应用本身不依赖自家云服务，模型调用按用户配置的提供商执行，信任边界见 §6.8。

### 1.3 与 llm-wiki-skill 的关系

| 维度 | Skill 形态 | 工作台形态 |
|---|---|---|
| 形态 | Anthropic Skill | 独立 agent + web UI（未来 Tauri 桌面应用）|
| 宿主 | Claude Code / Codex / OpenClaw / Hermes | 自有 runtime（基于 pi-agent）|
| 数据 | 用户的 wiki 目录 | **完全沿用，结构不变** |
| 能力 | Skill 内的脚本 + 模板 | **全部复用**，agent 通过 pi-agent 原生 Skill 加载机制调用 |

**关键事实**：pi-agent 原生实现 Anthropic Skill 标准。llm-wiki-skill 一行不改就能被 agent 项目加载使用。

**长期愿景（ADR-16，已由阶段四落地）**：agent 形态并入 `llm-wiki` 仓库，作为 Skill 的升级版同时存在（保留 Skill 给纯 CLI 用户）。这次合并已在阶段四完成（见下）；本节保留 ADR-16 的原始意图脉络。

**合并已完成（阶段四）**：原 agent 仓库已 `git subtree` 搬入主仓库子目录 `workbench/`（monorepo，不发版不宣布），图谱引擎 `@llm-wiki/graph-engine` 是第一块两端共享代码。终局形态为"一个产品、两扇门"——产品 = 知识库格式 + 素材管线 + 方法论；门一 = Skill（嵌入用户已有 harness），门二 = 工作台。详见 ADR-20。

### 1.4 这个项目"不是什么"

为防止范围漂移，明确以下边界：

- ❌ 不是云端 SaaS（不部署线上、不替用户付 API 费用、不做多用户）
- ❌ 不是 Obsidian/Logseq 替代品（不做手写笔记编辑器，wiki 由 AI 维护）
- ❌ 不是通用 ChatGPT（必须基于知识库语境）
- ❌ 不是 Skill 的"加壳版"（是独立 agent 产品，Skill 只是能力来源之一）

---

## 2. 核心理念

### 2.1 Code is cheap，未来人视角

不为了"省事"做妥协的选型。技术栈按 5 年后仍说得通的标准来选。

### 2.2 桌面应用而非托管

托管 = 替用户烧 API 额度 = 必须先想清楚商业模式。本项目不走这条路。Tauri 打包是未来可能的分发形态，但已推迟到工作台有真实外部用户后再重新评估。

### 2.3 Skill 即插即用

不重造轮子。任何符合 Anthropic Skill 标准的能力，丢到 skills 目录就生效：

- llm-wiki-skill（自家，知识库主线）
- [anthropics/skills](https://github.com/anthropics/skills)（例如 docx / pdf / pptx / xlsx / web artifacts 等）
- [pi-skills](https://github.com/badlogic/pi-skills)（web search、browser automation、transcription 等）
- 未来任何社区 Skill

非本仓库随附的第三方 Skill 视为**受信任本地代码**。在没有权限沙箱前，未知来源 Skill 不默认启用；用户显式安装并启用后，才允许它进入会话能力集合。启用后的 Skill 可能接触当前知识库上下文、读写文件或访问网络，不能把“即插即用”理解成“无风险自动加载”。

### 2.4 对话中心

主屏永远是对话框。其他功能（图谱、库管理、产出预览）作为辅助面板，从对话发起或呼出。心智参考 Codex / Claude Desktop。

---

## 3. 架构总览

### 3.1 系统层次

```
┌─────────────────────────────────────────────┐
│ 前端 (Vite + React)                          │
│  浏览器 / 未来 Tauri webview                  │
│   ├─ 对话主区                                 │
│   ├─ 侧栏（知识库列表 / 历史 / 图谱入口）       │
│   ├─ 顶栏（当前知识库 / 搜索 / 模型 / 外观 / 设置）│
│   ├─ 右抽屉（产出预览 / 引用查看）             │
│   └─ @ / 自动补全                             │
└────────────────────┬────────────────────────┘
                     │ SSE (事件流) + HTTP POST (命令)
┌────────────────────▼────────────────────────┐
│ 后端 (Node + Hono)                           │
│  └─ pi-coding-agent SDK                     │
│      ├─ AgentSession  (对话/事件/会话管理)    │
│      ├─ Extension     (注入当前知识库等状态)   │
│      └─ Skills 加载                           │
│         ├─ llm-wiki-skill                   │
│         ├─ anthropics/skills                │
│         └─ pi-skills                        │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│ 本地文件系统                                  │
│   ├─ ~/llm-wiki/<name>/  (知识库默认根，沿用 Skill 结构)│
│   ├─ 外部知识库路径       (用户登记的任意路径) │
│   ├─ ~/.llm-wiki-agent/                     │
│   │   ├─ config.json     (UI 偏好/外部库登记) │
│   │   ├─ sessions/                          │
│   │   ├─ skills/                            │
│   │   └─ logs/                              │
│   └─ ~/.pi/agent/auth.json (模型凭证，pi 管理)│
└─────────────────────────────────────────────┘
```

### 3.2 技术栈

| 层 | 选型 | 简要理由 |
|---|---|---|
| 前端框架 | **React + Vite** | AI 协作样本量最大；新手坑最少；Tauri 零迁移 |
| UI 组件库 | 暂定 [shadcn/ui](https://ui.shadcn.com/) | 不是黑盒、可读、复制粘贴风格；视觉主题以 ADR-24 的 Paper 暖纸方向为准 |
| 后端框架 | **Hono** | 轻量、TS 友好、文档清晰 |
| Agent runtime | **@earendil-works/pi-coding-agent** SDK | 原生 Skill 支持；事件流；多 provider |
| 通信 | **SSE + HTTP POST** | agent→UI 单向流，SSE 足够；WebSocket 过度 |
| 数据 | 本地 markdown + JSON | 无服务器；Obsidian 兼容 |
| 桌面打包（未来） | **Tauri** | 用系统 webview + Rust 后端；二进制和内存占用通常显著低于 Electron（5-30 MB vs 100+ MB） |
| 包管理 | npm（统一）| 不混用 pnpm/bun，避免新手版本混乱 |
| Node 版本管理 | **mise** 或 nvm | mise 是多语言版本管理（含 Node）；锁版本至少 `>=22.19.0`（pi-coding-agent 当前依赖要求） |
| Markdown 渲染（阶段二+）| **react-markdown** ^9 + **remark-gfm** ^4 | 生态最稳、类型完备、GFM 表格/任务列表/自动链接；shadcn 生态常用 |
| 命令/补全菜单（阶段二+）| **cmdk** ^1 | shadcn `<Command>` 底层；键盘导航与 a11y 完备；同时承载 `/` 命令菜单和 `@` 引用菜单 |

### 3.3 关键流程：一次对话发生了什么

1. 用户在对话框输入文本，可能用 `@` 引用 wiki 页面，或用 `/` 调用命令。
2. 前端把用户意图发给本地后端。
3. 后端用 pi-agent session 执行对话，并把当前知识库等应用状态注入给 agent。
4. 后端把 agent 事件流推回前端，前端渲染文本、工具状态、引用和产出预览。
5. 用户可选择把有价值的对话沉淀为新的 wiki 页面。

❗ **关键点**：当前知识库路径、应用状态这类工作台上下文仍通过 pi-agent 的 **Extension** 注入到 session state 里，具体见 ADR-7。问答类知识库检索有一个明确例外：后端会按 ADR-19 检索最小必要片段，并作为隐藏上下文进入 `/api/prompt`；这些片段会随本轮消息发给当前配置的模型提供商，信任边界见 §6.8。

接口命名、事件订阅和 SDK 接入细节见 [pi-agent-runtime-notes.md](docs/pi-agent-runtime-notes.md)。

### 3.4 pi-agent 的使用方式

**结论：pi-agent 作为 npm 依赖引入，不 clone 源码，不做 fork**。

工作台后端负责把 pi SDK 包装成本地 HTTP/SSE 接口，并提供自己的 Extension 注入当前知识库等应用状态。agent runtime、Skill 加载、事件流、模型管理和会话持久化仍由 npm 依赖提供。

升级 pi：改 `workbench/server/package.json` 里的版本号，`npm install` 重跑。当前实际版本以 `workbench/server/package.json` 和 lockfile 为准。

❗ 永远**不要**直接修改 `node_modules/` 里的 pi 源码。万一极端情况需要 patch（99% 用不到），用 `patch-package` 做局部补丁，保持升级路径干净。

❗ pi-coding-agent 当前依赖要求 **Node `>=22.19.0`**。用 mise/nvm 锁定到合适版本，避免系统 Node 太旧。

---

## 4. 功能阶段路线

本节只保留当前路线判断。旧阶段的目标、范围、验收标准和图谱候选池已移到 [product-roadmap.md](docs/archive/product-roadmap.md)。

### 4.1 当前基线

| 阶段 | 状态 | 当前结论 |
|---|---|---|
| 阶段一：主干打通 | ✅ 已完成 2026-05-26 | 前端、后端、agent、Skill 和文件系统的主链路已跑通 |
| 阶段二：核心循环 | ✅ 已完成 2026-05-27 | @、/、对话结晶、消化、新建知识库和设置面板已形成闭环 |
| 阶段三：产出能力 | ✅ 已完成 2026-05-27 | HTML、PDF、Word、PPT、Excel 等产出入口已接入右抽屉 |
| 阶段 3.5：导航与批量消化 | ✅ 已完成 2026-05-27 | 侧栏、拖拽添加、多模型角色和子代理批量消化已落地 |
| 阶段四：monorepo + 图谱活地图 | ✅ 已完成 2026-06-12 | Skill、工作台和共享图谱引擎已合并到同一仓库 |
| 阶段 4.5-4.8：图谱可用性与社区高亮 | ✅ 已完成 | 图谱主路径收敛到 Sigma，DOM/SVG 只保留为回退或对照 |
| 阶段五：桌面应用打包 | ⏸ 暂停 | 等工作台有真实外部用户后再重新评估 Tauri 打包 |

### 4.2 下一步触发条件

| 方向 | 何时启动 | 当前处理 |
|---|---|---|
| Tauri 桌面打包 | 有真实外部用户需要安装包 | 先不投入，避免提前承担打包复杂度 |
| 图谱数据管线升级 | 真实库里出现“关系类型单色、摘要不足、隐藏关联难发现”等问题 | 与 LLM 推断边、AI 摘要、关系类型注释一起设计 |
| 浏览器扩展 | 用户频繁从网页收集材料，复制链接成为明显摩擦 | 先保留想法，不进入当前主线 |
| 导出美图 | 用户开始分享图谱截图或需要传播素材 | 作为低风险传播增强候选 |
| 多端同步 | 本地目录迁移不能满足真实备份或多设备需求 | 继续保持本地优先，不提前引入云同步 |

### 4.3 归档入口

- 旧阶段路线、范围、验收标准和图谱候选池：[product-roadmap.md](docs/archive/product-roadmap.md)
- 阶段提交表、验收实况和旧 changelog：[product-history.md](docs/archive/product-history.md)
- 长期决策原因：[docs/adr/](../docs/adr/)

## 5. UI 设计原则

### 5.1 三栏布局

```
[ 侧栏 270px / 52px 窄栏 ] [ 主区域 自适应 ] [ 右抽屉 0 / 可拖动宽度 / 全屏 ]
```

- **侧栏**默认显示：
  - 知识库列表（顶部，含"+ 新建知识库"按钮）
  - 当前库的对话列表（中部，含"+ 新对话"按钮，按最近活跃排序）
  - 图谱入口、设置入口（底部）
- **侧栏可折叠为窄图标栏**：保留展开、当前知识库、刷新、新建、添加、设置入口；图标悬停显示文字提示。该状态保存在本机。
- **主区域**永远是对话（除非用户主动切换到图谱）
- **右抽屉**默认隐藏，呼出场景：产物预览、引用页面查看、设置面板。右抽屉宽度可拖动调整，双击拖动边缘恢复默认宽度；宽度保存在本机。小屏幕下不启用拖动，继续占满屏幕。

### 5.1.1 会话与切换行为

- 会话**绑定到知识库**：每个库有独立对话列表，不允许跨库会话
- 同库内**多个并行对话**：用户随时"+ 新对话"开新线程
- 切换知识库：当前对话自动保存 → 切到目标库 → 自动选中目标库最近活跃的对话
- App 启动：自动选中"最后一次使用的库 + 该库内最近活跃的对话"
- 全程自动保存，无"是否保存"弹窗

### 5.2 顶栏

```
[📚 当前知识库]   [搜索 ⌘K] [🤖 模型 ▼] [新对话] [主题] [外观] [⚙ 设置]
```

永远可见，回答"我在哪里"，并承载跨对话 / 图谱两个视图共享的全局操作。

- 左侧知识库头只展示当前库名、来源和有效状态，不做下拉，不显示篇数
- 模型选择只在右侧控件里出现，读写 `config.modelRoles.main`
- 外观齿轮只管理 Paper 视觉偏好；侧栏"设置"仍打开现有配置面板
- 图谱专属操作（重置布局、重建图谱）留在图谱视图内部，不进入全局顶栏

### 5.3 `@` 与 `/` 的设计契约

| 符号 | 语义 | 弹出内容 | 选中后 |
|---|---|---|---|
| `@` | **引用** | 当前知识库的页面 / 实体 / 主题 | 在输入框插入 wiki 链接，agent 看到时会读这页 |
| `/` | **执行** | 所有已加载 Skill 命令 + 内置命令 | 在输入框插入命令调用，agent 收到时执行 |

两者必须有清晰区分。**`@` 是"找内容"，`/` 是"做事情"**，永远不要混用。

### 5.4 视觉风格

- 默认浅色暖纸主题，支持夜灯主题切换，用户选择只保存在本机
- 正文字体：Plus Jakarta Sans 优先，CJK 回落系统字体；手写点缀用 Caveat；等宽字体用 JetBrains Mono / SF Mono
- 视觉方向为 Paper 暖纸：克制、可读、温暖，但不改变三栏心智和对话中心定位
- 外观偏好是正式用户偏好：纸张质感、强调色、用户气泡、手写点缀、密度、主题均保存在本机
- 阶段 3.5 收尾吸收本地 UI 原型：统一侧栏、状态条、对话区、输入区、菜单、抽屉和设置面板的工作台视觉，不改变既有三栏心智和功能范围
- 对话区工具执行采用 `omp` 风格状态呈现：当前 assistant 回复内只保留一个动态工具条，工具完成后折叠为分组摘要；用户停止时保留清楚的取消状态，避免工具流水账挤占正文

### 5.5 严禁项

- 不做 onboarding 引导浮层
- 不做 emoji 滥用
- 不做"AI 正在思考..." 这种空白等待动画（用真实事件流：动态工具状态、流式文本）
- 不强制注册 / 登录（本地工具不需要账号）

---

## 6. 数据与目录约定

### 6.1 知识库存储策略（混合模式）

用户需要管理多个领域的知识库（AI 学习、工作材料、设计灵感等），不该被强制塞到一个固定位置。采用**默认根目录 + 外部目录登记**的混合模式：

| 类型 | 位置 | 说明 |
|---|---|---|
| **默认知识库根** | `~/llm-wiki/` | App 首次启动自动创建；app 内"+ 新建知识库"在此建子文件夹 |
| **外部知识库** | 用户任意路径 | 用户手动"添加现有库"指向某路径，登记在 `config.json` |
| **应用数据** | `~/.llm-wiki-agent/` | 配置、会话、日志、Skill，用户通常不直接碰 |

**为什么默认是 `~/llm-wiki/` 而不是 `~/Documents/...`**：

- macOS 的 `~/Documents/` 会被 iCloud Drive 自动同步，会撕坏 `.wiki-cache.json` 的文件锁和"写入即更新"逻辑
- 知识库是顶级资产，值得一个顶级目录，不该埋在 Documents 深处
- 短路径友好：终端 `cd ~/llm-wiki` 一秒到达

**发现机制**：
- 启动时扫描 `~/llm-wiki/` 下所有含 `.wiki-schema.md` 的子目录 → 自动注册
- 再读 `config.json` 里登记的外部库路径 → 加入列表
- 失效路径（外部库被删/移走）：UI 标记为灰色，提示用户移除登记

### 6.2 知识库目录结构（沿用 llm-wiki-skill）

每个知识库内部结构与 Skill 完全一致：

```
<某知识库>/
├── raw/                # 原始素材（子目录如 articles/tweets/wechat/xiaohongshu/zhihu/pdfs/notes/assets
│                       # 由 Skill init 时创建，agent 不强求子目录约定，沿用现有结构）
├── wiki/               # AI 生成内容
│   ├── overview.md     # 知识库总览（init 时生成）
│   ├── entities/       # 实体页
│   ├── topics/         # 主题页
│   ├── sources/        # 素材摘要
│   ├── comparisons/    # 对比分析
│   ├── synthesis/      # 综合分析
│   │   └── sessions/   # 对话结晶（agent 新增的对话沉淀都进这里）
│   └── queries/        # 保存的查询结果
├── purpose.md          # 研究方向
├── index.md            # 索引
├── log.md              # 操作日志
├── .wiki-schema.md     # 配置（识别"这是个知识库"的标志文件）
├── .wiki-cache.json    # 素材去重缓存
├── .wiki-tmp/          # Skill 运行时临时目录（agent 不读不写，Skill 的 .gitignore 已排除）
└── .gitignore          # init 时生成，至少排除 .wiki-tmp/
```

❗ agent 项目**不重新设计这个结构**。完全沿用 Skill 现有约定，确保两边互通。
❗ 结构以 `scripts/init-wiki.sh` 为权威，不要在 PRODUCT.md 里手动维护差异。

### 6.3 应用数据目录

```
~/.llm-wiki-agent/
├── config.json         # UI 偏好、默认模型、外部库登记 —— 不存任何 API key
├── sessions/           # pi-agent 会话持久化（对话历史）
├── skills/             # 软链接或拷贝到此目录的 Skill
│   ├── llm-wiki/       # → 链接到 llm-wiki-skill 安装位置
│   ├── docx/           # 来自 anthropics/skills
│   └── ...
└── logs/
```

**模型认证不在这里**。所有模型凭证由 pi-agent 统一管理，存在：

```
~/.pi/agent/auth.json    # pi-agent 的认证文件，权限 0600
```

❗ **应用数据 ≠ 知识库数据 ≠ 模型凭证**，三类彻底分离：

| 类型 | 位置 | 谁管 |
|---|---|---|
| 知识库数据 | `~/llm-wiki/<name>/` 或外部路径 | 用户 + agent |
| 应用数据 | `~/.llm-wiki-agent/` | llm-wiki 工作台 |
| 模型凭证 | `~/.pi/agent/auth.json` | pi-agent SDK |

❗ `.gitignore` 排除 `~/.llm-wiki-agent/`。**永远不要**把 API key 写进任何源代码或仓库文件。详见 ADR-13。

`sessions/` 和 `logs/` 也是用户内容边界的一部分：它们可能包含用户提问、模型回复、引用页面片段或检索元信息。默认日志只记录诊断所需元数据，不记录完整 prompt、完整页面正文、API key 或认证状态；只有用户明确打开调试采集时，才允许更详细内容进入日志。删除对话或移除知识库登记时，必须考虑这些目录里是否还有对应副本。

### 6.4 Obsidian / 第三方工具共存规则

很多用户（包括作者本人）用 Obsidian 浏览同一份知识库。两者必须零冲突。

**agent 读写的文件**：
- ✅ `raw/` 下任意文件
- ✅ `wiki/` 下任意 `.md` 文件
- ✅ `purpose.md` / `index.md` / `log.md`
- ✅ `.wiki-schema.md` / `.wiki-cache.json`
- ✅ `.wiki-graph-layout.json`（阶段四起：图谱钉扎布局，工作台后端写、Skill 侧只读，见 ADR-21）

**agent 完全忽略的文件 / 目录**：
- ❌ `.obsidian/`（Obsidian 元数据）
- ❌ `.DS_Store`（macOS）
- ❌ `*.base`（Obsidian Bases）
- ❌ `*.canvas`（Obsidian Canvas）
- ❌ `.wiki-tmp/`（Skill 自用的临时目录）
- ❌ `node_modules/`、`.git/`、`venv/` 等所有 dev 类目录
- ❌ 任何非 markdown、非 Skill 约定内的文件

用户用 Obsidian 编辑 markdown、画 Canvas、做 Base，agent 都不会碰。

### 6.5 运行时应用状态（由 Extension 持有）

- `currentKnowledgeBase`：当前打开的知识库绝对路径
- `currentConversationId`：当前对话的 ID（pi-agent 会话）
- `pinnedReferences`：当前对话固定引用的页面列表
- `activeSkills`（可选）：本次会话允许的 Skill 子集

### 6.6 中文路径与 UTF-8 铁律

用户的知识库名可能含中文（如 `AI学习知识库`）、空格、emoji。

❗ **铁律**：所有路径处理代码必须用 UTF-8，**绝不**使用"路径转拼音"、"中文字符转码"等歪招。Node.js / Tauri 原生支持 UTF-8，正确写法即可。

### 6.7 边界场景行为约定

| 场景 | 行为 |
|---|---|
| **多实例启动** | 只允许单实例。第二次启动直接 focus 已有窗口（macOS Cmd+N 也不开新窗口）。原因：本地后端服务监听固定端口，多实例冲突；也避免对同一文件并发写 |
| **无网络 / 未配置 API key** | 启动不报错。库列表、对话历史、wiki 页面浏览**仍可用**。试图发新消息时给一个明确提示"未配置 API key，去设置面板"或"网络断开" |
| **崩溃 / 异常退出后恢复** | 重启后：自动恢复"最后一次使用的库 + 最近活跃对话"；对话内容由 pi-agent session 持久化保证完整；侧栏折叠状态和右抽屉宽度保存在本机并恢复；右抽屉开关本身**不恢复**，避免恢复到"半坏"的 UI |
| **后端服务未起** | 前端 UI 显示明显的"后端服务未连接"状态，不渲染对话区（避免误以为是 agent 卡死） |
| **知识库目录被外部删除** | 列表里标灰，点击给出"目录已失效，是否从列表移除"提示，不崩溃 |

### 6.8 运行时信任边界

| 边界 | 约束 |
|---|---|
| 本地后端 API | 后端默认只绑定 loopback；HTTP、SSE 和所有会改文件或触发模型的端点只接受工作台 / Tauri 可信来源，不对局域网或任意网页开放 |
| 模型提供商 | “本地优先”不等于模型调用不出网。发送消息时，用户 prompt、选中的引用、后端检索片段、工具输出和生成产物可能被发给当前配置的模型提供商；实现必须只发送完成任务所需的最小上下文 |
| 会话和日志 | `~/.llm-wiki-agent/sessions/` 与 `logs/` 视为敏感用户内容存储，不默认记录完整 prompt、页面正文、API key 或 auth 状态 |
| 第三方 Skill | 非随仓库提供的 Skill 视为受信任本地代码，必须由用户显式启用；未知来源 Skill 不得自动获得当前知识库上下文 |

---

## 7. 关键决策记录（ADR）

决策正文已拆到 [docs/adr/](../docs/adr/)。本节只保留索引，避免主产品文档再次变成历史账本。

旧工作台决策保留原编号；其中 ADR-13b 是历史特殊编号，继续作为 ADR-13 的补充记录。

### 7.1 工作台决策

| 编号 | 决策 |
|---|---|
| ADR-1 | [选 pi-agent 而非 Vercel AI SDK / Mastra](../docs/adr/0001-select-pi-agent-not-vercel-ai-sdk-or-mastra.md) |
| ADR-2 | [对话中心而非图谱中心](../docs/adr/0002-conversation-center-not-graph-center.md) |
| ADR-3 | [SSE 而非 WebSocket](../docs/adr/0003-sse-not-websocket.md) |
| ADR-4 | [先 web 再 Tauri 打包](../docs/adr/0004-web-first-tauri-later.md) |
| ADR-5 | [不用 MCP](../docs/adr/0005-no-mcp.md) |
| ADR-6 | [完全进化为 agent，不维护双通道（已被 ADR-20/27 收窄）](../docs/adr/0006-evolve-to-agent-no-dual-channel.md) |
| ADR-7 | [知识库上下文用 Extension 注入，不拼 prompt](../docs/adr/0007-kb-context-via-extension-not-prompt.md) |
| ADR-8 | [React + Vite 而非 Next.js](../docs/adr/0008-react-vite-not-nextjs.md) |
| ADR-9 | [UI 用 shadcn/ui（组件选型仍有效；视觉理由已由 ADR-24 修订）](../docs/adr/0009-shadcn-ui.md) |
| ADR-10 | [pi-agent 作为 npm 依赖，不 fork、不 clone 源码](../docs/adr/0010-pi-agent-npm-dependency-no-fork.md) |
| ADR-11 | [知识库采用混合存储策略（默认根 + 外部登记）](../docs/adr/0011-hybrid-knowledge-base-storage.md) |
| ADR-12 | [会话绑定知识库，同库支持多并行对话](../docs/adr/0012-sessions-bound-to-knowledge-base.md) |
| ADR-13 | [模型认证完全复用 pi-agent 的 auth 体系（三层 fallback）](../docs/adr/0013-pi-agent-auth-system.md) |
| ADR-13b | [不抄 open-design 的"多 CLI 子进程"模式](../docs/adr/0013b-no-open-design-cli-subprocesses.md) |
| ADR-14 | [app 内一键新建知识库](../docs/adr/0014-in-app-create-knowledge-base.md) |
| ADR-15 | [Obsidian 共存（agent 忽略非 markdown 与第三方元数据）](../docs/adr/0015-obsidian-coexistence.md) |
| ADR-16 | [长期与 llm-wiki 仓库合并（仓库布局已由 ADR-20 落地）](../docs/adr/0016-merge-with-llm-wiki-repo.md) |
| ADR-17 | [阶段二新增前端依赖（react-markdown + cmdk）](../docs/adr/0017-stage-2-frontend-dependencies.md) |
| ADR-18 | [阶段 3.5 多模型双角色 + 轻量子代理框架](../docs/adr/0018-stage-3-5-model-roles-and-subagents.md) |
| ADR-19 | [主对话引入“系统检索 + 上下文注入”](../docs/adr/0019-system-retrieval-context-injection.md) |
| ADR-20 | [阶段四启动 monorepo 合并（丙方案，已落地；入口叙事看 ADR-27）](../docs/adr/0020-monorepo-merge.md) |
| ADR-21 | [图谱引擎与活地图（一个引擎、两个宿主）](../docs/adr/0021-graph-engine-living-map.md) |
| ADR-22 | [图谱交互模型——轻量摘要优先，明确动作进入阅读](../docs/adr/0022-graph-interaction-click-read-selection-upgrade.md) |
| ADR-23 | [关系边可视化采用“关系类型控制颜色、置信度控制虚实”](../docs/adr/0023-relation-type-color-confidence-stroke.md) |
| ADR-24 | [Paper 暖纸视觉方向与外观偏好](../docs/adr/0024-paper-visual-direction.md) |
| ADR-25 | [前端交互测试与 Paper 视觉回归栈](../docs/adr/0025-frontend-interaction-and-visual-regression.md) |
| ADR-26 | [Sigma 主路线与 DOM/SVG 回退](../docs/adr/0026-sigma-primary-dom-svg-fallback.md) |

### 7.2 跨区域决策

| 编号 | 决策 |
|---|---|
| ADR-27 | [一个产品，两种入口](../docs/adr/0027-one-product-two-entry-points.md) |
| ADR-28 | [Skill 与工作台的能力边界](../docs/adr/0028-skill-and-workbench-capability-boundary.md) |
| ADR-29 | [图谱是 wiki 结构的视图](../docs/adr/0029-graph-is-a-view-of-wiki-structure.md) |
| ADR-30 | [本地优先与数据边界](../docs/adr/0030-local-first-data-boundaries.md) |
| ADR-31 | [根目录保持 CommonJS 兼容](../docs/adr/0031-monorepo-root-keeps-commonjs-compatibility.md) |
| ADR-32 | [一个图谱引擎，两个宿主（repo-wide 摘要，细节以 ADR-21 为准）](../docs/adr/0032-one-graph-engine-two-hosts.md) |

## 8. 给 0 代码作者的盲区与协作规则

### 8.1 环境陷阱

- macOS 默认 Node 版本可能旧。**统一用 [mise](https://mise.jdx.dev/) 或 nvm 管理 Node 版本**，锁到 **`>=22.19.0`**（pi-coding-agent 当前依赖要求）。否则 `npm install` 就直接报错
- 不要全局 `npm install -g`。每个项目用 `package.json` 锁版本
- API key **完全不进我们的仓库**，也不进 `~/.llm-wiki-agent/`。统一由 pi-agent SDK 管理，落到 `~/.pi/agent/auth.json`（权限 0600）。详见 ADR-13

### 8.2 进度陷阱

- **"差一点就跑通了"是最危险的状态**。验收标准要严格，跑不通就不进下一阶段
- AI 协作最大的隐性风险：你不懂代码 → AI 改 A 引起 B 坏，你不知道 → 雪球越滚越大
  - **对策**：每阶段结束让 AI 主动列出"本次改了哪些文件、新增了什么依赖、为什么"，你看明白再确认
- **Git 是你的安全网**。每个验收节点 commit 一次。

### 8.3 协作规则（AI 必须遵守）

- **不要自由发挥**。每次动手前先说"打算改哪些文件、为什么这么改、对其他部分有什么影响"；普通实现默认继续推进，不反复等确认
- **任何要新增依赖**（npm package、Skill、配置项），先问"这是 PRODUCT.md 里规划过的吗"
- **任何要修改 PRODUCT.md 之外的决策**，先说明"这与 PRODUCT.md 第 X.Y 节冲突，建议修改文档为 Z"，等作者拍板
- **作者思路断了的时候**，先按入口冷启动表读当前状态，再对照 git log / git diff；不要急着问"我们做到哪里了"
- **绝不主动跳阶段**。当前阶段验收不过，不动下一阶段的代码

### 8.4 心态陷阱

- 0 代码做出本地工具是可行的，但**"做出来"和"做得好"差距很大**
- 阶段一跑通会有巨大成就感，但 80% 时间在阶段二-四
- 桌面打包（阶段五）是难度峰值，会卡很多坑
- 接受"中途某个设计要推倒重来"——写进 ADR 比硬撑下去更省力

---

## 9. 待决事项

这里只记录真正还没拍板、且会影响后续产品方向或用户数据安全的事。已经完成或已写入 ADR 的事项不再保留在这里。

| 编号 | 事项 | 现状 | 何时定 |
|---|---|---|---|
| TBD-1 | 桌面应用显示名 | 产品名已收敛到 llm-wiki；若进入 Tauri 分发，需要确认面向用户展示的应用名 | Tauri 重新启动前 |
| TBD-2 | 危险操作确认 | 删除、覆盖、就地初始化、批量改写等操作需要统一确认策略，避免误伤用户知识库 | 下一次改危险操作前 |
| TBD-3 | 知识库导入导出 | 是否需要单独的打包导出格式，还是继续保持普通本地目录可迁移 | 有真实迁移/备份需求时 |

---

## 10. 当前状态与历史归档

当前基线已到阶段 4.8：全局社区高亮已落地，社区阅读主路径走 Sigma；DOM/SVG 只保留为回退或对照。阶段五 Tauri 打包已推迟到工作台有真实外部用户后再重新评估。

旧阶段路线、范围和验收标准已移到 [product-roadmap.md](docs/archive/product-roadmap.md)。详细提交表、验收实况和旧 changelog 已移到 [product-history.md](docs/archive/product-history.md)。主文档以后只保留当前产品事实、边界和关键决策，不再追加流水账。

继续恢复上下文时：先读本文件的产品定位、数据边界和 ADR；需要追旧路线或旧账时再读归档。
