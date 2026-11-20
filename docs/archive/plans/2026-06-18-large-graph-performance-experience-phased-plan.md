# Large Graph Performance And Experience Phased Plan

Date: 2026-06-18

## Goal

Implement the large-graph global/community experience defined in `docs/spark/2026-06-18-large-graph-global-community-design.md`.

The execution must keep the product direction intact:

- Global view is a structure map, not a reading surface.
- Community focus is the reading surface.
- Current DOM/SVG remains valid for small graphs, community reading, offline detail, and UI-rich cards.
- 5000+ / 10000+ global browsing is a formal target after measurement, degradation rules, and a proven global large-graph renderer or aggregation path.
- The desktop-app direction must stay compatible with the same graph semantics: object ids, community ids, search, filters, Pin, selection, and drawer states must not become browser-only product logic.

This plan does not start implementation. It is the execution ledger for a future `/goal` run.

## Source Documents

- `docs/spark/2026-06-18-large-graph-global-community-design.md`
- `docs/plans/2026-06-17-graph-performance-optimization-context.md`
- `docs/plans/2026-06-17-graph-renderer-coordination-split-phased-plan.md`
- `docs/plans/2026-06-16-graph-six-layer-architecture-phased-plan.md`
- `AGENTS.md`
- `workbench/AGENTS.md`
- `workbench/PRODUCT.md`

## Eng Review Gate

Ready after review hardening: yes.

Blocking gaps found by review and folded into this plan:

- Phase order was corrected so lightweight drawer states, graph commands, and shared renderer adapter contracts exist before node/community click semantics change.
- Phase 1 now requires 5000 / 10000 / oversized-community measurement evidence, not only 1000-node runner success.
- Performance stages now require real measurement. Browser availability can block a performance phase; it cannot be marked pass-by-prose.
- The progress ledger now has fixed performance-record fields so results can be compared across current DOM/SVG, Sigma/Graphology, vis-network, and aggregation trials.
- Candidate global-renderer work is now a strong-prior three-route trial: Sigma/Graphology first candidate, vis-network Canvas as the strong comparison, no-new-dependency aggregation as fallback. Only one production global-renderer path may survive.
- Plan and progress files live under ignored `docs/plans/`; Phase 0 must ensure they are intentionally included in version control before implementation continues.

Drift risks to guard during execution:

- Treating current DOM/SVG as the final 10000+ global renderer before evidence exists.
- Turning "core structure / connectivity" into a second full organization mode.
- Letting global node click keep opening full reading content directly.
- Optimizing FPS by silently removing selected, searched, or pinned objects.
- Moving graph rules into the workbench host instead of keeping shared behavior in `packages/graph-engine/`.
- Binding graph semantics to a browser-only implementation that would be hard to reuse in a desktop app.

## Task Size

Level: L phased plan.

Reason: the work spans graph-engine semantics, renderer contracts, workbench drawer behavior, browser regressions, performance fixtures, candidate renderer trials, and documentation. It has natural stage boundaries and more than 10 independently verifiable work units.

## Execution Rules

- Before execution starts, create a dedicated implementation branch: `codex/large-graph-performance-experience`.
- Prefer branching from `main` with the reviewed design/plan ledger carried over. If branching from the current planning branch, first prove it contains only reviewed docs/ledger changes and no unrelated code changes.
- Make a clean-start commit before feature work begins.
- Never execute this ledger on `main`.
- Commit each verified work unit in one commit that includes both the code/docs change and the progress-file update.
- Put the task id in each commit message, for example `feat: add graph performance fixtures [task 1.1]`.
- Never commit when required verification fails.
- Never push, merge, or amend automatically.
- After a phase's acceptance checks pass and the progress file records evidence, continue to the next phase without asking for approval.
- The executing agent may only update status, evidence, measurement records, decision log, turn log, and residual risk fields in the progress file. It must not rewrite task definitions or acceptance criteria.
- Do not add npm packages unless the current task explicitly requires an isolated validation or renderer-trial dependency. The user has approved installing necessary trial dependencies, but every package change must be recorded in the progress decision log before it lands.
- Do not implement Agent questions, edge-click relationship details, desktop-specific packaging, mobile-specific graph UX, or full keyboard traversal in this plan.
- The Browser plugin may be used as a fallback visual browser check for graph flows when scriptable browser checks are unavailable, but performance decisions still require recorded data artifacts.
- Only one active production global renderer may exist at a time. Aggregation-first is allowed as the chosen staged route while a renderer is integrated later, but it must not become a second parallel global graph product.

## /goal Protocol

Each turn:

1. Read `docs/plans/2026-06-18-large-graph-performance-experience-progress.json`, then the current task in this plan.
2. Run `git log --oneline -15` and the baseline smoke check before new work.
3. Work only on the current task.
4. After verification passes, update the progress file and commit the task and progress update together.
5. If verification fails, repair within the current task or mark the task blocked with evidence. Do not skip forward.
6. When a phase is complete, record the phase acceptance evidence and continue to the next phase.

## Progress File

`docs/plans/2026-06-18-large-graph-performance-experience-progress.json`

## Baseline Smoke Check

Run before each work unit:

```bash
npm run test --workspace=@llm-wiki/graph-engine
```

If this fails before a task starts, repair the broken state first unless the failure is unrelated and impossible to separate from user changes. Record the evidence in the progress file.

## Full Verification Set

Run before final completion and where phase acceptance requires it:

```bash
npm run test --workspace=@llm-wiki/graph-engine
npm run typecheck --workspace=@llm-wiki/graph-engine
npm run build --workspace=@llm-wiki/graph-engine
npm run test --workspace=@llm-wiki-agent/web
npm run typecheck --workspace=@llm-wiki-agent/web
npm run build --workspace=@llm-wiki-agent/web
bash tests/graph-workbench-interactions.regression-1.sh
bash tests/graph-offline-phase-6.regression-1.sh
bash tests/graph-community-wash-interactions.regression-1.sh
bash tests/graph-browser-stage-4-5.regression-1.sh --target offline
```

Functional browser checks require Chrome/Playwright and available local ports. If the environment cannot run a functional browser check, mark that check blocked with evidence and use the Browser plugin as a fallback visual check when possible.

Performance checks are stricter: if no measurable browser environment is available, the current performance phase is blocked. Do not record a performance phase as passed without measurement artifacts.

## Implementation Surface Map

### Shared graph engine

Likely code surfaces:

- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/select/index.ts`
- `packages/graph-engine/src/model/atlas.ts`
- `packages/graph-engine/src/model/visibility.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`
- `packages/graph-engine/src/render/graph-renderer-root.ts`
- `packages/graph-engine/src/render/render-context.ts`
- `packages/graph-engine/src/render/nodes.ts`
- `packages/graph-engine/src/render/edges.ts`
- `packages/graph-engine/src/render/controls.ts`
- `packages/graph-engine/src/render/search.ts`
- `packages/graph-engine/src/render/toolbar.ts`
- `packages/graph-engine/src/render/overlays-presenter.ts`
- `packages/graph-engine/src/render/render-styles.ts`
- `packages/graph-engine/src/layout/spatial-index.ts`
- `packages/graph-engine/src/architecture.ts`

Likely tests:

- `packages/graph-engine/test/render-model.test.ts`
- `packages/graph-engine/test/runtime-state.test.ts`
- `packages/graph-engine/test/search-and-legend.test.ts`
- `packages/graph-engine/test/select.test.ts`
- `packages/graph-engine/test/facade.test.ts`
- `packages/graph-engine/test/interaction-contract.test.ts`
- `packages/graph-engine/test/renderer-lifecycle.test.ts`
- `packages/graph-engine/test/renderer-boundary.test.ts`
- Add focused tests for performance fixtures, budgets, aggregation, click semantics, adapter contracts, keyboard priority, and renderer behavior parity.

### Workbench host

Likely code surfaces:

- `workbench/web/src/components/GraphPanel.tsx`
- `workbench/web/src/components/RightDrawer.tsx`
- `workbench/web/src/components/GraphReader.tsx`
- `workbench/web/src/components/GraphSelection.tsx`
- `workbench/web/src/lib/drawer-state.ts`
- `workbench/web/src/lib/graph-reader.ts`
- Existing graph drawer tests under `workbench/web/test/`

Workbench owns drawer presentation, content loading, and host callbacks. It must not duplicate graph hit-testing, ranking, community focus, search/filter semantics, aggregation rules, or renderer-candidate selection logic.

### Browser and regression checks

Likely surfaces:

- `tests/browser/graph-stage-4-5.mjs`
- `tests/browser/graph-workbench-interactions.mjs`
- `tests/browser/graph-offline-phase-6.mjs`
- `tests/browser/graph-community-wash-interactions.mjs`
- `tests/graph-browser-stage-4-5.regression-1.sh`
- `tests/graph-workbench-interactions.regression-1.sh`
- `tests/graph-offline-phase-6.regression-1.sh`
- `tests/graph-community-wash-interactions.regression-1.sh`
- Add performance measurement runner, large fixture generator, and machine-readable artifacts under `/tmp` or another documented output path.

### Documentation

Likely surfaces:

- `docs/spark/2026-06-18-large-graph-global-community-design.md`
- This plan file
- The progress JSON
- Measurement reports under `docs/plans/` or `docs/graph/`
- If feature code changes become user-facing after implementation, update `CHANGELOG.md` and relevant README feature notes before push.
- Isolated throwaway validation artifacts under `/tmp` or another uncommitted path unless the plan explicitly says the artifact should be kept.

## Architecture Flow

```text
GraphData
  -> shared semantic layer
     -> object ids / community ids / search hits / Pin / selection
     -> lightweight node summary / community summary payloads
     -> enter-community and open-detail commands
  -> shared ranking and budget layer
     -> stable structure score
     -> temporary boosts
     -> label / edge / card / aggregation budgets
  -> renderer boundary
     -> DOM/SVG for small graph + community reading + offline detail
     -> Sigma/Graphology WebGL candidate for global large graph
     -> vis-network Canvas candidate for global large graph
     -> no-new-dependency aggregation fallback
  -> workbench host
     -> right drawer lightweight summary
     -> community reading drawer
     -> loading / slow / empty / unavailable states
