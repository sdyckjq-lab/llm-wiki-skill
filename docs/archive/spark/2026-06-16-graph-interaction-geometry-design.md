# Graph Interaction Architecture Design

Date: 2026-06-16

## Summary

The graph interaction bugs are not isolated pointer-handling mistakes. They come from an architectural gap: node placement, viewport transforms, pointer gestures, hover previews, community washes, minimap state, and render state currently compute or own positions in different places with different assumptions.

External graph architecture research confirms that the current `@llm-wiki/graph-engine` foundation is directionally strong: it already has a viewport system, live simulation, pin persistence, community tracking, density modes, and diff handling. The issue is not that the renderer technology is wrong. The issue is that the graph front-end lacks clear boundaries between state, layout, camera/geometry, gestures, overlays, and rendering.

This design upgrades the earlier "geometry layer" plan into a graph interaction architecture, but it should land as a vertical slice first. The first implementation must fix the visible regressions while putting the right boundaries in place; broader renderer splitting, spatial indexing, and zoom-level policy cleanup are follow-up gates, not prerequisites.

Every position-sensitive behavior should use one shared model:

- World position: where nodes, edges, and communities live in the graph model.
- Viewport/camera: how the user is currently looking at that world through pan and zoom.
- Screen position: where the user sees things and where the pointer is.
- Projection: the only allowed way to convert between world, layer, minimap, and screen spaces.
- Interaction rules: drag, wheel, pan, hover, and selection all use the same projection.
- Graph runtime state: one explicit owner for viewport, hover, active gesture, selected/focused graph item, and pin snapshots inside the engine.
- Renderer boundary: drawing code paints a state, but does not interpret user gestures.

The implementation should not be an MVP patch and should not be a full renderer rewrite. It should keep DOM+SVG for now, preserve the public engine API, and carve the graph front-end into explicit, testable modules only where doing so directly removes a duplicated rule or fixes a named regression.

## First Slice Status

As of 2026-06-16, the first delivery slice has landed as shared graph-engine work rather than a renderer migration. It keeps the existing public engine API, DOM+SVG renderer, workbench drawer ownership, offline built-in reader path, and persisted pin format.

Delivered boundaries:

- Geometry and camera: one tested route for world, screen, layer, SVG, and minimap projection; projection helpers do not silently clamp drag targets.
- Gestures: wheel, pointer, click, drag, community click, blank pan, UI blocker, and minimap blocker classification now share one tested path.
- Runtime state: viewport, hover, selected/focused graph item, pins, active gesture, and simulation proposals have one graph-local owner for the interaction slice.
- Overlays: node and edge hover previews are anchored from projected positions and are repositioned after viewport, drawer, and drag changes.
- Simulation bridge: node dragging preserves the grab offset, stays attached to the pointer under pan/zoom, and persists pins without firing a node click.
- Community wash: washes are visual membership regions, not drag fences; they allow wheel zoom, allow nodes to leave, and respond to outliers only within tested caps.
- Dual-host verification: both the workbench graph and generated offline HTML use the same engine behavior.

Deferred gates:

- Spatial index: add only after profiling shows current centralized classification or O(n) hit testing is the bottleneck at real user graph sizes.
- Canvas/WebGL: migrate only after profiling proves DOM+SVG rendering is the bottleneck at real user graph sizes.
- Density policy cleanup: revisit only if readability or scale problems remain after the interaction foundation is stable.
- Minimap drag navigation: add only after a product decision makes the minimap an active navigation control; the first slice treats it as a status/control blocker.

## Context

Product decisions already point in this direction:

- ADR-21 defines the graph as a living map with simulation and pinning.
- ADR-21 separates position from structure: dragging changes layout, not wikilink/community truth.
- ADR-22 defines canvas navigation as a foundation capability.
- Stage 4.6 makes local community focus the daily-use graph mode.

Recent fixes exposed the missing boundary:

- Wheel zoom over community washes needed special gesture target handling.
- Wheel zoom over nodes needed another target exception.
- Node dragging was fixed by adding viewport-aware pointer mapping, but this exposed two further problems:
  - Dragging can appear trapped inside the community wash because conversion/clamping is mixed into the wrong layer.
  - Hover previews drift because they still position themselves from pre-viewport node coordinates.

The common cause is not the community wash itself. The common cause is that interaction geometry is not centralized.

External project research adds a second conclusion: geometry centralization is necessary, but not sufficient. Mature graph products and libraries repeatedly separate these concerns:

- Layout computes graph positions and indexes.
- Camera/geometry converts those positions to what the user sees.
- Gestures translate DOM events into graph intentions.
- Renderer draws the current graph state.
- A facade coordinates state changes and host callbacks.

