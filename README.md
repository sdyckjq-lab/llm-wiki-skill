[English](README.en.md) | 中文

<div align="center">

# llm-wiki

基于 [Andrej Karpathy](https://karpathy.ai/) 的 [llm-wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**更适合国内宝宝体质的 K 神知识库**

把碎片化的信息变成持续积累、互相链接的知识库

[![version](https://img.shields.io/badge/v3.0.4-Hermes%20支持-E8D5B5?style=flat-square&labelColor=3a3026&color=E8D5B5)](https://github.com/sdyckjq-lab/llm-wiki-skill/releases)
[![license](https://img.shields.io/badge/MIT-license-5a6e5c?style=flat-square&labelColor=3a3026)](LICENSE)
[![platforms](https://img.shields.io/badge/Claude·Codex·OpenClaw·Hermes-多平台-7a96a6?style=flat-square&labelColor=3a3026)]

</div>

---

## 效果预览

<div align="center">
<img src="docs/assets/graph-demo.gif" width="100%" alt="知识图谱演示">
</div>

水彩卡片风交互式知识图谱 — 双击 HTML 文件即可在浏览器中探索。搜索、过滤、节点展开、边权重、Insights 面板、社区聚类，全部离线运行，不依赖服务器。

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

| | 功能 | 说明 |
|---|---|---|
| 🗺️ | **水彩卡片风知识图谱** | 自包含 HTML，双击即可浏览；搜索、过滤、边权重、Insights、社区聚类，离线运行 |
| ✨ | **图谱阅读体验打磨** | 顶栏 GitHub 入口、长标签安全截断、小地图/相邻节点可折叠，宽屏按钮直接显示文字 |
| 📦 | **零配置初始化** | 一句话创建完整知识库，自动生成目录结构、模板和研究方向页 |
| 🔗 | **结构化 Wiki** | 自动生成实体页、主题页、素材摘要，用 `[[双向链接]]` 互相关联 |
| 🏷️ | **置信度标注** | EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED，一眼看出哪些需要核实 |
| 🔄 | **智能缓存** | SHA256 去重 + 写入即更新 + 自愈安全网，弱模型也不会漏缓存 |
| 🧠 | **对话结晶化** | 把有价值的对话内容直接沉淀为知识库页面 |
| 📡 | **自动上下文注入** | SessionStart hook 让 agent 每次会话自动感知知识库 |
| 📊 | **多格式分析** | 深度报告、对比表、时间线三种综合分析格式 |

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
- **查询结果持久化** — 有价值的综合回答可保存回知识库，越用越完整
- **批量消化** — 给一个文件夹路径，批量处理所有文件
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
│   │   └── sessions/       # 对话结晶化页面
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

---

## 致谢

本项目复用和集成了以下开源项目：

- **[Andrej Karpathy](https://karpathy.ai/)** — [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，核心方法论来源
- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** by [JimLiu](https://github.com/JimLiu) — 网页、X/Twitter 内容提取
- **youtube-transcript** — YouTube 字幕提取
- **[wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown)** — 微信公众号文章提取

## License

MIT
