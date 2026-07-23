import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

import {
	APPEARANCE_STORAGE_PREFIX,
	THEME_STORAGE_KEY,
	type AppearancePrefs as PaperPrefs,
} from "../../src/lib/appearance";

const MAIN_VIEW_STORAGE_KEY = "llm-wiki-agent-main-view";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "llm-wiki-agent-sidebar-collapsed";

type PaperVisualCase = {
	name: string;
	description: string;
	prefs: PaperPrefs;
	apiReadProbe?: boolean;
	viewport?: { width: number; height: number };
	view?: "chat" | "graph";
	fonts?: "normal" | "blocked";
	drawer?: "wiki";
	sidebar?: "expanded" | "collapsed";
	v2Focus?: "sidebar" | "composer" | "drawer" | "graph";
	rename?: "preview" | "stale" | "conflict" | "blocked" | "rebuild-restored" | "evidence-overflow";
	reducedMotion?: "reduce";
};

const baseUrl = process.env.PAPER_UI_BASE_URL ?? "http://localhost:5180";
const updateBaseline = process.argv.includes("--update");
const actualDir = resolve(process.cwd(), "test-results/paper-ui/actual");
const baselineDir = resolve(process.cwd(), "test-results/paper-ui/baseline");
const referenceDir = resolve(process.cwd(), "test-results/paper-ui/reference-v2");
const v2PrototypeUrl = process.env.PAPER_V2_PROTOTYPE_URL;
const staticFallbackUrl = "http://paper-ui.local/";
const distDir = resolve(process.cwd(), "dist");
const visualKbPath = "/visual/ai-learning";
const visualRenameOperationId = "11111111-1111-4111-8111-111111111111";
const evaluateNameHelper = "globalThis.__name = (fn) => fn;";
const paperApiReadPaths = ["/api/artifacts", "/api/config", "/api/models"] as const;
type PaperApiReadPath = (typeof paperApiReadPaths)[number];
type PaperApiReadRequest = `GET ${PaperApiReadPath}`;
const defaultPrefs: PaperPrefs = {
	theme: "light",
	paper: "clean",
	accent: "terracotta",
	userbubble: "soft",
	hand: "on",
	density: "cozy",
};
const referenceCache = new Map<number, Promise<string>>();
const explicitBaseUrl = Boolean(process.env.PAPER_UI_BASE_URL);

const cases: PaperVisualCase[] = [
	{
		name: "rename-preview-light-1440",
		description: "long Unicode rename preview with many editable and read-only references",
		prefs: defaultPrefs,
		view: "graph",
		rename: "preview",
	},
	{
		name: "rename-preview-dark-320",
		description: "long Unicode rename preview at 320px with reduced motion",
		prefs: { ...defaultPrefs, theme: "dark" },
		view: "graph",
		viewport: { width: 320, height: 720 },
		rename: "preview",
		reducedMotion: "reduce",
		sidebar: "collapsed",
	},
	{
		name: "rename-stale-light-320",
		description: "stale rename preview at 320px",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 320, height: 720 },
		rename: "stale",
		sidebar: "collapsed",
	},
	{
		name: "rename-conflict-dark-1440",
		description: "complete present and missing recovery conflict set",
		prefs: { ...defaultPrefs, theme: "dark" },
		view: "graph",
		rename: "conflict",
	},
	{
		name: "rename-blocked-light-320",
		description: "non-destructive blocked recovery at 320px",
		prefs: defaultPrefs,
		viewport: { width: 320, height: 720 },
		rename: "blocked",
	},
	{
		name: "rename-rebuild-restored-dark-1440",
		description: "rebuild-required state restored after restart",
		prefs: { ...defaultPrefs, theme: "dark" },
		view: "graph",
		rename: "rebuild-restored",
	},
	{
		name: "rename-evidence-overflow-320",
		description: "multiple retained evidence receipts remain scrollable without blocking a fresh rename",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 320, height: 720 },
		sidebar: "collapsed",
		rename: "evidence-overflow",
	},
	...(["light", "dark"] as const).flatMap((theme) =>
		(["clean", "grid", "laid"] as const).map((paper) => ({
			name: `${theme}-${paper}-1440`,
			description: `${theme} theme with ${paper} paper`,
			prefs: { ...defaultPrefs, theme, paper },
			apiReadProbe: theme === "light" && paper === "clean",
			fonts: "normal" as const,
		})),
	),
	{
		name: "variant-userbubble-solid-1440",
		description: "solid user bubbles",
		prefs: { ...defaultPrefs, userbubble: "solid" },
	},
	{
		name: "variant-density-compact-1440",
		description: "compact density",
		prefs: { ...defaultPrefs, density: "compact" },
	},
	{
		name: "variant-hand-off-1440",
		description: "handwriting accents disabled",
		prefs: { ...defaultPrefs, hand: "off" },
	},
	...(["terracotta", "clay", "amber", "rose"] as const).map((accent) => ({
		name: `accent-${accent}-1440`,
		description: `${accent} accent`,
		prefs: { ...defaultPrefs, accent },
	})),
	{
		name: "font-fallback-blocked-1440",
		description: "font requests blocked to verify fallback stack",
		prefs: defaultPrefs,
		fonts: "blocked",
	},
	{
		name: "responsive-chat-1024",
		description: "chat shell at tablet width",
		prefs: defaultPrefs,
		viewport: { width: 1024, height: 820 },
	},
	{
		name: "responsive-chat-768",
		description: "chat shell at narrow width",
		prefs: defaultPrefs,
		viewport: { width: 768, height: 820 },
	},
	{
		name: "graph-shell-1440",
		description: "graph shell toolbar at desktop width",
		prefs: defaultPrefs,
		view: "graph",
	},
	{
		name: "graph-shell-1024",
		description: "graph shell toolbar at tablet width",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 1024, height: 820 },
	},
	{
		name: "graph-shell-768",
		description: "graph shell toolbar at narrow width",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 768, height: 820 },
	},
	{
		name: "v2-sidebar-expanded-1440",
		description: "V2 expanded sidebar with notebooks, conversations, and footer actions",
		prefs: defaultPrefs,
		sidebar: "expanded",
		v2Focus: "sidebar",
	},
	{
		name: "v2-sidebar-collapsed-1440",
		description: "V2 collapsed sidebar rail",
		prefs: defaultPrefs,
		sidebar: "collapsed",
		v2Focus: "sidebar",
	},
	{
		name: "v2-composer-1440",
		description: "V2 lightweight composer and chat rhythm",
		prefs: defaultPrefs,
		v2Focus: "composer",
	},
	{
		name: "v2-composer-768",
		description: "V2 lightweight composer at narrow width",
		prefs: defaultPrefs,
		viewport: { width: 768, height: 820 },
		v2Focus: "composer",
	},
	{
		name: "v2-chat-drawer-1440",
		description: "V2 chat shell with right drawer open",
		prefs: defaultPrefs,
		drawer: "wiki",
		v2Focus: "drawer",
	},
	{
		name: "v2-chat-drawer-1024",
		description: "V2 tablet chat shell with right drawer open",
		prefs: defaultPrefs,
		drawer: "wiki",
		viewport: { width: 1024, height: 820 },
		v2Focus: "drawer",
	},
	{
		name: "v2-chat-drawer-768",
		description: "V2 narrow chat shell with drawer overlay",
		prefs: defaultPrefs,
		drawer: "wiki",
		viewport: { width: 768, height: 820 },
		v2Focus: "drawer",
	},
	{
		name: "v2-graph-shell-1440",
		description: "V2 graph shell with toolbar, search, stats, legend, and stage",
		prefs: defaultPrefs,
		view: "graph",
		v2Focus: "graph",
	},
	{
		name: "v2-graph-shell-1024",
		description: "V2 graph shell at tablet width",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 1024, height: 820 },
		v2Focus: "graph",
	},
	{
		name: "v2-graph-shell-768",
		description: "V2 graph shell at narrow width",
		prefs: defaultPrefs,
		view: "graph",
		viewport: { width: 768, height: 820 },
		v2Focus: "graph",
	},
];

