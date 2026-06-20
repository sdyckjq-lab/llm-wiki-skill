/**
 * api.ts - 类型化的后端调用层
 *
 * 所有走 Vite proxy 到 :8787 的后端调用集中在这里。
 */

import { parseSSE, type SSEMessage } from "./sse";
import type { GraphData, GraphDiff, GraphLayoutFile, PinMap } from "@llm-wiki/graph-engine";

// ============= 类型 =============

export interface KnowledgeBaseInfo {
	path: string;
	name: string;
	origin: "default" | "external";
	valid: boolean;
	reason?: string;
}

export interface CurrentKnowledgeBase {
	path: string;
	name: string;
}

export interface ConversationInfo {
	id: string;
	path: string;
	firstMessage: string;
	modifiedAt: number;
}

export interface UIMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	tools: { name: string; status: "done" }[];
}

export interface ModelInfo {
	provider: string;
	id: string;
}

export interface ModelRef {
	provider: string;
	modelId: string;
}

export interface AvailableModelInfo {
	provider: string;
	modelId: string;
	name: string;
	reasoning: boolean;
	contextWindow: number;
	cost: { input: number; output: number };
	hasAuth: boolean;
}

export interface ActiveContext {
	kb: CurrentKnowledgeBase;
	conversation: {
		id: string;
		isNew?: boolean;
		messages: UIMessage[];
	};
	model: ModelInfo | null;
}

export interface CommandItem {
	slug: string;
	name: string;
	description: string;
	source: "builtin" | "pi-default" | "user-global";
	skillPath: string | null;
}

export interface PageRef {
	path: string;
	name: string;
	category: string;
	title: string;
}

export interface AuthStatus {
	authFileExists: boolean;
	providers: { id: string; type: string; configured: boolean }[];
	envKeys: { name: string; present: boolean }[];
}

export interface ArtifactManifest {
	id: string;
	kind: "html" | "pdf" | "docx" | "pptx" | "xlsx";
	renderer: "iframe" | "download-only";
	metadata: {
		title: string;
		createdAt: string;
		sourceConversationId: string;
		sourceKbPath: string;
		sourceSkill: string;
		sizeBytes: number;
	};
	files: Array<{
		name: string;
		sizeBytes: number;
		mimeType: string;
	}>;
	primaryFile: string;
}

export type ExportKind = "pdf" | "docx" | "pptx" | "xlsx" | "html";

export interface AppConfig {
	version: 1;
	externalKnowledgeBases: string[];
	lastUsedKbPath?: string;
	showUserGlobalSkills?: boolean;
	modelRoles?: {
		main?: ModelRef | null;
		digest?: ModelRef | null;
	};
	uiPrefs?: {
		sidebarExpandedKbs?: string[];
	};
}

export interface InspectPathResult {
	exists: boolean;
	isDirectory: boolean;
	hasWikiSchema: boolean;
	resolvedPath?: string;
	ingestibleFiles?: {
		scanId: string;
		count: number;
		samples: string[];
		paths: string[];
		truncated: boolean;
	};
}

export type BatchDigestEvent =
	| { type: "start"; total: number; concurrency: number; outputDir: string }
	| { type: "file_start"; index: number; filePath: string }
	| { type: "file_progress"; index: number; filePath: string; chars: number }
	| { type: "file_complete"; index: number; filePath: string; outputPath: string }
	| { type: "file_error"; index: number; filePath: string; error: string }
	| { type: "done"; total: number; completed: number; failed: number; outputDir: string };

export type GraphApiResult =
	| { ok: true; needsBuild: true; graphPath: string }
	| { ok: true; needsBuild: false; graphPath: string; data: GraphData };

export type GraphLayoutApiResult = { ok: true; layoutPath: string; layout: GraphLayoutFile };

export type GraphEvent =
	| {
			type: "graph_updated";
			kbPath: string;
			diff: GraphDiff | null;
			rebuiltAt: string;
			stats: { nodeCount: number; edgeCount: number };
	  }
	| {
			type: "graph_error";
			kbPath: string;
			message: string;
			rebuiltAt: string;
	  };

export type ToolRunStatus = "running" | "done" | "failed" | "cancelled";

export interface ToolStatusBaseEvent {
	schemaVersion: 1;
	type: ToolStatusContractEvent["type"];
	runId: string;
	messageId: string;
	seq: number;
}

export interface ToolDisplay {
	toolCallId: string;
	toolName: string;
	action: string;
	target: string;
}

export interface ToolStatusStartEvent extends ToolStatusBaseEvent, ToolDisplay {
	type: "tool_status_start";
	status: "running";
	args: Record<string, unknown>;
	runningToolCount: number;
	otherRunningCount: number;
}

