# Unified Community Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one right-side drawer for normal communities and “未分组”, while restoring Sigma Shift multi-select and the single-node “+邻居” entry.

**Architecture:** The graph engine will produce consistent selection and summary data, including the `_none` virtual community. The workbench frontend will own the unified drawer view model, layout, agent actions, free-text prompt flow, and visual behavior. Existing community navigation remains a graph summary command, while agent actions reuse the current selection prompt pipeline.

**Tech Stack:** TypeScript, React 19, Node built-in test runner, jsdom React server rendering tests, Sigma/Graphology graph renderer, existing llm-wiki workbench CSS.

---

## Completion Standard

- Clicking a normal community opens the unified community drawer with top “进入社区”, overview facts, fixed actions, compact core nodes, and dialogue controls.
- Clicking “未分组” opens the same drawer structure, does not show “进入社区”, and recommends “探索潜在关系”.
- Normal communities always show “探索潜在关系” as a secondary action.
- Search hits, fixed nodes, and bridge relations no longer appear as large empty first-screen sections.
- Single-node summaries show a clear “+邻居” command.
- Sigma global Shift+click adds or removes nodes from a multi-selection.
- `未分组` is clickable, selectable, highlighted, and present in legend/adapter data through the same `_none` constant.
- Offline HTML keeps its no-chat selection facts panel working for community, ungrouped, and Shift multi-selection.
- Unit tests, typecheck, lint, and browser validation cover the behavior.
- `CHANGELOG.md` and `README.md` describe the user-facing change before push.

## Reference Documents

- Spec: `docs/superpowers/specs/2026-06-28-unified-community-drawer-design.md`
- Visual reference: `docs/superpowers/specs/unified-community-drawer-v3-reference.png`

## Review-Locked Decisions

These decisions were confirmed during `/plan-eng-review` and are mandatory for implementation. Decisions 1-11 are from the first pass; decisions 12-17 are from a second multi-perspective pass (architecture + product/coherence + tests + code-fact verification, 2026-06-29) that caught drift introduced after the first pass:

1. Keep the full scope in this branch: community drawer, `_none`, `+邻居`, and Sigma Shift multi-select.
2. Community drawers and multi-node selection drawers must share one group-drawer skeleton. Do not rebuild two separate drawer structures.
3. `_none` is a real virtual community in summary, selection, prompt formatting, and tests. Do not hardcode `_none` in the workbench when the engine exports the constant.
4. Community summary facts must reuse `SelectionFacts`. The drawer may label `internalLinkCount` as “链接”, but it must not maintain a second facts algorithm.
5. Closing a community drawer must clear the graph selection/highlight, just like closing the selection drawer.
6. `+邻居` must update every command-order and UI-click test it affects, not only one summary contract test.
7. Offline HTML and Sigma production performance regressions are part of final acceptance because `@llm-wiki/graph-engine` is shared by the workbench and generated HTML.
8. The unified drawer intentionally shows the four fixed group actions for community and multi-node/neighbor selections. Older context-specific actions such as “为什么没联系” or “对比这两块” remain available in engine logic, but they are not first-screen drawer actions in this design.
9. “链接” in the drawer means `SelectionFacts.internalLinkCount`: direct links where both endpoints are inside the current selected set. “孤立” means no direct link inside the current selected set, not no link in the whole graph.
10. “发送” requires free text. “新对话” must preserve the old behavior of using the recommended/default action when free text is empty.
11. Closing with the top-right button and closing with Escape may use different internal command names, but the user-visible result is the same: the drawer closes and graph selection/highlight is cleared for community and selection drawers.
12. **Removed `recommendEnterCommunity`.** An earlier draft added a `recommendEnterCommunity: structureState === "loose"` signal that highlighted the top “进入社区” button for loose communities. The second review (architecture + product lenses) found it directionally wrong: the community view’s value is dense relations (ADR-26 §2), so the dense `clear` communities are the ones worth entering, while `loose` communities have little to show. It also produced a competing second highlight alongside the `find_knowledge_gaps` action, and pointed at a nonexistent button when `communityId !== "_none" && !community`. Do **not** re-introduce a structure-driven “enter community” recommendation. “进入社区” stays neutral-but-prominent at the top for every enterable community; the single per-screen recommended highlight is the action button (`summarize_cluster` for clear, `find_knowledge_gaps` for loose, `explore_potential_links` for ungrouped/selection).
13. `enter-community` **already exists** in the `GraphSummaryCommand` union (`packages/graph-engine/src/types.ts`). Task 1 Step 3 must only add `select-neighbors`; re-declaring `enter-community` causes a duplicate/type conflict.
14. **Enter-community navigation must clear graph highlight too.** Decision 5 only covers the close path. When the user clicks “进入社区” (the `enter-community` command, handled in `App.tsx`), the handler must also clear graph selection/highlight, not just swap the drawer. Add a test alongside `graph-drawer-close.test.ts` covering the enter path.
15. `communityStructureState()` heuristics (`nodeCount <= 1 || internalLinkCount === 0 || isolatedCount > Math.floor(nodeCount / 2)`) need boundary tests in `packages/graph-engine/test/summary-contract.test.ts`: single-node community, `internalLinkCount === 0` with no isolated nodes, and the `isolatedCount` threshold boundary (`=== floor(n/2)` vs `=== floor(n/2) + 1`). Without these, the loose/clear split that drives the recommended action can silently flip.
16. The render test must assert the “发送” button is **disabled** when free text is empty, not just that the word “发送” appears. Otherwise a regression that always enables send passes the test.
17. Add a behavior test for `handleGraphCommunityAsk(null, true)` (new conversation, empty free text) verifying it falls back to the recommended/default action — locking Review-locked decision 10’s actual dispatch path, which the current Task 3 tests do not exercise.

## File Structure

- Modify `packages/graph-engine/src/types.ts`: add `_none` constants, community summary overview fields backed by `SelectionFacts`, `select-neighbors` command, and action metadata types used by the drawer.
- Modify `packages/graph-engine/src/summary/index.ts`: make `_none` a real virtual community in summaries and add community overview facts.
- Modify `packages/graph-engine/src/select/index.ts`: share `_none` mapping and add Shift toggle helper for Sigma.
- Modify `packages/graph-engine/src/render/model.ts`: normalize ungrouped nodes into `_none` for renderable communities, community washes, focus, and selection highlighting.
- Modify `packages/graph-engine/src/render/adapter.ts`: normalize community node membership, selected community state, commands, and drawer targets for `_none`.
- Modify `packages/graph-engine/src/render/legend.ts`: keep the “未分组” legend row and node list consistent with `_none`.
- Modify `packages/graph-engine/src/render/offline-reader.ts`: label `_none` as “未分组” in the offline selection facts panel and keep it free of workbench chat actions.
- Modify `packages/graph-engine/src/render/sigma-hit-projector.ts`: extract Shift/additive intent from Sigma events.
- Modify `packages/graph-engine/src/render/sigma-global-types.ts`: pass additive click context from the Sigma renderer.
- Modify `packages/graph-engine/src/render/sigma-global-renderer.ts`: include additive context on node hits.
- Modify `packages/graph-engine/src/facade.ts`: convert additive Sigma node hits into `nodes` selections or selection clear.
- Create `workbench/web/src/lib/graph-group-drawer.ts`: derive the shared group-drawer skeleton, community view model, selection view model, fixed action list, and action lookup helpers.
- Modify `workbench/web/src/lib/drawer-state.ts`: store community free text in drawer state.
- Modify `workbench/web/src/lib/graph-selection.ts`: use engine `_none` constants when formatting selection prompts.
- Modify `workbench/web/src/lib/graph-summary-actions.ts`: preserve community drawer text and keep `_none` routed to community summary.
- Modify `workbench/web/src/components/GraphGroupDrawer.tsx`: render the shared overview, fixed actions, core/selected nodes, and dialogue area for both community and selection drawers.
- Modify `workbench/web/src/components/GraphSelection.tsx`: render multi-node and neighbor selections through `GraphGroupDrawer` instead of the old standalone selection panel.
- Modify `workbench/web/src/components/GraphSummaryDrawer.tsx`: replace the heavy community summary with `GraphGroupDrawer` and add the node “+邻居” command display.
- Modify `workbench/web/src/components/RightDrawer.tsx`: pass community dialogue handlers and render the new community props.
- Modify `workbench/web/src/App.tsx`: wire community free text, community asks, `select-neighbors`, Shift selection state refresh, and close-to-clear behavior for community drawers.
- Modify `workbench/web/src/index.css`: add unified community drawer styles and remove first-screen emphasis from obsolete community blocks.
- Modify tests under `packages/graph-engine/test/` and `workbench/web/test/`: lock the new behavior.
- Modify `CHANGELOG.md` and `README.md`: document the shipped behavior.

---

### Task 0: Implementation Preflight

**Files:** none

- [ ] **Step 1: Confirm branch and workspace state**

Run:

```bash
git status --short --branch
git branch --show-current
```

Expected: branch is `codex/unified-community-drawer-design`. If implementation starts from `main`, create the branch first:

```bash
git switch main
git pull --ff-only
git switch -c codex/unified-community-drawer-design
```

Do not start feature code on `main`.

- [ ] **Step 2: Confirm QA fixture coverage**

Before browser QA, prepare or identify one knowledge base / fixture that contains:

- at least one normal community
- at least two ungrouped nodes
- one linked ungrouped pair
- one isolated ungrouped node
- one node with at least one one-hop neighbor
- at least two nodes visible in Sigma global view for Shift multi-select

Prefer adding or extending a test fixture under `tests/fixtures/` if the current local knowledge base does not reliably contain all states. Browser QA must name the fixture or KB used in the final implementation report.

### Task 1: Engine Summary Contract For `_none`

**Files:**
- Modify: `packages/graph-engine/src/types.ts`
- Modify: `packages/graph-engine/src/summary/index.ts`
- Modify: `packages/graph-engine/src/render/model.ts`
- Modify: `packages/graph-engine/src/render/adapter.ts`
- Modify: `packages/graph-engine/src/render/legend.ts`
- Modify: `packages/graph-engine/src/render/offline-reader.ts`
- Test: `packages/graph-engine/test/summary-contract.test.ts`
- Test: `packages/graph-engine/test/render-model.test.ts`
- Test: `packages/graph-engine/test/renderer-adapter-contract.test.ts`
- Test: `packages/graph-engine/test/legend.test.ts`
- Test: `tests/browser/graph-html-insights.mjs`

- [ ] **Step 1: Write the failing `_none` community summary test**

Add this test to `packages/graph-engine/test/summary-contract.test.ts` after the existing community summary test:

```ts
it("summarizes the ungrouped virtual community as a community payload", () => {
  const data = graphFixtureWithUngroupedNodes();
  const summary = summarizeGraphCommunity(data, "_none", {
    selection: { kind: "community", id: "_none" },
    searchResultIds: ["loose-a"]
  });

  assert.equal(summary.kind, "community-summary");
  assert.equal(summary.communityId, "_none");
  assert.equal(summary.label, "未分组");
  assert.equal(summary.nodeCount, 2);
  assert.deepEqual(summary.facts, {
    pageCount: 2,
    internalLinkCount: 0,
    communityCount: 1,
    isolatedCount: 2
  });
  assert.equal(summary.structureState, "ungrouped");
  assert.equal(summary.canEnterCommunity, false);
  assert.equal(summary.description, "这些页面暂未形成明确社区。你可以让 agent 探索它们之间是否存在潜在关系。");
  assert.deepEqual(summary.searchResultIds, ["loose-a"]);
  assert.deepEqual(summary.selection.selectedNodeIds, ["loose-a", "loose-b"]);
  assert.deepEqual(summary.selection.selectedCommunityIds, ["_none"]);
  assert.deepEqual(summary.commands.map((command) => command.kind), []);
  assert.deepEqual(summary.coreNodes.map((node) => node.nodeId), ["loose-a", "loose-b"]);
  assert.deepEqual(summary.coreNodes.map((node) => node.label), ["Loose A", "Loose B"]);
});

function graphFixtureWithUngroupedNodes(): GraphData {
  const base = graphFixture();
  return {
    ...base,
    meta: {
      ...base.meta,
      total_nodes: base.meta.total_nodes + 2
    },
    nodes: [
      ...base.nodes,
      { id: "loose-a", label: "Loose A", type: "topic", community: null, source_path: "wiki/loose/a.md", score: 2 },
      { id: "loose-b", label: "Loose B", type: "entity", source_path: "wiki/loose/b.md", weight: 1 }
    ]
  };
}
```

