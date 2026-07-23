import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { appendFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	createAssistantMessageEventStream,
	fauxAssistantMessage,
	type Api,
	type Context,
	type Model,
	type StreamOptions,
} from "@earendil-works/pi-ai";

import { modelRegistry } from "../src/agent.js";
import { triggerGraphRebuild } from "../src/graph.js";
import { createGraphRenameService } from "../src/graph-renames.js";
import { defaultGraphRenameRouteService } from "../src/routes/graph-renames.js";
import { createRuntimeApplication } from "../src/runtime-app.js";
import { startWorkbenchServer } from "../src/startup.js";

const FAKE_MODEL_MARKER = "browser-foundation-fake-model";
const FAUX_PROVIDER = "browser-test-provider";
const FAUX_MODEL = "browser-test-model";
const modelFailureFlag = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-fail");
const modelErrorAttemptsFile = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-error-attempts");
const modelCancelStartedFlag = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-cancel-started");
const modelCancelSettledFlag = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-cancel-settled");
const modelDisconnectStartedFlag = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-disconnect-started");
const modelDisconnectSettledFlag = path.join(process.env.HOME ?? "", ".llm-wiki-agent", "browser-model-disconnect-settled");
const browserAppDir = path.join(process.env.HOME ?? "", ".llm-wiki-agent");
const renamePauseBeforeCommitFlag = path.join(browserAppDir, "browser-rename-pause-before-commit");
const renamePausedFlag = path.join(browserAppDir, "browser-rename-paused");
const renameResumeFlag = path.join(browserAppDir, "browser-rename-resume");
const renameCrashAfterWriteFlag = path.join(browserAppDir, "browser-rename-crash-after-write");
const renameRebuildFailOnceFlag = path.join(browserAppDir, "browser-rename-rebuild-fail-once");
const renameEventsFile = path.join(browserAppDir, "browser-rename-events.jsonl");
const selectedDirectory = process.env.LLM_WIKI_BROWSER_SELECTED_DIRECTORY;
if (!selectedDirectory) {
	throw new Error("browser test entry requires LLM_WIKI_BROWSER_SELECTED_DIRECTORY");
}

for (const key of [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GOOGLE_API_KEY",
	"GEMINI_API_KEY",
	"PI_CONFIG_DIR",
	"XDG_CONFIG_HOME",
]) {
	if (process.env[key]) throw new Error(`browser test entry received forbidden environment: ${key}`);
}

modelRegistry.registerProvider(FAUX_PROVIDER, {
	api: "browser-test-api",
	baseUrl: "http://127.0.0.1/browser-test-model",
	apiKey: "fictional-browser-test-key",
	streamSimple: streamBrowserModel,
	models: [{
		id: FAUX_MODEL,
		name: "Browser Test Model",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	}],
});
const fauxModel = modelRegistry.find(FAUX_PROVIDER, FAUX_MODEL);
if (!fauxModel) throw new Error("browser test model registration failed");
const hasConfiguredAuth = modelRegistry.hasConfiguredAuth.bind(modelRegistry);
modelRegistry.hasConfiguredAuth = (model) => {
	if (model.provider === FAUX_PROVIDER && existsSync(modelFailureFlag)) return false;
	return hasConfiguredAuth(model);
};

const browserGraphRenameService = {
	...createGraphRenameService({
		beforeFileCommit: async () => {
			if (!existsSync(renamePauseBeforeCommitFlag)) return;
			await writeFile(renamePausedFlag, "paused\n");
			await waitForRenameResume();
			await Promise.all([
				rm(renamePauseBeforeCommitFlag, { force: true }),
				rm(renamePausedFlag, { force: true }),
				rm(renameResumeFlag, { force: true }),
			]);
		},
		afterFileCommit: () => {
			if (!existsSync(renameCrashAfterWriteFlag)) return;
			unlinkSync(renameCrashAfterWriteFlag);
			process.exit(86);
		},
		beforeSourceRename: () => recordRenameEvent({ event: "source_rename_started" }),
		afterSourceRenameStep: (state) => recordRenameEvent({ event: "source_rename_step", state }),
		triggerRebuild: (kbPath) => {
			recordRenameEvent({ event: "graph_rebuild" });
			if (existsSync(renameRebuildFailOnceFlag)) {
				unlinkSync(renameRebuildFailOnceFlag);
				throw new Error("browser-controlled graph rebuild failure");
			}
			return triggerGraphRebuild(kbPath);
		},
	}),
	getActiveKnowledgeBasePath: defaultGraphRenameRouteService.getActiveKnowledgeBasePath,
};
Object.assign(defaultGraphRenameRouteService, browserGraphRenameService);

