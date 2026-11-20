# Phase 6.1 Sigma/Graphology WebGL Trial

Date: 2026-06-19
Branch: `codex/large-graph-performance-experience`
Task: `6.1`
Renderer: isolated Sigma/Graphology WebGL trial

## Scope

This report evaluates Sigma/Graphology as the first global large-graph renderer candidate. It does not switch the production workbench graph path. Current DOM/SVG remains the rich small-graph and community-reading path until the Phase 6.4 route decision.

The trial uses the shared graph adapter contract so object ids, community ids, search hits, Pin hints, selected objects, and aggregation markers remain portable across later browser or desktop shells.

## Commands

- `git log --oneline -15`
- `npm run test --workspace=@llm-wiki/graph-engine`
- `npm install -w @llm-wiki/graph-engine -D sigma@3.0.3 graphology@0.26.0`
- `node --import tsx --check tests/browser/graph-sigma-graphology-trial.ts`
- `node --import tsx --test packages/graph-engine/test/sigma-trial-adapter.test.ts`
- `GRAPH_SIGMA_TRIAL_ARTIFACT_DIR=/tmp/llm-wiki-graph-sigma-trial-task-6-1 bash tests/graph-sigma-graphology-trial.regression-1.sh`

## Artifacts

Machine-readable result:

- `/tmp/llm-wiki-graph-sigma-trial-task-6-1/sigma-graphology-trial-results.json`

The artifact contains 47 fixed-schema records across 5 graph shapes.

## Post-Review Harness Hardening

The original result table below is now treated as a historical isolation baseline. After review, the Sigma trial harness was hardened so a run fails when any action record fails, any failure class is present, any required action is missing, any requested shape is missing, or the wrapper only produced a JSON file without valid contents.

The default shape set was expanded from 5 shapes to the full 11-shape stress matrix: realistic proxy, 1000 sparse/dense, 5000 sparse/dense, 10000 aggregation/high-edge, oversized community, many small communities, many search hits, and many Pin nodes. Repeated interaction/memory cycles now run on every requested shape instead of only 1000-node shapes.

Interaction timing now waits for visible render completion after scripted actions. Sigma uses animation-frame completion checks after search, selection, drawer, community, and return-global actions. A hardened rerun is required before using these numbers as final production-integration evidence.

## Result Table

| Shape | Nodes | Edges | DOM nodes | Initial | Wheel | Pan | Search | Point | Container | Drawer | Community | Return | Cycle |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 1000 | 1400 | 18 | pass (146.2 ms) | pass (60.2 FPS) | pass (274.0 ms) | pass (9.4 ms) | pass (2.9 ms) | pass (4.5 ms) | pass (0.7 ms) | pass (7.6 ms) | pass (2.1 ms) | pass (0 MB growth) |
| nodes-1000-dense | 1000 | 12000 | 18 | pass (116.7 ms) | pass (60.6 FPS) | pass (268.1 ms) | pass (11.5 ms) | pass (8.3 ms) | pass (6.7 ms) | pass (0.5 ms) | pass (9.0 ms) | pass (7.1 ms) | pass (0 MB growth) |
| nodes-5000-sparse | 5000 | 6500 | 18 | pass (175.3 ms) | pass (60.5 FPS) | pass (269.3 ms) | pass (23.4 ms) | pass (13.0 ms) | pass (8.5 ms) | pass (0.6 ms) | pass (11.8 ms) | pass (12.0 ms) | not run |
| nodes-10000-aggregation | 10000 | 14000 | 18 | pass (289.1 ms) | pass (60.9 FPS) | pass (272.5 ms) | pass (40.9 ms) | pass (14.6 ms) | pass (18.5 ms) | pass (0.5 ms) | pass (19.0 ms) | pass (13.0 ms) | not run |
| oversized-community | 3000 | 7000 | 18 | pass (140.6 ms) | pass (60.7 FPS) | pass (268.2 ms) | pass (14.7 ms) | pass (6.9 ms) | pass (6.9 ms) | pass (0.5 ms) | pass (8.7 ms) | pass (6.0 ms) | not run |

## Comparison To Current DOM/SVG Baseline

| Shape | DOM/SVG initial | Sigma initial | DOM/SVG wheel | Sigma wheel | DOM/SVG notable failure |
|---|---:|---:|---:|---:|---|
| nodes-1000-sparse | 900.4 ms | 146.2 ms | 60.0 FPS | 60.2 FPS | none |
| nodes-1000-dense | 1008.4 ms | 116.7 ms | 59.6 FPS | 60.6 FPS | none |
| nodes-5000-sparse | 4615.6 ms | 175.3 ms | 51.3 FPS | 60.5 FPS | none |
| nodes-10000-aggregation | 8836.0 ms | 289.1 ms | 36.8 FPS | 60.9 FPS | pan and node click timeout |
| oversized-community | 15788.6 ms | 140.6 ms | 12.9 FPS | 60.7 FPS | near unusable wheel FPS |

## Interpretation

Sigma/Graphology is a strong candidate for the global browsing route. The trial keeps DOM output constant, handles 10000 nodes without the DOM/SVG timeout classes, and preserves the shared semantic contract.

This is still not the final route decision. Phase 6 must also compare vis-network Canvas and the no-new-dependency aggregation fallback before selecting one production global renderer path. The trial also uses a minimal drawer and simple visual update model; production integration still needs design-fit, input semantics, theming, accessibility, and desktop packaging checks.

## Acceptance Evidence

- Historical shapes measured: 1000 sparse, 1000 dense, 5000 sparse, 10000 aggregation, and oversized-community.
- Hardened default shapes now include the full 11-shape stress matrix.
- Required actions are now enforced for every requested shape: initial render, pan, zoom, search highlight, point select, container select, drawer open, enter community, return global, and repeated memory cycle.
- Behavior parity test passed: `node --import tsx --test packages/graph-engine/test/sigma-trial-adapter.test.ts`.
- No production workbench renderer path was switched.