- [ ] **Step 1b: Write the failing `_none` internal-link variant test**

Add a second fixture/assertion so the plan locks both `_none` edge cases:

```ts
it("counts internal links inside the ungrouped virtual community", () => {
  const data = graphFixtureWithLinkedUngroupedNodes();
  const summary = summarizeGraphCommunity(data, "_none", {
    selection: { kind: "community", id: "_none" }
  });

  assert.equal(summary.kind, "community-summary");
  assert.deepEqual(summary.facts, {
    pageCount: 2,
    internalLinkCount: 1,
    communityCount: 1,
    isolatedCount: 0
  });
  assert.equal(summary.structureState, "ungrouped");
});

function graphFixtureWithLinkedUngroupedNodes(): GraphData {
  const base = graphFixtureWithUngroupedNodes();
  return {
    ...base,
    meta: {
      ...base.meta,
      total_edges: base.meta.total_edges + 1
    },
    edges: [
      ...base.edges,
      { id: "loose-a-loose-b", from: "loose-a", to: "loose-b", type: "INFERRED", relation_type: "潜在关联", weight: 0.6 }
    ]
  };
}
```

- [ ] **Step 2: Run the failing summary test**

Run:

```bash
node --import tsx --test packages/graph-engine/test/summary-contract.test.ts
```

Expected: fail because `GraphCommunitySummaryPayload` does not have `facts`, `structureState`, `description`, `canEnterCommunity`, or `coreNodes`, and `_none` currently returns an unavailable summary.

- [ ] **Step 3: Add community summary fields and constants**

In `packages/graph-engine/src/types.ts`, add constants near the graph type aliases:

```ts
export const UNGROUPED_COMMUNITY_ID = "_none";
export const UNGROUPED_COMMUNITY_LABEL = "未分组";

export type GraphCommunityStructureState = "clear" | "loose" | "ungrouped";

export interface GraphCommunityCoreNode {
  nodeId: NodeId;
  label: string;
  type: GraphNodeType;
  role: "核心" | "主题" | "相关";
}
```

Update `GraphSummaryCommand`:

```ts
export type GraphSummaryCommand =
  | {
      kind: "enter-community";
      communityId: CommunityId;
      label: string;
    }
  | {
      kind: "select-neighbors";
      nodeId: NodeId;
      label: string;
    }
  | {
      kind: "open-detail-read";
      nodeId: NodeId;
      path: WikiPath;
      label: string;
    }
  | {
      kind: "show-this-object";
      object: GraphSummaryObjectRef;
      label: string;
    }
  | {
      kind: "clear-temporary-object-display";
      label: string;
    }
  | {
      kind: "set-fixed-position";
      mode: "fix" | "unfix";
      nodeId: NodeId;
      wikiPath: WikiPath;
      label: string;
    };
```

Update `GraphCommunitySummaryPayload`:

```ts
export interface GraphCommunitySummaryPayload {
  kind: "community-summary";
  object: { kind: "community"; communityId: CommunityId };
  communityId: CommunityId;
  label: string;
  nodeCount: number;
  facts: SelectionFacts;
  structureState: GraphCommunityStructureState;
  description: string;
  canEnterCommunity: boolean;
  coreNodeIds: NodeId[];
  coreNodes: GraphCommunityCoreNode[];
  searchResultIds: NodeId[];
  pinHints: GraphPinHint[];
  selection: GraphSummarySelectionState;
  strongestRelations: GraphRelationSummary[];
  bridgeRelations: GraphRelationSummary[];
  aggregationMarkers: GraphAggregationMarker[];
  commands: GraphSummaryCommand[];
}
```

- [ ] **Step 4: Implement `_none` community summary support**

In `packages/graph-engine/src/summary/index.ts`, import the new constants and type:

```ts
  GraphCommunityCoreNode,
  SelectionFacts,
  UNGROUPED_COMMUNITY_ID,
  UNGROUPED_COMMUNITY_LABEL,
```

Replace the return body of `summarizeGraphCommunity` with this shape:

```ts
  const coreIds = coreNodeIds(data, nodes);
  const selection = resolveSelectionForCapabilities(data, { kind: "community", id: communityId }, { canAsk: false });
  const facts = selection.facts;
  const structureState = communityStructureState(communityId, facts.pageCount, facts.internalLinkCount, facts.isolatedCount);
  const canEnterCommunity = communityId !== UNGROUPED_COMMUNITY_ID && Boolean(community);
  return {
    kind: "community-summary",
    object: { kind: "community", communityId },
    communityId,
    label: communityLabel(community?.label, communityId),
    nodeCount: Number(community?.node_count ?? nodes.length),
    facts,
    structureState,
    description: communityDescription(structureState),
    canEnterCommunity,
    coreNodeIds: coreIds,
    coreNodes: coreNodeSummaries(data, coreIds),
    searchResultIds: searchHits,
    pinHints,
    selection: selectionStateForObject(data, { kind: "community", communityId }, options.selection),
    strongestRelations: topRelations(relations, DEFAULT_LIMIT),
    bridgeRelations: topRelations(relations.filter((relation) => relation.bridge), DEFAULT_LIMIT),
    aggregationMarkers: markersContainingCommunity(options.aggregationMarkers, communityId),
    commands: communitySummaryCommands(communityId, canEnterCommunity)
  };
```

Add these helper functions below `nodeSummaryCommands`:

```ts
function communitySummaryCommands(communityId: CommunityId, canEnterCommunity: boolean): GraphSummaryCommand[] {
  return canEnterCommunity
    ? [{ kind: "enter-community", communityId, label: "进入社区" }]
    : [];
}

function communityLabel(label: string | null | undefined, communityId: CommunityId): string {
  if (communityId === UNGROUPED_COMMUNITY_ID) return UNGROUPED_COMMUNITY_LABEL;
  return label || communityId;
}

function communityDescription(state: "clear" | "loose" | "ungrouped"): string {
  if (state === "ungrouped") return "这些页面暂未形成明确社区。你可以让 agent 探索它们之间是否存在潜在关系。";
  if (state === "loose") return "这组页面结构还比较松散。你可以先找知识缺口，也可以继续探索潜在关系。";
  return "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。";
}

function communityStructureState(
  communityId: CommunityId,
  nodeCount: number,
  internalLinkCount: number,
  isolatedCount: number
): "clear" | "loose" | "ungrouped" {
  if (communityId === UNGROUPED_COMMUNITY_ID) return "ungrouped";
  if (nodeCount <= 1 || internalLinkCount === 0 || isolatedCount > Math.floor(nodeCount / 2)) return "loose";
  return "clear";
}

function coreNodeSummaries(data: GraphData, ids: NodeId[]): GraphCommunityCoreNode[] {
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  return ids.flatMap((id, index) => {
    const node = nodeById.get(id);
    if (!node) return [];
    return [{
      nodeId: node.id,
      label: node.label || node.id,
      type: node.type,
      role: index === 0 ? "核心" : node.type === "topic" ? "主题" : "相关"
    }];
  });
}
```

Replace `nodesForCommunity`:

```ts
function nodesForCommunity(data: GraphData, communityId: CommunityId): GraphNode[] {
  return data.nodes.filter((node) => communityIdForNode(node) === communityId);
}

function communityIdForNode(node: GraphNode): CommunityId {
  return String(node.community || UNGROUPED_COMMUNITY_ID);
}
```

Update `communityIds` to include `_none` when ungrouped nodes exist:

```ts
function communityIds(data: GraphData): CommunityId[] {
  const ids = new Set<CommunityId>();
  for (const community of data.learning?.communities ?? []) ids.add(community.id);
  for (const node of data.nodes) ids.add(communityIdForNode(node));
  return [...ids];
}
```

- [ ] **Step 5: Run the summary test**

Run:

```bash
node --import tsx --test packages/graph-engine/test/summary-contract.test.ts
```

Expected: pass.

- [ ] **Step 6: Write failing render/adapter tests for `_none`**

Add render model and adapter contract coverage:

```ts
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

it("exposes ungrouped adapter community node ids and drawer target", () => {
  const adapter = buildGraphRendererAdapterData(graphFixtureWithUngroupedNodes(), {
    selection: { kind: "community", id: UNGROUPED_COMMUNITY_ID }
  });
  const ungrouped = adapter.communities.find((community) => community.id === UNGROUPED_COMMUNITY_ID);

  assert.deepEqual(ungrouped?.nodeIds, ["loose-a", "loose-b"]);
  assert.equal(ungrouped?.selected, true);
  assert.deepEqual(ungrouped?.drawerTarget, {
    summaryKind: "community-summary",
    object: { kind: "community", communityId: UNGROUPED_COMMUNITY_ID }
  });
});
```

Add or update a legend test:

```ts
assert.equal(rows.find((row) => row.id === UNGROUPED_COMMUNITY_ID)?.label, UNGROUPED_COMMUNITY_LABEL);
```

Expected: fail until render model, adapter, and legend all use the same `_none` normalization as summary/select.

- [ ] **Step 7: Normalize `_none` through render model, adapter, and legend**

Use the exported constants from `packages/graph-engine/src/types.ts`.

Implementation requirements:

- `buildRenderableGraph()` must treat nodes with `community == null` or empty community as `UNGROUPED_COMMUNITY_ID` when building renderable nodes, community washes, focus counts, and selected node ids.
- `evaluateCommunityQuality()` and community counts should include `_none` when ungrouped nodes exist, but the quality heuristics must not turn `_none` into a weak-label warning by itself.
- `buildGraphRendererAdapterData()` must compute community `nodeIds`, `selected`, `searchResultIds`, and `pinHints` through normalized community ids, not raw `node.community === community.id`.
- `buildCommunityLegend()` must list `_none` as “未分组” and map the ungrouped row to the normalized node ids.
- `renderOfflineSelectionPanel()` must display `社区选区 · N 页` for `_none` selections and can optionally show the title `未分组 · N 页`; it must not show workbench-only ask actions.

- [ ] **Step 8: Run render/adapter/offline `_none` tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/render-model.test.ts packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/legend.test.ts
tests/graph-html-insights.regression-1.sh
```

Expected: pass.

- [ ] **Step 9: Commit the engine summary and render contract**

Run:

```bash
git add packages/graph-engine/src/types.ts packages/graph-engine/src/summary/index.ts packages/graph-engine/src/select/index.ts packages/graph-engine/src/render/model.ts packages/graph-engine/src/render/adapter.ts packages/graph-engine/src/render/legend.ts packages/graph-engine/src/render/offline-reader.ts packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/render-model.test.ts packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/legend.test.ts tests/browser/graph-html-insights.mjs
git commit -m "fix: summarize ungrouped graph community"
```

Expected: commit succeeds.

---

### Task 2: Shared Group Drawer View Model

**Files:**
- Create: `workbench/web/src/lib/graph-group-drawer.ts`
- Test: `workbench/web/test/graph-group-drawer.test.ts`

- [ ] **Step 1: Write failing view-model tests**

Create `workbench/web/test/graph-group-drawer.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  graphCommunityDrawerViewModel,
  graphSelectionGroupDrawerViewModel,
  groupDrawerActionById,
} from "../src/lib/graph-group-drawer";
import type { GraphCommunitySummaryPayload, Selection } from "@llm-wiki/graph-engine";

