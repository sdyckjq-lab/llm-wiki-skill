[English](README.en.md) | 中文

<div align="center">

# llm-wiki

基于 [Andrej Karpathy](https://karpathy.ai/) 的 [llm-wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**更适合国内宝宝体质的 K 神知识库**

把碎片化的信息变成持续积累、互相链接的知识库

[![version](https://img.shields.io/badge/v3.6.53-浏览器主流程-E8D5B5?style=flat-square&labelColor=3a3026&color=E8D5B5)](https://github.com/sdyckjq-lab/llm-wiki-skill/releases)
[![license](https://img.shields.io/badge/MIT-license-5a6e5c?style=flat-square&labelColor=3a3026)](LICENSE)
[![platforms](https://img.shields.io/badge/Claude·Codex·OpenClaw·Hermes-多平台-7a96a6?style=flat-square&labelColor=3a3026)]

</div>

---

## 效果预览

<div align="center">
<img src="assets/graph-demo.gif?v=20260428" width="100%" alt="知识图谱演示">
</div>

东方编辑部 × 数字山水风交互式知识图谱 — 双击 HTML 文件即可在浏览器中探索。搜索、社区图例、聚焦筛选、节点视觉分层、社区轻量地图、统一社区抽屉、悬停预览、轻量摘要、明确进入阅读、Shift 多选、画布缩放拖拽和小地图定位，全部离线运行，不依赖服务器。

---

## 两种入口

本仓库是 llm-wiki 的 monorepo，包含两种使用形态，读写同一份知识库格式：

- **Skill 形态**（成熟稳定）：把仓库链接丢给 Claude Code / Codex / OpenClaw / Hermes 一键安装，在你的 AI CLI 里维护知识库。
- **agent 工作台**（`workbench/`，开发中）：本地运行的知识库工作台，以对话为中心、内置交互式数字山水知识图谱。当前面向开发者（`npm run dev`），成熟后提供桌面应用。

交互式图谱引擎（`packages/graph-engine/`）由两种形态共享：Skill 的离线 HTML 和工作台的图谱视图，是同一个引擎的两个出口。

**隐私边界**：知识库文件和离线图谱产物保存在本机；当你让 agent 回答、消化或生成内容时，prompt、选中的引用、检索片段、工具输出和生成产物可能会发送给你配置的模型提供商。API key 不写入 llm-wiki 自己的配置；第三方 Skill 只有显式安装并启用后才作为受信任本地代码运行。

---

## 30 秒上手

把仓库链接扔给你正在用的 agent，让它自己完成安装。

```bash
# Claude Code
bash install.sh --platform claude

# Codex
bash install.sh --platform codex

# OpenClaw
bash install.sh --platform openclaw

# Hermes
bash install.sh --platform hermes
```

然后说：

> "帮我初始化一个知识库"
> "帮我消化这篇：<链接>"

核心区别：知识被**编译一次，持续维护**，而不是每次查询都从原始文档重新推导。

---

## 核心亮点

### Skill 稳定主线

| | 功能 | 说明 |
|---|---|---|
| 🗺️ | **数字山水知识图谱** | 自包含 HTML，双击即可浏览；三栏国风布局、山水底图、可拖拽缩放画布、小地图定位和左右阅读区全部离线运行 |
| ✨ | **图谱阅读体验打磨** | 节点按地名、索引签条、朱砂批注分层；默认画面更轻，悬停可预览，点击先看摘要，再通过明确动作进入阅读 |
| 🎓 | **本地阅读动线** | 社区图例、聚焦筛选、图谱搜索、右侧摘要/阅读抽屉和选区抽屉保持联动；社区阅读内搜索和类型筛选只作用于当前社区 |
| 📦 | **零配置初始化** | 一句话创建完整知识库，自动生成目录结构、模板和研究方向页 |
| 🔗 | **结构化 Wiki** | 自动生成实体页、主题页、素材摘要，用 `[[双向链接]]` 互相关联 |
| 🏷️ | **置信度标注** | EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED，一眼看出哪些需要核实 |
| 🔄 | **智能缓存** | SHA256 去重 + 写入即更新 + 自愈安全网，弱模型也不会漏缓存 |
| 🧠 | **对话结晶** | 把有价值的对话内容直接沉淀为知识库页面 |
| 📡 | **自动上下文注入** | SessionStart hook 让 agent 每次会话自动感知知识库 |
| 📊 | **多格式分析** | 深度报告、对比表、时间线三种综合分析格式 |

### 工作台开发预览

| | 功能 | 说明 |
|---|---|---|
| 🧭 | **社区近景地图** | 进入社区后像从全局图靠近刚才那片区域；节点位置、层级和标签更稳定，社区内可多选节点并带入对话，返回全图时高亮会跟随视野稳定后再淡出 |
| 🧩 | **全局意图反馈** | 全局图谱悬停节点可轻量看一阶关系，单击节点固定关系强调并打开摘要；选中社区只预览少量内部结构和跨社区通道，不直接变成完整社区阅读 |
| 🪶 | **图谱增强显示** | 工作台图谱默认已分清主次；需要时可打开语义强调和聚焦点亮，让关键关系更容易看清 |
| 🎨 | **工作台 Paper 视觉** | 工作台沿用暖纸配色，按钮、消息、侧栏和图谱控件保持统一，长标题不会撑开页面 |
| 💬 | **工作台对话自动跟随** | 发送和流式回复时自动停在最新内容，用户上翻时暂停，并用向下箭头一键回到底部 |
| 🧰 | **工作台动态工具状态** | agent 执行工具时显示当前动作；完成后折叠成摘要，避免主对话被工具流水账刷屏 |
| 🛡️ | **工作台安全流式对话** | prompt、工具状态、产物和终态使用统一流式契约；异常、乱序或中断的流会安全结束并恢复继续输入，公开状态不回显知识库路径或检索原文 |
| 🔒 | **工作台本地访问保护** | 本地配置、对话、页面、图谱事件、文件和状态操作都只对同时通过来源与启动凭证检查的工作台开放 |
| ✅ | **工作台可靠启动** | 后台只监听本机，失败启动不会替换现有凭证，重启会换新并恢复上次知识库；退出时会有序结束持续连接和图谱重建进程，必要时再启用兜底清理 |
| 🧪 | **工作台真实浏览器检查** | 自动启动真实前台和后台，检查知识库、对话、页面、图谱、消息、产出物、设置与模型的主要流程，以及隔离、取消、断线和失败恢复 |
| 🔎 | **工作台统一质量检查** | 本机与 GitHub 使用同一入口，顺序检查前后台、共享规则、图谱、边界、类型、规范和构建，并在隔离环境验证启动与入口反例 |

---

## 素材来源

| 分类 | 来源 | 处理方式 |
|---|---|---|
| 核心 | PDF、Markdown、文本、HTML、纯文本粘贴 | 直接消化，不依赖外挂 |
| 可选 | 网页文章、X/Twitter、微信公众号、YouTube、知乎 | 自动提取；失败时按回退提示改走手动 |
| 手动 | 小红书 | 当前只支持手动粘贴 |

可选提取器需要在安装时显式开启：

```bash
bash install.sh --platform claude --with-optional-adapters
```

---

## 平台入口

每个平台有专属入口说明：

- [Claude Code](platforms/claude/CLAUDE.md)
- [Codex](platforms/codex/AGENTS.md)
- [OpenClaw](platforms/openclaw/README.md)
- [Hermes](platforms/hermes/README.md)

---

<details>
<summary><strong>完整功能列表</strong></summary>

- **研究方向引导** — `purpose.md` 让 agent 在整理和查询时有明确方向
- **两步式整理** — 先分析后生成，长内容走两步链式思考，短内容简化处理
- **ingest 格式验证** — 脚本自动校验分析结果，模型再笨也不会写出残缺数据
- **智能素材路由** — 根据 URL 域名自动选择最佳提取方式
- **核心优先安装** — 默认只准备知识库主线，网页/X/公众号/YouTube/知乎按需显式开启
- **伴随升级命令** — Claude Code 安装后自带 `/llm-wiki-upgrade`
- **素材删除** — 级联删除时自动清理关联页面、断链和缓存
- **图谱运行时兜底更稳** — helper 同时支持浏览器全局与 CommonJS，旧运行时下的复杂 emoji 截断和离线 HTML 失败回滚都更可靠
- **Sigma 图谱主路线** — 全局视角和社区阅读都以 Sigma/Graphology 承接；DOM/SVG 只保留为回退、对照和异常兜底，不再作为社区阅读主路径扩展
- **统一社区抽屉** — 普通社区和"未分组"使用同一套概览、固定动作、可展开核心节点和对话入口；"进入社区"放在顶部，未分组默认推荐探索潜在关系
- **图谱增强显示** — 工作台图谱默认已分清主次；增强显示面板支持语义强调和聚焦点亮，社区图谱保留原有关系显示和图例
- **全局图谱意图反馈** — 在全局视图悬停节点会轻量点亮一阶真实关系，移开恢复且不打开抽屉、不移动镜头；单击节点固定关系强调并打开摘要；选中社区只露出少量内部结构和跨社区桥接上下文，不进入完整社区阅读
- **社区近景地图** — 进入社区是一段连续过渡：摘要抽屉退场、画布平滑扩展，镜头从全局社区高亮近景继续推进到社区阅读近景，过渡后落在 Sigma 社区阅读主路径且不重开摘要（减少动态效果下抽屉直接关闭、不做大幅推进）；进入社区后沿用 Sigma 主图，只显示当前社区内部节点和关系；节点位置、身份色、边层级和标签预算保持连续，搜索、类型筛选和 Shift 多选只影响当前社区，返回全图时社区高亮会跟随视野稳定后再淡出；社区阅读点“回全图”是一段更短的连续退出过渡，镜头拉回全局构图、保留来源社区高亮，不重开摘要抽屉、不清钉扎位置和全局筛选偏好
- **社区阅读关系视觉分层** — 进入社区默认第一眼就能区分结构关系和背景关系：结构跨度选择器只从真实关系里按社区规模分档挑出少量骨架关系，优先串起核心节点和小团块，而不是堆在权重最强的关系上；Sigma 社区阅读主路径让结构关系比背景关系更清楚，关系颜色仍只表达关系类型。沿用明亮、直向的视觉语言，不引入弯曲关系呈现或粗重主干视觉
- **社区节点阅读让位** — 社区内单击节点打开右侧阅读抽屉时，画布变窄和镜头让位保持连续；宽屏下节点留在剩余画布的舒适位置，窄屏覆盖或全屏阅读时不强行移动镜头
- **选区抽屉查看全部 / 收起** — Shift 多选攒下的选区抽屉默认只显示前 3 个选中页面，超过 3 个可"查看全部"，展开后可"收起"；继续 Shift 多选保持展开 / 收起状态，抽屉静默实时更新（不重开、不抢焦点、不清补充说明），多选全程不移动镜头
- **图谱视野稳定** — 点击社区摘要或重复点击同一位置时，图谱保持原视角，不会被右侧抽屉挤动
- **工作台 Paper 视觉** — Paper v2 暖纸配色覆盖工作台默认主题、新对话按钮、消息气泡、侧栏和图谱控件，长标题和长消息保持在页面内部
- **查询结果持久化** — 有价值的综合回答可保存回知识库，越用越完整
- **批量消化** — 给一个文件夹路径，批量处理所有文件
- **工作台事件流更稳** — 批量消化进度和活地图更新都有明确顺序与结束规则；单文件失败可继续，整体失败或取消会明确收口，断线和异常事件会安全停止或重连
- **工作台对话自动跟随** — 发送消息和接收长回复时默认跟随最新内容，用户上翻阅读历史时暂停，并提供图标按钮回到底部
- **工作台工具摘要** — `workbench/` 对话区采用 `omp` 风格动态工具状态，停止时显示取消状态，历史工具调用默认折叠为分组摘要
- **工作台本地访问保护** — 本地内容和状态操作都要同时通过来源与启动凭证检查，陌生网页不能读取内容或改变工作台状态
- **工作台可靠启动** — 正式启动和自动检查走同一套恢复与关闭流程；失败启动不改现有凭证，退出会有序结束持续连接和图谱重建进程并在必要时兜底清理，macOS 与 Linux 检查都会主动阻止真实用户资料读取、临时目录外写入和外网访问
- **工作台真实浏览器检查** — 使用一次性用户环境、真实前后台、真实端口、HTTP 和事件流验证七类主要流程，并覆盖隔离、取消、断线、繁忙和失败恢复；外部模型和系统文件夹选择器由测试边界替代，普通启动和正式构建不包含这些替身
- **工作台统一质量检查** — 本机与 GitHub 运行同一套完整检查；前台不会复用过期结果，失败会清理进程并只短期保留经过清理的虚构测试材料
- **知识库健康检查** — 脚本检测孤立页面、断链、index 一致性；AI 层面检查矛盾和交叉引用
- **ingest 隐私自查** — 首次消化素材时提醒检查手机号、API key 等敏感信息
- **图谱关系词汇表** — 可选的手动标注词汇，让图谱表达更精确
- **Obsidian 兼容** — 所有内容都是本地 markdown，直接用 Obsidian 打开

</details>

<details>
<summary><strong>安装详情</strong></summary>

### 默认安装位置

| 平台 | 路径 |
|---|---|
| Claude Code | `~/.claude/skills/llm-wiki` |
| Codex | `~/.codex/skills/llm-wiki` |
| OpenClaw | `~/.openclaw/skills/llm-wiki` |
| Hermes | `~/.hermes/skills/llm-wiki` |

### 更新

已安装？进入仓库目录执行：

```bash
bash install.sh --upgrade
```

自动完成：`git pull` → 检测已安装平台 → 重新复制核心文件 → 已有 hook 不受影响。

Claude Code 默认安装的，可以直接用 `/llm-wiki-upgrade`。

自定义目录：

```bash
bash install.sh --upgrade --platform openclaw --target-dir <你的技能目录>/llm-wiki
```

```bash
bash install.sh --upgrade --platform hermes --target-dir <你的技能目录>/llm-wiki
```

### 前置条件

- 核心：agent 能执行 shell 命令、读写本地文件即可；图谱构建和来源信号覆盖检查需要 `jq` + `node`
- 可选：微信公众号提取需要 `uv`；网页提取需要 `bun` 或 `npm`；需要登录态的内容可开启 Chrome 调试端口 9222

</details>

<details>
<summary><strong>目录结构</strong></summary>

```
你的知识库/
├── raw/                    # 原始素材（不可变）
│   ├── articles/           # 网页文章
│   ├── tweets/             # X/Twitter
│   ├── wechat/             # 微信公众号
│   ├── xiaohongshu/        # 小红书
│   ├── zhihu/              # 知乎
│   ├── pdfs/               # PDF
│   ├── notes/              # 笔记
│   └── assets/             # 图片等附件
├── wiki/                   # AI 生成的知识库
│   ├── entities/           # 实体页（人物、概念、工具）
│   ├── topics/             # 主题页
│   ├── sources/            # 素材摘要
│   ├── comparisons/        # 对比分析
│   ├── synthesis/          # 综合分析
│   │   └── sessions/       # 对话结晶页面
│   └── queries/            # 保存的查询结果
├── purpose.md              # 研究方向与目标
├── index.md                # 索引
├── log.md                  # 操作日志
├── .wiki-schema.md         # 配置
└── .wiki-cache.json        # 素材去重缓存
```

</details>

<details>
<summary><strong>常见问题</strong></summary>

**这个仓库还是只给 Claude 用吗？**
不是。Claude 只是其中一个入口。同一个链接能被 Claude Code、Codex、OpenClaw、Hermes 安装和使用。

**为什么 Hermes 要看 `HERMES.md`？**
Hermes 会优先加载仓库根的 `HERMES.md` 作为项目上下文。这个文件只负责 Hermes 的入口与安装说明，核心能力和工作流仍以 `SKILL.md` 为准。

**Claude Code 里可以直接用命令更新吗？**
可以。默认安装后自带 `/llm-wiki-upgrade`，更新核心主线。需要网页/X/公众号/YouTube/知乎提取能力时，再加 `--with-optional-adapters`。

**X/Twitter 提取失败？**
确保已安装可选提取器（`--with-optional-adapters`）。需要登录态的内容请开启 Chrome 调试端口 9222，或者直接粘贴内容给 agent。

**公众号提取失败？**
需要 `uv`。安装后重新运行 `bash install.sh --platform <你的平台> --with-optional-adapters`。

</details>

## Windows 用户

Windows PowerShell 5.1（Win10 / Win11 系统自带）默认 console 编码为 GB2312、`$OutputEncoding` 为 ASCII，Python 子进程 `sys.stdout.encoding` 默认为 `gbk`。直接在 PS 5.1 下运行 `bash install.sh` 会导致中文输出和 hook JSON 出现乱码（[#16](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/16)）。

**方案 A — 使用 `install.ps1`（推荐）**

在仓库根目录下：

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 --platform claude
powershell -ExecutionPolicy Bypass -File install.ps1 --platform codex --dry-run
```

`install.ps1` 会自动把 console / `$OutputEncoding` / `PYTHONIOENCODING` 全部设为 UTF-8，再转发到 `bash install.sh`。

**方案 B — 手动设置 PowerShell 编码**

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
bash install.sh --platform claude
```

**方案 C — 升级到 PowerShell 7+**

PowerShell 7 默认 UTF-8。安装：`winget install Microsoft.PowerShell`，然后 `pwsh` 下直接 `bash install.sh --platform claude`。

### Python 命令

Windows 上 Python 通常安装为 `python.exe` 而非 `python3.exe`（Microsoft Store 的 `python3` 是安装提示 stub，调用会失败）。本项目 `scripts/shared-config.sh` 已加入自动检测：**先尝试 `python3`，失败回退到 `python`**。所以只要 Python 3.8+ 在 PATH 中（任一命名即可），脚本能正常工作。

---

## 致谢

本项目复用和集成了以下开源项目：

- **[Andrej Karpathy](https://karpathy.ai/)** — [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，核心方法论来源
- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** by [JimLiu](https://github.com/JimLiu) — 网页、X/Twitter 内容提取
- **youtube-transcript** — YouTube 字幕提取
- **[wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown)** — 微信公众号文章提取

## License

MIT

---

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=sdyckjq-lab/llm-wiki-skill&type=date)](https://www.star-history.com/?repos=sdyckjq-lab%2Fllm-wiki-skill&type=date)
