# llm-wiki-agent 产品文档

> 本文档是项目的**思路锚点**。当你（作者）或任何 AI 协作者思路断裂时，先读这份文档恢复上下文，再继续动手。
>
> **维护原则**：决策或功能定义变化时，**先改文档，再改代码**。文档与实现冲突时以文档为准。

---

## 0. 这份文档怎么用

- 作者是 0 代码基础的产品设计者。开发由 AI 协作完成。
- 文档不写代码细节，只写**意图、约定、决策理由**。
- 这份文档现在只保留当前产品事实、边界和关键决策；历史阶段记录见 [product-history.md](docs/archive/product-history.md)。
- 快速恢复上下文时，优先读：产品定位、数据边界、ADR、当前状态。
- 不要在本文末尾继续追加流水账；阶段提交表和旧 changelog 进历史归档。

---

## 1. 产品定位

### 1.1 一句话定位

**本地运行的知识库工作台。以对话为中心，通过 `@` 引用知识库内容、`/` 调用工具能力，把对话沉淀为可读可分享的产物（笔记、HTML、PPT、Word 等）。**

### 1.2 核心场景

用户打开 llm-wiki-agent，看到自己的若干知识库列表，选一个进入。在对话框里和 agent 对话：

- agent 知道当前在哪个知识库里，可以基于该库内容回答问题
- 输入 `@` 弹出页面列表，引用具体 wiki 页面进 prompt
- 输入 `/` 弹出命令列表，调用工具（搜索、消化新素材、生成 HTML/PPT/Doc）
- 对话结束后一键"结晶"为新的 wiki 页面，写回知识库
- 产出物（HTML/PPT/Doc）在右抽屉直接预览，一键下载或分享

整个工具运行在本地，所有知识库数据是本地 markdown 文件，零云依赖。

### 1.3 与 llm-wiki-skill 的关系