await mkdir(actualDir, { recursive: true });
await mkdir(baselineDir, { recursive: true });
await mkdir(referenceDir, { recursive: true });

let server: ChildProcessWithoutNullStreams | null = null;
let appUrl = baseUrl;
let staticFallback = false;

try {
	if (explicitBaseUrl) {
		await waitForUrl(baseUrl, 30_000);
	} else {
		if (await canListenOnLocalhost()) {
			const port = await findFreeLocalhostPort();
			appUrl = `http://127.0.0.1:${port}`;
			server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
				cwd: process.cwd(),
				env: process.env,
			});
			server.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
			server.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
			await waitForUrl(appUrl, 30_000);
		} else {
			staticFallback = true;
			appUrl = staticFallbackUrl;
			console.log("visual:paper: localhost listen is unavailable; using static dist fallback with mocked API");
		}
	}

	const browser = await chromium.launch({ headless: true });
	try {
		for (const visualCase of cases) {
			await captureCase(browser, visualCase, appUrl, staticFallback);
		}
	} finally {
		await browser.close();
	}
} finally {
	if (server) {
		server.kill("SIGTERM");
	}
}

async function captureCase(browser: Browser, visualCase: PaperVisualCase, url: string, useStaticFallback: boolean) {
	const viewport = visualCase.viewport ?? { width: 1440, height: 900 };
	const apiReads = new Set<PaperApiReadRequest>();
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		viewport,
		reducedMotion: visualCase.reducedMotion,
	});
	await context.addInitScript(evaluateNameHelper);
	await context.addInitScript((prefs) => {
		localStorage.setItem(prefs.themeStorageKey, prefs.theme);
		localStorage.setItem(`${prefs.appearanceStoragePrefix}paper`, prefs.paper);
		localStorage.setItem(`${prefs.appearanceStoragePrefix}accent`, prefs.accent);
		localStorage.setItem(`${prefs.appearanceStoragePrefix}userbubble`, prefs.userbubble);
		localStorage.setItem(`${prefs.appearanceStoragePrefix}hand`, prefs.hand);
		localStorage.setItem(`${prefs.appearanceStoragePrefix}density`, prefs.density);
		localStorage.setItem(prefs.mainViewStorageKey, prefs.view);
		localStorage.setItem(prefs.sidebarCollapsedStorageKey, prefs.sidebarCollapsed);
	}, {
		...visualCase.prefs,
		view: visualCase.view ?? "chat",
		sidebarCollapsed: visualCase.sidebar === "collapsed" ? "true" : "false",
		themeStorageKey: THEME_STORAGE_KEY,
		appearanceStoragePrefix: APPEARANCE_STORAGE_PREFIX,
		mainViewStorageKey: MAIN_VIEW_STORAGE_KEY,
		sidebarCollapsedStorageKey: SIDEBAR_COLLAPSED_STORAGE_KEY,
	});
	if (useStaticFallback) {
		await installStaticFallbackRoutes(context, apiReads, visualCase);
	} else {
		await installVisualApiRoutes(context, new URL(url).origin, apiReads, visualCase);
	}
	if (visualCase.fonts === "blocked") {
		await context.route(/fonts\.(googleapis|gstatic)\.com/, (route: Route) => route.abort());
	}
	const page = await context.newPage();
	try {
		const artifactRead = visualCase.apiReadProbe
			? page.waitForResponse((response) =>
				response.request().method() === "GET" && new URL(response.url()).pathname === "/api/artifacts",
			)
			: null;
		await page.goto(url, { waitUntil: "domcontentloaded" });
		if (artifactRead) await artifactRead;
		await page.waitForSelector(".app-shell", { timeout: 15_000 });
		await page.waitForSelector(visualCase.view === "graph" ? ".graph-screen" : ".chat-screen", { timeout: 15_000 });
		await page.evaluate(async () => {
			await document.fonts?.ready;
		});
		await waitForStableVisualState(page, visualCase);
		if (visualCase.rename) {
			await prepareRenameVisualState(page, visualCase);
			await waitForStableVisualState(page, visualCase);
		}
		if (visualCase.apiReadProbe) {
			await verifyPaperApiReads(page, apiReads);
		}
		if (visualCase.drawer === "wiki") {
			await openWikiDrawerFromSearch(page);
			await waitForStableVisualState(page, visualCase);
		}

		const state = await page.evaluate(() => {
			function rectOf(element: Element) {
				const box = element.getBoundingClientRect();
				return {
					top: box.top,
					right: box.right,
					bottom: box.bottom,
					left: box.left,
					width: box.width,
					height: box.height,
				};
			}

			const root = document.documentElement;
			const body = document.body;
			const appShell = document.querySelector(".app-shell");
			const topbar = document.querySelector(".topbar");
			const kbName = document.querySelector(".topbar-kb-name");
			const sidebar = document.querySelector(".shell-sidebar");
			const sidebarFooter = document.querySelector(".sidebar-footer");
			const main = document.querySelector(".shell-main");
			const mainTabs = document.querySelector(".main-view-tabs");
			const chatMessages = document.querySelector(".chat-messages");
			const drawer = document.querySelector(".drawer-panel-open");
			const composer = document.querySelector(".composer-card");
			const textarea = document.querySelector(".chat-textarea");
			const sendButton = document.querySelector(".send-btn");
			const graphScreen = document.querySelector(".graph-screen");
			const graphShell = document.querySelector(".graph-shell");
			const graphShellToolbar = document.querySelector(".graph-screen .graph-shell-toolbar");
			const graphStage = document.querySelector(".graph-screen .graph-stage");
			const graphLegend = document.querySelector(".graph-shell-legend");
			const graphSearch = document.querySelector(".graph-stage .graph-search, .graph-stage [aria-label='搜索图谱']");
			const renameDialog = document.querySelector(".graph-rename-dialog");
			const renamePrimaryAction = renameDialog?.querySelector("button:last-of-type");
			const topbarBox = topbar?.getBoundingClientRect();
			const kbNameBox = kbName?.getBoundingClientRect();
			const graphScreenBox = graphScreen?.getBoundingClientRect();
			const graphShellToolbarBox = graphShellToolbar?.getBoundingClientRect();
			const graphStageBox = graphStage?.getBoundingClientRect();
			return {
				theme: root.dataset.theme,
				paper: root.dataset.paper,
				accent: root.dataset.accent,
				userbubble: root.dataset.userbubble,
				hand: root.dataset.hand,
				density: root.dataset.density,
				darkClass: root.classList.contains("dark"),
				appBackground: appShell ? getComputedStyle(appShell).backgroundColor : null,
				topbarFont: topbar ? getComputedStyle(topbar).fontFamily : null,
				viewportWidth: window.innerWidth,
				documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
				sidebarText: sidebar?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				sidebarLabel: sidebar?.getAttribute("aria-label") ?? null,
				sidebarButtonLabels: Array.from(sidebar?.querySelectorAll("button") ?? [])
					.map((button) => button.getAttribute("aria-label") || button.textContent?.replace(/\s+/g, " ").trim() || "")
					.filter(Boolean),
				sidebarKbRowIconCount: document.querySelectorAll(".shell-sidebar:not(.shell-sidebar-collapsed) .kb-row svg").length,
				sidebarFooterText: sidebarFooter?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				mainTabsText: mainTabs?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				mainTabsRect: mainTabs ? rectOf(mainTabs) : null,
				chatMessagesText: chatMessages?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				sidebarRect: sidebar ? rectOf(sidebar) : null,
				mainRect: main ? rectOf(main) : null,
				drawerRect: drawer ? rectOf(drawer) : null,
				drawerOpen: Boolean(drawer),
				composerRect: composer ? rectOf(composer) : null,
				textareaRect: textarea ? rectOf(textarea) : null,
				sendRect: sendButton ? rectOf(sendButton) : null,
				topbarRect: topbarBox ? {
					top: topbarBox.top,
					right: topbarBox.right,
					bottom: topbarBox.bottom,
					left: topbarBox.left,
					width: topbarBox.width,
					height: topbarBox.height,
				} : null,
				kbNameRect: kbNameBox ? {
					top: kbNameBox.top,
					right: kbNameBox.right,
					bottom: kbNameBox.bottom,
					left: kbNameBox.left,
					width: kbNameBox.width,
					height: kbNameBox.height,
				} : null,
				graphScreenRect: graphScreenBox ? {
					top: graphScreenBox.top,
					right: graphScreenBox.right,
					bottom: graphScreenBox.bottom,
					left: graphScreenBox.left,
					width: graphScreenBox.width,
					height: graphScreenBox.height,
				} : null,
				graphShellRect: graphShell ? rectOf(graphShell) : null,
				graphShellToolbarRect: graphShellToolbarBox ? {
					top: graphShellToolbarBox.top,
					right: graphShellToolbarBox.right,
					bottom: graphShellToolbarBox.bottom,
					left: graphShellToolbarBox.left,
					width: graphShellToolbarBox.width,
					height: graphShellToolbarBox.height,
				} : null,
				graphStageRect: graphStageBox ? {
					top: graphStageBox.top,
					right: graphStageBox.right,
					bottom: graphStageBox.bottom,
					left: graphStageBox.left,
					width: graphStageBox.width,
					height: graphStageBox.height,
				} : null,
				graphSearchRect: graphSearch ? rectOf(graphSearch) : null,
				graphLegendText: graphLegend?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				graphSearchVisible: Boolean(graphSearch),
				renameDialogRect: renameDialog ? rectOf(renameDialog) : null,
				renameDialogText: renameDialog?.textContent?.replace(/\s+/g, " ").trim() ?? null,
				renamePrimaryActionRect: renamePrimaryAction ? rectOf(renamePrimaryAction) : null,
				appLevelGraphToolbarCount: document.querySelectorAll(".graph-screen > .graph-toolbar").length,
				appLevelGraphLegendCount: document.querySelectorAll(".graph-screen > .graph-legend").length,
			};
		});

		assertState(visualCase, state);

		const filename = `${visualCase.name}.png`;
		const actualPath = resolve(actualDir, filename);
		await page.screenshot({ fullPage: true, path: actualPath });
		if (updateBaseline) {
			await copyFile(actualPath, resolve(baselineDir, filename));
		}
		const referencePath = await captureReferenceForCase(browser, visualCase);
		console.log(`${visualCase.name}: wrote ${actualPath}${referencePath ? ` | V2 reference ${referencePath}` : ""}${updateBaseline ? " and updated baseline" : ""}`);
	} finally {
		await context.close();
	}
}

