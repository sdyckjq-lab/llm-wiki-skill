import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createGraphRenameService } from "../src/graph-renames.js";

const [kbPath, metadataPath, crashBoundary] = process.argv.slice(2);
if (!kbPath || !metadataPath) throw new Error("usage: graph-rename-crash-child <kb> <metadata>");
await mkdir(path.dirname(metadataPath), { recursive: true });
if (crashBoundary === "recovery-refresh" || crashBoundary === "recovery-finish") {
	type ObservedConflict = { source_path: string; current_state: "present"; current_sha256: string } | { source_path: string; current_state: "missing" };
	const payload = JSON.parse(await readFile(metadataPath, "utf8")) as { operation_id: string; observed_conflicts?: ObservedConflict[]; result?: unknown };
	const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
	const result = await service.resolveGraphRenameRecovery(kbPath, {
		operation_id: payload.operation_id,
		action: "finish_rollback",
		observed_conflicts: crashBoundary === "recovery-finish" ? payload.observed_conflicts ?? [] : [],
	});
	const observed = result.status === "required"
		? result.operation.conflicts.map((conflict) => conflict.current_state === "present"
			? { source_path: conflict.source_path, current_state: "present" as const, current_sha256: conflict.current_sha256 }
			: { source_path: conflict.source_path, current_state: "missing" as const })
		: payload.observed_conflicts ?? [];
	await writeFile(metadataPath, JSON.stringify({ ...payload, observed_conflicts: observed, result }), "utf8");
} else {
	const service = createGraphRenameService({
		afterFileCommit: async (relativePath) => {
			if (!crashBoundary && relativePath.endsWith(".md")) process.exit(73);
		},
		afterSourceRenameStep: async (state) => {
			if (crashBoundary === state) process.exit(73);
		},
		triggerRebuild: () => ({ ok: true, status: "started" }),
	});
	const sourcePath = crashBoundary ? "wiki/topics/Page.md" : "wiki/topics/a.md";
	const newName = crashBoundary ? "page.md" : "renamed.md";
	const preview = await service.previewGraphRename(kbPath, sourcePath, newName);
	await writeFile(metadataPath, JSON.stringify(preview), "utf8");
	await service.applyGraphRename(kbPath, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: newName, preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
}
