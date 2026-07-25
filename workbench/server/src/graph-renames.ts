import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import {
	GraphRenameApplyDataSchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryDataSchema,
	type GraphRenameApplyData,
	type GraphRenameApplyBody,
	type GraphRenameOperationData,
	type GraphRenamePreviewData,
	type GraphRenameRecoveryBody,
	type GraphRenameRecoveryData,
} from "@llm-wiki/workbench-contracts";

import type { GraphLayoutFile } from "@llm-wiki/graph-engine";

import {
	applyByteRangeReplacements,
	assertSafeRenamePath,
	commitStagedRenameFile,
	lstatExactPath,
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
import {
	assertRecoveryBytes,
	assertRecoveryCurrent,
	captureRecoveryEvidence,
	enumerateSourceRenameConflicts,
	preserveConflictVariants,
	readOwnedVariant,
	recomputeRecoveryConflicts,
	rollbackSourceRename,
	sourceRenameStateMatches,
	writeRecoveryFile,
} from "./graph-rename-recovery.js";
import { isPendingGraphPublication, isRenamePublished, markGraphRenamePublished } from "./graph-rename-publication.js";
import { buildRenamePreview as buildPreview, readRenameLayout, runRenameScan } from "./graph-rename-preview.js";
import {
	readRegularFile,
} from "./graph-rename-safe-io.js";
import { resumeGraphWatcher, subscribeGraphEvents, suspendGraphWatcher, triggerGraphRebuild } from "./graph.js";
import { assertRegisteredKnowledgeBase } from "./knowledge-bases.js";

const RENAME_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const publicationStores = new Map<string, { store: GraphRenameJournalStore; now: () => Date }>();
let publicationListenerInstalled = false;

export interface GraphRenameServiceOptions {
	now?: () => Date;
	cliPath?: string;
	triggerRebuild?: (kbPath: string) => { ok: true; status: "started" | "queued" };
	suspendWatcher?: (kbPath: string) => void;
	resumeWatcher?: (kbPath: string, options: { trigger?: boolean }) => void;
	journalStore?: (kbPath: string) => GraphRenameJournalStore;
	beforeFileCommit?: (relativePath: string) => void | Promise<void>;
	afterFileCommit?: (relativePath: string) => void | Promise<void>;
	beforeSourceRename?: () => void | Promise<void>;
	afterSourceRename?: () => void | Promise<void>;
	afterSourceRenameStep?: (state: "old" | "transit" | "target") => void | Promise<void>;
	beforeSourceRollback?: () => void | Promise<void>;
	afterStartupContentInspect?: (operationId: string) => void | Promise<void>;
	beforeRecoveryCommit?: (relativePath: string) => void | Promise<void>;
	afterRecoveryCheck?: (relativePath: string) => void | Promise<void>;
	afterRecoveryCommit?: (relativePath: string) => void | Promise<void>;
}

export interface GraphRenameService {
	getActiveKnowledgeBasePath: () => string | null;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	previewGraphRename: (kbPath: string, sourcePath: string, newName: string) => Promise<GraphRenamePreviewData>;
	applyGraphRename: (kbPath: string, body: GraphRenameApplyBody) => Promise<GraphRenameApplyData>;
	getGraphRenameRecovery: (kbPath: string) => Promise<GraphRenameRecoveryData>;
	resolveGraphRenameRecovery: (kbPath: string, body: GraphRenameRecoveryBody) => Promise<GraphRenameRecoveryData>;
	recoverGraphRenameOperations: (kbPath: string) => Promise<{ needsRebuild: boolean }>;
	triggerPendingGraphRebuild?: (kbPath: string) => Promise<{ status: "started" | "queued" | "failed" }>;
}

export function createGraphRenameService(options: GraphRenameServiceOptions = {}): GraphRenameService {
	const now = options.now ?? (() => new Date());
	const storeFor = options.journalStore ?? ((kbPath: string) => new GraphRenameJournalStore(kbPath, { now }));
	const trackedStoreFor = (kbPath: string) => {
		const store = storeFor(kbPath);
		publicationStores.set(kbPath, { store, now });
		return store;
	};
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
			const store = trackedStoreFor(kbRealPath);
			const resolutionDigest = computeResolutionDigest(body.resolutions);
			const existing = await store.read(body.operation_id);
			if (existing && existing.kind !== "blocked") {
				const submittedName = /\.md$/i.test(body.new_name) ? `${body.new_name.slice(0, -3)}.md` : `${body.new_name}.md`;
				if (existing.immutable_digest !== body.preview_digest || existing.resolution_digest !== resolutionDigest || existing.source_path !== body.source_path || existing.target_path.split("/").at(-1) !== submittedName) throw conflictError("operation ID was reused with different inputs");
				return GraphRenameApplyDataSchema.parse({ outcome: "operation", operation: operationData(existing) });
			}
			if (!isUsablePreviewExpiry(body.expires_at, now())) return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_expired" };
			const resolved = await resolveKnowledgeBaseRenamePath({ kbPath: kbRealPath, sourcePath: body.source_path, newName: body.new_name });
			const journal = await store.acquire({ operationId: body.operation_id, immutableDigest: body.preview_digest, resolutionDigest: resolutionDigest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, createdAt: now() });
			if (journal.state !== "prepared") return { outcome: "operation", operation: operationData(journal) };
			try {
				const layout = await readRenameLayout(resolved.kbRealPath);
				if (layout && Object.hasOwn(layout.pins, resolved.targetRelativePath)) throw conflictError("target layout pin is already occupied");
				const scan = await runRenameScan(resolved.kbRealPath, resolved.sourceRelativePath, body.new_name, options.cliPath);
				const preview = buildPreview({ resolved, scan, layout, operationId: body.operation_id, expiresAt: new Date(body.expires_at) });
				if (preview.preview_digest !== body.preview_digest) {
					await store.abortPrepared(body.operation_id);
					return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_changed" };
				}
				const requiredAmbiguous = preview.ambiguous_choices.map((item) => item.occurrence_id).sort();
				const supplied = body.resolutions.map((item) => item.occurrence_id).sort();
				if (requiredAmbiguous.length !== supplied.length || requiredAmbiguous.some((value, index) => value !== supplied[index])) {
					await store.abortPrepared(body.operation_id);
					return { outcome: "preview_stale", operation_id: body.operation_id, reason: "resolutions_changed" };
				}
				return GraphRenameApplyDataSchema.parse({ outcome: "operation", operation: await performApply({ kbPath: resolved.kbRealPath, resolved, preview, sourceSha256: scan.source_sha256, body, store, layout, trigger, suspend, resume, now, beforeFileCommit: options.beforeFileCommit, afterFileCommit: options.afterFileCommit, beforeSourceRename: options.beforeSourceRename, afterSourceRename: options.afterSourceRename, afterSourceRenameStep: options.afterSourceRenameStep, beforeSourceRollback: options.beforeSourceRollback }) });
			} catch (error) {
				const current = await store.read(body.operation_id);
				if (current?.kind === "journal" && current.state === "prepared") await store.abortPrepared(body.operation_id);
				if ((error as { code?: unknown }).code === "PREVIEW_STALE") return { outcome: "preview_stale", operation_id: body.operation_id, reason: "preview_changed" };
				await store.release(body.operation_id);
				throw error;
			}
		},
		getGraphRenameRecovery: async (kbPath) => {
			const realKbPath = await realKnowledgeBasePath(kbPath);
			const store = trackedStoreFor(realKbPath);
			const collected = await collectRecovery(store, now);
			if (!collected.blocked && collected.primary?.kind === "journal" && collected.primary.state === "conflicted") {
				return currentConflictRecoveryData(
					collected.primary,
					await recomputeRecoveryConflicts(realKbPath, collected.primary),
					collected.receipts,
				);
			}
			return recoveryData(collected);
		},
		resolveGraphRenameRecovery: async (kbPath, body) => {
			const realKbPath = await realKnowledgeBasePath(kbPath);
			return resolveRecovery(realKbPath, body, trackedStoreFor(realKbPath), now, trigger, options);
		},
			recoverGraphRenameOperations: async (kbPath) => {
			const realKbPath = await realKnowledgeBasePath(kbPath);
			const store = trackedStoreFor(realKbPath);
			await pruneRenameOperationData(store, now);
			let needsRebuild = false;
			for (const candidate of await store.listForStartup()) {
				if (candidate.kind !== "journal") continue;
				const record = await store.acquireExisting(candidate.operation_id);
				try {
				if (record.state === "prepared") {
					await store.transition(record.operation_id, "rolled_back", { renameState: "old", graphRebuild: "succeeded" });
					await store.compactTerminal({ operationId: record.operation_id, now: now() });
				} else if (record.state === "applying") {
					const state = await inspectJournalContent(realKbPath, record);
					if (state === "blocked") {
						await store.writeBlocked(record.operation_id, "unsafe_current_type");
						continue;
					}
						if (state === "intended") {
						const intendedSourceDigest = record.intended_hashes[record.source_path];
						if (intendedSourceDigest) {
							const authoritative = await recomputeRecoveryConflicts(realKbPath, record);
							if (authoritative.blocked) { await store.writeBlocked(record.operation_id, "unsafe_current_type"); continue; }
							if (!sourceRenameStateMatches(record, authoritative.conflicts, intendedSourceDigest)) {
								await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(realKbPath, store, record, authoritative.conflicts) });
								continue;
							}
						}
						const target = path.join(realKbPath, ...record.target_path.split("/"));
						const source = path.join(realKbPath, ...record.source_path.split("/"));
						const sourceInfo = await lstatExactPath(source);
						const targetInfo = await lstatExactPath(target);
						if (record.rename_state === "target" && targetInfo && !sourceInfo) {
							await store.transition(record.operation_id, "committed", { renameState: "target", graphRebuild: "not_started" });
							needsRebuild = true;
							continue;
						}
						if (targetInfo && record.rename_state !== "transit") {
							const conflicts = await recomputeRecoveryConflicts(realKbPath, record);
							await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(realKbPath, store, record, conflicts.conflicts) });
							continue;
						}
						await options.afterStartupContentInspect?.(record.operation_id);
						try {
							await renameSourceWithTransit({
								kbRoot: realKbPath,
								sourcePath: source,
								targetPath: target,
								operationId: record.operation_id,
								transitPath: record.transit_path ? path.join(realKbPath, ...record.transit_path.split("/")) : undefined,
								expectedSourceSha256: record.intended_hashes[record.source_path] ?? undefined,
								onStep: async (renameState, transitPath) => {
									await store.transition(record.operation_id, "applying", { renameState, ...(transitPath ? { transitPath } : {}) });
								},
							});
						} catch {
							const conflicts = await recomputeRecoveryConflicts(realKbPath, record);
							await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(realKbPath, store, record, conflicts.conflicts) });
							continue;
						}
						await store.transition(record.operation_id, "committed", { renameState: "target", graphRebuild: "not_started" });
						needsRebuild = true;
					} else if (state === "original") {
						const originalSourceDigest = record.original_hashes[record.source_path];
						if (originalSourceDigest) {
							const authoritative = await recomputeRecoveryConflicts(realKbPath, record);
							if (authoritative.blocked) { await store.writeBlocked(record.operation_id, "unsafe_current_type"); continue; }
							if (!sourceRenameStateMatches(record, authoritative.conflicts, originalSourceDigest)) {
								await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(realKbPath, store, record, authoritative.conflicts) });
								continue;
							}
						}
						if (record.rename_state !== "old") {
							const sourceRollback = await rollbackSourceRename(realKbPath, record);
							if (!sourceRollback.ok) {
								const conflicts = await preserveConflictVariants(realKbPath, store, record, sourceRollback.conflicts);
								await store.transition(record.operation_id, "conflicted", { conflicts });
								continue;
							}
						}
						await store.transition(record.operation_id, "rolled_back", { renameState: "old", graphRebuild: "succeeded" });
						await store.compactTerminal({ operationId: record.operation_id, now: now() });
					} else {
						const conflicts = await recomputeRecoveryConflicts(realKbPath, record);
						await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(realKbPath, store, record, conflicts.conflicts) });
					}
				} else if (isPendingGraphPublication(record)) {
					if (await isRenamePublished(realKbPath, record)) {
						await store.transition(record.operation_id, record.state, { graphRebuild: "succeeded" });
						await store.compactTerminal({ operationId: record.operation_id, now: now() });
					} else {
						needsRebuild = true;
					}
				}
				} finally {
					await store.release(record.operation_id);
				}
			}
			return { needsRebuild };
		},
		triggerPendingGraphRebuild: async (kbPath) => {
			const realKbPath = await realKnowledgeBasePath(kbPath);
			const store = trackedStoreFor(realKbPath);
			await pruneRenameOperationData(store, now);
			for (const candidate of await store.listForStartup()) {
			if (candidate.kind !== "journal" || !isPendingGraphPublication(candidate)) continue;
				let locked = false;
				try {
					const record = await store.acquireExisting(candidate.operation_id);
					locked = true;
					try {
						const result = trigger(realKbPath);
						await store.transition(record.operation_id, record.state, { graphRebuild: result.status });
						return { status: result.status };
					} catch {
						await store.transition(record.operation_id, record.state, { graphRebuild: "failed" });
						return { status: "failed" as const };
					}
				} finally {
					if (locked) await store.release(candidate.operation_id);
				}
			}
			return { status: "failed" as const };
		},
	};
	if (!publicationListenerInstalled) {
		publicationListenerInstalled = true;
		subscribeGraphEvents((event) => {
			if (event.type !== "graph_updated") return;
			const context = publicationStores.get(event.kbPath);
			if (context) void markGraphRenamePublished(event.kbPath, context.store, context.now);
		});
	}
	return service;
}

