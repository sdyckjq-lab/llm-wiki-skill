/**
 * conversations.ts - 对话（pi session）管理
 *
 * 设计：
 *   - 每个知识库一个会话目录：~/.llm-wiki-agent/sessions/<kb-hash>/
 *   - kb-hash = sha256(absolute_kb_path).slice(0, 16)
 *     好处：1) 文件系统安全（无中文/斜杠等）；2) KB 重命名/挪走时旧会话不会丢
 *   - 会话文件由 pi-agent SessionManager 管理（.jsonl 格式）
 *
 * UI 对话气泡转换：
 *   pi 的 AgentMessage 含 user / assistant / toolResult / 自定义类型；
 *   UI 只显示 user 文本和 assistant 文本。tool 调用在历史里降级为提示文字。
 */

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";

import { APP_DIR } from "./config.js";
import { stripKnowledgeContextForDisplay } from "./retrieval.js";
import { formatToolDisplay } from "./tool-status-events.js";

export const SESSIONS_ROOT = join(APP_DIR, "sessions");

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

/**
 * 知识库路径 → 会话目录路径（哈希命名）
 */
export function kbSessionDir(kbAbsolutePath: string): string {
	const hash = createHash("sha256").update(kbAbsolutePath).digest("hex").slice(0, 16);
	return join(SESSIONS_ROOT, hash);
}

/**
 * 确保 KB 的会话目录存在
 */
export async function ensureKbSessionDir(kbAbsolutePath: string): Promise<string> {
	const dir = kbSessionDir(kbAbsolutePath);
	await mkdir(dir, { recursive: true });
	return dir;
}

/**
 * 列出某 KB 下的所有对话（按修改时间从新到旧）
 */
