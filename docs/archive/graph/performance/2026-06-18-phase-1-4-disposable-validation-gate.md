# Phase 1.4 Disposable Validation Gate

Date: 2026-06-18
Branch: `codex/large-graph-performance-experience`
Task: `1.4`

## Purpose

This note closes the Phase 1 validation gate before product behavior changes. It records how generated large graphs are measured, how real graph snapshots should be handled, which browser environment is usable, what stress limits are realistic, and which assumptions must stay portable for a future desktop app.

## Validation Result

The current offline graph entry can load generated large graph shapes without new product-code integration. The dedicated runner builds temporary offline HTML from generated graph data, opens it in Playwright Chromium, records fixed-schema measurements, and writes artifacts outside git.

Evidence:

- `tests/browser/graph-large-performance.ts`
- `tests/graph-browser-large-performance.regression-1.sh`
- `/tmp/llm-wiki-graph-large-perf-task-1-2/large-graph-performance-results.json`
- `/tmp/llm-wiki-graph-large-perf-task-1-3/large-graph-performance-results.json`
- `docs/graph/performance/2026-06-18-phase-1-3-dom-svg-large-baseline.md`

## Real Graph Source And Privacy Policy

Generated fixtures are the default reproducible source for Phase 1 and should remain committed only as generator code, not as large JSON outputs.

A real graph snapshot may be added later only as an uncommitted or sanitized artifact:

- Owner: the developer running the benchmark exports it from a local knowledge base.
- Location: `/tmp/llm-wiki-real-graph-snapshot-<date>/graph-data.json` or another ignored local path.
- Git policy: real snapshots are excluded from git unless explicitly anonymized and reviewed.
- Privacy handling: remove source paths, personal names, private project names, raw content, and unique file-system paths before sharing or committing.
- Reproduction: record node/edge/community counts, largest community size, search-hit count, Pin count, export command, hash of sanitized data, and benchmark artifact path.
- If the real graph contains private data and cannot be anonymized, use the generated `real-snapshot-proxy` shape instead.

## Edge Count Caps

The stress goal is to measure product-like behavior, not arbitrary impossible graphs. Current caps for this plan:

| Shape | Node cap | Edge cap | Reason |
|---|---:|---:|---|
| 1000 sparse | 1000 | 1400 | Baseline navigation and interaction. |
| 1000 dense | 1000 | 12000 | Dense local relation pressure while still fitting current visible edge budget. |
| 5000 sparse | 5000 | 6500 | Large global map with realistic sparse connectivity. |
| 5000 dense | 5000 | 60000 | Stress candidate, not default runner path. |
| 10000 aggregation | 10000 | 14000 | Target global browsing shape. |
| 10000 high-edge | 10000 | 90000 | Stress candidate for renderer trials, not required for every smoke run. |
| oversized-community | 3000 | 7000 | Tests one oversized community without pretending all cards can stay visible. |

The current DOM/SVG renderer visibly caps rendered edges at 1000 in the measured global view. That is useful evidence, but it is not a final large-graph solution.

## Browser Environment

Measured browser environment is available. Performance phases are not blocked.

- Runner command: `GRAPH_LARGE_PERF_ARTIFACT_DIR=/tmp/llm-wiki-graph-large-perf-task-1-3 bash tests/graph-browser-large-performance.regression-1.sh`
- Browser package path: resolved through `npx --yes -p playwright`.
- Executable path: local Playwright Chromium executable path.
- Local ports: not required for the offline generated graph runner. Workbench browser checks may still need local ports in later phases.
- Browser plugin fallback: allowed only for functional visual checks when scriptable checks fail; it cannot replace performance artifacts.

## Trial Dependency Path

No production dependency was added in Phase 1. Playwright was used through temporary `npx --yes -p playwright` resolution and local browser cache for measurement.

For Phase 6:

- Sigma/Graphology and vis-network may be installed only for isolated renderer trials when the current task requires them.
- Any package change must be recorded in the progress decision log before it lands.
- Production adoption remains blocked until the Phase 6 route decision.
- At most one production global graph route may survive. Aggregation-first may be a staged chosen route, but it must not become a second parallel global graph product.

## Oversized Community Semantics

For Phase 4 tests, "complete community presence" must not mean rendering every internal item as a full card at once. It may mean:

- A visible community container or outline.
- Representative core nodes as cards.
- Remaining members as points, count badges, or an internal list in the drawer.
- Search hits, selected objects, and pinned objects remain visible or explicitly represented.
- A clear action to drill into a bounded community reading surface.

The oversized-community fixture has 3000 nodes, 7000 edges, 15 communities, and one 1800-node community. Current DOM/SVG behavior exposes too many card-like nodes for this shape and recorded slow entry/return behavior in Phase 1.3.

## Desktop-App Compatibility Guardrails

Graph semantics must remain reusable if the product later moves into a desktop shell. Avoid binding product logic to browser-only assumptions:

- Do not store graph semantics only in DOM attributes. DOM attributes may mirror state for rendering/tests, but graph identity, selection, search, Pin, filter, and community rules belong in shared graph-engine data structures.
- Do not make `window`, `document`, `localStorage`, URL routing, or CSS selectors the source of truth for graph behavior.
- Keep file-system paths and workspace paths behind host adapters; shared graph semantics should use object ids, community ids, and wiki-relative ids.
- Renderer candidates may use Canvas/WebGL/browser APIs, but semantic contracts must stay independent enough to run behind a desktop webview or native shell bridge.
- Persisted Pin/layout state should stay serializable and portable, not tied to one browser storage implementation.

## Throwaway Code Policy

Phase 1 did not leave throwaway validation code in product paths. The generated graph runner became a deliberate test harness under `tests/browser/`; temporary graph HTML and JSON artifacts remain under `/tmp` and are not committed.
