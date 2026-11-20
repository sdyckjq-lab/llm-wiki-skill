# Community View Phase 2 Local Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DOM community reading view feel like a stable close-up of the Sigma global map by sharing position, tier, label, and edge rules while preserving the source community context on return.

**Architecture:** Keep the two renderers: Sigma for global overview and DOM/SVG for community reading. Add explicit shared local-map rule snapshots in `@llm-wiki/graph-engine`, make both renderer paths consume those outputs, store the source community context separately from the current selection, freeze automatic community reading motion by default, preserve manual drag/fix behavior through a direct frozen-drag path, and verify the global -> community -> global flow in browser tests.

**Tech Stack:** TypeScript, React 19, Vite, Node `node:test`, Playwright browser regression scripts, `@llm-wiki/graph-engine`, Sigma/Graphology for global rendering, DOM/SVG renderer for community reading.

---

## Completion Standard

Phase 2 is complete when:

- Global Sigma and DOM community views consume the same computed local-map rule snapshot for node tier, label visibility, edge layer, base position, and close-up bounds.
- Local-map rule snapshots are keyed by community id, but Phase 2 computes only the focused community or the explicit source community context, not every community in the knowledge base.
- A source community context is stored separately from `selection`. It can drive the return-to-global highlight, but it must not make every node in the community count as selected/core inside the DOM reading view.
- Each snapshot contains real per-node and per-edge rules keyed by id, not only summary counts. Summary counts are useful diagnostics, but the renderers must share the actual rules they draw from.
- A selected/source community snapshot in global mode is computed from that community's nodes and internal edges only. It must not count labels or edges from the whole graph under a single community id.
- DOM community reading mode does not start the free live simulation that can reshape the community after entry.
- Freezing automatic motion does not disable manual node drag/fix; a focused community node can still be dragged, pinned, cancelled, and returned to global without losing its position.
- Core nodes, budgeted labels, and edge layers are visible as data attributes in DOM and as adapter/Sigma attributes for contract tests.
- Entering a community records a source community context; returning to global uses that context to keep the source community highlighted until an explicit clear/reset, selecting another community, switching knowledge base, or the community disappearing from data.
- Engine tests cover dense, long-title, edge-heavy, no-obvious-core, weak, and disconnected community cases. Browser regressions cover the real desktop and mobile Phase 2 flow with screenshots.

## File Structure

Create:

- `packages/graph-engine/test/render-pipeline-motion.test.ts` - pure unit tests for the community motion gate.
- `tests/browser/graph-community-phase2-local-map.mjs` - workbench browser regression for global Sigma -> DOM community -> Sigma return.
- `tests/graph-community-phase2-local-map.regression-1.sh` - shell wrapper that builds a temporary knowledge base and runs the new browser regression.

Modify:

- `packages/graph-engine/src/render/model.ts` - add explicit community local-map rule fields and derive them from existing importance, label, edge, and focus signals.
- `packages/graph-engine/src/render/index.ts` - export the new rule types.
- `packages/graph-engine/src/render/adapter.ts` - pass rule fields through the renderer adapter.
- `packages/graph-engine/src/render/sigma-graphology-model.ts` - preserve shared rule attributes in Sigma graphology nodes and edges.
- `packages/graph-engine/src/render/dom-svg-renderer.ts` - expose rule snapshot and motion mode on the DOM graph root.
- `packages/graph-engine/src/render/nodes.ts` - expose node tier and label rule metadata on DOM nodes.
- `packages/graph-engine/src/render/edges.ts` - expose edge layer metadata on DOM edges.
- `packages/graph-engine/src/render/render-pipeline.ts` - prevent free live simulation in focused community reading mode.
- `packages/graph-engine/src/render/controller.ts` - keep manual node drag/fix working when focused community motion is frozen.
- `packages/graph-engine/src/render/node-drag-lifecycle.ts` - add direct commit/cancel helpers for frozen community drag, without starting a free simulation.
- `packages/graph-engine/test/render-model.test.ts` - verify local-map rules, label budget, and edge layer derivation.
- `packages/graph-engine/test/node-drag-lifecycle.test.ts` - verify frozen drag commit/cancel helper behavior.
- `packages/graph-engine/test/renderer-lifecycle.test.ts` - verify focused community drag/fix remains usable while automatic motion is frozen.
- `packages/graph-engine/test/renderer-adapter-contract.test.ts` - verify adapter exposes the shared rule fields.
- `packages/graph-engine/test/sigma-graphology-model.test.ts` - verify Sigma preserves shared rule attributes from the adapter.
- `tests/browser/graph-community-node-map.mjs` - add DOM-level checks for local-map rule attributes and no post-entry drift.
- `packages/graph-engine/src/facade.ts` - store and clear source community context separately from current selection.
- `workbench/web/src/lib/graph-community-enter.ts` - record source community context while focusing community reading.
- `workbench/web/test/graph-community-enter.test.ts` - update the source community context expectation.

Do not modify:

- Community renderer migration to Sigma. That is tracked separately by Issue #95.
- Transition animation. That belongs to Phase 2.1 after the static close-up passes.
- Right drawer structure beyond reading the explicit source community context.

## Task 0: Branch And Baseline

**Files:**

- No source file changes in this task.

- [ ] **Step 1: Start from the current main branch and create a feature branch**

Run:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/feat-community-view-phase2-local-map
```

Expected:

```text
Switched to a new branch 'codex/feat-community-view-phase2-local-map'
```

- [ ] **Step 2: Confirm the working tree before implementation**

Run:

```bash
git status --short --branch
```

Expected:

```text
## codex/feat-community-view-phase2-local-map
```

If unrelated local files are present, leave them untouched and stage only files changed by this plan.

- [ ] **Step 3: Run the baseline focused tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
npm run test -w @llm-wiki-agent/web
```

Expected:

```text
# pass
```

The exact Node test count can differ as tests are added later; the important baseline is that both commands finish with no failing test.

## Task 1: Add Explicit Shared Local-Map Rules

**Files:**

- Modify: `packages/graph-engine/src/render/model.ts`
- Modify: `packages/graph-engine/src/render/index.ts`
- Test: `packages/graph-engine/test/render-model.test.ts`

- [ ] **Step 1: Write failing render-model tests for shared community local-map rules**

Add these tests inside the existing `describe("render model", ...)` block in `packages/graph-engine/test/render-model.test.ts`:

```ts
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

  const peripheralNode = graph.nodes.find((node) => !node.coreAnchor && !node.labelVisible && node.id !== "n79" && node.id !== "n78");
  assert.ok(peripheralNode, "fixture should include an unlabeled peripheral node");
  assert.equal(peripheralNode.communityMapTier, "peripheral");

  const skeletonEdge = graph.edges.find((edge) => edge.skeleton);
  assert.ok(skeletonEdge, "fixture should expose a skeleton edge");
  assert.equal(skeletonEdge.communityMapLayer, "skeleton");
  assert.equal(graph.communityMap.current.edgeRulesById[skeletonEdge.id]?.layer, "skeleton");

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
```

- [ ] **Step 2: Run the new tests and verify they fail for missing fields**

Run:

```bash
node --import tsx --test packages/graph-engine/test/render-model.test.ts
```

Expected:

```text
error TS2339: Property 'communityMap' does not exist
error TS2339: Property 'communityMapTier' does not exist
error TS2339: Property 'communityMapLayer' does not exist
```

- [ ] **Step 3: Add the shared rule types**

In `packages/graph-engine/src/render/model.ts`, add the type definitions near the existing render model types:

```ts
export type CommunityMapNodeTier = "core" | "related" | "peripheral";
export type CommunityMapEdgeLayer = "skeleton" | "related" | "background";
export type CommunityMapMotionMode = "live" | "frozen";
export type CommunityMapLabelSide = "left" | "right" | "top" | "bottom";

export interface CommunityMapNodeRule {
  nodeId: NodeId;
  tier: CommunityMapNodeTier;
  basePoint: RenderPosition;
  labelVisible: boolean;
  labelSide: CommunityMapLabelSide;
  relationLabel: boolean;
  importance: number;
  dotSize: number;
}

export interface CommunityMapEdgeRule {
  edgeId: EdgeId;
  layer: CommunityMapEdgeLayer;
  skeleton: boolean;
  traceable: boolean;
}

export interface CommunityMapLayoutSnapshot {
  coordinateSpace: "world";
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  viewportAspectRatio: number | null;
}

export interface CommunityMapRuleSnapshot {
  communityId: string;
  source: "focus" | "source-context";
  nodeRulesById: Record<NodeId, CommunityMapNodeRule>;
  edgeRulesById: Record<EdgeId, CommunityMapEdgeRule>;
  layout: CommunityMapLayoutSnapshot;
  labelBudget: {
    limit: number;
    visible: number;
    hidden: number;
  };
  edgeLayers: Record<CommunityMapEdgeLayer, number>;
}

export interface GraphCommunityMapRules {
  active: boolean;
  sourceCommunityId: string | null;
  motionMode: CommunityMapMotionMode;
  maxNodeDriftRatio: number;
  current: CommunityMapRuleSnapshot | null;
  rulesByCommunityId: Record<string, CommunityMapRuleSnapshot>;
}
```

Update the renderable interfaces:

```ts
export interface RenderableGraph {
  // existing fields stay unchanged
  communityMap: GraphCommunityMapRules;
}

export interface RenderableNode {
  // existing fields stay unchanged
  // Reuse existing communityMapImportance, communityMapDotSize,
  // communityMapLabelSide, and communityMapRelationLabel.
  communityMapTier: CommunityMapNodeTier;
}

export interface RenderableEdge {
  // existing fields stay unchanged
  communityMapLayer: CommunityMapEdgeLayer;
}
```

