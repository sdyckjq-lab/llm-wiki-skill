import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRenderableGraph,
  edgeOpacity,
  edgeRelationClass,
  edgeStrokeWidth,
  edgeVisualOpacity,
  edgeVisualStrokeWidth,
  evaluateCommunityQuality,
  GRAPH_COMMUNITY_FOCUS_BUDGETS,
  GRAPH_RENDER_BUDGETS,
  makeEdgePath,
  nodeDisplayModeForDensity,
  screenEffectiveDensityMode
} from "../src/render";
import type { GraphData } from "../src/types";

function sampleGraph(): GraphData {
  return {
    meta: {
      build_date: "2026-06-12T00:00:00.000Z",
      wiki_title: "Stage 4 Demo",
      total_nodes: 4,
      total_edges: 3
    },
    nodes: [
      { id: "topic", label: "主题", type: "topic", community: "c1", source_path: "wiki/topic.md", weight: 80, x: 20, y: 30 },
      { id: "entity", label: "实体", type: "entity", community: "c1", source_path: "wiki/entity.md", weight: 50 },
      { id: "source", label: "来源", type: "source", community: "c2", source_path: "wiki/source.md", weight: 40, x: 70, y: 60 },
      { id: "island", label: "孤岛", type: "entity", community: "c3", source_path: "wiki/island.md", weight: 10 }
    ],
    edges: [
      { id: "e1", from: "topic", to: "entity", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "e2", from: "topic", to: "source", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.5 },
      { id: "missing", from: "topic", to: "missing", type: "UNVERIFIED", weight: 0.1 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "topic", recommended_start_reason: "community_hub", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["topic", "entity", "source", "island"], degraded: false }
      },
      communities: [
        { id: "c1", label: "核心", node_count: 2, color_index: 0, recommended_start_node_id: "topic" },
        { id: "c2", label: "来源", node_count: 1, color_index: 1 },
        { id: "c3", label: "孤岛", node_count: 1, color_index: 2 }
      ]
    }
  };
}

function outlierCommunityGraph(): GraphData {
  const nodes = [
    { id: "core-a", label: "Core A", type: "entity", community: "c1", source_path: "wiki/core-a.md", weight: 70, x: 20, y: 40 },
    { id: "core-b", label: "Core B", type: "entity", community: "c1", source_path: "wiki/core-b.md", weight: 65, x: 22, y: 42 },
    { id: "core-c", label: "Core C", type: "topic", community: "c1", source_path: "wiki/core-c.md", weight: 80, x: 24, y: 39 },
    { id: "core-d", label: "Core D", type: "source", community: "c1", source_path: "wiki/core-d.md", weight: 55, x: 26, y: 41 },
    { id: "outlier", label: "Outlier", type: "entity", community: "c1", source_path: "wiki/outlier.md", weight: 35, x: 92, y: 78 }
  ];
  return {
    meta: {
      build_date: "2026-06-12T00:00:00.000Z",
      wiki_title: "Outlier Fixture",
      total_nodes: nodes.length,
      total_edges: 0
    },
    nodes,
    edges: [],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "core-c", recommended_start_reason: "community_hub", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [
        { id: "c1", label: "Cluster", node_count: nodes.length, color_index: 0, recommended_start_node_id: "core-c" }
      ]
    }
  };
}

function budgetGraph(nodeCount: number, edgeCount: number): GraphData {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: `Budget node ${index}`,
    type: index % 7 === 0 ? "topic" : index % 11 === 0 ? "source" : "entity",
    community: "c1",
    source_path: `wiki/budget/n${index}.md`,
    weight: 100 - (index % 83),
    x: (index * 37) % 100,
    y: (index * 53) % 100
  }));
  const edges: NonNullable<GraphData["edges"]> = [];
  for (let sourceIndex = 0; sourceIndex < nodeCount && edges.length < edgeCount; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < nodeCount && edges.length < edgeCount; targetIndex += 1) {
      edges.push({
        id: `e${edges.length}`,
        from: `n${sourceIndex}`,
        to: `n${targetIndex}`,
        type: "EXTRACTED",
        confidence: "EXTRACTED",
        relation_type: edges.length % 3 === 0 ? "实现" : "依赖",
        weight: (edges.length % 10) / 10
      });
    }
  }

  return {
    meta: {
      build_date: "2026-06-18T00:00:00.000Z",
      wiki_title: "Budget Fixture",
      total_nodes: nodes.length,
      total_edges: edges.length
    },
    nodes,
    edges,
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "n0", recommended_start_reason: "budget_fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [
        { id: "c1", label: "Budget Community", node_count: nodes.length, color_index: 0, recommended_start_node_id: "n0" }
      ]
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

