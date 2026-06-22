# Graph Experience Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. This branch ships in two phases inside the same branch.

**Goal:** Make the graph feel like one product again. Phase 1 removes the visible split between Sigma global and old DOM global. Phase 2 improves the map feeling after the split is gone.

**Branch:** `codex/graph-experience-completion-spec`

**Source spec:** `docs/spark/2026-06-21-graph-experience-completion-design.md`

**Accepted scope:** `<= 2000` nodes. Do not build node aggregation, `+N` folded-node prompts, aggregation smoothing, or a 10000-node product in this plan.

## Current Phase Status

- **Phase 1:** completed and sealed on 2026-06-21 at commit `51a2eca` (`fix: unify graph global return path`).
- **Phase 1 baseline:** this commit is the rollback point before Phase 2. Do not rewrite or amend it; put any follow-up fixes in later commits.
- **Phase 2:** completed on 2026-06-22. Implementation and verification are recorded in the Phase 2 closure record below.

## Phase Strategy

Use one branch, two implementation and verification phases.

```text
Phase 1: stop the product split
  every community return-to-global entry -> facade route -> Sigma global
  remove duplicate circular community controls
  add passive map-style community labels
  guard >2000 nodes before any global renderer path
  verify original bug with scripted browser regression

Phase 2: make the map feel continuous
  tune crowded point/line/label density
  improve global/community transition continuity
  tighten DOM small fallback rule parity
  verify pin/search/selection stability across route changes
```

Phase 1 must stand alone: after Phase 1, users should no longer see two normal full-graph modes.

Phase 2 must not reopen the old DOM global path or introduce aggregation.

## Ground Rules

- Do not add npm dependencies.
- Do not convert community reading to Sigma.
- Do not expose a user-visible "old/new graph" mode switch.
- Do not preserve normal DOM global as a user path.
- DOM/SVG full graph is allowed only as a small fallback when Sigma is unavailable and the graph is within the 2000-node cap.
- The normal global view remains a point-map, not cards.
- Commit at the end of each phase, after tests pass.
- Use `git add -f` for docs under `docs/` when committing.

## What Already Exists

- `packages/graph-engine/src/facade.ts` already owns route ids and renderer switching.
- `packages/graph-engine/src/render/render-pipeline.ts` already wires the DOM/SVG toolbar.
- `packages/graph-engine/src/render/controller.ts` already has DOM/SVG internal `resetViewState()`.
- `packages/graph-engine/src/render/sigma-global-renderer.ts` already renders Sigma global overlay hit targets.
- `packages/graph-engine/src/render/model.ts` already has density budgets, label budgets, pin-aware visibility, and aggregation container output.
- Existing pin and drag behavior lives across `controller.ts`, `node-drag-lifecycle.ts`, `sim/pins.ts`, and render model tests. Phase 1 should preserve it, not rebuild it.

## NOT In Scope

- Node aggregation or folded `+N` hints.
- 10000-node behavior.
- Rewriting community reading from DOM/SVG to Sigma.
- Rebuilding graph layout or relationship generation.
- A new design theme, paper texture, or landing-style visual layer.
- Full per-node cross-renderer animation.
- New graph export, graph lint, path explanation, or analysis features.

## Phase 1 Acceptance

Phase 1 is complete only when these are true:

1. Opening the graph still starts in Sigma global.
2. Entering a community still uses DOM/SVG community reading.
3. Every normal return-to-global entry from community context returns to Sigma global, not DOM/SVG full graph.
4. Normal global view does not show circular community selection buttons.
5. Community background/region hit testing still selects a community.
6. Global community names appear as lightweight map labels, not buttons or a second community-control system.
7. First global viewport has point nodes, relationship skeleton, community color regions, sparse labels, and no node cards or reading content.
8. Returning from community to global preserves selected object, search state, type filters, pins, and community context where applicable.
9. Graphs over the 2000-node cap show a static over-limit notice, not aggregation and not old DOM full graph.
10. Boundary behavior is explicit: 2000 nodes remains eligible for global rendering; 2001 nodes goes to over-limit notice before Sigma or DOM global.
11. Targeted graph-engine tests pass.
12. Scripted browser regression verifies the original reported bug.

## Phase 2 Acceptance

Phase 2 is complete only when these are true:

1. Crowded global graphs reduce visual noise with smaller points, weaker lines, and fewer labels.
2. Selected/search/pinned/core nodes remain visible as anchors under density pressure.
3. Global/community route changes have a light visual continuity marker or transition.
4. DOM small fallback follows the same interaction rules as Sigma global as far as the fallback supports.
5. Sigma global supports node drag-to-fix using the shared Pin/fixed-position state.
6. Browser smoke verifies Sigma drag-to-fix, fixed-position reload persistence, search/selection continuity across global/community/global movement, and repeated route cycles. Package tests cover DOM small fallback parity and 2001-node over-limit routing.

---

# Phase 1: Stop The Product Split

**Status:** completed and sealed. Phase 1 should now be treated as a verified baseline for Phase 2.

## Phase 1 Closure Record

- **Commit:** `51a2eca fix: unify graph global return path`
- **Branch:** `codex/graph-experience-completion-spec`
- **Result:** the normal full-graph route is Sigma global; community reading remains DOM/SVG; community return-to-global routes back to Sigma global; duplicate circular community controls and visible aggregation controls are removed from the normal global view; graphs over 2000 nodes show the static over-limit notice.
- **Review:** Phase 1 spec/correctness review found no blocking issues and marked Phase 1 submit-ready.
- **Verification passed:**
  - `git diff --check`
  - `cd packages/graph-engine && npm test`
  - `cd packages/graph-engine && npm run typecheck`
  - `cd packages/graph-engine && npm run build`
  - `npm run typecheck --workspaces --if-present`
  - `bash tests/graph-workbench-interactions.regression-1.sh`
  - `bash tests/graph-community-wash-interactions.regression-1.sh`
  - `bash tests/graph-sigma-global-production.regression-1.sh`

