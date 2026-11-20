# Sigma Global Renderer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `sigma-global-renderer.ts` into stable Sigma global submodules without changing user-visible graph behavior.

**Architecture:** Keep `createSigmaGlobalRenderer` as the lifecycle orchestration entrypoint. Move Sigma types/events, Graphology render model, hit projection, camera logic, wheel zoom ownership, and overlay DOM ownership into focused internal modules that are not exported from the public package barrel.

**Tech Stack:** TypeScript ESM, Node `node:test`, Graphology, Sigma, existing graph-engine fake runtime tests.

---

## Scope Check

This plan implements only #77. It does not implement #79 or #80, and it does not fix #70, #74, #75, #71, or #72. The expected behavior after every task is unchanged graph behavior with a smaller, clearer Sigma global renderer entrypoint.

## NOT In Scope

- #79 Sigma global route boundary documentation and long-term test taxonomy. This branch may leave notes for it, but should not expand into a documentation re-architecture.
- #80 facade / gesture / controller / renderer redesign. This plan keeps the current public route and lifecycle entrypoint.
- #70 label overflow behavior. Label placement and truncation can use the new model boundary later, but no user-facing label behavior changes here.
- #74 / #71 multi-select and shift-click semantics. Hit projection gets a cleaner home, but selection semantics remain unchanged.
- #75 camera animation performance tuning. This plan preserves current motion behavior and only moves the code.
- New renderer dependencies or renderer selection changes. Sigma/Graphology remain the production global route.

## What Already Exists

- `sigma-zoom.ts` already owns pure zoom math. `sigma-wheel-zoom.ts` must call it and must not duplicate ratio constants.
- `sigma-global-drag.ts` already owns drag sessions and document-level pointer/mouse listeners. After this refactor it should keep drag-session mechanics only; hit-target translation and overlay label selection should move out.
- `sigma-coordinates.ts` already owns Sigma/fallback projection helpers. It should import Sigma-like types from `sigma-global-types.ts`, not from the renderer.
- `community-cloud-geometry.ts` already owns cloud hull/bounds geometry and reuse signatures. `sigma-overlay-dom.ts` should call it through the existing renderer-owned `communityCloudFor` callback and must not duplicate hull math.
- `sigma-overlay-svg.ts` already owns low-level SVG/DOM element factories. `sigma-overlay-dom.ts` should orchestrate lifecycle, not recreate SVG helpers.
- `renderer-boundary.test.ts` already guards raw event ownership. Task 6 must update this test when pointerdown moves from the renderer into `sigma-overlay-dom.ts`.
- `tests/graph-sigma-global-production.regression-1.sh` already provides production-path Sigma browser regression with FPS, p95 frame, memory, route, and artifact validation. Task 7 must use it before any manual smoke claim.

## Ownership Diagram

```text
createSigmaGlobalRenderer
  |
  |-- lifecycle: runtime, Sigma instance, update/destroy, fatal errors
  |-- live state: adapterData, graph, pins, active drag, generation guard
  |
  +--> sigma-graphology-model
  |      adapter data + theme + edge style -> Graphology graph / patch
  |
  +--> sigma-hit-projector
  |      Sigma payload/rendered object/screen point -> GraphGestureTarget
  |
  +--> sigma-global-camera
  |      explicit community id + Sigma camera -> target state / movement
  |
  +--> sigma-wheel-zoom
  |      mouse captor wheel -> zoom point + ratio -> renderer callback
  |
  +--> sigma-overlay-dom
         overlay maps + labels + hit targets + drag DOM listeners
```

Rule: helper modules may import each other only in the direction above. They must not import `sigma-global-renderer.ts`.

## Review Corrections

These corrections are binding for the implementation tasks below.

- The main renderer, not `sigma-global-camera.ts`, decides which community is selected. Camera helpers receive an explicit `communityId`.
- `SigmaGlobalRenderedObject` and `gestureTargetFromSigmaRenderedObject` move to `sigma-hit-projector.ts` so hit projection does not depend on drag.
- `sigmaOverlayNodes`, `SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT`, `SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT`, and `sigmaCommunityLabels` move with `sigma-overlay-dom.ts`, not with the Graphology model.
- `sigma-overlay-dom.ts` owns document-level overlay drag listener cleanup through an explicit `clearActiveDragListeners()` method. Renderer commit/cancel/update/destroy paths call it before ending a drag.
- `sigma-wheel-zoom.ts` receives `isDestroyed` and must no-op after destroy even if a fake or third-party captor fails to unregister the listener.
- Tiny numeric helpers such as `finiteNumber`, `clamp`, and `roundNumber` may be copied as private helpers inside extracted modules. Do not remove the renderer-local `finiteNumber` while resize and drag code still uses it.
- The plan must add direct module tests. Existing `sigma-global-renderer.test.ts` stays as integration coverage, but it is not the only proof for extracted modules.
- Final verification must include the existing production Sigma browser regression script, not only manual `npm run dev` smoke.

## File Structure

### Create

- `packages/graph-engine/src/render/sigma-global-types.ts`
  Shared Sigma global runtime and renderer TypeScript types only. No runtime code.

- `packages/graph-engine/src/render/sigma-events.ts`
  Stateless event payload helpers shared by wheel, drag, and hit handling.

- `packages/graph-engine/src/render/sigma-graphology-model.ts`
  Graphology graph construction, attribute mapping, edge styling, patch checks, and patch application.

- `packages/graph-engine/src/render/sigma-hit-projector.ts`
  Hit projector and Sigma event payload translation to `GraphGestureTarget`.

- `packages/graph-engine/src/render/sigma-global-camera.ts`
  Camera state read/restore/reset, community spotlight camera target, and reduced-motion camera movement.

- `packages/graph-engine/src/render/sigma-wheel-zoom.ts`
  Sigma mouse captor wheel binding, wheel payload parsing, zoom-control exclusion, viewport-center fallback, and cleanup.

- `packages/graph-engine/src/render/sigma-overlay-dom.ts`
  Overlay DOM controller for rebuild/reposition/destroy of community regions, node hit targets, and community labels.

- `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
  Internal boundary test for helper existence, no runtime import cycles back to `sigma-global-renderer`, and no package-barrel export drift.

- `packages/graph-engine/test/sigma-graphology-model.test.ts`
  Direct model tests for graph build, patch eligibility, patch application, and raw data boundary.

- `packages/graph-engine/test/sigma-hit-projector.test.ts`
  Direct hit tests for Sigma node payloads, rendered objects, screen-point payloads, and blank fallback.

- `packages/graph-engine/test/sigma-global-camera.test.ts`
  Direct camera tests for invalid state, reduced motion, missing animation, projection fallback, and no-wash community centers.

- `packages/graph-engine/test/sigma-wheel-zoom.test.ts`
  Direct wheel controller tests for listener bind/off, invalid payloads, fallback center, zoom-control exclusion, and post-destroy no-op.

- `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  Direct overlay controller tests for node click, pointer drag, mouse fallback drag, cancel, cleanup, prune, and reposition without DOM creation.

### Modify

