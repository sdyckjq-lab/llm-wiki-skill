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
  sigmaGlobalEdgeStyle,
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
      size: 10,
      color: "#ef4444",
      type: "circle",
      graphNodeType: "topic",
      communityId: "adapter-community",
      sourcePath: "adapter/alpha.md",
      selected: true,
      searchHit: false,
      pinned: false,
      communityDimmed: false,
      communitySpotlightVisible: true,
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
      size: 10,
      color: "#f59e0b",
      type: "circle",
      graphNodeType: "source",
      communityId: "adapter-community",
      sourcePath: "adapter/beta.md",
      selected: false,
      searchHit: true,
      pinned: true,
      communityDimmed: false,
      communitySpotlightVisible: true,
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
      size: 1.13,
      color: "rgba(49, 95, 114, 0.145)",
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

  it("passes selected communities into Sigma global focus edge styling", () => {
    const adapterData = adapterDataFixture({ communityCount: 3, selectedCommunityIds: ["community-1"] });
    const graph = buildSigmaGlobalGraphologyGraph(
      adapterData,
      { GraphologyGraph },
      "shan-shui",
      { semanticEmphasis: false, focusHighlight: true }
    );

    assert.deepEqual(graph.getEdgeAttributes("adapter-edge"), {
      size: 0.62,
      color: "rgba(49, 95, 114, 0.05)",
      relationType: "depends-on-adapter",
      confidence: "ADAPTER_CONFIDENCE",
      weight: 0.75,
      sourceCommunityId: "adapter-community",
      targetCommunityId: "adapter-community"
    });
  });

  it("dims ordinary nodes outside the selected community while keeping priority nodes visible", () => {
    const adapterData = nodeSpotlightAdapterData();
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });

    assert.equal(graph.getNodeAttribute("alpha-ordinary", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("beta-ordinary", "communityDimmed"), true);
    assert.equal(graph.getNodeAttribute("beta-ordinary", "color"), "rgba(18, 52, 1, 0.2)");
    assert.equal(graph.getNodeAttribute("beta-ordinary", "size"), 3.6);
    assert.equal(graph.getNodeAttribute("beta-search", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("beta-search", "communitySpotlightVisible"), true);
    assert.equal(graph.getNodeAttribute("beta-pinned", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("alpha-selected", "communityDimmed"), false);
  });

  it("does not dim nodes when there is no community selection spotlight", () => {
    const adapterData = nodeSpotlightAdapterData({ selectionKind: "node" });
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });

    assert.equal(graph.getNodeAttribute("beta-ordinary", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("beta-ordinary", "color"), "#123401");
    assert.equal(graph.getNodeAttribute("beta-ordinary", "size"), 5);
  });

  it("styles Sigma global edges by relation and community scope without confidence opacity", () => {
    const intraNeutral = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "依赖",
      sourceCommunityId: "c1",
      targetCommunityId: "c1",
      confidence: "EXTRACTED",
      weight: 0
    }), "shan-shui");
    const bridgeNeutral = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "依赖",
      sourceCommunityId: "c1",
      targetCommunityId: "c2",
      confidence: "EXTRACTED",
      weight: 0
    }), "shan-shui");
    const contrast = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "对比",
      sourceCommunityId: "c1",
      targetCommunityId: "c1",
      confidence: "EXTRACTED",
      weight: 0.5
    }), "shan-shui");
    const conflictDark = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "矛盾",
      sourceCommunityId: "c1",
      targetCommunityId: "c2",
      confidence: "EXTRACTED",
      weight: 1
    }), "mo-ye");
    const neutralDark = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "依赖",
      sourceCommunityId: "c1",
      targetCommunityId: "c1",
      confidence: "EXTRACTED",
      weight: 0
    }), "mo-ye");

    assert.deepEqual(intraNeutral, { color: "rgba(49, 95, 114, 0.1)", size: 0.72 });
    assert.deepEqual(bridgeNeutral, { color: "rgba(49, 95, 114, 0.34)", size: 1.1 });
    assert.deepEqual(contrast, { color: "rgba(183, 121, 31, 0.54)", size: 1.55 });
    assert.deepEqual(conflictDark, { color: "rgba(244, 114, 182, 0.66)", size: 2.25 });
    assert.deepEqual(neutralDark, { color: "rgba(142, 135, 120, 0.1)", size: 0.72 });
  });

  it("keeps global confidence out of Sigma edge styling", () => {
    const extracted = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "依赖",
      confidence: "EXTRACTED",
      weight: 0.4
    }), "shan-shui");
    const inferred = sigmaGlobalEdgeStyle(sigmaEdgeFixture({
      relationType: "依赖",
      confidence: "INFERRED",
      weight: 0.4
    }), "shan-shui");

    assert.deepEqual(inferred, extracted);
  });

  it("lets semantic emphasis thin neutral edges and lift semantic edges", () => {
    const style = { semanticEmphasis: true, focusHighlight: false };
    const neutralBase = sigmaGlobalEdgeStyle(sigmaEdgeFixture({ relationType: "依赖", weight: 0.5 }), "shan-shui");
    const neutralEmphasis = sigmaGlobalEdgeStyle(sigmaEdgeFixture({ relationType: "依赖", weight: 0.5 }), "shan-shui", style);
    const contrastBase = sigmaGlobalEdgeStyle(sigmaEdgeFixture({ relationType: "对比", weight: 0.5 }), "shan-shui");
    const contrastEmphasis = sigmaGlobalEdgeStyle(sigmaEdgeFixture({ relationType: "对比", weight: 0.5 }), "shan-shui", style);

    assert.ok(edgeStyleAlpha(neutralEmphasis.color) < edgeStyleAlpha(neutralBase.color));
    assert.ok(neutralEmphasis.size < neutralBase.size);
    assert.ok(edgeStyleAlpha(contrastEmphasis.color) > edgeStyleAlpha(contrastBase.color));
    assert.ok(contrastEmphasis.size > contrastBase.size);
  });

  it("uses focus highlight only when selected communities exist", () => {
    const style = { semanticEmphasis: false, focusHighlight: true };
    const selectedCommunities = new Set(["c1"]);
    const touchedEdge = sigmaEdgeFixture({
      relationType: "依赖",
      sourceCommunityId: "c1",
      targetCommunityId: "c2",
      weight: 0.4
    });
    const untouchedEdge = sigmaEdgeFixture({
      relationType: "依赖",
      sourceCommunityId: "c2",
      targetCommunityId: "c3",
      weight: 0.4
    });

    const touchedBase = sigmaGlobalEdgeStyle(touchedEdge, "shan-shui");
    const touchedFocused = sigmaGlobalEdgeStyle(touchedEdge, "shan-shui", style, selectedCommunities);
    const untouchedBase = sigmaGlobalEdgeStyle(untouchedEdge, "shan-shui");
    const untouchedFocused = sigmaGlobalEdgeStyle(untouchedEdge, "shan-shui", style, selectedCommunities);
    const noSelectionFocused = sigmaGlobalEdgeStyle(untouchedEdge, "shan-shui", style, new Set());

    assert.ok(edgeStyleAlpha(touchedFocused.color) >= edgeStyleAlpha(touchedBase.color));
    assert.ok(touchedFocused.size >= touchedBase.size);
    assert.ok(edgeStyleAlpha(untouchedFocused.color) < edgeStyleAlpha(untouchedBase.color));
    assert.ok(untouchedFocused.size < untouchedBase.size);
    assert.deepEqual(noSelectionFocused, untouchedBase);
  });

  it("treats missing community ids as non-bridge edges without accidental focus lift", () => {
    const style = { semanticEmphasis: false, focusHighlight: true };
    const partialCommunityEdge = sigmaEdgeFixture({
      sourceCommunityId: null,
      targetCommunityId: "c2",
      relationType: "依赖",
      weight: 0
    });
    const missingCommunityEdge = sigmaEdgeFixture({
      sourceCommunityId: null,
      targetCommunityId: null,
      relationType: "依赖",
      weight: 0
    });

    assert.deepEqual(
      sigmaGlobalEdgeStyle(partialCommunityEdge, "shan-shui"),
      { color: "rgba(49, 95, 114, 0.1)", size: 0.72 }
    );
    assert.deepEqual(
      sigmaGlobalEdgeStyle(missingCommunityEdge, "shan-shui", style, new Set(["c1"])),
      { color: "rgba(49, 95, 114, 0.05)", size: 0.6 }
    );
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

  it("keeps mo-ye renderer backgrounds on the shared paper texture layers", async () => {
    const styles = await readFile(new URL("../src/render/render-styles.ts", import.meta.url), "utf8");
    const block = styles.match(/\.llm-wiki-graph-engine\[data-theme="mo-ye"\]\s*\{[\s\S]*?background:\s*([\s\S]*?);\n\}/)?.[1] ?? "";

    assert.match(block, /var\(--paper-glow/);
    assert.match(block, /var\(--paper-vignette/);
    assert.match(block, /var\(--paper-mottle/);
  });

  it("hides confidence rows only inside the Sigma global route legend", async () => {
    const styles = await readFile(new URL("../src/render/render-styles.ts", import.meta.url), "utf8");
    const hiddenConfidenceSelectors = [...styles.matchAll(/^\s*([^{}\n]*\.graph-edge-legend-group:has\(\.graph-edge-legend-confidence\)[^{}\n]*)\s*\{[^}]*display:\s*none/gm)]
      .map((match) => match[1].replace(/\s+/g, " ").trim());

    assert.match(styles, /\.sigma-global-route\s+\.graph-edge-legend-group:has\(\.graph-edge-legend-confidence\)\s*\{[\s\S]*display:\s*none/);
    assert.deepEqual(hiddenConfidenceSelectors, [
      ".sigma-global-route .graph-edge-legend-group:has(.graph-edge-legend-confidence)"
    ]);
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
      assert.equal(region.style.pointerEvents, "none");
    }

    renderer.destroy();
  });

  it("keeps all selected Sigma communities active instead of dimming later selections", () => {
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ communityCount: 3, selectedCommunityIds: ["community-1", "community-2"] }),
      theme: "shan-shui",
      runtime: fakeRuntime()
    });

    const selectedOne = renderer.overlayRoot.children.find((child) => child.dataset.communityId === "community-1");
    const selectedTwo = renderer.overlayRoot.children.find((child) => child.dataset.communityId === "community-2");
    const unselected = renderer.overlayRoot.children.find((child) => child.dataset.communityId === "community-3");
    const labels = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-label");
    const labelOne = labels.find((child) => child.dataset.communityId === "community-1");
    const labelTwo = labels.find((child) => child.dataset.communityId === "community-2");
    const labelThree = labels.find((child) => child.dataset.communityId === "community-3");

    assert.equal(selectedOne?.dataset.selected, "true");
    assert.equal(selectedTwo?.dataset.selected, "true");
    assert.equal(unselected?.dataset.selected, "false");
    assert.equal(labelOne?.dataset.dim, "false");
    assert.equal(labelTwo?.dataset.dim, "false");
    assert.equal(labelThree?.dataset.dim, "true");

    renderer.destroy();
  });

  it("keeps community spotlight overlays at community level without expanding every selected node", () => {
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }),
      theme: "shan-shui",
      runtime: fakeRuntime()
    });

    const nodeTargets = renderer.overlayRoot.children
      .filter((child) => child.className === "sigma-global-node-hit-target")
      .map((child) => child.dataset.nodeId);

    assert.deepEqual(nodeTargets.sort(), ["beta-pinned", "beta-search"]);

    renderer.destroy();
  });

  it("renders fallback ellipse clouds and routes SVG shape clicks to community selection", () => {
    const hits: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime: fakeRuntime(),
      onHitTarget: (target) => hits.push(target)
    });

    const shape = sigmaCommunityCloudShape(renderer, "adapter-community");

    assert.equal(shape?.tagName, "ellipse");
    assert.equal(shape?.getAttribute("fill"), "#123456");
    assert.equal(shape?.getAttribute("fill-opacity"), "0.2");
    assert.match(shape?.getAttribute("filter") ?? "", /^url\(#sigma-community-cloud-blur-/);

    shape?.dispatchEvent(new Event("click"));

    assert.deepEqual(hits.at(-1), { kind: "community-wash", id: "adapter-community" });

    renderer.destroy();
  });

  it("renders polygon clouds from cached community hull points", () => {
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataWithPolygonCommunityCloud(),
      theme: "shan-shui",
      runtime: fakeRuntime()
    });

    const shape = sigmaCommunityCloudShape(renderer, "adapter-community");
    const points = shape?.getAttribute("points") ?? "";

    assert.equal(shape?.tagName, "polygon");
    assert.ok(points.split(" ").length >= 3, `polygon should expose hull points, got ${points}`);

    renderer.destroy();
  });

  it("caps polygon clouds to the computed community wash bounds", () => {
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataWithPolygonCommunityOutlier(),
      theme: "shan-shui",
      runtime: fakeRuntime()
    });

    const region = sigmaCommunityRegion(renderer, "adapter-community");
    const shape = sigmaCommunityCloudShape(renderer, "adapter-community");

    assert.equal(shape?.tagName, "polygon");
    assert.ok(Number.parseFloat(region?.style.left ?? "0") >= 170);
    assert.ok(Number.parseFloat(region?.style.top ?? "0") >= 190);
    assert.ok(Number.parseFloat(region?.style.width ?? "0") <= 160);
    assert.ok(Number.parseFloat(region?.style.height ?? "0") <= 120);

    renderer.destroy();
  });

  it("refreshes community cloud geometry after a node drag commits", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataWithPolygonCommunityCloud(),
      theme: "shan-shui",
      runtime,
      pins: {},
      onPinsChanged: () => undefined
    });
    const sigma = runtime.instances[0];
    const initialRegion = sigmaCommunityRegion(renderer, "adapter-community");
    const initialLeft = Number.parseFloat(initialRegion?.style.left ?? "0");

    sigma.emit("downNode", sigmaEventPayload("render-alpha", 111, 222));
    sigma.emit("moveBody", sigmaEventPayload(null, 151, 222));
    sigma.emit("upStage", sigmaEventPayload(null, 171, 222));

    const movedRegion = sigmaCommunityRegion(renderer, "adapter-community");
    const movedLeft = Number.parseFloat(movedRegion?.style.left ?? "0");

    // Phase 2：region 元素按 id 复用（同一实例），拖拽提交后只更新位置/几何。
    assert.equal(movedRegion, initialRegion);
    assert.ok(movedLeft > initialLeft, `expected cloud to follow dragged node, got ${initialLeft} -> ${movedLeft}`);

    renderer.destroy();
  });

  it("refreshes community cloud geometry across same-id data updates", () => {
    const runtime = fakeRuntime();
    const initialData = adapterDataWithPolygonCommunityCloud();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: initialData,
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];
    const initialRegion = sigmaCommunityRegion(renderer, "adapter-community");
    const initialLeft = Number.parseFloat(initialRegion?.style.left ?? "0");
    const movedData: GraphRendererAdapterData = {
      ...initialData,
      nodes: initialData.nodes.map((node) => node.id === "render-alpha"
        ? { ...node, point: { x: 171, y: node.point.y } }
        : node)
    };

    renderer.update({ adapterData: movedData });

    const movedRegion = sigmaCommunityRegion(renderer, "adapter-community");
    const movedLeft = Number.parseFloat(movedRegion?.style.left ?? "0");

    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "x"), 171);
    assert.equal(sigma.setGraphCalls.length, 0);
    assert.equal(movedRegion, initialRegion);
    assert.ok(movedLeft > initialLeft, `expected cloud to follow updated node, got ${initialLeft} -> ${movedLeft}`);

    renderer.destroy();
  });

  it("refreshes the Sigma canvas and overlays when the host resizes", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    let observedElement: Element | null = null;
    let disconnected = false;
    class FakeResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(target: Element): void {
        observedElement = target;
      }
      unobserve(): void {}
      disconnect(): void {
        disconnected = true;
      }
    }

    const container = fakeContainer({ ResizeObserver: FakeResizeObserver as typeof ResizeObserver });
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container,
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];
    let refreshCount = 0;
    sigma.refresh = () => {
      refreshCount += 1;
      sigma.settings.refreshed = true;
    };
    const previousOverlayElement = renderer.overlayRoot.children[0];

    assert.equal(observedElement, renderer.root);
    assert.equal(sigma.settings.refreshed, undefined);

    resizeCallback?.([resizeObserverEntry(480, 320)], {} as ResizeObserver);

    assert.equal(sigma.settings.refreshed, true);
    assert.equal(refreshCount, 1);
    // Phase 2：resize 走 reposition 路径，复用已有覆盖层元素（不再重建）。
    assert.equal(renderer.overlayRoot.children[0], previousOverlayElement);
    const resizedOverlayElement = renderer.overlayRoot.children[0];

    resizeCallback?.([resizeObserverEntry(480, 320)], {} as ResizeObserver);

    assert.equal(refreshCount, 1);
    assert.equal(renderer.overlayRoot.children[0], resizedOverlayElement);

    renderer.destroy();
    assert.equal(disconnected, true);
  });

  it("repositions overlays on camera updates without rebuilding DOM or rebinding listeners", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    const doc = renderer.root.ownerDocument as unknown as {
      createElement: (tag: string) => HTMLElement;
      createElementNS: (ns: string, tag: string) => HTMLElement;
    };
    let created = 0;
    const originalCreate = doc.createElement;
    const originalCreateNS = doc.createElementNS;
    doc.createElement = (tag) => {
      created += 1;
      return originalCreate(tag);
    };
    doc.createElementNS = (ns, tag) => {
      created += 1;
      return originalCreateNS(ns, tag);
    };

    const overlay = renderer.overlayRoot as unknown as { replaceChildren: (...items: HTMLElement[]) => void };
    let replaced = 0;
    const originalReplace = overlay.replaceChildren.bind(overlay);
    overlay.replaceChildren = (...items) => {
      replaced += 1;
      originalReplace(...items);
    };

    const before = [...renderer.overlayRoot.children];
    const nodeBefore = before.find((child) => child.dataset.nodeId);
    assert.ok(nodeBefore, "fixture should render at least one node hit target");

    sigma.emit("afterRender");
    sigma.emit("afterRender");
    sigma.emit("afterRender");

    assert.equal(created, 0, "camera updates must not create overlay elements");
    assert.equal(replaced, 0, "camera updates must not replace overlay children");
    assert.equal(renderer.overlayRoot.children.length, before.length);
    assert.ok(
      before.every((child, index) => renderer.overlayRoot.children[index] === child),
      "overlay element instances must be reused across camera updates"
    );
    assert.equal(
      renderer.overlayRoot.children.find((child) => child.dataset.nodeId === nodeBefore?.dataset.nodeId),
      nodeBefore
    );

    renderer.destroy();
  });

  it("reuses overlay elements across data updates and prunes removed communities", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ communityCount: 3 }),
      theme: "shan-shui",
      runtime
    });

    const regionsBefore = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-region");
    const alphaBefore = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha");
    assert.equal(regionsBefore.length, 3);
    assert.ok(alphaBefore, "alpha node hit target should render initially");

    // Update: collapse to a single community (community-1..3 removed, adapter-community added),
    // keep alpha qualifying for the overlay via searchHit so its element can be reused.
    renderer.update({
      adapterData: adapterDataFixture({ communityCount: 1, selectedNodeId: "render-beta", searchResultIds: ["render-alpha"] })
    });

    const regionsAfter = renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-community-region");
    assert.equal(regionsAfter.length, 1, "removed community regions must be pruned");
    assert.equal(regionsAfter[0].dataset.communityId, "adapter-community");
    assert.ok(
      !renderer.overlayRoot.children.some((child) => child.dataset.communityId === "community-1"),
      "stale community-1 region must be gone from the DOM"
    );

    const alphaAfter = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-alpha");
    assert.equal(alphaAfter, alphaBefore, "node hit target must be reused across update, not recreated");
    assert.equal(alphaAfter?.dataset.selected, "false", "reused element must refresh data-derived attributes");
    assert.equal(alphaAfter?.dataset.searchHit, "true");
    const betaAfter = renderer.overlayRoot.children.find((child) => child.dataset.nodeId === "render-beta");
    assert.equal(betaAfter?.dataset.selected, "true");

    renderer.destroy();
  });

  it("coalesces rapid host resize notifications into one animation frame", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const animationFrames: FrameRequestCallback[] = [];
    class FakeResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    const container = fakeContainer({
      ResizeObserver: FakeResizeObserver as typeof ResizeObserver,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      },
      cancelAnimationFrame: () => undefined
    });
    const runtime = fakeRuntime();
    createSigmaGlobalRenderer({
      container,
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];
    let refreshCount = 0;
    sigma.refresh = () => {
      refreshCount += 1;
    };

    resizeCallback?.([resizeObserverEntry(480, 320)], {} as ResizeObserver);
    resizeCallback?.([resizeObserverEntry(520, 340)], {} as ResizeObserver);
    resizeCallback?.([resizeObserverEntry(560, 360)], {} as ResizeObserver);

    assert.equal(refreshCount, 0);
    assert.equal(animationFrames.length, 1);

    animationFrames.shift()?.(0);

    assert.equal(refreshCount, 1);
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
    assert.ok(edgeStyleAlpha(weakEdge.color) < edgeStyleAlpha(strongEdge.color));
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

  it("patches node spotlight attributes in place when community selection changes", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];
    const originalGraph = renderer.graph;
    const overlay = renderer.overlayRoot as unknown as { replaceChildren: (...items: HTMLElement[]) => void };
    let replaced = 0;
    const originalReplace = overlay.replaceChildren.bind(overlay);
    overlay.replaceChildren = (...items) => {
      replaced += 1;
      originalReplace(...items);
    };
    const originalChildren = [...renderer.overlayRoot.children];

    assert.equal(renderer.graph.getNodeAttribute("beta-ordinary", "communityDimmed"), true);

    renderer.update({
      adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-2" })
    });

    assert.equal(renderer.graph, originalGraph);
    assert.equal(sigma.setGraphCalls.length, 0);
    assert.equal(renderer.graph.getNodeAttribute("alpha-ordinary", "communityDimmed"), true);
    assert.equal(renderer.graph.getNodeAttribute("beta-ordinary", "communityDimmed"), false);
    assert.deepEqual(renderer.graph.getAttribute("selection").input, { kind: "community", id: "community-2" });
    assert.equal(replaced, 1);
    assert.equal(renderer.overlayRoot.children.length, originalChildren.length);

    renderer.destroy();
  });

  it("animates the Sigma camera to the latest selected community spotlight in Sigma camera coordinates", () => {
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });
    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-2" }) });

    assert.equal(sigma.camera.animateCalls.length, 2);
    assert.deepEqual(sigma.camera.animateCalls.at(0), {
      state: { x: 0.48, y: 0.6, angle: 0, ratio: 0.92 },
      options: { duration: 380, easing: "quadraticInOut" }
    });
    assert.deepEqual(sigma.camera.activeAnimationTarget, { x: 0.63, y: 0.7, angle: 0, ratio: 0.846 });
    assert.deepEqual(sigma.camera.getState(), { x: 0.63, y: 0.7, angle: 0, ratio: 0.846 });

    renderer.destroy();
  });

  it("sets the Sigma camera instantly when reduced motion is requested", () => {
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer({
        matchMedia: () => ({ matches: true }) as MediaQueryList
      } as FakeDefaultView),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });

    assert.equal(sigma.camera.animateCalls.length, 0);
    assert.deepEqual(sigma.camera.setStateCalls.at(-1), { x: 0.48, y: 0.6, angle: 0, ratio: 0.92 });
    assert.deepEqual(sigma.camera.getState(), { x: 0.48, y: 0.6, angle: 0, ratio: 0.92 });

    renderer.destroy();
  });

  it("does not move the Sigma camera when the selected community is already framed", () => {
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];
    sigma.camera.setState({ x: 0.48, y: 0.6, ratio: 0.92 });

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });

    assert.equal(sigma.camera.animateCalls.length, 0);
    assert.deepEqual(sigma.camera.getState(), { x: 0.48, y: 0.6, angle: 0, ratio: 0.92 });

    renderer.destroy();
  });

  it("resets the Sigma camera back to the full global composition", () => {
    const runtime = fakeRuntime({ worldScale: 200 });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectionKind: null }),
      theme: "shan-shui",
      runtime
    });
    const sigma = runtime.instances[0];

    renderer.update({ adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }) });
    renderer.resetView();

    assert.deepEqual(sigma.camera.setStateCalls.at(-1), { x: 0.5, y: 0.5, angle: 0, ratio: 1 });
    assert.deepEqual(sigma.camera.getState(), { x: 0.5, y: 0.5, angle: 0, ratio: 1 });

    renderer.destroy();
  });

  it("keeps the full graph rebuild path for theme changes", () => {
    const runtime = fakeRuntime();
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-1" }),
      theme: "shan-shui",
      runtime
    });

    renderer.update({
      adapterData: nodeSpotlightAdapterData({ selectedCommunityId: "community-2" }),
      theme: "mo-ye"
    });

    assert.equal(runtime.instances[0].setGraphCalls.length, 1);

    renderer.destroy();
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

    renderer.update({ adapterData: adapterDataFixture({ selectedNodeId: "render-beta" }), theme: "mo-ye" });
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
  selectedCommunityIds?: string[];
} = {}): GraphRendererAdapterData {
  const selectedNodeId = options.selectedNodeId ?? "render-alpha";
  const searchResultIds = options.searchResultIds ?? ["render-beta"];
  const alphaPinned = options.alphaPinned ?? false;
  const betaPinned = options.betaPinned ?? true;
  const communityCount = options.communityCount ?? 1;
  const selectedCommunityIds = options.selectedCommunityIds ?? [options.selectedCommunityId ?? "adapter-community"];
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
      selectedCommunityIds,
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
        selected: selectedCommunityIds.includes("adapter-community"),
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
          selected: selectedCommunityIds.includes(community.id),
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
      selectedCommunityId: selectedCommunityIds[0] ?? null,
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

function nodeSpotlightAdapterData(options: {
  selectedCommunityId?: "community-1" | "community-2";
  selectionKind?: "community" | "node" | null;
} = {}): GraphRendererAdapterData {
  const selectedCommunityId = options.selectedCommunityId ?? "community-1";
  const selectionKind = options.selectionKind === undefined ? "community" : options.selectionKind;
  const renderableCommunities = renderableCommunityFixture(2);
  const nodes: GraphRendererAdapterData["nodes"] = [
    spotlightNodeFixture("alpha-ordinary", "community-1", { point: { x: 10, y: 20 } }),
    spotlightNodeFixture("alpha-selected", "community-1", { selected: true, point: { x: 20, y: 30 } }),
    spotlightNodeFixture("beta-ordinary", "community-2", { point: { x: 110, y: 120 } }),
    spotlightNodeFixture("beta-search", "community-2", { searchHit: true, point: { x: 120, y: 130 } }),
    spotlightNodeFixture("beta-pinned", "community-2", { pinned: true, point: { x: 130, y: 140 } })
  ];
  const selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const searchResultIds = nodes.filter((node) => node.searchHit).map((node) => node.id);
  const pinnedNodeIds = nodes.filter((node) => node.pinHint.pinned).map((node) => node.id);
  const selectedCommunityIds = selectionKind === "community"
    ? [selectedCommunityId]
    : selectionKind === "node"
      ? ["community-1"]
      : [];
  const selectionInput = selectionKind === "community"
    ? { kind: "community" as const, id: selectedCommunityId }
    : selectionKind === "node"
      ? { kind: "node" as const, id: "alpha-selected" }
      : null;

  return {
    counts: {
      nodes: nodes.length,
      edges: 0,
      communities: 2,
      hidden: 0,
      renderedNodes: nodes.length,
      renderedEdges: 0,
      aggregationContainers: 0
    },
    selection: {
      input: selectionInput,
      selectionId: selectionInput ? `${selectionInput.kind}:${selectionInput.id}` : null,
      selectedNodeIds,
      selectedCommunityIds,
      containsCurrentObject: Boolean(selectionInput)
    },
    nodes,
    edges: [],
    communities: renderableCommunities.map((community) => ({
      id: community.id,
      object: { kind: "community", communityId: community.id },
      label: community.label,
      nodeIds: nodes.filter((node) => node.communityId === community.id).map((node) => node.id),
      nodeCount: nodes.filter((node) => node.communityId === community.id).length,
      selected: selectedCommunityIds.includes(community.id),
      searchResultIds: searchResultIds.filter((id) => nodes.find((node) => node.id === id)?.communityId === community.id),
      pinHints: nodes
        .filter((node) => node.communityId === community.id && node.pinHint.pinned)
        .map((node) => node.pinHint),
      aggregationIds: [],
      drawerTarget: {
        summaryKind: "community-summary",
        object: { kind: "community", communityId: community.id }
      },
      commands: [{ kind: "enter-community", communityId: community.id, label: "进入社区" }]
    })),
    aggregations: [],
    renderable: {
      nodes: [],
      edges: [],
      communities: renderableCommunities,
      aggregationContainers: [],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId: selectedNodeIds[0] ?? null,
      selectedCommunityId,
      selectedNodeIds,
      hiddenNodeIds: new Set(),
      searchResultIds,
      worldBounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
      budgets: {
        limits: {
          maxNodes: nodes.length,
          maxEdges: 0,
          maxLabels: 0,
          maxCards: 0,
          maxInteractionUpdates: nodes.length,
          maxVisibleCommunities: 2
        },
        usage: {
          nodes: nodes.length,
          edges: 0,
          labels: 0,
          cards: 0,
          interactionUpdate: nodes.length,
          activeInteraction: nodes.length,
          communities: 2,
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
        stableCoreNodeIds: [],
        stableSkeletonEdgeIds: [],
        temporaryBoostNodeIds: []
      }
    }
  };

}

function spotlightNodeFixture(
  id: string,
  communityId: string,
  options: {
    point: { x: number; y: number };
    selected?: boolean;
    searchHit?: boolean;
    pinned?: boolean;
  }
): GraphRendererAdapterData["nodes"][number] {
  return {
    id,
    object: { kind: "node", nodeId: id },
    label: id,
    type: "topic",
    communityId,
    sourcePath: `spotlight/${id}.md`,
    point: options.point,
    selected: Boolean(options.selected),
    searchHit: Boolean(options.searchHit),
    pinHint: {
      nodeId: id,
      wikiPath: `spotlight/${id}.md`,
      pinned: Boolean(options.pinned),
      position: options.pinned ? { x: options.point.x, y: options.point.y, coordinateSpace: "world" } : null
    },
    aggregationIds: [],
    drawerTarget: {
      summaryKind: "node-summary",
      object: { kind: "node", nodeId: id }
    },
    render: {
      displayMode: "point",
      visualRole: "map-pin",
      priority: 10,
      labelVisible: false
    }
  };
}

function sigmaEdgeFixture(
  overrides: Partial<GraphRendererAdapterData["edges"][number]> = {}
): GraphRendererAdapterData["edges"][number] {
  return {
    id: "style-edge",
    sourceNodeId: "style-source",
    targetNodeId: "style-target",
    sourceCommunityId: "c1",
    targetCommunityId: "c1",
    relationType: "依赖",
    confidence: "EXTRACTED",
    weight: 0,
    render: {
      strokeWidth: 1,
      opacity: 1
    },
    ...overrides
  };
}

function edgeStyleAlpha(color: string): number {
  const match = color.match(/,\s*([0-9.]+)\)$/);
  return match ? Number(match[1]) : Number.NaN;
}

function adapterDataWithPolygonCommunityCloud(): GraphRendererAdapterData {
  const data = adapterDataFixture({ betaPinned: false });
  const thirdNode: GraphRendererAdapterData["nodes"][number] = {
    id: "render-gamma",
    object: { kind: "node", nodeId: "render-gamma" },
    label: "Adapter Gamma",
    type: "entity",
    communityId: "adapter-community",
    sourcePath: "adapter/gamma.md",
    point: { x: 180, y: 420 },
    selected: false,
    searchHit: false,
    pinHint: {
      nodeId: "render-gamma",
      wikiPath: "adapter/gamma.md",
      pinned: false,
      position: null
    },
    aggregationIds: [],
    drawerTarget: {
      summaryKind: "node-summary",
      object: { kind: "node", nodeId: "render-gamma" }
    },
    render: {
      displayMode: "point",
      visualRole: "map-pin",
      priority: 50,
      labelVisible: false
    }
  };

  return {
    ...data,
    counts: { ...data.counts, nodes: 3, renderedNodes: 3 },
    nodes: [...data.nodes, thirdNode],
    communities: data.communities.map((community) => community.id === "adapter-community"
      ? {
          ...community,
          nodeIds: [...community.nodeIds, thirdNode.id],
          nodeCount: community.nodeCount + 1
        }
      : community)
  };
}

function adapterDataWithPolygonCommunityOutlier(): GraphRendererAdapterData {
  const data = adapterDataWithPolygonCommunityCloud();
  const outlierNode: GraphRendererAdapterData["nodes"][number] = {
    id: "render-outlier",
    object: { kind: "node", nodeId: "render-outlier" },
    label: "Adapter Outlier",
    type: "entity",
    communityId: "adapter-community",
    sourcePath: "adapter/outlier.md",
    point: { x: 1200, y: 1200 },
    selected: false,
    searchHit: false,
    pinHint: {
      nodeId: "render-outlier",
      wikiPath: "adapter/outlier.md",
      pinned: false,
      position: null
    },
    aggregationIds: [],
    drawerTarget: {
      summaryKind: "node-summary",
      object: { kind: "node", nodeId: "render-outlier" }
    },
    render: {
      displayMode: "point",
      visualRole: "map-pin",
      priority: 1,
      labelVisible: false
    }
  };

  return {
    ...data,
    counts: { ...data.counts, nodes: 4, renderedNodes: 4 },
    nodes: [...data.nodes, outlierNode],
    communities: data.communities.map((community) => community.id === "adapter-community"
      ? {
          ...community,
          nodeIds: [...community.nodeIds, outlierNode.id],
          nodeCount: community.nodeCount + 1
        }
      : community)
  };
}

function sigmaCommunityCloudShape(renderer: { overlayRoot: HTMLElement & { children: HTMLElement[] } }, communityId: string): HTMLElement | undefined {
  const region = renderer.overlayRoot.children.find((child) => child.dataset.communityId === communityId);
  const svg = region?.children[0] as HTMLElement | undefined;
  return svg?.children[0] as HTMLElement | undefined;
}

function sigmaCommunityRegion(renderer: { overlayRoot: HTMLElement & { children: HTMLElement[] } }, communityId: string): HTMLElement | undefined {
  return renderer.overlayRoot.children.find((child) => child.dataset.communityId === communityId);
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

type FakeDefaultView = Partial<Pick<Window, "ResizeObserver" | "requestAnimationFrame" | "cancelAnimationFrame">> & {
  matchMedia?: Window["matchMedia"];
};

function fakeContainer(defaultView?: FakeDefaultView): HTMLElement & { children: HTMLElement[] } {
  const children: HTMLElement[] = [];
  const container = {
    ownerDocument: {
      createElement: (tagName: string) => fakeElement(tagName, defaultView),
      createElementNS: (_ns: string, tagName: string) => fakeElement(tagName, defaultView),
      defaultView
    },
    append: (child: HTMLElement) => {
      children.push(child);
    },
    children
  } as unknown as HTMLElement & { children: HTMLElement[] };
  containerRegistry.push(container);
  return container;
}

function resizeObserverEntry(width: number, height: number): ResizeObserverEntry {
  return { contentRect: { width, height } as DOMRectReadOnly } as ResizeObserverEntry;
}

function fakeElement(_tagName: string, defaultView?: FakeDefaultView): HTMLElement {
  const children: HTMLElement[] = [];
  const attributes = new Map<string, string>();
  const listeners = new Map<string, EventListenerOrEventListenerObject[]>();
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
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        if (typeof listener === "function") listener.call(element, event);
        else listener.handleEvent(event);
      }
      return true;
    },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, String(value));
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    querySelector: () => null,
    remove: () => undefined
  };
  element.ownerDocument = {
    createElement: (tagName: string) => {
      const child = fakeElement(tagName, defaultView);
      child.ownerDocument = element.ownerDocument;
      return child;
    },
    createElementNS: (_ns: string, tagName: string) => {
      const child = fakeElement(tagName, defaultView);
      child.ownerDocument = element.ownerDocument;
      return child;
    },
    defaultView
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
  worldScale?: number;
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
    private readonly options: { setGraphError?: Error; killError?: Error; worldScale?: number } = {}
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
    const scale = this.options.worldScale ?? 1;
    return { x: point.x * scale, y: point.y * scale };
  }

  viewportToFramedGraph(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }

  graphToViewport(point: { x: number; y: number }): { x: number; y: number } {
    const scale = this.options.worldScale ?? 1;
    return { x: point.x / scale, y: point.y / scale };
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
  readonly setStateCalls: Array<Partial<{ x: number; y: number; angle: number; ratio: number }>> = [];
  readonly animateCalls: Array<{
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>;
    options?: { duration?: number; easing?: string };
  }> = [];
  activeAnimationTarget: Partial<{ x: number; y: number; angle: number; ratio: number }> | null = null;

  getState(): { x: number; y: number; angle: number; ratio: number } {
    return { ...this.state };
  }

  setState(state: Partial<{ x: number; y: number; angle: number; ratio: number }>): void {
    this.setStateCalls.push({ ...state });
    this.state = { ...this.state, ...state };
  }

  animate(
    state: Partial<{ x: number; y: number; angle: number; ratio: number }>,
    options?: { duration?: number; easing?: string }
  ): Promise<void> {
    this.animateCalls.push({ state: { ...state }, options: options ? { ...options } : undefined });
    this.activeAnimationTarget = { ...state };
    this.setState(state);
    return Promise.resolve();
  }
}
