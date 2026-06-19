# Sigma Global Renderer Production Integration Result

Date: 2026-06-19
Branch: `codex/sigma-global-renderer-integration`
Plan: `docs/plans/2026-06-19-sigma-global-renderer-integration-phased-plan.md`

## Result

Sigma/Graphology is now the production global graph renderer route for the graph-engine facade.

The final route boundary is:

- Global route: Sigma/Graphology through `sigma-global`.
- Community reading and rich detail route: DOM/SVG through `dom-svg-community`.
- Small abnormal fallback: DOM/SVG through `dom-svg-small-fallback`, only after Sigma is unavailable and the graph is below the safety threshold.
- Large abnormal fallback: aggregation safety view through `aggregation-safety-fallback`.

There is no user-visible old/new renderer switch. The old DOM/SVG global path is not a normal global main path.

## Phase 0 Gate

The implementation started only after the plan review gate cleared:

- The plan review report ended with `NO UNRESOLVED DECISIONS`.
- The implementation branch was `codex/sigma-global-renderer-integration`.
- Baseline graph-engine tests passed before production renderer work started.

## Production Evidence

The strongest production-path artifact so far is:

- `/tmp/llm-wiki-sigma-global-production-task-6-2/sigma-global-production-results.json`

Summary:

- Renderer: `sigma-global-production`.
- Production path: `true`.
- Browser: `148.0.7778.96`.
- Build commit recorded in artifact: `d2e857f`.
- Shapes: 11.
- Records: 110.
- Failed records: 0.
- Artifact schema: `1.0.0`.
- Required schema, thresholds, browser, build, run timestamp, loading-state, and production-path fields are present on every record.

Covered shapes:

- `real-snapshot-proxy`
- `nodes-1000-sparse`
- `nodes-1000-dense`
- `nodes-5000-sparse`
- `nodes-5000-dense`
- `nodes-10000-aggregation`
- `nodes-10000-high-edge`
- `oversized-community`
- `many-small-communities`
- `many-search-hits`
- `many-pin-nodes`

## Hard Gate Summary

| Gate | Production result |
|---|---:|
| Failed records | 0 |
| Wheel FPS floor | min 60.2, required >= 45 |
| Drag FPS floor | min 60.3, required >= 45 |
| Wheel frame p95 | max 17.6 ms, required <= 22.3 ms |
| Drag frame p95 | max 17.6 ms, required <= 22.3 ms |
| Initial render duration | max 0.2 ms, threshold recorded per action |
| Search duration | max 37.7 ms, threshold recorded per action |
| Drawer duration | max 82.0 ms, threshold recorded per action |
| Return global duration | max 70.5 ms, threshold recorded per action |
| Repeated-cycle memory growth | max 6.4 MB, threshold recorded per action |
| Loading state | `sigma-global-ready` on global records |

`enter_community` intentionally moves through the community route, so its loading-state set includes the non-global transition state as well as `sigma-global-ready`. Return-global records prove the production route returns to Sigma successfully.

## Route And Fallback Boundary

The facade owns renderer route switching. Workbench and offline callers continue to use `createGraphEngine` and do not receive a renderer selector.

Fallback policy:

- If Sigma is available, global graph browsing uses Sigma.
- If Sigma is unavailable for a small graph, DOM/SVG is allowed only as the emergency small fallback.
- If Sigma is unavailable for a graph above 2000 nodes, 4000 edges, or 500 nodes in one community, the route uses aggregation safety fallback instead of DOM/SVG.
- The aggregation safety view is a minimum usable failure state, not a second global graph product.

## Historical Context

Earlier comparison documents remain valid as historical evidence:

- `2026-06-19-phase-6-1-sigma-graphology-trial.md` measured the isolated Sigma candidate.
- `2026-06-19-phase-6-2-vis-network-trial.md` measured vis-network as a rejected comparison route.
- `2026-06-19-phase-6-3-aggregation-fallback-trial.md` measured aggregation as a fallback strategy.
- `2026-06-19-phase-6-4-global-renderer-route-decision.md` selected Sigma/Graphology as the route to integrate.

Those documents should not be read as current production state. This document records the production integration result.

## Residual Risk

This result is proven on the local Chromium/Playwright environment and recorded artifacts. Task 7.3 must still rerun the full final acceptance list and produce the final production-path artifact for plan closure.
