# Phase 0.2 Existing Graph Baseline

Date: 2026-06-18
Branch: `codex/large-graph-performance-experience`
Task: `0.2`

## Scope

This report captures the current graph behavior and performance baseline before changing graph behavior for the large-graph performance plan.

## Verification

| Check | Result | Evidence |
|---|---:|---|
| Graph engine test | Pass | `npm run test --workspace=@llm-wiki/graph-engine`: 274 tests, 58 suites, 0 failures |
| Graph engine typecheck | Pass | `npm run typecheck --workspace=@llm-wiki/graph-engine` |
| Graph engine build | Pass | `npm run build --workspace=@llm-wiki/graph-engine` |
| Workbench web test | Pass | `npm run test --workspace=@llm-wiki-agent/web`: 29 tests, 12 suites, 0 failures |
| Workbench web typecheck | Pass | `npm run typecheck --workspace=@llm-wiki-agent/web` |
| Stage 4.5 offline browser regression | Pass | `GRAPH_STAGE_4_5_CHROME_EXECUTABLE=<Playwright Chromium> bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` |

## Browser Artifact

Dense wheel artifact:

- JSON: `docs/graph/performance/artifacts/2026-06-18-phase-0-2/stage-4.5-offline-dense-wheel.json`
- Screenshot: `docs/graph/performance/artifacts/2026-06-18-phase-0-2/stage-4.5-offline-dense-wheel.png`
- Navigation screenshot: `docs/graph/performance/artifacts/2026-06-18-phase-0-2/stage-4.5-offline-navigation.png`

Recorded sample:

| Viewport | Duration | Frames | Idle FPS | Wheel FPS | Minimum FPS | Transform changed |
|---|---:|---:|---:|---:|---:|---|
| 1440x960 | 3004 ms | 157 | 13.6 | 52.3 | 12.0 | true |

Important limitation: the current dense fixture has 200 nodes and 231 edges. This is useful as a regression baseline, but it does not prove 1000, 5000, or 10000 node smoothness.

## Current Rendering Behavior

- The current graph renderer is DOM/SVG.
- Nodes are DOM `button` elements in a node layer.
- Edges are SVG `path` elements in an edge layer.
- Community washes are SVG ellipses.
- Pan and zoom are applied through one content-layer transform.
- Motion frames update node positions, edge paths, community wash geometry, and minimap points.
- Search, type filters, community hover, node selection, reader state, and selection panels are all currently coupled to the same DOM/SVG renderer path.

## Current Interaction Semantics

The current behavior remains the pre-new-design behavior:

- Plain node click opens the reader-style node detail state.
- Shift-click builds a multi-node selection.
- Community legend click selects/focuses community nodes.
- Blank double-click fits the graph.
- Escape closes reader/selection state and clears graph highlights.
- Offline graph uses an in-graph reader panel; workbench graph opens the right drawer.

This is intentionally recorded as baseline behavior, not as the desired final interaction model.

## Baseline Bottleneck Class

The obvious large-graph risk is DOM/SVG update volume.

Reasons:

- Every visible node is a live DOM element.
- Every visible edge is a live SVG path.
- Rebuild/paint replaces the graph root and remounts controls.
- Motion frames recompute renderable graph state and update many DOM/SVG attributes.
- Hover, search, filter, community emphasis, and selection use DOM state/class updates across visible graph elements.

For small and medium scoped views, this is still appropriate. For 5000+ or 10000+ global views, the likely bottleneck is not one single function; it is the total cost of DOM node count, SVG path count, repeated attribute/class writes, and full repaint/remount paths.

## Test Harness Note

The first run of `tests/graph-browser-stage-4-5.regression-1.sh --target offline` exposed two harness issues:

- Playwright's normal click waited indefinitely for the offline theme button to become stable even though the button was visible, stationary, and not covered.
- The script's default system Chrome path failed in this environment during launch/cleanup. Installing Playwright Chromium and setting `GRAPH_STAGE_4_5_CHROME_EXECUTABLE` to the Playwright browser path produced a passing run.

The theme-button step was adjusted in the test harness to use forced click for this specific control. Product behavior was not changed.

## Next Baseline Gap

Phase 1 must add deterministic 1000, 5000, 10000, oversized-community, many-small-communities, many-search-hits, and many-Pin fixtures. Until those measurements exist, this report should be treated as the current small/dense-fixture baseline only.
