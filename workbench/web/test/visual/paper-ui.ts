import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Route } from "playwright";

type ThemeValue = "light" | "dark";
type PaperValue = "clean" | "grid" | "laid";
type AccentValue = "terracotta" | "clay" | "amber" | "rose";
type UserBubbleValue = "soft" | "solid";
type HandValue = "on" | "off";
type DensityValue = "cozy" | "compact";

type PaperPrefs = {
	theme: ThemeValue;
	paper: PaperValue;
	accent: AccentValue;
	userbubble: UserBubbleValue;
	hand: HandValue;
	density: DensityValue;
};

type PaperVisualCase = {
	name: string;
	description: string;
	prefs: PaperPrefs;
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
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		viewport: { width: 1440, height: 900 },
	});
	if (visualCase.fonts === "blocked") {
		await context.route(/fonts\.(googleapis|gstatic)\.com/, (route: Route) => route.abort());
	}
	const page = await context.newPage();
	try {
		await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
		await page.evaluate((prefs) => {
			localStorage.setItem("llm-wiki-agent-theme", prefs.theme);
			localStorage.setItem("llm-wiki-agent-appearance-paper", prefs.paper);
			localStorage.setItem("llm-wiki-agent-appearance-accent", prefs.accent);
			localStorage.setItem("llm-wiki-agent-appearance-userbubble", prefs.userbubble);
			localStorage.setItem("llm-wiki-agent-appearance-hand", prefs.hand);
			localStorage.setItem("llm-wiki-agent-appearance-density", prefs.density);
		}, visualCase.prefs);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector(".app-shell", { timeout: 15_000 });
		await page.evaluate(async () => {
			await document.fonts?.ready;
		});

		const state = await page.evaluate(() => {
			const root = document.documentElement;
			const appShell = document.querySelector(".app-shell");
			const topbar = document.querySelector(".topbar");
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
