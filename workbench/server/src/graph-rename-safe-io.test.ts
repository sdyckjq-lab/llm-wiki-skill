import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { moveFileNoOverwrite, removeFileNoOverwrite, replaceFileNoOverwrite, sha256Bytes } from "./graph-rename-safe-io.js";

test("shared safe replacement refuses a parent changed to an outside symlink at the final boundary", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-io-kb-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-io-outside-"));
	try {
		const parent = path.join(kb, "wiki", "topics");
		const moved = path.join(kb, "wiki", "topics-moved");
		await mkdir(parent, { recursive: true });
		const target = path.join(parent, "a.md");
		await writeFile(target, "original\n");
		await assert.rejects(replaceFileNoOverwrite({
			kbRoot: kb,
			targetPath: target,
			bytes: Buffer.from("intended\n"),
			expectedSha256: "25718360e05d3c2d0963d1381e9dd4dae5fca789244ee4b9f861adcc0cc96218",
			beforeFinalOperation: async () => {
				await rename(parent, moved);
				await symlink(outside, parent);
			},
		}));
		assert.equal(await readFile(path.join(moved, "a.md"), "utf8"), "original\n");
		assert.deepEqual(await readdir(outside), []);
	} finally {
		await rm(kb, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test("shared safe move refuses a parent changed to an outside symlink before publishing", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-move-kb-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-move-outside-"));
	try {
		const parent = path.join(kb, "wiki", "topics");
		const moved = path.join(kb, "wiki", "topics-moved");
		await mkdir(parent, { recursive: true });
		const source = path.join(parent, "old.md");
		await writeFile(source, "source\n");
		await assert.rejects(moveFileNoOverwrite({
			kbRoot: kb,
			sourcePath: source,
			targetPath: path.join(parent, "new.md"),
			expectedSourceSha256: sha256Bytes(Buffer.from("source\n")),
			beforeFinalOperation: async () => {
				await rename(parent, moved);
				await symlink(outside, parent);
			},
		}));
		assert.equal(await readFile(path.join(moved, "old.md"), "utf8"), "source\n");
		assert.deepEqual(await readdir(outside), []);
	} finally {
		await rm(kb, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test("shared safe removal refuses a parent changed to an outside symlink before deleting", async () => {
	const kb = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-remove-kb-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-safe-remove-outside-"));
	try {
		const parent = path.join(kb, "wiki", "topics");
		const moved = path.join(kb, "wiki", "topics-moved");
		await mkdir(parent, { recursive: true });
		const target = path.join(parent, "old.md");
		await writeFile(target, "source\n");
		await assert.rejects(removeFileNoOverwrite({
			kbRoot: kb,
			targetPath: target,
			expectedSha256: sha256Bytes(Buffer.from("source\n")),
			beforeFinalOperation: async () => {
				await rename(parent, moved);
				await symlink(outside, parent);
			},
		}));
		assert.equal(await readFile(path.join(moved, "old.md"), "utf8"), "source\n");
		assert.deepEqual(await readdir(outside), []);
	} finally {
		await rm(kb, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});
