import {
	PageReadDataSchema,
	PageRefsDataSchema,
	type PageRef,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export async function listRefs(
	kbPath: string,
	query: string,
	limit = 20,
): Promise<PageRef[]> {
	return request({ method: "GET", path: "/api/refs" }, {
		responseSchema: PageRefsDataSchema,
		query: { kb: kbPath, q: query, limit },
	});
}

export async function readPage(
	kbPath: string,
	relPath: string,
): Promise<string> {
	const data = await request({ method: "GET", path: "/api/page" }, {
		responseSchema: PageReadDataSchema,
		query: { kb: kbPath, path: relPath },
	});
	return data.content;
}
