import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	GraphRenameApplyDataSchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryDataSchema,
	type GraphLayout,
	type GraphRenameApplyData,
	type GraphRenameApplyBody,
	type GraphRenameOperationData,
	type GraphRenamePreviewData,
	type GraphRenameRecoveryBody,
	type GraphRenameRecoveryData,
} from "@llm-wiki/workbench-contracts";

import type { GraphLayoutFile } from "@llm-wiki/graph-engine";

import { wikiLinkCliPath } from "./repo-root.js";
import {
	applyByteRangeReplacements,
	commitStagedRenameFile,
	migrateRenameLayoutKey,
	renameSourceWithTransit,
	resolveKnowledgeBaseRenamePath,
	sha256Bytes,
	stageRenameFile,
	type ExactByteReplacement,
} from "./graph-rename-files.js";
import {
	GraphRenameJournalStore,
	type GraphRenameJournal,
	type GraphRenameReceipt,
	type BlockedRenameJournal,
} from "./graph-rename-journal.js";
import { readGraphData, resumeGraphWatcher, subscribeGraphEvents, suspendGraphWatcher, triggerGraphRebuild } from "./graph.js";
import { assertRegisteredKnowledgeBase } from "./knowledge-bases.js";

const RENAME_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface GraphRenameServiceOptions {
	now?: () => Date;
	cliPath?: string;
	triggerRebuild?: (kbPath: string) => { ok: true; status: "started" | "queued" };
	suspendWatcher?: (kbPath: string) => void;
	resumeWatcher?: (kbPath: string, options: { trigger?: boolean }) => void;
	journalStore?: (kbPath: string) => GraphRenameJournalStore;
	beforeFileCommit?: (relativePath: string) => void | Promise<void>;
	afterFileCommit?: (relativePath: string) => void | Promise<void>;
}

export interface GraphRenameService {
	getActiveKnowledgeBasePath: () => string | null;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	previewGraphRename: (kbPath: string, sourcePath: string, newName: string) => Promise<GraphRenamePreviewData>;
	applyGraphRename: (kbPath: string, body: GraphRenameApplyBody) => Promise<GraphRenameApplyData>;
	getGraphRenameRecovery: (kbPath: string) => Promise<GraphRenameRecoveryData>;
	resolveGraphRenameRecovery: (kbPath: string, body: GraphRenameRecoveryBody) => Promise<GraphRenameRecoveryData>;
	recoverGraphRenameOperations: (kbPath: string) => Promise<{ needsRebuild: boolean }>;
}

interface RenameScanOccurrence {
	source_path: string;
	file_sha256: string;
	start_byte: number;
	end_byte: number;
	raw_link: string;
	replacement?: string;
	read_only?: boolean;
	classification?: string;
	candidate_paths?: string[];
	rendered_candidates?: Array<{ candidate_path: string; replacement: string }>;
}

interface RenameScanReport {
	file_set_sha256: string;
	source_path: string;
	target_path: string;
	validation: { requires_transit?: boolean };
	editable_occurrences: RenameScanOccurrence[];
	read_only_occurrences: RenameScanOccurrence[];
	ambiguous_occurrences: RenameScanOccurrence[];
}

