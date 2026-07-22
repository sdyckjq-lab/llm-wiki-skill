import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
		await store.writePrepared({ operationId: first.operation_id, immutableDigest: first.immutable_digest, sourcePath: first.source_path, targetPath: first.target_path, originalHashes: { "wiki/topics/a.md": "c".repeat(64) }, intendedHashes: { "wiki/topics/a.md": "d".repeat(64) } });
		await store.transition(first.operation_id, "applying", {});
		await store.transition(first.operation_id, "committed", { graphRebuild: "succeeded" });
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
