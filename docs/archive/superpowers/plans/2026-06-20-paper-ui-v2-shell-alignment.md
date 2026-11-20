# Paper UI V2 Shell Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current Paper UI shell into close alignment with `paper-final-v2.html`: V2 sidebar, lighter composer, non-intrusive tool calls, drawer reflow, and non-overlapping graph shell.

**Architecture:** Keep the existing React state model and backend APIs. This is a shell/layout refinement on the existing `codex/paper-ui-v2-layout` branch, not a new branch and not a rewrite. Tasks 1-5 start with a failing DOM/CSS test, then update the smallest relevant component and `index.css`, then commit that one unit. Task 6 strengthens the visual regression suite after those UI changes land.

**Tech Stack:** Vite, React 19, Tailwind v4 CSS layer in `workbench/web/src/index.css`, shadcn/Radix primitives, lucide-react icons, `node:test`, `@testing-library/react`, jsdom, Playwright visual script.

---

## Ground Rules

- Work on the current branch only: `codex/paper-ui-v2-layout`.
- Do not create another branch.
- Do not modify the completed old Paper UI ledger: `docs/plans/2026-06-20-paper-ui-port-progress.json`.
- Do not change graph-engine Sigma rendering styles in `packages/graph-engine/`.
- Do not add npm dependencies.
- Do not remove real product features: search, model switcher, export, batch digest, settings, appearance preferences, drawer resize/fullscreen, graph reset/rebuild.
- Commit after each task passes its verification.

## Source References

- Spec: `docs/spark/2026-06-20-paper-ui-v2-shell-alignment-design.md`
- V2 prototype: local design repository file `bright/paper-final-v2.html`
- Existing Paper implementation: `workbench/web/src/components/*`, `workbench/web/src/index.css`
- Existing tests: `workbench/web/test/*.test.tsx`, `workbench/web/test/*.test.ts`

## V2 Fidelity Gates

- Treat `paper-final-v2.html` as the visual baseline, not just inspiration. The spec and this plan only override it where real product behavior requires a deviation.
- Before implementation, open the prototype and current app side by side at 1440, 1024, and 768 widths. The final browser pass must compare against that prototype for paper texture, density, sidebar proportions, composer weight, drawer behavior, graph layout, color warmth, rounded corners, shadows, and spacing.
- DOM tests prove structure; visual checks must also prove geometry. For drawer/composer/graph, assert element rectangles and overlap rules, not only text presence.
- The sidebar bottom entry is named `新建知识库` because the user asked to rename the current add-existing-library flow. The opened dialog must use matching user-facing copy (`新建知识库`) and explain that it creates a knowledge base by choosing an existing folder.
- The graph shell should follow V2's “active map” feel: React-owned toolbar/stats/legend are stable above the canvas, and the existing graph-engine search stays inside the stage without colliding with the toolbar. Keep graph-engine/Sigma internals unchanged.

## File Structure

### Modify

- `workbench/web/src/components/Sidebar.tsx`
  - Owns expanded and collapsed sidebar structure.
  - Must stop rendering `NewWikiDialog`.
  - Must keep `AddExternalDialog`, but expose it through a footer item labeled `新建知识库`.
  - Must split knowledge bases and conversations into separate sections.

- `workbench/web/src/components/AddExternalDialog.tsx`
  - Owns the existing add-existing-library flow.
  - Must rename user-facing title/copy to match the `新建知识库` entry while keeping the same folder-based behavior.

- `workbench/web/src/App.tsx`
  - Owns shell layout state and Sidebar wiring.
  - Must mark drawer-open state for layout and remove Sidebar props that no longer render.

- `workbench/web/src/components/ChatPanel.tsx`
  - Owns composer layout and message rendering.
  - Must move send/stop button inside the composer card bottom-right.
  - Must render export as a lightweight tool strip outside the main composer card.
  - Must keep material chips and menu behavior.

- `workbench/web/src/components/ToolStatusRunway.tsx`
  - Owns active/current tool display.
  - Must read like a current action, not a dashboard card.

- `workbench/web/src/components/ToolHistorySummary.tsx`
  - Owns completed tool summary.
  - Must default to a lightweight one-line summary and expand on demand.

- `workbench/web/src/components/RightDrawer.tsx`
  - Owns drawer class/state surface.
  - Must mark drawer as open in a way CSS can use for desktop reflow and narrow overlay.

- `workbench/web/src/components/GraphPanel.tsx`
  - Owns graph shell toolbar/stage structure.
  - Must keep toolbar outside the graph stage.
  - Must not modify graph-engine internals.

- `workbench/web/src/index.css`
  - Owns Paper shell layout and responsive behavior.
  - Must define V2 sidebar, composer, tool status, drawer, and graph shell styles.

- `workbench/web/test/visual/paper-ui.ts`
  - Owns Paper screenshot cases.
  - Must add V2 shell cases for sidebar, chat with drawer, and graph.

### Modify Tests

- `workbench/web/test/sidebar.test.tsx`
- `workbench/web/test/chat-panel-composer.test.tsx`
- `workbench/web/test/tool-status-runway.test.ts`
- `workbench/web/test/tool-history-summary.test.tsx`
- `workbench/web/test/add-external-dialog.test.tsx` if this test exists; otherwise add the dialog-copy assertion to `sidebar.test.tsx`.
- `workbench/web/test/right-drawer-interactions.test.tsx`
- `workbench/web/test/graph-panel-paper.test.tsx`

### Create Tests

- `workbench/web/test/app-shell-drawer-layout.test.tsx`
  - Verifies app/body/drawer CSS contracts for desktop reflow and narrow overlay.

---

### Task 0: Preflight And Branch Safety

**Files:**
- Read: `docs/spark/2026-06-20-paper-ui-v2-shell-alignment-design.md`
- Read: `workbench/web/src/components/Sidebar.tsx`
- Read: `workbench/web/src/components/ChatPanel.tsx`
- Read: `workbench/web/src/components/GraphPanel.tsx`
- Read: `workbench/web/src/index.css`

- [ ] **Step 1: Confirm branch and clean worktree**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
codex/paper-ui-v2-layout
```

and no uncommitted implementation changes except this plan if it has not been committed yet.

- [ ] **Step 2: Run baseline web checks**

Run:

```bash
cd workbench/web
npm run typecheck
npm test
```

Expected: both commands exit `0`.

- [ ] **Step 3: Run current targeted tests before editing**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/sidebar.test.tsx \
  test/chat-panel-composer.test.tsx \
  test/right-drawer-interactions.test.tsx \
  test/graph-panel-paper.test.tsx
```

Expected: command exits `0`.

---

### Task 1: Sidebar V2 Information Architecture

