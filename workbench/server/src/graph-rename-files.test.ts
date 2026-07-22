import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, symlink, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	applyByteRangeReplacements,
	commitStagedRenameFile,
	migrateRenameLayoutKey,
	renameSourceWithTransit,
	resolveKnowledgeBaseRenamePath,
	sha256Bytes,
	stageRenameFile,
} from "./graph-rename-files.js";

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-files-"));
	await mkdir(path.join(root, "wiki", "topics"), { recursive: true });
	const source = path.join(root, "wiki", "topics", "页面.md");
	await writeFile(source, "[[wiki/topics/目标.md]]\n");
	return { root, source };
}

test("rename path resolution accepts ordinary Unicode and rejects escapes, symlinks and unsafe names", async () => {
	const { root } = await fixture();
	try {
		const result = await resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/页面.md", newName: "新 页面" });
		assert.equal(result.targetRelativePath, "wiki/topics/新 页面.md");
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "../页面.md", newName: "新" }));
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/页面.md", newName: "CON" }));
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/页面.md", newName: "bad/name" }));
		await symlink(path.join(root, "wiki", "topics", "页面.md"), path.join(root, "wiki", "topics", "link.md"));
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/link.md", newName: "new" }));
		await writeFile(path.join(root, "wiki", "topics", "PAGE.md"), "other\n");
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/页面.md", newName: "page" }));
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("rename path resolution treats a colliding directory entry as occupied", async () => {
	const { root } = await fixture();
	try {
		await mkdir(path.join(root, "wiki", "topics", "ʼn.md"));
		await assert.rejects(resolveKnowledgeBaseRenamePath({ kbPath: root, sourcePath: "wiki/topics/页面.md", newName: "ŉ" }), (error: any) => error.code === "CONFLICT");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("byte replacement checks raw UTF-8 slices and leaves surrounding bytes intact", () => {
	const original = Buffer.from("中文 😀 [[a]] `[[a]]`\n```\n[[a]]\n```", "utf8");
	const raw = "[[a]]";
	const first = original.indexOf(Buffer.from(raw));
	const replaced = applyByteRangeReplacements(original, [{ startByte: first, endByte: first + Buffer.byteLength(raw), rawLink: raw, replacement: "[[wiki/topics/a.md]]" }]);
	assert.equal(replaced.toString("utf8"), "中文 😀 [[wiki/topics/a.md]] `[[a]]`\n```\n[[a]]\n```");
	assert.throws(() => applyByteRangeReplacements(original, [{ startByte: first, endByte: first + Buffer.byteLength(raw), rawLink: "[[bad]]", replacement: "x" }]));
});

test("layout migration refuses to overwrite an existing target pin", () => {
	const layout = { version: 2 as const, pins: { old: { x: 1, y: 2 }, target: { x: 3, y: 4 } }, updatedAt: "" };
	assert.throws(() => migrateRenameLayoutKey(layout, "old", "target"));
	assert.equal(migrateRenameLayoutKey({ ...layout, pins: { old: { x: 1, y: 2 } } }, "old", "target").pins.target?.x, 1);
});

test("equivalent source names use a real transit path", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-transit-"));
	try {
		const oldPath = path.join(root, "Page.md"); const newPath = path.join(root, "page.md");
		await writeFile(oldPath, "bytes");
		const transit = await renameSourceWithTransit({ kbRoot: root, sourcePath: oldPath, targetPath: newPath, operationId: "test" });
		assert.ok(transit); assert.equal(await readFile(newPath, "utf8"), "bytes");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("transit recovery accepts a missing old name and finishes at the target", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-transit-recovery-"));
	try {
		const source = path.join(root, "Page.md");
		const transit = path.join(root, ".llm-wiki-rename-recovery-0.md");
		const target = path.join(root, "page.md");
		await writeFile(transit, "bytes");
		const steps: string[] = [];
		await renameSourceWithTransit({ kbRoot: root, sourcePath: source, transitPath: transit, targetPath: target, operationId: "recovery", onStep: (state) => { steps.push(state); } });
		assert.deepEqual(steps, ["target"]);
		assert.equal(await readFile(target, "utf8"), "bytes");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("target-boundary recovery distinguishes exact old and target names", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-target-recovery-"));
	try {
		const source = path.join(root, "Page.md");
		const transit = path.join(root, ".llm-wiki-rename-target-boundary.md");
		const target = path.join(root, "page.md");
		await writeFile(source, "bytes");
		await (await import("node:fs/promises")).rename(source, transit);
		await renameSourceWithTransit({ kbRoot: root, sourcePath: source, transitPath: transit, targetPath: target, operationId: "target-recovery" });
		assert.equal(await readFile(target, "utf8"), "bytes");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("staging and commit reject destinations outside the registered knowledge base", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-boundary-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-outside-"));
	try {
		await assert.rejects(stageRenameFile({
			kbRoot: root,
			operationId: "boundary",
			destinationPath: path.join(outside, "page.md"),
			bytes: Buffer.from("bytes"),
		}));
		const staged = await stageRenameFile({
			kbRoot: root,
			operationId: "boundary",
			destinationPath: path.join(root, "page.md"),
			bytes: Buffer.from("bytes"),
		});
		await assert.rejects(commitStagedRenameFile({
			kbRoot: root,
			...staged,
			destinationPath: path.join(outside, "page.md"),
		}));
	} finally {
		await rm(root, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test("commit refuses an external replacement after its first destination check", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-commit-race-"));
	try {
		const destination = path.join(root, "page.md");
		await writeFile(destination, "original\n");
		const staged = await stageRenameFile({ kbRoot: root, operationId: "race", destinationPath: destination, bytes: Buffer.from("intended\n") });
		await assert.rejects(commitStagedRenameFile({
			kbRoot: root,
			...staged,
			destinationPath: destination,
			expectedDestinationSha256: sha256Bytes(Buffer.from("original\n")),
			beforeRename: async () => { await writeFile(destination, "external\n"); },
		} as any));
		assert.equal(await readFile(destination, "utf8"), "external\n");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("commit does not overwrite an external replacement after its final check", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-commit-final-race-"));
	try {
		const destination = path.join(root, "page.md");
		await writeFile(destination, "original\n");
		const staged = await stageRenameFile({ kbRoot: root, operationId: "final-race", destinationPath: destination, bytes: Buffer.from("intended\n") });
		await assert.rejects(commitStagedRenameFile({
			kbRoot: root,
			...staged,
			destinationPath: destination,
			expectedDestinationSha256: sha256Bytes(Buffer.from("original\n")),
			afterFinalCheck: async () => { await writeFile(destination, "external\n"); },
		} as any));
		assert.equal(await readFile(destination, "utf8"), "external\n");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("commit refuses a parent directory replaced by a symlink after its final check", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-parent-race-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-parent-outside-"));
	try {
		const parent = path.join(root, "wiki");
		const moved = path.join(root, "wiki-moved");
		const destination = path.join(parent, "page.md");
		await mkdir(parent);
		const staged = await stageRenameFile({ kbRoot: root, operationId: "parent-race", destinationPath: destination, bytes: Buffer.from("intended\n") });
		await assert.rejects(commitStagedRenameFile({
			kbRoot: root,
			...staged,
			destinationPath: destination,
			afterFinalCheck: async () => { await rename(parent, moved); await symlink(outside, parent); },
		} as any));
		assert.deepEqual(await readdir(outside).catch(() => [] as string[]), []);
	} finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("source rename refuses a target that appears after its occupancy check", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-source-race-"));
	try {
		const source = path.join(root, "old.md");
		const target = path.join(root, "new.md");
		await writeFile(source, "source\n");
		await assert.rejects(renameSourceWithTransit({
			kbRoot: root,
			sourcePath: source,
			targetPath: target,
			operationId: "source-race",
			beforeRename: async () => { await writeFile(target, "external\n"); },
		}));
		assert.equal(await readFile(source, "utf8"), "source\n");
		assert.equal(await readFile(target, "utf8"), "external\n");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("source rename does not overwrite a target created after its final check", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-source-final-race-"));
	try {
		const source = path.join(root, "old.md");
		const target = path.join(root, "new.md");
		await writeFile(source, "source\n");
		await assert.rejects(renameSourceWithTransit({
			kbRoot: root,
			sourcePath: source,
			targetPath: target,
			operationId: "source-final-race",
			afterFinalCheck: async () => { await writeFile(target, "external\n"); },
		} as any));
		assert.equal(await readFile(source, "utf8"), "source\n");
		assert.equal(await readFile(target, "utf8"), "external\n");
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("transit rename rejects an unsafe transit path and a symlink source", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-transit-boundary-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-transit-outside-"));
	try {
		const source = path.join(root, "Page.md");
		const target = path.join(root, "page.md");
		await writeFile(source, "bytes");
		await assert.rejects(renameSourceWithTransit({
			kbRoot: root,
			sourcePath: source,
			targetPath: target,
			transitPath: path.join(outside, "transit.md"),
			operationId: "boundary",
		}));
		await rm(source);
		await symlink(path.join(outside, "external.md"), source);
		await assert.rejects(renameSourceWithTransit({ kbRoot: root, sourcePath: source, targetPath: target, operationId: "boundary" }));
	} finally {
		await rm(root, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});