The closest reference is Logseq's graph architecture: data, layout logic, rendering, interaction, and orchestration are separated enough that layout logic can be tested apart from the browser. Its Pixi.js/WebGL renderer is not the right fit for llm-wiki's current scale, but its layering and single gesture pipeline are the right ideas to borrow. Athens contributes the lesson that a clean event model is useful, while full event sourcing, Datascript, CRDT, or graph database infrastructure would be too heavy here. Graphify contributes the community-detection and pipeline lessons, but its static HTML and delegated vis.js interaction model are not enough for llm-wiki's live graph.

## Goals

1. All graph interactions use one coordinate model.
2. Node dragging follows the pointer under pan, zoom, drawer resize, and community focus.
3. Nodes can be dragged outside their community wash.
4. Community wash shapes can respond to dragged nodes, but cannot grow without bounds.
5. Hover previews follow the node's actual rendered position.
6. Wheel zoom behavior is consistent over blank canvas, nodes, and community washes.
7. Pointer panning, node dragging, node click, community click, and minimap interaction do not conflict.
8. Gesture interpretation is centralized instead of spread across renderer callbacks.
9. Graph runtime state is centralized for the interaction-critical slice instead of hidden across renderer closures and DOM datasets.
10. The renderer becomes a drawing layer instead of the owner of coordinate math or interaction rules.
11. Hit testing has one explicit compatibility path now and can later be optimized with a spatial index if profiling requires it.
12. Zoom level and density decisions are not made worse by this refactor; full policy cleanup is a later gate.
13. The same engine behavior remains available to both the workbench graph and Skill/offline graph.
14. The first shipped slice produces user-visible proof: drag does not jump, hover does not drift, wheel zoom is consistent, and community washes never act as fences.

## Non-Goals

- Do not rewrite graph data generation.
- Do not change community membership semantics.
- Do not change relation edge color/typing rules.
- Do not redesign the drawer content model.
- Do not introduce a new rendering technology such as Canvas or WebGL.
- Do not add a new npm dependency.
- Do not implement free-form lasso selection.
- Do not change the knowledge-base pin storage format unless a compatibility shim proves necessary.
- Do not introduce Neo4j, Datascript, CRDT, or full event sourcing for this graph UI refactor.
- Do not migrate DOM+SVG to Canvas 2D until profiling proves the current renderer is the bottleneck.
- Do not add a graph database or LLM-driven graph rebuild step as part of this interaction refactor.
- Do not make graph-engine own the workbench drawer state; the host owns hosted reading UI.
- Do not require spatial indexing, minimap dragging, or density-policy redesign in the first slice unless profiling or implementation proves they are necessary.
- Do not require `jsdom` or a DOM test dependency unless the project explicitly accepts that new dependency.

## Design Principle

The graph is a map with a camera.

Every position-aware feature must answer these questions explicitly:

1. Is this value in world space, viewport/layer space, screen space, or minimap space?
2. Which function converts it?
3. Which layer is allowed to clamp or constrain it?
4. Is this a structural fact, a layout choice, or temporary UI state?

If a function cannot answer those questions, it should not own coordinate math.

## Coordinate Glossary

- World space: the graph model coordinate system. Node positions, pins, edges, and community regions live here.
- Screen space: CSS pixels inside the graph root. Pointer events, hover card placement, and viewport anchors live here.
- Layer space: DOM/SVG layer pixels after world-to-layer scaling but before viewport translation/zoom is applied.
- Minimap space: the minimap's own local coordinate system.
- Host space: UI outside the graph engine, such as the workbench drawer and page content.

Every coordinate helper must name its input and output spaces. Projection helpers convert values; they do not enforce layout rules.

## Ownership Rules

The first refactor needs fewer owners, not a larger app-shaped store inside graph-engine.

Source of truth:

- Graph data and community membership come from the wiki graph model.
- Current node world positions and pin snapshots are committed in graph runtime state.
- Layout and simulation compute proposed world-position updates.
- The engine coordinator commits proposed layout/simulation updates into graph runtime state and calls the host persistence callback for pins.
- The host owns workbench drawer content and reading UI. Offline HTML keeps the existing built-in reader when no host callback exists.
- Geometry owns projection only. It never decides where a node is allowed to move.
- Renderer owns drawing only. It never decides whether a pointer sequence is a click, drag, pan, or zoom.
- Gestures own event interpretation only. They emit graph intents and do not mutate DOM.

Pin compatibility:

- Persisted pins remain in the existing world coordinate format.
- Existing pins are read as-is and are not rewritten by migration code.
- Drag targets may move outside the current community wash and outside the visible viewport.
- The first slice keeps persisted pins within the current world extent unless a separate compatibility decision expands world bounds.
- Any clamping for persisted layout bounds belongs in the engine coordinator or layout constraint layer and must be named; projection functions must not silently clamp.

