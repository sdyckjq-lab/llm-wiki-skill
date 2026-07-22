import { randomUUID, createHash } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";

export type RenameJournalState = "prepared" | "applying" | "committed" | "rolled_back" | "conflicted";
export type GraphRebuildState = "not_started" | "started" | "queued" | "failed" | "succeeded";
export type RenameFileState = "old" | "transit" | "target";
export const RENAME_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PreservedEvidence {
	relative_path: string;
	sha256: string;
	expires_at: string;
}

export interface GraphRenameJournal {
	kind: "journal";
	operation_id: string;
	immutable_digest: string;
	resolution_digest?: string;
	state: RenameJournalState;
	source_path: string;
	target_path: string;
	graph_rebuild: GraphRebuildState;
	created_at: string;
	updated_at: string;
	rename_state: RenameFileState;
	transit_path?: string;
	completed_steps: string[];
	original_hashes: Record<string, string | null>;
	intended_hashes: Record<string, string | null>;
	intended_paths: Record<string, string>;
	stage_paths: Record<string, string>;
	backup_paths: Record<string, string>;
	layout_before?: string;
	layout_after?: string;
	conflicts: Array<{
		source_path: string;
		current_state: "present" | "missing";
		current_sha256?: string;
		preserved_variants: Array<{ kind: "current" | "original" | "intended"; relative_path: string; sha256: string }>;
	}>;
	retained_evidence: PreservedEvidence[];
	metadata?: Record<string, unknown>;
}

export interface GraphRenameReceipt {
	kind: "receipt";
	operation_id: string;
	immutable_digest: string;
	resolution_digest?: string;
	state: "committed" | "rolled_back" | "conflicted";
	source_path: string;
	target_path: string;
	graph_rebuild: GraphRebuildState;
	created_at: string;
	updated_at: string;
	retained_evidence: PreservedEvidence[];
	final_hashes: Record<string, string | null>;
	rename_state: RenameFileState;
}

export interface BlockedRenameJournal {
	kind: "blocked";
	operation_id: string | null;
	reason: "unknown_state" | "invalid_journal" | "unsafe_current_type";
}

export interface AcquireRenameOperation {
	operationId: string;
	immutableDigest: string;
	sourcePath: string;
	targetPath: string;
	resolutionDigest?: string;
	createdAt?: Date;
}

export interface PreparedRenameJournal {
	operationId: string;
	immutableDigest: string;
	sourcePath: string;
	targetPath: string;
	transitPath?: string;
	originalHashes?: Record<string, string | null>;
	intendedHashes?: Record<string, string | null>;
	stagePaths?: Record<string, string>;
	backupPaths?: Record<string, string>;
	intendedPaths?: Record<string, string>;
	renameState?: RenameFileState;
	layoutBefore?: string;
	layoutAfter?: string;
	metadata?: Record<string, unknown>;
}

export interface JournalPatch {
	graphRebuild?: GraphRebuildState;
	transitPath?: string;
	completedSteps?: string[];
	originalHashes?: Record<string, string | null>;
	intendedHashes?: Record<string, string | null>;
	stagePaths?: Record<string, string>;
	backupPaths?: Record<string, string>;
	intendedPaths?: Record<string, string>;
	renameState?: RenameFileState;
	layoutBefore?: string;
	layoutAfter?: string;
	conflicts?: GraphRenameJournal["conflicts"];
	retainedEvidence?: PreservedEvidence[];
	metadata?: Record<string, unknown>;
}

export interface PreserveConflictInput {
	operationId: string;
	kind: "current" | "original" | "intended";
	sourcePath: string;
	bytes: Buffer;
}

export interface GraphRenameJournalStoreOptions {
	now?: () => Date;
	serverInstanceId?: string;
	isProcessAlive?: (pid: number) => boolean | "unknown" | Promise<boolean | "unknown">;
}

export interface PendingRebuildStatus {
	operationId: string;
	status: GraphRebuildState;
}

export class GraphRenameJournalStore {
	readonly operationsRoot: string;
	private readonly now: () => Date;
	private readonly serverInstanceId: string;
	private readonly isProcessAlive: (pid: number) => boolean | "unknown" | Promise<boolean | "unknown">;
	private readonly heldLockTexts = new Map<string, string>();