function manyTinyCommunitiesGraph(): GraphData {
  const nodes = Array.from({ length: 10 }, (_, index) => ({
    id: `tiny-${index}`,
    label: `Tiny node ${index}`,
    type: "entity",
    community: `tiny-${index}`,
    source_path: `wiki/tiny/${index}.md`,
    weight: 20 + index,
    x: (index * 11) % 100,
    y: (index * 17) % 100
  }));
  return {
    meta: {
      build_date: "2026-06-18T00:00:00.000Z",
      wiki_title: "Many Tiny Communities",
      total_nodes: nodes.length,
      total_edges: 0
    },
    nodes,
    edges: [],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "tiny-0", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: nodes.map((node, index) => ({
        id: String(node.community),
        label: `Specific topic ${index}`,
        node_count: 1,
        color_index: index
      }))
    }
  };
}

function oversizedWeakCommunityGraph(): GraphData {
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: `blob-${index}`,
    label: `Blob node ${index}`,
    type: index % 9 === 0 ? "topic" : "entity",
    community: "community",
    source_path: `wiki/blob/${index}.md`,
    weight: 60 - (index % 30),
    x: (index * 19) % 100,
    y: (index * 23) % 100
  }));
  return {
    meta: {
      build_date: "2026-06-18T00:00:00.000Z",
      wiki_title: "Oversized Weak Community",
      total_nodes: nodes.length,
      total_edges: 0
    },
    nodes,
    edges: [],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "blob-0", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: true, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [
        { id: "community", label: "community", node_count: nodes.length, color_index: 0, is_weak: true }
      ]
    }
  };
}

function mixedCrossCommunityGraph(): GraphData {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    id: `mixed-${index}`,
    label: `Mixed node ${index}`,
    type: "entity",
    community: index < 6 ? "left" : "right",
    source_path: `wiki/mixed/${index}.md`,
    weight: 30,
    x: (index * 13) % 100,
    y: (index * 29) % 100
  }));
  const edges = Array.from({ length: 8 }, (_, index) => ({
    id: `mixed-edge-${index}`,
    from: `mixed-${index % 6}`,
    to: `mixed-${6 + (index % 6)}`,
    type: "INFERRED",
    confidence: "INFERRED",
    relation_type: "依赖",
    weight: 0.5
  }));
  return {
    meta: {
      build_date: "2026-06-18T00:00:00.000Z",
      wiki_title: "Mixed Cross Community",
      total_nodes: nodes.length,
      total_edges: edges.length
    },
    nodes,
    edges,
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "mixed-0", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: true, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [
        { id: "left", label: "left", node_count: 6, color_index: 0, is_weak: true },
        { id: "right", label: "right", node_count: 6, color_index: 1, is_weak: true }
      ]
    }
  };
}

