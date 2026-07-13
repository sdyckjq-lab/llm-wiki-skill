import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chromium, type Browser, type BrowserContext, type BrowserServer, type Page } from "playwright";

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
	createKnowledgeBase as createBaseKnowledgeBase,
	isolatedEnvironment,
	networkGuardEnvironment,
	platformSandboxEnvironment,
	prepareSandboxDirectories,
	sanitizeBrowserOutput,
	startProcess,
	stopProcess,
	type RunningProcess,
	waitForFile,
	waitUntil,
} from "./support/browser-harness";

const FAILURE_DIR = join(REPO_ROOT, ".tmp/browser-main-flows");
const WEB_PORT = 5180;
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

test("seven browser main flows cross the real frontend and backend", { timeout: 210_000 }, async (t) => {
	for (const name of FORBIDDEN_PARENT_ENV) assert.equal(process.env[name], undefined, `${name} was not cleared`);
	await rm(FAILURE_DIR, { recursive: true, force: true });
	await assertPortAvailable(WEB_PORT);
	const sandbox = await mkdtemp(join(tmpdir(), "llm-wiki-browser-main-flows-"));
	const home = join(sandbox, "home");
	const appDir = join(home, ".llm-wiki-agent");
	const kbA = join(home, "llm-wiki", "atlas-notes");
	const kbB = join(home, "llm-wiki", "harbor-notes");
	const serverNetworkProbe = join(home, "server-network-probe.txt");
	const viteNetworkProbe = join(home, "vite-network-probe.txt");
	const backendPort = await availablePort();
	const webPort = WEB_PORT;
	const webOrigin = `http://127.0.0.1:${webPort}`;
	let server: RunningProcess | undefined;
	let vite: RunningProcess | undefined;
	let browserServer: BrowserServer | undefined;
	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	let page: Page | undefined;
	let cleanupComplete = false;

	const cleanup = async () => {
		if (cleanupComplete) return;
		const errors: unknown[] = [];
		await closeBrowserResources({ context, browser, browserServer }).catch((error) => errors.push(error));
		context = undefined;
		browser = undefined;
		browserServer = undefined;
		if (vite) await stopProcess(vite, [0, 143]).catch((error) => errors.push(error));
		vite = undefined;
		if (server) await stopProcess(server).catch((error) => errors.push(error));
		server = undefined;
		await assertPortAvailable(webPort).catch((error) => errors.push(error));
		await assertPortAvailable(backendPort).catch((error) => errors.push(error));
		await rm(sandbox, { recursive: true, force: true }).catch((error) => errors.push(error));
		cleanupComplete = true;
		if (errors.length > 0) throw new AggregateError(errors, "browser main flows cleanup failed");
	};
	t.after(cleanup);

	try {
		await prepareSandboxDirectories(home);
		await createKnowledgeBase(kbA, "Atlas Notes", "Atlas-only fictional signal");
		await createKnowledgeBase(kbB, "Harbor Notes", "Harbor-only fictional signal");
		const atlasConversation = await createConversation(appDir, kbA, "Atlas opening message");
		const harborConversation = await createConversation(appDir, kbB, "Harbor opening message");
		await createArtifacts(appDir, atlasConversation, kbA);
		const authDir = join(home, ".pi", "agent");
		await mkdir(authDir, { recursive: true });
		await writeFile(join(authDir, "auth.json"), `${JSON.stringify({
			anthropic: { type: "api_key", key: "fictional-browser-credential" },
		}, null, 2)}\n`);
		await chmod(join(authDir, "auth.json"), 0o600);
		await mkdir(appDir, { recursive: true });
		await writeFile(join(appDir, "config.json"), `${JSON.stringify({
			version: 1,
			externalKnowledgeBases: [kbA, kbB],
			lastUsedKbPath: kbA,
			modelRoles: {
				main: { provider: "browser-test-provider", modelId: "browser-test-model" },
			},
		}, null, 2)}\n`);

		server = await startBackend(home, backendPort, kbB, serverNetworkProbe);
		vite = await startProcess(
			process.execPath,
			[VITE_ENTRY, "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
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
		await Promise.all([waitForFile(serverNetworkProbe), waitForFile(viteNetworkProbe)]);
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
		context = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
		const blockedExternalRequests: string[] = [];
		await blockExternalBrowserTraffic(context, blockedExternalRequests);
		page = await context.newPage();
		const apiRequests = new Set<string>();
		let graphEventsSeen = false;
		page.on("request", (request) => {
			const url = new URL(request.url());
			if (url.pathname.startsWith("/api/")) apiRequests.add(url.pathname);
			if (url.pathname === "/api/events") graphEventsSeen = true;
		});
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByText("atlas-notes", { exact: false }).first().waitFor({ timeout: START_TIMEOUT_MS });

		// Knowledge bases: selection, clearing, restart recovery, and isolation.
		await page.getByText("harbor-notes", { exact: true }).click();
		await page.getByLabel("当前知识库").getByText("harbor-notes").waitFor();
		assert.equal(await activeConversationId(page), harborConversation);
		await page.getByLabel("用户气泡").getByText("Harbor opening message", { exact: true }).waitFor();
		assert.equal(await page.getByLabel("用户气泡").getByText("Atlas opening message", { exact: true }).count(), 0);
		assert.equal(await page.getByRole("button", { name: /产物/ }).count(), 0);
		const retrievalLogDir = join(appDir, "logs", "retrieval");
		await startComposerMessage(page, "[refs] show harbor page");
		await page.getByText("wiki/entities/shared.md", { exact: true }).last().click();
		await page.getByText("Harbor-only fictional signal", { exact: false }).waitFor();
		await page.getByLabel("关闭").last().click();
		await waitUntil(
			() => readdir(retrievalLogDir).then((files) => files.some((file) => file.endsWith(".jsonl")), () => false),
			OPERATION_TIMEOUT_MS,
			"retrieval log did not appear",
		);
		const retrievalEntries = (await Promise.all(
			(await readdir(retrievalLogDir))
				.filter((file) => file.endsWith(".jsonl"))
				.map((file) => readFile(join(retrievalLogDir, file), "utf8")),
		)).flatMap((content) => content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
			sessionId: string;
			kbPath: string;
			triggered: boolean;
			results: Array<{ path: string }>;
		}));
		assert.equal(retrievalEntries.some((entry) => (
			entry.sessionId === harborConversation
			&& entry.kbPath === kbB
			&& entry.triggered
			&& entry.results.some((result) => result.path === "wiki/entities/shared.md")
		)), true);
		await page.getByRole("tab", { name: "图谱" }).click();
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByText("2 节点 · 0 关联", { exact: true }).waitFor();
		await page.getByRole("tab", { name: "对话" }).click();
		await assertBrowserJson(page, `/api/page?kb=${encodeURIComponent(kbB)}&path=${encodeURIComponent("wiki/entities/shared.md")}`, 200, /Harbor-only fictional signal/);
		await assertBrowserJson(page, `/api/page?kb=${encodeURIComponent(kbA)}&path=${encodeURIComponent("wiki/entities/shared.md")}`, 200, /Atlas-only fictional signal/);
		await assertBrowserJson(page, `/api/conversations?kb=${encodeURIComponent(kbB)}`, 200, /Harbor opening message/);
		assert.doesNotMatch((await browserJson(page, `/api/conversations?kb=${encodeURIComponent(kbB)}`)).text, /Atlas opening message/);
		await assertBrowserJson(page, `/api/graph?kb=${encodeURIComponent(kbB)}`, 200, /Harbor-only fictional signal/);
		assert.doesNotMatch((await browserJson(page, `/api/graph?kb=${encodeURIComponent(kbB)}`)).text, /Atlas-only fictional signal/);
		assert.deepEqual(JSON.parse((await browserJson(page, `/api/artifacts?conversation=${encodeURIComponent(harborConversation)}`)).text).data, []);
		assert.equal(JSON.parse((await browserJson(page, `/api/artifacts?conversation=${encodeURIComponent(atlasConversation)}`)).text).data.length, 2);
		await page.evaluate(() => fetch("/api/knowledge-base", { method: "DELETE" }).then((response) => response.json()));
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.getByText("左侧选一个知识库进入对话").waitFor();
		await page.getByText("atlas-notes", { exact: true }).click();
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor();

		await page.goto("about:blank");
		server = await restartBackend(server, home, backendPort, kbB, serverNetworkProbe);
		graphEventsSeen = false;
		const graphEventsResponse = page.waitForResponse((response) => (
			new URL(response.url()).pathname === "/api/events" && response.status() === 200
		));
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await graphEventsResponse;
		await waitUntil(() => graphEventsSeen, OPERATION_TIMEOUT_MS, "browser did not reconnect graph events");
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByLabel("用户气泡").getByText("Atlas opening message", { exact: true }).waitFor();
		assert.equal(await page.getByLabel("用户气泡").getByText("Harbor opening message", { exact: true }).count(), 0);
		await page.getByRole("button", { name: /产物 2/ }).waitFor();

		// Conversations: create, retain an empty conversation, switch, and refresh.
		await page.getByLabel("新对话").click();
		await page.getByText("(新对话)", { exact: true }).waitFor();
		let emptyConversationId: string | null = null;
		await waitUntil(async () => {
			emptyConversationId = await activeConversationId(page!);
			return emptyConversationId !== null;
		}, OPERATION_TIMEOUT_MS, "empty conversation did not become active");
		await page.reload({ waitUntil: "domcontentloaded" });
		await waitUntil(
			async () => await activeConversationId(page!) === emptyConversationId,
			OPERATION_TIMEOUT_MS,
			`empty conversation changed after refresh (original atlas conversation: ${atlasConversation})`,
		);
		await page.getByText("Atlas opening message", { exact: true }).click();
		await waitUntil(
			async () => await activeConversationId(page!) === atlasConversation,
			OPERATION_TIMEOUT_MS,
			"original conversation was not selected",
		);

		// Pages and refs: missing page is recoverable, then a real page opens.
		await startComposerMessage(page, "[refs] show both pages");
		await page.getByText("wiki/entities/shared.md", { exact: true }).waitFor({ timeout: OPERATION_TIMEOUT_MS });
		await page.getByText("wiki/entities/missing.md", { exact: true }).click();
		await page.getByText("页面不存在", { exact: false }).waitFor();
		await page.getByLabel("关闭").last().click();
		await page.getByText("wiki/entities/shared.md", { exact: true }).click();
		await page.getByText("Atlas-only fictional signal", { exact: false }).waitFor();
		await page.getByLabel("关闭").last().click();

		// Graph: real read, rebuild, queued busy state, failure recovery, and event stream.
		await page.getByRole("tab", { name: "图谱" }).click();
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByText("1 节点 · 0 关联", { exact: true }).waitFor();
		const rebuildRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/graph/rebuild" && request.method() === "POST");
		const rebuildClick = page.getByRole("button", { name: "重构" }).click();
		await rebuildRequest;
		const busyResponses = await page.evaluate((kbPath) => Promise.all([0, 1].map(() => fetch(`/api/graph/rebuild?kb=${encodeURIComponent(kbPath)}`, { method: "POST" }).then(async (response) => ({ status: response.status, body: await response.text() })))), kbA);
		await rebuildClick;
		assert.equal(busyResponses.every((response) => response.status === 200), true);
		assert.equal(busyResponses.some((response) => /queued/.test(response.body)), true);
		await assertBrowserJson(page, `/api/graph?kb=${encodeURIComponent(join(home, "missing-kb"))}`, 404, /知识库/);
		await waitUntil(() => graphEventsSeen, OPERATION_TIMEOUT_MS, "browser did not open graph events");
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
		const graphDataPath = join(kbA, "wiki", "graph-data.json");
		const graphData = await readFile(graphDataPath, "utf8");
		await rm(graphDataPath, { force: true });
		await mkdir(graphDataPath);
		try {
			await page.getByRole("button", { name: "重构" }).click();
			await page.locator("[data-graph-status='error']").waitFor({ timeout: START_TIMEOUT_MS });
		} finally {
			await rm(graphDataPath, { recursive: true, force: true });
			await writeFile(graphDataPath, graphData);
		}
		await page.getByRole("button", { name: "重构" }).click();
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });

		// Messages: normal send, duplicate while busy, cancellation, disconnect recovery, and failure recovery.
		await page.getByRole("tab", { name: "对话" }).click();
		const modelFailureFlag = join(appDir, "browser-model-fail");
		await writeFile(modelFailureFlag, "fail");
		await startComposerMessage(page, "[fail] controlled failure");
		await page.getByText("出错", { exact: true }).waitFor();
		await rm(modelFailureFlag, { force: true });
		await sendComposerMessage(page, "after failure recovery");
		await startComposerMessage(page, "[slow] cancel this response");
		await page.getByText("生成中", { exact: true }).waitFor();
		await waitForFile(join(appDir, "browser-model-cancel-started"));
		const duplicate = await page.evaluate(() => fetch("/api/prompt", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "duplicate while busy" }),
		}).then(async (response) => ({ status: response.status, body: await response.text() })));
		assert.equal(duplicate.status, 409);
		assert.match(duplicate.body, /BUSY/);
		await page.getByRole("button", { name: "停止" }).click();
		await waitForFile(join(appDir, "browser-model-cancel-settled"));
		await page.getByPlaceholder(/写下想法/).waitFor({ state: "visible" });
		await sendComposerMessage(page, "after cancel recovery");
		await startComposerMessage(page, "[slow] disconnect this response");
		await page.getByText("生成中", { exact: true }).waitFor();
		await waitForFile(join(appDir, "browser-model-disconnect-started"));
		await page.close();
		await waitForFile(join(appDir, "browser-model-disconnect-settled"));
		page = await context.newPage();
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });
		await sendComposerMessage(page, "after disconnect recovery");

		// Artifacts: list, preview, download, missing resource prompt, then recover.
		await page.getByRole("button", { name: /产物 2/ }).click();
		await page.getByRole("button", { name: /Atlas HTML/ }).click();
		await page.getByTitle("Atlas HTML").waitFor();
		const downloadPromise = page.waitForEvent("download");
		await page.getByLabel("下载").click();
		const download = await downloadPromise;
		assert.equal(download.suggestedFilename(), "atlas.html");
		assert.equal(await download.failure(), null);
		const downloadPath = join(sandbox, "atlas-download.html");
		await download.saveAs(downloadPath);
		assert.match(await readFile(downloadPath, "utf8"), /Atlas artifact only/);
		await page.frameLocator('iframe[title="Atlas HTML"]').getByText("Atlas artifact only", { exact: true }).waitFor();
		await page.getByRole("button", { name: /Missing HTML/ }).click();
		await page.getByText("HTML 加载失败", { exact: true }).waitFor();
		await page.getByRole("button", { name: /Atlas HTML/ }).click();
		await page.getByTitle("Atlas HTML").waitFor();
		await page.getByLabel("关闭").last().click();

		// Settings and models: persisted setting, model list, and redacted auth status.
		await page.getByRole("button", { name: "设置" }).last().click();
		await page.getByText("auth.json：已存在", { exact: true }).waitFor();
		assert.equal((await page.locator("select").nth(1).locator("option").allTextContents()).length > 1, true);
		const skillsToggle = page.getByRole("checkbox");
		await skillsToggle.check();
		await waitUntil(async () => {
			const config = JSON.parse((await browserJson(page!, "/api/config")).text) as { data?: { showUserGlobalSkills?: boolean } };
			return config.data?.showUserGlobalSkills === true;
		}, OPERATION_TIMEOUT_MS, "settings were not saved");
		const authBody = (await browserJson(page, "/api/auth/status")).text;
		const authStatus = JSON.parse(authBody) as { data: { providers: Array<{ id: string }>; envKeys: Array<{ present: boolean }> } };
		assert.deepEqual(authStatus.data.providers.map((provider) => provider.id), ["anthropic"]);
		assert.equal(authStatus.data.envKeys.every((item) => item.present === false), true);
		assert.doesNotMatch(authBody, /\.pi\/agent\/auth\.json|fictional-browser-credential|(?:sk-|github_pat_)[A-Za-z0-9_-]{12,}/i);

		assert.equal(apiRequests.has("/api/knowledge-base"), true);
		assert.equal(apiRequests.has("/api/events"), true);
		assert.equal(blockedExternalRequests.every((origin) => origin === "https://fonts.googleapis.com" || origin === "https://fonts.gstatic.com"), true);
		await cleanup();
		await assertProductionBuildExcludesBrowserFakes();
		await rm(FAILURE_DIR, { recursive: true, force: true });
	} catch (error) {
		await mkdir(FAILURE_DIR, { recursive: true });
		await page?.screenshot({ path: join(FAILURE_DIR, "failure.png"), fullPage: true }).catch(() => undefined);
		const raw = `${server?.output() ?? ""}\n${vite?.output() ?? ""}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
		await writeFile(join(FAILURE_DIR, "failure.log"), sanitizeBrowserOutput(raw, sandbox), "utf8");
		throw error;
	}
});

async function startBackend(home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	return startProcess(
		process.execPath,
		["--import", "tsx", SERVER_ENTRY],
		REPO_ROOT,
		isolatedEnvironment(home, port, selectedDirectory, networkProbeFile),
		(output) => output.includes("listening on http://"),
		"browser backend",
	);
}

async function restartBackend(running: RunningProcess, home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	await stopProcess(running);
	return startBackend(home, port, selectedDirectory, networkProbeFile);
}

async function createKnowledgeBase(path: string, title: string, sharedText: string): Promise<void> {
	await createBaseKnowledgeBase(path, title, sharedText);
	const harborNode = title === "Harbor Notes"
		? [{ id: "harbor-extra", label: "Harbor extra", type: "entity", community: null, content: "Harbor-only second node", source_path: join(path, "wiki/entities/shared.md") }]
		: [];
	await writeFile(join(path, "wiki/graph-data.json"), `${JSON.stringify({
		meta: { build_date: "2026-07-13T00:00:00Z", wiki_title: title, total_nodes: 1 + harborNode.length, total_edges: 0, initial_view: ["shared", ...harborNode.map((node) => node.id)], degraded: false },
		nodes: [{ id: "shared", label: `${title} shared`, type: "entity", community: null, content: sharedText, source_path: join(path, "wiki/entities/shared.md") }, ...harborNode],
		edges: [],
	}, null, 2)}\n`);
}

async function createArtifacts(appDir: string, conversationId: string, kbPath: string): Promise<void> {
	const artifacts = [
		{ id: randomUUID(), title: "Atlas HTML", primaryFile: "atlas.html", content: "<!doctype html><title>Atlas HTML preview</title><main>Atlas artifact only</main>" },
		{ id: randomUUID(), title: "Missing HTML", primaryFile: "missing.html", content: null },
	];
	for (const artifact of artifacts) {
		const dir = join(appDir, "artifacts", artifact.id);
		await mkdir(dir, { recursive: true });
		if (artifact.content) await writeFile(join(dir, artifact.primaryFile), artifact.content);
		await writeFile(join(dir, "manifest.json"), `${JSON.stringify({
			id: artifact.id,
			kind: "html",
			renderer: "iframe",
			metadata: { title: artifact.title, createdAt: new Date().toISOString(), sourceConversationId: conversationId, sourceKbPath: kbPath, sourceSkill: "browser-fixture", sizeBytes: artifact.content?.length ?? 1 },
			files: [{ name: artifact.primaryFile, sizeBytes: artifact.content?.length ?? 1, mimeType: "text/html; charset=utf-8" }],
			primaryFile: artifact.primaryFile,
		}, null, 2)}\n`);
	}
}

async function sendComposerMessage(page: Page, message: string): Promise<void> {
	const responsePromise = page.waitForResponse((response) => {
		const request = response.request();
		return new URL(response.url()).pathname === "/api/prompt" && request.method() === "POST";
	});
	await startComposerMessage(page, message);
	await page.getByLabel("助手气泡").getByText(`可控的测试回复：${message}`, { exact: true }).last().waitFor({ timeout: OPERATION_TIMEOUT_MS });
	const response = await responsePromise;
	assert.equal(await response.finished(), null);
	await page.getByPlaceholder(/写下想法/).waitFor({ state: "visible" });
}

async function startComposerMessage(page: Page, message: string): Promise<void> {
	const composer = page.getByPlaceholder(/写下想法/);
	await composer.fill(message);
	await page.getByRole("button", { name: "发送" }).click();
}

async function activeConversationId(page: Page): Promise<string | null> {
	const result = await page.evaluate(() => fetch("/api/knowledge-base").then((response) => response.json())) as { data: { active: { conversation: { id: string } } | null } };
	return result.data.active?.conversation.id ?? null;
}

async function assertBrowserJson(page: Page, path: string, expectedStatus: number, expectedBody: RegExp): Promise<void> {
	const result = await browserJson(page, path);
	assert.equal(result.status, expectedStatus);
	assert.match(result.text, expectedBody);
}

async function browserJson(page: Page, path: string): Promise<{ status: number; text: string }> {
	return page.evaluate((url) => fetch(url, { signal: AbortSignal.timeout(8_000) }).then(async (response) => ({ status: response.status, text: await response.text() })), path);
}
