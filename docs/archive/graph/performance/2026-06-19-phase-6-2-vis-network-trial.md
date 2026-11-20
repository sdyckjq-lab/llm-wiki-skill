# Phase 6.2 vis-network Canvas Trial

Date: 2026-06-19
Branch: `codex/large-graph-performance-experience`
Task: `6.2`
Renderer: isolated vis-network Canvas trial

## Scope

This report evaluates vis-network as the Canvas comparison candidate. It does not switch the production workbench graph path. Current DOM/SVG remains the rich small-graph and community-reading path until the Phase 6.4 route decision.

The trial uses the same graph shapes and interaction actions as the Sigma/Graphology trial. It also uses a shared graph-engine adapter contract so object ids, community ids, search hits, Pin hints, selected objects, and aggregation markers remain portable.

## Commands

- `git log --oneline -15`
- `npm run test --workspace=@llm-wiki/graph-engine`
- `npm install -w @llm-wiki/graph-engine -D vis-network`
- `node --import tsx --check tests/browser/graph-vis-network-trial.ts`
- `node --import tsx --test packages/graph-engine/test/vis-network-trial-adapter.test.ts`
- `GRAPH_VIS_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-graph-vis-trial-task-6-2 bash tests/graph-vis-network-trial.regression-1.sh`

## Artifacts

Machine-readable result:

- `/tmp/llm-wiki-graph-vis-trial-task-6-2/vis-network-trial-results.json`

The artifact contains 47 fixed-schema records across 5 graph shapes.

## Post-Review Harness Hardening

The original result table below is now treated as a historical isolation baseline. After review, the vis-network trial harness was hardened so a run fails when any action record fails, any failure class is present, any required action is missing, any requested shape is missing, or the wrapper only produced a JSON file without valid contents.

The default shape set was expanded from 5 shapes to the full 11-shape stress matrix: realistic proxy, 1000 sparse/dense, 5000 sparse/dense, 10000 aggregation/high-edge, oversized community, many small communities, many search hits, and many Pin nodes. Repeated interaction/memory cycles now run on every requested shape instead of only 1000-node shapes.

Interaction timing now waits for visible render completion after scripted actions. vis-network uses `afterDrawing` completion checks for render-affecting actions; the earlier timeout-based ready fallback was removed so a page cannot be marked ready without a completed draw. A hardened rerun is required before using these numbers as final production-integration evidence.

## Result Table

| Shape | Nodes | Edges | DOM nodes | Initial | Wheel | Pan | Search | Point | Container | Drawer | Community | Return | Cycle |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 1000 | 1400 | 20 | pass (117.6 ms) | pass (60.4 FPS) | pass (266.4 ms) | pass (28.0 ms) | pass (18.1 ms) | pass (9.3 ms) | pass (0.6 ms) | pass (7.3 ms) | pass (2.4 ms) | pass (0 MB growth) |
| nodes-1000-dense | 1000 | 12000 | 20 | pass (215.2 ms) | pass (60.4 FPS) | pass (292.0 ms) | pass (40.8 ms) | pass (49.4 ms) | pass (24.7 ms) | pass (0.6 ms) | pass (24.5 ms) | pass (8.4 ms) | pass (0 MB growth) |
| nodes-5000-sparse | 5000 | 6500 | 20 | pass (263.0 ms) | pass (60.2 FPS) | pass (274.3 ms) | pass (81.7 ms) | pass (66.3 ms) | pass (33.3 ms) | pass (0.4 ms) | pass (32.5 ms) | pass (9.8 ms) | not run |
| nodes-10000-aggregation | 10000 | 14000 | 20 | pass (456.5 ms) | pass (60.9 FPS) | pass (331.6 ms) | pass (148.0 ms) | pass (138.3 ms) | pass (91.0 ms) | pass (5.2 ms) | pass (94.6 ms) | pass (19.3 ms) | not run |
| oversized-community | 3000 | 7000 | 20 | pass (216.5 ms) | pass (60.5 FPS) | pass (270.5 ms) | pass (63.1 ms) | pass (46.4 ms) | pass (27.1 ms) | pass (0.5 ms) | pass (25.8 ms) | pass (7.0 ms) | not run |

## Comparison To Sigma And DOM/SVG

| Shape | DOM/SVG initial | Sigma initial | vis-network initial | Sigma search | vis-network search | Sigma point | vis-network point |
|---|---:|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 900.4 ms | 146.2 ms | 117.6 ms | 9.4 ms | 28.0 ms | 2.9 ms | 18.1 ms |
| nodes-1000-dense | 1008.4 ms | 116.7 ms | 215.2 ms | 11.5 ms | 40.8 ms | 8.3 ms | 49.4 ms |
| nodes-5000-sparse | 4615.6 ms | 175.3 ms | 263.0 ms | 23.4 ms | 81.7 ms | 13.0 ms | 66.3 ms |
| nodes-10000-aggregation | 8836.0 ms | 289.1 ms | 456.5 ms | 40.9 ms | 148.0 ms | 14.6 ms | 138.3 ms |
| oversized-community | 15788.6 ms | 140.6 ms | 216.5 ms | 14.7 ms | 63.1 ms | 6.9 ms | 46.4 ms |

Both candidate renderers remove the current DOM/SVG bottleneck class for global browsing. vis-network keeps wheel zoom near 60 FPS on all required shapes, but it is slower than Sigma/Graphology for search, point selection, and container/community updates in this isolated harness.

## Integration Risks

- vis-network owns more of the interaction and selection model by default. The trial disables physics and routes selection through explicit shared commands to avoid fighting llm-wiki drawer/community/search semantics.
- Layout ownership can become opaque if production integration enables vis-network physics or stabilization. Pin and fixed-position behavior should remain owned by graph-engine, not by vis-network runtime state.
- The Canvas route depends on DataSet mutation patterns. Search and selection are still acceptable in this trial, but they scale worse than the Sigma candidate on the same data.
- Desktop packaging is plausible because the semantic layer remains outside the renderer, but production integration would need a strict adapter boundary to prevent product logic from moving into vis-network callbacks.

## Interpretation

vis-network is a viable Canvas comparison candidate, but this trial does not currently beat Sigma/Graphology on the important semantic-update actions. It remains in the Phase 6 comparison set until the aggregation fallback and final route decision are recorded.

## Acceptance Evidence

- Historical shapes measured: 1000 sparse, 1000 dense, 5000 sparse, 10000 aggregation, and oversized-community.
- Hardened default shapes now include the full 11-shape stress matrix.
- Required actions are now enforced for every requested shape: initial render, pan, zoom, search highlight, point select, container select, drawer open, enter community, return global, and repeated memory cycle.
- Behavior parity test passed: `node --import tsx --test packages/graph-engine/test/vis-network-trial-adapter.test.ts`.
- No production workbench renderer path was switched.