- `packages/graph-engine/src/render/sigma-global-renderer.ts`
  Keep lifecycle orchestration and public direct-source re-exports needed by existing tests. Remove moved implementation details.

- `packages/graph-engine/src/render/sigma-coordinates.ts`
  Import shared types from `sigma-global-types.ts` instead of `sigma-global-renderer.ts`.

- `packages/graph-engine/src/render/community-cloud-geometry.ts`
  Import shared Sigma-like types from `sigma-global-types.ts` instead of `sigma-global-renderer.ts`.

- `packages/graph-engine/src/render/index.ts`
  Should not export the new helper modules.

- `packages/graph-engine/src/render/sigma-global-drag.ts`
  Keep drag-session and document-listener mechanics. Move non-drag hit translation and label selection out.

- `packages/graph-engine/test/sigma-global-renderer.test.ts`
  Keep integration/lifecycle tests. Direct model/camera/wheel behavior remains covered here unless a task explicitly creates a dedicated test file.

- `packages/graph-engine/test/sigma-coordinates.test.ts`
  Import Sigma-like types from `sigma-global-types.ts`.

- `packages/graph-engine/test/renderer-boundary.test.ts`
  Update raw Sigma pointer exception ownership after overlay DOM extraction.

## Task 0: Branch And Baseline

**Files:**
- Read: `docs/superpowers/specs/2026-06-27-sigma-global-renderer-refactor-design.md`
- Read: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Read: `packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **Step 1: Confirm implementation branch**

Run:

```bash
current_branch="$(git branch --show-current)"
if [ "$current_branch" != "codex/refactor-sigma-global-renderer-boundaries" ]; then
  git switch codex/refactor-sigma-global-renderer-boundaries
fi
git branch --show-current
```

Expected output:

```text
codex/refactor-sigma-global-renderer-boundaries
```

- [ ] **Step 2: Confirm clean working tree**

Run:

```bash
git status --short --branch
```

Expected:

```text
## codex/refactor-sigma-global-renderer-boundaries
```

- [ ] **Step 3: Run baseline targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: both commands pass before refactoring.

- [ ] **Step 4: Commit is not needed**

No files should change in Task 0. Do not commit.

## Task 1: Extract Shared Types And Event Helpers

**Files:**
- Create: `packages/graph-engine/src/render/sigma-global-types.ts`
- Create: `packages/graph-engine/src/render/sigma-events.ts`
- Create: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/src/render/sigma-coordinates.ts`
- Modify: `packages/graph-engine/src/render/community-cloud-geometry.ts`

- [ ] **Step 1: Write failing boundary test**

Create `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts"
];

const existingTypeOnlyFiles = [
  "sigma-coordinates.ts",
  "community-cloud-geometry.ts"
];

describe("Sigma global renderer refactor boundaries", () => {
  it("keeps shared helper modules from importing the renderer", async () => {
    for (const file of [...helperFiles, ...existingTypeOnlyFiles]) {
      const source = await readFile(new URL(`../src/render/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /from\s+["']\.\/sigma-global-renderer(?:\.[jt]s)?["']/);
    }
  });

  it("keeps new Sigma internal helpers out of the render package barrel", async () => {
    const source = await readFile(new URL("../src/render/index.ts", import.meta.url), "utf8");
    for (const file of helperFiles) {
      const moduleName = file.replace(/\.ts$/, "");
      assert.doesNotMatch(source, new RegExp(`from\\s+["']\\\\./${moduleName}(?:\\\\.js)?["']`));
    }
  });

  it("keeps the shared type file type-only", async () => {
    const source = await readFile(new URL("../src/render/sigma-global-types.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /^\s*export\s+(?!type\b|interface\b)/m);
  });
});
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-global-types.ts` and `sigma-events.ts` do not exist yet.

- [ ] **Step 3: Create `sigma-global-types.ts`**

Create `packages/graph-engine/src/render/sigma-global-types.ts` by moving these type declarations out of `sigma-global-renderer.ts`:

```ts
import type { GraphEdgeStyleOptions, PinMap, ThemeId } from "../types";
import type { GraphRendererAdapterData } from "./adapter";
import type { GraphScreenPoint } from "./geometry";
import type { GraphGestureTarget } from "./gestures";
import type { RendererViewport, RendererViewportSize } from "./viewport";

export interface SigmaGlobalRendererRuntimeBoundary {
  Sigma: typeof import("sigma").default;
  GraphologyGraph: typeof import("graphology").default;
}

export type SigmaGlobalGraphologyGraph = InstanceType<SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"]>;

