import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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

test("rename rewrites a deterministic bare link to the canonical full page path", async () => {
	const kb = await makeKnowledgeBase();
	try {
		await writeFile(path.join(kb, "wiki", "topics", "a.md"), "# A\n");
		await writeFile(path.join(kb, "wiki", "topics", "b.md"), "[[a]]\n");
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		const result = await service.applyGraphRename(kb, {
			operation_id: preview.operation_id,
			expires_at: preview.expires_at,
			source_path: preview.source_path,
			new_name: "renamed.md",
			preview_digest: preview.preview_digest,
			resolutions: [],
			confirmed: true,
		});
		assert.equal(result.outcome, "operation");
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "b.md"), "utf8"), "[[wiki/topics/renamed.md]]\n");
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("the same operation ID rejects a retry with different ambiguity resolutions", async () => {
	const kb = await makeKnowledgeBase();
	try {
		await mkdir(path.join(kb, "wiki", "entities"), { recursive: true });
		await writeFile(path.join(kb, "wiki", "entities", "a.md"), "# Entity A\n");
		await writeFile(path.join(kb, "wiki", "topics", "b.md"), "[[a]]\n");
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		assert.equal(preview.ambiguous_choices.length, 1);
		const choices = preview.ambiguous_choices[0]!.candidates;
		const first = await service.applyGraphRename(kb, {
			operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest,
			resolutions: [{ occurrence_id: preview.ambiguous_choices[0]!.occurrence_id, target_path: choices[0]!.target_path }], confirmed: true,
		});
		assert.equal(first.outcome, "operation");
		const manifest = JSON.parse(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", preview.operation_id, "manifest.json"), "utf8")) as { resolution_digest?: string };
		assert.match(manifest.resolution_digest ?? "", /^[a-f0-9]{64}$/);
		await assert.rejects(service.applyGraphRename(kb, {
			operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest,
			resolutions: [{ occurrence_id: preview.ambiguous_choices[0]!.occurrence_id, target_path: choices[1]!.target_path }], confirmed: true,
		}), (error: any) => error.code === "CONFLICT");
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

test("a failure after source rename restores the old name and removes transit", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const service = createGraphRenameService({ afterSourceRename: () => { throw new Error("injected source failure"); }, triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		const result = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal(result.outcome, "operation");
		assert.equal((result as any).operation.state, "rolled_back");
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "a.md"), "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
		assert.deepEqual(await readdir(path.join(kb, "wiki", "topics")), ["a.md"]);
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

test("an apply cannot extend a server-issued preview beyond its bounded lifetime", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const now = new Date("2026-08-01T00:00:00.000Z");
		const service = createGraphRenameService({ now: () => now, triggerRebuild: () => ({ ok: true, status: "started" }) });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		const result = await service.applyGraphRename(kb, {
			operation_id: preview.operation_id,
			expires_at: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString(),
			source_path: preview.source_path,
			new_name: "renamed.md",
			preview_digest: preview.preview_digest,
			resolutions: [],
			confirmed: true,
		});
		assert.deepEqual(result, { outcome: "preview_stale", operation_id: preview.operation_id, reason: "preview_expired" });
		assert.deepEqual(await readdir(path.join(kb, ".wiki-tmp")).catch(() => [] as string[]), []);
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
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

test("startup recovery accepts a target rename recorded immediately before commit", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "88888888-8888-4888-8888-888888888888";
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "8".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "8".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", { renameState: "target" });
		await rename(source, target);
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const recovered = await service.recoverGraphRenameOperations(kb);
		assert.equal(recovered.needsRebuild, true);
		assert.equal((await store.read(operationId) as any).state, "committed");
		assert.equal(await readFile(target, "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
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
		assert.equal(finished.status, "rebuild_required"); assert.equal((finished as any).operation.state, "rolled_back"); assert.deepEqual(await readFile(source), original);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("recovery rolls back its own earlier writes when a later file changes", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "66666666-6666-4666-8666-666666666666";
	try {
		const first = path.join(kb, "wiki", "topics", "a.md");
		const second = path.join(kb, "wiki", "topics", "b.md");
		const firstOriginal = Buffer.from("first-original\n");
		const secondOriginal = Buffer.from("second-external\n");
		await writeFile(first, "first-external\n");
		await writeFile(second, secondOriginal);
		await mkdir(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "backups"), { recursive: true });
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "backups", "first.bak"), firstOriginal);
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "backups", "second.bak"), Buffer.from("second-original\n"));
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({
			operationId,
			immutableDigest: "a".repeat(64),
			sourcePath: "wiki/topics/a.md",
			targetPath: "wiki/topics/renamed.md",
			originalHashes: { "wiki/topics/a.md": "b".repeat(64), "wiki/topics/b.md": "c".repeat(64) },
			intendedHashes: { "wiki/topics/a.md": "d".repeat(64), "wiki/topics/b.md": "e".repeat(64) },
			backupPaths: {
				"wiki/topics/a.md": `.wiki-tmp/rename-ops/${operationId}/backups/first.bak`,
				"wiki/topics/b.md": `.wiki-tmp/rename-ops/${operationId}/backups/second.bak`,
			},
			stagePaths: {
				"wiki/topics/a.md": `.wiki-tmp/rename-ops/${operationId}/intended-first`,
				"wiki/topics/b.md": `.wiki-tmp/rename-ops/${operationId}/intended-second`,
			},
		});
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "intended-first"), Buffer.from("first-intended\n"));
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "intended-second"), Buffer.from("second-intended\n"));
		await store.transition(operationId, "applying", {});
		const firstHash = (await import("node:crypto")).createHash("sha256").update(await readFile(first)).digest("hex");
		const secondHash = (await import("node:crypto")).createHash("sha256").update(await readFile(second)).digest("hex");
		await store.transition(operationId, "conflicted", {
			conflicts: [
				{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: firstHash, preserved_variants: [] },
				{ source_path: "wiki/topics/b.md", current_state: "present", current_sha256: secondHash, preserved_variants: [] },
			],
		});
		await store.release(operationId);
		let wroteFirst = false;
		const service = createGraphRenameService({
			triggerRebuild: () => ({ ok: true, status: "started" }),
			afterRecoveryCommit: async (relativePath) => {
				if (!wroteFirst && relativePath === "wiki/topics/a.md") {
					wroteFirst = true;
					await writeFile(second, "changed-after-preview\n");
				}
			},
		});
		const currentFirstHash = (await import("node:crypto")).createHash("sha256").update(await readFile(first)).digest("hex");
		const currentSecondHash = (await import("node:crypto")).createHash("sha256").update(await readFile(second)).digest("hex");
		const result = await service.resolveGraphRenameRecovery(kb, {
			operation_id: operationId,
			action: "finish_commit",
			observed_conflicts: [
				{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: currentFirstHash },
				{ source_path: "wiki/topics/b.md", current_state: "present", current_sha256: currentSecondHash },
			],
		});
		assert.equal(result.status, "required");
		assert.equal(await readFile(first, "utf8"), "first-external\n");
		assert.equal(await readFile(second, "utf8"), "changed-after-preview\n");
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("recovery uses the same knowledge-base lock as apply", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "77777777-7777-4777-8777-777777777777";
	try {
		const owner = new GraphRenameJournalStore(kb, { serverInstanceId: "owner", isProcessAlive: () => true });
		await owner.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await owner.writePrepared({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": "b".repeat(64) }, intendedHashes: { "wiki/topics/a.md": "c".repeat(64) } });
		await owner.transition(operationId, "applying", {});
		await owner.transition(operationId, "conflicted", { conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "d".repeat(64), preserved_variants: [] }] });
		const service = createGraphRenameService({
			journalStore: () => new GraphRenameJournalStore(kb, { serverInstanceId: "recovery", isProcessAlive: () => true }),
		});
		await assert.rejects(service.resolveGraphRenameRecovery(kb, {
			operation_id: operationId,
			action: "finish_rollback",
			observed_conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "e".repeat(64) }],
		}), (error: any) => error.code === "BUSY");
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("finish rollback restores the source name after a target rename crash", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "99999999-9999-4999-8999-999999999999";
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		await rename(source, target);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", transitPath: "wiki/topics/.llm-wiki-rename-crash.md" });
		await store.transition(operationId, "applying", { renameState: "target" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		assert.equal(result.status, "rebuild_required");
		assert.equal(await readFile(source, "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
		await assert.rejects(readFile(target, "utf8"));
	} finally { await rm(kb, { recursive: true, force: true }); }
});