```

Boundary rule: workbench receives semantic payloads and renders the drawer. Shared graph rules stay in `packages/graph-engine/`. Candidate renderers may change drawing technology, but not object identity, search/filter semantics, Pin semantics, or drawer action semantics.

## What Already Exists

- Graph renderer has already been split into root, controller, render pipeline, overlays presenter, and shared render context.
- Current global nodes are `HTMLButtonElement`; edges are SVG paths.
- Current node click in `controller.ts` still opens the reader callback directly.
- Current community click still selects and focuses the community immediately.
- Current node double-click still unpins.
- Current blank click in focused view retreats focus.
- Current search has a cached index and dataset-based highlighting.
- Current workbench drawer supports `graph-reader` and `graph-selection`, but not the new global lightweight node/community summary distinction.
- Graph-engine unit tests are runnable. Baseline checked during plan writing: `npm run test --workspace=@llm-wiki/graph-engine` exited 0 with 274 passing tests.

## Phase 0: Branch, Baseline, And Ledger Inclusion

Goal: start implementation safely and ensure the plan can be handed between sessions.

Implementation surfaces:

- `docs/plans/2026-06-18-large-graph-performance-experience-phased-plan.md`
- `docs/plans/2026-06-18-large-graph-performance-experience-progress.json`
- No feature code.

### 0.1 Create branch and include the execution ledger

- Create or switch to `codex/large-graph-performance-experience`.
- Prefer branching from `main` with the reviewed design/plan ledger carried over. If branching from the current planning branch, record evidence that only reviewed docs/ledger changes are inherited.
- Confirm no unrelated user changes are mixed into files this plan will edit.
- Confirm this plan file and the progress file are intentionally tracked or force-added despite `/docs/plans/` being ignored.
- Run the baseline smoke check.
- Update the progress file with branch, ledger inclusion, and baseline evidence.
- Commit only the plan/progress ledger state.

Acceptance:

- `git status --short --branch` shows `codex/large-graph-performance-experience`.
- Branch provenance is recorded: from `main` with reviewed docs carried over, or from the current planning branch with evidence that only reviewed docs/ledger changes were inherited.
- `git check-ignore -q docs/plans/2026-06-18-large-graph-performance-experience-phased-plan.md` may return ignored, but `git ls-files --error-unmatch` proves the plan and progress files are tracked after the commit.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- The progress file records the clean-start state and ledger inclusion evidence.

### 0.2 Capture existing behavior and performance baseline

- Run current graph-engine test, typecheck, and build.
- Run current workbench web test and typecheck.
- Run the stage 4.5 offline browser regression and capture dense wheel FPS.
- Write a short measurement report that records current DOM/SVG behavior, current click semantics, current browser FPS artifact path, and obvious bottleneck class.

Acceptance:

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run typecheck --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run build --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.
- `npm run typecheck --workspace=@llm-wiki-agent/web` exits 0.
- `bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` exits 0 or the task is blocked with environment evidence.
- Measurement report exists and is referenced in progress.

Automatic advancement: when both tasks pass, continue to Phase 1.

Commit boundary: one commit per task.

## Phase 1: Measurement Harness, Large Fixtures, Pass/Fail Table, And Disposable Validation

Goal: make large-graph performance measurable and prove the risky paths can be tested before product implementation.

Implementation surfaces:

- `tests/browser/`
- `tests/graph-browser-stage-4-5.regression-1.sh` or a new dedicated graph performance regression script
- `tests/fixtures/` if permanent fixtures are needed
- `packages/graph-engine/test/` for deterministic fixture generation helpers where practical
- `docs/plans/` or `docs/graph/` measurement report
- Progress file measurement records
- Temporary validation harnesses under `/tmp` or another uncommitted output path

### 1.1 Add large-graph fixture generation

- Add deterministic graph data generation for:
  - Real graph snapshot when available.
  - 1000 nodes / sparse edges.
  - 1000 nodes / dense edges.
  - 5000 nodes / sparse edges.
  - 5000 nodes / dense edges.
  - 10000 nodes / aggregation-oriented shape.
  - 10000 nodes / high-edge stress shape.
  - One oversized-community case.
  - Many-small-communities case.
  - Many search hits case.
  - Many Pin nodes case.
- Record nodes, edges, communities, largest community size, largest connected density, search hit count, Pin count, and oversized-community flag.
- Keep generated data deterministic.

Acceptance:

- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- A fixture-generation check proves each generated graph has the expected node, edge, community, largest-community, search-hit, and Pin counts.
- No large generated artifact is committed unless the plan explicitly documents why it should live in the repo.

### 1.2 Add performance measurement runner

- Measure initial render, wheel zoom, pan, hover, node click, search highlight, drawer open, enter community, return global, and repeated search/community/drawer cycles where each action exists.
- Record action timing, FPS or frame timing, long tasks, DOM node count, visible node count, visible edge count, visible label/card count, memory peak, memory after repeated cycles, and artifact path.
- Write machine-readable artifacts under a temporary output directory.
- Use the Browser plugin as fallback visual verification only when scriptable browser checks fail for functional reasons; do not replace performance artifacts with prose.

Acceptance:

- The runner exits 0 on 1000 sparse and 1000 dense fixtures.
- The runner attempts 5000, 10000, and oversized-community fixtures. If current DOM/SVG fails, the artifact records failure class and does not count as a pass.
- The artifact contains action names, graph shape metadata, timing/FPS fields, memory fields when available, pass/fail status, and artifact path.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 1.3 Write baseline performance report and provisional thresholds

- Run the runner against current DOM/SVG.
- Identify whether the main cost is drawing, computation, DOM update churn, layout, memory growth, or environment.
- Write an initial pass/fail table for each action and graph shape.
- Record provisional thresholds for:
  - Initial render time.
  - Pan/zoom frame behavior.
  - Click-to-drawer-visible time.
  - Search-highlight-visible time.
  - Enter-community time.
  - Return-global time.
  - Memory peak and repeated-cycle memory growth.
- Thresholds may be adjusted only with measurement evidence.

Acceptance:

- Baseline report exists and links to artifact paths or copied artifact summaries.
- The report names at least one bottleneck class with evidence.
- 1000, 5000, 10000, and oversized-community results are present as pass, fail, or blocked-by-measurement-environment.
- If no measurable browser environment is available, Phase 1 is blocked rather than passed.
- The progress file records exact commands, artifact locations, and fixed performance records.

### 1.4 Run disposable validation gate

- Prove the current app or offline graph entry can load the generated large-graph shapes without requiring product-code integration first.
- Define the real-graph snapshot source: who generates it, where it lives, whether it contains private data, how it is anonymized or excluded from git, and how the same shape is reproduced later.
- Define realistic edge-count caps for high-edge stress graphs so the test measures product behavior instead of feeding the browser an arbitrary impossible graph.
- Confirm the measurable browser environment: command path, browser version, local port behavior, artifact path, and Browser plugin fallback for functional visual checks.
- Confirm dependency path for Sigma/Graphology and vis-network trials: packages may be installed for isolated validation when needed, but production adoption remains blocked until the Phase 6 route decision.
- Confirm aggregation-first can be used only as a staged chosen route, not as a second user-facing global graph product alongside another renderer.
- Validate oversized-community semantics before product code: "complete community presence" may mean points, outline, subtopic/internal map, or container representation, not all nodes as cards.
- List browser-only APIs that product code must not depend on if the same graph semantics should later move into a desktop app shell.
- Delete or quarantine throwaway validation code unless it becomes a deliberate harness with tests.

Acceptance:

- A validation note exists and is referenced in progress.
- The note names the real-graph source policy and privacy handling.
- The note sets edge-count caps for 10000-node stress graphs.
- The note records measurable browser environment evidence or blocks Phase 1.
- Trial dependency approval and any installed packages are recorded before package changes.
- Oversized-community "complete presence" semantics are written clearly enough for Phase 4 tests.
- Desktop-app compatibility guardrails name concrete browser-only APIs or storage assumptions to avoid.

Automatic advancement: continue to Phase 2 only after the report exists, the runner can reproduce baseline evidence, the progress file contains fixed measurement records, and the disposable validation gate is complete.

Commit boundary: one commit per task.

## Phase 2: Semantic Boundary, Drawer Foundation, And Renderer Contracts

Goal: define graph semantics and drawer states before changing user-facing click behavior.

Implementation surfaces:

- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/facade.ts`
- `packages/graph-engine/src/select/index.ts`
- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/state.ts`
- `packages/graph-engine/src/render/model.ts`
- `workbench/web/src/lib/drawer-state.ts`
- `workbench/web/src/components/RightDrawer.tsx`
- `workbench/web/src/components/GraphPanel.tsx`
- Workbench drawer tests
- Graph-engine facade and renderer-boundary tests

### 2.1 Add shared graph summary and command contracts

- Define semantic payloads for lightweight node summary, community summary, global overview, search results, excluded object, unavailable object, enter-community, open-detail/read, show-this-object, clear-temporary-object-display, and fixed/unfixed position action.
- Keep ranking inputs in graph-engine: connection count, core nodes, strongest relations, bridge relations, search hits, Pin hints, and aggregation markers.
- Workbench must render these payloads; it must not recompute graph meaning from raw graph data.

Acceptance:

- Type/facade tests prove the new payloads preserve object id, community id, search result ids, Pin hints, and selection state.
- Tests prove the open-detail/read command is distinct from enter-community overview.
- Tests prove fixed/unfixed position is explicit and not tied to node double-click.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 2.2 Add drawer states for global lightweight summaries

- Add node summary, community summary, search-results, excluded-object, unavailable-object, global overview, drawer loading, drawer empty, and hard-error states.
- Keep `graph-reader` for full community reading/detail.
- Avoid mixing summary and full reading into the same state.
- Ensure node and community summaries have different fields and actions.

Acceptance:

- Workbench tests cover every drawer state constructor and title.
- RightDrawer renders node summary and community summary with different fields and actions.
- Tests prove lightweight summaries do not render long Markdown or full reading content.
- Tests cover empty states for missing strong relations, missing neighbors, missing community summary, no search results, and unavailable object.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

### 2.3 Define shared renderer data adapter and behavior contract

- Build one graph data adapter contract that can feed current DOM/SVG and candidate global renderers from the same `GraphData`.
- Preserve object id, community id, selected state, search hits, Pin hints, aggregation container metadata, and drawer action targets.
- Define behavior-parity tests that compare semantic output for DOM/SVG, candidate renderer trials, and aggregation fallback.
- Do not wire any candidate renderer into production UI yet.

Acceptance:

- Adapter tests prove shared object ids and state are preserved.
- Behavior-contract tests define expected semantic output for point select, container select, search highlight, selected object inside aggregation, Pin inside aggregation, and enter-community command.
- Current DOM/SVG tests still pass.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 2.4 Prepare early global-renderer trial matrix

- Create an isolated trial plan and harness boundary for:
  - Sigma/Graphology WebGL as the first candidate.
  - vis-network Canvas as the strong comparison candidate.
  - No-new-dependency aggregation as fallback.
- Do not install dependencies without explicit dependency approval.
- Record expected trial metrics, acceptance table, and rejection reasons before running the candidates.
- Keep desktop-app compatibility in the evaluation: same graph semantics must survive if the shell later becomes a desktop app.

Acceptance:

- Trial matrix exists and is referenced in progress.
- Decision log records that the project will compare WebGL, Canvas, and aggregation, but will ship at most one production global renderer path.
- Decision log allows aggregation-first only as a staged route if selected, not as a permanent parallel global graph product.
- If dependencies are required, progress records the exact dependency approval needed before package changes.

Automatic advancement: continue to Phase 3 only after summary payloads, drawer states, shared adapter contract, and trial matrix are present.

Commit boundary: one commit per task.

## Phase 3: Global Lightweight Interaction Semantics

Goal: make global view a lightweight inspection map using the Phase 2 contracts.

Implementation surfaces:

- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/facade.ts`
- `workbench/web/src/components/GraphPanel.tsx`
- `workbench/web/src/components/RightDrawer.tsx`
- Graph-engine, workbench, and browser interaction tests

