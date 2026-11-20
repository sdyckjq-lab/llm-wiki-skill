# Sigma Camera Frame Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable Sigma camera animation frame contract so overlays visually follow project-triggered camera animations during the animation window and settle exactly afterward.

**Architecture:** Upgrade the existing overlay animation settle watcher into the single owned frame loop for project-triggered camera animations. Keep the #75 overlay transform fast path, isolate current-camera projection to animation anchors only, and coalesce Sigma camera/render events into one overlay write per browser frame. Tests come first: fake runtime fidelity, stale-matrix projection, camera helper result contract, renderer frame ownership, and browser mid-animation proof.

**Tech Stack:** TypeScript, Node `node:test`, jsdom-style local fake DOM, Sigma 3.0.3 runtime boundary, Playwright production browser script.

---

## Scope Check

This plan covers one subsystem: Sigma global graph camera animation and overlay following. It does not fix node label truncation, long-term renderer splitting, accessibility, cloud signature caching, drawer behavior, route behavior, or Sigma version upgrades.

## File Structure

**Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`**
Owns the fake Sigma runtime and renderer behavior tests. This file must be changed first because the current fake camera jumps straight to the animation target and can make false-positive tests pass.

**Modify: `packages/graph-engine/src/render/sigma-global-types.ts`**
Adds camera `updated` event typing and Sigma coordinate conversion override typing. This keeps the renderer and projection changes explicit.

**Modify: `packages/graph-engine/src/render/sigma-coordinates.ts`**
Adds an animation-only projection helper that passes the current camera state to Sigma projection without changing normal hit testing or exact overlay reposition.

**Modify: `packages/graph-engine/test/sigma-coordinates.test.ts`**
Proves the explicit camera-state override is used only by the new helper, while the existing projection helper keeps current behavior.

**Modify: `packages/graph-engine/src/render/sigma-overlay-dom.ts`**
Uses the animation-only projection helper inside `repositionForCameraAnimation()` and leaves `reposition()` on the existing exact path.

**Modify: `packages/graph-engine/test/sigma-overlay-dom.test.ts`**
Proves animation projection uses current camera state even when the fake render matrix is stale, and exact reposition does not pick up the override.

**Modify: `packages/graph-engine/src/render/sigma-global-camera.ts`**
Returns a structured spotlight camera result with `communityId`, `movement`, and `skipReason`, and routes animate failures to the fatal error handler.

**Modify: `packages/graph-engine/test/sigma-global-camera.test.ts`**
Proves settled, reduced-motion, missing-camera, missing-animate, and animate-reject behavior.

**Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`**
Removes the wrong `cameraUpdated` renderer event, binds camera `"updated"`, upgrades the existing rAF slot into a coalesced frame loop, adds owner token invalidation, and starts tracking from spotlight and zoom animations.

**Modify: `tests/browser/graph-sigma-global-production.ts`**
Strengthens `spotlight_animation` so it samples overlay transform and selected region visual movement during the animation window, not only final settle and fps.

**Read-only check: `tests/browser/validate-graph-trial-result.mjs`**
The validator already fails records with `pass === false` or `failure_class`. Verify this behavior with a synthetic result after the browser script emits the new failure classes.

---

## Task 1: Make the Sigma Fake Runtime Capable of Real Animation Failures

**Files:**
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **Step 1: Add fake runtime contract tests**

Add these tests near the existing overlay animation tests, before `"uses the overlay animation fast path while the Sigma camera is animated and settles exactly afterward"`:

```ts
  it("fake camera advances intermediate animation frames and emits updated events", () => {
    const camera = new FakeCamera();
    const updates: Array<{ x: number; y: number; angle: number; ratio: number }> = [];
    camera.on("updated", (state) => updates.push(state));

    void camera.animate({ x: 10, y: 20, ratio: 0.5 }, { duration: 380, easing: "quadraticInOut" });
    assert.equal(camera.isAnimated(), true);

    camera.advanceAnimation(0.5);

    assert.equal(camera.isAnimated(), true);
    assert.deepEqual(camera.getState(), { x: 5, y: 10, angle: 0, ratio: 0.75 });
    assert.deepEqual(updates.at(-1), { x: 5, y: 10, angle: 0, ratio: 0.75 });

    camera.finishAnimation();

    assert.equal(camera.isAnimated(), false);
    assert.deepEqual(camera.getState(), { x: 10, y: 20, angle: 0, ratio: 0.5 });
    assert.deepEqual(updates.at(-1), { x: 10, y: 20, angle: 0, ratio: 0.5 });
  });

  it("fake sigma keeps the render matrix stale until afterRender unless cameraState override is passed", () => {
    const runtime = fakeRuntime({ worldScale: 100 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    const before = sigma.graphToViewport({ x: 100, y: 100 });
    sigma.camera.setState({ x: 10, y: 20, ratio: 0.5 });
    const stale = sigma.graphToViewport({ x: 100, y: 100 });
    const current = sigma.graphToViewport({ x: 100, y: 100 }, { cameraState: sigma.camera.getState() });

    assert.deepEqual(stale, before);
    assert.notDeepEqual(current, stale);

    sigma.emit("afterRender");
    assert.deepEqual(sigma.graphToViewport({ x: 100, y: 100 }), current);

    renderer.destroy();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-renderer.test.ts
```

Expected: FAIL because `FakeCamera` does not have `on`, `advanceAnimation`, or camera-state projection override support.

