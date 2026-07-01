import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphRendererAdapterData } from "../src";
import type { SigmaGlobalCameraState, SigmaGlobalSigmaLike } from "../src/render/sigma-global-types";
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  moveSigmaCamera,
  readCameraState,
  restoreCameraState,
  sigmaCommunitySpotlightCenter,
  sigmaGlobalCameraState,
  sigmaGraphPointToCameraPoint
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

    assert.deepEqual(sigmaGlobalCameraState({}, adapterData), { x: 50, y: 50, angle: 0, ratio: 1 });
    assert.deepEqual(sigmaCommunitySpotlightCenter(adapterData, "community-a"), { x: 20, y: 30 });
    assert.deepEqual(sigmaCommunitySpotlightCenter(adapterDataWithoutWash(), "community-a"), { x: 30, y: 40 });
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