describe("buildRenderableGraph", () => {
  it("maps graph data to static renderable nodes, edges, communities, and minimap points", () => {
    const graph = buildRenderableGraph(sampleGraph(), { theme: "shan-shui" });

    assert.equal(graph.counts.totalNodes, 4);
    assert.equal(graph.nodes.length, 4);
    assert.equal(graph.edges.length, 2);
    assert.equal(graph.communities.length, 3);
    assert.equal(graph.densityMode, "card");
    assert.equal(graph.nodes.find((node) => node.id === "topic")?.visualRole, "index-slip");
    assert.equal(graph.edges[0].type, "extracted");
    assert.equal(graph.edges[0].confidence, "extracted");
    assert.equal(graph.edges[0].relationType, "实现");
    assert.equal(graph.edges[0].relationClass, "relation-implementation");
    assert.equal(graph.edges[1].confidence, "inferred");
    assert.equal(graph.edges[1].relationType, "对比");
    assert.equal(graph.edges[1].relationClass, "relation-contrast");
    assert.match(graph.edges[0].path, /^M \d+ \d+ Q /);
    assert.equal(graph.minimap.path, "M8 40 C34 20 54 36 76 22 C98 8 118 24 150 12");
    assert.equal(graph.minimap.nodes.length, 4);
  });

  it("uses low-weight global edges and fuller focused relation edges", () => {
    const global = buildRenderableGraph(sampleGraph(), { theme: "shan-shui" });
    const focused = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });

    assert.equal(global.edges.find((edge) => edge.id === "e1")?.relationClass, "relation-implementation");
    assert.equal(global.edges.find((edge) => edge.id === "e2")?.relationClass, "relation-contrast");
    assert.equal(focused.edges[0].relationClass, "relation-implementation");
    assert.ok(focused.edges[0].strokeWidth > global.edges[0].strokeWidth, "focused relation edge should render with a fuller stroke");
    assert.ok(focused.edges[0].opacity > global.edges[0].opacity, "focused relation edge should render with higher opacity");
  });

  it("uses pins as the cold-start coordinates when a node source path matches", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      pins: {
        "wiki/entity.md": { x: 800, y: 340, coordinateSpace: "world" }
      }
    });

    const pinned = graph.nodes.find((node) => node.id === "entity");
    assert.ok(pinned);
    assert.equal(pinned.x, 80);
    assert.equal(pinned.y, 50);
    assert.deepEqual(pinned.point, { x: 800, y: 340 });
  });

  it("keeps explicit world pins readable even when coordinates look like old percentages", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      pins: {
        "wiki/entity.md": { x: 80, y: -42.5, coordinateSpace: "world" }
      }
    });

    const pinned = graph.nodes.find((node) => node.id === "entity");
    assert.ok(pinned);
    assert.deepEqual(pinned.point, { x: 80, y: -42.5 });
    assert.ok(graph.worldBounds.minY < 0);
  });

  it("continues to read migrated old percent pins with an explicit coordinate-space marker", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      pins: {
        "wiki/entity.md": { x: 80, y: 50, coordinateSpace: "legacy-percent" }
      }
    });

    const pinned = graph.nodes.find((node) => node.id === "entity");
    assert.ok(pinned);
    assert.deepEqual(pinned.point, { x: 800, y: 340 });
  });

  it("infers wiki-relative source paths for graph data without source_path", () => {
    const data = sampleGraph();
    data.nodes = data.nodes.map(({ source_path: _sourcePath, ...node }) => node);
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      pins: {
        "wiki/topics/topic.md": { x: 900, y: 408, coordinateSpace: "world" }
      }
    });

    const topic = graph.nodes.find((node) => node.id === "topic");
    assert.ok(topic);
    assert.equal(topic.sourcePath, "wiki/topics/topic.md");
    assert.deepEqual(topic.point, { x: 900, y: 408 });
  });

  it("marks selected nodes and preserves cinnabar visual role", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "mo-ye",
      selection: { kind: "node", id: "source" }
    });

    const selected = graph.nodes.find((node) => node.id === "source");
    assert.ok(selected);
    assert.equal(selected.selected, true);
    assert.equal(selected.visualRole, "cinnabar-note");
    assert.equal(graph.minimap.nodes.find((node) => node.id === "source")?.selected, true);
  });

  it("marks shift-style multi-node selections", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      selection: { kind: "nodes", ids: ["topic", "source"] }
    });

    const selected = graph.nodes.filter((node) => node.selected).map((node) => node.id);
    assert.deepEqual(selected, ["topic", "source"]);
    assert.notEqual(graph.nodes.find((node) => node.id === "topic")?.displayMode, "card");
    assert.equal(graph.nodes.find((node) => node.id === "source")?.visualRole, "cinnabar-note");
    assert.equal(graph.minimap.nodes.filter((node) => node.selected).length, 2);
  });

  it("enforces zero full cards in global view even for selected, search, and pinned nodes", () => {
    const data = budgetGraph(80, 1200);
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "n79" },
      searchResultIds: data.nodes.map((node) => node.id),
      pins: {
        "wiki/budget/n79.md": { x: 900, y: 500, coordinateSpace: "world" }
      }
    });

    assert.equal(graph.budget.view, "global");
    assert.equal(graph.budget.limits.maxCards, GRAPH_RENDER_BUDGETS.global.maxCards);
    assert.equal(graph.budget.usage.maxCards, 0);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
    assert.ok(graph.nodes.find((node) => node.id === "n79")?.labelVisible, "selected and pinned node should be promoted into labels");
  });

  it("keeps global labels, edges, and interaction updates within budget and reports overflow", () => {
    const data = budgetGraph(200, 1200);
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      searchResultIds: data.nodes.map((node) => node.id)
    });

    assert.ok(graph.budget.usage.maxLabels <= GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.ok(graph.budget.usage.maxVisibleEdges <= GRAPH_RENDER_BUDGETS.global.maxVisibleEdges);
    assert.ok(graph.budget.usage.maxInteractionUpdates <= GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates);
    assert.equal(graph.nodes.filter((node) => node.labelVisible).length, GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.equal(graph.edges.length, GRAPH_RENDER_BUDGETS.global.maxVisibleEdges);
    assert.ok(graph.overflow.labels.hidden > 0);
    assert.ok(graph.overflow.edges.hidden > 0);
    assert.ok(graph.overflow.interactionUpdates.hidden > 0);
    assert.equal(graph.overflow.labels.total, 200);
    assert.equal(graph.overflow.edges.total, 1200);
  });

  it("keeps interaction-time detail updates inside budget while preserving anchors", () => {
    const data = budgetGraph(200, 1200);
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "n199" },
      searchResultIds: ["n198", "n199"],
      pins: {
        "wiki/budget/n197.md": { x: 850, y: 500, coordinateSpace: "world" }
      }
    });

    assert.ok(graph.interaction.updatedObjects <= GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates);
    assert.ok(graph.interaction.updateCandidates < graph.overflow.interactionUpdates.total);
    assert.ok(graph.interaction.edgesVisibleDuringInteraction <= graph.budget.usage.maxVisibleEdges);
    assert.ok(graph.interaction.preservedNodeIds.includes("n199"), "selected node should stay traceable");
    assert.ok(graph.interaction.preservedNodeIds.includes("n198"), "searched node should stay traceable");
    assert.ok(graph.interaction.preservedNodeIds.includes("n197"), "pinned node should stay traceable");
    assert.ok(graph.interaction.preservedNodeIds.some((id) => graph.importance.stableCoreNodeIds.includes(id)), "stable core anchors should stay traceable");
  });

  it("caps focused community cards while allowing promoted nodes to compete for the budget", () => {
    const data = budgetGraph(80, 1200);
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      searchResultIds: data.nodes.map((node) => node.id),
      pins: {
        "wiki/budget/n79.md": { x: 900, y: 500, coordinateSpace: "world" }
      }
    });

    assert.equal(graph.budget.view, "community");
    assert.equal(graph.nodes.length, 80);
    assert.ok(graph.budget.usage.maxCards <= graph.budget.limits.maxCards);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, graph.budget.limits.maxCards);
    assert.ok(graph.overflow.cards.hidden > 0);
    assert.equal(graph.nodes.find((node) => node.id === "n79")?.displayMode, "card");
  });

  it("uses the small community band for card-rich focused reading", () => {
    const graph = buildRenderableGraph(budgetGraph(24, 120), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });

    assert.equal(graph.communityFocus?.sizeBand, "small");
    assert.equal(graph.communityFocus?.representation, "cards-and-labels");
    assert.equal(graph.communityFocus?.completePresence, "nodes");
    assert.equal(graph.nodes.length, 24);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 24);
    assert.equal(graph.budget.limits.maxCards, GRAPH_COMMUNITY_FOCUS_BUDGETS.small.maxCards);
  });

  it("uses the medium community band with all nodes present and most nodes as points", () => {
    const graph = buildRenderableGraph(budgetGraph(120, 600), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      searchResultIds: Array.from({ length: 120 }, (_, index) => `n${index}`)
    });
    const cardCount = graph.nodes.filter((node) => node.displayMode === "card").length;
    const pointCount = graph.nodes.filter((node) => node.displayMode === "point" || node.displayMode === "overview").length;

    assert.equal(graph.communityFocus?.sizeBand, "medium");
    assert.equal(graph.communityFocus?.representation, "points-with-cards");
    assert.equal(graph.nodes.length, 120);
    assert.equal(cardCount, GRAPH_COMMUNITY_FOCUS_BUDGETS.medium.maxCards);
    assert.ok(pointCount > cardCount);
  });

  it("uses the large community band with complete outline and strict card and label caps", () => {
    const graph = buildRenderableGraph(budgetGraph(800, 1400), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      searchResultIds: Array.from({ length: 800 }, (_, index) => `n${index}`)
    });

    assert.equal(graph.communityFocus?.sizeBand, "large");
    assert.equal(graph.communityFocus?.representation, "outline-with-caps");
    assert.equal(graph.communityFocus?.completePresence, "outline");
    assert.equal(graph.nodes.length, 800);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, GRAPH_COMMUNITY_FOCUS_BUDGETS.large.maxCards);
    assert.equal(graph.nodes.filter((node) => node.labelVisible).length, GRAPH_COMMUNITY_FOCUS_BUDGETS.large.maxLabels);
    assert.ok(graph.edges.length > 0);
    assert.ok(graph.edges.length <= GRAPH_COMMUNITY_FOCUS_BUDGETS.large.maxVisibleEdges);
  });

  it("uses the oversized community band as an internal-map entry without rendering every member as a card", () => {
    const graph = buildRenderableGraph(budgetGraph(3000, 1200), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      searchResultIds: Array.from({ length: 3000 }, (_, index) => `n${index}`)
    });

    assert.equal(graph.communityFocus?.sizeBand, "oversized");
    assert.equal(graph.communityFocus?.representation, "internal-map-entry");
    assert.equal(graph.communityFocus?.completePresence, "internal-map");
    assert.equal(graph.nodes.length, GRAPH_COMMUNITY_FOCUS_BUDGETS.oversized.maxVisibleNodes);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
    assert.equal(graph.nodes.filter((node) => node.labelVisible).length, GRAPH_COMMUNITY_FOCUS_BUDGETS.oversized.maxLabels);
    assert.ok(graph.overflow.nodes.hidden > 0);
  });

  it("keeps stable core anchors unchanged when search boosts change", () => {
    const data = budgetGraph(200, 1200);
    const baseline = buildRenderableGraph(data, { theme: "shan-shui" });
    const searched = buildRenderableGraph(data, {
      theme: "shan-shui",
      searchResultIds: data.nodes.slice(120).map((node) => node.id)
    });

    assert.deepEqual(searched.importance.stableCoreNodeIds, baseline.importance.stableCoreNodeIds);
    assert.deepEqual(searched.importance.stableSkeletonEdgeIds, baseline.importance.stableSkeletonEdgeIds);
    assert.ok(searched.importance.temporaryBoostNodeIds.includes("n199"));
    assert.equal(searched.nodes.find((node) => node.id === "n199")?.coreAnchor, baseline.nodes.find((node) => node.id === "n199")?.coreAnchor);
  });

  it("lets search and selection boost visibility without rewriting stable core identity", () => {
    const data = budgetGraph(200, 1200);
    const baseline = buildRenderableGraph(data, { theme: "shan-shui" });
    const boosted = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "n199" },
      searchResultIds: ["n199"]
    });
    const node = boosted.nodes.find((item) => item.id === "n199");

    assert.ok(node);
    assert.deepEqual(boosted.importance.stableCoreNodeIds, baseline.importance.stableCoreNodeIds);
    assert.equal(node.labelVisible, true);
    assert.ok(node.temporaryBoost > 0);
    assert.equal(node.coreAnchor, baseline.nodes.find((item) => item.id === "n199")?.coreAnchor);
  });

  it("keeps many search hits, many pins, and a pressured selected object inside budget caps", () => {
    const data = budgetGraph(200, 1200);
    const pins = Object.fromEntries(
      data.nodes.slice(80).map((node) => [node.source_path || `wiki/budget/${node.id}.md`, { x: 700, y: 420, coordinateSpace: "world" as const }])
    );
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "n199" },
      searchResultIds: data.nodes.map((node) => node.id),
      pins
    });

    assert.ok(graph.importance.temporaryBoostNodeIds.length > GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.ok(graph.budget.usage.maxLabels <= GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.ok(graph.budget.usage.maxVisibleEdges <= GRAPH_RENDER_BUDGETS.global.maxVisibleEdges);
    assert.ok(graph.budget.usage.maxInteractionUpdates <= GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates);
    assert.equal(graph.nodes.find((node) => node.id === "n199")?.labelVisible, true);
    assert.ok(graph.overflow.labels.hidden > 0);
  });

  it("keeps crowded accepted global graphs as sparse point maps without aggregation", () => {
    const data = densePointMapGraph();
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "dense-1999" },
      searchResultIds: ["dense-20", "dense-120", "dense-1220"],
      pins: {
        "wiki/dense/dense-40.md": { x: 860, y: 500, coordinateSpace: "world" },
        "wiki/dense/dense-1440.md": { x: 920, y: 540, coordinateSpace: "world" }
      },
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
    const selected = graph.nodes.find((node) => node.id === "dense-1999");
    const searched = ["dense-20", "dense-120", "dense-1220"].map((id) => graph.nodes.find((node) => node.id === id));
    const pinned = ["dense-40", "dense-1440"].map((id) => graph.nodes.find((node) => node.id === id));
    const ordinaryNodes = graph.nodes.filter((node) => !node.selected && node.temporaryBoost === 0 && !node.coreAnchor);
    const weakEdge = graph.edges.find((edge) => edge.id === "dense-selected-weak");
    const strongEdge = graph.edges.find((edge) => edge.id === "dense-selected-strong");

    assert.equal(graph.counts.visibleNodes, 2000);
    assert.equal(graph.counts.totalEdges, 3996);
    assert.equal(graph.budget.view, "global");
    assert.equal(graph.densityMode, "overview");
    assert.equal(graph.aggregationContainers.length, 0);
    assert.equal(graph.budget.usage.maxCards, 0);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
    assert.ok(ordinaryNodes.length > 1500);
    assert.ok(ordinaryNodes.every((node) => node.displayMode === "overview"), "ordinary dense nodes should stay in overview point mode");
    assert.ok(graph.budget.usage.maxLabels <= GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= GRAPH_RENDER_BUDGETS.global.maxLabels);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length / graph.nodes.length <= 0.03);
    assert.ok(graph.budget.usage.maxVisibleEdges <= GRAPH_RENDER_BUDGETS.global.maxVisibleEdges);
    assert.ok(graph.budget.usage.maxInteractionUpdates <= GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates);
    assert.ok(graph.interaction.updatedObjects <= GRAPH_RENDER_BUDGETS.global.maxInteractionUpdates);
    assert.ok(selected);
    assert.equal(selected.selected, true);
    assert.equal(selected.labelVisible, true);
    assert.ok(searched.every(Boolean));
    assert.ok(searched.every((node) => node?.labelVisible === true));
    assert.ok(pinned.every(Boolean));
    assert.ok(pinned.every((node) => node?.labelVisible === true));
    assert.ok(graph.importance.stableCoreNodeIds.every((id) => graph.nodes.some((node) => node.id === id)), "core anchors should stay visible");
    assert.ok(weakEdge);
    assert.ok(strongEdge);
    assert.ok(weakEdge.opacity < strongEdge.opacity, "weak dense edges should be faded behind strong edges");
    assert.ok(weakEdge.strokeWidth < strongEdge.strokeWidth, "weak dense edges should be thinner than strong edges");
  });

  it("does not produce visible aggregation containers in the normal render model", () => {
    const data = budgetGraph(20, 40);
    const pins = {
      "wiki/budget/n3.md": { x: 700, y: 420, coordinateSpace: "world" as const }
    };
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      selection: { kind: "node", id: "n2" },
      searchResultIds: ["n1", "n4"],
      pins,
      aggregationMarkers: [
        {
          id: "agg-c1",
          label: "Budget container",
          communityId: "c1",
          nodeIds: ["n1", "n2", "n3", "n4"],
          totalCount: 12
        }
      ]
    });

    assert.deepEqual(graph.aggregationContainers, []);
  });

  it("marks moderate community quality without auxiliary organization modes", () => {
    const graph = buildRenderableGraph(manyTinyCommunitiesGraph(), { theme: "shan-shui" });

    assert.equal(graph.communityQuality.level, "moderate");
    assert.equal(graph.communityQuality.boundaryCertainty, "reduced");
    assert.equal(graph.communityQuality.warning, "moderate-community-quality");
    assert.deepEqual(graph.communityQuality.signals.map((signal) => signal.id), ["many-tiny-communities"]);
    assert.deepEqual(graph.communityQuality.auxiliaryViews, []);
  });

  it("lowers boundary certainty and exposes only core connectivity for poor community quality", () => {
    const graph = buildRenderableGraph(oversizedWeakCommunityGraph(), { theme: "shan-shui" });

    assert.equal(graph.communityQuality.level, "poor");
    assert.equal(graph.communityQuality.boundaryCertainty, "low");
    assert.deepEqual(graph.communityQuality.auxiliaryViews, [
      { id: "core-structure-connectivity", label: "核心结构 / 连通性" }
    ]);
    assert.deepEqual(
      graph.communityQuality.signals.map((signal) => signal.id),
      ["oversized-community", "weak-community-labels", "abnormal-community-count"]
    );
    assert.ok(graph.communities.every((community) => community.boundaryCertainty === "low"));
    assert.deepEqual(graph.communityQuality.auxiliaryViews.map((view) => view.id), ["core-structure-connectivity"]);
    assert.equal(graph.communityQuality.auxiliaryViews.some((view) => /type|source|time/i.test(view.id)), false);
  });

  it("detects mixed cross-community edges as an explicit quality signal", () => {
    const quality = evaluateCommunityQuality(mixedCrossCommunityGraph());

    assert.equal(quality.level, "poor");
    assert.ok(quality.signals.some((signal) => signal.id === "mixed-cross-community-edges"));
    assert.deepEqual(quality.auxiliaryViews.map((view) => view.id), ["core-structure-connectivity"]);
  });

  it("enters a community focus view by hiding nodes outside the selected community", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["topic", "entity"]);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ["e1"]);
    assert.equal(graph.counts.visibleNodes, 2);
    assert.equal(graph.counts.totalNodes, 4);
    assert.equal(graph.focus?.kind, "community");
    assert.equal(graph.focus?.id, "c1");
    assert.deepEqual(
      communityWashStates(graph),
      [["c1", true], ["c2", false], ["c3", false]]
    );
  });

  it("filters visible nodes by graph node type and stacks with community focus", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      typeFilters: {
        entity: true,
        topic: false,
        source: true
      }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["entity"]);
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.counts.visibleNodes, 1);
    assert.equal(graph.typeFilters.topic, false);
  });

  it("preserves community focus and type filters when positions are reapplied", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      typeFilters: {
        entity: true,
        topic: false,
        source: true
      },
      positions: {
        topic: { x: 500, y: 500 },
        entity: { x: 420, y: 320 },
        source: { x: 900, y: 120 },
        island: { x: 120, y: 120 }
      }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["entity"]);
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.focus?.id, "c1");
    assert.equal(graph.typeFilters.topic, false);
    assert.deepEqual(
      communityWashStates(graph),
      [["c1", true], ["c2", false], ["c3", false]]
    );
  });

  it("keeps community wash around the member cluster instead of chasing an outlier", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), { theme: "shan-shui" });
    const community = graph.communities.find((item) => item.id === "c1");

    assert.ok(community?.wash);
    assert.equal(community.nodeCount, 5);
    assert.ok(community.wash.cx > 300, `wash center should respond toward the outlier, got ${community.wash.cx}`);
    assert.ok(community.wash.cx < 430, `wash center should stay near the clustered members, got ${community.wash.cx}`);
    assert.equal(community.wash.rx, 190);
    assert.equal(community.wash.ry, 142.8);
  });

  it("keeps community membership stable when a pinned member is outside the wash cap", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      pins: {
        "wiki/outlier.md": { x: 980, y: 650 }
      }
    });
    const community = graph.communities.find((item) => item.id === "c1");
    const outlier = graph.nodes.find((node) => node.id === "outlier");

    assert.ok(community?.wash);
    assert.ok(outlier);
    assert.equal(outlier.community, "c1");
    assert.equal(community.nodeCount, 5);
    assert.equal(community.wash.rx, 190);
    assert.equal(community.wash.ry, 142.8);
    assert.ok(outlier.point.x > community.wash.cx + community.wash.rx, "pinned member may sit outside the capped visual wash");
  });

  it("lets a dragged core member reshape the wash within caps without changing membership", () => {
    const before = buildRenderableGraph(outlierCommunityGraph(), { theme: "shan-shui" });
    const after = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      positions: {
        "core-a": { x: 980, y: 650 }
      }
    });
    const beforeCommunity = before.communities.find((item) => item.id === "c1");
    const afterCommunity = after.communities.find((item) => item.id === "c1");
    const dragged = after.nodes.find((node) => node.id === "core-a");

    assert.ok(beforeCommunity?.wash);
    assert.ok(afterCommunity?.wash);
    assert.ok(dragged);
    assert.equal(dragged.community, "c1");
    assert.equal(afterCommunity.nodeCount, beforeCommunity.nodeCount);
    assert.notEqual(afterCommunity.wash.cx, beforeCommunity.wash.cx);
    assert.ok(afterCommunity.wash.cx > beforeCommunity.wash.cx, "wash should move toward the dragged member");
    assert.equal(afterCommunity.wash.rx, 190);
    assert.equal(afterCommunity.wash.ry, 142.8);
  });

  it("preserves community focus after a member is dragged beyond the wash cap", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      positions: {
        outlier: { x: 980, y: 650 }
      }
    });
    const community = graph.communities.find((item) => item.id === "c1");

    assert.deepEqual(graph.nodes.map((node) => node.id).sort(), ["core-a", "core-b", "core-c", "core-d", "outlier"]);
    assert.ok(community?.wash);
    assert.equal(graph.focus?.id, "c1");
    assert.equal(community.wash.rx, 190);
    assert.equal(community.wash.ry, 142.8);
  });

  it("preserves live drag positions outside the old default world", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      positions: {
        outlier: { x: 1240, y: 816 }
      }
    });
    const outlier = graph.nodes.find((node) => node.id === "outlier");

    assert.ok(outlier);
    assert.deepEqual(outlier.point, { x: 1240, y: 816 });
    assert.equal(outlier.x, 93.939);
    assert.equal(outlier.y, 91.071);
    assert.equal(graph.worldBounds.maxX, 1320);
    assert.equal(graph.worldBounds.maxY, 896);
    assert.equal(outlier.community, "c1");
  });

  it("preserves pinned positions outside the old default world by expanding render bounds", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      pins: {
        "wiki/outlier.md": { x: 1240, y: 816, coordinateSpace: "world" }
      }
    });
    const outlier = graph.nodes.find((node) => node.id === "outlier");

    assert.ok(outlier);
    assert.deepEqual(outlier.point, { x: 1240, y: 816 });
    assert.equal(outlier.x, 93.939);
    assert.equal(outlier.y, 91.071);
    assert.equal(graph.worldBounds.width, 1320);
    assert.equal(graph.worldBounds.height, 896);
  });

  it("does not let expanded render bounds enlarge the community wash cap", () => {
    const graph = buildRenderableGraph(outlierCommunityGraph(), {
      theme: "shan-shui",
      positions: {
        outlier: { x: 5000, y: 3400 }
      }
    });
    const community = graph.communities.find((item) => item.id === "c1");
    const outlier = graph.nodes.find((node) => node.id === "outlier");

    assert.ok(community?.wash);
    assert.ok(outlier);
    assert.ok(graph.worldBounds.width > 5000, `world bounds should expand to include the outlier, got ${graph.worldBounds.width}`);
    assert.ok(graph.worldBounds.height > 3400, `world bounds should expand to include the outlier, got ${graph.worldBounds.height}`);
    assert.equal(community.wash.rx, 190);
    assert.equal(community.wash.ry, 142.8);
    assert.ok(outlier.point.x > community.wash.cx + community.wash.rx, "the node can sit outside the capped visual wash");
    assert.equal(outlier.community, "c1");
  });
});