Also extend `BuildRenderableGraphOptions` with:

```ts
sourceCommunityId?: string | null;
```

This field is read only by the local-map snapshot builder and return-highlight flow. It must not be passed into `resolveSelectedNodeIds(...)`, and it must not affect `node.selected`.

- [ ] **Step 4: Derive node tiers from the existing rule signals**

In `packages/graph-engine/src/render/model.ts`, add this helper near the existing `communityMapImportanceById` helper:

```ts
function communityMapNodeTier(
  node: AtlasNode,
  signals: {
    coreNodeIds: Set<string>;
    selectedNodeIds: Set<string>;
    pinnedNodeIds: Set<string>;
    searchResultIds: Set<string>;
    labelNodeIds: Set<string>;
    importantNodeIds: Record<string, boolean>;
    startNodeIds: Record<string, boolean>;
  }
): CommunityMapNodeTier {
  // `selectedNodeIds` must contain only real node/nodes selections.
  // The source community context is not a selection and must not promote
  // every node in the source community to core.
  if (
    signals.coreNodeIds.has(node.id) ||
    signals.selectedNodeIds.has(node.id) ||
    signals.startNodeIds[node.id] === true
  ) {
    return "core";
  }
  if (
    signals.pinnedNodeIds.has(node.id) ||
    signals.searchResultIds.has(node.id) ||
    signals.labelNodeIds.has(node.id) ||
    signals.importantNodeIds[node.id] === true
  ) {
    return "related";
  }
  return "peripheral";
}
```

In the `nodes = budgetedVisibleNodes.map(...)` block, add:

```ts
communityMapTier: communityMapNodeTier(node, {
  coreNodeIds: stableCoreNodeSet,
  selectedNodeIds: selectedNodeSet,
  pinnedNodeIds: pinnedNodeSet,
  searchResultIds: searchResultSet,
  labelNodeIds: labelNodeSet,
  importantNodeIds: importantIds,
  startNodeIds: startIds
}),
```

- [ ] **Step 5: Derive edge layers from the existing skeleton and interaction signals**

In `packages/graph-engine/src/render/model.ts`, add:

```ts
function communityMapEdgeLayer(
  edge: AtlasEdge,
  signals: {
    skeletonEdgeIds: Set<string>;
    interactionEdgeIds: Set<string>;
  }
): CommunityMapEdgeLayer {
  if (signals.skeletonEdgeIds.has(edge.id)) return "skeleton";
  if (signals.interactionEdgeIds.has(edge.id)) return "related";
  return "background";
}

function communityMapEdgeLayerCounts(edges: RenderableEdge[]): Record<CommunityMapEdgeLayer, number> {
  return edges.reduce<Record<CommunityMapEdgeLayer, number>>(
    (counts, edge) => {
      counts[edge.communityMapLayer] += 1;
      return counts;
    },
    { skeleton: 0, related: 0, background: 0 }
  );
}
```

In the edge mapping block, compute the layer before returning the edge:

```ts
const localMapLayer = communityMapEdgeLayer(edge, {
  skeletonEdgeIds: stableSkeletonEdgeSet,
  interactionEdgeIds: interactionEdgeIdSet
});
```

Add the field to each returned edge:

```ts
communityMapLayer: localMapLayer,
```

- [ ] **Step 6: Return the graph-level community map snapshot**

After `const activeEdges = ...`, add:

```ts
const communityMapActive = focus?.kind === "community";
const communityMapCommunityId =
  focus?.kind === "community"
    ? focus.id
    : options.sourceCommunityId
      ? options.sourceCommunityId
      : null;
const communityMapNodeSet = new Set(
  communityMapCommunityId
    ? nodes.filter((node) => node.community === communityMapCommunityId).map((node) => node.id)
    : []
);
const communityMapNodes = nodes.filter((node) => communityMapNodeSet.has(node.id));
const communityMapEdges = edges.filter((edge) => communityMapNodeSet.has(edge.source) && communityMapNodeSet.has(edge.target));
const communityMapVisibleLabels = communityMapNodes.filter((node) => node.labelVisible).length;
const communityMapEdgeLayers = communityMapEdgeLayerCounts(communityMapEdges);
const communityMapCurrent = communityMapCommunityId
  ? {
    communityId: communityMapCommunityId,
    source: communityMapActive ? "focus" : "source-context",
    nodeRulesById: Object.fromEntries(
      communityMapNodes.map((node) => [
        node.id,
        {
          nodeId: node.id,
          tier: node.communityMapTier,
          basePoint: node.point,
          labelVisible: node.labelVisible,
          labelSide: node.communityMapLabelSide,
          relationLabel: node.communityMapRelationLabel,
          importance: node.communityMapImportance,
          dotSize: node.communityMapDotSize
        }
      ])
    ),
    edgeRulesById: Object.fromEntries(
      communityMapEdges.map((edge) => [
        edge.id,
        {
          edgeId: edge.id,
          layer: edge.communityMapLayer,
          skeleton: edge.skeleton,
          traceable: edge.traceable
        }
      ])
    ),
    layout: communityMapLayoutSnapshot(communityMapNodes, { viewportSize: options.viewportSize }),
    labelBudget: {
      limit: budgetLimits.maxLabels,
      visible: communityMapVisibleLabels,
      hidden: Math.max(0, communityMapNodes.length - communityMapVisibleLabels)
    },
    edgeLayers: communityMapEdgeLayers
  }
  : null;
```

In the `return { ... }` object, add:

```ts
communityMap: {
  active: communityMapActive,
  sourceCommunityId: options.sourceCommunityId || null,
  motionMode: communityMapActive ? "frozen" : "live",
  maxNodeDriftRatio: communityMapActive ? 0 : 1,
  current: communityMapCurrent,
  rulesByCommunityId: communityMapCurrent ? { [communityMapCurrent.communityId]: communityMapCurrent } : {}
},
```

Do not compute snapshots for every community in `model.communities`. Phase 2 only computes the current focused community or the explicit source community context so large knowledge bases do not pay an all-community cost while still in global view. Do not build a source snapshot from the whole global `nodes` / `edges` arrays without filtering by community first.

- [ ] **Step 7: Export the new types**

In `packages/graph-engine/src/render/index.ts`, add these exports to the existing type export block:

```ts
CommunityMapEdgeLayer,
CommunityMapLabelSide,
CommunityMapLayoutSnapshot,
CommunityMapMotionMode,
CommunityMapEdgeRule,
CommunityMapNodeTier,
CommunityMapNodeRule,
CommunityMapRuleSnapshot,
GraphCommunityMapRules,
```

- [ ] **Step 8: Add edge-case render-model coverage**

Extend `packages/graph-engine/test/render-model.test.ts` with one table-driven test that covers these Phase 2 visual-risk fixtures:

- Dense community: many nodes close together keeps labels inside budget and exposes a skeleton layer.
- Long-title community: very long labels do not change node positions or force all labels visible.
- Edge-heavy community: skeleton edges exist, weak/background edges are assigned to the background layer, and traceable/related edges stay distinguishable. Do not require background edges to be fewer than skeleton edges; in a dense community background edges may naturally be the majority.
- No-obvious-core community: selected, start, pinned, or search nodes are promoted to `core`/`related` instead of leaving every node peripheral.
- Weak/disconnected community: still returns a valid rule snapshot, with `communityMap.current` present and no thrown error.

Expected assertions:

```ts
assert.equal(graph.communityMap.current?.communityId, fixture.communityId);
assert.ok(graph.communityMap.current);
assert.ok(graph.communityMap.current.labelBudget.visible <= graph.communityMap.current.labelBudget.limit);
assert.ok(graph.nodes.some((node) => node.communityMapTier !== "peripheral"));
assert.ok(graph.edges.every((edge) => ["skeleton", "related", "background"].includes(edge.communityMapLayer)));
```

- [ ] **Step 9: Add a performance guard for current-community snapshots**

Add a render-model test using the existing large/dense fixture helpers. Build global mode with many communities and no source community, then with an explicit source community. Assert:

- global no-selection returns `communityMap.current === null`;
- source-community returns exactly one `rulesByCommunityId` entry;
- source-community `nodeRulesById` / `edgeRulesById` include only that community's nodes and internal edges;
- render budget caps still hold for labels, edges, and interaction updates.

Do not assert wall-clock timing in this unit test; the important regression guard is that the snapshot count stays `0` or `1`, never `model.communities.length`.

- [ ] **Step 10: Run the focused render-model tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/render-model.test.ts
```

Expected:

```text
# pass
```

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git add packages/graph-engine/src/render/model.ts packages/graph-engine/src/render/index.ts packages/graph-engine/test/render-model.test.ts
git commit -m "feat: add shared community local map rules"
```

Expected:

```text
[codex/feat-community-view-phase2-local-map ...] feat: add shared community local map rules
```

## Task 2: Freeze Automatic Community Motion Without Disabling Manual Drag

**Files:**

- Modify: `packages/graph-engine/src/render/render-pipeline.ts`
- Modify: `packages/graph-engine/src/render/controller.ts`
- Modify: `packages/graph-engine/src/render/node-drag-lifecycle.ts`
- Create: `packages/graph-engine/test/render-pipeline-motion.test.ts`
- Modify: `packages/graph-engine/test/node-drag-lifecycle.test.ts`
- Modify: `packages/graph-engine/test/renderer-lifecycle.test.ts`