	constructor(readonly kbPath: string, options: GraphRenameJournalStoreOptions = {}) {
		this.operationsRoot = path.join(kbPath, ".wiki-tmp", "rename-ops");
		this.now = options.now ?? (() => new Date());
		this.serverInstanceId = options.serverInstanceId ?? randomUUID();
		const defaultProcessProbe: (pid: number) => boolean | "unknown" = (pid): boolean | "unknown" => {
			try { process.kill(pid, 0); return true; } catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
				return "unknown";
			}
		};
		this.isProcessAlive = options.isProcessAlive ?? defaultProcessProbe;
	}

	async acquire(input: AcquireRenameOperation): Promise<GraphRenameJournal> {
		if (!safeOperationId(input.operationId)) throw conflictError("operation ID is invalid");
		await this.assertSafeJournalRoot(true);
		await mkdir(this.operationsRoot, { recursive: true, mode: 0o700 });
		await this.pruneExpiredOperationData({ now: this.now(), receiptRetentionMs: RENAME_RETENTION_MS, evidenceRetentionMs: RENAME_RETENTION_MS });
		const existing = await this.read(input.operationId);
		if (existing) {
			if (existing.kind === "blocked") throw busyError("recovery is blocked");
			if (existing.immutable_digest !== input.immutableDigest || existing.source_path !== input.sourcePath || existing.target_path !== input.targetPath || (existing.resolution_digest ?? undefined) !== (input.resolutionDigest ?? undefined)) throw conflictError("operation ID was reused with different inputs");
			return existing.kind === "journal" ? existing : receiptAsJournal(existing);
		}
		for (const record of await this.listForStartup()) {
			if (record.kind === "blocked") throw busyError("rename recovery is blocked");
			if (record.kind === "journal" && (record.state === "prepared" || record.state === "applying" || record.state === "conflicted" || (isTerminalState(record.state) && record.graph_rebuild !== "succeeded"))) {
				throw busyError("another rename requires recovery or graph publication");
			}
		}
		await this.acquireLock(input);
		const created = (input.createdAt ?? this.now()).toISOString();
		const journal: GraphRenameJournal = {
			kind: "journal",
			operation_id: input.operationId,
			immutable_digest: input.immutableDigest,
			...(input.resolutionDigest ? { resolution_digest: input.resolutionDigest } : {}),
			state: "prepared",
			source_path: input.sourcePath,
			target_path: input.targetPath,
			graph_rebuild: "not_started",
			rename_state: "old",
			created_at: created,
			updated_at: created,
			completed_steps: [],
			original_hashes: {},
			intended_hashes: {},
			intended_paths: {},
			stage_paths: {},
			backup_paths: {},
			conflicts: [],
			retained_evidence: [],
		};
		await this.writeManifest(journal);
		return journal;
	}

	/** Acquire the same per-knowledge-base lock for recovery of an existing journal. */
	async acquireExisting(operationId: string): Promise<GraphRenameJournal> {
		if (!safeOperationId(operationId)) throw conflictError("operation ID is invalid");
		const record = await this.read(operationId);
		if (!record || record.kind !== "journal") throw conflictError("rename journal is unavailable");
		await this.acquireLock({
			operationId: record.operation_id,
			immutableDigest: record.immutable_digest,
			sourcePath: record.source_path,
			targetPath: record.target_path,
			...(record.resolution_digest ? { resolutionDigest: record.resolution_digest } : {}),
		});
		return record;
	}

	async read(operationId: string): Promise<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal | null> {
		if (!safeOperationId(operationId)) return { kind: "blocked", operation_id: null, reason: "invalid_journal" };
		try {
			await this.assertSafeJournalRoot(false);
			await this.assertSafeOperationDirectory(operationId, false);
			await this.assertSafeOwnedPath(path.posix.join(".wiki-tmp", "rename-ops", operationId, "manifest.json"), true);
		} catch { return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" }; }
		const directory = path.join(this.operationsRoot, operationId);
		const manifestPath = path.join(directory, "manifest.json");
		const manifestInfo = await lstat(manifestPath).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (manifestInfo === null) return null;
		if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" };
		const content = await readFile(manifestPath, "utf8").catch(() => null);
		if (content === null) return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" };
		try {
			const value = JSON.parse(content) as Partial<GraphRenameJournal> & Partial<GraphRenameReceipt> & Partial<BlockedRenameJournal>;
			if (value.operation_id !== operationId) return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" };
			if (value.kind === "blocked" && hasOnlyKeys(value, ["kind", "operation_id", "reason"]) && (value.reason === "unknown_state" || value.reason === "invalid_journal" || value.reason === "unsafe_current_type")) return value as BlockedRenameJournal;
			if (value.kind === "journal" && isJournalState(value.state) && typeof value.immutable_digest === "string" && safeJournalPaths(value, operationId)) {
				await this.assertSafeRecordDataPaths(value as GraphRenameJournal);
				return value as GraphRenameJournal;
			}
			if (value.kind === "receipt" && isTerminalState(value.state) && typeof value.immutable_digest === "string" && safeReceiptPaths(value, operationId)) {
				await this.assertSafeRecordDataPaths(value as GraphRenameReceipt);
				return value as GraphRenameReceipt;
			}
			return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" };
		} catch {
			return { kind: "blocked", operation_id: operationId, reason: "invalid_journal" };
		}
	}

	async writePrepared(input: PreparedRenameJournal): Promise<void> {
		const current = await this.readRequiredJournal(input.operationId);
		if (current.state !== "prepared") throw new Error("prepared manifest may only be written once");
		await this.writeManifest({
			...current,
			transit_path: input.transitPath,
			original_hashes: input.originalHashes ?? {},
			intended_hashes: input.intendedHashes ?? {},
			intended_paths: input.intendedPaths ?? {},
			stage_paths: input.stagePaths ?? {},
			backup_paths: input.backupPaths ?? {},
			rename_state: input.renameState ?? current.rename_state,
			layout_before: input.layoutBefore,
			layout_after: input.layoutAfter,
			metadata: input.metadata,
			updated_at: this.now().toISOString(),
		});
	}

	async transition(operationId: string, state: RenameJournalState, patch: JournalPatch): Promise<void> {
		const current = await this.readRequiredJournal(operationId);
		if (!validTransition(current.state, state)) throw new Error(`invalid rename state transition ${current.state} -> ${state}`);
		const next: GraphRenameJournal = {
			...current,
			state,
			updated_at: this.now().toISOString(),
			...(patch.graphRebuild ? { graph_rebuild: patch.graphRebuild } : {}),
			...(patch.transitPath ? { transit_path: patch.transitPath } : {}),
			...(patch.completedSteps ? { completed_steps: [...patch.completedSteps] } : {}),
			...(patch.originalHashes ? { original_hashes: { ...patch.originalHashes } } : {}),
			...(patch.intendedHashes ? { intended_hashes: { ...patch.intendedHashes } } : {}),
			...(patch.stagePaths ? { stage_paths: { ...patch.stagePaths } } : {}),
			...(patch.backupPaths ? { backup_paths: { ...patch.backupPaths } } : {}),
			...(patch.intendedPaths ? { intended_paths: { ...patch.intendedPaths } } : {}),
			...(patch.renameState ? { rename_state: patch.renameState } : {}),
			...(patch.layoutBefore !== undefined ? { layout_before: patch.layoutBefore } : {}),
			...(patch.layoutAfter !== undefined ? { layout_after: patch.layoutAfter } : {}),
			...(patch.conflicts ? { conflicts: patch.conflicts } : {}),
			...(patch.retainedEvidence ? { retained_evidence: patch.retainedEvidence } : {}),
			...(patch.metadata ? { metadata: { ...patch.metadata } } : {}),
		};
		await this.writeManifest(next);
	}

	/** Remove an operation that failed before any final file commit. */
	async abortPrepared(operationId: string): Promise<void> {
		const current = await this.readRequiredJournal(operationId);
		if (current.state !== "prepared") return;
		await this.removeWorkingCopies(current);
		await this.release(operationId);
		await this.removeManifestAndEmptyOperationDirectory(operationId);
		const remaining = await readdir(this.operationsRoot).catch(() => [] as string[]);
		if (remaining.length === 0) await rmdir(this.operationsRoot).catch(() => undefined);
	}

	async listForStartup(): Promise<Array<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal>> {
		await this.assertSafeJournalRoot(false);
		const entries = await readdir(this.operationsRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		const result: Array<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal> = [];
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === "active.lock") continue;
			const record = await this.read(entry.name);
			if (record) result.push(record);
		}
		return result;
	}

	async preserveConflictVariant(input: PreserveConflictInput): Promise<string> {
		if (!safeOperationId(input.operationId) || !safeRelative(input.sourcePath)) throw conflictError("conflict evidence path is invalid");
		await this.assertSafeOperationDirectory(input.operationId, true);
		const directory = path.join(this.operationsRoot, input.operationId, "evidence");
		await this.assertSafeOwnedPath(path.posix.join(".wiki-tmp", "rename-ops", input.operationId, "evidence"), true);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const digest = createHash("sha256").update(input.bytes).digest("hex");
		const filename = `${input.kind}-${digest}.bin`;
		const absolute = path.join(directory, filename);
		await writeAtomic(absolute, input.bytes, 0o600);
		return path.posix.join(".wiki-tmp", "rename-ops", input.operationId, "evidence", filename);
	}

	async writeOwnedFile(relativePath: string, bytes: Buffer, mode = 0o600): Promise<string> {
		if (!safeRelative(relativePath) || !isWritableOperationDataPath(relativePath)) throw conflictError("owned path is invalid");
		const operationId = relativePath.split("/")[2];
		if (!operationId || !safeOperationId(operationId)) throw conflictError("owned path is invalid");
		await this.assertSafeOperationDirectory(operationId, true);
		await this.assertSafeOwnedPath(relativePath, true);
		const absolute = path.join(this.kbPath, ...relativePath.split("/"));
		await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
		await writeAtomic(absolute, bytes, mode);
		const readBack = await readFile(absolute);
		if (!readBack.equals(bytes)) throw new Error("owned bytes failed read-back verification");
		await this.recordOwnedPathIfKnown(operationId, relativePath, readBack);
		return relativePath;
	}

	async writeBlocked(operationId: string, reason: BlockedRenameJournal["reason"]): Promise<void> {
		if (!safeOperationId(operationId)) throw conflictError("operation ID is invalid");
		await this.assertSafeOperationDirectory(operationId, true);
		await mkdir(path.join(this.operationsRoot, operationId), { recursive: true, mode: 0o700 });
		await writeAtomic(path.join(this.operationsRoot, operationId, "manifest.json"), Buffer.from(`${JSON.stringify({ kind: "blocked", operation_id: operationId, reason })}\n`), 0o600);
	}

	async compactTerminal(input: { operationId: string; resolvedConflictEvidence?: PreservedEvidence[]; now: Date }): Promise<GraphRenameReceipt> {
		const current = await this.readRequiredJournal(input.operationId);
		if (!isTerminalState(current.state)) throw new Error("cannot compact non-terminal journal");
		await this.removeWorkingCopies(current);
		const receipt: GraphRenameReceipt = {
			kind: "receipt",
			operation_id: current.operation_id,
			immutable_digest: current.immutable_digest,
			...(current.resolution_digest ? { resolution_digest: current.resolution_digest } : {}),
			state: current.state,
			source_path: current.source_path,
			target_path: current.target_path,
			graph_rebuild: current.graph_rebuild,
			created_at: current.created_at,
			updated_at: input.now.toISOString(),
			retained_evidence: input.resolvedConflictEvidence ?? current.retained_evidence,
			final_hashes: { ...(current.state === "rolled_back" ? current.original_hashes : current.intended_hashes) },
			rename_state: current.rename_state,
		};
		await this.writeManifest(receipt);
		if (receipt.retained_evidence.length === 0) await this.removeKnownEmptyDataDirectories(current.operation_id);
		return receipt;
	}

	async removeOwnedWorkingCopies(operationId: string): Promise<void> {
		const current = await this.readRequiredJournal(operationId);
		await this.removeWorkingCopies(current);
	}

	async pruneExpiredOperationData(input: { now: Date; receiptRetentionMs: number; evidenceRetentionMs: number }): Promise<string[]> {
		const removed: string[] = [];
		for (const record of await this.listForStartup()) {
			if (record.kind !== "receipt") continue;
			const terminalAt = new Date(record.updated_at).getTime();
			const evidence = record.retained_evidence.filter((item) => {
				const expiresAt = new Date(item.expires_at).getTime();
				return Number.isFinite(expiresAt) && input.now.getTime() < expiresAt && input.now.getTime() < terminalAt + input.evidenceRetentionMs;
			});
		for (const item of record.retained_evidence.filter((item) => !evidence.includes(item))) {
			await this.removeOwnedFile(item.relative_path, item.sha256);
		}
		if (evidence.length !== record.retained_evidence.length) await this.writeManifest({ ...record, retained_evidence: evidence });
		if (evidence.length === 0 && input.now.getTime() >= terminalAt + input.receiptRetentionMs) {
			await this.assertSafeOperationDirectory(record.operation_id, false);
			await this.removeManifestAndEmptyOperationDirectory(record.operation_id);
				removed.push(record.operation_id);
			}
		}
		return removed;
	}

	async release(operationId: string): Promise<void> {
		const lockPath = path.join(this.operationsRoot, "active.lock");
		const expected = this.heldLockTexts.get(operationId);
		if (!expected) return;
		try {
			const lock = parseLock(expected);
			if (lock.operation_id !== operationId || lock.server_instance_id !== this.serverInstanceId || lock.owner_pid !== process.pid) return;
			await removeExactFile(lockPath, expected);
		} catch {
			// A malformed lock is never guessed or removed.
		} finally {
			this.heldLockTexts.delete(operationId);
		}
	}

	private async acquireLock(input: AcquireRenameOperation): Promise<void> {
		const lockPath = path.join(this.operationsRoot, "active.lock");
		for (;;) {
			try {
				const lockText = JSON.stringify({ operation_id: input.operationId, immutable_digest: input.immutableDigest, ...(input.resolutionDigest ? { resolution_digest: input.resolutionDigest } : {}), owner_pid: process.pid, server_instance_id: this.serverInstanceId, created_at: this.now().toISOString() });
				const handle = await open(lockPath, "wx", 0o600);
				try {
					await handle.writeFile(lockText);
					await handle.sync();
				} finally { await handle.close(); }
				this.heldLockTexts.set(input.operationId, lockText);
				return;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				const lockText = await readFile(lockPath, "utf8").catch(() => null);
				let lock: ReturnType<typeof parseLock>;
				try { lock = lockText ? parseLock(lockText) : (() => { throw new Error("missing lock"); })(); }
				catch { throw busyError("rename lock is malformed"); }
				const heldLockText = this.heldLockTexts.get(input.operationId);
				if (heldLockText === lockText && lock.operation_id === input.operationId && lock.server_instance_id === this.serverInstanceId && lock.owner_pid === process.pid && lock.immutable_digest === input.immutableDigest && (lock.resolution_digest ?? undefined) === (input.resolutionDigest ?? undefined)) {
					const existing = await this.read(input.operationId);
					if (existing && existing.kind !== "blocked") {
						this.heldLockTexts.set(input.operationId, lockText!);
						return;
					}
				}
				const alive = await this.isProcessAlive(lock.owner_pid);
				if (alive !== false) throw busyError("another rename is in progress");
				if (!lockText || !(await removeExactFile(lockPath, lockText))) throw busyError("another rename is in progress");
			}
		}
	}

	private async writeManifest(value: GraphRenameJournal | GraphRenameReceipt): Promise<void> {
		const valid = value.kind === "journal" ? safeJournalPaths(value, value.operation_id) : safeReceiptPaths(value, value.operation_id);
		if (!valid) throw conflictError("rename manifest is invalid");
		await this.assertSafeOperationDirectory(value.operation_id, true);
		await this.assertSafeOwnedPath(path.posix.join(".wiki-tmp", "rename-ops", value.operation_id, "manifest.json"), true);
		await mkdir(path.join(this.operationsRoot, value.operation_id), { recursive: true, mode: 0o700 });
		await writeAtomic(path.join(this.operationsRoot, value.operation_id, "manifest.json"), Buffer.from(`${JSON.stringify(value)}\n`), 0o600);
	}

	private async readRequiredJournal(operationId: string): Promise<GraphRenameJournal> {
		const value = await this.read(operationId);
		if (!value || value.kind !== "journal") throw new Error("rename journal does not exist");
		return value;
	}

	private async assertSafeJournalRoot(create: boolean): Promise<void> {
		const root = await realpath(this.kbPath);
		let current = root;
		for (const segment of [".wiki-tmp", "rename-ops"]) {
			const next = path.join(current, segment);
			const info = await lstat(next).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return null;
				throw error;
			});
			if (!info) {
				if (!create) return;
				await mkdir(next, { mode: 0o700 });
			} else if (info.isSymbolicLink() || !info.isDirectory()) {
				throw conflictError("rename journal directory is unsafe");
			}
			current = next;
		}
	}

	private async assertSafeOperationDirectory(operationId: string, create: boolean): Promise<void> {
		await this.assertSafeJournalRoot(create);
		const directory = path.join(this.operationsRoot, operationId);
		const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (!info) {
			if (create) await mkdir(directory, { mode: 0o700 });
			return;
		}
		if (info.isSymbolicLink() || !info.isDirectory()) throw conflictError("rename operation directory is unsafe");
	}

	private async assertSafeOwnedPath(relativePath: string, allowMissingLeaf: boolean): Promise<void> {
		if (!safeRelative(relativePath)) throw conflictError("owned path is invalid");
		let current = await realpath(this.kbPath);
		const parts = relativePath.split("/");
		for (let index = 0; index < parts.length; index += 1) {
			current = path.join(current, parts[index]!);
			const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
				if (allowMissingLeaf && error.code === "ENOENT") return null;
				throw error;
			});
			if (!info) continue;
			if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())) throw conflictError("owned path is unsafe");
			if (index === parts.length - 1 && !info.isFile() && !info.isDirectory()) throw conflictError("owned path is unsafe");
		}
	}

	private async assertSafeOwnedFilePath(relativePath: string): Promise<void> {
		await this.assertSafeOwnedPath(relativePath, true);
		const absolute = path.join(this.kbPath, ...relativePath.split("/"));
		const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (info && (info.isSymbolicLink() || !info.isFile())) throw conflictError("owned path is unsafe");
	}

	private async assertSafeRecordDataPaths(record: GraphRenameJournal | GraphRenameReceipt): Promise<void> {
		const paths = record.kind === "journal"
			? [...Object.values(record.stage_paths), ...Object.values(record.backup_paths), ...Object.values(record.intended_paths), ...record.conflicts.flatMap((conflict) => conflict.preserved_variants.map((variant) => variant.relative_path)), ...record.retained_evidence.map((item) => item.relative_path)]
			: record.retained_evidence.map((item) => item.relative_path);
		for (const relative of paths) await this.assertSafeOwnedFilePath(relative);
	}

	private async removeWorkingCopies(record: GraphRenameJournal): Promise<void> {
		for (const [key, relative] of Object.entries(record.stage_paths)) await this.removeOwnedFile(relative, record.intended_hashes[key]);
		for (const [key, relative] of Object.entries(record.backup_paths)) await this.removeOwnedFile(relative, record.original_hashes[key]);
		for (const [key, relative] of Object.entries(record.intended_paths)) await this.removeOwnedFile(relative, record.intended_hashes[key]);
	}

	private async recordOwnedPathIfKnown(operationId: string, relativePath: string, bytes: Buffer): Promise<void> {
		const current = await this.readRequiredJournal(operationId);
		if (current.state !== "prepared") return;
		const parsed = parseOperationDataPath(relativePath, operationId);
		if (!parsed) return;
		const expected = parsed.directory === "backups" ? current.original_hashes[parsed.key] : current.intended_hashes[parsed.key];
		if (!expected || createHash("sha256").update(bytes).digest("hex") !== expected) return;
		await this.writeManifest({
			...current,
			...(parsed.directory === "backups"
				? { backup_paths: { ...current.backup_paths, [parsed.key]: relativePath } }
				: { intended_paths: { ...current.intended_paths, [parsed.key]: relativePath } }),
			updated_at: this.now().toISOString(),
		});
	}

	private async removeOwnedFile(relativePath: string, expectedSha256: string | null | undefined): Promise<void> {
		if (!expectedSha256 || !safeSha(expectedSha256)) throw conflictError("owned file digest is invalid");
		await this.assertSafeOwnedFilePath(relativePath);
		const absolute = path.join(this.kbPath, ...relativePath.split("/"));
		const content = await readFile(absolute).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (content === null) return;
		if (createHash("sha256").update(content).digest("hex") !== expectedSha256) throw conflictError("owned file changed before cleanup");
		if (!(await removeExactFile(absolute, content))) throw conflictError("owned file changed during cleanup");
	}

	private async removeKnownEmptyDataDirectories(operationId: string): Promise<void> {
		for (const name of ["backups", "intended", "evidence"]) await rmdir(path.join(this.operationsRoot, operationId, name)).catch(() => undefined);
	}

	private async removeManifestAndEmptyOperationDirectory(operationId: string): Promise<void> {
		const manifestPath = path.join(this.operationsRoot, operationId, "manifest.json");
		const manifest = await readFile(manifestPath).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (manifest !== null && !(await removeExactFile(manifestPath, manifest))) throw conflictError("manifest changed during cleanup");
		await this.removeKnownEmptyDataDirectories(operationId);
		await rmdir(path.join(this.operationsRoot, operationId)).catch(() => undefined);
	}
}

