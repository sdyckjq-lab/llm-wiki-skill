import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { GraphReadData } from "@llm-wiki/workbench-contracts";

const require = createRequire(import.meta.url);
const { assembleGraphArtifactPair } = require("../../../../scripts/lib/graph-warning-bundle.js") as {
	assembleGraphArtifactPair(input: {
		graphData: Record<string, unknown>;
		groups: unknown[];
		candidateSets: unknown[];
	}): { graphData: unknown; warningBundle: unknown };
};

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
	platformSandboxEnvironment,
	prepareSandboxDirectories,
	sanitizeBrowserOutput,
	startNetworkGuardedProcess,
	stopProcess,
	type RunningProcess,
	waitForFile,
	waitForExit,
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
	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	let page: Page | undefined;
	let cleanupComplete = false;

	const cleanup = async () => {
		if (cleanupComplete) return;
		const errors: unknown[] = [];
		await closeBrowserResources({ context, browser }).catch((error) => errors.push(error));
		context = undefined;
		browser = undefined;
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
		await writeFile(join(authDir, "settings.json"), `${JSON.stringify({
			retry: { enabled: false },
		}, null, 2)}\n`);
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
		vite = await startNetworkGuardedProcess(
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
			},
			(output) => output.includes("Local:"),
			"Vite frontend",
			viteNetworkProbe,
		);

		browser = await chromium.launch({
			headless: true,
			env: {
				HOME: home,
				PATH: process.env.PATH ?? "/usr/bin:/bin",
				TMPDIR: join(home, "tmp"),
				LANG: "C.UTF-8",
				...platformSandboxEnvironment(home),
			},
		});
		context = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
		const blockedExternalRequests: string[] = [];
		await blockExternalBrowserTraffic(context, blockedExternalRequests);
		page = await context.newPage();
		const apiRequests = new Set<string>();
		let browserGraphReadCount = 0;
		let graphEventsSeen = false;
		const graphEventReceipts: Array<{ type: string; seq: number; [key: string]: unknown }> = [];
		page.on("request", (request) => {
			const url = new URL(request.url());
			if (url.pathname.startsWith("/api/")) apiRequests.add(url.pathname);
			if (url.pathname === "/api/graph" && request.method() === "GET") browserGraphReadCount += 1;
			if (url.pathname === "/api/events") graphEventsSeen = true;
		});
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByText("atlas-notes", { exact: false }).first().waitFor({ timeout: START_TIMEOUT_MS });
		await waitUntil(
			() => apiRequests.has("/api/commands"),
			OPERATION_TIMEOUT_MS,
			"command list was not loaded",
		);
		const composer = page.getByPlaceholder(/写下想法/);
		await composer.fill("/");
		await page.getByRole("option", { name: /sediment_to_wiki/ }).waitFor();
		await composer.fill("");

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
		const shortQuestion = "q9x";
		const longQuestionPrefix = "fictional-long-question-marker-";
		const longQuestion = `${longQuestionPrefix}${"fictional-detail-".repeat(32)}fictional-long-question-tail`;
		const sensitiveMarker = "FICTIONAL_SENSITIVE_LOG_MARKER";
		const sensitiveQuestion = `${sensitiveMarker} fictional confidential topic`;
		await sendComposerMessage(page, shortQuestion);
		await sendComposerMessage(page, longQuestion);
		await sendComposerMessage(page, sensitiveQuestion);
		await waitUntil(
			() => readdir(retrievalLogDir).then((files) => files.some((file) => file.endsWith(".jsonl")), () => false),
			OPERATION_TIMEOUT_MS,
			"retrieval log did not appear",
		);
		const retrievalLogContents = await Promise.all(
			(await readdir(retrievalLogDir))
				.filter((file) => file.endsWith(".jsonl"))
				.map((file) => readFile(join(retrievalLogDir, file), "utf8")),
		);
		const retrievalEntries = retrievalLogContents.flatMap((content) => content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
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
		const serializedRetrievalLogs = retrievalLogContents.join("\n");
		for (const fragment of [shortQuestion, longQuestionPrefix, sensitiveMarker]) {
			assert.equal(
				serializedRetrievalLogs.includes(fragment),
				false,
				`default retrieval logs must not contain ${fragment}`,
			);
		}
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
		await page.getByText("图谱可读·有告警", { exact: true }).waitFor();
		const warningBanner = page.getByRole("region", { name: "图谱告警" });
		await warningBanner.waitFor();
		await page.locator(".sigma-global-node-hit-target").first().waitFor({ timeout: START_TIMEOUT_MS });
		assert.ok(await page.locator(".graph-host > *").count(), "warning graph must keep rendered graph pixels");
		await page.locator(".sigma-global-node-hit-target").first().click();
		await page.getByText("Atlas Notes shared", { exact: true }).last().waitFor();
		await page.getByRole("button", { name: "打开详情" }).click();
		await page.getByText("Atlas-only fictional signal", { exact: false }).waitFor();
		await page.getByLabel("关闭").last().click();
		await warningBanner.getByRole("button", { name: "查看详情" }).click();
		await warningBanner.getByText("wiki/synthesis/browser-warning-source.md", { exact: true }).first().waitFor();
		await warningBanner.getByRole("button", { name: "加载更多" }).click();
		await warningBanner.getByText("wiki/synthesis/final-browser-warning.md", { exact: true }).waitFor();
		const warningApiText = await page.evaluate((kbPath) => fetch(`/api/graph/warnings?kb=${encodeURIComponent(kbPath)}&limit=100`).then((response) => response.text()), kbA);
		for (const secret of ["/Users/private", "C:\\Users\\private", "wiki\\private.md", "portable-key:nfc|casefold"]) {
			assert.equal((await warningBanner.textContent())?.includes(secret), false, `warning UI leaked ${secret}`);
			assert.equal(warningApiText.includes(secret), false, `warning API leaked ${secret}`);
		}
		assert.match(warningApiText, /wiki\/synthesis\/browser-warning-source\.md/);
		assert.match(warningApiText, /wiki\/entities\/foo\.md/);
		assert.equal((await warningBanner.textContent())?.includes(home), false, "warning UI must show only relative paths");
		assert.equal(await warningBanner.getByText("解决此告警", { exact: true }).count(), 0);
		await page.evaluate((selectedKb) => {
			const receipts: Array<{ type: string; seq: number; [key: string]: unknown }> = [];
			const source = new EventSource(`/api/events?kb=${encodeURIComponent(selectedKb)}`);
			source.onmessage = (message) => receipts.push(JSON.parse(message.data));
			Object.assign(window, { __graphEventReceipts: receipts });
		}, kbA);
		await waitForGraphEvent(page, graphEventReceipts, (event) => event.type === "graph_stream_ready");
		await refreshGraphEventReceipts(page, graphEventReceipts);
		const initialRebuildBaseline = graphEventReceipts.length;
		const firstResponsePromise = waitForGraphRebuildResponse(page, kbA);
		await page.getByRole("button", { name: "重构" }).click();
		assert.equal((await firstResponsePromise).status, "started");
		const busyResponses = await page.evaluate((kbPath) => Promise.all([0, 1].map(() => fetch(`/api/graph/rebuild?kb=${encodeURIComponent(kbPath)}`, { method: "POST" }).then(async (response) => ({ status: response.status, body: await response.json() })))), kbA);
		assert.equal(busyResponses.every((response) => response.status === 200), true);
		assert.equal(busyResponses.some((response) => response.body.data.status === "queued"), true);
		await waitUntil(async () => {
			await refreshGraphEventReceipts(page!, graphEventReceipts);
			return graphEventReceipts.slice(initialRebuildBaseline).filter((event) => event.type === "graph_updated").length >= 2;
		}, OPERATION_TIMEOUT_MS, "queued graph rebuild did not finish");
		await assertBrowserJson(
			page,
			`/api/graph?kb=${encodeURIComponent(kbA)}`,
			200,
			/"status":"ready"/,
		);
		const graphDataPath = join(kbA, "wiki", "graph-data.json");
		const graphDataBeforeMigration = JSON.parse(await readFile(graphDataPath, "utf8")) as {
			meta: Record<string, unknown>;
			nodes: Array<Record<string, unknown>>;
		};
		const migrationBaseNode = graphDataBeforeMigration.nodes[0]!;
		await writeFile(graphDataPath, JSON.stringify({
			...graphDataBeforeMigration,
			meta: {
				...graphDataBeforeMigration.meta,
				total_nodes: graphDataBeforeMigration.nodes.length + 1,
				initial_view: [...(Array.isArray(graphDataBeforeMigration.meta.initial_view) ? graphDataBeforeMigration.meta.initial_view : []), "legacy-duplicate"],
			},
			nodes: [
				...graphDataBeforeMigration.nodes,
				{ ...migrationBaseNode, id: "legacy-duplicate" },
			],
		}, null, 2));
		await writeFile(join(kbA, ".wiki-graph-layout.json"), JSON.stringify({
			version: 2,
			pins: { "legacy-duplicate": { x: 10, y: 20, coordinateSpace: "world" } },
			updatedAt: "before-migration",
		}, null, 2));
		await refreshGraphEventReceipts(page, graphEventReceipts);
		const migrationBaseline = graphEventReceipts.length;
		const migrationResponsePromise = waitForGraphRebuildResponse(page, kbA);
		await page.getByRole("button", { name: "重构" }).click();
		const migrationResponse = await migrationResponsePromise;
		assert.equal(migrationResponse.status, "started", JSON.stringify({
			busyStatuses: busyResponses.map((response) => response.body.data.status),
			completedUpdates: graphEventReceipts.slice(initialRebuildBaseline).filter((event) => event.type === "graph_updated").length,
		}));
		await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= migrationBaseline && event.type === "graph_updated");
		assert.equal(graphEventReceipts.slice(migrationBaseline).some((event) => (
			Array.isArray((event.diff as { migrationWarnings?: unknown[] } | null)?.migrationWarnings)
			&& ((event.diff as { migrationWarnings: unknown[] }).migrationWarnings.length > 0)
		)), true, "migration rebuild event must contain a warning projection");
		await warningBanner.getByText("首次刷新有 1 项迁移提示", { exact: true }).waitFor();
		const migrationEventText = JSON.stringify(graphEventReceipts.slice(migrationBaseline));
		for (const secret of ["legacy-duplicate", "/Users/private", "C:\\private", "portable-key:nfc|casefold", "previous_ids", "next_ids"]) {
			assert.equal(migrationEventText.includes(secret), false, `migration event leaked ${secret}`);
		}
		const ordinaryBaseline = graphEventReceipts.length;
		const ordinaryResponsePromise = waitForGraphRebuildResponse(page, kbA);
		await page.getByRole("button", { name: "重构" }).click();
		assert.equal(["started", "queued"].includes((await ordinaryResponsePromise).status), true);
		await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= ordinaryBaseline && event.type === "graph_updated");
		await warningBanner.getByText("首次刷新有 1 项迁移提示", { exact: true }).waitFor();
		await warningBanner.getByRole("button", { name: "关闭迁移提示" }).click();
		assert.equal(await warningBanner.getByText("首次刷新有 1 项迁移提示", { exact: true }).count(), 0);

		const warningIdentityBeforeTamper = await page.evaluate(async (selectedKb) => {
			const response = await fetch(`/api/graph/warnings?kb=${encodeURIComponent(selectedKb)}&limit=1`);
			const body = await response.json() as { data: { summary: { build_id: string; details_sha256: string } } };
			return { build_id: body.data.summary.build_id, details_sha256: body.data.summary.details_sha256 };
		}, kbA);
		await warningBanner.getByRole("button", { name: "查看详情" }).click();
		await warningBanner.getByText("wiki/synthesis/browser-warning-source.md", { exact: true }).first().waitFor();
		const warningPath = join(kbA, "wiki", "graph-warnings.json");
		const warningBytes = await readFile(warningPath, "utf8");
		const tamperedWarnings = JSON.parse(warningBytes) as { groups: Array<{ message: string }> };
		tamperedWarnings.groups[0]!.message = "tampered /Users/private detail";
		await writeFile(warningPath, JSON.stringify(tamperedWarnings));
		await refreshGraphEventReceipts(page, graphEventReceipts);
		const tamperBaseline = graphEventReceipts.length;
		await page.getByRole("tab", { name: "对话" }).click();
		await page.getByRole("tab", { name: "图谱" }).click();
		await page.getByText("详情暂不可用，已安排重新构建。摘要和图谱仍可阅读。", { exact: true }).waitFor();
		assert.equal(await warningBanner.getByText("wiki/synthesis/browser-warning-source.md", { exact: true }).count(), 0);
		await page.locator("[data-graph-status='ready']").waitFor();
		const warningIdentityAfterTamper = await page.evaluate(async (selectedKb) => {
			const response = await fetch(`/api/graph/warnings?kb=${encodeURIComponent(selectedKb)}&limit=1`);
			const body = await response.json() as { data: { summary: { build_id: string; details_sha256: string } } };
			return { build_id: body.data.summary.build_id, details_sha256: body.data.summary.details_sha256 };
		}, kbA);
		assert.deepEqual(warningIdentityAfterTamper, warningIdentityBeforeTamper);
		assert.equal(await page.getByText("图谱暂时不可用", { exact: true }).count(), 0);
		await page.locator(".sigma-global-node-hit-target").first().waitFor({ timeout: START_TIMEOUT_MS });
		assert.ok(await page.locator(".graph-host > *").count(), "tampered sidecar must not remove graph pixels");
		assert.equal((await page.locator("body").textContent())?.includes("/Users/private"), false);
		await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= tamperBaseline && event.type === "graph_updated");
		await warningBanner.getByRole("button", { name: "查看详情" }).waitFor();
		await warningBanner.getByRole("button", { name: "查看详情" }).click();
		await warningBanner.getByText("wiki/synthesis/browser-warning-source.md", { exact: true }).first().waitFor();
		await warningBanner.getByRole("button", { name: "加载更多" }).click();
		await warningBanner.getByText("第 29 行 · 第 1 列", { exact: true }).waitFor();
		assert.equal(await warningBanner.getByText("详情暂不可用，已安排重新构建。摘要和图谱仍可阅读。", { exact: true }).count(), 0);
		await rm(join(kbA, "wiki", "entities", "foo.md"), { force: true });
		await rm(join(kbA, "wiki", "topics", "foo.md"), { force: true });
		await rm(join(kbA, "wiki", "synthesis", "browser-warning-source.md"), { force: true });
		await refreshGraphEventReceipts(page, graphEventReceipts);
		const cleanupBaseline = graphEventReceipts.length;
		const cleanupResponsePromise = waitForGraphRebuildResponse(page, kbA);
		await page.getByRole("button", { name: "重构" }).click();
		assert.equal(["started", "queued"].includes((await cleanupResponsePromise).status), true);
		await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= cleanupBaseline && event.type === "graph_updated");
		await page.getByText("1 节点 · 0 关联", { exact: true }).waitFor();
		await assertBrowserJson(page, `/api/graph?kb=${encodeURIComponent(join(home, "missing-kb"))}`, 404, /知识库/);
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
		await page.goto("about:blank");
		server = await restartBackend(server, home, backendPort, kbB, serverNetworkProbe);
		graphEventsSeen = false;
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByRole("tab", { name: "图谱" }).click();
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
		await page.evaluate((selectedKb) => {
			const receipts: Array<{ type: string; seq: number; [key: string]: unknown }> = [];
			const source = new EventSource(`/api/events?kb=${encodeURIComponent(selectedKb)}`);
			source.onmessage = (message) => receipts.push(JSON.parse(message.data));
			Object.assign(window, { __graphEventReceipts: receipts });
		}, kbA);
		await waitForGraphEvent(page, graphEventReceipts, (event) => event.type === "graph_stream_ready");
		const graphData = await readFile(graphDataPath, "utf8");
		await rm(graphDataPath, { force: true });
		await mkdir(graphDataPath);
		try {
			await refreshGraphEventReceipts(page, graphEventReceipts);
			const failureBaseline = graphEventReceipts.length;
			const failureResponsePromise = waitForGraphRebuildResponse(page, kbA);
			await page.getByRole("button", { name: "重构" }).click();
			assert.equal((await failureResponsePromise).status, "started");
			await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= failureBaseline && event.type === "graph_error");
			await page.locator("[data-graph-status='error']").waitFor({ timeout: START_TIMEOUT_MS });
		} finally {
			await rm(graphDataPath, { recursive: true, force: true });
			await writeFile(graphDataPath, graphData);
		}
		await refreshGraphEventReceipts(page, graphEventReceipts);
		const recoveryBaseline = graphEventReceipts.length;
		const recoveryResponsePromise = waitForGraphRebuildResponse(page, kbA);
		await page.getByRole("button", { name: "重构" }).click();
		assert.equal((await recoveryResponsePromise).status, "started");
		await waitForGraphEvent(page, graphEventReceipts, (event, index) => index >= recoveryBaseline && event.type === "graph_updated");
		await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });

		// Graph reconnect: terminal events missed while offline are reconciled from GET /api/graph.
		const capabilityToken = (await readFile(join(appDir, "runtime", "capability-token"), "utf8")).trim();
			const cdp = await context.newCDPSession(page);
			await cdp.send("Network.enable");
			const setBrowserOffline = async (offline: boolean) => {
				await cdp.send("Network.emulateNetworkConditions", {
					offline,
				latency: 0,
				downloadThroughput: -1,
				uploadThroughput: -1,
			});
			await waitUntil(
				() => page!.evaluate(() => navigator.onLine).then((online) => online === !offline),
					OPERATION_TIMEOUT_MS,
					`browser did not become ${offline ? "offline" : "online"}`,
				);
				await page!.evaluate((eventType) => window.dispatchEvent(new Event(eventType)), offline ? "offline" : "online");
			};
		const readAuthoritativeGraph = () => backendGraphRead(backendPort, capabilityToken, kbA);
		const triggerAuthoritativeGraphRebuild = () => backendGraphRebuild(backendPort, capabilityToken, kbA);

		await setBrowserOffline(true);
		const offlineGraphData = await readFile(graphDataPath, "utf8");
		await rm(graphDataPath, { force: true });
		await mkdir(graphDataPath);
		try {
			assert.equal((await triggerAuthoritativeGraphRebuild()).status, "started");
			await waitUntil(
				async () => (await tryBackendGraphRead(backendPort, capabilityToken, kbA))?.state.status === "error",
				OPERATION_TIMEOUT_MS,
				"graph error did not become authoritative while the browser was offline",
			);
			const errorCalibration = page.waitForResponse(async (response) => {
				if (new URL(response.url()).pathname !== "/api/graph" || response.status() !== 200) return false;
				const body = await response.json() as { data?: { state?: { status?: string } } };
				return body.data?.state?.status === "error";
			});
			const errorGraphReadBaseline = browserGraphReadCount;
			await setBrowserOffline(false);
			await errorCalibration;
			await page.locator("[data-graph-status='error']").waitFor({ timeout: START_TIMEOUT_MS });
			await page.getByText("图谱重建失败", { exact: true }).waitFor();
			assert.equal(browserGraphReadCount, errorGraphReadBaseline + 1);
		} finally {
			await rm(graphDataPath, { recursive: true, force: true });
			await writeFile(graphDataPath, offlineGraphData);
		}

		await setBrowserOffline(true);
		await writeFile(join(kbA, "wiki", "entities", "reconnect.md"), "# Reconnect page\n\nFictional reconnect-only graph node.\n");
		const offlineUpdateBuild = await triggerAuthoritativeGraphRebuild();
		assert.equal(["started", "queued"].includes(offlineUpdateBuild.status), true);
		await waitUntil(
			async () => {
				const snapshot = await readAuthoritativeGraph();
				return snapshot.state.status === "ready"
					&& "needsBuild" in snapshot
					&& snapshot.needsBuild === false
					&& snapshot.data.nodes.some((node) => node.id.includes("reconnect"));
			},
			OPERATION_TIMEOUT_MS,
			"graph update did not become authoritative while the browser was offline",
		);
			const readyCalibration = page.waitForResponse(async (response) => {
			if (new URL(response.url()).pathname !== "/api/graph" || response.status() !== 200) return false;
			const body = await response.json() as {
				data?: { state?: { status?: string }; data?: { nodes?: Array<{ id?: string }> } };
			};
			return body.data?.state?.status === "ready"
					&& body.data.data?.nodes?.some((node) => node.id?.includes("reconnect")) === true;
			});
			const readyGraphReadBaseline = browserGraphReadCount;
			await setBrowserOffline(false);
			await readyCalibration;
			await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
			await page.getByText("2 节点 · 0 关联", { exact: true }).waitFor();
			assert.equal(browserGraphReadCount, readyGraphReadBaseline + 1);

			await setBrowserOffline(true);
			const calibrationFailure = page.waitForResponse((response) => (
				new URL(response.url()).pathname === "/api/graph" && response.status() === 503
			));
			await page.route("**/api/graph?*", async (route) => {
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ ok: false, code: "GRAPH_READ_FAILED", message: "Fictional internal detail" }),
				});
			});
			const failedGraphReadBaseline = browserGraphReadCount;
			await setBrowserOffline(false);
			await calibrationFailure;
			await page.locator("[data-graph-status='error']").waitFor({ timeout: START_TIMEOUT_MS });
			await page.getByTestId("graph-state")
				.getByText("图谱状态校准失败，请重新连接后重试", { exact: true })
				.waitFor();
			assert.equal((await page.locator("body").textContent())?.includes("Fictional internal detail"), false);
			assert.equal(browserGraphReadCount, failedGraphReadBaseline + 1);
			await page.unroute("**/api/graph?*");

			const eventRecoveryRead = page.waitForResponse(async (response) => {
				if (new URL(response.url()).pathname !== "/api/graph" || response.status() !== 200) return false;
				const body = await response.json() as { data?: { state?: { status?: string } } };
				return body.data?.state?.status === "ready";
			});
			assert.equal((await triggerAuthoritativeGraphRebuild()).status, "started");
			await eventRecoveryRead;
			await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
			await page.getByText("2 节点 · 0 关联", { exact: true }).waitFor();
			assert.equal(await page.locator(".sidebar-error").count(), 0);
			await cdp.detach();
			await assertSharedGraphHostFailures(context, webOrigin);

		// Messages: controlled terminal failures, direct failures, cancellation, disconnect recovery, and normal recovery.
		await page.getByRole("tab", { name: "对话" }).click();
		const modelErrorAttemptsFile = join(appDir, "browser-model-error-attempts");
		const safeFailureMessage = "生成回复时发生错误，请重试";
		const rawModelFailureDetail = "fictional retryable server error that must not reach the page or session";
		const rawDiagnosticDetail = "fictional diagnostic detail that must not reach the page or session";
		const rawDiagnosticStack = "fictional diagnostic stack that must not reach the page or session";
		const controlledFailureResponse = page.waitForResponse((response) => {
			const request = response.request();
			return new URL(response.url()).pathname === "/api/prompt"
				&& request.method() === "POST"
				&& request.postData()?.includes("[model-error]") === true;
		});
		await startComposerMessage(page, "[model-error] controlled terminal failure");
		await page.getByText(safeFailureMessage, { exact: true }).waitFor();
		const controlledFailureSse = await (await controlledFailureResponse).text();
		assert.equal((controlledFailureSse.match(/event: assistant_error/g) ?? []).length, 1);
		assert.equal(controlledFailureSse.includes("event: assistant_done"), false);
		assert.equal(controlledFailureSse.includes(rawModelFailureDetail), false);
		assert.equal(controlledFailureSse.includes(rawDiagnosticDetail), false);
		assert.equal(controlledFailureSse.includes(rawDiagnosticStack), false);
		assert.equal((await readFile(modelErrorAttemptsFile, "utf8")).trim().split("\n").length, 1);
		assert.equal(await page.getByPlaceholder(/写下想法/).isDisabled(), false);
		assert.equal((await page.locator("body").textContent())?.includes(rawModelFailureDetail), false);
		assert.equal((await page.locator("body").textContent())?.includes(rawDiagnosticDetail), false);
		await waitUntil(async () => (await readConversationSession(appDir, kbA, atlasConversation)).includes(safeFailureMessage), OPERATION_TIMEOUT_MS, "safe model failure was not persisted");
		const failedSession = await readConversationSession(appDir, kbA, atlasConversation);
		assert.match(failedSession, /"stopReason":"error"/);
		assert.equal(failedSession.includes(rawModelFailureDetail), false);
		assert.equal(failedSession.includes(rawDiagnosticDetail), false);
		assert.equal(failedSession.includes(rawDiagnosticStack), false);
		await page.reload({ waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByText(safeFailureMessage, { exact: true }).waitFor();
		assert.equal((await page.locator("body").textContent())?.includes(rawModelFailureDetail), false);
		await sendComposerMessage(page, "after controlled failure recovery");

		const modelFailureFlag = join(appDir, "browser-model-fail");
		await writeFile(modelFailureFlag, "fail");
		const directFailureCount = await page.getByText(safeFailureMessage, { exact: true }).count();
		await startComposerMessage(page, "direct model entry failure");
		await waitUntil(async () => (await page!.getByText(safeFailureMessage, { exact: true }).count()) > directFailureCount, OPERATION_TIMEOUT_MS, "direct model failure was not displayed");
		assert.equal(await page.getByPlaceholder(/写下想法/).isDisabled(), false);
		await rm(modelFailureFlag, { force: true });
		await sendComposerMessage(page, "after direct failure recovery");
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
		assert.equal(await page.getByPlaceholder(/写下想法/).isDisabled(), false);
		await sendComposerMessage(page, "after cancel recovery");
		await startComposerMessage(page, "[slow] disconnect this response");
		await page.getByText("生成中", { exact: true }).waitFor();
		await waitForFile(join(appDir, "browser-model-disconnect-started"));
		await page.close();
		await waitForFile(join(appDir, "browser-model-disconnect-settled"));
		page = await context.newPage();
		await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
		await page.getByLabel("当前知识库").getByText("atlas-notes").waitFor({ timeout: START_TIMEOUT_MS });
		await page.getByText("生成已停止", { exact: true }).last().waitFor();
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
		await page.getByText(/项目内置 \d+ 个 \/ pi 默认 \d+ 个 \/ 用户全局 \d+ 个/).waitFor();
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

test("graph rename journeys cross the real warning, dialog, and backend seams", { timeout: 120_000 }, async (t) => {
	await assertPortAvailable(WEB_PORT);
	const sandbox = await mkdtemp(join(tmpdir(), "llm-wiki-browser-main-flows-rename-"));
	const home = join(sandbox, "home");
	const appDir = join(home, ".llm-wiki-agent");
	const kbPath = join(home, "llm-wiki", "rename-notes");
	const equivalentKbPath = join(home, "llm-wiki", "equivalent-notes");
	const crashRollbackKbPath = join(home, "llm-wiki", "crash-rollback-notes");
	const serverNetworkProbe = join(home, "rename-server-network-probe.txt");
	const viteNetworkProbe = join(home, "rename-vite-network-probe.txt");
	const backendPort = await availablePort();
	const webOrigin = `http://127.0.0.1:${WEB_PORT}`;
	const resources: {
		server?: RunningProcess;
		vite?: RunningProcess;
		browser?: Browser;
		context?: BrowserContext;
	} = {};

	t.after(async () => {
		const errors: unknown[] = [];
		await closeBrowserResources({ context: resources.context, browser: resources.browser }).catch((error) => errors.push(error));
		if (resources.vite) await stopProcess(resources.vite, [0, 143]).catch((error) => errors.push(error));
		if (resources.server) await stopProcess(resources.server, [0, 86, 143]).catch((error) => errors.push(error));
		await rm(sandbox, { recursive: true, force: true }).catch((error) => errors.push(error));
		if (errors.length > 0) throw new AggregateError(errors, "graph rename browser cleanup failed");
	});

	await prepareSandboxDirectories(home);
	await createRenameKnowledgeBase(kbPath);
	await createEquivalentRenameKnowledgeBase(equivalentKbPath);
	await createCrashRenameKnowledgeBase(crashRollbackKbPath);
	await mkdir(appDir, { recursive: true });
	const authDir = join(home, ".pi", "agent");
	await mkdir(authDir, { recursive: true });
	await writeFile(join(authDir, "auth.json"), `${JSON.stringify({
		anthropic: { type: "api_key", key: "fictional-browser-credential" },
	}, null, 2)}\n`);
	await chmod(join(authDir, "auth.json"), 0o600);
	await writeFile(join(appDir, "config.json"), `${JSON.stringify({
		version: 1,
		externalKnowledgeBases: [kbPath, equivalentKbPath, crashRollbackKbPath],
		lastUsedKbPath: kbPath,
		modelRoles: { main: { provider: "browser-test-provider", modelId: "browser-test-model" } },
	}, null, 2)}\n`);

	resources.server = await startBackend(home, backendPort, kbPath, serverNetworkProbe);
	resources.vite = await startNetworkGuardedProcess(
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
		"rename Vite frontend",
		viteNetworkProbe,
	);

	resources.browser = await chromium.launch({ headless: true, env: isolatedEnvironment(home, 0, kbPath) });
	resources.context = await resources.browser.newContext({ serviceWorkers: "block" });
	const blockedExternalRequests: string[] = [];
	await blockExternalBrowserTraffic(resources.context, blockedExternalRequests);
	const page = await resources.context.newPage();
	let renameApplyRequests = 0;
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.pathname === "/api/graph/renames/apply" && request.method() === "POST") renameApplyRequests += 1;
	});
	const startupRecovery = page.waitForResponse((response) => (
		new URL(response.url()).pathname === "/api/graph/renames/recovery"
		&& response.request().method() === "GET"
	));
	await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
	assert.equal((await startupRecovery).status(), 200);
	await page.getByLabel("当前知识库").getByText("rename-notes").waitFor({ timeout: START_TIMEOUT_MS });
	const startupDialogs = await page.getByRole("dialog").allTextContents();
	assert.deepEqual(startupDialogs, [], `unexpected startup dialog: ${JSON.stringify(startupDialogs)}`);
	await page.getByRole("tab", { name: "图谱" }).click();
	await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
	const warningBanner = page.getByRole("region", { name: "图谱告警" });
	await warningBanner.getByRole("button", { name: "查看详情" }).click();
	await warningBanner.getByRole("button", { name: "解决此告警" }).click();
	await page.getByRole("heading", { name: "先选择要改名的页面" }).waitFor();
	await page.getByRole("radio", { name: "wiki/entities/foo.md" }).check();
	await page.getByRole("button", { name: "下一步" }).click();
	await page.getByRole("textbox", { name: "新文件名" }).fill("已改名 页面");
	await page.getByRole("button", { name: "生成预览" }).click();
	await page.getByRole("heading", { name: "确认影响" }).waitFor({ timeout: OPERATION_TIMEOUT_MS });
	await page.getByText("wiki/entities/已改名 页面.md", { exact: true }).waitFor();
	await page.getByRole("note", { name: "只读引用" }).waitFor();
	const ambiguity = page.getByRole("group", { name: /歧义引用 1/ });
	await ambiguity.waitFor();
	await ambiguity.getByRole("radio", { name: "wiki/entities/foo.md" }).check();
	await page.getByRole("checkbox", { name: /我已核对完整预览/ }).check();
	const pauseFlag = join(appDir, "browser-rename-pause-before-commit");
	const pausedFlag = join(appDir, "browser-rename-paused");
	const resumeFlag = join(appDir, "browser-rename-resume");
	await writeFile(pauseFlag, "pause\n");
	await page.getByRole("button", { name: "确认并改名" }).evaluate((button) => {
		(button as HTMLButtonElement).click();
		(button as HTMLButtonElement).click();
	});
	await waitForFile(pausedFlag);
	assert.equal(renameApplyRequests, 1, "two immediate clicks must share one apply request");
	await rm(pauseFlag, { force: true });
	await writeFile(resumeFlag, "resume\n");
	const targetPath = join(kbPath, "wiki", "entities", "已改名 页面.md");
	await waitUntil(
		() => readFile(targetPath).then(() => true, () => false),
		OPERATION_TIMEOUT_MS,
		"rename target did not appear after the paused operation resumed",
	);
	assert.equal(await readFile(targetPath, "utf8"), "# Entity Foo\n\nEntity source page.\n");
	assert.equal(
		await readFile(join(kbPath, "wiki", "synthesis", "rename-links.md"), "utf8"),
		"# Rename links\n\n[[wiki/entities/已改名 页面.md]]\n[[wiki/entities/已改名 页面.md]]\n",
	);
	assert.equal(
		await readFile(join(kbPath, "raw", "rename-reference.md"), "utf8"),
		"# Read only\n\n[[wiki/entities/foo.md]]\n",
	);
	const layout = JSON.parse(await readFile(join(kbPath, ".wiki-graph-layout.json"), "utf8")) as { pins: Record<string, unknown> };
	assert.equal(Object.hasOwn(layout.pins, "wiki/entities/foo.md"), false);
	assert.equal(Object.hasOwn(layout.pins, "wiki/entities/已改名 页面.md"), true);
	await waitUntil(async () => {
		const response = JSON.parse((await browserJson(page!, `/api/graph/renames/recovery?kb=${encodeURIComponent(kbPath)}`)).text) as {
			data?: { status?: string };
		};
		return response.data?.status === "clear";
	}, OPERATION_TIMEOUT_MS, "rename did not reach published clear recovery state");
	const renamedEntityEntries = (await readdir(join(kbPath, "wiki", "entities"))).sort();
	assert.deepEqual(renamedEntityEntries.filter((name) => !name.startsWith(".")), ["stale.md", "已改名 页面.md"]);
	assert.equal(renamedEntityEntries.some((name) => name.endsWith(".stage")), false);

	// Preview invalidation: an external edit after preview prevents every planned write.
	await openGraphRenameForSource(page, "wiki/entities/stale.md");
	const staleDialog = page.getByRole("dialog", { name: "安全改名" });
	await staleDialog.getByRole("textbox", { name: "新文件名" }).fill("stale-renamed");
	await staleDialog.getByRole("button", { name: "生成预览" }).click();
	await staleDialog.getByRole("heading", { name: "确认影响" }).waitFor();
	const staleReferencePath = join(kbPath, "wiki", "synthesis", "stale-reference.md");
	await writeFile(staleReferencePath, "# Externally changed after preview\n\n[[wiki/entities/stale.md]]\n");
	await staleDialog.getByRole("checkbox", { name: /我已核对完整预览/ }).check();
	await staleDialog.getByRole("button", { name: "确认并改名" }).click();
	await staleDialog.getByRole("heading", { name: "预览已失效" }).waitFor({ timeout: OPERATION_TIMEOUT_MS });
	assert.equal(await readFile(join(kbPath, "wiki", "entities", "stale.md"), "utf8"), "# Stale page\n");
	await assert.rejects(readFile(join(kbPath, "wiki", "entities", "stale-renamed.md")));
	assert.equal(await readFile(staleReferencePath, "utf8"), "# Externally changed after preview\n\n[[wiki/entities/stale.md]]\n");
	await staleDialog.getByRole("button", { name: "取消" }).click();

	// Portable-equivalent rename: a case-only target completes through transit and migrates its pin.
	await page.getByText("equivalent-notes", { exact: true }).click();
	await page.getByLabel("当前知识库").getByText("equivalent-notes").waitFor();
	await page.locator("[data-graph-status='ready']").waitFor({ timeout: OPERATION_TIMEOUT_MS });
	await openGraphRenameForSource(page, "wiki/topics/CaseName.md");
	const equivalentDialog = page.getByRole("dialog", { name: "安全改名" });
	await equivalentDialog.getByRole("textbox", { name: "新文件名" }).fill("casename");
	await equivalentDialog.getByRole("button", { name: "生成预览" }).click();
	await equivalentDialog.getByRole("heading", { name: "确认影响" }).waitFor();
	await equivalentDialog.getByRole("checkbox", { name: /我已核对完整预览/ }).check();
	const equivalentApplyResponse = page.waitForResponse((response) => (
		new URL(response.url()).pathname === "/api/graph/renames/apply"
		&& response.request().method() === "POST"
	));
	await equivalentDialog.getByRole("button", { name: "确认并改名" }).click();
	assert.equal((await equivalentApplyResponse).status(), 200);
	await waitUntil(async () => {
		const response = JSON.parse((await browserJson(page, `/api/graph/renames/recovery?kb=${encodeURIComponent(equivalentKbPath)}`)).text) as {
			data?: { status?: string };
		};
		return response.data?.status === "clear";
	}, OPERATION_TIMEOUT_MS, "equivalent rename did not publish");
	const equivalentEntries = await readdir(join(equivalentKbPath, "wiki", "topics"));
	assert.deepEqual(equivalentEntries.filter((name) => !name.startsWith(".")), ["casename.md"]);
	assert.equal(equivalentEntries.some((name) => name.startsWith(".llm-wiki-rename-")), false);
	assert.equal(await readFile(join(equivalentKbPath, "wiki", "topics", "casename.md"), "utf8"), "# Case page\n\n[[wiki/topics/casename.md]]\n");
	const equivalentLayout = JSON.parse(await readFile(join(equivalentKbPath, ".wiki-graph-layout.json"), "utf8")) as { pins: Record<string, unknown> };
	assert.equal(Object.hasOwn(equivalentLayout.pins, "wiki/topics/CaseName.md"), false);
	assert.equal(Object.hasOwn(equivalentLayout.pins, "wiki/topics/casename.md"), true);

	// Crash recovery: a changed conflict set refreshes before a confirmed rollback preserves evidence.
	await page.getByText("crash-rollback-notes", { exact: true }).click();
	await page.getByLabel("当前知识库").getByText("crash-rollback-notes").waitFor();
	await page.locator("[data-graph-status='ready']").waitFor({ timeout: OPERATION_TIMEOUT_MS });
	await openGraphRenameForSource(page, "wiki/entities/crash.md");
	const crashDialog = page.getByRole("dialog", { name: "安全改名" });
	await crashDialog.getByRole("textbox", { name: "新文件名" }).fill("crash-renamed");
	await crashDialog.getByRole("button", { name: "生成预览" }).click();
	await crashDialog.getByRole("heading", { name: "确认影响" }).waitFor();
	await crashDialog.getByRole("checkbox", { name: /我已核对完整预览/ }).check();
	await writeFile(join(appDir, "browser-rename-crash-after-write"), "crash\n");
	const crashedServer = resources.server;
	assert.ok(crashedServer);
	await crashDialog.getByRole("button", { name: "确认并改名" }).click();
	const crashed = await waitForExit(crashedServer.child, OPERATION_TIMEOUT_MS, crashedServer.output);
	assert.equal(crashed.code, 86, crashedServer.output());
	resources.server = undefined;
	const crashReference = join(crashRollbackKbPath, "wiki", "synthesis", "crash-reference.md");
	await writeFile(crashReference, "# External version after crash\n\n[[wiki/entities/crash.md]]\n");
	resources.server = await startBackend(home, backendPort, crashRollbackKbPath, serverNetworkProbe);
	const startupConflictResponse = page.waitForResponse((response) => (
		new URL(response.url()).pathname === "/api/graph/renames/recovery"
		&& response.request().method() === "GET"
	));
	await page.reload({ waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
	assert.equal((await startupConflictResponse).status(), 200);
	const recoveryDialog = page.getByRole("dialog", { name: "安全改名" });
	await recoveryDialog.getByRole("heading", { name: "需要处理改名冲突" }).waitFor();
	await recoveryDialog.getByText("wiki/synthesis/crash-reference.md", { exact: true }).waitFor();
	const crashSource = join(crashRollbackKbPath, "wiki", "entities", "crash.md");
	const crashTarget = join(crashRollbackKbPath, "wiki", "entities", "crash-renamed.md");
	await writeFile(crashTarget, "# Additional external target conflict\n");
	await rm(crashSource, { force: true });
	await recoveryDialog.getByRole("radio", { name: "恢复原状" }).check();
	await recoveryDialog.getByRole("button", { name: "确认恢复" }).click();
	await recoveryDialog.getByText("冲突集合已变化，已刷新为当前完整状态。请重新核对后确认。", { exact: true }).waitFor();
	await recoveryDialog.getByText("wiki/entities/crash.md", { exact: true }).waitFor();
	await recoveryDialog.getByText("wiki/entities/crash-renamed.md", { exact: true }).waitFor();
	assert.match(await recoveryDialog.textContent() ?? "", /crash\.md已被外部删除/);
	assert.match(await recoveryDialog.textContent() ?? "", /crash-renamed\.md当前文件存在/);
	await recoveryDialog.getByRole("radio", { name: "恢复原状" }).check();
	await recoveryDialog.getByRole("button", { name: "确认恢复" }).click();
	await waitUntil(async () => {
		const response = JSON.parse((await browserJson(page, `/api/graph/renames/recovery?kb=${encodeURIComponent(crashRollbackKbPath)}`)).text) as {
			data?: { status?: string };
		};
		return response.data?.status === "clear";
	}, OPERATION_TIMEOUT_MS, "rollback recovery did not publish");
	assert.equal(await readFile(crashSource, "utf8"), "# Crash source\n");
	assert.equal(await readFile(crashReference, "utf8"), "# Crash reference\n\n[[wiki/entities/crash.md]]\n");
	await assert.rejects(readFile(crashTarget));
	const evidenceNotice = page.getByRole("region", { name: "保留的改名冲突证据" });
	await evidenceNotice.waitFor({ timeout: OPERATION_TIMEOUT_MS });
	assert.match(await evidenceNotice.textContent() ?? "", /摘要 [a-f0-9]{64}/);
	assert.match(await evidenceNotice.textContent() ?? "", /自动删除时间/);
	await page.goto("about:blank");
	resources.server = await restartBackend(resources.server!, home, backendPort, crashRollbackKbPath, serverNetworkProbe);
	await page.goto(webOrigin, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
	await page.getByRole("region", { name: "保留的改名冲突证据" }).waitFor({ timeout: OPERATION_TIMEOUT_MS });
	await page.getByRole("tab", { name: "图谱" }).click();
	await openGraphRenameForSource(page, "wiki/entities/crash.md");
	await page.getByRole("dialog", { name: "安全改名" }).getByRole("textbox", { name: "新文件名" }).waitFor();
	assert.equal((await page.locator("body").textContent())?.includes(home), false);
	assert.equal(
		blockedExternalRequests.every((origin) => origin === "https://fonts.googleapis.com" || origin === "https://fonts.gstatic.com"),
		true,
	);
});

async function assertSharedGraphHostFailures(context: BrowserContext, webOrigin: string): Promise<void> {
	for (const failure of [
		{ mode: "shared-create-failure", message: "共享图谱首次创建失败" },
		{ mode: "shared-update-failure", message: "共享图谱更新失败" },
	] as const) {
		const page = await context.newPage();
		const pageErrors: Error[] = [];
		page.on("pageerror", (error) => pageErrors.push(error));
		try {
			await page.goto(`${webOrigin}?graphTest=${failure.mode}`, { waitUntil: "domcontentloaded", timeout: START_TIMEOUT_MS });
			const graphTab = page.getByRole("tab", { name: "图谱" });
			if (await graphTab.getAttribute("aria-selected") !== "true") await graphTab.click();
			if (failure.mode === "shared-update-failure") {
				await page.locator("[data-graph-status='ready']").waitFor({ timeout: START_TIMEOUT_MS });
				await page.locator(".sigma-global-node-hit-target").first().waitFor({ timeout: START_TIMEOUT_MS });
				await page.getByRole("button", { name: "重构" }).click();
			}
			await page.locator("[data-graph-status='error']").waitFor({ timeout: START_TIMEOUT_MS });
			await page.getByText(failure.message, { exact: false }).waitFor();
			assert.equal(await page.locator(".graph-host").evaluate((host) => host.childElementCount), 0, `${failure.mode} should clear the stale graph`);
			assert.equal(await page.locator(".llm-wiki-graph-engine, [data-llm-wiki-graph-root='true']").count(), 0, `${failure.mode} should not leave an engine or fallback route`);
			assert.equal(pageErrors.length, 0, `${failure.mode} should not leak browser exceptions: ${pageErrors.map(String).join("; ")}`);
		} finally {
			await page.close();
		}
	}
}

async function startBackend(home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	return startNetworkGuardedProcess(
		process.execPath,
		["--import", "tsx", SERVER_ENTRY],
		REPO_ROOT,
		isolatedEnvironment(home, port, selectedDirectory),
		(output) => output.includes("listening on http://"),
		"browser backend",
		networkProbeFile,
	);
}

async function restartBackend(running: RunningProcess, home: string, port: number, selectedDirectory: string, networkProbeFile: string) {
	await stopProcess(running);
	return startBackend(home, port, selectedDirectory, networkProbeFile);
}

async function createKnowledgeBase(path: string, title: string, sharedText: string): Promise<void> {
	await createBaseKnowledgeBase(path, title, sharedText);
	if (title === "Atlas Notes") {
		await mkdir(join(path, "wiki", "topics"), { recursive: true });
		await mkdir(join(path, "wiki", "synthesis"), { recursive: true });
		await writeFile(join(path, "wiki", "entities", "foo.md"), "# Entity Foo\n");
		await writeFile(join(path, "wiki", "topics", "foo.md"), "# Topic Foo\n");
		await writeFile(
			join(path, "wiki", "synthesis", "browser-warning-source.md"),
			`# Browser warnings\n\n[[foo]]\n${Array.from({ length: 24 }, (_, index) => `[[missing-${index + 1}]]`).join("\n")}\n[待创建: [[future-browser-page]]]\n[[final-missing-browser-page]]\n`,
		);
	}
	const harborNode = title === "Harbor Notes"
		? [{ id: "harbor-extra", label: "Harbor extra", type: "entity", community: null, content: "Harbor-only second node", source_path: "wiki/entities/harbor-extra.md" }]
		: [];
	const graphData = {
		meta: { build_date: "2026-07-13T00:00:00Z", wiki_title: title, total_nodes: 1 + harborNode.length, total_edges: 0, initial_view: ["shared", ...harborNode.map((node) => node.id)], degraded: false },
		nodes: [{ id: "shared", label: `${title} shared`, type: "entity", community: null, content: sharedText, source_path: "wiki/entities/shared.md" }, ...harborNode],
		edges: [],
	};
	const warnings = title === "Atlas Notes" ? browserWarningFixture() : { groups: [], candidateSets: [] };
	const pair = assembleGraphArtifactPair({
		graphData,
		groups: warnings.groups,
		candidateSets: warnings.candidateSets,
	});
	await writeFile(join(path, "wiki/graph-data.json"), `${JSON.stringify(pair.graphData, null, 2)}\n`);
	await writeFile(join(path, "wiki/graph-warnings.json"), `${JSON.stringify(pair.warningBundle, null, 2)}\n`);
}

async function createRenameKnowledgeBase(path: string): Promise<void> {
	await mkdir(join(path, "wiki", "entities"), { recursive: true });
	await mkdir(join(path, "wiki", "topics"), { recursive: true });
	await mkdir(join(path, "wiki", "synthesis"), { recursive: true });
	await mkdir(join(path, "raw"), { recursive: true });
	await writeFile(join(path, ".wiki-schema.md"), "# Rename browser schema\n");
	await writeFile(join(path, "wiki", "entities", "foo.md"), "# Entity Foo\n\nEntity source page.\n");
	await writeFile(join(path, "wiki", "entities", "stale.md"), "# Stale page\n");
	await writeFile(join(path, "wiki", "topics", "foo.md"), "# Topic Foo\n\nOther ambiguous page.\n");
	await writeFile(join(path, "wiki", "topics", "CaseName.md"), "# Case page\n\n[[wiki/topics/CaseName.md]]\n");
	const linkSource = "# Rename links\n\n[[wiki/entities/foo.md]]\n[[foo]]\n";
	await writeFile(join(path, "wiki", "synthesis", "rename-links.md"), linkSource);
	await writeFile(join(path, "wiki", "synthesis", "stale-reference.md"), "# Stale reference\n\n[[wiki/entities/stale.md]]\n");
	await writeFile(join(path, "raw", "rename-reference.md"), "# Read only\n\n[[wiki/entities/foo.md]]\n");
	await writeFile(join(path, ".wiki-graph-layout.json"), `${JSON.stringify({
		version: 2,
		pins: {
			"wiki/entities/foo.md": { x: 24, y: 36, coordinateSpace: "world" },
			"wiki/topics/CaseName.md": { x: 40, y: 52, coordinateSpace: "world" },
		},
		updatedAt: "2026-07-22T00:00:00.000Z",
	}, null, 2)}\n`);
	const graphData = {
		meta: {
			build_date: "2026-07-22T00:00:00Z",
			wiki_title: "Rename Notes",
			total_nodes: 6,
			total_edges: 0,
			initial_view: [
				"wiki/entities/foo.md",
				"wiki/entities/stale.md",
				"wiki/topics/foo.md",
				"wiki/topics/CaseName.md",
				"wiki/synthesis/rename-links.md",
				"wiki/synthesis/stale-reference.md",
			],
			degraded: true,
		},
		nodes: [
			{ id: "wiki/entities/foo.md", label: "Entity Foo", type: "entity", community: null, content: "Entity source page.", source_path: "wiki/entities/foo.md" },
			{ id: "wiki/entities/stale.md", label: "Stale page", type: "entity", community: null, content: "Stale page.", source_path: "wiki/entities/stale.md" },
			{ id: "wiki/topics/foo.md", label: "Topic Foo", type: "topic", community: null, content: "Other ambiguous page.", source_path: "wiki/topics/foo.md" },
			{ id: "wiki/topics/CaseName.md", label: "Case page", type: "topic", community: null, content: "Case page.", source_path: "wiki/topics/CaseName.md" },
			{ id: "wiki/synthesis/rename-links.md", label: "Rename links", type: "synthesis", community: null, content: "Rename links.", source_path: "wiki/synthesis/rename-links.md" },
			{ id: "wiki/synthesis/stale-reference.md", label: "Stale reference", type: "synthesis", community: null, content: "Stale reference.", source_path: "wiki/synthesis/stale-reference.md" },
		],
		edges: [],
	};
	const rawLink = "[[foo]]";
	const pair = assembleGraphArtifactPair({
		graphData,
		candidateSets: [{
			candidate_set_id: "rename-foo-candidates",
			candidate_count: 2,
			candidates: ["wiki/entities/foo.md", "wiki/topics/foo.md"],
		}],
		groups: [{
			warning_id: "rename-ambiguous-foo",
			code: "ambiguous_wikilink",
			severity: "error",
			message: "Ambiguous foo link",
			target_key: "foo",
			candidate_set_id: "rename-foo-candidates",
			occurrence_count: 1,
			occurrences: [{
				occurrence_id: "rename-foo-occurrence",
				source_path: "wiki/synthesis/rename-links.md",
				line: 4,
				column: 1,
				start_byte: Buffer.byteLength("# Rename links\n\n[[wiki/entities/foo.md]]\n"),
				end_byte: Buffer.byteLength(linkSource) - 1,
				raw_link: rawLink,
				file_sha256: createHash("sha256").update(linkSource).digest("hex"),
				link_kind: "page_wikilink",
				read_only: false,
			}],
		}],
	});
	await writeFile(join(path, "wiki", "graph-data.json"), `${JSON.stringify(pair.graphData, null, 2)}\n`);
	await writeFile(join(path, "wiki", "graph-warnings.json"), `${JSON.stringify(pair.warningBundle, null, 2)}\n`);
}

async function createEquivalentRenameKnowledgeBase(path: string): Promise<void> {
	await mkdir(join(path, "wiki", "topics"), { recursive: true });
	await writeFile(join(path, ".wiki-schema.md"), "# Equivalent rename schema\n");
	await writeFile(join(path, "wiki", "topics", "CaseName.md"), "# Case page\n\n[[wiki/topics/CaseName.md]]\n");
	await writeFile(join(path, ".wiki-graph-layout.json"), `${JSON.stringify({
		version: 2,
		pins: { "wiki/topics/CaseName.md": { x: 20, y: 30, coordinateSpace: "world" } },
		updatedAt: "2026-07-22T00:00:00.000Z",
	}, null, 2)}\n`);
	const pair = assembleGraphArtifactPair({
		graphData: {
			meta: {
				build_date: "2026-07-22T00:00:00Z",
				wiki_title: "Equivalent Notes",
				total_nodes: 1,
				total_edges: 0,
				initial_view: ["wiki/topics/CaseName.md"],
				degraded: false,
			},
			nodes: [{
				id: "wiki/topics/CaseName.md",
				label: "Case page",
				type: "topic",
				community: null,
				content: "Case page",
				source_path: "wiki/topics/CaseName.md",
			}],
			edges: [],
		},
		groups: [],
		candidateSets: [],
	});
	await writeFile(join(path, "wiki", "graph-data.json"), `${JSON.stringify(pair.graphData, null, 2)}\n`);
	await writeFile(join(path, "wiki", "graph-warnings.json"), `${JSON.stringify(pair.warningBundle, null, 2)}\n`);
}

async function createCrashRenameKnowledgeBase(path: string): Promise<void> {
	await mkdir(join(path, "wiki", "entities"), { recursive: true });
	await mkdir(join(path, "wiki", "synthesis"), { recursive: true });
	await writeFile(join(path, ".wiki-schema.md"), "# Crash recovery schema\n");
	await writeFile(join(path, "wiki", "entities", "crash.md"), "# Crash source\n");
	await writeFile(join(path, "wiki", "synthesis", "crash-reference.md"), "# Crash reference\n\n[[wiki/entities/crash.md]]\n");
	const pair = assembleGraphArtifactPair({
		graphData: {
			meta: {
				build_date: "2026-07-22T00:00:00Z",
				wiki_title: "Crash Rollback Notes",
				total_nodes: 2,
				total_edges: 0,
				initial_view: ["wiki/entities/crash.md", "wiki/synthesis/crash-reference.md"],
				degraded: false,
			},
			nodes: [
				{ id: "wiki/entities/crash.md", label: "Crash source", type: "entity", community: null, content: "Crash source", source_path: "wiki/entities/crash.md" },
				{ id: "wiki/synthesis/crash-reference.md", label: "Crash reference", type: "synthesis", community: null, content: "Crash reference", source_path: "wiki/synthesis/crash-reference.md" },
			],
			edges: [],
		},
		groups: [],
		candidateSets: [],
	});
	await writeFile(join(path, "wiki", "graph-data.json"), `${JSON.stringify(pair.graphData, null, 2)}\n`);
	await writeFile(join(path, "wiki", "graph-warnings.json"), `${JSON.stringify(pair.warningBundle, null, 2)}\n`);
}

function browserWarningFixture() {
	const candidateSets = [{
		candidate_set_id: "browser-foo-candidates",
		candidate_count: 2,
		candidates: ["wiki/entities/foo.md", "wiki/topics/foo.md"],
	}];
	const groups = Array.from({ length: 27 }, (_, index) => {
		const ambiguous = index === 0;
		const pending = index === 25;
		const sourcePath = index === 26
			? "wiki/synthesis/final-browser-warning.md"
			: "wiki/synthesis/browser-warning-source.md";
		const rawLink = ambiguous
			? "[[foo]]"
			: pending ? "[[future-browser-page]]" : `[[missing-${index}]]`;
		return {
			warning_id: `browser-warning-${String(index).padStart(2, "0")}`,
			code: ambiguous ? "ambiguous_wikilink" : pending ? "pending_wikilink" : "broken_wikilink",
			severity: pending ? "warning" : "error",
			message: "/Users/private · C:\\Users\\private · wiki\\private.md · portable-key:nfc|casefold",
			target_key: ambiguous ? "foo" : pending ? "future-browser-page" : `missing-${index}`,
			...(ambiguous ? { candidate_set_id: "browser-foo-candidates" } : {}),
			occurrence_count: 1,
			occurrences: [{
				occurrence_id: `browser-occurrence-${String(index).padStart(2, "0")}`,
				source_path: sourcePath,
				line: index + 3,
				column: 1,
				start_byte: index * 32,
				end_byte: index * 32 + Buffer.byteLength(rawLink),
				raw_link: rawLink,
				file_sha256: createHash("sha256").update(`browser-source-${index}`).digest("hex"),
				link_kind: "page_wikilink",
				read_only: false,
			}],
		};
	});
	return { groups, candidateSets };
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

async function waitForGraphRebuildResponse(page: Page, kbPath: string): Promise<{ status: "started" | "queued" }> {
	const response = await page.waitForResponse((candidate) => {
		const request = candidate.request();
		const url = new URL(candidate.url());
		return url.pathname === "/api/graph/rebuild"
			&& url.searchParams.get("kb") === kbPath
			&& request.method() === "POST";
	});
	assert.equal(response.status(), 200);
	const body = await response.json() as { data: { status: "started" | "queued" } };
	return body.data;
}

async function refreshGraphEventReceipts(
	page: Page,
	receipts: Array<{ type: string; seq: number; [key: string]: unknown }>,
): Promise<void> {
	receipts.splice(0, receipts.length, ...await page.evaluate(() => (
		(window as typeof window & { __graphEventReceipts?: Array<{ type: string; seq: number; [key: string]: unknown }> }).__graphEventReceipts ?? []
	)));
}

async function waitForGraphEvent(
	page: Page,
	receipts: Array<{ type: string; seq: number; [key: string]: unknown }>,
	predicate: (event: { type: string; seq: number; [key: string]: unknown }, index: number) => boolean,
): Promise<void> {
	await waitUntil(async () => {
		await refreshGraphEventReceipts(page, receipts);
		return receipts.some(predicate);
	}, OPERATION_TIMEOUT_MS, "expected graph event did not arrive");
}

async function backendGraphRead(
	port: number,
	token: string,
	kbPath: string,
): Promise<GraphReadData> {
	const snapshot = await tryBackendGraphRead(port, token, kbPath);
	assert.notEqual(snapshot, null);
	return snapshot!;
}

async function tryBackendGraphRead(
	port: number,
	token: string,
	kbPath: string,
): Promise<GraphReadData | null> {
	const response = await fetch(`http://127.0.0.1:${port}/api/graph?kb=${encodeURIComponent(kbPath)}`, {
		headers: { "X-LLM-Wiki-Workbench-Token": token },
	});
	if (response.status !== 200) return null;
	const body = await response.json() as { data: GraphReadData };
	return body.data;
}

async function backendGraphRebuild(
	port: number,
	token: string,
	kbPath: string,
): Promise<{ status: "started" | "queued" }> {
	const response = await fetch(`http://127.0.0.1:${port}/api/graph/rebuild?kb=${encodeURIComponent(kbPath)}`, {
		method: "POST",
		headers: { "X-LLM-Wiki-Workbench-Token": token },
	});
	assert.equal(response.status, 200);
	const body = await response.json() as { data: { status: "started" | "queued" } };
	return body.data;
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

async function readConversationSession(appDir: string, kbPath: string, conversationId: string): Promise<string> {
	const hash = createHash("sha256").update(kbPath).digest("hex").slice(0, 16);
	const sessionDir = join(appDir, "sessions", hash);
	const files = await readdir(sessionDir);
	const file = files.find((name) => name.endsWith(`_${conversationId}.jsonl`));
	assert.ok(file, `session file for ${conversationId} was not found`);
	return readFile(join(sessionDir, file), "utf8");
}

async function assertBrowserJson(page: Page, path: string, expectedStatus: number, expectedBody: RegExp): Promise<void> {
	const result = await browserJson(page, path);
	assert.equal(result.status, expectedStatus);
	assert.match(result.text, expectedBody);
}

async function browserJson(page: Page, path: string): Promise<{ status: number; text: string }> {
	return page.evaluate((url) => fetch(url, { signal: AbortSignal.timeout(8_000) }).then(async (response) => ({ status: response.status, text: await response.text() })), path);
}

async function openGraphRenameForSource(page: Page, sourcePath: string): Promise<void> {
	await openGraphRenameForNode(page, sourcePath);
}

async function openGraphRenameForNode(page: Page, nodeId: string): Promise<void> {
	const target = page.locator(`.sigma-global-node-hit-target[data-id="${nodeId}"]`);
	await target.waitFor({ state: "attached", timeout: OPERATION_TIMEOUT_MS });
	await target.evaluate((button) => (button as HTMLButtonElement).click());
	await page.getByRole("button", { name: "打开详情" }).click();
	await page.getByRole("button", { name: "安全改名" }).click();
}
