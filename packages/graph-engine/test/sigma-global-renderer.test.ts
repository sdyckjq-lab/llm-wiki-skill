import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  buildSigmaGlobalGraphologyGraph,
  createSigmaGlobalHitProjector,
  createSigmaGlobalRenderer,
  type SigmaGlobalGraphologyGraph,
  type SigmaGlobalRendererRuntime,
  type SigmaGlobalSigmaLike
} from "../src/render/sigma-global-renderer";
import type {
  GraphRendererAdapterData
} from "../src";
import { buildGraphRendererAdapterData } from "../src";
import type { GraphData } from "../src/types";

describe("Sigma global renderer production boundary", () => {
  it("records route ownership and graph-engine bundle boundary", () => {
    assert.equal(SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER, "facade");
    assert.deepEqual(SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY, {
      sigma: "runtime-loaded-by-sigma-global-renderer",
      graphology: "runtime-loaded-by-sigma-global-renderer",
      workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
      offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
    });
  });

  it("keeps Sigma and Graphology in runtime dependencies", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.dependencies.sigma, "^3.0.3");
    assert.equal(manifest.dependencies.graphology, "^0.26.0");
    assert.equal(manifest.devDependencies.sigma, undefined);
    assert.equal(manifest.devDependencies.graphology, undefined);
  });

  it("requires the lazy Sigma runtime boundary before creating the lifecycle", () => {
    assert.throws(
      () => createSigmaGlobalRenderer({} as never),
      /container|runtime/
    );
  });

  it("builds a Graphology render graph entirely from adapter output", () => {
    const adapterData = adapterDataFixture();
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });

    assert.equal(graph.order, 2);
    assert.equal(graph.size, 1);

    assert.deepEqual(graph.getNodeAttributes("render-alpha"), {
      x: 111,
      y: 222,
      label: "Adapter Alpha",
      size: 8,
      color: "#ef4444",
      type: "circle",
      graphNodeType: "topic",
      communityId: "adapter-community",
      sourcePath: "adapter/alpha.md",
      selected: true,
      searchHit: false,
      pinned: false,
      aggregationIds: ["adapter-aggregation"],
      labelVisible: true,
      displayMode: "card",
      visualRole: "landmark",
      priority: 900,
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: "render-alpha" }
      }
    });
    assert.deepEqual(graph.getNodeAttributes("render-beta"), {
      x: 333,
      y: 444,
      label: "",
      size: 8,
      color: "#f59e0b",
      type: "circle",
      graphNodeType: "source",
      communityId: "adapter-community",
      sourcePath: "adapter/beta.md",
      selected: false,
      searchHit: true,
      pinned: true,
      aggregationIds: ["adapter-aggregation"],
      labelVisible: false,
      displayMode: "point",
      visualRole: "map-pin",
      priority: 100,
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: "render-beta" }
      }
    });
    assert.deepEqual(graph.getEdgeAttributes("adapter-edge"), {
      size: 3,
      color: "#64748b",
      opacity: 0.42,
      relationType: "depends-on-adapter",
      confidence: "ADAPTER_CONFIDENCE",
      weight: 0.75,
      sourceCommunityId: "adapter-community",
      targetCommunityId: "adapter-community"
    });
    assert.equal(graph.source("adapter-edge"), "render-alpha");
    assert.equal(graph.target("adapter-edge"), "render-beta");
    assert.deepEqual(graph.getAttribute("communities"), [
      {
        id: "adapter-community",
        label: "Adapter Community",
        color: "#123456",
        nodeIds: ["render-alpha", "render-beta"],
        nodeCount: 2,
        selected: true,
        searchResultIds: ["render-beta"],
        pinnedNodeIds: ["render-beta"],
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [{ kind: "enter-community", communityId: "adapter-community", label: "进入社区" }]
      }
    ]);
    assert.deepEqual(graph.getAttribute("aggregations"), [
      {
        id: "adapter-aggregation",
        label: "Adapter Aggregation",
        communityId: "adapter-community",
        nodeIds: ["render-alpha", "render-beta"],
        selectedNodeIds: ["render-alpha"],
        searchResultIds: ["render-beta"],
        pinnedNodeIds: ["render-beta"],
        totalCount: 17,
        selected: true,
        color: "#abcdef",
        point: { x: 222, y: 333 },
        radius: 44,
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [
          {
            kind: "show-this-object",
            object: {
              kind: "aggregation",
              aggregationId: "adapter-aggregation",
              nodeIds: ["render-alpha", "render-beta"],
              communityId: "adapter-community"
            },
            label: "显示这个对象"
          }
        ]
      }
    ]);
    assert.deepEqual(graph.getAttribute("counts"), adapterData.counts);
    assert.deepEqual(graph.getAttribute("selection"), adapterData.selection);
  });

  it("keeps the production Sigma boundary on GraphRendererAdapterData instead of raw GraphData", async () => {
    const source = await readFile(new URL("../src/render/sigma-global-renderer.ts", import.meta.url), "utf8");
    assert.match(source, /buildSigmaGlobalGraphologyGraph\(\s*adapterData: GraphRendererAdapterData/);
    assert.doesNotMatch(source, /GraphData/);
    assert.doesNotMatch(source, /buildGraphRendererAdapterData/);
    assert.doesNotMatch(source, /\bdata\.nodes\b/);
    assert.doesNotMatch(source, /\bdata\.edges\b/);
  });

  it("keeps Sigma community overlay styles passive instead of visible circular controls", async () => {
    const styles = await readFile(new URL("../src/render/render-styles.ts", import.meta.url), "utf8");

    assert.doesNotMatch(styles, /\.sigma-global-community-wash\b/);
    assert.doesNotMatch(styles, /\.sigma-global-aggregation-container\b/);
    assert.match(styles, /\.sigma-global-community-label\b/);
  });

  it("projects Sigma node hits before overlapping community regions", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ nodeId: "render-alpha", screenPoint: { x: 111, y: 222 } }),
      { kind: "node", id: "render-alpha" }
    );
  });

  it("uses the graph spatial path for Sigma community-region hits", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ screenPoint: { x: 250, y: 250 } }),
      { kind: "community-wash", id: "adapter-community" }
    );
  });

  it("renders passive community map labels instead of circular community controls", () => {
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ communityCount: 10, selectedCommunityId: "community-9" }),
      theme: "shan-shui",
      runtime: fakeRuntime()
    });

    const communityControls = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-wash");
    const communityRegions = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-region");
    const labels = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-label");

    assert.equal(communityControls.length, 0);
    assert.equal(communityRegions.length, 10);
    assert.equal(labels.length, 8);
    assert.equal(labels[0]?.dataset.communityId, "community-9");
    assert.deepEqual(labels.map((label) => label.dataset.communityId), [
      "community-9",
      "community-10",
      "community-8",
      "community-7",
      "community-6",
      "community-5",
      "community-4",
      "community-3"
    ]);

    for (const label of labels) {
      assert.notEqual(label.tagName, "button");
      assert.equal(label.getAttribute("role"), null);
      assert.equal(label.getAttribute("aria-hidden"), "true");
      assert.equal(label.tabIndex, -1);
      assert.equal(label.style.pointerEvents, "none");
    }
    for (const region of communityRegions) {
      assert.notEqual(region.tagName, "button");
      assert.equal(region.getAttribute("aria-hidden"), "true");
      assert.equal(region.tabIndex, -1);
      assert.equal(region.style.pointerEvents, "auto");
    }

    renderer.destroy();
  });

  it("keeps dense accepted global data visibly mapped as a capped point map", () => {
    const data = densePointMapGraph();
    const adapterData = buildGraphRendererAdapterData(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "dense-1999" },
      searchResultIds: Array.from({ length: 260 }, (_, index) => `dense-${index * 3}`),
      pins: Object.fromEntries(
        data.nodes.slice(300, 560).map((node, index) => [
          node.source_path || `wiki/dense/${node.id}.md`,
          { x: 760 + (index % 24) * 4, y: 440 + Math.floor(index / 24) * 4, coordinateSpace: "world" as const }
        ])
      ),
      aggregationMarkers: [
        {
          id: "dense-aggregation",
          label: "Dense aggregation should stay hidden",
          communityId: "dense-community-0",
          nodeIds: data.nodes.slice(0, 200).map((node) => node.id),
          totalCount: 200
        }
      ]
    });
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData,
      theme: "shan-shui",
      runtime: fakeRuntime()
    });
    const ordinarySize = graph.getNodeAttribute("dense-1000", "size");
    const selectedSize = graph.getNodeAttribute("dense-1999", "size");
    const searchSize = graph.getNodeAttribute("dense-0", "size");
    const pinnedSize = graph.getNodeAttribute("dense-300", "size");
    const weakEdge = graph.getEdgeAttributes("dense-selected-weak");
    const strongEdge = graph.getEdgeAttributes("dense-selected-strong");
    const labelCount = graph.filterNodes((nodeId) => graph.getNodeAttribute(nodeId, "labelVisible")).length;
    const hitTargets = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-node-hit-target");
    const aggregationOverlays = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-aggregation-container");

    assert.equal(adapterData.renderable.counts.visibleNodes, 2000);
    assert.equal(adapterData.renderable.counts.totalEdges, 3996);
    assert.equal(adapterData.renderable.aggregationContainers.length, 0);
    assert.equal(graph.getAttribute("aggregations").length, 1);
    assert.equal(graph.order, 2000);
    assert.equal(graph.size, 1000);
    assert.ok(ordinarySize < selectedSize);
    assert.ok(ordinarySize < searchSize);
    assert.ok(ordinarySize < pinnedSize);
    assert.ok(weakEdge.opacity < strongEdge.opacity);
    assert.ok(weakEdge.size < strongEdge.size);
    assert.ok(labelCount <= adapterData.renderable.budget.limits.maxLabels);
    assert.equal(aggregationOverlays.length, 0);
    assert.ok(hitTargets.length <= 160, `hit target overlays should stay capped, got ${hitTargets.length}`);
    assert.ok(hitTargets.some((element) => element.dataset.nodeId === "dense-1999"), "selected anchor should keep a hit target");
    assert.ok(hitTargets.some((element) => element.dataset.searchHit === "true"), "search anchors should keep hit targets");
    assert.ok(hitTargets.some((element) => element.dataset.pinned === "true"), "pinned anchors should keep hit targets");

    renderer.destroy();
  });

  it("lets passive community label coordinates resolve through the underlying spatial region", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ screenPoint: { x: 250, y: 216 } }),
      { kind: "community-wash", id: "adapter-community" }
    );
  });

  it("projects Sigma blank screen hits without inventing graph semantics in the callback", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ screenPoint: { x: 490, y: 490 } }),
      { kind: "graph-blank" }
    );
  });

  it("creates, updates, preserves camera state, and destroys the Sigma lifecycle", () => {
    const container = fakeContainer();
    const runtime = fakeRuntime();
    const hits: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container,
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime,
      onHitTarget: (target) => hits.push(target)
    });
    const sigma = runtime.instances[0];

    assert.equal(renderer.id, "sigma-global");
    assert.equal(renderer.updateStrategy, "rebuild-graph-preserve-camera");
    assert.equal(container.children.length, 1);
    assert.equal(renderer.overlayRoot.children.length, 4);
    assert.equal(renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-node-hit-target").length, 2);
    assert.equal(renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-region").length, 1);
    assert.equal(renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-label").length, 1);
    assert.equal(renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-aggregation-container").length, 0);
    assert.equal(sigma.graph.order, 2);

    sigma.camera.setState({ x: 12, y: 34, angle: 0.25, ratio: 1.8 });
    const originalGraph = renderer.graph;
    const nextAdapterData = adapterDataFixture({
      selectedNodeId: "render-beta",
      searchResultIds: ["render-alpha"],
      betaPinned: false
    });
    renderer.update({ adapterData: nextAdapterData, theme: "mo-ye" });

    assert.equal(runtime.instances.length, 1);
    assert.notEqual(originalGraph, renderer.graph);
    assert.equal(sigma.graph, renderer.graph);
    assert.equal(sigma.setGraphCalls.length, 1);
    assert.deepEqual(sigma.camera.getState(), { x: 12, y: 34, angle: 0.25, ratio: 1.8 });
    assert.equal(renderer.graph.getAttribute("selection").selectedNodeIds[0], "render-beta");
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "searchHit"), true);
    assert.equal(renderer.graph.getNodeAttribute("render-beta", "pinned"), false);
    assert.equal(renderer.root.dataset.theme, "mo-ye");

    sigma.emit("clickNode", { node: "render-beta" });
    assert.deepEqual(renderer.lastHitTarget, { kind: "node", id: "render-beta" });
    assert.deepEqual(hits.at(-1), { kind: "node", id: "render-beta" });

    renderer.destroy();
    assert.equal(sigma.killed, true);
    assert.equal(container.children.length, 0);
    assert.throws(() => renderer.update({ adapterData: adapterDataFixture() }), /destroyed/);

    sigma.emit("clickNode", { node: "render-alpha" });
    assert.deepEqual(renderer.lastHitTarget, { kind: "node", id: "render-beta" });
  });

  it("reports Sigma initialization failure to the route layer", () => {
    const failure = new Error("webgl unavailable");
    const errors: unknown[] = [];

    assert.throws(
      () => createSigmaGlobalRenderer({
        container: fakeContainer(),
        adapterData: adapterDataFixture(),
        theme: "shan-shui",
        runtime: fakeRuntime({ constructError: failure }),
        onFatalError: (error) => errors.push(error)
      }),
      /webgl unavailable/
    );
    assert.deepEqual(errors, [failure]);
  });

  it("suppresses stale events after replacement and update-after-destroy", () => {
    const firstRuntime = fakeRuntime();
    const secondRuntime = fakeRuntime();
    const first = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime: firstRuntime
    });
    const firstSigma = firstRuntime.instances[0];
    first.destroy();

    const second = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ selectedNodeId: "render-beta" }),
      theme: "shan-shui",
      runtime: secondRuntime
    });
    const secondSigma = secondRuntime.instances[0];

    firstSigma.emit("clickNode", { node: "render-alpha" });
    assert.equal(first.lastHitTarget, null);
    assert.equal(second.lastHitTarget, null);

    secondSigma.emit("clickNode", { node: "render-beta" });
    assert.deepEqual(second.lastHitTarget, { kind: "node", id: "render-beta" });
    second.destroy();
    assert.throws(() => second.update({ adapterData: adapterDataFixture() }), /destroyed/);
  });

  it("reports unrecoverable update and destroy errors without choosing fallback UI", () => {
    const errors: unknown[] = [];
    const runtime = fakeRuntime({ setGraphError: new Error("graph swap failed"), killError: new Error("kill failed") });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime,
      onFatalError: (error) => errors.push(error)
    });

    renderer.update({ adapterData: adapterDataFixture({ selectedNodeId: "render-beta" }) });
    renderer.destroy();

    assert.deepEqual(errors.map((error) => String(error)), ["Error: graph swap failed", "Error: kill failed"]);
  });

  it("drags a Sigma global node and writes a world-space pin on release", () => {
    const runtime = fakeRuntime();
    const pins: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ betaPinned: false }),
      theme: "shan-shui",
      runtime,
      pins: {},
      onPinsChanged: (nextPins) => pins.push(nextPins)
    });
    const sigma = runtime.instances[0];
    const down = sigmaEventPayload("render-alpha", 116, 228);
    const move = sigmaEventPayload(null, 156, 268);
    const up = sigmaEventPayload(null, 176, 288);

    sigma.emit("downNode", down);
    sigma.emit("moveBody", move);
    sigma.emit("upStage", up);

    assert.equal(down.prevented, true);
    assert.equal(move.prevented, true);
    assert.equal(up.prevented, true);
    assert.deepEqual(pins, [
      {
        "adapter/alpha.md": {
          x: 171,
          y: 282,
          coordinateSpace: "world"
        }
      }
    ]);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "x"), 171);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "y"), 282);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "pinned"), true);
    assert.equal(sigma.settings.enableCameraPanning, true);

    renderer.destroy();
  });

  it("keeps selected search and pinned metadata intact while dragging a Sigma global node", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({
        selectedNodeId: "render-alpha",
        searchResultIds: ["render-alpha"],
        betaPinned: true
      }),
      theme: "shan-shui",
      runtime,
      pins: {
        "adapter/beta.md": { x: 333, y: 444, coordinateSpace: "world" }
      },
      onPinsChanged: () => undefined
    });
    const sigma = runtime.instances[0];

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("moveBody", sigmaEventPayload(null, 141, 252));
    sigma.emit("upNode", sigmaEventPayload("render-alpha", 151, 262));

    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "selected"), true);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "searchHit"), true);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "pinned"), true);
    assert.equal(renderer.graph.getNodeAttribute("render-beta", "pinned"), true);
    const alphaOverlay = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha");
    const betaOverlay = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-beta");
    assert.equal(alphaOverlay?.dataset.selected, "true");
    assert.equal(alphaOverlay?.dataset.searchHit, "true");
    assert.equal(alphaOverlay?.dataset.pinned, "true");
    assert.equal(betaOverlay?.dataset.pinned, "true");

    renderer.destroy();
  });

  it("keeps an already pinned Sigma global node pinned throughout drag", () => {
    const runtime = fakeRuntime();
    const pins: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({
        selectedNodeId: "render-alpha",
        searchResultIds: ["render-alpha"],
        alphaPinned: true,
        betaPinned: true
      }),
      theme: "shan-shui",
      runtime,
      pins: {
        "adapter/alpha.md": { x: 111, y: 222, coordinateSpace: "world" },
        "adapter/beta.md": { x: 333, y: 444, coordinateSpace: "world" }
      },
      onPinsChanged: (nextPins) => pins.push(nextPins)
    });
    const sigma = runtime.instances[0];

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("moveBody", sigmaEventPayload(null, 151, 262));

    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "pinned"), true);
    assert.equal(renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha")?.dataset.pinned, "true");

    sigma.emit("upStage", sigmaEventPayload(null, 171, 282));

    assert.deepEqual(pins, [
      {
        "adapter/alpha.md": { x: 171, y: 282, coordinateSpace: "world" },
        "adapter/beta.md": { x: 333, y: 444, coordinateSpace: "world" }
      }
    ]);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "pinned"), true);

    renderer.destroy();
  });

  it("cancels active Sigma node drag on destroy without stale pin writes", () => {
    const runtime = fakeRuntime();
    const pins: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ betaPinned: false }),
      theme: "shan-shui",
      runtime,
      pins: {},
      onPinsChanged: (nextPins) => pins.push(nextPins)
    });
    const sigma = runtime.instances[0];

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("moveBody", sigmaEventPayload(null, 151, 262));
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "x"), 151);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "y"), 262);

    renderer.destroy();
    sigma.emit("upStage", sigmaEventPayload(null, 171, 282));

    assert.deepEqual(pins, []);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "x"), 111);
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "y"), 222);
    assert.equal(sigma.listeners.get("downNode")?.size ?? 0, 0);
    assert.equal(sigma.listeners.get("moveBody")?.size ?? 0, 0);
    assert.equal(sigma.listeners.get("upStage")?.size ?? 0, 0);
    assert.equal(sigma.listeners.get("upNode")?.size ?? 0, 0);
    assert.equal(sigma.settings.enableCameraPanning, true);
  });

  it("does not replace overlays or swallow clicks for an un-moved drag candidate", () => {
    const runtime = fakeRuntime();
    const hits: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ betaPinned: false }),
      theme: "shan-shui",
      runtime,
      pins: {},
      onHitTarget: (target) => hits.push(target)
    });
    const sigma = runtime.instances[0];
    const alphaOverlay = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha");

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("upNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("clickNode", sigmaEventPayload("render-alpha", 111, 222));

    assert.equal(renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha"), alphaOverlay);
    assert.deepEqual(hits, [{ kind: "node", id: "render-alpha" }]);

    renderer.destroy();
  });
});

