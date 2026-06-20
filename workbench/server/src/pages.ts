import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { assertRegisteredKnowledgeBase } from "./knowledge-bases.js";

export interface PageRef {
	path: string;
	name: string;
	category: string;
	title: string;
}

const PAGE_DIRS = ["entities", "topics", "sources", "comparisons", "synthesis"];
const IGNORE_NAMES = new Set([".obsidian", ".DS_Store", ".wiki-tmp", ".git", "node_modules"]);
const MAX_REF_LIMIT = 5000;

interface CacheEntry {
	items: PageRef[];
	fingerprint: string;
}

const cache = new Map<string, CacheEntry>();

function shouldIgnore(name: string): boolean {
	return name.startsWith(".") || IGNORE_NAMES.has(name);
}

function toPosix(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

async function extractTitle(filePath: string, fallback: string): Promise<string> {
	const head = (await readFile(filePath, "utf8")).slice(0, 1024);
	const match = head.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim() || fallback;
}

async function scanCategory(kbPath: string, category: string): Promise<PageRef[]> {
	const root = path.join(kbPath, "wiki", category);
	const rootInfo = await stat(root).catch(() => null);
	if (!rootInfo?.isDirectory()) return [];
	const results: PageRef[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (shouldIgnore(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				const relFromWiki = toPosix(path.relative(path.join(kbPath, "wiki"), full));
				const relPath = `wiki/${relFromWiki}`;
				const name = entry.name.replace(/\.md$/, "");
				results.push({
					path: relPath,
					name,
					category,
					title: await extractTitle(full, name),
				});
			}
		}
	}

	await walk(root);
	return results;
}

async function scanPages(kbPath: string): Promise<PageRef[]> {
	const items = (await Promise.all(PAGE_DIRS.map((category) => scanCategory(kbPath, category))))
		.flat()
		.sort((a, b) => a.path.localeCompare(b.path, "zh"));
	return items;
}

async function directoryFingerprint(root: string): Promise<string> {
	const parts: string[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (shouldIgnore(entry.name)) continue;
			const full = path.join(dir, entry.name);
			const info = await stat(full).catch(() => null);
			if (!info) continue;
			if (entry.isDirectory()) {
				parts.push(`d:${toPosix(path.relative(root, full))}:${info.mtimeMs}`);
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				parts.push(`f:${toPosix(path.relative(root, full))}:${info.mtimeMs}:${info.size}`);
			}
		}
	}

	await walk(root);
	return parts.sort().join("|");
}

export async function getCachedPages(
	kbPath: string,
	options: { assertRegistered?: boolean } = {},
): Promise<PageRef[]> {
	if (options.assertRegistered !== false) await assertRegisteredKb(kbPath);
	const wikiDir = path.join(kbPath, "wiki");
	const fingerprint = await directoryFingerprint(wikiDir);
	const cached = cache.get(kbPath);
	if (cached && cached.fingerprint === fingerprint) return cached.items;
	const items = await scanPages(kbPath);
	cache.set(kbPath, { items, fingerprint });
	return items;
}

function score(item: PageRef, query: string): number {
	if (!query) return 1;
	const q = query.toLowerCase();
	let value = 0;
	if (item.title.toLowerCase().includes(q)) value += 2;
	if (item.name.toLowerCase().includes(q)) value += 1;
	if (item.path.toLowerCase().includes(q)) value += 0.5;
	return value;
}

export async function listPageRefs(
	kbPath: string,
	query = "",
	limit = 20,
	options: { assertRegistered?: boolean } = {},
): Promise<PageRef[]> {
	const q = query.trim();
	const items = await getCachedPages(kbPath, { assertRegistered: options.assertRegistered });
	return items
		.map((item) => ({ item, score: score(item, q) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.item.path.localeCompare(b.item.path, "zh"))
		.slice(0, Math.max(1, Math.min(limit, MAX_REF_LIMIT)))
		.map((entry) => entry.item);
}

export async function readWikiPage(kbPath: string, relPath: string): Promise<string> {
	await assertRegisteredKb(kbPath);
	return readFile(resolveWikiPagePath(kbPath, relPath), "utf8");
}

export function resolveWikiPagePath(kbPath: string, relPath: string): string {
	if (!relPath || path.isAbsolute(relPath)) throw new Error("path must be relative");
	if (!relPath.endsWith(".md")) throw new Error("path must be a markdown file");
	if (!relPath.split(/[\\/]/).includes("wiki")) throw new Error("path must be inside wiki");

	const kbRoot = path.resolve(kbPath);
	const wikiRoot = path.join(kbRoot, "wiki");
	const requested = path.resolve(kbRoot, relPath);
	if (requested !== wikiRoot && !requested.startsWith(wikiRoot + path.sep)) {
		throw new Error("path must be inside wiki");
	}
	return requested;
}

async function assertRegisteredKb(kbPath: string): Promise<void> {
	await assertRegisteredKnowledgeBase(kbPath);
}