describe("graph group drawer view model", () => {
  it("keeps normal community actions stable and enter-community available", () => {
    const view = graphCommunityDrawerViewModel(summaryFixture());

    assert.equal(view.kicker, "社区");
    assert.equal(view.title, "Knowledge Build");
    assert.equal(view.canEnterCommunity, true);
    assert.equal(view.recommendedActionId, "summarize_cluster");
    assert.deepEqual(view.facts, [
      { label: "页", value: 6 },
      { label: "链接", value: 5 },
      { label: "核心", value: 3 },
      { label: "孤立", value: 0 }
    ]);
    assert.deepEqual(view.actions.map((action) => action.label), [
      "总结这一簇",
      "找知识缺口",
      "生成主题页",
      "探索潜在关系"
    ]);
    assert.equal(view.actions.find((action) => action.id === "explore_potential_links")?.recommended, false);
    assert.equal(view.tags.includes("结构清晰"), true);
    assert.equal(view.tags.includes("无搜索命中"), false);
  });

  it("recommends potential relation exploration for ungrouped community", () => {
    const view = graphCommunityDrawerViewModel(summaryFixture({
      communityId: "_none",
      label: "未分组",
      structureState: "ungrouped",
      canEnterCommunity: false,
      facts: { pageCount: 2, internalLinkCount: 0, communityCount: 1, isolatedCount: 2 },
    }));

    assert.equal(view.canEnterCommunity, false);
    assert.equal(view.recommendedActionId, "explore_potential_links");
    assert.equal(view.actions.find((action) => action.id === "explore_potential_links")?.recommended, true);
    assert.equal(view.tags.includes("暂未成组"), true);
  });

  it("uses the same skeleton for manual multi-node selections", () => {
    const view = graphSelectionGroupDrawerViewModel("选区", selectionFixture());

    assert.equal(view.kicker, "选区");
    assert.equal(view.title, "选区");
    assert.equal(view.canEnterCommunity, false);
    assert.equal(view.recommendedActionId, "explore_potential_links");
    assert.deepEqual(view.facts, [
      { label: "页", value: 3 },
      { label: "链接", value: 0 },
      { label: "社区", value: 2 },
      { label: "孤立", value: 1 }
    ]);
    assert.deepEqual(view.actions.map((action) => action.label), [
      "总结这一簇",
      "找知识缺口",
      "生成主题页",
      "探索潜在关系"
    ]);
  });

  it("finds fixed actions by id for prompt dispatch", () => {
    assert.equal(groupDrawerActionById("find_knowledge_gaps")?.label, "找知识缺口");
    assert.equal(groupDrawerActionById("missing"), null);
    assert.equal(groupDrawerActionById(null), null);
  });
});

function summaryFixture(overrides: Partial<GraphCommunitySummaryPayload> = {}): GraphCommunitySummaryPayload {
  return {
    kind: "community-summary",
    object: { kind: "community", communityId: "build" },
    communityId: "build",
    label: "Knowledge Build",
    nodeCount: 6,
    facts: { pageCount: 6, internalLinkCount: 5, communityCount: 1, isolatedCount: 0 },
    structureState: "clear",
    description: "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。",
    canEnterCommunity: true,
    coreNodeIds: ["a", "b", "c"],
    coreNodes: [
      { nodeId: "a", label: "Alpha", type: "topic", role: "核心" },
      { nodeId: "b", label: "Beta", type: "entity", role: "相关" },
      { nodeId: "c", label: "Gamma", type: "source", role: "相关" }
    ],
    searchResultIds: [],
    pinHints: [],
    selection: {
      input: { kind: "community", id: "build" },
      selectionId: "community:a,b,c",
      selectedNodeIds: ["a", "b", "c"],
      selectedCommunityIds: ["build"],
      containsCurrentObject: true
    },
    strongestRelations: [],
    bridgeRelations: [],
    aggregationMarkers: [],
    commands: [{ kind: "enter-community", communityId: "build", label: "进入社区" }],
    ...overrides
  };
}

function selectionFixture(overrides: Partial<Selection> = {}): Selection {
  return {
    id: "nodes:a,b,c",
    nodeIds: ["a", "b", "c"],
    communityIds: ["alpha", "beta"],
    facts: { pageCount: 3, internalLinkCount: 0, communityCount: 2, isolatedCount: 1 },
    actions: [{ id: "explore_potential_links", label: "探索潜在关系", tone: "bridge" }],
    ...overrides
  };
}
```

- [ ] **Step 2: Run the failing view-model test**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
```

Expected: fail because `workbench/web/src/lib/graph-group-drawer.ts` does not exist.

- [ ] **Step 3: Create the shared group drawer view model**

Create `workbench/web/src/lib/graph-group-drawer.ts`:

```ts
import type {
  GraphCommunitySummaryPayload,
  Selection,
  SelectionAction,
  SelectionActionId,
  SelectionActionTone
} from "@llm-wiki/graph-engine";

export interface GraphGroupDrawerFact {
  label: string;
  value: number;
}

export interface GraphGroupDrawerAction extends SelectionAction {
  recommended: boolean;
}

export interface GraphGroupDrawerNode {
  nodeId: string;
  label: string;
  role: string;
}

export interface GraphGroupDrawerViewModel {
  kicker: string;
  title: string;
  description: string;
  canEnterCommunity: boolean;
  recommendedActionId: SelectionActionId;
  facts: GraphGroupDrawerFact[];
  tags: string[];
  actions: GraphGroupDrawerAction[];
  nodes: GraphGroupDrawerNode[];
}

const FIXED_GROUP_ACTIONS: Array<SelectionAction & { id: SelectionActionId; tone: SelectionActionTone }> = [
  { id: "summarize_cluster", label: "总结这一簇", tone: "digest" },
  { id: "find_knowledge_gaps", label: "找知识缺口", tone: "lint" },
  { id: "create_topic_page", label: "生成主题页", tone: "write" },
  { id: "explore_potential_links", label: "探索潜在关系", tone: "bridge" }
];

export function graphCommunityDrawerViewModel(payload: GraphCommunitySummaryPayload): GraphGroupDrawerViewModel {
  const recommendedActionId = recommendedActionForCommunity(payload);
  return {
    kicker: "社区",
    title: payload.label,
    description: payload.description,
    canEnterCommunity: payload.canEnterCommunity,
    recommendedActionId,
    facts: [
      { label: "页", value: payload.facts.pageCount },
      { label: "链接", value: payload.facts.internalLinkCount },
      { label: "核心", value: payload.coreNodeIds.length },
      { label: "孤立", value: payload.facts.isolatedCount }
    ],
    tags: communityTags(payload),
    actions: FIXED_GROUP_ACTIONS.map((action) => ({
      ...action,
      recommended: action.id === recommendedActionId
    })),
    nodes: payload.coreNodes.slice(0, 3).map((node) => ({
      nodeId: node.nodeId,
      label: node.label,
      role: node.role
    }))
  };
}

export function graphSelectionGroupDrawerViewModel(title: string, selection: Selection): GraphGroupDrawerViewModel {
  const recommendedActionId = recommendedActionForSelection(selection);
  return {
    kicker: "选区",
    title,
    description: "这些页面来自当前图谱选区。你可以直接让 agent 基于这组页面继续工作。",
    canEnterCommunity: false,
    recommendedActionId,
    facts: [
      { label: "页", value: selection.facts.pageCount },
      { label: "链接", value: selection.facts.internalLinkCount },
      { label: "社区", value: selection.facts.communityCount },
      { label: "孤立", value: selection.facts.isolatedCount }
    ],
    tags: ["Shift+点击增删节点"],
    actions: FIXED_GROUP_ACTIONS.map((action) => ({
      ...action,
      recommended: action.id === recommendedActionId
    })),
    nodes: selection.nodeIds.slice(0, 3).map((nodeId) => ({
      nodeId,
      label: nodeId,
      role: "已选"
    }))
  };
}

export function groupDrawerActionById(id: string | null): SelectionAction | null {
  if (!id) return null;
  return FIXED_GROUP_ACTIONS.find((action) => action.id === id) ?? null;
}

function recommendedActionForCommunity(payload: GraphCommunitySummaryPayload): SelectionActionId {
  if (payload.structureState === "ungrouped") return "explore_potential_links";
  if (payload.structureState === "loose") return "find_knowledge_gaps";
  return "summarize_cluster";
}

function recommendedActionForSelection(selection: Selection): SelectionActionId {
  if (selection.facts.internalLinkCount === 0) return "explore_potential_links";
  if (selection.facts.communityCount > 1) return "explore_potential_links";
  return "summarize_cluster";
}

function communityTags(payload: GraphCommunitySummaryPayload): string[] {
  const tags = [structureLabel(payload.structureState)];
  if (payload.pinHints.length > 0) tags.push(`${payload.pinHints.length} 固定`);
  if (payload.searchResultIds.length > 0) tags.push(`${payload.searchResultIds.length} 命中`);
  return tags;
}

function structureLabel(state: GraphCommunitySummaryPayload["structureState"]): string {
  if (state === "ungrouped") return "暂未成组";
  if (state === "loose") return "结构松散";
  return "结构清晰";
}
```

- [ ] **Step 4: Run the view-model test**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the view model**

Run:

```bash
git add workbench/web/src/lib/graph-group-drawer.ts workbench/web/test/graph-group-drawer.test.ts
git commit -m "feat: add unified graph group drawer model"
```

Expected: commit succeeds.

---

### Task 3: Drawer State And Community Prompt Flow

**Files:**
- Modify: `workbench/web/src/lib/drawer-state.ts`
- Modify: `workbench/web/src/lib/graph-selection.ts`
- Modify: `workbench/web/src/lib/graph-summary-actions.ts`
- Modify: `workbench/web/src/lib/graph-drawer-close.ts`
- Modify: `workbench/web/src/App.tsx`
- Test: `workbench/web/test/graph-summary-actions.test.ts`
- Test: `workbench/web/test/graph-selection.test.ts`
- Test: `workbench/web/test/graph-drawer-close.test.ts`

- [ ] **Step 1: Write failing routing and preservation tests**

Add these tests to `workbench/web/test/graph-summary-actions.test.ts`:

```ts
it("turns an ungrouped community selection into a community summary drawer", () => {
  const drawer = drawerForGraphSelection(graphFixtureWithUngroupedNodes(), ungroupedSelection(), closedDrawer());

  assert.equal(drawer.mode, "graph-community-summary");
  assert.equal(drawer.mode === "graph-community-summary" ? drawer.payload.communityId : null, "_none");
  assert.equal(drawer.mode === "graph-community-summary" ? drawer.payload.canEnterCommunity : null, false);
});

it("preserves community free text while refreshing the same community drawer", () => {
  const current = drawerForGraphSelection(graphFixture(), communitySelection(), closedDrawer());
  assert.equal(current.mode, "graph-community-summary");
  const withText = current.mode === "graph-community-summary"
    ? graphCommunitySummaryDrawer(current.payload, "请重点看缺口")
    : current;

  const next = drawerForGraphSelection(graphFixture(), communitySelection(), withText);

  assert.equal(next.mode, "graph-community-summary");
  assert.equal(next.mode === "graph-community-summary" ? next.freeText : null, "请重点看缺口");
});

function ungroupedSelection(): Selection {
  return {
    id: "community:loose-a,loose-b",
    nodeIds: ["loose-a", "loose-b"],
    communityIds: ["_none"],
    facts: {
      pageCount: 2,
      internalLinkCount: 0,
      communityCount: 1,
      isolatedCount: 2
    },
    actions: []
  };
}

function graphFixtureWithUngroupedNodes(): GraphData {
  const base = graphFixture();
  return {
    ...base,
    nodes: [
      ...base.nodes,
      { id: "loose-a", label: "Loose A", type: "topic", community: null, source_path: "wiki/loose/a.md" },
      { id: "loose-b", label: "Loose B", type: "entity", source_path: "wiki/loose/b.md" }
    ]
  };
}
```