function communityWashStates(graph: ReturnType<typeof buildRenderableGraph>): Array<[string, boolean]> {
  return graph.communities
    .map((community): [string, boolean] => [community.id, Boolean(community.wash)])
    .sort(([left], [right]) => left.localeCompare(right));
}

describe("screen-effective density", () => {
  it("uses viewport scale to choose the effective density mode", () => {
    assert.equal(screenEffectiveDensityMode(120, 1), "compact-card");
    assert.equal(screenEffectiveDensityMode(120, 2), "card");
    assert.equal(screenEffectiveDensityMode(120, 0.5), "point-plus-focus");
    assert.equal(screenEffectiveDensityMode(30, 0.5), "compact-card");
  });

  it("maps effective density to node display without changing selected cards", () => {
    const node = {
      selected: false,
      labelVisible: false,
      visualRole: "map-pin" as const
    };
    const labeledNode = {
      selected: false,
      labelVisible: true,
      visualRole: "map-pin" as const
    };
    const selectedNode = {
      selected: true,
      labelVisible: false,
      visualRole: "map-pin" as const
    };

    assert.equal(nodeDisplayModeForDensity(node, "card"), "card");
    assert.equal(nodeDisplayModeForDensity(node, "compact-card"), "compact-card");
    assert.equal(nodeDisplayModeForDensity(node, "point-plus-focus"), "point");
    assert.equal(nodeDisplayModeForDensity(labeledNode, "point-plus-focus"), "compact-card");
    assert.equal(nodeDisplayModeForDensity(selectedNode, "overview"), "card");
  });
});

