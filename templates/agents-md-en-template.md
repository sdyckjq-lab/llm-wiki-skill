# AGENTS.md — {{TOPIC}} Knowledge Base

> Agent boot file. Any agent opening this knowledge base as its workspace should read this file first.

## What this is

A personal knowledge base around "{{TOPIC}}", built on the llm-wiki methodology: knowledge is compiled once and continuously maintained, not re-derived from raw material on every question. Created on {{DATE}}.

## Required reading (before answering topic-specific questions)

1. `index.md` — map of the whole base: page counts, category navigation, open todos. **Fast-changing data lives here, not in this file.**
2. `purpose.md` — research goals, key questions, scope.
3. `.wiki-schema.md` — language, alias vocabulary, relation vocabulary and other config.

## Directory map

| Path | Content | Maintained by |
|---|---|---|
| `raw/` | Raw sources (immutable archive, subfolder per source type) | AI (llm-wiki workflows) |
| `wiki/entities/` | Entity pages (concepts, people, tools) | AI |
| `wiki/topics/` | Topic pages | AI |
| `wiki/sources/` | Source summaries | AI |
| `wiki/comparisons/` | Comparison analyses | AI |
| `wiki/synthesis/` | Synthesis reports and crystallized sessions | AI |
| `wiki/queries/` | Saved query results | AI |

If user-created application folders exist (question banks, student records, etc.), append them to this table.

## Ground rules

1. Answer topic-related questions from this base's pages, never from model memory — specific facts are easy to get wrong.
2. Link new pages with `[[wikilinks]]` and update `index.md` and `log.md` in the same pass.
3. Respect confidence labels when ingesting (EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED).
4. Route ingest, query, digest, graph and other operations through the llm-wiki skill workflows (init / ingest / query / digest / lint / status / graph).

## Maintaining this file

This file records **slow-changing facts only** (identity, rules, directory map). Update the relevant section when structure or rules change; never record fast-changing data such as page counts here.
