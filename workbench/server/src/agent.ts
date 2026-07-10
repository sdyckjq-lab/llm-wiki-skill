/**
 * agent.ts - pi-coding-agent SDK 的活跃会话管理
 *
 * 阶段一 step 8：从单 in-memory session 升级为
 *   "活跃上下文 = (当前 KB, 当前对话, pi session 实例)"
 *
 * 会话持久化到 ~/.llm-wiki-agent/sessions/<kb-hash>/，由 pi SessionManager 管理。
 * 任一时刻只有一个 active session（单用户、单浏览器假设）。
 *
 * 切换逻辑：
 *   selectKb(kbPath)            → 先 dispose 老 session，再尝试 continueRecent，
 *                                 如果该 KB 无任何对话则创建新的
 *   selectConversation(kbPath, conversationId) → dispose 老 + 打开指定文件
 *   createNewConversation(kbPath)              → dispose 老 + 新建空白对话
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	type AgentSession,
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

import { loadConfig, saveConfig } from "./config.js";
import type { ModelRef } from "./config.js";
import { ensureKbSessionDir, listConversations } from "./conversations.js";
import { scanAndRebuildArtifactIndex } from "./artifacts.js";
import { createArtifactsExtension } from "./extensions/artifacts.js";
import knowledgeBaseExtension from "./extensions/knowledge-base.js";
import {
	clearCurrentKnowledgeBase,
	setCurrentKnowledgeBase,
} from "./extensions/knowledge-base.js";
import { createNewWikiExtension } from "./extensions/new-wiki.js";
import { createSynthesisExtension } from "./extensions/synthesis.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECT_SKILLS_DIR = path.join(REPO_ROOT, ".claude", "skills");
const PI_DEFAULT_SKILLS_DIR = path.join(homedir(), ".pi", "agent", "skills");
const USER_GLOBAL_SKILLS_DIR = path.join(homedir(), ".claude", "skills");

export const authStorage = AuthStorage.create();
export const modelRegistry = ModelRegistry.create(authStorage);
const settingsManager = SettingsManager.create(REPO_ROOT, getAgentDir());

function registerPendingProviders(loader: DefaultResourceLoader): void {
	const extensions = loader.getExtensions();
	const runtime = extensions.runtime as {
		pendingProviderRegistrations?: Array<{
			name: string;
			config: Parameters<ModelRegistry["registerProvider"]>[1];
			extensionPath?: string;
		}>;
	};
	const pending = runtime.pendingProviderRegistrations ?? [];
	for (const { name, config, extensionPath } of pending) {
		try {
			modelRegistry.registerProvider(name, config);
		} catch (err) {
			console.warn(
				`[agent] register provider from ${extensionPath ?? "extension"} failed: ${
					err instanceof Error ? err.message : err
				}`,
			);
		}
	}
	runtime.pendingProviderRegistrations = [];
}

async function rememberLastUsedKb(kbPath: string): Promise<void> {
	try {
		const config = await loadConfig();
		if (config.lastUsedKbPath === kbPath) return;
		await saveConfig({ ...config, lastUsedKbPath: kbPath });
	} catch (err) {
		console.warn(`[agent] 写入 lastUsedKbPath 失败: ${err instanceof Error ? err.message : err}`);
	}
}

export interface ActiveContext {
	kb: { path: string; name: string };
	session: AgentSession;
	conversationId: string;
	isNew: boolean; // 本次 select 是否新建的会话
}

let resourceLoaderState: {
	includeUserGlobal: boolean;
	promise: Promise<DefaultResourceLoader>;
} | null = null;
let active: ActiveContext | null = null;
let activeMutationQueue: Promise<void> = Promise.resolve();

async function runActiveMutation<T>(operation: () => Promise<T>): Promise<T> {
	const previous = activeMutationQueue;
	let release!: () => void;
	activeMutationQueue = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await operation();
	} finally {
		release();
	}
}

export async function getResourceLoader(): Promise<DefaultResourceLoader> {
	const includeUserGlobal = (await loadConfig()).showUserGlobalSkills === true;
	if (!resourceLoaderState || resourceLoaderState.includeUserGlobal !== includeUserGlobal) {
		const additionalSkillPaths = [
			PROJECT_SKILLS_DIR,
			...(includeUserGlobal ? [USER_GLOBAL_SKILLS_DIR] : []),
		];
		resourceLoaderState = {
			includeUserGlobal,
			promise: (async () => {
				const loader = new DefaultResourceLoader({
					cwd: REPO_ROOT,
					agentDir: getAgentDir(),
					additionalSkillPaths,
					extensionFactories: [
						knowledgeBaseExtension,
						createSynthesisExtension(() => active),
						createNewWikiExtension(),
						createArtifactsExtension(() => active),
					],
				});
				await loader.reload();
				registerPendingProviders(loader);
				console.log(
					`[agent] ResourceLoader ready (project skills + user-global ${includeUserGlobal ? "on" : "off"})`,
				);
				return loader;
			})().catch((err) => {
				resourceLoaderState = null;
				throw err;
			}),
		};
	}
	return resourceLoaderState.promise;
}

export async function reloadActiveResources(): Promise<ActiveContext | null> {
	resourceLoaderState = null;
	if (!active) return null;
	return selectConversation(active.kb.path, active.conversationId);
}

async function disposeActive(): Promise<void> {
	if (active) {
		try {
			active.session.dispose();
		} catch {
			// noop
		}
		active = null;
	}
}

export function getActive(): ActiveContext | null {
	return active;
}

export async function getActiveSession(): Promise<AgentSession> {
	if (!active) {
		throw new Error("没有活跃对话。请先选择知识库或新建对话。");
	}
	return active.session;
}

export interface LoadedSkillInfo {
	name: string;
	description: string;
	source: "builtin" | "pi-default" | "user-global";
	skillPath: string;
}

async function findSkillFiles(root: string): Promise<string[]> {
	const rootInfo = await stat(root).catch(() => null);
	if (!rootInfo?.isDirectory()) return [];
	const results: string[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
			results.push(path.join(dir, "SKILL.md"));
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) {
				continue;
			}
			await walk(path.join(dir, entry.name));
		}
	}

	await walk(root);
	return results;
}

function parseSkillFrontmatter(
	content: string,
	source: LoadedSkillInfo["source"],
	skillPath: string,
): LoadedSkillInfo | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const frontmatter = match[1] ?? "";
	const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
	let description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
	if (description === "|") {
		const lines = frontmatter.split("\n");
		const start = lines.findIndex((line) => line.startsWith("description:"));
		description = lines
			.slice(start + 1)
			.filter((line) => line.startsWith("  "))
			.map((line) => line.trim())
			.join(" ")
			.trim();
	}
	if (!name || !description) return null;
	return { name, description, source, skillPath };
}

async function scanSkillDirs(): Promise<LoadedSkillInfo[]> {
	const roots = [
		{ root: PROJECT_SKILLS_DIR, source: "builtin" as const },
		{ root: PI_DEFAULT_SKILLS_DIR, source: "pi-default" as const },
		{ root: USER_GLOBAL_SKILLS_DIR, source: "user-global" as const },
	];

	const skills: LoadedSkillInfo[] = [];
	for (const { root, source } of roots) {
		for (const file of await findSkillFiles(root)) {
			const parsed = parseSkillFrontmatter(
				await readFile(file, "utf8").catch(() => ""),
				source,
				path.dirname(file),
			);
			if (parsed) skills.push(parsed);
		}
	}
	return skills;
}

function sourceForSkillPath(skillPath: string): LoadedSkillInfo["source"] {
	const resolved = path.resolve(skillPath);
	if (resolved === PROJECT_SKILLS_DIR || resolved.startsWith(PROJECT_SKILLS_DIR + path.sep)) {
		return "builtin";
	}
	if (resolved === PI_DEFAULT_SKILLS_DIR || resolved.startsWith(PI_DEFAULT_SKILLS_DIR + path.sep)) {
		return "pi-default";
	}
	return "user-global";
}

export async function listLoadedSkills(): Promise<LoadedSkillInfo[]> {
	const loader = await getResourceLoader();
	const sdkSkills = loader.getSkills().skills;
	const scanned = await scanSkillDirs();
	const byPath = new Map(scanned.map((skill) => [path.resolve(skill.skillPath), skill]));
	const results: LoadedSkillInfo[] = [];
	const seen = new Set<string>();

	for (const skill of scanned) {
		if (seen.has(skill.name)) continue;
		seen.add(skill.name);
		results.push(skill);
	}
	for (const skill of sdkSkills) {
		if (seen.has(skill.name)) continue;
		const filePath = (skill as { filePath?: string }).filePath;
		const dir = filePath ? path.dirname(filePath) : "";
		const known = dir ? byPath.get(path.resolve(dir)) : undefined;
		seen.add(skill.name);
		results.push(
			known ?? {
				name: skill.name,
				description: skill.description,
				source: dir ? sourceForSkillPath(dir) : "user-global",
				skillPath: dir,
			},
		);
	}
	return results;
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

export function listAvailableModels(): AvailableModelInfo[] {
	modelRegistry.refresh();
	const available = modelRegistry.getAvailable();
	return available.map((model) => ({
		provider: model.provider,
		modelId: model.id,
		name: model.name,
		reasoning: model.reasoning,
		contextWindow: model.contextWindow,
		cost: { input: model.cost.input, output: model.cost.output },
		hasAuth: modelRegistry.hasConfiguredAuth(model),
	}));
}

export function getPiDefaultModelRef(): { provider?: string; modelId?: string } {
	return {
		provider: settingsManager.getDefaultProvider(),
		modelId: settingsManager.getDefaultModel(),
	};
}

export async function getRoleModel(role: "main" | "digest"): Promise<Model<any> | undefined> {
	const config = await loadConfig();
	const ref = config.modelRoles?.[role];
	if (ref) {
		const model = getConfiguredModel(ref);
		if (model) {
			console.log(`[agent] role=${role} model=${model.provider}/${model.id}`);
			return model;
		}
		console.warn(`[agent] role=${role} model ${ref.provider}/${ref.modelId} 不可用，回退 pi 默认`);
	}
	return undefined;
}

export function getConfiguredModel(ref: ModelRef): Model<any> | undefined {
	modelRegistry.refresh();
	const model = modelRegistry.find(ref.provider, ref.modelId);
	if (model && modelRegistry.hasConfiguredAuth(model)) return model;
	return undefined;
}

/**
 * 选择/进入一个知识库：先完整创建新 session，成功后才替换并 dispose 老 session。
 *   - 该 KB 有对话：opens most recent
 *   - 该 KB 无对话：creates a new one
 */
