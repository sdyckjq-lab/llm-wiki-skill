import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { findRepoRoot, wikiLinkCliPath } from "./repo-root.js";

test("repo root lookup finds the monorepo from source and dist-like nesting", async () => {
	assert.equal(await findRepoRoot(), path.resolve("."));
	assert.equal((await wikiLinkCliPath()).endsWith("scripts/wiki-link-cli.js"), true);
	const temp = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-root-"));
	try {
		await mkdir(path.join(temp, "a", "b", "c"), { recursive: true });
		await writeFile(path.join(temp, ".git"), "gitdir: /tmp/fake-git\n");
		assert.equal(await findRepoRoot(pathToFileURL(path.join(temp, "a", "b", "c", "server.js")).href), temp);
	} finally { await rm(temp, { recursive: true, force: true }); }
});

test("repo root lookup fails when no .git boundary exists", async () => {
	const temp = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-no-root-"));
	try { await assert.rejects(findRepoRoot(pathToFileURL(path.join(temp, "server.js")).href), /Cannot locate repository root/); }
	finally { await rm(temp, { recursive: true, force: true }); }
});