- [ ] **Step 3: Add fake camera listener and animation controls**

Replace the current `FakeCamera` class in `packages/graph-engine/test/sigma-global-renderer.test.ts` with this class:

```ts
class FakeCamera {
  private state = { x: 0, y: 0, angle: 0, ratio: 1 };
  private animationStart = { x: 0, y: 0, angle: 0, ratio: 1 };
  private nextAnimationError: Error | null = null;
  private readonly listeners = new Map<"updated", Set<(state: { x: number; y: number; angle: number; ratio: number }) => void>>();
  readonly setStateCalls: Array<Partial<{ x: number; y: number; angle: number; ratio: number }>> = [];
  readonly animateCalls: Array<{
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>;
    options?: { duration?: number; easing?: string };
  }> = [];
  activeAnimationTarget: Partial<{ x: number; y: number; angle: number; ratio: number }> | null = null;
  animated = false;

  getState(): { x: number; y: number; angle: number; ratio: number } {
    return { ...this.state };
  }

  setState(state: Partial<{ x: number; y: number; angle: number; ratio: number }>): void {
    this.setStateCalls.push({ ...state });
    const next = { ...this.state, ...state };
    const changed = next.x !== this.state.x
      || next.y !== this.state.y
      || next.angle !== this.state.angle
      || next.ratio !== this.state.ratio;
    this.state = next;
    if (changed) this.emit("updated", this.getState());
  }

  isAnimated(): boolean {
    return this.animated;
  }

  on(event: "updated", listener: (state: { x: number; y: number; angle: number; ratio: number }) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: "updated", listener: (state: { x: number; y: number; angle: number; ratio: number }) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  rejectNextAnimation(error: Error): void {
    this.nextAnimationError = error;
  }

  advanceAnimation(progress: number): void {
    if (!this.activeAnimationTarget) return;
    const clamped = Math.max(0, Math.min(1, progress));
    const target = { ...this.animationStart, ...this.activeAnimationTarget };
    this.setState({
      x: this.animationStart.x + (target.x - this.animationStart.x) * clamped,
      y: this.animationStart.y + (target.y - this.animationStart.y) * clamped,
      angle: this.animationStart.angle + (target.angle - this.animationStart.angle) * clamped,
      ratio: this.animationStart.ratio + (target.ratio - this.animationStart.ratio) * clamped
    });
  }

  finishAnimation(): void {
    if (this.activeAnimationTarget) {
      this.setState(this.activeAnimationTarget);
    }
    this.animated = false;
    this.activeAnimationTarget = null;
  }

  animate(
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>,
    options?: { duration?: number; easing?: string }
  ): Promise<void> {
    this.animateCalls.push({ state: { ...state }, options: options ? { ...options } : undefined });
    if (this.nextAnimationError) {
      const error = this.nextAnimationError;
      this.nextAnimationError = null;
      return Promise.reject(error);
    }
    this.animationStart = this.getState();
    this.activeAnimationTarget = { ...state };
    this.animated = Boolean(options?.duration && options.duration > 1);
    if (!this.animated) {
      this.setState(state);
    }
    return Promise.resolve();
  }

  private emit(event: "updated", state: { x: number; y: number; angle: number; ratio: number }): void {
    for (const listener of this.listeners.get(event) ?? []) listener(state);
  }
}
```

- [ ] **Step 4: Add stale render matrix support to FakeSigma**

In the `FakeSigma` class, add this property near `readonly camera = new FakeCamera();`:

```ts
  private renderedCameraState = this.camera.getState();
```

Replace the `graphToViewport` and `emit` methods with these versions:

```ts
  graphToViewport(
    point: { x: number; y: number },
    override: { cameraState?: Partial<{ x: number; y: number; angle: number; ratio: number }> } = {}
  ): { x: number; y: number } {
    const scale = this.options.worldScale ?? 1;
    const cameraState = { ...this.renderedCameraState, ...(override.cameraState ?? {}) };
    const ratio = cameraState.ratio || 1;
    return {
      x: (point.x / scale - cameraState.x) / ratio,
      y: (point.y / scale - cameraState.y) / ratio
    };
  }

  emit(event: string, payload?: unknown): void {
    if (event === "afterRender") {
      this.renderedCameraState = this.camera.getState();
    }
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
```

- [ ] **Step 5: Run the fake runtime tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-renderer.test.ts
```

Expected: PASS for the two new fake runtime tests. Existing animation tests may fail until later tasks because they still rely on afterRender-driven behavior.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/graph-engine/test/sigma-global-renderer.test.ts
git commit -m "test: model sigma camera animation frames in fake runtime"
```

---