async function prepareRenameVisualState(page: Page, visualCase: PaperVisualCase) {
	if (visualCase.rename === "evidence-overflow") {
		const notice = page.getByRole("region", { name: "保留的改名冲突证据" });
		await notice.waitFor();
		const before = await notice.evaluate((element) => ({
			scrollTop: element.scrollTop,
			scrollHeight: element.scrollHeight,
			clientHeight: element.clientHeight,
			left: element.getBoundingClientRect().left,
			top: element.getBoundingClientRect().top,
			width: element.getBoundingClientRect().width,
			height: element.getBoundingClientRect().height,
		}));
		if (before.scrollHeight <= before.clientHeight) throw new Error("retained evidence fixture did not overflow");
		await page.mouse.move(before.left + before.width / 2, before.top + before.height / 2);
		await page.mouse.wheel(0, before.scrollHeight);
		await page.waitForFunction(
			"(() => { const notice = document.querySelector('.graph-rename-evidence-notice'); return notice && notice.scrollTop + notice.clientHeight >= notice.scrollHeight - 1; })()",
			undefined,
			{ timeout: 5_000 },
		);

		const target = page.locator('.sigma-global-node-hit-target[data-id="wiki/topics/rename-visual.md"]');
		await target.evaluate((button) => (button as HTMLButtonElement).click());
		await page.getByRole("button", { name: "打开详情" }).click();
		await page.getByRole("button", { name: "安全改名" }).click();
		await page.getByRole("dialog", { name: "安全改名" }).getByRole("heading", { name: "输入新文件名" }).waitFor();
		return;
	}
	if (visualCase.rename === "preview" || visualCase.rename === "stale") {
		const target = page.locator('.sigma-global-node-hit-target[data-id="wiki/topics/rename-visual.md"]');
		await target.waitFor({ state: "attached", timeout: 10_000 });
		await target.evaluate((button) => (button as HTMLButtonElement).click());
		await page.getByRole("button", { name: "打开详情" }).click();
		await page.getByRole("button", { name: "安全改名" }).click();
		const dialog = page.getByRole("dialog", { name: "安全改名" });
		await dialog.getByRole("textbox", { name: "新文件名" }).fill("新的超长中文 Unicode 页面 Ω≈ç√∫˜µ≤≥÷ 研究笔记");
		await dialog.getByRole("button", { name: "生成预览" }).click();
		await dialog.getByRole("heading", { name: "确认影响" }).waitFor();
		if (visualCase.rename === "stale") {
			await dialog.getByRole("checkbox", { name: /我已核对完整预览/ }).check();
			await dialog.getByRole("button", { name: "确认并改名" }).click();
			await dialog.getByRole("heading", { name: "预览已失效" }).waitFor();
		}
		return;
	}
	const expectedHeading = visualCase.rename === "conflict"
		? "需要处理改名冲突"
		: visualCase.rename === "blocked"
			? "无法自动处理这项恢复"
			: "内容已保存，图谱尚未更新";
	await page.getByRole("dialog", { name: "安全改名" }).getByRole("heading", { name: expectedHeading }).waitFor();
}