### 3.1 Replace global node click with lightweight node summary

- In global view, node click must select the node and open lightweight node summary, not full page reading.
- Preserve explicit action for "open detail / read": entering the node's community and selecting the node.
- Keep Shift/multi-select behavior if still supported as advanced selection.

Acceptance:

- A graph-engine or facade test proves global node click emits lightweight selection, not `onOpenPage`.
- A workbench test proves the drawer opens in lightweight node-summary state.
- A separate explicit action test proves "open detail / read" opens community focus with that node selected.
- Browser regression covers global node click -> node summary -> open detail/read -> community focus -> selected node.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

### 3.2 Replace community click with community summary first

- Community wash and legend click select community and open community summary.
- They must not immediately enter community focus.
- "Enter community" becomes the explicit action.
- "View core node list" expands a list in the drawer; list hover lightly highlights graph nodes; list click switches to lightweight node summary without entering community.

Acceptance:

- A graph-engine test proves community click sets selected community without focus.
- Browser regression proves community wash and legend click preserve global viewport.
- Workbench drawer test proves community summary actions appear.
- Browser regression covers community summary -> core node list -> node summary -> enter community.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

### 3.3 Update blank click, double click, and fixed-position actions

- Single blank click clears selection only; it must not leave community focus.
- Blank double click remains a return-global shortcut only on true blank background.
- Node double click no longer unpins as a primary path.
- Add explicit fixed/unfixed action in node tools or drawer where the existing pin system can support it.
- Keep "reset layout" distinct from "return global".

Acceptance:

- Graph-engine tests prove blank click clears selection without changing focus.
- Browser regression proves blank double click returns global only on true blank background.
- A test proves node double click does not return global, enter community, or unpin silently.
- Pin/fixed action remains available through an explicit UI path or is marked out of scope with no hidden double-click path.
- Browser regression proves nodes, community washes, legend, search, toolbar, right drawer, and edges do not trigger blank double-click return-global.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 3.4 Preserve state on return global

- Return global fits the whole graph.
- Search, filters, Pin, fixed positions, and current selection stay intact.
- Returning with a selected node shows global lightweight node summary.
- Returning with a selected community shows community summary.

Acceptance:

- Runtime/facade tests cover return-global state preservation.
- Browser regression proves search/filter/selection/Pin remain visible after return global.
- Test proves "return global" and "reset layout" do not share behavior.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

Automatic advancement: continue to Phase 4 after global node/community click semantics and return-global state are verified.

Commit boundary: one commit per task.

## Phase 4: Budgets, Degradation, And Community Scale Rules

Goal: enforce visual budgets and community-focus scale behavior in the shared graph layer, then apply them to the current renderer.

Implementation surfaces:

- `packages/graph-engine/src/model/visibility.ts`
- `packages/graph-engine/src/model/atlas.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/nodes.ts`
- `packages/graph-engine/src/render/edges.ts`
- `packages/graph-engine/src/render/render-styles.ts`
- `packages/graph-engine/src/render/render-pipeline.ts`
- Budget and lifecycle tests

### 4.1 Add label, edge, card, and update budgets

- Define budget objects for global view and community focus using Phase 1 measurement evidence.
- Global view allows points and limited labels/edges; no node cards.
- Community focus allows cards but caps them.
- Search hits and Pin can promote priority but cannot exceed budget.
- Overflow goes to drawer/list state rather than the canvas.
- Define maximum visible nodes/edges/labels/cards and maximum interaction-time updated objects per graph shape.

Acceptance:

- Unit tests prove global view produces zero cards.
- Unit tests prove labels, edges, cards, and visible updates stay at or below configured budgets.
- Unit tests prove overflow is reported for drawer/list use.
- Budget values are recorded in the measurement report and progress decision log.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 4.2 Split stable importance from temporary boosts

- Stable structure decides core nodes, community representatives, and skeleton edges.
- Search, selected object, Pin, recent activity, and reading path act as temporary boosts only.
- Core anchors must not flicker when a search changes.

Acceptance:

- Tests prove stable core nodes remain stable across search query changes.
- Tests prove search and selection boost visible priority without rewriting stable core identity.
- Tests cover many search hits, many Pin nodes, and selected object pressured by budget.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 4.3 Add community focus size bands

- Small community: more cards and labels.
- Medium community: all nodes present, most as points.
- Large community: full outline plus strict card/label cap.
- Oversized community: subtopic/internal-map entry state.
- Numeric thresholds are initial measured values and may be adjusted only with measurement evidence.

Acceptance:

- Tests cover small, medium, large, and oversized community outputs.
- Oversized community does not render every member as a card.
- Complete community presence is preserved as points, outline, or internal-map representation.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 4.4 Add interaction-time degradation

