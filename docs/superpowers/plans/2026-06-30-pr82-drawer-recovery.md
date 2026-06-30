# PR82 Drawer Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the PR82 drawer capabilities that were lost, while keeping the unified community/selection drawer scope and applying the approved visual polish.

**Architecture:** Keep the existing shared `GraphGroupDrawer` skeleton. Move core-node truncation out of the community view model so the component can own expand/collapse state, add stable node-list metadata to reset that state, and update drawer markup/CSS without touching graph data, selection generation, prompt payloads, node detail drawers, search, community reading, or graph layout.

**Tech Stack:** React 19, TypeScript, lucide-react icons, CSS in `workbench/web/src/index.css`, Node built-in `node --test`, jsdom + Testing Library for DOM tests.

---

## File Structure

- Modify: `workbench/web/src/lib/graph-group-drawer.ts`
  - Owns the drawer view model.
  - Must preserve full community core nodes and add `nodeListExpandable` / `nodeListKey`.
  - Must keep selection drawer node list capped at 3.

- Modify: `workbench/web/src/components/GraphGroupDrawer.tsx`
  - Owns expand/collapse UI, node-row feedback hooks, dialogue hint, and send/new-chat button markup.
  - Must not alter prompt dispatch behavior.

- Modify: `workbench/web/src/index.css`
  - Owns approved drawer visual treatment.
  - Must use existing theme variables only.

- Modify: `workbench/web/test/graph-group-drawer.test.ts`
  - Unit coverage for full community node list, expandable metadata, and capped selection nodes.

- Modify: `workbench/web/test/right-drawer-graph-summary.test.tsx`
  - Static rendering and CSS-contract coverage for community drawer hints, no unwanted sections, icons, and visual style hooks.

- Modify: `workbench/web/test/right-drawer-graph-selection.test.tsx`
  - Static rendering coverage for selection hint and no selection-page expand link.

- Modify: `workbench/web/test/right-drawer-interactions.test.tsx`
  - DOM interaction coverage for view-all/collapse, reset on drawer identity change, and node click preservation.

---

### Task 1: Update View Model Contract

**Files:**
- Modify: `workbench/web/src/lib/graph-group-drawer.ts`
- Test: `workbench/web/test/graph-group-drawer.test.ts`

- [ ] **Step 1: Write failing unit tests for full community core nodes and node-list metadata**

In `workbench/web/test/graph-group-drawer.test.ts`, update the normal community test fixture to have four core nodes and add assertions for full nodes, expandability, and stable key:

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
	assert.equal(view.nodeListKey, "community:build");
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

Update `graphCommunityDrawerViewModel()` so it keeps all core nodes:

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
		nodeListKey: `community:${payload.communityId}`
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

### Task 2: Restore Drawer Interactions and Dialogue Hint

**Files:**
- Modify: `workbench/web/src/components/GraphGroupDrawer.tsx`
- Test: `workbench/web/test/right-drawer-interactions.test.tsx`
- Test: `workbench/web/test/right-drawer-graph-summary.test.tsx`
- Test: `workbench/web/test/right-drawer-graph-selection.test.tsx`

- [ ] **Step 1: Write failing DOM tests for expand/collapse and node click behavior**

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

	assert.ok(screen.getByRole("button", { name: "Alpha node 核心" }));
	assert.ok(screen.getByRole("button", { name: "Beta node 相关" }));
	assert.ok(screen.getByRole("button", { name: "Gamma node 相关" }));
	assert.equal(screen.queryByRole("button", { name: "Delta node 相关" }), null);

	await click(screen.getByRole("button", { name: "查看全部" }));
	assert.ok(screen.getByRole("button", { name: "Delta node 相关" }));
	assert.ok(screen.getByRole("button", { name: "收起" }));

	await click(screen.getByRole("button", { name: "Delta node 相关" }));
	assert.deepEqual(selectedNodeIds, ["delta-node"]);

	await click(screen.getByRole("button", { name: "收起" }));
	assert.equal(screen.queryByRole("button", { name: "Delta node 相关" }), null);
});
```

Add reset coverage:

```tsx
it("resets expanded core nodes when the drawer target changes", async () => {
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
		communityId: "omega",
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
	assert.ok(screen.getByRole("button", { name: "Delta node 相关" }));

	rerender(drawerElement(graphCommunitySummaryDrawer(second)));
	assert.ok(screen.getByRole("button", { name: "One node 核心" }));
	assert.ok(screen.getByRole("button", { name: "Three node 相关" }));
	assert.equal(screen.queryByRole("button", { name: "Four node 相关" }), null);
	assert.ok(screen.getByRole("button", { name: "查看全部" }));
});
```

- [ ] **Step 2: Write failing static tests for dialogue hints**

In `workbench/web/test/right-drawer-graph-summary.test.tsx`, extend the unified community drawer test:

```ts
assert.match(html, /当前社区会带入对话/);
assert.match(html, /graph-group-node-toggle/);
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
node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx
```

Expected: FAIL because expand/collapse controls and dialogue hints are not implemented.

- [ ] **Step 4: Implement expand/collapse and dialogue hints**

In `workbench/web/src/components/GraphGroupDrawer.tsx`, update imports:

```ts
import React from "react";
import { MessageSquarePlus, Send } from "lucide-react";
```

Inside `GraphGroupDrawer`, add state and derived node list before `return`:

```ts
const canSendFreeText = freeText.trim().length > 0;
const [showAllNodes, setShowAllNodes] = React.useState(false);

