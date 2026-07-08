import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import type { GraphRendererAdapterData } from "../src";
import { buildGraphRendererAdapterData } from "../src/render";
import {
  buildSigmaGlobalGraphologyGraph,
  canPatchSigmaGlobalGraphAttributes,
  patchSigmaGlobalGraphAttributes,
  sigmaGlobalEdgeStyle,
  sigmaGlobalNodeAttributes,
  sigmaGlobalNodeColor
} from "../src/render/sigma-graphology-model";
import { getThemeTokens } from "../src/themes";
import type { GraphRendererAdapterNode, GraphRendererAdapterEdge } from "../src/render/adapter";
import type { GraphRelationFocusDepth } from "../src/render/relation-focus";
import type { GraphData } from "../src/types";

describe("Sigma graphology render model", () => {
  it("builds graphology nodes, edges, communities, and aggregations from adapter data", () => {
    const adapterData = adapterDataFixture();
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });

    assert.equal(graph.order, 2);
    assert.equal(graph.size, 1);
    assert.deepEqual(graph.getNodeAttributes("alpha"), {
      x: 10,
      y: 20,
      label: "Alpha",
      size: 10,
      color: "#ef4444",
      type: "circle",
      graphNodeType: "topic",
      communityId: "community-a",
      sourcePath: "alpha.md",
      selected: true,
      searchHit: false,
      relationFocusDepth: "none",
      pinned: false,
      communityDimmed: false,
      communitySpotlightVisible: true,
      aggregationIds: ["aggregation-a"],
      labelVisible: true,
      displayMode: "card",
      visualRole: "landmark",
      priority: 900,
      communityMapTier: "core",
      communityMapImportance: 3,
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: "alpha" }
      }
    });
    assert.equal(graph.getEdgeAttribute("edge-a", "relationType"), "depends-on");
    assert.equal(graph.source("edge-a"), "alpha");
    assert.equal(graph.target("edge-a"), "beta");
    assert.equal(graph.getAttribute("communities")[0].id, "community-a");
    assert.equal(graph.getAttribute("aggregations")[0].id, "aggregation-a");
  });

  it("applies selected-community focus edge styling and semantic emphasis", () => {
    const adapterData = adapterDataFixture({ selectedCommunityIds: ["community-b"] });
    const graph = buildSigmaGlobalGraphologyGraph(
      adapterData,
      { GraphologyGraph },
      "shan-shui",
      { semanticEmphasis: true, focusHighlight: true }
    );

    assert.deepEqual(graph.getEdgeAttributes("edge-a"), {
      size: 0.85,
      color: "rgba(49, 95, 114, 0.087)",
      relationType: "depends-on",
      confidence: "EXTRACTED",
      weight: 0.75,
      sourceCommunityId: "community-a",
      targetCommunityId: "community-a",
      communityMapLayer: "skeleton",
      relationFocusDepth: "none",
      selectedRelation: false
    });
    assert.deepEqual(
      sigmaGlobalEdgeStyle({
        relationType: "矛盾",
        sourceCommunityId: "community-a",
        targetCommunityId: "community-b",
        weight: 1
      }, "mo-ye"),
      { color: "rgba(244, 114, 182, 0.66)", size: 2.25 }
    );
  });

  it("dims ordinary nodes outside the selected community while keeping priority nodes visible", () => {
    const graph = buildSigmaGlobalGraphologyGraph(spotlightAdapterData(), { GraphologyGraph });

    assert.equal(graph.getNodeAttribute("alpha", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("beta", "communityDimmed"), true);
    assert.equal(graph.getNodeAttribute("beta", "color"), "rgba(18, 52, 86, 0.2)");
    assert.equal(graph.getNodeAttribute("beta", "size"), 3.6);
    assert.equal(graph.getNodeAttribute("beta-search", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("beta-pinned", "communityDimmed"), false);
  });

  it("keeps a selected node on its community color while source community spotlight stays active", () => {
    const adapterData = spotlightAdapterData();
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });
    const alpha = adapterData.nodes.find((node) => node.id === "alpha");
    assert.ok(alpha);

    assert.equal(graph.getNodeAttribute("alpha", "selected"), true);
    assert.equal(graph.getNodeAttribute("alpha", "communityDimmed"), false);
    assert.equal(graph.getNodeAttribute("alpha", "color"), sigmaGlobalNodeColor(alpha, communityColorMap(adapterData), "shan-shui"));
  });

  it("builds Sigma community reading from only the focused community while preserving color and positions", () => {
    const pins = {
      "wiki/alpha.md": { x: 111, y: 222, coordinateSpace: "world" as const }
    };
    const data = sigmaCommunityReadingGraphData();
    const globalAdapter = buildGraphRendererAdapterData(data, { theme: "shan-shui", pins });
    const communityAdapter = buildGraphRendererAdapterData(data, {
      theme: "shan-shui",
      pins,
      focus: { kind: "community", id: "community-a" },
      sourceCommunityId: "community-a"
    });
    const graph = buildSigmaGlobalGraphologyGraph(communityAdapter, { GraphologyGraph });

    assert.deepEqual(communityAdapter.nodes.map((node) => node.id).sort(), ["alpha", "beta"]);
    assert.deepEqual(communityAdapter.edges.map((edge) => edge.id), ["alpha-beta"]);
    assert.equal(communityAdapter.renderable.communityMap.active, true);
    assert.equal(communityAdapter.renderable.communityMap.current?.communityId, "community-a");

    for (const nodeId of ["alpha", "beta"]) {
      const globalNode = globalAdapter.nodes.find((node) => node.id === nodeId);
      assert.ok(globalNode, `${nodeId} should exist globally`);
      assert.equal(graph.getNodeAttribute(nodeId, "x"), globalNode.point.x);
      assert.equal(graph.getNodeAttribute(nodeId, "y"), globalNode.point.y);
      assert.equal(graph.getNodeAttribute(nodeId, "color"), sigmaGlobalNodeColor(globalNode, communityColorMap(globalAdapter), "shan-shui"));
    }

    assert.equal(graph.hasNode("gamma"), false);
    assert.equal(graph.hasEdge("beta-gamma"), false);
    assert.equal(graph.getNodeAttribute("alpha", "x"), 111);
    assert.equal(graph.getNodeAttribute("alpha", "y"), 222);
  });

  it("truncates long canvas labels in narrow Sigma community reading", () => {
    const data = sigmaCommunityReadingGraphData();
    const longLabel = "一个标题非常长用来测试社区阅读标签截断是否稳定的核心节点";
    data.nodes = data.nodes.map((node) => node.id === "alpha" ? { ...node, label: longLabel } : node);
    const adapter = buildGraphRendererAdapterData(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "community-a" },
      sourceCommunityId: "community-a",
      viewportSize: { width: 390, height: 844 }
    });
    const graph = buildSigmaGlobalGraphologyGraph(adapter, { GraphologyGraph });
    const canvasLabel = graph.getNodeAttribute("alpha", "label");

    assert.ok(adapter.nodes.find((node) => node.id === "alpha")?.label === longLabel, "adapter keeps the full node title");
    assert.ok(canvasLabel.endsWith("…"), `canvas label should be truncated, got ${canvasLabel}`);
    assert.ok(canvasLabel.length < longLabel.length);
  });

  it("detects patch eligibility from graph structure and theme", () => {
    const adapterData = adapterDataFixture();
    const sameShape = adapterDataFixture({ alphaLabel: "Alpha changed" });
    const nodeChanged = adapterDataFixture({ alphaId: "alpha-next" });
    const edgeChanged = adapterDataFixture({ edgeId: "edge-next" });
    const targetChanged = adapterDataFixture({ betaId: "beta-next" });
    const nodeAdded = {
      ...adapterData,
      nodes: [
        ...adapterData.nodes,
        nodeFixture("gamma", "community-a", { point: { x: 50, y: 60 } })
      ]
    };
    const edgeAdded = {
      ...adapterData,
      edges: [
        ...adapterData.edges,
        {
          ...adapterData.edges[0],
          id: "edge-added"
        }
      ]
    };

    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, sameShape, "shan-shui", "shan-shui"), true);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, sameShape, "shan-shui", "mo-ye"), false);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, nodeChanged, "shan-shui", "shan-shui"), false);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, edgeChanged, "shan-shui", "shan-shui"), false);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, targetChanged, "shan-shui", "shan-shui"), false);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, nodeAdded, "shan-shui", "shan-shui"), false);
    assert.equal(canPatchSigmaGlobalGraphAttributes(adapterData, edgeAdded, "shan-shui", "shan-shui"), false);
  });

  it("patches graph attributes in place", () => {
    const graph = buildSigmaGlobalGraphologyGraph(adapterDataFixture(), { GraphologyGraph });
    const sameShape = adapterDataFixture({ alphaLabel: "Alpha changed", selectedCommunityIds: [] });

    patchSigmaGlobalGraphAttributes(graph, sameShape, "shan-shui");

    assert.equal(graph.getNodeAttribute("alpha", "label"), "Alpha changed");
    assert.equal(graph.getNodeAttribute("beta", "communityDimmed"), false);
    assert.deepEqual(graph.getAttribute("selection"), sameShape.selection);
  });

  it("keeps the Sigma production model boundary on adapter data, not raw graph data", async () => {
    const modelSource = await readFile(new URL("../src/render/sigma-graphology-model.ts", import.meta.url), "utf8");
    const rendererSource = await readFile(new URL("../src/render/sigma-global-renderer.ts", import.meta.url), "utf8");

    assert.match(modelSource, /buildSigmaGlobalGraphologyGraph\(\s*adapterData: GraphRendererAdapterData/);
    for (const source of [modelSource, rendererSource]) {
      assert.doesNotMatch(source, /buildGraphRendererAdapterData/);
      assert.doesNotMatch(source, /GraphData/);
      assert.doesNotMatch(source, /\bdata\.nodes\b/);
      assert.doesNotMatch(source, /\bdata\.edges\b/);
    }
  });
});

