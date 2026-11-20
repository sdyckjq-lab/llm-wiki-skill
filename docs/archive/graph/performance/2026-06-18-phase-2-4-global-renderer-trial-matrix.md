# Phase 2.4 Global Renderer Trial Matrix

Date: 2026-06-18
Branch: `codex/large-graph-performance-experience`
Task: `2.4`

## Purpose

This note defines the trial boundary before any global large-graph renderer candidate is installed, measured, or wired into the product. The project will compare WebGL, Canvas, and no-new-dependency aggregation with the same data, semantics, graph shapes, and performance records. It will ship at most one production global graph route.

Current DOM/SVG remains the known route for small graphs, community reading, offline detail, and UI-rich cards. It is not assumed to be the final 10000+ global route.

## Non-Negotiable Route Rule

Only one production global large-graph route may survive the decision phase.

- Candidate trials may coexist only in isolated harness code and measurement artifacts.
- The workbench must not expose multiple global graph experiences as parallel product modes.
- Aggregation-first may be selected as a staged production route if it wins the decision, but it must not become a permanent second route next to a WebGL or Canvas global renderer.
- DOM/SVG can remain for community/detail surfaces even if a different route wins for the global map.

## Shared Trial Inputs

Every candidate must consume the Phase 2 shared renderer adapter contract before product-specific behavior is evaluated.

Required semantic inputs:

- Object ids: node id, community id, aggregation id.
- State: selected object, search hits, Pin hints, focused community, filters.
- Aggregation metadata: contained node ids, selected internal node ids, search-hit ids, pinned ids, total count.
- Drawer targets: node summary, community summary, excluded aggregation object.
- Commands: enter community, show object, clear temporary object, open detail/read, set fixed position.

Required graph shapes:

| Shape | Nodes | Edge cap | Required in Phase 6? | Purpose |
|---|---:|---:|---|---|
| real-snapshot-proxy | 1000 | 1600 | yes | Proxy for a realistic medium wiki graph. |
| nodes-1000-sparse | 1000 | 1400 | yes | Baseline interaction and correctness. |
| nodes-1000-dense | 1000 | 12000 | yes | Dense local relation pressure. |
| nodes-5000-sparse | 5000 | 6500 | yes | First large global target. |
| nodes-5000-dense | 5000 | 60000 | yes | Edge-heavy 5000-node pressure. |
| nodes-10000-aggregation | 10000 | 14000 | yes | Primary 10000+ global target. |
| nodes-10000-high-edge | 10000 | 90000 | yes | Extreme edge pressure for the renderer decision. |
| oversized-community | 3000 | 7000 | yes | One huge community without full-card rendering. |
| many-small-communities | 5000 | 6000 | yes | Many tiny communities and legend/container pressure. |
| many-search-hits | 5000 | 7000 | yes | Search highlight pressure. |
| many-pin-nodes | 5000 | 7000 | yes | Pin/selected preservation pressure. |

## Candidate Matrix

| Candidate | Technology | Trial role | Strength to prove | Main rejection reasons | Dependency status |
|---|---|---|---|---|---|
| Sigma/Graphology | WebGL + graph model | First global renderer candidate | 5000/10000 point map remains smooth while preserving llm-wiki selection/search/Pin/drawer semantics | Semantic contract cannot be preserved, desktop webview risk is too high, memory grows across cycles, integration forces a second product logic path, performance does not beat aggregation enough | Requires explicit trial dependency approval before package changes. |
| vis-network | Canvas | Strong comparison candidate | Canvas path handles large global interactions with less integration cost than WebGL | Built-in interaction model fights llm-wiki drawer/community/search semantics, layout ownership becomes opaque, Pin/fixed-position behavior is unstable, performance or memory falls below WebGL/aggregation | Requires explicit trial dependency approval before package changes. |
| Aggregation fallback | Current stack, no new dependency | No-new-dependency fallback or staged route | 10000+ global map is useful by showing communities, skeleton edges, selected/search/Pin markers, and overflow lists without full node detail | Users lose too much spatial context, search/Pin/selected objects are not discoverable, container interactions feel like a separate product, oversized communities remain slow | No dependency approval required. |

## Required Metrics

Every measured candidate must produce fixed-schema artifacts comparable to the Phase 1 DOM/SVG baseline.

Required action records:

- initial render
- wheel zoom FPS and p95 frame time
- pan
- hover or nearest-object inspect
- search highlight
- point select
- container select
- drawer open
- enter community
- return global
- repeated cycle memory growth for every required shape

Required metadata fields:

- renderer id
- candidate version and package versions, if any
- graph shape
- node count
- edge count
- community count
- largest community size
- search hit count
- Pin count
- visible object count
- browser environment
- artifact path
- pass/fail
- failure class and detail

## Provisional Acceptance Table

These thresholds are comparison gates, not final product promises.

| Metric | 1000 nodes | 5000 nodes | 10000 nodes | Notes |
|---|---:|---:|---:|---|
| Initial render | <= 1500 ms | <= 5000 ms | <= 8000 ms | Current DOM/SVG exceeded the 10000 target. |
| Wheel zoom | >= 30 FPS | >= 30 FPS | >= 30 FPS | Lower result must record `fps_below_floor`. |
| Pan | <= 300 ms | <= 500 ms | <= 800 ms | Timeout is a blocking failure for a candidate route. |
| Search highlight | <= 500 ms | <= 800 ms | <= 1200 ms | Search must update highlight/markers without full graph relayout. |
| Point select | <= 800 ms | <= 1500 ms | <= 2000 ms | Must open lightweight summary target, not full reading by default. |
| Container select | <= 1000 ms | <= 2000 ms | <= 2500 ms | Community/aggregation selection must keep global context. |
| Drawer open | <= 1000 ms | <= 2500 ms | <= 3000 ms | Long content rendering is not part of global lightweight drawer. |
| Return global | <= 3500 ms | <= 5000 ms | <= 5000 ms | Route must not rebuild unnecessary detail. |
| Repeated cycle memory growth | <= 50 MB | <= 75 MB | <= 100 MB | If the browser cannot expose memory, record that explicitly instead of silently passing. |

## Browser Verification Boundary

Scripted browser trials remain the route-decision evidence because they generate repeatable JSON artifacts across all graph shapes and actions.

The Codex Browser plugin is an approved fallback for human-like visual and interaction checks when a local Playwright package or Chrome path is unavailable. It can validate that a page opens, visible graph controls respond, and the lightweight drawer flow matches user expectations. It must not replace the fixed-schema performance artifacts for renderer selection, because route decisions need comparable records across WebGL, Canvas, and aggregation fallback candidates.

## Desktop-App Compatibility Checks

The later desktop app direction means a candidate cannot win by hiding product logic in browser-only surfaces.

Required checks:

- Graph meaning remains in graph-engine data, not DOM attributes or renderer internals.
- Host integration can be driven by ids, serializable state, and commands.
- Pin/layout state remains portable and wiki-relative.
- Candidate-specific event handling does not own product decisions such as open detail, enter community, or selected object policy.
- The route can run inside a desktop webview or be wrapped behind a native shell bridge without rewriting graph semantics.

## Trial Harness Boundary

Allowed in Phase 6:

- Isolated candidate harness modules.
- Temporary renderer pages or browser fixtures under `tests/browser/`.
- Measurement reports under `docs/graph/performance/`.
- Trial dependencies after explicit approval is recorded.

Not allowed before the route decision:

- Switching the workbench production global view to a candidate renderer.
- Adding a production dependency for the final app route.
- Leaving multiple candidate renderers active as user-facing modes.
- Recomputing graph product semantics inside candidate-specific code.

## Dependency Approval Record Needed

If Phase 6 needs trial packages, the progress decision log must record exact approval before package changes land.

Expected approval entry format:

```text
Task 6.x dependency approval: install <package names and versions> only for isolated renderer trial harness; no production adoption until Phase 6.4 route decision.
```

Expected package classes:

- Sigma/Graphology trial: `sigma`, `graphology`, and any narrowly required layout/helper package.
- vis-network trial: `vis-network` or the maintained package name selected at trial time.
- Aggregation fallback: no package expected.

## Decision Output

Phase 6.4 must produce one of these outcomes:

- Integrate Sigma/Graphology as the single global large-graph route in a future implementation plan.
- Integrate vis-network as the single global large-graph route in a future implementation plan.
- Ship aggregation-first as the single staged global route, with explicit limits and follow-up research.
- Reject all candidates and continue renderer research with recorded failure reasons.

The decision report must include accepted route, rejected alternatives, evidence artifact paths, unresolved risks, and whether community/detail DOM/SVG remains unchanged.