export interface ToolStatusUpdateEvent extends ToolStatusBaseEvent, ToolDisplay {
	type: "tool_status_update";
	status: "running";
	args: Record<string, unknown>;
	detail: unknown;
	runningToolCount: number;
	otherRunningCount: number;
}

export interface ToolStatusEndEvent extends ToolStatusBaseEvent, ToolDisplay {
	type: "tool_status_end";
	status: Exclude<ToolRunStatus, "running">;
	result: unknown;
	summary: string | null;
	error: string | null;
	durationMs: number;
	runningToolCount: number;
	otherRunningCount: number;
}

export interface ToolStatusSummaryEvent extends ToolStatusBaseEvent {
	type: "tool_status_summary";
	items: Array<ToolDisplay & { status: Exclude<ToolRunStatus, "running">; summary: string | null }>;
	remainingRunningCount: number;
}

export interface AssistantTextDeltaEvent extends ToolStatusBaseEvent {
	type: "assistant_text_delta";
	delta: string;
}

export interface AssistantDoneEvent extends ToolStatusBaseEvent {
	type: "assistant_done";
}

export interface AssistantCancelledEvent extends ToolStatusBaseEvent {
	type: "assistant_cancelled";
	reason: string;
}

export interface AssistantErrorEvent extends ToolStatusBaseEvent {
	type: "assistant_error";
	error: string;
}

export type ToolStatusContractEvent =
	| AssistantTextDeltaEvent
	| ToolStatusStartEvent
	| ToolStatusUpdateEvent
	| ToolStatusEndEvent
	| ToolStatusSummaryEvent
	| AssistantDoneEvent
	| AssistantCancelledEvent
	| AssistantErrorEvent;

// ============= API =============

export async function getHealth(): Promise<{
	status: string;
	timestamp: number;
	service: string;
}> {
	const res = await fetch("/api/health");
	if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
	return res.json();
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseInfo[]> {
	const res = await fetch("/api/knowledge-bases");
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const json = (await res.json()) as { ok: boolean; items?: KnowledgeBaseInfo[]; error?: string };
	if (!json.ok) throw new Error(json.error ?? "未知错误");
	return json.items ?? [];
}

export async function getActiveContext(): Promise<ActiveContext | null> {
	const res = await fetch("/api/knowledge-base");
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const json = (await res.json()) as { ok: boolean; active: ActiveContext | null };
	return json.active;
}

export async function selectKnowledgeBase(path: string): Promise<ActiveContext> {
	const res = await fetch("/api/knowledge-base", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
	const json = (await res.json()) as {
		ok: boolean;
		active?: ActiveContext;
		error?: string;
	};
	if (!res.ok || !json.ok || !json.active) {
		throw new Error(json.error ?? `HTTP ${res.status}`);
	}
	return json.active;
}

export async function clearActiveContext(): Promise<void> {
	await fetch("/api/knowledge-base", { method: "DELETE" });
}

export async function registerExternalKnowledgeBase(path: string): Promise<{
	registered: boolean;
	info: KnowledgeBaseInfo;
}> {
	const res = await fetch("/api/knowledge-bases/external", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
	const json = (await res.json()) as {
		ok: boolean;
		registered?: boolean;
		info?: KnowledgeBaseInfo;
		error?: string;
	};
	if (!res.ok || !json.ok || !json.info) {
		throw new Error(json.error ?? `HTTP ${res.status}`);
	}
	return { registered: json.registered ?? false, info: json.info };
}

export async function inspectKnowledgeBasePath(path: string): Promise<InspectPathResult> {
	const res = await fetch("/api/knowledge-bases/inspect", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
	const json = (await res.json()) as { ok: boolean; result?: InspectPathResult; error?: string };
	if (!res.ok || !json.ok || !json.result) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.result;
}

export async function chooseDirectory(): Promise<string | null> {
	const res = await fetch("/api/system/choose-directory", { method: "POST" });
	const json = (await res.json()) as {
		ok: boolean;
		path?: string;
		canceled?: boolean;
		error?: string;
	};
	if (json.canceled) return null;
	if (!res.ok || !json.ok || !json.path) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.path;
}

export async function initExistingKnowledgeBase(
	path: string,
	purpose: string,
	overwrite = false,
): Promise<{ info: KnowledgeBaseInfo; backedUpFiles: string[] }> {
	const res = await fetch("/api/knowledge-bases/init-existing", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path, purpose, overwrite }),
	});
	const json = (await res.json()) as {
		ok: boolean;
		info?: KnowledgeBaseInfo;
		backedUpFiles?: string[];
		conflicts?: string[];
		error?: string;
	};
	if (!res.ok || !json.ok || !json.info) {
		const error = new Error(json.error ?? `HTTP ${res.status}`) as Error & { conflicts?: string[] };
		error.conflicts = json.conflicts;
		throw error;
	}
	return { info: json.info, backedUpFiles: json.backedUpFiles ?? [] };
}

export async function createKnowledgeBase(name: string, purpose: string): Promise<KnowledgeBaseInfo> {
	const res = await fetch("/api/knowledge-bases/new", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, purpose }),
	});
	const json = (await res.json()) as { ok: boolean; info?: KnowledgeBaseInfo; error?: string };
	if (!res.ok || !json.ok || !json.info) {
		throw new Error(json.error ?? `HTTP ${res.status}`);
	}
	return json.info;
}