## Task 2: Isolate Current-Camera Projection to Animation Anchors

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-types.ts`
- Modify: `packages/graph-engine/src/render/sigma-coordinates.ts`
- Modify: `packages/graph-engine/test/sigma-coordinates.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-overlay-dom.ts`
- Modify: `packages/graph-engine/test/sigma-overlay-dom.test.ts`

- [ ] **Step 1: Add coordinate helper tests**

In `packages/graph-engine/test/sigma-coordinates.test.ts`, update the import to include `sigmaWorldPointToScreenPointForCameraState`:

```ts
import {
  sigmaScreenPointToWorldPoint,
  sigmaWorldPointToScreenPoint,
  sigmaWorldPointToScreenPointForCameraState
} from "../src/render/sigma-coordinates";
```

Add this test at the end of the `describe("sigma coordinate transforms", () => { ... })` block:

```ts
  it("uses explicit camera state only for animation projection", () => {
    const receivedOverrides: unknown[] = [];
    const sigma = sigmaWith({
      graphToViewport: (_point, override) => {
        receivedOverrides.push(override);
        return override?.cameraState ? { x: 44, y: 55 } : { x: 11, y: 22 };
      }
    });

    assert.deepEqual(sigmaWorldPointToScreenPoint(sigma, { x: 1, y: 2 }, options), { x: 11, y: 22 });
    assert.deepEqual(
      sigmaWorldPointToScreenPointForCameraState(
        sigma,
        { x: 1, y: 2 },
        { x: 3, y: 4, angle: 0, ratio: 0.8 },
        options
      ),
      { x: 44, y: 55 }
    );

    assert.deepEqual(receivedOverrides, [
      undefined,
      { cameraState: { x: 3, y: 4, angle: 0, ratio: 0.8 } }
    ]);
  });
```

- [ ] **Step 2: Run the coordinate test and verify it fails**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-coordinates.test.ts
```

Expected: FAIL because `sigmaWorldPointToScreenPointForCameraState` does not exist and `graphToViewport` has no override type.

- [ ] **Step 3: Add projection override types**

In `packages/graph-engine/src/render/sigma-global-types.ts`, add this interface after `SigmaGlobalCameraState`:

```ts
export interface SigmaGlobalCoordinateConversionOverride {
  cameraState?: Partial<SigmaGlobalCameraState>;
}
```

Then change `SigmaGlobalSigmaLike.graphToViewport` to:

```ts
  graphToViewport?: (
    point: { x: number; y: number },
    override?: SigmaGlobalCoordinateConversionOverride
  ) => GraphScreenPoint;
```

- [ ] **Step 4: Add the animation-only projection helper**

In `packages/graph-engine/src/render/sigma-coordinates.ts`, update the type import:

```ts
import type {
  SigmaGlobalCameraState,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
```

Add this helper below `sigmaWorldPointToScreenPoint`:

```ts
export function sigmaWorldPointToScreenPointForCameraState(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number },
  cameraState: SigmaGlobalCameraState,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint {
  const projected = sigma.graphToViewport?.(point, { cameraState });
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  return sigmaWorldPointToScreenPoint(sigma, point, options);
}
```

- [ ] **Step 5: Run the coordinate test and verify it passes**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-coordinates.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add overlay DOM animation projection test**

In `packages/graph-engine/test/sigma-overlay-dom.test.ts`, add this test after `"uses an overlay root transform during camera animation without recomputing cloud geometry"`:

```ts
  it("uses current camera state for animation anchors without changing exact reposition projection", () => {
    const fixture = controllerFixture();
    const sigma = {
      graphToViewport: (
        point: { x: number; y: number },
        override?: { cameraState?: { x?: number; y?: number; angle?: number; ratio?: number } }
      ) => {
        const cameraState = override?.cameraState;
        if (!cameraState) return { x: point.x, y: point.y };
        return {
          x: point.x + (cameraState.x ?? 0) * 10,
          y: point.y + (cameraState.y ?? 0) * 10
        };
      },
      getCamera: () => ({
        getState: () => ({ x: 4, y: 3, angle: 0, ratio: 1 })
      })
    } satisfies SigmaGlobalSigmaLike;
    fixture.setSigma(sigma);
    fixture.controller.rebuild();
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");

    fixture.controller.repositionForCameraAnimation();

    assert.match(fixture.overlayRoot.style.transform || "", /^translate\(/);
    assert.equal(alphaBefore?.style.left, "101px");

    fixture.controller.reposition();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(alphaBefore?.style.left, "101px");
  });
```