export async function selectKb(kbPath: string): Promise<ActiveContext> {
	return runActiveMutation(() => selectKbSerial(kbPath));
}

async function selectKbSerial(kbPath: string): Promise<ActiveContext> {
	const dir = await ensureKbSessionDir(kbPath);
	const loader = await getResourceLoader();

	const existing = await listConversations(kbPath);

	let isNew = false;
	let sessionManager: ReturnType<typeof SessionManager.create>;
	const mostRecent = existing[0];
	if (mostRecent) {
		sessionManager = SessionManager.open(mostRecent.path);
	} else {
		sessionManager = SessionManager.create(process.cwd(), dir);
		isNew = true;
	}

	const model = await getRoleModel("main");
	const { session, modelFallbackMessage } = await createAgentSession({
		resourceLoader: loader,
		sessionManager,
		authStorage,
		modelRegistry,
		...(model ? { model } : {}),
	});
	if (modelFallbackMessage) console.log(`[agent] ${modelFallbackMessage}`);

	let kb: ActiveContext["kb"];
	try {
		kb = await setCurrentKnowledgeBase(kbPath);
	} catch (err) {
		session.dispose();
		throw err;
	}
	const previous = active;
	active = { kb, session, conversationId: session.sessionId, isNew };
	if (previous) {
		try {
			previous.session.dispose();
		} catch {
			// noop
		}
	}
	await rememberLastUsedKb(kbPath);
	console.log(
		`[agent] selectKb ${kb.name} → conversation ${active.conversationId.slice(0, 8)} (${isNew ? "new" : "resumed"})`,
	);
	return active;
}

