# Sigma Animation Overlay Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sigma global overlay follow camera animations through a cheap shared transform, then settle back to exact overlay geometry when the camera stops.

**Architecture:** Keep #79 boundaries: `sigma-global-renderer.ts` only decides which overlay update mode to call, `sigma-overlay-dom.ts` owns overlay update state, and pure transform math lives in a small render helper. Camera animation frames use an overlay-root transform shared by community regions, node hit targets, and labels; exact `reposition()` clears that transform and refreshes the baseline.

**Tech Stack:** TypeScript, Node `node:test`, graph-engine render modules, Playwright production regression script.

---

## Completion Standard

This work is complete only when all of these are true:

- `spotlight_animation` exists in the production browser artifact and is required by validation.
- `nodes-1000-many-communities` exists, stays below the Sigma global route node limit, and is included in default production regression shapes.
- During `camera.isAnimated()`, overlay updates do not recompute every community cloud geometry.
- When animation stops, the next render or settle watcher clears the root transform and runs exact overlay reposition.
- Community regions, node hit targets, and labels share the same temporary transform.
- Wheel, direct reset, reduced motion, resize, data update, and node drag do not rely on the animation fast path.
- Wheel/reset/resize/drag interruptions suppress the animation fast path until `camera.isAnimated()` is false, because Sigma `setState()` does not cancel a queued `animate()`.
- Unit tests and browser performance evidence are recorded.
- `workbench/PRODUCT.md` and `CHANGELOG.md` describe the shipped #75 outcome.

## File Structure

- Create `packages/graph-engine/src/render/sigma-overlay-camera-transform.ts`
  - Pure helper for world anchor selection, anchor projection, translate/scale derivation, and CSS transform formatting.
- Create `packages/graph-engine/test/sigma-overlay-camera-transform.test.ts`
  - Unit tests for transform math and rejection rules.
- Modify `packages/graph-engine/src/render/sigma-overlay-dom.ts`
  - Add exact baseline state, `repositionForCameraAnimation()`, and `invalidateAnimationBaseline()`.
  - Keep `reposition()` as the exact path.
- Modify `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  - Cover fast path, exact settle, no DOM churn, no geometry calls, shared root transform.
- Modify `packages/graph-engine/src/render/sigma-global-renderer.ts`
  - Route Sigma render events to exact or fast overlay update based on camera animation and interaction state.
  - Force exact overlay update for wheel, resize, reset, and drag boundaries.
- Modify `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Cover animated render, settle render, wheel override, drag disable, and late destroy safety.
- Modify `packages/graph-engine/test/large-graph-fixtures.ts`
  - Add `nodes-1000-many-communities`.
- Modify `packages/graph-engine/test/large-fixtures.test.ts`
  - Existing deterministic fixture loop should cover the new shape.
- Modify `tests/browser/graph-renderer-trial-shared.ts`
  - Require `spotlight_animation` and treat it as a frame-sampled action.
- Modify `tests/browser/validate-graph-trial-result.mjs`
  - Keep the standalone artifact validator in sync with the new required action and frame gate.
- Modify `tests/browser/graph-sigma-global-production.ts`
  - Add browser helper probes, stable-overlay waits, and `measureSpotlightAnimation()`.
- Modify `workbench/PRODUCT.md`
  - Mark #75 animation performance as landed and record the overlay strategy.
- Modify `CHANGELOG.md`
  - Add a new top entry for the user-visible smoothness improvement.

## Task 1: Add The Many-Community Sigma Fixture

**Files:**
- Modify: `packages/graph-engine/test/large-graph-fixtures.ts`
- Test: `packages/graph-engine/test/large-fixtures.test.ts`

- [ ] **Step 1: Add the failing expectation**

Open `packages/graph-engine/test/large-fixtures.test.ts` and add this test after `keeps generated output stable for the same fixture id`:

```ts
  it("keeps the 1000 node many-community fixture inside the Sigma global route limit", () => {
    const fixture = generateLargeGraphFixture("nodes-1000-many-communities");

    assert.equal(fixture.metadata.nodes, 1000);
    assert.equal(fixture.metadata.communities, 200);
    assert.equal(fixture.metadata.largest_community, 5);
    assert.equal(fixture.metadata.oversized_community, false);
    assert.equal(fixture.data.meta.degraded, false);
  });
```

- [ ] **Step 2: Run the fixture test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/large-fixtures.test.ts
```

Expected: FAIL with `Unknown large graph fixture: nodes-1000-many-communities`.

- [ ] **Step 3: Add the fixture id and spec**

In `packages/graph-engine/test/large-graph-fixtures.ts`, add the id to `LargeGraphFixtureId` after `"nodes-1000-dense"`:

```ts
  | "nodes-1000-many-communities"
```

Add this spec after the `nodes-1000-dense` entry:

```ts
  {
    id: "nodes-1000-many-communities",
    nodes: 1000,
    edges: 1400,
    communities: 200,
    largestCommunity: 5,
    searchHits: 80,
    pinCount: 40,
    oversizedCommunity: false,
    seed: 175
  },
```

- [ ] **Step 4: Run the fixture test and verify it passes**

Run:

```bash
node --import tsx --test packages/graph-engine/test/large-fixtures.test.ts
```

Expected: PASS, including the new test.

- [ ] **Step 5: Commit**

```bash
git add packages/graph-engine/test/large-graph-fixtures.ts packages/graph-engine/test/large-fixtures.test.ts
git commit -m "test: add many-community sigma fixture"
```

## Task 2: Add Pure Overlay Camera Transform Math

**Files:**
- Create: `packages/graph-engine/src/render/sigma-overlay-camera-transform.ts`
- Create: `packages/graph-engine/test/sigma-overlay-camera-transform.test.ts`

- [ ] **Step 1: Write the failing transform tests**

Create `packages/graph-engine/test/sigma-overlay-camera-transform.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  projectSigmaOverlayCameraAnchors,
  sigmaOverlayCameraAnchorWorldPoints,
  sigmaOverlayCameraTransform,
  sigmaOverlayCameraTransformCss
} from "../src/render/sigma-overlay-camera-transform";

