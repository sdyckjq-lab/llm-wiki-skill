const FORMAL_GRAPH_RENAME_PAGE = /^wiki\/(entities|topics|sources|comparisons|synthesis|queries)\/.+\.md$/;

export function isFormalGraphRenamePagePath(path: string): boolean {
	return FORMAL_GRAPH_RENAME_PAGE.test(path);
}