**Files:**
- Modify: `workbench/web/src/App.tsx`
- Modify: `workbench/web/src/components/Sidebar.tsx`
- Modify: `workbench/web/src/components/AddExternalDialog.tsx`
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/sidebar.test.tsx`

Goal: make the sidebar match V2 structure: compact brand/collapse header, separate notebook and session sections, footer entries for graph map/settings/new library, with `新建知识库` using the existing add-existing-library flow and matching dialog copy.

- [ ] **Step 1: Replace sidebar tests with V2 structure expectations**

Edit `workbench/web/test/sidebar.test.tsx` so its assertions include the following exact test cases:

```tsx
it("renders V2 expanded sidebar sections and footer actions", async () => {
	const events = makeSidebarEvents();
	renderSidebar(false, events);

	assert.equal(screen.queryByTitle("刷新"), null);
	assert.equal(screen.queryByLabelText("设置"), null);
	assert.notEqual(screen.getByLabelText("折叠侧栏"), null);
	assert.notEqual(screen.getByText("笔记本"), null);
	assert.notEqual(screen.getByText("会话"), null);
	assert.notEqual(screen.getByRole("button", { name: "图谱活地图" }), null);
	assert.notEqual(screen.getByRole("button", { name: "设置" }), null);
	assert.notEqual(screen.getByRole("button", { name: "新建知识库" }), null);
	assert.equal(screen.queryByText("添加现有库"), null);
	assert.equal(document.querySelector(".main-view-switch"), null);

	await click(screen.getByRole("button", { name: "图谱活地图" }));
	await click(screen.getByRole("button", { name: "设置" }));
	await click(screen.getByRole("button", { name: "新建知识库" }));

	assert.deepEqual(events.views, ["graph"]);
	assert.equal(events.settings, 1);
	assert.notEqual(await screen.findByText("新建知识库"), null);
});

it("renders conversations outside the knowledge-base tree", () => {
	renderSidebar(false);

	const notebookSection = screen.getByText("笔记本").closest(".sidebar-section");
	const conversationSection = screen.getByText("会话").closest(".sidebar-section");
	assert.ok(notebookSection);
	assert.ok(conversationSection);
	assert.equal(notebookSection?.contains(screen.getByText("Transformer vs Mamba")), false);
	assert.equal(conversationSection?.contains(screen.getByText("Transformer vs Mamba")), true);
	assert.equal(document.querySelector(".kb-children"), null);
});

it("keeps the collapsed rail aligned with V2 actions", async () => {
	const events = makeSidebarEvents();
	renderSidebar(true, events);

	assert.notEqual(screen.getByLabelText("展开侧栏"), null);
	assert.notEqual(screen.getByLabelText("当前知识库：示例知识库"), null);
	assert.notEqual(screen.getByLabelText("对话"), null);
	assert.notEqual(screen.getByLabelText("图谱活地图"), null);
	assert.notEqual(screen.getByLabelText("设置"), null);
	assert.notEqual(screen.getByLabelText("新建知识库"), null);
	assert.equal(screen.queryByLabelText("刷新"), null);
	assert.equal(screen.queryByLabelText("添加现有库"), null);

	await click(screen.getByLabelText("新建知识库"));
	assert.notEqual(await screen.findByText("新建知识库"), null);
});
```

Use this helper shape in the same file:

```tsx
function makeSidebarEvents() {
	return {
		views: [] as string[],
		settings: 0,
	};
}

function renderSidebar(collapsed: boolean, events = makeSidebarEvents()) {
	return render(
		<TooltipProvider>
			<Sidebar
				knowledgeBases={[
					{ path: "/kb", name: "示例知识库", origin: "default", valid: true },
					{ path: "/external", name: "设计灵感库", origin: "external", valid: true },
				]}
				currentKbPath="/kb"
				conversations={[
					{
						id: "c1",
						path: "/kb/.llm-wiki/conversations/c1.jsonl",
						firstMessage: "Transformer vs Mamba",
						modifiedAt: Date.parse("2026-06-20T10:00:00.000Z"),
					},
				]}
				currentConversationId="c1"
				loading={false}
				error={null}
				collapsed={collapsed}
				activeView="chat"
				onSelectKb={noop}
				onSelectConversation={(item) => {
					events.views.push(`conversation:${item.id}`);
				}}
				onSelectView={(view) => events.views.push(view)}
				onNewConversation={noop}
				onOpenSettings={() => {
					events.settings += 1;
				}}
				onToggleCollapsed={noop}
				onAddExternal={asyncNoop}
			/>
		</TooltipProvider>,
	);
}
```

- [ ] **Step 2: Run sidebar test and verify failure**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/sidebar.test.tsx
```

Expected: FAIL because the current sidebar still renders top refresh/settings, the old main-view switch, nested conversations, and `添加现有库`.

- [ ] **Step 3: Refactor `Sidebar.tsx` expanded structure**

In `workbench/web/src/components/Sidebar.tsx`:

Remove unused `NewWikiDialog`, `RefreshCw`, `Download`, `onRefresh`, `onCreateWiki`, `newWikiOpen`, `expanded`, `currentExpanded`, and `toggleExpanded`.

Update the `Sidebar` prop type and the `App.tsx` call site so `onRefresh` and `onCreateWiki` are no longer passed. Typecheck must have no unused prop/import errors.

Replace the expanded header action group with a compact brand/collapse header. This intentionally keeps a weak brand marker from the spec while removing the old refresh/settings cluster:

```tsx
<div className="sidebar-header">
	<div className="sidebar-brand">
		<span className="sidebar-brand-dot" />
		<span>llm-wiki-agent</span>
	</div>
	<button
		className="icon-btn"
		type="button"
		onClick={onToggleCollapsed}
		title="折叠侧栏"
		aria-label="折叠侧栏"
	>
		<PanelLeftClose />
	</button>
</div>
```

Remove the expanded `.main-view-switch` block completely. `图谱活地图` moves to the footer, and conversation clicks/new conversation should switch the main view back to chat from `App.tsx`:

```tsx
const handleSelectConversation = async (item: ConversationInfo) => {
	if (!active) return;
	setMainView("chat");
	// keep existing selectConversation behavior
};

const handleNewConversation = async () => {
	if (!active) return;
	setMainView("chat");
	// keep existing createNewConversation behavior
};
```

Replace the nested knowledge-base section with separate sections:

```tsx
<Section title="笔记本">
	{knowledgeBases.length === 0 ? (
		<EmptyHint text="还没有知识库" />
	) : (
		knowledgeBases.map((item) => (
			<KbItem
				key={item.path}
				item={item}
				active={item.path === currentKbPath}
				onClick={() => {
					if (item.valid) onSelectKb(item);
				}}
			/>
		))
	)}
</Section>

<Section title="会话" action={
	<button type="button" className="section-action" onClick={onNewConversation} aria-label="新对话">
		<Plus className="size-3" />
	</button>
}>
	{conversations.length === 0 ? (
		<EmptyHint text="暂无对话" />
	) : (
		conversations.map((item) => (
			<ConversationItem
				key={item.id}
				item={item}
				active={item.id === currentConversationId}
				onClick={() => onSelectConversation(item)}
			/>
		))
	)}
</Section>
```

Change `Section` signature to:

```tsx
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="sidebar-section">
			<div className="sidebar-section-head">
				<div className="sidebar-section-label">{title}</div>
				{action}
			</div>
			<div className="sidebar-section-body">{children}</div>
		</div>
	);
}
```

Simplify `KbItem` props so it no longer owns `expanded`, `onToggle`, or `ChevronRight`. The row should be one button:

```tsx
function KbItem({
	item,
	active,
	onClick,
}: {
	item: KnowledgeBaseInfo;
	active: boolean;
	onClick: () => void;
}) {
	const isDisabled = !item.valid;
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDisabled}
			className={cn("kb-row", active && "kb-row-active", isDisabled && "kb-row-disabled")}
			title={item.path}
		>
			<BookOpen className="size-3.5 shrink-0" />
			<span className="kb-name">{item.name}</span>
			{!item.valid ? (
				<span className="kb-badge kb-badge-invalid">不可用</span>
			) : item.origin === "external" ? (
				<span className="kb-badge kb-badge-external">外部</span>
			) : (
				<span className="kb-badge">默认</span>
			)}
		</button>
	);
}
```