export interface SigmaGlobalCameraState {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

export interface SigmaGlobalCameraLike {
  getState?: () => SigmaGlobalCameraState;
  setState?: (state: Partial<SigmaGlobalCameraState>) => unknown;
  isAnimated?: () => boolean;
  animate?: (
    state: Partial<SigmaGlobalCameraState>,
    options?: { duration?: number; easing?: string }
  ) => unknown;
}

export interface SigmaGlobalMouseCaptorLike {
  on?: (event: "wheel", listener: (payload?: unknown) => void) => unknown;
  off?: (event: "wheel", listener: (payload?: unknown) => void) => unknown;
}

export interface SigmaGlobalSigmaLike {
  getCamera?: () => SigmaGlobalCameraLike;
  getMouseCaptor?: () => SigmaGlobalMouseCaptorLike;
  getViewportZoomedState?: (viewportTarget: GraphScreenPoint, newRatio: number) => SigmaGlobalCameraState;
  getGraph?: () => unknown;
  setGraph?: (graph: SigmaGlobalGraphologyGraph) => unknown;
  getSetting?: (key: string) => unknown;
  setSetting?: (key: string, value: unknown) => unknown;
  viewportToGraph?: (point: GraphScreenPoint) => { x: number; y: number };
  viewportToFramedGraph?: (point: GraphScreenPoint) => { x: number; y: number };
  graphToViewport?: (point: { x: number; y: number }) => GraphScreenPoint;
  refresh?: () => unknown;
  on?: (event: string, listener: (payload?: unknown) => void) => unknown;
  off?: (event: string, listener: (payload?: unknown) => void) => unknown;
  kill?: () => unknown;
}

export interface SigmaGlobalGraphologyRuntime {
  GraphologyGraph: SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"];
}

export interface SigmaGlobalRendererRuntime extends SigmaGlobalGraphologyRuntime {
  Sigma: new (graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) => SigmaGlobalSigmaLike;
}

export interface SigmaGlobalRendererCreateOptions {
  container: HTMLElement;
  adapterData: GraphRendererAdapterData;
  theme: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  onHitTarget?: (target: GraphGestureTarget) => void;
  onPinsChanged?: (pins: PinMap) => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onFatalError?: (error: unknown) => void;
  pins?: PinMap;
  runtime?: SigmaGlobalRendererRuntime;
  viewport?: RendererViewport;
  viewportSize?: RendererViewportSize;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  pins?: PinMap;
}

export interface SigmaGlobalRenderer {
  readonly id: "sigma-global";
  readonly root: HTMLElement;
  readonly overlayRoot: HTMLElement;
  readonly graph: SigmaGlobalGraphologyGraph;
  readonly updateStrategy: "rebuild-graph-preserve-camera";
  readonly lastHitTarget: GraphGestureTarget | null;
  isDragging(): boolean;
  resetView(): void;
  zoomIn(): void;
  zoomOut(): void;
  update(options: SigmaGlobalRendererUpdateOptions): void;
  destroy(): void;
}
```

- [ ] **Step 4: Create `sigma-events.ts`**

Create `packages/graph-engine/src/render/sigma-events.ts`:

```ts
export interface SigmaGlobalPointerEventPayload {
  node?: unknown;
  event?: { x?: unknown; y?: unknown; preventSigmaDefault?: () => void };
  x?: unknown;
  y?: unknown;
  preventSigmaDefault?: () => void;
}

export function preventSigmaDefault(payload: unknown): void {
  const eventPayload = payload as SigmaGlobalPointerEventPayload | null;
  eventPayload?.preventSigmaDefault?.();
  eventPayload?.event?.preventSigmaDefault?.();
  if (payload instanceof Event) payload.preventDefault();
}
```

- [ ] **Step 5: Update imports and re-exports**

In `sigma-global-renderer.ts`, remove the moved type/interface declarations and add imports:

```ts
import type {
  SigmaGlobalCameraState,
  SigmaGlobalGraphologyGraph,
  SigmaGlobalGraphologyRuntime,
  SigmaGlobalRenderer,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalRendererRuntime,
  SigmaGlobalRendererRuntimeBoundary,
  SigmaGlobalRendererUpdateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
import { preventSigmaDefault } from "./sigma-events";

export type {
  SigmaGlobalCameraState,
  SigmaGlobalGraphologyGraph,
  SigmaGlobalGraphologyRuntime,
  SigmaGlobalRenderer,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalRendererRuntime,
  SigmaGlobalRendererRuntimeBoundary,
  SigmaGlobalRendererUpdateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
```

In `sigma-coordinates.ts`, change the type import to:

```ts
import type { SigmaGlobalRendererCreateOptions, SigmaGlobalSigmaLike } from "./sigma-global-types";
```

In `community-cloud-geometry.ts`, change the type import to:

```ts
import type { SigmaGlobalRendererCreateOptions, SigmaGlobalSigmaLike } from "./sigma-global-types";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/sigma-coordinates.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-global-types.ts \
  packages/graph-engine/src/render/sigma-events.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/src/render/sigma-coordinates.ts \
  packages/graph-engine/src/render/community-cloud-geometry.ts \
  packages/graph-engine/test/sigma-coordinates.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma global shared types and events"
```

## Task 2: Extract Graphology Render Model

**Files:**
- Create: `packages/graph-engine/src/render/sigma-graphology-model.ts`
- Create: `packages/graph-engine/test/sigma-graphology-model.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Extend boundary test**

Add `"sigma-graphology-model.ts"` to `helperFiles` in `sigma-refactor-boundaries.test.ts`:

```ts
const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts",
  "sigma-graphology-model.ts"
];
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-graphology-model.ts` does not exist yet.

- [ ] **Step 3: Create `sigma-graphology-model.ts`**

Create `packages/graph-engine/src/render/sigma-graphology-model.ts` by moving these exact declarations and functions out of `sigma-global-renderer.ts`:

```text
SigmaGlobalGraphologyNodeAttributes
SigmaGlobalGraphologyEdgeAttributes
SigmaGlobalGraphologyCommunityAttributes
SigmaGlobalGraphologyAggregationAttributes
SigmaGlobalEdgeStyle
buildSigmaGlobalGraphologyGraph
canPatchSigmaGlobalGraphAttributes
patchSigmaGlobalGraphAttributes
sigmaGlobalNodeAttributes
sigmaSelectedCommunityIds
sigmaSpotlightCommunityIds
sigmaSpotlightCommunityId
sigmaGlobalNodeSpotlightState
sigmaGlobalEdgeAttributes
sigmaGlobalEdgeStyle
sigmaGlobalEdgeRelationColor
rgbaColor
sigmaGlobalCommunityAttributes
sigmaGlobalAggregationAttributes
sigmaGlobalNodeSize
sigmaGlobalNodeColor
finiteNumber
clamp
roundNumber
```

Use these imports at the top of the new file:

```ts
import type { GraphEdgeStyleOptions, ThemeId } from "../types";
import type {
  GraphRendererAdapterAggregation,
  GraphRendererAdapterCommunity,
  GraphRendererAdapterData,
  GraphRendererAdapterEdge,
  GraphRendererAdapterNode
} from "./adapter";
import { edgeRelationClass } from "./model";
import { getThemeTokens } from "../themes";
import type { SigmaGlobalGraphologyGraph, SigmaGlobalGraphologyRuntime } from "./sigma-global-types";
```

Keep `sigmaOverlayNodes`, `SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT`, `SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT`, and `sigmaCommunityLabels` out of this module. They are overlay policy and move in Task 6.

- [ ] **Step 4: Update renderer imports and re-exports**

In `sigma-global-renderer.ts`, import model functions:

```ts
import {
  buildSigmaGlobalGraphologyGraph,
  canPatchSigmaGlobalGraphAttributes,
  patchSigmaGlobalGraphAttributes,
  sigmaGlobalNodeSize,
  sigmaSelectedCommunityIds,
  sigmaSpotlightCommunityId,
  sigmaSpotlightCommunityIds,
  sigmaGlobalNodeSpotlightState,
  sigmaGlobalEdgeStyle,
  type SigmaGlobalEdgeStyle
} from "./sigma-graphology-model";
```

Keep direct-source compatibility for existing tests:

```ts
export {
  buildSigmaGlobalGraphologyGraph,
  sigmaGlobalEdgeStyle
} from "./sigma-graphology-model";
export type { SigmaGlobalEdgeStyle } from "./sigma-graphology-model";
```

- [ ] **Step 5: Add direct model tests**

Create `packages/graph-engine/test/sigma-graphology-model.test.ts` by moving direct Graphology model assertions out of `sigma-global-renderer.test.ts` where practical:

- build graph entirely from `GraphRendererAdapterData`
- selected community focus edge styling
- node spotlight dimming / force-visible behavior
- semantic emphasis and focus-highlight edge styling
- patch eligibility true for same node/edge structure
- patch eligibility false for theme changes, node id changes, edge id/source/target changes
- patch application refreshes graph attributes without replacing the graph

Also update the raw-data boundary assertion so it inspects `sigma-graphology-model.ts` and the renderer:

```text
sigma-graphology-model.ts must type buildSigmaGlobalGraphologyGraph(adapterData: GraphRendererAdapterData, ...)
sigma-graphology-model.ts and sigma-global-renderer.ts must not import or mention raw GraphData/buildGraphRendererAdapterData/data.nodes/data.edges
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/sigma-graphology-model.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-graphology-model.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma graphology render model"
```

## Task 3: Extract Hit Projector

**Files:**
- Create: `packages/graph-engine/src/render/sigma-hit-projector.ts`
- Create: `packages/graph-engine/test/sigma-hit-projector.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-drag.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Extend boundary test**

Add `"sigma-hit-projector.ts"` to `helperFiles`:

```ts
const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts",
  "sigma-graphology-model.ts",
  "sigma-hit-projector.ts"
];
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-hit-projector.ts` does not exist yet.

- [ ] **Step 3: Create `sigma-hit-projector.ts`**

Create `packages/graph-engine/src/render/sigma-hit-projector.ts` by moving these declarations and functions out of `sigma-global-renderer.ts`:

```text
SigmaGlobalHitInput
SigmaGlobalHitProjectorInput
SigmaGlobalHitProjector
createSigmaGlobalHitProjector
sigmaNodeIdFromPayload
sigmaScreenPointFromPayload
spatialInputFromAdapterData
SigmaGlobalRenderedObject
gestureTargetFromSigmaRenderedObject
```

Use these imports:

```ts
import { createGraphSpatialIndex, type GraphSpatialIndex, type GraphSpatialIndexInput } from "../layout";
import type { GraphRendererAdapterData } from "./adapter";
import { screenPointToWorldPoint, type GraphScreenPoint } from "./geometry";
import { graphSpatialHitToGestureTarget, type GraphGestureTarget } from "./gestures";
import type { RendererViewport, RendererViewportSize } from "./viewport";
```

Remove `SigmaGlobalRenderedObject` and `gestureTargetFromSigmaRenderedObject` from `sigma-global-drag.ts`; that file should keep drag-session and document-listener mechanics only.

- [ ] **Step 4: Update renderer imports and re-exports**

In `sigma-global-renderer.ts`, import:

```ts
import {
  createSigmaGlobalHitProjector,
  sigmaNodeIdFromPayload,
  sigmaScreenPointFromPayload,
  type SigmaGlobalHitInput,
  type SigmaGlobalHitProjector
} from "./sigma-hit-projector";
```

Keep direct-source compatibility:

```ts
export { createSigmaGlobalHitProjector } from "./sigma-hit-projector";
export type {
  SigmaGlobalHitInput,
  SigmaGlobalHitProjector,
  SigmaGlobalHitProjectorInput,
  SigmaGlobalRenderedObject
} from "./sigma-hit-projector";
```

- [ ] **Step 5: Add direct hit projector tests**

Create `packages/graph-engine/test/sigma-hit-projector.test.ts` covering:

- known Sigma node id wins before overlapping community region
- unknown Sigma node id falls back to rendered object or spatial screen point
- rendered node, edge, community wash, and aggregation container objects translate to `GraphGestureTarget`
- invalid rendered object ids return `graph-blank` through fallback behavior
- top-level `x/y` payload and nested `event.x/event.y` payload both parse
- missing screen point returns `graph-blank`

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/sigma-hit-projector.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-hit-projector.ts \
  packages/graph-engine/src/render/sigma-global-drag.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-hit-projector.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma hit projector"
```

## Task 4: Extract Camera Logic

**Files:**
- Create: `packages/graph-engine/src/render/sigma-global-camera.ts`
- Create: `packages/graph-engine/test/sigma-global-camera.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Extend boundary test**

Add `"sigma-global-camera.ts"` to `helperFiles`:

```ts
const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts",
  "sigma-graphology-model.ts",
  "sigma-hit-projector.ts",
  "sigma-global-camera.ts"
];
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-global-camera.ts` does not exist yet.

- [ ] **Step 3: Create `sigma-global-camera.ts`**

Create `packages/graph-engine/src/render/sigma-global-camera.ts` by moving these functions out of `sigma-global-renderer.ts`:

```text
readCameraState
restoreCameraState
maybeAnimateSigmaCommunitySpotlightCamera
moveSigmaCamera
sigmaCommunitySpotlightCameraState
sigmaGlobalCameraState
sigmaGraphPointToCameraPoint
sigmaCameraDistanceForGraphDistance
sigmaCommunitySpotlightCenter
prefersReducedMotion
```

Move or copy private numeric helpers inside `sigma-global-camera.ts` as needed, but keep a local `finiteNumber` in `sigma-global-renderer.ts` while resize and drag code still uses it.

Use these imports:

```ts
import type { GraphRendererAdapterData } from "./adapter";
import type {
  SigmaGlobalCameraState,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
```

Do not import `sigmaSpotlightCommunityId` into `sigma-global-camera.ts`. The main renderer computes the selected/spotlight community id and passes it into camera helpers.

Export all moved camera functions that `sigma-global-renderer.ts` uses. `maybeAnimateSigmaCommunitySpotlightCamera` should take this shape:

```ts
export function maybeAnimateSigmaCommunitySpotlightCamera(
  sigma: SigmaGlobalSigmaLike,
  root: HTMLElement,
  adapterData: GraphRendererAdapterData,
  communityId: string | null,
  previousCommunityId: string | null
): string | null
```

- [ ] **Step 4: Update renderer imports**

In `sigma-global-renderer.ts`, import:

```ts
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  readCameraState,
  restoreCameraState,
  sigmaGlobalCameraState,
  sigmaGraphPointToCameraPoint,
  prefersReducedMotion
} from "./sigma-global-camera";
```

Remove the moved function definitions from `sigma-global-renderer.ts`.

When calling `maybeAnimateSigmaCommunitySpotlightCamera`, compute the id in the renderer:

```ts
cameraSpotlightCommunityId = maybeAnimateSigmaCommunitySpotlightCamera(
  sigma,
  sigmaRoot,
  adapterData,
  sigmaSpotlightCommunityId(adapterData),
  previousCameraSpotlightCommunityId
);
```

- [ ] **Step 5: Add direct camera tests**

Create `packages/graph-engine/test/sigma-global-camera.test.ts` covering:

- `readCameraState` normalizes missing/non-finite values
- `restoreCameraState` no-ops on null state
- reduced motion uses `setState` instead of `animate`
- missing `animate` falls back to `setState`
- graph-to-camera projection falls back to raw graph point when Sigma projection is missing or non-finite
- community center uses wash center when available
- community center averages node points when no wash exists
- camera helper does not decide selected community by reading adapter selection internally

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-camera.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass, including existing tests for community spotlight camera animation, reduced motion, already-framed community, and reset view.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-global-camera.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma global camera logic"
```

## Task 5: Extract Wheel Zoom Controller

**Files:**
- Create: `packages/graph-engine/src/render/sigma-wheel-zoom.ts`
- Create: `packages/graph-engine/test/sigma-wheel-zoom.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Extend boundary test**

Add `"sigma-wheel-zoom.ts"` to `helperFiles`:

```ts
const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts",
  "sigma-graphology-model.ts",
  "sigma-hit-projector.ts",
  "sigma-global-camera.ts",
  "sigma-wheel-zoom.ts"
];
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-wheel-zoom.ts` does not exist yet.

- [ ] **Step 3: Create `sigma-wheel-zoom.ts`**

Create `packages/graph-engine/src/render/sigma-wheel-zoom.ts`:

```ts
import type { GraphScreenPoint } from "./geometry";
import { preventSigmaDefault } from "./sigma-events";
import { sigmaWheelZoomRatio, type SigmaWheelDeltaLike } from "./sigma-zoom";
import type { SigmaGlobalSigmaLike } from "./sigma-global-types";

