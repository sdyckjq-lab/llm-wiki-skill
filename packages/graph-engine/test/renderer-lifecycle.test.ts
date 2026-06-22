import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphData, GraphDiff, SelectionInput } from "../src";
import { createGraphRenderer } from "../src/render";
import {
  createGraphFacadeRouteManager,
  type GraphFacadeRenderer,
  type GraphFacadeRouteRendererFactoryInput
} from "../src/facade";

describe("graph renderer lifecycle", () => {
  it("renders a static over-limit notice without aggregation containers or DOM full graph", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    let sigmaAttempts = 0;
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        data: largeFallbackGraphData(),
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
        createSigmaGlobal: () => {
          sigmaAttempts += 1;
          throw new Error("WebGL unavailable");
        }
      }
    });
    const overLimitView = findByClass(container, "graph-over-limit-notice-view")[0];
    const notice = findByClass(container, "graph-over-limit-notice")[0];
    const title = findByClass(container, "graph-over-limit-notice-title")[0];
    const body = findByClass(container, "graph-over-limit-notice-body")[0];
    const oldContainers = findByClass(container, "graph-aggregation-safety-container");
    const oldActions = findByClass(container, "graph-aggregation-safety-actions");
    const retry = findByDataset(container, "action", "retry-sigma");
    const clear = findByDataset(container, "action", "clear-selection");

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(overLimitView?.dataset.notice, "node-count-over-limit");
    assert.equal(overLimitView?.dataset.nodeLimit, "2000");
    assert.equal(overLimitView?.dataset.containerCount, "0");
    assert.equal(notice?.dataset.role, "over-limit-notice");
    assert.equal(title?.textContent, "图谱节点较多");
    assert.equal(body?.textContent, "当前图谱超过 2000 个节点。请用搜索、筛选或进入社区缩小范围。");
    assert.deepEqual(oldContainers, []);
    assert.deepEqual(oldActions, []);
    assert.equal(retry, undefined);
    assert.equal(clear, undefined);
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), []);
    assert.equal(sigmaAttempts, 0);
  });

  it("routes a community click to lightweight selection instead of focusing the community", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const selections: SelectionInput[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataWithCommunities([
        ["a", "community-a"],
        ["b", "community-b"]
      ]),
      theme: "shan-shui",
      live: false,
      onSelectionInput: (selection) => selections.push(selection)
    });

    findByDataset(renderer.root as unknown as FakeElement, "communityId", "community-a")?.dispatch("click");

    assert.deepEqual(selections, [{ kind: "community", id: "community-a" }]);
    assert.ok(nodeElement(renderer, "a"));
    assert.ok(nodeElement(renderer, "b"));

    renderer.destroy();
  });

  it("does not render aggregation marker containers in normal DOM/SVG output", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const selections: SelectionInput[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataWithCommunities([
        ["a", "community-a"],
        ["b", "community-a"],
        ["c", "community-b"]
      ]),
      theme: "shan-shui",
      live: false,
      aggregationMarkers: [
        {
          id: "agg-community-a",
          label: "Community A overflow",
          communityId: "community-a",
          nodeIds: ["a", "b"],
          selectedNodeIds: ["a"],
          searchResultIds: ["b"],
          totalCount: 6
        }
      ],
      onSelectionInput: (selection) => selections.push(selection)
    });
    const aggregation = findByDataset(renderer.root as unknown as FakeElement, "aggregationId", "agg-community-a");

    assert.equal(aggregation, undefined);
    assert.deepEqual(selections, []);
    assert.deepEqual(visibleNodeIds(renderer), ["a", "b", "c"]);
    assert.equal(renderer.root.dataset.llmWikiGraphFocus, undefined);

    renderer.destroy();
  });

  it("renders poor community quality as a light warning with only core connectivity fallback", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: poorCommunityQualityGraphData(),
      theme: "shan-shui",
      live: false
    });
    const notice = findByClass(renderer.root as unknown as FakeElement, "graph-quality-notice")[0];
    const action = findByClass(renderer.root as unknown as FakeElement, "graph-quality-notice-action")[0];
    const wash = findByClass(renderer.root as unknown as FakeElement, "community-wash")[0];

    assert.equal(renderer.root.dataset.communityQuality, "poor");
    assert.equal(renderer.root.dataset.communityBoundaryCertainty, "low");
    assert.equal(renderer.root.dataset.communityAuxiliaryViews, "core-structure-connectivity");
    assert.ok(notice);
    assert.equal(notice.dataset.qualityLevel, "poor");
    assert.equal(action?.dataset.auxiliaryViewId, "core-structure-connectivity");
    assert.equal(/type|source|time/i.test(renderer.root.dataset.communityAuxiliaryViews || ""), false);
    assert.equal(wash?.dataset.boundaryCertainty, "low");

    renderer.destroy();
  });

  it("routes a global node click to lightweight selection instead of opening the page", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const opened: string[] = [];
    const selections: SelectionInput[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphData(["a"]),
      theme: "shan-shui",
      live: false,
      onNodeOpen: (id) => opened.push(id),
      onSelectionInput: (selection) => selections.push(selection)
    });

    nodeElement(renderer, "a")?.dispatch("click", { detail: 0 });

    assert.deepEqual(opened, []);
    assert.deepEqual(selections, [{ kind: "node", id: "a" }]);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");

	  renderer.destroy();
	});

	it("preserves DOM community selection when refreshed data still contains the selected object", () => {
	  const ownerDocument = new FakeDocument();
	  const container = ownerDocument.createElement("div");
	  const clearRequests: number[] = [];
	  const selections: SelectionInput[] = [];
	  const renderer = createGraphRenderer(container as unknown as HTMLElement, {
	    data: graphDataWithCommunities([
	      ["a", "community-a"],
	      ["b", "community-a"],
	      ["c", "community-b"]
	    ]),
	    theme: "shan-shui",
	    live: false,
	    focus: { kind: "community", id: "community-a" },
	    onSelectionInput: (selection) => selections.push(selection),
	    onSelectionClearRequested: () => clearRequests.push(1)
	  });

	  renderer.select({ kind: "node", id: "a" });
	  assert.deepEqual(selections, []);
	  assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");

	  renderer.setData(graphDataWithCommunities([
	    ["a", "community-a"],
	    ["b", "community-a"],
	    ["d", "community-b"]
	  ]));

	  assert.deepEqual(clearRequests, []);
	  assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");
	  assert.ok(nodeElement(renderer, "b"));
	  assert.equal(nodeElement(renderer, "c"), undefined);

	  renderer.destroy();
	});

	it("clears selection on a blank click without leaving community focus", () => {
	  const ownerDocument = new FakeDocument();
	  const container = ownerDocument.createElement("div");
    const clearRequests: number[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataWithCommunities([
        ["a", "community-a"],
        ["b", "community-a"],
        ["c", "community-b"]
      ]),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" },
      onSelectionClearRequested: () => clearRequests.push(1)
    });

    renderer.select({ kind: "node", id: "a" });
    dispatchPointerSequence(renderer.root as unknown as FakeElement, 20, 20);

    assert.equal(clearRequests.length, 1);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "false");
    assert.ok(nodeElement(renderer, "a"));
    assert.ok(nodeElement(renderer, "b"));
    assert.equal(nodeElement(renderer, "c"), undefined);

    renderer.destroy();
  });

  it("keeps node double click from silently unpinning or changing focus", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const pinsChanged: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataWithCommunities([
        ["a", "community-a"],
        ["b", "community-a"],
        ["c", "community-b"]
      ]),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" },
      onPinsChanged: (pins) => pinsChanged.push(pins)
    });

    nodeElement(renderer, "a")?.dispatch("dblclick");

    assert.deepEqual(pinsChanged, []);
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");
    assert.ok(nodeElement(renderer, "a"));
    assert.ok(nodeElement(renderer, "b"));
    assert.equal(nodeElement(renderer, "c"), undefined);

    renderer.destroy();
  });

  it("fixes and unfixes node position only through the explicit renderer action", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const pinsChanged: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphData(["a"]),
      theme: "shan-shui",
      live: false,
      onPinsChanged: (pins) => pinsChanged.push(pins)
    });

    assert.equal(renderer.setNodeFixed("a", "fix"), true);
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");
    assert.deepEqual(Object.keys(pinsChanged.at(-1) as Record<string, unknown>), ["wiki/a.md"]);

    assert.equal(renderer.setNodeFixed("a", "unfix"), true);
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "false");
    assert.deepEqual(pinsChanged.at(-1), {});

    renderer.destroy();
  });

  it("returns global while preserving selection, search, filters, and fixed positions", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const clearRequests: number[] = [];
    const viewResets: number[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" },
      typeFilters: { entity: true, source: true },
      onSelectionClearRequested: () => clearRequests.push(1),
      onViewReset: () => viewResets.push(1)
    });

    renderer.setTypeFilters({ entity: true, source: false });
    renderer.select({ kind: "node", id: "a" });
    const searchInput = findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0];
    searchInput.value = "Node a";
    searchInput.dispatch("input");

    assert.deepEqual(visibleNodeIds(renderer), ["a", "b"]);
    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "hidden");

    renderer.resetView();
    await waitForInteractionSettle();

    assert.deepEqual(viewResets, [1]);
    assert.deepEqual(clearRequests, []);
    assert.deepEqual(visibleNodeIds(renderer), ["a", "b", "c"]);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");
    assert.equal(nodeElement(renderer, "c")?.getAttribute("aria-pressed"), "false");
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");
    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "hidden");
    assert.equal(findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0]?.value, "Node a");
    assert.equal(nodeElement(renderer, "a")?.dataset.searchState, "match");
    assert.equal(nodeElement(renderer, "c")?.dataset.searchState, "faded");

    renderer.destroy();
  });

  it("routes the community toolbar return through Sigma global without rendering DOM full graph", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const viewResets: number[] = [];
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        data: graphDataForReturnGlobal(),
        pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
        theme: "shan-shui",
        focus: null,
        typeFilters: { entity: true, source: true },
        aggregationMarkers: [],
        selection: null,
        searchResultIds: [],
        temporaryObject: null
      },
      callbacks: {
        onViewReset: () => viewResets.push(1)
      },
      factories: {
        createSigmaGlobal: (input) => {
          sigmaInputs.push(input);
          return createSigmaShellRenderer(input);
        }
      }
    });

    manager.focusCommunity("community-a");
    manager.setTypeFilters({ entity: true, source: false });
    manager.select({ kind: "node", id: "a" });
    manager.setPins({ "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } });
    const searchInput = findByClass(container, "graph-search-input")[0];
    searchInput.value = "Node a";
    searchInput.dispatch("input");

    assert.equal(manager.routeId, "dom-svg-community");
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), ["a", "b"]);
    assert.equal(nodeElement({ root: container as unknown as HTMLElement }, "b")?.dataset.filterState, "hidden");

    findByText(container, "回全图")?.dispatch("click");

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(findByClass(container, "sigma-global-route").length, 1);
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), []);
    assert.equal(sigmaInputs.at(-1)?.options.focus, null);
    const activeSigmaShell = findByClass(container, "sigma-global-route")[0];
    assert.equal(activeSigmaShell?.dataset.selectedKind, "node");
    assert.equal(activeSigmaShell?.dataset.selectedId, "a");
    assert.equal(activeSigmaShell?.dataset.searchResultIds, "a");
    assert.equal(activeSigmaShell?.dataset.typeFilters, "entity:true,source:false");
    assert.equal(activeSigmaShell?.dataset.pinnedPaths, "wiki/a.md");
    assert.deepEqual(sigmaInputs.at(-1)?.options.selection, { kind: "node", id: "a" });
    assert.deepEqual(sigmaInputs.at(-1)?.options.searchResultIds, ["a"]);
    assert.deepEqual(sigmaInputs.at(-1)?.options.typeFilters, { entity: true, source: false });
    assert.deepEqual(Object.keys(sigmaInputs.at(-1)?.options.pins || {}), ["wiki/a.md"]);
    assert.deepEqual(viewResets, [1]);

    manager.destroy();
  });

  it("keeps DOM/SVG small fallback on the same lightweight global interaction rules", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const selections: SelectionInput[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        data: graphDataForReturnGlobal(),
        pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
        theme: "shan-shui",
        focus: null,
        typeFilters: { entity: true, source: true },
        aggregationMarkers: [],
        selection: null,
        searchQuery: "Node a",
        searchResultIds: ["a"],
        temporaryObject: null
      },
      callbacks: {
        onSelectionInput: (selection) => selections.push(selection)
      },
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    assert.equal(findByClass(container, "graph-aggregation-safety-container").length, 0);
    assert.equal(findByClass(container, "graph-aggregation-safety-actions").length, 0);
    assert.equal(findByClass(container, "community-button").length, 0);
    assert.equal(findByClass(container, "community-wash").length > 0, true);
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), ["a", "b", "c"]);
    assert.equal(nodeElement({ root: container as unknown as HTMLElement }, "a")?.dataset.searchState, "match");
    assert.equal(nodeElement({ root: container as unknown as HTMLElement }, "a")?.dataset.pinned, "true");

    nodeElement({ root: container as unknown as HTMLElement }, "a")?.dispatch("click", { detail: 0 });
    assert.deepEqual(selections.at(-1), { kind: "node", id: "a" });
    assert.equal(manager.routeId, "dom-svg-small-fallback");

    findByDataset(container, "communityId", "community-a")?.dispatch("click");
    assert.deepEqual(selections.at(-1), { kind: "community", id: "community-a" });
    assert.equal(manager.routeId, "dom-svg-small-fallback");

    manager.focusCommunity("community-a");
    assert.equal(manager.routeId, "dom-svg-community");
    findByText(container, "回全图")?.dispatch("click");
    assert.equal(manager.routeId, "dom-svg-small-fallback");

    manager.setData(largeFallbackGraphData());
    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(findByClass(container, "graph-over-limit-notice").length, 1);
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), []);

    manager.destroy();
  });

  it("keeps reset layout separate from return global", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const viewResets: number[] = [];
    const pinsChanged: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" },
      typeFilters: { entity: true, source: true },
      onViewReset: () => viewResets.push(1),
      onPinsChanged: (pins) => pinsChanged.push(pins)
    });

    renderer.select({ kind: "node", id: "a" });
    const searchInput = findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0];
    searchInput.value = "Node a";
    searchInput.dispatch("input");

    renderer.resetLayout();
    await waitForViewportCommit();

    assert.deepEqual(viewResets, []);
    assert.deepEqual(pinsChanged.at(-1), {});
    assert.deepEqual(visibleNodeIds(renderer), ["a", "b"]);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "false");
    assert.equal(findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0]?.value, "Node a");
    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "visible");
    assert.equal(nodeElement(renderer, "c"), undefined);

    renderer.destroy();
  });

  it("returns global with a selected community still selected", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    renderer.select({ kind: "community", id: "community-a" });
    renderer.resetView();
    await waitForInteractionSettle();

    assert.deepEqual(visibleNodeIds(renderer), ["a", "b", "c"]);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");
    assert.equal(nodeElement(renderer, "b")?.getAttribute("aria-pressed"), "true");
    assert.equal(nodeElement(renderer, "c")?.getAttribute("aria-pressed"), "false");

    renderer.destroy();
  });

  it("updates toolbar panel state without repainting the graph", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphData(["a"]),
      theme: "shan-shui",
      live: false
    });

    const toolbar = findByClass(renderer.root as unknown as FakeElement, "graph-toolbar")[0];
    const filtersButton = findByText(toolbar, "筛选");
    const legendButton = findByText(toolbar, "图例");
    const panel = findByClass(toolbar, "graph-toolbar-panel")[0];
    const node = nodeElement(renderer, "a");

    filtersButton?.dispatch("click");

    assert.equal(renderer.root.dataset.toolbarPanel, "filters");
    assert.equal(toolbar.dataset.panel, "filters");
    assert.equal(panel.dataset.state, "filters");
    assert.equal(filtersButton?.dataset.active, "true");
    assert.equal(legendButton?.dataset.active, "false");
    assert.equal(findByClass(renderer.root as unknown as FakeElement, "graph-toolbar")[0], toolbar);
    assert.equal(nodeElement(renderer, "a"), node);

    renderer.destroy();
  });

  it("updates search highlights without rebuilding graph elements or moving layout", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      theme: "shan-shui",
      live: false
    });

    const node = nodeElement(renderer, "a");
    const otherNode = nodeElement(renderer, "b");
    const edge = edgeElement(renderer, "a-b");
    const contentLayer = findByClass(renderer.root as unknown as FakeElement, "graph-content-layer")[0];
    assert.ok(node);
    assert.ok(otherNode);
    assert.ok(edge);
    const nodeLeft = node.style.left;
    const nodeTop = node.style.top;
    const transform = contentLayer?.style.transform;

    const searchInput = findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0];
    searchInput.value = "Node a";
    searchInput.dispatch("input");

    assert.equal(nodeElement(renderer, "a"), node);
    assert.equal(nodeElement(renderer, "b"), otherNode);
    assert.equal(edgeElement(renderer, "a-b"), edge);
    assert.equal(node.style.left, nodeLeft);
    assert.equal(node.style.top, nodeTop);
    assert.equal(contentLayer?.style.transform, transform);
    assert.equal(node.dataset.searchState, "match");
    assert.equal(otherNode.dataset.searchState, "faded");

    renderer.destroy();
  });

  it("supports keyboard search result navigation and lightweight activation", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const selections: SelectionInput[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      theme: "shan-shui",
      live: false,
      onSelectionInput: (selection) => selections.push(selection)
    });

    const searchInput = findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0];
    searchInput.value = "Node";
    searchInput.dispatch("focus");
    searchInput.dispatch("input");

    searchInput.dispatch("keydown", { key: "ArrowDown" });
    assert.equal(nodeElement(renderer, "a")?.dataset.searchFocus, "true");
    assert.equal(findByClass(renderer.root as unknown as FakeElement, "graph-search-status")[0]?.textContent, "1/3");

    searchInput.dispatch("keydown", { key: "ArrowUp" });
    assert.equal(nodeElement(renderer, "c")?.dataset.searchFocus, "true");
    assert.equal(findByClass(renderer.root as unknown as FakeElement, "graph-search-status")[0]?.textContent, "3/3");

    searchInput.dispatch("keydown", { key: "Enter" });
    assert.deepEqual(selections.at(-1), { kind: "node", id: "c" });
    assert.equal(nodeElement(renderer, "c")?.getAttribute("aria-pressed"), "true");

    renderer.destroy();
  });

  it("applies Escape priority without clearing pins or resetting layout", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const clearRequests: number[] = [];
    const viewResets: number[] = [];
    const pinsChanged: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" },
      onSelectionClearRequested: () => clearRequests.push(1),
      onViewReset: () => viewResets.push(1),
      onPinsChanged: (pins) => pinsChanged.push(pins)
    });

    renderer.root.focus();
    assert.equal(renderer.root.tabIndex, 0);
    assert.equal(ownerDocument.activeElement, renderer.root);
    ownerDocument.dispatch("keydown", { key: "f", metaKey: true });
    assert.equal(renderer.root.dataset.searchOpen, "true");
    const searchInput = findByClass(renderer.root as unknown as FakeElement, "graph-search-input")[0];
    assert.equal(ownerDocument.activeElement, searchInput);

    ownerDocument.dispatch("keydown", { key: "Escape" });
    assert.equal(renderer.root.dataset.searchOpen, "false");
    assert.equal(ownerDocument.activeElement, renderer.root);
    assert.deepEqual(viewResets, []);
    assert.deepEqual(pinsChanged, []);
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");

    renderer.select({ kind: "node", id: "a" });
    renderer.root.focus();
    ownerDocument.dispatch("keydown", { key: "Escape" });
    assert.deepEqual(clearRequests, [1]);
    assert.deepEqual(viewResets, []);
    assert.deepEqual(visibleNodeIds(renderer), ["a", "b"]);
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "false");
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");

    ownerDocument.dispatch("keydown", { key: "Escape" });
    await waitForViewportCommit();

    assert.deepEqual(viewResets, [1]);
    assert.deepEqual(pinsChanged, []);
    assert.deepEqual(visibleNodeIds(renderer), ["a", "b", "c"]);
    assert.equal(nodeElement(renderer, "a")?.dataset.pinned, "true");

    renderer.destroy();
  });

  it("updates type filters without rebuilding graph elements or moving layout", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      theme: "shan-shui",
      live: false,
      typeFilters: { entity: true, source: true }
    });

    const entityNode = nodeElement(renderer, "a");
    const sourceNode = nodeElement(renderer, "b");
    const edge = edgeElement(renderer, "a-b");
    assert.ok(entityNode);
    assert.ok(sourceNode);
    assert.ok(edge);
    const entityLeft = entityNode.style.left;
    const entityTop = entityNode.style.top;
    const sourceLeft = sourceNode.style.left;
    const sourceTop = sourceNode.style.top;
    const edgePath = edge.getAttribute("d");

    renderer.setTypeFilters({ entity: true, source: false });

    assert.equal(nodeElement(renderer, "a"), entityNode);
    assert.equal(nodeElement(renderer, "b"), sourceNode);
    assert.equal(edgeElement(renderer, "a-b"), edge);
    assert.equal(entityNode.style.left, entityLeft);
    assert.equal(entityNode.style.top, entityTop);
    assert.equal(sourceNode.style.left, sourceLeft);
    assert.equal(sourceNode.style.top, sourceTop);
    assert.equal(edge.getAttribute("d"), edgePath);
    assert.equal(entityNode.dataset.filterState, "visible");
    assert.equal(sourceNode.dataset.filterState, "hidden");
    assert.equal(edge.dataset.filterState, "hidden");

    renderer.setTypeFilters({ entity: true, source: true });

    assert.equal(nodeElement(renderer, "a"), entityNode);
    assert.equal(nodeElement(renderer, "b"), sourceNode);
    assert.equal(edgeElement(renderer, "a-b"), edge);
    assert.equal(entityNode.dataset.filterState, "visible");
    assert.equal(sourceNode.dataset.filterState, "visible");
    assert.equal(edge.dataset.filterState, "visible");

    renderer.destroy();
  });

  it("temporarily reveals a filtered selected node with one-hop context without clearing filters", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const visibilityStates: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphDataForReturnGlobal(),
      theme: "shan-shui",
      live: false,
      typeFilters: { entity: true, source: true },
      onVisibilityStateChange: (state) => visibilityStates.push(state)
    });

    renderer.setTypeFilters({ entity: true, source: false });

    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "hidden");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.filterState, "hidden");

    renderer.showTemporaryObject({ kind: "node", nodeId: "b" });

    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "visible");
    assert.equal(nodeElement(renderer, "a")?.dataset.filterState, "visible");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.filterState, "visible");
    assert.equal(renderer.root.dataset.typeFiltersActive, "true");
    const temporaryState = visibilityStates.find((state) =>
      JSON.stringify((state as { temporaryObject: unknown }).temporaryObject) === JSON.stringify({ kind: "node", nodeId: "b" })
    ) as { temporaryObject: unknown; typeFilters: Record<string, boolean> } | undefined;
    assert.ok(temporaryState);
    assert.equal(temporaryState.typeFilters.source, false);

    renderer.clearTemporaryObjectDisplay();

    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "hidden");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.filterState, "hidden");
    assert.equal(renderer.root.dataset.typeFiltersActive, "true");
    assert.equal((visibilityStates.at(-1) as { temporaryObject: unknown } | undefined)?.temporaryObject, null);

    renderer.destroy();
  });

  it("degrades interaction detail during lightweight viewport changes and restores after settle", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: connectedGraphData(["a", "b", "c"]),
      theme: "shan-shui",
      live: false
    });

    const nodeBefore = nodeElement(renderer, "a");
    const edgeBefore = edgeElement(renderer, "a-b");
    assert.equal(renderer.root.dataset.interactionMode, "idle");

    const root = renderer.root as unknown as FakeElement;
    root.dispatch("pointerdown", { pointerId: 1, clientX: 60, clientY: 80 });
    root.dispatch("pointermove", { pointerId: 1, clientX: 120, clientY: 120 });

    assert.equal(renderer.root.dataset.interactionMode, "active");
    assert.equal(nodeElement(renderer, "a"), nodeBefore);
    assert.equal(edgeElement(renderer, "a-b"), edgeBefore);
    assert.ok(Number(renderer.root.dataset.interactionUpdatedObjects || "0") <= Number(renderer.root.dataset.interactionMaxUpdates || "0"));
    assert.equal(nodeBefore?.dataset.coreAnchor, "true");
    assert.equal(nodeBefore?.dataset.traceable, "true");

    await waitForInteractionSettle();
    assert.equal(renderer.root.dataset.interactionMode, "idle");
    assert.equal(nodeElement(renderer, "a"), nodeBefore);
    assert.equal(edgeElement(renderer, "a-b"), edgeBefore);

    renderer.destroy();
  });

  it("does not let stale diff settlement mutate a refreshed graph", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: graphData(["a"]),
      theme: "shan-shui",
      live: false
    });

    const staleDiff = renderer.applyDiff(diff({ addedNodes: ["a"], nodeCount: 1 }), { durationMs: 420 });
    assert.equal(renderer.root.dataset.diffState, "playing");
    assert.equal(nodeElement(renderer, "a")?.classList.contains("is-diff-added"), true);

    renderer.setData(graphData(["b"]));
    assert.equal(renderer.root.dataset.diffState, undefined);
    assert.equal(nodeElement(renderer, "a"), undefined);

    const currentDiff = renderer.applyDiff(diff({ addedNodes: ["b"], nodeCount: 1 }), { durationMs: 420 });
    assert.equal(renderer.root.dataset.diffState, "playing");
    assert.equal(nodeElement(renderer, "b")?.classList.contains("is-diff-added"), true);

    await staleDiff;
    assert.equal(renderer.root.dataset.diffState, "playing");
    assert.equal(nodeElement(renderer, "b")?.classList.contains("is-diff-added"), true);

    await currentDiff;
    assert.equal(renderer.root.dataset.diffState, "settled");
    assert.equal(nodeElement(renderer, "b")?.classList.contains("is-diff-added"), false);

    renderer.destroy();
  });
});

