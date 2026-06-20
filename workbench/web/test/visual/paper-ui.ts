import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "playwright";

type PaperSmokeCase = {
	name: string;
	prefs: {
		theme: "light" | "dark";
		paper: "clean";
		accent: "terracotta";
		userbubble: "soft";
		hand: "on";
		density: "cozy";
	};
};

const baseUrl = process.env.PAPER_UI_BASE_URL ?? "http://localhost:5180";
const updateBaseline = process.argv.includes("--update");
const actualDir = resolve(process.cwd(), "test-results/paper-ui/actual");
const baselineDir = resolve(process.cwd(), "test-results/paper-ui/baseline");

const cases: PaperSmokeCase[] = [
	{
		name: "paper-light-1440",
		prefs: {
			theme: "light",
			paper: "clean",
			accent: "terracotta",
			userbubble: "soft",
			hand: "on",
			density: "cozy",
		},
	},
	{
		name: "paper-dark-1440",
		prefs: {
			theme: "dark",
			paper: "clean",
			accent: "terracotta",
			userbubble: "soft",
			hand: "on",
			density: "cozy",
		},
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
		for (const smokeCase of cases) {
			await captureSmoke(browser, smokeCase);
		}
	} finally {
		await browser.close();
	}
} finally {
	if (server) {
		server.kill("SIGTERM");
	}
}

async function captureSmoke(browser: Browser, smokeCase: PaperSmokeCase) {
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		viewport: { width: 1440, height: 900 },
	});
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
		}, smokeCase.prefs);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector(".app-shell", { timeout: 15_000 });
		await page.evaluate(async () => {
			await document.fonts?.ready;
		});

		const state = await page.evaluate(() => {
			const root = document.documentElement;
			const appShell = document.querySelector(".app-shell");
			return {
				theme: root.dataset.theme,
				paper: root.dataset.paper,
				accent: root.dataset.accent,
				userbubble: root.dataset.userbubble,
				hand: root.dataset.hand,
				density: root.dataset.density,
				darkClass: root.classList.contains("dark"),
				appBackground: appShell ? getComputedStyle(appShell).backgroundColor : null,
			};
		});

		if (state.theme !== smokeCase.prefs.theme) {
			throw new Error(`${smokeCase.name}: expected theme=${smokeCase.prefs.theme}, got ${state.theme}`);
		}
		if (state.paper !== "clean" || state.accent !== "terracotta" || state.userbubble !== "soft" || state.hand !== "on" || state.density !== "cozy") {
			throw new Error(`${smokeCase.name}: Paper defaults drifted: ${JSON.stringify(state)}`);
		}
		if (state.darkClass !== (smokeCase.prefs.theme === "dark")) {
			throw new Error(`${smokeCase.name}: dark class mismatch`);
		}

		const filename = `${smokeCase.name}.png`;
		const actualPath = resolve(actualDir, filename);
		await page.screenshot({ fullPage: true, path: actualPath });
		if (updateBaseline) {
			await copyFile(actualPath, resolve(baselineDir, filename));
		}
		console.log(`${smokeCase.name}: wrote ${actualPath}`);
	} finally {
		await context.close();
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