- During pan, zoom, drag, heavy search update, and repeated large-graph interactions, hide or fade weak edges, ordinary labels, and complex effects.
- After interaction stops, restore only budget-allowed details.
- Selected, searched, pinned, and core anchors remain traceable.

Acceptance:

- Renderer lifecycle tests prove lightweight viewport updates do not rebuild full graph unnecessarily.
- Tests or browser regression prove interaction mode lowers visible detail and restores within budget.
- Measurement runner proves interaction-time updated objects remain within the Phase 4 budget.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `bash tests/graph-browser-stage-4-5.regression-1.sh --target offline` exits 0 or the functional check is marked blocked with environment evidence.

Automatic advancement: continue to Phase 5 after budget rules are enforced by tests and recorded with measurement evidence.

Commit boundary: one commit per task.

## Phase 5: Search, Filter, Aggregation, Quality Fallback, Loading, And Keyboard

Goal: preserve user intent while making bounded large-graph behavior understandable.

Implementation surfaces:

- `packages/graph-engine/src/types.ts`
- `packages/graph-engine/src/render/search.ts`
- `packages/graph-engine/src/render/controller.ts`
- `packages/graph-engine/src/render/model.ts`
- `packages/graph-engine/src/render/controls.ts`
- `packages/graph-engine/src/render/legend.ts`
- `workbench/web/src/lib/drawer-state.ts`
- `workbench/web/src/components/GraphPanel.tsx`
- `workbench/web/src/components/RightDrawer.tsx`
- Graph-engine, workbench, keyboard, and browser tests

### 5.1 Preserve layout for search, filter, and drawer changes

- Search updates highlighters, fading, and result list without full layout rebuild.
- Filter hides or fades default content without automatic global re-layout.
- Drawer open/close/content change does not trigger graph rebuild.
- Only explicit reset layout or core-structure auxiliary view may reorganize layout.

Acceptance:

- Renderer lifecycle test counts or probes prove drawer change does not call graph rebuild.
- Search tests prove cached index reuse and no full layout recomputation.
- Browser regression proves search highlights appear without visible graph jump by checking stable coordinates or transform.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

### 5.2 Define filtered-out selected object behavior

- If search/filter excludes the selected object, keep the drawer object.
- "Show this object" creates a temporary exception with necessary one-hop context.
- It must not clear search or filters.
- If the object no longer exists, show unavailable state.

Acceptance:

- Unit tests prove selected object survives exclusion.
- Workbench test proves drawer shows excluded-object copy and actions.
- Browser regression proves "show this object" preserves search/filter, shows temporary context, and can be cleared.
- Test proves unavailable object state appears after data refresh.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

### 5.3 Add community aggregation container rules

- Aggregated communities look like containers, not ordinary nodes.
- Containers show selected/internal search/Pin markers and counts.
- Container click opens community summary first.
- Search and Pin lists inside a container are available through the drawer.

Acceptance:

- Render-model tests prove aggregated containers include node count, hit count, Pin count, and selected marker data.
- Browser regression proves clicking an aggregated container opens summary without entering community focus.
- Browser regression proves the drawer lists internal search hits and Pin nodes when present.
- Visual or DOM assertion proves aggregated container uses distinct role/class.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 5.4 Add community quality fallback

- Detect weak community quality using explicit signals: oversized community, many tiny communities, mixed cross-community edges, weak labels, abnormal community count.
- Show a light warning for moderate quality.
- Reduce visual certainty of community boundaries for poor quality.
- Provide only "core structure / connectivity" as first-stage auxiliary view.
- Do not add type/source/time organization modes.

Acceptance:

- Tests cover moderate and poor community quality.
- Poor-quality output lowers boundary certainty and exposes core-structure auxiliary state.
- No type/source/time organization UI appears in first-stage paths.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.

### 5.5 Add loading, slow, error, and core keyboard paths

- Initial graph load, layout running, search running, drawer loading, community transition, performance degradation, missing data, and hard error have visible states.
- Drawer opens before content finishes loading.
- Empty states must be honest and not use fake recommendations.
- Search results support up/down and Enter.
- Tab reaches drawer actions, search results, core-structure auxiliary action, and return-global.
- Escape priority: close search/tooling, clear selection, return global when already in community focus with no selection.
- Escape must not clear Pin or reset layout.
- No full graph-node keyboard traversal is required.

Acceptance:

- Workbench tests cover loading, error, empty, missing, unavailable, and hard-error states.
- Browser regression proves drawer loading state appears before loaded content for a simulated delayed node.
- Graph-engine keyboard tests cover Escape priority and search result action behavior.
- Workbench tests or browser regression cover Tab-reachable drawer actions.
- Tests prove Escape does not clear Pin or reset layout.
- `npm run test --workspace=@llm-wiki/graph-engine` exits 0.
- `npm run test --workspace=@llm-wiki-agent/web` exits 0.

Automatic advancement: continue to Phase 6 after search/filter, aggregation, loading, and keyboard paths are verified.

Commit boundary: one commit per task.

## Phase 6: Global Large-Graph Renderer Trials And Route Decision

Goal: evaluate the future global renderer path without disrupting community reading.

Implementation surfaces:

- Isolated graph-engine trial module or test harness.
- `packages/graph-engine/package.json` only if an approved dependency is needed.
- `tests/browser/` measurement runner.
- Measurement report under `docs/plans/` or `docs/graph/`.
- Progress performance records and decision log.

### 6.1 Run Sigma/Graphology WebGL trial

- Trial Sigma/Graphology as the first candidate when dependency approval exists.
- Use the same graph shapes as Phase 1.
- Measure render, pan, zoom, search highlight, point select, container select, memory behavior, and repeated-cycle memory growth.
- Verify behavior parity using the Phase 2 adapter contract.

Acceptance:

- Candidate trial runs on 1000, 5000, 10000, and oversized-community graph shapes or records a blocked reason with evidence.
- Measurement report compares candidate output to current DOM/SVG baseline.
- Behavior-contract tests prove object id, community id, search hit, Pin, selected object, and aggregation markers remain semantically identical.
- No production workbench path switches to the candidate yet.

### 6.2 Run vis-network Canvas comparison trial

- Trial vis-network as the Canvas comparison candidate when dependency approval exists.
- Use the same graph shapes, actions, and behavior contract as the Sigma/Graphology trial.
- Evaluate whether vis-network's built-in graph control model conflicts with llm-wiki search, Pin, community, and drawer semantics.

Acceptance:

- Candidate trial runs on the same graph shapes or records a blocked reason with evidence.
- Measurement report compares vis-network to Sigma/Graphology, current DOM/SVG, and aggregation fallback.
- Decision notes explicitly record integration risks and semantic ownership risks.
- No production workbench path switches to the candidate yet.

### 6.3 Run no-new-dependency aggregation fallback trial

