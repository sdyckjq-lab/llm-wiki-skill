import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { act, renderHook } from "@testing-library/react";
import type { GraphData, GraphOpenPagePayload, GraphSummaryObjectRef, GraphVisibilityState, PinMap, Selection } from "@llm-wiki/graph-engine";

import { useActiveMapReadingWorkflow } from "../src/lib/use-active-map-reading-workflow";
import {
	closedDrawer,
	graphCommunitySummaryDrawer,
	graphNodeSummaryDrawer,
	graphReaderDrawer,
	graphSelectionDrawer,
	wikiDrawer,
	type DrawerState,
} from "../src/lib/drawer-state";
import type { GraphSelectionCommand } from "../src/lib/graph-summary-actions";

describe("useActiveMapReadingWorkflow", () => {
	it("executes planned workflow results through the workbench capabilities", () => {
		const selectionCommands: GraphSelectionCommand[] = [];
		const temporaryObjects: Array<GraphSummaryObjectRef | null> = [];
		const focusClears: Array<string | null> = [];
		const pageReads: GraphOpenPagePayload[] = [];
		const handoffs: string[] = [];
		const drawer = graphSelectionDrawer(manualMultiSelection(), "Alpha/Beta", "只看差异");

		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: emptyPins,
			visibility: null,
			temporaryObject: null,
			setTemporaryObject: (object) => temporaryObjects.push(object),
			setSelectionCommand: (command) => selectionCommands.push(command),
			setGraphFocusPath: (path) => focusClears.push(path),
			createCommandId: (prefix) => `${prefix}-id`,
			onPageReadRequest: (request) => pageReads.push(request.payload),
			onConversationHandoff: (handoff) => handoffs.push(handoff.displayText),
		}));

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.runEvent({
			type: "graph-summary-command",
			command: { kind: "show-this-object", object: { kind: "node", nodeId: "b" }, label: "显示节点" },
		}));

		assert.deepEqual(temporaryObjects, [{ kind: "node", nodeId: "b" }]);
		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.deepEqual(selectionCommands.at(-1), {
			id: "show-temporary-object-id",
			object: { kind: "node", nodeId: "b" },
			type: "show-temporary-object",
		});

		act(() => result.current.runEvent({
			type: "graph-summary-command",
			command: { kind: "open-detail-read", nodeId: "a", path: "wiki/a.md", label: "打开详情" },
		}));
		assert.equal(pageReads.at(-1)?.node.id, "a");

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.runEvent({ type: "graph-selection-ask", actionId: null, newConversation: false }));
		assert.equal(result.current.drawer.mode, "closed");
		assert.match(handoffs.at(-1) ?? "", /只看差异/);

		act(() => result.current.setDrawer(wikiDrawer("wiki/a.md")));
		act(() => result.current.executePlan({ drawer: closedDrawer(), clearGraphFocusPath: true }));
		assert.deepEqual(focusClears, [null]);
	});

	it("reuses the drawer exit rail when entering community reading", () => {
		const drawer = graphCommunitySummaryDrawer(communitySummaryPayloadFixture());
		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: emptyPins,
			visibility: null,
			temporaryObject: null,
			createCommandId: (prefix) => `${prefix}-id`,
		}));

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.runEvent({
			type: "graph-summary-command",
			command: { kind: "enter-community", communityId: "c1", label: "进入社区" },
			reducedMotion: false,
		}));

		assert.equal(result.current.drawer, drawer);
		assert.equal(result.current.drawerExitIsExiting, true);
		assert.equal(result.current.isDrawerExitProtected(drawer), true);

		act(() => result.current.runEvent({ type: "graph-selection-change", selection: null }));
		assert.equal(result.current.drawer, drawer);
		assert.equal(result.current.drawerExitIsExiting, true);

		act(() => result.current.handleDrawerExitComplete());
		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(result.current.drawerExitIsExiting, false);
	});

	it("plans with the latest drawer and graph state when events run after rerender", () => {
		const commands: GraphSelectionCommand[] = [];
		const { result, rerender } = renderHook(
			({ data }: { data: GraphData | null }) => useActiveMapReadingWorkflow({
				data,
				pins: emptyPins,
				visibility: null,
				temporaryObject: null,
				setSelectionCommand: (command) => commands.push(command),
				createCommandId: (prefix) => `${prefix}-id`,
			}),
			{ initialProps: { data: graphFixture() as GraphData | null } },
		);

		act(() => result.current.setDrawer(graphCommunitySummaryDrawer(communitySummaryPayloadFixture())));
		rerender({ data: graphFixtureWithRenamedNode() });
		act(() => result.current.runEvent({ type: "graph-summary-node-select", nodeId: "a" }));

		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.equal(result.current.drawer.mode === "graph-node-summary" ? result.current.drawer.payload.label : null, "Alpha renamed");

		act(() => result.current.runEvent({ type: "graph-summary-node-preview", nodeId: "a" }));
		assert.deepEqual(commands.at(-1), { id: "preview-a-id", nodeId: "a", type: "preview-node" });
	});

	it("handles graph canvas selections and clears through user-action methods", () => {
		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: emptyPins,
			visibility: null,
			temporaryObject: null,
			createCommandId: (prefix) => `${prefix}-id`,
		}));

		act(() => result.current.handleGraphSelectionChange(nodeSelection()));
		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.equal(result.current.drawer.mode === "graph-node-summary" ? result.current.drawer.payload.nodeId : null, "a");

		act(() => result.current.handleGraphSelectionChange(communitySelection()));
		assert.equal(result.current.drawer.mode, "graph-community-summary");
		assert.equal(result.current.drawer.mode === "graph-community-summary" ? result.current.drawer.payload.communityId : null, "c1");

		act(() => result.current.handleGraphSelectionChange(manualSingleSelection()));
		assert.equal(result.current.drawer.mode, "graph-selection");
		assert.deepEqual(result.current.drawer.mode === "graph-selection" ? result.current.drawer.selection.nodeIds : [], ["a"]);

		act(() => result.current.handleGraphSelectionChange(manualMultiSelection()));
		assert.equal(result.current.drawer.mode, "graph-selection");
		assert.deepEqual(result.current.drawer.mode === "graph-selection" ? result.current.drawer.selection.nodeIds : [], ["a", "b"]);

		act(() => result.current.handleGraphSelectionChange(null));
		assert.equal(result.current.drawer.mode, "closed");
	});

	it("handles graph data, visibility, and sync refresh paths through the manager", () => {
		const graphDataUpdates: Array<GraphData | null> = [];
		const visibilityUpdates: Array<GraphVisibilityState | null> = [];
		const temporaryObjects: Array<GraphSummaryObjectRef | null> = [];
		const { result, rerender } = renderHook(
			({ data, pins, visibility, temporaryObject }: {
				data: GraphData | null;
				pins: PinMap;
				visibility: GraphVisibilityState | null;
				temporaryObject: GraphSummaryObjectRef | null;
			}) => useActiveMapReadingWorkflow({
				data,
				pins,
				visibility,
				temporaryObject,
				setData: (nextData) => graphDataUpdates.push(nextData),
				setVisibility: (nextVisibility) => visibilityUpdates.push(nextVisibility),
				setTemporaryObject: (object) => temporaryObjects.push(object),
				createCommandId: (prefix) => `${prefix}-id`,
			}),
			{
				initialProps: {
					data: graphFixture() as GraphData | null,
					pins: emptyPins,
					visibility: null as GraphVisibilityState | null,
					temporaryObject: { kind: "node", nodeId: "a" } as GraphSummaryObjectRef | null,
				},
			},
		);

		act(() => result.current.setDrawer(graphNodeSummaryDrawer(nodeSummaryPayloadFixture())));
		const renamed = graphFixtureWithRenamedNode();
		act(() => result.current.handleGraphDataChange(renamed));
		assert.equal(graphDataUpdates.at(-1), renamed);
		rerender({
			data: renamed,
			pins: emptyPins,
			visibility: null,
			temporaryObject: { kind: "node", nodeId: "a" },
		});
		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.equal(result.current.drawer.mode === "graph-node-summary" ? result.current.drawer.payload.label : null, "Alpha renamed");
		assert.deepEqual(temporaryObjects.at(-1), { kind: "node", nodeId: "a" });
		const temporaryUpdateCountAfterDirectRefresh = temporaryObjects.length;
		act(() => result.current.syncGraphDataAndVisibility());
		assert.equal(temporaryObjects.length, temporaryUpdateCountAfterDirectRefresh);

		const graphPins = { "wiki/a.md": { x: 1, y: 2 } } as PinMap;
		act(() => result.current.handleGraphPinsChange(graphPins));
		rerender({
			data: renamed,
			pins: graphPins,
			visibility: null,
			temporaryObject: { kind: "node", nodeId: "a" },
		});
		act(() => result.current.syncGraphDataAndVisibility());
		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.equal(
			result.current.drawer.mode === "graph-node-summary"
				? result.current.drawer.payload.pinHint.pinned
				: false,
			true,
		);

		const visibility = { ...emptyVisibility(), hiddenReadingNodeId: "a" };
		act(() => result.current.handleGraphVisibilityChange(visibility));
		assert.equal(visibilityUpdates.at(-1), visibility);

		act(() => result.current.setDrawer(wikiDrawer("wiki/a.md", { content: "Alpha" })));
		rerender({
			data: graphFixtureWithoutNodeA(),
			pins: graphPins,
			visibility,
			temporaryObject: { kind: "node", nodeId: "a" },
		});
		act(() => result.current.syncGraphDataAndVisibility());
		assert.equal(result.current.drawer.mode, "wiki");
		assert.equal(temporaryObjects.at(-1), null);
	});

	it("dispatches graph view reset, pinning, preview, and temporary-object commands", () => {
		const commands: GraphSelectionCommand[] = [];
		const temporaryObjects: Array<GraphSummaryObjectRef | null> = [];
		const focusClears: Array<string | null> = [];
		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: emptyPins,
			visibility: null,
			temporaryObject: null,
			setSelectionCommand: (command) => commands.push(command),
			setTemporaryObject: (object) => temporaryObjects.push(object),
			setGraphFocusPath: (path) => focusClears.push(path),
			createCommandId: (prefix) => `${prefix}-id`,
		}));

		act(() => result.current.setDrawer(graphReaderDrawer(graphReaderPayloadFixture(), { content: "Alpha" })));
		act(() => result.current.handleGraphViewReset());
		assert.equal(result.current.drawer.mode, "graph-node-summary");
		assert.deepEqual(focusClears, [null]);

		act(() => result.current.handleGraphSummaryNodePreview("a"));
		assert.deepEqual(commands.at(-1), { id: "preview-a-id", nodeId: "a", type: "preview-node" });

		act(() => result.current.handleGraphSummaryCommand({ kind: "set-fixed-position", nodeId: "a", mode: "fix", label: "固定位置" }));
		assert.deepEqual(commands.at(-1), { id: "fix-a-id", nodeId: "a", mode: "fix", type: "set-fixed-position" });

		act(() => result.current.handleGraphSummaryCommand({ kind: "set-fixed-position", nodeId: "a", mode: "unfix", label: "取消固定" }));
		assert.deepEqual(commands.at(-1), { id: "unfix-a-id", nodeId: "a", mode: "unfix", type: "set-fixed-position" });

		act(() => result.current.handleGraphSummaryCommand({ kind: "show-this-object", object: { kind: "node", nodeId: "b" }, label: "显示节点" }));
		assert.deepEqual(temporaryObjects.at(-1), { kind: "node", nodeId: "b" });
		assert.deepEqual(commands.at(-1), {
			id: "show-temporary-object-id",
			object: { kind: "node", nodeId: "b" },
			type: "show-temporary-object",
		});

		act(() => result.current.handleGraphSummaryCommand({ kind: "clear-temporary-object-display", label: "清理临时对象" }));
		assert.equal(temporaryObjects.at(-1), null);
		assert.deepEqual(commands.at(-1), {
			id: "clear-temporary-object-display-id",
			type: "clear-temporary-object-display",
		});
	});

	it("clears every active map reading state through a single cleanup entry", () => {
		const dataUpdates: Array<GraphData | null> = [];
		const pinUpdates: Array<PinMap> = [];
		const visibilityUpdates: Array<GraphVisibilityState | null> = [];
		const temporaryObjects: Array<GraphSummaryObjectRef | null> = [];
		const focusClears: Array<string | null> = [];
		const commands: GraphSelectionCommand[] = [];
		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: { "wiki/a.md": { x: 1, y: 2 } } as PinMap,
			visibility: { ...emptyVisibility(), focusCommunityId: "c1" },
			temporaryObject: { kind: "node", nodeId: "a" },
			setData: (next) => dataUpdates.push(next),
			setPins: (next) => pinUpdates.push(next),
			setVisibility: (next) => visibilityUpdates.push(next),
			setTemporaryObject: (next) => temporaryObjects.push(next),
			setGraphFocusPath: (path) => focusClears.push(path),
			setSelectionCommand: (command) => commands.push(command),
			createCommandId: (prefix) => `${prefix}-id`,
		}));

		act(() => result.current.setDrawer(graphCommunitySummaryDrawer(communitySummaryPayloadFixture())));
		act(() => result.current.runEvent({
			type: "graph-summary-command",
			command: { kind: "enter-community", communityId: "c1", label: "进入社区" },
			reducedMotion: false,
		}));
		assert.equal(result.current.drawerExitIsExiting, true);

		act(() => result.current.reset());

		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(result.current.drawerExitIsExiting, false);
		assert.equal(result.current.isDrawerExitProtected(result.current.drawer), false);
		assert.equal(dataUpdates.at(-1), null);
		assert.deepEqual(pinUpdates.at(-1), {});
		assert.equal(visibilityUpdates.at(-1), null);
		assert.equal(temporaryObjects.at(-1), null);
		assert.equal(focusClears.at(-1), null);
		assert.equal(commands.at(-1)?.type, "clear");
	});

	it("routes reader actions, asks, and drawer close through user-action methods", () => {
		const commands: GraphSelectionCommand[] = [];
		const focusClears: Array<string | null> = [];
		const handoffs: Array<{ displayText: string; newConversation: boolean }> = [];
		const { result } = renderHook(() => useActiveMapReadingWorkflow({
			data: graphFixture(),
			pins: emptyPins,
			visibility: null,
			temporaryObject: null,
			setSelectionCommand: (command) => commands.push(command),
			setGraphFocusPath: (path) => focusClears.push(path),
			onConversationHandoff: (handoff) => handoffs.push({
				displayText: handoff.displayText,
				newConversation: handoff.newConversation,
			}),
			createCommandId: (prefix) => `${prefix}-id`,
		}));

		// 节点阅读：找相关页面保持为邻居选择命令，抽屉不变
		act(() => result.current.setDrawer(graphReaderDrawer(graphReaderPayloadFixture(), { content: "Alpha" })));
		act(() => result.current.handleGraphReaderAction("find_related_pages"));
		assert.deepEqual(commands.at(-1), { id: "a", type: "neighbors" });
		assert.equal(result.current.drawer.mode, "graph-reader");

		// 非阅读态下触发节点阅读动作是 no-op（规则层守护，按钮也仅在阅读态出现）
		const commandCountBeforeWrongMode = commands.length;
		act(() => result.current.setDrawer(graphSelectionDrawer(manualMultiSelection(), "Alpha/Beta", "")));
		act(() => result.current.handleGraphReaderAction("find_related_pages"));
		assert.equal(commands.length, commandCountBeforeWrongMode);
		assert.equal(result.current.drawer.mode, "graph-selection");

		// 选区发问：交接提示词并关闭抽屉
		act(() => result.current.setDrawer(graphSelectionDrawer(manualMultiSelection(), "Alpha/Beta", "")));
		act(() => result.current.handleGraphSelectionTextChange("只看差异"));
		act(() => result.current.handleGraphSelectionAsk(null, false));
		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(handoffs.at(-1)?.newConversation, false);
		assert.match(handoffs.at(-1)?.displayText ?? "", /只看差异/);

		// 社区发问：交接提示词并关闭抽屉
		act(() => result.current.setDrawer(graphCommunitySummaryDrawer(communitySummaryPayloadFixture(), "")));
		act(() => result.current.handleGraphCommunityTextChange("社区补充"));
		act(() => result.current.handleGraphCommunityAsk(null, true));
		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(handoffs.at(-1)?.newConversation, true);
		assert.match(handoffs.at(-1)?.displayText ?? "", /社区补充/);

		// graph-reader 用 Escape 关：发 clear 命令并清焦点
		act(() => result.current.setDrawer(graphReaderDrawer(graphReaderPayloadFixture(), { content: "Alpha" })));
		act(() => result.current.handleDrawerClose("escape"));
		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(commands.at(-1)?.type, "clear");
		assert.equal(focusClears.at(-1), null);

		// graph-reader 用按钮关：直接关闭，不发命令、不清焦点（按钮 ≠ Escape）
		const commandCountBeforeButton = commands.length;
		const focusCountBeforeButton = focusClears.length;
		act(() => result.current.setDrawer(graphReaderDrawer(graphReaderPayloadFixture(), { content: "Alpha" })));
		act(() => result.current.handleDrawerClose("button"));
		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(commands.length, commandCountBeforeButton);
		assert.equal(focusClears.length, focusCountBeforeButton);

		// 进入社区时减少动效偏好被转发，未被写死为默认
		act(() => result.current.setDrawer(graphCommunitySummaryDrawer(communitySummaryPayloadFixture())));
		act(() => result.current.handleGraphSummaryCommand(
			{ kind: "enter-community", communityId: "c1", label: "进入社区" },
			{ reducedMotion: true },
		));
		assert.equal(result.current.drawerExitIsExiting, false);
	});
});

