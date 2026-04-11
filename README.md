# llm-wiki - 多平台知识库构建 Skill

> 基于 [Karpathy 的 llm-wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，为 Claude Code、Codex、OpenClaw 这类 agent 提供统一的个人知识库构建系统。

## 它做什么

把碎片化的信息变成持续积累、互相链接的知识库。你只需要提供素材，agent 会把链接、文件和文本整理成 wiki 页面。

核心区别：知识被**编译一次，持续维护**，而不是每次查询都从原始文档重新推导。

## 你怎么用

最省事的方式是把这个仓库链接直接扔给你正在用的 agent，让它自己完成安装。

你也可以先看对应平台的入口说明：

- [Claude Code 入口](platforms/claude/CLAUDE.md)
- [Codex 入口](platforms/codex/AGENTS.md)
- [OpenClaw 入口](platforms/openclaw/README.md)

## 前置条件

- 你的 agent 能执行 shell 命令
- 如果你要自动提取网页或公众号，Chrome 需要以调试模式启动
- 如果你要自动提取微信公众号或 YouTube 字幕，机器上需要有 `uv`
- `bun` 或 `npm` 二选一即可，安装网页提取依赖时会自动择一使用

## 安装方式

推荐顺序：

1. 把仓库链接交给 agent，让它自己安装。
2. 如果你要手动查看或本地调试，再克隆仓库到任意目录。

如果你要给 agent 一个明确动作，可以让它进入仓库根目录后执行：

```bash
# Claude Code
bash install.sh --platform claude

# Codex
bash install.sh --platform codex

# OpenClaw
bash install.sh --platform openclaw
```

默认安装位置：

- Claude Code: `~/.claude/skills/llm-wiki`
- Codex: `~/.codex/skills/llm-wiki`（如果你旧环境还在用 `~/.Codex/skills`，安装器也会兼容）
- OpenClaw: `~/.openclaw/skills/llm-wiki`

如果 OpenClaw 不是这一路径，也可以显式传入 `--target-dir <你的技能目录>`。

旧的 Claude 安装方式仍然保留给现有用户：`bash setup.sh`。它现在只是统一安装器的兼容入口。

## 来源边界

这一步已经把安装输出、状态说明、文档和回归测试统一到同一份来源定义。仓库里的权威清单是 `scripts/source-registry.tsv`，URL 和文件路由也统一通过 `scripts/source-registry.sh` 读取。

| 分类 | 当前来源 | 处理方式 |
|------|----------|----------|
| 核心主线 | `PDF / 本地 PDF`、`Markdown/文本/HTML`、`纯文本粘贴` | 不依赖外挂，直接进入主线 |
| 可选外挂 | `网页文章`、`X/Twitter`、`微信公众号`、`YouTube`、`知乎` | 先自动提取；失败时按回退提示改走手动入口 |
| 手动入口 | `小红书` | 当前只支持用户手动粘贴 |

当前外挂对应关系：

- `网页文章`、`X/Twitter`、`知乎`：`baoyu-url-to-markdown`
- `微信公众号`：`wechat-article-to-markdown`
- `YouTube`：`youtube-transcript`

## 功能

- **零配置初始化**：一句话创建知识库，自动生成目录结构、模板和研究方向页
- **研究方向引导**：`purpose.md` 让 agent 在整理和查询时有明确方向，不只是堆砌内容
- **两步式整理**：先分析后生成，长内容走两步链式思考，短内容简化处理
- **置信度标注**：每个知识点标注来源可信度（提取/推断/待验证），一眼看出哪些需要核实
- **智能去重**：SHA256 缓存跳过未变化的素材，批量处理时不浪费 token
- **智能素材路由**：根据 URL 域名自动选择最佳提取方式
- **素材删除**：级联删除素材时自动清理关联页面、断链和缓存
- **查询结果持久化**：有价值的综合回答可保存回知识库，越用越完整
- **自动上下文注入**：SessionStart hook 让 agent 每次会话自动感知知识库（Claude Code）
- **批量消化**：给一个文件夹路径，批量处理所有文件
- **结构化 Wiki**：自动生成素材摘要、实体页、主题页，用 `[[双向链接]]` 互相关联
- **知识库健康检查**：自动检测孤立页面、断链、矛盾信息、置信度统计
- **Obsidian 兼容**：所有内容都是本地 markdown，直接用 Obsidian 打开查看

## 常见问题

### 我应该先看哪个文件？

看你现在用的 agent：

- Claude Code: [platforms/claude/CLAUDE.md](platforms/claude/CLAUDE.md)
- Codex: [platforms/codex/AGENTS.md](platforms/codex/AGENTS.md)
- OpenClaw: [platforms/openclaw/README.md](platforms/openclaw/README.md)

### 这个仓库还是只给 Claude 用吗？

不是。Claude 只是其中一个入口。这个仓库现在的目标是让同一个链接能被多个 agent 原生安装和使用。

### agent 自动安装时应该跑哪条命令？

让当前 agent 按自己所在平台执行：

- Claude Code: `bash install.sh --platform claude`
- Codex: `bash install.sh --platform codex`
- OpenClaw: `bash install.sh --platform openclaw`

只有在环境里明确只存在一个平台目录时，才建议用 `--platform auto`。

### 为什么 X / Twitter 提取还是失败？

X / Twitter 现在走 `baoyu-url-to-markdown`。如果提取失败，通常是因为 Chrome 没有启动调试模式，或者当前 Chrome 会话没有登录 X。你也可以直接把内容复制粘贴给 agent 处理。

### 为什么公众号提取还是失败？

公众号现在使用 `wechat-article-to-markdown`。如果机器上还没有 `uv`，安装器会提示并跳过这一项；补装 `uv` 后重新运行 `bash install.sh --platform <你的平台>` 即可。

## 目录结构

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
│   └── queries/            # 保存的查询结果
├── purpose.md              # 研究方向与目标
├── index.md                # 索引
├── log.md                  # 操作日志
├── .wiki-schema.md         # 配置
└── .wiki-cache.json        # 素材去重缓存
```

## 致谢

本项目复用和集成了以下开源项目，感谢它们的作者：

- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** - by [JimLiu](https://github.com/JimLiu)
  网页文章、X/Twitter 等内容提取，通过 Chrome CDP 渲染并转换为 markdown

- **youtube-transcript** - YouTube 视频字幕/逐字稿提取

- **[wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown)** - 微信公众号文章提取

核心方法论来自：

- **[Andrej Karpathy](https://karpathy.ai/)** - [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

## License

MIT