function graphData(ids: string[]): GraphData {
  return graphDataWithCommunities(ids.map((id) => [id, "community-a"]));
}

function connectedGraphData(ids: string[]): GraphData {
  const data = graphData(ids);
  data.meta.total_edges = Math.max(0, ids.length - 1);
  data.edges = ids.slice(1).map((id, index) => ({
    id: `${ids[index]}-${id}`,
    from: ids[index],
    to: id,
    type: "EXTRACTED"
  }));
  return data;
}

function graphDataWithCommunities(entries: Array<[string, string]>): GraphData {
  return {
    meta: {
      build_date: "2026-06-17",
      wiki_title: "Lifecycle graph",
      total_nodes: entries.length,
      total_edges: 0
    },
    nodes: entries.map(([id, community]) => ({
      id,
      label: `Node ${id}`,
      type: "topic",
      community,
      source_path: `wiki/${id}.md`,
      content: `Node ${id}`
    })),
    edges: []
  };
}

function poorCommunityQualityGraphData(): GraphData {
  const nodes = Array.from({ length: 90 }, (_, index) => ({
    id: `poor-${index}`,
    label: `Poor node ${index}`,
    type: "entity",
    community: "community",
    source_path: `wiki/poor/${index}.md`,
    content: `Poor node ${index}`
  }));
  return {
    meta: {
      build_date: "2026-06-17",
      wiki_title: "Poor community quality",
      total_nodes: nodes.length,
      total_edges: 0
    },
    nodes,
    edges: [],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "poor-0", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: true, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [
        { id: "community", label: "community", node_count: nodes.length, is_weak: true }
      ]
    }
  };
}

