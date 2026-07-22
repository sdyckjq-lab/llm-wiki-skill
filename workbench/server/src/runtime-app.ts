import { DEV_WORKBENCH_ORIGINS } from "@llm-wiki/workbench-contracts";

import { createApp } from "./app.js";
import { createSecurityMiddleware } from "./security/middleware.js";
import type { PromptRouteService } from "./routes/prompt.js";
import { defaultKnowledgeBaseRouteService } from "./routes/knowledge-bases.js";
import type { GraphRenameRouteService } from "./routes/graph-renames.js";

const trustedOrigins = new Set(DEV_WORKBENCH_ORIGINS);

export interface RuntimeApplicationOptions {
	promptService?: PromptRouteService;
	chooseDirectory?: () => Promise<string | null>;
	graphRenameService?: GraphRenameRouteService;
}

/** Build the exact application served by the runtime without opening a port. */
export function createRuntimeApplication(
	capabilityToken: string,
	options: RuntimeApplicationOptions = {},
) {
	const app = createApp({
		security: createSecurityMiddleware({
			token: capabilityToken,
			trustedOrigins,
		}),
		...(options.promptService ? { promptService: options.promptService } : {}),
		...(options.chooseDirectory
			? {
				knowledgeBaseService: {
					...defaultKnowledgeBaseRouteService,
					chooseDirectory: options.chooseDirectory,
				},
			}
			: {}),
		...(options.graphRenameService ? { graphRenameService: options.graphRenameService } : {}),
	});
	return app;
}
