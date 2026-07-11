import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { watch } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { diffGraphData, normalizeGraphLayoutFile, type GraphData, type GraphDiff, type GraphLayoutFile } from "@llm-wiki/graph-engine";

const execFileAsync = promisify(execFile);

export type GraphReadResult =
	| { ok: true; needsBuild: true; graphPath: string }
	| { ok: true; needsBuild: false; graphPath: string; data: GraphData };

export type GraphBuildStatus = "started" | "queued";

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

type RebuildQueueOptions = {
	run: () => Promise<void>;
	onError: (err: unknown) => void;
	onIdle?: () => void;
};

type WatchEvent = {
	eventType: string;
	filename: string | null;
};

type WatchHandle = {
	close: () => void;
};

type WatchFactory = (kbPath: string, onEvent: (event: WatchEvent) => void) => WatchHandle;

type WatcherOptions = {
	createWatcher: WatchFactory;
	triggerRebuild: (kbPath: string) => { ok: true; status: GraphBuildStatus };
	debounceMs?: number;
};

const eventBus = new EventEmitter();
const rebuilds = new Map<string, GraphRebuildQueue>();
let graphWatchController: KnowledgeBaseGraphWatcher | null = null;

export function graphDataPath(kbPath: string): string {
	return path.join(kbPath, "wiki", "graph-data.json");
}

export function graphLayoutPath(kbPath: string): string {
	return path.join(kbPath, ".wiki-graph-layout.json");
}

export async function readGraphData(kbPath: string): Promise<GraphReadResult> {
	const graphPath = graphDataPath(kbPath);
	const content = await readFile(graphPath, "utf8").catch((err: NodeJS.ErrnoException) => {
		if (err.code === "ENOENT") return null;
		throw err;
	});
	if (content === null) return { ok: true, needsBuild: true, graphPath };
	const data = JSON.parse(content) as GraphData;
	if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
		throw new Error("graph-data.json 格式不完整");
	}
	if (!graphNodesHavePagePaths(data.nodes)) {
		return { ok: true, needsBuild: true, graphPath };
	}
	return { ok: true, needsBuild: false, graphPath, data };
}

function graphNodesHavePagePaths(nodes: GraphData["nodes"]): boolean {
	return nodes.every((node) => {
		const sourcePath = node.source_path || node.path || node.source;
		return typeof sourcePath === "string" && sourcePath.trim().length > 0;
	});
}

export function triggerGraphRebuild(kbPath: string): { ok: true; status: GraphBuildStatus } {
	let queue = rebuilds.get(kbPath);
	if (!queue) {
		queue = createDefaultRebuildQueue(kbPath);
		rebuilds.set(kbPath, queue);
	}
	return queue.trigger();
}

export async function readGraphLayout(kbPath: string): Promise<{ ok: true; layoutPath: string; layout: GraphLayoutFile }> {
	const layoutPath = graphLayoutPath(kbPath);
	const content = await readFile(layoutPath, "utf8").catch((err: NodeJS.ErrnoException) => {
		if (err.code === "ENOENT") return null;
		throw err;
	});
	if (content === null) return { ok: true, layoutPath, layout: emptyGraphLayout() };
	try {
		return { ok: true, layoutPath, layout: normalizeGraphLayout(JSON.parse(content)) };
	} catch {
		return { ok: true, layoutPath, layout: emptyGraphLayout() };
	}
}

