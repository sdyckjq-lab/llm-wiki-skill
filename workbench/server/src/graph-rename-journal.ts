import { randomUUID, createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";

export type RenameJournalState = "prepared" | "applying" | "committed" | "rolled_back" | "conflicted";
export type GraphRebuildState = "not_started" | "started" | "queued" | "failed" | "succeeded";

export interface PreservedEvidence {
	relative_path: string;
	sha256: string;
	expires_at: string;
}

export interface GraphRenameJournal {
	kind: "journal";
	operation_id: string;
	immutable_digest: string;
	state: RenameJournalState;
	source_path: string;
	target_path: string;
	graph_rebuild: GraphRebuildState;
	created_at: string;
	updated_at: string;
	transit_path?: string;
	completed_steps: string[];
	original_hashes: Record<string, string | null>;
	intended_hashes: Record<string, string | null>;
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
	state: "committed" | "rolled_back" | "conflicted";
	source_path: string;
	target_path: string;
	graph_rebuild: GraphRebuildState;
	created_at: string;
	updated_at: string;
	retained_evidence: PreservedEvidence[];
	final_hashes: Record<string, string | null>;
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

export class GraphRenameJournalStore {
	readonly operationsRoot: string;
	private readonly now: () => Date;
	private readonly serverInstanceId: string;
	private readonly isProcessAlive: (pid: number) => boolean | "unknown" | Promise<boolean | "unknown">;

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
		await mkdir(this.operationsRoot, { recursive: true, mode: 0o700 });
		const existing = await this.read(input.operationId);
		if (existing) {
			if (existing.kind === "blocked") throw busyError("recovery is blocked");
			if (existing.immutable_digest !== input.immutableDigest || existing.source_path !== input.sourcePath || existing.target_path !== input.targetPath) throw conflictError("operation ID was reused with different inputs");
			return existing.kind === "journal" ? existing : receiptAsJournal(existing);
		}
		for (const record of await this.listForStartup()) {
			if (record.kind === "blocked") throw busyError("rename recovery is blocked");
			if (record.kind === "journal" && (record.state === "prepared" || record.state === "applying" || (record.state === "committed" && record.graph_rebuild !== "succeeded"))) {
				throw busyError("another rename requires recovery or graph publication");
			}
		}
		await this.acquireLock(input);
		const created = (input.createdAt ?? this.now()).toISOString();
		const journal: GraphRenameJournal = {
			kind: "journal",
			operation_id: input.operationId,
			immutable_digest: input.immutableDigest,
			state: "prepared",
			source_path: input.sourcePath,
			target_path: input.targetPath,
			graph_rebuild: "not_started",
			created_at: created,
			updated_at: created,
			completed_steps: [],
			original_hashes: {},
			intended_hashes: {},
			stage_paths: {},
			backup_paths: {},
			conflicts: [],
			retained_evidence: [],
		};
		await this.writeManifest(journal);
		return journal;
	}

	async read(operationId: string): Promise<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal | null> {
		const directory = path.join(this.operationsRoot, operationId);
		const content = await readFile(path.join(directory, "manifest.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (content === null) return null;
		try {
			const value = JSON.parse(content) as Partial<GraphRenameJournal> & Partial<GraphRenameReceipt>;
			if (value.kind === "journal" && isJournalState(value.state) && typeof value.operation_id === "string" && typeof value.immutable_digest === "string" && safeJournalPaths(value)) return value as GraphRenameJournal;
			if (value.kind === "receipt" && isTerminalState(value.state) && typeof value.operation_id === "string" && typeof value.immutable_digest === "string" && safeReceiptPaths(value)) return value as GraphRenameReceipt;
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
			stage_paths: input.stagePaths ?? {},
			backup_paths: input.backupPaths ?? {},
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
			...(patch.layoutBefore !== undefined ? { layout_before: patch.layoutBefore } : {}),
			...(patch.layoutAfter !== undefined ? { layout_after: patch.layoutAfter } : {}),
			...(patch.conflicts ? { conflicts: patch.conflicts } : {}),
			...(patch.retainedEvidence ? { retained_evidence: patch.retainedEvidence } : {}),
			...(patch.metadata ? { metadata: { ...patch.metadata } } : {}),
		};
		await this.writeManifest(next);
	}

	async listForStartup(): Promise<Array<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal>> {
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
		const directory = path.join(this.operationsRoot, input.operationId, "evidence");
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const digest = createHash("sha256").update(input.bytes).digest("hex");
		const filename = `${input.kind}-${digest}.bin`;
		const absolute = path.join(directory, filename);
		await writeAtomic(absolute, input.bytes, 0o600);
		return path.posix.join(".wiki-tmp", "rename-ops", input.operationId, "evidence", filename);
	}

	async compactTerminal(input: { operationId: string; resolvedConflictEvidence?: PreservedEvidence[]; now: Date }): Promise<GraphRenameReceipt> {
		const current = await this.readRequiredJournal(input.operationId);
		if (!isTerminalState(current.state)) throw new Error("cannot compact non-terminal journal");
		for (const stage of Object.values(current.stage_paths)) await unlink(path.join(this.kbPath, stage)).catch(() => undefined);
		for (const backup of Object.values(current.backup_paths)) await unlink(path.join(this.kbPath, backup)).catch(() => undefined);
		const receipt: GraphRenameReceipt = {
			kind: "receipt",
			operation_id: current.operation_id,
			immutable_digest: current.immutable_digest,
			state: current.state,
			source_path: current.source_path,
			target_path: current.target_path,
			graph_rebuild: current.graph_rebuild,
			created_at: current.created_at,
			updated_at: input.now.toISOString(),
			retained_evidence: input.resolvedConflictEvidence ?? current.retained_evidence,
			final_hashes: { ...(current.state === "rolled_back" ? current.original_hashes : current.intended_hashes) },
		};
		await this.writeManifest(receipt);
		if (receipt.retained_evidence.length === 0) await removeEmptyOwnedFiles(this.operationsRoot, current.operation_id, "manifest.json");
		return receipt;
	}

	async pruneExpiredOperationData(input: { now: Date; receiptRetentionMs: number; evidenceRetentionMs: number }): Promise<string[]> {
		const removed: string[] = [];
		for (const record of await this.listForStartup()) {
			if (record.kind !== "receipt") continue;
			const evidence = record.retained_evidence.filter((item) => new Date(item.expires_at).getTime() > input.now.getTime());
			for (const item of record.retained_evidence.filter((item) => !evidence.includes(item))) await unlink(path.join(this.kbPath, item.relative_path)).catch(() => undefined);
			if (evidence.length !== record.retained_evidence.length) await this.writeManifest({ ...record, retained_evidence: evidence, updated_at: input.now.toISOString() });
			const terminalAt = new Date(record.updated_at).getTime();
			if (evidence.length === 0 && input.now.getTime() >= terminalAt + input.receiptRetentionMs) {
				await rm(path.join(this.operationsRoot, record.operation_id), { recursive: true, force: true });
				removed.push(record.operation_id);
			}
		}
		return removed;
	}

	async release(operationId: string): Promise<void> {
		const lockPath = path.join(this.operationsRoot, "active.lock");
		const value = await readFile(lockPath, "utf8").catch(() => null);
		if (!value) return;
		try {
			const lock = JSON.parse(value) as { operation_id?: string };
			if (lock.operation_id === operationId) await unlink(lockPath);
		} catch {
			// A malformed lock is never guessed or removed.
		}
	}

	private async acquireLock(input: AcquireRenameOperation): Promise<void> {
		const lockPath = path.join(this.operationsRoot, "active.lock");
		for (;;) {
			try {
				const handle = await open(lockPath, "wx", 0o600);
				try {
					await handle.writeFile(JSON.stringify({ operation_id: input.operationId, immutable_digest: input.immutableDigest, owner_pid: process.pid, server_instance_id: this.serverInstanceId, created_at: this.now().toISOString() }));
					await handle.sync();
				} finally { await handle.close(); }
				return;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				const lock = await readFile(lockPath, "utf8").then((text) => JSON.parse(text) as { owner_pid?: number; operation_id?: string }).catch(() => null);
				if (!lock) throw busyError("rename lock is malformed");
				if (lock.operation_id === input.operationId) {
					const existing = await this.read(input.operationId);
					if (existing && existing.kind !== "blocked") return;
				}
				if (typeof lock.owner_pid !== "number") throw busyError("rename lock owner is unknown");
				const alive = await this.isProcessAlive(lock.owner_pid);
				if (alive !== false) throw busyError("another rename is in progress");
				await unlink(lockPath).catch(() => undefined);
			}
		}
	}

	private async writeManifest(value: GraphRenameJournal | GraphRenameReceipt): Promise<void> {
		await mkdir(path.join(this.operationsRoot, value.operation_id), { recursive: true, mode: 0o700 });
		await writeAtomic(path.join(this.operationsRoot, value.operation_id, "manifest.json"), Buffer.from(`${JSON.stringify(value)}\n`), 0o600);
	}

	private async readRequiredJournal(operationId: string): Promise<GraphRenameJournal> {
		const value = await this.read(operationId);
		if (!value || value.kind !== "journal") throw new Error("rename journal does not exist");
		return value;
	}
}

async function writeAtomic(target: string, bytes: Buffer, mode: number): Promise<void> {
	const temporary = `${target}.${randomUUID()}.tmp`;
	const handle = await open(temporary, "wx", mode);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally { await handle.close(); }
	await import("node:fs/promises").then(({ rename }) => rename(temporary, target)).catch(async (error) => {
		await unlink(temporary).catch(() => undefined);
		throw error;
	});
}

async function removeEmptyOwnedFiles(root: string, operationId: string, manifestName: string): Promise<void> {
	const directory = path.join(root, operationId);
	const entries = await readdir(directory).catch(() => []);
	for (const entry of entries) if (entry !== manifestName && entry !== "evidence") await rm(path.join(directory, entry), { recursive: true, force: true });
}

function isJournalState(value: unknown): value is RenameJournalState {
	return value === "prepared" || value === "applying" || value === "committed" || value === "rolled_back" || value === "conflicted";
}
function safeRelative(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..");
}
function safeJournalPaths(value: Partial<GraphRenameJournal>): boolean {
	if (!safeRelative(value.source_path) || !safeRelative(value.target_path)) return false;
	for (const item of [value.transit_path, ...Object.keys(value.original_hashes ?? {}), ...Object.keys(value.intended_hashes ?? {}), ...Object.keys(value.stage_paths ?? {}), ...Object.keys(value.backup_paths ?? {})]) if (item !== undefined && !safeRelative(item)) return false;
	return (value.retained_evidence ?? []).every((item) => safeRelative(item.relative_path) && Number.isFinite(new Date(item.expires_at).getTime()));
}
function safeReceiptPaths(value: Partial<GraphRenameReceipt>): boolean {
	return safeRelative(value.source_path) && safeRelative(value.target_path) && (value.retained_evidence ?? []).every((item) => safeRelative(item.relative_path) && Number.isFinite(new Date(item.expires_at).getTime()));
}
function isTerminalState(value: unknown): value is "committed" | "rolled_back" | "conflicted" {
	return value === "committed" || value === "rolled_back" || value === "conflicted";
}
function validTransition(from: RenameJournalState, to: RenameJournalState): boolean {
	return from === to || (from === "prepared" && (to === "applying" || to === "rolled_back")) || (from === "applying" && (to === "committed" || to === "rolled_back" || to === "conflicted"));
}
function receiptAsJournal(receipt: GraphRenameReceipt): GraphRenameJournal {
	return {
		kind: "journal", operation_id: receipt.operation_id, immutable_digest: receipt.immutable_digest, state: receipt.state,
		source_path: receipt.source_path, target_path: receipt.target_path, graph_rebuild: receipt.graph_rebuild,
		created_at: receipt.created_at, updated_at: receipt.updated_at, completed_steps: [], original_hashes: {},
		intended_hashes: receipt.final_hashes, stage_paths: {}, backup_paths: {}, conflicts: [], retained_evidence: receipt.retained_evidence,
	};
}

function busyError(message: string): Error & { code: "BUSY" } { return Object.assign(new Error(message), { code: "BUSY" as const }); }
function conflictError(message: string): Error & { code: "CONFLICT" } { return Object.assign(new Error(message), { code: "CONFLICT" as const }); }