| 维度 | llm-wiki-skill（旧） | llm-wiki-agent（新） |
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
| UI 组件库 | 暂定 [shadcn/ui](https://ui.shadcn.com/) | 不是黑盒、可读、复制粘贴风格、深色主题原生 |
| 后端框架 | **Hono** | 轻量、TS 友好、文档清晰 |
| Agent runtime | **@earendil-works/pi-coding-agent** SDK | 原生 Skill 支持；事件流；多 provider |
| 通信 | **SSE + HTTP POST** | agent→UI 单向流，SSE 足够；WebSocket 过度 |
| 数据 | 本地 markdown + JSON | 无服务器；Obsidian 兼容 |
| 桌面打包（未来） | **Tauri** | 用系统 webview + Rust 后端；二进制和内存占用通常显著低于 Electron（5-30 MB vs 100+ MB） |
| 包管理 | npm（统一）| 不混用 pnpm/bun，避免新手版本混乱 |
| Node 版本管理 | **mise** 或 nvm | mise 是多语言版本管理（含 Node）；锁版本至少 `>=22.19.0`（pi-coding-agent 0.75.x 的最低要求） |
| Markdown 渲染（阶段二+）| **react-markdown** ^9 + **remark-gfm** ^4 | 生态最稳、类型完备、GFM 表格/任务列表/自动链接；shadcn 生态常用 |
| 命令/补全菜单（阶段二+）| **cmdk** ^1 | shadcn `<Command>` 底层；键盘导航与 a11y 完备；同时承载 `/` 命令菜单和 `@` 引用菜单 |

### 3.3 关键流程：一次对话发生了什么

> 下列路径（`/api/refs` 等）为**建议命名**，最终以实现为准。

```
1. 用户在对话框输入文本（可能含 @页面 或 /命令）
2. 前端检测到 @ → 调 /api/refs 拿当前库页面列表 → 弹出菜单 → 用户选中
3. 前端检测到 / → 调 /api/commands 拿已加载命令 → 弹出菜单 → 用户选中
4. 前端 POST /api/prompt，body 是展开后的完整文本
5. 后端调用 session.prompt(text)
6. session 通过 subscribe 推 agent 事件
7. 后端把事件 SSE 推给前端 /api/events
8. 前端按事件类型渲染（文本流、工具调用、引用预览…）
9. 用户可选触发 /sediment 把本次对话沉淀为 wiki 页面
```

❗ **关键点**：当前知识库的"上下文"不是通过 prompt 字符串拼接传递，而是通过 pi-agent 的 **Extension** 注入到 session state 里。这是干净做法。具体见 ADR-7。

### 3.4 pi-agent 的使用方式

**结论：pi-agent 作为 npm 依赖引入，不 clone 源码，不做 fork**。

具体含义：

```
llm-wiki-agent/                       ← 你的仓库
├── package.json                      ← 这里声明 "@earendil-works/pi-coding-agent": "^x.y.z"
├── node_modules/
│   └── @earendil-works/
│       └── pi-coding-agent/          ← pi 源码自动安装在这里，只读，不改
├── server/                           ← 你写的后端
│   ├── index.ts                      ← Hono 起服务
│   ├── agent.ts                      ← import { createAgentSession } from '@earendil-works/pi-coding-agent'
│   └── extensions/                   ← 你写的 Extension
└── web/                              ← 你写的前端
```

你"写"的代码：

1. 后端把 pi SDK 包装成 HTTP/SSE 接口
2. 一个或多个 Extension（注入"当前知识库"等应用状态）
3. 前端 UI

你"用"但不写的代码（全在 npm 包里）：

- agent runtime、Skill 加载、事件流、模型管理、会话持久化

升级 pi：改 `package.json` 里的版本号，`npm install` 重跑。

**Extension 注入方式**：pi-coding-agent CLI 会自动发现 `~/.pi/agent/extensions/*.ts` 下的全局 extension。**我们是 SDK 用户，不依赖那个机制**——而是把 extension 代码放在自己仓库的 `server/extensions/` 下，通过 SDK 暴露的 `bindExtensions()` 或自定义 `ResourceLoader` 显式注入 session。这样 extension 跟着我们项目走，不污染用户的 `~/.pi/`。

❗ 永远**不要**直接修改 `node_modules/` 里的 pi 源码。万一极端情况需要 patch（99% 用不到），用 `patch-package` 做局部补丁，保持升级路径干净。

❗ pi-coding-agent 0.75.x 要求 **Node `>=22.19.0`**。用 mise/nvm 锁定到合适版本，避免系统 Node 太旧。

---

## 4. 功能阶段路线

每个阶段：**目标 → 范围 → 不包含 → 验收**。验收不过不进下一阶段。

### 阶段一：主干打通（最小可用） ✅ 已完成 2026-05-26

**目标**：验证"前端 ↔ 后端 ↔ pi-agent ↔ Skill ↔ 文件系统"全链路。

**范围**：
- 一行命令拉起本地服务（`npm run dev` 启动后端 + 前端）
- 浏览器打开 `localhost:xxxx`，看到知识库列表
  - 自动扫描 `~/llm-wiki/` 下含 `.wiki-schema.md` 的子目录
  - 支持手动"添加现有库"指向任意路径（如 `~/Documents/AI学习知识库`）
  - 注册过的库存在 `~/.llm-wiki-agent/config.json`
- 点击一个知识库进入对话界面
- 顶部状态条显示当前知识库名
- 同库内支持多个并行对话，侧栏列出，"+ 新对话"按钮在顶部
- 切库自动保存当前对话，打开目标库最近活跃的对话
- 对话框可输入，流式接收 agent 回复
- agent 通过 Extension 知道当前知识库路径
- 对话历史持久化（pi-agent SDK 原生功能）

**不包含**：`@` 补全、`/` 命令、图谱、产出能力、消化新素材、新建知识库 UI。

**验收标准**：
1. 在 "AI学习知识库" 里问"这个库里有哪些主题"，agent 调用 `read` 工具读 `index.md`，给出准确回答
2. 切到另一个库再问，对话上下文完全切换
3. 同一库内开两个对话，互不污染
4. 关闭浏览器再打开，自动选中最近对话，历史完整

**完成情况** ✅ 2026-05-26（最终 commit `dd021bc`）

- 8 个 step commit + 2 个 review 修补 commit，详见 §10 进度追踪
- 范围全部交付；4 项验收标准实测全通（验收 1 实测中 agent 用 `list_knowledge_base_pages` Extension 工具回答，效果等价于读 `index.md`，更精准）
- **接受的妥协（不阻塞阶段二）**：
  - §5.2 顶部 "⚙ 设置" 按钮仅占位（disabled + tooltip）—— 完整设置面板在阶段二
  - §5.1 侧栏底部"图谱入口"未实现 —— 作者要重新构思图谱设计，推迟到阶段四
  - 默认模型不强制 Sonnet，沿用 pi-agent 用户设置（见 TBD-2）
- **启动 & 运行速查**（compact 后从这里恢复上下文）：

| 维度 | 值 |
|---|---|
| 一行启动 | `npm run dev`（从仓库根；用 `concurrently` 同时起前后端）|
| 后端端口 | `8787`（`server/src/index.ts`，Hono）|
| 前端端口 | `5180`（`web/vite.config.ts`，`strictPort: true`，冲突直接报错而非漂移）|
| 启动耗时 | ~2-5s（pi ResourceLoader + `bootstrapFromConfig` 自动恢复）|
| 默认模型 | 由 `~/.pi/agent/settings.json` 决定（不由本项目强制；作者当前为 `zai/glm-5.1`）|
| 自动恢复 | `selectKb` 写 `~/.llm-wiki-agent/config.json` 的 `lastUsedKbPath`，server 启动 `await bootstrapFromConfig()` |
| 知识库 | 默认根 `~/llm-wiki/` + 外部登记（`config.externalKnowledgeBases[]`）|
| 会话目录 | `~/.llm-wiki-agent/sessions/<sha256-of-kb-path>/*.jsonl`（pi `SessionManager` 管理）|
| Extension 工具 | `current_knowledge_base()` / `list_knowledge_base_pages()`（仅这俩，阶段二补 `@`/`/`/`/sediment` 等）|
| 已知 endpoints | 13 个，列表见 `server/src/index.ts` 顶部注释 |
| Node 版本要求 | `>=22.19.0`（pi-coding-agent 0.75.x 硬要求，仓库根 `.mise.toml` / `.nvmrc` 锁定）|

### 阶段二：核心循环（@、/、结晶、消化）✅ 已完成 2026-05-27

**目标**：让"对话 → 沉淀"形成闭环。

**范围**：
- `@` 补全菜单：弹出当前库的页面/实体/主题列表，选中后插入 wiki 链接
- `/` 命令菜单：列出所有已加载 Skill 命令 + 内置命令
- 内置命令 `/sediment`：把当前对话或选中片段沉淀为 `wiki/synthesis/sessions/` 下的页面
- 内置命令 `/new-wiki`：app 内新建知识库（输入名字 + 研究方向 → 调用 llm-wiki-skill 的 init 流程 → 在 `~/llm-wiki/` 下生成完整目录）
- 引用预览：对话里出现的 wiki 链接可点击，右抽屉打开该页面
- 消化新素材：把链接或文件路径丢给 agent → 触发 llm-wiki-skill 的消化流程
- 设置面板 UI（三层认证 + 偏好）：
  - 登录方式区：检测 pi CLI auth.json 状态 / 填 API key（写入 pi 的 auth.json）/ 显示环境变量状态
  - 默认模型、UI 偏好、知识库根目录、外部库管理（添加/移除）

**验收标准**：完整跑通——
1. 在 app 内点"+ 新建知识库"，输入名字和方向 → 自动创建 → 出现在列表里
2. 丢一篇文章链接 → agent 消化进库 → 在对话里基于这篇讨论 → 一键结晶为新页面 → 在 `wiki/synthesis/sessions/` 目录里能看到新文件
3. 在 UI 里填一个 Anthropic API key → 测试连接成功 → key 出现在 `~/.pi/agent/auth.json`，未泄露到 `~/.llm-wiki-agent/`

### 阶段三：产出能力（产品亮点）✅ 已完成 2026-05-27

**目标**：把"内容产出"做成视觉冲击力强的功能，作为产品宣传点和小白吸引力来源。

**范围**：
- 挂载 anthropics/skills 中的产出类 Skill（docx / pdf / pptx / xlsx / web-artifacts-builder 等）
- 挂载或自建 HTML 产出 Skill（生成单文件分享 HTML）
- 对话中可要求 "把这次讨论做成 PPT" / "导出为 docx" / "生成分享 HTML"
- 右抽屉支持预览：
  - HTML 直接 iframe 展示
  - PPT 用浏览器内 PPTX 渲染库（如 PPTXjs 或类似方案，**具体库阶段三选型时再定**）
  - docx 显示元数据 + 下载按钮（不强求浏览器内渲染）
- 一键导出到本地下载目录

**验收标准**：一次对话能产出 HTML、PPT、docx 三种格式，且 UI 内可直接预览或下载。

### 阶段 3.5：导航 UX 重构 + 多模型子代理批量消化 ✅ 已完成 2026-05-27

**背景**：阶段 1-3 完成后作者实际使用 app 发现两类痛点——
1. **导航 UX 反直觉**：侧栏强行把 KB 分成默认/外部两类（与"KB = 项目"心智冲突）、对话挂在侧栏中间看不出从属、"添加现有库"靠手输绝对路径常常失败、拖入非 wiki 目录直接报错
2. **批量消化效率低**：阶段二的消化是"一次喂一篇"；TBD-2"多模型路由"也一直挂着没有承载场景——批量消化正好是

**目标**：
1. **导航统一**：侧栏一栏到底、KB 可展开对话子树、拖拽优先添加路径、非 wiki 目录提供"一键初始化 + 批量消化"路径
2. **子代理批量消化**：基于 pi SDK 的 `createAgentSession` + 多模型注册落地"消化角色 → cheap / 聊天角色 → main"双角色路由；用一个 30 行的并发控制函数调度 N 个子代理并行处理 N 个文件，通过 SSE 推送进度

**范围**（7 step）：
- 侧栏重构：统一 KB 列表 + 折叠对话子树（去 default/external 分隔）
- 拖拽 + 输入框双通道：HTML5 drag 先探测能否拿到真实路径，输入框兜底 + inspect 端点判定是不是 wiki
- 非 wiki 目录初始化引导：弹窗提示 + 就地初始化 `.wiki-schema.md` + `index.md`
- 多模型双角色：`config.json` 新增 `modelRoles: { main, digest }` + 设置面板选择
- 后端子代理批量消化框架：30 行 `mapWithConcurrencyLimit` + `SessionManager.inMemory()` + 共享 `authStorage`/`modelRegistry`
- 批量消化 UI + SSE 进度推送：浮窗实时显示每个子代理的"排队/进行中/完成/失败"
- 总验收 + UX 体感打磨

**不包含**：图谱（阶段四）、Tauri 打包（阶段五）、媒体创作 / 浏览器扩展（阶段后规划）、子代理嵌套 / 工作树隔离（omp 那一套）

**验收标准**（5 条）：
1. **侧栏统一**：KB 列表一栏到底无 default/external 分隔；点当前 KB 名可展开/收起对话子树，点未选中 KB 会切换并展开；外部 KB 用文字 badge 而非分区
2. **拖拽添加**：从 Finder 拖文件夹到 dialog 拖拽区；若浏览器暴露真实 `file://`，路径自动填入输入框；若不暴露，UI 明确提示用户粘贴路径（不立即提交，给用户最后修改机会）
3. **非 wiki 兜底**：拖入无 `.wiki-schema.md` 的目录，弹"是否初始化并批量消化"对话框；选"是"→ 后台跑 init + 子代理并行消化
4. **多模型双角色**：设置面板新增"模型分配"区，main / digest 两个角色各自的 provider+model；digest 写入 `config.json` 后对新批量消化立即生效，main 写入后当前主对话立即重载并使用该模型
5. **并发消化**：批量消化 10 个 `.md` 文件能看到 ≥3 个子代理同时跑（默认并发=3），SSE 实时推送状态，全部完成后右抽屉刷新出新增的 wiki 页面

**完成情况**：
- 侧栏已统一为一栏 KB 列表，当前 KB 可点击展开/收起对话子树，外部库用 badge 标记
- 添加现有库支持拖拽探测、路径输入、目录检查；非 wiki 目录可就地初始化并可接着批量消化
- 设置面板新增 main / digest 角色选择；digest 角色用于批量消化，main 角色用于主对话并在切换后立即刷新生效
- 批量消化使用 pi SDK 原生 in-memory 子会话，并发档位为 1 / 3 / 5，通过 SSE 推送进度
- **新增依赖**：无

### 阶段四：monorepo 合并 + 图谱活地图 ✅ 已完成 2026-06-12

**背景**：两条线汇合——(1) 战略上"一个产品、两扇门"已定，ADR-16 的合并需要启动时机；(2) 图谱引擎是两端共享的第一块代码，共享代码出现即合并时机成熟的信号。原"图谱集成"目标升级为"图谱活地图"：图谱后面站着 agent，这是所有竞品图谱（只能看不能问）给不了的。

**目标**：
1. **monorepo 合并（工程部分）**：本仓库 `git subtree` 整体搬入主仓库 `workbench/`，引擎落 `packages/graph-engine/`。不发版、不改 README、不对外宣布（品牌动作留给后续阶段）
2. **图谱活地图**：共享引擎双宿主（工作台 React / Skill 离线 HTML），工作台获得活模拟 + 钉扎 + 选区提问 + 生长动画；Skill 离线 HTML 最后一步切换引擎产物，老用户白拿升级

**实施结果**：阶段四已在主仓库 `stage-4` 分支完成，8 个 Step 全部落地。总验收的自动化检查已通过；视觉一致性、深色观感和拖动手感按设计文档要求保留截图/参数证据，交由验收人做最终主观判断。

**范围**（8 Step）：
- Step 0：monorepo 搬家 + workspace 根 + 全链路冒烟
- Step 1：引擎包骨架 + helpers 纯函数 TS 化 + 测试迁移（"新骨架、旧器官"的 A 级资产）
- Step 2：工作台图谱视图静态复现（安全网基线）+ 山水/墨夜主题 token
- Step 3：活模拟 + 钉扎（松手即钉/双击解钉）+ 持久化（`.wiki-graph-layout.json`，只存钉的、路径为 key）。2026-06-19 修订：双击解钉不再作为新主路径，固定/取消固定改为明确按钮或菜单动作
- Step 4：选区系统（结构化四式，砍自由套索）+ 对话联动（选区 = 批量 `@`）
- Step 5：文件监听 + 全量重算 + diff 生长动画（diff 队列，图谱可见时消费）
- Step 6：`build-graph-html.sh` 切换引擎产物，旧 graph-wash 模板退役
- Step 7：总验收 + 墨夜主题打磨

**不包含**：仓库改名 / 对外发布、Tauri 打包（推迟到工作台有真实外部用户后）、跨库图谱、自由套索、增量图计算、主题商店（完整"明确不做清单"见设计文档 §8）。

**验收标准**（7 条，细则见设计文档 §6）：
1. 主仓库根一行 `npm run dev` 起工作台，Skill 主线测试全绿，两边互不破坏
2. 工作台图谱与旧版离线 HTML 视觉一致（静态基线截图存档）
3. 钉扎：拖动让位流畅、松手即钉、重启还原、Obsidian 旁路修改不破坏
4. 选区四式可用，动作随选区性质变化；"两簇为何没联系 → agent 建链 → 重算后颜色真变"全闭环
5. 批量消化后打开图谱补播生长动画；Obsidian 手改 ~5s 内自动反映
6. 离线 HTML 新产物双击可用、钉位生效、无提问按钮（capabilities 注入生效）
7. 工作台浅/深切换图谱跟随山水/墨夜

### 阶段 4.5：图谱可用性收尾 ✅ 已合入 2026-06-14

**背景**：阶段四交付后作者实测暴露五类问题（画布无缩放平移、点击语义被选区提问独占致阅读路径消失、Shift 多选不可发现、无搜索/图例、节点默认卡片过胖）+ 阶段四验收对离线 HTML 功能减配的裁决（补搜索与社区聚焦；学习系统三件套不做，待真实使用后按工作台语境重新设计）。与阶段 3.5 同型：真实使用驱动的收尾阶段。

**范围**（优先级序）：
- P0 画布导航：指针中心滚轮缩放 / 空白拖拽平移 / 双击回全图 / 小地图联动（引擎层，两端同享）
- P0 点击语义重构："点击即阅读，选区即升级"——单击 = 右抽屉阅读态，选区悬浮窗取消，抽屉一容器两状态；动作映射表补"单节点"行并修复 unlinked 误触发（修订 stage-4 D6）。2026-06-19 修订：全局单击改为轻量摘要优先，完整阅读必须通过明确动作进入社区阅读
- P1 图谱搜索（Cmd+F，两端）；社区聚焦列表兼图例（两端）
- P1 Shift 多选失效排查 + 可发现性提示
- P2 节点默认态瘦身 + hover 预览卡（一行标题 + 类型色条；类型/权重/摘要移入悬停——预览卡显示正文首段摘要，配套补偿瘦身）
- 抽屉阅读态瘦身定稿：去学习队列/学习路径/札记笔记/置信度列表/邻居列表，摘要迁移至 hover 预览卡；保留收纳"查看原文"；原则——**抽屉负责内容，图谱负责关系，派生信息不重复**

**明确不做**：学习系统三件套、抽屉历史栈、缩放惯性、hover 摘要 tooltip、移动端触控全套。

### 阶段 4.6：图谱演进第一批（看清关系 + 层层聚焦 + 控制工具条）✅ 已完成 2026-06-14

**背景**：4.5 收尾后推进「图谱演进候选池」。spark 脑暴把候选池按"就绪度"（而非"高价值低成本"）重排，锁定方向 = **日常可用性**（让在用的人更顺手），美观 / 惊艳 demo 后移。详见 [docs/graph-evolution-1-design.md](docs/graph-evolution-1-design.md)。

**当前状态**：已落地并通过总验收。工作台与离线 HTML 同享顶部工具条、社区聚焦、类型筛选、关系边图例；关系边按关系类型着色、按置信度虚实；离线 HTML 不提供提问入口。

**范围**：
- G1-1 关系类型上边（数据管线补齐关系类型 + 置信度；颜色 = 关系类型、矛盾避 ENTITY 红；虚实 = 置信度；全局低权重、聚焦才完整呈现）
- G1-2 递进聚焦（点社区进聚焦视图 → 点节点高亮 + 阅读）+ 类型筛选
- G1-3 顶部控制工具条取代左上角常驻浮层
- G1-4 默认收起 + 半透明
- G1-5 双宿主分工（离线 HTML 同享，无 onAsk 提问）

**明确不做**：路径查找 + 讲解、lint 上图、导出美图 / 工作台实时美观、时间筛选（缺 mtime）、图谱增强检索（移交 ADR-19）、远期池（嵌入布局 / LLM 推断边 / AI 摘要）。

**实施**：L 级 phased plan 已完成（P0 基线+完整边契约+web test 入口 → P1 工具条 → P2 聚焦 → P3 关系边 → P4 验收），分支 `feat/graph-evolution-1`，Codex `/goal` 执行（plan/progress 本地不入库，沿用 planning-docs local-only 惯例）。

**与既有决策的关系**：修订 ADR-21 / D4.5-6（社区交互：选中高亮 → 进入聚焦视图；左上浮层 → 顶部工具条）；关系边可视化记录为 ADR-23。

### 阶段 4.7：图谱交互地基重构 ✅ 已完成 2026-06-16

**背景**：4.6 后作者连续实测发现，图谱交互问题不是单个 bug：鼠标在社区或节点上滚轮缩放不一致、拖节点不跟手、节点被社区色块困住、悬停说明漂移。这些现象共同指向同一个产品问题：图谱必须像一张有相机的地图，而不是每个交互各算各的。

**当前状态**：已完成核心交互地基并通过工作台与离线 HTML 双宿主验证。现在滚轮缩放在空白、节点、社区色块和边上保持一致；拖动节点不会跳走，也不会误打开阅读抽屉；节点可以离开社区色块；悬停说明跟随节点；社区色块是视觉提示，不是拖动围栏。

**范围**：
- 统一图谱交互规则：缩放、平移、拖拽、点击、悬停、社区选择都按同一张地图心智工作。
- 社区色块改为软区域：节点可以被拖出色块，色块可以有限响应，但不会无限放大，也不会改变真实社区归属。
- 两个入口同享结果：工作台图谱和 Skill 离线 HTML 保持同一套行为。

**明确不做**：空间索引、Canvas/WebGL 重写、密度策略重做、小地图拖拽导航。这些只有在真实大库或产品使用证明需要时再启动；本阶段不把它们当作默认方向。

**与既有决策的关系**：强化 ADR-21 的“位置层/结构层分权”和 ADR-22 的“画布导航是地基能力”。本阶段不改变抽屉归属、不改变知识库结构、不改变社区和连线的真实来源。

### 阶段 4.8：图谱演进——全局社区高亮（spotlight）✅ 已落地

**背景**：4.7 把全局图统一成“一张有相机的地图”后，点社区需要地图本身给出“我正在看这个社区”的反馈，而不是只依赖右抽屉解释选择。

**当前状态**：已落地。全局 Sigma 点社区会停留在全局路线并进入社区高亮态，右抽屉继续负责摘要与动作；点击「进入社区」后仍留在 Sigma 主路线，转入社区阅读近景，只显示当前社区节点和内部关系。

**范围**：
- 全局 Sigma 点社区进入临时“社区高亮态”：当前社区强调、其他社区弱化但仍可见；停在全局、不进入社区视图。
- 回全图按层分行为：Sigma 社区阅读→回全局并保留来源社区高亮但不自动开抽屉；全局高亮态→退高亮 + 清选择关抽屉 + 回构图；普通全局→重置视角，保留筛选/Pin/搜索。
- 点空白处退出高亮（与回全图在高亮态等价，有意冗余）。
- 相机轻量构图动画（平移 + 受限缩放）；动画期间社区云团、节点命中框和标签共用轻量 overlay transform，稳定后精确校准，避免每帧重算全部社区云团。
- 叠加优先级：筛选 > 搜索命中 > 选中 > Pin > 高亮。

**明确不做**：全局 hover 完整方案、节点详情卡片重做、社区内部布局重排、大图聚合、#70 标签长度兜底。2026-07-04 修订：社区阅读视图已进入 Sigma 主路线，DOM/SVG 社区视图只作为回退或对照，不再作为主路径。

**与既有决策的关系**：增强 ADR-21 第 5 条 / ADR-22 的“点社区先摘要、再按钮进入”两步边界；在 ADR-22 第 4 条“画布导航是地基能力”之上给回全图叠加“高亮态分层”。高亮态仍复用 Sigma 全局现有 `selection`（社区）→`selected` 视觉链路；真正进入社区阅读时才使用 `focusCommunity()` / 顶层 `state.focus`，且不写知识库——遵守 ADR-21 第 4 条位置/结构分权与“浏览状态留本机”。

### 阶段五：桌面应用打包（Tauri）

**目标**：跨平台桌面应用安装包。

**范围**：
- Tauri 项目初始化
- 后端嵌入 Tauri sidecar 进程
- macOS / Windows / Linux 三平台构建
- 安装包自动化产出（CI 可选）
- 安装后开箱即用，无需用户配 Node 环境（API key 仍由用户填）

**验收标准**：双击 .dmg / .msi / .AppImage 安装即可使用。

### 阶段后规划（暂不锁定，记录想法）

- 浏览器扩展：当前页面一键消化进库
- 多模型路由：按任务类型自动切（消化用便宜模型、深度对话用强模型），与 pi-agent provider 体系打通
- 全局快捷键 / 系统托盘
- 主题与自定义样式
- 多端同步（如果未来真有需求）

#### 图谱演进候选池（2026-06-13 全景分析沉淀；首批已落地为「阶段 4.6」，见上文 §阶段 4.6）

> 来源：阶段 4.5 设计期间的行业全景讨论。统领判断——行业两条尸检教训：**全局图是营销图、局部图才是工具**（Roam 弱化图谱、TheBrain 靠局部视图活了 20 年）；**只能看不能动的图谱是玩具**（Obsidian 图谱日活极低的根因）。llm-wiki 已踩对第二条的解法（图谱可问，全行业独一份），第一条靠下面的"局部图"接住。

**推荐切片（按就绪度推进；首批 4.6 已完成日常可用性主线）**：

| 项 | 一句话 | 为什么值得 |
|---|---|---|
| 局部图模式 | ✅ 首批已落地：点社区进入聚焦视图，只显示该社区节点；点节点高亮并阅读 | 接住教训一：大库日常视图应是局部图；与"+邻居"选区天然衔接 |
| 路径查找 + agent 讲解 | 选两节点高亮最短路，**agent 沿路径讲故事** | 独有赛道杀手级演示：Neo4j 只能画路径，我们能讲 |
| lint 健康上图 | 孤岛/断链/上帝节点图上标注 + 一键让 agent 修 | stage-4 终局愿景一直没排期；lint 能力现成只差可视化 |
| 关系类型上边 | ✅ 首批已落地（颜色维待数据）：按关系词汇表给边颜色 + 按置信度给边虚实，"矛盾"边避开 ENTITY 红。**置信度虚实维已真实生效；关系类型颜色维当前几乎全默认"依赖"=单色，待消化管线产出 `relation` 注释（见远期池）** | 关系词汇表与置信度体系已有；4.6 补齐契约与上色管道 |
| 类型/时间过滤器 | ✅ 类型已落地；⏸ 时间筛选二期（缺 mtime） | 轻量；Obsidian 式语法属于过度设计 |
| 导出美图 | 当前视角一键导出带主题样式的 PNG/SVG | 数字山水是最强传播资产，用户发图 = 免费获客，成本极低 |
| 图谱增强检索（后端暗改） | ↪ 已移交 ADR-19 检索线，不占图谱候选池决策位 | GraphRAG 核心思路：图谱不只给人看，是 agent 的检索结构；半天级工作量 |

**远期池（依赖消化管线升级，同一批做）**：
- LLM 推断边：消化时让模型判断该页与库内哪些页相关，带置信度入图（EXTRACTED/INFERRED 体系现成承接；同名竞品与 GraphRAG 的两阶段建边）
- AI 真摘要：消化时为每页生成一两句摘要写入页面元数据，hover 预览卡与社区摘要自动升级
- 社区摘要 hover：悬停团块显示这一簇的一句话摘要（GraphRAG 分层社区摘要思路）
- 嵌入布局（第二布局，不替代力导向）：页面 embedding 降维投影，"位置即语义"；与力导向的差异本身是洞察——**语义很近却没连线 = 待建链盲区**，将来可成独有功能
- 消化时提取关系类型注释（`relation_type`）：4.6 已铺好边数据契约与上色管道，但现有 wiki 页面只有 `<!-- confidence -->` 注释、无 `<!-- relation: 矛盾 -->` 注释，故 **G1-1 颜色维当前几乎全默认"依赖"= 单色**（置信度虚实维已真实生效）。消化时让模型判定关系类型并写入注释，即可点亮颜色维（与 LLM 推断边 / AI 真摘要同属管线升级，同一批做）

**明确不做 / 已修订**：
- ❌ 3D 图谱（行业著名伪需求，旋转酷炫三分钟，阅读效率负提升）
- ❌ 白板化 / 手动布局全图（Heptabase 路线；钉扎已是其轻量正解）
- ⚠️ 旧判断“❌ WebGL 渲染重写”已被 2026-06-19 大图谱性能方案修订，并在 2026-07-04 继续推进：全局大图与社区阅读主线都走 Sigma/Graphology；DOM/SVG 只服务回退、对照、离线细节和小图异常兜底。

**竞品技术参考存档**：渲染梯子 DOM(<500)→Canvas(<5k)→WebGL(50k+，Obsidian 用 Pixi)；嵌入布局参考 Nomic Atlas；检索架构参考 Microsoft GraphRAG（社区检测 + 分层摘要，与 llm-wiki 的社区/digest 理念同构）；局部视图参考 TheBrain plex；语义相似边参考 Connected Papers。

---

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
| 应用数据 | `~/.llm-wiki-agent/` | llm-wiki-agent |
| 模型凭证 | `~/.pi/agent/auth.json` | pi-agent SDK |

❗ `.gitignore` 排除 `~/.llm-wiki-agent/`。**永远不要**把 API key 写进任何源代码或仓库文件。详见 ADR-13。

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
| ADR-6 | [完全进化为 agent，不维护双通道](../docs/adr/0006-evolve-to-agent-no-dual-channel.md) |
| ADR-7 | [知识库上下文用 Extension 注入，不拼 prompt](../docs/adr/0007-kb-context-via-extension-not-prompt.md) |
| ADR-8 | [React + Vite 而非 Next.js](../docs/adr/0008-react-vite-not-nextjs.md) |
| ADR-9 | [UI 用 shadcn/ui](../docs/adr/0009-shadcn-ui.md) |
| ADR-10 | [pi-agent 作为 npm 依赖，不 fork、不 clone 源码](../docs/adr/0010-pi-agent-npm-dependency-no-fork.md) |
| ADR-11 | [知识库采用混合存储策略（默认根 + 外部登记）](../docs/adr/0011-hybrid-knowledge-base-storage.md) |
| ADR-12 | [会话绑定知识库，同库支持多并行对话](../docs/adr/0012-sessions-bound-to-knowledge-base.md) |
| ADR-13 | [模型认证完全复用 pi-agent 的 auth 体系（三层 fallback）](../docs/adr/0013-pi-agent-auth-system.md) |
| ADR-13b | [不抄 open-design 的"多 CLI 子进程"模式](../docs/adr/0013b-no-open-design-cli-subprocesses.md) |
| ADR-14 | [app 内一键新建知识库](../docs/adr/0014-in-app-create-knowledge-base.md) |
| ADR-15 | [Obsidian 共存（agent 忽略非 markdown 与第三方元数据）](../docs/adr/0015-obsidian-coexistence.md) |
| ADR-16 | [长期与 llm-wiki 仓库合并（agent 是 Skill 的升级版）](../docs/adr/0016-merge-with-llm-wiki-repo.md) |
| ADR-17 | [阶段二新增前端依赖（react-markdown + cmdk）](../docs/adr/0017-stage-2-frontend-dependencies.md) |
| ADR-18 | [阶段 3.5 多模型双角色 + 轻量子代理框架](../docs/adr/0018-stage-3-5-model-roles-and-subagents.md) |
| ADR-19 | [主对话引入“系统检索 + 上下文注入”](../docs/adr/0019-system-retrieval-context-injection.md) |
| ADR-20 | [阶段四启动 monorepo 合并（丙方案）](../docs/adr/0020-monorepo-merge.md) |
| ADR-21 | [图谱引擎与活地图（一个引擎、两个宿主）](../docs/adr/0021-graph-engine-living-map.md) |
| ADR-22 | [图谱交互模型——点击即阅读，选区即升级](../docs/adr/0022-graph-interaction-click-read-selection-upgrade.md) |
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
| ADR-32 | [一个图谱引擎，两个宿主](../docs/adr/0032-one-graph-engine-two-hosts.md) |

## 8. 给 0 代码作者的盲区与协作规则

### 8.1 环境陷阱

- macOS 默认 Node 版本可能旧。**统一用 [mise](https://mise.jdx.dev/) 或 nvm 管理 Node 版本**，锁到 **`>=22.19.0`**（pi-coding-agent 0.75.x 的硬要求）。否则 `npm install` 就直接报错
- 不要全局 `npm install -g`。每个项目用 `package.json` 锁版本
- API key **完全不进我们的仓库**，也不进 `~/.llm-wiki-agent/`。统一由 pi-agent SDK 管理，落到 `~/.pi/agent/auth.json`（权限 0600）。详见 ADR-13

### 8.2 进度陷阱

- **"差一点就跑通了"是最危险的状态**。验收标准要严格，跑不通就不进下一阶段
- AI 协作最大的隐性风险：你不懂代码 → AI 改 A 引起 B 坏，你不知道 → 雪球越滚越大
  - **对策**：每阶段结束让 AI 主动列出"本次改了哪些文件、新增了什么依赖、为什么"，你看明白再确认
- **Git 是你的安全网**。每个验收节点 commit 一次。

### 8.3 协作规则（AI 必须遵守）

- **不要自由发挥**。每次动手前先说"打算改哪些文件、为什么这么改、对其他部分有什么影响"，作者确认后再动
- **任何要新增依赖**（npm package、Skill、配置项），先问"这是 PRODUCT.md 里规划过的吗"
- **任何要修改 PRODUCT.md 之外的决策**，先说明"这与 PRODUCT.md 第 X.Y 节冲突，建议修改文档为 Z"，等作者拍板
- **作者思路断了的时候**，先读 PRODUCT.md，不要急着问"我们做到哪里了"——日志和 git 记录是事实，文档是意图，两个对照看
- **绝不主动跳阶段**。阶段二验收不过，不允许动阶段三的代码

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

详细阶段记录、提交表、验收实况和旧 changelog 已移到 [product-history.md](docs/archive/product-history.md)。主文档以后只保留当前产品事实、边界和关键决策，不再追加流水账。

继续恢复上下文时：先读本文件的产品定位、数据边界和 ADR；需要追旧账时再读历史归档。
