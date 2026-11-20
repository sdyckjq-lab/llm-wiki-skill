# PR82 Drawer Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore only the three low-interruption PR82 drawer regressions: community core-node `查看全部 / 收起`, core-node hover/focus feedback while preserving click-to-summary, and community/selection dialogue hints. Also apply the approved send/new-chat visual polish without restoring search/fixed/bridge detail blocks, selected-page expansion, or node/page detail changes.

**Architecture:** Keep the existing shared `GraphGroupDrawer` skeleton. Move core-node truncation out of the community view model so the component can own expand/collapse state for `payload.coreNodes`, add stable node-list metadata to reset that state, and update drawer markup/CSS without touching graph data, selection generation, prompt payloads, node detail drawers, search, community reading, or graph layout.

**Tech Stack:** React 19, TypeScript, lucide-react icons, CSS in `workbench/web/src/index.css`, Node built-in `node --test`, jsdom + Testing Library for DOM tests.

---

## File Structure

- Modify: `workbench/web/src/lib/graph-group-drawer.ts`
  - Owns the drawer view model.
  - Must preserve the full `payload.coreNodes` list already supplied by the graph summary layer and add `nodeListExpandable` / `nodeListKey`.
  - Must keep selection drawer node list capped at 3.

- Modify: `workbench/web/src/components/GraphGroupDrawer.tsx`
  - Owns the new expand/collapse UI and dialogue hint.
  - Already owns node preview/click hooks and send/new-chat icon markup; preserve those paths instead of rebuilding them.
  - Must not alter prompt dispatch behavior.

- Modify: `workbench/web/src/index.css`
  - Owns approved drawer visual treatment.
  - Must use existing theme variables only. New drawer color changes should use existing variables and `color-mix`, not new literal hex/rgb/rgba colors.

- Modify: `workbench/web/test/graph-group-drawer.test.ts`
  - Unit coverage for the full `payload.coreNodes` list, expandable metadata, and capped selection nodes.

- Modify: `workbench/web/test/right-drawer-graph-summary.test.tsx`
  - Static rendering and CSS-contract coverage for community drawer hints, no unwanted sections, icons, and visual style hooks.

- Modify: `workbench/web/test/right-drawer-graph-selection.test.tsx`
  - Static rendering coverage for selection hint and no selection-page expand link.

- Modify: `workbench/web/test/right-drawer-interactions.test.tsx`
  - DOM interaction coverage for view-all/collapse, reset on drawer identity change, and node click preservation.

---

## Review-Locked Boundaries

This plan is a recovery and polish pass, not a new drawer redesign.

Do:

- Restore community core-node `查看全部 / 收起`.
- Restore visible hover/focus feedback for core-node rows while preserving the existing preview and click callbacks.
- Add the low-noise dialogue hint for community/ungrouped and selection drawers.
- Keep the existing `Send` / `MessageSquarePlus` icons and tune the footer styles so the two buttons are visually balanced.

Do not:

- Add search-hit detail blocks back into the community drawer first screen.
- Add fixed-node detail blocks back into the community drawer first screen.
- Add bridge-relation lists back into the community drawer first screen.
- Add a selected-pages `查看全部` interaction to selection drawers.
- Touch node/page detail drawers, global search, community reader, graph layout, graph colors, graph edge rendering, selection generation, or prompt payload construction.

## What Already Exists

- `GraphGroupDrawer` already shares the community and selection drawer skeleton.
- `GraphGroupDrawer` already imports and renders `Send` and `MessageSquarePlus`; this work preserves that icon path and adjusts the surrounding visual treatment.
- Core-node rows already call `onPreviewNode` on mouse/focus events and `onShowNodeSummary` on click. The missing piece is visible feedback plus tests that lock the existing behavior.
- Community core-node clicks flow through `RightDrawer` -> `onGraphSummaryNodeSelect` -> `App.handleGraphSummaryNodeSelect` -> `drawerForGraphSummaryNode()`. They are not `GraphSummaryCommand`s.
- Selection drawers intentionally do not receive `onShowNodeSummary` / `onPreviewNode`; this plan keeps selection node rows capped and non-expandable.
- Node summary drawers still own node-specific search hit, fixed-position, and bridge-relation information. This plan does not remove those existing detail surfaces.

## Execution Map