async function writeAtomic(target: string, bytes: Buffer, mode: number): Promise<void> {
	const temporary = `${target}.${randomUUID()}.tmp`;
	let created = false;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(temporary, "wx", mode);
		created = true;
		await handle.writeFile(bytes);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await import("node:fs/promises").then(({ rename }) => rename(temporary, target));
	} catch (error) {
		await handle?.close().catch(() => undefined);
		if (created) await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

async function removeExactFile(target: string, expected: string | Buffer): Promise<boolean> {
	const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	if (!info) return true;
	if (info.isSymbolicLink() || !info.isFile()) return false;
	const before = await readFile(target, typeof expected === "string" ? "utf8" : undefined);
	if (!sameContent(before, expected)) return false;
	const guard = `${target}.${randomUUID()}.remove`;
	try {
		await rename(target, guard);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
	const guardedInfo = await lstat(guard).catch(() => null);
	const guarded = guardedInfo?.isFile() && !guardedInfo.isSymbolicLink()
		? await readFile(guard, typeof expected === "string" ? "utf8" : undefined)
		: null;
	if (guarded !== null && sameContent(guarded, expected)) {
		await unlink(guard);
		return true;
	}
	try {
		await link(guard, target);
		await unlink(guard);
	} catch {
		// Keep the guarded bytes when a concurrent writer already recreated the path.
	}
	return false;
}

function sameContent(actual: string | Buffer, expected: string | Buffer): boolean {
	return typeof actual === "string" && typeof expected === "string"
		? actual === expected
		: Buffer.isBuffer(actual) && Buffer.isBuffer(expected) && actual.equals(expected);
}

function isJournalState(value: unknown): value is RenameJournalState {
	return value === "prepared" || value === "applying" || value === "committed" || value === "rolled_back" || value === "conflicted";
}
function safeRelative(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !/[\u0000-\u001f\u007f-\u009f]/.test(value) && !value.split("/").some((part) => !part || part === "." || part === "..");
}
function safeOperationId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function safeSha(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function parseLock(value: string): {
	operation_id: string;
	immutable_digest: string;
	resolution_digest?: string;
	owner_pid: number;
	server_instance_id: string;
	created_at: string;
} {
	const parsed = JSON.parse(value) as Record<string, unknown>;
	const ownerPid = parsed.owner_pid;
	if (!hasOnlyKeys(parsed, ["operation_id", "immutable_digest", "resolution_digest", "owner_pid", "server_instance_id", "created_at"]) || !safeOperationId(parsed.operation_id) || !safeSha(parsed.immutable_digest) || (parsed.resolution_digest !== undefined && !safeSha(parsed.resolution_digest)) || typeof ownerPid !== "number" || !Number.isInteger(ownerPid) || ownerPid <= 0 || typeof parsed.server_instance_id !== "string" || parsed.server_instance_id.length === 0 || typeof parsed.created_at !== "string" || !Number.isFinite(new Date(parsed.created_at).getTime())) throw new Error("invalid rename lock");
	return { operation_id: parsed.operation_id, immutable_digest: parsed.immutable_digest, ...(parsed.resolution_digest ? { resolution_digest: parsed.resolution_digest } : {}), owner_pid: ownerPid, server_instance_id: parsed.server_instance_id, created_at: parsed.created_at };
}
function safeJournalPaths(value: Partial<GraphRenameJournal>, operationId: string): boolean {
	if (!hasOnlyKeys(value, ["kind", "operation_id", "immutable_digest", "resolution_digest", "state", "source_path", "target_path", "graph_rebuild", "created_at", "updated_at", "rename_state", "transit_path", "completed_steps", "original_hashes", "intended_hashes", "intended_paths", "stage_paths", "backup_paths", "layout_before", "layout_after", "conflicts", "retained_evidence", "metadata"])) return false;
	if (typeof value.source_path !== "string" || typeof value.target_path !== "string" || typeof value.created_at !== "string" || typeof value.updated_at !== "string") return false;
	if (!safeRelative(value.source_path) || !safeRelative(value.target_path)) return false;
	if (!isRenameFileState(value.rename_state)) return false;
	if (!isGraphRebuildState(value.graph_rebuild) || !Array.isArray(value.completed_steps) || !value.completed_steps.every((step) => safeRelative(step)) || !Number.isFinite(new Date(value.created_at ?? "").getTime()) || !Number.isFinite(new Date(value.updated_at ?? "").getTime())) return false;
	if (!isRecord(value.original_hashes) || !isRecord(value.intended_hashes) || !isRecord(value.intended_paths) || !isRecord(value.stage_paths) || !isRecord(value.backup_paths) || !Array.isArray(value.conflicts) || !Array.isArray(value.retained_evidence)) return false;
	if (value.operation_id !== operationId || !safeOperationId(value.operation_id) || !safeSha(value.immutable_digest) || (value.resolution_digest !== undefined && !safeSha(value.resolution_digest))) return false;
	if (path.posix.dirname(value.source_path) !== path.posix.dirname(value.target_path)) return false;
	if (value.transit_path !== undefined && !isTransitPath(value.transit_path, value.source_path, operationId)) return false;
	if (value.layout_before !== undefined && typeof value.layout_before !== "string") return false;
	if (value.layout_after !== undefined && typeof value.layout_after !== "string") return false;
	if (value.metadata !== undefined && (!isRecord(value.metadata) || !hasOnlyKeys(value.metadata, ["expires_at"]) || typeof value.metadata.expires_at !== "string" || !Number.isFinite(new Date(value.metadata.expires_at).getTime()))) return false;
	for (const item of [value.transit_path, ...Object.keys(value.original_hashes ?? {}), ...Object.keys(value.intended_hashes ?? {}), ...Object.keys(value.intended_paths ?? {}), ...Object.keys(value.stage_paths ?? {}), ...Object.keys(value.backup_paths ?? {})]) if (item !== undefined && !safeRelative(item)) return false;
	if (!Object.entries(value.original_hashes ?? {}).every(([key, digest]) => safeRelative(key) && (digest === null || safeSha(digest)))) return false;
	if (!Object.entries(value.intended_hashes ?? {}).every(([key, digest]) => safeRelative(key) && (digest === null || safeSha(digest)))) return false;
	if (!Object.entries(value.intended_paths ?? {}).every(([key, relative]) => safeRelative(key) && isOperationDataPath(relative, operationId, "intended") && safeSha(value.intended_hashes?.[key]))) return false;
	if (!Object.entries(value.stage_paths ?? {}).every(([key, relative]) => safeRelative(key) && isStagePath(relative, key, operationId) && safeSha(value.intended_hashes?.[key]))) return false;
	if (!Object.entries(value.backup_paths ?? {}).every(([key, relative]) => safeRelative(key) && isOperationDataPath(relative, operationId, "backups") && safeSha(value.original_hashes?.[key]))) return false;
	if (!(value.conflicts ?? []).every((conflict) => safeConflict(conflict, operationId))) return false;
	const originalKeys = Object.keys(value.original_hashes ?? {}).sort();
	const intendedKeys = Object.keys(value.intended_hashes ?? {}).sort();
	if (value.state !== "prepared" && JSON.stringify(originalKeys) !== JSON.stringify(intendedKeys)) return false;
	const originalKeySet = new Set(originalKeys);
	const intendedKeySet = new Set(intendedKeys);
	if (!Object.keys(value.backup_paths ?? {}).every((key) => originalKeySet.has(key))) return false;
	if (!Object.keys(value.intended_paths ?? {}).every((key) => intendedKeySet.has(key))) return false;
	if (!Object.keys(value.stage_paths ?? {}).every((key) => intendedKeySet.has(key))) return false;
	return (value.retained_evidence ?? []).every((item) => safeEvidence(item, operationId));
}
function safeReceiptPaths(value: Partial<GraphRenameReceipt>, operationId: string): boolean {
	return hasOnlyKeys(value, ["kind", "operation_id", "immutable_digest", "resolution_digest", "state", "source_path", "target_path", "graph_rebuild", "created_at", "updated_at", "retained_evidence", "final_hashes", "rename_state"]) && value.operation_id === operationId && safeRelative(value.source_path) && safeRelative(value.target_path) && path.posix.dirname(value.source_path) === path.posix.dirname(value.target_path) && safeOperationId(value.operation_id) && safeSha(value.immutable_digest) && (value.resolution_digest === undefined || safeSha(value.resolution_digest)) && isRenameFileState(value.rename_state) && isGraphRebuildState(value.graph_rebuild) && typeof value.created_at === "string" && typeof value.updated_at === "string" && Number.isFinite(new Date(value.created_at).getTime()) && Number.isFinite(new Date(value.updated_at).getTime()) && isRecord(value.final_hashes) && Object.entries(value.final_hashes ?? {}).every(([key, digest]) => safeRelative(key) && (digest === null || safeSha(digest))) && Array.isArray(value.retained_evidence) && (value.retained_evidence ?? []).every((item) => safeEvidence(item, operationId));
}
function safeConflict(value: GraphRenameJournal["conflicts"][number], operationId: string): boolean {
	if (!isRecord(value) || !safeRelative(value.source_path) || (value.current_state !== "present" && value.current_state !== "missing") || !Array.isArray(value.preserved_variants)) return false;
	if (value.current_state === "present" && (!hasOnlyKeys(value, ["source_path", "current_state", "current_sha256", "preserved_variants"]) || !safeSha(value.current_sha256))) return false;
	if (value.current_state === "missing" && !hasOnlyKeys(value, ["source_path", "current_state", "preserved_variants"])) return false;
	return value.preserved_variants.every((variant) => isRecord(variant) && hasOnlyKeys(variant, ["kind", "relative_path", "sha256"]) && (variant.kind === "current" || variant.kind === "original" || variant.kind === "intended") && safeSha(variant.sha256) && isEvidencePath(variant.relative_path, operationId, variant.kind, variant.sha256));
}
function safeEvidence(value: unknown, operationId: string): value is PreservedEvidence {
	return isRecord(value) && hasOnlyKeys(value, ["relative_path", "sha256", "expires_at"]) && safeSha(value.sha256) && isEvidencePath(value.relative_path, operationId, undefined, value.sha256) && typeof value.expires_at === "string" && Number.isFinite(new Date(value.expires_at).getTime());
}

function isWritableOperationDataPath(relativePath: string): boolean {
	const parts = relativePath.split("/");
	return parts.length === 5 && parts[0] === ".wiki-tmp" && parts[1] === "rename-ops" && safeOperationId(parts[2]) && ((parts[3] === "backups" && parts[4]!.endsWith(".bak")) || (parts[3] === "intended" && parts[4]!.endsWith(".bin")));
}

function isOperationDataPath(relativePath: unknown, operationId: string, directory: "backups" | "intended"): relativePath is string {
	if (!safeRelative(relativePath)) return false;
	const prefix = `.wiki-tmp/rename-ops/${operationId}/${directory}/`;
	if (!relativePath.startsWith(prefix)) return false;
	const leaf = relativePath.slice(prefix.length);
	return leaf.length > 0 && !leaf.includes("/") && (directory === "backups" ? leaf.endsWith(".bak") : leaf.endsWith(".bin"));
}

function parseOperationDataPath(relativePath: string, operationId: string): { directory: "backups" | "intended"; key: string } | null {
	for (const directory of ["backups", "intended"] as const) {
		if (!isOperationDataPath(relativePath, operationId, directory)) continue;
		const leaf = path.posix.basename(relativePath);
		if (leaf === (directory === "backups" ? "layout.bak" : "layout.bin")) return { directory, key: ".wiki-graph-layout.json" };
		const suffix = directory === "backups" ? ".bak" : ".bin";
		try { return { directory, key: decodeURIComponent(leaf.slice(0, -suffix.length)) }; }
		catch { return null; }
	}
	return null;
}

function isEvidencePath(relativePath: unknown, operationId: string, kind: "current" | "original" | "intended" | undefined, sha256: string): relativePath is string {
	if (!safeRelative(relativePath)) return false;
	const allowedKinds = kind ? [kind] : ["current", "original", "intended"];
	return allowedKinds.some((candidate) => relativePath === `.wiki-tmp/rename-ops/${operationId}/evidence/${candidate}-${sha256}.bin`);
}

function isStagePath(relativePath: unknown, key: string, operationId: string): relativePath is string {
	if (!safeRelative(relativePath)) return false;
	const directory = path.posix.dirname(key);
	if (path.posix.dirname(relativePath) !== directory) return false;
	const prefix = `.${path.posix.basename(key)}.${operationId}.`;
	const leaf = path.posix.basename(relativePath);
	return leaf.startsWith(prefix) && /^\d+\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.stage$/i.test(leaf.slice(prefix.length));
}

function isTransitPath(relativePath: string, sourcePath: string, operationId: string): boolean {
	return path.posix.dirname(relativePath) === path.posix.dirname(sourcePath) && new RegExp(`^\\.llm-wiki-rename-${escapeRegExp(operationId)}-\\d+\\.md$`).test(path.posix.basename(relativePath));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isGraphRebuildState(value: unknown): value is GraphRebuildState {
	return value === "not_started" || value === "started" || value === "queued" || value === "failed" || value === "succeeded";
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasOnlyKeys(value: unknown, allowed: string[]): boolean {
	return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function isTerminalState(value: unknown): value is "committed" | "rolled_back" | "conflicted" {
	return value === "committed" || value === "rolled_back" || value === "conflicted";
}
function validTransition(from: RenameJournalState, to: RenameJournalState): boolean {
	return from === to || (from === "prepared" && (to === "applying" || to === "rolled_back")) || (from === "applying" && (to === "committed" || to === "rolled_back" || to === "conflicted")) || (from === "conflicted" && (to === "committed" || to === "rolled_back"));
}
function receiptAsJournal(receipt: GraphRenameReceipt): GraphRenameJournal {
	return {
		kind: "journal", operation_id: receipt.operation_id, immutable_digest: receipt.immutable_digest, state: receipt.state,
		...(receipt.resolution_digest ? { resolution_digest: receipt.resolution_digest } : {}),
		source_path: receipt.source_path, target_path: receipt.target_path, graph_rebuild: receipt.graph_rebuild,
		created_at: receipt.created_at, updated_at: receipt.updated_at, rename_state: receipt.rename_state, completed_steps: [], original_hashes: {},
		intended_hashes: receipt.final_hashes, stage_paths: {}, backup_paths: {}, intended_paths: {}, conflicts: [], retained_evidence: receipt.retained_evidence,
	};
}

function isRenameFileState(value: unknown): value is RenameFileState {
	return value === "old" || value === "transit" || value === "target";
}

function busyError(message: string): Error & { code: "BUSY" } { return Object.assign(new Error(message), { code: "BUSY" as const }); }
function conflictError(message: string): Error & { code: "CONFLICT" } { return Object.assign(new Error(message), { code: "CONFLICT" as const }); }
