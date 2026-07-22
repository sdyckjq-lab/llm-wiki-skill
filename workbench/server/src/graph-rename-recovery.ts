import path from "node:path";

import {
	assertSafeRenamePath,
	lstatExactPath,
	sha256Bytes,
} from "./graph-rename-files.js";
import {
	RENAME_RETENTION_MS,
	type GraphRenameJournal,
	type GraphRenameJournalStore,
	type PreservedEvidence,
} from "./graph-rename-journal.js";
import {
	moveFileNoOverwrite,
	readRegularFile,
	removeFileNoOverwrite,
	replaceFileNoOverwrite,
} from "./graph-rename-safe-io.js";

export async function rollbackSourceRename(
	kbPath: string,
	record: GraphRenameJournal,
	beforeMove?: () => void | Promise<void>,
): Promise<{ ok: true } | { ok: false; conflicts: GraphRenameJournal["conflicts"] }> {
	const source = await assertSafeRenamePath(kbPath, path.join(kbPath, ...record.source_path.split("/")), true);
	const target = await assertSafeRenamePath(kbPath, path.join(kbPath, ...record.target_path.split("/")), true);
	const transit = record.transit_path ? await assertSafeRenamePath(kbPath, path.join(kbPath, ...record.transit_path.split("/")), true) : null;
	const statFile = async (candidate: string | null) => candidate ? lstatExactPath(candidate) : null;
	const [sourceInfo, targetInfo, transitInfo] = await Promise.all([statFile(source), statFile(target), statFile(transit)]);
	if ([sourceInfo, targetInfo, transitInfo].some((info) => info && (info.isSymbolicLink() || !info.isFile()))) return { ok: false, conflicts: await enumerateSourceRenameConflicts(kbPath, record) };
	if (sourceInfo && !targetInfo && !transitInfo) return { ok: true };
	const expectedSourceSha256 = record.intended_hashes[record.source_path] ?? record.original_hashes[record.source_path] ?? undefined;
	if (!sourceInfo && targetInfo && !transitInfo) {
		try {
			await moveFileNoOverwrite({ kbRoot: kbPath, sourcePath: target, targetPath: source, expectedSourceSha256: expectedSourceSha256 ?? undefined, beforeFinalOperation: beforeMove });
		} catch { return { ok: false, conflicts: await enumerateSourceRenameConflicts(kbPath, record) }; }
	} else if (!sourceInfo && !targetInfo && transitInfo && transit) {
		try {
			await moveFileNoOverwrite({ kbRoot: kbPath, sourcePath: transit, targetPath: source, expectedSourceSha256: expectedSourceSha256 ?? undefined, beforeFinalOperation: beforeMove });
		} catch { return { ok: false, conflicts: await enumerateSourceRenameConflicts(kbPath, record) }; }
	} else {
		return { ok: false, conflicts: await enumerateSourceRenameConflicts(kbPath, record) };
	}
	await verifySourceRollback(source, target, transit);
	return { ok: true };
}

export async function enumerateSourceRenameConflicts(kbPath: string, record: GraphRenameJournal): Promise<GraphRenameJournal["conflicts"]> {
	const paths = [record.source_path, record.transit_path, record.target_path].filter((value): value is string => Boolean(value));
	const conflicts: GraphRenameJournal["conflicts"] = [];
	for (const relative of paths) {
		try {
			const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...relative.split("/")), true);
			const bytes = await readRegularFile(kbPath, absolute, true);
			conflicts.push(bytes
				? { source_path: relative, current_state: "present", current_sha256: sha256Bytes(bytes), preserved_variants: [] }
				: { source_path: relative, current_state: "missing", preserved_variants: [] });
		} catch { throw Object.assign(new Error("source rename path has an unsafe current type"), { code: "UNSAFE_CURRENT_TYPE" as const }); }
	}
	return conflicts;
}

