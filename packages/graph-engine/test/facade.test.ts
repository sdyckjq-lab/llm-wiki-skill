import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  type GraphData,
  type GraphTypeFilters,
  type PinMap,
  type SelectionInput,
  type ThemeId
} from "../src";
import {
  createGraphFacadeFromRenderer,
  createGraphFacadeRouteManager,
  createGraphOfflineCapabilities,
  createGraphStandaloneCapabilities,
  createGraphWorkbenchCapabilities,
  selectionInputForSigmaHit,
  sigmaCommunityReadingHitActionForSigmaHit,
  sigmaGlobalHitActionForSigmaHit,
  type GraphFacadeRenderer,
  type GraphFacadeRouteManager,
  type GraphFacadeRouteRendererFactoryInput,
  type GraphFacadeState
} from "../src/facade";

const DATA: GraphData = {
  meta: {
    build_date: "2026-06-16",
    wiki_title: "Facade test graph",
    total_nodes: 2,
    total_edges: 1
  },
  nodes: [
    {
      id: "a",
      label: "Alpha",
      type: "topic",
      community: "c1",
      source_path: "wiki/a.md",
      content: "Alpha content"
    },
    {
      id: "b",
      label: "Beta",
      type: "source",
      community: "c1",
      source_path: "wiki/b.md",
      content: "Beta content"
    }
  ],
  edges: [
    {
      id: "a->b",
      from: "a",
      to: "b",
      type: "EXTRACTED",
      confidence: "EXTRACTED",
      relation_type: "实现",
      weight: 1
    }
  ]
};