Replace footer with V2 actions:

```tsx
<div className="sidebar-footer sidebar-footer-v2">
	<button type="button" className={cn("sidebar-footer-btn", activeView === "graph" && "sidebar-footer-btn-active")} onClick={() => onSelectView("graph")}>
		<Network className="size-4" />
		<span>图谱活地图</span>
		{graphHasPendingUpdate && <span className="graph-update-dot" aria-label="图谱有更新" />}
	</button>
	<button type="button" className="sidebar-footer-btn" onClick={onOpenSettings}>
		<Settings className="size-4" />
		<span>设置</span>
	</button>
	<button type="button" className="sidebar-footer-btn sidebar-footer-btn-primary" onClick={() => setDialogOpen(true)}>
		<Plus className="size-4" />
		<span>新建知识库</span>
	</button>
</div>
```

In `AddExternalDialog.tsx`, keep the existing behavior but align visible copy with the footer entry:

- `DialogTitle`: `新建知识库`
- Any subtitle/help copy should say this creates a knowledge base from an existing folder.
- Do not use the old visible phrase `添加现有知识库` in the dialog title.

- [ ] **Step 4: Refactor collapsed rail**

In the collapsed branch of `Sidebar.tsx`:

Remove `RailButton label="刷新"` and `RailButton label="添加现有库"`.

Change graph rail label to `图谱活地图`.

Change `新建知识库` rail action to open `AddExternalDialog`:

```tsx
<RailButton
	label="图谱活地图"
	onClick={() => onSelectView("graph")}
	active={activeView === "graph"}
	disabled={!currentKb?.valid}
	badge={graphHasPendingUpdate}
>
	<Network />
</RailButton>
<div className="sidebar-rail-spacer" />
<RailButton label="设置" onClick={onOpenSettings}>
	<Settings />
</RailButton>
<RailButton label="新建知识库" onClick={() => setDialogOpen(true)}>
	<Plus />
</RailButton>
```

Keep `AddExternalDialog` rendered in collapsed and expanded branches.

- [ ] **Step 5: Update sidebar CSS**

In `workbench/web/src/index.css`, update/add these selectors:

```css
.sidebar-section {
  display: grid;
  gap: 6px;
}

.sidebar-section + .sidebar-section {
  margin-top: 16px;
}

.sidebar-section-head {
  display: flex;
  min-height: 24px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar-section-body {
  display: grid;
  gap: 3px;
}

.section-action {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--app-muted);
}

.section-action:hover {
  border-color: var(--app-border);
  background: var(--app-surface);
  color: var(--app-accent-deep);
}

.sidebar-footer-v2 {
  gap: 5px;
}

.sidebar-footer-btn-active {
  border-color: color-mix(in srgb, var(--app-accent) 28%, var(--app-border));
  background: var(--app-accent-soft);
  color: var(--app-accent-deep);
}
```

Remove CSS that only supports `.kb-children` and `.conv-new-btn` if it is no longer used by JSX.

Remove or restyle `.main-view-switch` and `.main-view-btn` only if no other component uses them. The expanded sidebar must not display this switch after Task 1.

- [ ] **Step 6: Run sidebar test and verify pass**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run full web checks for this task**

Run:

```bash
cd workbench/web
npm run typecheck
npm test
npm run lint
```

Expected: all exit `0`; existing hook warnings are acceptable only if lint already exits `0`.

- [ ] **Step 8: Browser smoke**

If the app is not already running, run:

```bash
npm run dev
```

Open `http://localhost:5180` and verify:

- Top of sidebar has collapse only.
- Middle has `笔记本` and `会话`.
- Footer has `图谱活地图`, `设置`, `新建知识库`.
- Footer `新建知识库` opens the existing folder-based knowledge-base dialog, whose title also reads `新建知识库`.
- Collapsed rail has no refresh and no `添加现有库`.
- Expanded sidebar has no old `对话 / 图谱` segmented switch.
- Click a conversation while currently on graph view; the app returns to chat view.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add workbench/web/src/App.tsx workbench/web/src/components/Sidebar.tsx workbench/web/src/components/AddExternalDialog.tsx workbench/web/src/index.css workbench/web/test/sidebar.test.tsx
git commit -m "feat: align Paper V2 sidebar shell"
```

Expected: one commit containing only sidebar and sidebar test changes.

---

### Task 2: Composer V2 Lightweight Layout

**Files:**
- Modify: `workbench/web/src/components/ChatPanel.tsx`
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/chat-panel-composer.test.tsx`

Goal: make the composer look like V2: a light inline input card with send/stop button inside the card, no permanent `就绪` row, export as a light tool strip below the card, and message/empty-state spacing that does not feel like the old heavy workbench.

- [ ] **Step 1: Strengthen composer tests**

Edit `workbench/web/test/chat-panel-composer.test.tsx` so the first test asserts:

```tsx
it("keeps send inside the composer input card and export outside it", () => {
	renderChatPanel();

	const textarea = screen.getByPlaceholderText(/写下想法/);
	const sendButton = screen.getByRole("button", { name: /发送/ });
	const composer = textarea.closest(".composer-card");
	assert.ok(composer);
	assert.equal(composer?.contains(sendButton), true);
	assert.equal(Boolean(sendButton.closest(".composer-actions")), true);
	assert.equal(composer?.querySelector(".chat-send-row"), null);
	assert.equal(screen.queryByText("就绪"), null);

	const exportBar = document.querySelector(".export-bar");
	assert.ok(exportBar);
	assert.equal(exportBar?.closest(".composer-card"), null);
	assert.equal(Boolean(exportBar?.closest(".composer-tools")), true);
});
```

Add a CSS contract test:

```tsx
it("keeps the V2 composer compact and places actions inside the card", () => {
	const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

	assert.match(css, /\.composer-card[\s\S]*border-radius:\s*14px/);
	assert.match(css, /\.composer-card[\s\S]*display:\s*flex/);
	assert.match(css, /\.composer-card[\s\S]*align-items:\s*flex-end/);
	assert.match(css, /\.chat-textarea[\s\S]*min-height:\s*40px/);
	assert.match(css, /\.chat-textarea[\s\S]*padding:\s*9px 0/);
	assert.match(css, /\.send-btn[\s\S]*width:\s*36px/);
	assert.match(css, /\.send-btn[\s\S]*height:\s*36px/);
	assert.match(css, /\.composer-tools[\s\S]*display:\s*flex/);
	assert.doesNotMatch(css, /\.chat-send-row\s*\{/);
});
```