/**
 * 切到该 KB 下指定的对话。
 */
export async function selectConversation(
	kbPath: string,
	conversationId: string,
): Promise<ActiveContext> {
	return runActiveMutation(() => selectConversationSerial(kbPath, conversationId));
}

async function selectConversationSerial(
	kbPath: string,
	conversationId: string,
): Promise<ActiveContext> {
	const list = await listConversations(kbPath);
	const target = list.find((c) => c.id === conversationId);
	if (!target) {
		throw Object.assign(new Error("对话不存在"), { code: "NOT_FOUND" });
	}

	await disposeActive();
	const kb = await setCurrentKnowledgeBase(kbPath);
	const loader = await getResourceLoader();

	const model = await getRoleModel("main");
	const { session, modelFallbackMessage } = await createAgentSession({
		resourceLoader: loader,
		sessionManager: SessionManager.open(target.path),
		authStorage,
		modelRegistry,
		...(model ? { model } : {}),
	});
	if (modelFallbackMessage) console.log(`[agent] ${modelFallbackMessage}`);

	active = { kb, session, conversationId: session.sessionId, isNew: false };
	await rememberLastUsedKb(kbPath);
	console.log(
		`[agent] selectConversation ${kb.name} → ${active.conversationId.slice(0, 8)}`,
	);
	return active;
}