const emptyPins: PinMap = {};

function manualMultiSelection(): Selection {
	return {
		id: "nodes:a,b",
		nodeIds: ["a", "b"],
		communityIds: ["c1"],
		facts: { pageCount: 2, internalLinkCount: 1, communityCount: 1, isolatedCount: 0 },
		input: { kind: "nodes", ids: ["a", "b"] },
		actions: [],
	};
}

function nodeSelection(nodeId = "a"): Selection {
	return {
		id: `node:${nodeId}`,
		nodeIds: [nodeId],
		communityIds: ["c1"],
		facts: { pageCount: 1, internalLinkCount: 0, communityCount: 1, isolatedCount: 0 },
		input: { kind: "node", id: nodeId },
		actions: [],
	};
}

function communitySelection(): Selection {
	return {
		id: "community:a,b",
		nodeIds: ["a", "b"],
		communityIds: ["c1"],
		facts: { pageCount: 2, internalLinkCount: 1, communityCount: 1, isolatedCount: 0 },
		input: { kind: "community", id: "c1" },
		actions: [],
	};
}

function manualSingleSelection(): Selection {
	return {
		...nodeSelection(),
		id: "nodes:a",
		input: { kind: "nodes", ids: ["a"] },
	};
}

function graphFixture(): GraphData {
	return {
		meta: {
			build_date: "2026-06-18T00:00:00.000Z",
			wiki_title: "Active map workflow manager test",
			total_nodes: 2,
			total_edges: 1,
		},
		nodes: [
			{ id: "a", label: "Alpha", type: "topic", community: "c1", source_path: "wiki/a.md" },
			{ id: "b", label: "Beta", type: "entity", community: "c1", source_path: "wiki/b.md" },
		],
		edges: [{ id: "a-b", from: "a", to: "b", type: "EXTRACTED", relation_type: "实现", weight: 1 }],
		learning: {
			version: 1,
			entry: { recommended_start_node_id: "a", recommended_start_reason: "hub", default_mode: "global" },
			views: {
				path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
				community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
				global: { enabled: true, node_ids: ["a", "b"], degraded: false },
			},
			communities: [{ id: "c1", label: "Community", node_count: 2, color_index: 0, members: ["a", "b"] }],
		},
	};
}