function adapterDataFixture(options: {
  alphaId?: string;
  betaId?: string;
  edgeId?: string;
  alphaLabel?: string;
  selectedCommunityIds?: string[];
} = {}): GraphRendererAdapterData {
  const alphaId = options.alphaId ?? "alpha";
  const betaId = options.betaId ?? "beta";
  const edgeId = options.edgeId ?? "edge-a";
  const selectedCommunityIds = options.selectedCommunityIds ?? ["community-a"];
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
      input: { kind: "community", id: selectedCommunityIds[0] ?? "community-a" },
      selectionId: selectedCommunityIds[0] ? `community:${selectedCommunityIds[0]}` : null,
      selectedNodeIds: [alphaId],
      selectedCommunityIds,
      containsCurrentObject: selectedCommunityIds.length > 0
    },
    nodes: [
      nodeFixture(alphaId, "community-a", {
        label: options.alphaLabel ?? "Alpha",
        point: { x: 10, y: 20 },
        selected: true,
        priority: 900,
        displayMode: "card",
        labelVisible: true
      }),
      nodeFixture(betaId, "community-a", {
        label: "Beta",
        point: { x: 30, y: 40 },
        searchHit: true,
        pinned: true,
        type: "source"
      })
    ],
    edges: [
      {
        id: edgeId,
        sourceNodeId: alphaId,
        targetNodeId: betaId,
        sourceCommunityId: "community-a",
        targetCommunityId: "community-a",
        relationType: "depends-on",
        confidence: "EXTRACTED",
        weight: 0.75,
        render: { strokeWidth: 3, opacity: 0.42, communityMapLayer: "skeleton", relationFocusDepth: "none", skeleton: true, traceable: true, selectedRelation: false }
      }
    ],
    communities: [
      {
        id: "community-a",
        object: { kind: "community", communityId: "community-a" },
        label: "Community A",
        nodeIds: [alphaId, betaId],
        nodeCount: 2,
        selected: selectedCommunityIds.includes("community-a"),
        searchResultIds: [betaId],
        pinHints: [pinHint(betaId, true, { x: 30, y: 40 })],
        aggregationIds: ["aggregation-a"],
        drawerTarget: communityDrawerTarget("community-a"),
        commands: [{ kind: "enter-community", communityId: "community-a", label: "进入社区" }]
      }
    ],
    aggregations: [
      {
        id: "aggregation-a",
        object: { kind: "aggregation", aggregationId: "aggregation-a", nodeIds: [alphaId, betaId], communityId: "community-a" },
        label: "Aggregation A",
        communityId: "community-a",
        nodeIds: [alphaId, betaId],
        selectedNodeIds: [alphaId],
        searchResultIds: [betaId],
        pinnedNodeIds: [betaId],
        totalCount: 2,
        selected: true,
        pinHints: [pinHint(betaId, true, { x: 30, y: 40 })],
        drawerTarget: communityDrawerTarget("community-a"),
        commands: [
          {
            kind: "show-this-object",
            object: { kind: "aggregation", aggregationId: "aggregation-a", nodeIds: [alphaId, betaId], communityId: "community-a" },
            label: "显示这个对象"
          }
        ]
      }
    ],
    renderable: {
      nodes: [],
      edges: [],
      communities: [
        renderableCommunity("community-a", "#ef4444", true),
        renderableCommunity("community-b", "#123456", false)
      ],
      aggregationContainers: [
        {
          id: "aggregation-a",
          role: "aggregation-container",
          label: "Aggregation A",
          communityId: "community-a",
          nodeIds: [alphaId, betaId],
          nodeCount: 2,
          searchHitCount: 1,
          pinnedCount: 1,
          selectedCount: 1,
          selected: true,
          searchResultIds: [betaId],
          pinnedNodeIds: [betaId],
          selectedNodeIds: [alphaId],
          pinHints: [pinHint(betaId, true, { x: 30, y: 40 })],
          point: { x: 20, y: 30 },
          x: 20,
          y: 30,
          radius: 12,
          color: "#abcdef"
        }
      ],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId: alphaId,
      selectedCommunityId: selectedCommunityIds[0] ?? null,
      selectedNodeIds: [alphaId],
      hiddenNodeIds: new Set(),
      searchResultIds: [betaId],
      worldBounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      budgets: {
        limits: {
          maxNodes: 2,
          maxEdges: 1,
          maxLabels: 1,
          maxCards: 1,
          maxInteractionUpdates: 3,
          maxVisibleCommunities: 2
        },
        usage: {
          nodes: 2,
          edges: 1,
          labels: 1,
          cards: 1,
          interactionUpdate: 3,
          activeInteraction: 3,
          communities: 2,
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
        stableCoreNodeIds: [alphaId],
        stableSkeletonEdgeIds: [edgeId],
        temporaryBoostNodeIds: []
      }
    }
  };
}

