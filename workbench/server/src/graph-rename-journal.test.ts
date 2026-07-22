import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GraphRenameJournalStore } from "./graph-rename-journal.js";

test("rename journal creates one lock and durable state transitions", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-"));
	try {
		const store = new GraphRenameJournalStore(kb, { isProcessAlive: () => true });
		const first = await store.acquire({ operationId: "11111111-1111-4111-8111-111111111111", immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		assert.equal(first.state, "prepared");
		await assert.rejects(store.acquire({ operationId: "22222222-2222-4222-8222-222222222222", immutableDigest: "b".repeat(64), sourcePath: "wiki/topics/c.md", targetPath: "wiki/topics/d.md" }), (error: any) => error.code === "BUSY");
		const original = Buffer.from("original\n");
		const intended = Buffer.from("intended\n");
		const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
		const backupPath = `.wiki-tmp/rename-ops/${first.operation_id}/backups/source.bak`;
		const intendedPath = `.wiki-tmp/rename-ops/${first.operation_id}/intended/source.bin`;
		await store.writePrepared({ operationId: first.operation_id, immutableDigest: first.immutable_digest, sourcePath: first.source_path, targetPath: first.target_path, originalHashes: { "wiki/topics/a.md": hash(original) }, intendedHashes: { "wiki/topics/a.md": hash(intended) } });
		await store.writeOwnedFile(backupPath, original);
		await store.writeOwnedFile(intendedPath, intended);
		await store.writePrepared({ operationId: first.operation_id, immutableDigest: first.immutable_digest, sourcePath: first.source_path, targetPath: first.target_path, originalHashes: { "wiki/topics/a.md": hash(original) }, intendedHashes: { "wiki/topics/a.md": hash(intended) }, backupPaths: { "wiki/topics/a.md": backupPath }, intendedPaths: { "wiki/topics/a.md": intendedPath } });
		await store.transition(first.operation_id, "applying", {});
		await store.transition(first.operation_id, "committed", { renameState: "target", graphRebuild: "succeeded" });
		const receipt = await store.compactTerminal({ operationId: first.operation_id, now: new Date("2026-08-01T00:00:00.000Z") });
		assert.equal(receipt.kind, "receipt");
		assert.equal((await store.read(first.operation_id))?.kind, "receipt");
		await store.release(first.operation_id);
		assert.equal(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", first.operation_id, "manifest.json"), "utf8").then((value) => value.includes("original_hashes")), false);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("malformed journal is reported as blocked and is never guessed", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-invalid-"));
	try {
		const operation = "33333333-3333-4333-8333-333333333333";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operation);
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "manifest.json"), "{not-json", "utf8");
		const record = await new GraphRenameJournalStore(kb).read(operation);
		assert.deepEqual(record, { kind: "blocked", operation_id: operation, reason: "invalid_journal" });
		assert.equal(await readFile(path.join(dir, "manifest.json"), "utf8"), "{not-json");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal validation blocks missing fields, unknown states and mismatched hash sets", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-shape-"));
	try {
		const operation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operation);
		await mkdir(dir, { recursive: true });
		const base = {
			kind: "journal", operation_id: operation, immutable_digest: "a".repeat(64), state: "applying",
			source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", graph_rebuild: "not_started",
			created_at: "2026-07-22T00:00:00.000Z", updated_at: "2026-07-22T00:00:00.000Z", rename_state: "old",
			completed_steps: [], original_hashes: { "wiki/topics/a.md": "b".repeat(64) }, intended_hashes: { "wiki/topics/a.md": "c".repeat(64) },
			intended_paths: {}, stage_paths: {}, backup_paths: {}, conflicts: [], retained_evidence: [],
		};
		for (const [, value] of [
			["missing-durable-variants", base],
			["missing-completed-steps", { ...base, completed_steps: undefined }],
			["unknown-rebuild-state", { ...base, graph_rebuild: "later" }],
			["mismatched-hash-sets", { ...base, intended_hashes: { "wiki/topics/other.md": "c".repeat(64) } }],
			["non-string-time", { ...base, created_at: 123 }],
		]) {
			await writeFile(path.join(dir, "manifest.json"), JSON.stringify(value), "utf8");
			assert.deepEqual(await new GraphRenameJournalStore(kb).read(operation), { kind: "blocked", operation_id: operation, reason: "invalid_journal" });
		}
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal validation rejects impossible prepared state combinations", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-prepared-invariants-"));
	try {
		const operation = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operation);
		await mkdir(dir, { recursive: true });
		const base = {
			kind: "journal", operation_id: operation, immutable_digest: "a".repeat(64), state: "prepared",
			source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", graph_rebuild: "not_started",
			created_at: "2026-07-22T00:00:00.000Z", updated_at: "2026-07-22T00:00:00.000Z", rename_state: "old",
			completed_steps: [], original_hashes: {}, intended_hashes: {}, intended_paths: {}, stage_paths: {}, backup_paths: {}, conflicts: [], retained_evidence: [],
		};
		for (const value of [
			{ ...base, rename_state: "target" },
			{ ...base, graph_rebuild: "started" },
			{ ...base, completed_steps: ["wiki/topics/a.md"] },
			{ ...base, conflicts: [{ source_path: "wiki/topics/a.md", current_state: "missing", preserved_variants: [] }] },
			{ ...base, retained_evidence: [{ relative_path: `.wiki-tmp/rename-ops/${operation}/evidence/current-${"b".repeat(64)}.bin`, sha256: "b".repeat(64), expires_at: "2026-08-21T00:00:00.000Z" }] },
		]) {
			await writeFile(path.join(dir, "manifest.json"), JSON.stringify(value), "utf8");
			assert.deepEqual(await new GraphRenameJournalStore(kb).read(operation), { kind: "blocked", operation_id: operation, reason: "invalid_journal" });
		}
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("startup listing blocks symlink and non-directory operation entries", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-startup-entries-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-startup-entries-outside-"));
	try {
		const root = path.join(kb, ".wiki-tmp", "rename-ops");
		await mkdir(root, { recursive: true });
		await symlink(outside, path.join(root, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
		assert.deepEqual(await new GraphRenameJournalStore(kb).listForStartup(), [{ kind: "blocked", operation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reason: "invalid_journal" }]);
		await rm(path.join(root, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
		await writeFile(path.join(root, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), "not a directory\n");
		assert.deepEqual(await new GraphRenameJournalStore(kb).listForStartup(), [{ kind: "blocked", operation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", reason: "invalid_journal" }]);
	} finally { await rm(kb, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("journal validation blocks unknown conflict variants and mismatched missing fields", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-conflict-shape-"));
	try {
		const operation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operation);
		await mkdir(dir, { recursive: true });
		const base = {
			kind: "journal", operation_id: operation, immutable_digest: "b".repeat(64), state: "conflicted",
			source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", graph_rebuild: "not_started",
			created_at: "2026-07-22T00:00:00.000Z", updated_at: "2026-07-22T00:00:00.000Z", rename_state: "old",
			completed_steps: [], original_hashes: {}, intended_hashes: {}, intended_paths: {}, stage_paths: {}, backup_paths: [], retained_evidence: [],
		};
		for (const value of [
			{ ...base, backup_paths: {}, conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: "c".repeat(64), preserved_variants: [{ kind: "unknown", relative_path: "x.bin", sha256: "d".repeat(64) }] }] },
			{ ...base, backup_paths: {}, conflicts: [{ source_path: "wiki/topics/a.md", current_state: "missing", current_sha256: "c".repeat(64), preserved_variants: [] }] },
			{ ...base, backup_paths: {}, conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", preserved_variants: [] }] },
		]) {
			await writeFile(path.join(dir, "manifest.json"), JSON.stringify(value), "utf8");
			assert.deepEqual(await new GraphRenameJournalStore(kb).read(operation), { kind: "blocked", operation_id: operation, reason: "invalid_journal" });
		}
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal refuses a replaced wiki temporary root instead of writing outside the knowledge base", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-root-link-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-root-outside-"));
	try {
		await symlink(outside, path.join(kb, ".wiki-tmp"));
		const store = new GraphRenameJournalStore(kb);
		await assert.rejects(store.acquire({ operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", immutableDigest: "c".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" }));
		assert.deepEqual(await readdir(outside), []);
	} finally { await rm(kb, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("journal refuses a replaced operation directory instead of following its symlink", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-operation-link-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-operation-outside-"));
	try {
		const operationId = "77777777-7777-4777-8777-777777777777";
		const operationsRoot = path.join(kb, ".wiki-tmp", "rename-ops");
		await mkdir(operationsRoot, { recursive: true });
		await writeFile(path.join(outside, "manifest.json"), JSON.stringify({ kind: "blocked", operation_id: operationId, reason: "unknown_state" }), "utf8");
		await symlink(outside, path.join(operationsRoot, operationId));
		assert.deepEqual(await new GraphRenameJournalStore(kb).read(operationId), { kind: "blocked", operation_id: operationId, reason: "invalid_journal" });
	} finally { await rm(kb, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("owned journal writes refuse an operation parent replaced at the final write boundary", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-write-parent-kb-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-write-parent-outside-"));
	const operationId = "71717171-7171-4171-8171-717171717171";
	try {
		const operationDirectory = path.join(kb, ".wiki-tmp", "rename-ops", operationId);
		const movedDirectory = `${operationDirectory}-moved`;
		let replaced = false;
		const store = new GraphRenameJournalStore(kb, {
			beforeOwnedFileFinalOperation: async (relativePath) => {
				if (replaced || !relativePath.endsWith(".bak")) return;
				replaced = true;
				await rename(operationDirectory, movedDirectory);
				await symlink(outside, operationDirectory);
			},
		});
		await store.acquire({ operationId, immutableDigest: "7".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		await assert.rejects(store.writeOwnedFile(`.wiki-tmp/rename-ops/${operationId}/backups/a.bak`, Buffer.from("original\n")));
		assert.deepEqual(await readdir(outside), []);
	} finally {
		await rm(kb, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test("journal refuses a replaced manifest file instead of following its symlink", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-manifest-link-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-manifest-outside-"));
	try {
		const operationId = "88888888-8888-4888-8888-888888888888";
		const operationDir = path.join(kb, ".wiki-tmp", "rename-ops", operationId);
		await mkdir(operationDir, { recursive: true });
		await writeFile(path.join(outside, "manifest.json"), JSON.stringify({ kind: "blocked", operation_id: operationId, reason: "unknown_state" }), "utf8");
		await symlink(path.join(outside, "manifest.json"), path.join(operationDir, "manifest.json"));
		assert.deepEqual(await new GraphRenameJournalStore(kb).read(operationId), { kind: "blocked", operation_id: operationId, reason: "invalid_journal" });
	} finally { await rm(kb, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("same operation ID and digest is idempotent after terminal receipt", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-idempotent-"));
	try {
		const store = new GraphRenameJournalStore(kb);
		const input = { operationId: "44444444-4444-4444-8444-444444444444", immutableDigest: "e".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" };
		const first = await store.acquire(input);
		await store.transition(first.operation_id, "applying", {});
		await store.transition(first.operation_id, "rolled_back", { graphRebuild: "succeeded" });
		await store.compactTerminal({ operationId: first.operation_id, now: new Date() });
		const second = await store.acquire(input);
		assert.equal(second.state, "rolled_back");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("same operation ID requires resolution digest presence and value to match", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-resolution-strict-"));
	try {
		const store = new GraphRenameJournalStore(kb);
		const input = { operationId: "99999999-9999-4999-8999-999999999999", immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md", resolutionDigest: "b".repeat(64) };
		await store.acquire(input);
		await assert.rejects(store.acquire({ ...input, resolutionDigest: undefined }), (error: any) => error.code === "CONFLICT");
		await assert.rejects(store.acquire({ ...input, resolutionDigest: "c".repeat(64) }), (error: any) => error.code === "CONFLICT");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal rejects a manifest whose operation ID does not match its directory", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-operation-id-"));
	try {
		const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operationId);
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ kind: "blocked", operation_id: other, reason: "unknown_state" }), "utf8");
		assert.deepEqual(await new GraphRenameJournalStore(kb).read(operationId), { kind: "blocked", operation_id: operationId, reason: "invalid_journal" });
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal reports a manifest directory as blocked instead of throwing EISDIR", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-manifest-dir-"));
	try {
		const operationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
		await mkdir(path.join(kb, ".wiki-tmp", "rename-ops", operationId, "manifest.json"), { recursive: true });
		assert.deepEqual(await new GraphRenameJournalStore(kb).read(operationId), { kind: "blocked", operation_id: operationId, reason: "invalid_journal" });
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("journal rejects every operation data path that is not owned by the operation", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-owned-path-"));
	try {
		const operationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
		const dir = path.join(kb, ".wiki-tmp", "rename-ops", operationId);
		await mkdir(dir, { recursive: true });
		const digest = "a".repeat(64);
		const base = {
			kind: "journal", operation_id: operationId, immutable_digest: digest, state: "applying",
			source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", graph_rebuild: "not_started",
			created_at: "2026-07-22T00:00:00.000Z", updated_at: "2026-07-22T00:00:00.000Z", rename_state: "old",
			completed_steps: [], original_hashes: { "wiki/topics/a.md": digest }, intended_hashes: { "wiki/topics/a.md": digest },
			intended_paths: {}, stage_paths: {}, backup_paths: {}, conflicts: [], retained_evidence: [],
		};
		for (const value of [
			{ ...base, intended_paths: { "wiki/topics/a.md": "wiki/topics/user.md" } },
			{ ...base, backup_paths: { "wiki/topics/a.md": "wiki/topics/user.md" } },
			{ ...base, stage_paths: { "wiki/topics/a.md": "wiki/topics/user.md" } },
			{ ...base, conflicts: [{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: digest, preserved_variants: [{ kind: "current", relative_path: "wiki/topics/user.md", sha256: digest }] }] },
			{ ...base, retained_evidence: [{ relative_path: "wiki/topics/user.md", sha256: digest, expires_at: "2026-08-21T00:00:00.000Z" }] },
		]) {
			await writeFile(path.join(dir, "manifest.json"), JSON.stringify(value), "utf8");
			assert.deepEqual(await new GraphRenameJournalStore(kb).read(operationId), { kind: "blocked", operation_id: operationId, reason: "invalid_journal" });
		}
		await mkdir(path.join(kb, "wiki", "topics"), { recursive: true });
		await writeFile(path.join(kb, "wiki", "topics", "user.md"), "user-owned\n", "utf8");
		await new GraphRenameJournalStore(kb).pruneExpiredOperationData({ now: new Date("2027-01-01T00:00:00.000Z"), receiptRetentionMs: 1, evidenceRetentionMs: 1 });
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "user.md"), "utf8"), "user-owned\n");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("prepared cleanup preserves an owned path whose bytes were externally replaced", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-cleanup-replaced-"));
	try {
		const operationId = "34343434-3434-4343-8343-343434343434";
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "3".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		const backupPath = `.wiki-tmp/rename-ops/${operationId}/backups/wiki%2Ftopics%2Fa.md.bak`;
		const original = Buffer.from("original\n");
		await store.writeOwnedFile(backupPath, original);
		await store.writePrepared({
			operationId, immutableDigest: "3".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md",
			originalHashes: { "wiki/topics/a.md": "25718360e05d3c2d0963d1381e9dd4dae5fca789244ee4b9f861adcc0cc96218" },
			intendedHashes: { "wiki/topics/a.md": "25718360e05d3c2d0963d1381e9dd4dae5fca789244ee4b9f861adcc0cc96218" },
			backupPaths: { "wiki/topics/a.md": backupPath },
		});
		await writeFile(path.join(kb, ...backupPath.split("/")), "external\n", "utf8");
		await assert.rejects(store.abortPrepared(operationId));
		assert.equal(await readFile(path.join(kb, ...backupPath.split("/")), "utf8"), "external\n");
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("stale malformed locks are not deleted solely because their PID is dead", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-lock-malformed-"));
	try {
		await mkdir(path.join(kb, ".wiki-tmp", "rename-ops"), { recursive: true });
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), JSON.stringify({ owner_pid: 999999 }), "utf8");
		await assert.rejects(new GraphRenameJournalStore(kb, { isProcessAlive: () => false }).acquire({ operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff", immutableDigest: "f".repeat(64), sourcePath: "wiki/topics/c.md", targetPath: "wiki/topics/d.md" }), (error: any) => error.code === "BUSY");
		assert.equal(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), "utf8"), JSON.stringify({ owner_pid: 999999 }));
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("release preserves a replacement lock whose creation time changed", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-lock-created-at-"));
	try {
		const operationId = "12121212-1212-4121-8121-121212121212";
		const store = new GraphRenameJournalStore(kb, { serverInstanceId: "server-a" });
		await store.acquire({ operationId, immutableDigest: "1".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), JSON.stringify({ operation_id: operationId, immutable_digest: "1".repeat(64), owner_pid: process.pid, server_instance_id: "server-a", created_at: "2099-01-01T00:00:00.000Z" }), "utf8");
		await store.release(operationId);
		assert.equal(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), "utf8").then((value) => value.includes("2099-01-01")), true);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("the lock holder refuses to adopt a replacement lock with a changed creation time", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-lock-reacquire-created-at-"));
	try {
		const operationId = "56565656-5656-4565-8565-565656565656";
		const store = new GraphRenameJournalStore(kb, { serverInstanceId: "server-a" });
		await store.acquire({ operationId, immutableDigest: "5".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		const replacement = JSON.stringify({ operation_id: operationId, immutable_digest: "5".repeat(64), owner_pid: process.pid, server_instance_id: "server-a", created_at: "2099-01-01T00:00:00.000Z" });
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), replacement, "utf8");
		await assert.rejects(store.acquireExisting(operationId), (error: any) => error.code === "BUSY");
		assert.equal(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), "utf8"), replacement);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("release does not unlink a lock whose owner content was replaced", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-lock-replacement-"));
	try {
		const operationId = "55555555-5555-4555-8555-555555555555";
		const store = new GraphRenameJournalStore(kb, { serverInstanceId: "server-a" });
		await store.acquire({ operationId, immutableDigest: "a".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		await writeFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), JSON.stringify({
			operation_id: operationId,
			immutable_digest: "b".repeat(64),
			owner_pid: process.pid,
			server_instance_id: "server-a",
			created_at: "2026-07-22T00:00:00.000Z",
		}), "utf8");
		await store.release(operationId);
		assert.equal(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", "active.lock"), "utf8").then((value) => value.includes('"immutable_digest":"bbbb')), true);
	} finally { await rm(kb, { recursive: true, force: true }); }
});

test("atomic owned-file writes remove their temporary file after a write failure", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-journal-atomic-write-"));
	try {
		const operationId = "66666666-6666-4666-8666-666666666666";
		const store = new GraphRenameJournalStore(kb);
		await store.acquire({ operationId, immutableDigest: "c".repeat(64), sourcePath: "wiki/topics/a.md", targetPath: "wiki/topics/b.md" });
		await assert.rejects(store.writeOwnedFile(`.wiki-tmp/rename-ops/${operationId}/broken.bin`, {} as Buffer));
		const entries = await readdir(path.join(kb, ".wiki-tmp", "rename-ops", operationId));
		assert.equal(entries.some((entry) => entry.endsWith(".tmp")), false);
	} finally { await rm(kb, { recursive: true, force: true }); }
});
