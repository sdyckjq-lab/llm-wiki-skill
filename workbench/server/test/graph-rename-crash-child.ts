import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createGraphRenameService } from "../src/graph-renames.js";

const [kbPath, metadataPath] = process.argv.slice(2);
if (!kbPath || !metadataPath) throw new Error("usage: graph-rename-crash-child <kb> <metadata>");
await mkdir(path.dirname(metadataPath), { recursive: true });
const service = createGraphRenameService({
	afterFileCommit: async (relativePath) => {
		if (relativePath.endsWith(".md")) process.exit(73);
	},
	triggerRebuild: () => ({ ok: true, status: "started" }),
});
const preview = await service.previewGraphRename(kbPath, "wiki/topics/a.md", "renamed.md");
await writeFile(metadataPath, JSON.stringify(preview), "utf8");
await service.applyGraphRename(kbPath, { operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "renamed.md", preview_digest: preview.preview_digest, resolutions: [], confirmed: true });
