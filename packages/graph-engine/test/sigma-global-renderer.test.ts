import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  buildSigmaGlobalGraphologyGraph,
  createSigmaGlobalHitProjector,
  createSigmaGlobalRenderer
} from "../src/render";
import type { GraphRendererAdapterData } from "../src";

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

  it("does not silently activate the production lifecycle before later tasks land", () => {
    assert.throws(
      () => createSigmaGlobalRenderer({} as never),
      /Task 3\.4/
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
      type: "topic",
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
      type: "source",
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
});

function adapterDataFixture(): GraphRendererAdapterData {
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
      input: { kind: "node", id: "render-alpha" },
      selectionId: "node:render-alpha",
      selectedNodeIds: ["render-alpha"],
      selectedCommunityIds: ["adapter-community"],
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
        selected: true,
        searchHit: false,
        pinHint: { nodeId: "render-alpha", wikiPath: "adapter/alpha.md", pinned: false, position: null },
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
        selected: false,
        searchHit: true,
        pinHint: {
          nodeId: "render-beta",
          wikiPath: "adapter/beta.md",
          pinned: true,
          position: { x: 333, y: 444, coordinateSpace: "world" }
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
        selected: true,
        searchResultIds: ["render-beta"],
        pinHints: [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ],
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [{ kind: "enter-community", communityId: "adapter-community", label: "进入社区" }]
      }
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
        searchResultIds: ["render-beta"],
        pinnedNodeIds: ["render-beta"],
        totalCount: 17,
        selected: true,
        pinHints: [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ],
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
      communities: [
        {
          id: "adapter-community",
          label: "Adapter Community",
          color: "#123456",
          nodeCount: 2,
          boundaryCertainty: "high",
          wash: { cx: 250, cy: 250, rx: 80, ry: 60, opacity: 0.2 }
        }
      ],
      aggregationContainers: [
        {
          id: "adapter-aggregation",
          role: "aggregation-container",
          label: "Adapter Aggregation",
          communityId: "adapter-community",
          nodeIds: ["render-alpha", "render-beta"],
          nodeCount: 17,
          searchHitCount: 1,
          pinnedCount: 1,
          selectedCount: 1,
          selected: true,
          searchResultIds: ["render-beta"],
          pinnedNodeIds: ["render-beta"],
          selectedNodeIds: ["render-alpha"],
          pinHints: [
            {
              nodeId: "render-beta",
              wikiPath: "adapter/beta.md",
              pinned: true,
              position: { x: 333, y: 444, coordinateSpace: "world" }
            }
          ],
          point: { x: 222, y: 333 },
          x: 22,
          y: 33,
          radius: 44,
          color: "#abcdef"
        }
      ],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId: "render-alpha",
      selectedCommunityId: "adapter-community",
      selectedNodeIds: ["render-alpha"],
      hiddenNodeIds: new Set(),
      searchResultIds: ["render-beta"],
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