function graphDataForReturnGlobal(): GraphData {
  return {
    meta: {
      build_date: "2026-06-17",
      wiki_title: "Return global graph",
      total_nodes: 3,
      total_edges: 1
    },
    nodes: [
      { id: "a", label: "Node a", type: "entity", community: "community-a", source_path: "wiki/a.md", content: "Node a detail" },
      { id: "b", label: "Node b", type: "source", community: "community-a", source_path: "wiki/b.md", content: "Node b detail" },
      { id: "c", label: "Node c", type: "entity", community: "community-b", source_path: "wiki/c.md", content: "Node c detail" }
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED" }
    ]
  };
}

function largeFallbackGraphData(): GraphData {
  const nodes = Array.from({ length: 2101 }, (_, index) => ({
    id: `large-${index}`,
    label: `Large ${index}`,
    type: "topic",
    community: index < 600 ? "large-community" : `community-${index}`,
    source_path: `wiki/large/${index}.md`,
    content: `Large ${index}`
  }));
  const edges = Array.from({ length: 4101 }, (_, index) => ({
    id: `large-edge-${index}`,
    from: nodes[index % nodes.length].id,
    to: nodes[(index + 1) % nodes.length].id,
    type: "EXTRACTED"
  }));
  return {
    meta: {
      build_date: "2026-06-19",
      wiki_title: "Large fallback graph",
      total_nodes: nodes.length,
      total_edges: edges.length
    },
    nodes,
    edges
  };
}

function createSigmaShellRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route";
  shell.dataset.route = "sigma-global";
  input.container.append(shell);
  let options = input.options;
  renderSigmaShellState();

  return {
    applyDiff() {
      return Promise.resolve();
    },
    isDragging() {
      return false;
    },
    setData(data, pins) {
      options = { ...options, data, pins: pins || options.pins };
      renderSigmaShellState();
    },
    setAggregationMarkers(markers) {
      options = { ...options, aggregationMarkers: markers };
      renderSigmaShellState();
    },
    focusNode(path) {
      const node = options.data.nodes.find((item) => item.id === path || item.source_path === path);
      options = { ...options, selection: node ? { kind: "node", id: node.id } : options.selection };
      renderSigmaShellState();
    },
    focusCommunity() {},
    setTypeFilters(filters) {
      options = { ...options, typeFilters: filters };
      renderSigmaShellState();
    },
    showTemporaryObject(object) {
      options = { ...options, temporaryObject: object };
      renderSigmaShellState();
    },
    clearTemporaryObjectDisplay() {
      options = { ...options, temporaryObject: null };
      renderSigmaShellState();
    },
    resetView() {
      options = { ...options, focus: null, selection: null };
      renderSigmaShellState();
    },
    select(selection) {
      options = { ...options, selection };
      renderSigmaShellState();
    },
    previewNode() {},
    clearSelection() {
      options = { ...options, selection: null };
      renderSigmaShellState();
    },
    clearInteraction() {
      options = { ...options, focus: null, selection: null, temporaryObject: null };
      renderSigmaShellState();
    },
    setNodeFixed() {
      return false;
    },
    setTheme(theme) {
      options = { ...options, theme };
      renderSigmaShellState();
    },
    setPins(pins) {
      options = { ...options, pins };
      renderSigmaShellState();
    },
    resetLayout() {},
    destroy() {
      shell.remove();
    }
  };

  function renderSigmaShellState(): void {
    const selection = options.selection;
    shell.dataset.focus = options.focus ? JSON.stringify(options.focus) : "";
    shell.dataset.selectedKind = selection?.kind || "";
    shell.dataset.selectedId = selection && "id" in selection ? selection.id : "";
    shell.dataset.searchResultIds = options.searchResultIds.join(",");
    shell.dataset.typeFilters = Object.entries(options.typeFilters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, enabled]) => `${type}:${enabled}`)
      .join(",");
    shell.dataset.pinnedPaths = Object.keys(options.pins).sort().join(",");
  }
}