export function createGraphRenameService(options: GraphRenameServiceOptions = {}): GraphRenameService {
	const now = options.now ?? (() => new Date());
	const storeFor = options.journalStore ?? ((kbPath: string) => new GraphRenameJournalStore(kbPath, { now }));
	const trigger = options.triggerRebuild ?? ((kbPath: string) => triggerGraphRebuild(kbPath));
	const suspend = options.suspendWatcher ?? suspendGraphWatcher;
	const resume = options.resumeWatcher ?? resumeGraphWatcher;

	const service: GraphRenameService = {
		getActiveKnowledgeBasePath: () => null,
		assertRegisteredKnowledgeBase,
		previewGraphRename: async (kbPath, sourcePath, newName) => {
			const resolved = await resolveKnowledgeBaseRenamePath({ kbPath, sourcePath, newName });
			const layout = await readRenameLayout(resolved.kbRealPath);
			if (layout && Object.hasOwn(layout.pins, resolved.targetRelativePath)) throw conflictError("target layout pin is already occupied");
			const scan = await runRenameScan(resolved.kbRealPath, resolved.sourceRelativePath, newName, options.cliPath);
			return GraphRenamePreviewDataSchema.parse(buildPreview({ resolved, scan, layout, operationId: randomUUID(), expiresAt: new Date(now().getTime() + RENAME_RETENTION_MS) }));
		},
		applyGraphRename: async (kbPath, body) => {
			const kbRealPath = await realpath(kbPath).catch(() => { throw conflictError("knowledge base is unavailable"); });
			const store = storeFor(kbRealPath);
			const existing = await store.read(body.operation_id);
			if (existing && existing.kind !== "blocked") {
				const submittedName = /\.md$/i.test(body.new_name) ? body.new_name : `${body.new_name}.md`;
				if (existing.immutable_digest !== body.preview_digest || existing.source_path !== body.source_path || existing.target_path.split("/").at(-1) !== submittedName) throw conflictError("operation ID was reused with different inputs");
				return GraphRenameApplyDataSchema.parse({ outcome: "operation", operation: operationData(existing) });
			}
			if (new Date(body.expires_at).getTime() <= now().getTime()) return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_expired" };
			const resolved = await resolveKnowledgeBaseRenamePath({ kbPath: kbRealPath, sourcePath: body.source_path, newName: body.new_name });
			const layout = await readRenameLayout(resolved.kbRealPath);
			if (layout && Object.hasOwn(layout.pins, resolved.targetRelativePath)) throw conflictError("target layout pin is already occupied");
			const scan = await runRenameScan(resolved.kbRealPath, resolved.sourceRelativePath, body.new_name, options.cliPath);
			const preview = buildPreview({ resolved, scan, layout, operationId: body.operation_id, expiresAt: new Date(body.expires_at) });
			if (preview.preview_digest !== body.preview_digest) return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_changed" };
			const requiredAmbiguous = preview.ambiguous_choices.map((item) => item.occurrence_id).sort();
			const supplied = body.resolutions.map((item) => item.occurrence_id).sort();
			if (requiredAmbiguous.length !== supplied.length || requiredAmbiguous.some((value, index) => value !== supplied[index])) return { outcome: "preview_stale", operation_id: body.operation_id, reason: "resolutions_changed" };
			const journal = await store.acquire({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, createdAt: now() });
			if (journal.state !== "prepared") return { outcome: "operation", operation: operationData(journal) };
			try {
				return GraphRenameApplyDataSchema.parse({ outcome: "operation", operation: await performApply({ kbPath: resolved.kbRealPath, resolved, preview, body, store, layout, trigger, suspend, resume, now, beforeFileCommit: options.beforeFileCommit, afterFileCommit: options.afterFileCommit }) });
			} catch (error) {
				if ((error as { code?: unknown }).code === "PREVIEW_STALE") return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_changed" };
				await store.release(body.operation_id);
				throw error;
			}
		},
		getGraphRenameRecovery: async (kbPath) => recoveryData(await collectRecovery(storeFor(kbPath), now)),
		resolveGraphRenameRecovery: async (kbPath, body) => resolveRecovery(kbPath, body, storeFor(kbPath), now, trigger),
		recoverGraphRenameOperations: async (kbPath) => {
			const store = storeFor(kbPath);
			let needsRebuild = false;
			for (const record of await store.listForStartup()) {
				if (record.kind !== "journal") continue;
				if (record.state === "prepared") {
					await store.transition(record.operation_id, "rolled_back", { graphRebuild: "succeeded" });
					await store.compactTerminal({ operationId: record.operation_id, now: now() });
				} else if (record.state === "applying") {
					const state = await inspectJournalContent(kbPath, record);
					if (state === "intended") {
						const target = path.join(kbPath, ...record.target_path.split("/"));
						const targetInfo = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
						if (targetInfo) {
							await store.transition(record.operation_id, "conflicted", { conflicts: (await recomputeRecoveryConflicts(kbPath, record)).conflicts });
							continue;
						}
						await renameSourceWithTransit({ sourcePath: path.join(kbPath, ...record.source_path.split("/")), targetPath: target, operationId: record.operation_id, transitPath: record.transit_path ? path.join(kbPath, ...record.transit_path.split("/")) : undefined });
						await store.transition(record.operation_id, "committed", { graphRebuild: "not_started" });
						needsRebuild = true;
					} else if (state === "original") {
						await store.transition(record.operation_id, "rolled_back", { graphRebuild: "succeeded" });
						await store.compactTerminal({ operationId: record.operation_id, now: now() });
					} else {
						await store.transition(record.operation_id, "conflicted", { conflicts: (await recomputeRecoveryConflicts(kbPath, record)).conflicts });
					}
				} else if (record.state === "committed" && record.graph_rebuild !== "succeeded") {
					needsRebuild = true;
				}
			}
			return { needsRebuild };
		},
	};
	subscribeGraphEvents((event) => {
		if (event.type !== "graph_updated") return;
		void markGraphPublished(event.kbPath, storeFor(event.kbPath), event.rebuiltAt);
	});
	return service;
}

