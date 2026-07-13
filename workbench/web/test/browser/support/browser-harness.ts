import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Browser, BrowserContext, BrowserServer } from "playwright";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../../..");
export const WEB_ROOT = join(REPO_ROOT, "workbench/web");
export const SERVER_ENTRY = join(REPO_ROOT, "workbench/server/test/browser-entry.ts");
export const NETWORK_GUARD = join(REPO_ROOT, "workbench/server/test/support/network-guard.mjs");
export const VITE_ENTRY = join(REPO_ROOT, "node_modules/vite/bin/vite.js");
export const START_TIMEOUT_MS = 30_000;
export const OPERATION_TIMEOUT_MS = 12_000;
export const STOP_TIMEOUT_MS = 5_000;
const FAKE_MODEL_MARKER = "browser-foundation-fake-model";

export interface RunningProcess {
	child: ChildProcess;
	output: () => string;
}

export async function createKnowledgeBase(path: string, title: string, sharedText: string): Promise<void> {
	await mkdir(join(path, "wiki/entities"), { recursive: true });
	await writeFile(join(path, ".wiki-schema.md"), `# ${title} schema\n`);
	await writeFile(join(path, "wiki/entities/shared.md"), `# ${title}\n\n${sharedText}\n`);
}

export async function createConversation(appDir: string, kbPath: string, message: string): Promise<string> {
	const hash = createHash("sha256").update(kbPath).digest("hex").slice(0, 16);
	const sessionDir = join(appDir, "sessions", hash);
	await mkdir(sessionDir, { recursive: true });
	const manager = SessionManager.create(REPO_ROOT, sessionDir);
	manager.appendMessage({ role: "user", content: [{ type: "text", text: message }], timestamp: Date.now() } as never);
	manager.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "Fictional fixture reply" }],
		api: "browser-fixture-api",
		provider: "browser-fixture-provider",
		model: "browser-fixture-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	} as never);
	return manager.getSessionId();
}

export function isolatedEnvironment(home: string, port: number, selectedDirectory: string, networkProbeFile: string): NodeJS.ProcessEnv {
	return {
		HOME: home,
		HOST: "127.0.0.1",
		PORT: String(port),
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		TMPDIR: join(home, "tmp"),
		LANG: "C.UTF-8",
		LLM_WIKI_BROWSER_SELECTED_DIRECTORY: selectedDirectory,
		...platformSandboxEnvironment(home),
		...networkGuardEnvironment(networkProbeFile),
	};
}

export function networkGuardEnvironment(probeFile: string): NodeJS.ProcessEnv {
	return {
		NODE_OPTIONS: `--import=${NETWORK_GUARD}`,
		LLM_WIKI_BROWSER_NETWORK_PROBE_FILE: probeFile,
		LLM_WIKI_BROWSER_NETWORK_PROBE_TARGET: "http://192.0.2.1:9",
	};
}

