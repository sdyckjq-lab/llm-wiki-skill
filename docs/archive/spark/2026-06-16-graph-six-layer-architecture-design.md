# Graph Six-Layer Architecture Design

Date: 2026-06-16
Status: Ready for user review
Branch context: continue from `codex/graph-interaction-architecture`; do not merge the current branch into `main` before the known interaction gaps are resolved.

## Purpose

This design defines the next graph architecture step for llm-wiki. The goal is not to patch three visible bugs one by one. The goal is to make the graph a self-owned, testable interaction module whose input, camera, state, rendering, layout, and host integration boundaries are explicit.

The current graph architecture already improved coordinate, runtime state, hover, community wash, and browser regression coverage. However, recent real use exposed that the graph still does not fully own its interaction surface:

- Trackpad zoom inside the graph can become browser page zoom.
- A fast node drag release can fail to persist the released position.
- Blank-canvas pan can select toolbar text through native browser selection.

These are symptoms of the same class of problem: browser default behavior, renderer event handling, DOM hit order, graph state, and graph camera rules are not yet fully owned by a single graph interaction architecture.

## Core Decision

Use a complete six-layer graph architecture, implemented through continuous takeover rather than a one-shot rewrite.

The chosen route is:

1. Keep DOM + SVG rendering for now.
2. Do not switch to WebGL/Pixi.js/Three.js in this project phase.
3. Build the six-layer architecture as the long-term foundation.
4. Make each phase truly take over an old responsibility.
5. Do not allow new architecture interfaces and old renderer-owned behavior to coexist indefinitely.

WebGL is not rejected forever. It is deferred until graph scale or profiling proves that DOM + SVG cannot meet performance needs. The current issues are interaction ownership problems, not rendering throughput problems.

## Goals

- The graph owns pointer, wheel, trackpad, touch, and keyboard interaction inside its own graph surface.
- Browser default behavior cannot interfere with graph gestures except in explicitly allowed text/input/reader areas.
- Workbench graph and offline HTML graph pass the same core interaction contracts.
- GraphViewport is the only coordinate conversion authority.
- GraphGestures is the only raw input and intent classification authority.
- GraphState is the only graph-local runtime state authority.
- GraphRenderer draws graph UI but does not decide gesture meaning.
- SpatialIndex becomes the final hit-testing authority for nodes, edges, communities, and blank graph space.
- `static-renderer.ts` is reduced to a compatibility shell or replaced by focused modules.
- Known bugs and adjacent interaction risks are covered by tests or repeatable browser verification before the work is considered complete.

## Non-Goals

- Do not migrate to WebGL, Pixi.js, Three.js, or Canvas in this phase.
- Do not do a one-shot renderer rewrite that deletes all existing behavior at once.
- Do not introduce free-form lasso selection, right-click menus, graph editing, or complex multi-touch editing as new product features.
- Do not make community membership editable through drag. Drag changes layout position only.
- Do not accept "new interfaces exist but old interaction logic still owns behavior" as complete.
- Do not treat workbench verification as enough if generated offline HTML regresses.

## Hard Problems To Resolve First

These are not optional follow-ups. They are the first acceptance group:

1. Trackpad zoom inside graph-owned space zooms the graph, not the browser page.
2. Wheel or trackpad zoom over nodes, edges, community washes, and blank graph space uses the same graph zoom path.
3. Fast node drag release persists the final released position.
4. Blank-canvas pan never creates native text selection in toolbar, title, node labels, or surrounding page chrome.
5. Nodes can be dragged outside community washes.
6. Community washes remain soft visual regions, not drag fences.
7. Workbench and offline HTML both pass the same behavior.

## Interaction Risk Audit

Phase 0 must create and maintain an interaction risk audit. The audit is a hard gate before large module migration. It must include, at minimum:

- Trackpad pinch and trackpad wheel behavior.
- Browser page zoom prevention inside graph-owned space.
- Native text selection prevention during graph gestures.
- Native page scroll prevention or reset behavior inside graph-owned space.
- Fast drag release, pointer cancel, lost pointer capture, and Escape cancellation.
- Click versus drag threshold behavior for node, community wash, edge, and blank graph.
- Toolbar, search, legend, minimap, drawer, and reader boundaries.
- Hover preview anchoring after zoom, pan, drag, resize, drawer open, and community focus.
- Data refresh while dragging.
- Keyboard behavior for Escape, Tab, Enter, Space, arrow keys, plus, minus, and zero.
- Touch behavior for one-finger pan, node drag, pointer cancellation, and visible fallback controls.
- Workbench and offline HTML parity.

The audit must name the expected behavior, the owner layer, and the verification method for each item.

