import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGraphRenameService } from "./graph-renames.js";
import { GraphRenameJournalStore } from "./graph-rename-journal.js";
import { publishGraphRebuildResult } from "./graph.js";

async function makeKnowledgeBase() {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-renames-"));
	await mkdir(path.join(root, "wiki", "topics"), { recursive: true });
	await writeFile(path.join(root, ".wiki-schema.md"), "schema\n");
	await writeFile(path.join(root, "wiki", "topics", "a.md"), "# A\n\n[[wiki/topics/a.md]]\n");
	return root;
}

function observedConflicts(result: unknown): Array<{ source_path: string; current_state: "present"; current_sha256: string } | { source_path: string; current_state: "missing" }> {
	return ((result as any).operation.conflicts as Array<{ source_path: string; current_state: "present" | "missing"; current_sha256?: string }>).map((conflict) => conflict.current_state === "present"
		? { source_path: conflict.source_path, current_state: "present", current_sha256: conflict.current_sha256! }
		: { source_path: conflict.source_path, current_state: "missing" });
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
		const uppercaseSuffixRetry = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.MD", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal(uppercaseSuffixRetry.outcome, "operation"); assert.equal(rebuilds, 1);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("a fresh knowledge base without temporary operation directories has clear recovery", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const service = createGraphRenameService();
		assert.deepEqual(await service.getGraphRenameRecovery(kb), {
			status: "clear",
			retained_evidence_receipts: [],
		});
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
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

test("a source page without rewritten links is backed up and a late external edit becomes a conflict", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const sourcePath = path.join(kb, "wiki", "topics", "a.md");
		const original = Buffer.from("# A without links\n");
		await writeFile(sourcePath, original);
		const service = createGraphRenameService({
			beforeSourceRename: async () => { await writeFile(sourcePath, "external after preparation\n"); },
			triggerRebuild: () => ({ ok: true, status: "started" }),
		});
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		assert.equal(preview.editable_files.length, 0);
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
		assert.equal((result as any).operation.state, "conflicted");
		assert.equal(await readFile(sourcePath, "utf8"), "external after preparation\n");
		await assert.rejects(readFile(path.join(kb, "wiki", "topics", "renamed.md")));
		const record = await new GraphRenameJournalStore(kb).read(preview.operation_id) as any;
		const originalHash = createHash("sha256").update(original).digest("hex");
		assert.equal(record.original_hashes[preview.source_path], originalHash);
		assert.equal(record.intended_hashes[preview.source_path], originalHash);
		assert.ok(record.backup_paths[preview.source_path]);
		assert.ok(record.intended_paths[preview.source_path]);
		assert.deepEqual(record.conflicts[0].preserved_variants.map((variant: any) => variant.kind).sort(), ["current", "intended", "original"]);
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

test("prepared failure removes operation-owned files created before manifest update", async () => {
	const kb = await makeKnowledgeBase();
	try {
		const store = new GraphRenameJournalStore(kb);
		const writeOwnedFile = store.writeOwnedFile.bind(store);
		store.writeOwnedFile = async (relativePath, bytes, mode) => {
			if (relativePath.includes("/intended/")) throw new Error("injected intended write failure");
			return writeOwnedFile(relativePath, bytes, mode);
		};
		const service = createGraphRenameService({ journalStore: () => store });
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		await assert.rejects(service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true }));
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

test("startup recovery prunes expired retained evidence before exposing receipts", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "abababab-abab-4aba-8aba-abababababab";
	const now = new Date("2026-07-22T00:00:00.000Z");
	try {
		const store = new GraphRenameJournalStore(kb, { now: () => now });
		const digest = "a".repeat(64);
		const evidenceBytes = Buffer.from("external\n");
		const evidenceDigest = createHash("sha256").update(evidenceBytes).digest("hex");
		await store.acquire({ operationId, immutableDigest: digest, sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "rolled_back", { graphRebuild: "succeeded" });
		const evidencePath = await store.preserveConflictVariant({ operationId, kind: "current", sourcePath: "wiki/topics/a.md", bytes: evidenceBytes });
		await store.compactTerminal({ operationId, now, resolvedConflictEvidence: [{ relative_path: evidencePath, sha256: evidenceDigest, expires_at: "2026-07-21T00:00:00.000Z" }] });
		await store.release(operationId);
		const service = createGraphRenameService({ now: () => now, journalStore: () => store });
		await service.recoverGraphRenameOperations(kb);
		await assert.rejects(readFile(path.join(kb, ...evidencePath.split("/"))));
		const receipt = await store.read(operationId) as any;
		assert.deepEqual(receipt.retained_evidence, []);
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

test("startup recovery restores the old source name even when content stayed original", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "12121212-1212-4121-8121-121212121212";
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		const unchanged = path.join(kb, "wiki", "topics", "unchanged.md");
		await writeFile(unchanged, "unchanged\n");
		await rename(source, target);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		const unchangedBytes = Buffer.from("unchanged\n");
		const intendedUnchanged = Buffer.from("intended unchanged\n");
		const unchangedHash = createHash("sha256").update(unchangedBytes).digest("hex");
		const intendedHash = createHash("sha256").update(intendedUnchanged).digest("hex");
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/unchanged.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/unchanged.bin`;
		await store.writePrepared({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/unchanged.md": unchangedHash }, intendedHashes: { "wiki/topics/unchanged.md": intendedHash } });
		await store.writeOwnedFile(backupPath, unchangedBytes);
		await store.writeOwnedFile(intendedPath, intendedUnchanged);
		await store.writePrepared({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/unchanged.md": unchangedHash }, intendedHashes: { "wiki/topics/unchanged.md": intendedHash }, backupPaths: { "wiki/topics/unchanged.md": backupPath }, intendedPaths: { "wiki/topics/unchanged.md": intendedPath } });
		await store.transition(operationId, "applying", { renameState: "target" });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const result = await service.recoverGraphRenameOperations(kb);
		assert.equal(result.needsRebuild, false);
		assert.equal(await readFile(source, "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
		await assert.rejects(readFile(target, "utf8"));
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("startup recovery keeps an external target conflict when source content is still original", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "13131313-1313-4131-8131-131313131313";
	const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		const original = await readFile(source);
		const intended = Buffer.from("intended after link rewrite\n");
		await writeFile(target, "external target\n");
		const store = new GraphRenameJournalStore(kb);
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/source.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/source.bin`;
		await store.acquire({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": sha(original) }, intendedHashes: { "wiki/topics/a.md": sha(intended) } });
		await store.writeOwnedFile(backupPath, original);
		await store.writeOwnedFile(intendedPath, intended);
		await store.writePrepared({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": sha(original) }, intendedHashes: { "wiki/topics/a.md": sha(intended) }, backupPaths: { "wiki/topics/a.md": backupPath }, intendedPaths: { "wiki/topics/a.md": intendedPath } });
		await store.transition(operationId, "applying", {});
		await store.release(operationId);
		const service = createGraphRenameService();
		assert.deepEqual(await service.recoverGraphRenameOperations(kb), { needsRebuild: false });
		const recovery = await service.getGraphRenameRecovery(kb);
		assert.equal(recovery.status, "required");
		assert.equal(await readFile(source, "utf8"), original.toString("utf8"));
		assert.equal(await readFile(target, "utf8"), "external target\n");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("startup recovery stops when the intended source changes after content inspection", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "efefefef-efef-4efe-8efe-efefefefefef";
	const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const original = await readFile(source);
		const intended = Buffer.from("intended-source\n");
		await writeFile(source, intended);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": sha(original) }, intendedHashes: { "wiki/topics/a.md": sha(intended) } });
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/source.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/source.bin`;
		await store.writeOwnedFile(backupPath, original);
		await store.writeOwnedFile(intendedPath, intended);
		await store.writePrepared({ operationId, immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": sha(original) }, intendedHashes: { "wiki/topics/a.md": sha(intended) }, backupPaths: { "wiki/topics/a.md": backupPath }, intendedPaths: { "wiki/topics/a.md": intendedPath } });
		await store.transition(operationId, "applying", {});
		await store.release(operationId);
		const service = createGraphRenameService({
			afterStartupContentInspect: async () => { await writeFile(source, "late-startup-external\n"); },
		});
		await service.recoverGraphRenameOperations(kb);
		const recovery = await service.getGraphRenameRecovery(kb);
		assert.equal(recovery.status, "required");
		assert.equal(await readFile(source, "utf8"), "late-startup-external\n");
		await assert.rejects(readFile(path.join(kb, "wiki", "topics", "renamed.md"), "utf8"));
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
		const intendedRelative = `.wiki-tmp/rename-ops/${operationId}/intended/a.bin`;
		const intended = Buffer.from("intended\n");
		await store.acquire({ operationId, immutableDigest: digest, sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writeOwnedFile(backupRelative, original);
		await store.writeOwnedFile(intendedRelative, intended);
		await store.writePrepared({ operationId, immutableDigest: digest, sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": createHash("sha256").update(original).digest("hex") }, intendedHashes: { "wiki/topics/a.md": createHash("sha256").update(intended).digest("hex") }, backupPaths: { "wiki/topics/a.md": backupRelative }, intendedPaths: { "wiki/topics/a.md": intendedRelative } });
		await store.transition(operationId, "applying", {}); await store.transition(operationId, "conflicted", { conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "2".repeat(64), preserved_variants: [] }] }); await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const stale = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "3".repeat(64) }] });
		assert.equal(stale.status, "required"); assert.deepEqual(await readFile(source), changed);
		const currentObserved = observedConflicts(stale);
		const duplicate = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [currentObserved[0]!, currentObserved[0]!] });
		assert.equal(duplicate.status, "required");
		assert.deepEqual(observedConflicts(duplicate), currentObserved);
		assert.deepEqual(await readFile(source), changed);
		const finished = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: observedConflicts(stale) });
		assert.equal(finished.status, "rebuild_required"); assert.equal((finished as any).operation.state, "rolled_back"); assert.deepEqual(await readFile(source), original);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("recovery retains current and unchosen original evidence before finishing commit", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
	const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const original = await readFile(source);
		const current = Buffer.from("external-current\n");
		const intended = Buffer.from("intended-new\n");
		await writeFile(source, current);
		const store = new GraphRenameJournalStore(kb);
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/a.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/a.bin`;
		await store.acquire({ operationId, immutableDigest: "d".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writeOwnedFile(backupPath, original);
		await store.writeOwnedFile(intendedPath, intended);
		await store.writePrepared({ operationId, immutableDigest: "d".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": sha(original) }, intendedHashes: { "wiki/topics/a.md": sha(intended) }, backupPaths: { "wiki/topics/a.md": backupPath }, intendedPaths: { "wiki/topics/a.md": intendedPath } });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "conflicted", { conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: sha(current), preserved_variants: [] }] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: [] });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: observedConflicts(refreshed) });
		assert.equal(result.status, "rebuild_required");
		const evidence = (result as any).operation.retained_evidence as Array<{ relative_path: string; sha256: string }>;
		assert.equal(evidence.length, 2);
		const evidenceBytes = await Promise.all(evidence.map((item) => readFile(path.join(kb, ...item.relative_path.split("/")))));
		assert.deepEqual(evidenceBytes.map((bytes) => bytes.toString()).sort(), [original.toString(), current.toString()].sort());
		assert.deepEqual(await readFile(path.join(kb, "wiki", "topics", "renamed.md")), intended);
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
		const secondBackup = Buffer.from("second-original\n");
		const firstIntended = Buffer.from("first-intended\n");
		const secondIntended = Buffer.from("second-intended\n");
		const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
		await writeFile(first, "first-external\n");
		await writeFile(second, secondOriginal);
		const firstStage = `wiki/topics/.a.md.${operationId}.0.11111111-1111-4111-8111-111111111111.stage`;
		const secondStage = `wiki/topics/.b.md.${operationId}.0.22222222-2222-4222-8222-222222222222.stage`;
		await writeFile(path.join(kb, ...firstStage.split("/")), firstIntended);
		await writeFile(path.join(kb, ...secondStage.split("/")), secondIntended);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		const firstBackup = `.wiki-tmp/rename-ops/${operationId}/backups/first.bak`;
		const secondBackupPath = `.wiki-tmp/rename-ops/${operationId}/backups/second.bak`;
		const firstIntendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/first.bin`;
		const secondIntendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/second.bin`;
		await store.writeOwnedFile(firstBackup, firstOriginal);
		await store.writeOwnedFile(secondBackupPath, secondBackup);
		await store.writeOwnedFile(firstIntendedPath, firstIntended);
		await store.writeOwnedFile(secondIntendedPath, secondIntended);
		await store.writePrepared({
			operationId,
			immutableDigest: "a".repeat(64),
			sourcePath: "wiki/topics/a.md",
			targetPath: "wiki/topics/renamed.md",
			originalHashes: { "wiki/topics/a.md": sha(firstOriginal), "wiki/topics/b.md": sha(secondBackup) },
			intendedHashes: { "wiki/topics/a.md": sha(firstIntended), "wiki/topics/b.md": sha(secondIntended) },
			backupPaths: {
				"wiki/topics/a.md": firstBackup,
				"wiki/topics/b.md": secondBackupPath,
			},
			intendedPaths: {
				"wiki/topics/a.md": firstIntendedPath,
				"wiki/topics/b.md": secondIntendedPath,
			},
			stagePaths: {
				"wiki/topics/a.md": firstStage,
				"wiki/topics/b.md": secondStage,
			},
		});
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
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: [] });
		const result = await service.resolveGraphRenameRecovery(kb, {
			operation_id: operationId,
			action: "finish_commit",
			observed_conflicts: observedConflicts(refreshed),
		});
		assert.equal(result.status, "required");
		assert.equal(await readFile(first, "utf8"), "first-external\n");
		assert.equal(await readFile(second, "utf8"), "changed-after-preview\n");
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("recovery deletion preserves a file changed after its final check", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "dededede-dede-4ded-8ded-dededededede";
	const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const current = await readFile(source);
		await writeFile(source, current);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "d".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/source.bin`;
		await store.writeOwnedFile(intendedPath, current);
		await store.writePrepared({ operationId, immutableDigest: "d".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", originalHashes: { "wiki/topics/a.md": null }, intendedHashes: { "wiki/topics/a.md": sha(current) }, intendedPaths: { "wiki/topics/a.md": intendedPath } });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "conflicted", { conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: sha(current), preserved_variants: [] }] });
		await store.release(operationId);
		const service = createGraphRenameService({
			afterRecoveryCheck: async () => { await writeFile(source, "late-external\n"); },
			triggerRebuild: () => ({ ok: true, status: "started" }),
		});
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: observedConflicts(refreshed) });
		assert.equal(result.status, "required");
		assert.equal(await readFile(source, "utf8"), "late-external\n");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("recovery uses the same knowledge-base lock as apply", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "77777777-7777-4777-8777-777777777777";
	try {
		const owner = new GraphRenameJournalStore(kb, { serverInstanceId: "owner", isProcessAlive: () => true });
		await owner.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await owner.writePrepared({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
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
		await store.writePrepared({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", transitPath: `wiki/topics/.llm-wiki-rename-${operationId}-0.md` });
		await store.transition(operationId, "applying", { renameState: "target" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: observedConflicts(refreshed) });
		assert.equal(result.status, "rebuild_required");
		assert.equal(await readFile(source, "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
		await assert.rejects(readFile(target, "utf8"));
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("finish rollback preserves a source file created after the rollback check", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "abababab-abab-4aba-8aba-abababababab";
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		await rename(source, target);
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "b".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "b".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", { renameState: "target" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({
			beforeSourceRollback: async () => { await writeFile(source, "external-source\n"); },
			triggerRebuild: () => ({ ok: true, status: "started" }),
		});
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: observedConflicts(refreshed) });
		assert.equal(result.status, "required");
		assert.equal(await readFile(source, "utf8"), "external-source\n");
		assert.equal(await readFile(target, "utf8"), "# A\n\n[[wiki/topics/a.md]]\n");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("finish rollback reports every old transit and target name conflict", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
	try {
		const source = path.join(kb, "wiki", "topics", "a.md");
		const target = path.join(kb, "wiki", "topics", "renamed.md");
		const transit = path.join(kb, "wiki", "topics", `.llm-wiki-rename-${operationId}-0.md`);
		await rm(source);
		await writeFile(target, "target-current\n");
		await writeFile(transit, "transit-current\n");
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "c".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "c".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md", transitPath: `wiki/topics/.llm-wiki-rename-${operationId}-0.md` });
		await store.transition(operationId, "applying", { renameState: "target" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		assert.equal(result.status, "required");
		const conflicts = (result as any).operation.conflicts as Array<{ source_path: string; current_state: string }>;
		assert.deepEqual(conflicts.map((conflict) => `${conflict.source_path}:${conflict.current_state}`).sort(), [
			`wiki/topics/.llm-wiki-rename-${operationId}-0.md:present`,
			"wiki/topics/a.md:missing",
			"wiki/topics/renamed.md:present",
		]);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("finish commit reports an occupied target name as a source conflict", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "34343434-3434-4434-8434-343434343434";
	try {
		await writeFile(path.join(kb, "wiki", "topics", "renamed.md"), "external-target\n");
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "3".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "3".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", { renameState: "old" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: [] });
		assert.equal(result.status, "required");
		const conflicts = (result as any).operation.conflicts as Array<{ source_path: string; current_state: string; current_sha256?: string }>;
		assert.equal(conflicts.some((conflict) => conflict.source_path === "wiki/topics/renamed.md" && conflict.current_state === "present" && conflict.current_sha256), true);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("a complete source-name conflict set can finish commit and the retry is idempotent", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "45454545-4545-4545-8545-454545454545";
	const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
	try {
		const sourceRelative = "wiki/topics/a.md";
		const targetRelative = "wiki/topics/renamed.md";
		const transitRelative = `wiki/topics/.llm-wiki-rename-${operationId}-0.md`;
		const source = path.join(kb, ...sourceRelative.split("/"));
		const target = path.join(kb, ...targetRelative.split("/"));
		const transit = path.join(kb, ...transitRelative.split("/"));
		const original = await readFile(source);
		const intended = Buffer.from("intended source bytes\n");
		const externalTarget = Buffer.from("external target bytes\n");
		await rename(source, transit);
		await writeFile(transit, intended);
		await writeFile(target, externalTarget);
		const store = new GraphRenameJournalStore(kb);
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/source.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${operationId}/intended/source.bin`;
		await store.acquire({ operationId, immutableDigest: "4".repeat(64), sourcePath: sourceRelative, targetPath: targetRelative });
		await store.writePrepared({
			operationId,
			immutableDigest: "4".repeat(64),
			sourcePath: sourceRelative,
			targetPath: targetRelative,
			transitPath: transitRelative,
			originalHashes: { [sourceRelative]: sha(original) },
			intendedHashes: { [sourceRelative]: sha(intended) },
		});
		await store.writeOwnedFile(backupPath, original);
		await store.writeOwnedFile(intendedPath, intended);
		await store.writePrepared({
			operationId,
			immutableDigest: "4".repeat(64),
			sourcePath: sourceRelative,
			targetPath: targetRelative,
			transitPath: transitRelative,
			originalHashes: { [sourceRelative]: sha(original) },
			intendedHashes: { [sourceRelative]: sha(intended) },
			backupPaths: { [sourceRelative]: backupPath },
			intendedPaths: { [sourceRelative]: intendedPath },
		});
		await store.transition(operationId, "applying", { renameState: "transit" });
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const refreshed = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: [] });
		assert.equal(refreshed.status, "required");
		const observed = observedConflicts(refreshed);
		assert.deepEqual(observed.map((item: any) => `${item.source_path}:${item.current_state}`).sort(), [
			`${sourceRelative}:missing`,
			`${targetRelative}:present`,
			`${transitRelative}:present`,
		].sort());
		const finished = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: observed });
		assert.equal(finished.status, "rebuild_required");
		assert.equal((finished as any).operation.state, "committed");
		assert.deepEqual(await readFile(target), intended);
		await assert.rejects(readFile(source));
		await assert.rejects(readFile(transit));
		const retry = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: observed });
		assert.deepEqual(retry, finished);
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("recovery blocks when any source-name path is a directory", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "46464646-4646-4646-8646-464646464646";
	try {
		await mkdir(path.join(kb, "wiki", "topics", "renamed.md"));
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "6".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "6".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const service = createGraphRenameService();
		const result = await service.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_commit", observed_conflicts: [] });
		assert.deepEqual(result, { status: "blocked", reason: "unsafe_current_type", operation_id: operationId, retained_evidence_receipts: [] });
	} finally {
		await rm(kb, { recursive: true, force: true });
	}
});

test("failed graph rebuild remains visible and can be retried", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "edededed-eded-4ede-8ede-edededededed";
	try {
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "conflicted", { conflicts: [] });
		await store.release(operationId);
		const failed = createGraphRenameService({ triggerRebuild: () => { throw new Error("rebuild failed"); } });
		const refreshed = await failed.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: [] });
		const result = await failed.resolveGraphRenameRecovery(kb, { operation_id: operationId, action: "finish_rollback", observed_conflicts: observedConflicts(refreshed) });
		assert.equal(result.status, "rebuild_required");
		assert.equal((result as any).operation.graph_rebuild, "failed");
		const retried = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		assert.deepEqual(await retried.triggerPendingGraphRebuild?.(kb), { status: "started" });
		assert.equal((await store.read(operationId) as any).state, "rolled_back");
		assert.equal((await store.read(operationId) as any).graph_rebuild, "started");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("published rollback keeps rolled_back state while marking graph publication", async () => {
	const kb = await makeKnowledgeBase();
	const operationId = "56565656-5656-4565-8565-565656565656";
	const fixedNow = new Date("2031-04-05T06:07:08.000Z");
	try {
		await mkdir(path.join(kb, "wiki"), { recursive: true });
		const graph = {
			meta: { build_date: "2026-07-22T00:00:00.000Z", wiki_title: "Test", total_nodes: 1, total_edges: 0 },
			nodes: [{ id: "wiki/topics/a.md", source_path: "wiki/topics/a.md", label: "A", type: "topic" }],
			edges: [],
		};
		await writeFile(path.join(kb, "wiki", "graph-data.json"), JSON.stringify(graph));
		const store = new GraphRenameJournalStore(kb, { now: () => fixedNow });
		await store.acquire({ operationId, immutableDigest: "5".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.writePrepared({ operationId, immutableDigest: "5".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/renamed.md" });
		await store.transition(operationId, "applying", {});
		await store.transition(operationId, "rolled_back", { graphRebuild: "started" });
		await store.release(operationId);
		const service = createGraphRenameService({ journalStore: () => store, now: () => fixedNow });
		await service.getGraphRenameRecovery(kb);
		await publishGraphRebuildResult({
			kbPath: kb,
			previous: null,
			next: graph,
			rebuiltAt: "2026-07-22T00:00:01.000Z",
			warningState: { summary: null, details_status: "unavailable", details_unavailable_reason: "legacy_without_summary", engine_groups: [] },
		});
		await service.recoverGraphRenameOperations(kb);
		const record = await store.read(operationId) as any;
		assert.equal(record.state, "rolled_back");
		assert.equal(record.graph_rebuild, "succeeded");
		assert.equal(record.updated_at, fixedNow.toISOString());
	} finally { await rm(kb, { recursive: true, force: true }); }
});