describe("sigma overlay camera transform", () => {
  it("derives a root translate and scale from stable projected anchors", () => {
    const base = {
      center: { x: 100, y: 100 },
      right: { x: 200, y: 100 },
      down: { x: 100, y: 200 }
    };
    const current = {
      center: { x: 140, y: 130 },
      right: { x: 340, y: 130 },
      down: { x: 140, y: 330 }
    };

    const transform = sigmaOverlayCameraTransform(base, current);

    assert.deepEqual(transform, {
      translateX: -60,
      translateY: -70,
      scale: 2
    });
    assert.equal(sigmaOverlayCameraTransformCss(transform), "translate(-60px, -70px) scale(2)");
  });

  it("rejects non-uniform scale because one root transform would drift", () => {
    const transform = sigmaOverlayCameraTransform(
      {
        center: { x: 100, y: 100 },
        right: { x: 200, y: 100 },
        down: { x: 100, y: 200 }
      },
      {
        center: { x: 100, y: 100 },
        right: { x: 300, y: 100 },
        down: { x: 100, y: 250 }
      }
    );

    assert.equal(transform, null);
  });

  it("rejects rotated axes because this fast path only supports translate and uniform scale", () => {
    const transform = sigmaOverlayCameraTransform(
      {
        center: { x: 100, y: 100 },
        right: { x: 200, y: 100 },
        down: { x: 100, y: 200 }
      },
      {
        center: { x: 100, y: 100 },
        right: { x: 100, y: 200 },
        down: { x: 0, y: 100 }
      }
    );

    assert.equal(transform, null);
  });

  it("builds world anchors from graph bounds and projects them through a caller function", () => {
    const anchors = sigmaOverlayCameraAnchorWorldPoints({
      minX: 0,
      maxX: 400,
      minY: 100,
      maxY: 500
    });

    assert.deepEqual(anchors, {
      center: { x: 200, y: 300 },
      right: { x: 300, y: 300 },
      down: { x: 200, y: 400 }
    });
    assert.deepEqual(
      projectSigmaOverlayCameraAnchors(anchors, (point) => ({ x: point.x / 2, y: point.y / 2 })),
      {
        center: { x: 100, y: 150 },
        right: { x: 150, y: 150 },
        down: { x: 100, y: 200 }
      }
    );
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-overlay-camera-transform.test.ts
```

Expected: FAIL with a module-not-found error for `sigma-overlay-camera-transform`.

- [ ] **Step 3: Create the transform helper**

Create `packages/graph-engine/src/render/sigma-overlay-camera-transform.ts`:

```ts
import type { GraphScreenPoint } from "./geometry";

export interface SigmaOverlayCameraAnchorProjection {
  center: GraphScreenPoint;
  right: GraphScreenPoint;
  down: GraphScreenPoint;
}

export interface SigmaOverlayCameraAnchorWorldPoints {
  center: { x: number; y: number };
  right: { x: number; y: number };
  down: { x: number; y: number };
}

export interface SigmaOverlayCameraTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

const MIN_ANCHOR_DISTANCE = 1;
// Conservative guards: rejecting borderline transforms falls back to exact reposition.
// The fast path is an optimization only, never the source of final geometry truth.
const SCALE_TOLERANCE = 0.08;
const AXIS_ALIGNMENT_FLOOR = 0.985;

export function sigmaOverlayCameraAnchorWorldPoints(bounds: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}): SigmaOverlayCameraAnchorWorldPoints {
  const center = {
    x: (finiteNumber(bounds.minX, 0) + finiteNumber(bounds.maxX, 0)) / 2,
    y: (finiteNumber(bounds.minY, 0) + finiteNumber(bounds.maxY, 0)) / 2
  };
  const spanX = Math.max(1, Math.abs(finiteNumber(bounds.maxX, center.x) - finiteNumber(bounds.minX, center.x)) / 4);
  const spanY = Math.max(1, Math.abs(finiteNumber(bounds.maxY, center.y) - finiteNumber(bounds.minY, center.y)) / 4);
  return {
    center,
    right: { x: center.x + spanX, y: center.y },
    down: { x: center.x, y: center.y + spanY }
  };
}

export function projectSigmaOverlayCameraAnchors(
  anchors: SigmaOverlayCameraAnchorWorldPoints,
  project: (point: { x: number; y: number }) => GraphScreenPoint
): SigmaOverlayCameraAnchorProjection {
  return {
    center: project(anchors.center),
    right: project(anchors.right),
    down: project(anchors.down)
  };
}

export function sigmaOverlayCameraTransform(
  baseline: SigmaOverlayCameraAnchorProjection,
  current: SigmaOverlayCameraAnchorProjection
): SigmaOverlayCameraTransform | null {
  const baseX = vector(baseline.center, baseline.right);
  const baseY = vector(baseline.center, baseline.down);
  const currentX = vector(current.center, current.right);
  const currentY = vector(current.center, current.down);
  const baseXLength = length(baseX);
  const baseYLength = length(baseY);
  const currentXLength = length(currentX);
  const currentYLength = length(currentY);
  if (
    baseXLength < MIN_ANCHOR_DISTANCE ||
    baseYLength < MIN_ANCHOR_DISTANCE ||
    currentXLength < MIN_ANCHOR_DISTANCE ||
    currentYLength < MIN_ANCHOR_DISTANCE
  ) {
    return null;
  }

  const scaleX = currentXLength / baseXLength;
  const scaleY = currentYLength / baseYLength;
  const scale = (scaleX + scaleY) / 2;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  if (Math.abs(scaleX - scaleY) > SCALE_TOLERANCE) return null;
  if (axisAlignment(baseX, currentX) < AXIS_ALIGNMENT_FLOOR) return null;
  if (axisAlignment(baseY, currentY) < AXIS_ALIGNMENT_FLOOR) return null;

  return {
    translateX: roundCssNumber(current.center.x - baseline.center.x * scale),
    translateY: roundCssNumber(current.center.y - baseline.center.y * scale),
    scale: roundCssNumber(scale)
  };
}

export function sigmaOverlayCameraTransformCss(transform: SigmaOverlayCameraTransform | null): string {
  if (!transform) return "";
  return `translate(${formatCssNumber(transform.translateX)}px, ${formatCssNumber(transform.translateY)}px) scale(${formatCssNumber(transform.scale)})`;
}

function vector(from: GraphScreenPoint, to: GraphScreenPoint): GraphScreenPoint {
  return { x: to.x - from.x, y: to.y - from.y };
}

function length(point: GraphScreenPoint): number {
  return Math.hypot(point.x, point.y);
}

function axisAlignment(left: GraphScreenPoint, right: GraphScreenPoint): number {
  const leftLength = length(left);
  const rightLength = length(right);
  if (leftLength < MIN_ANCHOR_DISTANCE || rightLength < MIN_ANCHOR_DISTANCE) return -1;
  return ((left.x * right.x) + (left.y * right.y)) / (leftLength * rightLength);
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundCssNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
```

- [ ] **Step 4: Run the transform tests and verify they pass**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-overlay-camera-transform.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/graph-engine/src/render/sigma-overlay-camera-transform.ts packages/graph-engine/test/sigma-overlay-camera-transform.test.ts
git commit -m "feat: add sigma overlay camera transform helper"
```

## Task 3: Add Overlay DOM Animation Fast Path

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-overlay-dom.ts`
- Modify: `packages/graph-engine/test/sigma-overlay-dom.test.ts`

- [ ] **Step 1: Write failing overlay controller tests**

In `packages/graph-engine/test/sigma-overlay-dom.test.ts`, update the import:

```ts
import {
  createSigmaOverlayDomController,
  sigmaCommunityLabels,
  sigmaOverlayNodes
} from "../src/render/sigma-overlay-dom";
```

Keep the import shape unchanged; the new methods are reached through the controller instance.

Add these tests inside `describe("Sigma overlay DOM controller", () => { ... })` after `reposition updates boxes without creating elements, replacing children, or rebinding listeners`:

```ts
  it("uses an overlay root transform during camera animation without recomputing cloud geometry", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    const childrenBefore = [...fixture.overlayRoot.children];
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");
    const regionBefore = communityRegion(fixture.overlayRoot, "community-a");
    const labelBefore = communityLabel(fixture.overlayRoot, "community-a");
    fixture.resetCloudCalls();

    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();

    assert.equal(fixture.cloudCalls(), 0);
    assert.match(fixture.overlayRoot.style.transform || "", /^translate\(/);
    assert.match(fixture.overlayRoot.style.transform || "", /scale\(1\.5\)$/);
    assert.equal(fixture.overlayRoot.style.transformOrigin, "0 0");
    assert.equal(fixture.overlayRoot.style.willChange, "transform");
    assert.deepEqual(fixture.overlayRoot.children, childrenBefore);
    assert.equal(nodeTarget(fixture.overlayRoot, "alpha"), alphaBefore);
    assert.equal(communityRegion(fixture.overlayRoot, "community-a"), regionBefore);
    assert.equal(communityLabel(fixture.overlayRoot, "community-a"), labelBefore);
    assert.equal(alphaBefore?.style.transform || "", "");
    assert.equal(regionBefore?.style.transform || "", "");
    assert.equal(labelBefore?.style.transform || "", "");
  });

  it("settles an animation frame with exact reposition and clears the root transform", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();
    fixture.resetCloudCalls();

    fixture.controller.reposition();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(fixture.overlayRoot.style.transformOrigin, "");
    assert.equal(fixture.overlayRoot.style.willChange, "");
    assert.ok(fixture.cloudCalls() > 0);
  });

  it("falls back to exact reposition when animation has no valid baseline", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.controller.invalidateAnimationBaseline();
    fixture.resetCloudCalls();

    fixture.controller.repositionForCameraAnimation();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.ok(fixture.cloudCalls() > 0);
  });

  it("clears an active animation transform on destroy", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();

    fixture.controller.destroy();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(fixture.overlayRoot.style.transformOrigin, "");
    assert.equal(fixture.overlayRoot.style.willChange, "");
  });
```

Add this helper near `communityRegion`:

```ts
function communityLabel(root: FakeElement, communityId: string): FakeElement | undefined {
  return root.children.find((child) => child.className === "sigma-global-community-label" && child.dataset.communityId === communityId);
}
```

Change `controllerFixture()` to track mutable Sigma and cloud calls:

```ts
  let sigma = options.sigma || sigmaIdentity();
  let cloudCalls = 0;
```

In the controller input, replace `getSigma` and `communityCloudFor` with:

```ts
    getSigma: () => sigma,
    communityCloudFor: (_communityId, wash) => {
      cloudCalls += 1;
      return {
        box: {
          left: wash.cx - wash.rx,
          top: wash.cy - wash.ry,
          width: wash.rx * 2,
          height: wash.ry * 2
        },
        localPoints: null
      };
    },
```

Add these return helpers from `controllerFixture()`:

```ts
    setSigma: (next: SigmaGlobalSigmaLike) => {
      sigma = next;
    },
    cloudCalls: () => cloudCalls,
    resetCloudCalls: () => {
      cloudCalls = 0;
    },
```

Add this helper near `sigmaIdentity()`:

```ts
function sigmaTransform(input: { scale: number; translateX: number; translateY: number }): SigmaGlobalSigmaLike {
  return {
    graphToViewport: (point) => ({
      x: point.x * input.scale + input.translateX,
      y: point.y * input.scale + input.translateY
    })
  };
}
```

Also extend the `controllerFixture` options type:

```ts
  sigma?: SigmaGlobalSigmaLike;
```

- [ ] **Step 2: Run overlay tests and verify they fail**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-overlay-dom.test.ts
```

Expected: FAIL because `repositionForCameraAnimation` and `invalidateAnimationBaseline` do not exist.

- [ ] **Step 3: Extend the overlay controller interface**

In `packages/graph-engine/src/render/sigma-overlay-dom.ts`, add imports:

```ts
import {
  projectSigmaOverlayCameraAnchors,
  sigmaOverlayCameraAnchorWorldPoints,
  sigmaOverlayCameraTransform,
  sigmaOverlayCameraTransformCss,
  type SigmaOverlayCameraAnchorProjection,
  type SigmaOverlayCameraAnchorWorldPoints
} from "./sigma-overlay-camera-transform";
```

Change the interface to:

```ts
export interface SigmaOverlayDomController {
  rebuild(): void;
  reposition(): void;
  repositionForCameraAnimation(): void;
  invalidateAnimationBaseline(): void;
  clearActiveDragListeners(): void;
  destroy(): void;
}
```

- [ ] **Step 4: Add baseline state and return the new methods**

Inside `createSigmaOverlayDomController`, after the existing maps:

```ts
  let cameraAnimationBaseline: {
    world: SigmaOverlayCameraAnchorWorldPoints;
    screen: SigmaOverlayCameraAnchorProjection;
  } | null = null;
```

Change the returned object to:

```ts
  return {
    rebuild,
    reposition,
    repositionForCameraAnimation,
    invalidateAnimationBaseline,
    clearActiveDragListeners,
    destroy
  };
```

- [ ] **Step 5: Implement exact-path baseline refresh and transform clearing**

At the top of `reposition()`, after the destroyed guard, clear the temporary transform:

```ts
    clearCameraAnimationTransform();
```

At the end of `reposition()`, after labels are positioned, add:

```ts
    refreshCameraAnimationBaseline(adapterData, sigma, options);
```

Add these functions inside `createSigmaOverlayDomController`:

```ts
  function repositionForCameraAnimation(): void {
    if (input.isDestroyed()) return;
    if (!cameraAnimationBaseline) {
      reposition();
      return;
    }
    const sigma = input.getSigma();
    const options = input.getOptions();
    const current = projectSigmaOverlayCameraAnchors(
      cameraAnimationBaseline.world,
      (point) => sigmaWorldPointToScreenPoint(sigma, point, options)
    );
    const transform = sigmaOverlayCameraTransform(cameraAnimationBaseline.screen, current);
    const css = sigmaOverlayCameraTransformCss(transform);
    if (!css) {
      reposition();
      return;
    }
    input.overlayRoot.style.transformOrigin = "0 0";
    input.overlayRoot.style.transform = css;
    input.overlayRoot.style.willChange = "transform";
  }

  function invalidateAnimationBaseline(): void {
    cameraAnimationBaseline = null;
    clearCameraAnimationTransform();
  }

  function refreshCameraAnimationBaseline(
    adapterData: GraphRendererAdapterData,
    sigma: SigmaGlobalSigmaLike,
    options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
  ): void {
    const world = sigmaOverlayCameraAnchorWorldPoints(adapterData.renderable.worldBounds);
    cameraAnimationBaseline = {
      world,
      screen: projectSigmaOverlayCameraAnchors(world, (point) => sigmaWorldPointToScreenPoint(sigma, point, options))
    };
  }

  function clearCameraAnimationTransform(): void {
    input.overlayRoot.style.transform = "";
    input.overlayRoot.style.transformOrigin = "";
    input.overlayRoot.style.willChange = "";
  }
```

In `destroy()`, call `invalidateAnimationBaseline()` before clearing entries:

```ts
    invalidateAnimationBaseline();
```

- [ ] **Step 6: Run overlay tests and verify they pass**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-overlay-dom.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/graph-engine/src/render/sigma-overlay-dom.ts packages/graph-engine/test/sigma-overlay-dom.test.ts
git commit -m "feat: add sigma overlay animation fast path"
```

## Task 4: Route Renderer Camera Frames To Exact Or Fast Overlay Updates

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests for animated and settled camera frames**

In `packages/graph-engine/test/sigma-global-renderer.test.ts`, add this test after `repositions overlays on camera updates without rebuilding DOM or rebinding listeners`:

```ts
  it("uses the overlay animation fast path while the Sigma camera is animated and settles exactly afterward", () => {
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });
    sigma.emit("afterRender");

    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    sigma.camera.finishAnimation();
    sigma.emit("afterRender");

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    renderer.destroy();
  });