- [ ] **Step 1: Write the failing automatic-motion gate test**

Create `packages/graph-engine/test/render-pipeline-motion.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRenderableGraph, type RenderableGraph } from "../src/render";
import { shouldRunLiveSimulation } from "../src/render/render-pipeline";
import type { GraphData } from "../src";

describe("graph render pipeline motion policy", () => {
  it("keeps global mode live but freezes focused community reading mode", () => {
    const data = graphData();
    const globalGraph = buildRenderableGraph(data);
    const communityGraph = buildRenderableGraph(data, { focus: { kind: "community", id: "alpha" } });

    assert.equal(shouldRunLiveSimulation(globalGraph, true), true);
    assert.equal(shouldRunLiveSimulation(communityGraph, true), false);
    assert.equal(shouldRunLiveSimulation(globalGraph, false), false);
    assert.equal(shouldRunLiveSimulation(emptyGraph(globalGraph), true), false);
  });
});

function emptyGraph(graph: RenderableGraph): RenderableGraph {
  return { ...graph, nodes: [] };
}

function graphData(): GraphData {
  return {
    meta: {
      build_date: "2026-07-03T00:00:00.000Z",
      wiki_title: "Motion Policy Fixture",
      total_nodes: 3,
      total_edges: 2
    },
    nodes: [
      { id: "a", label: "A", type: "topic", community: "alpha", source_path: "wiki/a.md", x: 10, y: 20, weight: 90 },
      { id: "b", label: "B", type: "entity", community: "alpha", source_path: "wiki/b.md", x: 30, y: 40, weight: 60 },
      { id: "c", label: "C", type: "entity", community: "beta", source_path: "wiki/c.md", x: 70, y: 80, weight: 30 }
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
      { id: "b-c", from: "b", to: "c", type: "INFERRED", confidence: "INFERRED", relation_type: "依赖", weight: 0.4 }
    ],
    learning: {
      version: 1,
      entry: { recommended_start_node_id: "a", recommended_start_reason: "fixture", default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: true, community_id: "alpha", label: "Alpha", node_ids: ["a", "b"], is_weak: false, degraded: false },
        global: { enabled: true, node_ids: ["a", "b", "c"], degraded: false }
      },
      communities: [
        { id: "alpha", label: "Alpha", node_count: 2, color_index: 0, recommended_start_node_id: "a" },
        { id: "beta", label: "Beta", node_count: 1, color_index: 1 }
      ]
    }
  };
}
```

- [ ] **Step 2: Run the test and verify it fails for the missing helper**

Run:

```bash
node --import tsx --test packages/graph-engine/test/render-pipeline-motion.test.ts
```

Expected:

```text
Module '../src/render/render-pipeline' has no exported member 'shouldRunLiveSimulation'
```

- [ ] **Step 3: Add the motion gate helper**

In `packages/graph-engine/src/render/render-pipeline.ts`, add this exported helper above `createGraphRenderPipeline`:

```ts
export function shouldRunLiveSimulation(graph: Pick<RenderableGraph, "focus" | "nodes">, live: boolean): boolean {
  if (!live) return false;
  if (!graph.nodes.length) return false;
  if (graph.focus?.kind === "community") return false;
  return true;
}
```

- [ ] **Step 4: Use the motion gate in `restartSimulation`**

Replace this line in `restartSimulation`:

```ts
if (!options.live || !context.graph.nodes.length) return;
```

with:

```ts
if (!shouldRunLiveSimulation(context.graph, options.live)) return;
```

- [ ] **Step 5: Add frozen drag commit/cancel helpers**

In `packages/graph-engine/src/render/node-drag-lifecycle.ts`, add direct helpers for the frozen community route. They should not create or require a `LiveGraphSimulation`; they should only update the runtime positions map and `PinState`.

Required behavior:

- Commit: final drag target becomes a world-space pin for the node.
- Cancel when previously unpinned: node returns to its drag-start point and no pin is written.
- Cancel when previously pinned: prior pin is restored.
- Returned `positions` includes the node point that `delegates.applyMotionFrame(...)` must render.
- The helper updates only the dragged node. It must not rebuild community bounds, rerun local-map rules, or restart simulation during the drag gesture.

Write matching tests in `packages/graph-engine/test/node-drag-lifecycle.test.ts`.

- [ ] **Step 6: Route focused community drag through the frozen path**

In `packages/graph-engine/src/render/controller.ts`, keep the existing simulation path for global/live routes. Add a focused community path when `context.simulation` is null and `context.graph.focus?.kind === "community"`:

- `handleNodeDragStart` should keep the active gesture, mark the node as dragging, and avoid returning early.
- `handleNodeDragMove` should update only the dragged node position through `delegates.applyMotionFrame(...)`.
- `handleNodeDragEnd` should pin the final world point through `PinState`, call `onPinsChanged`, and clear drag UI state.
- `handleNodeDragCancel` should restore the start point and previous pin state.
- The focused community's `communityMap.current.layout.bounds` stays stable during drag; only the dragged node receives a runtime position override.

This preserves manual drag/fix while still preventing background simulation drift.

- [ ] **Step 7: Add renderer lifecycle coverage for frozen drag**

Add a focused community renderer test that dispatches a real node drag in `live: true` focused community mode. Assert:

- root still reports frozen community motion;
- dragging a node changes that node's center;
- `onPinsChanged` receives the dragged node pin;
- unrelated community nodes do not drift after 700 ms;
- local-map bounds and rule snapshot identity do not change during the drag;
- returning global keeps the dragged pin.

- [ ] **Step 8: Run the motion, drag, and renderer tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/render-pipeline-motion.test.ts
node --import tsx --test packages/graph-engine/test/node-drag-lifecycle.test.ts
node --import tsx --test packages/graph-engine/test/renderer-lifecycle.test.ts
```

Expected:

```text
# pass
```

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add packages/graph-engine/src/render/render-pipeline.ts packages/graph-engine/src/render/controller.ts packages/graph-engine/src/render/node-drag-lifecycle.ts packages/graph-engine/test/render-pipeline-motion.test.ts packages/graph-engine/test/node-drag-lifecycle.test.ts packages/graph-engine/test/renderer-lifecycle.test.ts
git commit -m "fix: freeze focused community map motion"
```

Expected:

```text
[codex/feat-community-view-phase2-local-map ...] fix: freeze focused community map motion
```

## Task 3: Pass Shared Rules Through DOM, Adapter, And Sigma

**Files:**

- Modify: `packages/graph-engine/src/render/adapter.ts`
- Modify: `packages/graph-engine/src/render/sigma-graphology-model.ts`
- Modify: `packages/graph-engine/src/render/dom-svg-renderer.ts`
- Modify: `packages/graph-engine/src/render/nodes.ts`
- Modify: `packages/graph-engine/src/render/edges.ts`
- Modify: `packages/graph-engine/test/renderer-adapter-contract.test.ts`
- Modify: `packages/graph-engine/test/sigma-graphology-model.test.ts`
- Modify: `tests/browser/graph-community-node-map.mjs`

- [ ] **Step 1: Write failing adapter contract assertions**

In `packages/graph-engine/test/renderer-adapter-contract.test.ts`, add this test:

```ts
it("passes shared community local-map rules through the adapter", () => {
  const adapter = buildGraphRendererAdapterData(graphFixture(), {
    ...adapterOptions(),
    focus: { kind: "community", id: "alpha" }
  });

  assert.equal(adapter.renderable.communityMap.active, true);
  assert.equal(adapter.renderable.communityMap.current?.communityId, "alpha");
  assert.deepEqual(Object.keys(adapter.renderable.communityMap.rulesByCommunityId), ["alpha"]);
  assert.equal(adapter.renderable.communityMap.motionMode, "frozen");
  assert.ok(adapter.renderable.communityMap.current?.nodeRulesById.a);
  assert.ok(adapter.renderable.communityMap.current?.edgeRulesById["a-b"]);

  const alphaHub = adapter.nodes.find((node) => node.id === "a");
  assert.ok(alphaHub);
  assert.equal(alphaHub.render.communityMapTier, "core");
  assert.equal(typeof alphaHub.render.communityMapImportance, "number");
  assert.ok(alphaHub.render.communityMapDotSize >= 9);

  const edge = adapter.edges.find((item) => item.id === "a-b");
  assert.ok(edge);
  assert.ok(["skeleton", "related", "background"].includes(edge.render.communityMapLayer));
  assert.equal(typeof edge.render.skeleton, "boolean");
  assert.equal(typeof edge.render.traceable, "boolean");
});
```

- [ ] **Step 2: Write failing Sigma attribute assertions**

In `packages/graph-engine/test/sigma-graphology-model.test.ts`, extend the expected node attributes in the first test with:

```ts
communityMapTier: "core",
communityMapImportance: 3,
```

Extend the expected edge attributes in `applies selected-community focus edge styling and semantic emphasis` with:

```ts
communityMapLayer: "skeleton",
```

Update the local `nodeFixture` return value to include:

```ts
communityMapTier: "core",
communityMapImportance: 3,
communityMapDotSize: 18,
communityMapLabelSide: "right",
communityMapRelationLabel: true,
```

inside `render`.

Update the edge fixture inside `adapterDataFixture()` to include:

```ts
render: { strokeWidth: 3, opacity: 0.42, communityMapLayer: "skeleton", skeleton: true, traceable: true }
```

- [ ] **Step 3: Run adapter and Sigma tests and verify they fail for missing fields**

Run:

