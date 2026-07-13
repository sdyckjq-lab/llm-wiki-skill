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
	return (await request({ method: "GET", path: "/api/graph" }, {
		responseSchema: GraphReadDataSchema,
		query: { kb: kbPath },
	})) as GraphApiResult;
}

export async function rebuildGraph(
	kbPath: string,
): Promise<"started" | "queued"> {
	const data = await request({ method: "POST", path: "/api/graph/rebuild" }, {
		responseSchema: GraphRebuildDataSchema,
		query: { kb: kbPath },
	});
	return data.status;
}

export async function getGraphLayout(
	kbPath: string,
): Promise<GraphLayoutFile> {
	return (await request({ method: "GET", path: "/api/graph/layout" }, {
		responseSchema: GraphLayoutDataSchema,
		query: { kb: kbPath },
	})) as GraphLayoutFile;
}

export async function putGraphLayout(
	kbPath: string,
	pins: PinMap,
): Promise<GraphLayoutFile> {
	return (await request({ method: "PUT", path: "/api/graph/layout" }, {
		responseSchema: GraphLayoutDataSchema,
		body: { kbPath, version: 2, pins },
	})) as GraphLayoutFile;
}