State classes:

- Saved layout state: pins and committed node positions.
- Local browsing state: viewport, focused community, selected graph item, open hover/preview target.
- Temporary gesture state: active drag, grab offset, pointer origin, gesture lock.
- Host-only state: workbench drawer contents, conversation state, knowledge-base path, page loading/error state.

## Proposed Architecture

Use the standard graph interaction route from the research, adapted to llm-wiki's current strengths:

```
GraphData
  -> GraphLayout
  -> GraphViewport / Geometry
  -> GraphRenderer / Overlays

DOM events
  -> GraphGestures
  -> GraphIntent
  -> GraphEngine coordinator
  -> GraphRuntimeState update
  -> Layout / Viewport / Renderer updates
```

The public API should continue to look like one graph engine. Internally, each module has a narrow job and can be tested without loading the whole renderer.

### 0. Graph Runtime State Module

Owns the interaction-critical state that is currently spread across closures, DOM datasets, and renderer-local variables.

Responsibilities:

- Store committed node world positions and pin snapshots used by the renderer.
- Store current viewport/camera state.
- Store hover target, selected graph item, focused community, and preview state.
- Store gesture state such as active drag session and gesture lock.
- Expose a small subscription mechanism for renderer updates.

Rules:

- State is not business data. The host still owns the current knowledge base, current conversation, and page content.
- State is not a new global store library. Use a small typed object and explicit update functions.
- Renderer code reads state snapshots; it does not create hidden state islands.
- Gestures produce intent; the engine coordinator decides how intent mutates state.
- Workbench drawer state stays host-owned through `onOpenPage`; offline mode keeps the built-in reader path.
- Search, toolbar, diff animation, and unrelated visual state stay where they are unless moving them removes a duplicated rule.

Expected file direction:

- New file: `packages/graph-engine/src/render/state.ts` or `packages/graph-engine/src/state/index.ts`.
- Keep it local to graph-engine. Do not introduce Zustand, Redux, or another dependency.

### 1. Viewport / Camera Module

Owns the camera state.

Responsibilities:

- Normalize viewport state.
- Pan viewport.
- Zoom viewport around a pointer.
- Fit world points into the current viewport.
- Center on a world point.
- Recompute viewport after host resize or drawer width change.
- Convert viewport state to DOM transform.
- Report the visible world rectangle for minimap and tests.

Rules:

- Viewport transforms move the camera, not the graph data.
- Opening the drawer can change the available viewport size, but cannot change node world positions.
- Viewport clamping is only about how far the user can pan the camera, not where nodes are allowed to move.

Expected file direction:

- Keep current viewport helpers in `packages/graph-engine/src/render/viewport.ts`.
- Expand it only for camera semantics.
- Move generic projection helpers to `geometry.ts` so `viewport.ts` does not become the new catch-all.

### 2. Geometry Module

Owns projection between spaces.

Responsibilities:

- World point to layer pixel.
- Layer pixel to world point.
- World point to screen point.
- Screen point to world point.
- World delta to layer delta.
- World bounds to screen/layer bounds.
- Minimap point to world point.
- World/viewport rectangle to minimap rectangle.
- DOM rect to local graph-screen point.

Rules:

- Geometry conversion functions must not silently clamp drag targets.
- If a conversion needs optional clamping for a UI case, the caller must opt in and the function name must make that obvious.
- Every consumer must pass the current viewport and viewport size explicitly.
- Hover previews, node drag, edge previews, minimap, and community washes must use this module.

Current bug prevention:

- A dragged pointer outside the current world rectangle should still produce a meaningful target for drag handling.
- Hover preview position should come from the node's actual projected position, not from `node.x` / `node.y` percentages alone.

Expected file direction:

- New file: `packages/graph-engine/src/render/geometry.ts`.
- Export through `packages/graph-engine/src/render/index.ts` only for tested public helpers.

### 3. Layout / Hit Testing Module

Owns layout outputs that are not directly about drawing.

Responsibilities:

- Keep the current static and live simulation layout behavior.
- Produce or update node world positions.
- Provide one explicit hit-test classification path for nodes, edges, community washes, minimap, and UI blockers.
- Provide hit-test candidates for nodes, edges, and community washes.
- Compute drag influence weights if connected nodes should follow the dragged node.
- Build a spatial index later only if profiling shows DOM/classification or O(n) hit testing is a real bottleneck.

Rules:

- Layout does not know DOM elements.
- Layout does not know hover cards, drawers, or toolbar controls.
- The first slice may keep DOM `closest(...)` target classification as a compatibility layer, but it must be centralized and tested.
- If graph-owned hit testing is added, it stores graph-world positions and sizes, not screen guesses.
- Hit testing must have one owned path so the renderer does not keep inventing event target rules.