```text
Community summary payload
  -> graphCommunityDrawerViewModel()
       keeps all payload.coreNodes
       adds nodeListExpandable=true
       adds nodeListKey=community:<id>:<coreNodeIds>
  -> GraphCommunitySummary
  -> GraphGroupDrawer
       default visible nodes = first 3
       if >3: show 查看全部 / 收起
       hover/focus: existing onPreviewNode(nodeId/null)
       click: existing onShowNodeSummary(nodeId)
       hint: 当前社区会带入对话

Selection payload
  -> graphSelectionGroupDrawerViewModel()
       keeps nodes capped at 3
       adds nodeListExpandable=false
       adds nodeListKey=selection:<id>
  -> GraphSelection
  -> GraphGroupDrawer
       no 查看全部 / 收起
       no node-summary click restoration
       hint: 当前选区会带入对话
```

## Test Coverage Map

```text
CODE PATHS                                      USER FLOWS
[+] community view model                        [+] click normal community
  -> full payload.coreNodes retained               -> first 3 core nodes visible
  -> stats still show total core count             -> 查看全部 reveals all nodes
  -> nodeListKey resets component state            -> 收起 returns to first 3

[+] selection view model                         [+] Shift multi-select / neighbor selection
  -> selected nodes still capped at 3              -> same drawer skeleton
  -> nodeListExpandable=false                      -> no selected-page expand control

[+] GraphGroupDrawer interactions                [+] inspect core node
  -> toggle expands/collapses                      -> hover/focus gives visual feedback
  -> target change resets expanded state           -> graph preview still fires
  -> click calls onGraphSummaryNodeSelect path     -> click opens node summary

[+] dialogue footer                              [+] ask agent from drawer
  -> community hint rendered                       -> current community goes into prompt
  -> selection hint rendered                       -> current selection goes into prompt
  -> send/new-conversation handlers unchanged      -> existing dispatch behavior preserved
```

## Failure Modes To Guard

- View model keeps slicing community nodes, so the component never knows the hidden nodes exist.
- Expand state leaks from one community or refreshed core-node list to another because it resets from title text or community id alone instead of stable `nodeListKey`.
- Node rows look clickable but no longer fire preview or node-summary selection callbacks.
- Selection drawers accidentally inherit community expansion and create a new “selected pages view all” feature.
- Footer polish changes the send/new-conversation handler behavior or disables the empty-new-conversation recommended action path.

---

### Task 1: Update View Model Contract

**Files:**
- Modify: `workbench/web/src/lib/graph-group-drawer.ts`
- Test: `workbench/web/test/graph-group-drawer.test.ts`

- [ ] **Step 1: Write failing unit tests for full payload core nodes and node-list metadata**

In `workbench/web/test/graph-group-drawer.test.ts`, update the normal community test fixture to have four `payload.coreNodes` and add assertions for full payload nodes, expandability, and stable key:

```ts
it("keeps normal community actions stable and enter-community available", () => {
	const view = graphCommunityDrawerViewModel(summaryFixture({
		coreNodeIds: ["a", "b", "c", "d"],
		coreNodes: [
			{ nodeId: "a", label: "Alpha", type: "topic", role: "核心" },
			{ nodeId: "b", label: "Beta", type: "entity", role: "相关" },
			{ nodeId: "c", label: "Gamma", type: "source", role: "相关" },
			{ nodeId: "d", label: "Delta", type: "entity", role: "相关" },
		],
	}));

	assert.equal(view.kicker, "社区");
	assert.equal(view.title, "Knowledge Build");
	assert.equal(view.canEnterCommunity, true);
	assert.equal(view.recommendedActionId, "summarize_cluster");
	assert.equal(view.nodeListExpandable, true);
	assert.equal(view.nodeListKey, "community:build:a,b,c,d");
	assert.deepEqual(view.facts, [
		{ label: "页", value: 6 },
		{ label: "链接", value: 5 },
		{ label: "核心", value: 4 },
		{ label: "孤立", value: 0 }
	]);
	assert.deepEqual(view.nodes.map((node) => node.nodeId), ["a", "b", "c", "d"]);
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
```

In the manual selection test, assert selection drawers are not expandable and still cap nodes at 3:

```ts
it("uses the same skeleton for manual multi-node selections", () => {
	const view = graphSelectionGroupDrawerViewModel("选区", selectionFixture({
		id: "nodes:a,b,c,d",
		nodeIds: ["a", "b", "c", "d"],
	}));

	assert.equal(view.kicker, "选区");
	assert.equal(view.title, "选区");
	assert.equal(view.canEnterCommunity, false);
	assert.equal(view.recommendedActionId, "explore_potential_links");
	assert.equal(view.nodeListExpandable, false);
	assert.equal(view.nodeListKey, "selection:nodes:a,b,c,d");
	assert.deepEqual(view.nodes.map((node) => node.nodeId), ["a", "b", "c"]);
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
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
```

