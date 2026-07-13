import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	ArtifactIdSchema,
	type ArtifactKind,
	type ArtifactManifest,
} from "@llm-wiki/workbench-contracts";

import { APP_DIR } from "./config.js";

export type { ArtifactKind, ArtifactManifest } from "@llm-wiki/workbench-contracts";

interface PendingArtifact {
	id: string;
	kind: ArtifactKind;
	title: string;
	workspacePath: string;
	sourceConversationId: string;
	sourceKbPath: string;
	sourceSkill: string;
	createdAt: string;
}

export interface ArtifactCreatedEvent {
	id: string;
	kind: ArtifactKind;
	title: string;
	conversationId: string;
}

export const ARTIFACTS_DIR = path.join(APP_DIR, "artifacts");
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const manifests = new Map<string, ArtifactManifest>();
const pending = new Map<string, PendingArtifact>();
export const artifactEvents = new EventEmitter();

export function isValidArtifactId(id: string): boolean {
	return ArtifactIdSchema.safeParse(id).success;
}

export function artifactWorkspacePath(id: string): string {
	assertValidArtifactId(id);
	return path.join(ARTIFACTS_DIR, id);
}

export async function scanAndRebuildArtifactIndex(): Promise<void> {
	manifests.clear();
	await mkdir(ARTIFACTS_DIR, { recursive: true });
	const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (!entry.isDirectory() || !isValidArtifactId(entry.name)) continue;
		const manifestPath = path.join(ARTIFACTS_DIR, entry.name, "manifest.json");
		try {
			const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ArtifactManifest;
			if (manifest.id === entry.name) manifests.set(manifest.id, manifest);
		} catch {
			// Ignore incomplete artifact workspaces.
		}
	}
}

export async function prepareArtifact(input: {
	kind: ArtifactKind;
	title: string;
	sourceConversationId: string;
	sourceKbPath: string;
	sourceSkill?: string;
}): Promise<{ id: string; workspacePath: string }> {
	const id = randomUUID();
	const workspacePath = artifactWorkspacePath(id);
	await mkdir(workspacePath, { recursive: true });
	pending.set(id, {
		id,
		kind: input.kind,
		title: input.title.trim() || input.kind.toUpperCase(),
		workspacePath,
		sourceConversationId: input.sourceConversationId,
		sourceKbPath: input.sourceKbPath,
		sourceSkill: input.sourceSkill ?? input.kind,
		createdAt: new Date().toISOString(),
	});
	return { id, workspacePath };
}

export async function finalizeArtifact(input: {
	id: string;
	primaryFile: string;
	sourceSkill?: string;
}): Promise<ArtifactManifest> {
	assertValidArtifactId(input.id);
	assertSafeFilename(input.primaryFile);
	const base = artifactWorkspacePath(input.id);
	assertInside(ARTIFACTS_DIR, base);
	const meta = pending.get(input.id);
	if (!meta) {
		throw new Error("artifact 未准备或已完成");
	}

	const files = await listWorkspaceFiles(base);
	const primary = files.find((file) => file.name === input.primaryFile);
	if (!primary) {
		throw new Error(`主文件不存在：${input.primaryFile}`);
	}

	const manifest: ArtifactManifest = {
		id: input.id,
		kind: meta.kind,
		renderer: meta.kind === "html" ? "iframe" : "download-only",
		metadata: {
			title: meta.title,
			createdAt: meta.createdAt,
			sourceConversationId: meta.sourceConversationId,
			sourceKbPath: meta.sourceKbPath,
			sourceSkill: input.sourceSkill ?? meta.sourceSkill,
			sizeBytes: primary.sizeBytes,
		},
		files,
		primaryFile: primary.name,
	};

	await atomicWriteJson(path.join(base, "manifest.json"), manifest);
	manifests.set(manifest.id, manifest);
	pending.delete(manifest.id);
	artifactEvents.emit("artifact_created", {
		id: manifest.id,
		kind: manifest.kind,
		title: manifest.metadata.title,
		conversationId: manifest.metadata.sourceConversationId,
	} satisfies ArtifactCreatedEvent);
	return manifest;
}

export function listArtifacts(conversationId?: string): ArtifactManifest[] {
	return [...manifests.values()]
		.filter((manifest) => !conversationId || manifest.metadata.sourceConversationId === conversationId)
		.sort((a, b) => a.metadata.createdAt.localeCompare(b.metadata.createdAt));
}

export function getArtifact(id: string): ArtifactManifest | null {
	assertValidArtifactId(id);
	return manifests.get(id) ?? null;
}

export function resolveArtifactFile(id: string, filename: string): {
	path: string;
	mimeType: string;
	sizeBytes: number;
} {
	assertValidArtifactId(id);
	assertSafeFilename(filename);
	const manifest = manifests.get(id);
	if (!manifest) throw new Error("artifact 不存在");
	const file = manifest.files.find((item) => item.name === filename);
	if (!file) throw new Error("文件不在 manifest 中");
	const target = path.join(artifactWorkspacePath(id), filename);
	assertInside(artifactWorkspacePath(id), target);
	return { path: target, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
}

export function createArtifactReadStream(filePath: string) {
	return createReadStream(filePath);
}

async function listWorkspaceFiles(base: string): Promise<ArtifactManifest["files"]> {
	const entries = await readdir(base, { withFileTypes: true });
	const files: ArtifactManifest["files"] = [];
	for (const entry of entries) {
		if (!entry.isFile() || entry.name === "manifest.json") continue;
		assertSafeFilename(entry.name);
		const fullPath = path.join(base, entry.name);
		assertInside(base, fullPath);
		const info = await stat(fullPath);
		if (info.size > MAX_FILE_BYTES) {
			throw new Error(`文件超过 100MB 限制：${entry.name}`);
		}
		files.push({
			name: entry.name,
			sizeBytes: info.size,
			mimeType: mimeTypeFor(entry.name),
		});
	}
	if (files.length === 0) throw new Error("artifact 目录中没有可登记文件");
	files.sort((a, b) => a.name.localeCompare(b.name));
	return files;
}

function mimeTypeFor(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
	if (ext === ".pdf") return "application/pdf";
	if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
	if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	if (ext === ".txt") return "text/plain; charset=utf-8";
	if (ext === ".json") return "application/json";
	return "application/octet-stream";
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
	const tmp = `${filePath}.tmp`;
	await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	await rename(tmp, filePath);
}

function assertValidArtifactId(id: string): void {
	if (!isValidArtifactId(id)) throw new Error("artifact id 格式错误");
}

function assertSafeFilename(filename: string): void {
	if (
		!filename ||
		filename.includes("/") ||
		filename.includes("\\") ||
		filename.includes("..") ||
		path.isAbsolute(filename)
	) {
		throw new Error("文件名不安全");
	}
}

function assertInside(baseDir: string, target: string): void {
	const resolvedBase = path.resolve(baseDir);
	const resolvedTarget = path.resolve(target);
	if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
		throw new Error("路径越界");
	}
}