export function sourceRenameStateMatches(record: GraphRenameJournal, conflicts: GraphRenameJournal["conflicts"], expectedDigest = record.intended_hashes[record.source_path] ?? record.original_hashes[record.source_path]): boolean {
	if (!expectedDigest) return false;
	const byPath = new Map(conflicts.map((conflict) => [conflict.source_path, conflict]));
	const expectedPresent = record.rename_state === "old" ? record.source_path : record.rename_state === "transit" ? record.transit_path : record.target_path;
	for (const relative of [record.source_path, record.transit_path, record.target_path].filter((value): value is string => Boolean(value))) {
		const conflict = byPath.get(relative);
		if (!conflict) return false;
		if (relative === expectedPresent) {
			if (conflict.current_state !== "present" || conflict.current_sha256 !== expectedDigest) return false;
		} else if (conflict.current_state !== "missing") return false;
	}
	return true;
}

async function verifySourceRollback(source: string, target: string, transit: string | null): Promise<void> {
	const sourceInfo = await lstatExactPath(source);
	if (!sourceInfo || !sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error("source rollback is unsafe");
	if (await lstatExactPath(target)) throw new Error("rename target remains after rollback");
	if (transit && await lstatExactPath(transit)) throw new Error("rename transit remains after rollback");
}

export async function assertRecoveryCurrent(kbPath: string, relative: string, expected: GraphRenameJournal["conflicts"][number] | undefined): Promise<void> {
	const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...relative.split("/")), true);
	const current = await readRegularFile(kbPath, absolute, true);
	const actual = current ? sha256Bytes(current) : null;
	const expectedHash = expected?.current_state === "present" ? expected.current_sha256 : null;
	if (actual !== expectedHash) throw new Error("recovery target changed");
}

export async function assertRecoveryBytes(kbPath: string, relative: string, expected: Buffer | null): Promise<void> {
	const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...relative.split("/")), true);
	const actual = await readRegularFile(kbPath, absolute, true);
	if (expected === null ? actual !== null : !actual?.equals(expected)) throw new Error("recovery write was changed externally");
}

export async function readOwnedVariant(kbPath: string, record: GraphRenameJournal, relative: string, kind: "original" | "intended"): Promise<Buffer | null> {
	const backup = record.backup_paths[relative];
	if (kind === "original" && backup) return readOwnedFile(kbPath, backup);
	if (kind === "intended") {
		const intended = record.intended_paths[relative];
		if (intended) return readOwnedFile(kbPath, intended);
		const stage = record.stage_paths[relative];
		if (stage) return readOwnedFile(kbPath, stage);
	}
	return null;
}

async function readOwnedFile(kbPath: string, relative: string): Promise<Buffer | null> {
	const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...relative.split("/")), true);
	try { return await readRegularFile(kbPath, absolute, true); }
	catch { throw invalidJournalError("owned recovery file is unsafe"); }
}

export async function recomputeRecoveryConflicts(kbPath: string, record: GraphRenameJournal): Promise<{ conflicts: GraphRenameJournal["conflicts"]; blocked: boolean }> {
	const paths = new Set([
		...Object.keys(record.original_hashes),
		...Object.keys(record.intended_hashes),
		record.source_path,
		...(record.transit_path ? [record.transit_path] : []),
		record.target_path,
	]);
	const conflicts: GraphRenameJournal["conflicts"] = [];
	for (const relative of paths) {
		try {
			const absolute = await assertSafeRenamePath(kbPath, path.join(kbPath, ...relative.split("/")), true);
			const bytes = await readRegularFile(kbPath, absolute, true);
			if (!bytes) conflicts.push({ source_path: relative, current_state: "missing", preserved_variants: [] });
			else conflicts.push({ source_path: relative, current_state: "present", current_sha256: sha256Bytes(bytes), preserved_variants: [] });
		} catch {
			return { conflicts, blocked: true };
		}
	}
	return { conflicts, blocked: false };
}

function journalContentPath(record: GraphRenameJournal, relative: string): string {
	return relative === record.source_path || relative === record.transit_path || relative === record.target_path ? record.source_path : relative;
}

