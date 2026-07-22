import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	applyByteRangeReplacements,
	migrateRenameLayoutKey,
	renameSourceWithTransit,
	resolveKnowledgeBaseRenamePath,
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
		const transit = await renameSourceWithTransit({ sourcePath: oldPath, targetPath: newPath, operationId: "test" });
		assert.ok(transit); assert.equal(await readFile(newPath, "utf8"), "bytes");
	} finally { await rm(root, { recursive: true, force: true }); }
});