function sigmaCommunityReadingGraphData(): GraphData {
  return {
    meta: {
      build_date: "2026-07-04T00:00:00.000Z",
      wiki_title: "Sigma community reading",
      total_nodes: 3,
      total_edges: 2
    },
    nodes: [
      { id: "alpha", label: "Alpha", type: "topic", community: "community-a", source_path: "wiki/alpha.md", weight: 90, x: 10, y: 20 },
      { id: "beta", label: "Beta", type: "entity", community: "community-a", source_path: "wiki/beta.md", weight: 70, x: 30, y: 40 },
      { id: "gamma", label: "Gamma", type: "source", community: "community-b", source_path: "wiki/gamma.md", weight: 60, x: 70, y: 80 }
    ],
    edges: [
      { id: "alpha-beta", from: "alpha", to: "beta", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "beta-gamma", from: "beta", to: "gamma", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.8 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "alpha", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["alpha", "beta", "gamma"], degraded: false }
      },
      communities: [
        { id: "community-a", label: "Community A", node_count: 2, color_index: 0, recommended_start_node_id: "alpha" },
        { id: "community-b", label: "Community B", node_count: 1, color_index: 1 }
      ]
    }
  };
}

// 11-node community (8 core nodes + a peripheral triangle) so the small-community
// core budget (maxLabels 8) leaves p1/p2/p3 genuinely peripheral. The peripheral
// triangle's closing edge lands outside the spanning skeleton and outside the
// core-touched interaction set, so buildRenderableGraph emits it as a background
// edge alongside skeleton edges — exercising the Sigma layer path end-to-end.
function sigmaLayerCommunityGraphData(): GraphData {
  const coreNodes = Array.from({ length: 8 }, (_, index) => ({
    id: `core${index + 1}`,
    label: `核心${index + 1}`,
    type: index === 0 ? "topic" : "entity",
    community: "community-a",
    source_path: `wiki/core${index + 1}.md`,
    weight: 100 - index * 3,
    x: 20 + (index % 4) * 8,
    y: 20 + Math.floor(index / 4) * 10
  }));
  const peripheral = ["p1", "p2", "p3"].map((id, index) => ({
    id,
    label: id,
    type: "entity",
    community: "community-a",
    source_path: `wiki/${id}.md`,
    weight: 12 + index * 2,
    x: 70 + index * 6,
    y: 70 + index * 5
  }));
  return {
    meta: { build_date: "2026-07-08T00:00:00.000Z", wiki_title: "Sigma layer fixture", total_nodes: 12, total_edges: 13 },
    nodes: [
      ...coreNodes,
      ...peripheral,
      { id: "outside", label: "Outside", type: "source", community: "community-b", source_path: "wiki/outside.md", weight: 50, x: 95, y: 95 }
    ],
    edges: [
      { id: "core1-core2", from: "core1", to: "core2", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "core2-core3", from: "core2", to: "core3", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.95 },
      { id: "core1-core3", from: "core1", to: "core3", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.9 },
      { id: "core1-core4", from: "core1", to: "core4", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.7 },
      { id: "core3-core5", from: "core3", to: "core5", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.6 },
      { id: "core4-core6", from: "core4", to: "core6", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.5 },
      { id: "core1-p1", from: "core1", to: "p1", type: "INFERRED", confidence: "INFERRED", relation_type: "依赖", weight: 0.3 },
      { id: "p1-p2", from: "p1", to: "p2", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.2 },
      { id: "p2-p3", from: "p2", to: "p3", type: "INFERRED", confidence: "INFERRED", relation_type: "衍生", weight: 0.18 },
      { id: "p1-p3", from: "p1", to: "p3", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.15 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "core1", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: [...coreNodes.map((node) => node.id), ...peripheral.map((node) => node.id), "outside"], degraded: false }
      },
      communities: [
        { id: "community-a", label: "Community A", node_count: 11, color_index: 0, recommended_start_node_id: "core1" },
        { id: "community-b", label: "Community B", node_count: 1, color_index: 1 }
      ]
    }
  };
}

