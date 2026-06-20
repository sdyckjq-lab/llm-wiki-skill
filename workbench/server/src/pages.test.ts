import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { listPageRefs, resolveWikiPagePath } from "./pages.js";

test("resolveWikiPagePath rejects traversal outside the wiki directory", () => {
	const kbPath = path.join("/", "tmp", "kb");
	assert.equal(
		resolveWikiPagePath(kbPath, "wiki/topics/agent.md"),
		path.join(kbPath, "wiki", "topics", "agent.md"),
	);
	assert.throws(() => resolveWikiPagePath(kbPath, "wiki/../purpose.md"), /inside wiki/);
	assert.throws(() => resolveWikiPagePath(kbPath, "raw/source.md"), /inside wiki/);
	assert.throws(() => resolveWikiPagePath(kbPath, "/tmp/kb/wiki/topics/agent.md"), /relative/);
});

test("listPageRefs can preload more than 100 refs for current-library search", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "llm-wiki-pages-"));
	try {
		await mkdir(path.join(root, "wiki", "entities"), { recursive: true });
		await writeFile(path.join(root, ".wiki-schema.md"), "# schema\n", "utf8");
		for (let index = 0; index < 150; index += 1) {
			const padded = String(index).padStart(3, "0");
			await writeFile(
				path.join(root, "wiki", "entities", `page-${padded}.md`),
				`# Page ${padded}\n`,
				"utf8",
			);
		}

		const refs = await listPageRefs(root, "", 150, { assertRegistered: false });

		assert.equal(refs.length, 150);
		assert.equal(refs.at(-1)?.path, "wiki/entities/page-149.md");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