function graphFixtureWithRenamedNode(): GraphData {
	const data = graphFixture();
	return {
		...data,
		nodes: data.nodes.map((node) => (node.id === "a" ? { ...node, label: "Alpha renamed" } : node)),
	};
}

function graphFixtureWithoutNodeA(): GraphData {
	const data = graphFixture();
	return {
		...data,
		nodes: data.nodes.filter((node) => node.id !== "a"),
		edges: [],
	};
}

function emptyVisibility(): GraphVisibilityState {
	return {
		searchQuery: "",
		searchResultIds: [],
		typeFilters: {},
		temporaryObject: null,
		focusCommunityId: null,
		hiddenReadingNodeId: null,
	};
}

function nodeSummaryPayloadFixture(): Extract<DrawerState, { mode: "graph-node-summary" }>["payload"] {
	return {
		kind: "node-summary",
		object: { kind: "node", nodeId: "a" },
		nodeId: "a",
		label: "Alpha",
		type: "topic",
		sourcePath: "wiki/a.md",
		facts: { pageCount: 1, internalLinkCount: 0, communityCount: 1, isolatedCount: 0 },
		summary: "Alpha summary",
		community: { id: "c1", label: "Community" },
		searchResultIds: [],
		pinHints: [],
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "open-detail-read", nodeId: "a", path: "wiki/a.md", label: "打开详情" },
			{ kind: "select-neighbors", nodeId: "a", label: "找相关页面" },
			{ kind: "set-fixed-position", nodeId: "a", mode: "fix", label: "固定位置" },
			{ kind: "enter-node-community", communityId: "c1", nodeId: "a", path: "wiki/a.md", label: "进入所属社区" },
		],
	};
}

function graphReaderPayloadFixture(): GraphOpenPagePayload {
	return {
		origin: "node-summary",
		path: "wiki/a.md",
		node: { id: "a", label: "Alpha", sourcePath: "wiki/a.md" },
	};
}

function communitySummaryPayloadFixture(): Extract<DrawerState, { mode: "graph-community-summary" }>["payload"] {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "c1" },
		communityId: "c1",
		label: "Community",
		nodeCount: 2,
		facts: { pageCount: 2, internalLinkCount: 1, communityCount: 1, isolatedCount: 0 },
		structureState: "clear",
		description: "结构清晰。",
		canEnterCommunity: true,
		coreNodeIds: ["a", "b"],
		coreNodes: [
			{ nodeId: "a", label: "Alpha", type: "topic", role: "核心" },
			{ nodeId: "b", label: "Beta", type: "entity", role: "相关" },
		],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: { kind: "community", id: "c1" },
			selectionId: "community:a,b",
			selectedNodeIds: ["a", "b"],
			selectedCommunityIds: ["c1"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [{ kind: "enter-community", communityId: "c1", label: "进入社区" }],
	};
}