export async function prepareSandboxDirectories(home: string): Promise<void> {
	const directories = [join(home, "tmp")];
	if (process.platform === "win32") directories.push(join(home, "AppData", "Roaming"), join(home, "AppData", "Local"));
	await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

export function platformSandboxEnvironment(home: string): Record<string, string> {
	if (process.platform !== "win32") return {};
	return {
		USERPROFILE: home,
		APPDATA: join(home, "AppData", "Roaming"),
		LOCALAPPDATA: join(home, "AppData", "Local"),
		TEMP: join(home, "tmp"),
		TMP: join(home, "tmp"),
		...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
	};
}

export async function blockExternalBrowserTraffic(context: BrowserContext, blocked: string[]): Promise<void> {
	await context.route(/^https?:\/\/(?!127\.0\.0\.1(?::\d+)?(?:\/|$)|localhost(?::\d+)?(?:\/|$))/, async (route) => {
		blocked.push(new URL(route.request().url()).origin);
		await route.abort("blockedbyclient");
	});
	await context.routeWebSocket(/^wss?:\/\/(?!127\.0\.0\.1(?::\d+)?(?:\/|$)|localhost(?::\d+)?(?:\/|$))/, async (route) => {
		blocked.push(new URL(route.url()).origin);
		await route.close({ code: 1008, reason: "external connections are disabled in browser tests" });
	});
}

export async function closeBrowserResources(resources: {
	context?: BrowserContext;
	browser?: Browser;
	browserServer?: BrowserServer;
}): Promise<void> {
	const errors: unknown[] = [];
	if (resources.context) {
		await withTimeout(resources.context.close(), STOP_TIMEOUT_MS, "browser context did not close").catch((error) => errors.push(error));
	}
	if (resources.browser) {
		await withTimeout(resources.browser.close(), STOP_TIMEOUT_MS, "browser did not close").catch((error) => errors.push(error));
	}
	const server = resources.browserServer;
	if (server && server.process().exitCode === null && server.process().signalCode === null) {
		await withTimeout(server.close(), STOP_TIMEOUT_MS, "browser server did not close").catch(async (error) => {
			errors.push(error);
			await withTimeout(server.kill(), STOP_TIMEOUT_MS, "browser process could not be killed").catch((killError) => errors.push(killError));
		});
	}
	if (errors.length > 0) throw new AggregateError(errors, "browser resource cleanup failed");
}

export async function startProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, ready: (output: string) => boolean, name: string): Promise<RunningProcess> {
	await mkdir(env.TMPDIR ?? join(tmpdir(), "llm-wiki-browser-tmp"), { recursive: true });
	const child = spawn(command, args, { cwd, detached: process.platform !== "win32", env, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => { output += chunk; });
	child.stderr?.on("data", (chunk: string) => { output += chunk; });
	const running = { child, output: () => output };
	try {
		await waitUntil(() => ready(output), START_TIMEOUT_MS, `${name} did not start`, child, running.output);
		return running;
	} catch (error) {
		signalProcessTree(child, "SIGKILL");
		try {
			await waitForExit(child, 1_000, running.output);
		} catch (exitError) {
			throw new AggregateError([error, exitError], `${name} failed to start and could not be stopped`, { cause: exitError });
		}
		throw new Error(`${String(error)}\n${output}`, { cause: error });
	}
}

export async function stopProcess(running: RunningProcess, expectedExitCodes: readonly number[] = [0]): Promise<void> {
	if (running.child.exitCode !== null || running.child.signalCode !== null) return;
	signalProcessTree(running.child, "SIGTERM");
	let result: Awaited<ReturnType<typeof waitForExit>>;
	try {
		result = await waitForExit(running.child, STOP_TIMEOUT_MS, running.output);
	} catch (error) {
		signalProcessTree(running.child, "SIGKILL");
		await waitForExit(running.child, 1_000, running.output).catch(() => undefined);
		throw error;
	}
	assert.equal(result.signal, null, running.output());
	if (process.platform !== "win32") assert.equal(expectedExitCodes.includes(result.code ?? -1), true, running.output());
}

export async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number, message: string, child?: ChildProcess, output?: () => string): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`${message}: process exited\n${output?.() ?? ""}`);
		if (Date.now() >= deadline) throw new Error(`${message}\n${output?.() ?? ""}`);
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
	}
}

export async function waitForFile(path: string, timeoutMs = OPERATION_TIMEOUT_MS): Promise<void> {
	await waitUntil(() => stat(path).then(() => true, () => false), timeoutMs, `file did not appear: ${path}`);
}

export async function waitForExit(child: ChildProcess, timeoutMs: number, output: () => string): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode, signal: child.signalCode };
	return new Promise((resolvePromise, reject) => {
		const timer = setTimeout(() => reject(new Error(`process did not stop within ${timeoutMs}ms\n${output()}`)), timeoutMs);
		child.once("exit", (code, signal) => {
			clearTimeout(timer);
			resolvePromise({ code, signal });
		});
	});
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
	if (!child.pid) return;
	try {
		if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
		else process.kill(-child.pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

export async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
	const address = server.address();
	assert(address && typeof address === "object");
	const port = address.port;
	await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
	return port;
}

export async function assertPortAvailable(port: number): Promise<void> {
	const server = createServer();
	await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolvePromise); });
	await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
}

export function sanitizeBrowserOutput(value: string, sandbox: string): string {
	return value.replaceAll(REPO_ROOT, "<repo>").replaceAll(sandbox, "<sandbox>").replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}\b/g, "<redacted-token>");
}

export async function assertProductionBuildExcludesBrowserFakes(): Promise<void> {
	const dist = join(REPO_ROOT, "workbench/server/dist");
	await stat(join(dist, "index.js"));
	const files = await collectFiles(dist);
	assert.equal(files.some((file) => file.endsWith(".test.js")), false);
	assert.equal(files.some((file) => file.includes("browser-entry")), false);
	for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
		const content = await readFile(file, "utf8");
		assert.equal(content.includes(FAKE_MODEL_MARKER), false);
		assert.equal(content.includes("LLM_WIKI_BROWSER_"), false);
	}
}

async function collectFiles(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = join(path, entry.name);
		if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
		else files.push(entryPath);
	}
	return files;
}