describe("GraphFacade", () => {
  it("owns the public engine lifecycle around a renderer", async () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui"
    });

    assert.equal(container.dataset.llmWikiGraphEngine, "mounted");
    assert.equal(container.dataset.llmWikiGraphTheme, "shan-shui");

    engine.setTheme("mo-ye");
    assert.equal(container.dataset.llmWikiGraphTheme, "mo-ye");
    assert.deepEqual(renderer.calls.at(-1), ["setTheme", "mo-ye"]);

    engine.setEdgeStyle({ semanticEmphasis: true, focusHighlight: false });
    assert.deepEqual(renderer.calls.at(-1), ["setEdgeStyle", { semanticEmphasis: true, focusHighlight: false }]);

    engine.focusNode("wiki/a.md");
    assert.equal(container.dataset.llmWikiGraphFocus, "wiki/a.md");
    assert.deepEqual(renderer.calls.at(-1), ["focusNode", "wiki/a.md"]);

    // #122：节点抽屉让位走公共 API → 路由渲染器 accommodateNodeDrawer。
    engine.accommodateNodeForDrawer("a");
    assert.deepEqual(renderer.calls.at(-1), ["accommodateNodeDrawer", "a"]);

    engine.clearInteraction();
    assert.equal(container.dataset.llmWikiGraphFocus, undefined);
    assert.deepEqual(renderer.calls.at(-1), ["clearInteraction"]);

    assert.equal(engine.setNodeFixed("a", "fix"), true);
    assert.deepEqual(renderer.calls.at(-1), ["setNodeFixed", "a", "fix"]);

    await engine.applyDiff({ addedNodes: ["c"] });
    assert.deepEqual(renderer.calls.at(-1), ["applyDiff", { addedNodes: ["c"] }, undefined]);

    engine.destroy();
    assert.equal(container.dataset.llmWikiGraphEngine, undefined);
    assert.equal(container.dataset.llmWikiGraphTheme, undefined);
    assert.equal(renderer.calls.at(-1)?.[0], "destroy");
    assert.throws(() => engine.resetView(), /Graph engine has been destroyed/);
  });

  it("resolves selections against refreshed data", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const nextData: GraphData = {
      ...DATA,
      nodes: DATA.nodes.map((node) => node.id === "a"
        ? { ...node, community: "c2" }
        : node)
    };
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui"
    });

    assert.deepEqual(engine.select({ kind: "node", id: "a" }).communityIds, ["c1"]);

    engine.setData(nextData);
    const selection = engine.select({ kind: "node", id: "a" });

    assert.deepEqual(selection.communityIds, ["c2"]);
    assert.deepEqual(renderer.calls.at(-2), ["setData", nextData, undefined]);
    assert.deepEqual(renderer.calls.at(-1), ["select", { kind: "node", id: "a" }]);
  });

  it("notifies a standalone renderer when refreshed data drops source community context", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const facadeState = twoCommunityState();
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: facadeState.data,
      theme: "shan-shui"
    }, facadeState);

    engine.setSourceCommunityContext("c2");
    engine.setData(singleCommunityData());

    assert.equal(facadeState.sourceCommunityId, null);
    assert.deepEqual(renderer.calls.slice(-2), [["setSourceCommunityContext", null], ["setData", singleCommunityData(), undefined]]);
  });

  it("notifies a standalone renderer when explicit reset clears source community context", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const facadeState = twoCommunityState();
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: facadeState.data,
      theme: "shan-shui"
    }, facadeState);

    engine.setSourceCommunityContext("c1");
    engine.resetView();

    assert.equal(facadeState.sourceCommunityId, null);
    assert.deepEqual(renderer.calls.slice(-2), [["setSourceCommunityContext", null], ["resetView"]]);
  });

  it("keeps standalone community highlight until explicit reset completes", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const facadeState = twoCommunityState();
    const selectionClears: number[] = [];
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: facadeState.data,
      theme: "shan-shui",
      capabilities: {
        onSelectionClear: () => selectionClears.push(1)
      }
    }, facadeState);

    engine.select({ kind: "community", id: "c1" });
    engine.resetView();

    assert.deepEqual(facadeState.selection, { kind: "community", id: "c1" });
    assert.deepEqual(selectionClears, []);
    const resetCall = renderer.calls.at(-1);
    assert.equal(resetCall?.[0], "resetView");

    const resetCallbacks = resetCall?.[1] as { onComplete: () => void };
    resetCallbacks.onComplete();

    assert.equal(facadeState.selection, null);
    assert.deepEqual(selectionClears, [1]);
    assert.deepEqual(renderer.calls.at(-1), ["setSourceCommunityContext", null]);
  });

  it("forwards delayed public reset completion through the route manager", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const viewResets: number[] = [];
    const selectionClears: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });
    const engine = createGraphFacadeFromRenderer(container as unknown as HTMLElement, manager, {
      data: state.data,
      theme: "shan-shui",
      capabilities: {
        onSelectionClear: () => selectionClears.push(1),
        onViewReset: () => viewResets.push(1)
      }
    }, state);

    engine.select({ kind: "community", id: "c1" });
    engine.resetView();

    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.deepEqual(viewResets, []);
    assert.deepEqual(selectionClears, []);
    const resetCall = sigmaRenderers[0].calls.find((call) => call[0] === "resetView");
    assert.ok(resetCall, "public facade reset should reach Sigma renderer");
    const resetCallbacks = resetCall[1] as { onComplete: () => void };

    resetCallbacks.onComplete();

    assert.equal(state.selection, null);
    assert.equal(state.sourceCommunityId, null);
    assert.deepEqual(selectionClears, [1]);
    assert.deepEqual(viewResets, [1]);
  });

  it("notifies a standalone renderer when clear commands drop source community context", () => {
    for (const clear of ["clearSelection", "clearInteraction"] as const) {
      const container = { dataset: {} as Record<string, string | undefined> };
      const renderer = createFakeRenderer();
      const facadeState = twoCommunityState();
      const engine = createGraphFacadeFromRenderer(container, renderer, {
        data: facadeState.data,
        theme: "shan-shui"
      }, facadeState);

      engine.setSourceCommunityContext("c1");
      engine[clear]();

      assert.equal(facadeState.sourceCommunityId, null);
      assert.deepEqual(renderer.calls.slice(-2), [["setSourceCommunityContext", null], [clear]]);
    }
  });

  it("keeps return global and reset layout as separate facade commands", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const viewResets: number[] = [];
    const selectionClears: number[] = [];
    const facadeState: GraphFacadeState = { data: DATA, pins: {}, selection: null, temporaryObject: null };
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui",
      capabilities: {
        onSelectionClear: () => selectionClears.push(1),
        onViewReset: () => viewResets.push(1)
      }
    }, facadeState);

    const focused = engine.focusCommunity("c1");
    assert.equal(container.dataset.llmWikiGraphFocus, "community:c1");
    assert.equal(facadeState.selection, null);
    assert.deepEqual(focused.communityIds, ["c1"]);
    assert.deepEqual(focused.nodeIds, ["a", "b"]);

    engine.resetLayout();
    assert.equal(container.dataset.llmWikiGraphFocus, "community:c1");
    assert.deepEqual(renderer.calls.at(-1), ["resetLayout"]);
    assert.deepEqual(viewResets, []);
    assert.deepEqual(selectionClears, []);

    engine.resetView();
    assert.equal(container.dataset.llmWikiGraphFocus, undefined);
    assert.equal(facadeState.selection, null);
    assert.equal(facadeState.temporaryObject, null);
    assert.deepEqual(renderer.calls.at(-1), ["resetView"]);
    assert.deepEqual(viewResets, [1]);
    assert.deepEqual(selectionClears, []);
  });

  it("exposes shared summary payloads from current facade data and pins", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui",
      pins: {
        "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" }
      }
    });

    const node = engine.summarizeNode("a", {
      selection: { kind: "node", id: "a" },
      searchResultIds: ["a"]
    });
    const community = engine.summarizeCommunity("c1", { selection: { kind: "community", id: "c1" } });
    const global = engine.summarizeGlobal({ searchResultIds: ["b"] });
    const search = engine.summarizeSearchResults("beta", ["b", "missing"]);
    const excluded = engine.summarizeExcludedObject({ kind: "node", nodeId: "a" }, "filter", { searchResultIds: ["a"] });

    assert.equal(node.kind, "node-summary");
    assert.equal(node.nodeId, "a");
    assert.equal(node.pinHint.pinned, true);
    assert.equal(node.selection.containsCurrentObject, true);
    assert.deepEqual(node.commands.map((command) => command.kind), ["open-detail-read", "select-neighbors", "set-fixed-position", "enter-node-community"]);

    assert.equal(community.kind, "community-summary");
    assert.equal(community.communityId, "c1");
    assert.deepEqual(community.selection.selectedNodeIds, ["a", "b"]);

    assert.equal(global.kind, "global-overview");
    assert.deepEqual(global.searchResultIds, ["b"]);

    assert.equal(search.kind, "search-results");
    assert.deepEqual(search.visibleResultIds, ["b"]);
    assert.deepEqual(search.unavailableResultIds, ["missing"]);

    assert.equal(excluded.kind, "excluded-object");
    assert.deepEqual(excluded.commands.map((command) => command.kind), ["show-this-object", "clear-temporary-object-display"]);

    engine.setPins({ "wiki/b.md": { x: 1, y: 2, coordinateSpace: "world" } });
    const beta = engine.summarizeNode("b");
    assert.equal(beta.kind, "node-summary");
    assert.equal(beta.pinHint.nodeId, "b");
    assert.equal(beta.pinHint.pinned, true);

    engine.setData(DATA);
    const betaAfterRefresh = engine.summarizeNode("b");
    assert.equal(betaAfterRefresh.kind, "node-summary");
    assert.equal(betaAfterRefresh.pinHint.pinned, true);
  });

  it("declares separate workbench, offline, and standalone capability contracts", async () => {
    const persistPins = async (_pins: PinMap) => {};
    const workbench = createGraphWorkbenchCapabilities({
      onOpenPage: () => {},
      onSelectionChange: () => {},
      onSelectionClear: () => {},
      onAsk: () => {},
      persistPins,
      onDragStateChange: () => {}
    });
    const offline = createGraphOfflineCapabilities({ persistPins });
    const standalone = createGraphStandaloneCapabilities();

    assert.equal(workbench.mode, "workbench");
    assert.deepEqual(Object.keys(workbench.capabilities || {}).sort(), [
      "onAsk",
      "onDragStateChange",
      "onOpenPage",
      "onSelectionChange",
      "onSelectionClear",
      "onViewReset",
      "onVisibilityStateChange",
      "persistPins"
    ]);

    assert.equal(offline.mode, "offline");
    assert.deepEqual(Object.keys(offline.capabilities || {}), ["persistPins"]);
    assert.equal(offline.capabilities?.onOpenPage, undefined);
    assert.equal(offline.capabilities?.onSelectionChange, undefined);
    assert.equal(offline.capabilities?.onAsk, undefined);

    assert.equal(standalone.mode, "standalone");
    assert.equal(standalone.capabilities, undefined);
    await offline.capabilities?.persistPins?.({});
  });

  it("routes global Sigma to Sigma community reading and back with facade state", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const smallFallbackInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    let overLimitNoticeCount = 0;
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(renderers, "sigma");
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return trackRenderer(renderers, "dom-community");
        },
        createDomSvgSmallFallback: (input) => {
          smallFallbackInputs.push(input);
          return trackRenderer(renderers, "small-fallback");
        },
        createOverLimitNotice: () => {
          overLimitNoticeCount += 1;
          return trackRenderer(renderers, "over-limit-notice");
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 1);
    assert.equal(communityInputs.length, 0);
    assert.equal(smallFallbackInputs.length, 0);
    assert.equal(overLimitNoticeCount, 0);

    manager.select({ kind: "node", id: "a" });
    manager.setTypeFilters({ topic: true, source: false });
    manager.setPins({ "wiki/b.md": { x: 30, y: 40, coordinateSpace: "world" } });
    manager.focusCommunity("c1");

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 1);
    assert.equal(communityInputs.length, 0);
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.equal(state.sourceCommunityId, "c1");
    assert.deepEqual(renderers[0].calls.at(-1), ["focusCommunity", "c1"]);

    sigmaInputs[0].options.callbacks.onVisibilityStateChange?.({
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      typeFilters: { topic: true, source: false },
      temporaryObject: null,
      focusCommunityId: "c1"
    });
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 1);
    assert.equal(smallFallbackInputs.length, 0);
    assert.equal(overLimitNoticeCount, 0);
    assert.equal(state.focus, null);
    assert.equal(state.sourceCommunityId, "c1");
    assert.equal(state.searchQuery, "");
    assert.deepEqual(state.searchResultIds, []);
    assert.deepEqual(state.typeFilters, { topic: true, source: false });
    assert.deepEqual(Object.keys(state.pins), ["wiki/b.md"]);
    assert.deepEqual(renderers[0].calls.slice(-2), [["focusCommunity", "c1"], ["resetView"]]);
    assert.deepEqual(renderers.map((renderer) => renderer.calls.find((call) => call[0] === "destroy")?.[0]).filter(Boolean), []);
  });

  it("keeps the retired DOM community route behind Sigma-unavailable fallback only", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const fallbackInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: (input) => {
          fallbackInputs.push(input);
          return createFakeRenderer();
        },
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(manager.sigmaKnownUnavailable, false);
    assert.equal(communityInputs.length, 0);
    assert.equal(fallbackInputs.length, 0);

    sigmaInputs[0].onSigmaUnavailable?.(new Error("WebGL unavailable"));
    manager.focusCommunity("c1");

    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(communityInputs.length, 1);
    assert.equal(fallbackInputs.length, 1);
  });

  it("keeps edge style active when Sigma enters community reading", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(renderers, "sigma");
        },
        createDomSvgCommunity: () => trackRenderer(renderers, "dom-community"),
        createDomSvgSmallFallback: () => trackRenderer(renderers, "small-fallback"),
        createOverLimitNotice: () => trackRenderer(renderers, "over-limit-notice")
      }
    });
    const baseStyle = { semanticEmphasis: true, focusHighlight: false };
    const focusStyle = { semanticEmphasis: true, focusHighlight: true };

    manager.setEdgeStyle(baseStyle);

    assert.equal(manager.routeId, "sigma-global");
    assert.deepEqual(renderers[0].calls.at(-1), ["setEdgeStyle", baseStyle]);

    manager.focusCommunity("c1");

    manager.setEdgeStyle(focusStyle);

    assert.equal(manager.routeId, "sigma-global");
    assert.deepEqual(renderers[0].calls.slice(-2), [["focusCommunity", "c1"], ["setEdgeStyle", focusStyle]]);

    manager.resetView();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 1);
    assert.deepEqual(state.edgeStyle, focusStyle);
  });

  it("marks route continuity on the stable facade host and clears transition markers", async () => {
    const route = createRouteMarkerHarness();

    route.expect("sigma-global");
    route.expectActiveRendererCount(1);

    route.manager.focusCommunity("c1");
    route.expect("sigma-global");
    route.expectActiveRendererCount(1);

    await route.expectTransitionCleared();

    route.manager.resetView();
    route.expect("sigma-global");
    route.expectActiveRendererCount(1);

    route.manager.destroy();
    route.expectDestroyed();

    await route.expectTransitionCleared();
    route.expectDestroyed();
  });

  it("marks fallback and over-limit route continuity on the stable facade host", async () => {
    const route = createRouteMarkerHarness();

    route.expect("sigma-global");
    route.sigmaInputs[0].onSigmaUnavailable?.(new Error("WebGL unavailable"));
    route.expect("dom-svg-small-fallback", "sigma-global->dom-svg-small-fallback");
    route.expectActiveRendererCount(1);

    await route.expectTransitionCleared();

    route.manager.setData(largeGraphData(2001, 1, 1));
    route.expect("over-limit-notice", "dom-svg-small-fallback->over-limit-notice");
    route.expectActiveRendererCount(1);

    await route.expectTransitionCleared();

    route.manager.destroy();
  });

  it("keeps public resetView active when already on the Sigma global route", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: { kind: "node", id: "a" },
      searchResultIds: [],
      temporaryObject: null
    };
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(renderers, "sigma"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    manager.resetView();

    assert.deepEqual(renderers[0].calls.at(-1), ["resetView"]);
    assert.deepEqual(state.selection, { kind: "node", id: "a" });
  });

  it("uses global reset to exit Sigma community spotlight without changing routes", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: { kind: "community", id: "c1" },
      searchResultIds: ["a"],
      temporaryObject: { kind: "community", communityId: "c1" }
    };
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const selectionClears: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onSelectionClearRequested: () => selectionClears.push(1)
      },
      factories: {
        createSigmaGlobal: () => trackRenderer(renderers, "sigma"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.resetView();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.focus, null);
    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.deepEqual(state.temporaryObject, { kind: "community", communityId: "c1" });
    assert.deepEqual(state.searchResultIds, ["a"]);
    assert.deepEqual(Object.keys(state.pins), ["wiki/a.md"]);
    assert.equal(selectionClears.length, 0);

    const resetCall = renderers[0].calls.at(-1);
    assert.equal(resetCall?.[0], "resetView");
    const resetCallbacks = resetCall?.[1] as { onComplete: () => void };
    resetCallbacks.onComplete();

    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);
    assert.deepEqual(selectionClears, [1]);
  });

  it("lets the Sigma toolbar global reset clear the active renderer spotlight", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: { kind: "community", id: "c1" },
      searchResultIds: [],
      temporaryObject: { kind: "community", communityId: "c1" }
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const selectionClears: number[] = [];
    const viewResets: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onSelectionClearRequested: () => selectionClears.push(1),
        onViewReset: () => viewResets.push(1)
      },
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(renderers, "sigma");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(manager.routeId, "sigma-global");
    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.deepEqual(state.temporaryObject, { kind: "community", communityId: "c1" });
    assert.deepEqual(selectionClears, []);
    assert.deepEqual(viewResets, []);
    const resetCall = renderers[0].calls.at(-1);
    assert.equal(resetCall?.[0], "resetView");
    const resetCallbacks = resetCall?.[1] as { onComplete: () => void };
    resetCallbacks.onComplete();

    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);
    assert.deepEqual(selectionClears, [1]);
    assert.deepEqual(viewResets, [1]);
  });

  it("returns from Sigma community reading to a plain global map on explicit reset", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: { kind: "community", id: "c1" },
      searchResultIds: ["a"],
      temporaryObject: { kind: "community", communityId: "c1" }
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const selectionClears: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onSelectionClearRequested: () => selectionClears.push(1)
      },
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.resetView();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.focus, null);
    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);
    assert.equal(state.sourceCommunityId, null);
    assert.equal(sigmaInputs.length, 1);
    assert.deepEqual(sigmaInputs[0].options.searchResultIds, ["a"]);
    assert.deepEqual(Object.keys(state.pins), ["wiki/a.md"]);
    assert.deepEqual(selectionClears, [1]);
  });

  it("lets a DOM/SVG community toolbar request the facade-level global route", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: { kind: "node", id: "a" },
      searchResultIds: ["a"],
      temporaryObject: null
    };
    const smallFallbackInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const viewResets: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onViewReset: () => viewResets.push(1)
      },
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: (input) => {
          smallFallbackInputs.push(input);
          return createFakeRenderer();
        },
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    manager.focusCommunity("c1");
    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(communityInputs.length, 1);

    (communityInputs[0].options.callbacks as { onGlobalResetRequested?: () => void }).onGlobalResetRequested?.();

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(smallFallbackInputs.length, 2);
    assert.equal(state.focus, null);
    assert.deepEqual(smallFallbackInputs[1].options.focus, null);
    assert.equal(smallFallbackInputs[1].options.selection, null);
    assert.equal(smallFallbackInputs[1].options.searchQuery, "");
    assert.deepEqual(smallFallbackInputs[1].options.searchResultIds, []);
    assert.deepEqual(smallFallbackInputs[1].options.typeFilters, { topic: true, source: true });
    assert.deepEqual(Object.keys(smallFallbackInputs[1].options.pins), ["wiki/a.md"]);
    assert.deepEqual(viewResets, []);
  });

  it("keeps the source community highlighted after returning to global from a community", () => {
    const state = twoCommunityState();
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = sourceContextManager(state, sigmaInputs, communityInputs);

    manager.focusCommunity("c1");
    assert.equal(state.sourceCommunityId, "c1");
    // Toolbar "return to global" keeps the source context so c1 stays highlighted.
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.sourceCommunityId, "c1");
    assert.equal(communityInputs.length, 0);
    assert.equal(manager.sourceCommunityId, "c1");
  });

  it("does not treat source community context as a render selection", () => {
    const state = twoCommunityState();
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = sourceContextManager(state, sigmaInputs, communityInputs);

    manager.setSourceCommunityContext("c1");
    manager.focusCommunity("c1");

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.selection, null);
    assert.equal(state.sourceCommunityId, "c1");
    assert.deepEqual(sigmaInputs.length, 1);
    assert.deepEqual(communityInputs.length, 0);
  });

  it("clears the source community on explicit reset and blank clear", () => {
    for (const clear of ["resetView", "clearSelection"] as const) {
      const state = twoCommunityState();
      const manager = sourceContextManager(state, []);
      manager.focusCommunity("c1");
      assert.equal(state.sourceCommunityId, "c1");
      manager[clear]();
      assert.equal(state.sourceCommunityId, null, `${clear} should clear the source community`);
    }
  });

  it("keeps community reading active when clearing node interaction inside a community", () => {
    const state = twoCommunityState();
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = sourceContextManager(state, sigmaInputs);

    manager.focusCommunity("c1");
    manager.select({ kind: "node", id: "a" });
    manager.showTemporaryObject({ kind: "node", nodeId: "b" });
    manager.clearInteraction();

    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.equal(state.sourceCommunityId, "c1");
    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);

    sigmaInputs[0].options.callbacks.onSelectionClearRequested?.();

    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.equal(state.sourceCommunityId, "c1");
  });

  it("notifies the active Sigma route when explicit reset clears source community context", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state = twoCommunityState();
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {},
      factories: {
        createSigmaGlobal: () => trackRenderer(renderers, "sigma"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.setSourceCommunityContext("c1");
    manager.resetView();

    assert.equal(state.sourceCommunityId, null);
    assert.deepEqual(renderers[0].calls.slice(-2), [["setSourceCommunityContext", null], ["resetView"]]);
  });

  it("notifies the active Sigma route when refreshed data drops the source community", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state = twoCommunityState();
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const fallbackRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {},
      factories: {
        createSigmaGlobal: () => trackRenderer(renderers, "sigma"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.setSourceCommunityContext("c2");
    manager.setData(singleCommunityData(), undefined);

    assert.equal(state.sourceCommunityId, null);
    assert.deepEqual(renderers[0].calls.slice(-2), [["setSourceCommunityContext", null], ["setData", singleCommunityData(), undefined]]);
  });

  it("notifies the active DOM community route when refreshed data drops the source community", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state = twoCommunityState();
    const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const fallbackRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {},
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => trackRenderer(renderers, "dom"),
        createDomSvgSmallFallback: () => trackRenderer(fallbackRenderers, "fallback"),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c2");
    manager.setData(singleCommunityData(), undefined);

    assert.equal(state.sourceCommunityId, null);
    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.deepEqual(renderers[0].calls.slice(-2), [["setSourceCommunityContext", null], ["destroy"]]);
    assert.deepEqual(fallbackRenderers.at(-1)?.calls[0], ["create", "fallback"]);
    assert.deepEqual(fallbackRenderers.at(-1)?.calls.filter((call) => call[0] === "setData"), []);
  });

  it("notifies the active Sigma route when clear commands drop source community context", () => {
    for (const clear of ["clearSelection", "clearInteraction"] as const) {
      const container = { dataset: {} as Record<string, string | undefined> };
      const state = twoCommunityState();
      const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
      const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
        state,
        callbacks: {},
        factories: {
          createSigmaGlobal: () => trackRenderer(renderers, "sigma"),
          createDomSvgCommunity: () => createFakeRenderer(),
          createDomSvgSmallFallback: () => createFakeRenderer(),
          createOverLimitNotice: () => createFakeRenderer()
        }
      });

      manager.setSourceCommunityContext("c1");
      manager[clear]();

      assert.equal(state.sourceCommunityId, null);
      assert.deepEqual(renderers[0].calls.slice(-2), [["setSourceCommunityContext", null], [clear]]);
    }
  });

  it("replaces the source community when another community is selected", () => {
    const state = twoCommunityState();
    const manager = sourceContextManager(state, []);
    manager.focusCommunity("c1");
    assert.equal(state.sourceCommunityId, "c1");
    manager.select({ kind: "community", id: "c2" });
    assert.equal(state.sourceCommunityId, "c2");
  });

  it("drops the source community when refreshed data no longer contains it", () => {
    const state = twoCommunityState();
    const manager = sourceContextManager(state, []);
    manager.setSourceCommunityContext("c2");
    assert.equal(state.sourceCommunityId, "c2");
    manager.setData(singleCommunityData(), undefined);
    assert.equal(state.sourceCommunityId, null);
  });

  it("returns global to DOM/SVG small fallback without retrying a known unavailable Sigma instance", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCreateCount = 0;
    const smallFallbackInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    let overLimitNoticeCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCreateCount += 1;
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: (input) => {
          smallFallbackInputs.push(input);
          assert.ok(input.options.data.nodes.length <= 2000);
          return createFakeRenderer();
        },
        createOverLimitNotice: () => {
          overLimitNoticeCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(manager.sigmaAttemptCount, 1);
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackInputs.length, 1);
    assert.equal(overLimitNoticeCount, 0);

    manager.focusCommunity("c1");
    assert.equal(manager.routeId, "dom-svg-community");
    manager.resetView();

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(manager.sigmaAttemptCount, 1);
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackInputs.length, 2);
    assert.equal(overLimitNoticeCount, 0);
  });

  it("returns global to DOM/SVG small fallback from a DOM request with one view reset callback", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const viewResets: number[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const smallFallbackRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onViewReset: () => viewResets.push(1)
      },
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: () => {
          const renderer = trackRenderer(smallFallbackRenderers, "small-fallback");
          renderer.resetView = () => {
            renderer.calls.push(["resetView"]);
            viewResets.push(1);
          };
          return renderer;
        },
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    assert.equal(manager.routeId, "dom-svg-community");

    (communityInputs[0].options.callbacks as { onGlobalResetRequested?: () => void }).onGlobalResetRequested?.();

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(state.focus, null);
    assert.deepEqual(viewResets, [1]);
    assert.deepEqual(smallFallbackRenderers.at(-1)?.calls.filter((call) => call[0] === "resetView"), [["resetView"]]);
  });

  it("updates the current fallback renderer when Sigma is known unavailable and the route stays the same", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const smallFallbackRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => trackRenderer(smallFallbackRenderers, "small-fallback"),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });
    const nextData = {
      ...DATA,
      meta: { ...DATA.meta, wiki_title: "Facade test graph refreshed" }
    };

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    manager.setData(nextData);

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(smallFallbackRenderers.length, 1);
    assert.deepEqual(smallFallbackRenderers[0].calls.at(-1), ["setData", nextData, undefined]);
  });

  it("keeps a 2000-node graph eligible for Sigma global rendering", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2000, 4000, 500),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    let domFallbackCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          domFallbackCount += 1;
          return createFakeRenderer();
        },
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaCount, 1);
    assert.equal(overLimitCount, 0);
    assert.equal(domFallbackCount, 0);
  });

  it("routes a 2001-node graph directly to the over-limit notice before Sigma", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2001, 1, 1),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    let domFallbackCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          domFallbackCount += 1;
          return createFakeRenderer();
        },
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(sigmaCount, 0);
    assert.equal(domFallbackCount, 0);
    assert.equal(overLimitCount, 1);
  });

  it("keeps over-limit reset on the over-limit route", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2001, 1, 1),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: { kind: "community", id: "large-community-0" },
      searchResultIds: [],
      temporaryObject: null
    };
    const overLimitRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => createFakeRenderer(),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => trackRenderer(overLimitRenderers, "over-limit-notice")
      }
    });

    assert.equal(manager.routeId, "over-limit-notice");
    manager.resetView();

    assert.equal(manager.routeId, "over-limit-notice");
    assert.deepEqual(overLimitRenderers[0].calls.filter((call) => call[0] === "resetView"), [["resetView"]]);
  });

  it("routes stale small metadata to over-limit notice using actual node array length", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const staleLargeData = largeGraphData(2001, 1, 1);
    staleLargeData.meta.total_nodes = 1;
    staleLargeData.meta.total_edges = 1;
    const state: GraphFacadeState = {
      data: staleLargeData,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(sigmaCount, 0);
    assert.equal(overLimitCount, 1);
  });

  it("re-routes normal global data to over-limit notice when refreshed over the node cap", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    manager.setData(largeGraphData(2001, 1, 1));

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(container.dataset.llmWikiGraphRoute, "over-limit-notice");
    assert.equal(container.dataset.llmWikiGraphRouteTransition, "sigma-global->over-limit-notice");
    assert.equal(sigmaCount, 1);
    assert.equal(overLimitCount, 1);
  });

  it("returns from over-limit notice to Sigma global when refreshed back under the node cap", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2001, 1, 1),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "over-limit-notice");
    manager.setData(largeGraphData(2000, 1, 1));

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(overLimitCount, 1);
    assert.equal(sigmaCount, 1);
  });

  it("re-routes known-unavailable small fallback data to over-limit notice when refreshed over the node cap", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let smallFallbackCount = 0;
    let overLimitCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          smallFallbackCount += 1;
          return createFakeRenderer();
        },
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    manager.setData(largeGraphData(2001, 1, 1));

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(smallFallbackCount, 1);
    assert.equal(overLimitCount, 1);
  });

  it("keeps route manager selection state synchronized with renderer callbacks", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: { kind: "node", nodeId: "a" }
    };
    const selections: SelectionInput[] = [];
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onSelectionInput: (selection) => selections.push(selection)
      },
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    sigmaInputs[0].options.callbacks.onSelectionInput?.({ kind: "node", id: "a" });
    assert.deepEqual(state.selection, { kind: "node", id: "a" });
    assert.deepEqual(selections, [{ kind: "node", id: "a" }]);

    sigmaInputs[0].options.callbacks.onSelectionInput?.({ kind: "community", id: "c1" });
    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.equal(state.sourceCommunityId, "c1");
    assert.deepEqual(selections.at(-1), { kind: "community", id: "c1" });

    sigmaInputs[0].options.callbacks.onSelectionClearRequested?.();
    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);
  });

  it("routes over-limit Sigma retry back to the static notice before creating Sigma", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2001, 1, 1),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCount = 0;
    let overLimitCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          sigmaCount += 1;
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => {
          overLimitCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(container.dataset.llmWikiGraphRoute, "over-limit-notice");
    manager.retrySigma();

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(container.dataset.llmWikiGraphRoute, "over-limit-notice");
    assert.equal(container.dataset.llmWikiGraphRouteTransition, undefined);
    assert.equal(sigmaCount, 0);
    assert.equal(overLimitCount, 2);
  });

  it("routes abnormal Sigma runtime failures to DOM/SVG small fallback and retries Sigma only on request", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let sigmaCreateCount = 0;
    let smallFallbackCount = 0;
    let overLimitNoticeCount = 0;
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaCreateCount += 1;
          sigmaInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          smallFallbackCount += 1;
          return createFakeRenderer();
        },
        createOverLimitNotice: () => {
          overLimitNoticeCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    sigmaInputs[0].onSigmaUnavailable?.(new Error("canvas runtime abnormal failure"));

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(smallFallbackCount, 1);
    assert.equal(overLimitNoticeCount, 0);
    assert.equal(sigmaCreateCount, 1);

    manager.resetView();
    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackCount, 1);
    assert.equal(overLimitNoticeCount, 0);

    manager.retrySigma();
    assert.equal(manager.routeId, "sigma-global");
    assert.equal(manager.sigmaKnownUnavailable, false);
    assert.equal(sigmaCreateCount, 2);
  });
});