- [ ] **Step 1b: Write failing ungrouped prompt formatting test**

Add this test to `workbench/web/test/graph-selection.test.ts`:

```ts
it("uses the shared ungrouped community label when formatting selection prompts", () => {
  const data = fixtureGraph();
  data.nodes = [
    { id: "loose-a", label: "Loose A", type: "topic", community: null, source_path: "wiki/loose/a.md" },
    { id: "loose-b", label: "Loose B", type: "entity", source_path: "wiki/loose/b.md" }
  ];
  data.edges = [];
  data.learning = {
    ...data.learning!,
    communities: []
  };

  const selection = resolveSelection(data, { kind: "community", id: UNGROUPED_COMMUNITY_ID });
  const payload = buildSelectionPromptPayload(data, selection, null);

  assert.match(payload.displayText, /@\[选区:未分组 · 2页\]/);
  assert.match(payload.expandedText, /Loose A - 社区 未分组/);
  assert.doesNotMatch(payload.expandedText, /社区 _none/);
});
```

- [ ] **Step 1c: Write failing community close behavior test**

Create `workbench/web/test/graph-drawer-close.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { graphCommunitySummaryDrawer, graphNodeSummaryDrawer, graphSelectionDrawer } from "../src/lib/drawer-state";
import { graphCloseCommandForDrawer } from "../src/lib/graph-drawer-close";

describe("graph drawer close behavior", () => {
  it("clears graph selection when closing community and selection drawers", () => {
    assert.deepEqual(graphCloseCommandForDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()), "button")?.type, "clear-selection");
    assert.deepEqual(graphCloseCommandForDrawer(graphSelectionDrawer(selectionFixture(), "选区"), "escape")?.type, "clear");
  });

  it("does not clear graph selection when closing a node summary drawer", () => {
    assert.equal(graphCloseCommandForDrawer(graphNodeSummaryDrawer(nodeSummaryFixture()), "button"), null);
  });
});
```

- [ ] **Step 2: Run the failing routing tests**

Run:

```bash
node --import tsx --test workbench/web/test/graph-summary-actions.test.ts workbench/web/test/graph-selection.test.ts workbench/web/test/graph-drawer-close.test.ts
```

Expected: fail because `graph-community-summary` does not store `freeText`, `_none` still falls back without Task 1 code, prompt formatting still hardcodes `_none`, and close behavior is not extracted yet.

- [ ] **Step 3: Store community free text in drawer state**

In `workbench/web/src/lib/drawer-state.ts`, update the community drawer state:

```ts
| {
    mode: "graph-community-summary";
    payload: GraphCommunitySummaryPayload;
    freeText: string;
  }
```

Replace the helper:

```ts
export function graphCommunitySummaryDrawer(payload: GraphCommunitySummaryPayload, freeText = ""): DrawerState {
  return { mode: "graph-community-summary", payload, freeText };
}
```

- [ ] **Step 4: Preserve free text in summary routing**

In `workbench/web/src/lib/graph-summary-actions.ts`, add this helper:

```ts
function communityFreeText(current: DrawerState, communityId: string): string {
  return current.mode === "graph-community-summary" && current.payload.communityId === communityId
    ? current.freeText
    : "";
}
```

Update both community drawer creation sites:

```ts
if (summary.kind === "community-summary") {
  return graphCommunitySummaryDrawer(summary, communityFreeText(current, selection.communityIds[0]));
}
```

```ts
if (summary.kind === "community-summary") {
  return graphCommunitySummaryDrawer(summary, communityFreeText(current, communityId));
}
```

- [ ] **Step 5: Use shared `_none` constants in prompt formatting**

In `workbench/web/src/lib/graph-selection.ts`, import constants from the engine:

```ts
import {
  UNGROUPED_COMMUNITY_ID,
  UNGROUPED_COMMUNITY_LABEL,
  wikiPathForGraphNode,
  type GraphData,
  type Selection,
  type SelectionAction
} from "@llm-wiki/graph-engine";
```

Update `selectionTitle()` and `selectionNodes()`:

```ts
export function selectionTitle(data: GraphData, selection: Selection): string {
  if (selection.communityIds.length === 1) {
    if (selection.communityIds[0] === UNGROUPED_COMMUNITY_ID) return UNGROUPED_COMMUNITY_LABEL;
    const community = data.learning?.communities?.find((item) => String(item.id) === selection.communityIds[0]);
    if (community?.label) return community.label;
  }
  const firstNode = data.nodes.find((node) => selection.nodeIds.includes(node.id));
  return firstNode?.label || selection.nodeIds[0] || "图谱";
}
```

```ts
community: node.community ? String(node.community) : UNGROUPED_COMMUNITY_LABEL
```

- [ ] **Step 6: Extract close-to-clear helper**

Create `workbench/web/src/lib/graph-drawer-close.ts`:

```ts
import type { DrawerState } from "./drawer-state";
import type { GraphSelectionCommand } from "./graph-summary-actions";

export function graphCloseCommandForDrawer(
  drawer: DrawerState,
  reason: "button" | "escape"
): Extract<GraphSelectionCommand, { type: "clear" | "clear-selection" }> | null {
  if (drawer.mode !== "graph-reader" && drawer.mode !== "graph-selection" && drawer.mode !== "graph-community-summary") return null;
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: reason === "button" ? "clear-selection" : "clear"
  };
}
```

- [ ] **Step 7: Wire community dialogue handlers in `App.tsx`**

Import `graphCommunitySummaryDrawer` and the new action resolver:

```ts
import {
  artifactDrawer,
  closedDrawer,
  type DrawerState,
  graphCommunitySummaryDrawer,
  graphReaderDrawer,
  graphSelectionDrawer,
  shouldApplyGraphReaderResult,
  wikiDrawer,
} from "@/lib/drawer-state";
import { graphCloseCommandForDrawer } from "@/lib/graph-drawer-close";
import { groupDrawerActionById } from "@/lib/graph-group-drawer";
```

Add handlers next to the existing graph selection handlers:

```ts
const handleGraphCommunityTextChange = useCallback((value: string) => {
  setDrawer((current) => (
    current.mode === "graph-community-summary"
      ? graphCommunitySummaryDrawer(current.payload, value)
      : current
  ));
}, []);

const handleGraphCommunityAsk = (actionId: string | null, newConversation: boolean) => {
  if (!graphData || drawer.mode !== "graph-community-summary") return;
  const selection = resolveSelection(graphData, { kind: "community", id: drawer.payload.communityId });
  const action = groupDrawerActionById(actionId);
  const payload = buildSelectionPromptPayload(graphData, selection, action, drawer.freeText);
  void handleAskSelection({
    message: payload.expandedText,
    displayText: payload.displayText,
    newConversation,
  });
  setDrawer(closedDrawer());
  setSelectionCommand({ id: Math.random().toString(36).slice(2, 10), type: "clear" });
};
```

Update `handleCloseDrawer`:

```ts
const handleCloseDrawer = useCallback((reason: "button" | "escape") => {
  setDrawer((current) => {
    const clearCommand = graphCloseCommandForDrawer(current, reason);
    if (clearCommand) {
      setSelectionCommand(clearCommand);
      setGraphFocusPath(null);
    }
    return closedDrawer();
  });
}, []);
```

Pass the handlers into `RightDrawer`:

```tsx
<RightDrawer
  drawer={drawer}
  fullscreen={drawerFullscreen}
  width={drawerWidth}
  defaultWidth={DEFAULT_DRAWER_WIDTH}
  onSelectArtifact={(id) => setDrawer(artifactDrawer(artifacts, id))}
  onOpenPage={handleOpenPage}
  onWikiLinkSeen={handleWikiLinkSeen}
  onGraphReaderAction={handleGraphReaderAction}
  onGraphSummaryCommand={handleGraphSummaryCommand}
  onGraphSummaryNodeSelect={handleGraphSummaryNodeSelect}
  onGraphSummaryNodePreview={handleGraphSummaryNodePreview}
  onGraphSelectionTextChange={handleGraphSelectionTextChange}
  onGraphSelectionNeighbors={handleGraphSelectionNeighbors}
  onGraphSelectionAsk={handleGraphSelectionAsk}
  onGraphCommunityTextChange={handleGraphCommunityTextChange}
  onGraphCommunityAsk={handleGraphCommunityAsk}
  onResize={setDrawerWidth}
  onToggleFullscreen={() => setDrawerFullscreen((value) => !value)}
  onClose={handleCloseDrawer}
/>
```

- [ ] **Step 8: Run the routing tests**

Run:

```bash
node --import tsx --test workbench/web/test/graph-summary-actions.test.ts workbench/web/test/graph-selection.test.ts workbench/web/test/graph-drawer-close.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit drawer state and prompt flow**

Run:

```bash
git add workbench/web/src/lib/drawer-state.ts workbench/web/src/lib/graph-selection.ts workbench/web/src/lib/graph-summary-actions.ts workbench/web/src/lib/graph-drawer-close.ts workbench/web/src/App.tsx workbench/web/test/graph-summary-actions.test.ts workbench/web/test/graph-selection.test.ts workbench/web/test/graph-drawer-close.test.ts
git commit -m "feat: route community drawer prompts"
```

Expected: commit succeeds.

---

### Task 4: Unified Group Drawer UI

**Files:**
- Create: `workbench/web/src/components/GraphGroupDrawer.tsx`
- Modify: `workbench/web/src/components/GraphSelection.tsx`
- Modify: `workbench/web/src/components/GraphSummaryDrawer.tsx`
- Modify: `workbench/web/src/components/RightDrawer.tsx`
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/right-drawer-graph-summary.test.tsx`
- Test: `workbench/web/test/right-drawer-graph-selection.test.tsx`

- [ ] **Step 1: Write failing render tests for the unified group drawer**

Update the community render test in `workbench/web/test/right-drawer-graph-summary.test.tsx`:

```ts
it("renders unified community drawer with overview, fixed actions, core nodes, and dialogue controls", () => {
  const html = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()));

  assert.match(html, /data-testid="graph-community-summary"/);
  assert.match(html, /Alpha community/);
  assert.match(html, /进入社区/);
  assert.match(html, /总结这一簇/);
  assert.match(html, /找知识缺口/);
  assert.match(html, /生成主题页/);
  assert.match(html, /探索潜在关系/);
  assert.match(html, /补充说明（可选）/);
  assert.match(html, /发送/);
  assert.match(html, /新对话/);
  assert.match(html, /Alpha node/);
  assert.doesNotMatch(html, /暂无搜索命中/);
  assert.doesNotMatch(html, /暂无固定节点/);
  assert.doesNotMatch(html, /暂无桥接关系/);
});

it("renders ungrouped community without enter-community and recommends relation exploration", () => {
  const html = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture({
    communityId: "_none",
    label: "未分组",
    structureState: "ungrouped",
    description: "这些页面暂未形成明确社区。你可以让 agent 探索它们之间是否存在潜在关系。",
    canEnterCommunity: false,
    commands: []
  })));

  assert.match(html, /未分组/);
  assert.match(html, /暂未形成明确社区/);
  assert.match(html, /data-recommended="true"[^>]*>[\s\S]*探索潜在关系/);
  assert.doesNotMatch(html, /进入社区/);
});
```

Create `workbench/web/test/right-drawer-graph-selection.test.tsx`:

```ts
it("renders multi-node selections through the same group drawer skeleton", () => {
  const html = renderDrawer(graphSelectionDrawer(selectionFixture(), "选区"));

  assert.match(html, /data-testid="graph-selection-drawer"/);
  assert.match(html, /选区/);
  assert.match(html, /总结这一簇/);
  assert.match(html, /找知识缺口/);
  assert.match(html, /生成主题页/);
  assert.match(html, /探索潜在关系/);
  assert.match(html, /补充说明（可选）/);
  assert.match(html, /发送/);
  assert.match(html, /新对话/);
  assert.match(html, /data-group-drawer="true"/);
  assert.doesNotMatch(html, /graph-selection-actions/);
});
```