The detailed task checklist below is retained as the execution trace for Phase 1. It is no longer an open task list.

## Task 0: Preflight

**Files to read**

- `docs/spark/2026-06-21-graph-experience-completion-design.md`
- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/render/render-context.ts`
- `packages/graph-engine/src/render/graph-renderer-root.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`
- `packages/graph-engine/src/render/sigma-global-renderer.ts`
- `packages/graph-engine/src/render/model.ts`

**Steps**

- [ ] Confirm branch:

```bash
git branch --show-current
```

Expected: `codex/graph-experience-completion-spec`

- [ ] Confirm the design doc has the accepted no-aggregation scope:

```bash
rg -n "2000|不包含.*聚合|不为超限场景构建节点聚合" docs/spark/2026-06-21-graph-experience-completion-design.md
```

- [ ] Confirm no unrelated implementation edits are present:

```bash
git status --short
```

- [ ] Run baseline package checks:

```bash
cd packages/graph-engine
npm test
npm run typecheck
```

## Task 1: Route Every Community Return-To-Global Entry Through Facade

**Intent:** Every return-to-global action from community context must ask the facade to return to the global route. It must not call DOM/SVG internal reset as the product-level "return global" action.

```text
Before:
DOM community toolbar/drawer/shortcut -> DOM resetViewState() -> DOM redraws all nodes

After:
DOM community toolbar/drawer/shortcut -> requestGlobalReset() -> facade -> Sigma global
                                                  fallback only if Sigma is known unavailable
```

**Modify**

- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/render/render-context.ts`
- `packages/graph-engine/src/render/graph-renderer-root.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`

**Tests**

- `packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/renderer-boundary.test.ts`

**Steps**

- [ ] Add a failing regression test proving DOM community toolbar can request a facade-level global route.
- [ ] Add or update an integration-style DOM renderer test that focuses a community, triggers the actual toolbar `回全图` control, and asserts the facade route becomes `sigma-global`.
- [ ] Audit drawer, shortcut, and other return-to-global entries:
  - if an entry exists, wire it through the same `requestGlobalReset()` path,
  - if no such entry exists, record that explicitly in the test or assertion comment.
- [ ] Add `onGlobalResetRequested?: () => void` to facade and renderer callback types.
- [ ] Add `requestGlobalReset(): void` to `GraphRenderCommands`.
- [ ] Implement `requestGlobalReset()` in `graph-renderer-root.ts`:
  - If `context.callbacks.onGlobalResetRequested` exists, call it.
  - Otherwise call `controller.resetViewState()` for standalone/offline DOM renderers.
- [ ] Change DOM toolbar reset wiring in `render-pipeline.ts` to call `requestGlobalReset()`.
- [ ] Update `packages/graph-engine/test/renderer-boundary.test.ts` so toolbar wiring requires `requestGlobalReset()` and no longer accepts direct `resetViewState()` for the return-global control.
- [ ] In `facade.ts`, wire `onGlobalResetRequested` to:
  - clear route-level focus,
  - switch to Sigma global when Sigma is available,
  - switch to fallback only when Sigma is known unavailable,
  - call the existing view-reset capability callback.
- [ ] Assert the old DOM full-graph route is not rendered after the real toolbar return:
  - no normal DOM full-graph `.node` global layer after return,
  - route is `sigma-global`,
  - focus is cleared,
  - selection/search/filters/pins are preserved.
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test test/facade.test.ts test/renderer-boundary.test.ts
```

## Task 2: Replace Normal Aggregation Fallback With Static Over-Limit Notice

**Intent:** For the accepted `<= 2000` scope, normal global should not show aggregation containers. If a graph exceeds the cap, show a static notice before any global renderer path is chosen.

**Modify**

- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/dom-svg-renderer.ts`
- `packages/graph-engine/src/render/sigma-global-renderer.ts`
- `packages/graph-engine/src/render/render-styles.ts`

**Tests**

- `packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/render-model.test.ts`
- `packages/graph-engine/test/renderer-lifecycle.test.ts`
- `packages/graph-engine/test/sigma-global-renderer.test.ts`

**Steps**

- [ ] Rename route concept from `aggregation-safety-fallback` to `over-limit-notice`.
- [ ] Replace `createAggregationSafetyFallback` factory with `createOverLimitNotice`.
- [ ] Run the node-count guard before Sigma route creation on:
  - initial route activation,
  - `setData`,
  - Sigma retry.
- [ ] Replace aggregation fallback route selection with a single node-count cap:

```text
node count <= 2000 -> normal Sigma attempt
node count > 2000 -> over-limit-notice
if node count <= 2000 and Sigma unavailable -> dom-svg-small-fallback
```

- [ ] Render over-limit notice copy:

```text
图谱节点较多
当前图谱超过 2000 个节点。请用搜索、筛选或进入社区缩小范围。
```

