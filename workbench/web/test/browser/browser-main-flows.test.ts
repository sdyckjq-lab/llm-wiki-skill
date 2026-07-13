import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { chromium, type Browser, type BrowserContext, type BrowserServer, type Page } from "playwright";

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const WEB_ROOT = join(REPO_ROOT, "workbench/web");
const SERVER_ENTRY = join(REPO_ROOT, "workbench/server/test/browser-entry.ts");
const NETWORK_GUARD = join(REPO_ROOT, "workbench/server/test/support/network-guard.mjs");
const VITE_ENTRY = join(REPO_ROOT, "node_modules/vite/bin/vite.js");
const FAILURE_DIR = join(REPO_ROOT, ".tmp/browser-main-flows");
const WEB_PORT = 5180;
const START_TIMEOUT_MS = 30_000;
const OPERATION_TIMEOUT_MS = 12_000;
const STOP_TIMEOUT_MS = 5_000;
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

interface RunningProcess {
	child: ChildProcess;
	output: () => string;
}

test("seven browser main flows cross the real frontend and backend", { timeout: 210_000 }, async (t) => {
	for (const name of FORBIDDEN_PARENT_ENV) assert.equal(process.env[name], undefined, `${name} was not cleared`);
	await rm(FAILURE_DIR, { recursive: true, force: true });
	const sandbox = await mkdtemp(join(tmpdir(), "llm-wiki-browser-main-flows-"));
	const home = join(sandbox, "home");
	const appDir = join(home, ".llm-wiki-agent");
	const kbA = join(home, "llm-wiki", "atlas-notes");
	const kbB = join(home, "llm-wiki", "harbor-notes");
	const serverNetworkProbe = join(home, "server-network-probe.txt");
	const viteNetworkProbe = join(home, "vite-network-probe.txt");
	await assertPortAvailable(WEB_PORT);
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
		if (context) await withTimeout(context.close(), STOP_TIMEOUT_MS, "browser context did not close").catch((error) => errors.push(error));
		context = undefined;
		if (browser) await withTimeout(browser.close(), STOP_TIMEOUT_MS, "browser did not close").catch((error) => errors.push(error));
		browser = undefined;
		if (browserServer && browserServer.process().exitCode === null && browserServer.process().signalCode === null) {
			await withTimeout(browserServer.close(), STOP_TIMEOUT_MS, "browser server did not close").catch(async (error) => {
				errors.push(error);
				await withTimeout(browserServer!.kill(), STOP_TIMEOUT_MS, "browser process could not be killed").catch((killError) => errors.push(killError));
			});
		}
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
		await mkdir(appDir, { recursive: true });
		await writeFile(join(appDir, "config.json"), `${JSON.stringify({
			version: 1,
			externalKnowledgeBases: [kbA, kbB],
			lastUsedKbPath: kbA,
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

		server = await restartBackend(server, home, backendPort, kbB, serverNetworkProbe);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });

		// Conversations: create, retain an empty conversation, switch, and refresh.
		await page.getByLabel("新对话").click();
		await page.getByText("(新对话)", { exact: true }).waitFor();
		const emptyConversationId = await activeConversationId(page);
		await page.reload({ waitUntil: "domcontentloaded" });
		assert.equal(
			await activeConversationId(page),
			emptyConversationId,
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

		// Messages: normal send, duplicate while busy, cancellation, disconnect recovery, and failure recovery.
		await page.getByRole("tab", { name: "对话" }).click();
		await startComposerMessage(page, "[slow] cancel this response");
		await page.getByText("生成中", { exact: true }).waitFor();
		const duplicate = await page.evaluate(() => fetch("/api/prompt", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "duplicate while busy" }),
		}).then(async (response) => ({ status: response.status, body: await response.text() })));
		assert.equal(duplicate.status, 409);
		assert.match(duplicate.body, /BUSY/);
		await page.getByRole("button", { name: "停止" }).click();
		await page.getByPlaceholder(/写下想法/).waitFor({ state: "visible" });
		await disconnectPrompt(page);
		await sendComposerMessage(page, "after disconnect recovery");
		await startComposerMessage(page, "[fail] controlled failure");
		await page.getByText("出错", { exact: true }).waitFor();
		await sendComposerMessage(page, "after failure recovery");

		// Artifacts: list, preview, download, missing resource prompt, then recover.
		await page.getByRole("button", { name: /产物 2/ }).click();
		await page.getByRole("button", { name: /Atlas HTML/ }).click();
		await page.getByTitle("Atlas HTML").waitFor();
		const downloadPromise = page.waitForEvent("download");
		await page.getByLabel("下载").click();
		const download = await downloadPromise;
		assert.equal(download.suggestedFilename(), "atlas.html");
		await page.getByRole("button", { name: /Missing HTML/ }).click();
		await page.getByText("HTML 加载失败", { exact: true }).waitFor();
		await page.getByRole("button", { name: /Atlas HTML/ }).click();
		await page.getByTitle("Atlas HTML").waitFor();
		await page.getByLabel("关闭").last().click();

		// Settings and models: persisted setting, model list, and redacted auth status.
		await page.getByRole("button", { name: "设置" }).last().click();
		await page.getByText("auth.json：未创建", { exact: true }).waitFor();
		assert.equal((await page.locator("select").nth(1).locator("option").allTextContents()).length > 0, true);
		const skillsToggle = page.getByRole("checkbox");
		await skillsToggle.check();
		await waitUntil(async () => {
			const config = JSON.parse((await browserJson(page!, "/api/config")).text) as { data?: { showUserGlobalSkills?: boolean } };
			return config.data?.showUserGlobalSkills === true;
		}, OPERATION_TIMEOUT_MS, "settings were not saved");
		const authBody = (await browserJson(page, "/api/auth/status")).text;
		const authStatus = JSON.parse(authBody) as { data: { providers: unknown[]; envKeys: Array<{ present: boolean }> } };
		assert.deepEqual(authStatus.data.providers, []);
		assert.equal(authStatus.data.envKeys.every((item) => item.present === false), true);
		assert.doesNotMatch(authBody, /\.pi\/agent\/auth\.json|(?:sk-|github_pat_)[A-Za-z0-9_-]{12,}/i);

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
		await writeFile(join(FAILURE_DIR, "failure.log"), sanitize(raw, sandbox), "utf8");
		throw error;
	}
});

async function startBackend(home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	return startProcess(process.execPath, ["--import", "tsx", SERVER_ENTRY], REPO_ROOT, {
		HOME: home,
		HOST: "127.0.0.1",
		PORT: String(port),
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		TMPDIR: join(home, "tmp"),
		LANG: "C.UTF-8",
		LLM_WIKI_BROWSER_SELECTED_DIRECTORY: selectedDirectory,
		...platformSandboxEnvironment(home),
		...networkGuardEnvironment(networkProbeFile),
	}, (output) => output.includes("listening on http://"), "browser backend");
}

async function restartBackend(running: RunningProcess, home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	await stopProcess(running);
	return startBackend(home, port, selectedDirectory, networkProbeFile);
}

async function createKnowledgeBase(path: string, title: string, sharedText: string): Promise<void> {
	await mkdir(join(path, "wiki/entities"), { recursive: true });
	await writeFile(join(path, ".wiki-schema.md"), `# ${title} schema\n`);
	await writeFile(join(path, "wiki/entities/shared.md"), `# ${title}\n\n${sharedText}\n`);
	await writeFile(join(path, "wiki/graph-data.json"), `${JSON.stringify({
		meta: { build_date: "2026-07-13T00:00:00Z", wiki_title: title, total_nodes: 1, total_edges: 0, initial_view: ["shared"], degraded: false },
		nodes: [{ id: "shared", label: `${title} shared`, type: "entity", community: null, content: sharedText, source_path: join(path, "wiki/entities/shared.md") }],
		edges: [],
	}, null, 2)}\n`);
}

async function createConversation(appDir: string, kbPath: string, message: string): Promise<string> {
	const hash = createHash("sha256").update(kbPath).digest("hex").slice(0, 16);
	const sessionDir = join(appDir, "sessions", hash);
	await mkdir(sessionDir, { recursive: true });
	const manager = SessionManager.create(REPO_ROOT, sessionDir);
	manager.appendMessage({ role: "user", content: [{ type: "text", text: message }], timestamp: Date.now() } as never);
	manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Fictional fixture reply" }], timestamp: Date.now() } as never);
	return manager.getSessionId();
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
	await startComposerMessage(page, message);
	await page.getByText("可控的测试回复", { exact: false }).last().waitFor({ timeout: OPERATION_TIMEOUT_MS });
	await page.getByPlaceholder(/写下想法/).waitFor({ state: "visible" });
}

async function startComposerMessage(page: Page, message: string): Promise<void> {
	const composer = page.getByPlaceholder(/写下想法/);
	await composer.fill(message);
	await page.getByRole("button", { name: "发送" }).click();
}

async function disconnectPrompt(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const controller = new AbortController();
		const request = fetch("/api/prompt", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "[slow] disconnect this response" }),
			signal: controller.signal,
		}).catch((error) => ({ name: error.name }));
		await new Promise((resolve) => setTimeout(resolve, 100));
		controller.abort();
		await request;
	});
	await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
}