interface SigmaGlobalWheelPayload {
  x?: unknown;
  y?: unknown;
  delta?: unknown;
  original?: {
    deltaY?: unknown;
    deltaMode?: unknown;
    target?: unknown;
  };
  preventSigmaDefault?: () => void;
}

export interface SigmaWheelZoomController {
  destroy(): void;
}

export interface SigmaWheelZoomControllerInput {
  sigma: SigmaGlobalSigmaLike;
  root: HTMLElement;
  isDestroyed: () => boolean;
  currentRatio: () => number;
  onZoomAtPoint: (point: GraphScreenPoint, nextRatio: number) => void;
  onFatalError?: (error: unknown) => void;
}

export function bindSigmaWheelZoomController(input: SigmaWheelZoomControllerInput): SigmaWheelZoomController {
  const captor = input.sigma.getMouseCaptor?.();
  if (!captor?.on) return { destroy: () => undefined };
  const listener = (payload?: unknown): void => {
    if (input.isDestroyed()) return;
    try {
      const wheel = sigmaWheelInputFromPayload(payload, sigmaViewportCenter(input.root));
      if (!wheel) return;
      preventSigmaDefault(payload);
      if (sigmaWheelTargetIsZoomControl(payload)) return;
      const nextRatio = sigmaWheelZoomRatio(input.currentRatio(), wheel.delta);
      input.onZoomAtPoint(wheel.point, nextRatio);
    } catch (error) {
      input.onFatalError?.(error);
    }
  };
  captor.on("wheel", listener);
  return {
    destroy() {
      captor.off?.("wheel", listener);
    }
  };
}