function communityColorMap(adapterData: GraphRendererAdapterData): Map<string, string> {
  return new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
}

function spotlightAdapterData(): GraphRendererAdapterData {
  const data = adapterDataFixture({ selectedCommunityIds: ["community-a"] });
  data.nodes = [
    nodeFixture("alpha", "community-a", { point: { x: 10, y: 20 }, selected: true }),
    nodeFixture("beta", "community-b", { point: { x: 30, y: 40 } }),
    nodeFixture("beta-search", "community-b", { point: { x: 35, y: 45 }, searchHit: true }),
    nodeFixture("beta-pinned", "community-b", { point: { x: 40, y: 50 }, pinned: true })
  ];
  data.edges = [];
  return data;
}

function nodeFixture(
  id: string,
  communityId: string,
  options: {
    label?: string;
    point?: { x: number; y: number };
    selected?: boolean;
    searchHit?: boolean;
    pinned?: boolean;
    type?: "topic" | "source";
    priority?: number;
    displayMode?: string;
    labelVisible?: boolean;
  } = {}
): GraphRendererAdapterData["nodes"][number] {
  const point = options.point ?? { x: 0, y: 0 };
  return {
    id,
    object: { kind: "node", nodeId: id },
    label: options.label ?? id,
    type: options.type ?? "topic",
    communityId,
    sourcePath: `${id}.md`,
    point,
    selected: options.selected ?? false,
    searchHit: options.searchHit ?? false,
    relationFocusDepth: "none",
    pinHint: pinHint(id, options.pinned ?? false, point),
    aggregationIds: ["aggregation-a"],
    drawerTarget: {
      summaryKind: "node-summary",
      object: { kind: "node", nodeId: id }
    },
    render: {
      displayMode: options.displayMode ?? "point",
      visualRole: options.pinned ? "map-pin" : "landmark",
      priority: options.priority ?? 100,
      labelVisible: options.labelVisible ?? false,
      communityMapTier: "core",
      communityMapImportance: 3,
      communityMapDotSize: 18,
      communityMapLabelSide: "right",
      communityMapRelationLabel: true
    }
  };
}