/**
 * 在该 KB 下新建一个空白对话，并设为活跃。
 */
export async function createNewConversation(kbPath: string): Promise<ActiveContext> {
	return runActiveMutation(() => createNewConversationSerial(kbPath));
}

async function createNewConversationSerial(kbPath: string): Promise<ActiveContext> {
	await disposeActive();
	const kb = await setCurrentKnowledgeBase(kbPath);
	const dir = await ensureKbSessionDir(kbPath);
	const loader = await getResourceLoader();

	const model = await getRoleModel("main");
	const { session, modelFallbackMessage } = await createAgentSession({
		resourceLoader: loader,
		sessionManager: SessionManager.create(process.cwd(), dir),
		authStorage,
		modelRegistry,
		...(model ? { model } : {}),
	});
	if (modelFallbackMessage) console.log(`[agent] ${modelFallbackMessage}`);

	active = { kb, session, conversationId: session.sessionId, isNew: true };
	await rememberLastUsedKb(kbPath);
	console.log(`[agent] createNewConversation ${kb.name} → ${active.conversationId.slice(0, 8)}`);
	return active;
}

/**
 * 完全清空活跃上下文（不删除磁盘上的会话文件）。
 */
export async function clearActive(): Promise<void> {
	await runActiveMutation(async () => {
		await disposeActive();
		clearCurrentKnowledgeBase();
	});
}

/**
 * 启动时自动恢复 config.lastUsedKbPath 指向的 KB（PRODUCT.md §5.1.1）。
 * 失败（路径已删除等）不抛错，仅记 warn。
 */
export async function bootstrapFromConfig(): Promise<void> {
	try {
		await scanAndRebuildArtifactIndex();
		const config = await loadConfig();
		if (!config.lastUsedKbPath) return;
		await selectKb(config.lastUsedKbPath);
		console.log(`[agent] bootstrap restored: ${config.lastUsedKbPath}`);
	} catch (err) {
		console.warn(
			`[agent] bootstrap restore failed (path may be invalid or removed): ${err instanceof Error ? err.message : err}`,
		);
	}
}
