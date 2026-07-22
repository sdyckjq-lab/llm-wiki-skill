import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import type { GraphLayoutFile } from "@llm-wiki/graph-engine";

import type { RenameFileState } from "./graph-rename-journal.js";
import {
	assertSafePath,
	commitPreparedFileNoOverwrite,
	exactPath,
	lstatExactPath,
	moveFileNoOverwrite,
	readRegularFile,
	removeFileNoOverwrite,
	sha256Bytes,
} from "./graph-rename-safe-io.js";

export { exactPath, lstatExactPath, sha256Bytes } from "./graph-rename-safe-io.js";

const require = createRequire(import.meta.url);
const { loadUnicode17CaseFolder } = require("../../../scripts/lib/unicode-case-folding.js") as {
	loadUnicode17CaseFolder: () => (value: string) => string;
};

const FORMAL_GRAPH_DIRECTORIES = new Set(["entities", "topics", "sources", "comparisons", "synthesis", "queries"]);
const CONTROL_OR_UNSAFE = /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/;
const RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface ResolvedRenamePaths {
	kbRealPath: string;
	sourcePath: string;
	targetPath: string;
	sourceRelativePath: string;
	targetRelativePath: string;
	sourceDirectory: string;
	equivalentPortableName: boolean;
}

export interface ExactByteReplacement {
	startByte: number;
	endByte: number;
	rawLink: string;
	replacement: string;
}

export interface StageRenameFileInput {
	kbRoot: string;
	operationId: string;
	destinationPath: string;
	bytes: Buffer;
	mode?: number;
}

export interface StagedRenameFile {
	operationId: string;
	destinationPath: string;
	stagedPath: string;
	sha256: string;
	mode: number;
}

export interface CommitStagedRenameFileInput extends StagedRenameFile {
	kbRoot: string;
	expectedDestinationSha256?: string | null;
	beforeRename?: () => void | Promise<void>;
	afterFinalCheck?: () => void | Promise<void>;
}

export interface RenameSourceInput {
	kbRoot: string;
	sourcePath: string;
	targetPath: string;
	operationId: string;
	transitPath?: string;
	onStep?: (state: RenameFileState, transitPath?: string) => void | Promise<void>;
	beforeRename?: (from: "source" | "transit", to: "transit" | "target") => void | Promise<void>;
	afterFinalCheck?: (from: "source" | "transit", to: "transit" | "target") => void | Promise<void>;
	expectedSourceSha256?: string;
}

function isWithin(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function safeRelativePath(value: string): string {
	if (!value || value.includes("\\") || path.posix.isAbsolute(value)) throw renameError("FORBIDDEN_PATH", "path must be relative");
	const segments = value.split("/");
	if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\0"))) {
		throw renameError("FORBIDDEN_PATH", "path contains unsafe segments");
	}
	return segments.join("/");
}

function formalGraphPage(value: string): boolean {
	const segments = value.split("/");
	return segments.length >= 3 && segments[0] === "wiki" && FORMAL_GRAPH_DIRECTORIES.has(segments[1] ?? "") && value.endsWith(".md");
}

function portableKey(value: string): string {
	return loadUnicode17CaseFolder()(value);
}

function targetName(newName: string): string {
	if (!newName || newName !== newName.trim() || newName.includes("/") || newName.includes("\\") || newName.includes("\0")) {
		throw renameError("INVALID_REQUEST", "target name must be one filename");
	}
	const withoutOneSuffix = /\.md$/i.test(newName) ? newName.slice(0, -3) : newName;
	const storedName = `${withoutOneSuffix}.md`;
	const stem = storedName.slice(0, -3);
	if (!withoutOneSuffix || withoutOneSuffix === "." || withoutOneSuffix === "..") throw renameError("INVALID_REQUEST", "target name is empty");
	if (CONTROL_OR_UNSAFE.test(storedName)) throw renameError("INVALID_REQUEST", "target name contains an illegal character");
	if (/[ .]$/.test(withoutOneSuffix)) throw renameError("INVALID_REQUEST", "target name cannot end with dot or space");
	if (/[#|^]/.test(storedName) || storedName.includes("[[") || storedName.includes("]]" ) || storedName.includes("%%")) {
		throw renameError("INVALID_REQUEST", "target name breaks wikilink syntax");
	}
	if (RESERVED_STEM.test(stem)) throw renameError("INVALID_REQUEST", "target name is reserved on Windows");
	return storedName;
}

async function assertNoSymlinkPath(root: string, candidate: string, allowMissingLeaf: boolean): Promise<void> {
	const relative = path.relative(root, candidate);
	if (!isWithin(root, candidate)) throw renameError("FORBIDDEN_PATH", "path escapes knowledge base");
	const parts = relative ? relative.split(path.sep) : [];
	let current = root;
	for (let index = 0; index < parts.length; index += 1) {
		current = path.join(current, parts[index]!);
		const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
			if (allowMissingLeaf && index === parts.length - 1 && error.code === "ENOENT") return null;
			throw error;
		});
		if (info?.isSymbolicLink()) throw renameError("FORBIDDEN_PATH", "symbolic links are not allowed");
	}
}