function adapterDataFixture(options: {
  selectedNodeId?: string;
  searchResultIds?: string[];
  alphaPinned?: boolean;
  betaPinned?: boolean;
  communityCount?: number;
  selectedCommunityId?: string;
} = {}): GraphRendererAdapterData {
  const selectedNodeId = options.selectedNodeId ?? "render-alpha";
  const searchResultIds = options.searchResultIds ?? ["render-beta"];
  const alphaPinned = options.alphaPinned ?? false;
  const betaPinned = options.betaPinned ?? true;
  const communityCount = options.communityCount ?? 1;
  const selectedCommunityId = options.selectedCommunityId ?? "adapter-community";
  const renderableCommunities = renderableCommunityFixture(communityCount);
  return {
    counts: {
      nodes: 2,
      edges: 1,
      communities: 1,
      hidden: 0,
      renderedNodes: 2,
      renderedEdges: 1,
      aggregationContainers: 1
    },
    selection: {
      input: { kind: "node", id: selectedNodeId },
      selectionId: `node:${selectedNodeId}`,
      selectedNodeIds: [selectedNodeId],
      selectedCommunityIds: [selectedCommunityId],
      containsCurrentObject: true
    },
    nodes: [
      {
        id: "render-alpha",
        object: { kind: "node", nodeId: "render-alpha" },
        label: "Adapter Alpha",
        type: "topic",
        communityId: "adapter-community",
        sourcePath: "adapter/alpha.md",
        point: { x: 111, y: 222 },
        selected: selectedNodeId === "render-alpha",
        searchHit: searchResultIds.includes("render-alpha"),
        pinHint: {
          nodeId: "render-alpha",
          wikiPath: "adapter/alpha.md",
          pinned: alphaPinned,
          position: alphaPinned ? { x: 111, y: 222, coordinateSpace: "world" } : null
        },
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "node-summary",
          object: { kind: "node", nodeId: "render-alpha" }
        },
        render: {
          displayMode: "card",
          visualRole: "landmark",
          priority: 900,
          labelVisible: true
        }
      },
      {
        id: "render-beta",
        object: { kind: "node", nodeId: "render-beta" },
        label: "Adapter Beta",
        type: "source",
        communityId: "adapter-community",
        sourcePath: "adapter/beta.md",
        point: { x: 333, y: 444 },
        selected: selectedNodeId === "render-beta",
        searchHit: searchResultIds.includes("render-beta"),
        pinHint: {
          nodeId: "render-beta",
          wikiPath: "adapter/beta.md",
          pinned: betaPinned,
          position: betaPinned ? { x: 333, y: 444, coordinateSpace: "world" } : null
        },
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "node-summary",
          object: { kind: "node", nodeId: "render-beta" }
        },
        render: {
          displayMode: "point",
          visualRole: "map-pin",
          priority: 100,
          labelVisible: false
        }
      }
    ],
    edges: [
      {
        id: "adapter-edge",
        sourceNodeId: "render-alpha",
        targetNodeId: "render-beta",
        sourceCommunityId: "adapter-community",
        targetCommunityId: "adapter-community",
        relationType: "depends-on-adapter",
        confidence: "ADAPTER_CONFIDENCE",
        weight: 0.75,
        render: {
          strokeWidth: 3,
          opacity: 0.42
        }
      }
    ],
    communities: [
      {
        id: "adapter-community",
        object: { kind: "community", communityId: "adapter-community" },
        label: "Adapter Community",
        nodeIds: ["render-alpha", "render-beta"],
        nodeCount: 2,
        selected: selectedCommunityId === "adapter-community",
        searchResultIds,
        pinHints: betaPinned ? [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ] : [],
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [{ kind: "enter-community", communityId: "adapter-community", label: "进入社区" }]
      },
      ...renderableCommunities
        .filter((community) => community.id !== "adapter-community")
        .map((community) => ({
          id: community.id,
          object: { kind: "community" as const, communityId: community.id },
          label: community.label,
          nodeIds: [],
          nodeCount: community.nodeCount,
          selected: selectedCommunityId === community.id,
          searchResultIds: [],
          pinHints: [],
          aggregationIds: [],
          drawerTarget: {
            summaryKind: "community-summary" as const,
            object: { kind: "community" as const, communityId: community.id }
          },
          commands: [{ kind: "enter-community" as const, communityId: community.id, label: "进入社区" }]
        }))
    ],
    aggregations: [
      {
        id: "adapter-aggregation",
        object: {
          kind: "aggregation",
          aggregationId: "adapter-aggregation",
          nodeIds: ["render-alpha", "render-beta"],
          communityId: "adapter-community"
        },
        label: "Adapter Aggregation",
        communityId: "adapter-community",
        nodeIds: ["render-alpha", "render-beta"],
        selectedNodeIds: ["render-alpha"],
        searchResultIds,
        pinnedNodeIds: betaPinned ? ["render-beta"] : [],
        totalCount: 17,
        selected: true,
        pinHints: betaPinned ? [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ] : [],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [
          {
            kind: "show-this-object",
            object: {
              kind: "aggregation",
              aggregationId: "adapter-aggregation",
              nodeIds: ["render-alpha", "render-beta"],
              communityId: "adapter-community"
            },
            label: "显示这个对象"
          }
        ]
      }
    ],
    renderable: {
      nodes: [],
      edges: [],
      communities: renderableCommunities,
      aggregationContainers: [
        {
          id: "adapter-aggregation",
          role: "aggregation-container",
          label: "Adapter Aggregation",
          communityId: "adapter-community",
          nodeIds: ["render-alpha", "render-beta"],
          nodeCount: 17,
          searchHitCount: 1,
          pinnedCount: betaPinned ? 1 : 0,
          selectedCount: 1,
          selected: true,
          searchResultIds,
          pinnedNodeIds: betaPinned ? ["render-beta"] : [],
          selectedNodeIds: [selectedNodeId],
          pinHints: betaPinned ? [
            {
              nodeId: "render-beta",
              wikiPath: "adapter/beta.md",
              pinned: true,
              position: { x: 333, y: 444, coordinateSpace: "world" }
            }
          ] : [],
          point: { x: 222, y: 333 },
          x: 22,
          y: 33,
          radius: 44,
          color: "#abcdef"
        }
      ],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId,
      selectedCommunityId: "adapter-community",
      selectedNodeIds: [selectedNodeId],
      hiddenNodeIds: new Set(),
      searchResultIds,
      worldBounds: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
      budgets: {
        limits: {
          maxNodes: 2,
          maxEdges: 1,
          maxLabels: 1,
          maxCards: 1,
          maxInteractionUpdates: 3,
          maxVisibleCommunities: 1
        },
        usage: {
          nodes: 2,
          edges: 1,
          labels: 1,
          cards: 1,
          interactionUpdate: 3,
          activeInteraction: 3,
          communities: 1,
          aggregationContainers: 1
        }
      },
      qualityNotice: null,
      communityFocus: null,
      communityQuality: {
        boundaryCertainty: "high",
        skeletonLabel: "stable",
        hiddenNodeCount: 0,
        hiddenEdgeCount: 0,
        stableCoreNodeIds: ["render-alpha"],
        stableSkeletonEdgeIds: ["adapter-edge"],
        temporaryBoostNodeIds: []
      }
    }
  };
}