async function markGraphPublished(kbPath: string, store: GraphRenameJournalStore, _rebuiltAt: string): Promise<void> {
	for (const record of await store.listForStartup()) {
		if (record.kind !== "journal" || record.state !== "committed" || record.graph_rebuild === "succeeded") continue;
		const graph = await readGraphData(kbPath).catch(() => null);
		if (!graph || graph.needsBuild) continue;
		const sourcePaths = new Set(graph.data.nodes.map((node) => String(node.source_path ?? node.path ?? node.id)));
		if (!sourcePaths.has(record.target_path) || sourcePaths.has(record.source_path)) continue;
		await store.transition(record.operation_id, "committed", { graphRebuild: "succeeded" });
		await store.compactTerminal({ operationId: record.operation_id, now: new Date() });
	}
}

async function inspectJournalContent(kbPath: string, record: GraphRenameJournal): Promise<"original" | "intended" | "mixed"> {
		let original = true;
		let intended = true;
		for (const [relative, expected] of Object.entries(record.original_hashes)) {
			const absolute = path.join(kbPath, ...relative.split("/"));
			const current = await readFile(absolute).then(sha256Bytes).catch(() => null);
			if (current !== expected) original = false;
			if (current !== record.intended_hashes[relative]) intended = false;
		}
		if (intended) return "intended";
		if (original) return "original";
		return "mixed";
}