describe("selectionInputForSigmaHit", () => {
  it("converts additive Sigma node hits into manual multi-node selections", () => {
    const data = sigmaHitGraph();

    assert.deepEqual(selectionInputForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "node", id: "a2" }, { additive: true }), {
      kind: "nodes",
      ids: ["a1", "a2"]
    });
    assert.deepEqual(selectionInputForSigmaHit(data, { kind: "nodes", ids: ["a1", "a2"] }, { kind: "node", id: "a1" }, { additive: true }), {
      kind: "node",
      id: "a2"
    });
    assert.equal(selectionInputForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "node", id: "a1" }, { additive: true }), null);
    assert.deepEqual(selectionInputForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "node", id: "b1" }, { additive: false }), {
      kind: "node",
      id: "b1"
    });
  });

  it("keeps additive Sigma community-reading node hits as exact multi-select without opening the node", () => {
    const data = sigmaHitGraph();

    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, null, { kind: "node", id: "a1" }, { additive: true }),
      {
        kind: "select",
        selection: { kind: "nodes", ids: ["a1"] },
        relationFocusNodeId: "a1"
      }
    );
    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "node", id: "a2" }, { additive: true }),
      {
        kind: "select",
        selection: { kind: "nodes", ids: ["a1", "a2"] },
        relationFocusNodeId: "a2"
      }
    );
    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "nodes", ids: ["a1", "a2"] }, { kind: "node", id: "a1" }, { additive: true }),
      {
        kind: "select",
        selection: { kind: "nodes", ids: ["a2"] },
        relationFocusNodeId: "a1"
      }
    );
    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "node", id: "a2" }, { additive: false }),
      {
        kind: "open-node",
        nodeId: "a2",
        selection: { kind: "node", id: "a2" }
      }
    );
  });

  it("keeps Sigma edge hits as relation previews instead of selections", () => {
    const data = sigmaHitGraph();

    assert.equal(selectionInputForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "edge", id: "a1-a2" }, { additive: false }), null);
    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "edge", id: "a1-a2" }, { additive: false }),
      { kind: "edge-preview", edgeId: "a1-a2" }
    );
  });

  it("treats Sigma community-reading background hits as a clear action", () => {
    const data = sigmaHitGraph();

    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "graph-blank" }, { additive: false }),
      { kind: "clear" }
    );
    assert.deepEqual(
      sigmaCommunityReadingHitActionForSigmaHit(data, { kind: "node", id: "a1" }, { kind: "community-wash", id: "alpha" }, { additive: false }),
      { kind: "clear" }
    );
  });

  it("returns global source-community node summaries to the community summary before clearing the highlight", () => {
    const data = sigmaHitGraph();

    assert.deepEqual(
      sigmaGlobalHitActionForSigmaHit(data, { kind: "node", id: "a2" }, { kind: "graph-blank" }, { additive: false }, "alpha"),
      { kind: "select", selection: { kind: "community", id: "alpha" } }
    );
    assert.deepEqual(
      sigmaGlobalHitActionForSigmaHit(data, { kind: "community", id: "alpha" }, { kind: "graph-blank" }, { additive: false }, "alpha"),
      { kind: "clear", resetCamera: true }
    );
  });

  it("keeps source-community node hits as single-node drilldown even when additive selection is pressed", () => {
    const data = sigmaHitGraph();

    assert.deepEqual(
      sigmaGlobalHitActionForSigmaHit(data, { kind: "community", id: "alpha" }, { kind: "node", id: "a2" }, { additive: true }, "alpha"),
      { kind: "select", selection: { kind: "node", id: "a2" } }
    );
    assert.deepEqual(
      sigmaGlobalHitActionForSigmaHit(data, { kind: "node", id: "a2" }, { kind: "node", id: "b1" }, { additive: true }, "alpha"),
      { kind: "select", selection: { kind: "node", id: "b1" } }
    );
  });
});

