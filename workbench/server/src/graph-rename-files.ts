import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

import type { GraphLayoutFile } from "@llm-wiki/graph-engine";

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
	expectedDestinationSha256?: string | null;
}

export interface RenameSourceInput {
	sourcePath: string;
	targetPath: string;
	operationId: string;
	transitPath?: string;
}

export function sha256Bytes(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
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
	if (targetInfo && (!targetInfo.isFile() || targetInfo.isSymbolicLink())) throw renameError("FORBIDDEN_PATH", "target is not a regular file");
	const equivalentPortableName = portableKey(sourceRelativePath) === portableKey(targetRelativePath) && sourceRelativePath !== targetRelativePath;
	const sameResource = targetInfo ? (await realpath(targetPath).catch(() => "")) === (await realpath(sourcePath).catch(() => "!same")) : false;
	if (targetInfo && !sameResource) throw renameError("CONFLICT", equivalentPortableName ? "equivalent target is occupied" : "target already exists");
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
	const destinationDirectory = path.dirname(input.destinationPath);
	const destinationDirectoryReal = await realpath(destinationDirectory);
	if (destinationDirectoryReal !== destinationDirectory) throw renameError("FORBIDDEN_PATH", "destination directory is symbolic");
	await mkdir(destinationDirectory, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "EEXIST") throw error;
	});
	const mode = input.mode ?? 0o600;
	let stagedPath = "";
	for (let attempt = 0; attempt < 20; attempt += 1) {
		stagedPath = path.join(destinationDirectory, `.${path.basename(input.destinationPath)}.${input.operationId}.${attempt}.${randomUUID()}.stage`);
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
			return { operationId: input.operationId, destinationPath: input.destinationPath, stagedPath, sha256: sha256Bytes(input.bytes), mode };
		} catch (error) {
			await unlink(stagedPath).catch(() => undefined);
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	throw new Error("unable to allocate rename staging path");
}

export async function commitStagedRenameFile(input: CommitStagedRenameFileInput): Promise<void> {
	const staged = await readFile(input.stagedPath);
	if (sha256Bytes(staged) !== input.sha256) throw new Error("staged file hash mismatch");
	const current = await lstat(input.destinationPath).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	if (current?.isSymbolicLink() || (current && !current.isFile())) throw renameError("FORBIDDEN_PATH", "destination is not a regular file");
	if (input.expectedDestinationSha256 !== undefined) {
		const currentHash = current ? sha256Bytes(await readFile(input.destinationPath)) : null;
		if (currentHash !== input.expectedDestinationSha256) throw new Error("destination changed since staging");
	}
	await rename(input.stagedPath, input.destinationPath);
}

export async function renameSourceWithTransit(input: RenameSourceInput): Promise<string | null> {
	if (input.sourcePath === input.targetPath) return null;
	const sourceRelative = path.basename(input.sourcePath);
	const targetRelative = path.basename(input.targetPath);
	const useTransit = portableKey(sourceRelative) === portableKey(targetRelative);
	if (!useTransit) {
		await rename(input.sourcePath, input.targetPath);
		return null;
	}
	const directory = path.dirname(input.sourcePath);
	let transit = input.transitPath;
	if (!transit) {
		for (let counter = 0; counter < 100; counter += 1) {
			const candidate = path.join(directory, `.llm-wiki-rename-${input.operationId}-${counter}.md`);
			if (!(await lstat(candidate).catch(() => null))) { transit = candidate; break; }
		}
	}
	if (!transit) throw new Error("unable to reserve rename transit path");
	if (input.sourcePath !== transit && await lstat(input.sourcePath).catch(() => null)) await rename(input.sourcePath, transit);
	if (transit !== input.targetPath && await lstat(transit).catch(() => null)) await rename(transit, input.targetPath);
	return transit;
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