```bash
node --import tsx --test packages/graph-engine/test/renderer-adapter-contract.test.ts
node --import tsx --test packages/graph-engine/test/sigma-graphology-model.test.ts
```

Expected:

```text
Property 'communityMapTier' does not exist
Property 'communityMapLayer' does not exist
```

- [ ] **Step 4: Add adapter fields for shared rules**

In `packages/graph-engine/src/render/adapter.ts`, import and use the render-model rule types. Do not loosen these fields to plain `string`; adapter consumers should get compile-time failures if a renderer invents a new tier or edge layer.

Do not recreate fields that already exist on `RenderableNode`. Pass through `communityMapImportance`, `communityMapDotSize`, `communityMapLabelSide`, and `communityMapRelationLabel`; add only the missing `communityMapTier` and edge `communityMapLayer` contract.

Extend `GraphRendererAdapterNode["render"]`:

```ts
render: {
  displayMode: string;
  visualRole: string;
  priority: number;
  labelVisible: boolean;
  communityMapTier: CommunityMapNodeTier;
  communityMapImportance: number;
  communityMapDotSize: number;
  communityMapLabelSide: CommunityMapLabelSide;
  communityMapRelationLabel: boolean;
};
```

Extend `GraphRendererAdapterEdge["render"]`:

```ts
render: {
  strokeWidth: number;
  opacity: number;
  communityMapLayer: CommunityMapEdgeLayer;
  skeleton: boolean;
  traceable: boolean;
};
```

In `buildGraphRendererAdapterData`, copy the fields from `renderNode`:

```ts
render: {
  displayMode: renderNode.displayMode,
  visualRole: renderNode.visualRole,
  priority: renderNode.priority,
  labelVisible: renderNode.labelVisible,
  communityMapTier: renderNode.communityMapTier,
  communityMapImportance: renderNode.communityMapImportance,
  communityMapDotSize: renderNode.communityMapDotSize,
  communityMapLabelSide: renderNode.communityMapLabelSide,
  communityMapRelationLabel: renderNode.communityMapRelationLabel
}
```

Copy the edge fields from `edge`:

```ts
render: {
  strokeWidth: edge.strokeWidth,
  opacity: edge.opacity,
  communityMapLayer: edge.communityMapLayer,
  skeleton: edge.skeleton,
  traceable: edge.traceable
}
```

- [ ] **Step 5: Preserve the shared fields in Sigma graphology attributes**

In `packages/graph-engine/src/render/sigma-graphology-model.ts`, import and preserve the same rule types. Keep Graphology attributes typed, even though they are later rendered as DOM/Sigma attributes.

```ts
communityMapTier: CommunityMapNodeTier;
communityMapImportance: number;
```

Extend `SigmaGlobalGraphologyEdgeAttributes`:

```ts
communityMapLayer: CommunityMapEdgeLayer;
```

In `sigmaGlobalNodeAttributes`, add:

```ts
communityMapTier: node.render.communityMapTier,
communityMapImportance: finiteNumber(node.render.communityMapImportance, 0),
```

In `sigmaGlobalEdgeAttributes`, add:

```ts
communityMapLayer: edge.render.communityMapLayer,
```

- [ ] **Step 6: Expose shared rule fields in DOM attributes**

In `packages/graph-engine/src/render/dom-svg-renderer.ts`, after the existing `root.dataset.communityMapState` line, add:

```ts
root.dataset.communityMapMotion = graph.communityMap.motionMode;
root.dataset.communityMapSourceCommunityId = graph.communityMap.sourceCommunityId || "";
root.dataset.communityMapCommunityId = graph.communityMap.current?.communityId || "";
root.dataset.communityMapLabelLimit = String(graph.communityMap.current?.labelBudget.limit ?? 0);
root.dataset.communityMapVisibleLabels = String(graph.communityMap.current?.labelBudget.visible ?? 0);
root.dataset.communityMapSkeletonEdges = String(graph.communityMap.current?.edgeLayers.skeleton ?? 0);
root.dataset.communityMapRelatedEdges = String(graph.communityMap.current?.edgeLayers.related ?? 0);
root.dataset.communityMapBackgroundEdges = String(graph.communityMap.current?.edgeLayers.background ?? 0);
root.dataset.communityMapBounds = graph.communityMap.current
  ? JSON.stringify(graph.communityMap.current.layout.bounds)
  : "";
```

In `packages/graph-engine/src/render/nodes.ts`, add:

```ts
button.dataset.communityMapTier = node.communityMapTier;
button.dataset.communityMapImportance = String(node.communityMapImportance);
```

Keep the existing `data-label-side`, `data-relation-label`, dot size, `data-skeleton`, and `data-traceable` behavior. Phase 2 should not add duplicate names for fields the DOM already exposes.

In `packages/graph-engine/src/render/edges.ts`, add:

```ts
path.setAttribute("data-community-map-layer", edge.communityMapLayer);
```

- [ ] **Step 7: Extend the existing community node map browser checks**

In `tests/browser/graph-community-node-map.mjs`, extend `snapshot(page)` with:

```js
communityMapMotion: root?.getAttribute("data-community-map-motion") || "",
communityMapSourceCommunityId: root?.getAttribute("data-community-map-source-community-id") || "",
communityMapCommunityId: root?.getAttribute("data-community-map-community-id") || "",
communityMapBounds: JSON.parse(root?.getAttribute("data-community-map-bounds") || "null"),
communityMapLabelLimit: Number(root?.getAttribute("data-community-map-label-limit") || "0"),
communityMapVisibleLabels: Number(root?.getAttribute("data-community-map-visible-labels") || "0"),
communityMapSkeletonEdges: Number(root?.getAttribute("data-community-map-skeleton-edges") || "0"),
nodeTiers: Object.fromEntries(
  Array.from(document.querySelectorAll(".node")).map((node) => [
    node.getAttribute("data-id") || "",
    node.getAttribute("data-community-map-tier") || ""
  ])
),
edgeLayers: Object.fromEntries(
  Array.from(document.querySelectorAll(".edge")).map((edge) => [
    edge.getAttribute("data-edge-id") || "",
    edge.getAttribute("data-community-map-layer") || ""
  ])
),
nodeCenters: Object.fromEntries(
  Array.from(document.querySelectorAll(".node")).map((node) => {
    const rect = node.getBoundingClientRect();
    return [
      node.getAttribute("data-id") || "",
      {
        x: Math.round((rect.left + rect.width / 2) * 100) / 100,
        y: Math.round((rect.top + rect.height / 2) * 100) / 100
      }
    ];
  })
)
```

After the existing `initial` assertions, add:

```js
assert.equal(initial.communityMapMotion, "frozen", "focused community map should freeze automatic layout motion");
assert.equal(initial.communityMapCommunityId, "t1", "focused community map should expose its shared rule snapshot id");
assert.equal(initial.communityMapSourceCommunityId, "t1", "focused community map should expose the separate source community context");
assert.ok(initial.communityMapBounds?.width > 0, "focused community map should expose stable local-map bounds");
assert.ok(initial.communityMapLabelLimit >= initial.communityMapVisibleLabels, "visible labels should stay inside the shared label budget");
assert.ok(initial.communityMapSkeletonEdges >= 1, "community map should expose at least one skeleton edge");
assert.equal(initial.nodeTiers.A, "core", "recommended start node A should be a core local-map node");
assert.equal(initial.edgeLayers.eAB, "skeleton", "A-B should be part of the skeleton edge layer");

await page.waitForTimeout(700);
const afterSettling = await snapshot(page);
for (const [nodeId, before] of Object.entries(initial.nodeCenters)) {
  const after = afterSettling.nodeCenters[nodeId];
  if (!after) continue;
  assert.ok(Math.abs(before.x - after.x) < 0.75, `${nodeId} x should not drift after community entry`);
  assert.ok(Math.abs(before.y - after.y) < 0.75, `${nodeId} y should not drift after community entry`);
}
```

- [ ] **Step 8: Run the focused contract and browser checks**

Run:

```bash
node --import tsx --test packages/graph-engine/test/renderer-adapter-contract.test.ts
node --import tsx --test packages/graph-engine/test/sigma-graphology-model.test.ts
bash tests/graph-community-node-map.regression-1.sh
```

Expected:

```text
# pass
PASS: graph community node map regression
```

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add packages/graph-engine/src/render/adapter.ts packages/graph-engine/src/render/sigma-graphology-model.ts packages/graph-engine/src/render/dom-svg-renderer.ts packages/graph-engine/src/render/nodes.ts packages/graph-engine/src/render/edges.ts packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/sigma-graphology-model.test.ts tests/browser/graph-community-node-map.mjs
git commit -m "feat: route community local map rules through renderers"
```

Expected:

```text
[codex/feat-community-view-phase2-local-map ...] feat: route community local map rules through renderers
```

## Task 4: Preserve Source Community Context On Enter And Return

**Files:**

- Modify: `packages/graph-engine/src/facade.ts`
- Modify: `workbench/web/src/lib/graph-community-enter.ts`
- Modify: `workbench/web/test/graph-community-enter.test.ts`
- Modify: `packages/graph-engine/test/renderer-lifecycle.test.ts`
- Modify: `packages/graph-engine/test/facade.test.ts`

- [ ] **Step 1: Rewrite the unit test to express the Phase 2 behavior**

Replace the existing test in `workbench/web/test/graph-community-enter.test.ts` with:

```ts
describe("applyCommunityEnter", () => {
  it("records source community context separately before focusing the community reading view", () => {
    const calls: string[] = [];
    const engine = {
      clearSelection() {
        calls.push("clear");
      },
      setSourceCommunityContext(id: string | null) {
        calls.push(`source:${id ?? "none"}`);
      },
      focusCommunity(id: string) {
        calls.push(`focus:${id}`);
      }
    } as unknown as GraphEngine;

    const result = applyCommunityEnter(engine, "alpha");

    assert.deepEqual(calls, ["source:alpha", "focus:alpha"]);
    assert.equal(result, null);
  });
});
```

- [ ] **Step 2: Run the web test and verify it fails because the helper still clears selection**

Run:

```bash
node --import tsx --test workbench/web/test/graph-community-enter.test.ts
```

Expected:

```text
Expected values to be strictly deep-equal:
+ actual - expected
  [
+   'clear',
-   'source:alpha',
    'focus:alpha'
  ]