async function verifyPaperApiReads(page: Page, apiReads: Set<PaperApiReadRequest>) {
	const modelButton = page.locator(".topbar-model");
	await modelButton.click();
	const modelList = page.getByRole("listbox", { name: "主对话模型" });
	const configuredModel = modelList.getByRole("option", {
		name: /anthropic\/claude-sonnet-4\.6/,
	});
	await configuredModel.waitFor({ state: "visible", timeout: 10_000 });
	if (await configuredModel.getAttribute("aria-selected") !== "true") {
		throw new Error("Paper API fixture: configured model was not selected");
	}
	for (const path of paperApiReadPaths) {
		const request: PaperApiReadRequest = `GET ${path}`;
		if (!apiReads.has(request)) throw new Error(`Paper API fixture: ${request} was not requested`);
	}
	if (await page.locator(".sidebar-error").count() > 0) {
		throw new Error("Paper API fixture: artifact read failed during startup");
	}
	await modelButton.click();
	await modelList.waitFor({ state: "detached", timeout: 5_000 });
}

async function openWikiDrawerFromSearch(page: Page) {
	await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
	await page.waitForSelector(".search-panel", { timeout: 5_000 });
	const firstResult = page.locator(".search-result-main").first();
	await firstResult.waitFor({ state: "visible", timeout: 10_000 });
	const resultPath = await firstResult.locator(".search-result-path").textContent();
	if (resultPath !== "wiki/concepts/mamba.md") {
		throw new Error(`expected Mamba page result, got ${resultPath ?? "no path"}`);
	}
	await firstResult.click();
	const drawer = page.locator(".drawer-panel-open");
	await drawer.waitFor({ state: "visible", timeout: 10_000 });
	await drawer.getByText("Mamba 是选择性状态空间模型", { exact: false }).waitFor({
		state: "visible",
		timeout: 10_000,
	});
	await page.waitForSelector(".search-panel", { state: "detached", timeout: 5_000 }).catch(() => undefined);
}

async function captureReferenceForCase(browser: Browser, visualCase: PaperVisualCase): Promise<string | null> {
	if (!visualCase.name.startsWith("v2-")) return null;
	if (!v2PrototypeUrl) return null;
	const viewport = visualCase.viewport ?? { width: 1440, height: 900 };
	if (!referenceCache.has(viewport.width)) {
		referenceCache.set(viewport.width, captureReference(browser, viewport, v2PrototypeUrl));
	}
	return referenceCache.get(viewport.width) ?? null;
}

async function captureReference(
	browser: Browser,
	viewport: { width: number; height: number },
	prototypeUrl: string,
): Promise<string> {
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		viewport,
	});
	await context.addInitScript(evaluateNameHelper);
	const page = await context.newPage();
	try {
		await page.goto(prototypeUrl, { waitUntil: "domcontentloaded" });
		await page.evaluate(async () => {
			await document.fonts?.ready;
		});
		await page.waitForFunction(
			"new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
			undefined,
			{ timeout: 5_000 },
		);
		const referencePath = resolve(referenceDir, `reference-v2-${viewport.width}.png`);
		await page.screenshot({ fullPage: true, path: referencePath });
		return referencePath;
	} finally {
		await context.close();
	}
}

async function installVisualApiRoutes(
	context: BrowserContext,
	origin: string,
	apiReads: Set<PaperApiReadRequest>,
	visualCase: PaperVisualCase,
) {
	await context.route(`${origin}/api/**`, async (route) => {
		const request = route.request();
		await fulfillMockApi(route, new URL(request.url()), request.method(), apiReads, visualCase);
	});
}

async function installStaticFallbackRoutes(context: BrowserContext, apiReads: Set<PaperApiReadRequest>, visualCase: PaperVisualCase) {
	await context.route("http://paper-ui.local/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.startsWith("/api/")) {
			await fulfillMockApi(route, url, request.method(), apiReads, visualCase);
			return;
		}
		const path = url.pathname === "/" ? "/index.html" : url.pathname;
		const filePath = resolve(distDir, `.${decodeURIComponent(path)}`);
		try {
			await route.fulfill({
				status: 200,
				contentType: contentTypeForPath(filePath),
				body: await readFile(filePath),
			});
		} catch {
			await route.fulfill({
				status: 404,
				contentType: "text/plain",
				body: `Missing static asset: ${path}`,
			});
		}
	});
}

