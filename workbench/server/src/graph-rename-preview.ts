import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

import { type GraphLayout, type GraphRenamePreviewData } from "@llm-wiki/workbench-contracts";
import type { GraphLayoutFile } from "@llm-wiki/graph-engine";

import { lstatExactPath, sha256Bytes, type ResolvedRenamePaths } from "./graph-rename-files.js";
import { readRegularFile } from "./graph-rename-safe-io.js";
import { wikiLinkCliPath } from "./repo-root.js";

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

export interface RenameScanReport {
	file_set_sha256: string;
	source_sha256: string;
	source_path: string;
	target_path: string;
	validation: { requires_transit?: boolean };
	editable_occurrences: RenameScanOccurrence[];
	read_only_occurrences: RenameScanOccurrence[];
	ambiguous_occurrences: RenameScanOccurrence[];
}

export function buildRenamePreview(input: { resolved: ResolvedRenamePaths; scan: RenameScanReport; layout: GraphLayoutFile | null; operationId: string; expiresAt: Date }): GraphRenamePreviewData {
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
	const previewDigest = createHash("sha256").update(JSON.stringify({ ...projection, source_sha256: input.scan.source_sha256, layout: input.layout })).digest("hex");
	return { ...projection, preview_digest: previewDigest, equivalent_portable_name: input.resolved.equivalentPortableName, summary: { editable_files: grouped.size, editable_occurrences: editable.length + ambiguous.filter((item) => !editable.some((entry) => occurrenceId(entry) === occurrenceId(item))).length, read_only_occurrences: readOnly.length, ambiguous_occurrences: ambiguous.length } };
}

export async function runRenameScan(kbPath: string, sourcePath: string, newName: string, cliPathOption?: string): Promise<RenameScanReport> {
	const cliPath = cliPathOption ?? await wikiLinkCliPath();
	const report = await new Promise<Omit<RenameScanReport, "source_sha256">>((resolve, reject) => {
		const child = spawn(process.execPath, [cliPath, "rename-scan", kbPath, sourcePath, newName], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code !== 0) return reject(new Error(`rename scan failed: ${signal ?? code}`));
			try { resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as Omit<RenameScanReport, "source_sha256">); } catch { reject(new Error("rename scan returned invalid JSON")); }
		});
	});
	const source = await readRegularFile(kbPath, path.join(kbPath, ...sourcePath.split("/")), false);
	if (!source) throw new Error("rename source disappeared during scan");
	return { ...report, source_sha256: sha256Bytes(source) };
}

export async function readRenameLayout(kbPath: string): Promise<GraphLayoutFile | null> {
	const target = path.join(kbPath, ".wiki-graph-layout.json");
	const info = await lstatExactPath(target);
	if (!info) return null;
	if (!info.isFile() || info.isSymbolicLink()) throw conflictError("layout file is unsafe");
	const content = await readRegularFile(kbPath, target, false);
	if (!content) throw conflictError("layout file disappeared");
	const parsed = JSON.parse(content.toString("utf8")) as GraphLayout;
	if (parsed.version !== 2 || !parsed.pins || typeof parsed.pins !== "object") throw conflictError("layout file is invalid");
	return parsed as GraphLayoutFile;
}

function conflictError(message: string): Error & { code: "CONFLICT" } {
	return Object.assign(new Error(message), { code: "CONFLICT" as const });
}