export async function unregisterExternalKnowledgeBase(path: string): Promise<{ removed: boolean }> {
	const res = await fetch("/api/knowledge-bases/external", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
	const json = (await res.json()) as { ok: boolean; removed?: boolean; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return { removed: json.removed ?? false };
}

// ============= 对话 =============

export async function listConversations(kbPath: string): Promise<ConversationInfo[]> {
	const url = `/api/conversations?kb=${encodeURIComponent(kbPath)}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const json = (await res.json()) as { ok: boolean; items?: ConversationInfo[]; error?: string };
	if (!json.ok) throw new Error(json.error ?? "未知错误");
	return json.items ?? [];
}

export async function selectConversation(
	kbPath: string,
	conversationId: string,
): Promise<ActiveContext> {
	const res = await fetch("/api/conversations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kbPath, conversationId }),
	});
	const json = (await res.json()) as {
		ok: boolean;
		active?: ActiveContext;
		error?: string;
	};
	if (!res.ok || !json.ok || !json.active) {
		throw new Error(json.error ?? `HTTP ${res.status}`);
	}
	return json.active;
}

export async function createNewConversation(kbPath: string): Promise<ActiveContext> {
	const res = await fetch("/api/conversations/new", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kbPath }),
	});
	const json = (await res.json()) as {
		ok: boolean;
		active?: ActiveContext;
		error?: string;
	};
	if (!res.ok || !json.ok || !json.active) {
		throw new Error(json.error ?? `HTTP ${res.status}`);
	}
	return json.active;
}

// ============= Prompt =============

export async function streamPrompt(
	message: string,
	signal?: AbortSignal,
): Promise<AsyncGenerator<SSEMessage, void, undefined>> {
	const res = await fetch("/api/prompt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ message }),
		signal,
	});
	if (!res.ok || !res.body) {
		throw new Error(`HTTP ${res.status} ${res.statusText}`);
	}
	return parseSSE(res.body);
}

// ============= 阶段二：命令与认证 =============

export async function listCommands(includeUserGlobal = false): Promise<CommandItem[]> {
	const suffix = includeUserGlobal ? "?includeUserGlobal=true" : "";
	const res = await fetch(`/api/commands${suffix}`);
	const json = (await res.json()) as { ok: boolean; items?: CommandItem[]; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.items ?? [];
}

export async function getConfig(): Promise<AppConfig> {
	const res = await fetch("/api/config");
	const json = (await res.json()) as { ok: boolean; config?: AppConfig; error?: string };
	if (!res.ok || !json.ok || !json.config) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.config;
}

export async function setConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
	const res = await fetch("/api/config", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(partial),
	});
	const json = (await res.json()) as { ok: boolean; config?: AppConfig; error?: string };
	if (!res.ok || !json.ok || !json.config) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.config;
}

export async function fetchAvailableModels(): Promise<AvailableModelInfo[]> {
	const res = await fetch("/api/models");
	const json = (await res.json()) as {
		ok: boolean;
		items?: AvailableModelInfo[];
		error?: string;
	};
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.items ?? [];
}

export async function streamBatchDigest(
	input: {
		kbPath: string;
		filePaths: string[];
		concurrency?: 1 | 3 | 5;
		sourceScanId?: string;
		digestModel?: ModelRef | null;
	},
	signal?: AbortSignal,
): Promise<AsyncGenerator<SSEMessage, void, undefined>> {
	const res = await fetch("/api/knowledge-bases/batch-digest", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
		signal,
	});
	if (!res.ok || !res.body) {
		let message = `HTTP ${res.status} ${res.statusText}`;
		try {
			const json = (await res.json()) as { error?: string };
			if (json.error) message = json.error;
		} catch {
			// keep HTTP message
		}
		throw new Error(message);
	}
	return parseSSE(res.body);
}

export async function listRefs(kbPath: string, query: string, limit = 20): Promise<PageRef[]> {
	const url = `/api/refs?kb=${encodeURIComponent(kbPath)}&q=${encodeURIComponent(query)}&limit=${limit}`;
	const res = await fetch(url);
	const json = (await res.json()) as { ok: boolean; items?: PageRef[]; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.items ?? [];
}

export async function readPage(kbPath: string, relPath: string): Promise<string> {
	const url = `/api/page?kb=${encodeURIComponent(kbPath)}&path=${encodeURIComponent(relPath)}`;
	const res = await fetch(url);
	const json = (await res.json()) as { ok: boolean; content?: string; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.content ?? "";
}

function kbQuery(kbPath: string): string {
	return `kb=${encodeURIComponent(kbPath)}`;
}

export async function getGraphData(kbPath: string): Promise<GraphApiResult> {
	const res = await fetch(`/api/graph?${kbQuery(kbPath)}`);
	const json = (await res.json()) as GraphApiResult | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json;
}

export async function rebuildGraph(kbPath: string): Promise<"started" | "queued"> {
	const res = await fetch(`/api/graph/rebuild?${kbQuery(kbPath)}`, { method: "POST" });
	const json = (await res.json()) as { ok: true; status: "started" | "queued" } | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json.status;
}

export async function getGraphLayout(kbPath: string): Promise<GraphLayoutApiResult> {
	const res = await fetch(`/api/graph/layout?${kbQuery(kbPath)}`);
	const json = (await res.json()) as GraphLayoutApiResult | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json;
}

export async function putGraphLayout(kbPath: string, pins: PinMap): Promise<GraphLayoutApiResult> {
	const res = await fetch(`/api/graph/layout?${kbQuery(kbPath)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ version: 2, pins }),
	});
	const json = (await res.json()) as GraphLayoutApiResult | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json;
}