function sigmaHitGraph(): GraphData {
  return {
    meta: { build_date: "2026-06-12", wiki_title: "Sigma hit graph", total_nodes: 4, total_edges: 0 },
    nodes: [
      { id: "a1", label: "Alpha 1", type: "topic", community: "alpha", source_path: "wiki/a1.md" },
      { id: "a2", label: "Alpha 2", type: "entity", community: "alpha", source_path: "wiki/a2.md" },
      { id: "a3", label: "Alpha 3", type: "entity", community: "alpha", source_path: "wiki/a3.md" },
      { id: "b1", label: "Beta 1", type: "entity", community: "beta", source_path: "wiki/b1.md" }
    ],
    edges: []
  };
}

function twoCommunityGraph(): GraphData {
  return {
    meta: { build_date: "2026-07-03", wiki_title: "Two community graph", total_nodes: 3, total_edges: 1 },
    nodes: [
      { id: "a", label: "Alpha", type: "topic", community: "c1", source_path: "wiki/a.md", content: "a" },
      { id: "b", label: "Beta", type: "source", community: "c1", source_path: "wiki/b.md", content: "b" },
      { id: "c", label: "Gamma", type: "entity", community: "c2", source_path: "wiki/c.md", content: "c" }
    ],
    edges: [
      { id: "a->b", from: "a", to: "b", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "a", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["a", "b", "c"], degraded: false }
      },
      communities: [
        { id: "c1", label: "C1", node_count: 2, color_index: 0 },
        { id: "c2", label: "C2", node_count: 1, color_index: 1 }
      ]
    }
  };
}

