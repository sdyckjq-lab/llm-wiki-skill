import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGraphRenameService } from "./graph-renames.js";
import { GraphRenameJournalStore } from "./graph-rename-journal.js";

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

test("recovery requires the complete fresh conflict set before restoring original bytes", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const original = await readFile(source);
		const changed = Buffer.from("external\n"); await writeFile(source, changed);
		const store = new GraphRenameJournalStore(kb);
		const operationId = "55555555-5555-4555-8555-555555555555";
		const digest = "f".repeat(64);
		const backupRelative = `.wiki-tmp/rename-ops/${operationId}/backups/a.bak`;
		await mkdir(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "backups"), { recursive: true });
		await writeFile(path.join(kb, ...backupRelative.split("/")), original);
		await store.acquire({ operationId, immutableDigest: digest, sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: digest, sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": "0".repeat(64) }, intendedHashes: { "wiki/topics/a.md": "1".repeat(64) }, backupPaths: { "wiki/topics/a.md": backupRelative } });
		await store.transition(operationId, "applying", {}); await store.transition(operationId, "conflicted", { conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "2".repeat(64), preserved_variants: [] }] }); await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const stale = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "3".repeat(64) }] });
		assert.equal(stale.status, "required"); assert.deepEqual(await readFile(source), changed);
		const currentHash = (await import("node:crypto")).createHash("sha256").update(changed).digest("hex");
		const finished = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: currentHash }] });
		assert.equal(finished.status, "clear"); assert.deepEqual(await readFile(source), original);
	} finally { await rm(kb, { recursive: true, force: true }); }
});