async function beginPaperApiRead(
	json: (body: unknown, status?: number) => Promise<void>,
	apiReads: Set<PaperApiReadRequest>,
	path: PaperApiReadPath,
	method: string,
): Promise<boolean> {
	if (method !== "GET") {
		await json({
			ok: false,
			code: "INVALID_REQUEST",
			message: `Paper API fixture only accepts GET ${path}`,
		}, 405);
		return false;
	}
	apiReads.add(`GET ${path}`);
	return true;
}

function isPaperApiReadPath(pathname: string): pathname is PaperApiReadPath {
	return paperApiReadPaths.includes(pathname as PaperApiReadPath);
}

async function fulfillMockApi(route: Route, url: URL, method: string, apiReads: Set<PaperApiReadRequest>, visualCase: PaperVisualCase) {
	const pathname = url.pathname;
	const json = (body: unknown, status = 200) => route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
	if (method === "HEAD") {
		if (isPaperApiReadPath(pathname)) {
			await beginPaperApiRead(json, apiReads, pathname, method);
			return;
		}
		await route.fulfill({ status: 200, body: "" });
		return;
	}
	if (pathname === "/api/knowledge-bases") {
		await json({
			ok: true,
			data: [
				{ path: visualKbPath, name: "示例知识库", origin: "default", valid: true },
				{ path: "/visual/design", name: "设计灵感库", origin: "external", valid: true },
			],
		});
		return;
	}
	if (pathname === "/api/knowledge-base") {
		await json({ ok: true, data: { active: visualActiveContext() } });
		return;
	}
	if (pathname === "/api/conversations") {
		await json({
			ok: true,
			data: [
				{
					id: "visual-conversation",
					firstMessage: "Transformer vs Mamba 长文本",
					modifiedAt: Date.parse("2026-06-20T10:00:00.000Z"),
				},
				{
					id: "visual-rag",
					firstMessage: "RAG 检索增强笔记",
					modifiedAt: Date.parse("2026-06-19T10:00:00.000Z"),
				},
			],
		});
		return;
	}
	if (pathname === "/api/artifacts") {
		if (!(await beginPaperApiRead(json, apiReads, "/api/artifacts", method))) return;
		await json({ ok: true, data: [] });
		return;
	}
	if (pathname === "/api/commands") {
		await json({
			ok: true,
			data: [
				{ slug: "/sediment", name: "sediment_to_wiki", description: "把当前对话整理成页面", source: "builtin", isProjectSkill: false },
				{ slug: "/html", name: "html", description: "导出 HTML 页面", source: "builtin", isProjectSkill: false },
			],
		});
		return;
	}
	if (pathname === "/api/config") {
		if (!(await beginPaperApiRead(json, apiReads, "/api/config", method))) return;
		await json({
			ok: true,
			data: {
				version: 1,
				externalKnowledgeBases: [],
				lastUsedKbPath: visualKbPath,
				modelRoles: { main: { provider: "anthropic", modelId: "claude-sonnet-4.6" } },
			},
		});
		return;
	}
	if (pathname === "/api/models") {
		if (!(await beginPaperApiRead(json, apiReads, "/api/models", method))) return;
		await json({
			ok: true,
			data: [
				{
					provider: "anthropic",
					modelId: "claude-sonnet-4.6",
					name: "Claude Sonnet 4.6",
					reasoning: true,
					contextWindow: 200000,
					cost: { input: 3, output: 15 },
					hasAuth: true,
				},
			],
		});
		return;
	}
	if (pathname === "/api/refs") {
		await json({
			ok: true,
			data: [
				{ path: "wiki/concepts/mamba.md", name: "mamba", title: "Mamba", category: "concept" },
				{ path: "wiki/concepts/transformer.md", name: "transformer", title: "Transformer", category: "concept" },
				{ path: "wiki/concepts/rag.md", name: "rag", title: "RAG 检索增强", category: "concept" },
			],
		});
		return;
	}
	if (pathname === "/api/page") {
		const pagePath = url.searchParams.get("path");
		if (pagePath !== "wiki/concepts/mamba.md" && pagePath !== "wiki/topics/rename-visual.md") {
			await json({
				ok: false,
				code: "NOT_FOUND",
				message: "Unexpected Paper page fixture request",
			}, 404);
			return;
		}
		await json({
			ok: true,
			data: {
				content: pagePath === "wiki/topics/rename-visual.md" ? "# 改名视觉测试\n\n正式图谱页面。" : [
					"# Mamba",
					"",
					"Mamba 是选择性状态空间模型，把序列压缩成固定大小的隐状态，实现线性复杂度的长序列建模。",
					"",
					"属于「序列建模」社区，桥接「状态空间模型」。与 [[wiki/concepts/transformer.md]] 路径相反。",
				].join("\n"),
			},
		});
		return;
	}
	if (pathname === "/api/graph") {
		await json({
			ok: true,
			data: {
				state: { status: "ready", rebuiltAt: null },
				needsBuild: false,
				data: visualGraphData(),
				warning_state: {
					summary: null,
					details_status: "unavailable",
					details_unavailable_reason: "legacy_without_summary",
					engine_groups: [],
				},
			},
		});
		return;
	}
	if (pathname === "/api/graph/layout") {
		await json({
			ok: true,
			data: { version: 2, pins: {}, updatedAt: "2026-06-20T00:00:00.000Z" },
		});
		return;
	}
	if (pathname === "/api/graph/rebuild") {
		await json({ ok: true, data: { status: "started" } });
		return;
	}
	if (pathname === "/api/graph/renames/recovery") {
		await json({ ok: true, data: visualRenameRecovery(visualCase.rename) });
		return;
	}
	if (pathname === "/api/graph/renames/preview") {
		await json({ ok: true, data: visualRenamePreview() });
		return;
	}
	if (pathname === "/api/graph/renames/apply") {
		await json({
			ok: true,
			data: {
				outcome: "preview_stale",
				operation_id: visualRenameOperationId,
				reason: "知识库内容已在预览后变化，请重新生成预览。",
			},
		});
		return;
	}
	await json({ ok: false, error: `Unhandled visual mock route: ${method} ${pathname}` }, 404);
}

