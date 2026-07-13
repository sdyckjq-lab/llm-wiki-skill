import {
	ArtifactListDataSchema,
	ArtifactManifestDataSchema,
	type ArtifactManifest,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export function listArtifacts(
	conversationId?: string,
): Promise<ArtifactManifest[]> {
	return request({ method: "GET", path: "/api/artifacts" }, {
		responseSchema: ArtifactListDataSchema,
		query: { conversation: conversationId },
	});
}

export function getArtifactManifest(id: string): Promise<ArtifactManifest> {
	return request({ method: "GET", path: "/api/artifacts/:id" }, {
		responseSchema: ArtifactManifestDataSchema,
		pathParams: { id },
	});
}

/** file-download endpoint：成功响应是文件，不进入普通 JSON client。 */
export function getArtifactFileUrl(id: string, filename: string): string {
	return `/api/artifacts/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`;
}
