import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { createGraphRenameService } from "./graph-renames.js";

const execFileAsync = promisify(execFile);

test("a real child-process exit leaves applying journal and restart recovers the transit", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-crash-"));
	const metadata = path.join(os.tmpdir(), `llm-wiki-rename-crash-${process.pid}-${Date.now()}.json`);
	try {
		await mkdir(path.join(kb, "wiki", "topics"), { recursive: true });
		await writeFile(path.join(kb, "wiki", "topics", "a.md"), "[[wiki/topics/a.md]]\n");
		const child = path.resolve("workbench/server/test/graph-rename-crash-child.ts");
		await assert.rejects(execFileAsync(process.execPath, ["--import", "tsx", child, kb, metadata]));
		const preview = JSON.parse(await readFile(metadata, "utf8")) as { operation_id: string };
		const manifest = JSON.parse(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", preview.operation_id, "manifest.json"), "utf8")) as { state: string };
		assert.equal(manifest.state, "applying");
		const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
		const recovered = await service.recoverGraphRenameOperations(kb);
		assert.equal(recovered.needsRebuild, true);
		assert.equal(await readFile(path.join(kb, "wiki", "topics", "renamed.md"), "utf8"), "[[wiki/topics/renamed.md]]\n");
	} finally { await rm(kb, { recursive: true, force: true }); await rm(metadata, { force: true }); }
});

test("real child exits at both transit rename boundaries and a fresh service recovers", async () => {
	for (const boundary of ["transit", "target"] as const) {
		const kb = await mkdtemp(path.join(os.tmpdir(), `llm-wiki-rename-crash-${boundary}-`));
		const metadata = path.join(os.tmpdir(), `llm-wiki-rename-crash-${boundary}-${process.pid}-${Date.now()}.json`);
		try {
			await mkdir(path.join(kb, "wiki", "topics"), { recursive: true });
			await writeFile(path.join(kb, "wiki", "topics", "Page.md"), "case\n");
			const child = path.resolve("workbench/server/test/graph-rename-crash-child.ts");
			await assert.rejects(execFileAsync(process.execPath, ["--import", "tsx", child, kb, metadata, boundary]));
			const preview = JSON.parse(await readFile(metadata, "utf8")) as { operation_id: string };
			const manifest = JSON.parse(await readFile(path.join(kb, ".wiki-tmp", "rename-ops", preview.operation_id, "manifest.json"), "utf8")) as { state: string; rename_state: string };
			assert.equal(manifest.state, "applying");
			assert.equal(manifest.rename_state, boundary);
			const service = createGraphRenameService({ triggerRebuild: () => ({ ok: true, status: "started" }) });
			const recovered = await service.recoverGraphRenameOperations(kb);
			assert.equal(recovered.needsRebuild, true, `recovery did not request rebuild at ${boundary}`);
			assert.equal(await readFile(path.join(kb, "wiki", "topics", "page.md"), "utf8"), "case\n");
		} finally {
			await rm(kb, { recursive: true, force: true });
			await rm(metadata, { force: true });
		}
	}
});

test("fresh child processes can refresh finish and idempotently repeat a conflicted recovery", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-conflict-recovery-"));
	const metadata = path.join(os.tmpdir(), `llm-wiki-rename-conflict-recovery-${process.pid}-${Date.now()}.json`);
	try {
		await mkdir(path.join(kb, "wiki", "topics"), { recursive: true });
		const source = path.join(kb, "wiki", "topics", "a.md");
		await writeFile(source, "original\n");
		const service = createGraphRenameService({
			beforeSourceRename: async () => { await writeFile(source, "external\n"); },
			triggerRebuild: () => ({ ok: true, status: "started" }),
		});
		const preview = await service.previewGraphRename(kb, "wiki/topics/a.md", "renamed.md");
		const conflicted = await service.applyGraphRename(kb, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
		assert.equal((conflicted as any).operation.state, "conflicted");
		await writeFile(metadata, JSON.stringify({ operation_id: preview.operation_id }), "utf8");
		const child = path.resolve("workbench/server/test/graph-rename-crash-child.ts");
		await execFileAsync(process.execPath, ["--import", "tsx", child, kb, metadata, "recovery-refresh"]);
		const refreshed = JSON.parse(await readFile(metadata, "utf8")) as { observed_conflicts: unknown[] };
		assert.equal(refreshed.observed_conflicts.length >= 2, true);
		await execFileAsync(process.execPath, ["--import", "tsx", child, kb, metadata, "recovery-finish"]);
		const finished = JSON.parse(await readFile(metadata, "utf8")) as { result: unknown };
		assert.equal((finished.result as any).status, "rebuild_required");
		assert.equal((finished.result as any).operation.state, "rolled_back");
		assert.equal(await readFile(source, "utf8"), "original\n");
		await execFileAsync(process.execPath, ["--import", "tsx", child, kb, metadata, "recovery-finish"]);
		const repeated = JSON.parse(await readFile(metadata, "utf8")) as { result: unknown };
		assert.deepEqual(repeated.result, finished.result);
	} finally {
		await rm(kb, { recursive: true, force: true });
		await rm(metadata, { force: true });
	}
});
