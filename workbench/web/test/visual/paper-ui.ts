import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page, type Route } from "playwright";

import {
	APPEARANCE_STORAGE_PREFIX,
	THEME_STORAGE_KEY,
	type AppearancePrefs as PaperPrefs,
} from "../../src/lib/appearance";

const MAIN_VIEW_STORAGE_KEY = "llm-wiki-agent-main-view";

type PaperVisualCase = {
	name: string;
	description: string;
	prefs: PaperPrefs;
	viewport?: { width: number; height: number };
	view?: "chat" | "graph";
	fonts?: "normal" | "blocked";
};

const baseUrl = process.env.PAPER_UI_BASE_URL ?? "http://localhost:5180";
const updateBaseline = process.argv.includes("--update");
const actualDir = resolve(process.cwd(), "test-results/paper-ui/actual");
const baselineDir = resolve(process.cwd(), "test-results/paper-ui/baseline");
const defaultPrefs: PaperPrefs = {
	theme: "light",
	paper: "clean",
	accent: "terracotta",
	userbubble: "soft",
	hand: "on",
	density: "cozy",
};

const cases: PaperVisualCase[] = [
	...(["light", "dark"] as const).flatMap((theme) =>
		(["clean", "grid", "laid"] as const).map((paper) => ({
			name: `${theme}-${paper}-1440`,
			description: `${theme} theme with ${paper} paper`,
			prefs: { ...defaultPrefs, theme, paper },
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
];

await mkdir(actualDir, { recursive: true });
await mkdir(baselineDir, { recursive: true });

let server: ChildProcessWithoutNullStreams | null = null;

try {
	if (!(await isReachable(baseUrl))) {
		server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
			cwd: process.cwd(),
			env: process.env,
		});
		server.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
		server.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
		await waitForUrl(baseUrl, 30_000);
	}

	const browser = await chromium.launch({ headless: true });
	try {
		for (const visualCase of cases) {
			await captureCase(browser, visualCase);
		}
	} finally {
		await browser.close();
	}
} finally {
	if (server) {
		server.kill("SIGTERM");
	}
}

async function captureCase(browser: Browser, visualCase: PaperVisualCase) {
	const viewport = visualCase.viewport ?? { width: 1440, height: 900 };
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		viewport,
	});
	if (visualCase.fonts === "blocked") {
		await context.route(/fonts\.(googleapis|gstatic)\.com/, (route: Route) => route.abort());
	}
	const page = await context.newPage();
		try {
			await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
			await page.evaluate((prefs) => {
				localStorage.setItem(prefs.themeStorageKey, prefs.theme);
				localStorage.setItem(`${prefs.appearanceStoragePrefix}paper`, prefs.paper);
				localStorage.setItem(`${prefs.appearanceStoragePrefix}accent`, prefs.accent);
				localStorage.setItem(`${prefs.appearanceStoragePrefix}userbubble`, prefs.userbubble);
				localStorage.setItem(`${prefs.appearanceStoragePrefix}hand`, prefs.hand);
				localStorage.setItem(`${prefs.appearanceStoragePrefix}density`, prefs.density);
				localStorage.setItem(prefs.mainViewStorageKey, prefs.view ?? "chat");
			}, {
				...visualCase.prefs,
				view: visualCase.view,
				themeStorageKey: THEME_STORAGE_KEY,
				appearanceStoragePrefix: APPEARANCE_STORAGE_PREFIX,
				mainViewStorageKey: MAIN_VIEW_STORAGE_KEY,
			});
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector(".app-shell", { timeout: 15_000 });
		await page.waitForSelector(visualCase.view === "graph" ? ".graph-screen" : ".chat-screen", { timeout: 15_000 });
		await page.evaluate(async () => {
			await document.fonts?.ready;
		});
		await waitForStableVisualState(page, visualCase);

		const state = await page.evaluate(() => {
			const root = document.documentElement;
			const body = document.body;
			const appShell = document.querySelector(".app-shell");
			const topbar = document.querySelector(".topbar");
			const kbName = document.querySelector(".topbar-kb-name");
			const graphScreen = document.querySelector(".graph-screen");
			const graphShellToolbar = document.querySelector(".graph-screen > .graph-shell-toolbar");
			const graphStage = document.querySelector(".graph-screen > .graph-stage");
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
		console.log(`${visualCase.name}: wrote ${actualPath}${updateBaseline ? " and updated baseline" : ""}`);
	} finally {
		await context.close();
	}
}

async function waitForStableVisualState(page: Page, visualCase: PaperVisualCase) {
	if (visualCase.view === "graph") {
		await page.waitForSelector('.graph-screen[data-graph-status="ready"]', { timeout: 15_000 });
		await page.waitForFunction(
			"(() => { const stage = document.querySelector('.graph-screen > .graph-stage'); if (!stage) return false; const rect = stage.getBoundingClientRect(); return rect.width > 200 && rect.height > 200; })()",
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

	const kbNameRect = asRect(state.kbNameRect);
	if (!kbNameRect || kbNameRect.width < 40) {
		throw new Error(`${visualCase.name}: knowledge base name collapsed`);
	}

	const topbarRect = asRect(state.topbarRect);
	if (!topbarRect || topbarRect.height < (visualCase.viewport?.width === 768 ? 52 : 58)) {
		throw new Error(`${visualCase.name}: topbar height drifted`);
	}

	if (visualCase.view === "graph") {
		const graphScreenRect = asRect(state.graphScreenRect);
		const graphShellToolbarRect = asRect(state.graphShellToolbarRect);
		const graphStageRect = asRect(state.graphStageRect);
		if (!graphScreenRect || !graphShellToolbarRect || !graphStageRect) {
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
