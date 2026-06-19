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
    let aggregationFallbackCount = 0;
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
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return trackRenderer(renderers, "aggregation-fallback");
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaInputs.length, 1);
    assert.equal(communityInputs.length, 0);
    assert.equal(smallFallbackInputs.length, 0);
    assert.equal(aggregationFallbackCount, 0);

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
    assert.equal(aggregationFallbackCount, 0);
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
    let aggregationFallbackCount = 0;
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
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(manager.sigmaAttemptCount, 1);
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackInputs.length, 1);
    assert.equal(aggregationFallbackCount, 0);

    manager.focusCommunity("c1");
    assert.equal(manager.routeId, "dom-svg-community");
    manager.resetView();

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(manager.sigmaAttemptCount, 1);
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackInputs.length, 2);
    assert.equal(aggregationFallbackCount, 0);
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
        createAggregationSafetyFallback: () => createFakeRenderer()
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

  it("re-routes known-unavailable Sigma fallback when refreshed data crosses the large-graph threshold", () => {
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
    let aggregationFallbackCount = 0;
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
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    manager.setData(largeGraphData(2101, 4101, 600));

    assert.equal(manager.routeId, "aggregation-safety-fallback");
    assert.equal(smallFallbackCount, 1);
    assert.equal(aggregationFallbackCount, 1);
  });

  it("treats stale small metadata as large when actual graph arrays exceed fallback thresholds", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const staleLargeData = largeGraphData(2101, 4101, 600);
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
    let domFallbackCount = 0;
    let aggregationFallbackCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          domFallbackCount += 1;
          return createFakeRenderer();
        },
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "aggregation-safety-fallback");
    assert.equal(domFallbackCount, 0);
    assert.equal(aggregationFallbackCount, 1);
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
        createAggregationSafetyFallback: () => createFakeRenderer()
      }
    });

    sigmaInputs[0].options.callbacks.onSelectionInput?.({ kind: "node", id: "a" });
    assert.deepEqual(state.selection, { kind: "node", id: "a" });
    assert.deepEqual(selections, [{ kind: "node", id: "a" }]);

    sigmaInputs[0].options.callbacks.onSelectionClearRequested?.();
    assert.equal(state.selection, null);
    assert.equal(state.temporaryObject, null);
  });

  it("routes known-large Sigma failures to aggregation safety fallback instead of DOM/SVG", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: largeGraphData(2101, 4101, 600),
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    let domFallbackCount = 0;
    let aggregationFallbackCount = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => {
          domFallbackCount += 1;
          return createFakeRenderer();
        },
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "aggregation-safety-fallback");
    assert.equal(domFallbackCount, 0);
    assert.equal(aggregationFallbackCount, 1);
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
    let aggregationFallbackCount = 0;
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
        createAggregationSafetyFallback: () => {
          aggregationFallbackCount += 1;
          return createFakeRenderer();
        }
      }
    });

    assert.equal(manager.routeId, "sigma-global");
    sigmaInputs[0].onSigmaUnavailable?.(new Error("canvas runtime abnormal failure"));

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(smallFallbackCount, 1);
    assert.equal(aggregationFallbackCount, 0);
    assert.equal(sigmaCreateCount, 1);

    manager.resetView();
    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(sigmaCreateCount, 1);
    assert.equal(smallFallbackCount, 1);
    assert.equal(aggregationFallbackCount, 0);

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