```

- [ ] **Step 3: Add explicit source community context to the graph facade**

In `packages/graph-engine/src/facade.ts`, add a source context field to facade state and the public `GraphEngine` / route-manager surface:

```ts
sourceCommunityId: string | null;
setSourceCommunityContext(id: string | null): void;
```

Required behavior:

- `setSourceCommunityContext(id)` stores the id but does not call `renderer.select(...)`.
- `factoryInput(...)` passes `sourceCommunityId` into render options so `buildRenderableGraph(...)` can build the focused/source snapshot.
- When the active route is `dom-svg-community`, community selections are not passed as render `selection`; otherwise `resolveSelectedNodeIds(...)` will expand the community into every node and destroy tiering.
- Returning to the Sigma global route uses `sourceCommunityId` to restore or keep the source community highlight.
- `clearSelection()`, blank global clear, `resetView()`, knowledge-base switch, and deleted-community refresh clear `sourceCommunityId`.
- Selecting a different community replaces `sourceCommunityId`.

- [ ] **Step 4: Update the helper behavior and comment**

Replace `workbench/web/src/lib/graph-community-enter.ts` with:

```ts
import type { GraphEngine, Selection } from "@llm-wiki/graph-engine";

/**
 * Entering a community records where the user came from, then changes the graph
 * route to the DOM/SVG reading view. Source context is separate from selection:
 * it can restore the global highlight on return without making every community
 * node look selected/core inside the reading view.
 */
export function applyCommunityEnter(engine: GraphEngine, communityId: string): Selection | null {
  engine.setSourceCommunityContext(communityId);
  engine.focusCommunity(communityId);
  return null;
}
```

- [ ] **Step 5: Run the focused web test**

Run:

```bash
node --import tsx --test workbench/web/test/graph-community-enter.test.ts
```

Expected:

```text
# pass
```

- [ ] **Step 6: Add source-context clear, replace, and non-pollution coverage**

Add graph-engine tests for the other half of the behavior:

- Return global from focused community with `sourceCommunityId` highlights that community.
- Focused DOM community rendering receives `sourceCommunityId`, but not `selection: { kind: "community" }`.
- Source context does not make every node in that community `selected` or `communityMapTier: "core"`.
- Explicit blank clear / `clearSelection()` removes the source context and any Sigma highlight.
- Selecting another community replaces the old source context.
- `resetView()` clears source context, selection, focus, and temporary object state.
- If refreshed data no longer contains the source community id, the context is dropped rather than preserving a stale highlight.

These tests belong near the existing return-global and facade state tests:

```bash
node --import tsx --test packages/graph-engine/test/renderer-lifecycle.test.ts
node --import tsx --test packages/graph-engine/test/facade.test.ts
```

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add packages/graph-engine/src/facade.ts workbench/web/src/lib/graph-community-enter.ts workbench/web/test/graph-community-enter.test.ts packages/graph-engine/test/renderer-lifecycle.test.ts packages/graph-engine/test/facade.test.ts
git commit -m "fix: preserve source community context on enter"
```

Expected:

```text
[codex/feat-community-view-phase2-local-map ...] fix: preserve source community context on enter
```

## Task 5: Add Phase 2 Browser Regression

**Files:**

- Create: `tests/browser/graph-community-phase2-local-map.mjs`
- Create: `tests/graph-community-phase2-local-map.regression-1.sh`

- [ ] **Step 1: Create the browser regression script**

Create `tests/browser/graph-community-phase2-local-map.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const workbenchUrl = process.env.GRAPH_COMMUNITY_PHASE2_URL || "";
const artifactDir = process.env.GRAPH_COMMUNITY_PHASE2_ARTIFACT_DIR || "";
const executablePath = process.env.GRAPH_COMMUNITY_PHASE2_CHROME_EXECUTABLE || "";

assert.notEqual(workbenchUrl, "", "GRAPH_COMMUNITY_PHASE2_URL must point at the workbench dev server");

const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  const desktop = await runFlow({ width: 1440, height: 900 }, "desktop");
  const mobile = await runFlow({ width: 390, height: 844 }, "mobile");
  const evidence = { desktop, mobile };
  if (artifactDir) {
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(path.join(artifactDir, "community-phase2-local-map.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}

async function runFlow(viewport, label) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    window.localStorage.setItem("llm-wiki-agent-main-view", "graph");
    window.localStorage.setItem("llm-wiki-agent-theme", "light");
  });
  await page.goto(workbenchUrl);
  await page.waitForSelector(".app-shell");
  const kbButton = page.getByRole("button", { name: /Phase 2 Local Map Test|phase-2-local-map/ });
  if (await kbButton.count()) await kbButton.first().click();
  await page.getByRole("tab", { name: "图谱" }).click().catch(() => {});
  await waitForSigmaGlobal(page);

  const selectedBeforeEnter = await openCommunitySummary(page, "t1");
  assert.deepEqual(selectedBeforeEnter.selectedRegions, ["t1"], "global Sigma should select the source community before enter");

  await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
  await waitForDomCommunity(page, "t1");

  const localMap = await communitySnapshot(page);
  assert.equal(localMap.focus, "community:t1");
  assert.equal(localMap.communityMapState, "lightweight");
  assert.equal(localMap.communityMapMotion, "frozen");
  assert.equal(localMap.communityMapCommunityId, "t1");
  assert.equal(localMap.communityMapSourceCommunityId, "t1");
  assert.ok(localMap.communityMapBounds?.width > 0);
  assert.ok(localMap.visibleLabelCount > 0);
  assert.ok(localMap.visibleLabelCount <= localMap.labelLimit);
  assert.ok(localMap.skeletonEdges >= 1);
  assert.equal(localMap.nodeTiers.A, "core");
  assert.ok(Object.values(localMap.nodeTiers).some((tier) => tier === "peripheral"), "source community context must not promote every node to core");
  assert.equal(localMap.edgeLayers.eAB, "skeleton");

  await page.waitForTimeout(700);
  const afterSettle = await communitySnapshot(page);
  assertMaxDrift(localMap.nodeCenters, afterSettle.nodeCenters, 0.75);

  await dragCommunityNode(page, "B", { x: 36, y: 24 });
  const afterDrag = await communitySnapshot(page);
  assertPointShifted(afterDrag.nodeCenters.B, afterSettle.nodeCenters.B, "manual drag should still work while automatic motion is frozen");

  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, `community-phase2-${label}-community.png`), fullPage: true });
  }

  await page.getByRole("button", { name: /回全图/ }).click();
  await waitForSigmaGlobal(page);
  const returned = await sigmaSnapshot(page);
  assert.deepEqual(returned.selectedRegions, ["t1"], "returning global should keep the source community selected");
  assert.deepEqual(returned.selectedLabels, ["t1"], "returning global should keep the source community label selected");

  await page.mouse.click(24, 24);
  const afterBlankClear = await sigmaSnapshot(page);
  assert.deepEqual(afterBlankClear.selectedRegions, [], "blank clear should remove the returned source community highlight");

  await openCommunitySummary(page, "t2");
  const afterReplace = await sigmaSnapshot(page);
  assert.deepEqual(afterReplace.selectedRegions, ["t2"], "selecting another community should replace the old source community");

  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, `community-phase2-${label}-returned-global.png`), fullPage: true });
  }

  await page.close();
  return { viewport: `${viewport.width}x${viewport.height}`, selectedBeforeEnter, localMap, returned };
}

async function waitForSigmaGlobal(page) {
  await page.waitForSelector(".sigma-global-route[data-route='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer[data-renderer='sigma-global']");
  await page.waitForSelector(".sigma-global-community-region");
}

async function waitForDomCommunity(page, communityId) {
  await page.waitForFunction((id) => {
    return document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-focus") === `community:${id}`
      || document.querySelector(".graph-host")?.dataset.llmWikiGraphFocus === `community:${id}`;
  }, communityId);
  await page.waitForSelector("[data-llm-wiki-graph-root='true'][data-community-map-state='lightweight']");
  await page.waitForSelector(".node[data-id='A']");
}

async function openCommunitySummary(page, communityId) {
  const region = page.locator(`.sigma-global-community-region[data-community-id="${communityId}"]`).first();
  await region.waitFor();
  const box = await region.boundingBox();
  assert.ok(box, `community region ${communityId} should have a box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('[data-testid="graph-community-summary"]');
  return sigmaSnapshot(page);
}

