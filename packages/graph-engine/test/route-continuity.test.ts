import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  projectGraphInput,
  type GraphData,
  type GraphTypeFilters,
  type PinMap,
  type SelectionInput,
  type ThemeId
} from "../src";
import {
  createGraphFacadeFromRenderer,
  createGraphFacadeRouteManager,
  type GraphFacadeRenderer,
  type GraphFacadeRouteRendererFactoryInput,
  type GraphFacadeState
} from "../src/facade";

const DATA: GraphData = {
  meta: {
    build_date: "2026-06-16",
    wiki_title: "Route continuity test graph",
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

describe("graph route state continuity", () => {
  it("preserves selected, searched, pinned, and community state across a data refresh when objects still exist", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: false },
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    sigmaInputs[0].options.callbacks.onVisibilityStateChange?.({
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      typeFilters: { topic: true, source: false },
      temporaryObject: { kind: "node", nodeId: "b" }
    });
    manager.select({ kind: "node", id: "a" });
    manager.focusCommunity("c1");

    const refreshedData: GraphData = {
      ...DATA,
      meta: { ...DATA.meta, wiki_title: "Refreshed graph" },
      nodes: DATA.nodes.map((node) => node.id === "a" ? { ...node, label: "Alpha refreshed" } : node)
    };
    const refreshedProjection = projectGraphInput(refreshedData);
    manager.setData(refreshedProjection);

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.data, refreshedProjection.data);
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.equal(state.sourceCommunityId, "c1");
    assert.deepEqual(state.selection, { kind: "node", id: "a" });
    assert.equal(state.searchQuery, "Alpha");
    assert.deepEqual(state.searchResultIds, ["a"]);
    assert.deepEqual(state.typeFilters, { topic: true, source: false });
    assert.deepEqual(state.temporaryObject, { kind: "node", nodeId: "b" });
    assert.deepEqual(state.pins, { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } });
    assert.equal(communityInputs.length, 0);
    assert.deepEqual(sigmaInputs[0].options.selection, null);
    assert.deepEqual(sigmaRenderers[0].calls.slice(-2), [["focusCommunity", "c1"], ["setData", refreshedProjection.data, undefined]]);
  });

  it("makes a disappeared selected object explicitly unavailable after data refresh", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const renderer = createFakeRenderer();
    const engine = createGraphFacadeFromRenderer(container, renderer, {
      data: DATA,
      theme: "shan-shui",
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } }
    });

    engine.select({ kind: "node", id: "a" });
    const refreshedData: GraphData = {
      ...DATA,
      nodes: DATA.nodes.filter((node) => node.id !== "a"),
      edges: []
    };
    engine.setData(refreshedData);
    const unavailable = engine.summarizeUnavailableObject({ kind: "node", nodeId: "a" }, "missing-node");

    assert.equal(unavailable.kind, "unavailable-object");
    assert.equal(unavailable.reason, "missing-node");
    assert.deepEqual(unavailable.object, { kind: "node", nodeId: "a" });
    assert.deepEqual(unavailable.selection.input, { kind: "node", id: "a" });
    assert.deepEqual(unavailable.selection.selectedNodeIds, []);
    assert.equal(unavailable.selection.containsCurrentObject, false);
    assert.deepEqual(unavailable.pinHints, []);
  });

  it("clears focused community reading selection only when refreshed data removes or moves the node", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: false },
      aggregationMarkers: [],
      selection: null,
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      temporaryObject: null
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => createFakeRenderer(),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.select({ kind: "node", id: "a" });
    manager.setTypeFilters({ topic: false, source: true });
    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.map((node) => node.id === "a" ? { ...node, label: "Alpha refreshed" } : node)
    }));

    assert.deepEqual(state.selection, { kind: "node", id: "a" });
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });

    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.map((node) => node.id === "a" ? { ...node, community: "c2" } : node)
    }));

    assert.equal(state.selection, null);
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });

    manager.select({ kind: "node", id: "b" });
    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.filter((node) => node.id !== "b")
    }));

    assert.equal(state.selection, null);
  });

  it("returns to global and clears community-local state when refreshed data removes the focused community", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      temporaryObject: { kind: "node", nodeId: "a" }
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.select({ kind: "node", id: "a" });
    assert.equal(manager.sourceCommunityId, "c1");
    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.map((node) => ({ ...node, community: "c2" })),
      edges: []
    }));

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(state.focus, null);
    assert.equal(state.sourceCommunityId, null);
    assert.equal(state.selection, null);
    assert.equal(state.searchQuery, "");
    assert.deepEqual(state.searchResultIds, []);
    assert.deepEqual(state.temporaryObject, null);
    assert.deepEqual(state.pins, { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } });
    assert.deepEqual(
      sigmaRenderers[0].calls.filter((call) => call[0] === "clearTemporaryObjectDisplay"),
      [["clearTemporaryObjectDisplay"]]
    );
    assert.deepEqual(sigmaRenderers[0].calls.slice(-4), [
      ["setSourceCommunityContext", null],
      ["clearTemporaryObjectDisplay"],
      ["resetView"],
      ["setData", state.data, undefined]
    ]);
  });

  it("keeps dragged pins when returning global and re-entering the same community", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });
    const draggedPins: PinMap = {
      "wiki/a.md": { x: 88, y: 99, coordinateSpace: "world" },
      "wiki/b.md": { x: 188, y: 199, coordinateSpace: "world" }
    };

    manager.focusCommunity("c1");
    sigmaInputs[0].options.callbacks.onPinsChanged?.(draggedPins);
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();
    manager.focusCommunity("c1");

    assert.deepEqual(state.pins, draggedPins);
    assert.deepEqual(
      sigmaRenderers[0].calls.filter((call) => call[0] === "focusCommunity"),
      [["focusCommunity", "c1"], ["focusCommunity", "c1"]]
    );
  });

  it("keeps global community highlight until reset transition completes and then returns to ordinary global state", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.select({ kind: "community", id: "c1" });
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.equal(manager.sourceCommunityId, "c1");
    const resetCall = sigmaRenderers[0].calls.find((call) => call[0] === "resetView");
    assert.ok(resetCall, "global highlight reset should call renderer resetView");

    const resetCallbacks = resetCall[1] as { onComplete: () => void; onCancel: () => void };
    resetCallbacks.onComplete();

    assert.equal(state.selection, null);
    assert.equal(manager.sourceCommunityId, null);
  });

  it("keeps global community selection when reset transition is cancelled by a newer intent", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.select({ kind: "community", id: "c1" });
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    const resetCall = sigmaRenderers[0].calls.find((call) => call[0] === "resetView");
    assert.ok(resetCall, "global highlight reset should expose transition callbacks");
    const resetCallbacks = resetCall[1] as { onCancel?: () => void };
    resetCallbacks.onCancel?.();

    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.equal(manager.sourceCommunityId, "c1");
  });

  it("keeps public resetView community highlight until the global reset transition completes", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.select({ kind: "community", id: "c1" });
    manager.resetView();

    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.equal(manager.sourceCommunityId, "c1");
    const resetCall = sigmaRenderers[0].calls.find((call) => call[0] === "resetView");
    assert.ok(resetCall, "public reset should call renderer resetView");

    const resetCallbacks = resetCall[1] as { onComplete: () => void };
    resetCallbacks.onComplete();

    assert.equal(state.selection, null);
    assert.equal(manager.sourceCommunityId, null);
  });

  it("keeps returned source community context separate from selection after community reading returns global", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.select({ kind: "node", id: "a" });
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(state.focus, null);
    assert.equal(state.selection, null);
    assert.equal(manager.sourceCommunityId, "c1");
    assert.deepEqual(sigmaRenderers[0].calls.filter((call) => call[0] === "resetView"), [["resetView"]]);
  });

  it("clears stale temporary display state when refreshed data removes the object", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.showTemporaryObject({ kind: "node", nodeId: "b" });
    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.filter((node) => node.id !== "b"),
      edges: []
    }));

    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.equal(state.temporaryObject, null);
    assert.deepEqual(sigmaRenderers[0].calls.slice(-2), [
      ["clearTemporaryObjectDisplay"],
      ["setData", state.data, undefined]
    ]);
  });

  it("downgrades temporary aggregation state when refreshed data removes only some referenced nodes", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.showTemporaryObject({ kind: "aggregation", aggregationId: "agg", nodeIds: ["a", "b"], communityId: "c1" });
    manager.setData(projectGraphInput({
      ...DATA,
      nodes: DATA.nodes.filter((node) => node.id !== "b"),
      edges: []
    }));

    assert.deepEqual(state.temporaryObject, { kind: "aggregation", aggregationId: "agg", nodeIds: ["a"], communityId: "c1" });
    assert.deepEqual(
      sigmaRenderers[0].calls.filter((call) => call[0] === "showTemporaryObject").slice(-1),
      [["showTemporaryObject", { kind: "aggregation", aggregationId: "agg", nodeIds: ["a"], communityId: "c1" }]]
    );
  });

  it("resets all persisted pins while staying in Sigma community reading", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {
        "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" },
        "wiki/b.md": { x: 30, y: 40, coordinateSpace: "world" }
      },
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const pinsChanged: unknown[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onPinsChanged: (pins) => pinsChanged.push(pins)
      },
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    manager.resetLayout();

    assert.equal(manager.routeId, "sigma-global");
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.deepEqual(state.pins, {});
    assert.deepEqual(pinsChanged, [{}]);
    assert.deepEqual(sigmaRenderers[0].calls.slice(-2), [["focusCommunity", "c1"], ["resetLayout"]]);
  });

  it("passes shared interaction state into DOM/SVG small fallback and keeps return-global rules consistent", () => {
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } },
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: { kind: "node", id: "a" },
      searchQuery: "Alpha",
      searchResultIds: ["a"],
      temporaryObject: null
    };
    const fallbackInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const communityInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const fallbackRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgSmallFallback: (input) => {
          fallbackInputs.push(input);
          return trackRenderer(fallbackRenderers, "small-fallback");
        },
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.deepEqual(fallbackInputs[0].options.selection, { kind: "node", id: "a" });
    assert.equal(fallbackInputs[0].options.searchQuery, "Alpha");
    assert.deepEqual(fallbackInputs[0].options.searchResultIds, ["a"]);
    assert.deepEqual(Object.keys(fallbackInputs[0].options.pins), ["wiki/a.md"]);

    fallbackInputs[0].options.callbacks.onSelectionInput?.({ kind: "community", id: "c1" });
    assert.deepEqual(state.selection, { kind: "community", id: "c1" });
    assert.equal(manager.routeId, "dom-svg-small-fallback");

    manager.focusCommunity("c1");
    assert.equal(manager.routeId, "dom-svg-community");
    assert.deepEqual(communityInputs[0].options.selection, { kind: "community", id: "c1" });

    communityInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(manager.sigmaKnownUnavailable, true);
    assert.equal(state.selection, null);
    assert.deepEqual(fallbackInputs.at(-1)?.options.selection, null);
    assert.equal(fallbackInputs.at(-1)?.options.searchQuery, "");
    assert.deepEqual(fallbackInputs.at(-1)?.options.searchResultIds, []);
    assert.deepEqual(Object.keys(fallbackInputs.at(-1)?.options.pins || {}), ["wiki/a.md"]);
    assert.deepEqual(fallbackRenderers.at(-1)?.calls.filter((call) => call[0] === "resetView"), [["resetView"]]);
  });

  it("does not move the camera when growing a shift multi-selection in community reading", () => {
    // #119：Shift 多选只更新选区，不能触发相机移动 / 缩放 / 居中。
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: { topic: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: () => trackRenderer(sigmaRenderers, "sigma-global"),
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    // 进入社区阅读（这一步合理地聚焦社区，允许动相机）。
    manager.focusCommunity("c1");
    const baseline = sigmaRenderers.at(-1)?.calls.length ?? 0;

    // 模拟连续 Shift 多选：选区从单节点增长到多节点。
    manager.select({ kind: "nodes", ids: ["a"] });
    manager.select({ kind: "nodes", ids: ["a", "b"] });

    const cameraMethods = (calls: unknown[][]) =>
      calls.filter((call) => call[0] === "resetView" || call[0] === "focusNode" || call[0] === "focusCommunity");
    // 选区增长期间不应再触发任何相机方法。
    assert.deepEqual(cameraMethods(sigmaRenderers.at(-1)?.calls.slice(baseline) ?? []), []);
  });

  it("returns from community reading to global with a short transition, preserving global filters and pins", () => {
    // #121：社区阅读回全图复用 #118 共享过渡基座，但用比进入更短的退出时长；
    // 同时保护来源社区高亮、全局筛选和钉扎，不被退出动作清掉。
    const container = { dataset: {} as Record<string, string | undefined> };
    const pinned: PinMap = { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } };
    const globalFilters: GraphTypeFilters = { topic: true, source: false };
    const state: GraphFacadeState = {
      data: DATA,
      pins: pinned,
      theme: "shan-shui",
      focus: null,
      typeFilters: globalFilters,
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    // 路线连续性：focus 清空、来源社区保留、selection 不被错误扩展。
    assert.deepEqual(state.focus, null);
    assert.equal(manager.sourceCommunityId, "c1");
    assert.equal(state.selection, null);

    // 状态保护：全局筛选 + 钉扎位置不被退出动作清掉。
    assert.deepEqual(state.typeFilters, globalFilters);
    assert.deepEqual(state.pins, pinned);

    // 退出过渡：复用共享基座（resetView）。具体 Sigma 短时长在路线边界测试中验证。
    const resetCalls = sigmaRenderers[0].calls.filter((call) => call[0] === "resetView");
    assert.ok(resetCalls.length > 0, "return-to-global should call renderer resetView");
  });

  it("clears temporary display state when returning from community reading to global", () => {
    // #121：退出社区阅读时，临时展示对象属于社区本地阅读状态。外层 facade 清掉后，
    // Sigma 路由也不能通过 visibility sync 把旧对象重新发布回来。
    const container = { dataset: {} as Record<string, string | undefined> };
    const state: GraphFacadeState = {
      data: DATA,
      pins: {},
      theme: "shan-shui",
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: { kind: "node", nodeId: "a" }
    };
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const sigmaRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return trackRenderer(sigmaRenderers, "sigma-global");
        },
        createDomSvgCommunity: () => createFakeRenderer(),
        createDomSvgSmallFallback: () => createFakeRenderer(),
        createOverLimitNotice: () => createFakeRenderer()
      }
    });

    manager.focusCommunity("c1");
    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(state.focus, null);
    assert.equal(state.temporaryObject, null);
    assert.equal(manager.sourceCommunityId, "c1");
    assert.deepEqual(sigmaRenderers[0].calls.filter((call) => call[0] === "resetView").at(-1), ["resetView"]);
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
    setData(projection, pins?: PinMap) {
      calls.push(["setData", projection.data, pins]);
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
