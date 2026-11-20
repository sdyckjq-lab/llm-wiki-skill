English | [中文](README.md)

<div align="center">

# llm-wiki

Based on [Andrej Karpathy](https://karpathy.ai/)'s [llm-wiki methodology](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**The personal knowledge base that grows with you**

Turn scattered information into a growing, interconnected knowledge base

[![version](https://img.shields.io/badge/v3.7.0-stable--maintenance-E8D5B5?style=flat-square&labelColor=3a3026&color=E8D5B5)](https://github.com/sdyckjq-lab/llm-wiki-skill/releases)
[![license](https://img.shields.io/badge/MIT-license-5a6e5c?style=flat-square&labelColor=3a3026)](LICENSE)
![platforms](https://img.shields.io/badge/Claude·Codex·OpenClaw·Hermes-multi--platform-7a96a6?style=flat-square&labelColor=3a3026)

</div>

---

> [!NOTE]
> **Project Status (v3.7.0)**
>
> The **Skill package** is feature-complete and stable, having reached its milestone goals. This repository is now in **low-frequency maintenance mode** (no major new features planned; critical bug fixes only as needed).
>
> The local agent workbench in `workbench/` is preserved as-is as an **Experimental Prototype** from earlier exploration, and Tauri desktop packaging is discontinued. For everyday use, we recommend pairing the Skill directly with **Claude Code / Claude Cowork / Codex / OpenClaw / Hermes / Cursor + Obsidian** over plain local Markdown files.

---

## Preview

<div align="center">
<img src="assets/graph-demo.gif?v=20260428" width="100%" alt="Knowledge Graph Demo">
</div>

Oriental editorial × digital landscape interactive knowledge graph — double-click the HTML file to explore in your browser. Search, community legend, focus filters, layered node grammar, community close-up maps, hover previews, lightweight summaries before explicit reading, Shift multi-select, canvas zoom/pan, and minimap navigation all run offline.

---

## Two Entry Points

This is the llm-wiki monorepo. It contains two entry points that read and write the same knowledge base format:

- **Skill package** (recommended · stable main line): install it into Claude Code / Codex / OpenClaw / Hermes (or pair it with Claude Cowork / Cursor + Obsidian) to maintain your knowledge base inside your existing AI workflow.
- **Agent workbench** (`workbench/` · experimental prototype): an early local workbench prototype centered on conversation with Paper UI and an interactive digital landscape Living Map (`npm run dev`). Preserved as-is for reference and developer experimentation; desktop packaging is not planned.

The interactive graph engine (`packages/graph-engine/`) is shared by both the Skill offline HTML and the workbench graph view.

**Privacy boundary**: knowledge-base files and offline graph outputs stay on your machine. When you ask the agent to answer, ingest, or generate content, prompts, selected references, retrieval snippets, tool output, and generated artifacts may be sent to your configured model provider. API keys are not stored in llm-wiki's own config; third-party Skills run as trusted local code only after you explicitly install and enable them.

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

# Hermes
bash install.sh --platform hermes
```

Then just say:

> "Help me initialize a knowledge base"
> "Digest this article: <url>"

The key difference: knowledge is **compiled once, maintained continuously** — not re-derived from scratch every query.

---

## Highlights

### Stable Skill Path

| | Feature | Description |
|---|---|---|
| 🗺️ | **Digital Landscape Graph** | Self-contained HTML with a three-column oriental editorial layout, draggable and zoomable canvas, minimap navigation, and readable side panels — all offline |
| ✨ | **Graph Reading Polish** | Nodes separate map labels, index slips, and cinnabar annotations; the default view is lighter, hover previews stay available, and clicks show a summary before explicit reading |
| 🎓 | **Local Reading Flow** | Community legend, focus filters, scoped search, the reader drawer, and the selection drawer stay connected to the visible graph; offline HTML keeps selected facts visible too |
| 📦 | **Zero-config Init** | One sentence to create a full knowledge base with directory structure, templates, and research direction |
| 🤖 | **Auto-generated `AGENTS.md`** | `init` creates a bilingual `AGENTS.md` onboarding guide at the wiki root (without overwriting existing files) so any AI agent immediately understands the layout and conventions |
| 🔗 | **Structured Wiki** | Auto-generates entity pages, topic pages, and source summaries with `[[bidirectional links]]` |
| 🏷️ | **Confidence Annotation** | EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED — see at a glance what needs verification |
| 🔄 | **Smart Caching** | SHA256 deduplication + write-through cache + self-healing safety net |
| 🧠 | **Conversation-to-Wiki** | Turn valuable conversations into knowledge base pages directly |
| 📡 | **Auto Context Injection** | SessionStart hook makes the agent automatically sense the knowledge base every session |
| 📊 | **Multi-format Analysis** | Deep reports, comparison tables, and timeline views |

### Workbench Experimental Prototype (`workbench/`)

`workbench/` preserves an earlier local knowledge-base workbench prototype (Tauri desktop packaging is discontinued):

- **Local launch**: requires Node `>=22.19.0`; run `npm install && npm run dev` from the repository root to start the local frontend and backend.
- **Core experience**: Paper warm-paper UI, conversation-centered `@` page references and `/` commands, conversation-to-wiki crystallization, batch digestion, and right-drawer artifact previews.
- **Interactive Living Map**: shares `@llm-wiki/graph-engine` (Sigma primary view) with the Skill offline HTML, supporting community close-up reading, multi-select into chat, graph warning inspection, and safe same-folder rename.

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
- [Hermes](platforms/hermes/README.md)

---

<details>
<summary><strong>Full Feature List</strong></summary>

- **Research Direction Guidance** — `purpose.md` gives the agent a clear direction for organizing and querying
- **Agent Onboarding Guide** — `init` auto-generates a bilingual root `AGENTS.md` (without overwriting existing files) and includes it in `lint` checks
- **Two-step Ingestion** — Analyze first, then generate; long content uses chained thinking
- **Ingest Format Validation** — Scripts auto-validate analysis results; even weak models won't produce broken data
- **Smart Material Routing** — Auto-selects the best extraction method based on URL domain
- **Core-first Install** — Default setup only includes the core pipeline; optional extractors enabled explicitly
- **Claude Companion Upgrade Command** — `/llm-wiki-upgrade` included after installation
- **Material Deletion** — Cascade-delete with automatic cleanup of associated pages, broken links, and cache
- **Offline Interactive Graph** — Self-contained HTML powered by `@llm-wiki/graph-engine`, distinguishing same-named pages by relative path with community close-up reading, scoped search/filters, hover previews, Shift multi-select, and warning summaries
- **Query Persistence** — Save valuable comprehensive answers back to the knowledge base
- **Batch Digestion** — Give a folder path, process all files at once
- **Knowledge Base Health Check** — Scripts detect orphan pages, broken links (including escaped table aliases `[[Page\|Alias]]`), index consistency, and `AGENTS.md` presence; plus AI-level contradiction and cross-reference checks
- **Ingest Privacy Check** — First-time ingestion reminds you to check for phone numbers, API keys, etc.
- **Graph Relationship Vocabulary** — Optional manual annotation vocabulary for more precise graph diagrams
- **Obsidian Compatible** — All content is local Markdown, open directly in Obsidian

</details>

<details>
<summary><strong>Installation Details</strong></summary>

### Default Install Locations

| Platform | Path |
|---|---|
| Claude Code | `~/.claude/skills/llm-wiki` |
| Codex | `~/.codex/skills/llm-wiki` |
| OpenClaw | `~/.openclaw/skills/llm-wiki` |
| Hermes | `~/.hermes/skills/llm-wiki` |

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

```bash
bash install.sh --upgrade --platform hermes --target-dir <your-skill-dir>/llm-wiki
```

### Prerequisites

- Core: your agent can run shell commands and read/write local files; graph builds and source-signal coverage checks require `jq` + `node`
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
│   │   └── sessions/       # Conversation-to-wiki pages
│   └── queries/            # Saved queries
├── AGENTS.md               # Agent onboarding guide (auto-generated by init)
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
No. Claude is one of multiple entry points. The same repo can be installed by Claude Code, Codex, OpenClaw, or Hermes.

**Why does Hermes care about `HERMES.md`?**
Hermes loads the repo root `HERMES.md` as its highest-priority project context. That file only defines the Hermes entry and install path; the shared workflow still lives in `SKILL.md`.

**Can I update from within Claude Code?**
Yes. `/llm-wiki-upgrade` updates the core. Add `--with-optional-adapters` to also refresh web/X/WeChat/YouTube/Zhihu extraction.

**X/Twitter extraction failing?**
Ensure optional adapters are installed (`--with-optional-adapters`). For authenticated content, start Chrome with debug port 9222. You can also paste content directly.

**WeChat extraction failing?**
Requires `uv`. Install it, then re-run with `--with-optional-adapters`.

</details>

## Windows Users

Windows PowerShell 5.1 (bundled with Win10 / Win11) defaults to GB2312 for console encoding, ASCII (CP1252) for `$OutputEncoding`, and `gbk` for Python subprocess `sys.stdout.encoding` on Chinese locale. Running `bash install.sh` directly under PowerShell 5.1 garbles Chinese output and hook JSON ([#16](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/16)).

**Option A — Use `install.ps1` (recommended)**

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 --platform claude
powershell -ExecutionPolicy Bypass -File install.ps1 --platform codex --dry-run
```

`install.ps1` sets console / `$OutputEncoding` / `PYTHONIOENCODING` all to UTF-8, then delegates to `bash install.sh`.

**Option B — Manually set PowerShell encoding**

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
bash install.sh --platform claude
```

**Option C — Upgrade to PowerShell 7+**

PowerShell 7 defaults to UTF-8. Install: `winget install Microsoft.PowerShell`, then run `bash install.sh --platform claude` under `pwsh` directly.

### Python command

Windows typically installs Python as `python.exe`, not `python3.exe` (the `python3` on PATH via Microsoft Store is a stub that prompts installation instead of running). `scripts/shared-config.sh` auto-detects: **tries `python3` first, falls back to `python`**. As long as Python 3.8+ is on PATH under either name, all scripts work.

---

## Credits

This project builds on:

- **[Andrej Karpathy](https://karpathy.ai/)** — [llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), the core methodology
- **[baoyu-url-to-markdown](https://github.com/JimLiu/baoyu-skills#baoyu-url-to-markdown)** by [JimLiu](https://github.com/JimLiu) — Web/X/Twitter content extraction
- **youtube-transcript** — YouTube subtitle extraction
- **[wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown)** — WeChat article extraction

## License

MIT

---

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=sdyckjq-lab/llm-wiki-skill&type=date)](https://www.star-history.com/?repos=sdyckjq-lab%2Fllm-wiki-skill&type=date)