async function sigmaSnapshot(page) {
  return page.evaluate(() => ({
    selectedRegions: Array.from(document.querySelectorAll(".sigma-global-community-region[data-selected='true']"))
      .map((region) => region.getAttribute("data-community-id") || "")
      .filter(Boolean)
      .sort(),
    selectedLabels: Array.from(document.querySelectorAll(".sigma-global-community-label[data-selected='true']"))
      .map((label) => label.getAttribute("data-community-id") || "")
      .filter(Boolean)
      .sort(),
    sigmaRendererCount: document.querySelectorAll(".sigma-global-renderer[data-renderer='sigma-global']").length,
    domNodeCount: document.querySelectorAll(".node").length
  }));
}

async function communitySnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-llm-wiki-graph-root='true']");
    const nodes = Array.from(document.querySelectorAll(".node"));
    const edges = Array.from(document.querySelectorAll(".edge"));
    return {
      focus: document.querySelector(".graph-host")?.dataset.llmWikiGraphFocus || "",
      communityMapState: root?.getAttribute("data-community-map-state") || "",
      communityMapMotion: root?.getAttribute("data-community-map-motion") || "",
      communityMapSourceCommunityId: root?.getAttribute("data-community-map-source-community-id") || "",
      communityMapCommunityId: root?.getAttribute("data-community-map-community-id") || "",
      communityMapBounds: JSON.parse(root?.getAttribute("data-community-map-bounds") || "null"),
      labelLimit: Number(root?.getAttribute("data-community-map-label-limit") || "0"),
      visibleLabelCount: Array.from(document.querySelectorAll(".node-name")).filter((element) => getComputedStyle(element).display !== "none").length,
      skeletonEdges: Number(root?.getAttribute("data-community-map-skeleton-edges") || "0"),
      nodeTiers: Object.fromEntries(nodes.map((node) => [
        node.getAttribute("data-id") || "",
        node.getAttribute("data-community-map-tier") || ""
      ])),
      edgeLayers: Object.fromEntries(edges.map((edge) => [
        edge.getAttribute("data-edge-id") || "",
        edge.getAttribute("data-community-map-layer") || ""
      ])),
      nodeCenters: Object.fromEntries(nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return [
          node.getAttribute("data-id") || "",
          {
            x: Math.round((rect.left + rect.width / 2) * 100) / 100,
            y: Math.round((rect.top + rect.height / 2) * 100) / 100
          }
        ];
      }))
    };
  });
}

async function dragCommunityNode(page, nodeId, delta) {
  const locator = page.locator(`.node[data-id="${nodeId}"]`).first();
  const box = await locator.boundingBox();
  assert.ok(box, `node ${nodeId} should have a box before drag`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction((id) => document.querySelector(`.node[data-id="${id}"]`)?.getAttribute("data-pinned") === "true", nodeId);
}

function assertMaxDrift(beforeCenters, afterCenters, maxDrift) {
  for (const [nodeId, before] of Object.entries(beforeCenters)) {
    const after = afterCenters[nodeId];
    if (!after) continue;
    assert.ok(Math.abs(before.x - after.x) <= maxDrift, `${nodeId} x drift should stay within ${maxDrift}px`);
    assert.ok(Math.abs(before.y - after.y) <= maxDrift, `${nodeId} y drift should stay within ${maxDrift}px`);
  }
}

function assertPointShifted(after, before, message) {
  assert.ok(after && before, message);
  const distance = Math.hypot(after.x - before.x, after.y - before.y);
  assert.ok(distance > 4, `${message}; expected visible movement, got ${distance}px`);
}
```

- [ ] **Step 2: Create the shell wrapper**

Create `tests/graph-community-phase2-local-map.regression-1.sh`:

```bash
#!/bin/bash
# Regression: Phase 2 community reading behaves as a stable local map and preserves source community context on return.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_ROOT/tests/lib/graph-html-engine-helpers.sh"

tmp_dir="$(mktemp -d)"
server_pid=""
web_pid=""
server_port="${GRAPH_COMMUNITY_PHASE2_SERVER_PORT:-18789}"
web_port="${GRAPH_COMMUNITY_PHASE2_WEB_PORT:-15182}"

cleanup() {
    if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
    if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
    rm -rf "$tmp_dir"
}
trap cleanup EXIT

if lsof -i TCP:"$server_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $server_port is already in use"
fi
if lsof -i TCP:"$web_port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $web_port is already in use"
fi

npm run build -w @llm-wiki/graph-engine > /dev/null 2>&1 \
    || fail "graph-engine build should succeed before Phase 2 browser regression"

workbench_kb="$tmp_dir/home/llm-wiki/phase-2-local-map"
mkdir -p "$workbench_kb/wiki/entities" "$tmp_dir/home/.llm-wiki-agent"

cat > "$workbench_kb/.wiki-schema.md" <<'EOF'
# Test schema
EOF

cat > "$workbench_kb/purpose.md" <<'EOF'
# Phase 2 Local Map Test
EOF

node - "$workbench_kb/wiki/graph-data.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const nodes = [
  { id: "A", label: "核心节点A", type: "topic", community: "t1", source_path: "wiki/entities/A.md", x: 24, y: 42, weight: 95 },
  { id: "B", label: "关键节点B", type: "entity", community: "t1", source_path: "wiki/entities/B.md", x: 36, y: 32, weight: 72 },
  { id: "C", label: "来源节点C", type: "source", community: "t1", source_path: "wiki/entities/C.md", x: 38, y: 56, weight: 64 },
  { id: "D", label: "普通节点D", type: "entity", community: "t1", source_path: "wiki/entities/D.md", x: 55, y: 34, weight: 50 },
  { id: "E", label: "普通节点E", type: "entity", community: "t1", source_path: "wiki/entities/E.md", x: 68, y: 38, weight: 42 },
  { id: "F", label: "对比节点F", type: "comparison", community: "t1", source_path: "wiki/entities/F.md", x: 80, y: 46, weight: 35 },
  { id: "G", label: "外部节点G", type: "entity", community: "t2", source_path: "wiki/entities/G.md", x: 72, y: 78, weight: 25 },
  { id: "H", label: "外部节点H", type: "topic", community: "t2", source_path: "wiki/entities/H.md", x: 84, y: 74, weight: 22 }
];
const edges = [
  { id: "eAB", from: "A", to: "B", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "实现", weight: 1 },
  { id: "eAC", from: "A", to: "C", type: "INFERRED", confidence: "INFERRED", relation_type: "对比", weight: 0.8 },
  { id: "eBD", from: "B", to: "D", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "依赖", weight: 0.7 },
  { id: "eDE", from: "D", to: "E", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "衍生", weight: 0.5 },
  { id: "eEF", from: "E", to: "F", type: "AMBIGUOUS", confidence: "AMBIGUOUS", relation_type: "矛盾", weight: 0.4 },
  { id: "eFG", from: "F", to: "G", type: "INFERRED", confidence: "INFERRED", relation_type: "跨社区", weight: 0.2 },
  { id: "eGH", from: "G", to: "H", type: "EXTRACTED", confidence: "EXTRACTED", relation_type: "补充", weight: 0.7 }
];
const graph = {
  meta: {
    build_date: "2026-07-03T00:00:00.000Z",
    wiki_title: "Phase 2 Local Map Test",
    total_nodes: nodes.length,
    total_edges: edges.length
  },
  nodes,
  edges,
  learning: {
    version: 1,
    entry: { recommended_start_node_id: "A", recommended_start_reason: "fixture", default_mode: "global" },
    views: {
      path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
      community: { enabled: true, community_id: "t1", label: "测试社区", node_ids: nodes.filter((node) => node.community === "t1").map((node) => node.id), is_weak: false, degraded: false },
      global: { enabled: true, node_ids: nodes.map((node) => node.id), degraded: false }
    },
    communities: [
      { id: "t1", label: "测试社区", node_count: 6, color_index: 0, recommended_start_node_id: "A", members: ["A", "B", "C", "D", "E", "F"] },
      { id: "t2", label: "外部社区", node_count: 2, color_index: 1, members: ["G", "H"] }
    ]
  }
};
fs.writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`);
NODE

for id in A B C D E F G H; do
    cat > "$workbench_kb/wiki/entities/$id.md" <<EOF
# 节点$id

这是节点$id 的内容。
EOF
done

cat > "$tmp_dir/home/.llm-wiki-agent/config.json" <<EOF
{
  "knowledgeBases": [
    {
      "name": "phase-2-local-map",
      "path": "$workbench_kb",
      "external": false
    }
  ],
  "activeKnowledgeBasePath": "$workbench_kb"
}
EOF

HOME="$tmp_dir/home" HOST=127.0.0.1 PORT="$server_port" npm run dev -w @llm-wiki-agent/server > "$tmp_dir/server.log" 2>&1 &
server_pid="$!"
HOME="$tmp_dir/home" LLM_WIKI_AGENT_API_ORIGIN="http://127.0.0.1:$server_port" npm run dev -w @llm-wiki-agent/web -- --host 127.0.0.1 --port "$web_port" --force > "$tmp_dir/web.log" 2>&1 &
web_pid="$!"

for _ in {1..60}; do
    if curl -fsS "http://127.0.0.1:$server_port/api/knowledge-bases" >/dev/null 2>&1 \
        && curl -fsS "http://127.0.0.1:$web_port" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

curl -fsS "http://127.0.0.1:$server_port/api/knowledge-bases" >/dev/null 2>&1 \
    || fail "workbench server did not start; see $tmp_dir/server.log"
curl -fsS "http://127.0.0.1:$web_port" >/dev/null 2>&1 \
    || fail "workbench web did not start; see $tmp_dir/web.log"

playwright_node_path="$(
    npx --yes -p playwright -c 'node -e "const path=require(\"path\"); console.log(path.dirname(process.env.PATH.split(\":\")[0]))"'
)"

chrome_executable="${GRAPH_COMMUNITY_PHASE2_CHROME_EXECUTABLE:-}"
if [ -z "$chrome_executable" ] && [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    chrome_executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

artifact_dir="${GRAPH_COMMUNITY_PHASE2_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/llm-wiki-community-phase2.XXXXXX")}"

GRAPH_COMMUNITY_PHASE2_URL="http://127.0.0.1:$web_port" \
GRAPH_COMMUNITY_PHASE2_CHROME_EXECUTABLE="$chrome_executable" \
GRAPH_COMMUNITY_PHASE2_ARTIFACT_DIR="$artifact_dir" \
NODE_PATH="$playwright_node_path" \
node "$REPO_ROOT/tests/browser/graph-community-phase2-local-map.mjs" \
    || fail "Phase 2 community local map browser regression should pass"

echo "PASS: graph community Phase 2 local map regression"
echo "ARTIFACTS: $artifact_dir"
```