Expected: FAIL because `nodeListExpandable` and `nodeListKey` do not exist and community nodes are still sliced to 3.

- [ ] **Step 3: Update the view model types and builders**

In `workbench/web/src/lib/graph-group-drawer.ts`, add fields to `GraphGroupDrawerViewModel`:

```ts
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
	nodeListExpandable: boolean;
	nodeListKey: string;
}
```

Update `graphCommunityDrawerViewModel()` so it keeps every node already present in `payload.coreNodes`. This does not expand the graph-engine summary payload beyond its existing core-node budget:

```ts
export function graphCommunityDrawerViewModel(payload: GraphCommunitySummaryPayload): GraphGroupDrawerViewModel {
	const recommendedActionId = recommendedGroupActionForCommunity(payload.structureState);
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
		actions: groupDrawerActions().map((action) => ({
			...action,
			recommended: action.id === recommendedActionId
		})),
		nodes: payload.coreNodes.map((node) => ({
			nodeId: node.nodeId,
			label: node.label,
			role: node.role
		})),
		nodeListExpandable: true,
		nodeListKey: `community:${payload.communityId}:${payload.coreNodeIds.join(",")}`
	};
}
```

Update `graphSelectionGroupDrawerViewModel()` so it stays capped and non-expandable:

```ts
export function graphSelectionGroupDrawerViewModel(title: string, selection: Selection): GraphGroupDrawerViewModel {
	const recommendedActionId = recommendedGroupActionForSelection(selection.facts);
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
		actions: groupDrawerActions().map((action) => ({
			...action,
			recommended: action.id === recommendedActionId
		})),
		nodes: selection.nodeIds.slice(0, 3).map((nodeId) => ({
			nodeId,
			label: nodeId,
			role: "已选"
		})),
		nodeListExpandable: false,
		nodeListKey: `selection:${selection.id}`
	};
}
```

- [ ] **Step 4: Run the unit test and verify it passes**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the view model contract**

Run:

```bash
git add workbench/web/src/lib/graph-group-drawer.ts workbench/web/test/graph-group-drawer.test.ts
git commit -m "fix: preserve graph drawer core nodes"
```

---

### Task 2: Restore Missing Drawer Interactions and Dialogue Hint

**Files:**
- Modify: `workbench/web/src/components/GraphGroupDrawer.tsx`
- Test: `workbench/web/test/right-drawer-interactions.test.tsx`
- Test: `workbench/web/test/right-drawer-graph-summary.test.tsx`
- Test: `workbench/web/test/right-drawer-graph-selection.test.tsx`

- [ ] **Step 1: Write failing DOM tests for expand/collapse while preserving node behavior**

These tests must prove that the lost expand/collapse affordance returns without replacing the existing node preview/click path.

In `workbench/web/test/right-drawer-interactions.test.tsx`, change `communitySummaryFixture()` to accept overrides:

```ts
function communitySummaryFixture(overrides: Partial<GraphCommunitySummaryPayload> = {}): GraphCommunitySummaryPayload {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "alpha" },
		communityId: "alpha",
		label: "Alpha community",
		nodeCount: 2,
		facts: { pageCount: 2, internalLinkCount: 1, communityCount: 1, isolatedCount: 0 },
		structureState: "clear",
		description: "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。",
		canEnterCommunity: true,
		coreNodeIds: ["alpha-node", "beta-node"],
		coreNodes: [
			{ nodeId: "alpha-node", label: "Alpha node", type: "topic", role: "核心" },
			{ nodeId: "beta-node", label: "Beta node", type: "entity", role: "相关" },
		],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: { kind: "community", id: "alpha" },
			selectionId: "community:alpha-node,beta-node",
			selectedNodeIds: ["alpha-node", "beta-node"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [{ kind: "enter-community", communityId: "alpha", label: "进入社区" }],
		...overrides,
	};
}
```

Update `drawerElement()` so tests can observe core-node selection:

```tsx
function drawerElement(drawer: DrawerState, props: Partial<RightDrawerProps> = {}) {
	return (
		<RightDrawer
			drawer={drawer}
			fullscreen={props.fullscreen ?? false}
			width={props.width ?? 420}
			defaultWidth={props.defaultWidth ?? 420}
			onSelectArtifact={props.onSelectArtifact ?? noopString}
			onOpenPage={noopString}
			onWikiLinkSeen={noopString}
			onGraphReaderAction={noopString}
			onGraphSummaryCommand={props.onGraphSummaryCommand ?? noop}
			onGraphSummaryNodeSelect={props.onGraphSummaryNodeSelect ?? noopString}
			onGraphSummaryNodePreview={props.onGraphSummaryNodePreview ?? noopPreviewNode}
			onGraphSelectionTextChange={noopString}
			onGraphSelectionAsk={props.onGraphSelectionAsk ?? noopSelectionAsk}
			onGraphCommunityTextChange={noopString}
			onGraphCommunityAsk={props.onGraphCommunityAsk ?? noopSelectionAsk}
			onResize={props.onResize ?? noopNumber}
			onToggleFullscreen={props.onToggleFullscreen ?? noop}
			onClose={props.onClose ?? noopClose}
		/>
	);
}
```

Add these tests:

```tsx
it("expands and collapses community core nodes without changing node click behavior", async () => {
	const selectedNodeIds: string[] = [];
	const payload = communitySummaryFixture({
		coreNodeIds: ["alpha-node", "beta-node", "gamma-node", "delta-node"],
		coreNodes: [
			{ nodeId: "alpha-node", label: "Alpha node", type: "topic", role: "核心" },
			{ nodeId: "beta-node", label: "Beta node", type: "entity", role: "相关" },
			{ nodeId: "gamma-node", label: "Gamma node", type: "source", role: "相关" },
			{ nodeId: "delta-node", label: "Delta node", type: "entity", role: "相关" },
		],
	});
	renderDrawer(graphCommunitySummaryDrawer(payload), {
		onGraphSummaryNodeSelect: (nodeId) => selectedNodeIds.push(nodeId),
	});

	assert.ok(screen.getByRole("button", { name: /Alpha node/ }));
	assert.ok(screen.getByRole("button", { name: /Beta node/ }));
	assert.ok(screen.getByRole("button", { name: /Gamma node/ }));
	assert.equal(screen.queryByRole("button", { name: /Delta node/ }), null);

	await click(screen.getByRole("button", { name: "查看全部" }));
	assert.ok(screen.getByRole("button", { name: /Delta node/ }));
	assert.ok(screen.getByRole("button", { name: "收起" }));

	await click(screen.getByRole("button", { name: /Delta node/ }));
	assert.deepEqual(selectedNodeIds, ["delta-node"]);

	await click(screen.getByRole("button", { name: "收起" }));
	assert.equal(screen.queryByRole("button", { name: /Delta node/ }), null);
});
```

Add preview preservation coverage:

```tsx
it("preserves community core node preview callbacks", async () => {
	const previews: Array<string | null> = [];
	renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()), {
		onGraphSummaryNodePreview: (nodeId) => previews.push(nodeId),
	});

	const row = screen.getByRole("button", { name: /Alpha node/ });
	fireEvent.mouseEnter(row);
	fireEvent.mouseLeave(row);
	fireEvent.focus(row);
	fireEvent.blur(row);

	assert.deepEqual(previews, ["alpha-node", null, "alpha-node", null]);
});
```

Add reset coverage for the same community whose core-node list changed after graph data refresh:

```tsx
it("resets expanded core nodes when the node-list identity changes", async () => {
	const first = communitySummaryFixture({
		communityId: "alpha",
		label: "Alpha community",
		coreNodeIds: ["alpha-node", "beta-node", "gamma-node", "delta-node"],
		coreNodes: [
			{ nodeId: "alpha-node", label: "Alpha node", type: "topic", role: "核心" },
			{ nodeId: "beta-node", label: "Beta node", type: "entity", role: "相关" },
			{ nodeId: "gamma-node", label: "Gamma node", type: "source", role: "相关" },
			{ nodeId: "delta-node", label: "Delta node", type: "entity", role: "相关" },
		],
	});
	const second = communitySummaryFixture({
		communityId: "alpha",
		label: "Alpha community",
		coreNodeIds: ["one-node", "two-node", "three-node", "four-node"],
		coreNodes: [
			{ nodeId: "one-node", label: "One node", type: "topic", role: "核心" },
			{ nodeId: "two-node", label: "Two node", type: "entity", role: "相关" },
			{ nodeId: "three-node", label: "Three node", type: "source", role: "相关" },
			{ nodeId: "four-node", label: "Four node", type: "entity", role: "相关" },
		],
	});
	const { rerender } = renderDrawer(graphCommunitySummaryDrawer(first));

	await click(screen.getByRole("button", { name: "查看全部" }));
	assert.ok(screen.getByRole("button", { name: /Delta node/ }));

	rerender(drawerElement(graphCommunitySummaryDrawer(second)));
	assert.ok(screen.getByRole("button", { name: /One node/ }));
	assert.ok(screen.getByRole("button", { name: /Three node/ }));
	assert.equal(screen.queryByRole("button", { name: /Four node/ }), null);
	assert.ok(screen.getByRole("button", { name: "查看全部" }));
});
```

