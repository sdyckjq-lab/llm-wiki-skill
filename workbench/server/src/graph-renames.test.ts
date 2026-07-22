import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGraphRenameService } from "./graph-renames.js";

async function makeKnowledgeBase() {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-renames-"));
	await mkdir(path.join(root, "wiki", "topics"), { recursive: true });
	await writeFile(path.join(root, ".wiki-schema.md"), "schema\n");
	await writeFile(path.join(root, "wiki", "topics", "a.md"), "# A\n\n[[wiki/topics/a.md]]\n");
	return root;
}

test("preview is read-only and apply renames the page with one rebuild request", async () => {
	const kb = await makeKnowledgeBase();
	try {
		let rebuilds = 0;
		const service = createGraphRenameService({ triggerRebuild: () => { rebuilds += 1; return { ok: true, status: "started" }; } });
		const before = await readFile(path.join(kb, "wiki", "topics", "a.md"));
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		assert.equal(preview.target_path, "wiki/topics/renamed.md");
		assert.deepEqual(await readFile(path.join(kb, "wiki", "topics", "a.md")), before);
		const result = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal(result.outcome, "operation");
		assert.equal((result as any).operation.state, "committed");
		assert.equal(rebuilds, 1);
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "renamed.md"), "utf8"), "# A\n\n[[wiki/topics/renamed.md]]\n");
		assert.deepEqual(await readdir(path.join(kb, "wiki", "topics")), ["renamed.md"]);
		const retry = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal(retry.outcome, "operation"); assert.equal(rebuilds, 1);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("a commit-boundary failure rolls back already written markdown", async () => {
	const kb = await makeKnowledgeBase();
	try {
		await writeFile(path.join(kb, "wiki", "topics", "b.md"), "[[wiki/topics/a.md]]\n");
		const originalA = await readFile(path.join(kb, "wiki", "topics", "a.md"));
		const service = createGraphRenameService({ beforeFileCommit: (relative) => { if (relative === "wiki/topics/b.md") throw new Error("injected commit failure"); }, triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		const result = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal(result.outcome, "operation");
		assert.equal((result as any).operation.state, "rolled_back");
		assert.deepEqual(await readFile(path.join(kb, "wiki", "topics", "a.md")), originalA);
		assert.deepEqual(await readdir(path.join(kb, "wiki", "topics")), ["a.md", "b.md"]);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("changing a scanned file invalidates the complete preview before any write", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const service = createGraphRenameService();
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		await writeFile(path.join(kb, "wiki", "topics", "a.md"), "externally changed\n");
		const result = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.deepEqual(result, { outcome: "preview_stale", operation_id: preview.operation_id, reason: "preview_changed" });
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "a.md"), "utf8"), "externally changed\n");
		assert.deepEqual(await readdir(path.join(kb, ".wiki-tmp")).catch(() => [] as string[]), []);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("startup recovery exposes a committed operation whose graph is not published", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		const recovery = await service.getGraphRenameRecovery(kb);
		assert.equal(recovery.status, "rebuild_required");
	} finally { await rm(kb, { recursive: true, force: true }); }
});