- [ ] Stop normal render model output from producing visible aggregation containers.
- [ ] Stop DOM/SVG normal paint from drawing aggregation containers.
- [ ] Stop Sigma global overlay from drawing aggregation container buttons.
- [ ] Keep low-level aggregation data contracts only if removing them would cause broad unrelated churn. Phase 1 removes visible aggregation UI and the old facade route, not every historical aggregation type in adapter/summary contracts.
- [ ] Add boundary tests:
  - initial 2000-node graph remains eligible for normal global route,
  - initial 2001-node graph goes directly to `over-limit-notice` even when Sigma is available,
  - `setData` from 2000 to 2001 switches to `over-limit-notice`,
  - stale small metadata with large arrays still uses actual array length,
  - over-limit notice contains no aggregation container classes/buttons,
  - over-limit notice does not render old DOM full graph.
- [ ] Before full `npm test`, review/update aggregation-related tests that may intentionally keep low-level contracts:
  - `packages/graph-engine/test/aggregation-fallback-trial-adapter.test.ts`
  - `packages/graph-engine/test/renderer-adapter-contract.test.ts`
  - `packages/graph-engine/test/sigma-trial-adapter.test.ts`
  - `packages/graph-engine/test/vis-network-trial-adapter.test.ts`
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test \
  test/facade.test.ts \
  test/render-model.test.ts \
  test/renderer-lifecycle.test.ts \
  test/sigma-global-renderer.test.ts
```

## Task 3: Remove Circular Community Controls And Add Passive Map Labels

**Intent:** Community background/region hit testing is the primary community selection entry. Visible circular community buttons are removed. Community names become lightweight map labels, not a second control system.

**Modify**

- `packages/graph-engine/src/render/sigma-global-renderer.ts`
- `packages/graph-engine/src/render/render-styles.ts`

**Tests**

- `packages/graph-engine/test/sigma-global-renderer.test.ts`
- `packages/graph-engine/test/spatial-index.test.ts`

**Steps**

- [ ] Add failing Sigma overlay assertions:
  - no visible circular community selection controls in normal global view, regardless of class name,
  - no `.sigma-global-community-wash` buttons,
  - no button-role or tab-focusable community label controls,
  - map labels exist for top visible communities as passive labels.
- [ ] Keep spatial community hit test coverage. The background region remains clickable.
- [ ] Replace visible `sigma-global-community-wash` button creation with passive label overlay creation.
- [ ] Labels must not become buttons:
  - use a non-button element or make it non-focusable and `aria-hidden`,
  - use `pointer-events: none` so clicks fall through to the underlying Sigma stage/spatial hit path,
  - keep keyboard-accessible community selection in the legend, not in map labels.
- [ ] Pick labels by simple stable priority:
  - selected community first,
  - then larger communities,
  - cap to a small count such as 8.
- [ ] Style `.sigma-global-community-label` as light map labels, not large buttons.
- [ ] Add click arbitration assertions:
  - node click wins over overlapping community region,
  - exposed community region selects community,
  - passive label area delegates to the underlying region instead of focusing DOM controls,
  - legend remains the keyboard-accessible community selection path.
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test test/sigma-global-renderer.test.ts test/spatial-index.test.ts
```

## Task 4: Phase 1 Browser Smoke

**Intent:** Prove the user-reported product split is gone with scriptable regression coverage, not only manual clicking.

**Verify**

- `packages/graph-engine`
- `workbench/web`
- running app at `http://localhost:5180`

**Steps**

- [ ] Run package checks:

```bash
cd packages/graph-engine
npm test
npm run typecheck
npm run build
```

- [ ] Run workspace typecheck:

```bash
cd ../..
npm run typecheck --workspaces --if-present
```

- [ ] Start app:

```bash
cd ../..
npm run dev
```

- [ ] Update or add a scripted browser regression for Phase 1. Prefer updating the existing workbench regression to be route-aware:

```bash
bash tests/graph-workbench-interactions.regression-1.sh
```

The script must assert:

1. Sigma global route/canvas exists on initial graph view.
2. Initial view has point nodes, relationship skeleton, community color regions, and 1-8 passive community labels.
3. Initial normal global view has no old DOM global `.node` graph and no visible circular community controls.
4. Community background/region selection opens summary without entering community.
5. `进入社区` enters DOM/SVG community reading.
6. Toolbar `回全图` returns to Sigma global.
7. Drawer/shortcut/other return-global entries either use the same path or are confirmed absent.
8. Search, selection, filters, and pins survive community -> global return.

- [ ] Update old DOM-global browser checks so they are route-aware:
  - DOM `.node` / `.community-wash` checks run only in DOM community or small fallback routes,
  - Sigma global checks assert Sigma route/canvas/labels instead.

- [ ] Run community-region browser coverage if still applicable after route-aware updates:

```bash
bash tests/graph-community-wash-interactions.regression-1.sh
```

- [ ] Manual browser smoke on the real workbench:
  1. Open graph tab.
  2. Confirm first view is Sigma point map.
  3. Click community background/label.
  4. Confirm community selection/summary happens without entering community.
  5. Click `进入社区`.
  6. Click toolbar `回全图`.
  7. Confirm the view returns to Sigma point map, not old DOM/SVG full graph with circular counters.
  8. Confirm normal global view has no circular community selection buttons.
  9. Search/select/pin before entering community, then confirm those states survive return.
  10. Load or simulate an over-limit graph and confirm only the static notice appears.

- [ ] Commit Phase 1:

```bash
git add packages/graph-engine/src/facade.ts \
  packages/graph-engine/src/render/render-context.ts \
  packages/graph-engine/src/render/graph-renderer-root.ts \
  packages/graph-engine/src/render/render-pipeline.ts \
  packages/graph-engine/src/render/model.ts \
  packages/graph-engine/src/render/dom-svg-renderer.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/src/render/render-styles.ts \
  packages/graph-engine/test/facade.test.ts \
  packages/graph-engine/test/renderer-boundary.test.ts \
  packages/graph-engine/test/render-model.test.ts \
  packages/graph-engine/test/renderer-lifecycle.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/spatial-index.test.ts \
  tests/graph-workbench-interactions.regression-1.sh \
  tests/browser/graph-workbench-interactions.mjs
git commit -m "fix: unify graph global return path"
```

---

# Phase 2: Make The Map Feel Continuous

**Status:** completed. Phase 2 started from the sealed Phase 1 baseline and kept the normal global graph on Sigma.

## Phase 2 Closure Record

- **Commits:**
  - `598e9e5 fix: tighten dense global point maps`
  - `f773a2b fix: add sigma global drag to pin`
  - `5fe2654 fix: add graph route continuity markers`
  - `df86e72 test: verify graph route state continuity`
- **Result:** crowded global graphs remain point maps without aggregation; selected, searched, pinned, and core nodes stay visible under density pressure; Sigma global supports drag-to-fix through the shared Pin state; global/community route changes expose stable continuity markers; DOM small fallback keeps the same global interaction rules where supported; route refresh no longer clears still-valid selection/search/Pin context.
- **Verification passed on 2026-06-22:**
  - `cd packages/graph-engine && npm test`
  - `cd packages/graph-engine && npm run typecheck`
  - `cd packages/graph-engine && npm run build`
  - `npm run typecheck --workspaces --if-present`
  - `bash tests/graph-workbench-interactions.regression-1.sh`
  - `git diff --check`
  - `git diff -- package.json package-lock.json packages/graph-engine/package.json`

The task checklist below is retained as the execution trace for Phase 2.

## Task 5: Tighten Point-Map Density Rules

**Intent:** Crowded global graphs stay as point maps. They reduce noise by shrinking ordinary nodes, fading weak edges, and reducing labels. They do not aggregate.

**Modify**

- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/render-styles.ts`

**Tests**

- `packages/graph-engine/test/render-model.test.ts`
- `packages/graph-engine/test/sigma-global-renderer.test.ts`

**Steps**

- [ ] Add tests for crowded global data within the accepted `<= 2000` node scope:
  - use a 2000-node / near-4000-edge pressure sample,
  - do not use 5000/10000-node fixtures,
  - `aggregationContainers.length === 0`,
  - ordinary nodes use point/overview display,
  - weak edges are faded,
  - ordinary labels are reduced,
  - selected/search/pinned/core nodes stay visible.
- [ ] Keep anchor visibility inside existing budgets:
  - global full cards remain `0`,
  - labels stay within `GRAPH_RENDER_BUDGETS.global.maxLabels`,
  - visible edges stay within `GRAPH_RENDER_BUDGETS.global.maxVisibleEdges`,
  - interaction updates stay within `GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates`,
  - Sigma DOM overlays / hit targets keep fixed caps even under many search hits or pins.
- [ ] Add Sigma renderer dense-fixture assertions for the visible mapping:
  - ordinary node size is smaller than selected/search/pinned anchors,
  - weak edge opacity/size is lower than strong edge opacity/size,
  - label count stays limited,
  - aggregation overlay count remains `0`.
- [ ] Tune existing budgets only where tests prove a gap.
- [ ] Do not add new aggregation state, folded `+N` prompts, or aggregation smoothing.
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test test/render-model.test.ts test/sigma-global-renderer.test.ts
```

## Task 6: Add Sigma Global Node Drag-To-Fix

**Intent:** Sigma global keeps the mature "drag node, release to fix" map-editing behavior. This is not a new layout system; it writes the same shared Pin/fixed-position state already used by DOM community and fallback paths.

**Modify**

- `packages/graph-engine/src/render/sigma-global-renderer.ts`
- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/test/sigma-global-renderer.test.ts`
- `tests/browser/graph-workbench-interactions.mjs`

**Tests**

- `packages/graph-engine/test/sigma-global-renderer.test.ts`
- browser smoke

**Steps**

- [ ] Add Sigma node drag support using Sigma's event/camera APIs and existing node world coordinates.
- [ ] During node drag:
  - disable camera dragging only for the active node drag,
  - keep the dragged node under the pointer without jumping,
  - update renderer data without creating a second business state store,
  - avoid changing community membership or route state.
- [ ] On release:
  - persist the final world position through `onPinsChanged`,
  - mark the node pinned/fixed in the shared Pin state,
  - keep selected/search/pinned/core anchor styling intact.
- [ ] On cancel/destroy:
  - restore the previous position if the drag is cancelled,
  - clear active drag flags/listeners/timers,
  - avoid leaving camera disabled after route switches.
- [ ] Add unit tests for:
  - drag start / move / release writes a world-space pin,
  - selected/search/pinned metadata survives the drag,
  - destroy during drag cleans listeners and does not emit stale pin writes.
- [ ] Add browser coverage for real Sigma global drag:
  1. drag a global node,
  2. release it,
  3. confirm it becomes pinned/fixed,
  4. enter community,
  5. return global,
  6. reload the page,
  7. confirm the fixed position remains.
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test test/sigma-global-renderer.test.ts
cd ../..
bash tests/graph-workbench-interactions.regression-1.sh
```

## Task 7: Add Minimal Route Continuity Markers

**Intent:** Global/community route changes should feel like moving within one map. Phase 2 does the cheap part: route datasets and light CSS transitions. It does not animate every node across renderers.

