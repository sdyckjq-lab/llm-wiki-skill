# Phase 6.4 Global Renderer Route Decision

Date: 2026-06-19
Branch: `codex/large-graph-performance-experience`
Task: `6.4`

## Decision

Select Sigma/Graphology WebGL as the future single global large-graph renderer integration route.

This task records the route decision only. It does not switch the production workbench renderer, add a production renderer path, or remove the current DOM/SVG renderer. Current DOM/SVG remains the rich small-graph and community-reading path.

Post-review status: this remains the current route preference, not a final production integration proof. The original Phase 6 tables were produced by the first isolated harness. The hardened harness now requires the full 11-shape matrix, complete action coverage, failed-record detection, large-shape repeated cycles, and render-completion waits. The next production integration plan must rerun the hardened trials before treating the Sigma choice as locked.

## Why Sigma/Graphology Wins

Sigma/Graphology is the best fit for the product goal: smooth 5000+ / 10000+ global browsing while preserving llm-wiki graph semantics outside the renderer.

Measured evidence:

| Shape | Sigma initial | Sigma wheel | Sigma search | Sigma point select | Sigma container select |
|---|---:|---:|---:|---:|---:|
| nodes-1000-sparse | 146.2 ms | 60.2 FPS | 9.4 ms | 2.9 ms | 4.5 ms |
| nodes-1000-dense | 116.7 ms | 60.6 FPS | 11.5 ms | 8.3 ms | 6.7 ms |
| nodes-5000-sparse | 175.3 ms | 60.5 FPS | 23.4 ms | 13.0 ms | 8.5 ms |
| nodes-10000-aggregation | 289.1 ms | 60.9 FPS | 40.9 ms | 14.6 ms | 18.5 ms |
| oversized-community | 140.6 ms | 60.7 FPS | 14.7 ms | 6.9 ms | 6.9 ms |

The historical trial also kept DOM output constant at 18 nodes, passed behavior parity for object ids, community ids, search hits, Pin hints, selected objects, and aggregation markers, and did not switch the production renderer path.

## Rejected Alternatives

### vis-network Canvas

vis-network is viable, but it is not the chosen route.

Reasons:

- It was slower than Sigma/Graphology on semantic updates that matter to llm-wiki: search, point select, and container/community updates.
- On the 10000-node shape, vis-network search took 148.0 ms versus Sigma/Graphology at 40.9 ms.
- On the 10000-node shape, vis-network point select took 138.3 ms versus Sigma/Graphology at 14.6 ms.
- vis-network owns more built-in selection, physics, stabilization, and interaction behavior. That creates higher risk that product semantics drift into renderer callbacks instead of staying in `packages/graph-engine/`.

vis-network remains a measured fallback candidate if a future Sigma integration hits a hard blocker, but it should not be integrated in parallel.

### Aggregation-Only Fallback

Aggregation-only is not enough to become the full global large-graph route.

Reasons:

- It is very fast for a structural overview, including 185.9 ms initial render and 60.6 FPS wheel zoom on the 10000-node shape.
- It intentionally caps visible edges at 1000, labels at 40, cards at 0, and hides thousands of interaction-time objects at large sizes.
- On the 10000-node shape it hid 9034 interaction-time objects, so it depends on drawer/list overflow to expose omitted detail.

Aggregation remains a required degradation strategy inside the future global route: keep global cards at zero, cap labels and edges, preserve selected/search/Pin objects, and use drawer overflow for omitted detail. It must not become a second permanent global graph product beside Sigma/Graphology.

### Current DOM/SVG As Global Renderer

Current DOM/SVG is rejected as the final 5000+ / 10000+ global renderer.

Reasons:

- The Phase 1 baseline showed 10000-node initial render at 8836.0 ms, wheel zoom at 36.8 FPS, and pan/node-click timeout classes.
- Oversized-community DOM/SVG wheel zoom was 12.9 FPS.
- DOM/SVG remains appropriate for small graphs, scoped community reading, offline detail, and UI-rich card surfaces.

## Integration Boundary For The Next Plan

The next implementation plan should integrate Sigma/Graphology only for global large-graph browsing, behind the shared renderer adapter boundary.

Required boundaries:

- `packages/graph-engine/` remains the owner of object ids, community ids, search, filters, Pin, selection, aggregation, budgets, and drawer command semantics.
- Sigma/Graphology owns only global drawing, viewport interaction, and renderer-level hit projection through a shared adapter.
- Workbench receives the same lightweight node summary, community summary, open-detail, enter-community, return-global, and unavailable/excluded payloads it receives today.
- Community reading continues to use the current DOM/SVG rich path unless a later plan proves a different scoped renderer.
- Desktop compatibility remains a guardrail: renderer integration may use browser/WebGL APIs internally, but graph semantics must stay serializable and portable across a desktop webview or shell bridge.
- Aggregation budgets remain active in the global route so 10000+ views do not reintroduce full-card or unlimited-edge rendering.

## Next Plan Direction

The next plan should integrate Sigma/Graphology as the single production global renderer route only after a hardened rerun confirms the full 11-shape matrix. DOM/SVG should remain the community-reading renderer.

It should not integrate vis-network or ship a separate aggregation-only global product in parallel. If Sigma/Graphology integration fails on a hard blocker, the plan should stop and record the blocker before considering vis-network or aggregation-first as a replacement route.

## Acceptance Evidence

- Sigma/Graphology historically measured the first 5 graph shapes with 47 fixed-schema records and 0 errors.
- vis-network historically measured the same first 5 shapes and was rejected with semantic update and ownership-risk evidence.
- Aggregation fallback historically measured the same first 5 shapes and was retained only as degradation strategy and fallback evidence, not as a full global renderer.
- Post-review harness now requires the full 11-shape matrix and blocks failed records instead of accepting result-file existence.
- No production renderer path was added or switched.
- No unapproved production dependency was adopted by this task.