describe("edge drawing helpers", () => {
  it("keeps graph-wash stroke strength bounds", () => {
    assert.equal(edgeStrokeWidth({ weight: 0 }), 1.1);
    assert.equal(edgeStrokeWidth({ weight: 1 }), 2.9);
    assert.equal(edgeOpacity({ weight: 0 }), 0.32);
    assert.equal(edgeOpacity({ weight: 1 }), 0.76);
  });

  it("maps relation type to a separate visual class from confidence", () => {
    assert.equal(edgeRelationClass("实现"), "relation-implementation");
    assert.equal(edgeRelationClass("依赖"), "relation-dependency");
    assert.equal(edgeRelationClass("衍生"), "relation-derivation");
    assert.equal(edgeRelationClass("对比"), "relation-contrast");
    assert.equal(edgeRelationClass("矛盾"), "relation-conflict");
    assert.equal(edgeRelationClass("未知"), "relation-dependency");
  });

  it("keeps global relation edges subdued and focused edges fuller", () => {
    assert.equal(edgeVisualStrokeWidth({ weight: 1 }, false), 1.7);
    assert.equal(edgeVisualStrokeWidth({ weight: 1 }, true), 2.9);
    assert.equal(edgeVisualOpacity({ weight: 1 }, false), 0.42);
    assert.equal(edgeVisualOpacity({ weight: 1 }, true), 0.76);
  });

  it("builds a curved path from atlas node coordinates", () => {
    const path = makeEdgePath(
      { id: "a", label: "A", type: "entity", kind: "概念", community: "c1", x: 10, y: 20 },
      { id: "b", label: "B", type: "entity", kind: "概念", community: "c1", x: 60, y: 70 },
      { weight: 0.5 }
    );

    assert.equal(path, "M 100 136 Q 274 284 600 476");
  });
});
