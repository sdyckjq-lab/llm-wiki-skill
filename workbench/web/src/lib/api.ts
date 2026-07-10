/**
 * api.ts - 类型化的后端调用层
 *
 * 所有走 Vite proxy 到 :8787 的后端调用集中在这里。
 */

import { parseSSE, type SSEMessage } from "./sse";
import { getConfig as getConfigMigrated, setConfig as setConfigMigrated, fetchAvailableModels as fetchAvailableModelsMigrated } from "./api/config";
import { getAuthStatus as getAuthStatusMigrated } from "./api/auth";
import {
	clearActiveContext as clearActiveContextMigrated,
	getActiveContext as getActiveContextMigrated,
	inspectKnowledgeBasePath as inspectKnowledgeBasePathMigrated,
	listKnowledgeBases as listKnowledgeBasesMigrated,
	registerExternalKnowledgeBase as registerExternalKnowledgeBaseMigrated,
	selectKnowledgeBase as selectKnowledgeBaseMigrated,
	unregisterExternalKnowledgeBase as unregisterExternalKnowledgeBaseMigrated,
} from "./api/knowledge-bases";
import {
	createNewConversation as createNewConversationMigrated,
	listConversations as listConversationsMigrated,
	selectConversation as selectConversationMigrated,
} from "./api/conversations";
import {
	getArtifactFileUrl as getArtifactFileUrlMigrated,
	getArtifactManifest as getArtifactManifestMigrated,
	listArtifacts as listArtifactsMigrated,
} from "./api/artifacts";
import {
	getGraphData as getGraphDataMigrated,
	getGraphLayout as getGraphLayoutMigrated,
	putGraphLayout as putGraphLayoutMigrated,
} from "./api/graph";
import {
	listRefs as listRefsMigrated,
	readPage as readPageMigrated,
} from "./api/pages";
import {
	type ActiveContext,
	type AppConfig,
	type ArtifactManifest,
	type AuthStatusData,
	type AvailableModelInfo,
	type ConversationInfo,
	type InspectKnowledgeBasePathData,
	type KnowledgeBaseInfo,
	type ModelRef,
	type PageRef,
} from "@llm-wiki/workbench-contracts";
import type { GraphData, GraphDiff, GraphLayoutFile, PinMap } from "@llm-wiki/graph-engine";

export type {
	ActiveContext,
	AppConfig,
	ArtifactManifest,
	AvailableModelInfo,
	ConversationInfo,
	KnowledgeBaseInfo,
	ModelRef,
	PageRef,
	UIMessage,
} from "@llm-wiki/workbench-contracts";

// ============= 类型 =============

export type AuthStatus = AuthStatusData;

export interface CommandItem {
	slug: string;
	name: string;
	description: string;
	source: "builtin" | "pi-default" | "user-global";
	skillPath: string | null;
}

export type ExportKind = "pdf" | "docx" | "pptx" | "xlsx" | "html";

export type InspectPathResult = InspectKnowledgeBasePathData;
export type ModelInfo = ActiveContext["model"] extends infer Model
	? Exclude<Model, null>
	: never;

export type BatchDigestEvent =
	| { type: "start"; total: number; concurrency: number; outputDir: string }
	| { type: "file_start"; index: number; filePath: string }
	| { type: "file_progress"; index: number; filePath: string; chars: number }
	| { type: "file_complete"; index: number; filePath: string; outputPath: string }
	| { type: "file_error"; index: number; filePath: string; error: string }
	| { type: "done"; total: number; completed: number; failed: number; outputDir: string };

export type GraphApiResult =
	| { needsBuild: true }
	| { needsBuild: false; data: GraphData };

export type GraphLayoutApiResult = GraphLayoutFile;

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
// health、config/auth 和 knowledge-bases/active context 已迁移到 ./api/<domain>。
// 其余函数仍是 legacy，等待按 issue 逐个迁移。

export function listKnowledgeBases(): Promise<KnowledgeBaseInfo[]> {
	return listKnowledgeBasesMigrated();
}

export function getActiveContext(): Promise<ActiveContext | null> {
	return getActiveContextMigrated();
}

export function selectKnowledgeBase(path: string): Promise<ActiveContext> {
	return selectKnowledgeBaseMigrated(path);
}

export function clearActiveContext(): Promise<void> {
	return clearActiveContextMigrated();
}

export function registerExternalKnowledgeBase(
	path: string,
): Promise<{ registered: boolean; info: KnowledgeBaseInfo }> {
	return registerExternalKnowledgeBaseMigrated(path);
}

export function inspectKnowledgeBasePath(
	path: string,
): Promise<InspectPathResult> {
	return inspectKnowledgeBasePathMigrated(path);
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

export function unregisterExternalKnowledgeBase(
	path: string,
): Promise<{ removed: boolean }> {
	return unregisterExternalKnowledgeBaseMigrated(path);
}

// ============= 对话 =============

export function listConversations(kbPath: string): Promise<ConversationInfo[]> {
	return listConversationsMigrated(kbPath);
}

export function selectConversation(
	kbPath: string,
	conversationId: string,
): Promise<ActiveContext> {
	return selectConversationMigrated(kbPath, conversationId);
}

export function createNewConversation(kbPath: string): Promise<ActiveContext> {
	return createNewConversationMigrated(kbPath);
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
	return getConfigMigrated();
}

export async function setConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
	return setConfigMigrated(partial);
}

export async function fetchAvailableModels(): Promise<AvailableModelInfo[]> {
	return fetchAvailableModelsMigrated();
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

export function listRefs(kbPath: string, query: string, limit = 20): Promise<PageRef[]> {
	return listRefsMigrated(kbPath, query, limit);
}

export function readPage(kbPath: string, relPath: string): Promise<string> {
	return readPageMigrated(kbPath, relPath);
}

function kbQuery(kbPath: string): string {
	return `kb=${encodeURIComponent(kbPath)}`;
}

export function getGraphData(kbPath: string): Promise<GraphApiResult> {
	return getGraphDataMigrated(kbPath);
}

export async function rebuildGraph(kbPath: string): Promise<"started" | "queued"> {
	const res = await fetch(`/api/graph/rebuild?${kbQuery(kbPath)}`, { method: "POST" });
	const json = (await res.json()) as { ok: true; status: "started" | "queued" } | { ok: false; error?: string };
	if (!res.ok || !json.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
	return json.status;
}

export function getGraphLayout(kbPath: string): Promise<GraphLayoutApiResult> {
	return getGraphLayoutMigrated(kbPath);
}

export function putGraphLayout(
	kbPath: string,
	pins: PinMap,
): Promise<GraphLayoutApiResult> {
	return putGraphLayoutMigrated(kbPath, pins);
}

export function listArtifacts(conversationId?: string): Promise<ArtifactManifest[]> {
	return listArtifactsMigrated(conversationId);
}

export function getArtifactManifest(id: string): Promise<ArtifactManifest> {
	return getArtifactManifestMigrated(id);
}

export function getArtifactFileUrl(id: string, filename: string): string {
	return getArtifactFileUrlMigrated(id, filename);
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
	return getAuthStatusMigrated();
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