function renderableCommunity(id: string, color: string, selected: boolean) {
  return {
    id,
    role: "community" as const,
    label: id,
    nodeCount: 2,
    selected,
    searchHitCount: 0,
    pinnedCount: 0,
    selectedCount: selected ? 1 : 0,
    color,
    x: 0,
    y: 0,
    radius: 20,
    wash: { cx: 0, cy: 0, rx: 20, ry: 20 },
    drawerTarget: communityDrawerTarget(id),
    commands: [{ kind: "enter-community" as const, communityId: id, label: "进入社区" }]
  };
}

function communityDrawerTarget(id: string): GraphRendererAdapterData["communities"][number]["drawerTarget"] {
  return {
    summaryKind: "community-summary",
    object: { kind: "community", communityId: id }
  };
}

function pinHint(nodeId: string, pinned: boolean, point: { x: number; y: number }) {
  return {
    nodeId,
    wikiPath: `${nodeId}.md`,
    pinned,
    position: pinned ? { ...point, coordinateSpace: "world" as const } : null
  };
}

// sigmaGlobalNodeColor 运行时只读 communityId；
// 其余字段用 as unknown as 绕过完整类型（字段以 adapter.ts 为准）。
function adapterNode(overrides: Partial<GraphRendererAdapterNode> = {}): GraphRendererAdapterNode {
  return ({
    id: "n1",
    label: "n",
    communityId: "c1",
    selected: false,
    searchHit: false,
    relationFocusDepth: "none",
    aggregationIds: [],
    pinHint: { pinned: false },
    point: { x: 0, y: 0 },
    render: { labelVisible: false, displayMode: "point", priority: 0, visualRole: "normal" },
    ...overrides
  } as unknown) as GraphRendererAdapterNode;
}

describe("sigmaGlobalNodeColor theme tokens", () => {
  const map = new Map<string, string>();
  it("keeps selected nodes on their community identity color", () => {
    const communityColors = new Map([["community-a", "#123456"]]);
    assert.equal(sigmaGlobalNodeColor(adapterNode({ selected: true, communityId: "community-a" }), communityColors, "shan-shui"), "#123456");
  });
  it("keeps search-hit nodes on their community identity color", () => {
    const communityColors = new Map([["community-a", "#123456"]]);
    assert.equal(sigmaGlobalNodeColor(adapterNode({ searchHit: true, communityId: "community-a" }), communityColors, "shan-shui"), "#123456");
  });
  it("keeps pinned nodes on their community identity color", () => {
    const communityColors = new Map([["community-a", "#123456"]]);
    assert.equal(
      sigmaGlobalNodeColor(adapterNode({ communityId: "community-a", pinHint: { pinned: true } } as Partial<GraphRendererAdapterNode>), communityColors, "shan-shui"),
      "#123456"
    );
  });
  it("falls back to --muted when no community color", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode(), map, "shan-shui"), vars["--muted"]);
  });
  it("keeps selected nodes on their community identity color under mo-ye", () => {
    const communityColors = new Map([["community-a", "#abcdef"]]);
    assert.equal(sigmaGlobalNodeColor(adapterNode({ selected: true, communityId: "community-a" }), communityColors, "mo-ye"), "#abcdef");
  });
  it("falls back to --muted under mo-ye", () => {
    const vars = getThemeTokens("mo-ye").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode(), map, "mo-ye"), vars["--muted"]);
  });
});