function visibleNodeIds(renderer: { root: HTMLElement }): string[] {
  return collectNodes(renderer.root as unknown as FakeElement).map((node) => node.dataset.id || "").sort();
}

function collectNodes(root: FakeElement): FakeElement[] {
  const matches: FakeElement[] = [];
  if (root.classList.contains("node")) matches.push(root);
  for (const child of root.children) matches.push(...collectNodes(child));
  return matches;
}

async function waitForViewportCommit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 24));
}

async function waitForInteractionSettle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 240));
}

function diff(overrides: Partial<GraphDiff> & { nodeCount: number }): GraphDiff {
  return {
    addedNodes: overrides.addedNodes || [],
    removedNodes: overrides.removedNodes || [],
    recoloredNodes: overrides.recoloredNodes || [],
    addedEdges: overrides.addedEdges || [],
    removedEdges: overrides.removedEdges || [],
    newCommunities: overrides.newCommunities || [],
    stats: {
      nodeCount: overrides.nodeCount,
      edgeCount: 0,
      communityCount: 1
    }
  };
}

function nodeElement(renderer: { root: HTMLElement }, id: string): FakeElement | undefined {
  return findByDataset(renderer.root as unknown as FakeElement, "id", id);
}

function edgeElement(renderer: { root: HTMLElement }, id: string): FakeElement | undefined {
  return findByDataset(renderer.root as unknown as FakeElement, "edgeId", id);
}

