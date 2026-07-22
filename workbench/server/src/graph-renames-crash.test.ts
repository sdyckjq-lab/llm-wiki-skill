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
