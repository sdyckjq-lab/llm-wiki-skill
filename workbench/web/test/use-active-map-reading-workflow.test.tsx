import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { act, renderHook } from "@testing-library/react";
import type { GraphData, GraphOpenPagePayload, GraphSummaryObjectRef, PinMap, Selection } from "@llm-wiki/graph-engine";

import { useActiveMapReadingWorkflow } from "../src/lib/use-active-map-reading-workflow";
import {
	closedDrawer,
	graphCommunitySummaryDrawer,
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