describe("sigmaGlobalEdgeStyle community reading layers", () => {
  it("makes skeleton edges clearly thicker and brighter than background edges in community reading", () => {
    const skeleton = sigmaGlobalEdgeStyle(layerEdge("skeleton"), "shan-shui", undefined, new Set(), { communityReading: true });
    const background = sigmaGlobalEdgeStyle(layerEdge("background"), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(skeleton.size > background.size, `skeleton size (${skeleton.size}) must exceed background (${background.size})`);
    assert.ok(skeleton.size - background.size >= 0.5, `skeleton should be clearly thicker, diff only ${skeleton.size - background.size}`);
    assert.ok(
      alphaOf(skeleton.color) > alphaOf(background.color),
      `skeleton alpha (${alphaOf(skeleton.color)}) must exceed background (${alphaOf(background.color)})`
    );
  });

  it("keeps related edges between skeleton and background in community reading", () => {
    const skeleton = sigmaGlobalEdgeStyle(layerEdge("skeleton"), "shan-shui", undefined, new Set(), { communityReading: true });
    const related = sigmaGlobalEdgeStyle(layerEdge("related"), "shan-shui", undefined, new Set(), { communityReading: true });
    const background = sigmaGlobalEdgeStyle(layerEdge("background"), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(related.size >= background.size, "related edges should not be quieter than background");
    assert.ok(
      alphaOf(related.color) <= alphaOf(skeleton.color),
      "related edges should not outshine skeleton edges"
    );
  });

  it("ignores communityMapLayer outside community reading so the global route stays unchanged", () => {
    const skeleton = sigmaGlobalEdgeStyle(layerEdge("skeleton"), "shan-shui", undefined, new Set(), {});
    const background = sigmaGlobalEdgeStyle(layerEdge("background"), "shan-shui", undefined, new Set(), {});

    assert.equal(skeleton.size, background.size);
    assert.equal(skeleton.color, background.color);
  });

  it("renders skeleton edges thicker than background edges end-to-end in Sigma community reading", () => {
    const adapter = buildGraphRendererAdapterData(sigmaLayerCommunityGraphData(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "community-a" },
      sourceCommunityId: "community-a"
    });
    const graph = buildSigmaGlobalGraphologyGraph(adapter, { GraphologyGraph });

    const skeletonSizes: number[] = [];
    const backgroundSizes: number[] = [];
    for (const edge of adapter.edges) {
      const layer = edge.render.communityMapLayer;
      if (layer === "skeleton") skeletonSizes.push(graph.getEdgeAttribute(edge.id, "size"));
      else if (layer === "background") backgroundSizes.push(graph.getEdgeAttribute(edge.id, "size"));
    }
    assert.ok(skeletonSizes.length > 0, "fixture should produce skeleton edges");
    assert.ok(backgroundSizes.length > 0, "fixture should produce background edges");
    assert.ok(
      Math.min(...skeletonSizes) > Math.max(...backgroundSizes),
      `min skeleton size ${Math.min(...skeletonSizes)} must exceed max background size ${Math.max(...backgroundSizes)}`
    );
  });
});

// #136 community interaction: Sigma composes the STATIC communityMapLayer with
// the interaction depth (relationFocusDepth) and Shift multi-select
// (selectedRelation). All assertions check FINAL size/alpha — not label values
// — so a missing style branch cannot hide behind a correct label (eng review F4).
describe("sigmaGlobalEdgeStyle community reading interaction (#136)", () => {
  it("makes a first-degree interaction edge the thickest and brightest, ahead of static skeleton", () => {
    const first = sigmaGlobalEdgeStyle(styledEdge({ layer: "skeleton", depth: "first" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const skeleton = sigmaGlobalEdgeStyle(styledEdge({ layer: "skeleton", depth: "none" }), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(first.size > skeleton.size, `first-degree size (${first.size}) must exceed static skeleton (${skeleton.size})`);
    assert.ok(
      alphaOf(first.color) > alphaOf(skeleton.color),
      `first-degree alpha (${alphaOf(first.color)}) must exceed static skeleton (${alphaOf(skeleton.color)})`
    );
  });

  it("preserves the static skeleton boost under first-degree hover (no quiet skeleton drop)", () => {
    // The #135↔#136 regression: a skeleton edge first-degree to the hover used to
    // be relabeled "related" and LOSE its skeleton boost. It must stay at least as
    // prominent as its own no-hover state.
    const resting = sigmaGlobalEdgeStyle(styledEdge({ layer: "skeleton", depth: "none" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const hoveredFirst = sigmaGlobalEdgeStyle(styledEdge({ layer: "skeleton", depth: "first" }), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(hoveredFirst.size >= resting.size, "first-degree hover must not thin a skeleton edge");
    assert.ok(alphaOf(hoveredFirst.color) >= alphaOf(resting.color), "first-degree hover must not dim a skeleton edge");
  });

  it("orders interaction depth monotonically: first > second > unrelated", () => {
    const first = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "first" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const second = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "second" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const unrelated = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "unrelated" }), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(first.size > second.size, `first size (${first.size}) must exceed second (${second.size})`);
    assert.ok(second.size > unrelated.size, `second size (${second.size}) must exceed unrelated (${unrelated.size})`);
    assert.ok(alphaOf(first.color) > alphaOf(unrelated.color), "first alpha must exceed unrelated");
    assert.ok(alphaOf(second.color) > alphaOf(unrelated.color), "second alpha must exceed unrelated");
  });

  it("recedes unrelated edges below the no-focus baseline while first-degree rises above it", () => {
    const baseline = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "none" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const first = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "first" }), "shan-shui", undefined, new Set(), { communityReading: true });
    const unrelated = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", depth: "unrelated" }), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(first.size > baseline.size, "hover must promote first-degree edges above baseline");
    assert.ok(alphaOf(first.color) > alphaOf(baseline.color), "hover must brighten first-degree edges above baseline");
    assert.ok(unrelated.size < baseline.size, "hover must thin unrelated edges below baseline");
    assert.ok(alphaOf(unrelated.color) < alphaOf(baseline.color), "hover must dim unrelated edges below baseline");
  });

  it("emphasizes a Shift-multi-select selectedRelation edge like a first-degree edge", () => {
    const selected = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", selectedRelation: true }), "shan-shui", undefined, new Set(), { communityReading: true });
    const baseline = sigmaGlobalEdgeStyle(styledEdge({ layer: "related", selectedRelation: false }), "shan-shui", undefined, new Set(), { communityReading: true });

    assert.ok(selected.size > baseline.size, "selectedRelation edge must be thicker than a non-selected edge");
    assert.ok(alphaOf(selected.color) > alphaOf(baseline.color), "selectedRelation edge must be brighter than a non-selected edge");
  });

  it("ignores interaction depth outside community reading so the global route stays unchanged", () => {
    const first = sigmaGlobalEdgeStyle(styledEdge({ layer: "skeleton", depth: "first" }), "shan-shui", undefined, new Set(), {});
    const unrelated = sigmaGlobalEdgeStyle(styledEdge({ layer: "background", depth: "unrelated" }), "shan-shui", undefined, new Set(), {});

    // Global route keys only on relation class/bridge/weight; depth/layer must not move size.
    assert.equal(first.size, unrelated.size);
  });
});

// #136 node emphasis: in community reading, the active node and first-degree
// neighbors stand out while second/unrelated recede. relationFocusDepth is "none"
// on the global route, so this is implicitly community-reading-scoped.
describe("sigmaGlobalNodeAttributes community reading interaction (#136)", () => {
  const communityColors = new Map<string, string>();
  const theme = "shan-shui" as const;

  it("makes the focus (hovered/selected) node larger than a baseline point node", () => {
    const baseline = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "none" }), communityColors, new Set(), theme);
    const focus = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "focus" }), communityColors, new Set(), theme);

    assert.ok(focus.size > baseline.size, `focus size (${focus.size}) must exceed baseline (${baseline.size})`);
  });

  it("makes a first-degree neighbor larger than the baseline", () => {
    const baseline = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "none" }), communityColors, new Set(), theme);
    const first = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "first" }), communityColors, new Set(), theme);

    assert.ok(first.size > baseline.size, `first-degree size (${first.size}) must exceed baseline (${baseline.size})`);
  });

  it("recedes an unrelated node: smaller and dimmer than baseline", () => {
    const baseline = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "none" }), communityColors, new Set(), theme);
    const unrelated = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "unrelated" }), communityColors, new Set(), theme);

    assert.ok(unrelated.size < baseline.size, "unrelated node must be smaller than baseline");
    assert.ok(alphaOf(unrelated.color) < alphaOf(baseline.color), "unrelated node must be dimmer than baseline");
  });

  it("dims a second-degree node as faint context without shrinking it", () => {
    const baseline = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "none" }), communityColors, new Set(), theme);
    const second = sigmaGlobalNodeAttributes(adapterNode({ relationFocusDepth: "second" }), communityColors, new Set(), theme);

    assert.equal(second.size, baseline.size, "second-degree node keeps baseline size");
    assert.ok(alphaOf(second.color) < alphaOf(baseline.color), "second-degree node must be dimmer than baseline");
  });
});