export async function resolveKnowledgeBaseRenamePath(input: {
	kbPath: string;
	sourcePath: string;
	newName: string;
}): Promise<ResolvedRenamePaths> {
	const kbRealPath = await realpath(input.kbPath).catch(() => { throw renameError("FORBIDDEN_PATH", "knowledge base is unavailable"); });
	const sourceRelativePath = safeRelativePath(input.sourcePath);
	if (!formalGraphPage(sourceRelativePath)) throw renameError("INVALID_REQUEST", "source is not a formal graph page");
	const sourcePath = path.join(kbRealPath, ...sourceRelativePath.split("/"));
	await assertNoSymlinkPath(kbRealPath, sourcePath, false);
	const sourceInfo = await lstat(sourcePath).catch(() => null);
	if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) throw renameError("FORBIDDEN_PATH", "source must be a regular markdown file");
	const sourceDirectory = path.dirname(sourcePath);
	const sourceDirectoryReal = await realpath(sourceDirectory);
	if (!isWithin(kbRealPath, sourceDirectoryReal) || sourceDirectoryReal !== sourceDirectory) throw renameError("FORBIDDEN_PATH", "source directory is not real");
	const storedName = targetName(input.newName);
	const targetRelativePath = `${path.posix.dirname(sourceRelativePath)}/${storedName}`;
	const targetPath = path.join(sourceDirectory, storedName);
	await assertNoSymlinkPath(kbRealPath, targetPath, true);
	const targetInfo = await lstat(targetPath).catch(() => null);
	if (targetInfo?.isSymbolicLink()) throw renameError("FORBIDDEN_PATH", "target is a symbolic link");
	if (targetInfo && !targetInfo.isFile()) throw renameError("CONFLICT", "target is occupied by a non-file entry");
	const equivalentPortableName = portableKey(sourceRelativePath) === portableKey(targetRelativePath) && sourceRelativePath !== targetRelativePath;
	const sameResource = targetInfo ? (await realpath(targetPath).catch(() => "")) === (await realpath(sourcePath).catch(() => "!same")) : false;
	if (targetInfo && !sameResource) throw renameError("CONFLICT", equivalentPortableName ? "equivalent target is occupied" : "target already exists");
	for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
		if (entry.name === path.basename(sourcePath) || (sameResource && entry.name === path.basename(targetPath))) continue;
		const candidateRelativePath = `${path.posix.dirname(sourceRelativePath)}/${entry.name}`;
		if (portableKey(candidateRelativePath) === portableKey(targetRelativePath)) throw renameError("CONFLICT", "equivalent target is occupied");
	}
	return { kbRealPath, sourcePath, targetPath, sourceRelativePath, targetRelativePath, sourceDirectory, equivalentPortableName };
}

export function applyByteRangeReplacements(original: Buffer, replacements: ExactByteReplacement[]): Buffer {
	const sorted = [...replacements].sort((left, right) => right.startByte - left.startByte);
	let previousStart = original.length + 1;
	let result = Buffer.from(original);
	for (const replacement of sorted) {
		if (!Number.isInteger(replacement.startByte) || !Number.isInteger(replacement.endByte) || replacement.startByte < 0 || replacement.endByte <= replacement.startByte || replacement.endByte > original.length) {
			throw new Error("invalid byte replacement range");
		}
		if (replacement.endByte > previousStart) throw new Error("overlapping byte replacement ranges");
		const actual = original.subarray(replacement.startByte, replacement.endByte).toString("utf8");
		if (actual !== replacement.rawLink) throw new Error("source bytes changed since preview");
		const before = result.subarray(0, replacement.startByte);
		const after = result.subarray(replacement.endByte);
		result = Buffer.concat([before, Buffer.from(replacement.replacement, "utf8"), after]);
		previousStart = replacement.startByte;
	}
	return result;
}