export function sigmaWheelInputFromPayload(payload: unknown, fallbackPoint: GraphScreenPoint): {
  point: GraphScreenPoint;
  delta: SigmaWheelDeltaLike;
} | null {
  const wheel = payload as SigmaGlobalWheelPayload | null;
  const originalDeltaY = wheel?.original?.deltaY;
  const fallbackDelta = wheel?.delta;
  const deltaY = typeof originalDeltaY === "number"
    ? originalDeltaY
    : typeof fallbackDelta === "number"
      ? -fallbackDelta * 120
      : null;
  if (deltaY == null || !Number.isFinite(deltaY)) return null;

  const x = finiteNumber(wheel?.x, Number.NaN);
  const y = finiteNumber(wheel?.y, Number.NaN);
  const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallbackPoint;
  const originalDeltaMode = wheel?.original?.deltaMode;
  return {
    point,
    delta: {
      deltaY,
      deltaMode: typeof originalDeltaMode === "number" ? originalDeltaMode : 0
    }
  };
}

export function sigmaWheelTargetIsZoomControl(payload: unknown): boolean {
  const wheel = payload as SigmaGlobalWheelPayload | null;
  const target = wheel?.original?.target as {
    closest?: (selector: string) => unknown;
    parentElement?: { closest?: (selector: string) => unknown };
  } | null | undefined;
  return Boolean(
    target?.closest?.("[data-control=\"sigma-zoom\"]") ||
    target?.parentElement?.closest?.("[data-control=\"sigma-zoom\"]")
  );
}