function visualRenameRecovery(rename: PaperVisualCase["rename"]) {
	const operation = {
		operation_id: visualRenameOperationId,
		source_path: "wiki/topics/rename-visual.md",
		target_path: "wiki/topics/rename-visual-renamed.md",
		retained_evidence: [],
	};
	if (rename === "conflict") {
		return {
			status: "required",
			operation: {
				...operation,
				state: "conflicted",
				graph_rebuild: "not_started",
				conflicts: [{
					source_path: "wiki/synthesis/外部当前版本.md",
					current_state: "present",
					current_sha256: "d".repeat(64),
					preserved_variants: ["current", "original", "intended"].map((kind, index) => ({
						kind,
						relative_path: `.wiki-tmp/rename-ops/${visualRenameOperationId}/evidence/${kind}-${index}.bin`,
						sha256: String(index + 1).repeat(64),
					})),
				}, {
					source_path: "wiki/synthesis/被外部删除.md",
					current_state: "missing",
					preserved_variants: [],
				}],
			},
			retained_evidence_receipts: [],
		};
	}
	if (rename === "blocked") {
		return {
			status: "blocked",
			reason: "unsafe_current_type",
			operation_id: visualRenameOperationId,
			retained_evidence_receipts: [],
		};
	}
	if (rename === "rebuild-restored") {
		return {
			status: "rebuild_required",
			operation: {
				...operation,
				state: "committed",
				graph_rebuild: "failed",
				conflicts: [],
			},
			retained_evidence_receipts: [],
		};
	}
	if (rename === "evidence-overflow") {
		const operationIds = [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
			"33333333-3333-4333-8333-333333333333",
		];
		return {
			status: "clear",
			retained_evidence_receipts: operationIds.map((operationId, receiptIndex) => ({
				operation_id: operationId,
				retained_evidence: Array.from({ length: 6 }, (_, evidenceIndex) => ({
					relative_path: `.wiki-tmp/rename-ops/${operationId}/evidence/current-${evidenceIndex}.bin`,
					sha256: "abcdef"[(receiptIndex + evidenceIndex) % 6]!.repeat(64),
					expires_at: "2026-08-21T00:00:00.000Z",
				})),
			})),
		};
	}
	return { status: "clear", retained_evidence_receipts: [] };
}

function visualRenamePreview() {
	const targetPath = "wiki/concepts/新的超长中文 Unicode 页面 Ω≈ç√∫˜µ≤≥÷ 研究笔记.md";
	const editableFiles = ["wiki/synthesis/长篇总览.md", "wiki/topics/多次引用.md"].map((sourcePath, fileIndex) => ({
		source_path: sourcePath,
		file_sha256: String(fileIndex + 2).repeat(64),
		read_only: false,
		occurrences: Array.from({ length: 4 }, (_, occurrenceIndex) => ({
			occurrence_id: `visual-editable-${fileIndex}-${occurrenceIndex}`,
			source_path: sourcePath,
			file_sha256: String(fileIndex + 2).repeat(64),
			start_byte: occurrenceIndex * 24,
			end_byte: occurrenceIndex * 24 + 9,
			raw_link: "[[mamba]]",
			replacement_raw_link: `[[${targetPath}]]`,
			resolution_kind: "unique_basename",
		})),
	}));
	return {
		operation_id: visualRenameOperationId,
		expires_at: "2026-08-21T00:00:00.000Z",
		preview_digest: "a".repeat(64),
		source_path: "wiki/topics/rename-visual.md",
		target_path: targetPath,
		equivalent_portable_name: false,
		file_set_sha256: "b".repeat(64),
		editable_files: editableFiles,
		read_only_references: ["raw/导入摘录.md", "wiki/legacy/旧格式引用.md"].map((sourcePath, index) => ({
			occurrence_id: `visual-readonly-${index}`,
			source_path: sourcePath,
			file_sha256: "c".repeat(64),
			start_byte: index * 12,
			end_byte: index * 12 + 9,
			raw_link: "[[mamba]]",
			resolution_kind: "unique_basename",
		})),
		ambiguous_choices: [],
		layout_change: {
			from_key: "wiki/topics/rename-visual.md",
			to_key: targetPath,
			present: true,
		},
		summary: {
			editable_files: 2,
			editable_occurrences: 8,
			read_only_occurrences: 2,
			ambiguous_occurrences: 0,
		},
	};
}

async function waitForStableVisualState(page: Page, visualCase: PaperVisualCase) {
	if (visualCase.view === "graph") {
		await page.waitForSelector('.graph-screen[data-graph-status="ready"]', { timeout: 15_000 });
		await page.waitForFunction(
			"(() => { const stage = document.querySelector('.graph-screen .graph-stage'); if (!stage) return false; const rect = stage.getBoundingClientRect(); return rect.width > 200 && rect.height > 200; })()",
			undefined,
			{ timeout: 15_000 },
		);
	}
	await page.waitForFunction(
		"new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
		undefined,
		{ timeout: 5_000 },
	);
}

