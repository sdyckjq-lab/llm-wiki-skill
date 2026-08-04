import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chromium, type Browser, type BrowserContext, type BrowserServer } from "playwright";

import {
	OPERATION_TIMEOUT_MS,
	REPO_ROOT,
	SERVER_ENTRY,
	START_TIMEOUT_MS,
	VITE_ENTRY,
	WEB_ROOT,
	assertPortAvailable,
	assertProductionBuildExcludesBrowserFakes,
	availablePort,
	blockExternalBrowserTraffic,
	closeBrowserResources,
	createConversation,
	createKnowledgeBase,
	isolatedEnvironment,
	platformSandboxEnvironment,
	prepareSandboxDirectories,
	startNetworkGuardedProcess,
	stopProcess,
	type RunningProcess,
	waitUntil,
} from "./support/browser-harness";

const WEB_PORT = 5180;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const FAKE_MODEL_MARKER = "browser-foundation-fake-model";
const FORBIDDEN_PARENT_ENV = [
	"ANTHROPIC_API_KEY",
	"ATLASCLOUD_API_KEY",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AZURE_OPENAI_API_KEY",
	"GOOGLE_API_KEY",
	"OPENAI_API_KEY",
	"PI_CONFIG_DIR",
	"XDG_CONFIG_HOME",
] as const;

interface BrowserEvidence {
	health: { status: number; body: unknown };
	knowledgeBases: { status: number; body: unknown };
	conversationsA: { status: number; body: unknown };
	conversationsB: { status: number; body: unknown };
	sharedPageA: { status: number; body: unknown };
	sharedPageB: { status: number; body: unknown };
	chosenDirectory: { status: number; body: unknown };
	promptStatus: number;
	promptContentType: string | null;
	promptBody: string;
}

interface ActiveKnowledgeBaseResponse {
	ok: boolean;
	data: {
		active: {
			kb: { name: string; path: string };
			conversation: { id: string };
		} | null;
	};
}

interface ConversationListResponse {
	ok: boolean;
	data: Array<{ id: string }>;
}