- Trial aggregation-only global rendering with the current stack.
- Use community containers, skeleton edges, selected/search/Pin markers, and drawer overflow lists.
- Treat this as fallback or staged path, not as proof that current DOM/SVG can hard-carry full 10000+ detail.

Acceptance:

- Aggregation trial runs on 1000, 5000, 10000, and oversized-community graph shapes or records a blocked reason with evidence.
- Measurement report records where aggregation is sufficient and where it fails product expectations.
- Behavior-contract tests prove container select and internal markers remain semantically correct.

### 6.4 Choose or reject the global renderer path

- Decide whether Sigma/Graphology, vis-network, or aggregation-only is good enough to become the single global large-graph path.
- If no candidate is good enough, record why and what the next candidate must prove.
- If a candidate is good enough, document the integration boundary for a future plan.
- Keep current DOM/SVG for community reading unless a future plan proves otherwise.

Acceptance:

- Decision log records candidate, reason, rejected alternatives, and evidence.
- The plan does not leave two global renderer paths active in production.
- Final report states whether the next plan should integrate Sigma/Graphology, integrate vis-network, ship aggregation-first, or continue candidate research.
- No unapproved dependency or production renderer path is added.

Automatic advancement: continue to Phase 7 only after the route decision is recorded.

Commit boundary: one commit per task.

## Phase 7: Final Regression, Documentation, And Release Readiness

Goal: prove the experience works end-to-end and leave the next step clear.

Implementation surfaces:

- All changed graph-engine, workbench, tests, and docs.
- `CHANGELOG.md` and README feature notes if implementation changes user-visible behavior.

### 7.1 Run full verification set

- Run all commands in the Full Verification Set.
- Capture performance artifacts for real graph when available, 1000 sparse, 1000 dense, 5000 sparse/dense, 10000 aggregation, 10000 high-edge, oversized-community, many-small-communities, many-search-hits, and many-Pin shapes.

Acceptance:

- Every non-browser command exits 0.
- Functional browser checks exit 0 or are marked blocked with environment evidence and Browser plugin fallback evidence when possible.
- Performance checks produce artifacts; if the performance environment is unavailable, final completion is blocked.
- Performance artifacts are recorded in progress using the fixed fields.

### 7.2 Update docs and user-facing notes

- Update design or implementation notes with measured budget values.
- Update deferred parking lot if any item was intentionally kept out.
- Update changelog/readme if user-visible behavior changed.

Acceptance:

- `docs/spark/2026-06-18-large-graph-global-community-design.md`, this plan, and progress agree on stage results and out-of-scope boundaries.
- No stale references say global node click opens full reading directly.
- No stale references say first-stage supports type/source/time organization modes.
- Desktop-app direction remains recorded as same graph semantics, not separate product logic.

### 7.3 Final self-review

- Check every design requirement is implemented, verified, deferred with rationale, or explicitly assigned to a future plan.
- Check no unapproved dependency or production renderer path was added.
- Check worktree contains no unrelated changes mixed into this plan's files.

Acceptance:

- `git status --short` shows only expected files before final commit.
- `rg -n "组织方式切换条|边关系摘要|直接打开完整阅读|10000\\+.*DOM/SVG.*硬撑" docs packages workbench tests` has no stale conflicting references, or each remaining match is documented as historical context.
- Progress file status is `completed` with final residual risk.

Automatic advancement: none. Plan is complete after Phase 7.

Commit boundary: one commit per task.

## Test And Eval Plan

- Unit tests protect model budgets, state transitions, selection preservation, ranking stability, drawer constructors, adapter contracts, keyboard priority, and renderer behavior parity.
- Browser regressions protect full click flows: global node summary, open detail/read, return global, community summary, enter community, blank click, blank double click, search/filter preservation, excluded object, aggregation container, and drawer loading.
- Measurement artifacts protect performance decisions from subjective "feels smooth" language.
- Workbench tests protect drawer loading/error/empty states, summary content inclusion/exclusion, and action routing.
- Candidate renderer trials must run the same semantic contract, not only performance measurement.

## Test Coverage Diagram

```text
CODE PATHS                                      USER FLOWS
[+] Phase 1 measurement                         [+] Large graph baseline
  ├── 1000 sparse/dense fixtures                  ├── [GAP->TEST] 1000 pan/zoom/click/search/drawer
  ├── 5000 sparse/dense fixtures                  ├── [GAP->TEST] 5000 pan/zoom/search/drawer
  ├── 10000 aggregate/high-edge fixtures          ├── [GAP->TEST] 10000 aggregate/high-edge
  └── memory repeated-cycle records               └── [GAP->TEST] repeated search/community/drawer cycles

[+] Phase 2 semantics + drawer                  [+] Summary before depth
  ├── summary payload contracts                   ├── [GAP->TEST] node summary excludes long reading
  ├── drawer state constructors                   ├── [GAP->TEST] community summary core list
  └── renderer behavior contract                  └── [GAP->TEST] same ids/search/Pin across renderers

[+] Phase 3 interactions                        [+] Navigation flow
  ├── node click -> summary                       ├── [GAP->E2E] node summary -> open detail -> return global
  ├── community click -> summary                  ├── [GAP->E2E] community summary -> enter community
  ├── blank click clears selection                ├── [GAP->E2E] blank click stays in community
  └── blank double click returns global           └── [GAP->E2E] blank double click only true background

[+] Phase 4/5 budgets + intent                  [+] Intent preservation
  ├── budgets cap labels/edges/cards              ├── [GAP->TEST] many search hits / many Pins
  ├── filtered selected object survives           ├── [GAP->E2E] show-this-object preserves filters
  ├── aggregation markers                         ├── [GAP->E2E] container lists internal hits/Pins
  └── keyboard priority                           └── [GAP->TEST] Escape does not clear Pin/reset layout

COVERAGE TARGET: every GAP above must be converted to an explicit test or browser regression before final completion.
```

## Failure Modes And Recovery

| Failure mode | User-visible risk | Planned recovery | Verification |
|---|---|---|---|
| Node click still opens full reading in global view | User loses map context | Route click to lightweight summary; explicit action opens reading | Facade/workbench tests and browser click regression |
| Community click still enters focus directly | Global/community modes blur | Community click opens summary first | Controller test and browser regression |
| Phase 2 tries to use drawer states that do not exist | Execution creates hidden shortcuts | Build semantic payloads and drawer states before click changes | Phase 2 acceptance gate |
| Search/filter rebuilds layout | Map jumps and feels slow | Preserve layout; update highlight/fade/list only | Renderer lifecycle test and browser regression |
| Selected object disappears under filter or aggregation | User loses current object | Keep drawer object and show temporary exception or container marker | Runtime, drawer, and browser tests |
| Too many labels/cards/edges render | Large graph gets slow | Enforce budgets and overflow lists | Render-model budget tests and performance records |
| Interaction updates too many objects | Pan/zoom feels stuck | Interaction-time update budget | Lifecycle tests and measurement runner |
| Memory climbs after repeated cycles | Long sessions degrade | Repeated search/community/drawer memory check | Performance runner memory records |
| Poor community quality looks authoritative | User trusts misleading grouping | Lower boundary certainty and expose core-structure auxiliary view | Quality fallback tests |
| Candidate renderer forks product logic | Two graph products emerge | Shared adapter and behavior parity contract | Adapter tests, behavior-contract tests, decision log |
| Performance environment is unavailable | Team guesses instead of measuring | Block performance phase until measurable | Progress records blocked status |

