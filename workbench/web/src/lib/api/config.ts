import {
	AppConfigSchema,
	AvailableModelsDataSchema,
	ConfigPatchSchema,
	type AppConfig,
	type AvailableModelsData,
	type ConfigPatch,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export function getConfig(): Promise<AppConfig> {
	return request(
		{ method: "GET", path: "/api/config" },
		{ responseSchema: AppConfigSchema },
	);
}

export function setConfig(partial: ConfigPatch): Promise<AppConfig> {
	return request({ method: "POST", path: "/api/config" }, {
		body: ConfigPatchSchema.parse(partial),
		responseSchema: AppConfigSchema,
	});
}

export function fetchAvailableModels(): Promise<AvailableModelsData> {
	return request(
		{ method: "GET", path: "/api/models" },
		{ responseSchema: AvailableModelsDataSchema },
	);
}