async function inspectJournalContent(kbPath: string, record: GraphRenameJournal): Promise<"original" | "intended" | "mixed" | "blocked"> {
		let original = true;
		let intended = true;
		try {
			for (const [relative, expected] of Object.entries(record.original_hashes)) {
				const physicalRelative = relative === record.source_path
					? record.rename_state === "target" ? record.target_path : record.rename_state === "transit" ? record.transit_path ?? record.source_path : record.source_path
					: relative;
				const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...physicalRelative.split("/")), true);
				const info = await lstatExactPath(absolute);
				if (info && (info.isSymbolicLink() || !info.isFile())) return "blocked";
				const currentBytes = info ? await readRegularFile(kbPath, absolute, false) : null;
				const current = currentBytes ? sha256Bytes(currentBytes) : null;
				if (current !== expected) original = false;
				if (current !== record.intended_hashes[relative]) intended = false;
			}
		} catch {
			return "blocked";
		}
		if (intended) return "intended";
		if (original) return "original";
		return "mixed";
}

async function performApply(input: {
	kbPath: string;
	resolved: Awaited<ReturnType<typeof resolveKnowledgeBaseRenamePath>>;
	preview: GraphRenamePreviewData;
	sourceSha256: string;
	body: GraphRenameApplyBody;
	store: GraphRenameJournalStore;
	layout: GraphLayoutFile | null;
	trigger: (kbPath: string) => { ok: true; status: "started" | "queued" };
	suspend: (kbPath: string) => void;
	resume: (kbPath: string, options: { trigger?: boolean; discardPending?: boolean }) => void;
	now: () => Date;
	beforeFileCommit?: (relativePath: string) => void | Promise<void>;
	afterFileCommit?: (relativePath: string) => void | Promise<void>;
	beforeSourceRename?: () => void | Promise<void>;
	afterSourceRename?: () => void | Promise<void>;
	afterSourceRenameStep?: (state: "old" | "transit" | "target") => void | Promise<void>;
	beforeSourceRollback?: () => void | Promise<void>;
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
	if (!files.has(resolved.sourceRelativePath)) {
		const source = await readRegularFile(input.kbPath, resolved.sourcePath, false);
		if (!source || sha256Bytes(source) !== input.sourceSha256) throw staleError("source page changed since scan");
		files.set(resolved.sourceRelativePath, { bytes: source, original: source, replacements: [] });
	}
	const layoutPath = path.join(input.kbPath, ".wiki-graph-layout.json");
	const nextLayout = layout ? migrateRenameLayoutKey(layout, resolved.sourceRelativePath, resolved.targetRelativePath) : null;
	const layoutBytes = nextLayout && layout && JSON.stringify(nextLayout) !== JSON.stringify(layout) ? Buffer.from(`${JSON.stringify({ ...nextLayout, updatedAt: input.now().toISOString() }, null, 2)}\n`) : null;
	const originals: Record<string, string | null> = {};
	const intended: Record<string, string | null> = {};
	const stages: Record<string, string> = {};
	const backups: Record<string, string> = {};
	const intendedPaths: Record<string, string> = {};
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
		await store.writeOwnedFile(backupRelative, entry.original);
		const intendedRelative = path.posix.join(".wiki-tmp", "rename-ops", body.operation_id, "intended", `${encodeURIComponent(relative)}.bin`);
		await store.writeOwnedFile(intendedRelative, entry.bytes);
		intendedPaths[relative] = intendedRelative;
		backups[relative] = backupRelative;
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, backupPaths: backups, intendedPaths, metadata: { expires_at: body.expires_at } });
		const staged = await stageRenameFile({ kbRoot: input.kbPath, operationId: body.operation_id, destinationPath: source, bytes: entry.bytes, mode: sourceMode });
		stages[relative] = path.relative(input.kbPath, staged.stagedPath).replaceAll(path.sep, "/");
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, intendedPaths, metadata: { expires_at: body.expires_at } });
	}
	if (layoutBytes) {
		const layoutBackupRelative = path.posix.join(".wiki-tmp", "rename-ops", body.operation_id, "backups", "layout.bak");
		await store.writeOwnedFile(layoutBackupRelative, layoutOriginal!);
		const intendedRelative = path.posix.join(".wiki-tmp", "rename-ops", body.operation_id, "intended", "layout.bin");
		await store.writeOwnedFile(intendedRelative, layoutBytes);
		intendedPaths[".wiki-graph-layout.json"] = intendedRelative;
		backups[".wiki-graph-layout.json"] = layoutBackupRelative;
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, backupPaths: backups, intendedPaths, metadata: { expires_at: body.expires_at } });
		const staged = await stageRenameFile({ kbRoot: input.kbPath, operationId: body.operation_id, destinationPath: layoutPath, bytes: layoutBytes });
		stages[".wiki-graph-layout.json"] = path.relative(input.kbPath, staged.stagedPath).replaceAll(path.sep, "/");
		await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, intendedPaths, metadata: { expires_at: body.expires_at } });
	}
	await store.writePrepared({ operationId: body.operation_id, immutableDigest: body.preview_digest, sourcePath: body.source_path, targetPath: resolved.targetRelativePath, originalHashes: originals, intendedHashes: intended, stagePaths: stages, backupPaths: backups, intendedPaths, transitPath: resolved.equivalentPortableName ? path.posix.join(path.posix.dirname(resolved.sourceRelativePath), `.llm-wiki-rename-${body.operation_id}-0.md`) : undefined, metadata: { expires_at: body.expires_at } });
	await store.transition(body.operation_id, "applying", {});
	input.suspend(input.kbPath);
	const committedPaths: string[] = [];
	const contentCommittedPaths: string[] = [];
	const persistCompleted = async (relative: string) => {
		committedPaths.push(relative);
		contentCommittedPaths.push(relative);
		await store.transition(body.operation_id, "applying", { completedSteps: [...committedPaths] });
	};
	try {
		for (const [relative, entry] of files) {
			if (entry.bytes.equals(entry.original)) continue;
			const absolute = path.join(input.kbPath, ...relative.split("/"));
			await input.beforeFileCommit?.(relative);
			await commitStagedRenameFile({ kbRoot: input.kbPath, operationId: body.operation_id, destinationPath: absolute, stagedPath: path.join(input.kbPath, stages[relative]!), sha256: sha256Bytes(entry.bytes), mode: 0o600, expectedDestinationSha256: sha256Bytes(entry.original) });
			await input.afterFileCommit?.(relative);
			await persistCompleted(relative);
		}
		if (layoutBytes) {
			await input.beforeFileCommit?.(".wiki-graph-layout.json");
			await commitStagedRenameFile({ kbRoot: input.kbPath, operationId: body.operation_id, destinationPath: layoutPath, stagedPath: path.join(input.kbPath, stages[".wiki-graph-layout.json"]!), sha256: sha256Bytes(layoutBytes), mode: 0o600, expectedDestinationSha256: originals[".wiki-graph-layout.json"] });
			await input.afterFileCommit?.(".wiki-graph-layout.json");
			await persistCompleted(".wiki-graph-layout.json");
		}
		await input.beforeSourceRename?.();
		await renameSourceWithTransit({
			kbRoot: input.kbPath,
			sourcePath: resolved.sourcePath,
			targetPath: resolved.targetPath,
			operationId: body.operation_id,
			transitPath: resolved.equivalentPortableName ? path.join(path.dirname(resolved.sourcePath), `.llm-wiki-rename-${body.operation_id}-0.md`) : undefined,
			expectedSourceSha256: intended[body.source_path] ?? undefined,
			onStep: async (state, transitPath) => {
					const completedSteps = state === "target" && !committedPaths.includes(resolved.sourceRelativePath) ? [...committedPaths, resolved.sourceRelativePath] : committedPaths;
					await store.transition(body.operation_id, "applying", { renameState: state, ...(transitPath ? { transitPath } : {}), completedSteps });
					if (state === "target" && !committedPaths.includes(resolved.sourceRelativePath)) committedPaths.push(resolved.sourceRelativePath);
					await input.afterSourceRenameStep?.(state);
				},
		});
		await input.afterSourceRename?.();
		await store.transition(body.operation_id, "committed", { completedSteps: committedPaths, graphRebuild: "not_started", stagePaths: stages, backupPaths: backups, intendedPaths });
	} catch (error) {
		let safeRollback = true;
		const conflicts: GraphRenameJournal["conflicts"] = [];
		const currentJournal = await store.read(body.operation_id);
		if (currentJournal?.kind === "journal" && currentJournal.rename_state !== "old") {
			const sourceRollback = await rollbackSourceRename(input.kbPath, currentJournal, input.beforeSourceRollback);
			if (!sourceRollback.ok) {
				safeRollback = false;
				conflicts.push(...sourceRollback.conflicts);
			}
		}
		if (currentJournal?.kind === "journal" && currentJournal.rename_state === "old") {
			const sourceConflicts = await enumerateSourceRenameConflicts(input.kbPath, currentJournal);
			if (!sourceRenameStateMatches(currentJournal, sourceConflicts)) {
				safeRollback = false;
				conflicts.push(...sourceConflicts);
			}
		}
		for (const relative of [...contentCommittedPaths].reverse()) {
			const absolute = path.join(input.kbPath, ...relative.split("/"));
			const current = await readFile(absolute).catch(() => null);
			const intendedHash = intended[relative];
			if (!current || sha256Bytes(current) !== intendedHash) {
				safeRollback = false;
				conflicts.push(current ? { source_path: relative, current_state: "present", current_sha256: sha256Bytes(current), preserved_variants: [] } : { source_path: relative, current_state: "missing", preserved_variants: [] });
				continue;
			}
			await writeRecoveryFile(input.kbPath, absolute, originalBytes.get(relative) ?? await readFile(path.join(input.kbPath, ...backups[relative]!.split("/"))));
		}
		if (safeRollback) {
			await store.transition(body.operation_id, "rolled_back", { renameState: "old", graphRebuild: "succeeded", conflicts: [] });
			await store.compactTerminal({ operationId: body.operation_id, now: input.now() });
		}
		else {
			const failedRecord = await store.read(body.operation_id);
			await store.transition(body.operation_id, "conflicted", { conflicts: await preserveConflictVariants(input.kbPath, store, failedRecord as GraphRenameJournal, conflicts) });
		}
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

async function pruneRenameOperationData(store: GraphRenameJournalStore, now: () => Date): Promise<void> {
	await store.pruneExpiredOperationData({ now: now(), receiptRetentionMs: RENAME_RETENTION_MS, evidenceRetentionMs: RENAME_RETENTION_MS });
}

async function collectRecovery(store: GraphRenameJournalStore, now: () => Date): Promise<{ primary: GraphRenameJournal | GraphRenameReceipt | null; receipts: GraphRenameReceipt[]; blocked: BlockedRenameJournal | null }> {
	const records = await store.listForStartup();
	const blocked = records.find((record): record is BlockedRenameJournal => record.kind === "blocked") ?? null;
	const journals = records.filter((record): record is GraphRenameJournal => record.kind === "journal");
	const receipts = records.filter((record): record is GraphRenameReceipt => record.kind === "receipt" && record.retained_evidence.some((item) => new Date(item.expires_at).getTime() > now().getTime()));
	const primary = journals.find((record) => record.state === "prepared" || record.state === "applying" || record.state === "conflicted" || isPendingGraphPublication(record)) ?? null;
	return { primary, receipts, blocked };
}

function recoveryData(input: Awaited<ReturnType<typeof collectRecovery>>): GraphRenameRecoveryData {
	const retained_evidence_receipts = input.receipts.map((receipt) => ({ operation_id: receipt.operation_id, retained_evidence: receipt.retained_evidence }));
	if (input.blocked) return GraphRenameRecoveryDataSchema.parse({ status: "blocked", reason: input.blocked.reason, operation_id: input.blocked.operation_id, retained_evidence_receipts });
	if (!input.primary) return GraphRenameRecoveryDataSchema.parse({ status: "clear", retained_evidence_receipts });
	if (input.primary.state === "committed" || input.primary.state === "rolled_back") return GraphRenameRecoveryDataSchema.parse({ status: "rebuild_required", operation: operationData(input.primary), retained_evidence_receipts });
	return GraphRenameRecoveryDataSchema.parse({ status: "required", operation: operationData(input.primary), retained_evidence_receipts });
}

function currentConflictRecoveryData(
	record: GraphRenameJournal,
	current: Awaited<ReturnType<typeof recomputeRecoveryConflicts>>,
	receipts: GraphRenameReceipt[],
): GraphRenameRecoveryData {
	const retained_evidence_receipts = receipts.map((receipt) => ({
		operation_id: receipt.operation_id,
		retained_evidence: receipt.retained_evidence,
	}));
	if (current.blocked) {
		return GraphRenameRecoveryDataSchema.parse({
			status: "blocked",
			reason: "unsafe_current_type",
			operation_id: record.operation_id,
			retained_evidence_receipts,
		});
	}
	const conflicts = current.conflicts.map((conflict) => ({
		...conflict,
		preserved_variants: record.conflicts.find((stored) => stored.source_path === conflict.source_path)?.preserved_variants ?? [],
	}));
	return GraphRenameRecoveryDataSchema.parse({
		status: "required",
		operation: operationData({ ...record, conflicts }),
		retained_evidence_receipts,
	});
}

async function resolveRecovery(
	kbPath: string,
	body: GraphRenameRecoveryBody,
	store: GraphRenameJournalStore,
	now: () => Date,
	trigger: (kbPath: string) => { ok: true; status: "started" | "queued" },
	options: GraphRenameServiceOptions,
): Promise<GraphRenameRecoveryData> {
	const repositoryRecovery = await collectRecovery(store, now);
	if (repositoryRecovery.blocked) return recoveryData(repositoryRecovery);
	await pruneRenameOperationData(store, now);
	const record = await store.read(body.operation_id);
	if (!record || record.kind === "blocked") return GraphRenameRecoveryDataSchema.parse({ status: "blocked", reason: "invalid_journal", operation_id: body.operation_id, retained_evidence_receipts: [] });
	if (record.kind === "receipt") return recoveryData(await collectRecovery(store, now));
	if (record.state === "committed" || record.state === "rolled_back") return recoveryData(await collectRecovery(store, now));
	let lockHeld = false;
	try {
		await store.acquireExisting(body.operation_id);
		lockHeld = true;
		const current = await recomputeRecoveryConflicts(kbPath, record);
		if (current.blocked) {
			const { receipts } = await collectRecovery(store, now);
			return currentConflictRecoveryData(record, current, receipts);
		}
		const expected = current.conflicts.map((conflict) => `${conflict.source_path}\0${conflict.current_state}\0${conflict.current_sha256 ?? ""}`).sort();
		const observed = body.observed_conflicts.map((conflict) => `${conflict.source_path}\0${conflict.current_state}\0${"current_sha256" in conflict ? conflict.current_sha256 : ""}`).sort();
		if (expected.length !== observed.length || expected.some((value, index) => value !== observed[index])) {
			const { receipts } = await collectRecovery(store, now);
			return currentConflictRecoveryData(record, current, receipts);
		}

		const captured = await captureRecoveryEvidence(kbPath, store, record, current.conflicts, body.action, now());
		const desiredHashes = body.action === "finish_commit" ? record.intended_hashes : record.original_hashes;
		const applied: RecoveryWrite[] = [];
		let sourceConflict: GraphRenameJournal["conflicts"] = [];
		const plans: Array<{ relative: string; desired: Buffer | null; before: Buffer | null; current: GraphRenameJournal["conflicts"][number]; sourceName: boolean }> = [];
		const stagedRecovery = new Map<string, { stagedPath: string; desired: Buffer; before: Buffer | null; expected: string | null }>();
		try {
			for (const relative of Object.keys(desiredHashes)) {
				if (relative === record.source_path) continue;
				const desired = desiredHashes[relative] ? await readOwnedVariant(kbPath, record, relative, body.action === "finish_commit" ? "intended" : "original") : null;
				if (desiredHashes[relative] && !desired) throw invalidJournalError("recovery variant is missing");
				const currentEntry = current.conflicts.find((conflict) => conflict.source_path === relative);
				if (!currentEntry) throw invalidJournalError("recovery conflict set is incomplete");
				const before = currentEntry.current_state === "present" ? await readRegularFile(kbPath, path.join(kbPath, ...relative.split("/")), false) : null;
				plans.push({ relative, desired, before, current: currentEntry, sourceName: false });
			}
			const sourceDigest = desiredHashes[record.source_path];
			if (sourceDigest !== undefined) {
				const sourceDesired = sourceDigest ? await readOwnedVariant(kbPath, record, record.source_path, body.action === "finish_commit" ? "intended" : "original") : null;
				if (sourceDigest && !sourceDesired) throw invalidJournalError("source recovery variant is missing");
				const finalName = body.action === "finish_commit" ? record.target_path : record.source_path;
				const sourceNames = [finalName, record.source_path, record.transit_path, record.target_path].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
				for (const relative of sourceNames) {
					const currentEntry = current.conflicts.find((conflict) => conflict.source_path === relative);
					if (!currentEntry) throw invalidJournalError("source-name conflict set is incomplete");
					const before = currentEntry.current_state === "present" ? await readRegularFile(kbPath, path.join(kbPath, ...relative.split("/")), false) : null;
					plans.push({ relative, desired: relative === finalName ? sourceDesired : null, before, current: currentEntry, sourceName: true });
				}
			}
			for (const plan of plans) {
				if ((plan.before === null && plan.desired === null) || (plan.before && plan.desired && plan.before.equals(plan.desired))) continue;
				if (!plan.desired) continue;
				const destination = path.join(kbPath, ...plan.relative.split("/"));
				const mode = plan.current.current_state === "present" ? (await lstat(destination)).mode & 0o7777 : 0o600;
				const staged = await stageRenameFile({ kbRoot: kbPath, operationId: record.operation_id, destinationPath: destination, bytes: plan.desired, mode });
				stagedRecovery.set(plan.relative, { stagedPath: staged.stagedPath, desired: plan.desired, before: plan.before, expected: plan.current.current_state === "present" ? plan.current.current_sha256! : null });
			}
			let sourceRollbackBoundaryCalled = false;
			for (const plan of plans) {
				const { relative, desired, before, current: currentEntry } = plan;
				const staged = stagedRecovery.get(relative);
				if ((before === null && desired === null) || (before && desired && before.equals(desired))) continue;
				if (plan.sourceName && body.action === "finish_rollback" && !sourceRollbackBoundaryCalled) {
					sourceRollbackBoundaryCalled = true;
					await options.beforeSourceRollback?.();
				}
				await options.beforeRecoveryCommit?.(relative);
				await assertRecoveryCurrent(kbPath, relative, currentEntry);
				await options.afterRecoveryCheck?.(relative);
				if (staged) {
					await commitStagedRenameFile({ kbRoot: kbPath, operationId: record.operation_id, destinationPath: path.join(kbPath, ...relative.split("/")), stagedPath: staged.stagedPath, sha256: sha256Bytes(staged.desired), mode: 0o600, expectedDestinationSha256: staged.expected });
				} else {
					await writeRecoveryFile(kbPath, path.join(kbPath, ...relative.split("/")), desired, currentEntry?.current_state === "present" ? currentEntry.current_sha256 : null);
				}
				applied.push({ relative, before, desired });
				await options.afterRecoveryCommit?.(relative);
			}
			for (const entry of applied) await assertRecoveryBytes(kbPath, entry.relative, entry.desired);
			if (sourceDigest === undefined && body.action === "finish_commit") {
				try {
					await renameSourceWithTransit({
						kbRoot: kbPath,
						sourcePath: path.join(kbPath, ...record.source_path.split("/")),
						targetPath: path.join(kbPath, ...record.target_path.split("/")),
						transitPath: record.transit_path ? path.join(kbPath, ...record.transit_path.split("/")) : undefined,
						operationId: record.operation_id,
						expectedSourceSha256: (body.action === "finish_commit" ? record.intended_hashes[record.source_path] : record.original_hashes[record.source_path]) ?? undefined,
						onStep: async (renameState, transitPath) => {
							await store.transition(record.operation_id, "conflicted", { renameState, ...(transitPath ? { transitPath } : {}) });
						},
					});
				} catch (error) {
					const sourceConflicts = await enumerateSourceRenameConflicts(kbPath, record);
					sourceConflict = sourceConflicts;
					throw error;
				}
			} else if (sourceDigest === undefined) {
				const restored = await rollbackSourceRename(kbPath, record, options.beforeSourceRollback);
				if (!restored.ok) {
					sourceConflict = restored.conflicts;
					throw new Error("source rename recovery is conflicted");
				}
			}
		} catch {
			for (const staged of stagedRecovery.values()) await unlink(staged.stagedPath).catch(() => undefined);
			for (const entry of [...applied].reverse()) {
				try {
					await assertRecoveryBytes(kbPath, entry.relative, entry.desired);
					await writeRecoveryFile(kbPath, path.join(kbPath, ...entry.relative.split("/")), entry.before, entry.desired ? sha256Bytes(entry.desired) : null);
				} catch {
					// Preserve an unknown external version; it is reported by the next conflict scan.
				}
			}
			const refreshed = await recomputeRecoveryConflicts(kbPath, record);
			const conflicts = sourceConflict.length > 0 ? [...sourceConflict, ...refreshed.conflicts] : refreshed.conflicts;
			await store.transition(record.operation_id, "conflicted", { conflicts: await preserveConflictVariants(kbPath, store, record, conflicts) });
			return recoveryData(await collectRecovery(store, now));
		}

		const nextState = body.action === "finish_commit" ? "committed" : "rolled_back";
		await store.transition(body.operation_id, nextState, { renameState: body.action === "finish_commit" ? "target" : "old", graphRebuild: "not_started", conflicts: captured.conflicts, retainedEvidence: captured.evidence });
		try {
			const result = trigger(kbPath);
			await store.transition(body.operation_id, nextState, { graphRebuild: result.status });
		} catch {
			await store.transition(body.operation_id, nextState, { graphRebuild: "failed" });
		}
		await store.removeOwnedWorkingCopies(body.operation_id);
		return recoveryData(await collectRecovery(store, now));
	} finally {
		if (lockHeld) await store.release(body.operation_id);
	}
}

interface RecoveryWrite {
	relative: string;
	before: Buffer | null;
	desired: Buffer | null;
}

function operationData(record: GraphRenameJournal | GraphRenameReceipt): GraphRenameOperationData {
	const conflicts = record.kind === "journal" ? record.conflicts.map((conflict) => {
		if (conflict.current_state === "present" && !/^[a-f0-9]{64}$/.test(conflict.current_sha256 ?? "")) throw invalidJournalError("present conflict is missing a real digest");
		return conflict.current_state === "present"
			? { ...conflict, current_state: "present" as const, current_sha256: conflict.current_sha256! }
			: { ...conflict, current_state: "missing" as const };
	}) : [];
	return { operation_id: record.operation_id, state: record.state, source_path: record.source_path, target_path: record.target_path, graph_rebuild: record.graph_rebuild, conflicts, retained_evidence: record.retained_evidence };
}

function computeResolutionDigest(resolutions: GraphRenameApplyBody["resolutions"]): string {
	const canonical = resolutions
		.map((resolution) => ({ occurrence_id: resolution.occurrence_id, target_path: resolution.target_path }))
		.sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id) || left.target_path.localeCompare(right.target_path));
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function staleError(message: string): Error & { code: "PREVIEW_STALE" } { return Object.assign(new Error(message), { code: "PREVIEW_STALE" as const }); }
function conflictError(message: string): Error & { code: "CONFLICT" } { return Object.assign(new Error(message), { code: "CONFLICT" as const }); }
function invalidJournalError(message: string): Error & { code: "INVALID_JOURNAL" } { return Object.assign(new Error(message), { code: "INVALID_JOURNAL" as const }); }

function isUsablePreviewExpiry(value: string, nowValue: Date): boolean {
	const expiresAt = new Date(value).getTime();
	const remaining = expiresAt - nowValue.getTime();
	return Number.isFinite(expiresAt) && remaining > 0 && remaining <= RENAME_RETENTION_MS + 1_000;
}

async function realKnowledgeBasePath(kbPath: string): Promise<string> {
	return realpath(kbPath).catch(() => { throw conflictError("knowledge base is unavailable"); });
}
