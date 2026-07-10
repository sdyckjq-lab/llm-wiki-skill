import type {
	GraphCommunitySummaryPayload,
	GraphExcludedObjectPayload,
	GraphGlobalOverviewPayload,
	GraphNodeSummaryPayload,
	GraphOpenPagePayload,
	GraphSearchResultsPayload,
	GraphUnavailableObjectPayload,
	Selection,
} from "@llm-wiki/graph-engine";
import type { ArtifactManifest } from "@/lib/api";

interface PageState {
	content?: string;
	loading?: boolean;
	error?: string | null;
}

export type DrawerState =
	| { mode: "closed" }
	| {
			mode: "wiki";
			path: string | null;
			content: string;
			loading: boolean;
			error: string | null;
		}
	| {
			mode: "artifacts";
			artifacts: ArtifactManifest[];
			activeArtifactId: string | null;
		}
		| {
			mode: "graph-reader";
			payload: GraphOpenPagePayload;
			content: string;
			loading: boolean;
			error: string | null;
			filteredHidden: boolean;
				requestKey: string | null;
		}
		| {
			mode: "graph-selection";
			title: string;
			selection: Selection;
			freeText: string;
		}
		| {
			mode: "graph-node-summary";
			payload: GraphNodeSummaryPayload;
			returnCommunityId: string | null;
		}
		| {
			mode: "graph-community-summary";
			payload: GraphCommunitySummaryPayload;
			freeText: string;
		}
		| {
			mode: "graph-search-results";
			payload: GraphSearchResultsPayload;
		}
		| {
			mode: "graph-excluded-object";
			payload: GraphExcludedObjectPayload;
		}
		| {
			mode: "graph-unavailable-object";
			payload: GraphUnavailableObjectPayload;
		}
		| {
			mode: "graph-global-overview";
			payload: GraphGlobalOverviewPayload;
		}
		| {
			mode: "graph-loading";
			title: string;
			message?: string;
		}
		| {
			mode: "graph-empty";
			title: string;
			message: string;
			reason: "missing-strong-relations" | "missing-neighbors" | "missing-community-summary" | "no-search-results";
		}
		| {
			mode: "graph-error";
			title: string;
			message: string;
		};

export function closedDrawer(): DrawerState {
	return { mode: "closed" };
}

export function wikiDrawer(path: string | null, state: PageState = {}): DrawerState {
	return {
		mode: "wiki",
		path,
		content: state.content ?? "",
		loading: state.loading ?? false,
		error: state.error ?? null,
	};
}

export function artifactDrawer(artifacts: ArtifactManifest[], activeArtifactId: string | null): DrawerState {
	return { mode: "artifacts", artifacts, activeArtifactId };
}

export function graphReaderDrawer(
	payload: GraphOpenPagePayload,
	state: PageState = {},
	options: { filteredHidden?: boolean; requestKey?: string | null } = {},
): DrawerState {
	return {
		mode: "graph-reader",
		payload,
		content: state.content ?? "",
		loading: state.loading ?? false,
		error: state.error ?? null,
		filteredHidden: options.filteredHidden ?? false,
		requestKey: options.requestKey ?? null,
	};
}

export function shouldApplyGraphReaderResult(
	current: DrawerState,
	payload: GraphOpenPagePayload,
	options: { requestKey?: string | null } = {},
): current is Extract<DrawerState, { mode: "graph-reader" }> {
	return current.mode === "graph-reader"
		&& current.payload.path === payload.path
		&& current.payload.node.id === payload.node.id
		&& current.requestKey === (options.requestKey ?? null);
}

export function graphSelectionDrawer(selection: Selection, title: string, freeText = ""): DrawerState {
	return {
		mode: "graph-selection",
		title,
		selection,
		freeText,
	};
}

export function graphNodeSummaryDrawer(
	payload: GraphNodeSummaryPayload,
	options: { returnCommunityId?: string | null } = {},
): DrawerState {
	return { mode: "graph-node-summary", payload, returnCommunityId: options.returnCommunityId ?? null };
}

export function graphCommunitySummaryDrawer(payload: GraphCommunitySummaryPayload, freeText = ""): DrawerState {
	return { mode: "graph-community-summary", payload, freeText };
}

export function graphSearchResultsDrawer(payload: GraphSearchResultsPayload): DrawerState {
	return { mode: "graph-search-results", payload };
}

export function graphExcludedObjectDrawer(payload: GraphExcludedObjectPayload): DrawerState {
	return { mode: "graph-excluded-object", payload };
}

export function graphUnavailableObjectDrawer(payload: GraphUnavailableObjectPayload): DrawerState {
	return { mode: "graph-unavailable-object", payload };
}

export function graphGlobalOverviewDrawer(payload: GraphGlobalOverviewPayload): DrawerState {
	return { mode: "graph-global-overview", payload };
}

export function graphLoadingDrawer(title: string, message?: string): DrawerState {
	return { mode: "graph-loading", title, message };
}

export function graphEmptyDrawer(
	title: string,
	reason: Extract<DrawerState, { mode: "graph-empty" }>["reason"],
	message: string,
): DrawerState {
	return { mode: "graph-empty", title, reason, message };
}

export function graphErrorDrawer(title: string, message: string): DrawerState {
	return { mode: "graph-error", title, message };
}

export function isGraphInteractionDrawer(drawer: DrawerState): boolean {
	return drawer.mode === "graph-selection"
		|| drawer.mode === "graph-node-summary"
		|| drawer.mode === "graph-community-summary"
		|| drawer.mode === "graph-search-results"
		|| drawer.mode === "graph-excluded-object"
		|| drawer.mode === "graph-unavailable-object"
		|| drawer.mode === "graph-global-overview"
		|| drawer.mode === "graph-loading"
		|| drawer.mode === "graph-empty"
		|| drawer.mode === "graph-error";
}