- [ ] **Step 2: Write failing static tests for dialogue hints**

In `workbench/web/test/right-drawer-graph-summary.test.tsx`, extend the unified community drawer test:

```ts
assert.match(html, /当前社区会带入对话/);
assert.match(html, /graph-group-node-toggle/);
assert.match(html, /data-group-drawer="send"[\s\S]*<svg/);
assert.match(html, /data-group-drawer="new-conversation"[\s\S]*<svg/);
```

In the ungrouped community test, assert the same community hint:

```ts
assert.match(html, /当前社区会带入对话/);
```

In `workbench/web/test/right-drawer-graph-selection.test.tsx`, extend the skeleton test:

```ts
assert.match(html, /当前选区会带入对话/);
assert.doesNotMatch(html, /查看全部|收起/);
```

- [ ] **Step 3: Run DOM tests and verify they fail**

Run:

```bash
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx
```

Expected: FAIL because expand/collapse controls and dialogue hints are not implemented.

- [ ] **Step 4: Implement expand/collapse and dialogue hints**

In `workbench/web/src/components/GraphGroupDrawer.tsx`, keep the existing `Send` and `MessageSquarePlus` imports. If the file being edited no longer has them, restore this import shape:

```ts
import React from "react";
import { MessageSquarePlus, Send } from "lucide-react";
```

Inside `GraphGroupDrawer`, add key-bound state and derived node list before `return`. Do not reset expansion in a `useEffect`; treating a new `view.nodeListKey` as collapsed during render avoids a one-frame expanded flash when the same community refreshes with different core nodes:

```ts
const canSendFreeText = freeText.trim().length > 0;
const [nodeListState, setNodeListState] = React.useState({ key: view.nodeListKey, showAll: false });
const canToggleNodes = view.nodeListExpandable && view.nodes.length > 3;
const showAllNodes = nodeListState.key === view.nodeListKey ? nodeListState.showAll : false;
const visibleNodes = canToggleNodes && !showAllNodes ? view.nodes.slice(0, 3) : view.nodes;
const dialogueHint = view.kicker === "选区" ? "当前选区会带入对话" : "当前社区会带入对话";
```

Replace the node section header and list with:

```tsx
<section className="graph-summary-section">
	<div className="graph-summary-section-header">
		<h3>{nodeSectionTitle}</h3>
		{canToggleNodes && (
			<button
				type="button"
				className="graph-group-node-toggle"
				onClick={() => setNodeListState({ key: view.nodeListKey, showAll: !showAllNodes })}
			>
				{showAllNodes ? "收起" : "查看全部"}
			</button>
		)}
	</div>
	{visibleNodes.length === 0 ? (
		<div className="graph-summary-muted">暂无节点</div>
	) : (
		<ul className="graph-group-node-list">
			{visibleNodes.map((node) => (
				<li key={node.nodeId}>
					<button
						type="button"
						className="graph-group-node"
						onMouseEnter={() => onPreviewNode?.(node.nodeId)}
						onMouseLeave={() => onPreviewNode?.(null)}
						onFocus={() => onPreviewNode?.(node.nodeId)}
						onBlur={() => onPreviewNode?.(null)}
						onClick={() => onShowNodeSummary?.(node.nodeId)}
					>
						<span>{node.label}</span>
						<small>{node.role}</small>
					</button>
				</li>
			))}
		</ul>
	)}
</section>
```

Replace the dialogue footer with:

```tsx
<div className="graph-selection-context-hint">
	<span aria-hidden="true" />
	{dialogueHint}
</div>
<div className="graph-selection-footer">
	<button
		type="button"
		className="graph-selection-send"
		data-group-drawer="send"
		onClick={() => onAsk(null)}
		disabled={!canSendFreeText}
	>
		<Send />
		发送
	</button>
	<button
		type="button"
		className="graph-selection-secondary"
		data-group-drawer="new-conversation"
		onClick={() => onAskInNewConversation(null)}
	>
		<MessageSquarePlus />
		新对话
	</button>
</div>
```