```

Add this method to `class FakeCamera`:

```ts
  finishAnimation(): void {
    this.animated = false;
  }
```

- [ ] **Step 2: Write failing renderer tests for wheel and drag exact paths**

Add these tests after the animated/settled test:

```ts
  it("keeps exact overlay reposition after wheel setState until a prior camera animation settles", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    sigma.mouseCaptor.emitWheel({ x: 240, y: 160, deltaY: 80, deltaMode: 0 });
    sigma.emit("afterRender");

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    sigma.camera.finishAnimation();
    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    renderer.destroy();
  });

  it("keeps exact overlay reposition after resetView until an active camera animation settles", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    renderer.resetView();
    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    sigma.camera.finishAnimation();
    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    renderer.destroy();
  });

  it("settles exact overlay geometry even when no afterRender fires after animation completion", () => {
    const animationFrames: FrameRequestCallback[] = [];
    const container = fakeContainer({
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      },
      cancelAnimationFrame: () => undefined
    });
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container,
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);
    assert.equal(animationFrames.length, 1);

    sigma.camera.finishAnimation();
    animationFrames.shift()?.(0);

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    renderer.destroy();
  });

  it("disables the overlay animation fast path while a node drag is active", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ betaPinned: false }),
      theme: "shan-shui",
      runtime,
      pins: {},
      onPinsChanged: () => undefined
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("moveBody", sigmaEventPayload(null, 151, 262));
    sigma.emit("afterRender");

    assert.equal(renderer.overlayRoot.style.transform, "");

    sigma.emit("upStage", sigmaEventPayload(null, 171, 282));
    renderer.destroy();
  });

  it("clears the animation transform when data updates during an active camera animation", () => {
    const runtime = fakeRuntime();
    const initialData = adapterDataFixture();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: initialData,
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    renderer.update({ adapterData: adapterDataWithAddedNodeAndEdge(initialData) });

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    renderer.destroy();
  });

  it("suppresses the overlay animation fast path after resize until the active camera animation settles", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class FakeResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer({ ResizeObserver: FakeResizeObserver as typeof ResizeObserver }),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    resizeCallback?.([resizeObserverEntry(480, 320)], {} as ResizeObserver);
    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    sigma.emit("afterRender");
    assert.equal(renderer.overlayRoot.style.transform, "");

    renderer.destroy();
  });

  it("can destroy the renderer while an overlay animation transform is active", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.emit("afterRender");
    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    renderer.destroy();

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.children.length, 0);
  });
