import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  GraphData,
  GraphTypeFilters,
  PinMap,
  SelectionInput,
  ThemeId
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
    const communityRenderers: Array<GraphFacadeRenderer & { calls: unknown[][] }> = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return createFakeRenderer();
        },
        createDomSvgCommunity: (input) => {
          communityInputs.push(input);
          return trackRenderer(communityRenderers, "dom-community");
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
    manager.setData(refreshedData);

    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(state.data, refreshedData);
    assert.deepEqual(state.focus, { kind: "community", id: "c1" });
    assert.deepEqual(state.selection, { kind: "node", id: "a" });
    assert.equal(state.searchQuery, "Alpha");
    assert.deepEqual(state.searchResultIds, ["a"]);
    assert.deepEqual(state.typeFilters, { topic: true, source: false });
    assert.deepEqual(state.temporaryObject, { kind: "node", nodeId: "b" });
    assert.deepEqual(state.pins, { "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" } });
    assert.deepEqual(communityInputs[0].options.selection, { kind: "node", id: "a" });
    assert.deepEqual(communityInputs[0].options.searchResultIds, ["a"]);
    assert.deepEqual(communityRenderers[0].calls.at(-1), ["setData", refreshedData, undefined]);
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
    assert.deepEqual(fallbackInputs.at(-1)?.options.selection, { kind: "community", id: "c1" });
    assert.equal(fallbackInputs.at(-1)?.options.searchQuery, "Alpha");
    assert.deepEqual(fallbackInputs.at(-1)?.options.searchResultIds, ["a"]);
    assert.deepEqual(Object.keys(fallbackInputs.at(-1)?.options.pins || {}), ["wiki/a.md"]);
    assert.deepEqual(fallbackRenderers.at(-1)?.calls.filter((call) => call[0] === "resetView"), [["resetView"]]);
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
