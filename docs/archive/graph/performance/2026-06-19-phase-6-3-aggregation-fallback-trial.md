# Phase 6.3 Aggregation Fallback Trial

Date: 2026-06-19
Branch: `codex/large-graph-performance-experience`
Task: `6.3`
Renderer: no-new-dependency aggregation fallback trial

## Scope

This report evaluates the no-new-dependency fallback route using the current graph-engine budget and aggregation semantics. It does not switch the production workbench graph path.

The trial renders lightweight global points, capped skeleton edges, capped labels, aggregation containers, and a lightweight drawer. It intentionally does not render global cards. This tests whether the current stack can provide a fast structural overview without pretending it is a full 10000+ detailed renderer.

## Commands

- `git log --oneline -15`
- `npm run test --workspace=@llm-wiki/graph-engine`
- `node --import tsx --check tests/browser/graph-aggregation-fallback-trial.ts`
- `node --import tsx --test packages/graph-engine/test/aggregation-fallback-trial-adapter.test.ts`
- `GRAPH_AGGREGATION_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-graph-aggregation-trial-task-6-3 bash tests/graph-aggregation-fallback-trial.regression-1.sh`

## Artifacts

Machine-readable result:

- `/tmp/llm-wiki-graph-aggregation-trial-task-6-3/aggregation-fallback-trial-results.json`

The artifact contains 47 fixed-schema records across 5 graph shapes.

## Post-Review Harness Hardening

The original result table below is now treated as a historical isolation baseline. After review, the aggregation fallback trial harness was hardened so a run fails when any action record fails, any failure class is present, any required action is missing, any requested shape is missing, or the wrapper only produced a JSON file without valid contents.

The default shape set was expanded from 5 shapes to the full 11-shape stress matrix: realistic proxy, 1000 sparse/dense, 5000 sparse/dense, 10000 aggregation/high-edge, oversized community, many small communities, many search hits, and many Pin nodes. Repeated interaction/memory cycles now run on every requested shape instead of only 1000-node shapes.

Interaction timing now waits for animation-frame completion after scripted actions. The aggregation fallback still uses internal `zoomBy` and `panBy` helpers for zoom and pan, so its zoom/pan numbers are useful for current-stack fallback pressure but are not directly equivalent to the real mouse-input measurements in the Sigma and vis-network trials.

## Result Table

| Shape | Nodes | Edges | DOM nodes | Visible nodes | Visible edges | Labels | Cards | Initial | Wheel | Search | Hidden interaction objects |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 1000 | 1400 | 2053 | 1000 | 1000 | 40 | 0 | pass (71.7 ms) | pass (60.2 FPS) | pass (12.0 ms) | 34 |
| nodes-1000-dense | 1000 | 12000 | 2053 | 1000 | 1000 | 40 | 0 | pass (66.1 ms) | pass (60.1 FPS) | pass (11.4 ms) | 34 |
| nodes-5000-sparse | 5000 | 6500 | 6103 | 5000 | 1000 | 40 | 0 | pass (136.4 ms) | pass (60.7 FPS) | pass (64.2 ms) | 4034 |
| nodes-10000-aggregation | 10000 | 14000 | 11153 | 10000 | 1000 | 40 | 0 | pass (185.9 ms) | pass (60.6 FPS) | pass (184.6 ms) | 9034 |
| oversized-community | 3000 | 7000 | 4068 | 3000 | 1000 | 40 | 0 | pass (92.2 ms) | pass (60.2 FPS) | pass (40.6 ms) | 2034 |

## Comparison To Renderer Candidates

| Shape | Sigma initial | vis-network initial | Aggregation initial | Sigma search | vis-network search | Aggregation search |
|---|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 146.2 ms | 117.6 ms | 71.7 ms | 9.4 ms | 28.0 ms | 12.0 ms |
| nodes-1000-dense | 116.7 ms | 215.2 ms | 66.1 ms | 11.5 ms | 40.8 ms | 11.4 ms |
| nodes-5000-sparse | 175.3 ms | 263.0 ms | 136.4 ms | 23.4 ms | 81.7 ms | 64.2 ms |
| nodes-10000-aggregation | 289.1 ms | 456.5 ms | 185.9 ms | 40.9 ms | 148.0 ms | 184.6 ms |
| oversized-community | 140.6 ms | 216.5 ms | 92.2 ms | 14.7 ms | 63.1 ms | 40.6 ms |

## Product Interpretation

Aggregation fallback is fast enough for a structural global overview. It keeps global cards at zero, caps labels at 40, caps visible edges at 1000, and preserves selected/search/Pin/container semantics through the shared adapter.

It is not equivalent to a full global renderer. At 10000 nodes it hides 9034 interaction-time objects and depends on the drawer/list layer to expose omitted detail. That is acceptable as a fallback or staged route, but not enough by itself for rich 10000+ exploration if the product wants direct large-map inspection with full relation density.

## Acceptance Evidence

- Historical shapes measured: 1000 sparse, 1000 dense, 5000 sparse, 10000 aggregation, and oversized-community.
- Hardened default shapes now include the full 11-shape stress matrix.
- Required actions are now enforced for every requested shape: initial render, pan, zoom, search highlight, point select, container select, drawer open, enter community, return global, and repeated memory cycle.
- Required fallback elements present: aggregation containers, skeleton edges, selected/search/Pin markers, and lightweight drawer overflow path.
- Behavior parity test passed: `node --import tsx --test packages/graph-engine/test/aggregation-fallback-trial-adapter.test.ts`.
- No new dependency was added for this task.
- No production workbench renderer path was switched.