- [ ] **Step 3: Make the wrapper executable**

Run:

```bash
chmod +x tests/graph-community-phase2-local-map.regression-1.sh
```

Expected:

```text
```

No output means success.

- [ ] **Step 4: Run the new browser regression**

Run:

```bash
bash tests/graph-community-phase2-local-map.regression-1.sh
```

Expected:

```text
PASS: graph community Phase 2 local map regression
ARTIFACTS: ...
```

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add tests/browser/graph-community-phase2-local-map.mjs tests/graph-community-phase2-local-map.regression-1.sh
git commit -m "test: cover community local map phase two flow"
```

Expected:

```text
[codex/feat-community-view-phase2-local-map ...] test: cover community local map phase two flow
```

## Task 6: Final Verification

**Files:**

- No planned source changes in this task unless a verification failure reveals a real issue from the Phase 2 scope.

- [ ] **Step 1: Run graph engine tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
```

Expected:

```text
# pass
```

- [ ] **Step 2: Run web tests and lint**

Run:

```bash
npm run test -w @llm-wiki-agent/web
npm run lint -w @llm-wiki-agent/web
```

Expected:

```text
# pass
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
```

No output after successful workspace commands is acceptable; any TypeScript error must be fixed before continuing.

- [ ] **Step 4: Run browser regressions for Phase 2 and existing graph routes**

Run:

```bash
bash tests/graph-community-node-map.regression-1.sh
bash tests/graph-community-phase2-local-map.regression-1.sh
bash tests/graph-workbench-interactions.regression-1.sh
```

Expected:

```text
PASS: graph community node map regression
PASS: graph community Phase 2 local map regression
PASS: graph workbench interactions regression
```

- [ ] **Step 5: Capture manual QA notes**

Run the app:

```bash
npm run dev
```

Open `http://localhost:5180/`, use `示例知识库`, and verify these visible outcomes:

- Click a community in global Sigma.
- Confirm the global map highlights that community and the drawer shows its summary.
- Click `进入社区`.
- Confirm the DOM community view shows a stable local map, not a reshuffled graph.
- Confirm core labels are visible, ordinary labels are sparse, and weak edges do not dominate.
- Click `回全图`.
- Confirm the same source community remains highlighted in Sigma.

Record the artifact paths printed by the browser regressions in the PR description.

- [ ] **Step 6: Check changed files and whitespace**

Run:

```bash
git diff --check
git status --short
```

Expected:

```text
```

`git diff --check` should print no whitespace errors. `git status --short` should show only files intentionally changed by this plan.

- [ ] **Step 7: Commit any verification-driven fixes**

If Step 1 through Step 6 required fixes, commit only those Phase 2 files:

```bash
git add packages/graph-engine/src/render packages/graph-engine/test workbench/web/src/lib/graph-community-enter.ts workbench/web/test/graph-community-enter.test.ts tests/browser/graph-community-node-map.mjs tests/browser/graph-community-phase2-local-map.mjs tests/graph-community-phase2-local-map.regression-1.sh
git commit -m "fix: stabilize community local map verification"
```

Expected when a fix commit is needed:

```text
[codex/feat-community-view-phase2-local-map ...] fix: stabilize community local map verification
```

If no fixes were needed, skip the commit command.

## Implementation Notes

- The shared-rule owner is `packages/graph-engine/src/render/model.ts`. DOM/SVG and Sigma must not derive their own node tiers, label budget, or edge layers.
- Community motion is frozen by default. If a later task introduces bounded avoidance, it must change `maxNodeDriftRatio` from `0` to the chosen cap and add a test that core nodes stay fixed.
- Returning global should preserve the source community highlight through explicit `sourceCommunityId`, not by passing `selection: { kind: "community" }` into the DOM reading view. Explicit `clear`, `clear-selection`, knowledge-base switch, deleted-community refresh, or selecting another community must replace or clear that context.
- Browser screenshots are part of acceptance because the original problem is visual discontinuity, not only data correctness.

## Engineering Review Addendum

### Confirmed Review Decisions

- Keep full Phase 2 scope. The plan touches more than eight files, but the user chose the complete version because this is a visual/system behavior fix, not a small field patch.
- Keep two renderers for now: Sigma global, DOM/SVG community reading. The shared part is the map rule output, not the renderer.
- Treat community local-map rules as a first-class per-community snapshot owned by graph-engine.
- Compute only the focused community or explicit source community snapshot. Do not eagerly compute all communities.
- Store source community context separately from selection. Do not let the source community make every DOM node selected/core.
- The rule snapshot must contain per-node, per-edge, and layout/bounds rules, not only summary counts.
- Freeze automatic community motion, but preserve manual drag/fix with a direct frozen-drag path.
- Use typed rule values through the whole path. Do not loosen `core | related | peripheral` or `skeleton | related | background` to plain strings.
- Browser tests cover the real route. Engine tests cover dense, long-title, edge-heavy, no-core, weak, and disconnected visual-risk fixtures.
- Add Phase 2.1 transition animation to `TODOS.md`, not this Phase 2 plan.

### What Already Exists

- `buildRenderableGraph(...)` already computes stable core nodes, skeleton edges, label budgets, community focus scale, and existing `communityMapImportance`/dot/label-side fields. Phase 2 extends this owner instead of adding a second DOM-only rule calculator.
- `renderPointForNode(...)` already prefers runtime positions, then pins, then atlas coordinates. Phase 2 keeps this source order.
- `applyMotionFrame(...)` already rebuilds the render model with runtime positions. Phase 2 reuses it for direct frozen drag updates.
- `focusCommunity(...)` and route manager tests already cover DOM community entry and return-global routing. Phase 2 strengthens them by adding explicit source context semantics.
- Existing browser regressions already cover Sigma global, community node map, and workbench graph interactions. Phase 2 adds one targeted real-workbench route regression and extends the existing offline node-map check.

### NOT In Scope

- Migrating community reading to Sigma. Tracked separately by Issue #95.
- Enter-community transition animation. Tracked in `TODOS.md` as Phase 2.1 after static visual acceptance.
- Replacing the drawer or changing graph summary UX beyond preserving/clearing source community context.
- Rewriting global Sigma layout, force settings, or camera behavior.
- Adding new npm dependencies or a new renderer.

### Data Flow

```text
GraphData + selection/focus/sourceCommunityId/pins/search
        |
        v
buildRenderableGraph()
        |
        +--> positions: runtime positions -> pins -> atlas points
        +--> local-map snapshot: only focus community OR explicit source community
        +--> node rules by id: core / related / peripheral + base world point
        +--> edge rules by id: skeleton / related / background
        +--> layout bounds: stable close-up coordinate frame
        |
        v
GraphRendererAdapterData
        |
        +-------------------------+
        |                         |
        v                         v
Sigma graphology attrs        DOM/SVG data attrs
global context/highlight      community reading close-up
```

### State Flow

```text
Global Sigma
  click community
    -> selection = community:t1
    -> sourceCommunityId = t1
    -> drawer opens
    -> camera is already near t1

Enter community
  -> focus = community:t1
  -> sourceCommunityId stays t1
  -> DOM render selection excludes community:t1
  -> DOM reads shared t1 local-map snapshot
  -> automatic simulation stays off
  -> manual drag writes pins directly

Return global
  -> focus cleared
  -> sourceCommunityId restores/highlights community:t1
  -> Sigma highlights t1 without polluting DOM tier rules

Clear/replace
  blank clear / clearSelection / reset / KB switch / deleted community
    -> old sourceCommunityId clears and t1 highlight disappears
  select community:t2
    -> sourceCommunityId t1 replaced by t2
```

### Test Coverage Diagram