- [ ] **Step 7: Run overlay DOM test and verify it fails**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-overlay-dom.test.ts
```

Expected: FAIL because `repositionForCameraAnimation()` still calls `sigmaWorldPointToScreenPoint()` without the current camera state.

- [ ] **Step 8: Use the animation-only helper in overlay DOM**

In `packages/graph-engine/src/render/sigma-overlay-dom.ts`, update the import:

```ts
import {
  sigmaWorldPointToScreenPoint,
  sigmaWorldPointToScreenPointForCameraState
} from "./sigma-coordinates";
```

Replace `repositionForCameraAnimation()` with this version:

```ts
  function repositionForCameraAnimation(): void {
    if (input.isDestroyed()) return;
    if (!cameraAnimationBaseline) {
      reposition();
      return;
    }
    const sigma = input.getSigma();
    const options = input.getOptions();
    const cameraState = sigma.getCamera?.().getState?.();
    const current = projectSigmaOverlayCameraAnchors(
      cameraAnimationBaseline.world,
      (point) => cameraState
        ? sigmaWorldPointToScreenPointForCameraState(sigma, point, cameraState, options)
        : sigmaWorldPointToScreenPoint(sigma, point, options)
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
```

- [ ] **Step 9: Run projection-related tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-coordinates.test.ts sigma-overlay-dom.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add packages/graph-engine/src/render/sigma-global-types.ts \
  packages/graph-engine/src/render/sigma-coordinates.ts \
  packages/graph-engine/test/sigma-coordinates.test.ts \
  packages/graph-engine/src/render/sigma-overlay-dom.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts
git commit -m "fix: project overlay animation anchors with current camera state"
```

---

## Task 3: Make the Spotlight Camera Helper Return an Explicit Movement Result

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-camera.ts`
- Modify: `packages/graph-engine/test/sigma-global-camera.test.ts`

- [ ] **Step 1: Add camera helper result tests**

In `packages/graph-engine/test/sigma-global-camera.test.ts`, update imports to include the helper under test if it is not already imported:

```ts
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  moveSigmaCamera,
  readCameraState,
  sigmaCameraDistanceForGraphDistance,
  sigmaCommunitySpotlightCameraState,
  sigmaGraphPointToCameraPoint
} from "../src/render/sigma-global-camera";
```

Add these tests near existing camera helper tests:

```ts
  it("returns community id and animated movement when spotlight starts camera animation", () => {
    const animateCalls: unknown[] = [];
    const sigma = sigmaWith({
      getCamera: () => ({
        getState: () => ({ x: 0, y: 0, angle: 0, ratio: 1 }),
        animate: (state: unknown) => {
          animateCalls.push(state);
          return Promise.resolve();
        }
      }),
      graphToViewport: (point) => point,
      viewportToFramedGraph: (point) => point
    });

    const result = maybeAnimateSigmaCommunitySpotlightCamera(
      sigma,
      fakeRoot(),
      adapterDataWithCommunity("community-a"),
      "community-a",
      null
    );

    assert.equal(result.communityId, "community-a");
    assert.equal(result.movement, "animated");
    assert.equal(result.skipReason, undefined);
    assert.equal(animateCalls.length, 1);
  });

  it("distinguishes settled spotlight from unavailable camera", () => {
    const settledSigma = sigmaWith({
      getCamera: () => ({
        getState: () => ({ x: 108, y: 120, angle: 0, ratio: 1 }),
        animate: () => Promise.resolve()
      }),
      graphToViewport: (point) => point,
      viewportToFramedGraph: (point) => point
    });
    const unavailableSigma = sigmaWith({
      getCamera: () => undefined,
      graphToViewport: (point) => point,
      viewportToFramedGraph: (point) => point
    });

    const settled = maybeAnimateSigmaCommunitySpotlightCamera(
      settledSigma,
      fakeRoot(),
      adapterDataWithCommunity("community-a"),
      "community-a",
      "community-a"
    );
    const unavailable = maybeAnimateSigmaCommunitySpotlightCamera(
      unavailableSigma,
      fakeRoot(),
      adapterDataWithCommunity("community-a"),
      "community-a",
      null
    );

    assert.deepEqual(settled, {
      communityId: "community-a",
      movement: "skipped",
      skipReason: "already-settled"
    });
    assert.deepEqual(unavailable, {
      communityId: "community-a",
      movement: "skipped",
      skipReason: "camera-unavailable"
    });
  });

  it("routes rejected camera animations to the fatal error callback", async () => {
    const error = new Error("animation failed");
    const observed: unknown[] = [];
    const result = moveSigmaCamera(
      sigmaWith({
        getCamera: () => ({
          getState: () => ({ x: 0, y: 0, angle: 0, ratio: 1 }),
          animate: () => Promise.reject(error)
        })
      }),
      { x: 10 },
      false,
      (caught) => observed.push(caught)
    );

    assert.equal(result.movement, "animated");
    await Promise.resolve();
    assert.deepEqual(observed, [error]);
  });
```

If the file does not already have these small fixtures, add them near the existing local helpers:

```ts
function fakeRoot(): HTMLElement {
  return {
    ownerDocument: {
      defaultView: {
        matchMedia: () => ({ matches: false })
      }
    }
  } as unknown as HTMLElement;
}

function adapterDataWithCommunity(communityId: string): GraphRendererAdapterData {
  return {
    nodes: [],
    edges: [],
    renderable: {
      worldBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      communities: [{
        id: communityId,
        role: "community-wash",
        label: communityId,
        nodeIds: [],
        nodeCount: 10,
        selected: true,
        searchResultIds: [],
        pinnedNodeIds: [],
        aggregationIds: [],
        x: 100,
        y: 120,
        radius: 40,
        color: "#123456",
        wash: { cx: 100, cy: 120, rx: 32, ry: 24 }
      }]
    }
  } as unknown as GraphRendererAdapterData;
}
```

- [ ] **Step 2: Run camera helper tests and verify they fail**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-camera.test.ts
```

Expected: FAIL because `maybeAnimateSigmaCommunitySpotlightCamera()` returns a string/null and `moveSigmaCamera()` does not return movement data or catch rejected promises.

- [ ] **Step 3: Add result types and promise catching**

In `packages/graph-engine/src/render/sigma-global-camera.ts`, add these exports after the imports:

```ts
export type SigmaGlobalCameraMovement = "animated" | "immediate" | "skipped";

export type SigmaGlobalCameraSkipReason =
  | "no-community"
  | "already-settled"
  | "no-target"
  | "camera-unavailable"
  | "animate-unavailable"
  | "animate-error";

export interface SigmaGlobalCameraMoveResult {
  movement: SigmaGlobalCameraMovement;
  skipReason?: SigmaGlobalCameraSkipReason;
}

export interface SigmaCommunitySpotlightCameraResult extends SigmaGlobalCameraMoveResult {
  communityId: string | null;
}
```

Replace `maybeAnimateSigmaCommunitySpotlightCamera()` and `moveSigmaCamera()` with these versions:

```ts
export function maybeAnimateSigmaCommunitySpotlightCamera(
  sigma: SigmaGlobalSigmaLike,
  root: HTMLElement,
  adapterData: GraphRendererAdapterData,
  communityId: string | null,
  previousCommunityId: string | null,
  onAnimationError?: (error: unknown) => void
): SigmaCommunitySpotlightCameraResult {
  if (!communityId) {
    return { communityId: null, movement: "skipped", skipReason: "no-community" };
  }
  if (communityId === previousCommunityId) {
    return { communityId, movement: "skipped", skipReason: "already-settled" };
  }
  const target = sigmaCommunitySpotlightCameraState(sigma, adapterData, communityId);
  if (!target) {
    return { communityId, movement: "skipped", skipReason: "no-target" };
  }
  const movement = moveSigmaCamera(
    sigma,
    target,
    prefersReducedMotion(root.ownerDocument.defaultView),
    onAnimationError
  );
  return { communityId, ...movement };
}

export function moveSigmaCamera(
  sigma: SigmaGlobalSigmaLike,
  target: Partial<SigmaGlobalCameraState>,
  reducedMotion: boolean,
  onAnimationError?: (error: unknown) => void
): SigmaGlobalCameraMoveResult {
  const camera = sigma.getCamera?.();
  if (!camera) return { movement: "skipped", skipReason: "camera-unavailable" };
  if (reducedMotion || !camera.animate) {
    if (!camera.setState) return { movement: "skipped", skipReason: "animate-unavailable" };
    camera.setState(target);
    return { movement: "immediate", skipReason: !camera.animate ? "animate-unavailable" : undefined };
  }
  try {
    const animation = camera.animate(target, { duration: 380, easing: "quadraticInOut" });
    if (animation && typeof (animation as Promise<unknown>).catch === "function") {
      void (animation as Promise<unknown>).catch((error) => onAnimationError?.(error));
    }
    return { movement: "animated" };
  } catch (error) {
    onAnimationError?.(error);
    return { movement: "skipped", skipReason: "animate-error" };
  }
}
```

- [ ] **Step 4: Run camera helper tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-camera.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/graph-engine/src/render/sigma-global-camera.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts
git commit -m "fix: return explicit sigma spotlight camera movement"
```

---

## Task 4: Upgrade the Existing Settle Watcher into the Owned Camera Frame Loop

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-types.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`

- [ ] **Step 1: Add renderer frame-loop tests**

In `packages/graph-engine/test/sigma-global-renderer.test.ts`, add these tests near the existing animation fast-path tests:

```ts
  it("drives spotlight overlay animation from project rAF without manual afterRender", () => {
    const animationFrames: FrameRequestCallback[] = [];
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer({
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          animationFrames.push(callback);
          return animationFrames.length;
        },
        cancelAnimationFrame: () => undefined
      }),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });
    sigma.camera.advanceAnimation(0.5);
    animationFrames.shift()?.(16);

    assert.match(renderer.overlayRoot.style.transform || "", /^translate\(/);

    sigma.camera.finishAnimation();
    animationFrames.shift()?.(32);

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    renderer.destroy();
  });

  it("does not bind the removed cameraUpdated renderer event", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    assert.equal(sigma.listeners.has("cameraUpdated"), false);
    assert.equal(sigma.camera.listenerCount("updated"), 1);

    renderer.destroy();
    assert.equal(sigma.camera.listenerCount("updated"), 0);
  });

  it("ignores stale animation frame owners after wheel invalidates the baseline", () => {
    const animationFrames: FrameRequestCallback[] = [];
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer({
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          animationFrames.push(callback);
          return animationFrames.length;
        },
        cancelAnimationFrame: () => undefined
      }),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.zoomIn();
    sigma.camera.advanceAnimation(0.5);
    const staleFrame = animationFrames.shift();

    sigma.mouseCaptor.emitWheel({ x: 240, y: 160, deltaY: 80, deltaMode: 0 });
    staleFrame?.(16);

    assert.equal(renderer.overlayRoot.style.transform, "");
    assert.equal(renderer.overlayRoot.style.willChange, "");

    renderer.destroy();
  });
```

Add this method to `FakeCamera` for the second test:

```ts
  listenerCount(event: "updated"): number {
    return this.listeners.get(event)?.size ?? 0;
  }
```

- [ ] **Step 2: Run renderer tests and verify they fail**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-renderer.test.ts
```

Expected: FAIL because renderer still binds `cameraUpdated`, does not bind camera `"updated"`, and does not start the rAF loop from spotlight/zoom animations without manual `afterRender`.

- [ ] **Step 3: Extend the camera-like type**

In `packages/graph-engine/src/render/sigma-global-types.ts`, add event methods to `SigmaGlobalCameraLike`:

```ts
  on?: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => unknown;
  off?: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => unknown;
```

- [ ] **Step 4: Import the spotlight result type**

In `packages/graph-engine/src/render/sigma-global-renderer.ts`, update the camera import:

```ts
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  prefersReducedMotion,
  readCameraState,
  restoreCameraState,
  sigmaGlobalCameraState,
  type SigmaCommunitySpotlightCameraResult
} from "./sigma-global-camera";
```

- [ ] **Step 5: Add camera event binding storage and frame owner state**

Near the existing event and rAF state in `createSigmaGlobalRenderer`, change this block:

```ts
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeAnimationFrame: number | null = null;
  let lastObservedRootSize: RendererViewportSize | null = null;
  let suppressOverlayAnimationFastPathUntilCameraSettles = false;
  let overlayAnimationSettleFrame: number | null = null;
