import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renameSourceWithTransit } from "./graph-rename-files.js";

test("production transit rename handles case and NFC/NFD equivalent names", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-rename-portability-"));
	try {
		const oldPath = path.join(root, "Résumé.md");
		const caseTarget = path.join(root, "résumé.md");
		await writeFile(oldPath, "case\n");
		await renameSourceWithTransit({ sourcePath: oldPath, targetPath: caseTarget, operationId: "case" });
		assert.equal(await readFile(caseTarget, "utf8"), "case\n");
		const nfc = path.join(root, "é.md"); const nfd = path.join(root, "e\u0301.md");
		await writeFile(nfc, "unicode\n");
		await renameSourceWithTransit({ sourcePath: nfc, targetPath: nfd, operationId: "unicode" });
		assert.equal(await readFile(nfd, "utf8"), "unicode\n");
	} finally { await rm(root, { recursive: true, force: true }); }
});