async function performApply(input: {
	kbPath: string;
	resolved: Awaited<ReturnType<typeof resolveKnowledgeBaseRenamePath>>;
	preview: GraphRenamePreviewData;
	body: GraphRenameApplyBody;
	store: GraphRenameJournalStore;
	layout: GraphLayoutFile | null;
	trigger: (kbPath: string) => { ok: true; status: "started" | "queued" };
	suspend: (kbPath: string) => void;
	resume: (kbPath: string, options: { trigger?: boolean; discardPending?: boolean }) => void;
	now: () => Date;
	beforeFileCommit?: (relativePath: string) => void | Promise<void>;
	afterFileCommit?: (relativePath: string) => void | Promise<void>;
}): Promise<GraphRenameOperationData> {
	const { resolved, preview, body, store, layout } = input;
	const files = new Map<string, { bytes: Buffer; original: Buffer; replacements: ExactByteReplacement[] }>();
	for (const file of preview.editable_files) {
		const absolute = path.join(input.kbPath, ...file.source_path.split("/"));
		const original = await readFile(absolute).catch(() => { throw staleError("source file disappeared since preview"); });
		if (sha256Bytes(original) !== file.file_sha256) { await store.release(body.operation_id); throw staleError("source file changed since preview"); }
		const replacements = file.occurrences.filter((occurrence) => occurrence.replacement_raw_link).map((occurrence) => ({ startByte: occurrence.start_byte, endByte: occurrence.end_byte, rawLink: occurrence.raw_link, replacement: occurrence.replacement_raw_link! }));
		for (const ambiguous of preview.ambiguous_choices.filter((choice) => choice.source_path === file.source_path)) {
			const resolution = body.resolutions.find((item) => item.occurrence_id === ambiguous.occurrence_id);
			const candidate = ambiguous.candidates.find((item) => item.target_path === resolution?.target_path);
			if (!candidate) { await store.release(body.operation_id); throw staleError("resolution is not offered by preview"); }
			const occurrence = file.occurrences.find((item) => item.occurrence_id === ambiguous.occurrence_id);
			if (occurrence) replacements.push({ startByte: occurrence.start_byte, endByte: occurrence.end_byte, rawLink: occurrence.raw_link, replacement: candidate.replacement_raw_link });
		}
		const changed = applyByteRangeReplacements(original, replacements);
		if (!changed.equals(original)) files.set(file.source_path, { bytes: changed, original, replacements });
	}
	const layoutPath = path.join(input.kbPath, ".wiki-graph-layout.json");
	const nextLayout = layout ? migrateRenameLayoutKey(layout, resolved.sourceRelativePath, resolved.targetRelativePath) : null;
	const layoutBytes = nextLayout && layout && JSON.stringify(nextLayout) !== JSON.stringify(layout) ? Buffer.from(`${JSON.stringify({ ...nextLayout, updatedAt: input.now().toISOString() }, null, 2)}\n`) : null;
	const originals: Record<string, string | null> = {};
	const intended: Record<string, string | null> = {};
	const stages: Record<string, string> = {};
	const backups: Record<string, string> = {};
	const originalBytes = new Map<string, Buffer>();
	for (const [relative, entry] of files) {
		originals[relative] = sha256Bytes(entry.original);
		intended[relative] = sha256Bytes(entry.bytes);
		originalBytes.set(relative, entry.original);
	}
	let layoutOriginal: Buffer | null = null;
	if (layoutBytes) {
		const currentLayout = await readFile(layoutPath);
		layoutOriginal = currentLayout;
		originals[".wiki-graph-layout.json"] = sha256Bytes(currentLayout);
		intended[".wiki-graph-layout.json"] = sha256Bytes(layoutBytes);
	}
	await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, metadata: { expires_at: body.expires_at } });
	for (const [relative, entry] of files) {
		const source = path.join(input.kbPath, ...relative.split("/"));
		const sourceMode = (await lstat(source)).mode & 0o7777;
		const backupRelative = path.posix.join(".wiki-tmp", "rename-ops", body.operation_id, "backups", `${encodeURIComponent(relative)}.bak`);
		const backupPath = path.join(input.kbPath, ...backupRelative.split("/"));
		await mkdir(path.dirname(backupPath), { recursive: true });
		await writeFile(backupPath, entry.original, { mode: 0o600 });
		const staged = await stageRenameFile({ operationId: body.operation_id, destinationPath: source, bytes: entry.bytes, mode: sourceMode });
		stages[relative] = path.relative(input.kbPath, staged.stagedPath).replaceAll(path.sep, "/");
		backups[relative] = backupRelative;
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, metadata: { expires_at: body.expires_at } });
	}
	if (layoutBytes) {
		const layoutBackupRelative = path.posix.join(".wiki-tmp", "rename-ops", body.operation_id, "backups", "layout.bak");
		const layoutBackupPath = path.join(input.kbPath, ...layoutBackupRelative.split("/"));
		await mkdir(path.dirname(layoutBackupPath), { recursive: true });
		await writeFile(layoutBackupPath, layoutOriginal!, { mode: 0o600 });
		const staged = await stageRenameFile({ operationId: body.operation_id, destinationPath: layoutPath, bytes: layoutBytes });
		stages[".wiki-graph-layout.json"] = path.relative(input.kbPath, staged.stagedPath).replaceAll(path.sep, "/");
		backups[".wiki-graph-layout.json"] = layoutBackupRelative;
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, metadata: { expires_at: body.expires_at } });
	}
	await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, transitPath: resolved.equivalentPortableName ? path.posix.join(path.posix.dirname(resolved.sourceRelativePath), `.llm-wiki-rename-${body.operation_id}-0.md`) : undefined, metadata: { expires_at: body.expires_at } });
	await store.transition(body.operation_id, "applying", {});
	input.suspend(input.kbPath);
	const committedPaths: string[] = [];
	try {
		if (layoutBytes) {
			await input.beforeFileCommit?.(".wiki-graph-layout.json");
			await commitStagedRenameFile({ operationId: body.operation_id, destinationPath: layoutPath, stagedPath: path.join(input.kbPath, stages[".wiki-graph-layout.json"]!), sha256: sha256Bytes(layoutBytes), mode: 0o600, expectedDestinationSha256: originals[".wiki-graph-layout.json"] });
			committedPaths.push(".wiki-graph-layout.json");
			await input.afterFileCommit?.(".wiki-graph-layout.json");
		}
		for (const [relative, entry] of files) {
			const absolute = path.join(input.kbPath, ...relative.split("/"));
			await input.beforeFileCommit?.(relative);
			await commitStagedRenameFile({ operationId: body.operation_id, destinationPath: absolute, stagedPath: path.join(input.kbPath, stages[relative]!), sha256: sha256Bytes(entry.bytes), mode: 0o600, expectedDestinationSha256: sha256Bytes(entry.original) });
			await input.afterFileCommit?.(relative);
			committedPaths.push(relative);
		}
		await renameSourceWithTransit({ sourcePath: resolved.sourcePath, targetPath: resolved.targetPath, operationId: body.operation_id, transitPath: resolved.equivalentPortableName ? path.join(input.kbPath, `.llm-wiki-rename-${body.operation_id}-0.md`) : undefined });
		await store.transition(body.operation_id, "committed", { completedSteps: [...Object.keys(files), ...(layoutBytes ? [".wiki-graph-layout.json"] : []), resolved.sourceRelativePath], graphRebuild: "not_started", stagePaths: stages, backupPaths: backups });
	} catch (error) {
		let safeRollback = true;
		const conflicts: GraphRenameJournal["conflicts"] = [];
		for (const relative of [...committedPaths].reverse()) {
			const absolute = path.join(input.kbPath, ...relative.split("/"));
			const current = await readFile(absolute).catch(() => null);
			const intendedHash = intended[relative];
			if (!current || sha256Bytes(current) !== intendedHash) {
				safeRollback = false;
				conflicts.push(current ? { source_path: relative, current_state: "present", current_sha256: sha256Bytes(current), preserved_variants: [] } : { source_path: relative, current_state: "missing", preserved_variants: [] });
				continue;
			}
			await writeRecoveryFile(absolute, originalBytes.get(relative) ?? await readFile(path.join(input.kbPath, ...backups[relative]!.split("/"))));
		}
		if (safeRollback) {
			await store.transition(body.operation_id, "rolled_back", { graphRebuild: "succeeded", conflicts: [] });
			await store.compactTerminal({ operationId: body.operation_id, now: input.now() });
		}
		else await store.transition(body.operation_id, "conflicted", { conflicts });
		await store.release(body.operation_id);
		return operationData(await store.read(body.operation_id) as GraphRenameJournal);
	} finally {
		input.resume(input.kbPath, { trigger: false, discardPending: true });
	}
	let graphRebuild: GraphRenameOperationData["graph_rebuild"] = "not_started";
	try {
		const result = input.trigger(input.kbPath);
		graphRebuild = result.status;
		await store.transition(body.operation_id, "committed", { graphRebuild });
	} catch {
		graphRebuild = "failed";
		await store.transition(body.operation_id, "committed", { graphRebuild });
	}
	await store.release(body.operation_id);
	return operationData(await store.read(body.operation_id) as GraphRenameJournal);
}

