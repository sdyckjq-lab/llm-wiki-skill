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
import { UNGROUPED_COMMUNITY_ID, UNGROUPED_COMMUNITY_LABEL } from "../src/types";
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

function graphWithExternalTemporaryNode(): GraphData {
  const base = sampleGraph();
  return {
    ...base,
    meta: {
      ...base.meta,
      total_nodes: 5,
      total_edges: 3
    },
    nodes: [
      ...base.nodes.filter((node) => node.id !== "source"),
      { id: "external", label: "External", type: "source", community: "c2", source_path: "wiki/external.md", weight: 40, x: 70, y: 60 },
      { id: "external-peer", label: "External peer", type: "entity", community: "c2", source_path: "wiki/external-peer.md", weight: 30, x: 75, y: 65 }
    ],
    edges: [
      { id: "internal", from: "topic", to: "entity", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "bridge", from: "topic", to: "external", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.5 },
      { id: "external-peer-edge", from: "external", to: "external-peer", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.6 }
    ],
    learning: base.learning
      ? {
        ...base.learning,
        communities: [
          { id: "c1", label: "核心", node_count: 2, color_index: 0, recommended_start_node_id: "topic" },
          { id: "c2", label: "外部", node_count: 2, color_index: 1 },
          { id: "c3", label: "孤岛", node_count: 1, color_index: 2 }
        ]
      }
      : base.learning
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

function relationFocusCommunityGraph(): GraphData {
  return {
    meta: {
      build_date: "2026-07-04T00:00:00.000Z",
      wiki_title: "Relation focus fixture",
      total_nodes: 5,
      total_edges: 4
    },
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
      communities: [
        { id: "c1", label: "Relation Focus", node_count: 5, color_index: 0, recommended_start_node_id: "a" }
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

// A community whose internal structure is dominated by a dense high-weight core
// triangle, with three low-weight "small-cluster" leaves hanging off it. Used to
// prove the structure-span selector reaches the leaves instead of piling the whole
// budget onto the core triangle's strongest edges.
function structureSpanGraph(): GraphData {
  return {
    meta: { build_date: "2026-07-08T00:00:00.000Z", wiki_title: "Structure Span", total_nodes: 6, total_edges: 6 },
    nodes: [
      { id: "core1", label: "核心1", type: "topic", community: "c1", source_path: "wiki/core1.md", weight: 100, x: 30, y: 30 },
      { id: "core2", label: "核心2", type: "topic", community: "c1", source_path: "wiki/core2.md", weight: 90, x: 36, y: 36 },
      { id: "core3", label: "核心3", type: "topic", community: "c1", source_path: "wiki/core3.md", weight: 85, x: 42, y: 30 },
      { id: "leaf1", label: "叶1", type: "entity", community: "c1", source_path: "wiki/leaf1.md", weight: 30, x: 14, y: 50 },
      { id: "leaf2", label: "叶2", type: "entity", community: "c1", source_path: "wiki/leaf2.md", weight: 25, x: 50, y: 56 },
      { id: "leaf3", label: "叶3", type: "entity", community: "c1", source_path: "wiki/leaf3.md", weight: 20, x: 62, y: 40 }
    ],
    edges: [
      { id: "core1-core2", from: "core1", to: "core2", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "core2-core3", from: "core2", to: "core3", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.95 },
      { id: "core1-core3", from: "core1", to: "core3", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.9 },
      { id: "core1-leaf1", from: "core1", to: "leaf1", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.3 },
      { id: "core2-leaf2", from: "core2", to: "leaf2", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.25 },
      { id: "core3-leaf3", from: "core3", to: "leaf3", type: "INFERRED", confidence: "INFERRED", relation_type: "衍生", weight: 0.2 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "core1", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["core1", "core2", "core3", "leaf1", "leaf2", "leaf3"], degraded: false }
      },
      communities: [{ id: "c1", label: "Structure", node_count: 6, color_index: 0, recommended_start_node_id: "core1" }]
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

function longTitleCommunityGraph(): GraphData {
  const nodes = [
    { id: "lt-a", label: "这是一个非常长的节点标题用于验证社区近景标签预算与截断A", type: "topic", community: "c1", source_path: "wiki/lt/a.md", weight: 80, x: 28, y: 38 },
    { id: "lt-b", label: "另一个超长标题节点用于验证近景下标签不会横跨整张地图B", type: "entity", community: "c1", source_path: "wiki/lt/b.md", weight: 58, x: 46, y: 44 },
    { id: "lt-c", label: "长标题节点C", type: "entity", community: "c1", source_path: "wiki/lt/c.md", weight: 40, x: 60, y: 52 },
    { id: "lt-d", label: "普通节点D", type: "entity", community: "c1", source_path: "wiki/lt/d.md", weight: 22, x: 72, y: 58 }
  ];
  const edges = [
    { id: "lt-e1", from: "lt-a", to: "lt-b", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
    { id: "lt-e2", from: "lt-a", to: "lt-c", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.6 },
    { id: "lt-e3", from: "lt-b", to: "lt-d", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.4 }
  ];
  return {
    meta: { build_date: "2026-07-03T00:00:00.000Z", wiki_title: "Long Title", total_nodes: nodes.length, total_edges: edges.length },
    nodes, edges,
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "lt-a", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [{ id: "c1", label: "长标题社区", node_count: nodes.length, color_index: 0, recommended_start_node_id: "lt-a" }]
    }
  };
}

function flatCommunityGraph(): GraphData {
  // Equal-weight chain with no natural hub: verifies selected/search still
  // promote tier instead of leaving every node peripheral.
  const nodes = Array.from({ length: 7 }, (_, index) => ({
    id: `flat-${index}`,
    label: `Flat ${index}`,
    type: "entity",
    community: "c1",
    source_path: `wiki/flat/${index}.md`,
    weight: 30,
    x: 22 + index * 9,
    y: 40 + (index % 3) * 6
  }));
  const edges = Array.from({ length: 6 }, (_, index) => ({
    id: `flat-e${index}`,
    from: `flat-${index}`,
    to: `flat-${index + 1}`,
    type: "EXTRACTED",
    confidence: "EXTRACTED",
    relation_type: "依赖",
    weight: 0.5
  }));
  return {
    meta: { build_date: "2026-07-03T00:00:00.000Z", wiki_title: "Flat Community", total_nodes: nodes.length, total_edges: edges.length },
    nodes, edges,
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "flat-0", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
      },
      communities: [{ id: "c1", label: "Flat", node_count: nodes.length, color_index: 0 }]
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

  it("uses selected global nodes as fixed first-order relation focus", () => {
    const graph = buildRenderableGraph(relationFocusCommunityGraph(), {
      theme: "shan-shui",
      selection: { kind: "node", id: "a" }
    });

    const nodeDepths = Object.fromEntries(graph.nodes.map((node) => [node.id, node.relationFocusDepth]));
    const edgeDepths = Object.fromEntries(graph.edges.map((edge) => [edge.id, edge.relationFocusDepth]));

    assert.equal(graph.budget.view, "global");
    assert.equal(graph.selectedNodeId, "a");
    assert.equal(nodeDepths.a, "focus");
    assert.equal(nodeDepths.b, "first");
    assert.equal(nodeDepths.c, "first");
    assert.equal(nodeDepths.e, "unrelated");
    assert.equal(edgeDepths["a-b"], "first");
    assert.equal(edgeDepths["a-c"], "first");
    assert.equal(edgeDepths["d-e"], "unrelated");
  });

  it("clears explicit global relation focus without leaving stale depths", () => {
    const data = relationFocusCommunityGraph();
    const hovered = buildRenderableGraph(data, {
      theme: "shan-shui",
      relationFocusNodeId: "a"
    });
    const cleared = buildRenderableGraph(data, { theme: "shan-shui" });

    assert.equal(hovered.nodes.find((node) => node.id === "a")?.relationFocusDepth, "focus");
    assert.equal(hovered.edges.find((edge) => edge.id === "a-b")?.relationFocusDepth, "first");
    assert.equal(cleared.nodes.every((node) => node.relationFocusDepth === "none"), true);
    assert.equal(cleared.edges.every((edge) => edge.relationFocusDepth === "none"), true);
    assert.equal(cleared.selectedNodeId, null);
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

  it("keeps selected global community preview partial while preserving bridge context", () => {
    const graph = buildRenderableGraph(graphWithExternalTemporaryNode(), {
      theme: "shan-shui",
      selection: { kind: "community", id: "c1" },
      sourceCommunityId: "c1"
    });

    assert.equal(graph.budget.view, "global");
    assert.equal(graph.communityMap.active, false);
    assert.equal(graph.communityMap.current?.source, "source-context");
    assert.deepEqual(Object.keys(graph.communityMap.current?.nodeRulesById ?? {}).sort(), ["entity", "topic"]);
    assert.deepEqual(Object.keys(graph.communityMap.current?.edgeRulesById ?? {}), ["internal"]);
    assert.ok(graph.edges.some((edge) => edge.id === "bridge"), "cross-community bridge edge should remain available in global preview");
    assert.equal(
      graph.communityMap.current?.edgeRulesById["external-peer-edge"],
      undefined,
      "preview must not expand into the external community's full internal reading"
    );
  });

  it("caps selected global community preview instead of exposing a dense internal mesh", () => {
    const graph = buildRenderableGraph(budgetGraph(30, 200), {
      theme: "shan-shui",
      selection: { kind: "community", id: "c1" },
      sourceCommunityId: "c1"
    });
    const communityEdges = Object.values(graph.communityMap.current?.edgeRulesById ?? {});

    assert.equal(graph.budget.view, "global");
    assert.ok(communityEdges.length <= graph.importance.stableSkeletonEdgeIds.length);
    assert.ok(communityEdges.length <= 22, `selected-community preview should stay sparse, got ${communityEdges.length} edges`);
    assert.equal(graph.communityMap.current?.edgeLayers.background, 0);
    assert.equal(graph.communityMap.current?.edgeLayers.related, 0);
    assert.equal(
      graph.edges.every((edge) => edge.communityMapLayer !== "background" && edge.communityMapLayer !== "related"),
      true,
      "selected-community preview must not render the dense internal background mesh"
    );
  });

  it("keeps focused community nodes as a lightweight map without full cards", () => {
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
    assert.equal(graph.budget.limits.maxCards, 0);
    assert.equal(graph.budget.usage.maxCards, 0);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
    assert.ok(graph.nodes.find((node) => node.id === "n79")?.labelVisible, "selected/search/pinned context should still be eligible for a label");
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= graph.budget.limits.maxLabels);
    assert.equal(graph.overflow.cards.total, 0);
    assert.equal(graph.overflow.cards.hidden, 0);

    const firstNode = graph.nodes[0];
    assert.ok(firstNode.communityMapDotSize >= 9, `community map dot should keep a floor size, got ${firstNode.communityMapDotSize}`);
    assert.ok(firstNode.communityMapDotSize <= 24, `community map dot should respect the importance ceiling, got ${firstNode.communityMapDotSize}`);
    assert.ok(["left", "right", "top", "bottom"].includes(firstNode.communityMapLabelSide));
    assert.equal(typeof firstNode.communityMapRelationLabel, "boolean");
  });

  it("uses relation focus to emphasize the active node, direct neighbors, and direct edges in community reading", () => {
    const graph = buildRenderableGraph(relationFocusCommunityGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "node", id: "b" },
      relationFocusNodeId: "a"
    });

    const nodeDepths = Object.fromEntries(graph.nodes.map((node) => [node.id, node.relationFocusDepth]));
    const edgeDepths = Object.fromEntries(graph.edges.map((edge) => [edge.id, edge.relationFocusDepth]));
    const edgeLayers = Object.fromEntries(graph.edges.map((edge) => [edge.id, edge.communityMapLayer]));

    assert.equal(graph.selectedNodeId, "b");
    assert.deepEqual(nodeDepths, {
      a: "focus",
      b: "first",
      c: "first",
      d: "second",
      e: "unrelated"
    });
    // The interaction depth is carried by relationFocusDepth (the seam reused
    // from #135), NOT baked into the static communityMapLayer.
    assert.equal(edgeDepths["a-b"], "first");
    assert.equal(edgeDepths["a-c"], "first");
    assert.equal(edgeDepths["c-d"], "second");
    assert.equal(edgeDepths["d-e"], "unrelated");
    // The static layer is structural-only and stable: this 5-node community's
    // spanning skeleton is its full 4-edge tree, so every edge is a structure
    // line regardless of hover. Hover must NOT rewrite the layer (#135/#136).
    for (const id of ["a-b", "a-c", "c-d", "d-e"]) {
      assert.equal(edgeLayers[id], "skeleton", `edge ${id} layer must stay static under hover`);
    }
    assert.equal(graph.nodes.find((node) => node.id === "a")?.labelVisible, true);
    assert.equal(graph.nodes.find((node) => node.id === "b")?.labelVisible, true);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= graph.budget.limits.maxLabels);
  });

  it("keeps the static communityMapLayer identical with and without hover (no quiet skeleton drop)", () => {
    const data = relationFocusCommunityGraph();
    const base = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });
    const hovered = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      relationFocusNodeId: "a"
    });

    const baseLayers = Object.fromEntries(base.edges.map((edge) => [edge.id, edge.communityMapLayer]));
    const hoveredLayers = Object.fromEntries(hovered.edges.map((edge) => [edge.id, edge.communityMapLayer]));
    // The #135↔#136 fix: the structural layer label must not change when hover
    // assigns first/second/unrelated depth — otherwise hover quietly drops or
    // rewrites the static skeleton emphasis.
    assert.deepEqual(hoveredLayers, baseLayers);
  });

  it("marks only real edges between Shift-multi-selected nodes and never invents links", () => {
    const graph = buildRenderableGraph(relationFocusCommunityGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "nodes", ids: ["a", "b", "c"] }
    });

    const selectedRelation = Object.fromEntries(graph.edges.map((edge) => [edge.id, edge.selectedRelation]));
    // a-b and a-c have both endpoints selected; c-d (d not selected) and d-e do not.
    assert.equal(selectedRelation["a-b"], true);
    assert.equal(selectedRelation["a-c"], true);
    assert.equal(selectedRelation["c-d"], false);
    assert.equal(selectedRelation["d-e"], false);
    // No invented edge id can appear — selectedRelation is only ever read off
    // real renderable edges.
    assert.deepEqual(
      graph.edges.filter((edge) => edge.selectedRelation).map((edge) => edge.id).sort(),
      ["a-b", "a-c"]
    );
  });

  it("marks no selected-relation edge when selected nodes share no direct edge", () => {
    const graph = buildRenderableGraph(relationFocusCommunityGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "nodes", ids: ["b", "d"] }
    });

    // b and d are both selected but no edge directly connects them, so nothing
    // is emphasized — no fan-out to each node's first-degree neighbors.
    assert.equal(graph.edges.some((edge) => edge.selectedRelation), false);
  });

  it("leaves no stale emphasis when a hover ends and there is no selection (#136)", () => {
    const data = relationFocusCommunityGraph();
    const hovered = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      relationFocusNodeId: "a"
    });
    // pointer leave → relationFocusNodeId clears, no selection remains
    const cleared = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });

    // While hovered, interaction depth is active.
    assert.equal(hovered.nodes.find((node) => node.id === "a")?.relationFocusDepth, "focus");
    assert.equal(hovered.edges.find((edge) => edge.id === "a-b")?.relationFocusDepth, "first");
    // After leave, every interaction signal resets to baseline — no residue.
    assert.equal(cleared.nodes.every((node) => node.relationFocusDepth === "none"), true);
    assert.equal(cleared.edges.every((edge) => edge.relationFocusDepth === "none"), true);
    assert.equal(cleared.edges.every((edge) => !edge.selectedRelation), true);
    // The static structural layer is the same before and after (no stale rewrite).
    const hoverLayers = Object.fromEntries(hovered.edges.map((edge) => [edge.id, edge.communityMapLayer]));
    const clearedLayers = Object.fromEntries(cleared.edges.map((edge) => [edge.id, edge.communityMapLayer]));
    assert.deepEqual(clearedLayers, hoverLayers);
  });

  it("previews a hovered node over a multi-selection and returns to the multi-select baseline on leave (#136)", () => {
    const data = relationFocusCommunityGraph();
    const base = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "nodes", ids: ["a", "b"] }
    });
    const previewing = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "nodes", ids: ["a", "b"] },
      relationFocusNodeId: "c"
    });

    // Fixed multi-select baseline: only the real a-b edge is between-selected; no single-node depth.
    assert.equal(base.edges.find((edge) => edge.id === "a-b")?.selectedRelation, true);
    assert.equal(base.nodes.every((node) => node.relationFocusDepth === "none"), true);

    // Hovering c temporarily previews c's first-order relations on top of the selection.
    assert.equal(previewing.nodes.find((node) => node.id === "c")?.relationFocusDepth, "focus");
    assert.equal(previewing.edges.find((edge) => edge.id === "a-c")?.relationFocusDepth, "first");
    // The fixed between-selected emphasis survives the preview.
    assert.equal(previewing.edges.find((edge) => edge.id === "a-b")?.selectedRelation, true);

    // On leave (back to `base`), the preview depth is gone but the selection baseline remains.
    assert.equal(base.nodes.find((node) => node.id === "c")?.relationFocusDepth, "none");
    assert.equal(base.edges.find((edge) => edge.id === "a-c")?.relationFocusDepth, "none");
    assert.equal(base.edges.find((edge) => edge.id === "a-b")?.selectedRelation, true);
  });

  it("keeps every structure line a real edge and never reintroduces filtered-out edges (#136)", () => {
    const data = relationFocusCommunityGraph();
    // Filter out "entity" nodes (b, d, e). Only a (topic) and c (source) survive,
    // so the only renderable edge is a-c. Structure/relation styling must not
    // pull c-d, d-e, or a-b back through the skeleton or interaction layer.
    const graph = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      typeFilters: { topic: true, source: true, entity: false }
    });

    const realEdgeIds = new Set(data.edges.map((edge) => edge.id));
    const survivorIds = new Set(["a", "c"]);
    const renderedIds = graph.edges.map((edge) => edge.id);

    // No invented edge id; every rendered edge is a real data edge.
    for (const id of renderedIds) assert.ok(realEdgeIds.has(id), `rendered edge ${id} must be a real data edge`);
    // Filtered endpoints never come back: every rendered edge stays inside survivors.
    for (const edge of graph.edges) {
      assert.ok(survivorIds.has(edge.source), `edge ${edge.id} source ${edge.source} must survive the filter`);
      assert.ok(survivorIds.has(edge.target), `edge ${edge.id} target ${edge.target} must survive the filter`);
    }
    // The skeleton subset is machine-checked against real edges (eng review F4:
    // turn the "real-edge-only" convention into an assertion).
    for (const edge of graph.edges) {
      if (edge.skeleton) assert.ok(realEdgeIds.has(edge.id), `skeleton edge ${edge.id} must be a real data edge`);
    }
    assert.deepEqual(renderedIds, ["a-c"]);
  });

  it("restores selected-node relation focus when temporary hover focus is removed", () => {
    const data = relationFocusCommunityGraph();
    const hovered = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "node", id: "b" },
      relationFocusNodeId: "a"
    });
    const restored = buildRenderableGraph(data, {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "node", id: "b" }
    });

    assert.equal(hovered.nodes.find((node) => node.id === "a")?.relationFocusDepth, "focus");
    assert.equal(hovered.nodes.find((node) => node.id === "b")?.relationFocusDepth, "first");
    assert.equal(restored.nodes.find((node) => node.id === "b")?.relationFocusDepth, "focus");
    assert.equal(restored.nodes.find((node) => node.id === "a")?.relationFocusDepth, "first");
  });

  it("keeps multi-selected nodes visible while hover relation focus changes in community reading", () => {
    const graph = buildRenderableGraph(relationFocusCommunityGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      selection: { kind: "nodes", ids: ["b", "d"] },
      relationFocusNodeId: "a"
    });

    assert.deepEqual(
      graph.nodes.filter((node) => node.selected).map((node) => node.id),
      ["b", "d"]
    );
    assert.equal(graph.selectedNodeId, null);
    assert.equal(graph.nodes.find((node) => node.id === "a")?.relationFocusDepth, "focus");
    assert.equal(graph.nodes.find((node) => node.id === "b")?.relationFocusDepth, "first");
    assert.equal(graph.nodes.find((node) => node.id === "d")?.relationFocusDepth, "second");
  });

  it("keeps the hovered node label visible even when the label budget is crowded", () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({
      id: `n${index}`,
      label: `Node ${index}`,
      type: "topic",
      community: "c1",
      source_path: `wiki/n${index}.md`,
      weight: index === 19 ? 1 : 100 - index,
      priority: index === 19 ? 1 : 100 - index,
      x: index * 8,
      y: index * 5
    }));
    const graph = buildRenderableGraph({
      meta: { build_date: "2026-07-04T00:00:00.000Z", wiki_title: "Crowded labels", total_nodes: nodes.length, total_edges: 1 },
      nodes,
      edges: [{ id: "n18-n19", from: "n18", to: "n19", weight: 0.1 }],
      learning: {
        version: 1,
        communities: [{ id: "c1", label: "Crowded", node_count: nodes.length }],
        entry: { recommended_start_node_id: "n0", recommended_start_reason: "fixture", default_mode: "global" }
      }
    } as GraphData, {
      focus: { kind: "community", id: "c1" },
      relationFocusNodeId: "n19"
    });

    assert.equal(graph.nodes.find((node) => node.id === "n19")?.relationFocusDepth, "focus");
    assert.equal(graph.nodes.find((node) => node.id === "n19")?.labelVisible, true);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= graph.budget.limits.maxLabels);
  });

  it("keeps direct relation edges visible before applying relation edge emphasis", () => {
    const nodes = [
      { id: "focus", label: "Focus", type: "topic", community: "c1", source_path: "wiki/focus.md", weight: 1, x: 0, y: 0 },
      { id: "neighbor", label: "Neighbor", type: "topic", community: "c1", source_path: "wiki/neighbor.md", weight: 1, x: 10, y: 10 },
      ...Array.from({ length: 1001 }, (_, index) => ({
        id: `n${index}`,
        label: `Node ${index}`,
        type: "topic",
        community: "c1",
        source_path: `wiki/n${index}.md`,
        weight: 100,
        x: 20 + index,
        y: 20 + index
      }))
    ];
    const edges = [
      { id: "focus-neighbor", from: "focus", to: "neighbor", weight: 0.01 },
      ...Array.from({ length: 900 }, (_, index) => ({
        id: `busy-${index}`,
        from: `n${index}`,
        to: `n${index + 1}`,
        weight: 1
      }))
    ];
    const graph = buildRenderableGraph({
      meta: { build_date: "2026-07-04T00:00:00.000Z", wiki_title: "Crowded edges", total_nodes: nodes.length, total_edges: edges.length },
      nodes,
      edges,
      learning: {
        version: 1,
        communities: [{ id: "c1", label: "Crowded", node_count: nodes.length }],
        entry: { recommended_start_node_id: "n0", recommended_start_reason: "fixture", default_mode: "global" }
      }
    } as GraphData, {
      focus: { kind: "community", id: "c1" },
      relationFocusNodeId: "focus"
    });
    const directEdge = graph.edges.find((edge) => edge.id === "focus-neighbor");

    assert.ok(directEdge, "direct relation edge should survive the visible edge budget");
    assert.equal(directEdge.relationFocusDepth, "first");
    assert.equal(directEdge.communityMapLayer, "related");
  });

  it("uses the small community band as a lightweight map with sparse labels", () => {
    const graph = buildRenderableGraph(budgetGraph(24, 120), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });

    assert.equal(graph.communityFocus?.sizeBand, "small");
    assert.equal(graph.communityFocus?.representation, "cards-and-labels");
    assert.equal(graph.communityFocus?.completePresence, "nodes");
    assert.equal(graph.nodes.length, 24);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= GRAPH_COMMUNITY_FOCUS_BUDGETS.small.maxLabels);
    assert.ok(graph.nodes.some((node) => node.displayMode === "point" || node.displayMode === "overview"), "ordinary nodes should remain point-like");
  });

  it("tightens default community labels on narrow viewports", () => {
    const graph = buildRenderableGraph(budgetGraph(5, 4), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      viewportSize: { width: 390, height: 844 }
    });

    assert.equal(graph.communityMap.current?.labelBudget.limit, 2);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= 2);
  });

  it("uses the medium community band with all nodes present and no full cards", () => {
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
    assert.equal(cardCount, 0);
    assert.ok(pointCount > 0);
    assert.ok(graph.nodes.filter((node) => node.labelVisible).length <= GRAPH_COMMUNITY_FOCUS_BUDGETS.medium.maxLabels);
  });

  it("uses the large community band as a lightweight outline map with strict label caps", () => {
    const graph = buildRenderableGraph(budgetGraph(800, 1400), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      searchResultIds: Array.from({ length: 800 }, (_, index) => `n${index}`)
    });

    assert.equal(graph.communityFocus?.sizeBand, "large");
    assert.equal(graph.communityFocus?.representation, "outline-with-caps");
    assert.equal(graph.communityFocus?.completePresence, "outline");
    assert.equal(graph.nodes.length, 800);
    assert.equal(graph.nodes.filter((node) => node.displayMode === "card").length, 0);
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

  it("temporarily displays a community-scope hidden node without expanding its whole community", () => {
    const graph = buildRenderableGraph(graphWithExternalTemporaryNode(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      temporaryObject: { kind: "node", nodeId: "external" }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["topic", "entity", "external"]);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ["internal", "bridge"]);
    assert.equal(graph.communityMap.current?.communityId, "c1");
    assert.deepEqual(Object.keys(graph.communityMap.current?.nodeRulesById ?? {}), ["topic", "entity"]);
  });

  it("keeps temporary aggregation display scoped to the focused community", () => {
    const graph = buildRenderableGraph(graphWithExternalTemporaryNode(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      temporaryObject: {
        kind: "aggregation",
        aggregationId: "mixed",
        nodeIds: ["topic", "external"]
      }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["topic", "entity"]);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ["internal"]);
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

  it("temporarily displays a type-filtered community node without clearing the filter", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" },
      typeFilters: {
        entity: true,
        topic: false,
        source: true
      },
      temporaryObject: { kind: "node", nodeId: "topic" }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id), ["topic", "entity"]);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ["e1"]);
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

  it("normalizes ungrouped nodes into a selectable render community", () => {
    const graph = buildRenderableGraph(graphFixtureWithUngroupedNodes(), {
      selection: { kind: "community", id: UNGROUPED_COMMUNITY_ID }
    });

    const ungrouped = graph.communities.find((community) => community.id === UNGROUPED_COMMUNITY_ID);
    assert.equal(ungrouped?.label, UNGROUPED_COMMUNITY_LABEL);
    assert.ok(ungrouped?.wash, "ungrouped community should be clickable when its nodes are visible");
    assert.deepEqual(
      graph.nodes.filter((node) => node.community === UNGROUPED_COMMUNITY_ID && node.selected).map((node) => node.id),
      ["loose-a", "loose-b"]
    );
  });

  // --- Phase 2: shared community local-map rules ---
  it("exposes explicit community local-map rules in focused community mode", () => {
    const graph = buildRenderableGraph(budgetGraph(80, 240), {
      focus: { kind: "community", id: "c1" },
      sourceCommunityId: "c1",
      selectedNodeId: "n79",
      searchResultIds: ["n78"],
      pins: {
        "wiki/budget/n77.md": { x: 760, y: 420, coordinateSpace: "world" }
      }
    });

    assert.equal(graph.communityMap.active, true);
    assert.equal(graph.communityMap.current?.communityId, "c1");
    assert.deepEqual(Object.keys(graph.communityMap.rulesByCommunityId), ["c1"]);
    assert.equal(graph.communityMap.motionMode, "frozen");
    assert.equal(graph.communityMap.maxNodeDriftRatio, 0);
    assert.ok(graph.communityMap.current);
    assert.equal(graph.communityMap.current.layout.coordinateSpace, "world");
    assert.ok(graph.communityMap.current.layout.bounds.width > 0);
    assert.ok(graph.communityMap.current.layout.bounds.height > 0);
    assert.equal(graph.communityMap.current.labelBudget.limit, graph.budget.limits.maxLabels);
    assert.equal(graph.communityMap.current.labelBudget.visible, graph.nodes.filter((node) => node.labelVisible).length);
    assert.ok(graph.communityMap.current.labelBudget.visible <= graph.communityMap.current.labelBudget.limit);
    assert.ok(graph.communityMap.current.edgeLayers.skeleton >= 1, "community map should keep a visible skeleton edge layer");

    const coreNode = graph.nodes.find((node) => graph.importance.stableCoreNodeIds.includes(node.id));
    assert.ok(coreNode, "fixture should expose at least one stable core node");
    assert.equal(coreNode.communityMapTier, "core");
    assert.equal(graph.communityMap.current.nodeRulesById[coreNode.id]?.tier, "core");
    assert.deepEqual(graph.communityMap.current.nodeRulesById[coreNode.id]?.basePoint, coreNode.point);

    const selectedNode = graph.nodes.find((node) => node.id === "n79");
    assert.ok(selectedNode, "selected node should remain visible in the community map");
    assert.notEqual(selectedNode.communityMapTier, "peripheral");

    const quietGraph = buildRenderableGraph(budgetGraph(80, 240), {
      focus: { kind: "community", id: "c1" },
      sourceCommunityId: "c1"
    });
    const peripheralNode = quietGraph.nodes.find((node) => !node.coreAnchor && !node.labelVisible);
    assert.ok(peripheralNode, "fixture should include an unlabeled peripheral node");
    assert.equal(peripheralNode.communityMapTier, "peripheral");

    const skeletonEdge = quietGraph.edges.find((edge) => edge.skeleton);
    assert.ok(skeletonEdge, "fixture should expose a skeleton edge");
    assert.equal(skeletonEdge.communityMapLayer, "skeleton");
    assert.equal(quietGraph.communityMap.current?.edgeRulesById[skeletonEdge.id]?.layer, "skeleton");

    assert.ok(graph.edges.every((edge) => ["skeleton", "related", "background"].includes(edge.communityMapLayer)));
  });

  it("keeps global mode live while marking local-map rules inactive", () => {
    const graph = buildRenderableGraph(sampleGraph());

    assert.equal(graph.communityMap.active, false);
    assert.equal(graph.communityMap.current, null);
    assert.deepEqual(graph.communityMap.rulesByCommunityId, {});
    assert.equal(graph.communityMap.motionMode, "live");
    assert.equal(graph.communityMap.maxNodeDriftRatio, 1);
  });

  it("computes only the explicit source community snapshot in global mode", () => {
    const graph = buildRenderableGraph(budgetGraph(80, 240), {
      sourceCommunityId: "c1"
    });

    assert.equal(graph.communityMap.active, false);
    assert.equal(graph.communityMap.current?.communityId, "c1");
    assert.deepEqual(Object.keys(graph.communityMap.rulesByCommunityId), ["c1"]);
    assert.ok(Object.keys(graph.communityMap.current?.nodeRulesById ?? {}).length > 0);
    assert.ok(
      Object.keys(graph.communityMap.current?.nodeRulesById ?? {}).every((nodeId) =>
        graph.nodes.find((node) => node.id === nodeId)?.community === "c1"
      )
    );
    assert.ok(
      Object.keys(graph.communityMap.current?.edgeRulesById ?? {}).every((edgeId) => {
        const edge = graph.edges.find((item) => item.id === edgeId);
        if (!edge) return false;
        const source = graph.nodes.find((node) => node.id === edge.source);
        const target = graph.nodes.find((node) => node.id === edge.target);
        return source?.community === "c1" && target?.community === "c1";
      })
    );
  });

  it("does not treat the source community context as selected nodes", () => {
    const graph = buildRenderableGraph(budgetGraph(80, 240), {
      focus: { kind: "community", id: "c1" },
      sourceCommunityId: "c1"
    });

    assert.equal(graph.communityMap.current?.communityId, "c1");
    assert.ok(graph.nodes.some((node) => node.communityMapTier === "peripheral"));
    assert.ok(graph.nodes.some((node) => graph.communityMap.current?.nodeRulesById[node.id]?.tier === "peripheral"));
  });

  it("keeps local-map rules stable across visual-risk community fixtures", () => {
    const fixtures = [
      { name: "dense community", data: budgetGraph(120, 320), communityId: "c1", options: {} },
      { name: "edge-heavy community", data: budgetGraph(40, 600), communityId: "c1", options: {} },
      { name: "long-title community", data: longTitleCommunityGraph(), communityId: "c1", options: {} },
      { name: "no-obvious-core community", data: flatCommunityGraph(), communityId: "c1", options: { selectedNodeId: "flat-2", searchResultIds: ["flat-3"] } },
      { name: "weak/disconnected community", data: oversizedWeakCommunityGraph(), communityId: "community", options: {} }
    ];
    for (const fixture of fixtures) {
      const graph = buildRenderableGraph(fixture.data, {
        focus: { kind: "community", id: fixture.communityId },
        ...fixture.options
      });
      assert.ok(graph.communityMap.current, `${fixture.name}: snapshot should exist`);
      assert.equal(graph.communityMap.current?.communityId, fixture.communityId, `${fixture.name}: community id`);
      assert.ok(
        graph.communityMap.current.labelBudget.visible <= graph.communityMap.current.labelBudget.limit,
        `${fixture.name}: visible labels should stay inside the label budget`
      );
      assert.ok(
        graph.nodes.some((node) => node.communityMapTier !== "peripheral"),
        `${fixture.name}: at least one node should be core/related`
      );
      assert.ok(
        graph.edges.every((edge) => ["skeleton", "related", "background"].includes(edge.communityMapLayer)),
        `${fixture.name}: every edge should map to a local-map layer`
      );
    }
  });

  it("does not eagerly compute snapshots for every community", () => {
    const global = buildRenderableGraph(densePointMapGraph());
    assert.equal(global.communityMap.current, null);
    assert.deepEqual(global.communityMap.rulesByCommunityId, {});

    const sourceCommunity = "dense-community-3";
    const withSource = buildRenderableGraph(densePointMapGraph(), { sourceCommunityId: sourceCommunity });
    assert.equal(withSource.communityMap.active, false);
    assert.equal(withSource.communityMap.current?.communityId, sourceCommunity);
    assert.deepEqual(Object.keys(withSource.communityMap.rulesByCommunityId), [sourceCommunity]);
    assert.ok(
      Object.keys(withSource.communityMap.rulesByCommunityId).length < withSource.communities.length,
      "source-community mode should compute exactly one snapshot, not one per community"
    );

    const snapshotNodeIds = Object.keys(withSource.communityMap.current?.nodeRulesById ?? {}).sort();
    const communityNodeIds = withSource.nodes.filter((node) => node.community === sourceCommunity).map((node) => node.id).sort();
    assert.ok(snapshotNodeIds.length > 0, "source-community snapshot should include that community's nodes");
    assert.deepEqual(snapshotNodeIds, communityNodeIds, "source-community snapshot must filter to that community's nodes only");

    assert.ok(
      Object.keys(withSource.communityMap.current?.edgeRulesById ?? {}).every((edgeId) => {
        const edge = withSource.edges.find((item) => item.id === edgeId);
        if (!edge) return false;
        const source = withSource.nodes.find((node) => node.id === edge.source);
        const target = withSource.nodes.find((node) => node.id === edge.target);
        return source?.community === sourceCommunity && target?.community === sourceCommunity;
      }),
      "source-community snapshot must filter to that community's internal edges only"
    );

    assert.ok(withSource.budget.usage.maxLabels <= withSource.budget.limits.maxLabels);
    assert.ok(withSource.budget.usage.maxVisibleEdges <= withSource.budget.limits.maxVisibleEdges);
  });

  it("caps structure skeleton edges by community size band", () => {
    // 30-node community lands in the 25-60 band: design budget cap is 22.
    const graph = buildRenderableGraph(budgetGraph(30, 400), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });
    const skeletonCount = graph.importance.stableSkeletonEdgeIds.length;
    assert.ok(skeletonCount <= 22, `30-node community skeleton must respect the 25-60 band cap (22), got ${skeletonCount}`);
    // Skeleton is a subset of the visible-edge budget, leaving room for background
    // relations — never a second independent budget that crowds them out (#135).
    assert.ok(
      skeletonCount < graph.edges.length,
      `skeleton must leave visible edges for the background layer, got ${skeletonCount} of ${graph.edges.length} rendered`
    );

    // 15-node community lands in the 9-24 band: design budget cap is 14.
    const medium = buildRenderableGraph(budgetGraph(15, 120), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });
    const mediumCount = medium.importance.stableSkeletonEdgeIds.length;
    assert.ok(mediumCount <= 14, `15-node community skeleton must respect the 9-24 band cap (14), got ${mediumCount}`);
  });

  it("picks structure skeleton edges that reach small clusters, not just the highest-weight edges", () => {
    const graph = buildRenderableGraph(structureSpanGraph(), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });
    const skeletonIds = new Set(graph.importance.stableSkeletonEdgeIds);
    // 6-node community → 1-8 band → cap is nodeCount-1 = 5.
    assert.ok(skeletonIds.size <= 5, `skeleton budget exceeded: ${skeletonIds.size}`);

    // Every small-cluster leaf should be reached by a structure line. A naive
    // top-K-by-weight selector would spend the budget on the core triangle and
    // leave the weakest leaf (leaf3) disconnected.
    const reachedNodes = new Set<string>();
    for (const edge of graph.edges) {
      if (skeletonIds.has(edge.id)) {
        reachedNodes.add(edge.source);
        reachedNodes.add(edge.target);
      }
    }
    for (const leaf of ["leaf1", "leaf2", "leaf3"]) {
      assert.ok(reachedNodes.has(leaf), `small-cluster ${leaf} must be reached by a structure line, not crowded out by the dense core`);
    }

    // Structure lines form a forest (no cycle): the core triangle may contribute at
    // most two edges, never all three. A top-K selector that ignores connectivity
    // would select all three high-weight triangle edges and close a cycle.
    assertOkForest(graph.edges.filter((edge) => skeletonIds.has(edge.id)), graph.nodes.map((node) => node.id));
  });

  it("keeps structure skeleton edges a subset of real graph edges", () => {
    const data = structureSpanGraph();
    const graph = buildRenderableGraph(data, { theme: "shan-shui", focus: { kind: "community", id: "c1" } });
    const realEdgeIds = new Set((data.edges ?? []).map((edge) => edge.id));
    assert.ok(realEdgeIds.size > 0);
    for (const id of graph.importance.stableSkeletonEdgeIds) {
      assert.ok(realEdgeIds.has(id), `skeleton edge ${id} must be a real graph edge, not fabricated`);
    }
  });

  it("does not force structure lines beyond what a sparse community's real edges support", () => {
    // 30 nodes but only 5 real edges: a sparse community must not fabricate or
    // over-extend structure. Skeleton stays within the real edge count.
    const graph = buildRenderableGraph(budgetGraph(30, 5), {
      theme: "shan-shui",
      focus: { kind: "community", id: "c1" }
    });
    assert.ok(
      graph.importance.stableSkeletonEdgeIds.length <= 5,
      `sparse community must not exceed its real edge count, got ${graph.importance.stableSkeletonEdgeIds.length}`
    );
  });
});