```

to this block:

```ts
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];
  let cameraEventBindings: Array<{ event: "updated"; listener: (state?: SigmaGlobalCameraState) => void }> = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeAnimationFrame: number | null = null;
  let lastObservedRootSize: RendererViewportSize | null = null;
  let suppressOverlayAnimationFastPathUntilCameraSettles = false;
  let overlayAnimationSettleFrame: number | null = null;
  let overlayAnimationFrameOwner = 0;
  let scheduledOverlayAnimationFrameOwner: number | null = null;
```

- [ ] **Step 6: Bind camera `"updated"` and remove `cameraUpdated`**

Replace `bindSigmaEvents()` and `unbindSigmaEvents()` with:

```ts
  function bindSigmaEvents(): void {
    const nodeClick = (payload?: unknown): void => {
      const nodeId = sigmaNodeIdFromPayload(payload);
      if (consumeSuppressedNodeClick(nodeId)) return;
      handleSigmaHit({ nodeId, additive: sigmaAdditiveFromPayload(payload) });
    };
    const stageClick = (payload?: unknown): void => handleSigmaHit({
      screenPoint: sigmaScreenPointFromPayload(payload),
      additive: sigmaAdditiveFromPayload(payload)
    });
    const requestCameraFrame = (): void => requestOverlayAnimationFrame(overlayAnimationFrameOwner);
    const nodeDown = (payload?: unknown): void => beginNodeDrag(sigmaNodeIdFromPayload(payload), sigmaScreenPointFromPayload(payload), payload);
    const nodeMove = (payload?: unknown): void => moveNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    const nodeUp = (payload?: unknown): void => commitNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    eventBindings = [
      { event: "clickNode", listener: nodeClick },
      { event: "clickStage", listener: stageClick },
      { event: "downNode", listener: nodeDown },
      { event: "moveBody", listener: nodeMove },
      { event: "upNode", listener: nodeUp },
      { event: "upStage", listener: nodeUp },
      { event: "afterRender", listener: requestCameraFrame }
    ];
    for (const binding of eventBindings) {
      sigma.on?.(binding.event, binding.listener);
    }
    const camera = sigma.getCamera?.();
    if (camera?.on) {
      const listener = (): void => requestOverlayAnimationFrame(overlayAnimationFrameOwner);
      camera.on("updated", listener);
      cameraEventBindings = [{ event: "updated", listener }];
    }
  }

  function unbindSigmaEvents(): void {
    for (const binding of eventBindings) {
      sigma.off?.(binding.event, binding.listener);
    }
    eventBindings = [];
    const camera = sigma.getCamera?.();
    for (const binding of cameraEventBindings) {
      camera?.off?.(binding.event, binding.listener);
    }
    cameraEventBindings = [];
  }
