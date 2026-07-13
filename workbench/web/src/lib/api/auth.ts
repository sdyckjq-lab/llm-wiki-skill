import { AuthStatusDataSchema, type AuthStatusData } from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export function getAuthStatus(): Promise<AuthStatusData> {
	return request(
		{ method: "GET", path: "/api/auth/status" },
		{ responseSchema: AuthStatusDataSchema },
	);
}