function densePointMapGraph(): GraphData {
  const nodeCount = 2000;
  const edgeTarget = 3996;
  const communityCount = 16;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `dense-${index}`,
    label: `Dense node ${index}`,
    type: index % 17 === 0 ? "topic" : index % 29 === 0 ? "source" : "entity",
    community: `dense-community-${index % communityCount}`,
    source_path: `wiki/dense/dense-${index}.md`,
    weight: 100 - (index % 97),
    x: (index * 37) % 100,
    y: (index * 53) % 100
  }));
  const edges: NonNullable<GraphData["edges"]> = [
    {
      id: "dense-selected-weak",
      from: "dense-1999",
      to: "dense-1",
      type: "INFERRED",
      confidence: "INFERRED",
      relation_type: "依赖",
      weight: 0
    },
    {
      id: "dense-selected-strong",
      from: "dense-1999",
      to: "dense-2",
      type: "EXTRACTED",
      confidence: "EXTRACTED",
      relation_type: "实现",
      weight: 1
    }
  ];

  for (let index = 0; edges.length < edgeTarget; index += 1) {
    const source = index % nodeCount;
    const target = (source + 1 + (index % 113)) % nodeCount;
    if (source === target) continue;
    edges.push({
      id: `dense-edge-${index}`,
      from: `dense-${source}`,
      to: `dense-${target}`,
      type: index % 5 === 0 ? "INFERRED" : "EXTRACTED",
      confidence: index % 5 === 0 ? "INFERRED" : "EXTRACTED",
      relation_type: index % 7 === 0 ? "对比" : "依赖",
      weight: (index % 11) / 10
    });
  }

  return {
    meta: {
      build_date: "2026-06-21T00:00:00.000Z",
      wiki_title: "Dense Point Map Fixture",
      total_nodes: nodes.length,
      total_edges: edges.length
    },
    nodes,
    edges,
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "dense-0", recommended_start_reason: "dense_fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: Array.from({ length: communityCount }, (_, index) => ({
        id: `dense-community-${index}`,
        label: `Dense Community ${index}`,
        node_count: nodes.filter((node) => node.community === `dense-community-${index}`).length,
        color_index: index,
        recommended_start_node_id: index === 0 ? "dense-0" : null
      }))
    }
  };
}