export async function writeGraphLayout(kbPath: string, input: unknown): Promise<{ ok: true; layoutPath: string; layout: GraphLayoutFile }> {
	const layoutPath = graphLayoutPath(kbPath);
	const layout = normalizeGraphLayout(input);
	layout.updatedAt = new Date().toISOString();
	await mkdir(path.dirname(layoutPath), { recursive: true });
	await writeFile(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
	return { ok: true, layoutPath, layout };
}

export function subscribeGraphEvents(listener: (event: GraphEvent) => void): () => void {
	eventBus.on("graph", listener);
	return () => eventBus.off("graph", listener);
}

export function watchKnowledgeBaseGraph(kbPath: string): void {
	defaultGraphWatchController().start(kbPath);
}

export function stopKnowledgeBaseGraphWatcher(): void {
	graphWatchController?.stop();
}

export function suspendGraphWatcher(kbPath: string): void {
	graphWatchController?.suspend(kbPath);
}

export function resumeGraphWatcher(kbPath: string, options: { trigger?: boolean } = {}): void {
	graphWatchController?.resume(kbPath, options);
}

export function shouldIgnoreGraphWatchPath(filename: string | null): boolean {
	if (!filename) return false;
	const normalized = filename.replaceAll("\\", "/").replace(/^\/+/, "");
	const segments = normalized.split("/").filter(Boolean);
	if (segments.some((segment) => [".wiki-tmp", ".git", ".obsidian", "node_modules", ".DS_Store"].includes(segment))) {
		return true;
	}
	if (normalized === ".wiki-graph-layout.json") return true;
	if (normalized === "wiki/graph-data.json") return true;
	if (/^wiki\/knowledge-graph.*\.html$/.test(normalized)) return true;
	return false;
}

export class GraphRebuildQueue {
	private running = false;
	private pending = false;
	private idleResolvers: Array<() => void> = [];

	constructor(private readonly options: RebuildQueueOptions) {}

	trigger(): { ok: true; status: GraphBuildStatus } {
		if (this.running) {
			this.pending = true;
			return { ok: true, status: "queued" };
		}
		this.running = true;
		void this.runLoop();
		return { ok: true, status: "started" };
	}

	waitForIdle(): Promise<void> {
		if (!this.running) return Promise.resolve();
		return new Promise((resolve) => this.idleResolvers.push(resolve));
	}

	private async runLoop(): Promise<void> {
		try {
			do {
				this.pending = false;
				try {
					await this.options.run();
				} catch (err) {
					this.options.onError(err);
				}
			} while (this.pending);
		} finally {
			this.running = false;
			this.options.onIdle?.();
			const resolvers = this.idleResolvers.splice(0);
			for (const resolve of resolvers) resolve();
		}
	}
}

export class KnowledgeBaseGraphWatcher {
	private kbPath: string | null = null;
	private handle: WatchHandle | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private suspendDepth = 0;
	private pendingWhileSuspended = false;
	private readonly debounceMs: number;

	constructor(private readonly options: WatcherOptions) {
		this.debounceMs = options.debounceMs ?? 5000;
	}

	start(kbPath: string): void {
		if (this.kbPath === kbPath && this.handle) return;
		this.stop();
		this.kbPath = kbPath;
		this.handle = this.options.createWatcher(kbPath, (event) => this.handleEvent(event));
	}

	stop(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = null;
		this.pendingWhileSuspended = false;
		this.suspendDepth = 0;
		this.kbPath = null;
		this.handle?.close();
		this.handle = null;
	}

	suspend(kbPath: string): void {
		if (this.kbPath !== kbPath) return;
		this.suspendDepth++;
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
			this.pendingWhileSuspended = true;
		}
	}

	resume(kbPath: string, options: { trigger?: boolean } = {}): void {
		if (this.kbPath !== kbPath) return;
		this.suspendDepth = Math.max(0, this.suspendDepth - 1);
		if (this.suspendDepth > 0) return;
		const shouldTrigger = options.trigger === true || this.pendingWhileSuspended;
		this.pendingWhileSuspended = false;
		if (shouldTrigger) this.triggerNow();
	}

	private handleEvent(event: WatchEvent): void {
		if (shouldIgnoreGraphWatchPath(event.filename)) return;
		if (this.suspendDepth > 0) {
			this.pendingWhileSuspended = true;
			return;
		}
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.triggerNow();
		}, this.debounceMs);
	}

	private triggerNow(): void {
		if (!this.kbPath) return;
		this.options.triggerRebuild(this.kbPath);
	}
}

async function rebuildGraph(kbPath: string): Promise<void> {
	const repoRoot = await findRepoRoot();
	const script = path.join(repoRoot, "scripts", "build-graph-data.sh");
	await access(script);
	await execFileAsync("bash", [script, kbPath], {
		cwd: repoRoot,
		env: process.env,
		maxBuffer: 10 * 1024 * 1024,
	});
}

async function findRepoRoot(): Promise<string> {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	while (true) {
		const gitPath = path.join(dir, ".git");
		const info = await stat(gitPath).catch(() => null);
		if (info) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error("Cannot locate repository root from server module path");
}

export function graphRebuildFailureMessage(_err: unknown): string {
	return "图谱重建失败";
}


function emitGraphEvent(event: GraphEvent): void {
	eventBus.emit("graph", event);
}

function createDefaultRebuildQueue(kbPath: string): GraphRebuildQueue {
	return new GraphRebuildQueue({
		run: async () => {
			const previous = await readGraphData(kbPath).catch(() => null);
			await rebuildGraph(kbPath);
			const graph = await readGraphData(kbPath);
			if (graph.needsBuild) return;
			emitGraphEvent({
				type: "graph_updated",
				kbPath,
				diff: previous && !previous.needsBuild ? diffGraphData(previous.data, graph.data) : null,
				rebuiltAt: new Date().toISOString(),
				stats: {
					nodeCount: Number(graph.data.meta?.total_nodes ?? graph.data.nodes?.length ?? 0),
					edgeCount: Number(graph.data.meta?.total_edges ?? graph.data.edges?.length ?? 0),
				},
			});
		},
		onError: (err) => {
			console.warn(
				`[graph] rebuild failed for ${kbPath}: ${err instanceof Error ? err.message : String(err)}`,
			);
			emitGraphEvent({
				type: "graph_error",
				kbPath,
				message: graphRebuildFailureMessage(err),
				rebuiltAt: new Date().toISOString(),
			});
		},
		onIdle: () => {
			rebuilds.delete(kbPath);
		},
	});
}

function createFsWatchAdapter(kbPath: string, onEvent: (event: WatchEvent) => void): WatchHandle {
	const watcher = watch(kbPath, { recursive: true }, (eventType, filename) => {
		onEvent({ eventType, filename: filename ? String(filename) : null });
	});
	console.log(`[graph] watching knowledge base for graph rebuilds: ${kbPath}`);
	return { close: () => watcher.close() };
}

function defaultGraphWatchController(): KnowledgeBaseGraphWatcher {
	if (!graphWatchController) {
		graphWatchController = new KnowledgeBaseGraphWatcher({
			createWatcher: createFsWatchAdapter,
			triggerRebuild: triggerGraphRebuild,
		});
	}
	return graphWatchController;
}

function emptyGraphLayout(): GraphLayoutFile {
	return { version: 2, pins: {}, updatedAt: "" };
}

function normalizeGraphLayout(input: unknown): GraphLayoutFile {
	return normalizeGraphLayoutFile(input);
}