function buildPreview(input: { resolved: Awaited<ReturnType<typeof resolveKnowledgeBaseRenamePath>>; scan: RenameScanReport; layout: GraphLayoutFile | null; operationId: string; expiresAt: Date }): GraphRenamePreviewData {
	const editable = input.scan.editable_occurrences;
	const ambiguous = input.scan.ambiguous_occurrences.filter((item) => item.classification !== "read_only" && !item.read_only);
	const occurrenceId = (item: RenameScanOccurrence) => `occurrence-${createHash("sha256").update(`${item.source_path}\0${item.file_sha256}\0${item.start_byte}\0${item.end_byte}\0${item.raw_link}`).digest("hex").slice(0, 16)}`;
	const grouped = new Map<string, GraphRenamePreviewData["editable_files"][number]>();
	for (const item of editable) {
		const id = occurrenceId(item);
		const entry = grouped.get(item.source_path) ?? { source_path: item.source_path, file_sha256: item.file_sha256, occurrences: [], read_only: false };
		entry.occurrences.push({ occurrence_id: id, source_path: item.source_path, file_sha256: item.file_sha256, start_byte: item.start_byte, end_byte: item.end_byte, raw_link: item.raw_link, ...(item.replacement ? { replacement_raw_link: item.replacement } : {}), resolution_kind: item.replacement ? (item.raw_link.includes("/") || item.raw_link.endsWith(".md") ? "explicit_path" : "unique_basename") : "ambiguous" });
		grouped.set(item.source_path, entry);
	}
	for (const item of ambiguous) {
		const id = occurrenceId(item);
		const entry = grouped.get(item.source_path) ?? { source_path: item.source_path, file_sha256: item.file_sha256, occurrences: [], read_only: false };
		if (!entry.occurrences.some((occurrence) => occurrence.occurrence_id === id)) entry.occurrences.push({ occurrence_id: id, source_path: item.source_path, file_sha256: item.file_sha256, start_byte: item.start_byte, end_byte: item.end_byte, raw_link: item.raw_link, resolution_kind: "ambiguous" });
		grouped.set(item.source_path, entry);
	}
	const readOnly = [...input.scan.read_only_occurrences, ...input.scan.ambiguous_occurrences.filter((item) => item.classification === "read_only" || item.read_only)].map((item) => ({ occurrence_id: occurrenceId(item), source_path: item.source_path, file_sha256: item.file_sha256, start_byte: item.start_byte, end_byte: item.end_byte, raw_link: item.raw_link, resolution_kind: "ambiguous" as const }));
	const ambiguousChoices = ambiguous.map((item) => ({ occurrence_id: occurrenceId(item), source_path: item.source_path, candidates: (item.rendered_candidates ?? []).map((candidate) => ({ target_path: candidate.candidate_path, replacement_raw_link: candidate.replacement })) }));
	const layoutChange = { from_key: input.resolved.sourceRelativePath, to_key: input.resolved.targetRelativePath, present: Boolean(input.layout?.pins && Object.hasOwn(input.layout.pins, input.resolved.sourceRelativePath)) };
	const projection = { operation_id: input.operationId, expires_at: input.expiresAt.toISOString(), source_path: input.resolved.sourceRelativePath, target_path: input.resolved.targetRelativePath, file_set_sha256: input.scan.file_set_sha256, editable_files: [...grouped.values()], read_only_references: readOnly, ambiguous_choices: ambiguousChoices, layout_change: layoutChange };
	const digestProjection = { ...projection, layout: input.layout };
	const previewDigest = createHash("sha256").update(JSON.stringify(digestProjection)).digest("hex");
	return { ...projection, preview_digest: previewDigest, equivalent_portable_name: input.resolved.equivalentPortableName, summary: { editable_files: grouped.size, editable_occurrences: editable.length + ambiguous.filter((item) => !editable.some((entry) => occurrenceId(entry) === occurrenceId(item))).length, read_only_occurrences: readOnly.length, ambiguous_occurrences: ambiguous.length } };
}