// Union-Find check that a set of edges forms a forest (acyclic). Used to prove the
// structure-span selector never piles redundant edges inside an already-connected
// cluster — each selected edge must bridge two previously-separate components.
function assertOkForest(edges: Array<{ id: string; source: string; target: string }>, nodeIds: string[]): void {
  const parent = new Map<string, string>();
  for (const id of nodeIds) parent.set(id, id);
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, parent.get(next)!);
      current = next;
    }
    return current;
  };
  for (const edge of edges) {
    const rootA = find(edge.source);
    const rootB = find(edge.target);
    assert.notEqual(
      rootA,
      rootB,
      `structure skeleton must be a forest, but edge ${edge.id} (${edge.source}-${edge.target}) closes a cycle`
    );
    parent.set(rootA, rootB);
  }
}

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

function graphFixtureWithUngroupedNodes(): GraphData {
  return {
    meta: {
      build_date: "2026-06-18T00:00:00.000Z",
      wiki_title: "Ungrouped render graph",
      total_nodes: 4,
      total_edges: 1
    },
    nodes: [
      { id: "a", label: "Alpha", type: "topic", community: "alpha", source_path: "wiki/alpha/a.md", weight: 2 },
      { id: "b", label: "Beta", type: "entity", community: "alpha", source_path: "wiki/alpha/b.md" },
      { id: "loose-a", label: "Loose A", type: "topic", community: null, source_path: "wiki/loose/a.md", score: 2 },
      { id: "loose-b", label: "Loose B", type: "entity", source_path: "wiki/loose/b.md", weight: 1 }
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED", relation_type: "实现", weight: 0.6 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "a", recommended_start_reason: "hub", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: ["a", "b"], degraded: false }
      },
      communities: [
        { id: "alpha", label: "Alpha", node_count: 2, color_index: 0, members: ["a", "b"] }
      ]
    }
  };
}

