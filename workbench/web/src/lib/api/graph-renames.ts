import {
	GraphRenameApplyBodySchema,
	GraphRenameApplyDataSchema,
	GraphRenamePreviewBodySchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryDataSchema,
	type GraphRenameApplyBody,
	type GraphRenameApplyData,
	type GraphRenamePreviewData,
	type GraphRenameRecoveryBody,
	type GraphRenameRecoveryData,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export async function previewGraphRename(
	kbPath: string,
	sourcePath: string,
	newName: string,
): Promise<GraphRenamePreviewData> {
	const body = GraphRenamePreviewBodySchema.parse({ source_path: sourcePath, new_name: newName });
	return request({ method: "POST", path: "/api/graph/renames/preview" }, {
		responseSchema: GraphRenamePreviewDataSchema,
		query: { kb: kbPath },
		body,
	});
}

export async function applyGraphRename(
	kbPath: string,
	input: GraphRenameApplyBody,
): Promise<GraphRenameApplyData> {
	const body = GraphRenameApplyBodySchema.parse(input);
	return request({ method: "POST", path: "/api/graph/renames/apply" }, {
		responseSchema: GraphRenameApplyDataSchema,
		query: { kb: kbPath },
		body,
	});
}

export async function getGraphRenameRecovery(
	kbPath: string,
): Promise<GraphRenameRecoveryData> {
	return request({ method: "GET", path: "/api/graph/renames/recovery" }, {
		responseSchema: GraphRenameRecoveryDataSchema,
		query: { kb: kbPath },
	});
}

export async function resolveGraphRenameRecovery(
	kbPath: string,
	input: GraphRenameRecoveryBody,
): Promise<GraphRenameRecoveryData> {
	return request({ method: "POST", path: "/api/graph/renames/recovery" }, {
		responseSchema: GraphRenameRecoveryDataSchema,
		query: { kb: kbPath },
		body: input,
	});
}
