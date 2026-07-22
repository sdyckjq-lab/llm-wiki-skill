import { createHash, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

export interface SafeParentBoundary {
	path: string;
	realPath: string;
	dev: number;
	ino: number;
}

export interface ReplaceFileNoOverwriteInput {
	kbRoot: string;
	targetPath: string;
	bytes: Buffer;
	expectedSha256?: string | null;
	mode?: number;
	beforeFinalOperation?: () => void | Promise<void>;
}

export interface CommitPreparedFileNoOverwriteInput {
	kbRoot: string;
	targetPath: string;
	preparedPath: string;
	intendedSha256: string;
	expectedSha256?: string | null;
	beforeFinalOperation?: () => void | Promise<void>;
	afterFinalCheck?: () => void | Promise<void>;
}

export interface MoveFileNoOverwriteInput {
	kbRoot: string;
	sourcePath: string;
	targetPath: string;
	expectedSourceSha256?: string;
	beforeFinalOperation?: () => void | Promise<void>;
	afterFinalCheck?: () => void | Promise<void>;
}

export interface RemoveFileNoOverwriteInput {
	kbRoot: string;
	targetPath: string;
	expectedSha256: string;
	beforeFinalOperation?: () => void | Promise<void>;
	afterFinalCheck?: () => void | Promise<void>;
}

export function sha256Bytes(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function isWithin(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function ensureSafeDirectory(kbRoot: string, directory: string, mode = 0o700): Promise<string> {
	const root = await realpath(kbRoot).catch(() => { throw safeIoError("knowledge base is unavailable"); });
	const requested = path.resolve(directory);
	if (!isWithin(path.resolve(kbRoot), requested)) throw safeIoError("directory escapes knowledge base");
	const relative = path.relative(path.resolve(kbRoot), requested);
	let current = root;
	for (const segment of relative ? relative.split(path.sep) : []) {
		const next = path.join(current, segment);
		const info = await lstat(next).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (!info) {
			await mkdir(next, { mode });
			const created = await lstat(next);
			if (!created.isDirectory() || created.isSymbolicLink()) throw safeIoError("created directory is unsafe");
		} else if (!info.isDirectory() || info.isSymbolicLink()) {
			throw safeIoError("directory is unsafe");
		}
		current = next;
	}
	const actual = await realpath(current);
	if (!isWithin(root, actual) || actual !== current) throw safeIoError("directory is outside knowledge base");
	return current;
}

export async function assertSafePath(kbRoot: string, candidate: string, allowMissingLeaf: boolean): Promise<string> {
	const root = await realpath(kbRoot).catch(() => { throw safeIoError("knowledge base is unavailable"); });
	const rootInput = path.resolve(kbRoot);
	const candidateInput = path.resolve(candidate);
	const relativeToInputRoot = path.relative(rootInput, candidateInput);
	const absolute = isWithin(rootInput, candidateInput) ? path.join(root, relativeToInputRoot) : candidateInput;
	if (!isWithin(root, absolute)) throw safeIoError("path escapes knowledge base");
	const relative = path.relative(root, absolute);
	let current = root;
	const parts = relative ? relative.split(path.sep) : [];
	for (let index = 0; index < parts.length; index += 1) {
		current = path.join(current, parts[index]!);
		const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
			if (allowMissingLeaf && index === parts.length - 1 && error.code === "ENOENT") return null;
			throw error;
		});
		if (info?.isSymbolicLink()) throw safeIoError("symbolic links are not allowed");
	}
	const parent = path.dirname(absolute);
	const parentReal = await realpath(parent).catch(() => { throw safeIoError("parent is unavailable"); });
	if (!isWithin(root, parentReal) || parentReal !== parent) throw safeIoError("parent is symbolic");
	return absolute;
}

export async function captureParentBoundary(kbRoot: string, candidate: string): Promise<SafeParentBoundary> {
	const safeCandidate = await assertSafePath(kbRoot, candidate, true);
	const parent = path.dirname(safeCandidate);
	const root = await realpath(kbRoot);
	const realPath = await realpath(parent);
	const info = await lstat(parent);
	if (!info.isDirectory() || info.isSymbolicLink() || realPath !== parent || !isWithin(root, realPath)) throw safeIoError("parent is unsafe");
	return { path: parent, realPath, dev: info.dev, ino: info.ino };
}

export async function assertParentBoundary(kbRoot: string, candidate: string, expected: SafeParentBoundary): Promise<void> {
	const parent = path.dirname(path.resolve(candidate));
	const root = await realpath(kbRoot).catch(() => { throw safeIoError("knowledge base is unavailable"); });
	const realPath = await realpath(parent).catch(() => { throw safeIoError("parent is unavailable"); });
	const info = await lstat(parent).catch(() => null);
	if (!info || !info.isDirectory() || info.isSymbolicLink() || parent !== expected.path || realPath !== expected.realPath || info.dev !== expected.dev || info.ino !== expected.ino || !isWithin(root, realPath)) throw safeIoError("parent changed during file operation");
}

export async function exactPath(candidate: string): Promise<string | null> {
	const parent = path.dirname(candidate);
	const name = path.basename(candidate);
	const entries = await readdir(parent, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return [] as import("node:fs").Dirent[];
		throw error;
	});
	const entry = entries.find((item) => item.name === name);
	return entry ? path.join(parent, entry.name) : null;
}