export function sigmaViewportCenter(root: HTMLElement): GraphScreenPoint {
  const rect = typeof root.getBoundingClientRect === "function" ? root.getBoundingClientRect() : null;
  const width = finiteNumber(rect?.width, 1000);
  const height = finiteNumber(rect?.height, 680);
  return {
    x: width / 2,
    y: height / 2
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
```

- [ ] **Step 4: Update renderer to use controller**

In `sigma-global-renderer.ts`:

1. Replace `sigmaWheelCleanup` with:

```ts
let sigmaWheelZoomController: { destroy(): void } | null = null;
```

2. Replace `bindSigmaWheelZoom()` call with:

```ts
sigmaWheelZoomController = bindSigmaWheelZoomController({
  sigma,
  root: sigmaRoot,
  isDestroyed: () => destroyed,
  currentRatio: () => readCameraState(sigma)?.ratio ?? 1,
  onZoomAtPoint: (point, nextRatio) => zoomSigmaCameraAtViewportPoint(point, nextRatio, false),
  onFatalError: options.onFatalError
});
```

3. Replace `unbindSigmaWheelZoom()` call with:

```ts
sigmaWheelZoomController?.destroy();
sigmaWheelZoomController = null;
```

4. Import:

```ts
import {
  bindSigmaWheelZoomController,
  sigmaViewportCenter
} from "./sigma-wheel-zoom";
```

5. Remove local `SigmaGlobalWheelPayload`, `bindSigmaWheelZoom`, `unbindSigmaWheelZoom`, `handleSigmaWheelZoom`, `sigmaWheelInputFromPayload`, `sigmaWheelTargetIsZoomControl`, and `sigmaViewportCenter`.

- [ ] **Step 5: Add direct wheel tests**

Create `packages/graph-engine/test/sigma-wheel-zoom.test.ts` covering:

- controller binds one wheel listener and `destroy()` unregisters the same listener
- `isDestroyed()` makes late wheel events no-op even if the captor still invokes the listener
- invalid payloads do not call `onZoomAtPoint`
- `original.deltaY` wins over fallback `delta`
- fallback `delta` is converted to pixel-like wheel input
- missing pointer coordinates use viewport center
- zoom-control targets are prevented but do not zoom
- thrown zoom callback errors are passed to `onFatalError`

Update `sigma-global-renderer.test.ts` or its fake captor so renderer-level `destroy()` proves wheel listeners are removed and post-destroy wheel events do not change camera state.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/sigma-wheel-zoom.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
node --import tsx --test packages/graph-engine/test/sigma-zoom.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass, including existing wheel zoom tests.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-wheel-zoom.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-wheel-zoom.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma wheel zoom controller"
```

## Task 6: Extract Overlay DOM Controller

**Files:**
- Create: `packages/graph-engine/src/render/sigma-overlay-dom.ts`
- Create: `packages/graph-engine/test/sigma-overlay-dom.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-drag.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Modify: `packages/graph-engine/test/renderer-boundary.test.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Extend boundary test**

Add `"sigma-overlay-dom.ts"` to `helperFiles`:

```ts
const helperFiles = [
  "sigma-global-types.ts",
  "sigma-events.ts",
  "sigma-graphology-model.ts",
  "sigma-hit-projector.ts",
  "sigma-global-camera.ts",
  "sigma-wheel-zoom.ts",
  "sigma-overlay-dom.ts"
];
```

- [ ] **Step 2: Run boundary test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL because `sigma-overlay-dom.ts` does not exist yet.

- [ ] **Step 3: Create overlay controller file**

Create `packages/graph-engine/src/render/sigma-overlay-dom.ts` with this exported controller shape:

```ts
import type { GraphRendererAdapterData } from "./adapter";
import type { GraphScreenPoint } from "./geometry";
import type { SigmaCommunityCloud } from "./community-cloud-geometry";
import type { SigmaGlobalRenderedObject } from "./sigma-hit-projector";
import type { SigmaGlobalRendererCreateOptions, SigmaGlobalSigmaLike } from "./sigma-global-types";

export interface SigmaOverlayDomController {
  rebuild(): void;
  reposition(): void;
  clearActiveDragListeners(): void;
  destroy(): void;
}

export interface SigmaOverlayDomControllerInput {
  overlayRoot: HTMLElement;
  cloudFilterId: string;
  getAdapterData: () => GraphRendererAdapterData;
  getSigma: () => SigmaGlobalSigmaLike;
  getOptions: () => Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">;
  communityCloudFor: (communityId: string, wash: { cx: number; cy: number; rx: number; ry: number }) => SigmaCommunityCloud;
  isDestroyed: () => boolean;
  onHit: (object: SigmaGlobalRenderedObject) => void;
  beginNodeDrag: (nodeId: string, point: GraphScreenPoint, payload?: unknown) => void;
  moveNodeDrag: (point: GraphScreenPoint, payload?: unknown) => void;
  commitNodeDrag: (point: GraphScreenPoint | null, payload?: unknown) => void;
  cancelNodeDrag: () => void;
  screenPointFromEvent: (event: MouseEvent | PointerEvent) => GraphScreenPoint;
  consumeSuppressedNodeClick: (nodeId: string | null) => boolean;
  activeNodeDragId: () => string | null;
}
```

Then move these existing renderer functions and maps into the new file, adapting them to use `input.getAdapterData()`, `input.getSigma()`, and callbacks:

```text
overlayRegionEntries
overlayNodeEntries
overlayLabelEntries
rebuildSigmaOverlays
repositionSigmaOverlays
createSigmaNodeHitTarget
pruneOverlayEntries
overlayBoxFromWorldEllipse
bindOverlayPointerDragListeners
bindOverlayMouseDragListeners
isActiveOverlayDrag
clearOverlayPointerDragListeners
sigmaOverlayNodes
sigmaCommunityLabels
```

Keep the same behavior:

- `rebuild()` may call `replaceChildren`.
- `reposition()` must not call `replaceChildren`.
- `reposition()` must not create DOM elements.
- click handlers call `input.onHit(...)`.
- drag handlers call the passed drag callbacks.
- `clearActiveDragListeners()` must be idempotent and must run on drag commit, drag cancel, update cancellation, and destroy.
- Define `SIGMA_GLOBAL_NODE_HIT_TARGET_LIMIT = 160` and `SIGMA_GLOBAL_COMMUNITY_LABEL_LIMIT = 8` inside `sigma-overlay-dom.ts`.
- Import `sigmaGlobalNodeSize` and `sigmaGlobalNodeSpotlightState` from `sigma-graphology-model.ts`; do not import overlay policy back into the model.

Update `packages/graph-engine/src/render/sigma-global-drag.ts` so it no longer exports `sigmaCommunityLabels`.

- [ ] **Step 4: Update renderer to use overlay controller**

In `sigma-global-renderer.ts`:

1. Replace the three overlay maps and `overlayPointerDragCleanup` with:

```ts
let overlayDomController: SigmaOverlayDomController | null = null;
```

2. After Sigma is created, initialize the controller:

```ts
overlayDomController = createSigmaOverlayDomController({
  overlayRoot,
  cloudFilterId,
  getAdapterData: () => adapterData,
  getSigma: () => sigma,
  getOptions: () => ({ ...options, adapterData }),
  communityCloudFor: sigmaCommunityCloudFor,
  isDestroyed: () => destroyed,
  onHit: (renderedObject) => handleSigmaHit({ renderedObject }),
  beginNodeDrag,
  moveNodeDrag,
  commitNodeDrag,
  cancelNodeDrag,
  screenPointFromEvent: (event) => overlayPointerScreenPoint(event, sigmaRoot),
  consumeSuppressedNodeClick,
  activeNodeDragId: () => activeNodeDrag?.nodeId ?? null
});
```

3. Replace calls:

```ts
rebuildSigmaOverlays();
repositionSigmaOverlays();
```

with:

```ts
overlayDomController?.rebuild();
overlayDomController?.reposition();
```

4. On destroy, call:

```ts
overlayDomController?.destroy();
overlayDomController = null;
```

5. In renderer drag lifecycle, replace local `clearOverlayPointerDragListeners()` calls with:

```ts
overlayDomController?.clearActiveDragListeners();
```

This call must remain in commit, cancel, update cancellation, and destroy paths before the active drag is dropped.

6. Import:

```ts
import {
  createSigmaOverlayDomController,
  type SigmaOverlayDomController
} from "./sigma-overlay-dom";
```

7. Remove the moved local functions and maps.

- [ ] **Step 5: Update boundary tests for overlay ownership**

Update `packages/graph-engine/test/renderer-boundary.test.ts`:

- allow `render/sigma-overlay-dom.ts` as the Sigma overlay DOM pointerdown owner
- keep document-level `pointermove` / `pointerup` / `pointercancel` ownership in `sigma-global-drag.ts`
- assert `sigma-global-renderer.ts` no longer contains `.sigma-global-node-hit-target` creation or `addEventListener("pointerdown")`
- assert `sigma-overlay-dom.ts` contains `.sigma-global-node-hit-target` and `addEventListener("pointerdown")`
- assert `sigma-overlay-dom.ts` does not directly call host callbacks or own graph selection semantics

- [ ] **Step 6: Add direct overlay tests**

Create `packages/graph-engine/test/sigma-overlay-dom.test.ts` covering:

- node hit-target `click` calls `onHit({ kind: "node", id })`
- community cloud shape click calls `onHit({ kind: "community-wash", id })`
- pointer drag path dispatches `pointerdown` on `.sigma-global-node-hit-target`, document `pointermove`, document `pointerup`, and clears document listeners
- pointer cancel clears document listeners and calls cancel
- mouse fallback path works when `PointerEvent` is unavailable
- `destroy()` clears element maps and active drag listeners
- `rebuild()` prunes stale community/node/label elements and refreshes data attributes
- `reposition()` updates boxes/geometry without `replaceChildren`, DOM creation, or listener rebinding
- label cap remains 8 and selected labels are prioritized
- node hit-target cap remains 160 and selected/search/pinned anchors are kept

- [ ] **Step 7: Run targeted tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
node --import tsx --test packages/graph-engine/test/renderer-boundary.test.ts
node --import tsx --test packages/graph-engine/test/sigma-overlay-dom.test.ts
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: all pass, including tests that prove overlay elements are reused on camera updates and data updates.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/graph-engine/src/render/sigma-overlay-dom.ts \
  packages/graph-engine/src/render/sigma-global-drag.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/renderer-boundary.test.ts \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts
git commit -m "refactor(graph): extract sigma overlay dom controller"
```

## Task 7: Final Cleanup And Verification

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Read: `docs/superpowers/specs/2026-06-27-sigma-global-renderer-refactor-design.md`

- [ ] **Step 1: Check renderer no longer owns moved functions**

Run:

```bash
rg -n "function (readCameraState|restoreCameraState|maybeAnimateSigmaCommunitySpotlightCamera|sigmaWheelInputFromPayload|sigmaWheelTargetIsZoomControl|rebuildSigmaOverlays|repositionSigmaOverlays|buildSigmaGlobalGraphologyGraph|createSigmaGlobalHitProjector)" packages/graph-engine/src/render/sigma-global-renderer.ts
```

Expected: no matches.

- [ ] **Step 2: Check helper modules do not import renderer runtime**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 3: Check line count changed materially**

Run:

```bash
wc -l packages/graph-engine/src/render/sigma-global-renderer.ts
```

Expected: line count is significantly lower than 1570. Do not fail the task only on a numeric threshold; use it as a sanity check.

- [ ] **Step 4: Run graph-engine full verification**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: both pass.

- [ ] **Step 5: Run production Sigma browser regression**

Run the existing production-path browser gate:

```bash
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR="/tmp/llm-wiki-sigma-global-refactor-$(date +%Y%m%d-%H%M%S)" \
GRAPH_SIGMA_PRODUCTION_SHAPES="real-snapshot-proxy,nodes-1000-sparse,nodes-1000-dense" \
bash tests/graph-sigma-global-production.regression-1.sh
```

Expected:

```text
PASS: production-path artifact fields
PASS: Sigma global production performance trial
```

The generated `sigma-global-production-results.json` must pass validation with:

- failed records: `0`
- production path: `true`
- global records return `sigma-global-ready`
- wheel FPS at or above the script threshold
- wheel frame p95 at or below the script threshold
- repeated-cycle memory growth within the script threshold

If Playwright or Chrome is unavailable, record the exact blocker. Do not replace this with manual smoke unless the blocker is environment-only and all graph-engine tests/typecheck already passed.

- [ ] **Step 6: Run workbench smoke**

Run:

```bash
npm run dev
```

Then open the workbench and verify these paths manually:

```text
1. Open graph global view.
2. Wheel or trackpad zoom does not jump.
3. Left-bottom zoom buttons work.
4. Click a community: still stays in global graph, drawer opens, community is highlighted.
5. Click return-global: global composition returns.
6. Drag a node and release: pin behavior still works.
```

Expected: all paths behave like current main. If browser verification is blocked by port, Chrome, or local data, record the exact blocker in the final response and do not claim browser verification passed.

- [ ] **Step 7: Comment on #77**

Run:

```bash
gh issue comment 77 --repo sdyckjq-lab/llm-wiki-skill --body "Implemented the Sigma global renderer split from the design spec. Extracted shared Sigma types/events, Graphology render model, hit projector, camera logic, wheel zoom controller, and overlay DOM controller. Verified graph-engine tests/typecheck plus the Sigma production browser regression where available. PR will close this issue after review."
```

Expected: issue comment is created.

- [ ] **Step 8: Commit final cleanup**

If Step 1-7 changed files, run:

```bash
git add packages/graph-engine/src/render packages/graph-engine/test
git commit -m "test(graph): verify sigma renderer refactor boundaries"
```

If Step 1-7 did not change files, do not create an empty commit.

## Test Coverage Map

```text
CODE PATHS                                            COVERAGE REQUIRED
[+] Shared types/events
  |-- type-only runtime boundary                       [NEW] sigma-refactor-boundaries.test.ts
  |-- prevent Sigma default payload shapes             [NEW] sigma-events coverage via wheel/hit tests

[+] Graphology model
  |-- adapterData -> nodes/edges/attrs                 [EXISTING -> MOVE] sigma-graphology-model.test.ts
  |-- selected-community node dimming                  [EXISTING -> MOVE] sigma-graphology-model.test.ts
  |-- edge relation/focus styling                      [EXISTING -> MOVE] sigma-graphology-model.test.ts
  |-- patchable same structure                         [NEW] sigma-graphology-model.test.ts
  |-- theme/shape change rebuild path                  [EXISTING + NEW] renderer + model tests

[+] Hit projector
  |-- known node id                                    [EXISTING -> MOVE] sigma-hit-projector.test.ts
  |-- rendered node/edge/community/aggregation object  [NEW] sigma-hit-projector.test.ts
  |-- screen point spatial fallback                    [EXISTING -> MOVE] sigma-hit-projector.test.ts
  |-- blank / invalid payload                          [EXISTING + NEW] sigma-hit-projector.test.ts

[+] Camera
  |-- read/restore camera state                        [NEW] sigma-global-camera.test.ts
  |-- selected community target from explicit id       [EXISTING + NEW] renderer + camera tests
  |-- reduced motion / missing animate fallback        [EXISTING -> MOVE] sigma-global-camera.test.ts
  |-- no-wash community center fallback                [NEW] sigma-global-camera.test.ts

[+] Wheel zoom
  |-- captor bind/off                                  [NEW] sigma-wheel-zoom.test.ts
  |-- delta parsing and viewport center fallback       [EXISTING + NEW] zoom + wheel tests
  |-- zoom-control exclusion                           [EXISTING + NEW] wheel tests
  |-- late event after destroy                         [NEW] wheel + renderer tests
  |-- real browser wheel/button path                   [REQUIRED] graph-sigma-global-production regression

[+] Overlay DOM
  |-- rebuild creates/reuses/prunes elements            [EXISTING + NEW] sigma-overlay-dom.test.ts
  |-- reposition does not create/replace/rebind         [EXISTING + NEW] sigma-overlay-dom.test.ts
  |-- node hit-target click                            [NEW] sigma-overlay-dom.test.ts
  |-- pointer drag, cancel, mouse fallback             [NEW] sigma-overlay-dom.test.ts
  |-- listener cleanup                                 [NEW] sigma-overlay-dom.test.ts
  |-- 8 label cap / 160 hit-target cap                 [EXISTING + NEW] renderer + overlay tests

USER FLOWS
[+] Open global graph                                  [REQUIRED] production browser regression
[+] Wheel/trackpad zoom                                [REQUIRED] production browser regression
[+] Left-bottom zoom buttons                           [REQUIRED] production browser regression + manual smoke
[+] Click community, stay global, drawer sync          [REQUIRED] production browser regression + manual smoke
[+] Return global                                      [REQUIRED] production browser regression + manual smoke
[+] Drag node and persist pin                          [REQUIRED] production browser regression + manual smoke
```

Coverage target: every moved branch is covered by a direct module test, an existing integration test, or the production browser regression. No moved module should rely only on `sigma-global-renderer.test.ts`.

## Failure Modes

| New codepath | Realistic failure | Required coverage / handling |
|---|---|---|
| Shared type extraction | helper imports renderer at runtime and creates a cycle | `sigma-refactor-boundaries.test.ts` scans helper imports and package barrel exports |
| Graphology model extraction | raw `GraphData` leaks into renderer model path | model boundary test reads `sigma-graphology-model.ts` and renderer source |
| Graph patching | patch path misses updated community/aggregation attributes | direct model patch test plus renderer lifecycle integration test |
| Hit projector extraction | rendered object translation stays hidden in drag module | hit projector direct tests and drag module cleanup |
| Camera extraction | camera module reads selection state and duplicates selection ownership | camera direct test plus explicit renderer-passed community id |
| Camera motion | reduced-motion users still get animation | camera reduced-motion test |
| Wheel extraction | stale captor listener zooms after destroy | direct wheel test and renderer destroy test |
| Wheel / animation | real Sigma animation overwrites wheel state | production browser regression plus manual smoke if local browser available |
| Overlay extraction | document drag listeners leak after commit/cancel/destroy | overlay direct tests count listener cleanup paths |
| Overlay reposition | camera updates rebuild DOM and rebind listeners every frame | existing and direct overlay tests assert no create/replace/rebind |
| Browser production path | unit tests pass but real Sigma canvas/route regresses | `tests/graph-sigma-global-production.regression-1.sh` is a hard final gate |

No failure mode above is allowed to be silent with no test and no cleanup path.

## Worktree Parallelization Strategy

This refactor touches one primary module and many shared tests, so the safest execution is mostly sequential. Limited parallel review is useful; parallel implementation is not.

| Step | Modules touched | Depends on |
|---|---|---|
| Task 1 shared types/events | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Task 0 |
| Task 2 graphology model | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Task 1 |
| Task 3 hit projector | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Task 1, Task 2 for shared types |
| Task 4 camera | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Task 2 for spotlight helper import |
| Task 5 wheel | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Task 1 |
| Task 6 overlay DOM | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Tasks 2, 3, 4, 5 |
| Task 7 final verification | repo-wide tests/browser | Tasks 1-6 |

Parallel lanes:

- Lane A: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7.
- Lane B: read-only review / QA scripts can run in parallel after Task 5, but should not edit files.

Execution order: implement sequentially in one branch. Use subagents only for read-only review or for isolated test drafting after a task has landed.

Conflict flags: all implementation tasks touch `sigma-global-renderer.ts` and shared fake runtime tests. Parallel code edits would create avoidable merge conflicts.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~30min / CC: ~8min)** — Camera boundary — Pass explicit community id into camera helpers
  - Surfaced by: architecture review — camera module must not decide selected community.
  - Files: `packages/graph-engine/src/render/sigma-global-camera.ts`, `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-global-camera.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-global-camera.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **T2 (P1, human: ~45min / CC: ~12min)** — Overlay cleanup — Add explicit active drag listener cleanup contract
  - Surfaced by: architecture/performance review — extracted overlay controller otherwise loses commit/cancel cleanup ownership.
  - Files: `packages/graph-engine/src/render/sigma-overlay-dom.ts`, `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-overlay-dom.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **T3 (P1, human: ~30min / CC: ~8min)** — Boundary tests — Update renderer boundary test for overlay DOM pointer ownership
  - Surfaced by: architecture review — current `renderer-boundary.test.ts` expects pointerdown in the old file.
  - Files: `packages/graph-engine/test/renderer-boundary.test.ts`, `packages/graph-engine/src/render/sigma-overlay-dom.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/renderer-boundary.test.ts`

- [ ] **T4 (P1, human: ~30min / CC: ~8min)** — Wheel cleanup — Add post-destroy no-op and listener unregister tests
  - Surfaced by: test/performance review — wheel controller must not act after destroy even if captor cleanup fails.
  - Files: `packages/graph-engine/src/render/sigma-wheel-zoom.ts`, `packages/graph-engine/test/sigma-wheel-zoom.test.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-wheel-zoom.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **T5 (P2, human: ~45min / CC: ~12min)** — Direct module tests — Split high-value behavior checks out of the integration file
  - Surfaced by: test review — moved branches need direct tests, not only old integration coverage.
  - Files: `packages/graph-engine/test/sigma-graphology-model.test.ts`, `packages/graph-engine/test/sigma-hit-projector.test.ts`, `packages/graph-engine/test/sigma-global-camera.test.ts`, `packages/graph-engine/test/sigma-wheel-zoom.test.ts`, `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-*.test.ts`

- [ ] **T6 (P2, human: ~20min / CC: ~5min)** — Production browser gate — Run existing Sigma production regression as final acceptance
  - Surfaced by: performance review and prior learning `sigma_plan_must_name_production_perf_gate`.
  - Files: no source changes expected; record artifact path in final issue comment.
  - Verify: `bash tests/graph-sigma-global-production.regression-1.sh`

## Final Self-Review Checklist

- [ ] Spec coverage: every module from the design has a task.
- [ ] No helper imports `./sigma-global-renderer` at runtime.
- [ ] New helpers are not exported from `packages/graph-engine/src/render/index.ts`.
- [ ] `sigma-global-renderer.ts` still exports existing direct-source symbols used by tests.
- [ ] Existing graph-engine behavior tests pass.
- [ ] Browser smoke result is recorded honestly.
- [ ] #77 has an implementation comment.

## GSTACK REVIEW REPORT

Runs:

| Reviewer | Status | Result |
|---|---|---|
| Main engineering review | complete | Plan needed hardening before implementation |
| Architecture / feasibility subagent | complete | Found camera boundary, overlay cleanup, boundary-test, hit-projector, overlay-policy, and wheel stale-event issues |
| Performance / reliability subagent | complete | Found overlay cleanup, wheel post-destroy, production browser gate, label cap, and animation/wheel proof gaps |
| Testing subagent | complete | Found wheel cleanup, overlay DOM interaction, browser repeatability, raw-data boundary, boundary-test strength, and direct module-test gaps |

Findings:

| Severity | Finding | Resolution in this plan |
|---|---|---|
| P1 | Camera module would decide selected community itself | Renderer now computes community id and passes it into camera helpers |
| P1 | Overlay drag listener cleanup lacked an explicit owner | `sigma-overlay-dom.ts` now has `clearActiveDragListeners()` and required tests |
| P1 | Existing renderer boundary test would fail after overlay extraction | Task 6 now updates `renderer-boundary.test.ts` |
| P1 | Wheel controller could act after destroy | `isDestroyed` guard and post-destroy tests added |
| P1 | Manual browser smoke was not repeatable enough | Existing Sigma production browser regression is now a hard final gate |
| P2 | Hit projector remained coupled to drag | rendered-object translation now moves to `sigma-hit-projector.ts` |
| P2 | Overlay policy was misplaced in Graphology model | overlay node/label caps and selection move with `sigma-overlay-dom.ts` |
| P2 | Direct tests were missing for extracted modules | five direct module test files added to the plan |
| P2 | Raw-data boundary assertion would become false confidence | Task 2 now inspects `sigma-graphology-model.ts` directly |

Prior learnings applied:

- `sigma_plan_must_name_production_perf_gate` (confidence 9/10): final acceptance now runs `tests/graph-sigma-global-production.regression-1.sh`.
- `sigma_camera_setstate_does_not_cancel_animation` (confidence 9/10): wheel/camera behavior remains covered by production browser regression and explicit wheel no-op tests.
- `graph_refactor_interaction_chain_before_facade` (confidence 9/10): plan preserves the real Sigma interaction path and does not jump to facade redesign.

VERDICT: proceed with implementation after this reviewed plan commit. Complexity is medium-high but justified for #77 because the goal is durable renderer boundaries before more global Sigma features land.

NO UNRESOLVED DECISIONS
