import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { fireEvent } from "@testing-library/react";

import { RightDrawer } from "../src/components/RightDrawer";
import { SearchPanel } from "../src/components/SearchPanel";
import { artifactDrawer, graphCommunitySummaryDrawer, graphNodeSummaryDrawer, graphSelectionDrawer, wikiDrawer, type DrawerState } from "../src/lib/drawer-state";
import type { ArtifactManifest } from "../src/lib/api";
import type { GraphCommunitySummaryPayload, GraphNodeSummaryPayload, GraphSummaryCommand, Selection } from "@llm-wiki/graph-engine";
import { click, pressKey, render, screen } from "./render";

describe("RightDrawer interactions", () => {
	it("marks the drawer as open for shell layout", () => {
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }));

		const drawer = document.querySelector(".drawer-panel-open");
		assert.ok(drawer);
		assert.equal(drawer?.getAttribute("data-drawer-open"), "true");
	});

	it("resizes by dragging, keyboard shortcuts, and double click reset", async () => {
		const resizeCalls: number[] = [];
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			width: 420,
			defaultWidth: 480,
			onResize: (width) => resizeCalls.push(width),
		});

		const handle = screen.getByRole("separator", { name: "调整预览区宽度" });
		stubPointerCapture(handle);

		fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
		assert.equal(document.body.classList.contains("drawer-resizing"), true);
		fireEvent.pointerMove(handle, { clientX: 852, pointerId: 1 });
		fireEvent.pointerUp(handle, { pointerId: 1 });
		assert.equal(document.body.classList.contains("drawer-resizing"), false);

		await pressKey(handle, "ArrowLeft");
		await pressKey(handle, "ArrowRight");
		await pressKey(handle, "Home");
		fireEvent.doubleClick(handle);

		assert.deepEqual(resizeCalls, [468, 444, 396, 480, 480]);
	});

	it("hides the resize handle while fullscreen and keeps the fullscreen toggle wired", async () => {
		const fullscreenCalls: string[] = [];
		const { rerender } = renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			fullscreen: false,
			onToggleFullscreen: () => fullscreenCalls.push("toggle"),
		});

		assert.ok(screen.getByRole("separator", { name: "调整预览区宽度" }));
		await click(screen.getByRole("button", { name: "全屏" }));
		assert.deepEqual(fullscreenCalls, ["toggle"]);

		rerender(drawerElement(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			fullscreen: true,
			onToggleFullscreen: () => fullscreenCalls.push("toggle"),
		}));

		assert.equal(document.querySelector(".drawer-panel-fullscreen") !== null, true);
		assert.equal(screen.queryByRole("separator", { name: "调整预览区宽度" }), null);
		await click(screen.getByRole("button", { name: "退出全屏" }));
		assert.deepEqual(fullscreenCalls, ["toggle", "toggle"]);
	});

	it("closes from the header button and Escape key", async () => {
		const closeReasons: string[] = [];
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			onClose: (reason) => closeReasons.push(reason),
		});

		await click(screen.getByRole("button", { name: "关闭" }));
		await pressKey(document, "Escape");

		assert.deepEqual(closeReasons, ["button", "escape"]);
	});

	it("does not close the drawer when Escape closes search above it", async () => {
		const closeReasons: string[] = [];
		const searchCloses: string[] = [];
		render(
			<React.Fragment>
				{drawerElement(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
					onClose: (reason) => closeReasons.push(reason),
				})}
				<SearchPanel
					open
					refs={[{ path: "wiki/paper.md", name: "paper", title: "Paper", category: "entities" }]}
					knowledgeBaseName="AI学习知识库"
					onOpenPage={noopString}
					onClose={() => searchCloses.push("search")}
				/>
			</React.Fragment>,
		);

		await pressKey(screen.getByLabelText("搜索当前库页面"), "Escape");

		assert.deepEqual(searchCloses, ["search"]);
		assert.deepEqual(closeReasons, []);
	});

	it("switches artifact tabs without losing the active tab class", async () => {
		const selectedIds: string[] = [];
		renderDrawer(artifactDrawer([artifact("art-html", "Paper HTML", "html"), artifact("art-pdf", "Paper PDF", "pdf")], "art-html"), {
			onSelectArtifact: (id) => selectedIds.push(id),
		});

		const first = screen.getByRole("button", { name: /Paper HTML/ });
		const second = screen.getByRole("button", { name: /Paper PDF/ });
		assert.equal(first.classList.contains("drawer-tab-active"), true);
		assert.equal(second.classList.contains("drawer-tab-active"), false);

		await click(second);

		assert.deepEqual(selectedIds, ["art-pdf"]);
	});

	it("dispatches select-neighbors when the +邻居 command is clicked", async () => {
		const commands: GraphSummaryCommand[] = [];
		renderDrawer(graphNodeSummaryDrawer(nodeSummaryFixture()), {
			onGraphSummaryCommand: (command) => commands.push(command),
		});

		await click(screen.getByRole("button", { name: "+邻居" }));

		assert.deepEqual(commands, [{ kind: "select-neighbors", nodeId: "alpha-node", label: "+邻居" }]);
	});

	it("dispatches free-text send as a free graph selection question", async () => {
		const asks: Array<{ actionId: string | null; newConversation: boolean }> = [];
		renderDrawer(graphSelectionDrawer(selectionFixture(), "Alpha/Beta", "只看这两页的差异"), {
			onGraphSelectionAsk: (actionId, newConversation) => asks.push({ actionId, newConversation }),
		});

		await click(screen.getByRole("button", { name: "发送" }));

		assert.deepEqual(asks, [{ actionId: null, newConversation: false }]);
	});

	it("dispatches empty new-conversation from selection drawer with no explicit clicked action", async () => {
		const asks: Array<{ actionId: string | null; newConversation: boolean }> = [];
		renderDrawer(graphSelectionDrawer(selectionFixture(), "Alpha/Beta", ""), {
			onGraphSelectionAsk: (actionId, newConversation) => asks.push({ actionId, newConversation }),
		});

		await click(screen.getByRole("button", { name: "新对话" }));

		assert.deepEqual(asks, [{ actionId: null, newConversation: true }]);
	});

	it("dispatches community free-text send and empty new-conversation without an explicit clicked action", async () => {
		const asks: Array<{ actionId: string | null; newConversation: boolean }> = [];
		const { rerender } = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture(), "帮我判断下一步读什么"), {
			onGraphCommunityAsk: (actionId, newConversation) => asks.push({ actionId, newConversation }),
		});

		await click(screen.getByRole("button", { name: "发送" }));
		assert.deepEqual(asks, [{ actionId: null, newConversation: false }]);

		asks.length = 0;
		rerender(drawerElement(graphCommunitySummaryDrawer(communitySummaryFixture(), ""), {
			onGraphCommunityAsk: (actionId, newConversation) => asks.push({ actionId, newConversation }),
		}));
		await click(screen.getByRole("button", { name: "新对话" }));

		assert.deepEqual(asks, [{ actionId: null, newConversation: true }]);
	});

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

	it("preserves community core node preview callbacks", () => {
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

	it("clears core node preview before opening the node summary drawer", async () => {
		const previews: Array<string | null> = [];
		const selectedNodeIds: string[] = [];
		renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()), {
			onGraphSummaryNodePreview: (nodeId) => previews.push(nodeId),
			onGraphSummaryNodeSelect: (nodeId) => selectedNodeIds.push(nodeId),
		});

		const row = screen.getByRole("button", { name: /Alpha node/ });
		fireEvent.mouseEnter(row);
		await click(row);

		assert.deepEqual(previews, ["alpha-node", null]);
		assert.deepEqual(selectedNodeIds, ["alpha-node"]);
	});

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

		rerender(drawerElement(graphCommunitySummaryDrawer(first)));
		assert.ok(screen.getByRole("button", { name: /Alpha node/ }));
		assert.ok(screen.getByRole("button", { name: /Gamma node/ }));
		assert.equal(screen.queryByRole("button", { name: /Delta node/ }), null);
		assert.ok(screen.getByRole("button", { name: "查看全部" }));
	});
});