function findByDataset(root: FakeElement, key: string, value: string): FakeElement | undefined {
  if (root.dataset[key] === value) return root;
  for (const child of root.children) {
    const match = findByDataset(child, key, value);
    if (match) return match;
  }
  return undefined;
}

class FakeDocument {
  readonly head = new FakeElement("head", this);
  activeElement: FakeElement | null = null;
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  readonly defaultView = {
    localStorage: null,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0) as unknown as number
  };

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  getElementById(id: string): FakeElement | null {
    return findById(this.head, id) || null;
  }

  addEventListener(type: string, listener: unknown): void {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: unknown): void {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, { ...init, target: init.target || this.activeElement });
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  readonly dataset: Record<string, string | undefined> = {};
  readonly style = new FakeStyle();
  readonly classList = new FakeClassList(this);
  ownerDocument: FakeDocument;
  parentElement: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  title = "";
  href = "";
  innerHTML = "";
  checked = false;
  value = "";
  tabIndex = -1;
  scrollLeft = 0;
  scrollTop = 0;
  id = "";
  private capturedPointerId: number | null = null;

  constructor(readonly tagName: string, ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  append(...children: Array<FakeElement | string>): void {
    for (const child of children) {
      if (typeof child === "string") {
        this.textContent += child;
      } else {
        this.appendChild(child);
      }
    }
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child: FakeElement): void {
    child.parentElement = this;
    this.children.unshift(child);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0);
    for (const child of children) this.appendChild(child);
  }

  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  contains(candidate: FakeElement): boolean {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
    else if (name === "href") this.href = value;
    else if (name === "id") this.id = value;
    else if (name.startsWith("data-")) this.dataset[dataKey(name)] = value;
    else (this as unknown as Record<string, string>)[name] = value;
  }

  getAttribute(name: string): string | null {
    if (name === "class") return this.className;
    if (name === "href") return this.href || null;
    if (name === "id") return this.id || null;
    if (name.startsWith("data-")) return this.dataset[dataKey(name)] || null;
    const value = (this as unknown as Record<string, string>)[name];
    return value || null;
  }

  addEventListener(type: string, listener: unknown): void {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: unknown): void {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): void {
    const event = new FakeEvent(type, { ...init, target: init.target || this });
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus(_options?: unknown): void {
    this.ownerDocument.activeElement = this;
  }

  select(): void {}

  setPointerCapture(pointerId: number): void {
    this.capturedPointerId = pointerId;
  }

  releasePointerCapture(pointerId: number): void {
    if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointerId === pointerId;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 960, height: 640 };
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== ".graph-type-filter input[data-type]") return [];
    return collectElements(this).filter((element) =>
      element.tagName === "input" &&
      element.dataset.type !== undefined &&
      hasAncestorClass(element, "graph-type-filter")
    );
  }
}