async function runRenameScan(kbPath: string, sourcePath: string, newName: string, cliPathOption?: string): Promise<RenameScanReport> {
	const cliPath = cliPathOption ?? await wikiLinkCliPath();
	return await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cliPath, "rename-scan", kbPath, sourcePath, newName], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code !== 0) return reject(new Error(`rename scan failed: ${signal ?? code}`));
			try { resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as RenameScanReport); } catch { reject(new Error("rename scan returned invalid JSON")); }
		});
	});
}

async function readRenameLayout(kbPath: string): Promise<GraphLayoutFile | null> {
	const target = path.join(kbPath, ".wiki-graph-layout.json");
	const info = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
	if (!info) return null;
	if (!info.isFile() || info.isSymbolicLink()) throw conflictError("layout file is unsafe");
	const content = await readFile(target, "utf8");
	const parsed = JSON.parse(content) as GraphLayout;
	if (parsed.version !== 2 || !parsed.pins || typeof parsed.pins !== "object") throw conflictError("layout file is invalid");
	return parsed as GraphLayoutFile;
}

async function collectRecovery(store: GraphRenameJournalStore, now: () => Date): Promise<{ primary: GraphRenameJournal | GraphRenameReceipt | null; receipts: GraphRenameReceipt[]; blocked: BlockedRenameJournal | null }> {
	const records = await store.listForStartup();
	const blocked = records.find((record): record is BlockedRenameJournal => record.kind === "blocked") ?? null;
	const journals = records.filter((record): record is GraphRenameJournal => record.kind === "journal");
	const receipts = records.filter((record): record is GraphRenameReceipt => record.kind === "receipt" && record.retained_evidence.some((item) => new Date(item.expires_at).getTime() > now().getTime()));
	const primary = journals.find((record) => record.state !== "committed" || record.graph_rebuild !== "succeeded") ?? null;
	return { primary, receipts, blocked };
}

