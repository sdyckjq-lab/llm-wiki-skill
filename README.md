# llm-wiki — 个人知识库构建 Skill

> 基于 [Karpathy 的 llm-wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，为 Claude Code 打造的个人知识库构建系统。

## 它做什么

把碎片化的信息变成持续积累、互相链接的知识库。你只需要提供素材（网页、推文、公众号、小红书、知乎、YouTube、PDF、本地文件），AI 做所有的整理工作。

核心区别：知识被**编译一次，持续维护**，而不是每次查询都从原始文档重新推导。

## 支持的素材来源

| 来源 | 提取方式 | 状态 |
|------|----------|------|
| 网页文章 | baoyu-url-to-markdown | 已支持 |
| X/Twitter | x-article-extractor | 已支持 |
| 微信公众号 | baoyu-url-to-markdown | 已支持 |
| YouTube | youtube-transcript | 已支持 |
| 知乎 | baoyu-url-to-markdown（部分支持） | 基本支持 |
| 小红书 | 手动粘贴内容 | 待接入 skill |
| PDF / 本地文件 | 直接读取 | 已支持 |
| 纯文本粘贴 | 直接使用 | 已支持 |

## 功能

- **零配置初始化**：一句话创建知识库，自动生成目录结构和模板
- **智能素材路由**：根据 URL 域名自动选择最佳提取方式
- **内容分级处理**：长文章完整整理，短内容简化处理，避免浪费
- **批量消化**：给一个文件夹路径，批量处理所有文件
- **结构化 Wiki**：自动生成素材摘要、实体页、主题页，用 `[[双向链接]]` 互相关联
- **知识库健康检查**：自动检测孤立页面、断链、矛盾信息
- **Obsidian 兼容**：所有内容都是本地 markdown，直接用 Obsidian 打开查看

## 安装

**一键安装**（克隆 + 安装依赖，一条命令搞定）：

```bash
git clone https://github.com/sdyckjq-lab/llm-wiki-skill.git ~/.claude/skills/llm-wiki && bash ~/.claude/skills/llm-wiki/setup.sh
```

> 依赖安装是可选的。不装也能用，只是无法自动提取 URL（可以手动粘贴文本）。

## 使用

在 Claude Code 中直接说：

```
帮我初始化一个知识库
```

然后开始喂素材：

```
帮我消化这篇：https://example.com/article
```

批量消化：

```
帮我把 ~/Downloads/文章/ 里的所有文件都消化了
```

查询知识库：

```
知识库里关于 Transformer 的内容有哪些？
```

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
│   └── synthesis/          # 综合分析
├── index.md                # 索引
├── log.md                  # 操作日志
└── .wiki-schema.md         # 配置
```

## 致谢

本项目复用和集成了以下开源项目，感谢它们的作者：

- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** — by [JimLiu](https://github.com/JimLiu)
  网页和公众号文章提取，通过 Chrome CDP 渲染并转换为 markdown

- **youtube-transcript** — YouTube 视频字幕/逐字稿提取

- **x-article-extractor** — X (Twitter) 内容提取（长文章、推文串、单条推文）

核心方法论来自：

- **[Andrej Karpathy](https://karpathy.ai/)** — [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

## License

MIT