export async function listArtifacts(conversationId?: string): Promise<ArtifactManifest[]> {
	const suffix = conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : "";
	const res = await fetch(`/api/artifacts${suffix}`);
	const json = (await res.json()) as { ok: boolean; items?: ArtifactManifest[]; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.items ?? [];
}

export async function getArtifactManifest(id: string): Promise<ArtifactManifest> {
	const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}`);
	const json = (await res.json()) as { ok: boolean; manifest?: ArtifactManifest; error?: string };
	if (!res.ok || !json.ok || !json.manifest) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json.manifest;
}

export function getArtifactFileUrl(id: string, filename: string): string {
	return `/api/artifacts/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`;
}

const EXPORT_LABELS: Record<ExportKind, { skillName: string; kindLabel: string; ext: string }> = {
	pdf: { skillName: "pdf", kindLabel: "PDF", ext: "pdf" },
	docx: { skillName: "docx", kindLabel: "Word 文档", ext: "docx" },
	pptx: { skillName: "pptx", kindLabel: "PPT 演示文稿", ext: "pptx" },
	xlsx: { skillName: "xlsx", kindLabel: "Excel 表格", ext: "xlsx" },
	html: { skillName: "直接生成自包含 HTML", kindLabel: "HTML 页面", ext: "html" },
};

export function buildExportPrompt(kind: ExportKind, titleSource: string): string {
	const title = titleSource.trim().slice(0, 30) || "当前对话产出";
	const meta = EXPORT_LABELS[kind];
	const generator =
		kind === "html"
			? "直接生成一个自包含 HTML 文件，CSS/JS/图片资源尽量内嵌，不要依赖外部相对路径"
			: `用 ${meta.skillName} Skill 在 workspacePath 下生成主文件`;
	return [
		`请把当前对话整理产出为 ${meta.kindLabel}，按以下三步：`,
		"",
		`1. 调用 prepare_artifact(kind="${kind}", title="${title}", sourceSkill="${meta.skillName}") 获得 { id, workspacePath }`,
		`2. ${generator}，文件名建议 export-${Date.now()}.${meta.ext}`,
		`3. 调用 finalize_artifact(id, primaryFile="<生成的文件名>", sourceSkill="${meta.skillName}") 完成登记`,
		"",
		"完成后回复 artifact id 和大致内容摘要。",
	].join("\n");
}

export async function getAuthStatus(): Promise<AuthStatus> {
	const res = await fetch("/api/auth/status");
	const json = (await res.json()) as ({ ok: true } & AuthStatus) | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json;
}

export async function setAuthKey(provider: string, key: string): Promise<void> {
	const res = await fetch("/api/auth/set", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ provider, type: "api_key", key }),
	});
	const json = (await res.json()) as { ok: boolean; error?: string };
	if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

export async function testAuthConnection(provider: string): Promise<{ ok: boolean; message?: string; error?: string }> {
	const res = await fetch("/api/auth/test", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ provider }),
	});
	const json = (await res.json()) as { ok: boolean; message?: string; error?: string };
	if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json;
}