Update `communitySummaryFixture()` so it includes the fields from Task 1:

```ts
facts: { pageCount: 12, internalLinkCount: 8, communityCount: 1, isolatedCount: 1 },
structureState: "clear",
description: "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。",
canEnterCommunity: true,
coreNodes: [
  { nodeId: "alpha-node", label: "Alpha node", type: "topic", role: "核心" },
  { nodeId: "beta-node", label: "Beta node", type: "entity", role: "相关" },
  { nodeId: "gamma-node", label: "Gamma node", type: "source", role: "相关" },
  { nodeId: "delta-node", label: "Delta node", type: "entity", role: "相关" },
],
```

- [ ] **Step 2: Run the failing render test**

Run:

```bash
node --import tsx --test workbench/web/test/right-drawer-graph-summary.test.tsx
```

Expected: fail because the community drawer still renders the old heavy summary and `GraphSelection` still renders the old standalone selection panel.

- [ ] **Step 3: Update `RightDrawer` props and community render call**

In `workbench/web/src/components/RightDrawer.tsx`, add props:

```ts
onGraphCommunityTextChange: (value: string) => void;
onGraphCommunityAsk: (actionId: string | null, newConversation: boolean) => void;
```

Destructure them with the existing props:

```ts
onGraphCommunityTextChange,
onGraphCommunityAsk,
```

Update the community render:

```tsx
{drawer.mode === "graph-community-summary" && (
  <GraphCommunitySummary
    payload={drawer.payload}
    freeText={drawer.freeText}
    onFreeTextChange={onGraphCommunityTextChange}
    onAsk={(action) => onGraphCommunityAsk(action?.id ?? null, false)}
    onAskInNewConversation={(action) => onGraphCommunityAsk(action?.id ?? null, true)}
    onCommand={onGraphSummaryCommand}
    onShowNodeSummary={onGraphSummaryNodeSelect}
    onPreviewNode={onGraphSummaryNodePreview}
  />
)}
```

Update `renderDrawer()` in the test to provide no-op handlers:

```ts
onGraphCommunityTextChange: noopString,
onGraphCommunityAsk: noopSelectionAsk,
```

- [ ] **Step 4: Create `GraphGroupDrawer` and replace both community and selection renderers**

Create `workbench/web/src/components/GraphGroupDrawer.tsx`. It must own the shared skeleton:

```tsx
interface GraphGroupDrawerProps {
  testId: "graph-community-summary" | "graph-selection-drawer";
  view: GraphGroupDrawerViewModel;
  freeText: string;
  enterCommand?: GraphSummaryCommand | null;
  nodeSectionTitle: string;
  onFreeTextChange: (value: string) => void;
  onAsk: (action: SelectionAction | null) => void;
  onAskInNewConversation: (action: SelectionAction | null) => void;
  onCommand?: (command: GraphSummaryCommand) => void;
  onShowNodeSummary?: (nodeId: string) => void;
  onPreviewNode?: (nodeId: string | null) => void;
}
```

Implementation requirements:

- Render `<article className="graph-group-drawer" data-group-drawer="true" data-testid={testId}>`.
- Top overview renders kicker, title, description, facts, tags, and optional top-right “进入社区”.
- Fixed action grid always renders the four group actions from the view model, preserving button order.
- Node list renders `view.nodes` with optional preview/select callbacks. Use “核心节点” for community and “选中页面” for selection.
- Dialogue area renders the same textarea, “发送”, and “新对话” controls for both community and selection.
- “发送” stays disabled until free text exists. Fixed action buttons can always dispatch their action.

Update `workbench/web/src/components/GraphSelection.tsx`:

```tsx
const view = graphSelectionGroupDrawerViewModel(title, selection);
return (
  <GraphGroupDrawer
    testId="graph-selection-drawer"
    view={view}
    freeText={freeText}
    nodeSectionTitle="选中页面"
    onFreeTextChange={onFreeTextChange}
    onAsk={onAsk}
    onAskInNewConversation={onAskInNewConversation}
  />
);
```

The old selection-specific action row and `+邻居` button must be removed from `GraphSelection`; `+邻居` now lives in single-node summaries via `select-neighbors`.

In `workbench/web/src/components/GraphSummaryDrawer.tsx`, update imports:

```ts
import React, { useState } from "react";
import type {
  GraphCommunitySummaryPayload,
  GraphExcludedObjectPayload,
  GraphGlobalOverviewPayload,
  GraphNodeSummaryPayload,
  GraphSearchResultsPayload,
  GraphSummaryCommand,
  GraphUnavailableObjectPayload,
  SelectionAction,
} from "@llm-wiki/graph-engine";
import { GraphGroupDrawer } from "./GraphGroupDrawer";
import { graphCommunityDrawerViewModel } from "../lib/graph-group-drawer";
```

Update `CommunitySummaryProps`:

```ts
interface CommunitySummaryProps {
  payload: GraphCommunitySummaryPayload;
  freeText: string;
  onFreeTextChange: (value: string) => void;
  onAsk: (action: SelectionAction | null) => void;
  onAskInNewConversation: (action: SelectionAction | null) => void;
  onCommand: (command: GraphSummaryCommand) => void;
  onShowNodeSummary: (nodeId: string) => void;
  onPreviewNode: (nodeId: string | null) => void;
}
```

Replace `GraphCommunitySummary` with a thin wrapper:

```tsx
export function GraphCommunitySummary({
  payload,
  freeText,
  onFreeTextChange,
  onAsk,
  onAskInNewConversation,
  onCommand,
  onShowNodeSummary,
  onPreviewNode,
}: CommunitySummaryProps) {
  const view = graphCommunityDrawerViewModel(payload);
  const enterCommand = payload.commands.find((command) => command.kind === "enter-community") ?? null;
  return (
    <GraphGroupDrawer
      testId="graph-community-summary"
      view={view}
      freeText={freeText}
      enterCommand={enterCommand}
      nodeSectionTitle="核心节点"
      onFreeTextChange={onFreeTextChange}
      onAsk={onAsk}
      onAskInNewConversation={onAskInNewConversation}
      onCommand={onCommand}
      onShowNodeSummary={onShowNodeSummary}
      onPreviewNode={onPreviewNode}
    />
  );
}
```

- [ ] **Step 5: Add CSS for the unified group drawer**

In `workbench/web/src/index.css`, add these styles near the graph summary styles:

```css
.graph-group-drawer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-radius: 16px;
  border: 1px solid rgba(94, 72, 48, 0.14);
  background: var(--paper-grain), rgba(255, 252, 246, 0.94);
  box-shadow: var(--shadow-lg);
  padding: 18px;
}

.graph-group-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.graph-group-overview-main {
  min-width: 0;
}

.graph-group-enter,
.graph-group-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  border: 1px solid rgba(94, 72, 48, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.2;
  box-shadow: var(--shadow);
}

.graph-group-enter svg,
.graph-group-action svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.graph-group-enter:hover,
.graph-group-action:hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(94, 72, 48, 0.28);
}

.graph-group-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.graph-group-action[data-recommended="true"] {
  border-color: rgba(124, 92, 46, 0.42);
  background: rgba(238, 220, 184, 0.54);
}

.graph-group-node-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.graph-group-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  border: 1px solid rgba(94, 72, 48, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.52);
  padding: 9px 10px;
  color: inherit;
  text-align: left;
}

.graph-group-node span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-group-node small {
  color: var(--muted-foreground);
  font-size: 12px;
}

.graph-group-dialogue {
  display: grid;
  gap: 10px;
}
```

Add a compact media query in the existing responsive area:

```css
@media (max-width: 720px) {
  .graph-group-overview {
    grid-template-columns: minmax(0, 1fr);
  }

  .graph-group-enter {
    justify-self: start;
  }

  .graph-group-action-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 6: Run the render test**

Run:

```bash
node --import tsx --test workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit the unified drawer UI**

Run:

```bash
git add workbench/web/src/components/GraphGroupDrawer.tsx workbench/web/src/components/GraphSelection.tsx workbench/web/src/components/GraphSummaryDrawer.tsx workbench/web/src/components/RightDrawer.tsx workbench/web/src/index.css workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx
git commit -m "feat: unify graph group drawer layout"
```

Expected: commit succeeds.

---

### Task 5: `+邻居` And Sigma Shift Multi-Select

**Files:**
- Modify: `packages/graph-engine/src/types.ts`
- Modify: `packages/graph-engine/src/summary/index.ts`
- Modify: `packages/graph-engine/src/select/index.ts`
- Modify: `packages/graph-engine/src/render/sigma-hit-projector.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-types.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Modify: `packages/graph-engine/src/facade.ts`
- Modify: `workbench/web/src/App.tsx`
- Test: `packages/graph-engine/test/summary-contract.test.ts`
- Test: `packages/graph-engine/test/select.test.ts`
- Test: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Test: `packages/graph-engine/test/facade.test.ts`
- Test: `workbench/web/test/graph-summary-actions.test.ts`
- Test: `workbench/web/test/right-drawer-graph-summary.test.tsx`
- Test: `workbench/web/test/right-drawer-interactions.test.tsx`

- [ ] **Step 1: Write failing tests for node neighbor command**

In `packages/graph-engine/test/summary-contract.test.ts`, update the command expectations:

```ts
assert.deepEqual(commandKinds(node.commands), ["open-detail-read", "select-neighbors", "set-fixed-position", "enter-community"]);
```

Add this assertion in the same test:

```ts
const selectNeighbors = node.commands.find((command) => command.kind === "select-neighbors");
assert.deepEqual(selectNeighbors, {
  kind: "select-neighbors",
  nodeId: "a",
  label: "+邻居"
});
```

Update every existing command-order test that asserts node command lists:

- `packages/graph-engine/test/summary-contract.test.ts`
- `packages/graph-engine/test/facade.test.ts`, if facade summary snapshots include node commands
- `workbench/web/test/graph-summary-actions.test.ts`
- `workbench/web/test/right-drawer-graph-summary.test.tsx`
- `workbench/web/test/graph-drawer-state.test.ts`, if drawer equality or refresh tests include commands

Add a UI interaction assertion in `workbench/web/test/right-drawer-interactions.test.tsx`: render a node summary with a `select-neighbors` command, click `+邻居`, and assert the captured command has `kind: "select-neighbors"` and `nodeId` for the clicked node.

- [ ] **Step 2: Add `select-neighbors` to node summary commands**

In `packages/graph-engine/src/summary/index.ts`, update `nodeSummaryCommands`:

```ts
const commands: GraphSummaryCommand[] = [
  {
    kind: "open-detail-read",
    nodeId: node.id,
    path: wikiPathForGraphNode(node),
    label: "打开详情"
  },
  {
    kind: "select-neighbors",
    nodeId: node.id,
    label: "+邻居"
  },
  {
    kind: "set-fixed-position",
    mode: pinHint.pinned ? "unfix" : "fix",
    nodeId: node.id,
    wikiPath: wikiPathForGraphNode(node),
    label: pinHint.pinned ? "取消固定位置" : "固定位置"
  }
];
```

- [ ] **Step 3: Wire `select-neighbors` in App command handling**

In `workbench/web/src/App.tsx`, update `graphSummaryCommandSignature`:

```ts
if (command.kind === "select-neighbors") return `${command.kind}:${command.nodeId}`;
```

Add this branch to `handleGraphSummaryCommand` before `set-fixed-position`:

```ts
if (command.kind === "select-neighbors") {
  setSelectionCommand({
    id: command.nodeId,
    type: "neighbors",
  });
  return;
}
```

Add a tiny test seam if needed: extract `graphSelectionCommandForSummaryCommand(command)` into `workbench/web/src/lib/graph-summary-actions.ts` so the command mapping can be unit-tested without rendering the full app. The required assertion is:

```ts
assert.deepEqual(graphSelectionCommandForSummaryCommand({ kind: "select-neighbors", nodeId: "a", label: "+邻居" }), {
  id: "a",
  type: "neighbors"
});
```

- [ ] **Step 4: Write failing Shift toggle tests**

In `packages/graph-engine/test/select.test.ts`, import `toggleNodeInSelection`:

```ts
import { resolveSelection, resolveSelectionForCapabilities, toggleNodeInSelection } from "../src/select";
```

Add tests:

```ts
it("toggles Sigma Shift node clicks into stable manual node selections", () => {
  const data = multicommGraph();

  assert.deepEqual(toggleNodeInSelection(data, null, "a1"), { kind: "node", id: "a1" });
  assert.deepEqual(toggleNodeInSelection(data, { kind: "node", id: "a1" }, "a2"), { kind: "nodes", ids: ["a1", "a2"] });
  assert.deepEqual(toggleNodeInSelection(data, { kind: "nodes", ids: ["a1", "a2"] }, "a1"), { kind: "node", id: "a2" });
  assert.equal(toggleNodeInSelection(data, { kind: "node", id: "a1" }, "a1"), null);
});