function assertState(visualCase: PaperVisualCase, state: Record<string, unknown>) {
	const { prefs } = visualCase;
	for (const key of ["theme", "paper", "accent", "userbubble", "hand", "density"] as const) {
		if (state[key] !== prefs[key]) {
			throw new Error(`${visualCase.name}: expected ${key}=${prefs[key]}, got ${String(state[key])}`);
		}
	}
	if (state.darkClass !== (prefs.theme === "dark")) {
		throw new Error(`${visualCase.name}: dark class mismatch`);
	}
	if (typeof state.topbarFont !== "string" || !state.topbarFont.includes("Plus Jakarta Sans")) {
		throw new Error(`${visualCase.name}: font stack drifted: ${String(state.topbarFont)}`);
	}
	if (typeof state.viewportWidth === "number" && typeof state.documentWidth === "number" && state.documentWidth > state.viewportWidth + 1) {
		throw new Error(`${visualCase.name}: page overflowed horizontally (${state.documentWidth} > ${state.viewportWidth})`);
	}
	if (visualCase.rename) {
		const dialog = asRect(state.renameDialogRect);
		const action = asRect(state.renamePrimaryActionRect);
		if (!dialog || !action) throw new Error(`${visualCase.name}: missing rename dialog or primary action geometry`);
		if (dialog.left < -1 || dialog.right > Number(state.viewportWidth) + 1) {
			throw new Error(`${visualCase.name}: rename dialog escaped the viewport`);
		}
		if (action.top < dialog.top || action.bottom > dialog.bottom + 1) {
			throw new Error(`${visualCase.name}: rename primary action is not visible inside the dialog`);
		}
		const text = stringOrNull(state.renameDialogText);
		if (visualCase.rename === "preview") {
			assertTextIncludes(text, "新的超长中文 Unicode 页面", visualCase.name);
			assertTextIncludes(text, "只读引用", visualCase.name);
			assertTextIncludes(text, "8 处可编辑引用", visualCase.name);
		} else if (visualCase.rename === "stale") {
			assertTextIncludes(text, "预览已失效", visualCase.name);
		} else if (visualCase.rename === "conflict") {
			assertTextIncludes(text, "当前文件存在", visualCase.name);
			assertTextIncludes(text, "已被外部删除", visualCase.name);
		} else if (visualCase.rename === "blocked") {
			assertTextIncludes(text, "没有改写任何文件", visualCase.name);
		} else if (visualCase.rename === "rebuild-restored") {
			assertTextIncludes(text, "内容已保存，图谱尚未更新", visualCase.name);
		} else {
			assertTextIncludes(text, "输入新文件名", visualCase.name);
		}
	}

	const kbNameRect = asRect(state.kbNameRect);
	if (!kbNameRect || kbNameRect.width < 40) {
		throw new Error(`${visualCase.name}: knowledge base name collapsed`);
	}

	const topbarRect = asRect(state.topbarRect);
	if (!topbarRect || topbarRect.height < ((visualCase.viewport?.width ?? 1440) <= 768 ? 52 : 58)) {
		throw new Error(`${visualCase.name}: topbar height drifted`);
	}

	if (visualCase.view === "graph") {
		const graphScreenRect = asRect(state.graphScreenRect);
		const graphShellRect = asRect(state.graphShellRect);
		const graphShellToolbarRect = asRect(state.graphShellToolbarRect);
		const graphStageRect = asRect(state.graphStageRect);
		if (!graphScreenRect || !graphShellRect || !graphShellToolbarRect || !graphStageRect) {
			throw new Error(`${visualCase.name}: missing graph shell geometry`);
		}
		if (state.appLevelGraphToolbarCount !== 0) {
			throw new Error(`${visualCase.name}: found app-level .graph-toolbar overlay`);
		}
		if (state.appLevelGraphLegendCount !== 0) {
			throw new Error(`${visualCase.name}: found app-level graph legend overlay`);
		}
		if (graphShellToolbarRect.left < graphScreenRect.left - 1 || graphShellToolbarRect.right > graphScreenRect.right + 1) {
			throw new Error(`${visualCase.name}: graph toolbar escaped graph screen`);
		}
		if (graphShellToolbarRect.bottom > graphStageRect.top + 1) {
			throw new Error(`${visualCase.name}: graph toolbar overlaps graph stage`);
		}
	}

	if (visualCase.name.includes("sidebar")) {
		if (visualCase.sidebar === "collapsed") {
			const labels = Array.isArray(state.sidebarButtonLabels)
				? state.sidebarButtonLabels.map(String).join(" ")
				: "";
			assertTextIncludes(labels, "展开侧栏", visualCase.name);
			assertTextIncludes(labels, "图谱活地图", visualCase.name);
			assertTextIncludes(labels, "设置", visualCase.name);
			assertTextIncludes(labels, "新建知识库", visualCase.name);
			assertTextIncludes(labels, "添加现有库", visualCase.name);
			assertTextExcludes(labels, "刷新", visualCase.name);
		} else {
			if (state.sidebarKbRowIconCount !== 0) {
				throw new Error(`${visualCase.name}: expanded notebook rows still render leading icons`);
			}
			assertTextIncludes(stringOrNull(state.sidebarFooterText), "新建知识库", visualCase.name);
			assertTextIncludes(stringOrNull(state.sidebarFooterText), "添加现有库", visualCase.name);
			assertTextIncludes(stringOrNull(state.sidebarText), "笔记本", visualCase.name);
			assertTextIncludes(stringOrNull(state.sidebarText), "会话", visualCase.name);
			assertTextIncludes(stringOrNull(state.sidebarText), "图谱活地图", visualCase.name);
			assertTextExcludes(stringOrNull(state.sidebarText), "刷新", visualCase.name);
		}
	}

	if (visualCase.name.startsWith("v2-")) {
		assertTextIncludes(stringOrNull(state.mainTabsText), "对话", visualCase.name);
		assertTextIncludes(stringOrNull(state.mainTabsText), "图谱", visualCase.name);
		const mainTabs = asRect(state.mainTabsRect);
		const main = asRect(state.mainRect);
		if (!mainTabs || !main) throw new Error(`${visualCase.name}: missing V2 main view tabs`);
		if (mainTabs.left < main.left + 8 || mainTabs.top < main.top) {
			throw new Error(`${visualCase.name}: main view tabs are not placed at the top of the main area`);
		}
	}

	if (visualCase.v2Focus === "composer") {
		assertTextIncludes(stringOrNull(state.chatMessagesText), "transformer", visualCase.name);
		assertTextIncludes(stringOrNull(state.chatMessagesText), "mamba", visualCase.name);
		assertTextIncludes(stringOrNull(state.chatMessagesText), "两者都在解长序列", visualCase.name);
		const composer = asRect(state.composerRect);
		const textarea = asRect(state.textareaRect);
		const send = asRect(state.sendRect);
		if (!composer || !textarea || !send) throw new Error(`${visualCase.name}: missing composer geometry`);
		if (composer.height > 72) throw new Error(`${visualCase.name}: composer too tall for V2 (${composer.height}px)`);
		if (Math.abs(send.width - 36) > 1 || Math.abs(send.height - 36) > 1) {
			throw new Error(`${visualCase.name}: send button should be 36x36`);
		}
		if (textarea.right > send.left - 4) throw new Error(`${visualCase.name}: textarea collides with send button`);
	}

	if (visualCase.drawer === "wiki") {
		const drawer = asRect(state.drawerRect);
		const composer = asRect(state.composerRect);
		const textarea = asRect(state.textareaRect);
		const send = asRect(state.sendRect);
		if (!state.drawerOpen || !drawer || !composer || !textarea || !send) {
			throw new Error(`${visualCase.name}: expected drawer and composer geometry`);
		}
		if (Math.abs(send.width - 36) > 1 || Math.abs(send.height - 36) > 1) {
			throw new Error(`${visualCase.name}: send button should be 36x36`);
		}
		if (textarea.right > send.left - 4) {
			throw new Error(`${visualCase.name}: textarea collides with send button`);
		}
		const viewportWidth = Number(state.viewportWidth);
		if (viewportWidth >= 1024 && composer.right > drawer.left - 8) {
			throw new Error(`${visualCase.name}: drawer overlaps composer`);
		}
		if (viewportWidth >= 1024 && composer.width < 420) {
			throw new Error(`${visualCase.name}: composer squeezed too narrow (${composer.width}px)`);
		}
	}

	if (visualCase.name.startsWith("v2-") && Number(state.viewportWidth) === 768) {
		const sidebar = asRect(state.sidebarRect);
		if (!sidebar || sidebar.width < 220) throw new Error(`${visualCase.name}: V2 sidebar disappeared at 768px`);
	}

	if (visualCase.view === "graph") {
		const toolbar = asRect(state.graphShellToolbarRect);
		const stage = asRect(state.graphStageRect);
		const search = asRect(state.graphSearchRect);
		if (!toolbar || !stage) throw new Error(`${visualCase.name}: missing graph toolbar/stage geometry`);
		if (toolbar.bottom > stage.top + 1) throw new Error(`${visualCase.name}: graph toolbar overlaps stage`);
		if (state.graphSearchVisible && search && search.top < stage.top - 1) {
			throw new Error(`${visualCase.name}: graph search escaped stage`);
		}
		assertTextIncludes(stringOrNull(state.graphLegendText), "节点", visualCase.name);
		assertTextIncludes(stringOrNull(state.graphLegendText), "关系", visualCase.name);
		assertTextIncludes(stringOrNull(state.graphLegendText), "社区", visualCase.name);
	}
}

