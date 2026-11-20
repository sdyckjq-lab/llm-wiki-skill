# Phase 1.3 DOM/SVG Large Graph Baseline

Date: 2026-06-18
Branch: `codex/large-graph-performance-experience`
Task: `1.3`
Renderer: current DOM/SVG

## Scope

This report summarizes the current DOM/SVG renderer against the generated large-graph performance fixtures. It does not choose the final renderer route. It turns the raw runner output into provisional thresholds for the next phases.

## Commands

- `git log --oneline -15`
- `npm run test --workspace=@llm-wiki/graph-engine`
- `GRAPH_LARGE_PERF_ARTIFACT_DIR=/tmp/llm-wiki-graph-large-perf-task-1-3 bash tests/graph-browser-large-performance.regression-1.sh`

## Artifact

Machine-readable result:

- `/tmp/llm-wiki-graph-large-perf-task-1-3/large-graph-performance-results.json`

The artifact contains 47 fixed-schema records across 5 graph shapes.

## Result Table

| Shape | Nodes | Edges | DOM nodes | Initial | Wheel | Pan | Hover | Search | Click | Drawer | Community | Return | Cycle |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 1000 | 1400 | 7249 | pass (900.4 ms) | pass (1016.8 ms, 60 FPS) | pass (130.5 ms) | pass (65.1 ms) | pass (189.2 ms) | pass (452.8 ms) | pass (857.1 ms) | pass (3122.9 ms) | pass (1389.1 ms) |
| nodes-1000-dense | 1000 | 12000 | 7249 | pass (1008.4 ms) | pass (1007.2 ms, 59.6 FPS) | pass (129.2 ms) | pass (57.2 ms) | pass (205.2 ms) | pass (519.8 ms) | pass (867.9 ms) | pass (3279.1 ms) | pass (1432 ms) |
| nodes-5000-sparse | 5000 | 6500 | 27399 | pass (4615.6 ms) | pass (1013.5 ms, 51.3 FPS) | pass (142.5 ms) | pass (145 ms) | pass (942.2 ms) | pass (2488.8 ms) | pass (5229.1 ms) | pass (4022.2 ms) | not run |
| nodes-10000-aggregation | 10000 | 14000 | 52649 | pass (8836 ms) | pass (1004.9 ms, 36.8 FPS) | fail:timeout (-) | pass (3784.6 ms) | fail:timeout (-) | pass (4390.7 ms) | pass (13895.1 ms) | pass (4387 ms) | not run |
| oversized-community | 3000 | 7000 | 17224 | pass (15788.6 ms) | pass (1005 ms, 12.9 FPS) | pass (247 ms) | pass (131.5 ms) | pass (3342.5 ms) | pass (8498.3 ms) | pass (27055.3 ms) | pass (9611.6 ms) | not run |


## Recorded Failures

- nodes-10000-aggregation / pan: timeout
- nodes-10000-aggregation / node_click: timeout

## Bottleneck Class

The primary bottleneck class is DOM/SVG update volume. The evidence is structural and measured:

- 1000-node global view creates about 7,249 DOM nodes and remains mostly responsive.
- 5000-node global view creates about 27,399 DOM nodes; it still completes the key actions, but initial render and community entry move into multi-second territory.
- 10000-node global view creates about 52,649 DOM nodes. In this run, pan and node click timed out, while drawer open and community entry were already multi-second actions in the prior 1.2 run.
- Oversized community keeps 3000 nodes present and creates about 17,224 DOM nodes; community entry exposes 1800 nodes, which is too large for a card-heavy reading surface.

Secondary bottlenecks are interaction-state churn and community focus expansion. Search itself is still comparatively cheap, but click-to-reader, drawer open, enter-community, and return-global become slow because they update many DOM/SVG elements and remount or restyle large visible sets.

## Provisional Thresholds

These thresholds are intentionally provisional. They are gates for Phase 4/6 comparison, not final product promises.

| Metric | Provisional pass threshold | Notes |
|---|---:|---|
| Initial render, 1000 nodes | <= 1500 ms | Current 1000 sparse/dense passed. |
| Initial render, 5000 nodes | <= 5000 ms | Current 5000 sparse passed but is close enough to watch. |
| Initial render, 10000 nodes | <= 8000 ms | Current 10000 exceeded this; global path needs degradation or another renderer. |
| Wheel zoom | >= 30 FPS and p95 <= 35 ms | 1000 and 5000 passed; low FPS is a failure class. |
| Pan | <= 300 ms or explicit failure class | 10000 timed out in this run. |
| Hover | <= 500 ms | All measured shapes passed here. |
| Search highlight | <= 500 ms | Current search is not the first bottleneck. |
| Node click | <= 800 ms for 1000, <= 1500 ms for 5000, <= 2000 ms for 10000 | 10000 timed out in this run. |
| Drawer open | <= 1000 ms for 1000, <= 2500 ms for 5000, <= 3000 ms for 10000 | Prior 1.2 result showed 10000 drawer open can reach 7600 ms. |
| Enter community | <= 1500 ms for normal community, <= 3000 ms for large/oversized community | 10000 and oversized community exceed the target. |
| Return global | <= 3500 ms for 1000, <= 5000 ms for 5000, <= 5000 ms for 10000 | Current 1000 is already near the limit. |
| Repeated cycle memory growth | <= 10 MB for 1000-node cycle | Current 1000 cycle showed no growth in available memory field. |

## Interpretation

The current renderer is acceptable for small graph and community reading, but it is not a proven 10000+ global renderer. The next implementation phases should keep DOM/SVG for community/detail views while treating 5000/10000 global browsing as requiring budget enforcement, aggregation, or a different global rendering route.

## Phase 4.1 Render Budgets

These budgets are the first shared graph-layer caps derived from the DOM/SVG bottleneck class above. They are not the final large-graph renderer decision; they prevent the current renderer from producing card-heavy or edge-heavy global output while Phase 6 evaluates the global route.

| View | Max visible nodes | Max visible edges | Max labels | Max full cards | Max interaction-time updates |
|---|---:|---:|---:|---:|---:|
| Global | 10000 | 1000 | 40 | 0 | 1200 |
| Community focus | 2500 | 1500 | 120 | 60 | 1800 |

Overflow is reported by the shared render model for nodes, edges, labels, cards, and interaction updates so drawer/list states can expose omitted detail without forcing it onto the canvas. Selection, search results, and Pin hints may promote priority, but they do not raise these caps.
