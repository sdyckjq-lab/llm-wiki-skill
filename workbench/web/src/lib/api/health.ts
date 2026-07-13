import { HealthDataSchema, type HealthData } from "@llm-wiki/workbench-contracts";

import { request } from "./client";

/**
 * GET /api/health —— 通过统一 client 调用 migrated-json endpoint。
 * 旧 api.ts 的 getHealth 已移除，health 全部走新契约路径。
 */
export function getHealth(): Promise<HealthData> {
	return request(
		{ method: "GET", path: "/api/health" },
		{ responseSchema: HealthDataSchema },
	);
}