function recordRenameEvent(event: { event: string; state?: "old" | "transit" | "target" }): void {
	appendFileSync(renameEventsFile, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

const runningServer = await startWorkbenchServer({
	createApplication: (token) => createRuntimeApplication(token, {
		chooseDirectory: async () => selectedDirectory,
		graphRenameService: browserGraphRenameService,
	}),
});

let shutdownPromise: Promise<void> | undefined;
function requestShutdown(): void {
	shutdownPromise ??= runningServer.close().finally(() => {
		modelRegistry.hasConfiguredAuth = hasConfiguredAuth;
		modelRegistry.unregisterProvider(FAUX_PROVIDER);
		process.exitCode = 0;
	});
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

function streamBrowserModel(model: Model<Api>, context: Context, options?: StreamOptions) {
	const prompt = latestUserMessage(context);
	console.log(`[browser-test-model] ${FAKE_MODEL_MARKER}`);
	const stream = createAssistantMessageEventStream();
	queueMicrotask(async () => {
		if (prompt.includes("[model-error]")) {
			await appendFile(modelErrorAttemptsFile, "attempt\n");
			const failure = browserAssistantMessage(
				model,
				"",
				"error",
				"fictional retryable server error that must not reach the page or session",
			);
			failure.diagnostics = [{
				type: "provider_failure",
				timestamp: 0,
				error: {
					message: "fictional diagnostic detail that must not reach the page or session",
					stack: "fictional diagnostic stack that must not reach the page or session",
				},
				details: { path: "/fictional/private/diagnostic" },
			}];
			stream.push({ type: "error", reason: "error", error: failure });
			stream.end(failure);
			return;
		}
		if (prompt.includes("cancel this response")) {
			await writeFile(modelCancelStartedFlag, "started");
		}
		if (prompt.includes("disconnect this response")) {
			await writeFile(modelDisconnectStartedFlag, "started");
		}
		if (prompt.includes("[slow]")) await waitForAbortOrTimeout(options?.signal, 3_000);
		if (prompt.includes("cancel this response")) {
			await writeFile(modelCancelSettledFlag, "settled");
		}
		if (prompt.includes("disconnect this response")) {
			await writeFile(modelDisconnectSettledFlag, "settled");
		}

		if (options?.signal?.aborted) {
			const aborted = browserAssistantMessage(model, "", "aborted", "Request was aborted");
			stream.push({ type: "error", reason: "aborted", error: aborted });
			stream.end(aborted);
			return;
		}
		const responseText = prompt.includes("[retrieval-owner]")
			? `retrieval-owner:${retrievalOwner(context.systemPrompt)}`
			: prompt.includes("[refs]")
				? "请查看 [[wiki/entities/shared.md]]，也可打开 [[wiki/entities/missing.md]]。"
				: `可控的测试回复：${prompt}`;
		const message = browserAssistantMessage(model, responseText, "stop");
		const partial = { ...message, content: [] };
		stream.push({ type: "start", partial });
		stream.push({ type: "text_start", contentIndex: 0, partial });
		stream.push({
			type: "text_delta",
			contentIndex: 0,
			delta: responseText,
			partial: { ...message },
		});
		stream.push({ type: "text_end", contentIndex: 0, content: responseText, partial: message });
		stream.push({ type: "done", reason: "stop", message });
		stream.end(message);
	});
	return stream;
}

function retrievalOwner(systemPrompt: string | undefined): "atlas" | "harbor" | "none" {
	if (systemPrompt?.includes("Atlas-only fictional signal")) return "atlas";
	if (systemPrompt?.includes("Harbor-only fictional signal")) return "harbor";
	return "none";
}

function browserAssistantMessage(
	model: Model<Api>,
	text: string,
	stopReason: "stop" | "aborted" | "error",
	errorMessage?: string,
) {
	return {
		...fauxAssistantMessage(text, { stopReason, ...(errorMessage ? { errorMessage } : {}) }),
		api: model.api,
		provider: model.provider,
		model: model.id,
	};
}

function latestUserMessage(context: Context): string {
	let message: Context["messages"][number] | undefined;
	for (let index = context.messages.length - 1; index >= 0; index--) {
		const candidate = context.messages[index];
		if (candidate?.role === "user") {
			message = candidate;
			break;
		}
	}
	if (!message || message.role !== "user") return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((block) => block.type === "text" ? block.text : "")
		.filter(Boolean)
		.join("\n");
}

async function waitForAbortOrTimeout(signal: AbortSignal | undefined, timeoutMs: number): Promise<void> {
	if (signal?.aborted) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(finish, timeoutMs);
		const onAbort = () => finish();
		signal?.addEventListener("abort", onAbort, { once: true });
		function finish() {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}
	});
}

async function waitForRenameResume(): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (!existsSync(renameResumeFlag)) {
		if (Date.now() >= deadline) throw new Error("browser rename resume flag did not appear");
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}