**Modify**

- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/render/render-styles.ts`

**Tests**

- `packages/graph-engine/test/facade.test.ts`

**Steps**

- [ ] Set route dataset attributes on the stable graph host / facade container, not only on renderer child nodes that are destroyed during route switches:
  - `data-llm-wiki-graph-route`,
  - `data-llm-wiki-graph-route-transition`.
- [ ] Add light opacity/transform transition CSS for route changes:
  - transition only one route wrapper or one overlay layer,
  - do not add transition rules to every node, edge, label, hit target, community wash, or SVG geometry attribute,
  - keep duration in the 120-180ms range,
  - respect reduced-motion,
  - clear the transition marker after the transition settles and on destroy.
- [ ] Add tests for route dataset changes:

```text
sigma-global -> dom-svg-community
dom-svg-community -> sigma-global
sigma-global -> dom-svg-small-fallback when Sigma unavailable
sigma-global -> over-limit-notice when node count is 2001
```

- [ ] Add assertions that repeated route changes leave:
  - exactly one current renderer mounted,
  - no stale route-transition marker,
  - no stale timers/listeners after destroy.
- [ ] Run:

```bash
cd packages/graph-engine
node --import tsx --test test/facade.test.ts
```

## Task 8: Extend Shared State Verification Beyond Phase 1

**Intent:** Phase 1 already proves state survives the core community -> global return. Phase 2 extends that proof to refresh, fallback, and route-continuity polish.

**Tests**

- `packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/render-model.test.ts`
- `packages/graph-engine/test/renderer-lifecycle.test.ts`
- browser smoke

**Steps**

- [ ] Add or strengthen tests for:
  - pinned node remains pinned after community route, return, data refresh, and browser reload,
  - search results remain in route state after route continuity markers are added,
  - selection is not lost when returning global and then updating data if the selected object still exists,
  - if the selected object no longer exists, the UI shows unavailable/cleared state explicitly instead of silently losing context,
  - community region/label selection context has an explicit rule after enter-community -> return-global,
  - DOM small fallback receives and renders the same pins/search/selection state.
- [ ] Clarify and test data-refresh behavior across Sigma global, DOM community, and DOM small fallback:
  - preserve selection/search/Pin/drawer/community context when the object still exists,
  - clear or mark unavailable only when the object disappears,
  - do not let DOM community `setData` clear facade-level selection by default.
- [ ] Add DOM small fallback rule-parity coverage by forcing Sigma unavailable on a `<=2000` graph:
  - clicking a node stays in global fallback and opens the light node summary,
  - clicking a community region / legend stays in global fallback and opens the light community summary,
  - only `进入社区` enters DOM community reading,
  - `回全图` returns to Sigma if Sigma has been retried and is available, otherwise to DOM small fallback,
  - fallback shows no aggregation UI, no circular community controls, and no old/new mode switch,
  - `2001` nodes still show only the over-limit notice, never fallback.
- [ ] Upgrade the workbench browser regression into a Phase 2 automated scenario:
  1. Drag a Sigma global node.
  2. Release it and confirm fixed/pinned state.
  3. Search and select the same node.
  4. Select a community region/label and enter community.
  5. Return global.
  6. Reload the page.
  7. Confirm fixed position, search state, selection, community context rule, no circular controls, and no aggregation UI after returning global.
  8. Reload the page and confirm the fixed position persists, Sigma remains the global route, and circular controls / aggregation UI do not reappear.
  9. Repeat global/community/global several times and assert renderer/overlay counts do not accumulate.

## Task 9: Phase 2 Verification

- [ ] Run:

```bash
cd packages/graph-engine
npm test
npm run typecheck
npm run build
cd ../..
npm run typecheck --workspaces --if-present
```

- [ ] Run package verification for:
  - DOM small fallback rule parity with Sigma unavailable,
  - 2001-node over-limit notice,
  - crowded graph density budgets.
- [ ] Run browser smoke for:
  - real Sigma node drag-to-fix and reload persistence,
  - route transition continuity,
  - fixed node state,
  - search/selection continuity across global/community/global return,
  - no circular community controls,
  - no normal aggregation UI.
- [ ] Run the scripted browser regression:

```bash
bash tests/graph-workbench-interactions.regression-1.sh
```

- [ ] Confirm no new dependencies:

```bash
git diff -- package.json package-lock.json packages/graph-engine/package.json
```

Expected: no dependency or lockfile changes.

- [ ] Commit Phase 2:

```bash
git add packages/graph-engine/src/facade.ts \
  packages/graph-engine/src/render/model.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/src/render/render-styles.ts \
  packages/graph-engine/src/render/graph-renderer-root.ts \
  packages/graph-engine/src/render/controller.ts \
  packages/graph-engine/test/facade.test.ts \
  packages/graph-engine/test/render-model.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/renderer-lifecycle.test.ts \
  tests/browser/graph-workbench-interactions.mjs \
  tests/graph-workbench-interactions.regression-1.sh