## Six Layers

### 1. GraphData

GraphData describes graph truth:

- Nodes.
- Edges.
- Communities.
- Source metadata.
- Node and edge types.
- Weights and confidence.

GraphData does not know:

- Screen position.
- Current viewport.
- Hover state.
- Pointer state.
- Drawer state.
- DOM elements.

### 2. GraphLayout

GraphLayout converts graph truth into graph structure that can be drawn and interacted with:

- Node world positions.
- Edge routes.
- Community wash geometry.
- Pinned positions.
- Simulation state.
- Drag influence behavior.
- SpatialIndex output.

GraphLayout owns SpatialIndex because hit testing depends on layout world positions, not the current DOM stacking order.

GraphLayout does not know:

- Browser events.
- React/workbench drawer behavior.
- CSS DOM details.
- Screen pixels, except through explicit viewport inputs where needed for culling.

### 3. GraphViewport

GraphViewport is the graph camera:

- World-to-screen conversion.
- Screen-to-world conversion.
- Zoom around pointer.
- Pan.
- Fit graph.
- Center on node/community.
- Resize anchoring.
- Minimap viewport projection.
- Zoom levels and density thresholds.

Rules:

- No other layer hand-rolls coordinate conversion.
- Drag target projection must go through GraphViewport.
- Hover preview anchors must go through GraphViewport.
- Minimap projection must go through GraphViewport.
- GraphViewport may constrain camera movement, but must not hide drag target constraints inside coordinate conversion.

### 4. GraphRenderer

GraphRenderer draws the graph:

- Node DOM.
- Edge SVG.
- Community washes.
- Minimap.
- Hover and edge preview cards.
- Offline reader panel.
- Workbench-compatible graph surface.
- Toolbar visual state.
- Density display variants.

GraphRenderer is not allowed to decide:

- Whether a pointer sequence is a click, drag, pan, or zoom.
- Whether browser default behavior should run.
- Which graph object a pointer intends to hit once SpatialIndex takes over.
- What state is selected, hovered, focused, dragged, or pinned.

GraphRenderer can expose DOM refs or measured sizes to GraphFacade, but it cannot become the interaction owner.

### 5. GraphGestures

GraphGestures is the raw input and intent layer. It attaches to the graph root and translates browser events into graph intents.

Inputs:

- `pointerdown`, `pointermove`, `pointerup`.
- `pointercancel`, `lostpointercapture`.
- `wheel`, including trackpad wheel and browser pinch-like wheel events.
- Keyboard events while graph focus is active.
- Touch/pointer events where available.

Outputs:

- `zoomGraph`.
- `panCanvasStart`, `panCanvasMove`, `panCanvasEnd`.
- `dragNodeStart`, `dragNodeMove`, `dragNodeEnd`, `dragNodeCancel`.
- `clickNode`.
- `clickCommunity`.
- `clickBlank`.
- `hoverNode`, `hoverEdge`, `hoverLeave`.
- `keyboardCommand`.
- `blockNativeDefault`.

Rules:

- GraphGestures is the only owner of click/drag threshold policy.
- GraphGestures owns browser default prevention for graph gestures.
- GraphGestures classifies graph controls as blockers or explicit graph controls.
- GraphGestures must not directly mutate DOM or persist pins.
- GraphGestures must include final pointer coordinates on drag end so fast release can commit the right position.

### 6. GraphFacade

GraphFacade coordinates the system and preserves public API compatibility.

It owns:

- `createGraphEngine` and public graph-engine methods.
- Workbench and offline HTML compatibility.
- GraphData ingestion into GraphLayout.
- GraphGestures intent handling.
- GraphViewport state updates.
- GraphRenderer update calls.
- Host callbacks such as open page, selection change, pin persistence, ask action, and drag state change.

GraphFacade is the only layer that knows both internal graph modules and host callbacks.

## Shared GraphState

GraphState is the single graph-local runtime state owner.

It stores:

- Current viewport.
- Committed node positions.
- Pending simulation proposal positions.
- Pin snapshot.
- Hover target.
- Selected graph item.
- Focused community or graph item.
- Active gesture.
- Grab offset.
- Gesture lock.
- Toolbar/search state only if moving it removes duplicate rules.

GraphState does not store:

- Workbench drawer state.
- Host page content.
- External chat state.
- Knowledge base selection outside the graph engine.

No layer may create a hidden parallel state island for hover, drag, selection, focus, pins, or viewport.

## Browser Default Behavior Policy

Graph-owned space must be explicit.

Graph-owned surface:

- Blank graph background.
- Nodes.
- Edges.
- Community washes.
- Minimap, unless explicitly treated as a blocker.
- Graph toolbar buttons, as graph controls.

