import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function findRepoRoot(fromUrl: string = import.meta.url): Promise<string> {
	let directory = path.dirname(fileURLToPath(fromUrl));
	while (true) {
		if (await stat(path.join(directory, ".git")).then(() => true).catch(() => false)) return directory;
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	throw new Error("Cannot locate repository root from server module path");
}

export async function wikiLinkCliPath(fromUrl?: string): Promise<string> {
	return path.join(await findRepoRoot(fromUrl), "scripts", "wiki-link-cli.js");
}