function renderableCommunityFixture(count: number): GraphRendererAdapterData["renderable"]["communities"] {
  if (count <= 1) {
    return [
      {
        id: "adapter-community",
        label: "Adapter Community",
        color: "#123456",
        nodeCount: 2,
        boundaryCertainty: "high",
        wash: { cx: 250, cy: 250, rx: 80, ry: 60, opacity: 0.2 }
      }
    ];
  }

  return Array.from({ length: count }, (_, index) => {
    const communityNumber = index + 1;
    return {
      id: `community-${communityNumber}`,
      label: `Community ${communityNumber}`,
      color: `#1234${String(index).padStart(2, "0")}`,
      nodeCount: communityNumber,
      boundaryCertainty: "high",
      wash: { cx: 80 + index * 30, cy: 120 + index * 20, rx: 35 + index, ry: 24 + index, opacity: 0.2 }
    };
  });
}

function fakeContainer(): HTMLElement & { children: HTMLElement[] } {
  const children: HTMLElement[] = [];
  const container = {
    ownerDocument: {
      createElement: (tagName: string) => fakeElement(tagName)
    },
    append: (child: HTMLElement) => {
      children.push(child);
    },
    children
  } as unknown as HTMLElement & { children: HTMLElement[] };
  containerRegistry.push(container);
  return container;
}