```

- [ ] **Step 3: Run renderer tests and verify they fail**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
```

Expected: FAIL because renderer still calls exact `reposition()` for every `afterRender`.

- [ ] **Step 4: Add renderer camera-frame routing state**

In `createSigmaGlobalRenderer`, near the resize state variables, add:

```ts
  let suppressOverlayAnimationFastPathUntilCameraSettles = false;
  let overlayAnimationSettleFrame: number | null = null;
```

Replace this line in `bindSigmaEvents()`:

```ts
    const cameraUpdated = (): void => overlayDomController?.reposition();
```

with:

```ts
    const cameraUpdated = (): void => refreshOverlayForCameraFrame();
```

Add this function near `unbindSigmaEvents()`:

```ts
  function refreshOverlayForCameraFrame(): void {
    if (destroyed) return;
    try {
      const camera = sigma.getCamera?.();
      const animated = Boolean(camera?.isAnimated?.());
      if (activeNodeDrag || suppressOverlayAnimationFastPathUntilCameraSettles || !animated) {
        overlayDomController?.reposition();
        if (!animated) {
          suppressOverlayAnimationFastPathUntilCameraSettles = false;
          cancelOverlayAnimationSettleCheck();
        }
        return;
      }
      overlayDomController?.repositionForCameraAnimation();
      scheduleOverlayAnimationSettleCheck();
    } catch (error) {
      options.onFatalError?.(error);
    }
  }

  function suppressOverlayAnimationFastPathUntilSettled(): void {
    suppressOverlayAnimationFastPathUntilCameraSettles = true;
    overlayDomController?.invalidateAnimationBaseline();
  }

  function scheduleOverlayAnimationSettleCheck(): void {
    if (overlayAnimationSettleFrame !== null) return;
    const view = sigmaRoot.ownerDocument.defaultView;
    if (!view?.requestAnimationFrame) {
      if (!Boolean(sigma.getCamera?.().isAnimated?.())) {
        suppressOverlayAnimationFastPathUntilCameraSettles = false;
        overlayDomController?.reposition();
      }
      return;
    }
    const run = (): void => {
      overlayAnimationSettleFrame = null;
      if (destroyed) return;
      const animated = Boolean(sigma.getCamera?.().isAnimated?.());
      if (animated) {
        overlayAnimationSettleFrame = view.requestAnimationFrame(run);
        return;
      }
      suppressOverlayAnimationFastPathUntilCameraSettles = false;
      overlayDomController?.reposition();
    };
    overlayAnimationSettleFrame = view.requestAnimationFrame(run);
  }

  function cancelOverlayAnimationSettleCheck(): void {
    if (overlayAnimationSettleFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(overlayAnimationSettleFrame);
    overlayAnimationSettleFrame = null;
  }
```