function recoveryData(input: Awaited<ReturnType<typeof collectRecovery>>): GraphRenameRecoveryData {
	const retained_evidence_receipts = input.receipts.map((receipt) => ({ operation_id: receipt.operation_id, retained_evidence: receipt.retained_evidence }));
	if (input.blocked) return GraphRenameRecoveryDataSchema.parse({ status: "blocked", reason: input.blocked.reason, operation_id: input.blocked.operation_id, retained_evidence_receipts });
	if (!input.primary) return GraphRenameRecoveryDataSchema.parse({ status: "clear", retained_evidence_receipts });
	if (input.primary.state === "committed") return GraphRenameRecoveryDataSchema.parse({ status: "rebuild_required", operation: operationData(input.primary), retained_evidence_receipts });
	return GraphRenameRecoveryDataSchema.parse({ status: "required", operation: operationData(input.primary), retained_evidence_receipts });
}

async function resolveRecovery(kbPath: string, body: GraphRenameRecoveryBody, store: GraphRenameJournalStore, now: () => Date, trigger: (kbPath: string) => { ok: true; status: "started" | "queued" }): Promise<GraphRenameRecoveryData> {
	const record = await store.read(body.operation_id);
	if (!record || record.kind === "blocked") return GraphRenameRecoveryDataSchema.parse({ status: "blocked", reason: "invalid_journal", operation_id: body.operation_id, retained_evidence_receipts: [] });
	if (record.kind === "receipt") return recoveryData(await collectRecovery(store, now));
	const current = await recomputeRecoveryConflicts(kbPath, record);
	if (current.blocked) return GraphRenameRecoveryDataSchema.parse({ status: "blocked", reason: "unsafe_current_type", operation_id: record.operation_id, retained_evidence_receipts: [] });
	const expected = current.conflicts.map((conflict) => `${conflict.source_path}\0${conflict.current_state}\0${conflict.current_sha256 ?? ""}`).sort();
	const observed = body.observed_conflicts.map((conflict) => `${conflict.source_path}\0${conflict.current_state}\0${"current_sha256" in conflict ? conflict.current_sha256 : ""}`).sort();
	if (expected.length !== observed.length || expected.some((value, index) => value !== observed[index])) {
		await store.transition(record.operation_id, "conflicted", { conflicts: current.conflicts });
		return recoveryData({ primary: { ...record, conflicts: current.conflicts }, receipts: [], blocked: null });
	}
	const retainedEvidence = [];
	for (const conflict of current.conflicts) {
		if (conflict.current_state !== "present") continue;
		const bytes = await readFile(path.join(kbPath, ...conflict.source_path.split("/")));
		const relative = await store.preserveConflictVariant({ operationId: record.operation_id, kind: "current", sourcePath: conflict.source_path, bytes });
		retainedEvidence.push({ relative_path: relative, sha256: sha256Bytes(bytes), expires_at: new Date(now().getTime() + RENAME_RETENTION_MS).toISOString() });
	}
	for (const [relative, digest] of Object.entries(body.action === "finish_commit" ? record.intended_hashes : record.original_hashes)) {
		if (!digest) continue;
		const absolute = path.join(kbPath, ...relative.split("/"));
		const bytes = body.action === "finish_commit" ? await readOwnedVariant(kbPath, record, relative, "intended") : await readOwnedVariant(kbPath, record, relative, "original");
		if (bytes) {
			const currentBytes = await readFile(absolute).catch(() => null);
			const observedEntry = current.conflicts.find((conflict) => conflict.source_path === relative);
			const observedDigest = currentBytes ? sha256Bytes(currentBytes) : null;
			const expectedDigest = observedEntry?.current_state === "present" ? observedEntry.current_sha256 : null;
			if (observedDigest !== expectedDigest) return recoveryData({ primary: { ...record, conflicts: current.conflicts }, receipts: [], blocked: null });
			await writeRecoveryFile(absolute, bytes);
		}
	}
	await store.transition(body.operation_id, body.action === "finish_commit" ? "committed" : "rolled_back", { graphRebuild: "not_started", retainedEvidence });
	try {
		const result = trigger(kbPath);
		await store.transition(body.operation_id, body.action === "finish_commit" ? "committed" : "rolled_back", { graphRebuild: result.status });
	} catch { await store.transition(body.operation_id, body.action === "finish_commit" ? "committed" : "rolled_back", { graphRebuild: "failed" }); }
	return recoveryData(await collectRecovery(store, now));
}