// 5-node community where a-b and a-c can land between a {a,b,c} multi-select
// while c-d and d-e stay outside it. Same shape as the render-model fixture so
// the between-selected classification is unambiguous.
function multiSelectCommunityGraphData(): GraphData {
  return {
    meta: { build_date: "2026-07-08T00:00:00.000Z", wiki_title: "Multi-select fixture", total_nodes: 5, total_edges: 4 },
    nodes: [
      { id: "a", label: "Alpha", type: "topic", community: "c1", source_path: "wiki/a.md", weight: 80, x: 10, y: 20 },
      { id: "b", label: "Beta", type: "entity", community: "c1", source_path: "wiki/b.md", weight: 70, x: 25, y: 35 },
      { id: "c", label: "Gamma", type: "source", community: "c1", source_path: "wiki/c.md", weight: 60, x: 45, y: 30 },
      { id: "d", label: "Delta", type: "entity", community: "c1", source_path: "wiki/d.md", weight: 50, x: 65, y: 50 },
      { id: "e", label: "Epsilon", type: "entity", community: "c1", source_path: "wiki/e.md", weight: 10, x: 85, y: 70 }
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "a-c", from: "a", to: "c", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.8 },
      { id: "c-d", from: "c", to: "d", type: "INFERRED", confidence: "INFERRED", relation_type: "衍生", weight: 0.5 },
      { id: "d-e", from: "d", to: "e", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.4 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "a", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["a", "b", "c", "d", "e"], degraded: false }
      },
      communities: [{ id: "c1", label: "Community 1", node_count: 5, color_index: 0, recommended_start_node_id: "a" }]
    }
  };
}