export async function listConversations(kbAbsolutePath: string): Promise<ConversationInfo[]> {
	const dir = await ensureKbSessionDir(kbAbsolutePath);
	let raw: SessionInfo[] = [];
	try {
		raw = await SessionManager.list(process.cwd(), dir);
	} catch {
		return [];
	}

	return raw
		.map((info) => ({
			id: info.id,
			path: info.path,
			firstMessage: stripKnowledgeContextForDisplay(info.firstMessage ?? ""),
			modifiedAt: info.modified instanceof Date ? info.modified.getTime() : 0,
		}))
		.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * pi 的 AgentMessage[] → UI 友好的 UIMessage[]
 *
 * 规则：
 *   - user 文本 → UIMessage{role:"user"}
 *   - assistant 文本 → UIMessage{role:"assistant"}
 *     如果该 assistant 消息有工具调用，把工具名标到这个 UIMessage 的 tools 上
 *   - toolResult / 纯工具调用 / 自定义类型 → 忽略（历史里 tool 状态不重要）
 */
export function piMessagesToUIMessages(messages: AgentMessage[]): UIMessage[] {
	const result: UIMessage[] = [];
	const toolResults = indexToolResults(messages);

	// 一轮（两条 user 消息之间）里 pi 往往产出多条 assistant 消息：文字 → 工具调用 →
	// 续写 …… 直播态把整轮聚合进一个气泡，这里合并成一个 UIMessage 以与直播保持一致。
	let pending: { texts: string[]; tools: string[] } | null = null;
	const flushAssistant = () => {
		if (!pending) return;
		const content = pending.texts.filter((t) => t.trim()).join("\n\n");
		const tools = pending.tools;
		if (content.trim() || tools.length > 0) {
			result.push({
				id: `a-${result.length}`,
				role: "assistant",
				content,
				tools: tools.map((name) => ({ name, status: "done" as const })),
			});
		}
		pending = null;
	};

	for (const msg of messages) {
		if (msg.role === "user") {
			flushAssistant();
			const text = stripKnowledgeContextForDisplay(extractText(msg));
			if (text.trim()) {
				result.push({
					id: `u-${result.length}`,
					role: "user",
					content: text,
					tools: [],
				});
			}
		} else if (msg.role === "assistant") {
			const text = extractText(msg);
			const tools = extractToolSummaries(msg, toolResults);
			if (!pending) pending = { texts: [], tools: [] };
			if (text.trim()) pending.texts.push(text);
			pending.tools.push(...tools);
		}
		// toolResult 等：忽略，且不 flush（它夹在 assistant 工具调用与续写之间，flush 会错误拆轮）
	}
	flushAssistant();

	return result;
}

interface ToolCallSummarySource {
	id?: string;
	name: string;
	args: Record<string, unknown>;
	hasArgs: boolean;
}

interface ToolResultSummarySource {
	toolCallId?: string;
	toolName?: string;
	text: string;
	isError: boolean;
	details?: unknown;
}

function extractText(msg: AgentMessage): string {
	const content = (msg as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((part): part is { type: string; text: string } => {
				if (typeof part !== "object" || part === null) return false;
				const p = part as Record<string, unknown>;
				return p.type === "text" && typeof p.text === "string";
			})
			.map((p) => p.text)
			.join("");
	}
	return "";
}

function extractToolSummaries(
	msg: AgentMessage,
	toolResults: Map<string, ToolResultSummarySource>,
): string[] {
	const content = (msg as { content?: unknown }).content;
	if (!Array.isArray(content)) return [];
	const summaries: string[] = [];
	for (const part of content) {
		if (typeof part !== "object" || part === null) continue;
		const p = part as Record<string, unknown>;
		if (p.type === "tool_call" || p.type === "toolCall") {
			const call = normalizeToolCall(p);
			if (!call) continue;
			const result = call.id ? toolResults.get(call.id) : undefined;
			summaries.push(renderToolSummary(call, result));
		}
	}
	return summaries;
}

function indexToolResults(messages: AgentMessage[]): Map<string, ToolResultSummarySource> {
	const results = new Map<string, ToolResultSummarySource>();
	for (const message of messages) {
		if (message.role !== "toolResult") continue;
		const record = message as unknown as Record<string, unknown>;
		const toolCallId = typeof record.toolCallId === "string" ? record.toolCallId : undefined;
		if (!toolCallId) continue;
		results.set(toolCallId, {
			toolCallId,
			toolName: typeof record.toolName === "string" ? record.toolName : undefined,
			text: extractText(message).trim(),
			isError: record.isError === true,
			details: record.details,
		});
	}
	return results;
}

function normalizeToolCall(record: Record<string, unknown>): ToolCallSummarySource | null {
	const name = typeof record.name === "string"
		? record.name
		: typeof record.toolName === "string"
			? record.toolName
			: null;
	if (!name) return null;
	const id = typeof record.id === "string"
		? record.id
		: typeof record.toolCallId === "string"
			? record.toolCallId
			: undefined;
	const rawArgs = record.arguments ?? record.args ?? record.input;
	const args = isRecord(rawArgs) ? rawArgs : {};
	return {
		id,
		name,
		args,
		hasArgs: Object.keys(args).length > 0,
	};
}

function renderToolSummary(
	call: ToolCallSummarySource,
	result: ToolResultSummarySource | undefined,
): string {
	const display = call.hasArgs
		? formatToolDisplay(call.name, call.args)
		: { action: "历史工具调用", target: call.name };
	const resultText = summarizeToolResult(result);
	const failure = result?.isError ? " 失败" : "";
	if (!call.hasArgs) {
		return resultText
			? `历史工具调用：${call.name}${failure}：${resultText}`
			: `历史工具调用：${call.name}${failure}`;
	}
	return resultText
		? `${display.action} ${display.target}${failure}：${resultText}`
		: `${display.action} ${display.target}${failure}`;
}

function summarizeToolResult(result: ToolResultSummarySource | undefined): string {
	if (!result) return "";
	if (result.text) return truncateSummary(redactPrivatePaths(result.text));
	const details = isRecord(result.details) ? result.details : {};
	for (const key of ["summary", "message", "error", "path"]) {
		const value = details[key];
		if (typeof value === "string" && value.trim()) return truncateSummary(redactPrivatePaths(value.trim()));
	}
	return "";
}

function truncateSummary(value: string): string {
	return value.length <= 80 ? value : `${value.slice(0, 52)}...${value.slice(-25)}`;
}

function redactPrivatePaths(value: string): string {
	return value.split(homedir()).join("~").replace(/\/Users\/[^/\s]+/g, "/Users/<user>");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