- [ ] **Step 5: Run DOM tests and verify they pass**

Run:

```bash
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx
```

Expected: PASS. If a failure is only a test-harness mismatch, fix or update the test harness, rerun, and continue only after the listed tests pass.

- [ ] **Step 6: Commit the interaction restoration**

Run:

```bash
git add workbench/web/src/components/GraphGroupDrawer.tsx \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx
git commit -m "fix: restore graph drawer node expansion"
```

---

### Task 3: Apply Approved Drawer Visual Polish

**Files:**
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/right-drawer-graph-summary.test.tsx`

- [ ] **Step 1: Write failing CSS contract assertions**

In `workbench/web/test/right-drawer-graph-summary.test.tsx`, add a new test near the existing Paper summary styling contract. Keep these as token-level contract checks, not pixel-perfect snapshots: the goal is to lock the approved visual intent and prevent PR82-style drift, not to make harmless spacing edits painful.

```ts
it("keeps the graph group drawer visual contract", () => {
	const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

	assert.match(css, /\.graph-group-node-toggle[\s\S]*color:\s*var\(--app-accent-deep\)/);
	assert.match(css, /\.graph-group-node:hover[\s\S]*border-color:\s*color-mix\(in srgb, var\(--app-accent\)/);
	assert.match(css, /\.graph-group-node:focus-visible[\s\S]*(box-shadow|outline)/);
	assert.match(css, /\.graph-selection-context-hint[\s\S]*color:\s*var\(--app-muted\)/);
	assert.match(css, /\.graph-selection-context-hint span[\s\S]*background:\s*var\(--app-success\)/);
	assert.match(css, /\.graph-selection-footer[\s\S]*grid-template-columns:/);
	assert.match(css, /\.graph-selection-footer[\s\S]*minmax\(0,\s*1fr\)/);
	assert.match(css, /\.graph-selection-send[\s\S]*background:\s*var\(--app-accent\)/);
	assert.match(css, /\.graph-selection-send svg[\s\S]*width:\s*13px/);
	assert.match(css, /\.graph-selection-secondary[\s\S]*background:\s*var\(--app-raised\)/);
	assert.match(css, /\.graph-selection-send:hover:not\(:disabled\)|\.graph-selection-send:focus-visible/);
	assert.doesNotMatch(css, /搜索命中明细|桥接关系列表|固定节点明细/);
});
```

- [ ] **Step 2: Run the CSS contract test and verify it fails**

Run:

```bash
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/right-drawer-graph-summary.test.tsx
```

Expected: FAIL because the new style hooks do not exist yet.

- [ ] **Step 3: Update CSS for node rows, toggle, hints, and buttons**

In `workbench/web/src/index.css`, keep the existing selectors and update/add these blocks:

```css
.graph-group-node-toggle {
  min-height: 28px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--app-accent-deep);
  font-size: 12px;
  font-weight: 820;
  cursor: pointer;
}
```

Extend `.graph-group-node`:

```css
.graph-group-node {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-raised) 72%, transparent);
  padding: 9px 10px;
  color: inherit;
  text-align: left;
  transition: transform 0.14s, border-color 0.14s, background 0.14s, box-shadow 0.14s;
}

.graph-group-node:hover,
.graph-group-node:focus-visible {
  transform: translateX(-2px);
  border-color: color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
  background: linear-gradient(90deg, var(--app-accent-soft), color-mix(in srgb, var(--app-bg) 92%, var(--app-surface)) 88%);
  box-shadow: inset 3px 0 0 var(--app-accent), 0 8px 18px color-mix(in srgb, var(--app-accent) 10%, transparent);
  outline: none;
}
```

Add the hint block:

```css
.graph-selection-context-hint {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 700;
}

.graph-selection-context-hint span {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--app-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-success) 14%, transparent);
}
```

Update footer/buttons:

```css
.graph-selection-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.graph-selection-send,
.graph-selection-secondary {
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 10px;
}

.graph-selection-send {
  border: 1px solid color-mix(in srgb, var(--app-accent) 64%, var(--app-border));
  background: var(--app-accent);
  color: var(--app-bg);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-accent) 22%, transparent);
}

.graph-selection-secondary {
  border: 1px solid var(--app-border);
  background: var(--app-raised);
  color: var(--app-muted);
}