Research references:

- Logseq uses a simple grid spatial index for fast hit testing.
- Graphify's community pipeline shows that deterministic community IDs and remapping matter, but llm-wiki's current Jaccard tracking is already strong and should be preserved.

Expected file direction:

- Keep `packages/graph-engine/src/sim/index.ts` for force simulation for now.
- Add `packages/graph-engine/src/render/hit-testing.ts` or `packages/graph-engine/src/render/gestures.ts` for the centralized compatibility classifier.
- Add `packages/graph-engine/src/layout/spatial-index.ts` only after measured need.
- Do not migrate the whole layout package until the interaction state boundary is stable.

### 4. Gestures Module

Owns interpretation of pointer and wheel events.

Responsibilities:

- Decide whether a wheel event should zoom the graph or be ignored for a UI control.
- Decide whether pointerdown starts blank-canvas pan, node drag, minimap interaction, or no graph gesture.
- Track drag threshold so click and drag do not conflict.
- Track node grab offset so the node does not snap to its center.
- Route node drag targets through Geometry and Simulation Bridge.
- Route blank pan deltas through Viewport.
- Handle double-click reset.

Rules:

- Nodes and community washes allow wheel zoom to pass through to the viewport.
- Nodes block blank-canvas panning because pointer drag means node drag.
- Community washes block blank-canvas panning/click only when the interaction is selecting a community; they must not block wheel zoom.
- Search, toolbar, drawer, legend, minimap, and text editing controls block graph gestures unless that control explicitly owns a graph gesture.

Expected file direction:

- New file: `packages/graph-engine/src/render/gestures.ts`.
- `static-renderer.ts` wires DOM elements to gesture handlers but does not implement gesture math.

### 5. Renderer Module

Owns DOM/SVG painting.

Responsibilities:

- Render nodes, edges, community washes, minimap, labels, and density states from graph state.
- Apply viewport transforms from the camera module.
- Update DOM incrementally where needed.
- Delegate hover preview and floating UI placement to the overlays module.

Rules:

- Renderer does not decide whether a pointer event is a drag, click, or pan.
- Renderer does not convert screen coordinates except through Geometry.
- Renderer does not own hidden selection, hover, drag, or focus state.
- Renderer remains DOM+SVG for this refactor.

Expected file direction:

- Keep `packages/graph-engine/src/render/static-renderer.ts` as the shell during migration.
- Extract focused helpers only after state, geometry, and gestures have tests.
- Do not switch to Canvas or WebGL in this phase.

### 6. Overlays Module

Owns floating UI placement and community visual shapes.

Responsibilities:

- Position hover preview near the node's actual screen position.
- Position edge hover preview near the projected edge midpoint.
- Keep hover previews inside the available graph viewport.
- Reposition previews when viewport changes, graph positions change, drawer width changes, or density mode changes.
- Compute community wash shapes from current world positions.
- Apply bounded community wash deformation.

Rules:

- Hover preview is UI overlay, not graph content. It should not scale with the graph content layer.
- Hover preview must not change world position or pin state.
- Community wash is a visual region for community membership, not a hard drag boundary.
- Community wash can stretch, but one far dragged node cannot make it consume the whole canvas.

Expected file direction:

- New file: `packages/graph-engine/src/render/overlays.ts`.
- Move `positionHoverPreview`, `positionEdgeHoverPreview`, and community wash geometry helpers into focused helpers.
- Keep visual styles in the renderer CSS for now.

### 7. Simulation Bridge

Owns the boundary between UI drag and force simulation.

Responsibilities:

- Start drag with current node world position.
- Apply drag target world position.
- Preserve pointer grab offset.
- Let nearby nodes respond according to the existing low-heat simulation.
- Freeze far nodes while dragging, as today.
- End drag and persist pin.
- Unpin on double-click.

Rules:

- Simulation should receive world-space target positions.
- Simulation may constrain graph layout only where layout rules require it.
- Pointer conversion must not be the place where layout constraints are applied.
- If node world bounds are needed, they belong to layout constraints, not projection conversion.

Expected file direction:

- Keep core force simulation in `packages/graph-engine/src/sim/index.ts`.
- Add a render-side bridge near the renderer, likely `packages/graph-engine/src/render/simulation-bridge.ts`, only if extracting from `static-renderer.ts` materially improves clarity.

### 8. Engine Coordinator

Owns orchestration between host API, graph runtime state, layout, viewport, gestures, renderer, and persistence. This may start as a cleaned-up part of the existing renderer entrypoint; it does not need to become a large new facade class on day one.

Responsibilities:

- Preserve the current public `createGraphEngine` style API.
- Register gesture intent handlers.
- Decide how graph intents mutate state.
- Call simulation, viewport, renderer, overlay, and host callbacks in the correct order.
- Keep workbench and offline Skill output on the same engine behavior.

Rules:

- The coordinator is allowed to coordinate modules.
- Other modules should not import across layers just to "reach" behavior.
- Host callbacks receive semantic events such as open page, selection changed, pin persisted, and focus changed.
- Do not move workbench drawer ownership into graph-engine.

## Community Wash Behavior

Community wash represents the visible region of a community. It is not a fence and it must not imply that dragging changed community membership.

Desired behavior:

1. A node can be dragged outside the current wash.
2. The wash does not block drag, wheel, or pan behavior.
3. The wash remains visually stable enough that users do not read layout changes as semantic membership changes.
4. If the wash responds to dragged or pinned outliers, that response is capped and testable.
5. Community membership remains data-driven; dragging does not move a page to another community.

First-slice rule:

- Keep community wash as a soft background region around the community's core cluster.
- Let dragged nodes leave the wash.
- Do not require the wash to fully include every outlier.
- Prefer a stable wash plus selected/dragged node affordance over aggressive stretching.
- Wheel always passes through community washes.
- Pointerdown on a wash prepares a community click. Pointerup below the drag threshold enters community focus/selection. Movement over the threshold cancels the community click and may start canvas pan.

Optional deformation rule, only after fixtures prove it helps:

- Compute a core hull/ellipse from the densest majority of the community's nodes.
- Include pinned or dragged outlier nodes as limited external influence points.
- Apply a capped expansion factor to the core region.
- If an outlier exceeds the cap, represent it through a selected-node affordance or limited directional hint rather than full bounding-box expansion.
- Keep opacity stable so a stretched wash does not overpower the map.

Practical constraints:

- Minimum wash size remains similar to today so small communities remain visible.
- The first slice must define numeric caps against the current world size before implementing deformation.
- A candidate default cap is: wash width <= 38% of world width and wash height <= 42% of world height, unless a fixture proves this too tight.
- Maximum outlier influence should be capped per axis and must not cause a single dragged node to consume the canvas.
- The cap must be testable with deterministic fixtures.

Fixture requirements:

- Small community with two nodes.
- Dense community with one dragged outlier.
- Dense community with one pinned outlier.
- Multiple outliers in different directions.
- Community focus view with a dragged node outside the core wash.

This keeps the map truthful first. Visual deformation is allowed only when it improves clarity without implying semantic membership changed.

## Interaction Contracts

### Wheel Zoom

- Works over blank graph.
- Works over nodes.
- Works over community washes.
- Does not trigger over search, toolbar, drawer, legend, minimap controls, or text editing controls.
- Zoom anchor is the pointer location in screen space.

### Blank Canvas Pan

- Pointerdown on blank graph prepares a pan.
- Movement over threshold becomes pan.
- Pointerup without movement is a blank click.
- Blank click closes transient UI first.
- In community focus, blank click can retreat from the focused view after transient UI is handled.

### Node Drag

- Pointerdown on node prepares node drag.
- Movement over threshold becomes drag.
- Node stays under the grabbed pointer point.
- Drag target is computed by screen-to-world projection using the current viewport.
- Drag can move outside the current community wash.
- Drag does not accidentally open the drawer.
- Pointerup ends drag and persists a pin.

### Node Click

- Click opens the reading drawer.
- Shift-click toggles manual selection.
- Click and drag are disambiguated by pointer movement threshold.

### Hover Preview

- Opens after the existing hover delay.
- Uses the current projected node/edge screen position.
- Repositions on viewport commit and motion frame while open.
- Stays inside the graph viewport and avoids drawer overlap through available bounds.
- Does not block node dragging or wheel zoom.
- Closes on pointer leave, drag start, node click, community focus change, graph data refresh, node removal, and Escape.
- Wheel or pan while hovering should either keep the preview attached through projection or close it; it must not drift.
- Touch devices must not hide unique information behind hover-only behavior.

### Community Click

- Clicking community wash enters community focus and opens the community selection state.
- It does not prevent wheel zoom.
- It does not create a drag boundary.

### Minimap

- First slice: minimap is a status/control blocker, not a full drag surface.
- Main graph gestures do not leak through minimap.
- Minimap viewport rectangle is derived from the same viewport state as the main graph.
- Wheel over minimap is blocked unless a later design explicitly makes minimap wheel zoom a feature.
- Click/drag minimap navigation is deferred unless required by the existing workbench behavior.

### Edge Interaction

