# Obsidian Integration Guide

llm-wiki generates standard Markdown with `[[wikilinks]]` and YAML frontmatter — Obsidian supports both natively. This guide covers practical setup tips.

## Open your wiki as a vault

Your wiki is just a folder. In Obsidian:

1. **Open folder as vault** > select your wiki root (e.g. `~/Documents/my-wiki/`)
2. Done. All pages, links, and the graph are immediately available.

If your vault lives elsewhere and you want to keep wiki content inside it:

```bash
ln -sfn ~/Documents/my-wiki/wiki ~/your-obsidian-vault/wiki
```

## Web Clipper (recommended)

Obsidian Web Clipper is a free browser extension that saves web pages as Markdown — a great manual fallback when llm-wiki's auto-extractors fail (login walls, anti-scraping, etc.).

### Setup

1. Install from your browser's extension store (Chrome / Safari / Firefox / Edge / Arc)
2. In Clipper settings, set the default save folder to your wiki's `raw/articles/`
3. Browse the web normally. When you find a good article, click the Obsidian icon > **Clip**

### Usage with llm-wiki

After clipping, tell your AI agent:

> "help me digest raw/articles/the-file-you-just-clipped.md"

The agent handles the rest — extraction, entity pages, cross-linking, index update.

## Graph View tips

Obsidian's built-in Graph View shows your wiki's link structure. Two tips to make it useful:

### Filter out hub pages

`index.md`, `log.md`, and `overview.md` link to everything and dominate the graph. Exclude them:

1. Open Graph View (Cmd/Ctrl + G)
2. Click the filter icon (top-left)
3. Add to the filter: `-file:index -file:log -file:overview`

Now the graph shows real knowledge relationships, not bookkeeping links.

### Color by folder

In Graph View settings > Groups, add:

| Query | Color |
|---|---|
| `path:wiki/entities` | Blue |
| `path:wiki/topics` | Green |
| `path:wiki/sources` | Orange |

This makes it easy to spot which areas of your wiki are dense vs. sparse.

## Dataview queries

If you install the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin, you can run live queries against your wiki's frontmatter.

### All sources, sorted by date

```dataview
TABLE source_type, created
FROM "wiki/sources"
SORT created DESC
```

### Entities tagged with a specific topic

```dataview
LIST
FROM "wiki/entities"
WHERE contains(tags, "AI")
```

### Pages missing sources (needs attention)

```dataview
LIST
FROM "wiki"
WHERE !sources OR length(sources) = 0
```

### Count pages by type

```dataview
TABLE length(rows) AS Count
FROM "wiki"
GROUP BY split(file.folder, "/")[1] AS Type
```

## Image localization

When you clip articles with images, the image URLs may break over time. To download them locally:

1. In Obsidian Settings > **Files and links**, set "Attachment folder path" to `raw/assets/`
2. In Settings > **Hotkeys**, find "Download attachments for current file" and bind it (e.g. Ctrl+Shift+D)
3. After clipping an article, open it and press the hotkey — all images download to `raw/assets/`

## Tips

- **Live preview**: Keep Obsidian open while running llm-wiki. You'll see new pages appear in real time as the AI creates them.
- **Backlinks panel**: Click any entity page and check the Backlinks panel (right sidebar) to see every page that references it — a quick way to audit cross-references.
- **Git integration**: Install the Obsidian Git community plugin for automatic commits after each AI session.