git commit -m "fix: polish graph map continuity"
```

---

## Final Branch Verification

Run after both phases:

```bash
cd packages/graph-engine
npm test
npm run typecheck
npm run build
cd ../..
npm run typecheck --workspaces --if-present
```

Browser final checklist:

1. Open graph tab.
2. Confirm first view is Sigma global point map.
3. Select a community by background/label.
4. Enter community.
5. Click `回全图`.
6. Confirm Sigma global point map.
7. Confirm no visible circular community controls.
8. Confirm no normal aggregation UI.
9. Drag/pin a node and confirm it persists after route changes and refresh.

## Review Notes

This plan intentionally splits implementation in one branch:

- Phase 1 fixes the visible product split first.
- Phase 2 improves continuity and density only after the main split is gone.
- Both phases stay inside the accepted `<= 2000` scope.

---

## Engineering Review

### Step 0 Scope Challenge

Scope was challenged because the original plan touched more than eight files and mixed root-cause repair with polish. The accepted adjustment is one branch with two phases:

- Phase 1 fixes the visible product split and has hard regression coverage.
- Phase 2 handles continuity polish after Phase 1 passes.

This keeps the complete direction without making the first ship depend on every visual refinement.

### Architecture Review

No architecture direction change required after review.

Findings absorbed into the plan:

- `[P1] (confidence: 10/10) packages/graph-engine/src/facade.ts:295` — over-limit routing must run before Sigma creation, not only after Sigma is unavailable.
- `[P1] (confidence: 7/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:72` — Phase 1 must cover every return-to-global entry, not only the visible toolbar button.
- `[P2] (confidence: 7/10) packages/graph-engine/src/render/sigma-global-renderer.ts:398` — removing circular controls must preserve the region hit path and avoid turning labels into new buttons.

Recommended plan edits were applied:

- Added pre-Sigma `2000/2001` route guard requirements.
- Changed Task 1 from toolbar-only to all community return-to-global entries.
- Changed map labels to passive labels with legend as the keyboard-accessible community selection path.

### Code Quality Review

No new abstraction is required for Phase 1.

Findings absorbed into the plan:

- `[P2] (confidence: 8/10) packages/graph-engine/src/render/adapter.ts:27` — visible aggregation UI can be removed without deleting every low-level aggregation type in the same phase.
- `[P2] (confidence: 7/10) packages/graph-engine/src/render/render-pipeline.ts:231` — boundary tests must prevent toolbar wiring from reaching the DOM internal reset path.

Recommended plan edits were applied:

- Phase 1 now says to keep low-level aggregation data contracts when removing them would cause broad unrelated churn.
- Renderer-boundary checks now explicitly require `requestGlobalReset()` for return-global wiring.

### Test Review

Phase 1 test coverage must prove the original bug through the real user path, not only through route manager API calls.

```text
CODE PATHS                                             USER FLOWS
[+] facade route manager                               [+] Community -> return global
  ├── [GAP->PLAN] initial <=2000 -> Sigma                 ├── [GAP->PLAN] toolbar 回全图 -> Sigma
  ├── [GAP->PLAN] initial 2001 -> notice                  ├── [GAP->PLAN] drawer/shortcut return audited
  ├── [GAP->PLAN] setData <=2000 -> 2001 -> notice        └── [GAP->PLAN] no old DOM global after return
  └── [GAP->PLAN] Sigma unavailable <=2000 -> DOM fallback

[+] DOM/SVG toolbar command wiring                    [+] Community selection
  ├── [GAP->PLAN] onReset -> requestGlobalReset           ├── [GAP->PLAN] region click selects community
  └── [GAP->PLAN] standalone fallback -> resetViewState   ├── [GAP->PLAN] label is passive, not button
                                                           └── [GAP->PLAN] legend remains keyboard path

[+] Sigma global overlays                              [+] Browser regression
  ├── [GAP->PLAN] no circular community controls          ├── [GAP->PLAN] route-aware workbench regression
  ├── [GAP->PLAN] no aggregation overlay buttons          ├── [GAP->PLAN] first viewport map feeling
  └── [GAP->PLAN] passive map labels                      └── [GAP->PLAN] state survives return
```

Coverage target after implementation: all Phase 1 `[GAP->PLAN]` entries must become tested by package tests, scripted browser regression, or explicitly documented absence.

Recommended plan edits were applied:

- Added actual-toolbar-click regression requirement.
- Added route-aware browser regression requirement.
- Added state survival checks to Phase 1.
- Added over-limit boundary tests.

### Performance Review

No new runtime dependency or large rendering system is introduced.

Findings absorbed into the plan:

- `[P2] (confidence: 9/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:343` — production-path browser regression must stay in the plan because Sigma path performance and correctness can pass unit tests while failing in workbench.

Recommended plan edits were applied:

- Phase 1 now names `bash tests/graph-workbench-interactions.regression-1.sh`.
- Existing DOM-global browser checks must become route-aware before they can protect the new Sigma-first global path.

### Failure Modes

| New/changed path | Failure mode | Planned protection |
|---|---|---|
| Community return-global command | Toolbar still calls DOM internal reset and redraws old full graph | Real toolbar click test plus browser regression |
| Multiple return-global entries | Drawer/shortcut returns to a different path than toolbar | Audit all entries; wire same command or record absence |
| Over-limit routing | 2001-node graph still attempts Sigma or old DOM full graph | Guard before initial Sigma, `setData`, and retry; add 2000/2001 tests |
| Passive labels | Labels become a second button system | Non-button/non-tab-focus assertions; region hit tests |
| Community region hit | Removing visible wash button makes community unclickable | Sigma renderer and spatial hit tests |
| Browser regression | Existing scripts keep protecting old DOM selectors | Route-aware workbench regression update |

### Worktree Parallelization Strategy

Sequential implementation is recommended for Phase 1. The tasks touch shared route and renderer surfaces, and parallel edits would likely collide in `facade.ts`, `sigma-global-renderer.ts`, and browser regression expectations.

Phase 2 can split after Phase 1 lands:

| Step | Modules touched | Depends on |
|---|---|---|
| Density polish | `packages/graph-engine/src/render/` | Phase 1 |
| Route continuity markers | `packages/graph-engine/src/facade.ts`, styles | Phase 1 |
| Extended state verification | tests/browser regression | Phase 1 |

Recommended order: ship Phase 1 sequentially, then run Phase 2 as one small lane unless the density and browser-regression work are assigned to separate worktrees with careful coordination.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — routing — Guard over-limit before renderer activation
  - Surfaced by: Architecture Review — over-limit routing can bypass notice while Sigma is available.
  - Files: `packages/graph-engine/src/facade.ts`, `packages/graph-engine/test/facade.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/facade.test.ts`

- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — return-global — Prove real community return uses facade route
  - Surfaced by: Test Review — route manager API tests do not prove the actual toolbar path.
  - Files: `packages/graph-engine/src/render/render-pipeline.ts`, `packages/graph-engine/src/render/graph-renderer-root.ts`, `packages/graph-engine/test/renderer-boundary.test.ts`, `packages/graph-engine/test/facade.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/facade.test.ts test/renderer-boundary.test.ts`

- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — community labels — Remove circular controls without creating label buttons
  - Surfaced by: Design Review — map labels must stay labels, not become a second community entry control.
  - Files: `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/src/render/render-styles.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/sigma-global-renderer.test.ts test/spatial-index.test.ts`

- [ ] **T4 (P1, human: ~3h / CC: ~30min)** — browser regression — Make workbench graph browser checks Sigma-route-aware
  - Surfaced by: Test Review — current browser scripts can still protect old DOM global selectors.
  - Files: `tests/graph-workbench-interactions.regression-1.sh`, `tests/browser/graph-workbench-interactions.mjs`, optionally `tests/graph-community-wash-interactions.regression-1.sh`, `tests/browser/graph-community-wash-interactions.mjs`
  - Verify: `bash tests/graph-workbench-interactions.regression-1.sh`

## Phase 2 Engineering Review

### Step 0 Scope Challenge

Scope remains valid, but Phase 2 is no longer just visual polish. Because the accepted design requires Sigma global node drag-to-fix, Phase 2 must include that implementation before it can verify drag/pin/reload continuity.

Scope kept out of Phase 2:

- Node aggregation and folded `+N` prompts — out of accepted `<= 2000` node scope.
- 5000/10000-node product behavior — deferred outside this branch.
- Converting DOM community reading to Sigma — contradicts the accepted renderer split.
- New animation dependencies — route continuity should use existing CSS only.
- Per-node cross-renderer animation — too much machinery for this phase.
- User-visible old/new graph switch — would recreate the split Phase 1 removed.

What already exists and should be reused:

- `packages/graph-engine/src/render/model.ts` already has density budgets, edge budgets, anchor priority, stable core nodes, and empty aggregation output.
- `packages/graph-engine/src/render/sigma-global-renderer.ts` already maps render model fields into Sigma node size, labels, colors, and edge opacity.
- `packages/graph-engine/src/facade.ts` already owns global/community/fallback/notice routes and shared pins/search/selection state.
- `packages/graph-engine/src/render/graph-renderer-root.ts` and `packages/graph-engine/src/render/controller.ts` already implement DOM drag and Pin lifecycle patterns that Sigma should mirror rather than reinvent.
- `tests/browser/graph-workbench-interactions.mjs` already covers the real workbench route path and should become the Phase 2 browser regression instead of adding a disconnected manual smoke.

### Architecture Review

Findings absorbed into Phase 2:

- `[P1] (confidence: 10/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:517` — the plan required dragging a Sigma global node but did not include Sigma drag implementation. Task 6 now adds Sigma global drag-to-fix before state verification.
- `[P1] (confidence: 10/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:481` — route markers must live on the stable graph host/facade container, not on renderer children that are destroyed during route switches. Task 7 now states this explicitly.
- `[P1] (confidence: 7/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:516` — DOM small fallback parity was too narrow. Task 8 now requires forced-Sigma-unavailable coverage for node click, community click, enter community, return global, no aggregation UI, no circular controls, and 2001-node notice behavior.
- `[P1] (confidence: 10/10) packages/graph-engine/src/render/graph-renderer-root.ts:290` — DOM `setData` currently clears transient interaction. Task 8 now defines when data refresh must preserve selection/search/Pin/drawer context and when it may clear or mark objects unavailable.

### Code Quality Review

Findings absorbed into Phase 2:

- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:481` — route transition code could become scattered timer/listener state. Task 7 now requires transition cleanup on settle and destroy.
- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:517` — Sigma drag must not introduce a second state store. Task 6 now requires using the shared Pin/fixed-position state.
- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:538` — browser smoke was not tied to repeatable scripts. Task 8/9 now upgrade the existing workbench regression and include those files in the commit list.

### Test Review

```text
CODE PATHS                                             USER FLOWS
[+] render model density                               [+] Crowded global map
  ├── [GAP->PLAN] 2000-node pressure sample              ├── [GAP->PLAN] no aggregation UI
  ├── [GAP->PLAN] labels/edges/update budgets            ├── [GAP->PLAN] sparse labels and weak lines
  └── [GAP->PLAN] anchors stay visible within caps       └── [GAP->PLAN] selected/search/pinned anchors visible

[+] Sigma global drag                                  [+] Pin continuity
  ├── [GAP->PLAN] drag start/move/release writes Pin      ├── [GAP->PLAN] drag node in Sigma global
  ├── [GAP->PLAN] destroy during drag cleans state        ├── [GAP->PLAN] enter community -> return global
  └── [GAP->PLAN] no stale camera/listeners               └── [GAP->PLAN] reload keeps fixed position

[+] route continuity markers                           [+] Route movement
  ├── [GAP->PLAN] host dataset route                      ├── [GAP->PLAN] global -> community -> global
  ├── [GAP->PLAN] transition set and cleared              ├── [GAP->PLAN] Sigma unavailable -> fallback
  └── [GAP->PLAN] one renderer after repeated switches    └── [GAP->PLAN] 2001 nodes -> notice

[+] fallback rule parity                               [+] Fallback user path
  ├── [GAP->PLAN] fallback renders pins/search/selection  ├── [GAP->PLAN] click node opens light summary
  ├── [GAP->PLAN] fallback community selection            ├── [GAP->PLAN] click community opens light summary
  └── [GAP->PLAN] no aggregation/circular controls        └── [GAP->PLAN] enter community and return correctly
```

Coverage target: all Phase 2 `[GAP->PLAN]` entries must be covered by package tests, scripted browser regression, or a documented unsupported edge with rationale.

### Performance Review

Findings absorbed into Phase 2:

- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:451` — crowded tests must include the accepted upper bound, not only small 200-node samples. Task 5 now requires a 2000-node / near-4000-edge sample.
- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:484` — route transition must not apply to every node/edge/label. Task 7 now limits transition to one wrapper or overlay layer.
- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-21-graph-experience-completion.md:456` — anchor visibility must stay within budgets. Task 5 now forbids bypassing label, edge, interaction, or Sigma overlay caps.

### Failure Modes

| New/changed path | Failure mode | Planned protection |
|---|---|---|
| Sigma drag-to-fix | Node drag writes private Sigma state and is lost on route change | Shared `onPinsChanged` path, unit test, browser reload test |
| Sigma drag cleanup | Route switch during drag leaves camera disabled or stale listener alive | Destroy/cancel cleanup assertions |
| Density pressure | 2000-node graph passes small tests but feels noisy at real cap | 2000-node / near-4000-edge model and Sigma assertions |
| Route markers | Marker lives on child route and disappears during switch | Stable host dataset tests |
| Route transition | Transition remains stuck after repeated switches | transition-set/clear tests and repeated route smoke |
| DOM fallback parity | Fallback behaves like old DOM full graph | forced Sigma-unavailable package parity tests |
| Data refresh | DOM community refresh clears facade selection/search/Pin silently | explicit preserve/unavailable tests |
| Browser coverage | Phase 2 only manually inspected | scripted workbench regression update |

### Worktree Parallelization Strategy

Sequential implementation is recommended for Phase 2. Density, Sigma drag, route state, fallback parity, and browser regression all touch shared graph rendering surfaces. Parallel worktrees would likely collide in `facade.ts`, `sigma-global-renderer.ts`, `render-styles.ts`, and `tests/browser/graph-workbench-interactions.mjs`.

### Phase 2 Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~45min)** — Sigma drag — Implement global node drag-to-fix
  - Surfaced by: Architecture/Test Review — Phase 2 required drag verification but Sigma global had no drag path.
  - Files: `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/src/facade.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`, `tests/browser/graph-workbench-interactions.mjs`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/sigma-global-renderer.test.ts`

- [ ] **T2 (P1, human: ~2h / CC: ~25min)** — route continuity — Put route and transition markers on the stable host
  - Surfaced by: Architecture Review — child route markers are destroyed during route switches.
  - Files: `packages/graph-engine/src/facade.ts`, `packages/graph-engine/src/render/render-styles.ts`, `packages/graph-engine/test/facade.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/facade.test.ts`

- [ ] **T3 (P1, human: ~3h / CC: ~40min)** — fallback parity — Prove DOM small fallback follows Sigma global rules
  - Surfaced by: Scope/Test Review — checking only fallback inputs does not prove user-visible fallback behavior.
  - Files: `packages/graph-engine/src/facade.ts`, `packages/graph-engine/src/render/graph-renderer-root.ts`, `packages/graph-engine/src/render/controller.ts`, `packages/graph-engine/test/facade.test.ts`, `packages/graph-engine/test/renderer-lifecycle.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/facade.test.ts test/renderer-lifecycle.test.ts`

- [ ] **T4 (P2, human: ~2h / CC: ~25min)** — density — Lock 2000-node point-map density budgets
  - Surfaced by: Performance/Test Review — small samples do not prove upper-bound readability.
  - Files: `packages/graph-engine/src/render/model.ts`, `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/render-model.test.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: `cd packages/graph-engine && node --import tsx --test test/render-model.test.ts test/sigma-global-renderer.test.ts`

- [ ] **T5 (P2, human: ~3h / CC: ~35min)** — browser regression — Make Phase 2 continuity repeatable
  - Surfaced by: Test Review — smoke must become a scripted regression with reload and repeated route loops.
  - Files: `tests/browser/graph-workbench-interactions.mjs`, `tests/graph-workbench-interactions.regression-1.sh`
  - Verify: `bash tests/graph-workbench-interactions.regression-1.sh`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run for this phase. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Subagent outside voices were used instead. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 12 issues found, 0 critical gaps after plan edits. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run; Phase 2 keeps existing visual direction. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run. |

- **CROSS-MODEL:** four subagents agreed Phase 2 is viable after hardening Sigma drag, fallback parity, route markers, density limits, and scripted browser coverage.
- **VERDICT:** ENG CLEARED — Phase 2 is ready to implement inside the same branch.
NO UNRESOLVED DECISIONS