- Edge hover may show relation preview at the projected edge midpoint.
- Edge click is a no-op unless the existing host behavior already selects relation details.
- Node hit targets have priority over nearby edge hit targets.
- Wheel over edges follows the main graph wheel rule.
- Edge preview content must handle missing relation details without opening an empty floating card.

### Keyboard and Accessibility

- Tab reaches graph controls, search, minimap if interactive, and visible node controls in a predictable order.
- Enter on a focused node opens the drawer or built-in offline reader.
- Space toggles manual selection where selection is available.
- Escape closes hover preview first, then drawer/reader, then exits community focus.
- `+` and `-` zoom around the graph center; `0` resets view.
- Arrow keys pan the viewport when the graph canvas has focus.
- Focus rings remain visible on nodes and controls.
- Nodes and community controls expose readable labels; status changes such as focus change, drawer open, and pin saved should be announced where the host supports it.

### Touch

- Tap node opens the drawer or built-in offline reader.
- Tap community wash enters community focus.
- One-finger drag on blank graph pans.
- One-finger drag on node drags the node after the same threshold rule.
- Pinch zoom is optional; visible zoom controls must remain usable.
- Long-press may open preview, but no core information may be hover-only.
- Touch targets should remain at least 44 CSS pixels where practical.
- Pointer cancel ends active drag/pan cleanly without committing a false click.

### Empty, Loading, and Error States

- Loading graph: show a graph loading state and do not attach graph gestures until data is ready.
- Empty graph: show an empty state with no minimap interaction.
- No edges: render nodes and make relation hover/click unavailable.
- No community members: community focus should fall back to global view or show a clear empty community state.
- Failed graph build or layout: show recovery copy and keep the rest of the workbench usable.
- Drawer content loading/error remains host-owned in workbench and reader-owned in offline mode.

## Data Flow

1. Graph data enters `buildRenderableGraph`.
2. GraphRuntimeState stores committed positions, viewport, graph selection/focus, hover, pins, and active gesture state.
3. Layout and simulation expose world positions for nodes, edges, and communities.
4. Geometry projects world positions to layer/screen/minimap positions.
5. Renderer applies DOM/SVG styles from state and projected positions.
6. User input enters Gestures.
7. Gestures classify the event target and emit an intent such as zoom, pan, drag node, hover node, click node, or click community.
8. The engine coordinator handles the intent and mutates GraphRuntimeState.
9. Node drag goes through Simulation Bridge using world-space targets.
10. Motion frames update world positions for visible nodes and rebuild hit-test data as needed.
11. Overlays recompute hover and wash positions from current world positions and viewport.
12. Drag end persists pins by wiki-relative path.

No component should infer a coordinate space from a raw number. The caller must know whether it is using world, layer, screen, or minimap coordinates.

Renderer code should not directly decide graph intent. Gesture code should not directly mutate DOM. Layout code should not know UI controls. These boundaries are the core regression guard.

## Testing Strategy

### Unit Tests

Graph Runtime State:

- State updates are explicit and observable through one subscription path.
- Hover, selection, focus, drag, viewport, and pins do not live in separate hidden stores.
- Renderer receives a state snapshot and does not mutate graph state directly.

Viewport:

- Zoom around pointer preserves the pointer anchor.
- Pan changes viewport translation without changing scale.
- Fit/center functions preserve intended scale limits.
- Resize keeps selected/focused anchor visually comfortable.
- Zoom level transitions are deterministic for the same scale values.

Geometry:

- World to screen and screen to world are inverse operations for common viewport states.
- Projection works under pan and zoom.
- Projection works when viewport host size changes.
- Drag projection can represent pointer positions outside the currently visible world bounds without silent clamping.
- World deltas convert to layer pixels correctly for non-1000px-wide viewports.

Gestures:

- Wheel is allowed over nodes and community washes.
- Wheel is blocked over controls.
- Pointer target classification separates node drag, blank pan, community click, minimap control, and UI controls.
- Click vs drag threshold prevents accidental drawer opens after drag.
- Gesture lock prevents new drag/pan/zoom starts during transitions.
- Gesture handlers emit intents and do not mutate DOM directly.
- First-slice gesture tests should use pure classifiers and fake event targets, avoiding new DOM test dependencies.

Hit Testing:

- Hit testing returns the expected node near a point.
- Hit testing respects current world positions after drag.
- Compatibility DOM-target classification is centralized and covered.
- Spatial-index performance tests are deferred until spatial index work is explicitly triggered.

Overlays:

- Node hover preview uses projected node screen position.
- Edge hover preview uses projected edge midpoint.
- Hover preview remains inside graph bounds.
- Hover preview repositions after viewport changes.

Community Wash:

- Wash does not block node drag or wheel zoom.
- Wash has a maximum expansion cap for outliers if deformation is enabled.
- Dragged outlier does not change community membership.
- Wash remains deterministic for stable fixtures.