- [ ] **Step 5: Mark direct camera and interaction boundaries as exact**

In `resetView()`, after `setState`:

```ts
      suppressOverlayAnimationFastPathUntilSettled();
```

In `zoomSigmaCameraAtViewportPoint()`, before the direct `setState` path:

```ts
    suppressOverlayAnimationFastPathUntilSettled();
```

The direct path should become:

```ts
    suppressOverlayAnimationFastPathUntilSettled();
    camera?.setState?.(nextState);
```

In `scheduleResizeRefresh()`, before exact reposition:

```ts
        suppressOverlayAnimationFastPathUntilSettled();
```

The resize run body should keep:

```ts
        sigma.refresh?.();
        overlayDomController?.reposition();
```

In `destroy()`, cancel any pending settle watcher before removing DOM:

```ts
      cancelOverlayAnimationSettleCheck();
```

In `beginNodeDrag()`, after `cancelNodeDrag()`:

```ts
    suppressOverlayAnimationFastPathUntilSettled();
```

In `applyNodeDragPoint()`, keep the current exact rebuild path after drag commit. Do not add fast-path logic there.

- [ ] **Step 6: Run renderer tests and verify they pass**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/graph-engine/src/render/sigma-global-renderer.ts packages/graph-engine/test/sigma-global-renderer.test.ts
git commit -m "feat: route sigma overlay camera animation frames"
```

## Task 5: Add Spotlight Animation Browser Measurement

**Files:**
- Modify: `tests/browser/graph-renderer-trial-shared.ts`
- Modify: `tests/browser/validate-graph-trial-result.mjs`
- Modify: `tests/browser/graph-sigma-global-production.ts`

- [ ] **Step 1: Add spotlight animation to shared trial requirements**

In `tests/browser/graph-renderer-trial-shared.ts`, add `"nodes-1000-many-communities"` to `FULL_TRIAL_SHAPES` after `"nodes-1000-dense"` so the many-community pressure case is part of default production regression, not only the targeted #75 command.

In both `tests/browser/graph-renderer-trial-shared.ts` and `tests/browser/validate-graph-trial-result.mjs`, add `"spotlight_animation"` after `"container_select"` in the required action list:

```ts
  "container_select",
  "spotlight_animation",
  "drawer_open",
```

Change frame sampled actions in both files to:

```ts
export const FRAME_SAMPLED_ACTIONS = new Set<string>(["wheel_zoom", "drag", "spotlight_animation"]);
```

For `validate-graph-trial-result.mjs`, use the plain JavaScript form:

```js
const FRAME_SAMPLED_ACTIONS = new Set(["wheel_zoom", "drag", "spotlight_animation"]);
```

- [ ] **Step 2: Add browser helper probes**

In the HTML script inside `tests/browser/graph-sigma-global-production.ts`, after `containerHitTarget(id)`, add:

```ts
      function communityRegionState(id) {
        const element = id
          ? document.querySelector('.sigma-global-community-region[data-community-id="' + CSS.escape(id) + '"]')
          : document.querySelector(".sigma-global-community-region");
        const overlay = document.querySelector(".sigma-global-overlay");
        if (!element) {
          return {
            exists: false,
            selected: false,
            overlayTransform: overlay?.style.transform || "",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            id: id || null
          };
        }
        const rect = element.getBoundingClientRect();
        return {
          exists: true,
          selected: element.dataset.selected === "true",
          overlayTransform: overlay?.style.transform || "",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          id: element.dataset.communityId || id || null
        };
      }
```

Expose it on `window.__sigmaProduction`:

```ts
        communityRegionState,
```

- [ ] **Step 3: Update frame sample record action typing**

Change `frameSampleRecord` input type:

```ts
  input: {
    action: "wheel_zoom" | "drag" | "spotlight_animation";
    runs: { fps: number; p95: number; durationMs: number }[];
    failureClass?: string | null;
    failureDetail?: string | null;
  }
```

Change failure class selection in `frameSampleRecord()`:

```ts
  const failureClass = input.failureClass || productionFailure || frameFailure;
```

Change failure detail selection so settle failures and frame metrics are both visible when they happen together:

```ts
  const metricDetail = `median_fps=${fps}; median_frame_p95_ms=${p95}; floor=${FPS_FLOOR}; ceiling=${FRAME_P95_CEILING_MS}; production_path=${(probe as { productionPath?: boolean }).productionPath}`;
  const failureDetail = failureClass
    ? [input.failureDetail, metricDetail].filter(Boolean).join("; ")
    : null;
```

Then pass `failure_detail: failureDetail` in the returned record.

- [ ] **Step 4: Add the spotlight animation measurement**

Add this function after `measureContainerSelect()`:

```ts
async function measureSpotlightAnimation(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await waitForSpotlightReady(page);
  const target = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    return trial.containerHitTarget(trial.firstCommunityId);
  });
  if (!target) throw new Error("measureSpotlightAnimation: no Sigma container hit target");

  const samplePromise = sampleAnimationFrames(page, 380);
  await clickPoint(page, target as PointerTarget);
  const run = await samplePromise;
  const selectedId = (target as PointerTarget).id;
  await page.waitForFunction(
    (id: string | null) => {
      const counts = (window as any).__sigmaProduction?.counts?.();
      if (!id) return false;
      return counts?.lastSelectionKind === "community" && (counts.lastSelectionCommunityIds || []).includes(id);
    },
    selectedId,
    { timeout: 4000 }
  );
  await waitForSpotlightSettled(page, selectedId);
  const region = await page.evaluate((id: string | null) => {
    const trial = (window as any).__sigmaProduction;
    return trial.communityRegionState(id);
  }, selectedId) as SigmaSpotlightRegionState;

  const failures: string[] = [];
  if (!region.exists) failures.push("region_missing");
  if (!region.selected) failures.push("region_not_selected");
  if (region.width <= 0 || region.height <= 0) failures.push(`region_size=${region.width}x${region.height}`);
  if (region.overlayTransform) failures.push(`overlay_transform_not_cleared=${region.overlayTransform}`);

  return frameSampleRecord(page, metadata, {
    action: "spotlight_animation",
    runs: [run],
    failureClass: failures.length ? "spotlight_animation_settle_failed" : null,
    failureDetail: failures.length ? failures.join("; ") : null
  });
}
```

Add these helpers near the other measurement helpers:

```ts
interface SigmaSpotlightRegionState {
  exists: boolean;
  selected: boolean;
  overlayTransform: string;
  left: number;
  top: number;
  width: number;
  height: number;
  id: string | null;
}