Graph-owned surface must prevent browser defaults that conflict with graph interaction:

- Native text selection during pan and drag.
- Browser page zoom for graph wheel/trackpad zoom.
- Native drag selection.
- Native page scroll inside graph root unless explicitly permitted.

Allowed browser-default areas:

- Search text input.
- Reader/article body where text selection is useful.
- Editable controls.
- Scrollable drawer/reader content where the user clearly interacts with content rather than graph canvas.

Controls such as toolbar buttons should not be text-selectable during graph panning. They can block graph gestures, but they must not let browser selection leak into graph gestures.

## SpatialIndex Scope

SpatialIndex is part of this architecture, not an optional enhancement.

Implementation policy:

1. Define SpatialIndex shape in the GraphLayout layer.
2. Test SpatialIndex independently with node, edge, community, and blank-space cases.
3. Use SpatialIndex first as an audit/check path alongside DOM hit testing.
4. In Phase 4, SpatialIndex must become the real hit-testing source for:
   - Node hits.
   - Edge hits.
   - Community wash hits.
   - Blank canvas hits.
5. After takeover, old DOM hit-order classification must be deleted or marked as a compatibility fallback with a removal gate.

Completion rule:

- Interface-only SpatialIndex is not final completion.
- SpatialIndex is final only after it owns hit testing and old DOM hit classification no longer drives graph behavior.

## Community Wash Policy

Community washes are soft visual regions, not semantic boundaries.

Rules:

- A node can be dragged outside its current community wash.
- Dragging does not change the node's community membership.
- A wash may respond to dragged or pinned outliers with bounded deformation.
- One far-away node cannot make a wash consume the canvas.
- Wash response must be capped per axis and covered by fixtures.
- Dense community plus one dragged outlier must remain readable.
- Convex hull style washes are a possible later upgrade, not part of this first implementation target.

## Continuous Takeover Phases

### Phase 0: Interaction Risk Audit

Create the audit before large migration. Add tests or repeatable browser probes for each known risk.

Required output:

- Risk list.
- Owner layer per risk.
- Workbench verification path.
- Offline HTML verification path.
- Existing test coverage status.
- Missing coverage list.

### Phase 1: GraphGestures Takes Over Input

GraphGestures becomes the only raw event classification path.

Must resolve:

- Trackpad zoom as graph zoom inside graph space.
- Prevent browser page zoom inside graph space.
- Prevent native text selection during canvas pan and node drag.
- Fast drag release persists final position.
- Pointer cancel and lost pointer capture cleanly end active gestures.
- Toolbar/search/drawer/minimap/reader boundaries are explicit.

Acceptance:

- Workbench and offline HTML pass the hard problem group.
- No renderer-local raw input classification remains active outside compatibility wrappers.

### Phase 2: GraphViewport And GraphState Close The Loops

Move all camera and runtime state ownership into GraphViewport and GraphState.

Must resolve:

- Drag target uses one screen-to-world path.
- Hover anchors use one world-to-screen path.
- Minimap uses the same viewport state.
- Resize keeps selected/focused anchor stable.
- Selection, focus, hover, active drag, and pins have one graph-local owner.

Acceptance:

- Searching, focusing, resetting, panning, dragging, and hover positioning remain consistent after zoom and drawer resize.
- No hidden renderer-only state island drives behavior.

### Phase 3: GraphRenderer Split And Slimming

Split rendering responsibilities into focused modules.

Suggested modules:

- Node renderer.
- Edge renderer.
- Community wash renderer.
- Minimap renderer.
- Overlay renderer.
- Toolbar renderer.
- Offline reader renderer.
- Density display renderer.

Acceptance:

- Renderer modules receive state and draw.
- Renderer modules do not classify raw gestures.
- `static-renderer.ts` is reduced to orchestration/compatibility only, or replaced by module composition.

### Phase 4: SpatialIndex Takes Over Hit Testing

SpatialIndex becomes the hit-test source for graph objects.

Acceptance:

- Node, edge, community, and blank hits are driven by SpatialIndex.
- DOM stacking order is no longer the source of graph intent.
- Workbench and offline HTML produce matching hit behavior.
- Old DOM hit classification is removed or isolated behind an explicitly temporary fallback with a removal gate.

### Phase 5: Community Wash Soft Boundary Completion

Finish bounded wash response and membership semantics.

Acceptance:

- Dragged outliers can influence wash shape within caps.
- Wash never becomes a drag fence.
- Wash never implies community membership has changed.
- Dense and focused community fixtures prove readability.

### Phase 6: Old Logic Removal And Dual-Target Verification