function nodeSummaryFixture(): GraphNodeSummaryPayload {
	return {
		kind: "node-summary",
		object: { kind: "node", nodeId: "alpha-node" },
		nodeId: "alpha-node",
		label: "Alpha node",
		type: "topic",
		communityId: "alpha",
		sourcePath: "wiki/alpha.md",
		summary: null,
		connectionCount: 2,
		searchHit: false,
		pinHint: { nodeId: "alpha-node", wikiPath: "wiki/alpha.md", pinned: false, position: null },
		selection: {
			input: { kind: "node", id: "alpha-node" },
			selectionId: "node:alpha-node",
			selectedNodeIds: ["alpha-node"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "open-detail-read", nodeId: "alpha-node", path: "wiki/alpha.md", label: "打开详情" },
			{ kind: "select-neighbors", nodeId: "alpha-node", label: "+邻居" },
			{ kind: "set-fixed-position", mode: "fix", nodeId: "alpha-node", wikiPath: "wiki/alpha.md", label: "固定位置" },
		],
	};
}

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

function selectionFixture(): Selection {
	return {
		id: "nodes:a,b",
		nodeIds: ["a", "b"],
		communityIds: ["alpha", "beta"],
		facts: { pageCount: 2, internalLinkCount: 0, communityCount: 2, isolatedCount: 0 },
		input: { kind: "nodes", ids: ["a", "b"] },
		actions: [],
	};
}

function renderDrawer(drawer: DrawerState, props: Partial<RightDrawerProps> = {}) {
	return render(drawerElement(drawer, props));
}

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

type RightDrawerProps = React.ComponentProps<typeof RightDrawer>;

function stubPointerCapture(element: Element) {
	Object.defineProperties(element, {
		setPointerCapture: { configurable: true, value: () => {} },
		hasPointerCapture: { configurable: true, value: () => true },
		releasePointerCapture: { configurable: true, value: () => {} },
	});
}

function artifact(id: string, title: string, kind: ArtifactManifest["kind"]): ArtifactManifest {
	const extension = kind === "html" ? "html" : kind;
	return {
		id,
		kind,
		renderer: kind === "html" ? "iframe" : "download-only",
		metadata: {
			title,
			createdAt: "2026-06-20T00:00:00.000Z",
			sourceConversationId: "conversation-1",
			sourceKbPath: "/kb",
			sourceSkill: "paper",
			sizeBytes: 128,
		},
		files: [{ name: `artifact.${extension}`, sizeBytes: 128, mimeType: "text/plain" }],
		primaryFile: `artifact.${extension}`,
	};
}

function noop() {}
function noopString() {}
function noopNumber() {}
function noopClose() {}
function noopPreviewNode() {}
function noopSelectionAsk() {}