function fakeElement(_tagName: string): HTMLElement {
  const children: HTMLElement[] = [];
  const attributes = new Map<string, string>();
  const element = {
    tagName: _tagName,
    className: "",
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    children,
    tabIndex: -1,
    textContent: "",
    ownerDocument: null as unknown as Document,
    append: (...items: HTMLElement[]) => {
      children.push(...items);
    },
    prepend: (...items: HTMLElement[]) => {
      children.unshift(...items);
    },
    replaceChildren: (...items: HTMLElement[]) => {
      children.splice(0, children.length, ...items);
    },
    addEventListener: () => undefined,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, String(value));
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    querySelector: () => null,
    remove: () => undefined
  };
  element.ownerDocument = {
    createElement: (tagName: string) => {
      const child = fakeElement(tagName);
      child.ownerDocument = element.ownerDocument;
      return child;
    }
  } as unknown as Document;
  element.remove = () => {
    // The fake container owns removal by filtering on object identity below.
    for (const container of fakeContainersWith(element as unknown as HTMLElement)) {
      const index = container.children.indexOf(element as unknown as HTMLElement);
      if (index >= 0) container.children.splice(index, 1);
    }
  };
  return element as unknown as HTMLElement;
}

const containerRegistry: Array<HTMLElement & { children: HTMLElement[] }> = [];

