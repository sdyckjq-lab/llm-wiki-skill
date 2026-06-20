import type { PageRef } from "./api";

export interface SearchResult {
	ref: PageRef;
	score: number;
	matches: Array<"title" | "path" | "category" | "name">;
}

const MAX_QUERYLESS_RESULTS = 50;

export function filterPageRefs(refs: PageRef[], query: string, limit = 50): SearchResult[] {
	const normalizedQuery = normalizeSearchText(query);
	const effectiveLimit = Math.max(0, limit);
	if (effectiveLimit === 0) return [];
	if (!normalizedQuery) {
		return refs.slice(0, Math.min(effectiveLimit, MAX_QUERYLESS_RESULTS)).map((ref, index) => ({
			ref,
			score: 10_000 - index,
			matches: [],
		}));
	}

	return refs
		.map((ref, index) => scorePageRef(ref, normalizedQuery, index))
		.filter((result): result is SearchResult => result !== null)
		.sort((left, right) => right.score - left.score || left.ref.path.localeCompare(right.ref.path))
		.slice(0, effectiveLimit);
}

function scorePageRef(ref: PageRef, query: string, index: number): SearchResult | null {
	const fields: Array<{ key: SearchResult["matches"][number]; value: string; weight: number }> = [
		{ key: "title", value: ref.title, weight: 120 },
		{ key: "path", value: ref.path, weight: 100 },
		{ key: "name", value: ref.name, weight: 80 },
		{ key: "category", value: ref.category, weight: 44 },
	];
	let score = 0;
	const matches: SearchResult["matches"] = [];

	for (const field of fields) {
		const value = normalizeSearchText(field.value);
		if (!value) continue;
		if (value === query) {
			score += field.weight * 8;
			matches.push(field.key);
			continue;
		}
		if (value.startsWith(query)) {
			score += field.weight * 5;
			matches.push(field.key);
			continue;
		}
		const indexOf = value.indexOf(query);
		if (indexOf >= 0) {
			score += field.weight * 3 - Math.min(indexOf, 40);
			matches.push(field.key);
			continue;
		}
		const fuzzy = fuzzyScore(value, query);
		if (fuzzy > 0) {
			score += Math.round(field.weight * fuzzy);
			matches.push(field.key);
		}
	}

	if (score <= 0) return null;
	return { ref, score: score - index * 0.001, matches: uniqueMatches(matches) };
}

function fuzzyScore(value: string, query: string): number {
	let queryIndex = 0;
	let firstMatch = -1;
	let lastMatch = -1;
	let consecutive = 0;
	let bestConsecutive = 0;
	for (let i = 0; i < value.length && queryIndex < query.length; i += 1) {
		if (value[i] !== query[queryIndex]) {
			consecutive = 0;
			continue;
		}
		if (firstMatch === -1) firstMatch = i;
		lastMatch = i;
		queryIndex += 1;
		consecutive += 1;
		bestConsecutive = Math.max(bestConsecutive, consecutive);
	}
	if (queryIndex !== query.length || firstMatch === -1) return 0;
	const span = Math.max(1, lastMatch - firstMatch + 1);
	const compactness = query.length / span;
	const continuity = bestConsecutive / query.length;
	return Math.max(0.08, compactness * 0.48 + continuity * 0.32);
}

function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function uniqueMatches(matches: SearchResult["matches"]): SearchResult["matches"] {
	return Array.from(new Set(matches));
}