function singleCommunityData(): GraphData {
  const graph = twoCommunityGraph();
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.community === "c1"),
    learning: graph.learning
      ? {
        ...graph.learning,
        communities: (graph.learning.communities ?? []).filter((community) => community.id === "c1")
      }
      : graph.learning
  };
}

function twoCommunityState(): GraphFacadeState {
  return {
    data: twoCommunityGraph(),
    pins: {},
    theme: "shan-shui",
    focus: null,
    typeFilters: {},
    aggregationMarkers: [],
    selection: null,
    searchResultIds: [],
    temporaryObject: null
  };
}

function sourceContextManager(
  state: GraphFacadeState,
  sigmaInputs: GraphFacadeRouteRendererFactoryInput[],
  communityInputs: GraphFacadeRouteRendererFactoryInput[] = []
): GraphFacadeRouteManager {
  const container = { dataset: {} as Record<string, string | undefined> };
  return createGraphFacadeRouteManager(container as unknown as HTMLElement, {
    state,
    callbacks: {},
    factories: {
      createSigmaGlobal: (input) => {
        sigmaInputs.push(input);
        return createFakeRenderer();
      },
      createDomSvgCommunity: (input) => {
        communityInputs.push(input);
        return createFakeRenderer();
      },
      createDomSvgSmallFallback: () => createFakeRenderer(),
      createOverLimitNotice: () => createFakeRenderer()
    }
  });
}

