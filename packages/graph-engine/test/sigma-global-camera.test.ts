import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphRendererAdapterData } from "../src";
import type { SigmaGlobalCameraState, SigmaGlobalSigmaLike } from "../src/render/sigma-global-types";
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  maybeAnimateSigmaNodeDrawerCamera,
  moveSigmaCamera,
  readCameraState,
  restoreCameraState,
  startSigmaGlobalViewTransition,
  sigmaCommunitySpotlightCameraState,
  sigmaCommunitySpotlightCenter,
  sigmaGlobalCameraState,
  sigmaGraphPointToCameraPoint,
  sigmaNodeDrawerCameraState
} from "../src/render/sigma-global-camera";

describe("Sigma global camera helpers", () => {
  it("normalizes missing and non-finite camera state", () => {
    const sigma = sigmaLike({ x: Number.NaN, y: Infinity, angle: undefined, ratio: "bad" });

    assert.deepEqual(readCameraState(sigma), { x: 0, y: 0, angle: 0, ratio: 1 });
    assert.equal(readCameraState({}), null);
  });

  it("restores camera state only when a state exists", () => {
    const sigma = sigmaLike({ x: 1, y: 2, angle: 0, ratio: 1 });

    restoreCameraState(sigma, null);
    assert.deepEqual(sigma.getCamera?.().getState?.(), { x: 1, y: 2, angle: 0, ratio: 1 });
    restoreCameraState(sigma, { x: 3, y: 4, angle: 0, ratio: 0.8 });
    assert.deepEqual(sigma.getCamera?.().getState?.(), { x: 3, y: 4, angle: 0, ratio: 0.8 });
  });

  it("uses setState instead of animate for reduced motion or missing animate", () => {
    const reducedMotionRoot = rootWithReducedMotion(true);
    const animatedSigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

    assert.deepEqual(
      maybeAnimateSigmaCommunitySpotlightCamera(animatedSigma, reducedMotionRoot, adapterDataFixture(), "community-a", null),
      { communityId: "community-a", movement: "immediate", skipReason: undefined }
    );
    assert.equal(animatedSigma.animateCalls, 0);
    assert.equal(animatedSigma.setStateCalls, 1);

    const noAnimateSigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }, false);
    assert.deepEqual(
      maybeAnimateSigmaCommunitySpotlightCamera(noAnimateSigma, rootWithReducedMotion(false), adapterDataFixture(), "community-a", null),
      { communityId: "community-a", movement: "immediate", skipReason: "animate-unavailable" }
    );
    assert.equal(noAnimateSigma.setStateCalls, 1);
  });

  it("returns community id and animated movement when spotlight starts camera animation", () => {
    const sigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

    const result = maybeAnimateSigmaCommunitySpotlightCamera(
      sigma,
      rootWithReducedMotion(false),
      adapterDataFixture(),
      "community-a",
      null
    );

    assert.equal(result.communityId, "community-a");
    assert.equal(result.movement, "animated");
    assert.equal(result.skipReason, undefined);
    assert.equal(sigma.animateCalls, 1);
  });

  it("distinguishes settled spotlight from unavailable camera", () => {
    const settled = maybeAnimateSigmaCommunitySpotlightCamera(
      sigmaLike({ x: 28, y: 30, angle: 0, ratio: 1 }),
      rootWithReducedMotion(false),
      adapterDataFixture(),
      "community-a",
      "community-a"
    );
    const unavailable = maybeAnimateSigmaCommunitySpotlightCamera(
      {},
      rootWithReducedMotion(false),
      adapterDataFixture(),
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
      {
        getCamera: () => ({
          getState: () => ({ x: 0, y: 0, angle: 0, ratio: 1 }),
          animate: () => Promise.reject(error)
        })
      },
      { x: 10 },
      false,
      (caught) => observed.push(caught)
    );

    assert.equal(result.movement, "animated");
    await Promise.resolve();
    assert.deepEqual(observed, [error]);
  });

  it("routes synchronous camera animation failures to the fatal error callback", () => {
    const error = new Error("animation threw");
    const observed: unknown[] = [];
    const result = moveSigmaCamera(
      {
        getCamera: () => ({
          getState: () => ({ x: 0, y: 0, angle: 0, ratio: 1 }),
          animate: () => {
            throw error;
          }
        })
      },
      { x: 10 },
      false,
      (caught) => observed.push(caught)
    );

    assert.deepEqual(result, { movement: "skipped", skipReason: "animate-error" });
    assert.deepEqual(observed, [error]);
  });

  it("starts animated view transitions with an explicit completion cleanup", () => {
    const sigma = transitionSigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });
    const events: string[] = [];

    const result = startSigmaGlobalViewTransition(sigma, {
      target: { x: 10, y: 20, ratio: 0.75 },
      animate: true,
      reducedMotion: false,
      durationMs: 260,
      easing: "quadraticInOut",
      onComplete: () => events.push("complete"),
      onCancel: () => events.push("cancel"),
      onCleanup: () => events.push("cleanup")
    });

    assert.equal(result.movement, "animated");
    assert.equal(result.transition?.isActive(), true);
    assert.deepEqual(sigma.animateCalls, [
      {
        state: { x: 10, y: 20, ratio: 0.75 },
        options: { duration: 260, easing: "quadraticInOut" }
      }
    ]);

    result.transition?.complete();

    assert.equal(result.transition?.isActive(), false);
    assert.deepEqual(events, ["complete", "cleanup"]);
    result.transition?.cancel({ x: 4 });
    assert.deepEqual(events, ["complete", "cleanup"]);
  });

  it("lands view transitions immediately when animation is disabled or reduced", () => {
    const noAnimation = transitionSigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });
    const noAnimationEvents: string[] = [];

    assert.deepEqual(
      startSigmaGlobalViewTransition(noAnimation, {
        target: { x: 2, y: 3, ratio: 1.4 },
        animate: false,
        reducedMotion: false,
        onComplete: () => noAnimationEvents.push("complete"),
        onCleanup: () => noAnimationEvents.push("cleanup")
      }),
      { movement: "immediate", transition: null }
    );
    assert.deepEqual(noAnimation.setStateCalls, [{ x: 2, y: 3, ratio: 1.4 }]);
    assert.deepEqual(noAnimationEvents, ["complete", "cleanup"]);

    const reduced = transitionSigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

    assert.deepEqual(
      startSigmaGlobalViewTransition(reduced, {
        target: { x: 5 },
        animate: true,
        reducedMotion: true
      }),
      { movement: "immediate", transition: null }
    );
    assert.equal(reduced.animateCalls.length, 0);
    assert.deepEqual(reduced.setStateCalls, [{ x: 5 }]);
  });

  it("reports unavailable cameras without running transition cleanup", () => {
    const events: string[] = [];

    assert.deepEqual(
      startSigmaGlobalViewTransition({}, {
        target: { x: 10 },
        animate: true,
        reducedMotion: false,
        onCleanup: () => events.push("cleanup")
      }),
      { movement: "skipped", skipReason: "camera-unavailable", transition: null }
    );
    assert.deepEqual(events, []);
  });

  it("lets a user takeover keep old Sigma animations from reclaiming the camera", () => {
    const sigma = transitionSigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });
    const events: string[] = [];
    const result = startSigmaGlobalViewTransition(sigma, {
      target: { x: 10, y: 20, ratio: 0.75 },
      animate: true,
      reducedMotion: false,
      onCancel: () => events.push("cancel"),
      onCleanup: () => events.push("cleanup")
    });

    result.transition?.cancel({ x: 3, y: 4, ratio: 1.2 });
    sigma.forceAnimatedState({ x: 10, y: 20, ratio: 0.75 });

    assert.deepEqual(events, ["cancel", "cleanup"]);
    assert.deepEqual(sigma.getCamera?.().getState?.(), { x: 3, y: 4, angle: 0, ratio: 1.2 });
    assert.deepEqual(sigma.setStateCalls.at(-1), { x: 3, y: 4, ratio: 1.2 });
  });

  it("falls back to raw graph points when Sigma projection is unavailable or invalid", () => {
    assert.deepEqual(sigmaGraphPointToCameraPoint({}, { x: 10, y: 20 }), { x: 10, y: 20 });
    assert.deepEqual(
      sigmaGraphPointToCameraPoint({
        graphToViewport: () => ({ x: Number.NaN, y: 1 }),
        viewportToFramedGraph: () => ({ x: 30, y: 40 })
      }, { x: 10, y: 20 }),
      { x: 10, y: 20 }
    );
    assert.deepEqual(
      sigmaGraphPointToCameraPoint({
        graphToViewport: (point) => ({ x: point.x + 1, y: point.y + 1 }),
        viewportToFramedGraph: (point) => ({ x: point.x + 2, y: point.y + 2 })
      }, { x: 10, y: 20 }),
      { x: 13, y: 23 }
    );
  });

  it("computes full graph camera state and community spotlight centers", () => {
    const adapterData = adapterDataFixture();

    assert.deepEqual(sigmaGlobalCameraState({}, adapterData), { x: 30, y: 40, angle: 0, ratio: 1 });
    assert.deepEqual(sigmaCommunitySpotlightCenter(adapterData, "community-a"), { x: 20, y: 30 });
    assert.deepEqual(sigmaCommunitySpotlightCenter(adapterDataWithoutWash(), "community-a"), { x: 30, y: 40 });
  });

  it("computes full graph camera reset in Sigma camera coordinates", () => {
    const adapterData = adapterDataFixture();

    assert.deepEqual(
      sigmaGlobalCameraState({
        graphToViewport: () => ({ x: 900, y: -400 }),
        viewportToFramedGraph: () => ({ x: 1200, y: -800 })
      }, adapterData),
      { x: 0.5, y: 0.5, angle: 0, ratio: 1 }
    );
  });

  it("zooms out full graph camera reset when global nodes would be cropped", () => {
    const adapterData = adapterDataFixture();
    adapterData.nodes = [
      nodeFixture("left", { x: -400, y: 0 }),
      nodeFixture("right", { x: 400, y: 0 }),
      nodeFixture("top", { x: 0, y: -260 }),
      nodeFixture("bottom", { x: 0, y: 260 })
    ];
    adapterData.renderable.worldBounds = { minX: -400, maxX: 400, minY: -260, maxY: 260 };

    const target = sigmaGlobalCameraState(
      sigmaLikeWithProjection({ x: 0, y: 0, angle: 0, ratio: 1 }, { width: 500, height: 500 }),
      adapterData,
      { width: 500, height: 500 }
    );

    assert.equal(target.x, 0.5);
    assert.equal(target.y, 0.5);
    assert.ok((target.ratio ?? 1) > 2, `full graph reset should zoom out enough to fit wide nodes, got ${JSON.stringify(target)}`);
  });

  it("keeps drawer offset out of community reading camera targets", () => {
    const globalTarget = sigmaCommunitySpotlightCameraState(
      sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
      adapterDataFixture(),
      "community-a"
    );
    const readingTarget = sigmaCommunitySpotlightCameraState(
      sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
      adapterDataWithCommunityReading(),
      "community-a"
    );

    assert.equal(globalTarget?.x, 28);
    assert.equal(readingTarget?.x, 30);
    assert.equal(readingTarget?.y, 40);
  });

  it("centers community reading on visible community nodes instead of oversized wash geometry", () => {
    const adapterData = adapterDataWithCommunityReading();
    adapterData.renderable.communities = adapterData.renderable.communities.map((community) => ({
      ...community,
      wash: { cx: 5, cy: 10, rx: 90, ry: 80 }
    }));

    const target = sigmaCommunitySpotlightCameraState(
      sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
      adapterData,
      "community-a"
    );

    assert.equal(target?.x, 30);
    assert.equal(target?.y, 40);
  });

  it("does not carry an over-zoomed global spotlight ratio into community reading", () => {
    const target = sigmaCommunitySpotlightCameraState(
      sigmaLike({ x: 0, y: 0, angle: 0, ratio: 0.72 }),
      adapterDataWithCommunityReading(),
      "community-a"
    );

    assert.equal(target?.ratio, 1);
  });

  it("widens community reading camera when projected nodes would overflow the viewport", () => {
    const adapterData = adapterDataWithCommunityReading();
    adapterData.nodes = [
      nodeFixture("left", { x: -400, y: 0 }),
      nodeFixture("right", { x: 400, y: 0 }),
      nodeFixture("top", { x: 0, y: -260 })
    ];

    const target = sigmaCommunitySpotlightCameraState(
      sigmaLikeWithProjection({ x: 0, y: 0, angle: 0, ratio: 1 }, { width: 500, height: 500 }),
      adapterData,
      "community-a",
      { width: 500, height: 500 }
    );

    assert.ok((target?.ratio ?? 0) > 2, "community reading should zoom out until the nodes fit");
  });

  it("moves closer when projected community nodes are too small to read", () => {
    const adapterData = adapterDataWithCommunityReading();
    adapterData.nodes = [
      nodeFixture("a", { x: -20, y: -16 }),
      nodeFixture("b", { x: 20, y: -16 }),
      nodeFixture("c", { x: 18, y: 16 }),
      nodeFixture("d", { x: -18, y: 16 })
    ];

    const target = sigmaCommunitySpotlightCameraState(
      sigmaLikeWithProjection({ x: 0, y: 0, angle: 0, ratio: 1 }, { width: 500, height: 500 }),
      adapterData,
      "community-a",
      { width: 500, height: 500 }
    );

    assert.ok((target?.ratio ?? 1) < 0.4, "tight community reading should zoom in until the nodes are readable");
  });

  it("does not decide selected community internally", () => {
    const sigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

    assert.deepEqual(
      maybeAnimateSigmaCommunitySpotlightCamera(sigma, rootWithReducedMotion(false), adapterDataFixture(), null, null),
      { communityId: null, movement: "skipped", skipReason: "no-community" }
    );
    assert.equal(sigma.setStateCalls, 0);
    assert.equal(sigma.animateCalls, 0);
  });

  // #122：社区阅读单击节点时，右侧节点详情抽屉打开后的镜头让位。宽屏并排抽屉把画布
  // 挤窄、抽屉覆在画布旁不遮挡，所以镜头居中到被选节点（剩余画布中心）；默认保持当前
  // 缩放，只有节点或一阶关系圈会被裁切时才轻微缩小。窄屏覆盖抽屉不调用这条路径。
  describe("sigma node drawer camera accommodation", () => {
    it("does not accommodate outside community reading", () => {
      const target = sigmaNodeDrawerCameraState(
        sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
        adapterDataFixture(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      assert.equal(target, null);
    });

    it("does not accommodate without a viewport", () => {
      const target = sigmaNodeDrawerCameraState(
        sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
        adapterDataWithCommunityReading(),
        "alpha"
      );

      assert.equal(target, null);
    });

    it("centers the selected node in the remaining canvas while keeping the zoom", () => {
      const target = sigmaNodeDrawerCameraState(
        sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 }),
        adapterDataWithCommunityReading(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      // alpha@{10,20}; 镜头居中到节点（剩余画布中心）。
      assert.equal(target?.x, 10);
      assert.equal(target?.y, 20);
      assert.equal(target?.ratio, 1);
    });

    it("keeps the current zoom when the node and one-hop neighbors fit the remaining canvas", () => {
      const data = adapterDataWithCommunityReading();
      data.edges = [edgeFixture("alpha-beta", "alpha", "beta")];

      const target = sigmaNodeDrawerCameraState(
        sigmaLikeWithProjection({ x: 0, y: 0, angle: 0, ratio: 1 }, { width: 1000, height: 800 }),
        data,
        "alpha",
        { viewportSize: { width: 1000, height: 800 } }
      );

      assert.equal(target?.ratio, 1, "alpha and beta both fit the canvas, keep the zoom");
    });

    it("zooms out when the one-hop relation circle would be cropped by the canvas", () => {
      const data = adapterDataWithCommunityReading();
      data.nodes = [
        nodeFixture("alpha", { x: -300, y: 0 }),
        nodeFixture("beta", { x: 300, y: 0 })
      ];
      data.edges = [edgeFixture("alpha-beta", "alpha", "beta")];

      const target = sigmaNodeDrawerCameraState(
        sigmaLikeWithProjection({ x: 0, y: 0, angle: 0, ratio: 1 }, { width: 400, height: 400 }),
        data,
        "alpha",
        { viewportSize: { width: 400, height: 400 } }
      );

      assert.ok((target?.ratio ?? 1) > 1, "wide one-hop span past the canvas should zoom out");
    });

    it("returns null when the camera already centers the node", () => {
      const target = sigmaNodeDrawerCameraState(
        sigmaLike({ x: 10, y: 20, angle: 0, ratio: 1 }),
        adapterDataWithCommunityReading(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      assert.equal(target, null);
    });

    it("snaps the camera immediately under reduced motion", () => {
      const sigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

      const result = maybeAnimateSigmaNodeDrawerCamera(
        sigma,
        rootWithReducedMotion(true),
        adapterDataWithCommunityReading(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      assert.equal(result.movement, "immediate");
      assert.equal(sigma.animateCalls, 0);
      assert.equal(sigma.setStateCalls, 1);
    });

    it("animates the accommodation under normal motion", () => {
      const sigma = sigmaLike({ x: 0, y: 0, angle: 0, ratio: 1 });

      const result = maybeAnimateSigmaNodeDrawerCamera(
        sigma,
        rootWithReducedMotion(false),
        adapterDataWithCommunityReading(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      assert.equal(result.movement, "animated");
      assert.equal(sigma.animateCalls, 1);
    });

    it("skips when the accommodation target is already settled", () => {
      const sigma = sigmaLike({ x: 10, y: 20, angle: 0, ratio: 1 });

      const result = maybeAnimateSigmaNodeDrawerCamera(
        sigma,
        rootWithReducedMotion(false),
        adapterDataWithCommunityReading(),
        "alpha",
        { viewportSize: { width: 800, height: 600 } }
      );

      assert.equal(result.movement, "skipped");
      assert.equal(sigma.animateCalls, 0);
      assert.equal(sigma.setStateCalls, 0);
    });
  });
});

function sigmaLike(
  state: Partial<SigmaGlobalCameraState> & Record<string, unknown>,
  withAnimate = true
): SigmaGlobalSigmaLike & { setStateCalls: number; animateCalls: number } {
  let current = { ...state } as SigmaGlobalCameraState;
  const output = {
    setStateCalls: 0,
    animateCalls: 0,
    getCamera() {
      return {
        getState: () => current,
        setState: (next: Partial<SigmaGlobalCameraState>) => {
          output.setStateCalls += 1;
          current = { ...current, ...next };
        },
        animate: withAnimate
          ? (next: Partial<SigmaGlobalCameraState>) => {
              output.animateCalls += 1;
              current = { ...current, ...next };
            }
          : undefined
      };
    }
  };
  return output;
}

function transitionSigmaLike(
  state: SigmaGlobalCameraState
): SigmaGlobalSigmaLike & {
  setStateCalls: Array<Partial<SigmaGlobalCameraState>>;
  animateCalls: Array<{ state: Partial<SigmaGlobalCameraState>; options?: { duration?: number; easing?: string } }>;
  forceAnimatedState: (next: Partial<SigmaGlobalCameraState>) => void;
} {
  let current = { ...state };
  const listeners = new Set<(state?: SigmaGlobalCameraState) => void>();
  const output = {
    setStateCalls: [] as Array<Partial<SigmaGlobalCameraState>>,
    animateCalls: [] as Array<{ state: Partial<SigmaGlobalCameraState>; options?: { duration?: number; easing?: string } }>,
    getCamera() {
      return {
        getState: () => ({ ...current }),
        setState: (next: Partial<SigmaGlobalCameraState>) => {
          output.setStateCalls.push({ ...next });
          current = { ...current, ...next };
          for (const listener of listeners) listener({ ...current });
        },
        animate: (next: Partial<SigmaGlobalCameraState>, options?: { duration?: number; easing?: string }) => {
          output.animateCalls.push({ state: { ...next }, options: options ? { ...options } : undefined });
        },
        isAnimated: () => true,
        on: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => {
          if (event === "updated") listeners.add(listener);
        },
        off: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => {
          if (event === "updated") listeners.delete(listener);
        }
      };
    },
    forceAnimatedState(next: Partial<SigmaGlobalCameraState>) {
      current = { ...current, ...next };
      for (const listener of listeners) listener({ ...current });
    }
  };
  return output;
}

function sigmaLikeWithProjection(
  state: SigmaGlobalCameraState,
  size: { width: number; height: number }
): SigmaGlobalSigmaLike {
  return {
    getCamera: () => ({
      getState: () => state
    }),
    graphToViewport: (point, override) => {
      const camera = { ...state, ...(override?.cameraState ?? {}) };
      return {
        x: size.width / 2 + (point.x - camera.x) / camera.ratio,
        y: size.height / 2 + (point.y - camera.y) / camera.ratio
      };
    }
  };
}

function rootWithReducedMotion(reduce: boolean): HTMLElement {
  return {
    ownerDocument: {
      defaultView: {
        matchMedia: () => ({ matches: reduce })
      }
    }
  } as HTMLElement;
}

function adapterDataFixture(): GraphRendererAdapterData {
  return {
    counts: {
      nodes: 2,
      edges: 0,
      communities: 1,
      hidden: 0,
      renderedNodes: 2,
      renderedEdges: 0,
      aggregationContainers: 0
    },
    selection: {
      input: { kind: "community", id: "community-a" },
      selectionId: "community:community-a",
      selectedNodeIds: [],
      selectedCommunityIds: ["community-a"],
      containsCurrentObject: true
    },
    nodes: [
      nodeFixture("alpha", { x: 10, y: 20 }),
      nodeFixture("beta", { x: 50, y: 60 })
    ],
    edges: [],
    communities: [
      {
        id: "community-a",
        object: { kind: "community", communityId: "community-a" },
        label: "Community A",
        nodeIds: ["alpha", "beta"],
        nodeCount: 2,
        selected: true,
        searchResultIds: [],
        pinHints: [],
        aggregationIds: [],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "community-a" }
        },
        commands: []
      }
    ],
    aggregations: [],
    renderable: {
      nodes: [],
      edges: [],
      communities: [
        {
          id: "community-a",
          role: "community",
          label: "Community A",
          nodeCount: 2,
          selected: true,
          searchHitCount: 0,
          pinnedCount: 0,
          selectedCount: 0,
          color: "#64748b",
          x: 20,
          y: 30,
          radius: 20,
          wash: { cx: 20, cy: 30, rx: 20, ry: 20 },
          drawerTarget: {
            summaryKind: "community-summary",
            object: { kind: "community", communityId: "community-a" }
          },
          commands: []
        }
      ],
      aggregationContainers: [],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId: null,
      selectedCommunityId: "community-a",
      selectedNodeIds: [],
      hiddenNodeIds: new Set(),
      searchResultIds: [],
      worldBounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      budgets: {
        limits: {
          maxNodes: 2,
          maxEdges: 0,
          maxLabels: 0,
          maxCards: 0,
          maxInteractionUpdates: 1,
          maxVisibleCommunities: 1
        },
        usage: {
          nodes: 2,
          edges: 0,
          labels: 0,
          cards: 0,
          interactionUpdate: 1,
          activeInteraction: 1,
          communities: 1,
          aggregationContainers: 0
        }
      },
      qualityNotice: null,
      communityFocus: null,
      communityQuality: {
        boundaryCertainty: "high",
        skeletonLabel: "stable",
        hiddenNodeCount: 0,
        hiddenEdgeCount: 0,
        stableCoreNodeIds: ["alpha"],
        stableSkeletonEdgeIds: [],
        temporaryBoostNodeIds: []
      }
    }
  };
}

function adapterDataWithoutWash(): GraphRendererAdapterData {
  const data = adapterDataFixture();
  data.renderable.communities = data.renderable.communities.map((community) => ({ ...community, wash: null }));
  return data;
}

function adapterDataWithCommunityReading(): GraphRendererAdapterData {
  const data = adapterDataFixture();
  data.renderable.communityMap = {
    active: true,
    sourceCommunityId: "community-a",
    motionMode: "frozen",
    maxNodeDriftRatio: 0,
    current: null,
    rulesByCommunityId: {}
  };
  return data;
}

function nodeFixture(id: string, point: { x: number; y: number }): GraphRendererAdapterData["nodes"][number] {
  return {
    id,
    object: { kind: "node", nodeId: id },
    label: id,
    type: "topic",
    communityId: "community-a",
    sourcePath: `${id}.md`,
    point,
    selected: false,
    searchHit: false,
    pinHint: {
      nodeId: id,
      wikiPath: `${id}.md`,
      pinned: false,
      position: null
    },
    aggregationIds: [],
    drawerTarget: {
      summaryKind: "node-summary",
      object: { kind: "node", nodeId: id }
    },
    render: {
      displayMode: "point",
      visualRole: "landmark",
      priority: 1,
      labelVisible: false
    }
  };
}

function edgeFixture(id: string, sourceNodeId: string, targetNodeId: string): GraphRendererAdapterData["edges"][number] {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    sourceCommunityId: "community-a",
    targetCommunityId: "community-a",
    relationType: null,
    confidence: null,
    weight: 1,
    render: {
      strokeWidth: 1,
      opacity: 1,
      communityMapLayer: "related",
      relationFocusDepth: "first",
      skeleton: false,
      traceable: false
    }
  };
}
