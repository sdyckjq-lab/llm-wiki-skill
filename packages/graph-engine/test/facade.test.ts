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
  type GraphFacadeRenderer,
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

    engine.focusNode("wiki/a.md");
    assert.equal(container.dataset.llmWikiGraphFocus, "wiki/a.md");
    assert.deepEqual(renderer.calls.at(-1), ["focusNode", "wiki/a.md"]);

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

  it("keeps return global and reset layout as separate facade commands", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const viewResets: number[] = [];
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui",
      capabilities: {
        onViewReset: () => viewResets.push(1)
      }
    });

    engine.focusCommunity("c1");
    assert.equal(container.dataset.llmWikiGraphFocus, "community:c1");

    engine.resetLayout();
    assert.equal(container.dataset.llmWikiGraphFocus, "community:c1");
    assert.deepEqual(renderer.calls.at(-1), ["resetLayout"]);
    assert.deepEqual(viewResets, []);

    engine.resetView();
    assert.equal(container.dataset.llmWikiGraphFocus, undefined);
    assert.deepEqual(renderer.calls.at(-1), ["resetView"]);
    assert.deepEqual(viewResets, [1]);
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
    assert.deepEqual(node.commands.map((command) => command.kind), ["open-detail-read", "set-fixed-position", "enter-community"]);

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

  it("routes global Sigma to DOM/SVG community reading and back to global Sigma with facade state", () => {
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

    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(communityInputs.length, 1);
    assert.deepEqual(communityInputs[0].options.focus, { kind: "community", id: "c1" });
    assert.deepEqual(communityInputs[0].options.selection, { kind: "node", id: "a" });
    assert.deepEqual(communityInputs[0].options.typeFilters, { topic: true, source: false });
    assert.deepEqual(Object.keys(communityInputs[0].options.pins), ["wiki/b.md"]);

    communityInputs[0].options.callbacks.onVisibilityStateChange?.({
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      typeFilters: { topic: true, source: false },
      temporaryObject: null
    });
    manager.resetView();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 2);
    assert.equal(smallFallbackInputs.length, 0);
    assert.equal(overLimitNoticeCount, 0);
    assert.deepEqual(sigmaInputs[1].options.focus, null);
    assert.deepEqual(sigmaInputs[1].options.selection, { kind: "node", id: "a" });
    assert.deepEqual(sigmaInputs[1].options.searchResultIds, ["a"]);
    assert.deepEqual(sigmaInputs[1].options.typeFilters, { topic: true, source: false });
    assert.deepEqual(Object.keys(sigmaInputs[1].options.pins), ["wiki/b.md"]);
    assert.deepEqual(renderers.map((renderer) => renderer.calls.find((call) => call[0] === "destroy")?.[0]).filter(Boolean), [
      "destroy",
      "destroy"
    ]);
  });

  it("marks route continuity on the stable facade host and clears transition markers", async () => {
    const route = createRouteMarkerHarness();

    route.expect("sigma-global");
    route.expectActiveRendererCount(1);

    route.manager.focusCommunity("c1");
    route.expect("dom-svg-community", "sigma-global->dom-svg-community");
    route.expectActiveRendererCount(1);

    await route.expectTransitionCleared();

    route.manager.resetView();
    route.expect("sigma-global", "dom-svg-community->sigma-global");
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
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const viewResets: number[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onViewReset: () => viewResets.push(1)
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
    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(communityInputs.length, 1);

    (communityInputs[0].options.callbacks as { onGlobalResetRequested?: () => void }).onGlobalResetRequested?.();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 2);
    assert.equal(state.focus, null);
    assert.deepEqual(sigmaInputs[1].options.focus, null);
    assert.deepEqual(sigmaInputs[1].options.selection, { kind: "node", id: "a" });
    assert.deepEqual(sigmaInputs[1].options.searchResultIds, ["a"]);
    assert.deepEqual(sigmaInputs[1].options.typeFilters, { topic: true, source: true });
    assert.deepEqual(Object.keys(sigmaInputs[1].options.pins), ["wiki/a.md"]);
    assert.deepEqual(viewResets, [1]);
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
    setAggregationMarkers(markers) {
      calls.push(["setAggregationMarkers", markers]);
    },
    focusNode(path: string) {
      calls.push(["focusNode", path]);
    },
    focusCommunity(id: string) {
      calls.push(["focusCommunity", id]);
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
    resetView() {
      calls.push(["resetView"]);
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
