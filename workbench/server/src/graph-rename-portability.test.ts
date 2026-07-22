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
		const caseSteps: string[] = [];
		const caseTransit = path.join(root, ".llm-wiki-rename-case-0.md");
		await renameSourceWithTransit({ kbRoot: root, sourcePath: oldPath, targetPath: caseTarget, operationId: "case", transitPath: caseTransit, onStep: (state, transit) => { caseSteps.push(`${state}:${transit ?? ""}`); } });
		assert.equal(await readFile(caseTarget, "utf8"), "case\n");
		assert.deepEqual(caseSteps.map((step) => step.split(":", 1)[0]), ["transit", "target"]);
		assert.equal(caseSteps[0]?.includes(".llm-wiki-rename-case-0.md"), true);
		const nfc = path.join(root, "é.md"); const nfd = path.join(root, "e\u0301.md");
		await writeFile(nfc, "unicode\n");
		const unicodeSteps: string[] = [];
		await renameSourceWithTransit({ kbRoot: root, sourcePath: nfc, targetPath: nfd, operationId: "unicode", onStep: (state) => { unicodeSteps.push(state); } });
		assert.equal(await readFile(nfd, "utf8"), "unicode\n");
		assert.deepEqual(unicodeSteps, ["transit", "target"]);
	} finally { await rm(root, { recursive: true, force: true }); }
});
