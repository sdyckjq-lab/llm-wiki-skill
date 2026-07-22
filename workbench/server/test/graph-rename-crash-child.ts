import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createGraphRenameService } from "../src/graph-renames.js";

const [kbPath, metadataPath, crashBoundary] = process.argv.slice(2);
if (!kbPath || !metadataPath) throw new Error("usage: graph-rename-crash-child <kb> <metadata>");
await mkdir(path.dirname(metadataPath), { recursive: true });
const service = createGraphRenameService({
	afterFileCommit: async (relativePath) => {
		if (!crashBoundary && relativePath.endsWith(".md")) process.exit(73);
	},
	afterSourceRenameStep: async (state) => {
		if (crashBoundary === state) process.exit(73);
	},
	triggerRebuild: () => ({ ok: true, status: "started" }),
});
const sourcePath = crashBoundary ? "wiki/topics/Page.md" : "wiki/topics/a.md";
const newName = crashBoundary ? "page.md" : "renamed.md";
const preview = await service.previewGraphRename(kbPath, sourcePath, newName);
await writeFile(metadataPath, JSON.stringify(preview), "utf8");
await service.applyGraphRename(kbPath, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: newName, preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