export async function stageRenameFile(input: StageRenameFileInput): Promise<StagedRenameFile> {
	const destinationPath = await assertSafeRenamePath(input.kbRoot, input.destinationPath, true);
	const destinationDirectory = path.dirname(destinationPath);
	await mkdir(destinationDirectory, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "EEXIST") throw error;
	});
	const mode = input.mode ?? 0o600;
	let stagedPath = "";
	for (let attempt = 0; attempt < 20; attempt += 1) {
		stagedPath = path.join(destinationDirectory, `.${path.basename(destinationPath)}.${input.operationId}.${attempt}.${randomUUID()}.stage`);
		try {
			const handle = await open(stagedPath, "wx", mode);
			try {
				await handle.writeFile(input.bytes);
				await handle.sync();
			} finally {
				await handle.close();
			}
			await chmod(stagedPath, mode & 0o7777);
			const readBack = await readFile(stagedPath);
			if (!readBack.equals(input.bytes)) throw new Error("staged bytes failed read-back verification");
			return { operationId: input.operationId, destinationPath, stagedPath, sha256: sha256Bytes(input.bytes), mode };
		} catch (error) {
			await unlink(stagedPath).catch(() => undefined);
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	throw new Error("unable to allocate rename staging path");
}

export async function commitStagedRenameFile(input: CommitStagedRenameFileInput): Promise<void> {
	await commitPreparedFileNoOverwrite({
		kbRoot: input.kbRoot,
		targetPath: input.destinationPath,
		preparedPath: input.stagedPath,
		intendedSha256: input.sha256,
		expectedSha256: input.expectedDestinationSha256,
		beforeFinalOperation: input.beforeRename,
		afterFinalCheck: input.afterFinalCheck,
	});
}

export async function renameSourceWithTransit(input: RenameSourceInput): Promise<string | null> {
	const sourcePath = await assertSafeRenamePath(input.kbRoot, input.sourcePath, true);
	const targetPath = await assertSafeRenamePath(input.kbRoot, input.targetPath, true);
	if (sourcePath === targetPath) return null;
	let sourceInfo = await lstatExactPath(sourcePath);
	if (sourceInfo && (!sourceInfo.isFile() || sourceInfo.isSymbolicLink())) throw renameError("FORBIDDEN_PATH", "source must be a regular file");
	const targetInfo = await lstatExactPath(targetPath);
	if (targetInfo && sourceInfo) {
		const sourceReal = await realpath(sourcePath);
		const targetReal = await realpath(targetPath);
		if (sourceReal !== targetReal && !sameFileIdentity(sourceInfo, targetInfo)) throw renameError("CONFLICT", "rename target is occupied");
	}
	const providedTransit = input.transitPath ? await assertSafeRenamePath(input.kbRoot, input.transitPath, true) : null;
	const transitInfo = providedTransit ? await lstatExactPath(providedTransit) : null;
	if (sourceInfo && targetInfo && sameFileIdentity(sourceInfo, targetInfo)) {
		const bytes = await readRegularFile(input.kbRoot, sourcePath, false);
		if (!bytes) throw renameError("CONFLICT", "rename source disappeared");
		await removeFileNoOverwrite({ kbRoot: input.kbRoot, targetPath: sourcePath, expectedSha256: input.expectedSourceSha256 ?? sha256Bytes(bytes) });
		await input.onStep?.("target");
		return null;
	}
	if (sourceInfo && transitInfo && sameFileIdentity(sourceInfo, transitInfo)) {
		const bytes = await readRegularFile(input.kbRoot, sourcePath, false);
		if (!bytes) throw renameError("CONFLICT", "rename source disappeared");
		await removeFileNoOverwrite({ kbRoot: input.kbRoot, targetPath: sourcePath, expectedSha256: input.expectedSourceSha256 ?? sha256Bytes(bytes) });
		sourceInfo = null;
		await input.onStep?.("transit", path.relative(input.kbRoot, providedTransit!).replaceAll(path.sep, "/"));
	}
	if (!sourceInfo) {
		const currentTransit = providedTransit ? await lstatExactPath(providedTransit) : null;
		if (providedTransit && currentTransit) {
			if (targetInfo && !sameFileIdentity(currentTransit, targetInfo)) throw renameError("CONFLICT", "rename target is occupied during transit recovery");
			if (targetInfo && sameFileIdentity(currentTransit, targetInfo)) {
				const bytes = await readRegularFile(input.kbRoot, providedTransit, false);
				if (!bytes) throw renameError("CONFLICT", "rename transit disappeared");
				await removeFileNoOverwrite({ kbRoot: input.kbRoot, targetPath: providedTransit, expectedSha256: input.expectedSourceSha256 ?? sha256Bytes(bytes) });
				await input.onStep?.("target");
				return path.relative(input.kbRoot, providedTransit).replaceAll(path.sep, "/");
			}
			await moveFileNoOverwrite({
				kbRoot: input.kbRoot,
				sourcePath: providedTransit,
				targetPath,
				expectedSourceSha256: input.expectedSourceSha256,
				beforeFinalOperation: () => input.beforeRename?.("transit", "target"),
				afterFinalCheck: () => input.afterFinalCheck?.("transit", "target"),
			});
			await input.onStep?.("target", path.relative(input.kbRoot, providedTransit).replaceAll(path.sep, "/"));
			return path.relative(input.kbRoot, providedTransit).replaceAll(path.sep, "/");
		}
		if (targetInfo) {
			if (input.expectedSourceSha256 && sha256Bytes(await readFile(targetPath)) !== input.expectedSourceSha256) throw renameError("CONFLICT", "rename target does not match source");
			await input.onStep?.("target");
			return null;
		}
		throw renameError("CONFLICT", "source and transit files are both missing");
	}
	const sourceRelative = path.basename(sourcePath);
	const targetRelative = path.basename(targetPath);
	const useTransit = portableKey(sourceRelative) === portableKey(targetRelative);
	if (!useTransit) {
		await moveFileNoOverwrite({
			kbRoot: input.kbRoot,
			sourcePath,
			targetPath,
			expectedSourceSha256: input.expectedSourceSha256,
			beforeFinalOperation: () => input.beforeRename?.("source", "target"),
			afterFinalCheck: () => input.afterFinalCheck?.("source", "target"),
		});
		await input.onStep?.("target");
		return null;
	}
	const directory = path.dirname(sourcePath);
	let transit = input.transitPath;
	if (!transit) {
		for (let counter = 0; counter < 100; counter += 1) {
			const candidate = path.join(directory, `.llm-wiki-rename-${input.operationId}-${counter}.md`);
			if (!(await lstat(candidate).catch(() => null))) { transit = candidate; break; }
		}
	}
	if (!transit) throw new Error("unable to reserve rename transit path");
	transit = await assertSafeRenamePath(input.kbRoot, transit, true);
	const generatedTransitInfo = await lstatExactPath(transit);
	if (generatedTransitInfo) throw renameError("CONFLICT", "rename transit path is occupied");
	if (sourcePath !== transit && await lstatExactPath(sourcePath)) {
		await moveFileNoOverwrite({
			kbRoot: input.kbRoot,
			sourcePath,
			targetPath: transit,
			expectedSourceSha256: input.expectedSourceSha256,
			beforeFinalOperation: () => input.beforeRename?.("source", "transit"),
			afterFinalCheck: () => input.afterFinalCheck?.("source", "transit"),
		});
		await input.onStep?.("transit", path.relative(input.kbRoot, transit).replaceAll(path.sep, "/"));
	}
	if (transit !== targetPath && await lstatExactPath(transit)) {
		await moveFileNoOverwrite({
			kbRoot: input.kbRoot,
			sourcePath: transit,
			targetPath,
			expectedSourceSha256: input.expectedSourceSha256,
			beforeFinalOperation: () => input.beforeRename?.("transit", "target"),
			afterFinalCheck: () => input.afterFinalCheck?.("transit", "target"),
		});
		await input.onStep?.("target", path.relative(input.kbRoot, transit).replaceAll(path.sep, "/"));
	}
	return transit;
}

function sameFileIdentity(left: import("node:fs").Stats, right: import("node:fs").Stats): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

export async function readFileExactPath(candidate: string): Promise<Buffer | null> {
	const actual = await exactPath(candidate);
	return actual ? readFile(actual) : null;
}

export async function assertSafeRenamePath(kbRoot: string, candidate: string, allowMissingLeaf: boolean): Promise<string> {
	return assertSafePath(kbRoot, candidate, allowMissingLeaf);
}

export function migrateRenameLayoutKey(layout: GraphLayoutFile, fromKey: string, toKey: string): GraphLayoutFile {
	if (fromKey === toKey || !Object.hasOwn(layout.pins, fromKey)) return layout;
	if (Object.hasOwn(layout.pins, toKey)) throw renameError("CONFLICT", "target layout pin is already occupied");
	const pins = { ...layout.pins, [toKey]: layout.pins[fromKey]! };
	delete pins[fromKey];
	return { ...layout, pins };
}

function renameError(code: string, message: string): Error & { code: string } {
	return Object.assign(new Error(message), { code });
}
