import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import type { GraphRendererAdapterData } from "../src";
import {
  buildSigmaGlobalGraphologyGraph,
  canPatchSigmaGlobalGraphAttributes,
  patchSigmaGlobalGraphAttributes,
  sigmaGlobalEdgeStyle,
  sigmaGlobalNodeColor
} from "../src/render/sigma-graphology-model";
import { getThemeTokens } from "../src/themes";
import type { GraphRendererAdapterNode } from "../src/render/adapter";

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
      color: "#8b2e24",
      type: "circle",
      graphNodeType: "topic",
      communityId: "community-a",
      sourcePath: "alpha.md",
      selected: true,
      searchHit: false,
      pinned: false,
      communityDimmed: false,
      communitySpotlightVisible: true,
      aggregationIds: ["aggregation-a"],
      labelVisible: true,
      displayMode: "card",
      visualRole: "landmark",
      priority: 900,
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
      targetCommunityId: "community-a"
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
        render: { strokeWidth: 3, opacity: 0.42 }
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
      labelVisible: options.labelVisible ?? false
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

// sigmaGlobalNodeColor 运行时只读 selected/searchHit/pinHint.pinned/communityId；
// 其余字段用 as unknown as 绕过完整类型（字段以 adapter.ts 为准）。
function adapterNode(overrides: Partial<GraphRendererAdapterNode> = {}): GraphRendererAdapterNode {
  return ({
    id: "n1",
    label: "n",
    communityId: "c1",
    selected: false,
    searchHit: false,
    pinHint: { pinned: false },
    point: { x: 0, y: 0 },
    render: { labelVisible: false, displayMode: "point", priority: 0, visualRole: "normal" },
    ...overrides
  } as unknown) as GraphRendererAdapterNode;
}

describe("sigmaGlobalNodeColor theme tokens", () => {
  const map = new Map<string, string>();
  it("maps selected -> --cinnabar", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ selected: true }), map, "shan-shui"), vars["--cinnabar"]);
  });
  it("maps searchHit -> --amber", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ searchHit: true }), map, "shan-shui"), vars["--amber"]);
  });
  it("maps pinned -> --violet", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ pinHint: { pinned: true } } as Partial<GraphRendererAdapterNode>), map, "shan-shui"), vars["--violet"]);
  });
  it("falls back to --muted when no community color", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode(), map, "shan-shui"), vars["--muted"]);
  });
  it("maps selected -> --cinnabar under mo-ye (dark theme)", () => {
    const vars = getThemeTokens("mo-ye").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ selected: true }), map, "mo-ye"), vars["--cinnabar"]);
  });
  it("falls back to --muted under mo-ye", () => {
    const vars = getThemeTokens("mo-ye").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode(), map, "mo-ye"), vars["--muted"]);
  });
});
