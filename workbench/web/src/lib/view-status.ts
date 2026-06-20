export type ChatStatusKind = "idle" | "streaming" | "error";
export type GraphStatusKind = "idle" | "loading" | "building" | "ready" | "error";

export interface ChatStatusSnapshot {
	status: ChatStatusKind;
	summary?: string | null;
}

export interface GraphStatusSnapshot {
	status: GraphStatusKind;
	summary?: string | null;
	animation?: "idle" | "playing" | "queued";
}

export const DEFAULT_CHAT_STATUS: ChatStatusSnapshot = { status: "idle", summary: null };
export const DEFAULT_GRAPH_STATUS: GraphStatusSnapshot = { status: "idle", summary: null, animation: "idle" };