function createFakeRenderer(): GraphFacadeRenderer & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async applyDiff(diff, options) {
      calls.push(["applyDiff", diff, options]);
    },
    isDragging() {
      calls.push(["isDragging"]);
      return false;
    },
    setData(data: GraphData, pins?: PinMap) {
      calls.push(["setData", data, pins]);
    },
    setEdgeStyle(style) {
      calls.push(["setEdgeStyle", style]);
    },
    setAggregationMarkers(markers) {
      calls.push(["setAggregationMarkers", markers]);
    },
    focusNode(path: string) {
      calls.push(["focusNode", path]);
    },
    focusCommunity(id: string) {
      calls.push(["focusCommunity", id]);
    },
    accommodateNodeDrawer(nodeId: string, options?: { durationMs?: number }) {
      calls.push(options === undefined ? ["accommodateNodeDrawer", nodeId] : ["accommodateNodeDrawer", nodeId, options]);
    },
    setSourceCommunityContext(id: string | null) {
      calls.push(["setSourceCommunityContext", id]);
    },
    previewNode(id: string | null) {
      calls.push(["previewNode", id]);
    },
    setTypeFilters(filters: GraphTypeFilters) {
      calls.push(["setTypeFilters", filters]);
    },
    showTemporaryObject(object) {
      calls.push(["showTemporaryObject", object]);
    },
    clearTemporaryObjectDisplay() {
      calls.push(["clearTemporaryObjectDisplay"]);
    },
    resetView(options?: unknown) {
      calls.push(options === undefined ? ["resetView"] : ["resetView", options]);
    },
    select(selection: SelectionInput) {
      calls.push(["select", selection]);
    },
    clearSelection() {
      calls.push(["clearSelection"]);
    },
    clearInteraction() {
      calls.push(["clearInteraction"]);
    },
    setNodeFixed(id: string, mode: "fix" | "unfix") {
      calls.push(["setNodeFixed", id, mode]);
      return true;
    },
    setTheme(theme: ThemeId) {
      calls.push(["setTheme", theme]);
    },
    setPins(pins: PinMap) {
      calls.push(["setPins", pins]);
    },
    resetLayout() {
      calls.push(["resetLayout"]);
    },
    destroy() {
      calls.push(["destroy"]);
    }
  };
}

