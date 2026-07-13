/**
 * 知识库上下文 Extension
 *
 * 阶段一 step 5：向 agent 注入"当前在哪个知识库"的概念。
 * 不通过拼 system prompt 实现（ADR-7），而是注册工具让 agent 主动查询。
 *
 * 工具：
 *   current_knowledge_base()        → 返回当前库路径 + 元数据
 *   list_knowledge_base_pages()     → 列出 wiki/ 下所有 .md 文件
 *
 * 模块级状态：currentKnowledgeBase
 *   HTTP 层通过 setCurrentKnowledgeBase() 改它，Extension 工具读它。
 *   Extension 是单例（一个 process 一份），所以 module state 等价于应用状态。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { inspectKnowledgeBasePath } from "../knowledge-bases.js";
import {
	formatSearchResultsForTool,
	searchKnowledgeBase,
} from "../retrieval.js";

// ============= 状态 =============

interface KnowledgeBaseState {
	path: string;
	name: string;
}

export interface PendingKnowledgeContextOwner {
  runId: string;
  conversationId: string;
}

let current: KnowledgeBaseState | null = null;
const pendingKnowledgeContexts = new Map<string, string>();
const pendingKnowledgeContextOwner =
	new AsyncLocalStorage<PendingKnowledgeContextOwner>();

function pendingKnowledgeContextKey(
	owner: PendingKnowledgeContextOwner,
): string {
	return JSON.stringify([owner.runId, owner.conversationId]);
}

export function runWithPendingKnowledgeContextOwner<T>(
	owner: PendingKnowledgeContextOwner,
	operation: () => T,
): T {
	return pendingKnowledgeContextOwner.run(owner, operation);
}

export function getCurrentKnowledgeBase(): KnowledgeBaseState | null {
	return current;
}

export async function setCurrentKnowledgeBase(
  absolutePath: string,
): Promise<KnowledgeBaseState> {
	// 共享的有效性检查（PRODUCT.md §6.2 约定）
	const check = await inspectKnowledgeBasePath(absolutePath);
	if (!check.valid) {
		throw new Error(`不是合法知识库（${check.reason}）：${absolutePath}`);
	}

	const name = absolutePath.split("/").filter(Boolean).pop() ?? absolutePath;
	current = { path: absolutePath, name };
	return current;
}

export function clearCurrentKnowledgeBase(): void {
	current = null;
}

export function setPendingKnowledgeContext(
  context: string,
  owner: PendingKnowledgeContextOwner,
): void {
	pendingKnowledgeContexts.set(pendingKnowledgeContextKey(owner), context);
}

export function clearPendingKnowledgeContext(
  owner: PendingKnowledgeContextOwner,
): void {
	pendingKnowledgeContexts.delete(pendingKnowledgeContextKey(owner));
}

export function consumePendingKnowledgeContext(
  owner: PendingKnowledgeContextOwner,
): string | null {
	const key = pendingKnowledgeContextKey(owner);
	const context = pendingKnowledgeContexts.get(key);
	if (context === undefined) return null;
	pendingKnowledgeContexts.delete(key);
	return context;
}

// ============= Extension =============

/**
 * agent 不读这些目录 / 文件（PRODUCT.md §6.4 Obsidian 共存规则）
 */
const IGNORE_NAMES = new Set([
	".obsidian",
	".DS_Store",
	".wiki-tmp",
	".git",
	"node_modules",
	".venv",
	"venv",
	".cache",
]);

const IGNORE_SUFFIXES = [".base", ".canvas"];