async function activeConversationId(page: Page): Promise<string> {
	const result = await page.evaluate(() => fetch("/api/knowledge-base").then((response) => response.json())) as { data: { active: { conversation: { id: string } } } };
	return result.data.active.conversation.id;
}

async function assertBrowserJson(page: Page, path: string, expectedStatus: number, expectedBody: RegExp): Promise<void> {
	const result = await browserJson(page, path);
	assert.equal(result.status, expectedStatus);
	assert.match(result.text, expectedBody);
}

async function browserJson(page: Page, path: string): Promise<{ status: number; text: string }> {
	return page.evaluate((url) => fetch(url, { signal: AbortSignal.timeout(8_000) }).then(async (response) => ({ status: response.status, text: await response.text() })), path);
}

async function blockExternalBrowserTraffic(context: BrowserContext, blocked: string[]): Promise<void> {
	await context.route(/^https?:\/\/(?!127\.0\.0\.1(?::\d+)?(?:\/|$)|localhost(?::\d+)?(?:\/|$))/, async (route) => {
		blocked.push(new URL(route.request().url()).origin);
		await route.abort("blockedbyclient");
	});
	await context.routeWebSocket(/^wss?:\/\/(?!127\.0\.0\.1(?::\d+)?(?:\/|$)|localhost(?::\d+)?(?:\/|$))/, async (route) => {
		blocked.push(new URL(route.url()).origin);
		await route.close({ code: 1008, reason: "external connections are disabled in browser tests" });
	});
}