async function waitForSpotlightReady(page: PageLike): Promise<void> {
  await page.evaluate(() => (window as any).__sigmaProduction.returnGlobal());
  await page.waitForFunction(
    () => {
      const trial = (window as any).__sigmaProduction;
      const counts = trial?.counts?.();
      const region = trial?.communityRegionState?.(trial.firstCommunityId);
      return counts?.lastSelectionKind == null
        && counts?.selectedContainerId == null
        && region?.exists
        && !region.overlayTransform
        && region.width > 0
        && region.height > 0;
    },
    undefined,
    { timeout: 4000 }
  );
  await waitForStableCommunityRegion(page, null);
}

async function waitForSpotlightSettled(page: PageLike, id: string | null): Promise<void> {
  await page.waitForFunction(
    (communityId: string | null) => {
      const trial = (window as any).__sigmaProduction;
      const counts = trial?.counts?.();
      const region = trial?.communityRegionState?.(communityId);
      return communityId
        && counts?.lastSelectionKind === "community"
        && (counts.lastSelectionCommunityIds || []).includes(communityId)
        && region?.exists
        && region.selected
        && !region.overlayTransform
        && region.width > 0
        && region.height > 0;
    },
    id,
    { timeout: 4000 }
  );
  await waitForStableCommunityRegion(page, id);
}

async function waitForStableCommunityRegion(page: PageLike, id: string | null, maxFrames = 12): Promise<void> {
  let previous = await page.evaluate((communityId: string | null) => {
    const trial = (window as any).__sigmaProduction;
    return trial.communityRegionState(communityId || trial.firstCommunityId);
  }, id) as SigmaSpotlightRegionState;
  for (let index = 0; index < maxFrames; index += 1) {
    await waitForAnimationFrames(page, 1);
    const current = await page.evaluate((communityId: string | null) => {
      const trial = (window as any).__sigmaProduction;
      return trial.communityRegionState(communityId || trial.firstCommunityId);
    }, id) as SigmaSpotlightRegionState;
    const stable = previous.exists
      && current.exists
      && !current.overlayTransform
      && Math.hypot(current.left - previous.left, current.top - previous.top) < 0.1
      && Math.abs(current.width - previous.width) < 0.1
      && Math.abs(current.height - previous.height) < 0.1;
    if (stable) return;
    previous = current;
  }
}
```

- [ ] **Step 5: Add the action to the production sequence**

In `measureShape()`, add `measureSpotlightAnimation` immediately after `measureContainerSelect`:

```ts
      () => measureContainerSelect(page, metadata),
      () => measureSpotlightAnimation(page, metadata),
      () => measureDrawerOpen(page, metadata),
```

- [ ] **Step 6: Run TypeScript check for the browser script**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Run targeted production performance**

Run:

```bash
GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense,nodes-1000-many-communities \
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-issue-75-after \
bash tests/graph-sigma-global-production.regression-1.sh
```

Expected:

- Records include `spotlight_animation` for both requested shapes.
- `spotlight_animation` passes `fps >= 45` and `frame_p95_ms <= 22.3`.
- If `nodes-1000-dense/search_highlight` still fails near the known baseline, record it as a baseline concern and verify `spotlight_animation` is clean.

- [ ] **Step 8: Run the standalone artifact validator**

Run:

```bash
node tests/browser/validate-graph-trial-result.mjs /tmp/llm-wiki-issue-75-after/sigma-global-production-results.json
```

Expected: PASS, and `spotlight_animation` is enforced as both required and frame-sampled.

- [ ] **Step 9: Commit**

```bash
git add tests/browser/graph-renderer-trial-shared.ts tests/browser/validate-graph-trial-result.mjs tests/browser/graph-sigma-global-production.ts
git commit -m "test: measure sigma spotlight animation performance"
```

## Task 6: Run Full Verification And Update Docs

**Files:**
- Modify: `workbench/PRODUCT.md`
- Modify: `CHANGELOG.md`
- Inspect: `README.md`

- [ ] **Step 1: Run focused graph-engine tests**

Run:

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-overlay-camera-transform.test.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/community-cloud-geometry.test.ts \
  packages/graph-engine/test/large-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run graph-engine full test and typecheck**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run final targeted browser performance**

Run:

```bash
GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense,nodes-1000-many-communities \
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-issue-75-final \
bash tests/graph-sigma-global-production.regression-1.sh
```

Expected:

- Artifact exists at `/tmp/llm-wiki-issue-75-final/sigma-global-production-results.json`.
- `spotlight_animation` exists for both shapes.
- `spotlight_animation` records pass.
- Any existing non-#75 `search_highlight` failure is called out in the PR notes with the action name and number.

Then run:

```bash
node tests/browser/validate-graph-trial-result.mjs /tmp/llm-wiki-issue-75-final/sigma-global-production-results.json
```

Expected: PASS.

- [ ] **Step 4: Update product documentation**

In `workbench/PRODUCT.md`, change the Stage 4.8 current-state sentence:

```md
**当前状态**：已落地。全局 Sigma 点社区会停留在全局路线并进入社区高亮态，右抽屉继续负责摘要与动作；相机轻量动画和动画期间 overlay 轻量跟随策略均已接入。
```

Change the Stage 4.8 range bullet:

```md
- 相机轻量构图动画（平移 + 受限缩放）；动画期间社区云团、节点命中框和标签共用轻量 overlay transform，稳定后精确校准，避免每帧重算全部社区云团。
```

Change the later Stage 4.8 status line:

```md
**当前状态**：已落地。点社区在全局高亮、不进入社区视图；复用现有 selection（社区）视觉链路补节点弱化 + 相机动画。#75 已补齐动画期间 overlay 轻量跟随和结束后精确校准。
```

- [ ] **Step 5: Update changelog**

At the top of `CHANGELOG.md`, above `v3.6.17`, add:

```md
## v3.6.18 (2026-06-30)

### 改进

- 全局 Sigma 点社区高亮和缩放按钮动画更顺：动画期间社区云团、节点命中框和标签先一起轻量跟随，相机稳定后再精确校准，减少大图多社区场景下的卡顿。
- 生产性能检查新增 `spotlight_animation` 记录，并新增 1000 节点、多社区压力样本，后续动画流畅度有固定证据可对比。
```

- [ ] **Step 6: Check whether README needs a feature-list update**

Inspect `README.md` before push. Expected: no README change unless its feature list explicitly mentions Sigma animation behavior or production performance actions; this PR improves an internal graph interaction path and updates the product/changelog docs where that status belongs.

- [ ] **Step 7: Run push-prep checks**

Run:

```bash
bash install.sh --dry-run --platform codex
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
git diff --check
```

Expected:

- Install dry-run exits 0.
- Privacy grep prints no matches.
- `git diff --check` exits 0.

- [ ] **Step 8: Commit docs**

```bash
git add workbench/PRODUCT.md CHANGELOG.md
git commit -m "docs: document sigma animation overlay performance"
```

## Task 7: Final Branch Review Prep

**Files:**
- No planned source edits.

- [ ] **Step 1: Inspect branch diff**

Run:

```bash
git status --short --branch
git log --oneline --decorate -6
git diff --stat origin/main...HEAD
```

Expected:

- Only intended files are modified or committed.
- Untracked directories unrelated to this branch remain untracked and unstaged.

- [ ] **Step 2: Review final browser artifact summary**

Run:

```bash
node -e '
const fs = require("fs");
const file = "/tmp/llm-wiki-issue-75-final/sigma-global-production-results.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
for (const record of data.records.filter((item) => item.action === "spotlight_animation")) {
  console.log(`${record.graph_shape}: pass=${record.pass} fps=${record.fps} p95=${record.frame_p95_ms} failure=${record.failure_class || "none"}`);
}
'
```

Expected: two `spotlight_animation` lines, both `pass=true`.

- [ ] **Step 3: Prepare PR notes**

Use this summary shape:

```md
## Summary

