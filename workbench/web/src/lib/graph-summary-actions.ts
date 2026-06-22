import {
	graphNodeTypeLabel,
	summarizeGraphCommunity,
	summarizeGraphNode,
	summarizeExcludedGraphObject,
	summarizeUnavailableGraphObject,
	wikiPathForGraphNode,
	type GraphData,
	type GraphOpenPagePayload,
	type GraphSummaryCommand,
	type GraphSummaryObjectRef,
	type GraphSummaryOptions,
	type GraphVisibilityState,
	type Selection,
} from "@llm-wiki/graph-engine";

import {
	graphCommunitySummaryDrawer,
	graphExcludedObjectDrawer,
	graphNodeSummaryDrawer,
	graphSelectionDrawer,
	graphUnavailableObjectDrawer,
	type DrawerState,
} from "./drawer-state";
import { selectionTitle } from "./graph-selection";

export type GraphSelectionCommand =
	| { id: string; type: "clear" | "clear-selection" | "neighbors" | "enter-community" }
	| { id: string; commandId?: string; nodeId: string; type: "enter-community-node" }
	| { id: string; nodeId: string | null; type: "preview-node" }
	| { id: string; nodeId: string; mode: "fix" | "unfix"; type: "set-fixed-position" }
	| { id: string; object: GraphSummaryObjectRef; type: "show-temporary-object" }
	| { id: string; type: "clear-temporary-object-display" };

export function drawerForGraphSelection(
	data: GraphData | null,
	selection: Selection,
	current: DrawerState,
	options: GraphSummaryOptions = {},
): DrawerState {
	if (data && selection.nodeIds.length === 1) {
		const summary = summarizeGraphNode(data, selection.nodeIds[0], {
			...options,
			selection: { kind: "node", id: selection.nodeIds[0] },
		});
		if (summary.kind === "node-summary") return graphNodeSummaryDrawer(summary);
	}

	if (data && selection.nodeIds.length > 1 && selection.communityIds.length === 1) {
		const summary = summarizeGraphCommunity(data, selection.communityIds[0], {
			...options,
			selection: { kind: "community", id: selection.communityIds[0] },
			searchResultIds: options.searchResultIds ?? [],
		});
		if (summary.kind === "community-summary") return graphCommunitySummaryDrawer(summary);
	}

	const freeText = current.mode === "graph-selection" ? current.freeText : "";
	const title = data ? selectionTitle(data, selection) : "选区";
	return graphSelectionDrawer(selection, title, freeText);
}

export function graphOpenPagePayloadForCommand(data: GraphData | null, command: GraphSummaryCommand): GraphOpenPagePayload | null {
	if (command.kind !== "open-detail-read") return null;
	if (!data) {
		return fallbackPayloadForOpenDetail(command);
	}
	const node = data?.nodes.find((item) => item.id === command.nodeId) ?? null;
	if (!node) {
		return fallbackPayloadForOpenDetail(command);
	}
	const sourcePath = wikiPathForGraphNode(node);
	return {
		path: sourcePath,
		node: {
			id: node.id,
			title: node.label || node.id,
			type: node.type,
			typeLabel: graphNodeTypeLabel(node.type),
			sourcePath,
			community: node.community ?? null,
			date: typeof node.date === "string" ? node.date : null,
			source: typeof node.source === "string" ? node.source : null,
			isolated: isIsolatedNode(data, node.id),
		},
	};
}

export function graphSelectionCommandForOpenDetail(
	data: GraphData | null,
	command: GraphSummaryCommand,
): Extract<GraphSelectionCommand, { type: "enter-community-node" }> | null {
	if (command.kind !== "open-detail-read" || !data) return null;
	const node = data.nodes.find((item) => item.id === command.nodeId);
	if (!node?.community) return null;
	return { id: node.community, nodeId: node.id, type: "enter-community-node" };
}

export function drawerForGraphSummaryNode(
	data: GraphData | null,
	nodeId: string,
	current: DrawerState,
	options: GraphSummaryOptions = {},
): DrawerState {
	if (!data) return current;
	const summary = summarizeGraphNode(data, nodeId, {
		...options,
		selection: { kind: "node", id: nodeId },
	});
	if (summary.kind !== "node-summary") return current;
	return graphNodeSummaryDrawer(summary);
}

export function drawerForGraphSummaryCommunity(
	data: GraphData | null,
	communityId: string,
	current: DrawerState,
	options: GraphSummaryOptions = {},
): DrawerState {
	if (!data) return current;
	const summary = summarizeGraphCommunity(data, communityId, {
		...options,
		selection: { kind: "community", id: communityId },
	});
	if (summary.kind === "community-summary") return graphCommunitySummaryDrawer(summary);
	return graphUnavailableObjectDrawer(summary);
}

export function drawerForExcludedGraphObject(
	data: GraphData | null,
	object: GraphSummaryObjectRef,
	reason: "filter" | "aggregation" | "search" | "community-scope",
	current: DrawerState,
	options: GraphSummaryOptions = {},
): DrawerState {
	if (!data) return current;
	const summary = summarizeExcludedGraphObject(data, object, reason, options);
	return graphExcludedObjectDrawer(summary);
}

export function drawerForUnavailableGraphObject(
	data: GraphData | null,
	object: GraphSummaryObjectRef,
	reason: "missing-node" | "missing-community" | "missing-aggregation",
	current: DrawerState,
	options: GraphSummaryOptions = {},
): DrawerState {
	if (!data) return current;
	const summary = summarizeUnavailableGraphObject(data, object, reason, options);
	return graphUnavailableObjectDrawer(summary);
}

export function graphObjectVisibilityReason(
	data: GraphData | null,
	state: GraphVisibilityState | null,
	object: GraphSummaryObjectRef,
): "filter" | "search" | "community-scope" | null {
	if (!data || !state) return null;
	const node = object.kind === "node" ? data.nodes.find((item) => item.id === object.nodeId) ?? null : null;
	if (object.kind === "node" && node && state.typeFilters[node.type] === false) return "filter";
	if (object.kind === "node" && state.searchQuery && !state.searchResultIds.includes(object.nodeId)) return "search";
	return null;
}

function fallbackPayloadForOpenDetail(command: Extract<GraphSummaryCommand, { kind: "open-detail-read" }>): GraphOpenPagePayload {
	return {
		path: command.path,
		node: {
			id: command.nodeId,
			title: command.nodeId,
			type: "entity",
			typeLabel: "实体",
			sourcePath: command.path,
			community: null,
			date: null,
			source: null,
			isolated: true,
		},
	};
}

function isIsolatedNode(data: GraphData, id: string): boolean {
	return data.edges.every((edge) => edge.from !== id && edge.to !== id);
}