React.useEffect(() => {
	setShowAllNodes(false);
}, [view.nodeListKey]);

const canToggleNodes = view.nodeListExpandable && view.nodes.length > 3;
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
				onClick={() => setShowAllNodes((current) => !current)}
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

- [ ] **Step 5: Run DOM tests and verify they pass or expose only test-harness mismatch**

Run:

```bash
node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/right-drawer-graph-summary.test.tsx \
  workbench/web/test/right-drawer-graph-selection.test.tsx
```

Expected: PASS.

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

In `workbench/web/test/right-drawer-graph-summary.test.tsx`, add a new test near the existing Paper summary styling contract:

```ts
it("keeps the graph group drawer visual contract", () => {
	const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

	assert.match(css, /\.graph-group-node-toggle[\s\S]*color:\s*var\(--app-accent-deep\)/);
	assert.match(css, /\.graph-group-node:hover[\s\S]*border-color:\s*color-mix\(in srgb, var\(--app-accent\)/);
	assert.match(css, /\.graph-group-node:focus-visible[\s\S]*outline:\s*none/);
	assert.match(css, /\.graph-selection-context-hint[\s\S]*color:\s*var\(--app-muted\)/);
	assert.match(css, /\.graph-selection-context-hint span[\s\S]*background:\s*var\(--app-success\)/);
	assert.match(css, /\.graph-selection-footer[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(css, /\.graph-selection-send[\s\S]*background:\s*var\(--app-accent\)/);
	assert.match(css, /\.graph-selection-send svg[\s\S]*width:\s*13px/);
	assert.match(css, /\.graph-selection-secondary[\s\S]*background:\s*var\(--app-raised\)/);
	assert.doesNotMatch(css, /搜索命中明细|桥接关系列表|固定节点明细/);
});
```

- [ ] **Step 2: Run the CSS contract test and verify it fails**

Run:

```bash
node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test workbench/web/test/right-drawer-graph-summary.test.tsx
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
  border: 1px solid rgba(94, 72, 48, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.52);
  padding: 9px 10px;
  color: inherit;
  text-align: left;
  transition: transform 0.14s, border-color 0.14s, background 0.14s, box-shadow 0.14s;
}

.graph-group-node:hover,
.graph-group-node:focus-visible {
  transform: translateX(-2px);
  border-color: color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
  background: linear-gradient(90deg, var(--app-accent-soft), rgba(255, 253, 247, 0.92) 88%);
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
  color: #fffdf7;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-accent) 22%, transparent);
}

.graph-selection-secondary {
  border: 1px solid var(--app-border);
  background: var(--app-raised);
  color: var(--app-muted);
}
```

Keep the existing disabled opacity rule for disabled buttons so empty send is visibly disabled.

- [ ] **Step 4: Run CSS contract test and DOM tests**

Run:

```bash
node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test \
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
node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test \
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
- Clicking “查看全部” shows all core nodes and changes the control to “收起”.
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
- node --test-concurrency=1 --import tsx --import workbench/web/test/setup-dom.ts --test workbench/web/test/right-drawer-graph-summary.test.tsx workbench/web/test/right-drawer-graph-selection.test.tsx workbench/web/test/right-drawer-interactions.test.tsx
- npm run test -w @llm-wiki-agent/web
- npm run typecheck -w @llm-wiki-agent/web
```

---

## Self-Review Notes

- Spec coverage: covered core-node expansion, node hover/focus feedback, dialogue hints, send/new-chat visual treatment, no selection-page expand, no search/fixed/bridge first-screen restoration, and existing PR82 paths.
- Placeholder scan: no placeholder tasks; all test and implementation steps include exact files, commands, and expected outcomes.
- Type consistency: `nodeListExpandable` and `nodeListKey` are introduced in Task 1 and consumed in Task 2 with the same names.