```

- [ ] **Step 7: Replace the settle-only scheduler with the owned frame loop**

Replace `refreshOverlayForCameraFrame()`, `suppressOverlayAnimationFastPathUntilSettled()`, `scheduleOverlayAnimationSettleCheck()`, and `cancelOverlayAnimationSettleCheck()` with:

```ts
  function startOverlayCameraFrameTracking(): void {
    overlayAnimationFrameOwner += 1;
    requestOverlayAnimationFrame(overlayAnimationFrameOwner);
  }

  function requestOverlayAnimationFrame(owner: number): void {
    const view = sigmaRoot.ownerDocument.defaultView;
    if (!view?.requestAnimationFrame) {
      refreshOverlayForCameraFrame(owner);
      return;
    }
    if (overlayAnimationSettleFrame !== null && scheduledOverlayAnimationFrameOwner === owner) return;
    if (overlayAnimationSettleFrame !== null) {
      view.cancelAnimationFrame?.(overlayAnimationSettleFrame);
      overlayAnimationSettleFrame = null;
    }
    scheduledOverlayAnimationFrameOwner = owner;
    overlayAnimationSettleFrame = view.requestAnimationFrame(() => {
      overlayAnimationSettleFrame = null;
      scheduledOverlayAnimationFrameOwner = null;
      refreshOverlayForCameraFrame(owner);
    });
  }

  function refreshOverlayForCameraFrame(owner: number): void {
    if (destroyed || owner !== overlayAnimationFrameOwner) return;
    try {
      const camera = sigma.getCamera?.();
      const animated = Boolean(camera?.isAnimated?.());
      if (activeNodeDrag || suppressOverlayAnimationFastPathUntilCameraSettles || !animated) {
        overlayDomController?.reposition();
        if (!animated) {
          suppressOverlayAnimationFastPathUntilCameraSettles = false;
          cancelOverlayAnimationSettleCheck();
          return;
        }
        requestOverlayAnimationFrame(owner);
        return;
      }
      overlayDomController?.repositionForCameraAnimation();
      requestOverlayAnimationFrame(owner);
    } catch (error) {
      options.onFatalError?.(error);
    }
  }

  function suppressOverlayAnimationFastPathUntilSettled(): void {
    overlayAnimationFrameOwner += 1;
    suppressOverlayAnimationFastPathUntilCameraSettles = true;
    overlayDomController?.invalidateAnimationBaseline();
    if (!Boolean(sigma.getCamera?.().isAnimated?.())) {
      suppressOverlayAnimationFastPathUntilCameraSettles = false;
      overlayDomController?.reposition();
      return;
    }
    requestOverlayAnimationFrame(overlayAnimationFrameOwner);
  }

  function cancelOverlayAnimationSettleCheck(): void {
    if (overlayAnimationSettleFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(overlayAnimationSettleFrame);
    overlayAnimationSettleFrame = null;
    scheduledOverlayAnimationFrameOwner = null;
  }
```

- [ ] **Step 8: Start tracking after spotlight animation results**

In `finalizeUpdate`, replace the current `cameraSpotlightCommunityId = maybeAnimate...` assignment with:

```ts
          const spotlightCamera = maybeAnimateSigmaCommunitySpotlightCamera(
            sigma,
            sigmaRoot,
            adapterData,
            sigmaSpotlightCommunityId(adapterData),
            previousCameraSpotlightCommunityId,
            options.onFatalError
          );
          applySpotlightCameraResult(spotlightCamera);
```

Add this helper near `zoomSigmaCameraAtViewportPoint`:

```ts
  function applySpotlightCameraResult(result: SigmaCommunitySpotlightCameraResult): void {
    cameraSpotlightCommunityId = result.communityId;
    if (result.movement === "animated") {
      startOverlayCameraFrameTracking();
      return;
    }
    if (result.movement === "immediate") {
      overlayDomController?.reposition();
    }
  }
```

- [ ] **Step 9: Start tracking after zoom button animation and catch rejections**

In `zoomSigmaCameraAtViewportPoint`, replace:

```ts
      void camera.animate(nextState, { duration: SIGMA_BUTTON_ZOOM_DURATION_MS, easing: "quadraticOut" });
      return;
```

with:

```ts
      const animation = camera.animate(nextState, { duration: SIGMA_BUTTON_ZOOM_DURATION_MS, easing: "quadraticOut" });
      if (animation && typeof (animation as Promise<unknown>).catch === "function") {
        void (animation as Promise<unknown>).catch((error) => options.onFatalError?.(error));
      }
      startOverlayCameraFrameTracking();
      return;
```

- [ ] **Step 10: Run renderer tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine -- sigma-global-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run all graph-engine tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
```

Expected: PASS.

- [ ] **Step 12: Commit Task 4**

```bash
git add packages/graph-engine/src/render/sigma-global-types.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts
git commit -m "fix: drive sigma overlays from owned camera frame loop"
```

---

## Task 5: Prove Spotlight Overlay Movement in the Browser Production Script

**Files:**
- Modify: `tests/browser/graph-sigma-global-production.ts`

- [ ] **Step 1: Add a spotlight sample type**

Near `interface SigmaSpotlightRegionState`, add:

```ts
interface SigmaSpotlightAnimationSample {
  durationMs: number;
  fps: number;
  p95: number;
  sawTransform: boolean;
  visualMovePx: number;
  firstRegion: SigmaSpotlightRegionState | null;
  lastRegion: SigmaSpotlightRegionState | null;
  transformSamples: string[];
}
```

- [ ] **Step 2: Add a spotlight-specific sampler**

Add this function below `sampleAnimationFrames`:

```ts
async function sampleSpotlightAnimationFrames(
  page: PageLike,
  durationMs: number,
  selectedId: string | null
): Promise<SigmaSpotlightAnimationSample> {
  return page.evaluate(`(() => new Promise((resolve) => {
    const durationMs = ${JSON.stringify(durationMs)};
    const selectedId = ${JSON.stringify(selectedId)};
    const trial = window.__sigmaProduction;
    const started = performance.now();
    const deltas = [];
    const transforms = [];
    let firstRegion = null;
    let lastRegion = null;
    let last = started;
    function tick(now) {
      const region = trial.communityRegionState(selectedId);
      if (!firstRegion && region && region.exists) firstRegion = region;
      if (region && region.exists) lastRegion = region;
      if (region && region.overlayTransform) transforms.push(region.overlayTransform);
      deltas.push(now - last);
      last = now;
      const elapsed = now - started;
      if (elapsed >= durationMs) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] || 0;
        const move = firstRegion && lastRegion
          ? Math.hypot(lastRegion.left - firstRegion.left, lastRegion.top - firstRegion.top)
          : 0;
        resolve({
          durationMs: elapsed,
          fps: deltas.length / (elapsed / 1000),
          p95,
          sawTransform: transforms.length > 0,
          visualMovePx: move,
          firstRegion,
          lastRegion,
          transformSamples: transforms.slice(0, 5)
        });
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }))()`) as Promise<SigmaSpotlightAnimationSample>;
}
```

- [ ] **Step 3: Replace spotlight measurement**

Replace `measureSpotlightAnimation` with:

```ts
async function measureSpotlightAnimation(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await waitForSpotlightReady(page);
  const target = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    return trial.containerHitTarget(trial.firstCommunityId);
  });
  if (!target) throw new Error("measureSpotlightAnimation: no Sigma container hit target");

  await clickPoint(page, target as PointerTarget);
  await page.waitForFunction(
    () => {
      const counts = (window as any).__sigmaProduction?.counts?.();
      return counts?.lastSelectionKind === "community" && (counts.lastSelectionCommunityIds || []).length > 0;
    },
    undefined,
    { timeout: 8000 }
  );
  const selectionCounts = await page.evaluate(() => (window as any).__sigmaProduction.counts()) as { lastSelectionCommunityIds?: string[] };
  const selectedId = selectionCounts.lastSelectionCommunityIds?.[0] ?? null;
  const run = await sampleSpotlightAnimationFrames(page, 320, selectedId);
  await waitForSpotlightSettled(page, selectedId);
  const region = await page.evaluate((id: string | null) => {
    const trial = (window as any).__sigmaProduction;
    return trial.communityRegionState(id);
  }, selectedId) as SigmaSpotlightRegionState;

  const failures: string[] = [];
  if (!region.exists) failures.push("region_missing");
  if (!region.selected) failures.push("region_not_selected");
  if (region.width <= 0 || region.height <= 0) failures.push(`region_size=${region.width}x${region.height}`);
  if (!run.sawTransform) failures.push("overlay_transform_missing");
  if (run.visualMovePx <= 0.5) failures.push(`region_not_moving=${run.visualMovePx}`);
  if (region.overlayTransform) failures.push(`overlay_transform_not_cleared=${region.overlayTransform}`);

  return frameSampleRecord(page, metadata, {
    action: "spotlight_animation",
    runs: [run],
    failureClass: failures.length ? "spotlight_animation_follow_failed" : null,
    failureDetail: failures.length
      ? [
        failures.join("; "),
        `visual_move_px=${run.visualMovePx}`,
        `transform_samples=${run.transformSamples.join("|")}`
      ].join("; ")
      : null
  });
}
```

- [ ] **Step 4: Typecheck the browser script**

Run:

```bash
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: PASS.

- [ ] **Step 5: Run the focused browser production shape**

Run:

```bash
GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense node --import tsx tests/browser/graph-sigma-global-production.ts
```

Expected: PASS. The generated `sigma-global-production-results.json` includes `spotlight_animation` with `pass: true`, fps fields, and no failure class.

- [ ] **Step 6: Verify the existing validator catches the new failure shape**

Run this command:

```bash
TMP_RESULT=$(mktemp /tmp/sigma-spotlight-failure-XXXXXX.json)
cat > "$TMP_RESULT" <<'JSON'
{
  "renderer": "sigma-global-production",
  "production_path": true,
  "shapes": ["nodes-1000-dense"],
  "errors": [],
  "records": [{
    "schema_version": 1,
    "graph_shape": "nodes-1000-dense",
    "action": "spotlight_animation",
    "production_path": true,
    "thresholds": {},
    "browser": "synthetic",
    "build_commit": "synthetic",
    "run_started_at": "2026-07-01T00:00:00.000Z",
    "run_finished_at": "2026-07-01T00:00:01.000Z",
    "fps": 60,
    "frame_p95_ms": 16,
    "loading_state": "sigma-global-ready",
    "sigma_canvas_count": 1,
    "sigma_canvas_nonblank": true,
    "sigma_visible_signal": true,
    "pass": false,
    "failure_class": "spotlight_animation_follow_failed",
    "failure_detail": "overlay_transform_missing; region_not_moving=0"
  }]
}
JSON
node tests/browser/validate-graph-trial-result.mjs "$TMP_RESULT"
```

Expected: FAIL with a line containing `spotlight_animation_follow_failed`.

- [ ] **Step 7: Commit Task 5**

```bash
git add tests/browser/graph-sigma-global-production.ts
git commit -m "test: verify sigma spotlight overlay follows mid-animation"
```

---

## Final Verification

- [ ] **Step 1: Run graph-engine tests**

```bash
npm run test -w @llm-wiki/graph-engine
```

Expected: PASS.

- [ ] **Step 2: Run graph-engine typecheck**

```bash
npm run typecheck -w @llm-wiki/graph-engine
```

Expected: PASS.

- [ ] **Step 3: Run focused Sigma browser production script**

```bash
GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense node --import tsx tests/browser/graph-sigma-global-production.ts
```

Expected: PASS.

- [ ] **Step 4: Check ignored private strings and whitespace**

```bash
git diff --check
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
```

Expected: `git diff --check` prints nothing. The grep command prints nothing.

- [ ] **Step 5: Update issue #86 after implementation**

Post this summary to the issue:

```text
Implemented the Sigma camera frame contract.

What changed:
- Removed the incorrect renderer-level cameraUpdated dependency.
- Bound camera updated as an auxiliary signal.
- Upgraded the existing settle watcher into the single owned overlay animation frame loop.
- Project-triggered spotlight and zoom animations now start frame tracking.
- Overlay animation projection uses current camera state for animation anchors only.
- Browser spotlight validation now checks mid-animation overlay transform and visual movement, not just fps/final settle.

Important correction:
The fix does not rely on the premise that Sigma animate never emits camera updated. Local Sigma 3.0.3 source shows animate calls setState and setState emits updated. The project-level bug was the wrong event boundary plus the absence of an owned overlay frame contract.
```

## Self-Review

**Spec coverage:** Every design requirement maps to a task: fake runtime fidelity in Task 1, current camera projection in Task 2, structured camera movement in Task 3, owned frame loop and event binding in Task 4, browser mid-animation proof in Task 5.

**Forbidden-token scan:** Before execution, run the no-placeholder search from the writing-plans skill against this file. Expected: no matches.

**Type consistency:** The plan uses these stable names across tasks: `SigmaGlobalCoordinateConversionOverride`, `sigmaWorldPointToScreenPointForCameraState`, `SigmaCommunitySpotlightCameraResult`, `movement`, `skipReason`, `startOverlayCameraFrameTracking`, and `requestOverlayAnimationFrame`.