Simulation Bridge:

- Drag target is world-space.
- Grab offset is preserved.
- End drag persists the final position.
- Double-click unpins without changing community membership.

Coordinator / Integration:

- A wheel DOM event becomes a zoom intent, then a viewport state change, then a renderer update.
- A node pointer sequence below the drag threshold becomes a node click and opens the drawer.
- A node pointer sequence above the drag threshold becomes node drag and does not open the drawer.
- A community click enters community focus without blocking wheel zoom.
- Keyboard zoom/reset and Escape behavior follow the accessibility contract.
- Touch pointer cancellation does not commit a false click.

### Browser Verification

Run against the workbench at `localhost:5180`:

1. Open the graph view.
2. Enter a community focus view.
3. Wheel over blank graph, node, and community wash.
4. Drag a node within the wash.
5. Drag a node outside the wash.
6. Confirm the node tracks the pointer without jumping.
7. Confirm the wash does not block drag and does not grow without bound if deformation is enabled.
8. Hover the dragged node before and after zoom.
9. Open the right drawer and repeat hover and drag.
10. Click node and confirm drawer opens.
11. Click community wash and confirm community selection/focus still works.
12. Pan the blank canvas and confirm minimap updates.
13. Reset view and confirm graph returns to a stable full-graph view.

### Offline HTML Verification

Run against generated Skill/offline HTML after engine changes:

1. Build `@llm-wiki/graph-engine`.
2. Run `scripts/build-graph-html.sh` on a fixture wiki.
3. Open the generated HTML.
4. Verify wheel zoom over blank graph, node, and community wash.
5. Verify node drag, hover preview, localStorage pin persistence, theme toggle, and built-in reader behavior.
6. Confirm offline output uses the built IIFE and does not rely on workbench-only React state.

### Regression Coverage

The final implementation should include tests for the three recent regressions:

- Wheel over community wash.
- Wheel over node.
- Dragged node under zoom follows the pointer.

It should also add tests for the two newly reported regressions:

- Node can be dragged outside the community wash.
- Hover preview follows projected node position under pan/zoom/focus/drawer states.

## Implementation Notes

The implementation should be phased to reduce risk while still being architectural. The first phase is a vertical slice: it fixes the current user-visible failures through the new coordinate and gesture boundaries instead of patching isolated event handlers.

0. Establish the regression and profiling baseline.
   - Add tests or repeatable browser probes for wheel over wash, wheel over node, drag under zoom, drag outside wash, hover after zoom, and hover after drawer resize.
   - Profile representative small, medium, and large graphs under pan, zoom, drag, hover, and live simulation before committing to any renderer-technology decision.
   - Record current workbench behavior and offline HTML behavior.

1. Establish geometry and coordinate compatibility.
   - Move projection helpers into Geometry.
   - Remove silent coordinate clamping from projection paths.
   - Define persisted pin range and layout clamping explicitly.
   - Keep old pin format compatible.
   - Add tests before behavior changes where practical.

2. Centralize gesture and hit-test classification for the first slice.
   - Extract wheel, pointer, drag, click, community click, hover, and minimap target classification from `static-renderer.ts`.
   - Keep DOM `closest(...)` target classification as a centralized compatibility layer unless graph-owned hit testing is needed immediately.
   - Make gesture handlers emit simple intents.
   - Use pure classifier tests with fake event targets; do not require jsdom unless approved.

3. Add the minimal graph runtime state needed by the slice.
   - Track viewport, hover target, selected/focused graph item, pins, active drag, grab offset, and gesture lock.
   - Do not move host drawer state, search state, toolbar state, or diff animation state unless required by the slice.
   - Preserve node click, drawer open, selection, focus, pin persistence, and reset behavior.

4. Fix overlays and drag through the shared path.
   - Hover and edge previews use projected screen positions.
   - Node drag uses unclamped screen-to-world projection plus explicit layout constraints.
   - Grab offset is preserved.
   - Dragging does not open the drawer.
   - Nodes can leave the current community wash.

5. Make community wash non-blocking and bounded.
   - Washes do not block dragging or wheel zoom.
   - Wash click has explicit threshold behavior.
   - First slice may keep the core wash stable instead of requiring full deformation.
   - Any deformation must use fixture-tested numeric caps.

6. Verify workbench and offline output.
   - Run engine unit tests.
   - Run workbench browser verification.
   - Build and inspect generated offline HTML.

7. Reassess follow-up architecture gates.
   - Add spatial index only if profiling proves hit testing is slow.
   - Add zoom-level/density-policy cleanup only if the first slice exposes drift.
   - Split renderer helpers after the interaction slice is stable.
   - Consider product-value graph work before continuing deeper plumbing.