function asRect(value: unknown) {
	if (!value || typeof value !== "object") return null;
	const rect = value as Record<string, unknown>;
	const top = Number(rect.top);
	const right = Number(rect.right);
	const bottom = Number(rect.bottom);
	const left = Number(rect.left);
	const width = Number(rect.width);
	const height = Number(rect.height);
	if (![top, right, bottom, left, width, height].every(Number.isFinite)) return null;
	return { top, right, bottom, left, width, height };
}

function assertTextIncludes(value: string | null, expected: string, name: string) {
	if (!value?.includes(expected)) throw new Error(`${name}: expected text to include ${expected}, got ${value}`);
}

function assertTextExcludes(value: string | null, unexpected: string, name: string) {
	if (value?.includes(unexpected)) throw new Error(`${name}: expected text to exclude ${unexpected}, got ${value}`);
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function visualActiveContext() {
	return {
		kb: { path: visualKbPath, name: "示例知识库" },
		conversation: {
			id: "visual-conversation",
			messages: [
				{
					id: "u1",
					role: "user",
					content: "帮我对比一下 transformer 和 mamba 在长文本建模上的核心取舍，并在图谱里定位它们属于哪个社区。",
					tools: [],
				},
				{
					id: "a1",
					role: "assistant",
					content: "两者都在解长序列，但路径相反。Transformer 用全局注意力换表达力，代价是 O(n²)；Mamba 用选择性状态空间把序列压成固定隐状态，线性复杂度，远距离依赖靠记忆维持。",
					tools: [{ name: "read_file", status: "done" }],
				},
			],
		},
		model: { provider: "anthropic", id: "claude-sonnet-4.6" },
	};
}

function visualGraphData() {
	return {
		meta: {
			build_date: "2026-06-20T00:00:00.000Z",
			wiki_title: "示例知识库",
			total_nodes: 5,
			total_edges: 3,
		},
		nodes: [
			{ id: "wiki/concepts/transformer.md", label: "Transformer", title: "Transformer", type: "concept", community: "sequence", path: "wiki/concepts/transformer.md", source_path: "wiki/concepts/transformer.md", content: "注意力机制" },
			{ id: "wiki/concepts/mamba.md", label: "Mamba", title: "Mamba", type: "concept", community: "sequence", path: "wiki/concepts/mamba.md", source_path: "wiki/concepts/mamba.md", content: "状态空间模型" },
			{ id: "wiki/concepts/attention.md", label: "注意力机制", title: "注意力机制", type: "topic", community: "attention", path: "wiki/concepts/attention.md", source_path: "wiki/concepts/attention.md", content: "Transformer 的核心模块" },
			{ id: "wiki/concepts/state-space.md", label: "状态空间模型", title: "状态空间模型", type: "topic", community: "ssm", path: "wiki/concepts/state-space.md", source_path: "wiki/concepts/state-space.md", content: "Mamba 的模型家族" },
			{ id: "wiki/topics/rename-visual.md", label: "改名视觉测试", title: "改名视觉测试", type: "topic", community: "sequence", path: "wiki/topics/rename-visual.md", source_path: "wiki/topics/rename-visual.md", content: "正式图谱页面" },
		],
		edges: [
			{ id: "transformer-attention", from: "wiki/concepts/transformer.md", to: "wiki/concepts/attention.md", type: "RELATED", confidence: "EXTRACTED", relation_type: "依赖", weight: 1 },
			{ id: "mamba-ssm", from: "wiki/concepts/mamba.md", to: "wiki/concepts/state-space.md", type: "RELATED", confidence: "EXTRACTED", relation_type: "桥接", weight: 1 },
			{ id: "transformer-mamba", from: "wiki/concepts/transformer.md", to: "wiki/concepts/mamba.md", type: "RELATED", confidence: "INFERRED", relation_type: "对比", weight: 1 },
		],
		communities: [],
	};
}

function contentTypeForPath(filePath: string): string {
	if (filePath.endsWith(".html")) return "text/html";
	if (filePath.endsWith(".js")) return "text/javascript";
	if (filePath.endsWith(".css")) return "text/css";
	if (filePath.endsWith(".svg")) return "image/svg+xml";
	if (filePath.endsWith(".png")) return "image/png";
	if (filePath.endsWith(".woff2")) return "font/woff2";
	return "application/octet-stream";
}

async function canListenOnLocalhost(): Promise<boolean> {
	return new Promise((resolveCanListen) => {
		const server = createServer();
		server.once("error", () => resolveCanListen(false));
		server.listen(0, "127.0.0.1", () => {
			server.close(() => resolveCanListen(true));
		});
	});
}

async function findFreeLocalhostPort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => {
				if (port) resolvePort(port);
				else reject(new Error("Unable to allocate a localhost port"));
			});
		});
	});
}

async function waitForUrl(url: string, timeoutMs: number) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (await isReachable(url)) return;
		await delay(250);
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function isReachable(url: string) {
	try {
		const response = await fetch(url, { method: "HEAD" });
		return response.ok;
	} catch {
		return false;
	}
}