class FakeEvent {
  propagationStopped = false;
  defaultPrevented = false;
  detail = 1;
  shiftKey = false;
  button = 0;
  pointerId = 1;
  clientX = 0;
  clientY = 0;
  deltaY = 0;
  deltaMode = 0;
  ctrlKey = false;
  metaKey = false;
  target: FakeElement | null = null;

  constructor(readonly type: string, init: Partial<FakeEvent> = {}) {
    Object.assign(this, init);
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeStyle {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): string {
    const value = this.values.get(name) || "";
    this.values.delete(name);
    return value;
  }

  set colorScheme(value: string) {
    this.setProperty("color-scheme", value);
  }

  set left(value: string) {
    this.setProperty("left", value);
  }

  set top(value: string) {
    this.setProperty("top", value);
  }

  set translate(value: string) {
    this.setProperty("translate", value);
  }

  set strokeWidth(value: string) {
    this.setProperty("stroke-width", value);
  }

  set opacity(value: string) {
    this.setProperty("opacity", value);
  }

  set cursor(value: string) {
    this.setProperty("cursor", value);
  }

  set background(value: string) {
    this.setProperty("background", value);
  }

  get left(): string {
    return this.values.get("left") || "";
  }

  get top(): string {
    return this.values.get("top") || "";
  }

  get transform(): string {
    return this.values.get("transform") || "";
  }

  set transform(value: string) {
    this.setProperty("transform", value);
  }

  set transformOrigin(value: string) {
    this.setProperty("transform-origin", value);
  }
}

class FakeClassList {
  constructor(private readonly element: FakeElement) {}