Each phase should have tests before behavior changes where practical. Avoid mixing visual restyling with this refactor.

## Acceptance Criteria

### First Slice Blocking Criteria

The first refactor slice is complete when:

- There is one documented path for world/screen/layer/minimap coordinate conversion.
- Projection functions do not silently clamp drag targets.
- Persisted pin compatibility is documented and preserved.
- Wheel zoom works over blank graph, nodes, and community washes.
- A dragged node stays visually attached to the pointer under pan, zoom, drawer resize, and community focus.
- Nodes can be dragged outside community washes.
- Dragging a node does not open the drawer.
- Hover previews stay visually attached to nodes after pan, zoom, community focus, drag, and drawer open.
- Community washes do not become hard drag fences.
- Community wash click behavior is threshold-based and does not block wheel zoom.
- Existing node click, community click, Shift selection, blank pan, double-click reset, and unpin behaviors still work.
- Runtime state for viewport, hover, focus/selection, pins, and active gesture has one owner.
- Gesture classification is centralized, even if the first implementation uses DOM target compatibility.
- Unit tests cover projection, gesture classification, hover positioning, drag bounds, and pin compatibility.
- Browser verification passes on the workbench.
- Offline HTML verification passes against the built IIFE.

Measurable user-facing checks:

- Zoom changes when the wheel is used over blank graph, a node, and a community wash.
- Drag start has no visible snap to another location.
- The dragged node center remains within a small fixed pixel tolerance of the grabbed pointer offset.
- Hover card anchor remains near the projected node/edge position after zoom and drawer resize.
- Community wash width/height stays under the documented cap if deformation is enabled.
- A pointer sequence that exceeds the drag threshold never fires node click.

### Follow-Up Criteria

The broader architecture is complete when:

- `static-renderer.ts` no longer owns ad hoc coordinate formulas for drag, hover, wheel, minimap, and community wash behavior.
- Renderer code no longer directly interprets graph gestures.
- Gesture code emits graph intents and does not directly mutate DOM.
- Renderer helper extraction has reduced the renderer's responsibility without changing public API behavior.
- Hit testing has one graph-owned path if DOM-target compatibility becomes insufficient.
- Spatial index exists only if profiling justified it.
- Zoom level / density behavior has one policy source if this becomes necessary for user-facing quality.
- Keyboard and touch contracts are implemented or explicitly deferred with product approval.

## Risks and Mitigations

Risk: Moving coordinate logic can regress current graph navigation.
Mitigation: Keep viewport unit tests broad and run browser verification before commit.

Risk: Community wash deformation could make the visual design noisy.
Mitigation: First make washes non-blocking and stable. Add deformation only behind numeric caps and outlier fixtures.

Risk: `static-renderer.ts` extraction may become a broad refactor.
Mitigation: Establish Geometry, gesture classification, and minimal runtime state first. Split renderer helpers only after behavior is under tests.

Risk: Workbench and offline HTML diverge.
Mitigation: Keep the behavior in `@llm-wiki/graph-engine`, verify workbench browser behavior, and verify generated offline HTML from the built IIFE.

Risk: The refactor becomes a renderer rewrite.
Mitigation: Profile first. Keep DOM+SVG unless profiling proves it is the actual bottleneck. Do not adopt Canvas, WebGL, Pixi.js, or a new rendering dependency in the first slice.

Risk: The state layer turns into a general app store.
Mitigation: Keep runtime state graph-local and limited to the interaction slice. Host business and drawer state stay outside graph-engine.

Risk: The architecture work ships without user-visible improvement.
Mitigation: First-slice acceptance is based on visible graph behavior: no drag jump, no hover drift, no accidental drawer open, consistent wheel zoom, and non-blocking community washes.

## Decision

Use a gated Graph Interaction Architecture approach:

- Keep the current graph-engine strengths: DOM+SVG rendering, live d3 simulation, pin persistence, density modes, minimap, Jaccard community tracking, and shared workbench/offline behavior.
- First land the vertical slice: Geometry, centralized gesture classification, minimal graph runtime state, shared overlay placement, explicit pin compatibility, and workbench/offline verification.
- Add broader architecture only when it removes duplicated behavior or passes a measured trigger: renderer helper splitting, graph-owned hit testing, spatial index, density policy cleanup, and deeper coordinator extraction.
- Do not choose the conservative patch route; it cannot prevent the next interaction regression.
- Do not choose the aggressive renderer rewrite route; WebGL/Canvas would add risk before the current scale demands it.

This is intentionally more than a bug patch and less than a rendering-technology migration. It fixes the architectural source of the current regression class by forcing the first visible interaction path through shared coordinate, gesture, and runtime-state rules before expanding the architecture.