export async function preserveConflictVariants(
	kbPath: string,
	store: GraphRenameJournalStore,
	record: GraphRenameJournal,
	conflicts: GraphRenameJournal["conflicts"],
): Promise<GraphRenameJournal["conflicts"]> {
	const result: GraphRenameJournal["conflicts"] = [];
	for (const conflict of conflicts) {
		const variants = [...conflict.preserved_variants];
		const contentPath = journalContentPath(record, conflict.source_path);
		const addVariant = async (kind: "current" | "original" | "intended", bytes: Buffer | null, digest: string | null | undefined) => {
			if (!bytes) return;
			const relativePath = await store.preserveConflictVariant({ operationId: record.operation_id, kind, sourcePath: conflict.source_path, bytes });
			const sha256 = sha256Bytes(bytes) || digest;
			if (!sha256 || variants.some((variant) => variant.kind === kind && variant.sha256 === sha256)) return;
			variants.push({ kind, relative_path: relativePath, sha256 });
		};
		const currentBytes = conflict.current_state === "present" ? await readRegularFile(kbPath, path.join(kbPath, ...conflict.source_path.split("/")), false) : null;
		await addVariant("current", currentBytes, conflict.current_sha256);
		const originalPath = record.backup_paths[contentPath];
		const intendedPath = record.intended_paths[contentPath] ?? record.stage_paths[contentPath];
		await addVariant("original", originalPath ? await readOwnedFile(kbPath, originalPath) : null, record.original_hashes[contentPath]);
		await addVariant("intended", intendedPath ? await readOwnedFile(kbPath, intendedPath) : null, record.intended_hashes[contentPath]);
		result.push({ ...conflict, preserved_variants: variants });
	}
	return result;
}

export async function captureRecoveryEvidence(
	kbPath: string,
	store: GraphRenameJournalStore,
	record: GraphRenameJournal,
	conflicts: GraphRenameJournal["conflicts"],
	action: "finish_commit" | "finish_rollback",
	nowValue: Date,
): Promise<{ conflicts: GraphRenameJournal["conflicts"]; evidence: PreservedEvidence[] }> {
	const chosenKind = action === "finish_commit" ? "intended" : "original";
	const evidence: PreservedEvidence[] = [];
	const result: GraphRenameJournal["conflicts"] = [];
	for (const conflict of conflicts) {
		const variants = [...conflict.preserved_variants];
		const contentPath = journalContentPath(record, conflict.source_path);
		const chosen = await readOwnedVariant(kbPath, record, contentPath, chosenKind);
		const candidates: Array<["current" | "original" | "intended", Buffer | null]> = [
			["current", conflict.current_state === "present" ? await readRegularFile(kbPath, path.join(kbPath, ...conflict.source_path.split("/")), false) : null],
			["original", await readOwnedVariant(kbPath, record, contentPath, "original")],
			["intended", await readOwnedVariant(kbPath, record, contentPath, "intended")],
		];
		for (const [kind, bytes] of candidates) {
			if (kind === chosenKind || !bytes || (chosen && bytes.equals(chosen))) continue;
			const relativePath = await store.preserveConflictVariant({ operationId: record.operation_id, kind, sourcePath: conflict.source_path, bytes });
			const sha256 = sha256Bytes(bytes);
			if (!variants.some((variant) => variant.kind === kind && variant.sha256 === sha256)) variants.push({ kind, relative_path: relativePath, sha256 });
			if (!evidence.some((item) => item.relative_path === relativePath)) evidence.push({ relative_path: relativePath, sha256, expires_at: new Date(nowValue.getTime() + RENAME_RETENTION_MS).toISOString() });
		}
		result.push({ ...conflict, preserved_variants: variants });
	}
	return { conflicts: result, evidence };
}

export async function writeRecoveryFile(kbRoot: string, target: string, bytes: Buffer | null, expectedSha256?: string | null): Promise<void> {
	if (bytes === null) {
		const current = await readRegularFile(kbRoot, target, true);
		if (!current) return;
		await removeFileNoOverwrite({ kbRoot, targetPath: target, expectedSha256: expectedSha256 ?? sha256Bytes(current) });
		return;
	}
	await replaceFileNoOverwrite({ kbRoot, targetPath: target, bytes, expectedSha256 });
}

function invalidJournalError(message: string): Error & { code: "INVALID_JOURNAL" } {
	return Object.assign(new Error(message), { code: "INVALID_JOURNAL" as const });
}