it("toggles from a community selection without losing graph order", () => {
  const data = multicommGraph();

  assert.deepEqual(toggleNodeInSelection(data, { kind: "community", id: "alpha" }, "b1"), {
    kind: "nodes",
    ids: ["a1", "a2", "a3", "b1"]
  });
});
```

- [ ] **Step 5: Implement Shift toggle helper**

In `packages/graph-engine/src/select/index.ts`, import the `_none` constant:

```ts
  UNGROUPED_COMMUNITY_ID
```

Add this exported helper after `resolveSelectionForCapabilities`:

```ts
export function toggleNodeInSelection(
  data: GraphData,
  current: SelectionInput | null | undefined,
  nodeId: NodeId
): SelectionInput | null {
  const index = buildSelectionGraphIndex(data);
  if (!index.nodeById.has(nodeId)) return current ?? null;
  const currentIds = current ? selectionNodeIds(index, current) : [];
  const selected = new Set(currentIds);
  if (selected.has(nodeId)) {
    selected.delete(nodeId);
  } else {
    selected.add(nodeId);
  }
  const ids = index.nodes.map((node) => node.id).filter((id) => selected.has(id));
  if (ids.length === 0) return null;
  if (ids.length === 1) return { kind: "node", id: ids[0] };
  return { kind: "nodes", ids };
}
```

Update `toSelectionNode`:

```ts
community: String(node.community || UNGROUPED_COMMUNITY_ID),
```

Update `selectionFacts()` semantics if needed:

```ts
const selected = new Set(nodeIds);
const internalLinkCount = index.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)).length;
const isolatedCount = nodeIds.filter((id) => {
  const neighbors = index.neighborsById.get(id) ?? new Set<NodeId>();
  return [...neighbors].every((neighborId) => !selected.has(neighborId));
}).length;
```

Important fact semantics:

- `internalLinkCount` counts only selected-set internal links.
- `isolatedCount` counts nodes with no selected-set internal neighbor.
- A node connected only to pages outside the selected community still counts as isolated for this drawer. This keeps the drawer’s “孤立” number aligned with the selected group structure.

- [ ] **Step 6: Write failing Sigma additive event test**

In `packages/graph-engine/test/sigma-global-renderer.test.ts`, add a test near the existing click tests:

```ts
it("passes Shift-click additive context from Sigma node clicks", () => {
  const runtime = fakeRuntime();
  const hits: Array<{ target: unknown; additive: boolean }> = [];
  const renderer = createSigmaGlobalRenderer({
    container: fakeContainer(),
    adapterData: adapterDataFixture(),
    theme: "shan-shui",
    runtime,
    onHitTarget: (target, context) => hits.push({ target, additive: Boolean(context?.additive) })
  });
  const sigma = runtime.instances[0];

  sigma.emit("clickNode", { node: "render-beta", event: { shiftKey: true } });
  sigma.emit("clickNode", { node: "render-alpha", event: { shiftKey: false } });

  assert.deepEqual(hits, [
    { target: { kind: "node", id: "render-beta" }, additive: true },
    { target: { kind: "node", id: "render-alpha" }, additive: false }
  ]);

  renderer.destroy();
});
```

In `packages/graph-engine/test/facade.test.ts`, add a facade-level regression for the production hit conversion helper. The test must not call `toggleNodeInSelection()` from the test body or fake renderer; it must call the helper that production `handleSigmaHitTarget()` uses.

```ts
it("converts additive Sigma node hits into manual multi-node selections", () => {
  assert.deepEqual(selectionInputForSigmaHit(multicommGraph(), { kind: "node", id: "a1" }, { kind: "node", id: "a2" }, { additive: true }), {
    kind: "nodes",
    ids: ["a1", "a2"]
  });
  assert.deepEqual(selectionInputForSigmaHit(multicommGraph(), { kind: "nodes", ids: ["a1", "a2"] }, { kind: "node", id: "a1" }, { additive: true }), {
    kind: "node",
    id: "a2"
  });
  assert.equal(selectionInputForSigmaHit(multicommGraph(), { kind: "node", id: "a1" }, { kind: "node", id: "a1" }, { additive: true }), null);
  assert.deepEqual(selectionInputForSigmaHit(multicommGraph(), { kind: "node", id: "a1" }, { kind: "node", id: "b1" }, { additive: false }), {
    kind: "node",
    id: "b1"
  });
});
```

Production `handleSigmaHitTarget()` must call this helper. Keep the helper small and exported from `facade.ts` only if needed for tests.

- [ ] **Step 7: Pass additive context from Sigma renderer**

In `packages/graph-engine/src/render/sigma-hit-projector.ts`, update `SigmaGlobalHitInput`:

```ts
export interface SigmaGlobalHitInput {
  nodeId?: string | null;
  screenPoint?: GraphScreenPoint | null;
  renderedObject?: SigmaGlobalRenderedObject | null;
  additive?: boolean;
}
```

Add this exported helper:

```ts
export function sigmaAdditiveFromPayload(payload: unknown): boolean {
  const candidate = payload as {
    shiftKey?: unknown;
    event?: { shiftKey?: unknown; original?: { shiftKey?: unknown }; originalEvent?: { shiftKey?: unknown } };
    originalEvent?: { shiftKey?: unknown };
  } | null;
  return candidate?.shiftKey === true
    || candidate?.event?.shiftKey === true
    || candidate?.event?.original?.shiftKey === true
    || candidate?.event?.originalEvent?.shiftKey === true
    || candidate?.originalEvent?.shiftKey === true;
}
```

In `packages/graph-engine/src/render/sigma-global-types.ts`, add:

```ts
export interface SigmaGlobalHitContext {
  additive: boolean;
}
```

Update the renderer option:

```ts
onHitTarget?: (target: GraphGestureTarget, context: SigmaGlobalHitContext) => void;
```

In `packages/graph-engine/src/render/sigma-global-renderer.ts`, import `sigmaAdditiveFromPayload` and update click handlers:

```ts
const nodeClick = (payload?: unknown): void => {
  const nodeId = sigmaNodeIdFromPayload(payload);
  if (consumeSuppressedNodeClick(nodeId)) return;
  handleSigmaHit({ nodeId, additive: sigmaAdditiveFromPayload(payload) });
};
const stageClick = (payload?: unknown): void => handleSigmaHit({
  screenPoint: sigmaScreenPointFromPayload(payload),
  additive: sigmaAdditiveFromPayload(payload)
});
```

Update `handleSigmaHit`:

```ts
options.onHitTarget?.(target, { additive: Boolean(input.additive) });
```

- [ ] **Step 8: Convert additive Sigma hits into multi-select**

In `packages/graph-engine/src/facade.ts`, import:

```ts
  toggleNodeInSelection,