test("browser foundation uses real frontend, HTTP, SSE, and backend processing", { timeout: 90_000 }, async (t) => {
	for (const name of FORBIDDEN_PARENT_ENV) assert.equal(process.env[name], undefined, `${name} was not cleared`);
	await assertPortAvailable(WEB_PORT);
	const sandbox = await mkdtemp(join(tmpdir(), "llm-wiki-browser-foundation-"));
	const home = join(sandbox, "home");
	const appDir = join(home, ".llm-wiki-agent");
	const kbA = join(home, "llm-wiki", "atlas-notes");
	const kbB = join(home, "llm-wiki", "harbor-notes");
	const serverNetworkProbe = join(home, "server-network-probe.txt");
	const viteNetworkProbe = join(home, "vite-network-probe.txt");
	const backendPort = await availablePort();
	await prepareSandboxDirectories(home);
	let server: RunningProcess | undefined;
	let vite: RunningProcess | undefined;
	let browserServer: BrowserServer | undefined;
	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	let cleanupComplete = false;

	const cleanup = async () => {
		if (cleanupComplete) return;
		const errors: unknown[] = [];
		await closeBrowserResources({ context, browser, browserServer }).catch((error) => errors.push(error));
		context = undefined;
		browser = undefined;
		browserServer = undefined;
		if (vite) {
			try {
				await stopProcess(vite, [0, 143]);
				vite = undefined;
			} catch (error) {
				errors.push(error);
			}
		}
		if (server) {
			try {
				await stopProcess(server);
				server = undefined;
			} catch (error) {
				errors.push(error);
			}
		}
		await assertPortAvailable(WEB_PORT).catch((error) => errors.push(error));
		await assertPortAvailable(backendPort).catch((error) => errors.push(error));
		await rm(sandbox, { recursive: true, force: true }).catch((error) => errors.push(error));
		if (errors.length > 0) throw new AggregateError(errors, "browser foundation cleanup failed");
		cleanupComplete = true;
	};
	t.after(cleanup);

	await createKnowledgeBase(kbA, "Atlas Notes", "Atlas-only fictional signal");
	await createKnowledgeBase(kbB, "Harbor Notes", "Harbor-only fictional signal");
	await installInitSkill(home);
	await createConversation(appDir, kbA, "Atlas opening message");
	await createConversation(appDir, kbB, "Harbor opening message");
	await mkdir(appDir, { recursive: true });
	await writeFile(join(appDir, "config.json"), `${JSON.stringify({
		version: 1,
		externalKnowledgeBases: [kbA, kbB],
		lastUsedKbPath: kbA,
	}, null, 2)}\n`);

	server = await startNetworkGuardedProcess(
		process.execPath,
		["--import", "tsx", SERVER_ENTRY],
		REPO_ROOT,
		isolatedEnvironment(home, backendPort, kbB),
		(output) => output.includes("listening on http://"),
		"browser backend",
		serverNetworkProbe,
	);
	vite = await startNetworkGuardedProcess(
		process.execPath,
		[VITE_ENTRY, "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"],
		WEB_ROOT,
		{
			HOME: home,
			LANG: "C.UTF-8",
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			TMPDIR: join(home, "tmp"),
			LLM_WIKI_AGENT_API_ORIGIN: `http://127.0.0.1:${backendPort}`,
			LLM_WIKI_AGENT_DISABLE_HMR: "1",
			...platformSandboxEnvironment(home),
		},
		(output) => output.includes("Local:"),
		"Vite frontend",
		viteNetworkProbe,
	);

	browserServer = await chromium.launchServer({
		headless: true,
		env: {
			HOME: home,
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			TMPDIR: join(home, "tmp"),
			LANG: "C.UTF-8",
			...platformSandboxEnvironment(home),
		},
	});
	browser = await chromium.connect(browserServer.wsEndpoint());
	context = await browser.newContext({ serviceWorkers: "block" });
	const blockedExternalRequests: string[] = [];
	await blockExternalBrowserTraffic(context, blockedExternalRequests);

	const page = await context.newPage();
	const apiRequests = new Set<string>();
	let eventStreamSeen = false;
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.pathname.startsWith("/api/")) apiRequests.add(url.pathname);
		if (url.pathname === "/api/events") eventStreamSeen = true;
	});
	await page.goto(WEB_ORIGIN, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
	await page.getByText("atlas-notes", { exact: false }).first().waitFor({ timeout: START_TIMEOUT_MS });
	await waitUntil(() => eventStreamSeen, OPERATION_TIMEOUT_MS, "browser did not open the real event stream");

	const evidence = await page.evaluate<BrowserEvidence>(`(async () => {
		const { kbAPath, kbBPath, operationTimeoutMs } = ${JSON.stringify({
			kbAPath: kbA,
			kbBPath: kbB,
			operationTimeoutMs: OPERATION_TIMEOUT_MS,
		})};
		const json = async (path, init) => {
			const response = await fetch(path, {
				...init,
				signal: AbortSignal.timeout(operationTimeoutMs),
			});
			return { status: response.status, body: await response.json() };
		};
		const health = await json("/api/health");
		const knowledgeBases = await json("/api/knowledge-bases");
		const conversationsA = await json("/api/conversations?kb=" + encodeURIComponent(kbAPath));
		const conversationsB = await json("/api/conversations?kb=" + encodeURIComponent(kbBPath));
		const sharedPageA = await json("/api/page?kb=" + encodeURIComponent(kbAPath) + "&path=" + encodeURIComponent("wiki/entities/shared.md"));
		const sharedPageB = await json("/api/page?kb=" + encodeURIComponent(kbBPath) + "&path=" + encodeURIComponent("wiki/entities/shared.md"));
		const chosenDirectory = await json("/api/system/choose-directory", { method: "POST" });
		const promptResponse = await fetch("/api/prompt", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "[retrieval-owner] [[wiki/entities/shared.md]]" }),
			signal: AbortSignal.timeout(operationTimeoutMs),
		});
		return {
			health,
			knowledgeBases,
			conversationsA,
			conversationsB,
			sharedPageA,
			sharedPageB,
			chosenDirectory,
			promptStatus: promptResponse.status,
			promptContentType: promptResponse.headers.get("content-type"),
			promptBody: await promptResponse.text(),
		};
	})()`);

	assert.equal(evidence.health.status, 200);
	assert.equal(evidence.knowledgeBases.status, 200);
	assert.equal((evidence.knowledgeBases.body as { data: unknown[] }).data.length, 2);
	assert.equal(evidence.conversationsA.status, 200);
	assert.equal(evidence.conversationsB.status, 200);
	assert.equal(evidence.sharedPageA.status, 200);
	assert.equal(evidence.sharedPageB.status, 200);
	assert.equal((evidence.conversationsA.body as { data: unknown[] }).data.length, 1);
	assert.equal((evidence.conversationsB.body as { data: unknown[] }).data.length, 1);
	const conversationsA = JSON.stringify(evidence.conversationsA.body);
	const conversationsB = JSON.stringify(evidence.conversationsB.body);
	assert.match(conversationsA, /Atlas opening message/);
	assert.doesNotMatch(conversationsA, /Harbor opening message/);
	assert.match(conversationsB, /Harbor opening message/);
	assert.doesNotMatch(conversationsB, /Atlas opening message/);
	const sharedPageA = JSON.stringify(evidence.sharedPageA.body);
	const sharedPageB = JSON.stringify(evidence.sharedPageB.body);
	assert.match(sharedPageA, /Atlas-only fictional signal/);
	assert.doesNotMatch(sharedPageA, /Harbor-only fictional signal/);
	assert.match(sharedPageB, /Harbor-only fictional signal/);
	assert.doesNotMatch(sharedPageB, /Atlas-only fictional signal/);
	assert.deepEqual(evidence.chosenDirectory, {
		status: 200,
		body: { ok: true, data: { path: kbB } },
	});
	assert.equal(evidence.promptStatus, 200);
	assert.match(evidence.promptContentType ?? "", /text\/event-stream/);
	assert.match(evidence.promptBody, /retrieval-owner:atlas/);
	assert.doesNotMatch(evidence.promptBody, /retrieval-owner:harbor|retrieval-owner:none/);
	assert.match(evidence.promptBody, /assistant_done/);
	assert.match(server.output(), new RegExp(FAKE_MODEL_MARKER));
	assert.equal(apiRequests.has("/api/knowledge-base"), true);
	assert.equal(apiRequests.has("/api/events"), true);
	assert.equal(
		blockedExternalRequests.every((origin) =>
			origin === "https://fonts.googleapis.com" || origin === "https://fonts.gstatic.com"),
		true,
	);

	await page.getByRole("tab", { name: "图谱" }).click();
	await page.getByRole("tab", { name: "图谱", selected: true }).waitFor({ timeout: START_TIMEOUT_MS });
	await page.getByRole("button", { name: "新建知识库" }).click();
	await page.getByText("在默认目录下创建一个完整的 llm-wiki 知识库。").waitFor();
	await page.getByPlaceholder("stage2-research").fill("browser-created");
	await page.getByPlaceholder("研究方向").fill("Browser-created research");
	const createRequest = page.waitForRequest((request) => (
		new URL(request.url()).pathname === "/api/knowledge-bases/new" && request.method() === "POST"
	));
	await page.getByRole("button", { name: "创建" }).click();
	assert.deepEqual((await createRequest).postDataJSON(), {
		name: "browser-created",
		purpose: "Browser-created research",
	});
	await page.getByRole("dialog").waitFor({ state: "detached", timeout: START_TIMEOUT_MS });
	await page.getByLabel("当前知识库").getByText("browser-created", { exact: true }).waitFor({ timeout: START_TIMEOUT_MS });
	await page.getByRole("tab", { name: "对话", selected: true }).waitFor({ timeout: START_TIMEOUT_MS });
	await page.locator(".shell-sidebar").getByText("browser-created", { exact: true }).waitFor({ timeout: START_TIMEOUT_MS });
	const createdContext = await page.evaluate(async (): Promise<ActiveKnowledgeBaseResponse> => {
		const response = await fetch("/api/knowledge-base");
		return response.json();
	});
	assert.equal(createdContext.ok, true);
	assert.equal(createdContext.data.active?.kb.name, "browser-created");
	assert.ok(createdContext.data.active?.conversation.id);
	const createdConversations = await page.evaluate(async (kbPath): Promise<ConversationListResponse> => {
		const response = await fetch(`/api/conversations?kb=${encodeURIComponent(kbPath)}`);
		return response.json();
	}, createdContext.data.active?.kb.path ?? "");
	assert.equal(createdConversations.ok, true);
	assert.equal(
		createdConversations.data.some((conversation) => conversation.id === createdContext.data.active?.conversation.id),
		true,
	);

	const selectionFailureName = "browser-selection-failure";
	const rejectNewWikiSelection = async (route: import("playwright").Route) => {
		const request = route.request();
		if (
			request.method() === "POST" &&
			(request.postDataJSON() as { kbPath?: unknown }).kbPath === join(home, "llm-wiki", selectionFailureName)
		) {
			await route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					code: "INTERNAL_ERROR",
					message: "无法进入新知识库，请重试",
				}),
			});
			return;
		}
		await route.continue();
	};
	await page.route("**/api/knowledge-base", rejectNewWikiSelection);
	await page.getByRole("button", { name: "新建知识库" }).click();
	await page.getByPlaceholder("stage2-research").fill(selectionFailureName);
	await page.getByPlaceholder("研究方向").fill("Selection failure coverage");
	const selectionRequest = page.waitForRequest((request) => (
		new URL(request.url()).pathname === "/api/knowledge-base" &&
		request.method() === "POST" &&
		(request.postDataJSON() as { kbPath?: unknown }).kbPath === join(home, "llm-wiki", selectionFailureName)
	));
	await page.getByRole("button", { name: "创建" }).click();
	await selectionRequest;
	await page.getByText("无法进入新知识库，请重试").waitFor({ timeout: START_TIMEOUT_MS });
	assert.ok(await page.getByText("无法进入新知识库，请重试").isVisible());
	assert.ok(await page.getByRole("dialog").isVisible());
	await page.locator(".shell-sidebar").getByText(selectionFailureName, { exact: true }).waitFor({ timeout: START_TIMEOUT_MS });
	const failedSelectionContext = await page.evaluate(async (): Promise<ActiveKnowledgeBaseResponse> => {
		const response = await fetch("/api/knowledge-base");
		return response.json();
	});
	assert.equal(failedSelectionContext.data.active?.kb.name, "browser-created");
	await page.unroute("**/api/knowledge-base", rejectNewWikiSelection);
	await page.getByRole("button", { name: "取消" }).click();

	await cleanup();
	await assertProductionBuildExcludesBrowserFakes();
});

async function installInitSkill(home: string): Promise<void> {
	const skillRoot = join(home, ".codex", "skills", "llm-wiki-skill");
	const scriptPath = join(skillRoot, "scripts", "init-wiki.sh");
	await mkdir(join(skillRoot, "scripts"), { recursive: true });
	await cp(join(REPO_ROOT, "scripts", "init-wiki.sh"), scriptPath);
	await cp(join(REPO_ROOT, "templates"), join(skillRoot, "templates"), { recursive: true });
	await chmod(scriptPath, 0o755);
}