export async function lstatExactPath(candidate: string): Promise<import("node:fs").Stats | null> {
	const actual = await exactPath(candidate);
	return actual ? lstat(actual) : null;
}

export async function readRegularFile(kbRoot: string, candidate: string, allowMissing = true): Promise<Buffer | null> {
	const safe = await assertSafePath(kbRoot, candidate, allowMissing);
	const boundary = await captureParentBoundary(kbRoot, safe);
	const actual = await exactPath(safe);
	if (!actual) return null;
	const info = await lstat(actual);
	if (!info.isFile() || info.isSymbolicLink()) throw safeIoError("file is not a regular file");
	const bytes = await readFile(actual);
	await assertParentBoundary(kbRoot, safe, boundary);
	const after = await lstatExactPath(safe);
	if (!after || after.dev !== info.dev || after.ino !== info.ino || !after.isFile() || after.isSymbolicLink()) throw safeIoError("file changed during read");
	return bytes;
}

export async function replaceFileNoOverwrite(input: ReplaceFileNoOverwriteInput): Promise<void> {
	const target = await assertSafePath(input.kbRoot, input.targetPath, true);
	const boundary = await captureParentBoundary(input.kbRoot, target);
	const temporary = path.join(boundary.path, `.${path.basename(target)}.${randomUUID()}.safe-tmp`);
	const handle = await open(temporary, "wx", input.mode ?? 0o600);
	try {
		await handle.writeFile(input.bytes);
		await handle.sync();
	} finally { await handle.close(); }
	try {
		await chmod(temporary, (input.mode ?? 0o600) & 0o7777);
		if (!(await readFile(temporary)).equals(input.bytes)) throw safeIoError("temporary bytes failed verification");
		await input.beforeFinalOperation?.();
		await assertParentBoundary(input.kbRoot, target, boundary);
		await commitPreparedFileNoOverwrite({ kbRoot: input.kbRoot, targetPath: target, preparedPath: temporary, intendedSha256: sha256Bytes(input.bytes), expectedSha256: input.expectedSha256 });
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

export async function commitPreparedFileNoOverwrite(input: CommitPreparedFileNoOverwriteInput): Promise<void> {
	const target = await assertSafePath(input.kbRoot, input.targetPath, true);
	const prepared = await assertSafePath(input.kbRoot, input.preparedPath, false);
	const boundary = await captureParentBoundary(input.kbRoot, target);
	const preparedBytes = await readRegularFile(input.kbRoot, prepared, false);
	if (!preparedBytes || sha256Bytes(preparedBytes) !== input.intendedSha256) throw safeIoError("prepared file hash mismatch");
	const current = await readRegularFile(input.kbRoot, target, true);
	const currentHash = current ? sha256Bytes(current) : null;
	if (input.expectedSha256 !== undefined && currentHash !== input.expectedSha256) throw safeIoError("target changed before commit");
	await input.beforeFinalOperation?.();
	await assertParentBoundary(input.kbRoot, target, boundary);
	const finalCurrent = await readRegularFile(input.kbRoot, target, true);
	const finalHash = finalCurrent ? sha256Bytes(finalCurrent) : null;
	if (input.expectedSha256 !== undefined && finalHash !== input.expectedSha256) throw safeIoError("target changed before commit");
	await input.afterFinalCheck?.();
	await assertParentBoundary(input.kbRoot, target, boundary);
	if (!finalCurrent) {
		await linkNoReplace(prepared, target);
		await unlink(prepared);
		return;
	}
	const guard = path.join(boundary.path, `.${path.basename(target)}.${randomUUID()}.safe-current`);
	await rename(target, guard);
	const guarded = await readRegularFile(input.kbRoot, guard, false);
	if (!guarded || sha256Bytes(guarded) !== finalHash) {
		await restoreNoReplace(guard, target);
		throw safeIoError("target changed during commit");
	}
	try {
		await assertParentBoundary(input.kbRoot, target, boundary);
		await linkNoReplace(prepared, target);
		await unlink(prepared);
		await unlink(guard);
	} catch (error) {
		if (!(await lstatExactPath(target))) await restoreNoReplace(guard, target).catch(() => undefined);
		throw error;
	}
}

export async function moveFileNoOverwrite(input: MoveFileNoOverwriteInput): Promise<void> {
	const source = await assertSafePath(input.kbRoot, input.sourcePath, false);
	const target = await assertSafePath(input.kbRoot, input.targetPath, true);
	const sourceBoundary = await captureParentBoundary(input.kbRoot, source);
	const targetBoundary = await captureParentBoundary(input.kbRoot, target);
	const sourceBytes = await readRegularFile(input.kbRoot, source, false);
	if (!sourceBytes || (input.expectedSourceSha256 && sha256Bytes(sourceBytes) !== input.expectedSourceSha256)) throw safeIoError("source changed before move");
	if (await lstatExactPath(target)) throw safeIoError("target is occupied");
	await input.beforeFinalOperation?.();
	await assertParentBoundary(input.kbRoot, source, sourceBoundary);
	await assertParentBoundary(input.kbRoot, target, targetBoundary);
	const finalSource = await readRegularFile(input.kbRoot, source, false);
	if (!finalSource || !finalSource.equals(sourceBytes) || await lstatExactPath(target)) throw safeIoError("source or target changed before move");
	await input.afterFinalCheck?.();
	await assertParentBoundary(input.kbRoot, source, sourceBoundary);
	await assertParentBoundary(input.kbRoot, target, targetBoundary);
	await linkNoReplace(source, target);
	const published = await readRegularFile(input.kbRoot, target, false);
	if (!published || !published.equals(sourceBytes)) {
		await unlink(target).catch(() => undefined);
		throw safeIoError("source changed during move");
	}
	await unlink(source);
}

export async function removeFileNoOverwrite(input: RemoveFileNoOverwriteInput): Promise<void> {
	const target = await assertSafePath(input.kbRoot, input.targetPath, true);
	const boundary = await captureParentBoundary(input.kbRoot, target);
	const current = await readRegularFile(input.kbRoot, target, true);
	if (!current) return;
	if (sha256Bytes(current) !== input.expectedSha256) throw safeIoError("target changed before removal");
	await input.beforeFinalOperation?.();
	await assertParentBoundary(input.kbRoot, target, boundary);
	const finalCurrent = await readRegularFile(input.kbRoot, target, false);
	if (!finalCurrent || sha256Bytes(finalCurrent) !== input.expectedSha256) throw safeIoError("target changed before removal");
	await input.afterFinalCheck?.();
	await assertParentBoundary(input.kbRoot, target, boundary);
	const guard = path.join(boundary.path, `.${path.basename(target)}.${randomUUID()}.safe-remove`);
	await rename(target, guard);
	const guarded = await readRegularFile(input.kbRoot, guard, false);
	if (!guarded || sha256Bytes(guarded) !== input.expectedSha256) {
		await restoreNoReplace(guard, target);
		throw safeIoError("target changed during removal");
	}
	await unlink(guard);
}

export async function linkNoReplace(source: string, destination: string): Promise<void> {
	try { await link(source, destination); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw safeIoError("destination appeared during file operation");
		throw error;
	}
}

export async function restoreNoReplace(source: string, destination: string): Promise<void> {
	await linkNoReplace(source, destination);
	await unlink(source);
}

function safeIoError(message: string): Error & { code: "FORBIDDEN_PATH" | "CONFLICT" } {
	const conflict = /changed|occupied|appeared/.test(message);
	return Object.assign(new Error(message), { code: conflict ? "CONFLICT" as const : "FORBIDDEN_PATH" as const });
}