function networkGuardEnvironment(probeFile: string): NodeJS.ProcessEnv {
	return { NODE_OPTIONS: `--import=${NETWORK_GUARD}`, LLM_WIKI_BROWSER_NETWORK_PROBE_FILE: probeFile, LLM_WIKI_BROWSER_NETWORK_PROBE_TARGET: "http://192.0.2.1:9" };
}

async function prepareSandboxDirectories(home: string): Promise<void> {
	const directories = [join(home, "tmp")];
	if (process.platform === "win32") directories.push(join(home, "AppData", "Roaming"), join(home, "AppData", "Local"));
	await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

function platformSandboxEnvironment(home: string): Record<string, string> {
	if (process.platform !== "win32") return {};
	return { USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), LOCALAPPDATA: join(home, "AppData", "Local"), TEMP: join(home, "tmp"), TMP: join(home, "tmp"), ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
}

async function startProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, ready: (output: string) => boolean, name: string): Promise<RunningProcess> {
	const child = spawn(command, args, { cwd, detached: process.platform !== "win32", env, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => { output += chunk; }); child.stderr?.on("data", (chunk: string) => { output += chunk; });
	const running = { child, output: () => output };
	try {
		await waitUntil(() => ready(output), START_TIMEOUT_MS, `${name} did not start`, child, running.output);
		return running;
	} catch (error) {
		signalProcessTree(child, "SIGKILL");
		await waitForExit(child, 1_000, running.output).catch(() => undefined);
		throw new Error(`${String(error)}\n${output}`, { cause: error });
	}
}

async function stopProcess(running: RunningProcess, expectedExitCodes: readonly number[] = [0]): Promise<void> {
	if (running.child.exitCode !== null || running.child.signalCode !== null) return;
	signalProcessTree(running.child, "SIGTERM");
	let result: Awaited<ReturnType<typeof waitForExit>>;
	try { result = await waitForExit(running.child, STOP_TIMEOUT_MS, running.output); }
	catch (error) { signalProcessTree(running.child, "SIGKILL"); await waitForExit(running.child, 1_000, running.output).catch(() => undefined); throw error; }
	assert.equal(result.signal, null, running.output());
	if (process.platform !== "win32") assert.equal(expectedExitCodes.includes(result.code ?? -1), true, running.output());
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number, message: string, child?: ChildProcess, output?: () => string): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`${message}: process exited\n${output?.() ?? ""}`);
		if (Date.now() >= deadline) throw new Error(`${message}\n${output?.() ?? ""}`);
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
	}
}

async function waitForFile(path: string): Promise<void> {
	await waitUntil(() => stat(path).then(() => true, () => false), OPERATION_TIMEOUT_MS, `file did not appear: ${path}`);
}

async function waitForExit(child: ChildProcess, timeoutMs: number, output: () => string): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode, signal: child.signalCode };
	return new Promise((resolvePromise, reject) => {
		const timer = setTimeout(() => reject(new Error(`process did not stop within ${timeoutMs}ms\n${output()}`)), timeoutMs);
		child.once("exit", (code, signal) => { clearTimeout(timer); resolvePromise({ code, signal }); });
	});
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]); }
	finally { if (timer) clearTimeout(timer); }
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
	if (!child.pid) return;
	try {
		if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
		else process.kill(-child.pid, signal);
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
	const address = server.address(); assert(address && typeof address === "object"); const port = address.port;
	await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
	return port;
}

async function assertPortAvailable(port: number): Promise<void> {
	const server = createServer();
	await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolvePromise); });
	await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
}

function sanitize(value: string, sandbox: string): string {
	return value.replaceAll(REPO_ROOT, "<repo>").replaceAll(sandbox, "<sandbox>").replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}\b/g, "<redacted-token>");
}

async function assertProductionBuildExcludesBrowserFakes(): Promise<void> {
	const dist = join(REPO_ROOT, "workbench/server/dist");
	await stat(join(dist, "index.js"));
	const files = await collectFiles(dist);
	assert.equal(files.some((file) => file.includes("browser-entry")), false);
	for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
		const content = await readFile(file, "utf8");
		assert.equal(content.includes("browser-foundation-fake-model"), false);
		assert.equal(content.includes("LLM_WIKI_BROWSER_"), false);
	}
}

async function collectFiles(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = join(path, entry.name);
		if (entry.isDirectory()) files.push(...await collectFiles(entryPath)); else files.push(entryPath);
	}
	return files;
}