```

Import the context type:

```ts
import type { SigmaGlobalHitContext } from "./render/sigma-global-types";
```

Add the production helper near the Sigma route code:

```ts
export function selectionInputForSigmaHit(
  data: GraphData,
  current: SelectionInput | null | undefined,
  target: GraphGestureTarget,
  context: SigmaGlobalHitContext
): SelectionInput | null {
  if (target.kind === "node") {
    if (!target.id) return current ?? null;
    return context.additive
      ? toggleNodeInSelection(data, current, target.id)
      : { kind: "node", id: target.id };
  }
  if (target.kind === "community-wash") return target.id ? { kind: "community", id: target.id } : null;
  if (target.kind === "aggregation-container") return target.communityId ? { kind: "community", id: target.communityId } : null;
  return null;
}
```

Update the handler signature and node branch:

```ts
function handleSigmaHitTarget(target: GraphGestureTarget, context: SigmaGlobalHitContext): void {
  const nextSelection = selectionInputForSigmaHit(options.data, options.selection, target, context);
  if (nextSelection) {
    selectOnSigma(nextSelection);
    return;
  }
  if (context.additive && target.kind === "node") {
    input.options.callbacks.onSelectionClearRequested?.();
    updateSigmaSelection(null);
    return;
  }
  switch (target.kind) {
```

Important: this helper must read the current route selection from `options.selection`. If the facade test shows stale selection after the first additive click, update the facade route state before calling renderer updates so the next Shift click toggles against the latest selection.

- [ ] **Step 9: Run targeted graph-engine tests**

Run:

```bash
node --import tsx --test packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/select.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts packages/graph-engine/test/facade.test.ts
```

Expected: pass.

- [ ] **Step 9b: Run targeted workbench command/UI tests**

Run:

```bash
node --import tsx --test workbench/web/test/graph-summary-actions.test.ts workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-interactions.test.tsx
```

Expected: pass, including the explicit `+邻居` click-to-`neighbors` assertion.

- [ ] **Step 10: Commit selection entries**

Run:

```bash
git add packages/graph-engine/src/types.ts packages/graph-engine/src/summary/index.ts packages/graph-engine/src/select/index.ts packages/graph-engine/src/render/sigma-hit-projector.ts packages/graph-engine/src/render/sigma-global-types.ts packages/graph-engine/src/render/sigma-global-renderer.ts packages/graph-engine/src/facade.ts packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/select.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts packages/graph-engine/test/facade.test.ts workbench/web/src/App.tsx workbench/web/test/graph-summary-actions.test.ts workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-interactions.test.tsx
git commit -m "fix: restore graph selection entry points"
```

Expected: commit succeeds.

---

### Task 6: Full Verification, Browser QA, And Release Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Run graph-engine test suite**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
```

Expected: all graph-engine tests pass.

- [ ] **Step 2: Run targeted web tests**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts workbench/web/test/graph-summary-actions.test.ts workbench/web/test/graph-selection.test.ts workbench/web/test/graph-drawer-close.test.ts workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx workbench/web/test/right-drawer-interactions.test.tsx workbench/web/test/graph-drawer-state.test.ts
```

Expected: all targeted web tests pass.

- [ ] **Step 3: Run full web test, lint, and typecheck**

Run:

```bash
npm run test -w @llm-wiki-agent/web
npm run lint -w @llm-wiki-agent/web
npm run typecheck
```

Expected: all commands exit with code 0.

- [ ] **Step 3b: Run offline HTML and production Sigma regressions**

Run:

```bash
tests/graph-offline-phase-6.regression-1.sh
tests/graph-html-insights.regression-1.sh
tests/graph-sigma-global-production.regression-1.sh
```

Expected: all commands exit with code 0. This is mandatory because ADR-21 says the same `@llm-wiki/graph-engine` powers both the workbench and generated offline HTML.

- [ ] **Step 4: Update changelog**

Add this at the top of `CHANGELOG.md`:

```md
## v3.6.16 (2026-06-28)

### 改进

- 工作台图谱社区抽屉统一：普通社区和“未分组”现在使用同一套概览、固定动作、核心节点和对话入口；“进入社区”移到顶部，未分组默认推荐探索潜在关系。

### 修复

- 修复 Sigma 全局图迁移后遗留的选择入口缺口：单节点摘要恢复“+邻居”，Shift+点击节点恢复多选。
```

- [ ] **Step 5: Update README feature copy**

Change the version badge in `README.md`:

```md
[![version](https://img.shields.io/badge/v3.6.16-社区抽屉统一-E8D5B5?style=flat-square&labelColor=3a3026&color=E8D5B5)](https://github.com/sdyckjq-lab/llm-wiki-skill/releases)
```

Update the preview sentence:

```md
东方编辑部 × 数字山水风交互式知识图谱 — 双击 HTML 文件即可在浏览器中探索。搜索、社区图例、聚焦筛选、节点视觉分层、社区轻量地图、统一社区抽屉、悬停预览、轻量摘要、明确进入阅读、Shift 多选、画布缩放拖拽和小地图定位，全部离线运行，不依赖服务器。
```

Update the “本地阅读动线” row:

```md
| 🎓 | **本地阅读动线** | 社区图例、聚焦筛选、图谱搜索、右侧摘要/阅读抽屉和选区抽屉保持联动；普通社区和未分组使用统一社区抽屉，社区先摘要再进入聚焦 |
```

Add this item in the full feature list after “大图谱全局路线”:

```md
- **统一社区抽屉** — 普通社区和“未分组”使用同一套概览、固定动作、核心节点和对话入口；“进入社区”放在顶部，未分组默认推荐探索潜在关系
```

- [ ] **Step 6: Run docs sanity checks**

Run:

```bash
bash install.sh --dry-run --platform codex
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
```

Expected: dry run succeeds; grep prints no matches.

- [ ] **Step 7: Run browser QA**

Start the app:

```bash
npm run dev
```

Expected: server starts with backend on `8787` and frontend on `5180`. Keep the session open for browser validation.

In Chrome at `http://localhost:5180/`, validate:

```md
1. Open the graph tab.
2. Click a normal community. The right drawer shows the same v3 structure as the reference image, with “进入社区” at the top.
3. Click “进入社区”. The app enters the community reading view.
4. Return to the global graph.
5. Click “未分组”. The right drawer keeps the same structure, does not show “进入社区”, and highlights “探索潜在关系”.
6. Click a normal community and then “未分组”. The drawer changes content and recommendation only; it does not switch into the old selection panel.
7. Click a single node. The node summary contains “+邻居”.
8. Click “+邻居”. The drawer opens a multi-page selection containing the node and one-hop neighbors.
9. Shift+click two nodes in the Sigma global graph. The drawer opens a multi-node selection.
10. Type a short note in the community drawer and click “发送”. The chat view receives a compact selection mention rather than a long pasted structure block.
```

Also validate the offline artifact:

```md
1. Build a fixture HTML with `bash scripts/build-graph-html.sh tests/fixtures/graph-interactive-multicomm`.
2. Open the generated `wiki/knowledge-graph.html`.
3. Confirm the graph loads through the IIFE engine and still shows the selection hint.
4. Shift+click behavior and community/ungrouped behavior must not regress in offline mode; if offline mode lacks chat capabilities, it should degrade to visible selection facts rather than a broken drawer.
```

Stop the dev server after validation.

- [ ] **Step 8: Commit docs and verification updates**

Run:

```bash
git add CHANGELOG.md README.md
git commit -m "docs: describe unified community drawer"
```

Expected: commit succeeds.

- [ ] **Step 9: Final branch status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -6
```

Expected: branch is `codex/unified-community-drawer-design`; working tree is clean; recent commits show the implementation, tests, and docs commits.

---

## Self-Review

**Spec coverage:** The plan covers `_none` as a virtual community, unified normal/ungrouped community drawer, top “进入社区”, fixed action area, “探索潜在关系” recommendation rules, compact core nodes, community dialogue flow, single-node “+邻居”, Sigma Shift multi-select, tests, browser validation, and release docs.

**Placeholder scan:** The plan avoids deferred work markers and gives concrete file paths, snippets, commands, and expected outcomes for each step.

**Type consistency:** New fields are introduced in `GraphCommunitySummaryPayload` before frontend code uses them. `select-neighbors` is added to `GraphSummaryCommand` before `App.tsx` handles it. Community fixed action IDs use existing `SelectionActionId` values.

---

## What Already Exists

- `SelectionFacts` already exists in `packages/graph-engine/src/types.ts` and is computed by `selectionFacts()` in `packages/graph-engine/src/select/index.ts`. Reuse it for community summary facts instead of creating a second page/link/island counting algorithm.
- `SelectionInput` already supports `{ kind: "neighbors" }` and `{ kind: "nodes" }`. This plan restores missing Sigma entry points instead of inventing a new selection model.
- `GraphSelection` already owns the textarea and agent prompt flow. The new `GraphGroupDrawer` must reuse the same prompt payload path through `buildSelectionPromptPayload()`.
- `GraphSummaryCommand` already drives node/community summary actions. `+邻居` belongs there as a `select-neighbors` command, not as a special button hidden inside the old selection drawer.
- `createGraphEngine()` is shared by the workbench ESM host and offline HTML IIFE host. The verification plan therefore includes both workbench tests and offline HTML regressions.
- The existing Sigma renderer already has a hit pipeline: Sigma event -> hit projector -> facade selection callback. Shift/additive context should travel through that pipeline, not bypass it in React.

## NOT In Scope

- Freeform lasso selection is not included. ADR-21 explicitly chose structured selection over spatial lasso because spatial closeness is not semantic closeness.
- Rebuilding community detection or changing graph data generation is not included. `_none` is a UI/selection virtual community over existing nodes, not a new persisted community in wiki data.
- Redesigning node summary, search result summary, or graph reader content is not included. Only the community and multi-node/neighbor selection group drawer is unified.
- Reworking the offline HTML into a full chat host is not included. Offline mode should preserve graph selection facts and not break; agent dialogue remains a workbench capability.
- New backend APIs are not included. The plan continues to use the current `/api/prompt` text-channel behavior through existing prompt payload construction.

## Review Findings

### Architecture Review

1. `[P1] (confidence: 9/10) packages/graph-engine/src/summary/index.ts:72-80 — summary layer does not recognize the `_none` virtual community.`
   Evidence: `summarizeGraphCommunity()` calls `nodesForCommunity(data, communityId)`, then returns unavailable when no real community record exists. `nodesForCommunity()` currently matches `node.community === communityId`, while ungrouped nodes have `community: null`.
   Decision: accepted. Task 1 makes `_none` a first-class virtual summary and routes facts through `SelectionFacts`.

2. `[P1] (confidence: 9/10) workbench/web/src/components/GraphSelection.tsx:29-61 and workbench/web/src/components/GraphSummaryDrawer.tsx:56-110 — community and selection drawers are separate structures.`
   Evidence: `GraphSelection` renders `graph-selection-drawer` with its own action row, while `GraphCommunitySummary` renders `graph-summary-drawer` with search hits, fixed nodes, and bridge relation sections.
   Decision: accepted. Tasks 2 and 4 introduce one shared `GraphGroupDrawer` skeleton for community, multi-node selection, and neighbor selection.

3. `[P1] (confidence: 9/10) packages/graph-engine/src/render/sigma-global-renderer.ts:321-326 and packages/graph-engine/src/facade.ts:984-1009 — Sigma clicks lose Shift/additive intent before selection resolution.`
   Evidence: `nodeClick` only passes `{ nodeId }`; `handleSigmaHitTarget()` only selects `{ kind: "node" }` or `{ kind: "community" }`.
   Decision: accepted. Task 5 carries additive click context through Sigma renderer, facade, and selection helper tests.

### Code Quality Review

1. `[P1] (confidence: 9/10) packages/graph-engine/src/select/index.ts:177-182 and workbench/web/src/lib/graph-selection.ts:66-84 — `_none` is hardcoded in multiple layers.`
   Evidence: selection maps `node.community || "_none"` and prompt formatting prints `"_none"` when no label exists.
   Decision: accepted. Tasks 1 and 3 export engine constants and use them in workbench prompt formatting.

2. `[P2] (confidence: 8/10) workbench/web/src/App.tsx:638-649 — closing community summary does not clear graph selection/highlight.`
   Evidence: close handling clears only `graph-reader` and `graph-selection`, while community clicks now also create selected/highlighted graph state.
   Decision: accepted. Task 3 extracts `graphCloseCommandForDrawer()` and includes community drawers in close-to-clear behavior.

3. `[P2] (confidence: 8/10) workbench/web/src/components/GraphSelection.tsx:39-48 — old `+邻居` lives in the selection drawer, not the node summary command model.`
   Evidence: `GraphSelection` owns a neighbor button whose availability depends on `selection.nodeIds.length === 1`, but the issue asks for a single-node graph entry after the Sigma migration.
   Decision: accepted. Task 5 moves `+邻居` to node summary commands and tests the UI click.

### Test Review

The plan now treats missing tests as blockers, not follow-up polish.

```text
CODE PATHS                                                   USER FLOWS
[+] _none community summary                                  [+] Click "未分组" in Sigma global graph
  ├── [GAP -> Task 1] null community -> _none nodes              ├── [GAP -> Task 3/4] opens same group drawer structure
  ├── [GAP -> Task 1] linked ungrouped facts                     └── [GAP -> Task 4/6] recommends 探索潜在关系, no 进入社区
  └── [GAP -> Task 1] no enter-community command

[+] Shared group drawer model/UI                              [+] Click normal community
  ├── [GAP -> Task 2] normal community actions/order             ├── [GAP -> Task 4/6] sees top 进入社区
  ├── [GAP -> Task 2] ungrouped recommendation                   ├── [GAP -> Task 4/6] enters community through explicit button
  ├── [GAP -> Task 2] selection uses same skeleton                └── [GAP -> Task 4/6] switching normal <-> 未分组 does not change mental model
  └── [GAP -> Task 4] render tests for community + selection

[+] Prompt/close state                                         [+] Ask agent from community drawer
  ├── [GAP -> Task 3] preserve community free text                ├── [GAP -> Task 3/6] sends compact selection mention
  ├── [GAP -> Task 3] prompt uses 未分组 label                     └── [GAP -> Task 3] clears graph selection after send
  └── [GAP -> Task 3] close clears community highlight

[+] +邻居 command                                              [+] Click a node then +邻居
  ├── [GAP -> Task 5] command exists in summary contract          ├── [GAP -> Task 5] UI dispatches neighbors command
  ├── [GAP -> Task 5] App maps command to neighbors               └── [GAP -> Task 5/6] drawer shows one-hop neighbor selection
  └── [GAP -> Task 5] all command-order tests updated

[+] Sigma Shift multi-select                                   [+] Shift+click two nodes
  ├── [GAP -> Task 5] renderer extracts additive context          ├── [GAP -> Task 5] facade creates nodes selection
  ├── [GAP -> Task 5] toggle helper handles add/remove/clear      ├── [GAP -> Task 5/6] drawer opens shared selection drawer
  └── [GAP -> Task 6] production Sigma regression runs            └── [GAP -> Task 6] offline HTML does not regress

COVERAGE TARGET: all listed gaps must be covered by the task that names them.
QUALITY TARGET: unit tests for pure logic, render tests for drawer markup, route/facade tests for Sigma boundary, browser QA for end-to-end confidence.
```

### Performance Review

1. `[P2] (confidence: 8/10) packages/graph-engine/src/select/index.ts:115-153 — repeated selection fact calculation can scan all nodes/edges on every click.`
   Evidence: `buildSelectionGraphIndex()` maps all nodes and edges, and `selectionFacts()` filters all edges for selected internal links.
   Decision: accepted as acceptable for current scope because this path already exists and Task 5 only reuses it. Verification must run `tests/graph-sigma-global-production.regression-1.sh` to catch real-path regressions.

2. `[P3] (confidence: 7/10) GraphGroupDrawer node display could accidentally render huge lists if future code passes every selected node.`
   Evidence: the plan limits display through `slice(0, 3)` in the view model snippets.
   Decision: accepted. Keep the compact node preview in the view model and avoid rendering full community member lists in the first viewport.

### Outside Voice Review

Codex outside voice returned 12 findings. The review did not introduce a competing direction; it reinforced the complete implementation path and was folded into the plan as concrete test and sequencing requirements.

| Outside voice concern | Plan response |
|-----------------------|---------------|
| `_none` cannot stop at summary payloads; it must be clickable, selectable, highlighted, and visible in render model, adapter data, legend, and offline HTML. | Task 1 now includes render model, adapter, legend, offline reader, and browser offline regression checks. |
| Offline HTML is a separate no-chat host, not a React drawer host. | Task 1 and Task 6 explicitly require offline selection facts to keep working without workbench chat actions. |
| `SelectionFacts` semantics must be internal to the selected set. | Review-locked decision 9 and Task 5 define `internalLinkCount` and `isolatedCount` in selected-set terms. |
| Sigma Shift tests must exercise the production facade path, not fake the behavior in a test renderer. | Task 5 requires `selectionInputForSigmaHit()` facade tests and forbids calling `toggleNodeInSelection()` from the fake renderer test. |
| Browser QA needs a named knowledge base or fixture that covers normal community, ungrouped nodes, linked/isolated ungrouped nodes, neighbor expansion, and visible Sigma nodes. | Task 0 requires naming or creating that fixture before browser QA, and Task 6 requires reporting it. |
| “发送” and “新对话” cannot collapse into the same behavior. | Review-locked decision 10 preserves free-text-only send and default/recommended-action new conversation behavior. |
| Close button and Escape can use different commands internally, but the visual result must be identical. | Review-locked decision 11 and Task 3 require close-to-clear tests for community and selection drawers. |
| Older context-specific actions should not reappear as first-screen drawer actions. | Review-locked decision 8 keeps the first screen to the four fixed group actions. |
| `+邻居` must update all command-order and UI-click tests that observe node summary commands. | Review-locked decision 6 and Task 5 list every affected graph-engine and workbench test family. |
| Production Sigma performance and offline HTML can regress even when unit tests pass. | Task 6 requires `tests/graph-sigma-global-production.regression-1.sh` and both offline HTML regressions. |
| Community and selection drawers can drift again if only the visual component is shared. | Task 2 requires a shared view model and Task 4 requires a shared `data-group-drawer` render assertion. |
| Implementation can drift if the plan leaves old file names or old test names around. | The final review scan removes legacy drawer names, old payload field names, and stale removed task references. |

Cross-model tension: none. The outside voice agreed with the full-scope option the user selected and only pushed for stricter coverage and host-boundary clarity.

## Failure Modes

| Codepath | Realistic failure | Test/handling required | User impact if missed |
|----------|-------------------|------------------------|-----------------------|
| `_none` summary | Ungrouped nodes still fall through to unavailable summary | Task 1 `_none` summary tests and Task 3 drawer routing test | User sees old selection drawer or unavailable state |
| Linked `_none` facts | Internal links or isolated counts are wrong | Task 1 linked ungrouped fixture | Drawer recommends the wrong action |
| Shared drawer view model | Community and selection drift into two structures again | Task 2 shared view-model tests and Task 4 shared `data-group-drawer` render assertion | User sees different layouts for similar group selections |
| Community free text | Refreshing same drawer clears typed note | Task 3 preservation test | User loses typed intent |
| Prompt formatting | Prompt exposes `_none` instead of “未分组” | Task 3 prompt test | Agent context looks technical and confusing |
| Community close | Drawer closes but graph stays highlighted | Task 3 close behavior test | User thinks old selection is still active |
| `+邻居` command | Node summary renders button but click does nothing | Task 5 UI click test and App command mapping test | User cannot expand from a node |
| Sigma additive context | Shift key is dropped by renderer payload shape | Task 5 renderer test with multiple payload shapes | Shift+click behaves like normal click |
| Facade toggle state | Second Shift+click toggles against stale selection | Task 5 facade route regression | Multi-select feels random |
| Offline HTML | IIFE host breaks after engine contract changes | Task 6 offline regressions | Generated graph HTML regresses outside workbench |
| Production Sigma path | Unit tests pass but live canvas path regresses | Task 6 Sigma production regression | Large graph browsing regresses |

No silent critical gap remains after the accepted Task 1-6 updates: each user-visible failure has a named unit, render, route, regression, or browser QA check.

## Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Task 1: `_none` summary contract | `packages/graph-engine/src`, `packages/graph-engine/test` | — |
| Task 2: shared drawer view model | `workbench/web/src/lib`, `workbench/web/test` | Task 1 types |
| Task 3: drawer state and prompt flow | `workbench/web/src/lib`, `workbench/web/src/App.tsx` | Task 1, Task 2 action model |
| Task 4: unified drawer UI | `workbench/web/src/components`, `workbench/web/src/index.css`, `workbench/web/test` | Task 2, Task 3 state |
| Task 5: `+邻居` and Shift multi-select | `packages/graph-engine/src`, `workbench/web/src/App.tsx`, tests | Task 1 constants/types |
| Task 6: verification and docs | `README.md`, `CHANGELOG.md`, browser regressions | Tasks 1-5 |

Parallel lanes:

- Lane A: Task 1 -> Task 5 engine/facade pieces. Shared graph-engine modules, run sequentially inside this lane.
- Lane B: Task 2 -> Task 3 -> Task 4 workbench drawer pieces. Depends on Task 1 type contract before final typecheck.
- Lane C: Task 6 docs and verification. Starts only after A + B merge.

Execution order:

1. Start Lane A Task 1 first because it defines the engine contract.
2. After Task 1 passes, Lane A can continue Task 5 while Lane B starts Task 2.
3. Merge A + B, then run Task 6.

Conflict flags:

- Task 3 and Task 5 both touch `workbench/web/src/App.tsx`; coordinate or do them sequentially near merge time.
- Task 1 and Task 5 both touch `packages/graph-engine/src/types.ts` and `summary/index.ts`; do Task 1 first, then Task 5.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — engine summary — Make `_none` a real virtual community summary.
  - Surfaced by: Architecture Review finding 1.
  - Files: `packages/graph-engine/src/types.ts`, `packages/graph-engine/src/summary/index.ts`, `packages/graph-engine/src/select/index.ts`, `packages/graph-engine/src/render/model.ts`, `packages/graph-engine/src/render/adapter.ts`, `packages/graph-engine/src/render/legend.ts`, `packages/graph-engine/src/render/offline-reader.ts`, `packages/graph-engine/test/summary-contract.test.ts`, `packages/graph-engine/test/render-model.test.ts`, `packages/graph-engine/test/renderer-adapter-contract.test.ts`, `packages/graph-engine/test/legend.test.ts`, `tests/browser/graph-html-insights.mjs`.
  - Verify: `node --import tsx --test packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/render-model.test.ts packages/graph-engine/test/renderer-adapter-contract.test.ts packages/graph-engine/test/legend.test.ts` and `tests/graph-html-insights.regression-1.sh`.

- [ ] **T2 (P1, human: ~2h / CC: ~25min)** — workbench drawer — Build one shared group drawer skeleton for communities and selections.
  - Surfaced by: Architecture Review finding 2.
  - Files: `workbench/web/src/lib/graph-group-drawer.ts`, `workbench/web/src/components/GraphGroupDrawer.tsx`, `workbench/web/src/components/GraphSelection.tsx`, `workbench/web/src/components/GraphSummaryDrawer.tsx`, `workbench/web/src/components/RightDrawer.tsx`, `workbench/web/src/index.css`.
  - Verify: `node --import tsx --test workbench/web/test/graph-group-drawer.test.ts workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx`.

- [ ] **T3 (P1, human: ~90min / CC: ~20min)** — prompt and drawer state — Route community asks through the existing selection prompt pipeline.
  - Surfaced by: Code Quality Review findings 1 and 2.
  - Files: `workbench/web/src/lib/drawer-state.ts`, `workbench/web/src/lib/graph-selection.ts`, `workbench/web/src/lib/graph-summary-actions.ts`, `workbench/web/src/lib/graph-drawer-close.ts`, `workbench/web/src/App.tsx`.
  - Verify: `node --import tsx --test workbench/web/test/graph-summary-actions.test.ts workbench/web/test/graph-selection.test.ts workbench/web/test/graph-drawer-close.test.ts`.

- [ ] **T4 (P1, human: ~2h / CC: ~25min)** — selection entry points — Restore node `+邻居` and Sigma Shift multi-select.
  - Surfaced by: Architecture Review finding 3 and Code Quality Review finding 3.
  - Files: `packages/graph-engine/src/types.ts`, `packages/graph-engine/src/summary/index.ts`, `packages/graph-engine/src/select/index.ts`, `packages/graph-engine/src/render/sigma-hit-projector.ts`, `packages/graph-engine/src/render/sigma-global-types.ts`, `packages/graph-engine/src/render/sigma-global-renderer.ts`, `packages/graph-engine/src/facade.ts`, `workbench/web/src/App.tsx`.
  - Verify: `node --import tsx --test packages/graph-engine/test/summary-contract.test.ts packages/graph-engine/test/select.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts packages/graph-engine/test/facade.test.ts workbench/web/test/right-drawer-interactions.test.tsx`.

- [ ] **T5 (P1, human: ~2h / CC: ~30min)** — final verification — Run full tests, offline HTML, production Sigma, and browser QA.
  - Surfaced by: Test Review and Performance Review.
  - Files: `CHANGELOG.md`, `README.md`, generated local test artifacts only.
  - Verify: all commands in Task 6, plus Chrome validation at `http://localhost:5180/`.

## Review Completion Summary

- Step 0 Scope Challenge: scope accepted as the complete branch, not split or reduced.
- Architecture Review: 3 issues found, all folded into Tasks 1, 2, and 5.
- Code Quality Review: 3 issues found, all folded into Tasks 1, 3, and 5.
- Test Review: coverage diagram produced, 5 coverage groups hardened with required tests and regressions.
- Performance Review: 2 issues found, both handled through bounded rendering and production Sigma regression.
- Outside Voice: Codex plan review ran and returned 12 findings; no cross-model tension remained after the accepted updates.
- NOT In Scope: written.
- What Already Exists: written.
- TODOS.md updates: 0 items proposed; no follow-up TODO is needed because the complete scope is in this branch.
- Failure modes: 0 critical silent gaps remain.
- Parallelization: 3 lanes, 2 useful implementation lanes after Task 1, final verification sequential.
- Lake Score: 8/8 review recommendations chose the complete option.
- Pass 2 (2026-06-29): multi-perspective review via 4 parallel subagents (code-fact verification, architecture, product/coherence, tests). Three lenses converged on one core issue — a `recommendEnterCommunity` signal added after pass 1 pointed the wrong way (recommended entering the community view precisely for sparse `loose` communities, where the view has least value, per ADR-26 §2). Removed it (revert `9aee7be`); “进入社区” is now neutral for all enterable communities. Secondary findings locked as decisions 12-17.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run for this plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 12 outside-voice findings, all absorbed or explicitly rejected as not first-screen scope |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | clean (pass 1) → issues_resolved (pass 2) | Pass 1: 13 issues/test groups, 0 critical. Pass 2 (2026-06-29, multi-perspective via 4 subagents): caught drift added after pass 1 — removed a directionally-wrong `recommendEnterCommunity` signal and locked 6 follow-ups (decisions 12-17) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Visual reference already included; full design review can run before UI implementation if desired |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not needed for this feature plan |

- **CODEX:** Outside voice reinforced full `_none`, offline HTML, Shift path, and QA-fixture coverage.
- **CROSS-MODEL:** No tension. Both reviews point to one shared drawer skeleton, engine-owned `_none`, and production Sigma/offline regressions.
- **VERDICT:** ENG CLEARED — ready to implement from Task 0 through Task 6. Pass 2 reverted the flawed `recommendEnterCommunity` addition and locked decisions 12-17; no outstanding architectural question remains.
NO UNRESOLVED DECISIONS
