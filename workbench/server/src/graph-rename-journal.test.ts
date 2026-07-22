import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