- Added a Sigma overlay camera-animation fast path that moves community regions, node hit targets, and labels together through a root transform.
- Settles back to exact overlay geometry after camera animation, resize, wheel, drag, data update, and reduced-motion paths.
- Added `spotlight_animation` production performance coverage plus a 1000-node many-community fixture.

## Verification

- `node --import tsx --test ...`
- `npm run test -w @llm-wiki/graph-engine`
- `npm run typecheck`
- `GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense,nodes-1000-many-communities GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-issue-75-final bash tests/graph-sigma-global-production.regression-1.sh`
- `node tests/browser/validate-graph-trial-result.mjs /tmp/llm-wiki-issue-75-final/sigma-global-production-results.json`

## Baseline Concern

- `nodes-1000-dense/search_highlight` may still reflect the pre-existing duration concern observed before #75 work. Do not mix it with the new `spotlight_animation` result.
```

- [ ] **Step 4: Run review skill before ship**

Run the project review flow requested by the user before merging:

```bash
git status --short --branch
```

Expected: branch contains only intentional #75 commits and the previously existing untracked directories are not staged.

## Self-Review Notes

- Spec coverage: fixture pressure, animation fast path, exact settle, wheel/direct paths, drag, reduced motion, resize, destroy, browser measurement, and docs all map to tasks above.
- Review hardening: wheel/reset/resize/drag now suppress fast path until camera settle, a rAF settle watcher handles missing final `afterRender`, and destroy clears temporary transform state.
- Validation hardening: `spotlight_animation` is required in both TypeScript and standalone validators, and the many-community fixture is part of default production regression.
- Scope check: this plan does not change Sigma, Graphology, community route semantics, drawer ownership, node label truncation, the 2000 node route limit, or npm dependencies.
- Type consistency: controller methods are `reposition()`, `repositionForCameraAnimation()`, and `invalidateAnimationBaseline()` in both tests and implementation.
- Boundary consistency: transform math is pure, overlay state stays in `sigma-overlay-dom.ts`, and renderer only schedules exact versus fast updates.

## GSTACK REVIEW REPORT

Review target: current branch diff for `codex/issue-75-sigma-animation-overlay-performance`, including the design doc and this implementation plan.

Brain context: prior learning applied: `sigma_camera_setstate_does_not_cancel_animation` (confidence 9/10, 2026-06-26). The plan now treats direct `setState()` as an interruption that must suppress the overlay animation fast path until the old animation truly settles.

Design doc check: local design doc exists at `docs/superpowers/specs/2026-06-30-sigma-animation-overlay-performance-design.md`; it supports a full foundation approach, not a small spotlight-only patch.

### Step 0 Scope Challenge

Scope accepted as-is after review. The plan touches more than eight files, but the spread is justified: fixture pressure, transform math, overlay state, renderer scheduling, browser performance, validators, and docs all need to land together for #75 to be measurable and safe. Reducing scope would leave either a hidden correctness gap or no durable performance gate.

### Architecture Review

1. [P1] (confidence: 9/10) `packages/graph-engine/src/render/sigma-global-renderer.ts:360` — existing code says wheel uses immediate `setState()`, and the design notes confirm `setState()` does not cancel a queued `animate()`. A one-frame exact override would let later frames re-enter the fast path. Status: fixed in plan with `suppressOverlayAnimationFastPathUntilCameraSettles` and multi-frame wheel/reset/resize/drag tests.

2. [P1] (confidence: 8/10) `packages/graph-engine/src/render/sigma-global-renderer.ts:329-330` — current overlay updates depend on Sigma `cameraUpdated` / `afterRender`; there is no guarantee a final non-animated render arrives after animation completion. Status: fixed in plan with a rAF settle watcher that performs exact reposition once `camera.isAnimated()` becomes false.

3. [P2] (confidence: 8/10) `tests/browser/graph-renderer-trial-shared.ts:3-15` — default production shapes did not include the new many-community pressure fixture. Status: fixed in plan by adding `nodes-1000-many-communities` to `FULL_TRIAL_SHAPES`.

4. [P2] (confidence: 7/10) Root-transform scaling also scales label text, hit boxes, borders, and blur during animation. This is acceptable because animation is approximate and all hit/visual layers move together, but exact settle must be mandatory. Status: kept, with stronger exact-settle tests and browser settle checks.

### Code Quality Review

1. [P2] (confidence: 8/10) Temporary transform cleanup was incomplete: `transformOrigin` could remain after clearing `transform` and `willChange`. Status: fixed in plan; exact reposition and destroy clear all three fields.

2. [P2] (confidence: 8/10) `tests/browser/validate-graph-trial-result.mjs:10-24` duplicates required action and frame-sampled gate lists. Status: fixed in plan; standalone validator must be updated with the shared TypeScript trial config.

3. [P3] (confidence: 7/10) Transform helper thresholds are conservative constants and need a short code comment so they do not look like ungrounded magic numbers. Status: fixed in plan with an explicit comment that rejection falls back to exact reposition.

### Test Review

Coverage diagram:

```text
CODE PATHS                                             USER FLOWS
[+] transform helper                                   [+] Click community spotlight
  ├── [★★★] uniform translate/scale accepted             ├── [★★★] starts frame sample before click
  ├── [★★★] non-uniform scale rejected                   ├── [★★★] waits for selection and overlay settle
  ├── [★★★] rotation rejected                            └── [★★★] validates transform cleared after settle
  └── [★★★] anchor projection covered

[+] overlay DOM controller                             [+] Wheel / reset interruption
  ├── [★★★] exact reposition refreshes baseline          ├── [★★★] remains exact across repeated frames
  ├── [★★★] fast path does not call cloud geometry       └── [★★★] resumes only after camera settles
  ├── [★★★] invalid baseline falls back exact
  ├── [★★★] exact settle clears transform state
  └── [★★★] destroy clears transform state

