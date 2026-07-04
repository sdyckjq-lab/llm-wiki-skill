import type {
	GraphData,
	GraphSummaryCommand,
	GraphSummaryObjectRef,
	GraphVisibilityState,
	PinMap,
} from "@llm-wiki/graph-engine";

import {
	closedDrawer,
	type DrawerState,
} from "./drawer-state";
import {
	drawerForExcludedGraphObject,
	drawerForGraphSummaryCommunity,
	drawerForGraphSummaryNode,
	drawerForUnavailableGraphObject,
	graphObjectVisibilityReason,
} from "./graph-summary-actions";

export function sameGraphDrawerTarget(left: DrawerState, right: DrawerState): boolean {
	if (left.mode !== right.mode) return false;
	if (left.mode === "graph-node-summary" && right.mode === "graph-node-summary") {
		return left.payload.nodeId === right.payload.nodeId
			&& graphSummaryCommandSignature(left.payload.commands) === graphSummaryCommandSignature(right.payload.commands);
	}
	if (left.mode === "graph-excluded-object" && right.mode === "graph-excluded-object") {
		return JSON.stringify(left.payload.object) === JSON.stringify(right.payload.object)
			&& left.payload.reason === right.payload.reason
			&& graphSummaryCommandSignature(left.payload.commands) === graphSummaryCommandSignature(right.payload.commands);
	}
	if (left.mode === "graph-unavailable-object" && right.mode === "graph-unavailable-object") {
		return JSON.stringify(left.payload.object) === JSON.stringify(right.payload.object) && left.payload.reason === right.payload.reason;
	}
	return false;
}

export function drawerForGraphNodeVisibility(
	data: GraphData | null,
	nodeId: string,
	current: DrawerState,
	options: {
		pins: PinMap;
		visibility: GraphVisibilityState | null;
		selection?: { kind: "node"; id: string };
	},
): DrawerState {
	const object = { kind: "node" as const, nodeId };
	const summaryOptions = {
		pins: options.pins,
		selection: options.selection ?? { kind: "node" as const, id: nodeId },
		searchResultIds: options.visibility?.searchResultIds ?? [],
		temporaryObject: options.visibility?.temporaryObject ?? null,
	};
	if (!data?.nodes.some((node) => node.id === nodeId)) {
		return drawerForUnavailableGraphObject(data, object, "missing-node", current, summaryOptions);
	}
	const reason = graphObjectVisibilityReason(data, options.visibility, object);
	const temporaryObject = options.visibility?.temporaryObject ?? null;
	const temporarilyShown = temporaryObject?.kind === "node" && temporaryObject.nodeId === nodeId;
	if (reason && !temporarilyShown) {
		return drawerForExcludedGraphObject(data, object, reason, current, summaryOptions);
	}
	return drawerForGraphSummaryNode(data, nodeId, current, summaryOptions);
}

export function visibilityWithTemporaryObject(
	state: GraphVisibilityState | null,
	temporaryObject: GraphSummaryObjectRef | null,
): GraphVisibilityState | null {
	if (!state && !temporaryObject) return null;
	return {
		searchQuery: state?.searchQuery ?? "",
		searchResultIds: state?.searchResultIds ?? [],
		typeFilters: state?.typeFilters ?? {},
		temporaryObject,
		focusCommunityId: state?.focusCommunityId ?? null,
		hiddenReadingNodeId: state?.hiddenReadingNodeId ?? null,
	};
}

export function graphReaderFilteredHidden(nodeId: string, state: GraphVisibilityState | null): boolean {
	return state?.hiddenReadingNodeId === nodeId;
}

export function graphReaderStaleAfterRefresh(
	current: DrawerState,
	data: GraphData | null,
	visibility: GraphVisibilityState | null,
): boolean {
	if (current.mode !== "graph-reader") return false;
	const node = data?.nodes.find((item) => item.id === current.payload.node.id) ?? null;
	if (!node) return true;
	return Boolean(visibility?.focusCommunityId && node.community !== visibility.focusCommunityId);
}

export function drawerAfterGraphDataRefresh(
	current: DrawerState,
	data: GraphData | null,
	options: {
		pins: PinMap;
		visibility: GraphVisibilityState | null;
		temporaryObject: GraphSummaryObjectRef | null;
	},
): DrawerState {
	const visibility = visibilityWithTemporaryObject(options.visibility, options.temporaryObject);
	if (current.mode === "graph-reader") {
		if (graphReaderStaleAfterRefresh(current, data, visibility)) return closedDrawer();
		return {
			...current,
			filteredHidden: graphReaderFilteredHidden(current.payload.node.id, visibility),
		};
	}
	if (current.mode === "graph-node-summary") {
		return drawerForGraphNodeVisibility(data, current.payload.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-community-summary") {
		return drawerForGraphSummaryCommunity(data, current.payload.communityId, current, {
			pins: options.pins,
			selection: { kind: "community", id: current.payload.communityId },
			searchResultIds: visibility?.searchResultIds ?? [],
			temporaryObject: visibility?.temporaryObject ?? null,
		});
	}
	if (current.mode === "graph-excluded-object" && current.payload.object.kind === "node") {
		return drawerForGraphNodeVisibility(data, current.payload.object.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-unavailable-object" && current.payload.object.kind === "node") {
		return drawerForGraphNodeVisibility(data, current.payload.object.nodeId, current, {
			pins: options.pins,
			visibility,
		});
	}
	if (current.mode === "graph-unavailable-object" && current.payload.object.kind === "community") {
		return drawerForGraphSummaryCommunity(data, current.payload.object.communityId, current, {
			pins: options.pins,
			selection: { kind: "community", id: current.payload.object.communityId },
			searchResultIds: visibility?.searchResultIds ?? [],
			temporaryObject: visibility?.temporaryObject ?? null,
		});
	}
	return current;
}

function graphSummaryCommandSignature(commands: readonly GraphSummaryCommand[]): string {
	return commands.map((command) => {
		if (command.kind === "set-fixed-position") return `${command.kind}:${command.mode}:${command.nodeId}`;
		if (command.kind === "open-detail-read") return `${command.kind}:${command.nodeId}`;
		if (command.kind === "select-neighbors") return `${command.kind}:${command.nodeId}`;
		if (command.kind === "enter-community") return `${command.kind}:${command.communityId}`;
		if (command.kind === "show-this-object") return `${command.kind}:${JSON.stringify(command.object)}`;
		return command.kind;
	}).join(",");
}
