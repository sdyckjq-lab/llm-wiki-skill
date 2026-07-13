import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	networkGuardEnvironment,
	platformSandboxEnvironment,
	prepareSandboxDirectories,
	startProcess,
	stopProcess,
	type RunningProcess,
	waitForFile,
	waitUntil,
} from "./support/browser-harness";

const WEB_PORT = 5180;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const FAKE_MODEL_MARKER = "browser-foundation-fake-model";
const FORBIDDEN_PARENT_ENV = [
	"ANTHROPIC_API_KEY",
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
	await createConversation(appDir, kbA, "Atlas opening message");
	await createConversation(appDir, kbB, "Harbor opening message");
	await mkdir(appDir, { recursive: true });
	await writeFile(join(appDir, "config.json"), `${JSON.stringify({
		version: 1,
		externalKnowledgeBases: [kbA, kbB],
		lastUsedKbPath: kbA,
	}, null, 2)}\n`);

	server = await startProcess(
		process.execPath,
		["--import", "tsx", SERVER_ENTRY],
		REPO_ROOT,
		isolatedEnvironment(home, backendPort, kbB, serverNetworkProbe),
		(output) => output.includes("listening on http://"),
		"browser backend",
	);
	vite = await startProcess(
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
			...networkGuardEnvironment(viteNetworkProbe),
		},
		(output) => output.includes("Local:"),
		"Vite frontend",
	);
	await waitForFile(serverNetworkProbe, OPERATION_TIMEOUT_MS);
	await waitForFile(viteNetworkProbe, OPERATION_TIMEOUT_MS);
	assert.equal(await readFile(serverNetworkProbe, "utf8"), "BLOCKED");
	assert.equal(await readFile(viteNetworkProbe, "utf8"), "BLOCKED");

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
			body: JSON.stringify({ message: "Foundation probe" }),
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
		body: { ok: true, path: kbB },
	});
	assert.equal(evidence.promptStatus, 200);
	assert.match(evidence.promptContentType ?? "", /text\/event-stream/);
	assert.match(evidence.promptBody, /可控的测试回复/);
	assert.match(evidence.promptBody, /assistant_done/);
	assert.match(server.output(), new RegExp(FAKE_MODEL_MARKER));
	assert.equal(apiRequests.has("/api/knowledge-base"), true);
	assert.equal(apiRequests.has("/api/events"), true);
	assert.equal(
		blockedExternalRequests.every((origin) =>
			origin === "https://fonts.googleapis.com" || origin === "https://fonts.gstatic.com"),
		true,
	);

	await cleanup();
	await assertProductionBuildExcludesBrowserFakes();
});