## Not In Scope

- Agent questions.
- Edge-click relationship detail drawer.
- Type/source/time organization modes.
- Mobile or narrow-screen graph-specific UX.
- Desktop app packaging and native storage.
- Full keyboard traversal across all graph nodes.
- Cloud or server-side graph service.

## What Already Exists

Existing code reused by the plan:

- DOM/SVG graph renderer for community reading, small graph, and offline detail.
- `d3-force` simulation and pin/fixed-position model.
- Graph runtime state and controller split.
- Cached search index and search highlighting.
- Workbench right drawer shell.
- Existing graph-engine, workbench, and browser regression tests.

Existing code that must change semantics:

- Global node click currently opens reader.
- Community click currently enters focus immediately.
- Blank click currently retreats focused view.
- Node double-click currently unpins.
- Workbench drawer lacks lightweight node/community summary states.

## Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 measurement | `tests/`, `packages/graph-engine/test/`, docs/progress | Phase 0 |
| Phase 1.4 disposable validation | temporary harnesses, docs/progress | Phase 1 measurement |
| Phase 2 semantic contracts | `packages/graph-engine/`, `workbench/web/` | Phase 1.4 |
| Phase 3 interactions | `packages/graph-engine/`, `workbench/web/`, `tests/` | Phase 2 |
| Phase 4 budgets | `packages/graph-engine/`, `tests/` | Phase 1, Phase 2 |
| Phase 5 search/filter/drawer states | `packages/graph-engine/`, `workbench/web/`, `tests/` | Phase 2, Phase 3 |
| Phase 6 renderer trials | isolated trial module, `tests/browser/`, docs/progress | Phase 1, Phase 2 |
| Phase 7 final verification | all touched modules | Phases 0-6 |

Parallel lanes:

- Lane A: Phase 1 measurement, then Phase 4 budgets.
- Lane B: Phase 2 semantic/drawer contracts, then Phase 3 interactions and Phase 5 drawer/search behavior.
- Lane C: Phase 6 renderer trial harness can start after Phase 1 and Phase 2 contracts, but candidate dependency work must stay isolated.

Execution order: run Phase 0 sequentially. Run Phase 1 sequentially because later gates depend on its artifacts. After Phase 2 contracts land, Phase 4 budget modeling and Phase 6 isolated renderer trials can proceed in parallel worktrees if the team wants to split work. Merge before Phase 7.

Conflict flags: Phases 2, 3, and 5 all touch `workbench/web` and `packages/graph-engine` interaction seams; keep them sequential unless worktrees coordinate carefully.

## Decision Log

| Decision | Reason | Rejected alternatives | Source |
|---|---|---|---|
| Use staged complete plan | Work spans measurement, behavior, UI, performance, and renderer trials | 1000-node MVP | User direction and eng review |
| Keep DOM/SVG for community reading | It remains suitable for cards, labels, drawer context, and smaller scoped views | Replace all graph rendering immediately | Design doc |
| Do not require current DOM/SVG global view to pass 10000+ | Current global path is DOM/SVG and likely cannot carry that scale without degradation or new renderer | Make current renderer hard-pass 10000+ | Design doc and code inspection |
| Move lightweight drawer and semantic contracts before click semantics | Click flows cannot be cleanly verified without drawer states and commands | Let Phase 2 secretly build Phase 5 | Eng review D2 |
| Phase 1 must measure 5000 and 10000 early | 1000 is only a baseline; late 10000 evidence would hide core risk | Treat 1000 as first-stage target | Eng review D3 |
| Use strong-prior three-route renderer trial | Sigma/Graphology is first candidate, vis-network validates Canvas, aggregation is fallback | Pick one library on taste alone | Eng review D4 |
| Allow aggregation-first only as a staged selected route | Short-term aggregation and long-term renderer integration can be a sequence, but not two parallel user-facing global graph products | Maintain two production global graph experiences | Outside voice |
| Performance phases block without measurement | "Could not run browser" cannot prove smoothness | Continue with prose or manual feel | Eng review D6 |
| Add fixed performance records to progress ledger | Future comparisons need numbers, not just "evidence exists" | Record pass/fail only | Eng review D7 |
| Add disposable validation gate and allow necessary trial installs | Unknowns should be proven in throwaway harnesses before product code; user approved installing what the trial needs | Productize validation code immediately or avoid dependencies entirely | Eng review D8 |
| Edge first stage is visual/passive | Relationship detail adds another selection object and drawer state | Make edge click interactive immediately | Design review decisions |

## Residual Risk

- Exact performance budgets are provisional until Phase 1 measurement.
- Browser performance can vary by machine; comparisons must use same environment before/after.
- Candidate renderer dependencies may require explicit user approval before package changes.
- Trial dependencies are approved for isolated validation, but production dependency adoption still depends on the Phase 6 route decision.
- Some functional browser regressions may be blocked by local Chrome/Playwright availability; blocked checks must be recorded, not treated as passed.
- Performance regressions cannot be marked passed without measurement artifacts.
- Desktop app packaging is out of scope, but graph semantics must remain reusable.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — plan/progress — Force ledger inclusion in Phase 0
  - Surfaced by: Architecture review — plan files live under ignored `docs/plans/`.
  - Files: `docs/plans/2026-06-18-large-graph-performance-experience-phased-plan.md`, `docs/plans/2026-06-18-large-graph-performance-experience-progress.json`
  - Verify: `git check-ignore`, `git ls-files --error-unmatch`
- [ ] **T2 (P1, human: ~1 day / CC: ~1h)** — measurement — Add 5000/10000 early measurement and fixed performance records
  - Surfaced by: Test and performance reviews — Phase 1 only required 1000-node runner success.
  - Files: `tests/browser/`, `packages/graph-engine/test/`, progress file
  - Verify: performance artifacts for 1000, 5000, 10000, oversized community
- [ ] **T3 (P1, human: ~4h / CC: ~45min)** — validation — Add disposable validation gate before product implementation
  - Surfaced by: Outside voice — risky unknowns should be proven in throwaway harnesses before product code.
  - Files: validation note, progress file, temporary harness output
  - Verify: real-graph policy, browser environment, dependency path, edge caps, oversized-community semantics, desktop guardrails