async function readOwnedVariant(kbPath: string, record: GraphRenameJournal, relative: string, kind: "original" | "intended"): Promise<Buffer | null> {
	const backup = record.backup_paths[relative];
	if (kind === "original" && backup) return readFile(path.join(kbPath, ...backup.split("/"))).catch(() => null);
	if (kind === "intended") {
		const stage = record.stage_paths[relative];
		if (stage) return readFile(path.join(kbPath, ...stage.split("/"))).catch(() => null);
	}
	return null;
}

async function recomputeRecoveryConflicts(kbPath: string, record: GraphRenameJournal): Promise<{ conflicts: GraphRenameJournal["conflicts"]; blocked: boolean }> {
	const paths = new Set([...Object.keys(record.original_hashes), ...Object.keys(record.intended_hashes)]);
	const conflicts: GraphRenameJournal["conflicts"] = [];
	for (const relative of paths) {
		const absolute = path.join(kbPath, ...relative.split("/"));
		const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
		if (info && (info.isSymbolicLink() || !info.isFile())) return { conflicts, blocked: true };
		if (!info) conflicts.push({ source_path: relative, current_state: "missing", preserved_variants: [] });
		else conflicts.push({ source_path: relative, current_state: "present", current_sha256: sha256Bytes(await readFile(absolute)), preserved_variants: [] });
	}
	return { conflicts, blocked: false };
}

async function writeRecoveryFile(target: string, bytes: Buffer): Promise<void> {
	const temporary = `${target}.recovery-${randomUUID()}.tmp`;
	await writeFile(temporary, bytes, { mode: 0o600 });
	await (await import("node:fs/promises")).rename(temporary, target).catch(async (error) => {
		await (await import("node:fs/promises")).unlink(temporary).catch(() => undefined);
		throw error;
	});
}

function operationData(record: GraphRenameJournal | GraphRenameReceipt): GraphRenameOperationData {
	const conflicts = record.kind === "journal" ? record.conflicts.map((conflict) => conflict.current_state === "present"
		? { ...conflict, current_state: "present" as const, current_sha256: conflict.current_sha256 ?? "0".repeat(64) }
		: { ...conflict, current_state: "missing" as const }) : [];
	return { operation_id: record.operation_id, state: record.state, source_path: record.source_path, target_path: record.target_path, graph_rebuild: record.graph_rebuild, conflicts, retained_evidence: record.retained_evidence };
}

function staleError(message: string): Error & { code: "PREVIEW_STALE" } { return Object.assign(new Error(message), { code: "PREVIEW_STALE" as const }); }
function conflictError(message: string): Error & { code: "CONFLICT" } { return Object.assign(new Error(message), { code: "CONFLICT" as const }); }