- [ ] **Step 2: Run composer test and verify failure**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/chat-panel-composer.test.tsx
```

Expected: FAIL because current JSX still renders `.chat-send-row`, `就绪`, and export inside `.composer-card`.

- [ ] **Step 3: Update ChatPanel composer JSX**

In `workbench/web/src/components/ChatPanel.tsx`, replace the composer card bottom with:

```tsx
<div className="composer-card">
	<CommandMenu
		open={commandMenu.open}
		query={commandMenu.query}
		items={visibleCommands}
		selectedIndex={commandMenu.selected}
		onSelect={replaceCommandToken}
	/>
	<RefMenu
		open={refMenu.open}
		query={refMenu.query}
		items={refs}
		selectedIndex={refMenu.selected}
		onSelect={replaceRefToken}
	/>
	<textarea
		ref={textareaRef}
		value={input}
		onChange={(e) => {
			setInput(e.target.value);
			if (e.target.value.trim() !== ingestDismissedFor) setIngestDismissedFor(null);
			updateMenus(e.target.value, e.target.selectionStart);
		}}
		onClick={(e) => updateMenus(e.currentTarget.value, e.currentTarget.selectionStart)}
		onKeyUp={(e) => {
			if (["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
			updateMenus(e.currentTarget.value, e.currentTarget.selectionStart);
		}}
		onKeyDown={handleKeyDown}
		rows={1}
		className="chat-textarea"
		placeholder={
			currentKnowledgeBaseName
				? "写下想法…  @ 引用  / 命令  ·  ⌘↵ 发送"
				: "请先在左侧选择一个知识库…"
		}
		disabled={status === "streaming" || !currentKnowledgeBaseName}
	/>
	<div className="composer-actions">
		{(status === "streaming" || status === "error" || detectedMaterial || detectedBatch) && (
			<span className="composer-status" role={status === "error" ? "alert" : "status"}>
				{status === "streaming" ? "生成中" : status === "error" ? "出错" : "待消化"}
			</span>
		)}
		<button
			type="button"
			className={cn("send-btn", status === "streaming" && "stop-btn")}
			onClick={() => {
				if (status === "streaming") stopStreaming();
				else void sendPrompt();
			}}
			disabled={status !== "streaming" && (!input.trim() || !currentKnowledgeBaseName)}
			title={status === "streaming" ? "停止" : "发送（⌘↵）"}
		>
			{status === "streaming" ? <Square className="size-4" /> : <Send className="size-4" />}
			<span className="sr-only">{status === "streaming" ? "停止" : "发送"}</span>
		</button>
	</div>
</div>
<div className="composer-tools">
	<ExportButtons
		disabled={!currentKnowledgeBaseName || status === "streaming" || messages.length === 0}
		disabledReason={
			!currentKnowledgeBaseName
				? "请先选择知识库"
				: status === "streaming"
					? "当前正在生成"
					: "请先开始对话"
		}
		onExport={handleExport}
	/>
</div>
```

Remove the old `.chat-send-row` block.

Keep `CommandMenu` and `RefMenu` positioned relative to `.composer-card`; menus must still open above the card and stay within the viewport at 768px.

- [ ] **Step 4: Update composer CSS**

In `workbench/web/src/index.css`:

Delete the `.chat-send-row` block.

Change `.chat-textarea` to:

```css
.composer-card {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  border-radius: 14px;
  padding: 6px 7px 6px 15px;
  position: relative;
}

.chat-textarea {
  flex: 1;
  width: 100%;
  min-height: 40px;
  max-height: 160px;
  resize: none;
  border: 0;
  background: transparent;
  padding: 9px 0;
  color: var(--app-fg);
  font-size: 14.5px;
  line-height: 1.55;
  outline: none;
  box-shadow: none;
}
```

Add:

```css
.composer-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.composer-status {
  max-width: 88px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.send-btn {
  width: 36px;
  height: 36px;
  min-height: 36px;
  flex: 0 0 auto;
  border-radius: 10px;
}

.composer-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.composer-tools .export-bar {
  margin-left: auto;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 74%, transparent);
  padding: 5px 7px;
}

.composer-tools .export-bar-head {
  min-width: auto;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.composer-tools .export-hint {
  display: none;
}

.composer-tools .export-btn {
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
}
```

Tune `.chat-messages` and `.chat-empty` to keep V2's reading rhythm: empty chat stays visually quiet, existing-message chat has enough air between bubbles, and the composer remains the dominant bottom action rather than a heavy toolbar.

- [ ] **Step 5: Run composer test and verify pass**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/chat-panel-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run related chat tests**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/chat-panel-composer.test.tsx \
  test/chat-panel-bubbles.test.tsx \
  test/popup-menus.test.tsx \
  test/export-batch-paper.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Browser smoke**

Open `http://localhost:5180` and verify:

- Send button is inside input card.
- Composer starts as a light one-line input similar to V2, not a 90px-tall panel.
- `就绪` is gone.
- Export is lighter and outside the main input card.
- Empty chat and existing-message chat both keep V2-like vertical rhythm.
- Streaming, error, detected-material, and detected-batch states do not collide with typed text or the send/stop button at 1440, 1024, or 768 widths.
- `@` menu still opens.
- `/` menu still opens.
- Sending a message still works.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add workbench/web/src/components/ChatPanel.tsx workbench/web/src/index.css workbench/web/test/chat-panel-composer.test.tsx
git commit -m "feat: align Paper V2 composer"
```

Expected: one commit for composer layout only.

---

### Task 3: Tool Calls Current-Action First

**Files:**
- Modify: `workbench/web/src/components/ToolStatusRunway.tsx`
- Modify: `workbench/web/src/components/ToolHistorySummary.tsx`
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/tool-status-runway.test.ts`
- Test: `workbench/web/test/tool-history-summary.test.tsx`

Goal: active tools should say what is happening now; completed tools should be a quiet one-line summary unless expanded.

- [ ] **Step 1: Update ToolStatusRunway test for current-action copy**

In `workbench/web/test/tool-status-runway.test.ts`, add:

```ts
it("prioritizes the current tool action in one compact line", () => {
	const state = runningState();
	const html = render(state);

	assert.match(html, /tool-runway-current/);
	assert.match(html, /正在/);
	assert.match(html, /读取/);
	assert.match(html, /wiki\/mamba\.md/);
	assert.equal(html.includes("tool-runway-targets"), false);
});
```

Ensure `runningState()` returns a state with one active read item targeting `wiki/mamba.md`.

In the existing visual-limit test, remove the import and assertion for `TOOL_RUNWAY_TARGET_LIMIT` because the active runway no longer renders a target-chip list. Keep `TOOL_RUNWAY_DETAIL_LIMIT` and `TOOL_RUNWAY_UPDATE_CADENCE_MS` assertions unless the implementation no longer exports them.

- [ ] **Step 2: Update ToolHistorySummary test for lightweight completed copy**

In `workbench/web/test/tool-history-summary.test.tsx`, update first test expectations to:

```tsx
assert.match(html, /tool-history-summary/);
assert.match(html, /已完成 5 项工具调用/);
assert.match(html, /文件 2/);
assert.equal(html.includes("tool-history-targets"), false);
assert.equal(html.includes("tool-history-row"), false);
```

Add:

```tsx
it("keeps completed history collapsed until the user expands it", async () => {
	const state = completedState([
		["read-1", "read", "读取", "wiki/a.md"],
		["read-2", "read", "读取", "wiki/b.md"],
	]);
	render(<ToolHistorySummary state={state} />);

	assert.equal(screen.queryByText("wiki/a.md"), null);
	await click(screen.getByRole("button", { name: /已完成 2 项工具调用/ }));
	assert.notEqual(screen.getByText("wiki/a.md"), null);
});
```

Use `render`, `screen`, and `click` from `./render` for this DOM test.

- [ ] **Step 3: Run tool tests and verify failure**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/tool-status-runway.test.ts \
  test/tool-history-summary.test.tsx
```

Expected: FAIL because current markup still exposes target chips in the runway and the history title is `工具摘要`.

- [ ] **Step 4: Update ToolStatusRunway markup**

In `workbench/web/src/components/ToolStatusRunway.tsx`, remove `getSummaryTargets()` rendering from active display.

Render a single current line:

```tsx
const prefix = status === "running" ? "正在" : statusLabel;

return (
	<div className={`tool-runway tool-runway-${status}`} aria-label={`工具状态：${statusLabel}`}>
		<div className="tool-runway-pulse" aria-hidden="true" />
		<div className="tool-runway-main">
			<div className="tool-runway-current">
				<span className="tool-runway-status">{prefix}</span>
				{formatted && <span className="tool-runway-action">{formatted.action}</span>}
				{formatted && <span className="tool-runway-target">{formatted.target}</span>}
				{active && state.active.length > 1 && (
					<span className="tool-runway-meta">另有 {state.active.length - 1} 项</span>
				)}
			</div>
		</div>
	</div>
);
```

Delete `TOOL_RUNWAY_TARGET_LIMIT`, `getSummaryTargets`, and unused imports after the test no longer imports `TOOL_RUNWAY_TARGET_LIMIT`.

- [ ] **Step 5: Update ToolHistorySummary copy and markup**

In `workbench/web/src/components/ToolHistorySummary.tsx`, change header copy:

```tsx
<span className="tool-history-title">已完成 {totalCount} 项工具调用</span>
```

Remove the folded `tool-history-targets` block from the header. Keep group pills.

Set the button accessible label through the visible title; do not add a separate aria-label.

- [ ] **Step 6: Update tool CSS**

In `workbench/web/src/index.css`, add/adjust:

```css
.tool-runway {
  max-width: min(560px, 100%);
  padding: 7px 9px;
}

.tool-runway-current {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.tool-runway-target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-history-summary {
  max-width: min(560px, 100%);
}

.tool-history-header {
  min-height: 30px;
  gap: 8px;
}

.tool-history-title {
  white-space: nowrap;
}
```

Remove CSS for `.tool-runway-targets` if no longer used by JSX.

- [ ] **Step 7: Run tool tests and verify pass**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/tool-status-runway.test.ts \
  test/tool-history-summary.test.tsx \
  test/chat-panel-tool-status.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Browser smoke**

Use an existing conversation with tool calls or trigger a tool call. Verify:

- Running tool line reads like `正在 读取 wiki/...`.
- Completed history is one light row.
- Details only show after clicking the summary.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add workbench/web/src/components/ToolStatusRunway.tsx workbench/web/src/components/ToolHistorySummary.tsx workbench/web/src/index.css workbench/web/test/tool-status-runway.test.ts workbench/web/test/tool-history-summary.test.tsx
git commit -m "feat: simplify Paper tool call display"
```

Expected: one commit for tool call display only.

---

### Task 4: Drawer Desktop Reflow And Narrow Overlay

**Files:**
- Modify: `workbench/web/src/App.tsx`
- Modify: `workbench/web/src/components/RightDrawer.tsx`
- Modify: `workbench/web/src/index.css`
- Create: `workbench/web/test/app-shell-drawer-layout.test.tsx`
- Test: `workbench/web/test/right-drawer-interactions.test.tsx`

Goal: desktop drawer is a layout column that makes main content narrower; narrow screens use overlay mode so the main area is not crushed. The success criterion is real geometry, not only the presence of CSS markers.

- [ ] **Step 1: Create drawer layout CSS contract test**

Create `workbench/web/test/app-shell-drawer-layout.test.tsx`:

```tsx
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("App shell drawer layout", () => {
	it("uses desktop drawer reflow and narrow overlay contracts", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

			assert.match(css, /\.app-body\[data-drawer-open="true"\][\s\S]*\.shell-main/);
			assert.match(css, /\.shell-main[\s\S]*min-width:\s*0/);
			assert.match(css, /\.drawer-panel-open[\s\S]*width:\s*var\(--drawer-width/);
			assert.match(css, /@media \(max-width:\s*1023px\)[\s\S]*\.drawer-panel-open[\s\S]*position:\s*fixed/);
			assert.match(css, /@media \(max-width:\s*1023px\)[\s\S]*\.drawer-panel-open[\s\S]*inset:\s*60px 0 0 auto/);
		});
	});
```

- [ ] **Step 2: Update RightDrawer interaction test for layout marker**

In `workbench/web/test/right-drawer-interactions.test.tsx`, add:

```tsx
it("marks the drawer as open for shell layout", () => {
	renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }));

	const drawer = document.querySelector(".drawer-panel-open");
	assert.ok(drawer);
	assert.equal(drawer?.getAttribute("data-drawer-open"), "true");
});
```

- [ ] **Step 3: Run drawer layout tests and verify failure**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/app-shell-drawer-layout.test.tsx \
  test/right-drawer-interactions.test.tsx
```

Expected: FAIL because the CSS contract and drawer data marker are not complete.

- [ ] **Step 4: Add shell drawer marker in App**

In `workbench/web/src/App.tsx`, compute:

```tsx
const drawerOpen = drawer.mode !== "closed";
```

Set it on `.app-body`:

```tsx
<div className="app-body" data-drawer-open={drawerOpen ? "true" : "false"}>
```

- [ ] **Step 5: Add drawer marker in RightDrawer**

In `workbench/web/src/components/RightDrawer.tsx`, add the data attribute:

```tsx
<aside
	className={cn("drawer-panel drawer-panel-open", fullscreen && "drawer-panel-fullscreen")}
	data-drawer-open="true"
	style={{ "--drawer-width": `${width}px` } as CSSProperties}
>
```

- [ ] **Step 6: Update shell/drawer CSS**

In `workbench/web/src/index.css`, ensure these contracts exist:

```css
.shell-main {
  min-width: 0;
  transition: width 0.2s ease, flex-basis 0.2s ease;
}

.app-body[data-drawer-open="true"] .shell-main {
  min-width: 0;
}

.drawer-panel-open {
  width: var(--drawer-width, 420px);
  min-width: var(--drawer-width, 420px);
}

@media (max-width: 1023px) {
  .app-body[data-drawer-open="true"] .shell-main {
    width: 100%;
    min-width: 0;
  }

  .drawer-panel-open {
    position: fixed;
    inset: 60px 0 0 auto;
    z-index: 45;
    width: min(var(--drawer-width, 420px), 92vw);
    min-width: min(var(--drawer-width, 420px), 92vw);
    max-width: 92vw;
  }
}
```

If `.app-body` already has mobile rules, merge this into the existing media block rather than creating conflicting duplicate behavior.

Use `1023px` as the overlay cutoff unless browser QA proves 1024 is still comfortable with the drawer as a column. This keeps the 1024 tablet pass usable and avoids squeezing the chat/composer into a narrow strip.

- [ ] **Step 7: Run drawer tests and verify pass**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test \
  test/app-shell-drawer-layout.test.tsx \
  test/right-drawer-interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Browser smoke**

At 1440px:

- Open a wiki drawer from search or a wiki link.
- Main area and composer remain visible.
- Composer right edge is at least 8px left of drawer left edge.
- Resize drawer; main remains visible.
- Composer width changes with the main area and remains at least 420px wide.

At 1024px:

- Drawer uses overlay behavior or otherwise leaves the composer at least 420px wide.
- No horizontal page overflow.

At 768px:

- Drawer overlays from the right.
- Main area is not squeezed into an unusable column.
- Composer remains visible and clickable behind/around the overlay behavior.
- No horizontal page overflow.
- Close/fullscreen still works.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add workbench/web/src/App.tsx workbench/web/src/components/RightDrawer.tsx workbench/web/src/index.css workbench/web/test/app-shell-drawer-layout.test.tsx workbench/web/test/right-drawer-interactions.test.tsx
git commit -m "feat: reflow Paper drawer layout"
```

Expected: one commit for drawer layout only.

---

### Task 5: Graph Shell Non-Overlapping V2 Layout

**Files:**
- Modify: `workbench/web/src/components/GraphPanel.tsx`
- Modify: `workbench/web/src/index.css`
- Test: `workbench/web/test/graph-panel-paper.test.tsx`

Goal: graph toolbar and graph stage are distinct regions; toolbar does not overlay or compress the canvas. Keep V2's top graph-bar feel for React-owned shell controls: title/actions/stats/legend live in the toolbar area, while the Sigma canvas remains a separate stage. The existing graph-engine search control stays inside the engine layer for now; this task must not modify `packages/graph-engine`. Use `图谱活地图` naming where user-facing.

- [ ] **Step 1: Update GraphPanel test expectations**

In `workbench/web/test/graph-panel-paper.test.tsx`, change the first test to expect:

```tsx
const toolbar = screen.getByRole("banner", { name: "图谱工具栏" });
assert.equal(toolbar.classList.contains("graph-shell-toolbar"), true);
assert.match(toolbar.textContent ?? "", /图谱活地图/);
assert.ok(screen.getByRole("button", { name: /重置布局/ }));
assert.ok(screen.getByRole("button", { name: /重构/ }));
assert.notEqual(toolbar.querySelector(".graph-shell-legend"), null);

const shell = document.querySelector(".graph-shell");
const stage = document.querySelector(".graph-stage");
assert.ok(shell);
assert.ok(stage);
assert.equal(shell?.contains(toolbar), true);
assert.equal(shell?.contains(stage), true);
assert.equal(stage?.contains(toolbar), false);
```

Change CSS contract assertions:

```ts
assert.match(css, /\.graph-shell\s*\{[\s\S]*display:\s*grid/);
assert.match(css, /\.graph-shell-toolbar[\s\S]*position:\s*relative/);
assert.match(css, /\.graph-stage[\s\S]*min-height:\s*0/);
assert.match(css, /\.graph-shell-legend[\s\S]*display:\s*flex/);
assert.doesNotMatch(css, /\.graph-shell-toolbar[\s\S]*position:\s*absolute/);
```

- [ ] **Step 2: Run graph test and verify failure**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/graph-panel-paper.test.tsx
```

Expected: FAIL because `.graph-shell` and toolbar-contained legend are not yet present and copy still says `结构地图`.

- [ ] **Step 3: Update GraphPanel JSX**

In `workbench/web/src/components/GraphPanel.tsx`, wrap toolbar/stage:

```tsx
return (
	<div className="graph-screen" data-graph-status={status} data-graph-theme={graphTheme} data-graph-animation={animationState}>
		<div className="graph-shell">
			<header className="graph-shell-toolbar" aria-label="图谱工具栏">
				<div className="graph-shell-toolbar-left">
					<span className={cn("graph-shell-toolbar-dot", status === "building" && "graph-shell-toolbar-dot-warn", status === "error" && "graph-shell-toolbar-dot-error")} />
					<div className="graph-shell-toolbar-title">
						<span>{currentKnowledgeBaseName ?? "未选择知识库"}</span>
						<small>图谱活地图</small>
					</div>
					<span className="graph-shell-toolbar-chip">{statusLabel(status)}</span>
					{hasReadyGraph && (
						<span className="graph-shell-toolbar-chip graph-shell-toolbar-chip-muted">
							{data.nodes.length} 节点 · {data.edges.length} 关联
						</span>
					)}
					<div className="graph-shell-legend" aria-label="图谱图例">
						<span><span className="graph-legend-dot graph-legend-dot-node" />节点</span>
						<span><span className="graph-legend-line" />关系</span>
						<span><span className="graph-legend-cloud" />社区</span>
					</div>
				</div>
				<div className="graph-shell-toolbar-actions">
					{/* keep existing reset and rebuild controls unchanged */}
				</div>
			</header>

			<div className="graph-stage">
				{/* keep existing graph-stage children unchanged */}
			</div>
		</div>
	</div>
);
```

Do not change engine initialization or `graph-host`.

- [ ] **Step 4: Update graph CSS**

In `workbench/web/src/index.css`, add:

```css
.graph-screen {
  display: flex;
  min-height: 0;
  min-width: 0;
}

.graph-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  min-width: 0;
  flex: 1;
  gap: 10px;
}

.graph-shell-toolbar {
  position: relative;
  z-index: 1;
}

.graph-stage {
  min-height: 0;
}

.graph-shell-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--app-muted);
  font-size: 11px;
}

.graph-shell-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.graph-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-accent);
}

