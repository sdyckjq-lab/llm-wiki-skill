import type { AgentSession } from "@earendil-works/pi-coding-agent";

import { getActive } from "../src/agent.js";
import { createRuntimeApplication } from "../src/runtime-app.js";
import { startWorkbenchServer } from "../src/startup.js";
import type {
	PromptRouteService,
	PromptRunContext,
} from "../src/routes/prompt.js";

const FAKE_MODEL_MARKER = "browser-foundation-fake-model";
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

const activeRuns = new Map<string, string>();
const pendingRuns = new Map<string, { cancel: () => void }>();
const promptService: PromptRouteService = {
	getRunSeed() {
		const active = getActive();
		if (!active) {
			throw Object.assign(new Error("没有活跃对话"), { code: "NO_ACTIVE_KB" });
		}
		return {
			active: {
				kbPath: active.kb.path,
				name: active.kb.name,
				conversationId: active.conversationId,
				sessionId: active.conversationId,
			},
			session: active.session as never,
		};
	},
	createRunId: () => `browser-run-${Date.now().toString(36)}`,
	createMessageId: (runId) => `assistant-${runId}`,
	beginRun(sessionId, runId) {
		if (activeRuns.has(sessionId)) return false;
		activeRuns.set(sessionId, runId);
		return true;
	},
	endRun(sessionId, runId) {
		if (activeRuns.get(sessionId) === runId) activeRuns.delete(sessionId);
	},
	subscribeSession: () => () => {},
	subscribeArtifacts: () => () => {},
	async runPrompt(ctx: PromptRunContext) {
		console.log(`[browser-test-model] ${FAKE_MODEL_MARKER}`);
		appendBrowserMessage(ctx.session, "user", ctx.message);
		if (ctx.message.includes("[fail]")) {
			throw new Error("controlled browser model failure");
		}
		if (ctx.message.includes("[slow]")) {
			const cancelled = await new Promise<boolean>((resolve) => {
				const timer = setTimeout(() => {
					pendingRuns.delete(ctx.runId);
					resolve(false);
				}, 3_000);
				pendingRuns.set(ctx.runId, {
					cancel: () => {
						clearTimeout(timer);
						pendingRuns.delete(ctx.runId);
						resolve(true);
					},
				});
			});
			if (cancelled) {
				for (const event of ctx.adapter.cancelAssistant("用户已停止")) {
					await ctx.writer.write(event);
				}
				return;
			}
		}
		const responseText = ctx.message.includes("[refs]")
			? "请查看 [[wiki/entities/shared.md]]，也可打开 [[wiki/entities/missing.md]]。"
			: "可控的测试回复";
		const delta = ctx.adapter.adapt({
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 0,
				delta: responseText,
				partial: {
					role: "assistant",
					content: [{ type: "text", text: responseText }],
				},
			},
		} as never)[0];
		if (delta) await ctx.writer.write(delta);
		appendBrowserMessage(ctx.session, "assistant", responseText);
		for (const event of ctx.adapter.finishAssistant()) {
			await ctx.writer.write(event);
		}
	},
	abortSession: (ctx) => pendingRuns.get(ctx.runId)?.cancel(),
	clearPendingKnowledgeContext: () => {},
};

function appendBrowserMessage(
	session: PromptRunContext["session"],
	role: "user" | "assistant",
	text: string,
): void {
	(session as AgentSession).sessionManager.appendMessage({
		role,
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	} as never);
}

const runningServer = await startWorkbenchServer({
	createApplication: (token) => createRuntimeApplication(token, {
		promptService,
		chooseDirectory: async () => selectedDirectory,
	}),
});

let shutdownPromise: Promise<void> | undefined;
function requestShutdown(): void {
	shutdownPromise ??= runningServer.close().then(() => {
		process.exitCode = 0;
	});
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