function fakeContainersWith(child: HTMLElement): Array<HTMLElement & { children: HTMLElement[] }> {
  return containerRegistry.filter((container) => container.children.includes(child));
}

function fakeRuntime(options: {
  constructError?: Error;
  setGraphError?: Error;
  killError?: Error;
} = {}): SigmaGlobalRendererRuntime & { instances: FakeSigma[] } {
  const instances: FakeSigma[] = [];
  class RuntimeSigma extends FakeSigma {
    constructor(graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) {
      if (options.constructError) throw options.constructError;
      super(graph, container, settings, options);
      instances.push(this);
    }
  }
  return {
    Sigma: RuntimeSigma,
    GraphologyGraph,
    instances
  };
}

function sigmaEventPayload(node: string | null, x: number, y: number): {
  node?: string;
  event: { x: number; y: number };
  prevented: boolean;
  preventSigmaDefault: () => void;
} {
  const payload = {
    ...(node ? { node } : {}),
    event: { x, y },
    prevented: false,
    preventSigmaDefault: () => {
      payload.prevented = true;
    }
  };
  return payload;
}

class FakeSigma implements SigmaGlobalSigmaLike {
  graph: SigmaGlobalGraphologyGraph;
  readonly container: HTMLElement;
  readonly settings: Record<string, unknown>;
  readonly camera = new FakeCamera();
  readonly listeners = new Map<string, Set<(payload?: unknown) => void>>();
  readonly setGraphCalls: SigmaGlobalGraphologyGraph[] = [];
  killed = false;