.graph-legend-line {
  width: 16px;
  height: 1px;
  background: color-mix(in srgb, var(--app-fg) 46%, transparent);
}

.graph-legend-cloud {
  width: 14px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--comm-seq) 42%, transparent);
}
```

Add responsive toolbar wrapping if absent:

```css
@media (max-width: 900px) {
  .graph-shell-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .graph-shell-toolbar-left,
  .graph-shell-toolbar-actions {
    width: 100%;
  }

  .graph-shell-toolbar-actions {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
```

- [ ] **Step 5: Run graph test and verify pass**

Run:

```bash
cd workbench/web && node --import tsx --import ./test/setup-dom.ts --test test/graph-panel-paper.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Browser smoke**

At 1440, 1024, and 768:

- Switch to graph view.
- Toolbar appears above graph stage.
- Toolbar never overlaps the stage.
- Reset, rebuild, stats, and legend are visible in the toolbar and do not sit on top of the canvas.
- Existing graph-engine search still opens/focuses inside the stage without colliding with the React toolbar.
- Graph empty/loading/building/error/no-knowledge-base states still render inside the stage without overlapping toolbar controls.
- Reset and rebuild buttons still work.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add workbench/web/src/components/GraphPanel.tsx workbench/web/src/index.css workbench/web/test/graph-panel-paper.test.tsx
git commit -m "feat: align Paper V2 graph shell"
```

Expected: one commit for graph shell only.

---

### Task 6: V2 Shell Visual Regression Cases

**Files:**
- Modify: `workbench/web/test/visual/paper-ui.ts`

Goal: visual regression script captures the V2 shell states that matter and compares them against the V2 prototype: sidebar, chat with drawer, composer, graph, desktop/tablet/narrow. Do not modify product code for visual-test convenience.

- [ ] **Step 1: Add visual case type flags**

In `workbench/web/test/visual/paper-ui.ts`, extend `PaperVisualCase`:

```ts
type PaperVisualCase = {
	name: string;
	description: string;
	prefs: PaperPrefs;
	viewport?: { width: number; height: number };
	view?: "chat" | "graph";
	fonts?: "normal" | "blocked";
	drawer?: "wiki";
	sidebar?: "expanded" | "collapsed";
	v2Focus?: "sidebar" | "composer" | "drawer" | "graph";
};
```

- [ ] **Step 2: Add V2 shell cases**

Append these cases to `cases`:

```ts
{
	name: "v2-sidebar-expanded-1440",
	description: "V2 expanded sidebar with notebooks, conversations, and footer actions",
	prefs: defaultPrefs,
	sidebar: "expanded",
	v2Focus: "sidebar",
},
{
	name: "v2-sidebar-collapsed-1440",
	description: "V2 collapsed sidebar rail",
	prefs: defaultPrefs,
	sidebar: "collapsed",
	v2Focus: "sidebar",
},
{
	name: "v2-composer-1440",
	description: "V2 lightweight composer and chat rhythm",
	prefs: defaultPrefs,
	v2Focus: "composer",
},
{
	name: "v2-composer-768",
	description: "V2 lightweight composer at narrow width",
	prefs: defaultPrefs,
	viewport: { width: 768, height: 820 },
	v2Focus: "composer",
},
{
	name: "v2-chat-drawer-1440",
	description: "V2 chat shell with right drawer open",
	prefs: defaultPrefs,
	drawer: "wiki",
	v2Focus: "drawer",
},
{
	name: "v2-chat-drawer-1024",
	description: "V2 tablet chat shell with right drawer open",
	prefs: defaultPrefs,
	drawer: "wiki",
	viewport: { width: 1024, height: 820 },
	v2Focus: "drawer",
},
{
	name: "v2-chat-drawer-768",
	description: "V2 narrow chat shell with drawer overlay",
	prefs: defaultPrefs,
	drawer: "wiki",
	viewport: { width: 768, height: 820 },
	v2Focus: "drawer",
},
{
	name: "v2-graph-shell-1440",
	description: "V2 graph shell with toolbar, search, stats, legend, and stage",
	prefs: defaultPrefs,
	view: "graph",
	v2Focus: "graph",
},
{
	name: "v2-graph-shell-1024",
	description: "V2 graph shell at tablet width",
	prefs: defaultPrefs,
	view: "graph",
	viewport: { width: 1024, height: 820 },
	v2Focus: "graph",
},
{
	name: "v2-graph-shell-768",
	description: "V2 graph shell at narrow width",
	prefs: defaultPrefs,
	view: "graph",
	viewport: { width: 768, height: 820 },
	v2Focus: "graph",
},
```

- [ ] **Step 3: Seed case state before reload**

Inside the existing `page.evaluate((prefs) => { ... })`, store:

```ts
localStorage.setItem("llm-wiki-agent-sidebar-collapsed", prefs.sidebar === "collapsed" ? "true" : "false");
```

Include `sidebar: visualCase.sidebar` in the object passed to `page.evaluate`.

- [ ] **Step 4: Open drawer cases through the real search flow**

Do not add a DEV-only event listener to `App.tsx`. Open the drawer through existing UI so the visual case also protects search/open-page behavior:

```ts
async function openWikiDrawerFromSearch(page: Page) {
	await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
	await page.waitForSelector(".search-panel", { timeout: 5_000 });
	await page.waitForSelector(".search-result-main", { timeout: 10_000 });
	await page.locator(".search-result-main").first().click();
	await page.waitForSelector(".drawer-panel-open", { timeout: 10_000 });
	await page.waitForSelector(".search-panel", { state: "detached", timeout: 5_000 }).catch(() => undefined);
}
```

After `await waitForStableVisualState(page, visualCase);`, call:

```ts
if (visualCase.drawer === "wiki") {
	await openWikiDrawerFromSearch(page);
	await waitForStableVisualState(page, visualCase);
}
```

- [ ] **Step 5: Update graph selectors for the Task 5 shell nesting**

Update old direct-child selectors in the visual script:

```ts
document.querySelector(".graph-screen .graph-shell-toolbar");
document.querySelector(".graph-screen .graph-stage");
```

Also update `waitForStableVisualState()` from `.graph-screen > .graph-stage` to `.graph-screen .graph-stage`.

- [ ] **Step 6: Add visual geometry assertions**

In state extraction, include:

```ts
const sidebar = document.querySelector(".shell-sidebar");
const sidebarFooter = document.querySelector(".sidebar-footer");
const main = document.querySelector(".shell-main");
const drawer = document.querySelector(".drawer-panel-open");
const composer = document.querySelector(".composer-card");
const textarea = document.querySelector(".chat-textarea");
const sendButton = document.querySelector(".send-btn");
const graphShell = document.querySelector(".graph-shell");
const graphToolbar = document.querySelector(".graph-screen .graph-shell-toolbar");
const graphStage = document.querySelector(".graph-screen .graph-stage");
const graphLegend = document.querySelector(".graph-shell-legend");
const graphSearch = document.querySelector(".graph-stage .graph-search, .graph-stage [aria-label='搜索图谱']");
return {
	// existing fields...
	sidebarText: sidebar?.textContent?.replace(/\s+/g, " ").trim() ?? null,
	sidebarFooterText: sidebarFooter?.textContent?.replace(/\s+/g, " ").trim() ?? null,
	sidebarRect: sidebar ? rectOf(sidebar) : null,
	mainRect: main ? rectOf(main) : null,
	drawerRect: drawer ? rectOf(drawer) : null,
	drawerOpen: Boolean(drawer),
	composerRect: composer ? rectOf(composer) : null,
	textareaRect: textarea ? rectOf(textarea) : null,
	sendRect: sendButton ? rectOf(sendButton) : null,
	graphShellRect: graphShell ? rectOf(graphShell) : null,
	graphToolbarRect: graphToolbar ? rectOf(graphToolbar) : null,
	graphStageRect: graphStage ? rectOf(graphStage) : null,
	graphSearchRect: graphSearch ? rectOf(graphSearch) : null,
	graphLegendText: graphLegend?.textContent?.replace(/\s+/g, " ").trim() ?? null,
	graphSearchVisible: Boolean(graphSearch),
};
```

Define `rectOf` inside the page evaluate:

```ts
function rectOf(element: Element) {
	const box = element.getBoundingClientRect();
	return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
}
```

Assert:

```ts
if (visualCase.name.includes("sidebar")) {
	assertTextIncludes(state.sidebarFooterText, "新建知识库", visualCase.name);
	assertTextExcludes(state.sidebarFooterText, "添加现有库", visualCase.name);
	assertTextIncludes(state.sidebarText, "笔记本", visualCase.name);
	assertTextIncludes(state.sidebarText, "会话", visualCase.name);
	assertTextExcludes(state.sidebarText, "刷新", visualCase.name);
}
if (visualCase.v2Focus === "composer") {
	const composer = asRect(state.composerRect);
	const textarea = asRect(state.textareaRect);
	const send = asRect(state.sendRect);
	if (!composer || !textarea || !send) throw new Error(`${visualCase.name}: missing composer geometry`);
	if (composer.height > 72) throw new Error(`${visualCase.name}: composer too tall for V2 (${composer.height}px)`);
	if (Math.abs(send.width - 36) > 1 || Math.abs(send.height - 36) > 1) {
		throw new Error(`${visualCase.name}: send button should be 36x36`);
	}
	if (textarea.right > send.left - 4) throw new Error(`${visualCase.name}: textarea collides with send button`);
}
if (visualCase.drawer === "wiki") {
	const drawer = asRect(state.drawerRect);
	const composer = asRect(state.composerRect);
	if (!state.drawerOpen || !drawer || !composer) throw new Error(`${visualCase.name}: expected drawer and composer geometry`);
	const viewportWidth = Number(state.viewportWidth);
	if (viewportWidth >= 1024 && composer.right > drawer.left - 8) {
		throw new Error(`${visualCase.name}: drawer overlaps composer`);
	}
	if (viewportWidth >= 1024 && composer.width < 420) {
		throw new Error(`${visualCase.name}: composer squeezed too narrow (${composer.width}px)`);
	}
}
if (visualCase.view === "graph" && !state.graphShellRect) {
	throw new Error(`${visualCase.name}: expected graph shell`);
}
if (visualCase.view === "graph") {
	const toolbar = asRect(state.graphToolbarRect);
	const stage = asRect(state.graphStageRect);
	const search = asRect(state.graphSearchRect);
	if (!toolbar || !stage) throw new Error(`${visualCase.name}: missing graph toolbar/stage geometry`);
	if (toolbar.bottom > stage.top + 1) throw new Error(`${visualCase.name}: graph toolbar overlaps stage`);
	if (state.graphSearchVisible && search && search.top < stage.top - 1) {
		throw new Error(`${visualCase.name}: graph search escaped stage`);
	}
	assertTextIncludes(state.graphLegendText, "节点", visualCase.name);
	assertTextIncludes(state.graphLegendText, "关系", visualCase.name);
	assertTextIncludes(state.graphLegendText, "社区", visualCase.name);
}
```

Add helpers:

```ts
function assertTextIncludes(value: string | null, expected: string, name: string) {
	if (!value?.includes(expected)) throw new Error(`${name}: expected text to include ${expected}, got ${value}`);
}

function assertTextExcludes(value: string | null, unexpected: string, name: string) {
	if (value?.includes(unexpected)) throw new Error(`${name}: expected text to exclude ${unexpected}, got ${value}`);
}
```

- [ ] **Step 7: Add prototype reference screenshots**

In the same visual script, add a reference capture pass for the V2 prototype:

```ts
if (!process.env.PAPER_V2_PROTOTYPE_URL) {
	throw new Error("Set PAPER_V2_PROTOTYPE_URL to the local V2 prototype file.");
}
const v2PrototypeUrl = process.env.PAPER_V2_PROTOTYPE_URL;
const referenceDir = resolve(process.cwd(), "test-results/paper-ui/reference-v2");
```

Capture at least:

- `reference-v2-1440.png`
- `reference-v2-1024.png`
- `reference-v2-768.png`

The script does not need pixel-diff math, but it must print the actual app PNG path and the matching V2 reference PNG path next to each V2 case so the final browser review has explicit comparison files.

- [ ] **Step 8: Run visual script**

Run:

```bash
cd workbench/web
npm run visual:paper
```

Expected: exits `0` and creates actual PNGs including:

- `v2-sidebar-expanded-1440.png`
- `v2-sidebar-collapsed-1440.png`
- `v2-composer-1440.png`
- `v2-composer-768.png`
- `v2-chat-drawer-1440.png`
- `v2-chat-drawer-1024.png`
- `v2-chat-drawer-768.png`
- `v2-graph-shell-1440.png`
- `v2-graph-shell-1024.png`
- `v2-graph-shell-768.png`

Also confirm reference PNGs exist in `test-results/paper-ui/reference-v2/`.

- [ ] **Step 9: Side-by-side V2 review**

Open or inspect the generated app PNGs against the matching V2 prototype PNGs. Pass only if:

- Sidebar proportions, bottom actions, warm paper color, density, and muted borders feel close to V2.
- Composer is a light one-line starting input, not a heavy panel.
- Drawer-open desktop screenshots show the main/composer yielding cleanly.
- Narrow drawer screenshots use overlay behavior without horizontal overflow.
- Graph toolbar/stats/legend sit above the stage; graph-engine search, if visible, stays inside the stage and does not collide with the React toolbar.
- Buttons, colors, border radii, and shadows do not look like generic rounded-card UI.

- [ ] **Step 10: Commit Task 6**

Run:

```bash
git add workbench/web/test/visual/paper-ui.ts
git commit -m "test: cover Paper V2 shell visuals"
```

Expected: visual test commit only.

---

### Task 7: Full V2 Shell Regression

**Files:**
- No source changes expected.

Goal: prove the V2 shell package works as a whole.

- [ ] **Step 1: Run full commands**

Run:

```bash
cd workbench/web
npm run typecheck
npm run build
npm test
npm run lint
npm run visual:paper
```

Expected: all exit `0`. Existing build chunk-size warnings and existing lint hook warnings are acceptable only if the command exits `0`.

- [ ] **Step 2: Browser desktop pass**

At `http://localhost:5180`, viewport 1440:

- Sidebar top only has collapse.
- Sidebar sections are `笔记本` and `会话`.
- Sidebar footer is `图谱活地图`, `设置`, `新建知识库`.
- Sidebar no longer shows top refresh/settings or the old `对话 / 图谱` segmented switch.
- Footer `新建知识库` opens a dialog also titled `新建知识库`.
- Composer send button is inside card and the composer starts as a light one-line input.
- Tool calls are current-action first.
- Open drawer; composer remains visible.
- Switch graph; toolbar/stats/legend are outside stage and the stage is not covered.
- Search opens with `⌘K`/`Ctrl+K`, filters current library refs, and opens a wiki drawer.
- Model switcher still reads/writes the main model.
- Appearance panel still changes paper/accent/bubble/hand/density/theme preferences.
- Export and batch digest entry points still exist.
- Drawer resize/fullscreen/close all still work.
- Graph reset and rebuild still work.

- [ ] **Step 3: Browser tablet pass**

Viewport 1024:

- TopBar does not overflow.
- Sidebar and main remain usable.
- Drawer open keeps main/composer usable, or uses overlay behavior before the composer gets too narrow.
- Graph toolbar wraps without covering canvas.
- No horizontal page overflow.

- [ ] **Step 4: Browser narrow pass**

Viewport 768:

- Sidebar behavior follows current responsive pattern.
- Drawer overlays instead of crushing main.
- Composer remains usable.
- Graph toolbar and controls do not overlap.
- Search panel, model menu, settings, and appearance controls remain reachable.

- [ ] **Step 5: V2 screenshot comparison pass**

Review the generated screenshots in `workbench/web/test-results/paper-ui/actual/` against `workbench/web/test-results/paper-ui/reference-v2/`.

Expected: no obvious drift in paper warmth, density, sidebar proportions, composer weight, drawer behavior, graph shell layout, button placement, color use, shadow strength, or border radius. If the implementation is still only “roughly 80% V2”, fix before proceeding.

- [ ] **Step 6: Leave working tree clean**

Run:

```bash
git status --short
```

Expected: no output. Do not create a final documentation-only commit for verification notes.

---

## Self-Review

### Spec Coverage

- Sidebar V2 structure: Task 1.
- Footer `新建知识库` using existing add flow: Task 1.
- `新建知识库` dialog copy alignment: Task 1.
- Original empty-library creation hidden: Task 1.
- Old expanded `对话 / 图谱` switch removed from sidebar: Task 1.
- Composer send inside input card: Task 2.
- Composer V2 compact one-line starting height: Task 2 and Task 6.
- Permanent `就绪` row removed: Task 2.
- Export retained but lighter: Task 2.
- Current-action tool display: Task 3.
- Lightweight completed tool history: Task 3.
- Desktop drawer reflow and narrow overlay: Task 4.
- Graph toolbar outside stage and no Sigma internals: Task 5.
- Visual checks and V2 prototype screenshot comparison for shell states: Task 6.
- Full 1440/1024/768 verification: Task 7.

### Placeholder Scan

This plan intentionally avoids `TBD`, `TODO`, and “implement later”. If a task cannot apply a shown snippet exactly because surrounding code changed, stop and inspect the current file before editing.

### Type Consistency

- `Sidebar` removes `onRefresh` and `onCreateWiki`; `App.tsx` call site must be updated in Task 1.
- `MainView` remains `"chat" | "graph"`.
- `RightDrawer` keeps existing drawer modes and resize/fullscreen callbacks.
- `GraphPanel` keeps existing status, build, reset, rebuild, and engine logic.