[+] renderer scheduler                                 [+] Resize / update / destroy during animation
  ├── [★★★] animated frame uses fast path                ├── [★★★] resize suppresses fast path until settle
  ├── [★★★] no-final-afterRender settle watcher          ├── [★★★] data update clears active transform
  ├── [★★★] wheel/reset suppress until settle            └── [★★★] destroy with active transform is safe
  ├── [★★★] drag remains exact
  └── [★★★] resize/data/destroy boundaries covered

[+] browser performance                                [+] Production evidence
  ├── [★★★] spotlight_animation required action          ├── [★★★] fps and p95 frame gate enforced
  ├── [★★★] standalone validator updated                 ├── [★★★] stable pre-sample state required
  └── [★★★] many-community shape in default regression   └── [★★★] final artifact summary in PR notes
```

Test gaps identified during review: 7. All 7 were folded into the plan: multi-frame wheel suppression, reset suppression, missing-final-render settle watcher, data update during animation, resize during animation, destroy while transform active, and standalone validator coverage.

### Performance Review

1. [P1] (confidence: 9/10) The plan now measures the actual target action, `spotlight_animation`, under the many-community fixture. This addresses the root performance path: animation frames should not recompute every community cloud geometry.

2. [P2] (confidence: 8/10) Raw performance numbers can be polluted by previous action state. Status: fixed in plan with `waitForSpotlightReady`, `waitForSpotlightSettled`, and stable community-region checks before and after sampling.

3. [P2] (confidence: 8/10) A settle failure could hide frame metrics in the artifact detail. Status: fixed in plan by always appending median fps / p95 detail when a frame-sampled record fails.

### Outside Voice

Codex outside voice ran successfully. It found 16 concerns. Accepted into the plan: multi-frame suppression, missing-final-render settle watcher, standalone validator sync, default many-community regression, transform cleanup, browser measurement stability, data-update/resize/destroy tests, threshold comments, and performance evidence location. Kept by design: root transform scales the whole overlay during animation because the design requires visual layer and hit targets to move together; exact settle is the source of final truth.

No cross-model tension remains.

### NOT in Scope

- Replacing Sigma or Graphology: not needed for #75 and would reopen settled #79 boundaries.
- Changing community click semantics or drawer ownership: #75 is performance, not product navigation.
- Fixing #70 node label truncation: separate visual issue.
- Starting #80 architecture cleanup: separate long-term refactor.
- Raising the 2000-node Sigma route limit: unrelated to the animation bottleneck.
- Adding npm dependencies: unnecessary for a transform/state-machine fix.

### What Already Exists

- `sigma-overlay-dom.ts` already owns overlay lifecycle and exact `reposition()`; the plan reuses it instead of rebuilding a parallel overlay system.
- `sigma-global-renderer.ts` already binds Sigma lifecycle and render events; the plan only changes scheduling.
- `sigma-global-camera.ts` already owns camera target math and reduced-motion behavior; the plan keeps overlay strategy out of it.
- `tests/browser/graph-sigma-global-production.ts` already produces production-path artifacts; the plan extends it instead of adding a separate benchmark format.
- `tests/browser/graph-renderer-trial-shared.ts` already has required actions and hard gates; the plan extends the existing validation contract.

### Failure Modes

- Old camera animation continues after wheel/reset: covered by suppression-until-settle tests; user would otherwise see overlay drift or stale hit regions.
- No final render after animation: covered by settle watcher test; user would otherwise see a residual transformed overlay.
- Data update during animation: covered by renderer update test; user would otherwise see overlay based on old geometry.
- Resize during animation: covered by resize suppression test; user would otherwise see geometry derived from old viewport dimensions.
- Destroy during active transform: covered by overlay and renderer destroy tests; user would otherwise risk stale DOM state or late callbacks touching destroyed state.
- Browser measurement starts from dirty state: covered by readiness and settle waits; reviewers would otherwise trust noisy performance data.

Critical silent gaps after review: 0.

### Worktree Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Fixture pressure | `packages/graph-engine/test` | — |
| Transform helper | `packages/graph-engine/src/render`, `packages/graph-engine/test` | — |
| Overlay DOM fast path | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Transform helper |
| Renderer scheduler | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Overlay DOM fast path |
| Browser measurement | `tests/browser` | Fixture pressure, renderer scheduler |
| Docs and PR notes | `workbench`, root docs | Verified implementation |

Parallel lanes: Lane A fixture pressure; Lane B transform helper. Then overlay DOM and renderer are sequential. Browser measurement follows renderer. Docs last. Recommended execution: run Task 1 and Task 2 in parallel only if using separate worktrees; otherwise keep the plan sequential to avoid churn in graph-engine tests.

### Implementation Tasks

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — Renderer scheduler — Suppress overlay fast path after direct camera interruptions until camera settles.
  - Surfaced by: Architecture Review item 1.
  - Files: `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — Renderer scheduler — Add a settle watcher so exact overlay reposition runs even without a final `afterRender`.
  - Surfaced by: Architecture Review item 2.
  - Files: `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/test/sigma-global-renderer.test.ts`
  - Verify: no-final-afterRender test passes.

- [ ] **T3 (P2, human: ~45min / CC: ~8min)** — Overlay DOM — Clear all temporary transform state on exact reposition and destroy.
  - Surfaced by: Code Quality Review item 1.
  - Files: `packages/graph-engine/src/render/sigma-overlay-dom.ts`, `packages/graph-engine/test/sigma-overlay-dom.test.ts`
  - Verify: overlay destroy and exact settle tests pass.

- [ ] **T4 (P2, human: ~45min / CC: ~8min)** — Browser measurement — Require `spotlight_animation`, update standalone validation, and include many-community shape by default.
  - Surfaced by: Architecture Review item 3 and Code Quality Review item 2.
  - Files: `tests/browser/graph-renderer-trial-shared.ts`, `tests/browser/validate-graph-trial-result.mjs`
  - Verify: production artifact validator passes on final result.

- [ ] **T5 (P2, human: ~1h / CC: ~12min)** — Browser measurement — Add clean pre-sample and post-settle waits for spotlight animation.
  - Surfaced by: Performance Review item 2.
  - Files: `tests/browser/graph-sigma-global-production.ts`
  - Verify: targeted browser command records clean `spotlight_animation` rows.

### TODOS.md Updates

No TODOs proposed. Every review finding is necessary for #75 and has been folded into this branch plan instead of deferred.

### Completion Summary

- Step 0: Scope Challenge — scope accepted as-is.
- Architecture Review: 4 issues found, all folded into the plan.
- Code Quality Review: 3 issues found, all folded into the plan.
- Test Review: diagram produced, 7 gaps identified, all folded into the plan.
- Performance Review: 3 issues found, all folded into the plan.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed.
- Failure modes: 0 critical silent gaps after fixes.
- Outside voice: ran via Codex.
- Parallelization: 6 workstreams, 2 can start in parallel, rest should be sequential.
- Lake Score: 10/10 recommendations chose complete option.

NO UNRESOLVED DECISIONS
