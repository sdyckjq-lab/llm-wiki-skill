import { serve } from "@hono/node-server";

import type { Hono } from "hono";

import {
	bootstrapFromConfig,
	getActive,
	shutdownAgent,
} from "./agent.js";
import {
	stopActiveGraphRebuilds,
	stopKnowledgeBaseGraphWatcher,
	watchKnowledgeBaseGraph,
} from "./graph.js";
import { defaultGraphRenameRouteService } from "./routes/graph-renames.js";
import { localHostOnly } from "./security/host.js";
import {
	generateCapabilityToken,
	writeCapabilityToken,
} from "./security/token.js";

export interface WorkbenchStartupOptions {
	createApplication: (capabilityToken: string) => Hono;
	host?: string;
	port?: number;
}

export interface RunningWorkbenchServer {
	host: string;
	port: number;
	close: () => Promise<void>;
}

/**
 * Formal and automated launches share this complete startup lifecycle.
 * Application assembly stays with the runtime entry; token creation, restore,
 * listening, and cleanup cannot drift between launchers.
 */
export async function startWorkbenchServer(
	options: WorkbenchStartupOptions,
): Promise<RunningWorkbenchServer> {
	const host = localHostOnly(options.host ?? process.env.HOST);
	const port = options.port ?? Number(process.env.PORT ?? 8787);
	const capabilityToken = generateCapabilityToken();
	const app = options.createApplication(capabilityToken);

	let server: ReturnType<typeof serve> | undefined;
	try {
		await bootstrapFromConfig();
		const bootstrappedActive = getActive();
		if (bootstrappedActive) {
			const recovery = await defaultGraphRenameRouteService.recoverGraphRenameOperations(bootstrappedActive.kb.path);
			watchKnowledgeBaseGraph(bootstrappedActive.kb.path);
			if (recovery.needsRebuild) await defaultGraphRenameRouteService.triggerPendingGraphRebuild?.(bootstrappedActive.kb.path);
		}

		const listeningPort = await new Promise<number>((resolve, reject) => {
			const candidate = serve(
				{ fetch: app.fetch, port, hostname: host },
				(info) => resolve(info.port),
			);
			server = candidate;
			candidate.once("error", reject);
			});
		await writeCapabilityToken(capabilityToken);
		console.log(
			`[llm-wiki-agent/server] listening on http://${host}:${listeningPort}`,
		);

		let closePromise: Promise<void> | undefined;
		return {
			host,
			port: listeningPort,
			close: () => {
				closePromise ??= closeWorkbenchServer(server);
				return closePromise;
			},
		};
	} catch (error) {
		await closeWorkbenchServer(server);
		throw error;
	}
}

async function closeWorkbenchServer(
	server: ReturnType<typeof serve> | undefined,
): Promise<void> {
	stopKnowledgeBaseGraphWatcher();
	await Promise.all([
		closeHttpServer(server),
		stopActiveGraphRebuilds(),
		shutdownAgent(),
	]);
}

async function closeHttpServer(
	server: ReturnType<typeof serve> | undefined,
): Promise<void> {
	if (!server || !server.listening) return;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
		if ("closeAllConnections" in server) server.closeAllConnections();
	});
}