  add(...classNames: string[]): void {
    this.write([...this.read(), ...classNames]);
  }

  remove(...classNames: string[]): void {
    const remove = new Set(classNames);
    this.write(this.read().filter((className) => !remove.has(className)));
  }

  toggle(className: string, force?: boolean): void {
    const classNames = new Set(this.read());
    const shouldAdd = force ?? !classNames.has(className);
    if (shouldAdd) classNames.add(className);
    else classNames.delete(className);
    this.write([...classNames]);
  }

  contains(className: string): boolean {
    return this.read().includes(className);
  }

  private read(): string[] {
    return this.element.className.split(/\s+/).filter(Boolean);
  }

  private write(classNames: string[]): void {
    this.element.className = [...new Set(classNames)].join(" ");
  }
}

function findById(root: FakeElement, id: string): FakeElement | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return undefined;
}

function findByClass(root: FakeElement, className: string): FakeElement[] {
  const matches: FakeElement[] = [];
  const classes = new Set(root.className.split(/\s+/).filter(Boolean));
  if (classes.has(className)) matches.push(root);
  for (const child of root.children) matches.push(...findByClass(child, className));
  return matches;
}

function findByText(root: FakeElement, text: string): FakeElement | undefined {
  if (root.textContent === text) return root;
  for (const child of root.children) {
    const match = findByText(child, text);
    if (match) return match;
  }
  return undefined;
}

function collectElements(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => collectElements(child))];
}

function hasAncestorClass(element: FakeElement, className: string): boolean {
  let current = element.parentElement;
  while (current) {
    if (current.classList.contains(className)) return true;
    current = current.parentElement;
  }
  return false;
}

function dispatchPointerSequence(root: FakeElement, x: number, y: number): void {
  root.dispatch("pointerdown", { pointerId: 1, clientX: x, clientY: y });
  root.dispatch("pointerup", { pointerId: 1, clientX: x, clientY: y });
}

function dataKey(attribute: string): string {
  return attribute.slice("data-".length).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