```text
CODE PATHS                                             USER FLOWS
[+] render/model.ts                                    [+] Global -> community -> global
  ├── [GAP->PLAN] focused snapshot current=t1            ├── [GAP->E2E] desktop route with screenshots
  ├── [GAP->PLAN] explicit source snapshot current=t1    ├── [GAP->E2E] mobile route with screenshots
  ├── [GAP->PLAN] source snapshot filters to t1 only     ├── [GAP->E2E] return keeps source highlight
  ├── [GAP->PLAN] no source context = no snapshot        ├── [GAP->E2E] source context does not pollute DOM tiers
  ├── [GAP->PLAN] typed node tier values                 ├── [GAP->E2E] blank clear removes highlight
  └── [GAP->PLAN] typed edge layer values                └── [GAP->E2E] selecting t2 replaces t1

[+] render/controller.ts                               [+] Community reading interaction
  ├── [GAP->PLAN] freeze automatic simulation            ├── [GAP->E2E] no drift after entry
  ├── [GAP->PLAN] manual drag commit while frozen        ├── [GAP->E2E] manual drag still pins node
  └── [GAP->PLAN] drag cancel restores prior state       └── [GAP->UNIT] return global keeps pin

[+] adapter / sigma / DOM attrs                        [+] Visual-risk fixtures
  ├── [GAP->PLAN] adapter preserves typed rules          ├── [GAP->UNIT] dense community
  ├── [GAP->PLAN] Sigma preserves typed rules            ├── [GAP->UNIT] long titles
  └── [GAP->PLAN] DOM exposes snapshot data attrs        ├── [GAP->UNIT] edge-heavy community
                                                        ├── [GAP->UNIT] no obvious core
                                                        └── [GAP->UNIT] weak/disconnected community

COVERAGE TARGET: all listed gaps are now explicit plan tasks.
QUALITY TARGET: behavior + edge cases + browser screenshots, not only type checks.
```

### Failure Modes

| Codepath | Realistic failure | Planned coverage | User impact if missed |
|----------|-------------------|------------------|-----------------------|
| Local-map snapshot | All communities are computed on every global render | Snapshot count test: 0 or 1 only | Large knowledge bases feel slow before entering a community |
| Source context | Source community is passed as selection and every DOM node becomes selected/core | Non-pollution unit and browser tests | Community close-up loses hierarchy and looks flat |
| Snapshot rules | Snapshot stores only counts, not per-node/per-edge rules | Snapshot contract tests for `nodeRulesById` and `edgeRulesById` | DOM and Sigma can still draw different maps |
| Source filtering | Source snapshot is computed from the whole graph | Source-community filtering test | Counts and rules are labeled as t1 while containing unrelated nodes |
| Layout bounds | DOM recalculates a different close-up frame than the shared snapshot | Bounds data attr and no-drift browser check | Entering community feels like a jump to another map |
| Node tier rules | DOM and Sigma invent different tier meanings | Typed adapter/Sigma/DOM contract tests | Same community looks like two different maps |
| Frozen motion | Turning off simulation also disables manual drag | Frozen drag lifecycle + browser drag check | User cannot fix a cramped community |
| Return source context | Source community highlight sticks forever | Clear/replace/reset/deleted-community tests | User thinks the old community is still active |
| Edge layers | Weak/background edges dominate skeleton or tests require impossible ratios | Edge-heavy fixture test | Community close-up becomes visual noise or tests force bad skeletons |
| Label budget | Long titles force too many labels visible | Long-title fixture test | Labels overlap and the close-up feels messy |
| Weak/disconnected data | Rule builder assumes a clean core exists | Weak/disconnected fixture test | Community view crashes or shows all peripheral nodes |

Critical silent gaps after this review: 0. Each risky path now has an implementation task and a verification path.

### Performance Notes

- The main performance constraint is snapshot fan-out. The plan now forbids eager all-community snapshot computation.
- Unit tests should assert snapshot count, not wall-clock timing, because timing tests are noisy in local dev.
- Existing large graph performance browser scripts remain out of the required Phase 2 path unless a verification run reveals a regression.

### Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Shared rule model | `packages/graph-engine/src/render`, `packages/graph-engine/test` | - |
| Frozen drag | `packages/graph-engine/src/render`, `packages/graph-engine/test` | Shared rule model for motion mode field |
| Adapter/Sigma/DOM pass-through | `packages/graph-engine/src/render`, `packages/graph-engine/test`, `tests/browser` | Shared rule model |
| Source context | `packages/graph-engine/src`, `workbench/web`, `packages/graph-engine/test` | - |
| Browser regression | `tests/browser`, `tests` | Shared rule model, frozen drag, source context |

Parallel lanes:

- Lane A: Shared rule model -> adapter/Sigma/DOM pass-through.
- Lane B: Source context tests and helper change.
- Lane C: Frozen drag after the shared motion mode shape is available.
- Lane D: Browser regression after A, B, and C merge.

Execution order: run A + B in parallel worktrees. Merge them. Run C. Then run D and final verification. A and C both touch `packages/graph-engine/src/render`, so coordinate carefully or keep C sequential after A to avoid avoidable merge conflicts.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~3h / CC: ~30min)** - graph-engine render model - Make community local-map rules a typed per-node/per-edge snapshot.
  - Surfaced by: Architecture review + outside voice - shared rules need one owner, must be filtered to the focused/source community, and must include actual node/edge/layout rules rather than only counts.
  - Files: `packages/graph-engine/src/render/model.ts`, `packages/graph-engine/src/render/index.ts`, `packages/graph-engine/test/render-model.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/render-model.test.ts`
- [ ] **T2 (P1, human: ~3h / CC: ~30min)** - graph-engine motion - Freeze automatic community motion while preserving manual drag/fix.
  - Surfaced by: Architecture review - current drag path depends on live simulation, so simply disabling simulation would break manual drag.
  - Files: `packages/graph-engine/src/render/render-pipeline.ts`, `packages/graph-engine/src/render/controller.ts`, `packages/graph-engine/src/render/node-drag-lifecycle.ts`, related tests
  - Verify: `node --import tsx --test packages/graph-engine/test/render-pipeline-motion.test.ts packages/graph-engine/test/node-drag-lifecycle.test.ts packages/graph-engine/test/renderer-lifecycle.test.ts`
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** - render adapters - Preserve typed local-map rules through adapter, Sigma, and DOM attributes.
  - Surfaced by: Code quality review - plain strings would let the two views drift again.
  - Files: `packages/graph-engine/src/render/adapter.ts`, `packages/graph-engine/src/render/sigma-graphology-model.ts`, `packages/graph-engine/src/render/dom-svg-renderer.ts`, `packages/graph-engine/src/render/nodes.ts`, `packages/graph-engine/src/render/edges.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/sigma-graphology-model.test.ts`
- [ ] **T4 (P1, human: ~2h / CC: ~25min)** - source community context - Preserve return highlight without polluting DOM selection.
  - Surfaced by: Test review + outside voice - "keep highlight" needs matching clear/replace coverage, and source context must not make every DOM node selected/core.
  - Files: `packages/graph-engine/src/facade.ts`, `workbench/web/src/lib/graph-community-enter.ts`, `workbench/web/test/graph-community-enter.test.ts`, `packages/graph-engine/test/renderer-lifecycle.test.ts`, `packages/graph-engine/test/facade.test.ts`
  - Verify: `npm run test -w @llm-wiki-agent/web` and focused graph-engine tests
- [ ] **T5 (P1, human: ~2h / CC: ~20min)** - regression coverage - Add visual-risk fixture tests for dense, long-title, edge-heavy, no-core, weak, and disconnected communities.
  - Surfaced by: Test review - one happy-path browser fixture cannot protect a visual continuity fix.
  - Files: `packages/graph-engine/test/render-model.test.ts`, existing fixture helpers
  - Verify: `node --import tsx --test packages/graph-engine/test/render-model.test.ts`
- [ ] **T6 (P2, human: ~2h / CC: ~25min)** - browser regression - Add desktop/mobile real route coverage with screenshots, source context, clear/replace, no drift, and manual drag.
  - Surfaced by: Test review - original issue is visual and route-level.
  - Files: `tests/browser/graph-community-phase2-local-map.mjs`, `tests/graph-community-phase2-local-map.regression-1.sh`, `tests/browser/graph-community-node-map.mjs`
  - Verify: `bash tests/graph-community-phase2-local-map.regression-1.sh`
- [ ] **T7 (P2, human: ~30min / CC: ~5min)** - follow-up tracking - Keep Phase 2.1 transition animation out of this plan and track it in `TODOS.md`.
  - Surfaced by: Scope review - animation is useful later but would distract from static-map acceptance now.
  - Files: `TODOS.md`
  - Verify: confirm `TODOS.md` contains Phase 2.1 entry and Phase 2 tasks do not implement transition animation.

### Completion Summary

- Step 0: Scope Challenge - scope accepted as-is after complexity challenge.
- Architecture Review: 4 issues found and resolved in plan, plus outside-voice architecture gaps absorbed.
- Code Quality Review: 1 issue found and resolved in plan.
- Test Review: coverage diagram produced, 3 gap groups identified and resolved in plan.
- Performance Review: 1 issue found and resolved in plan.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 1 item proposed and accepted.
- Failure modes: 0 critical silent gaps after plan updates.
- Outside voice: ran with Codex; 9 findings reviewed, accepted, and absorbed into the plan.
- Parallelization: 4 lanes, 2 parallel at start / 2 sequential after merge.
- Lake Score: 8/8 recommendations chose the complete option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | No fresh review in the 7-day window |
| Codex Review | `/plan-eng-review` outside voice | Independent 2nd opinion | 2 | issues_found | Latest run found 9 plan gaps; user chose A and all were absorbed into this plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | clean | 18 issues/gaps reviewed, 0 critical gaps, 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | No fresh review in the 7-day window |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | No fresh review in the 7-day window |

- **CODEX:** Outside voice found source-context pollution, incomplete snapshots, whole-graph source counts, missing close-up bounds, frozen-drag detail gaps, and edge-test target issues; these are now folded into the plan.
- **CROSS-MODEL:** Both reviews agree Phase 2 should keep two renderers for now, but Codex correctly forced the plan to make source context and rule snapshots stricter before implementation.
- **VERDICT:** ENG CLEARED - ready to implement Phase 2 from this revised plan.

NO UNRESOLVED DECISIONS