Clean up old paths and verify both graph targets.

Required cleanup:

- Old renderer-owned pointer/wheel/keyboard/dblclick classification.
- Old hand-rolled coordinate math.
- Old hover position calculations that bypass GraphViewport.
- Old DOM-order hit classification after SpatialIndex takeover.
- Old hidden drag/hover/selection/focus state.
- Old browser-default leaks.

Acceptance:

- Workbench browser verification passes.
- Offline HTML browser verification passes.
- Unit and integration tests pass.
- `static-renderer.ts` no longer owns primary interaction or coordinate logic.
- Any remaining compatibility shell has a documented reason and narrow responsibility.

## Testing Strategy

### Layer 1: Pure Logic Tests

Cover:

- GraphViewport world/screen round trips.
- Zoom around pointer.
- Resize anchoring.
- GraphState snapshot/update behavior.
- GraphGestures click/drag threshold.
- Trackpad-like wheel intent.
- Fast release drag end intent.
- Pointer cancel and lost pointer capture.
- SpatialIndex node, edge, community, blank hits.
- Community wash cap logic.

### Layer 2: DOM Integration Tests

Cover:

- Graph root disables native selection during pan/drag.
- Toolbar text is not selected during blank canvas pan.
- Controls block graph gestures where appropriate.
- Search and reader content still allow intended text/input behavior.
- Renderer does not decide gesture meaning.
- Hover and preview cards follow projected anchors.
- DOM structure works for both light and dark themes.

### Layer 3: Real Browser Verification

Run against both:

- Workbench at local dev URL.
- Generated offline HTML file.

Required paths:

- Trackpad-like zoom does not change browser page zoom.
- Wheel over blank, node, edge, and community wash changes graph zoom.
- Wheel over controls does not zoom graph.
- Fast node drag and immediate release persists final position.
- Blank pan does not create native text selection.
- Node drag does not open drawer.
- Node click opens drawer or offline reader.
- Hover preview stays attached after zoom/pan/drag/drawer resize.
- Community click enters focus.
- Node can leave wash.
- Reset returns to stable full graph.
- Root native scroll remains controlled.

## Completion Criteria

This architecture is complete only when:

1. Known hard problems are fixed in both workbench and offline HTML.
2. Interaction risk audit has tests or browser verification evidence.
3. GraphGestures owns raw input classification.
4. GraphViewport owns coordinate conversion.
5. GraphState owns graph-local runtime state.
6. GraphRenderer only renders.
7. SpatialIndex owns graph hit testing.
8. Old renderer-owned interaction and coordinate logic is removed or reduced to a documented compatibility shell.
9. No phase leaves an unowned cleanup item without an assigned next phase and acceptance gate.

## Follow-Up Landing Index

This section exists so the required follow-ups are easy to find later.

### SpatialIndex Takeover

When:

- Phase 4.

Must take over:

- Node hit testing.
- Edge hit testing.
- Community wash hit testing.
- Blank-canvas hit testing.

Must remove:

- Graph intent rules that depend on DOM stacking order as the primary source.

Not complete if:

- SpatialIndex exists but GraphGestures still relies on DOM target classification for graph object hits.

### Static Renderer Cleanup

When:

- Phase 3 begins slimming.
- Phase 6 completes removal.

Must remove or migrate:

- Raw event listeners that own gesture meaning.
- Coordinate formulas that bypass GraphViewport.
- Hidden hover/drag/selection/focus state.
- Browser default behavior policy scattered across renderer code.

Allowed final role:

- Thin compatibility shell that composes modules and preserves public API.

Not complete if:

- New graph interactions still need to be added inside `static-renderer.ts`.

### Browser Default Behavior

When:

- Phase 1.

Must prove:

- No native text selection during graph pan/drag.
- No browser page zoom from graph-owned zoom.
- Reader/search text behavior still works where intentionally allowed.

Not complete if:

- Only ordinary mouse wheel is tested and trackpad-like paths are untested.

### Workbench And Offline Parity

When:

- Every phase that changes graph behavior.

Must prove:

- Workbench graph and generated offline HTML both pass the affected interaction paths.

Not complete if:

- A behavior is verified in workbench only.

## Open Decisions For Implementation Planning

These do not block this design, but must be decided before implementation:

1. Whether Phase 1 starts from the current branch directly or from a new child branch such as `codex/graph-six-layer-architecture`.
2. Whether to add a DOM test dependency or continue using existing Node tests plus browser scripts.
3. The exact SpatialIndex grid size and edge hit tolerance.
4. The exact community wash deformation cap values after fixture review.
5. Whether `static-renderer.ts` remains as a named compatibility shell or is fully replaced by a new facade module.
