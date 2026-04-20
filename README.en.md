English | [中文](README.md)

<div align="center">

# llm-wiki

Based on [Andrej Karpathy](https://karpathy.ai/)'s [llm-wiki methodology](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**The personal knowledge base that grows with you**

Turn scattered information into a growing, interconnected knowledge base

[![version](https://img.shields.io/badge/v3.0.0-card%20graph-E8D5B5?style=flat-square&labelColor=3a3026&color=E8D5B5)](https://github.com/sdyckjq-lab/llm-wiki-skill/releases)
[![license](https://img.shields.io/badge/MIT-license-5a6e5c?style=flat-square&labelColor=3a3026)](LICENSE)
[![platforms](https://img.shields.io/badge/Claude·Codex·OpenClaw-multi--platform-7a96a6?style=flat-square&labelColor=3a3026)]

</div>

---

## Preview

<div align="center">
<img src="docs/assets/graph-demo.gif" width="100%" alt="Knowledge Graph Demo">
</div>

Watercolor card-style interactive knowledge graph — double-click the HTML file to explore in your browser. Search, filter, expand nodes, community clustering — all offline, no server needed.

---

## 30-Second Start

Give this repo link to your agent and let it install itself.

```bash
# Claude Code
bash install.sh --platform claude

# Codex
bash install.sh --platform codex

# OpenClaw
bash install.sh --platform openclaw
```

Then just say:

> "Help me initialize a knowledge base"
> "Digest this article: <url>"

The key difference: knowledge is **compiled once, maintained continuously** — not re-derived from scratch every query.

---

## Highlights

| | Feature | Description |
|---|---|---|
| 🗺️ | **Interactive Knowledge Graph** | Watercolor card-style HTML, offline-ready, with search, filter, and community clustering |
| 📦 | **Zero-config Init** | One sentence to create a full knowledge base with directory structure and templates |
| 🔗 | **Structured Wiki** | Auto-generates entity pages, topic pages, source summaries with `[[bidirectional links]]` |
| 🏷️ | **Confidence Annotation** | EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED — see at a glance what needs verification |
| 🔄 | **Smart Caching** | SHA256 deduplication + write-through cache + self-healing safety net |
| 🧠 | **Conversation Crystallization** | Turn valuable conversations into knowledge base pages directly |
| 📡 | **Auto Context Injection** | SessionStart hook makes the agent automatically sense the knowledge base every session |
| 📊 | **Multi-format Analysis** | Deep reports, comparison tables, and timeline views |

---

## Source Support

| Category | Sources | How |
|---|---|---|
| Core | PDF, Markdown, Text, HTML, Plain text | Direct ingestion, no external dependencies |
| Optional | Web articles, X/Twitter, WeChat, YouTube, Zhihu | Auto-extract via adapters; manual fallback if extraction fails |
| Manual | Xiaohongshu | Paste content directly |

Optional adapters require one extra flag:

```bash
bash install.sh --platform claude --with-optional-adapters
```

---

## Platform Entry Points

Each platform has its own setup guide:

- [Claude Code](platforms/claude/CLAUDE.md)
- [Codex](platforms/codex/AGENTS.md)
- [OpenClaw](platforms/openclaw/README.md)

---

<details>
<summary><strong>Full Feature List</strong></summary>

- **Research Direction Guidance** — `purpose.md` gives the agent a clear direction for organizing and querying
- **Two-step Ingestion** — Analyze first, then generate; long content uses chained thinking
- **Ingest Format Validation** — Scripts auto-validate analysis results; even weak models won't produce broken data
- **Smart Material Routing** — Auto-selects the best extraction method based on URL domain
- **Core-first Install** — Default setup only includes the core pipeline; optional extractors enabled explicitly
- **Claude Companion Upgrade Command** — `/llm-wiki-upgrade` included after installation
- **Material Deletion** — Cascade-delete with automatic cleanup of associated pages, broken links, and cache
- **Query Persistence** — Save valuable comprehensive answers back to the knowledge base
- **Batch Digestion** — Give a folder path, process all files at once
- **Knowledge Base Health Check** — Scripts detect orphan pages, broken links, index consistency; plus AI-level contradiction and cross-reference checks
- **Ingest Privacy Check** — First-time ingestion reminds you to check for phone numbers, API keys, etc.
- **Graph Relationship Vocabulary** — Optional manual annotation vocabulary for more precise graph diagrams
- **Obsidian Compatible** — All content is local markdown, open directly in Obsidian

</details>

<details>
<summary><strong>Installation Details</strong></summary>

### Default Install Locations

| Platform | Path |
|---|---|
| Claude Code | `~/.claude/skills/llm-wiki` |
| Codex | `~/.codex/skills/llm-wiki` |
| OpenClaw | `~/.openclaw/skills/llm-wiki` |

### Updating

Already installed? Run from the repo directory:

```bash
bash install.sh --upgrade
```

Automatically: `git pull` → detect installed platforms → re-copy core files → existing hooks preserved.

For Claude Code with default install, you can also use `/llm-wiki-upgrade` directly.

Custom directories:

```bash
bash install.sh --upgrade --platform openclaw --target-dir <your-skill-dir>/llm-wiki
```

### Prerequisites

- Core: your agent can run shell commands and read/write local files
- Optional: `uv` for WeChat extraction; `bun` or `npm` for web extraction; Chrome debug mode (port 9222) for authenticated sessions

</details>

<details>
<summary><strong>Directory Structure</strong></summary>

```
your-knowledge-base/
├── raw/                    # Raw materials (immutable)
│   ├── articles/           # Web articles
│   ├── tweets/             # X/Twitter
│   ├── wechat/             # WeChat articles
│   ├── xiaohongshu/        # Xiaohongshu
│   ├── zhihu/              # Zhihu
│   ├── pdfs/               # PDF
│   ├── notes/              # Notes
│   └── assets/             # Attachments
├── wiki/                   # AI-generated knowledge base
│   ├── entities/           # Entity pages
│   ├── topics/             # Topic pages
│   ├── sources/            # Source summaries
│   ├── comparisons/        # Comparisons
│   ├── synthesis/          # Synthesis
│   │   └── sessions/       # Conversation crystallization
│   └── queries/            # Saved queries
├── purpose.md              # Research direction
├── index.md                # Index
├── log.md                  # Operation log
├── .wiki-schema.md         # Config
└── .wiki-cache.json        # Dedup cache
```

</details>

<details>
<summary><strong>FAQ</strong></summary>

**Is this Claude-only?**
No. Claude is one of multiple entry points. The same repo can be installed by Claude Code, Codex, or OpenClaw.

**Can I update from within Claude Code?**
Yes. `/llm-wiki-upgrade` updates the core. Add `--with-optional-adapters` to also refresh web/X/WeChat/YouTube/Zhihu extraction.

**X/Twitter extraction failing?**
Ensure optional adapters are installed (`--with-optional-adapters`). For authenticated content, start Chrome with debug port 9222. You can also paste content directly.

**WeChat extraction failing?**
Requires `uv`. Install it, then re-run with `--with-optional-adapters`.

</details>

---

## Credits

This project builds on:

- **[Andrej Karpathy](https://karpathy.ai/)** — [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), the core methodology
- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** by [JimLiu](https://github.com/JimLiu) — Web/X/Twitter content extraction
- **youtube-transcript** — YouTube subtitle extraction
- **[wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown)** — WeChat article extraction

## License

MIT