describe("buildRenderableGraph community worldBounds aspect", () => {
  it("aspect-locks worldBounds to viewport ratio when focus=community + viewportSize", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      focus: { kind: "community", id: "c1" },
      viewportSize: { width: 1600, height: 900 }
    });
    const ratio = graph.worldBounds.width / graph.worldBounds.height;
    assert.ok(Math.abs(ratio - 1600 / 900) < 0.05, `worldBounds aspect ~ viewport, got ${ratio}`);
  });
  it("does not force-lock worldBounds when focus=global", () => {
    const tight = buildRenderableGraph(sampleGraph(), {});
    const withSize = buildRenderableGraph(sampleGraph(), {
      viewportSize: { width: 1600, height: 900 }
    });
    // global 不 aspect-lock：传不传 viewportSize，worldBounds 宽高比都应基本不变
    assert.ok(
      Math.abs(tight.worldBounds.width / tight.worldBounds.height - (withSize.worldBounds.width / withSize.worldBounds.height)) < 0.05,
      "global worldBounds unaffected by viewportSize"
    );
  });
  it("aspect-locked worldBounds still contains all community node points", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      focus: { kind: "community", id: "c1" },
      viewportSize: { width: 1600, height: 900 }
    });
    for (const node of graph.nodes) {
      assert.ok(node.point.x >= graph.worldBounds.minX && node.point.x <= graph.worldBounds.maxX, `node ${node.id} x in bounds`);
      assert.ok(node.point.y >= graph.worldBounds.minY && node.point.y <= graph.worldBounds.maxY, `node ${node.id} y in bounds`);
    }
  });
});

describe("renderable node communityColor", () => {
  it("attaches the community color to each node, matching its community wash color", () => {
    const graph = buildRenderableGraph(sampleGraph(), {});
    for (const node of graph.nodes) {
      const communityColor = graph.communities.find((c) => c.id === node.community)?.color;
      assert.equal(node.communityColor, communityColor, `node ${node.id} matches its community color`);
    }
  });
  it("still assigns a valid color when node.community is absent from learning.communities (atlas derives it)", () => {
    const data = sampleGraph();
    data.nodes = data.nodes.map((n) => (n.id === "topic" ? { ...n, community: "nonexistent" } : n));
    const graph = buildRenderableGraph(data, {});
    const topic = graph.nodes.find((n) => n.id === "topic");
    assert.match(topic?.communityColor ?? "", /^#[0-9a-f]{6}$/i, "orphan node still gets a valid hex color");
  });
});
