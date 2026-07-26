import { describe, it } from "node:test";
import assert from "node:assert/strict";
import GraphologyGraph from "graphology";

import {
  createGraphEngine,
  projectGraphInput,
  type GraphData,
  type GraphDiff,
  type GraphVisibilityState,
  type SelectionInput
} from "../src";
import type {
  SigmaGlobalGraphologyGraph,
  SigmaGlobalRendererRuntime,
  SigmaGlobalSigmaLike
} from "../src/render/sigma-global-types";
import { createGraphRenderer, prepareGraphRendererAdapterData } from "../src/render";
import { createSigmaGlobalFacadeRenderer } from "../src/graph-routes/sigma-global-route";
import { SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS } from "../src/render/sigma-global-camera";
import { renderOfflineReader } from "../src/render/offline-reader";
import {
  createGraphFacadeRouteManager,
  type GraphFacadeRenderer,
  type GraphFacadeRouteRendererFactoryInput
} from "../src/facade";

describe("graph renderer lifecycle", () => {
  it("builds one drawing model for initial DOM creation and for each data update", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    let initialSummaryReads = 0;
    const initialData = graphData(["a"]);
    Object.defineProperty(initialData.nodes[0], "summary", {
      enumerable: true,
      get() {
        initialSummaryReads += 1;
        return "Initial summary";
      }
    });

    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: initialData,
      theme: "shan-shui",
      live: false
    });

    assert.equal(initialSummaryReads, 1);

    let refreshedSummaryReads = 0;
    const refreshedData = graphData(["b"]);
    Object.defineProperty(refreshedData.nodes[0], "summary", {
      enumerable: true,
      get() {
        refreshedSummaryReads += 1;
        return "Refreshed summary";
      }
    });
    renderer.setData(refreshedData);

    assert.equal(refreshedSummaryReads, 1);
    renderer.destroy();
  });

  it("builds one drawing model for initial Sigma creation and for each data update", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    let initialSummaryReads = 0;
    const initialData = graphData(["a"]);
    Object.defineProperty(initialData.nodes[0], "summary", {
      enumerable: true,
      get() {
        initialSummaryReads += 1;
        return "Initial summary";
      }
    });
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: fakeSigmaRouteRuntime(),
      options: {
        data: initialData,
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {}
      }
    });

    await Promise.resolve();
    assert.equal(initialSummaryReads, 1);

    let refreshedSummaryReads = 0;
    const refreshedProjection = projectGraphInput(graphData(["b"]));
    Object.defineProperty(refreshedProjection.data.nodes[0], "summary", {
      enumerable: true,
      get() {
        refreshedSummaryReads += 1;
        return "Refreshed summary";
      }
    });
    renderer.setData(refreshedProjection);

    assert.equal(refreshedSummaryReads, 1);
    renderer.destroy();
  });

  it("lets real Sigma and DOM/SVG consumers use the same prepared adapter result", async () => {
    const preparedData = graphDataForReturnGlobal();
    preparedData.nodes.push({ id: "d", label: "Node d", type: "topic", community: "community-a", source_path: "wiki/d.md", content: "Node d detail" });
    const preparedAdapterData = prepareGraphRendererAdapterData(preparedData, {
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      selection: { kind: "node", id: "a" },
      searchResultIds: ["b"],
      aggregationMarkers: [],
      viewportSize: { width: 960, height: 640 },
      sourceCommunityId: "community-a"
    });
    const decoyData = graphData(["raw-route-decoy"]);
    const ownerDocument = new FakeDocument();
    const domContainer = ownerDocument.createElement("div");
    const sigmaContainer = ownerDocument.createElement("div");
    const domRenderer = createGraphRenderer(domContainer as unknown as HTMLElement, {
      data: decoyData,
      preparedAdapterData,
      prepareAdapterData: () => preparedAdapterData,
      theme: "shan-shui",
      searchQuery: "prepared search",
      live: false
    });
    const sigmaRuntime = fakeSigmaRouteRuntime();
    const sigmaRenderer = createSigmaGlobalFacadeRenderer({
      container: sigmaContainer as unknown as HTMLElement,
      sigmaRuntime,
      preparedAdapterData,
      prepareAdapterData: () => preparedAdapterData,
      options: {
        ...projectGraphInput(decoyData),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {}
      }
    });

    await Promise.resolve();

    const sigmaGraph = sigmaRuntime.instances[0]?.getGraph();
    assert.ok(sigmaGraph);
    assert.deepEqual(sigmaGraph.nodes(), ["a", "b", "c", "d"]);
    assert.deepEqual(
      collectNodes(domRenderer.root as unknown as FakeElement).map((node) => node.dataset.id),
      ["a", "b", "c", "d"]
    );
    for (const adapterNode of preparedAdapterData.nodes) {
      const sigmaNode = sigmaGraph.getNodeAttributes(adapterNode.id);
      const domNode = nodeElement(domRenderer, adapterNode.id);
      assert.ok(domNode);
      assert.deepEqual(
        {
          id: domNode.dataset.id,
          point: { x: Number(domNode.dataset.worldX), y: Number(domNode.dataset.worldY) },
          selected: domNode.getAttribute("aria-pressed") === "true",
          searchHit: domNode.dataset.searchState === "match",
          pinned: domNode.dataset.pinned === "true"
        },
        {
          id: adapterNode.id,
          point: adapterNode.point,
          selected: adapterNode.selected,
          searchHit: adapterNode.searchHit,
          pinned: adapterNode.pinHint.pinned
        }
      );
      assert.deepEqual(
        {
          id: adapterNode.id,
          point: { x: sigmaNode.x, y: sigmaNode.y },
          selected: sigmaNode.selected,
          searchHit: sigmaNode.searchHit,
          pinned: sigmaNode.pinned,
          aggregationIds: sigmaNode.aggregationIds
        },
        {
          id: adapterNode.id,
          point: adapterNode.point,
          selected: adapterNode.selected,
          searchHit: adapterNode.searchHit,
          pinned: adapterNode.pinHint.pinned,
          aggregationIds: adapterNode.aggregationIds
        }
      );
    }
    assert.deepEqual(sigmaGraph.getAttribute("counts"), preparedAdapterData.counts);
    assert.deepEqual(sigmaGraph.getAttribute("selection"), preparedAdapterData.selection);
    assert.deepEqual(domRenderer.graph.counts, preparedAdapterData.counts);
    assert.equal(domRenderer.root.dataset.adapterCounts, undefined);
    assert.deepEqual(sigmaGraph.getAttribute("aggregations"), []);

    domRenderer.destroy();
    sigmaRenderer.destroy();
  });

  it("does not enter Sigma or DOM/SVG when shared adapter preparation fails", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const failure = new Error("shared adapter preparation failed");
    let sigmaCreates = 0;
    let fallbackCreates = 0;

    assert.throws(() => createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        ...projectGraphInput(graphData(["a"])),
        pins: {},
        theme: "shan-shui"
      },
      prepareAdapterData: () => {
        throw failure;
      },
      factories: {
        createSigmaGlobal: (input) => {
          sigmaCreates += 1;
          return createSigmaShellRenderer(input);
        },
        createDomSvgSmallFallback: (input) => {
          fallbackCreates += 1;
          return createSigmaShellRenderer(input);
        }
      }
    }), failure);
    assert.equal(sigmaCreates, 0);
    assert.equal(fallbackCreates, 0);
  });

  it("keeps a shared preparation update failure on the current route without DOM/SVG fallback", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const failure = new Error("shared update preparation failed");
    let fallbackCreates = 0;
    const managerState = {
      ...projectGraphInput(graphData(["initial"])),
      pins: {},
      theme: "shan-shui" as const
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: managerState,
      prepareAdapterData: (options, renderOptions) => {
        if (options.data.nodes.some((node) => node.id === "failing-update")) throw failure;
        return prepareGraphRendererAdapterData(options.data, renderOptions);
      },
      factories: {
        createSigmaGlobal: (input) => createSigmaGlobalFacadeRenderer({
          ...input,
          sigmaRuntime: fakeSigmaRouteRuntime()
        }),
        createDomSvgSmallFallback: (input) => {
          fallbackCreates += 1;
          return createSigmaShellRenderer(input);
        }
      }
    });

    assert.throws(() => manager.setData(projectGraphInput(graphData(["failing-update"]))), failure);
    assert.equal(manager.routeId, "sigma-global");
    assert.equal(manager.sigmaKnownUnavailable, false);
    assert.equal(fallbackCreates, 0);
    assert.deepEqual(managerState.data.nodes.map((node) => node.id), ["initial"]);
    manager.setData(projectGraphInput(graphData(["recovered-update"])));
    assert.deepEqual(managerState.data.nodes.map((node) => node.id), ["recovered-update"]);
    manager.destroy();
  });

  it("keeps shared preparation out of live movement frames", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    let preparations = 0;
    const data = graphDataForReturnGlobal();
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data,
      theme: "shan-shui",
      prepareAdapterData: (nextData, renderOptions) => {
        preparations += 1;
        return prepareGraphRendererAdapterData(nextData, renderOptions);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(preparations, 1);
    const liveX = nodeElement(renderer, "a")?.dataset.liveX;
    assert.ok(liveX);
    assert.equal(Number(liveX), renderer.graph.nodes.find((node) => node.id === "a")?.point.x);
    renderer.destroy();
  });

  it("does not expand a community selection into every DOM/SVG reading node", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: null,
        selection: { kind: "community", id: "community-a" },
        sourceCommunityId: "community-a"
      },
      factories: {
        createSigmaGlobal: () => {
          throw new Error("WebGL unavailable");
        }
      }
    });

    assert.equal(manager.routeId, "dom-svg-small-fallback");
    manager.focusCommunity("community-a");
    assert.equal(manager.routeId, "dom-svg-community");
    assert.equal(collectNodes(container).filter((node) => node.getAttribute("aria-pressed") === "true").length, 0);
    manager.destroy();
  });

  it("reports Graphology, WebGL, and canvas failures only after the shared Sigma snapshot is prepared", async () => {
    for (const fault of ["Graphology", "WebGL", "canvas"] as const) {
      const ownerDocument = new FakeDocument();
      const container = ownerDocument.createElement("div");
      const data = graphData(["a", "b"]);
      let snapshotReads = 0;
      const projection = projectGraphInput(data);
      Object.defineProperty(projection.data.nodes[0], "summary", {
        enumerable: true,
        get() {
          snapshotReads += 1;
          return "Prepared before Sigma failure";
        }
      });
      const failure = new Error(`${fault} unavailable after snapshot`);
      const reported: unknown[] = [];
      let snapshotReadsAtFault = 0;
      const healthyRuntime = fakeSigmaRouteRuntime();
      const sigmaRuntime = fault === "Graphology"
        ? {
            ...healthyRuntime,
            GraphologyGraph: class {
              constructor() {
                snapshotReadsAtFault = snapshotReads;
                throw failure;
              }
            }
          } as unknown as SigmaGlobalRendererRuntime
        : {
            ...healthyRuntime,
            Sigma: class {
              constructor() {
                snapshotReadsAtFault = snapshotReads;
                throw failure;
              }
            }
          } as unknown as SigmaGlobalRendererRuntime;
      const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
        state: {
          ...projection,
          pins: {},
          theme: "shan-shui",
          focus: null,
          typeFilters: {},
          aggregationMarkers: [],
          selection: null,
          searchQuery: "",
          searchResultIds: [],
          temporaryObject: null
        },
        factories: {
          createSigmaGlobal: (input) => createSigmaGlobalFacadeRenderer({
            ...input,
            sigmaRuntime,
            onSigmaUnavailable: (error, preparedAdapterData) => {
              reported.push(error);
              input.onSigmaUnavailable?.(error, preparedAdapterData);
            }
          })
        }
      });

      await Promise.resolve();
      await Promise.resolve();

      assert.equal(snapshotReadsAtFault, 1, `${fault} failure must happen after one shared snapshot`);
      assert.equal(snapshotReads, 1, `${fault} fallback must reuse the prepared Sigma snapshot`);
      assert.ok(reported.length >= 1, `${fault} failure should cross the Sigma reporting boundary`);
      assert.equal(reported.every((error) => error === failure), true);
      assert.equal(manager.sigmaKnownUnavailable, true);
      assert.equal(manager.routeId, "dom-svg-small-fallback");
      manager.destroy();
    }
  });

  it("renders projected node details when date and source metadata reject conversion", () => {
    const rejectsConversion = {
      toString() {
        throw new Error("conversion rejected");
      }
    };
    const projection = projectGraphInput({
      nodes: [{
        id: "a",
        label: "Node A",
        type: "source",
        content: "Safe content",
        date: rejectsConversion,
        updated_at: rejectsConversion,
        updatedAt: rejectsConversion,
        created_at: rejectsConversion,
        createdAt: rejectsConversion,
        source_title: rejectsConversion,
        source_url: rejectsConversion,
        url: rejectsConversion,
        author: rejectsConversion,
        source_name: rejectsConversion
      }],
      edges: []
    });
    const node = projection.data.nodes[0]!;
    const ownerDocument = new FakeDocument();
    const reader = ownerDocument.createElement("div");

    assert.doesNotThrow(() => renderOfflineReader(
      ownerDocument as unknown as Document,
      reader as unknown as HTMLElement,
      {
        selected: { id: node.id, label: node.label, type: node.type, content: node.content },
        rawNode: node,
        onClose: () => {}
      }
    ));
    assert.equal(findByClass(reader, "graph-reader-meta").length, 1);
    assert.equal(findByClass(reader, "graph-reader-body").length, 1);
  });

  it("gives offline Sigma hosts readable node and multi-selection panels", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const clearRequests: number[] = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: fakeSigmaRouteRuntime(),
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onSelectionClearRequested: () => clearRequests.push(1)
        }
      }
    });

    await Promise.resolve();
    const reader = findByClass(container, "graph-reader")[0];
    const selectionPanel = findByClass(container, "graph-selection-panel")[0];
    assert.ok(reader);
    assert.ok(selectionPanel);
    assert.equal(reader.dataset.state, "closed");
    assert.equal(selectionPanel.dataset.state, "closed");

    renderer.select({ kind: "node", id: "a" });
    assert.equal(reader.dataset.state, "open");
    assert.equal(findByClass(reader, "graph-reader-title")[0]?.textContent, "Node a");
    assert.equal(findByClass(reader, "graph-reader-body").length, 1);
    assert.equal(selectionPanel.dataset.state, "closed");

    renderer.select({ kind: "nodes", ids: ["a", "b"] });
    assert.equal(reader.dataset.state, "closed");
    assert.equal(selectionPanel.dataset.state, "open");
    assert.equal(findByClass(selectionPanel, "graph-selection-page").length, 2);
    assert.equal(findByClass(selectionPanel, "graph-selection-title")[0]?.textContent, "手动选区 · 2 页");

    const selectionClose = findByClass(selectionPanel, "graph-selection-close")[0];
    assert.ok(selectionClose);
    ownerDocument.dispatch("keydown", { key: "Escape", target: selectionClose });
    assert.equal(selectionPanel.dataset.state, "closed");
    assert.deepEqual(clearRequests, [1]);

    renderer.select({ kind: "nodes", ids: ["a", "b"] });
    findByClass(selectionPanel, "graph-selection-close")[0]?.dispatch("click");
    assert.equal(selectionPanel.dataset.state, "closed");
    assert.deepEqual(clearRequests, [1, 1]);

    renderer.select({ kind: "community", id: "community-a" });
    const enterCommunity = findByClass(selectionPanel, "graph-selection-enter-community")[0];
    assert.equal(enterCommunity?.textContent, "进入社区");
    enterCommunity?.dispatch("click");
    assert.equal(selectionPanel.dataset.state, "closed");
    assert.deepEqual(clearRequests, [1, 1, 1]);

    renderer.destroy();
  });

  it("routes Escape only to the graph that owns the focused offline panel", async () => {
    const ownerDocument = new FakeDocument();
    const containers = [ownerDocument.createElement("div"), ownerDocument.createElement("div")];
    const clearRequests = [0, 0];
    const renderers = containers.map((container, index) => createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: fakeSigmaRouteRuntime(),
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: { kind: "nodes", ids: ["a", "b"] },
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onSelectionClearRequested: () => { clearRequests[index] += 1; }
        }
      }
    }));

    await Promise.resolve();
    const panels = containers.map((container) => findByClass(container, "graph-selection-panel")[0]);
    assert.deepEqual(panels.map((panel) => panel?.dataset.state), ["open", "open"]);

    ownerDocument.dispatch("keydown", { key: "Escape", target: ownerDocument as unknown as FakeElement });
    assert.deepEqual(clearRequests, [0, 0]);

    const secondPanel = panels[1];
    assert.ok(secondPanel);
    const secondClose = findByClass(secondPanel, "graph-selection-close")[0];
    assert.ok(secondClose);
    ownerDocument.dispatch("keydown", { key: "Escape", target: secondClose });

    assert.deepEqual(clearRequests, [0, 1]);
    assert.deepEqual(panels.map((panel) => panel?.dataset.state), ["open", "closed"]);
    renderers.forEach((renderer) => renderer.destroy());
  });

  it("keeps offline community entry within shared community semantics and route state", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const data = graphDataForReturnGlobal();
    data.nodes.push({
      id: "loose",
      label: "Loose node",
      type: "entity",
      source_path: "wiki/loose.md",
      content: "Loose node detail"
    });
    data.meta.total_nodes = data.nodes.length;
    const state = {
      ...projectGraphInput(data),
      pins: {},
      theme: "shan-shui" as const,
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      sourceCommunityId: null,
      searchQuery: "",
      searchResultIds: [],
      temporaryObject: null
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      factories: {
        createSigmaGlobal: (input) => createSigmaGlobalFacadeRenderer({
          ...input,
          sigmaRuntime: fakeSigmaRouteRuntime()
        })
      }
    });
    await Promise.resolve();
    const selectionPanel = findByClass(container, "graph-selection-panel")[0];
    assert.ok(selectionPanel);

    manager.select({ kind: "community", id: "_none" });
    assert.equal(findByClass(selectionPanel, "graph-selection-enter-community").length, 0);

    manager.select({ kind: "community", id: "community-a" });
    const enterCommunity = findByClass(selectionPanel, "graph-selection-enter-community")[0];
    assert.ok(enterCommunity);
    enterCommunity.dispatch("click");

    assert.deepEqual(state.focus, { kind: "community", id: "community-a" });
    assert.equal(manager.sourceCommunityId, "community-a");
    manager.destroy();
  });

  it("leaves Sigma reading panels to hosts that provide their own reader", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: fakeSigmaRouteRuntime(),
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onNodeOpen: () => {}
        }
      }
    });

    renderer.select({ kind: "node", id: "a" });
    assert.equal(findByClass(container, "graph-reader").length, 0);
    assert.equal(findByClass(container, "graph-selection-panel").length, 0);

    renderer.destroy();
  });

  it("projects hostile data through the public engine entry before routing and updates", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    let initialNodeReads = 0;
    const initialInput = {
      meta: { total_nodes: Symbol("nodes") },
      get nodes() {
        initialNodeReads += 1;
        return Array.from({ length: 2001 }, (_, index) => ({ id: `node-${index}`, label: `Node ${index}` }));
      },
      edges: "not-an-array"
    };

    const engine = createGraphEngine(container as unknown as HTMLElement, { data: initialInput });

    assert.equal(initialNodeReads, 1);
    assert.equal(engine.summarizeGlobal().nodeCount, 2001);
    assert.equal(findByClass(container, "graph-over-limit-notice-view").length, 1);

    const refreshedInput = {
      meta: { total_edges: Symbol("edges") },
      nodes: Array.from({ length: 2001 }, (_, index) => ({ id: `next-${index}`, label: `Next ${index}` })),
      edges: null
    };
    assert.doesNotThrow(() => engine.setData(refreshedInput));
    assert.equal(engine.summarizeGlobal().nodeCount, 2001);

    engine.destroy();
  });

  it("handles object-prototype community ids through the public engine", () => {
    const communityIds = OBJECT_PROTOTYPE_COMMUNITY_IDS;
    const data = objectPrototypeCommunityInput();

    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const engine = createGraphEngine(container as unknown as HTMLElement, { data, theme: "shan-shui" });
    try {
      for (const [index, communityId] of communityIds.entries()) {
        const nodeId = `node-${communityId}`;
        engine.select({ kind: "community", id: communityId });
        const summary = engine.summarizeCommunity(communityId);
        assert.equal(summary.kind, "community-summary");
        if (summary.kind === "community-summary") {
          assert.equal(summary.communityId, communityId);
          assert.equal(summary.label, `${String.fromCharCode(65 + index)} Community`);
          assert.equal(summary.nodeCount, 1);
          assert.deepEqual(summary.coreNodeIds, [nodeId]);
          assert.deepEqual(summary.selection.selectedCommunityIds, [communityId]);
          assert.deepEqual(summary.selection.selectedNodeIds, [nodeId]);
          assert.equal(summary.selection.containsCurrentObject, true);
        }
        const focus = engine.focusCommunity(communityId);
        assert.deepEqual(focus.communityIds, [communityId]);
        assert.deepEqual(focus.nodeIds, [nodeId]);
        assert.equal(engine.sourceCommunityId, communityId);
        engine.resetView();
        assert.equal(engine.sourceCommunityId, null);
      }
    } finally {
      engine.destroy();
    }
  });

  it("mounts object-prototype community ids through Sigma selection and focus flows", async () => {
    const communityIds = OBJECT_PROTOTYPE_COMMUNITY_IDS;
    const data = objectPrototypeCommunityInput();
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const runtime = fakeSigmaRouteRuntime();
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        ...projectGraphInput(data),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null
      },
      factories: {
        createSigmaGlobal: (input) => createSigmaGlobalFacadeRenderer({ ...input, sigmaRuntime: runtime })
      }
    });

    try {
      await Promise.resolve();

      assert.equal(runtime.instances.length, 1, "Sigma should mount before the lifecycle assertions run");
      const sigma = runtime.instances[0];
      assert.ok(sigma);
      assert.deepEqual(sigma.getGraph().nodes(), communityIds.map((id) => `node-${id}`));
      assert.deepEqual(
        sigma.getGraph().getAttribute("communities").map((community: { id: string }) => community.id),
        communityIds
      );
      for (const communityId of communityIds) {
        const nodeId = `node-${communityId}`;
        assert.equal(sigma.getGraph().getNodeAttribute(nodeId, "communityId"), communityId);

        manager.select({ kind: "community", id: communityId });
        assert.deepEqual(sigma.getGraph().getAttribute("selection").selectedCommunityIds, [communityId]);

        manager.focusCommunity(communityId);
        const sigmaRoot = findByClass(container, "sigma-global-renderer")[0];
        assert.equal(manager.sourceCommunityId, communityId);
        assert.equal(sigmaRoot?.dataset.sourceCommunityId, communityId);
        assert.equal(sigmaRoot?.dataset.communityFocusId, communityId);
        assert.deepEqual(sigma.getGraph().nodes(), [nodeId]);

        manager.resetView();
        assert.equal(manager.sourceCommunityId, null);
        assert.equal(sigmaRoot?.dataset.sourceCommunityId, "");
        assert.equal(sigmaRoot?.dataset.communityFocusId, "");
        assert.deepEqual(sigma.getGraph().nodes(), communityIds.map((id) => `node-${id}`));
        assert.deepEqual(sigma.getGraph().getAttribute("selection").selectedCommunityIds, []);
      }
    } finally {
      manager.destroy();
    }
  });

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

  it("applies community relation focus immediately on node hover and clears it on leave", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    nodeElement(renderer, "a")?.dispatch("pointerenter");

    assert.equal(renderer.root.dataset.relationFocus, "active");
    assert.equal(renderer.root.dataset.relationFocusNode, "a");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "focus");
    assert.equal(nodeElement(renderer, "b")?.dataset.relationFocusDepth, "first");
    assert.equal(nodeElement(renderer, "c")?.dataset.relationFocusDepth, "first");
    assert.equal(nodeElement(renderer, "d")?.dataset.relationFocusDepth, "second");
    assert.equal(nodeElement(renderer, "e")?.dataset.relationFocusDepth, "unrelated");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.relationFocusDepth, "first");
    assert.equal(edgeElement(renderer, "b-d")?.dataset.relationFocusDepth, "second");
    assert.equal(edgeElement(renderer, "d-e")?.dataset.relationFocusDepth, "unrelated");

    nodeElement(renderer, "a")?.dispatch("pointerleave");
    await delay(100);

    assert.equal(renderer.root.dataset.relationFocus, "idle");
    assert.equal(renderer.root.dataset.relationFocusNode, "");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "none");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.relationFocusDepth, "none");

    renderer.destroy();
  });

  it("keeps clicked community node as fixed relation focus and lets hover temporarily override it", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    nodeElement(renderer, "a")?.dispatch("click", { detail: 0 });

    assert.equal(renderer.root.dataset.relationFocus, "active");
    assert.equal(renderer.root.dataset.relationFocusNode, "a");
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "true");
    assert.equal(nodeElement(renderer, "b")?.dataset.relationFocusDepth, "first");

    nodeElement(renderer, "d")?.dispatch("pointerenter");

    assert.equal(renderer.root.dataset.relationFocusNode, "d");
    assert.equal(nodeElement(renderer, "d")?.dataset.relationFocusDepth, "focus");
    assert.equal(nodeElement(renderer, "b")?.dataset.relationFocusDepth, "first");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "second");

    nodeElement(renderer, "d")?.dispatch("pointerleave");
    await delay(100);

    assert.equal(renderer.root.dataset.relationFocusNode, "a");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "focus");
    assert.equal(nodeElement(renderer, "d")?.dataset.relationFocusDepth, "second");

    dispatchPointerSequence(renderer.root as unknown as FakeElement, 20, 20);

    assert.equal(renderer.root.dataset.relationFocus, "idle");
    assert.equal(renderer.root.dataset.relationFocusNode, "");
    assert.equal(nodeElement(renderer, "a")?.getAttribute("aria-pressed"), "false");

    renderer.destroy();
  });

  it("does not open node hover preview cards inside focused community view", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    nodeElement(renderer, "a")?.dispatch("pointerenter");
    await delay(360);

    const preview = findByClass(renderer.root as unknown as FakeElement, "graph-hover-preview")[0];
    assert.notEqual(preview?.dataset.state, "open");
    assert.equal(renderer.root.dataset.relationFocusNode, "a");

    renderer.destroy();
  });

  it("keeps relation focus continuous when hovering between community nodes", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    nodeElement(renderer, "a")?.dispatch("pointerenter");
    assert.equal(renderer.root.dataset.relationFocusNode, "a");

    nodeElement(renderer, "a")?.dispatch("pointerleave");
    nodeElement(renderer, "b")?.dispatch("pointerenter");

    assert.equal(renderer.root.dataset.relationFocusNode, "b");
    assert.notEqual(renderer.root.dataset.relationFocus, "idle");

    renderer.destroy();
  });

  it("does not apply relation focus outside focused community view", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false
    });

    nodeElement(renderer, "a")?.dispatch("pointerenter");

    assert.equal(renderer.root.dataset.relationFocus, "idle");
    assert.equal(renderer.root.dataset.relationFocusNode, "");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "none");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.relationFocusDepth, "none");

    renderer.destroy();
  });

  it("keeps type-filter-hidden nodes and edges hidden during community relation focus", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    renderer.setTypeFilters({ entity: false });
    nodeElement(renderer, "a")?.dispatch("pointerenter");

    assert.equal(nodeElement(renderer, "b")?.dataset.filterState, "hidden");
    assert.equal(nodeElement(renderer, "d")?.dataset.filterState, "hidden");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.filterState, "hidden");
    assert.equal(edgeElement(renderer, "b-d")?.dataset.filterState, "hidden");
    assert.equal(edgeElement(renderer, "a-b")?.dataset.relationFocusDepth, "first");
    assert.equal(edgeElement(renderer, "b-d")?.dataset.relationFocusDepth, "second");

    renderer.destroy();
  });

  it("marks focused community DOM output as the scoped lightweight graph view", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    assert.equal(renderer.root.dataset.communityMapState, "lightweight");
    assert.equal(renderer.root.dataset.relationFocus, "idle");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "none");

    renderer.destroy();
  });

  it("keeps manual node fix usable while focused community motion is frozen", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const pinsChanged: unknown[] = [];
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: true,
      focus: { kind: "community", id: "community-a" },
      onPinsChanged: (pins) => pinsChanged.push(pins)
    });

    // live: true + focused community => automatic motion is frozen (no live
    // simulation), but the shared local-map snapshot is active for community-a.
    assert.equal(renderer.graph.communityMap.active, true);
    assert.equal(renderer.graph.communityMap.motionMode, "frozen");
    assert.equal(renderer.graph.communityMap.current?.communityId, "community-a");
    assert.equal(renderer.root.dataset.communityMapState, "lightweight");

    const pointABefore = renderer.graph.nodes.find((node) => node.id === "a")?.point;
    assert.ok(pointABefore);

    // Manual fix must still work while automatic motion is frozen: it pins the
    // node through PinState even though there is no live simulation to drive.
    const fixed = renderer.setNodeFixed("b", "fix");
    assert.equal(fixed, true, "manual fix should succeed even with frozen community motion");
    assert.ok(pinsChanged.length > 0, "fixing a node should report the pin change");
    assert.deepEqual(Object.keys(pinsChanged.at(-1) as Record<string, unknown>), ["wiki/b.md"]);
    assert.equal(nodeElement(renderer, "b")?.dataset.pinned, "true");

    // Freezing motion must not drift the other community nodes.
    assert.deepEqual(renderer.graph.nodes.find((node) => node.id === "a")?.point, pointABefore);

    // Unfix returns the node to the shared snapshot without a lingering pin.
    const unfixed = renderer.setNodeFixed("b", "unfix");
    assert.equal(unfixed, true);
    assert.deepEqual(pinsChanged.at(-1), {});

    renderer.destroy();
  });

  it("clears community relation focus when the view returns to global", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createGraphRenderer(container as unknown as HTMLElement, {
      data: relationFocusGraphData(),
      theme: "shan-shui",
      live: false,
      focus: { kind: "community", id: "community-a" }
    });

    nodeElement(renderer, "a")?.dispatch("pointerenter");
    assert.equal(renderer.root.dataset.relationFocus, "active");
    assert.equal(renderer.root.dataset.relationFocusNode, "a");

    renderer.render({ focus: null });

    assert.equal(renderer.root.dataset.relationFocus, "idle");
    assert.equal(renderer.root.dataset.relationFocusNode, "");
    assert.equal(nodeElement(renderer, "a")?.dataset.relationFocusDepth, "none");

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
    const clearRequests: number[] = [];
    const viewResets: number[] = [];
    const sigmaInputs: GraphFacadeRouteRendererFactoryInput[] = [];
    const state = {
      data: graphDataForReturnGlobal(),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui" as const,
      focus: null,
      typeFilters: { entity: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchQuery: "Node a",
      searchResultIds: ["a"],
      temporaryObject: null
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onSelectionClearRequested: () => clearRequests.push(1),
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
    sigmaInputs[0].options.callbacks.onVisibilityStateChange?.({
      searchQuery: "Node a",
      searchResultIds: ["a"],
      typeFilters: { entity: true, source: false },
      temporaryObject: null,
      focusCommunityId: "community-a",
      hiddenReadingNodeId: null
    });
    assert.deepEqual(state.typeFilters, { entity: true, source: true });
    manager.select({ kind: "node", id: "a" });
    manager.setPins({ "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } });

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(findByClass(container, "sigma-global-route").length, 1);
    let activeSigmaShell = findByClass(container, "sigma-global-route")[0];
    assert.equal(activeSigmaShell?.dataset.focus, JSON.stringify({ kind: "community", id: "community-a" }));
    assert.equal(activeSigmaShell?.dataset.sourceCommunityId, "community-a");
    assert.equal(activeSigmaShell?.dataset.selectedKind, "node");
    assert.equal(activeSigmaShell?.dataset.selectedId, "a");
    assert.equal(activeSigmaShell?.dataset.searchResultIds, "a");
    assert.equal(activeSigmaShell?.dataset.typeFilters, "entity:true,source:true");
    assert.equal(activeSigmaShell?.dataset.pinnedPaths, "wiki/a.md");

    sigmaInputs[0].options.callbacks.onGlobalResetRequested?.();

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(findByClass(container, "sigma-global-route").length, 1);
    assert.deepEqual(visibleNodeIds({ root: container as unknown as HTMLElement }), []);
    activeSigmaShell = findByClass(container, "sigma-global-route")[0];
    assert.equal(activeSigmaShell?.dataset.focus, "");
    assert.equal(activeSigmaShell?.dataset.sourceCommunityId, "community-a");
    assert.equal(activeSigmaShell?.dataset.selectedKind, "");
    assert.equal(activeSigmaShell?.dataset.selectedId, "");
    assert.equal(activeSigmaShell?.dataset.searchResultIds, "");
    assert.equal(activeSigmaShell?.dataset.typeFilters, "entity:true,source:true");
    assert.equal(activeSigmaShell?.dataset.pinnedPaths, "wiki/a.md");
    assert.deepEqual(state.searchResultIds, []);
    assert.deepEqual(state.typeFilters, { entity: true, source: true });
    assert.equal(manager.sourceCommunityId, "community-a");
    assert.equal(sigmaInputs.length, 1);
    assert.deepEqual(clearRequests, []);
    assert.deepEqual(viewResets, [1]);

    manager.destroy();
  });

  it("clears saved pins when resetting the Sigma global layout", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const pinsChanged: unknown[] = [];
    const state = {
      data: graphDataForReturnGlobal(),
      pins: { "wiki/a.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui" as const,
      focus: null,
      typeFilters: { entity: true, source: true },
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onPinsChanged: (pins) => pinsChanged.push(pins)
      },
      factories: {
        createSigmaGlobal: (input) => createSigmaShellRenderer(input)
      }
    });
    const sigmaShell = findByClass(container, "sigma-global-route")[0];

    assert.equal(manager.routeId, "sigma-global");
    assert.equal(sigmaShell?.dataset.pinnedPaths, "wiki/a.md");

    manager.resetLayout();

    assert.deepEqual(pinsChanged, [{}]);
    assert.deepEqual(state.pins, {});
    assert.equal(sigmaShell?.dataset.pinnedPaths, "");

    manager.select({ kind: "community", id: "community-a" });
    assert.deepEqual(state.pins, {});
    assert.equal(sigmaShell?.dataset.selectedKind, "community");
    assert.equal(sigmaShell?.dataset.selectedId, "community-a");
    assert.equal(sigmaShell?.dataset.pinnedPaths, "");

    manager.destroy();
  });

  it("clears saved pins when resetting the over-limit notice layout", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const pinsChanged: unknown[] = [];
    const state = {
      data: largeFallbackGraphData(),
      pins: { "wiki/large/0.md": { x: 120, y: 140, coordinateSpace: "world" } },
      theme: "shan-shui" as const,
      focus: null,
      typeFilters: {},
      aggregationMarkers: [],
      selection: null,
      searchResultIds: [],
      temporaryObject: null
    };
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state,
      callbacks: {
        onPinsChanged: (pins) => pinsChanged.push(pins)
      }
    });
    const overLimitView = findByClass(container, "graph-over-limit-notice-view")[0];

    assert.equal(manager.routeId, "over-limit-notice");
    assert.equal(overLimitView?.dataset.pinnedCount, "1");

    manager.resetLayout();

    assert.deepEqual(pinsChanged, [{}]);
    assert.deepEqual(state.pins, {});
    assert.equal(overLimitView?.dataset.pinnedCount, "0");

    manager.destroy();
  });

  it("keeps DOM/SVG small fallback on the same lightweight global interaction rules", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const selections: SelectionInput[] = [];
    const manager = createGraphFacadeRouteManager(container as unknown as HTMLElement, {
      state: {
        ...projectGraphInput(graphDataForReturnGlobal()),
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

    manager.setData(projectGraphInput(largeFallbackGraphData()));
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

  it("keeps Sigma search input mounted when focusing the visible control", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {}
      }
    });
    const searchInput = findByClass(container, "graph-search-input")[0];
    const searchControl = findByClass(container, "graph-search")[0];

    searchInput.dispatch("focus");
    searchInput.value = "Node a";
    searchInput.dispatch("input");

    assert.equal(findByClass(container, "graph-search-input")[0], searchInput);
    assert.equal(searchControl.dataset.state, "open");
    assert.equal(findByClass(container, "graph-search-input")[0]?.value, "Node a");

    renderer.destroy();
  });

  it("scopes Sigma community search to visible current-community nodes without auto-opening content", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const visibilityStates: GraphVisibilityState[] = [];
    const selections: SelectionInput[] = [];
    const opened: Array<[string, unknown]> = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: { entity: true, source: true },
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onVisibilityStateChange: (state) => visibilityStates.push(state),
          onSelectionInput: (selection) => selections.push(selection),
          onNodeOpen: (id, origin) => opened.push([id, origin])
        }
      }
    });
    const searchInput = findByClass(container, "graph-search-input")[0];

    searchInput.value = "Node";
    searchInput.dispatch("input");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a", "b"]);
    searchInput.dispatch("keydown", { key: "ArrowDown" });
    findByClass(container, "graph-search-input")[0]?.dispatch("keydown", { key: "ArrowDown" });

    const sourceToggle = findByDataset(container, "type", "source");
    assert.ok(sourceToggle);
    sourceToggle.checked = false;
    sourceToggle.dispatch("change");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a"]);

    findByClass(container, "graph-search-input")[0]?.dispatch("keydown", { key: "Enter" });
    assert.deepEqual(selections.at(-1), { kind: "node", id: "a" });
    assert.deepEqual(opened, [["a", "community-search-result"]]);

    searchInput.value = "Node c";
    searchInput.dispatch("input");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, []);

    searchInput.value = "Node a";
    searchInput.dispatch("input");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a"]);
    assert.deepEqual(selections, [{ kind: "node", id: "a" }]);
    assert.deepEqual(opened, [["a", "community-search-result"]]);

    const resultItems = findByClass(container, "graph-search-result-item");
    assert.equal(resultItems.length, 1);
    assert.equal(findByClass(resultItems[0]!, "graph-search-result-label")[0]?.textContent, "Node a");
    resultItems[0]?.dispatch("click");
    assert.deepEqual(selections.at(-1), { kind: "node", id: "a" });
    assert.deepEqual(opened, [["a", "community-search-result"], ["a", "community-search-result"]]);
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a"]);
    assert.equal(findByClass(container, "graph-search-result-item").length, 1);

    searchInput.value = "";
    searchInput.dispatch("input");
    assert.equal(visibilityStates.at(-1)?.searchQuery, "");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, []);
    assert.deepEqual(selections, [{ kind: "node", id: "a" }, { kind: "node", id: "a" }]);
    assert.deepEqual(opened, [["a", "community-search-result"], ["a", "community-search-result"]]);

    renderer.destroy();
  });

  it("recomputes Sigma community search and hidden-reader state after type filters change", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const visibilityStates: GraphVisibilityState[] = [];
    const selections: SelectionInput[] = [];
    const opened: string[] = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: { kind: "node", id: "b" },
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onVisibilityStateChange: (state) => visibilityStates.push(state),
          onSelectionInput: (selection) => selections.push(selection),
          onNodeOpen: (id) => opened.push(id)
        }
      }
    });
    const searchInput = findByClass(container, "graph-search-input")[0];

    searchInput.value = "Node";
    searchInput.dispatch("input");
    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a", "b"]);

    const sourceToggle = findByDataset(container, "type", "source");
    assert.ok(sourceToggle);
    assert.equal(sourceToggle.checked, true);
    sourceToggle.checked = false;
    sourceToggle.dispatch("change");

    assert.deepEqual(visibilityStates.at(-1)?.searchResultIds, ["a"]);
    assert.equal(visibilityStates.at(-1)?.hiddenReadingNodeId, "b");
    assert.equal(visibilityStates.at(-1)?.focusCommunityId, "community-a");
    assert.equal(findByClass(container, "sigma-community-hidden-node-hint")[0]?.textContent, "当前节点被筛选隐藏");
    assert.equal(findByClass(container, "sigma-global-route")[0]?.dataset.hiddenReadingNode, "true");

    const entityToggle = findByDataset(container, "type", "entity");
    assert.ok(entityToggle);
    entityToggle.checked = true;
    entityToggle.dispatch("change");

    assert.equal(visibilityStates.at(-1)?.hiddenReadingNodeId, "b");
    const visibleResult = findByClass(container, "graph-search-result-item")[0];
    assert.equal(visibleResult?.dataset.nodeId, "a");
    visibleResult?.dispatch("click");
    assert.deepEqual(selections.at(-1), { kind: "node", id: "a" });
    assert.deepEqual(opened, ["a"]);
    assert.equal(visibilityStates.at(-1)?.hiddenReadingNodeId, null);

    renderer.destroy();
  });

  it("keeps Sigma community Escape scoped away from search and filter controls", () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const clearRequests: number[] = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      options: {
        ...projectGraphInput(graphDataForReturnGlobal()),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: { kind: "node", id: "a" },
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onSelectionClearRequested: () => clearRequests.push(1)
        }
      }
    });
    const searchInput = findByClass(container, "graph-search-input")[0];
    const sourceToggle = findByDataset(container, "type", "source");
    assert.ok(searchInput);
    assert.ok(sourceToggle);
    (searchInput as unknown as { nodeType: number }).nodeType = 1;
    (sourceToggle as unknown as { nodeType: number }).nodeType = 1;

    ownerDocument.dispatch("keydown", { key: "Escape", target: searchInput });
    ownerDocument.dispatch("keydown", { key: "Escape", target: sourceToggle });

    assert.deepEqual(clearRequests, []);

    const readerClose = findByClass(container, "graph-reader-close")[0];
    assert.ok(readerClose);
    ownerDocument.dispatch("keydown", { key: "Escape", target: readerClose });

    assert.deepEqual(clearRequests, [1]);

    renderer.select({ kind: "nodes", ids: ["a", "b"] });
    const selectionClose = findByClass(container, "graph-selection-close")[0];
    assert.ok(selectionClose);
    ownerDocument.dispatch("keydown", { key: "Escape", target: selectionClose });

    assert.deepEqual(clearRequests, [1, 1]);

    renderer.destroy();
  });

  it("clears Sigma edge previews when leaving and re-entering community reading", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const runtime = fakeSigmaRouteRuntime();
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: runtime,
      options: {
        data: relationFocusGraphData(),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {}
      }
    });

    await Promise.resolve();
    const edgePreview = findByClass(container, "sigma-edge-hover-preview")[0];
    assert.ok(edgePreview);

    runtime.instances[0]?.emit("enterEdge", { edge: "a-b" });

    assert.equal(edgePreview.dataset.state, "open");
    assert.equal(edgePreview.dataset.edgeId, "a-b");
    assert.equal(findByClass(edgePreview, "graph-hover-preview-title")[0]?.textContent, "实现");

    renderer.resetView();
    renderer.focusCommunity("community-a");

    assert.equal(edgePreview.dataset.state, "closed");
    assert.equal(edgePreview.dataset.edgeId, "");

    renderer.destroy();
  });

  it("uses the short Sigma return duration when leaving community reading", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const runtime = fakeSigmaRouteRuntime();
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: runtime,
      options: {
        data: relationFocusGraphData(),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {}
      }
    });

    await Promise.resolve();
    renderer.resetView();

    assert.equal(
      runtime.instances[0]?.getCamera().animateCalls.at(-1)?.options?.duration,
      SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS
    );

    renderer.destroy();
  });

  it("clears temporary display state when the Sigma route leaves community reading", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const visibilityStates: GraphVisibilityState[] = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: fakeSigmaRouteRuntime(),
      options: {
        data: relationFocusGraphData(),
        pins: {},
        theme: "shan-shui",
        focus: { kind: "community", id: "community-a" },
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: "community-a",
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: { kind: "node", nodeId: "a" },
        callbacks: {
          onVisibilityStateChange: (state) => visibilityStates.push(state)
        }
      }
    });

    await Promise.resolve();
    renderer.resetView();

    assert.equal(visibilityStates.at(-1)?.temporaryObject, null);

    renderer.destroy();
  });

  it("keeps source-community nodes clickable after a Sigma global community click", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const runtime = fakeSigmaRouteRuntime();
    const selections: SelectionInput[] = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: runtime,
      options: {
        data: graphDataForReturnGlobal(),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onSelectionInput: (selection) => selections.push(selection)
        }
      }
    });

    await Promise.resolve();
    const shape = findByClass(container, "sigma-global-community-region")[0]?.children[0]?.children[0];
    assert.ok(shape, "expected a Sigma community region hit shape");

    shape.dispatch("click");

    const sigmaRoot = findByClass(container, "sigma-global-renderer")[0];
    assert.deepEqual(selections.at(-1), { kind: "community", id: "community-a" });
    assert.equal(sigmaRoot?.dataset.sourceCommunityId, "community-a");
    assert.deepEqual(
      findByClass(container, "sigma-global-node-hit-target").map((target) => target.dataset.nodeId).sort(),
      ["a", "b"]
    );

    renderer.destroy();
  });

  it("previews global node relations on hover without selection, drawer, camera, or graph rebuild", async () => {
    const ownerDocument = new FakeDocument();
    const container = ownerDocument.createElement("div");
    const runtime = fakeSigmaRouteRuntime();
    const selections: SelectionInput[] = [];
    const opened: Array<[string, unknown]> = [];
    const renderer = createSigmaGlobalFacadeRenderer({
      container: container as unknown as HTMLElement,
      sigmaRuntime: runtime,
      options: {
        data: relationFocusGraphData(),
        pins: {},
        theme: "shan-shui",
        focus: null,
        typeFilters: {},
        aggregationMarkers: [],
        selection: null,
        sourceCommunityId: null,
        searchQuery: "",
        searchResultIds: [],
        temporaryObject: null,
        callbacks: {
          onSelectionInput: (selection) => selections.push(selection),
          onNodeOpen: (id, origin) => opened.push([id, origin])
        }
      }
    });

    await Promise.resolve();
    const sigma = runtime.instances[0];
    assert.ok(sigma);
    const graph = sigma.getGraph();
    const baselineEdge = { ...graph.getEdgeAttributes("a-b") };

    sigma.emit("enterNode", { node: "a" });

    const previewEdge = graph.getEdgeAttributes("a-b");
    assert.deepEqual(selections, []);
    assert.deepEqual(opened, []);
    assert.equal(sigma.getCamera().animateCalls.length, 0);
    assert.equal(sigma.setGraphCalls.length, 0);
    assert.equal(graph.getNodeAttribute("a", "relationFocusDepth"), "focus");
    assert.equal(graph.getNodeAttribute("b", "relationFocusDepth"), "first");
    assert.equal(previewEdge.relationFocusDepth, "first");
    assert.ok(previewEdge.size > baselineEdge.size);

    sigma.emit("leaveNode");

    assert.equal(graph.getNodeAttribute("a", "relationFocusDepth"), "none");
    assert.equal(graph.getNodeAttribute("b", "relationFocusDepth"), "none");
    assert.equal(graph.getEdgeAttribute("a-b", "relationFocusDepth"), "none");
    assert.equal(graph.getEdgeAttribute("a-b", "size"), baselineEdge.size);
    assert.equal(sigma.setGraphCalls.length, 0);

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

  it("degrades interaction detail during lightweight viewport changes and restores after settle", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
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

    t.mock.timers.tick(0);
    t.mock.timers.tick(179);
    assert.equal(renderer.root.dataset.interactionMode, "active");

    t.mock.timers.tick(1);
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

const OBJECT_PROTOTYPE_COMMUNITY_IDS = ["ordinary", "__proto__", "constructor", "toString"] as const;

function objectPrototypeCommunityInput() {
  return {
    nodes: OBJECT_PROTOTYPE_COMMUNITY_IDS.map((community, index) => ({
      id: `node-${community}`,
      label: `Node ${index + 1}`,
      type: "topic" as const,
      community
    })),
    edges: [],
    learning: {
      communities: OBJECT_PROTOTYPE_COMMUNITY_IDS.map((id, index) => ({
        id,
        label: `${String.fromCharCode(65 + index)} Community`,
        node_count: 1,
        is_primary: index === 0
      }))
    }
  };
}

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

function relationFocusGraphData(): GraphData {
  return {
    meta: {
      build_date: "2026-06-22",
      wiki_title: "Relation focus graph",
      total_nodes: 5,
      total_edges: 4
    },
    nodes: [
      { id: "a", label: "Node a", type: "topic", community: "community-a", source_path: "wiki/a.md", content: "Node a" },
      { id: "b", label: "Node b", type: "entity", community: "community-a", source_path: "wiki/b.md", content: "Node b" },
      { id: "c", label: "Node c", type: "source", community: "community-a", source_path: "wiki/c.md", content: "Node c" },
      { id: "d", label: "Node d", type: "entity", community: "community-a", source_path: "wiki/d.md", content: "Node d" },
      { id: "e", label: "Node e", type: "entity", community: "community-a", source_path: "wiki/e.md", content: "Node e" }
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "a-c", from: "a", to: "c", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.7 },
      { id: "b-d", from: "b", to: "d", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.6 },
      { id: "d-e", from: "d", to: "e", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.5 }
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
    setData(projection, pins) {
      options = { ...options, ...projection, pins: pins || options.pins };
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
    focusCommunity(id: string) {
      options = { ...options, focus: { kind: "community", id }, sourceCommunityId: id };
      renderSigmaShellState();
    },
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
      options = { ...options, focus: null, selection: null, searchQuery: "", searchResultIds: [] };
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
    setSourceCommunityContext(id: string | null) {
      options = { ...options, sourceCommunityId: id };
      renderSigmaShellState();
    },
    resetLayout() {
      const nextPins = {};
      options = { ...options, pins: nextPins };
      renderSigmaShellState();
      input.options.callbacks.onPinsChanged?.(nextPins);
    },
    destroy() {
      shell.remove();
    }
  };

  function renderSigmaShellState(): void {
    const selection = options.selection;
    shell.dataset.focus = options.focus ? JSON.stringify(options.focus) : "";
    shell.dataset.sourceCommunityId = options.sourceCommunityId || "";
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diff(overrides: Partial<GraphDiff> & { nodeCount: number }): GraphDiff {
  return {
    addedNodes: overrides.addedNodes || [],
    removedNodes: overrides.removedNodes || [],
    recoloredNodes: overrides.recoloredNodes || [],
    addedEdges: overrides.addedEdges || [],
    removedEdges: overrides.removedEdges || [],
    newCommunities: overrides.newCommunities || [],
    migrationWarnings: overrides.migrationWarnings || [],
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
  readonly nodeType = 1;
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

  querySelector(selector: string): FakeElement | null {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    return findByClass(this, className)[0] || null;
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

function fakeSigmaRouteRuntime(): SigmaGlobalRendererRuntime & { instances: FakeRouteSigma[] } {
  const instances: FakeRouteSigma[] = [];
  class RuntimeSigma extends FakeRouteSigma {
    constructor(graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) {
      super(graph, container, settings);
      instances.push(this);
    }
  }
  return { Sigma: RuntimeSigma, GraphologyGraph, instances };
}

class FakeRouteSigma implements SigmaGlobalSigmaLike {
  private graph: SigmaGlobalGraphologyGraph;
  private readonly settings: Record<string, unknown>;
  private readonly listeners = new Map<string, Set<(payload?: unknown) => void>>();
  private readonly camera = new FakeRouteCamera();
  private readonly mouseCaptor = new FakeRouteMouseCaptor();
  readonly setGraphCalls: SigmaGlobalGraphologyGraph[] = [];

  constructor(graph: SigmaGlobalGraphologyGraph, _container: HTMLElement, settings: Record<string, unknown> = {}) {
    this.graph = graph;
    this.settings = settings;
  }

  getCamera(): FakeRouteCamera {
    return this.camera;
  }

  getMouseCaptor(): FakeRouteMouseCaptor {
    return this.mouseCaptor;
  }

  getGraph(): SigmaGlobalGraphologyGraph {
    return this.graph;
  }

  setGraph(graph: SigmaGlobalGraphologyGraph): void {
    this.graph = graph;
    this.setGraphCalls.push(graph);
  }

  getSetting(key: string): unknown {
    return this.settings[key];
  }

  setSetting(key: string, value: unknown): void {
    this.settings[key] = value;
  }

  viewportToGraph(point: { x: number; y: number }): { x: number; y: number } {
    return point;
  }

  viewportToFramedGraph(point: { x: number; y: number }): { x: number; y: number } {
    return point;
  }

  graphToViewport(point: { x: number; y: number }): { x: number; y: number } {
    return point;
  }

  refresh(): void {}

  on(event: string, listener: (payload?: unknown) => void): void {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (payload?: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) || []) listener(payload);
  }

  kill(): void {}
}

class FakeRouteCamera {
  private state = { x: 0, y: 0, angle: 0, ratio: 1 };
  private readonly listeners = new Set<() => void>();
  readonly animateCalls: Array<{
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>;
    options?: { duration?: number; easing?: string };
  }> = [];

  getState(): { x: number; y: number; angle: number; ratio: number } {
    return this.state;
  }

  setState(state: Partial<{ x: number; y: number; angle: number; ratio: number }>): void {
    this.state = { ...this.state, ...state };
    for (const listener of this.listeners) listener();
  }

  isAnimated(): boolean {
    return false;
  }

  on(event: "updated", listener: () => void): void {
    if (event === "updated") this.listeners.add(listener);
  }

  off(event: "updated", listener: () => void): void {
    if (event === "updated") this.listeners.delete(listener);
  }

  animate(
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>,
    options?: { duration?: number; easing?: string }
  ): void {
    this.animateCalls.push({ state: { ...state }, options: options ? { ...options } : undefined });
    this.setState(state);
  }
}

class FakeRouteMouseCaptor {
  private readonly listeners = new Map<string, Set<(payload?: unknown) => void>>();

  on(event: "wheel", listener: (payload?: unknown) => void): void {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: "wheel", listener: (payload?: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
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