function shouldIgnore(name: string): boolean {
	if (IGNORE_NAMES.has(name)) return true;
	return IGNORE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

async function listMarkdownFiles(
  rootDir: string,
  base: string,
): Promise<string[]> {
	const results: string[] = [];

	async function walk(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (shouldIgnore(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				results.push(relative(base, full));
			}
		}
	}

	await walk(rootDir);
	results.sort();
	return results;
}

export default function knowledgeBaseExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const owner = pendingKnowledgeContextOwner.getStore();
		if (!owner) return undefined;
		const context = consumePendingKnowledgeContext(owner);
		if (!context) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${context}`,
		};
	});

	pi.registerTool({
		name: "current_knowledge_base",
		label: "当前知识库",
		description:
			"Get the absolute filesystem path and basic metadata of the user's currently active knowledge base. ALWAYS call this FIRST before reading, writing, or listing files in the user's knowledge base, since file paths depend on which library the user has selected. Returns an error message if no knowledge base is selected.",
		parameters: Type.Object({}),
		async execute(): Promise<{
			content: { type: "text"; text: string }[];
			details: Record<string, unknown>;
		}> {
			if (!current) {
				return {
					content: [
						{
							type: "text",
							text: "No knowledge base is currently selected. Ask the user to pick one.",
						},
					],
					details: { selected: false },
				};
			}

			// 读 purpose.md 给 agent 一段"这是什么库"的提示
			let purpose = "";
			try {
        purpose = (
          await readFile(join(current.path, "purpose.md"), "utf8")
        ).slice(0, 500);
			} catch {
				// 没 purpose.md 也无所谓
			}

			const text = [
				`Current knowledge base:`,
				`  name: ${current.name}`,
				`  path: ${current.path}`,
				purpose ? `\nResearch direction (from purpose.md):\n${purpose}` : "",
			]
				.filter(Boolean)
				.join("\n");

			return {
				content: [{ type: "text", text }],
				details: {
					selected: true,
					path: current.path,
					name: current.name,
				},
			};
		},
	});

	pi.registerTool({
		name: "list_knowledge_base_pages",
		label: "列出知识库页面",
		description:
			"List all markdown wiki pages in the user's currently active knowledge base (under raw/ and wiki/, excluding Obsidian / dev / temp files). Returns relative paths from the knowledge base root. Use this to discover what content exists before answering questions about the user's wiki.",
		parameters: Type.Object({}),
		async execute(): Promise<{
			content: { type: "text"; text: string }[];
			details: Record<string, unknown>;
		}> {
			if (!current) {
				return {
					content: [
						{
							type: "text",
							text: "No knowledge base is currently selected.",
						},
					],
					details: { selected: false },
				};
			}

			try {
				const files = await listMarkdownFiles(current.path, current.path);
				return {
					content: [
						{
							type: "text",
							text:
								files.length === 0
									? "(Knowledge base is empty)"
									: `${files.length} markdown files:\n${files.join("\n")}`,
						},
					],
          details: {
            selected: true,
            count: files.length,
            files,
            path: current.path,
          },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Error listing files: ${msg}` }],
					details: { selected: true, error: msg },
				};
			}
		},
	});

	pi.registerTool({
		name: "query_knowledge_base",
		label: "检索知识库",
		description:
			"Search the user's current knowledge base for pages relevant to a query. Use this when the user asks a follow-up question that may require pulling additional context from the knowledge base beyond what's already in the conversation.",
		parameters: Type.Object({
			query: Type.String(),
		}),
		async execute(
			_toolCallId: string,
			params: { query?: string },
		): Promise<{
			content: { type: "text"; text: string }[];
			details: Record<string, unknown>;
		}> {
			if (!current) {
				return {
          content: [
            { type: "text", text: "No knowledge base is currently selected." },
          ],
					details: { selected: false },
				};
			}
			const query = params.query?.trim() ?? "";
			if (!query) {
				return {
					content: [{ type: "text", text: "query 不能为空。" }],
					details: { selected: true, count: 0, files: [] },
				};
			}
			const search = await searchKnowledgeBase(current.path, query, {
				totalBudgetChars: 4000,
			});
			return {
				content: [{ type: "text", text: formatSearchResultsForTool(search) }],
				details: {
					selected: true,
					count: search.results.length,
					files: search.results.map((result) => result.path),
				},
			};
		},
	});
}
