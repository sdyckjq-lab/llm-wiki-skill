import {
	GraphLayoutDataSchema,
	GraphReadDataSchema,
	GraphRebuildDataSchema,
} from "@llm-wiki/workbench-contracts";
import type { GraphData, GraphLayoutFile, PinMap } from "@llm-wiki/graph-engine";

import { request } from "./client";

export type GraphApiResult =
	| { needsBuild: true }
	| { needsBuild: false; data: GraphData };

export async function getGraphData(kbPath: string): Promise<GraphApiResult> {
	return (await request("/api/graph", {
		responseSchema: GraphReadDataSchema,
		query: { kb: kbPath },
	})) as GraphApiResult;
}

export async function rebuildGraph(
	kbPath: string,
): Promise<"started" | "queued"> {
	const data = await request("/api/graph/rebuild", {
		responseSchema: GraphRebuildDataSchema,
		method: "POST",
		query: { kb: kbPath },
	});
	return data.status;
}

export async function getGraphLayout(
	kbPath: string,
): Promise<GraphLayoutFile> {
	return (await request("/api/graph/layout", {
		responseSchema: GraphLayoutDataSchema,
		query: { kb: kbPath },
	})) as GraphLayoutFile;
}

export async function putGraphLayout(
	kbPath: string,
	pins: PinMap,
): Promise<GraphLayoutFile> {
	return (await request("/api/graph/layout", {
		responseSchema: GraphLayoutDataSchema,
		method: "PUT",
		body: { kbPath, version: 2, pins },
	})) as GraphLayoutFile;
}