  constructor(
    graph: SigmaGlobalGraphologyGraph,
    container: HTMLElement,
    settings: Record<string, unknown> = {},
    private readonly options: { setGraphError?: Error; killError?: Error } = {}
  ) {
    this.graph = graph;
    this.container = container;
    this.settings = settings;
  }

  getCamera(): FakeCamera {
    return this.camera;
  }

  getGraph(): SigmaGlobalGraphologyGraph {
    return this.graph;
  }

  setGraph(graph: SigmaGlobalGraphologyGraph): void {
    if (this.options.setGraphError) throw this.options.setGraphError;
    this.graph = graph;
    this.setGraphCalls.push(graph);
  }

  setSetting(key: string, value: unknown): void {
    this.settings[key] = value;
  }

  refresh(): void {
    this.settings.refreshed = true;
  }

  viewportToGraph(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }

  graphToViewport(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }

  on(event: string, listener: (payload?: unknown) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (payload?: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  kill(): void {
    this.killed = true;
    if (this.options.killError) throw this.options.killError;
  }
}

class FakeCamera {
  private state = { x: 0, y: 0, angle: 0, ratio: 1 };

  getState(): { x: number; y: number; angle: number; ratio: number } {
    return { ...this.state };
  }

  setState(state: Partial<{ x: number; y: number; angle: number; ratio: number }>): void {
    this.state = { ...this.state, ...state };
  }
}