.graph-selection-send:hover:not(:disabled),
.graph-selection-send:focus-visible {
  background: var(--app-accent-deep);
}
```

Keep the existing disabled opacity rule for disabled buttons so empty send is visibly disabled.

- [ ] **Step 4: Run CSS contract test and DOM tests**

Run:

```bash
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx \
  workbench/web/test/right-drawer-interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit visual polish**

Run:

```bash
git add workbench/web/src/index.css workbench/web/test/right-drawer-graph-summary.test.tsx
git commit -m "fix: polish graph drawer dialogue controls"
```

---

### Task 4: Full Regression and Browser Verification

**Files:**
- No source files created.
- Verification covers all touched web files.

- [ ] **Step 1: Run focused unit and DOM tests**

Run:

```bash
node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx \
  workbench/web/test/right-drawer-interactions.test.tsx
```

Expected: PASS for all listed tests.

- [ ] **Step 2: Run the wider web test suite**

Run:

```bash
npm run test -w @llm-wiki-agent/web
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck -w @llm-wiki-agent/web
```

Expected: PASS.

- [ ] **Step 4: Start the app for browser verification**

Run:

```bash
npm run dev
```

Expected: backend on `8787` and frontend on `5180`, or equivalent existing dev server already running.

- [ ] **Step 5: Verify the normal community drawer in the browser**

Open `http://localhost:5180/`.

Check:

- Click a normal graph community with more than 3 core nodes.
- Drawer shows only 3 core rows at first.
- “查看全部” appears in the core-node section header.
- Clicking “查看全部” shows every core node provided by the summary payload and changes the control to “收起”.
- Clicking “收起” returns to 3 visible core rows.
- Hovering a core row gives visible row feedback and graph preview remains active.
- Clicking a core row opens the node summary drawer.
- Dialogue hint reads `当前社区会带入对话`.
- Sending button has the paper-plane icon and app accent color when text exists.
- Send and new-conversation buttons render at equal width.

- [ ] **Step 6: Verify ungrouped and selection paths in the browser**

Check:

- Click “未分组”.
- Drawer does not show “进入社区”.
- Recommended action is “探索潜在关系”.
- Dialogue hint reads `当前社区会带入对话`.
- Shift-click multiple nodes.
- Selection drawer opens.
- Selection drawer does not show “查看全部 / 收起”.
- Selection drawer dialogue hint reads `当前选区会带入对话`.
- Click a node’s “+邻居”.
- Neighbor selection opens through the same unified drawer and can still send to the current conversation.

- [ ] **Step 7: Confirm out-of-scope surfaces did not change**

Check:

- Click a single knowledge node and confirm the node/page detail drawer is still the node-summary flow, not the community drawer.
- Open global search and confirm the search popup was not redesigned.
- Enter a community reading view and confirm reading layout was not redesigned.

- [ ] **Step 8: Commit verification notes if only test fixtures or docs changed**

If no source files changed during verification, do not create an empty commit.

If you add or adjust test fixtures during browser verification, run the focused tests again and commit:

```bash
git add workbench/web/test
git commit -m "test: cover graph drawer recovery regression"
```

---

## NOT In Scope

- Community drawer search-hit detail lists: deferred because PR82 intentionally compressed them out of the first screen; node/search result detail surfaces still exist elsewhere.
- Community drawer fixed-node detail lists: deferred because fixed state remains a light tag in this drawer and detailed fixed behavior belongs to node/graph interactions.
- Community drawer bridge-relation lists: deferred because bridge relations are still available in node summary/detail contexts and would overload this drawer first screen.
- Selection drawer selected-page `查看全部`: deferred because the confirmed scope keeps selection rows capped at 3 and only restores the dialogue hint/visual balance.
- Graph data, graph layout, node colors, edges, community reader, global search, and prompt payloads: deferred because this branch is a drawer recovery/polish pass.

## Eng Review Findings

Scope challenge: accepted as minimal recovery. The plan touches one view-model helper, one shared drawer component, CSS, and existing tests. No new service, data model, or graph-engine payload change is needed.

Architecture review:

- `[P1] node-list reset key was too narrow` — using only `communityId` can leak expanded state when the same community refreshes with a changed core-node list. Folded into Task 1/2 by using `community:<id>:<coreNodeIds>` and key-bound render state.
- `[P2] "all core nodes" wording was too broad` — graph-engine already caps `payload.coreNodes`; this plan now says it restores every core node already supplied by the summary payload, not every page in the community.

Code quality review:

- `[P2] plan sounded like adding existing behavior from scratch` — `GraphGroupDrawer` already owns shared structure, icons, node preview hooks, and click hooks. The plan now explicitly says to preserve those paths and restore only the missing affordances.
- `[P2] CSS examples conflicted with theme-variable rule` — literal new `rgba` / hex colors were replaced with existing variables plus `color-mix`.

Test review:

- `[P1] DOM test commands were wrong from repo root` — all `setup-dom.ts` commands now use `./workbench/...`.
- `[P1] preview preservation was not locked` — Task 2 now tests mouse enter/leave and focus/blur callbacks.
- `[P2] icon presence was only implied by CSS` — static render tests now assert the send and new-conversation buttons actually render SVG icons.
- `[P2] CSS contract was too exact` — CSS assertions now lock critical tokens and hooks instead of pixel-perfect declarations.

Performance review:

- No new performance issue found. The only added runtime work is slicing an already-small `payload.coreNodes` array and toggling local component state.

Failure-mode review:

- Critical silent gap found and folded: same-community data refresh must not keep the previous expanded state.
- No unresolved prompt, selection, graph layout, or node-detail risk remains in this plan.

Outside voices:

- Coherence reviewer: main boundaries are consistent after goal/CSS/test wording corrections.
- Feasibility reviewer: no wrong prompt, preview, or click code path found after the plan acknowledges existing `onGraphSummaryNodeSelect` flow.
- Testing reviewer: command path, preview test, icon test, and brittle CSS concerns were all folded into the plan.

Parallelization:

- Sequential implementation, no parallelization opportunity. The source edits all converge on the same small drawer/view-model/CSS surface; splitting this would increase coordination cost.

## Implementation Tasks From Review

- [ ] **T1 (P1, human: ~20min / CC: ~5min)** — Plan execution — Keep `nodeListKey` tied to community id plus core-node ids.
  - Surfaced by: Architecture review.
  - Files: `workbench/web/src/lib/graph-group-drawer.ts`, `workbench/web/src/components/GraphGroupDrawer.tsx`, related tests.
  - Verify: focused unit and DOM tests listed in Task 4.
- [ ] **T2 (P1, human: ~15min / CC: ~5min)** — Test commands — Run DOM tests from repo root with `./workbench/.../setup-dom.ts`.
  - Surfaced by: Test review.
  - Files: plan/test execution only.
  - Verify: the corrected command starts and runs tests instead of failing module resolution.
- [ ] **T3 (P2, human: ~30min / CC: ~10min)** — Existing behavior protection — Preserve preview/click/icon/prompt paths while restoring the three missing affordances.
  - Surfaced by: Code quality and test review.
  - Files: `GraphGroupDrawer.tsx`, `RightDrawer.tsx` tests, summary/selection render tests.
  - Verify: preview callback test, node click test, icon render test, send/new-conversation dispatch tests.

---

## Final Checks Before PR

- [ ] Run:

```bash
git status --short
```

Expected: only intentional tracked changes remain; unrelated `designs/pr82-drawer-recovery/` and `tests/fixtures/graph-interactive-unified-drawer/` stay uncommitted unless explicitly needed.

- [ ] Run:

```bash
git log --oneline -5
```

Expected: commits include the spec, plan, and implementation commits in logical order.

- [ ] Prepare PR summary:

```md
## Summary
- Restores expandable community core nodes in the unified graph drawer.
- Restores graph drawer node hover/focus feedback and context hints.
- Updates dialogue controls to match the approved drawer visual design.

## Tests
- node --import tsx --test workbench/web/test/graph-group-drawer.test.ts
- node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx workbench/web/test/right-drawer-interactions.test.tsx
- npm run test -w @llm-wiki-agent/web
- npm run typecheck -w @llm-wiki-agent/web
```

---

## Self-Review Notes

- Spec coverage: covered core-node expansion, node hover/focus feedback, dialogue hints, send/new-chat visual treatment, no selection-page expand, no search/fixed/bridge first-screen restoration, and existing PR82 paths.
- Placeholder scan: no placeholder tasks; all test and implementation steps include exact files, commands, and expected outcomes.
- Type consistency: `nodeListExpandable` and `nodeListKey` are introduced in Task 1 and consumed in Task 2 with the same names.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run; scope was already explicitly confirmed as Option A minimal recovery |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 8 issues found and folded into the plan; 0 critical gaps remain |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run in this review; approved HTML design remains the visual reference |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

- **VERDICT:** ENG CLEARED — ready to implement this scoped recovery plan.
NO UNRESOLVED DECISIONS