- [ ] **T4 (P1, human: ~1 day / CC: ~2h)** — semantics/drawer — Build lightweight drawer and graph command contracts before click changes
  - Surfaced by: Architecture review — Phase 2 depended on Phase 5 drawer states.
  - Files: `packages/graph-engine/src/types.ts`, `packages/graph-engine/src/facade.ts`, `workbench/web/src/lib/drawer-state.ts`, `workbench/web/src/components/RightDrawer.tsx`
  - Verify: graph-engine and workbench drawer tests
- [ ] **T5 (P1, human: ~1 day / CC: ~2h)** — renderer boundary — Add shared adapter and behavior parity contract
  - Surfaced by: Architecture and testing reviews — candidate renderers could fork product semantics.
  - Files: `packages/graph-engine/src/`, `packages/graph-engine/test/`
  - Verify: adapter tests for ids, search, Pin, selection, aggregation
- [ ] **T6 (P1, human: ~2 days / CC: ~3h)** — renderer trials — Compare Sigma/Graphology, vis-network, and aggregation fallback
  - Surfaced by: Performance review — one late candidate trial hides 10000+ route risk.
  - Files: isolated trial module, `tests/browser/`, measurement report
  - Verify: candidate comparison report and route decision log
- [ ] **T7 (P2, human: ~1 day / CC: ~2h)** — browser regressions — Add full user-flow tests
  - Surfaced by: Testing review — single interaction tests miss state conflicts.
  - Files: `tests/browser/`, graph regression scripts
  - Verify: node/community/blank/return/search/filter/aggregation flows

## /goal Starter

```text
/goal Implement docs/plans/2026-06-18-large-graph-performance-experience-phased-plan.md by following its execution ledger.

The progress JSON is the source of truth. Continue from its current phase/task; do not restart Phase 0 or redo completed tasks unless verification proves the recorded state is wrong.

When the current task touches graph interaction, drawer behavior, global/community mode, loading states, or performance route decisions, read the matching section of docs/spark/2026-06-18-large-graph-global-community-design.md before editing. The plan is the execution ledger; the design doc is the product-behavior reference when UX intent is ambiguous.

If the worktree already contains uncommitted edits for the current task, inspect them as in-progress work and continue from there. Do not overwrite, discard, or duplicate current-task changes; keep unrelated dirty files out of commits.

If the progress file has advanced but the worktree still contains uncommitted files, first determine whether those files are completed evidence from the immediately previous task. If yes, verify and commit that previous task before starting the progress file's next task; do not strand a finished task as unrelated dirty work.

Each turn:
1. Read docs/plans/2026-06-18-large-graph-performance-experience-progress.json, then the current task in the plan.
2. Run `git status --short --branch`, `git log --oneline -15`, and `npm run test --workspace=@llm-wiki/graph-engine`; repair a broken state before starting new work.
3. Work only on the current task, and keep unrelated worktree changes out of task commits.
4. After verification passes: update the progress file (status, evidence, measurement records, and log fields only) and commit the code change plus that update together, with the task id in the message. Never commit on failed verification. Never push, merge, or amend.
5. When a phase's acceptance checks all pass, record it and continue to the next phase without asking for approval.

If docs/plans, docs/spark, or .superpowers already contain unrelated dirty changes, leave them untouched and unstaged unless they are explicitly part of the current task evidence. Do not bundle planning leftovers into a feature-task commit just because they are in the worktree.

Use the progress file to decide which phase gates still apply. Do not re-run completed Phase 0/Phase 1 gates unless fresh verification proves their recorded evidence is wrong. If the current task depends on an earlier unfinished or contradicted gate, repair that gate first and record the reason in the progress file.

If Phase 0 is not complete, prove branch provenance and ledger inclusion before feature work: prefer branching from main with the reviewed design/plan ledger carried over; if branching from the current planning branch, record evidence that only reviewed docs/ledger changes were inherited. The plan and progress files live under ignored docs/plans, so intentionally track or force-add them before continuing.

If Phase 1 validation is not complete or a later task invalidates it, complete the disposable validation gate before product implementation: define real-graph source/privacy policy, measurable browser environment, edge-count caps, oversized-community semantics, desktop-app guardrails, and trial dependency records. Browser plugin checks may be used only as a functional visual fallback; performance phases require machine-readable measurement artifacts. Necessary trial packages are already approved for isolated validation when the current task requires them: install them without asking for repeat confirmation, record every package change in the progress decision log, verify the result, and keep production dependency adoption blocked until the Phase 6 route decision.

Treat 5000 and 10000 graph-shape results as required evidence. Current DOM/SVG failure at those sizes is a valid recorded failure class, not a reason to skip measurement or mark the phase passed.

Keep one production global graph route. Sigma/Graphology, vis-network, and aggregation fallback may be compared in isolated trials, but the final implementation must not leave multiple parallel global graph experiences.

If Phase 6 is already complete, do not reopen renderer selection by default. Treat docs/graph/performance/2026-06-19-phase-6-4-global-renderer-route-decision.md as the chosen route record: Sigma/Graphology is the next single global large-graph renderer path, vis-network remains only a measured fallback if Sigma hits a hard blocker, and aggregation remains a degradation strategy rather than a second product.

Preserve the product architecture: current DOM/SVG remains the rich small-graph and community-reading path; new renderer or aggregation work is for global large-graph browsing, while shared object ids, community ids, search, Pin, selection, and drawer semantics must stay reusable for the later desktop app.

Do not downscope acceptance criteria to fit the current implementation. If a listed behavior needs shared graph support, implement that support inside the current task or mark the task blocked with evidence instead of quietly weakening the interaction.

Done when every task is complete, every acceptance check is proven, performance records are present for the required graph shapes, and the progress file records final status and residual risk.

Stop and report if a product decision is missing, the plan conflicts with the latest design, a performance phase has no measurable browser environment, a production dependency would be added before the Phase 6 route decision, a trial dependency is needed but not recorded in progress, or unrelated worktree changes cannot be safely separated.
```

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Scope challenge | accepted complete scope | User chose complete non-MVP plan; phase gates were hardened instead of reducing target. |
| Architecture review | issues folded | Reordered drawer/semantic contracts before interaction changes; added shared adapter and desktop-app guardrails. |
| Test review | issues folded | Added full-flow browser requirements, excluded-object flow, aggregation drawer tests, keyboard priority, and loading/slow states. |
| Performance review | issues folded | Added early 5000/10000 measurement, fixed performance records, memory-cycle checks, performance environment blocking rule, and three-route renderer trial. |
| Outside voice | ran | Added disposable validation gate, concrete source/dependency/environment checks, and trial-install approval boundary. |

VERDICT: PLAN HARDENED — ready for a future `/goal` implementation after Phase 0 ledger inclusion.

NO UNRESOLVED DECISIONS