function trackRenderer(
  renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }>,
  route: string
): GraphFacadeRenderer & { calls: unknown[][] } {
  const renderer = createFakeRenderer();
  renderer.calls.push(["create", route]);
  renderers.push(renderer);
  return renderer;
}

function assertActiveRendererCount(renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }>, expected: number): void {
  const activeCount = renderers.filter((renderer) => !renderer.calls.some((call) => call[0] === "destroy")).length;
  assert.equal(activeCount, expected);
}

function createRouteMarkerHarness(): {
  container: { dataset: Record<string, string | undefined> };
  manager: GraphFacadeRenderer & {
    readonly routeId: string;
    readonly sigmaKnownUnavailable: boolean;
    readonly sigmaAttemptCount: number;
    retrySigma(): void;
  };
  sigmaInputs: GraphFacadeRouteRendererFactoryInput[];
  expect(routeId: string, transition?: string): void;
  expectActiveRendererCount(expected: number): void;
  expectDestroyed(): void;
  expectTransitionCleared(): Promise<void>;
} {
  const container = { dataset: {} as Record<string, string | undefined> };
  const renderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
  const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
  const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
    state: {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    },
    factories: {
      createSigmaGlobal: (input) => {
        sigmaInputs.push(input);
        return trackRenderer(renderers, "sigma");
      },
      createDomSvgCommunity: () => trackRenderer(renderers, "community"),
      createDomSvgSmallFallback: () => trackRenderer(renderers, "fallback"),
      createOverLimitNotice: () => trackRenderer(renderers, "over-limit")
    }
  });

  return {
    container,
    manager,
    sigmaInputs,
    expect(routeId, transition) {
      assert.equal(container.dataset.llmWikiGraphRoute, routeId);
      assert.equal(container.dataset.llmWikiGraphRouteTransition, transition);
    },
    expectActiveRendererCount(expected) {
      assertActiveRendererCount(renderers, expected);
    },
    expectDestroyed() {
      assert.equal(container.dataset.llmWikiGraphRoute, undefined);
      assert.equal(container.dataset.llmWikiGraphRouteTransition, undefined);
    },
    expectTransitionCleared() {
      return waitForRouteTransitionClear(container);
    }
  };
}

async function waitForRouteTransitionClear(container: { dataset: Record<string, string | undefined> }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 190));
  assert.equal(container.dataset.llmWikiGraphRouteTransition, undefined);
}

function largeGraphData(nodeCount: number, edgeCount: number, communitySize: number): GraphData {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `large-${index}`,
    label: `Large ${index}`,
    type: "topic",
    community: index < communitySize ? "large-community" : `community-${index}`,
    source_path: `wiki/large/${index}.md`
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `large-edge-${index}`,
    from: nodes[index % nodes.length].id,
    to: nodes[(index + 1) % nodes.length].id,
    type: "EXTRACTED"
  }));
  return {
    meta: {
      build_date: "2026-06-19",
      wiki_title: "Large graph",
      total_nodes: nodeCount,
      total_edges: edgeCount
    },
    nodes,
    edges
  };
}