// #136 end-to-end: Shift multi-select must emphasize only REAL edges between
// selected nodes, thicker than non-between-selected edges, with no camera/drawer
// involvement. Exercises the full model → adapter → Sigma graphology path.
describe("Sigma community reading Shift multi-select (#136)", () => {
  it("renders real between-selected edges thicker than other community edges", () => {
    const adapter = buildGraphRendererAdapterData(multiSelectCommunityGraphData(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      sourceCommunityId: "c1",
      selection: { kind: "nodes", ids: ["a", "b", "c"] }
    });
    const graph = buildSigmaGlobalGraphologyGraph(adapter, { GraphologyGraph });

    // a-b and a-c have both endpoints selected; c-d and d-e do not.
    const betweenSize = (id: string): number => graph.getEdgeAttribute(id, "size");
    const ab = betweenSize("a-b");
    const ac = betweenSize("a-c");
    const cd = betweenSize("c-d");
    const de = betweenSize("d-e");

    assert.ok(ab > cd, `between-selected a-b (${ab}) must be thicker than c-d (${cd})`);
    assert.ok(ac > cd, `between-selected a-c (${ac}) must be thicker than c-d (${cd})`);
    assert.ok(ab > de && ac > de, "between-selected edges must be thicker than the unrelated d-e edge");
    // Selected nodes stay full-opacity and readable (selectedRelation never dims).
    assert.ok(alphaOf(graph.getNodeAttribute("a", "color")) >= alphaOf(graph.getNodeAttribute("d", "color")));
  });
});

function layerEdge(layer: "skeleton" | "related" | "background"): GraphRendererAdapterEdge {
  return styledEdge({ layer });
}
// #136 edge fixture: lets a test pin BOTH the static communityMapLayer and the
// interaction state (relationFocusDepth, selectedRelation) on the same edge, so
// assertions can prove the Sigma style composes them into final size/alpha
// instead of trusting a label value (anti-fake-green per #134 eng review F4).
function styledEdge(options: {
  layer?: "skeleton" | "related" | "background";
  depth?: GraphRelationFocusDepth;
  selectedRelation?: boolean;
  weight?: number;
}): GraphRendererAdapterEdge {
  const layer = options.layer ?? "related";
  return {
    id: "styled-edge",
    sourceNodeId: "a",
    targetNodeId: "b",
    sourceCommunityId: "c1",
    targetCommunityId: "c1",
    relationType: "依赖",
    confidence: "EXTRACTED",
    weight: options.weight ?? 0.5,
    render: {
      strokeWidth: 1,
      opacity: 0.3,
      communityMapLayer: layer,
      relationFocusDepth: options.depth ?? "none",
      skeleton: layer === "skeleton",
      traceable: false,
      selectedRelation: options.selectedRelation ?? false
    }
  } as GraphRendererAdapterEdge;
}

function alphaOf(color: string): number {
  const match = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/.exec(color);
  return match && match[1] !== undefined ? Number(match[1]) : 1;
}
