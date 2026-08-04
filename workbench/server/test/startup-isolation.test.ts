import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SERVER_ENTRY = join(REPO_ROOT, "workbench/server/dist/index.js");
const WEB_ROOT = join(REPO_ROOT, "workbench/web");
const VITE_ENTRY = join(REPO_ROOT, "node_modules/vite/bin/vite.js");
const TRUSTED_ORIGIN = "http://127.0.0.1:5180";
const TOKEN_HEADER = "X-LLM-Wiki-Workbench-Token";
const START_TIMEOUT_MS = 20_000;
const OPERATION_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 5_000;

interface RunningServer {
	child: ChildProcess;
	output: () => string;
	stop: () => Promise<void>;
}

interface SpawnedServer {
	child: ChildProcess;
	output: () => string;
}

test(
	"formal server starts in an isolated HOME, rotates its token, restores state, and cleans up",
	{ timeout: 60_000 },
	async (t) => {
		const sandbox = await mkdtemp(join(tmpdir(), "llm-wiki-startup-"));
		const home = join(sandbox, "home");
		const kbPath = join(home, "llm-wiki", "restored-kb");
		const appDir = join(home, ".llm-wiki-agent");
		const tokenFile = join(appDir, "runtime", "capability-token");
		const configFile = join(appDir, "config.json");
		const outsideMarker = join(sandbox, "outside-home.txt");
		const testBin = join(home, "test-bin");
		const rebuildPidFile = join(home, "rebuild-child.pid");
		const childProbeFile = join(home, "child-isolation-probe.txt");
		const childOutsideMarker = join(sandbox, "child-outside-home.txt");
		const realAppConfig = await existingSensitivePathOrSentinel(
			process.platform === "linux" ? join(sandbox, "missing-app-config") : join(homedir(), ".llm-wiki-agent", "config.json"),
			join(sandbox, "real-app-config-sentinel.json"),
		);
		const realModelCredentials = await existingSensitivePathOrSentinel(
			process.platform === "linux" ? join(sandbox, "missing-model-credentials") : join(homedir(), ".pi", "agent", "auth.json"),
			join(sandbox, "real-model-credentials-sentinel.json"),
		);
		const childSandboxProfile = join(home, "child-isolation.sb");
		const parentProbeFile = join(home, "parent-isolation-probe.json");
		const parentOutsideMarker = join(sandbox, "parent-outside-home.txt");
		const externalProbeHost = nonLoopbackIpv4();
		const externalProbeSockets = new Set<Socket>();
		let externalProbeConnections = 0;
		const externalProbeServer = createServer((socket) => {
			externalProbeConnections++;
			externalProbeSockets.add(socket);
			socket.once("close", () => externalProbeSockets.delete(socket));
			socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");
		});
		await listenOnHost(externalProbeServer, 0, externalProbeHost);
		const externalProbeAddress = externalProbeServer.address();
		assert(externalProbeAddress && typeof externalProbeAddress === "object");
		const externalProbeUrl = `http://${externalProbeHost}:${externalProbeAddress.port}`;
		const externalProbeControl = await fetch(externalProbeUrl);
		assert.equal(externalProbeControl.status, 200);
		assert.equal(await externalProbeControl.text(), "OK");
		assert.equal(externalProbeConnections, 1);
		const port = await availablePort();
		let running: RunningServer | undefined;
		let vite: SpawnedServer | undefined;

		await mkdir(join(kbPath, "wiki", "entities"), { recursive: true });
		await mkdir(appDir, { recursive: true });
		await mkdir(testBin, { recursive: true });
		await writeFile(join(kbPath, ".wiki-schema.md"), "# isolated test schema\n");
		await writeFile(join(kbPath, "wiki", "entities", "one.md"), "# One\n");
		const rebuildCommand = join(testBin, "bash");
		await writeFile(
			rebuildCommand,
			`#!/bin/sh
{
	if /bin/cat ${shellQuote(realAppConfig)} >/dev/null 2>&1; then echo real_app_read=ALLOWED; else echo real_app_read=BLOCKED; fi
	if /bin/cat ${shellQuote(realModelCredentials)} >/dev/null 2>&1; then echo real_credentials_read=ALLOWED; else echo real_credentials_read=BLOCKED; fi
	if echo forbidden > ${shellQuote(childOutsideMarker)} 2>/dev/null; then echo outside_write=ALLOWED; else echo outside_write=BLOCKED; fi
	code=$(/usr/bin/curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 ${shellQuote(externalProbeUrl)} 2>/dev/null || true)
	if [ "$code" = 200 ]; then echo external_network=ALLOWED; else echo external_network=BLOCKED; fi
} > ${shellQuote(childProbeFile)}
echo $$ > ${shellQuote(rebuildPidFile)}
sleep 30
`,
		);
		await chmod(rebuildCommand, 0o755);
		if (process.platform === "darwin") {
			await writeFile(
				childSandboxProfile,
				macOsChildSandboxProfile(await realpath(home), [realAppConfig, realModelCredentials]),
			);
		}
		await writeFile(
			configFile,
			`${JSON.stringify({ version: 1, externalKnowledgeBases: [], lastUsedKbPath: kbPath }, null, 2)}\n`,
		);
		await mkdir(dirname(tokenFile), { recursive: true });
		await writeFile(tokenFile, "stale-token", { mode: 0o644 });
		await chmod(tokenFile, 0o644);
		await writeFile(outsideMarker, "must-not-change\n");

		t.after(async () => {
			if (vite) await stopSpawnedProcess(vite).catch(() => undefined);
			if (running) await running.stop().catch(() => undefined);
			for (const socket of externalProbeSockets) socket.destroy();
			await closeServer(externalProbeServer).catch(() => undefined);
			if (process.platform === "linux") await chmod(sandbox, 0o700);
			await rm(sandbox, { recursive: true, force: true });
		});

		if (process.platform === "linux") {
			await chmod(realAppConfig, 0o000);
			await chmod(realModelCredentials, 0o000);
			await chmod(sandbox, 0o500);
		}
		await assert.rejects(
			stat(join(REPO_ROOT, "workbench/server/dist/test/support/isolation-guard.mjs")),
		);

		const environment = isolatedEnvironment(home, port, testBin, childSandboxProfile, {
			deniedReads: [realAppConfig, realModelCredentials],
			externalProbeUrl,
			outsideMarker: parentOutsideMarker,
			probeFile: parentProbeFile,
		});
		assert.equal(externalProbeConnections, 1);
		assert.equal(environment.OPENAI_API_KEY, undefined);
		assert.equal(environment.ANTHROPIC_API_KEY, undefined);
		assert.equal(environment.ATLASCLOUD_API_KEY, undefined);
		assert.equal(environment.PI_CONFIG_DIR, undefined);
		assert.equal(environment.XDG_CONFIG_HOME, undefined);
		assert.equal(environment.HOME, home);
		await assert.rejects(stat(join(home, ".pi", "agent", "auth.json")));

		running = await startServer(environment);
		await waitForFile(parentProbeFile, OPERATION_TIMEOUT_MS);
		assert.deepEqual(JSON.parse(await readFile(parentProbeFile, "utf8")), {
			externalNetwork: "BLOCKED",
			outsideWrite: "BLOCKED",
			realAppRead: "BLOCKED",
			realCredentialsRead: "BLOCKED",
		});
		await assert.rejects(stat(parentOutsideMarker));
		assert.match(running.output(), /ignoring unsafe HOST=0\.0\.0\.0/);
		assert.match(running.output(), new RegExp(`listening on http://127\\.0\\.0\\.1:${port}`));

		const firstToken = await readFile(tokenFile, "utf8");
		assert.notEqual(firstToken, "stale-token");
		assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);

		const restored = await apiRequest(port, firstToken, TRUSTED_ORIGIN);
		assert.equal(restored.status, 200);
		const restoredBody = (await restored.json()) as {
			ok: boolean;
			data?: { active?: { kb?: { path?: string } } };
		};
		assert.equal(restoredBody.ok, true);
		assert.equal(restoredBody.data?.active?.kb?.path, kbPath);

		const diskBeforeRead = await snapshotTree(home);
		const outsideBeforeRead = await readFile(outsideMarker, "utf8");
		const untrusted = await apiRequest(port, firstToken, "https://untrusted.example");
		assert.equal(untrusted.status, 403);
		assert.equal(untrusted.headers.get("access-control-allow-origin"), null);
		assert.doesNotMatch(await untrusted.text(), /restored-kb|llm-wiki-startup-/);
		const trustedRead = await apiRequest(port, firstToken, TRUSTED_ORIGIN);
		assert.equal(trustedRead.status, 200);
		await trustedRead.arrayBuffer();
		assert.deepEqual(await snapshotTree(home), diskBeforeRead);
		assert.equal(await readFile(outsideMarker, "utf8"), outsideBeforeRead);

		await running.stop();
		running = undefined;
		await assertPortReleased(port);

		running = await startServer(environment);
		const secondToken = await readFile(tokenFile, "utf8");
		assert.notEqual(secondToken, firstToken);
		assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);

		const staleCredential = await apiRequest(port, firstToken, TRUSTED_ORIGIN);
		assert.equal(staleCredential.status, 403);
		const recoveredAgain = await apiRequest(port, secondToken, TRUSTED_ORIGIN);
		assert.equal(recoveredAgain.status, 200);
		const recoveredAgainBody = (await recoveredAgain.json()) as {
			data?: { active?: { kb?: { path?: string } } };
		};
		assert.equal(recoveredAgainBody.data?.active?.kb?.path, kbPath);

		const competingStart = await expectFailedStart(environment);
		assert.notEqual(competingStart.code, 0);
		assert.equal(competingStart.signal, null);
		assert.match(competingStart.output, /EADDRINUSE/);
		vite = await startVite(home, port);
		assert.equal((await frontendApiRequest()).status, 200);
		const tokenAfterCompetingStart = await readFile(tokenFile, "utf8");
		assert.equal(tokenAfterCompetingStart, secondToken);
		assert.equal(
			(await apiRequest(port, tokenAfterCompetingStart, TRUSTED_ORIGIN)).status,
			200,
		);
		assert.equal((await apiRequest(port, secondToken, TRUSTED_ORIGIN)).status, 200);
		assert.equal(running.child.exitCode, null);

		const rebuildResponse = await graphRebuildRequest(port, secondToken, kbPath);
		assert.equal(rebuildResponse.status, 200);
		await waitForFile(rebuildPidFile, OPERATION_TIMEOUT_MS).catch((error) => {
			throw new Error(`${String(error)}\n${running?.output() ?? ""}`);
		});
		await waitForFile(childProbeFile, START_TIMEOUT_MS);
		assert.deepEqual((await readFile(childProbeFile, "utf8")).trim().split("\n"), [
			"real_app_read=BLOCKED",
			"real_credentials_read=BLOCKED",
			"outside_write=BLOCKED",
			"external_network=BLOCKED",
		]);
		assert.equal(externalProbeConnections, 1);
		await assert.rejects(stat(childOutsideMarker));
		const rebuildPid = Number((await readFile(rebuildPidFile, "utf8")).trim());
		assert.equal(processExists(rebuildPid), true);
		await running.stop();
		running = undefined;
		await assertPortReleased(port);
		assert.equal(processExists(rebuildPid), false);

		running = await startServer(environment);
		const thirdToken = await readFile(tokenFile, "utf8");
		assert.notEqual(thirdToken, secondToken);
		const eventsController = new AbortController();
		const eventsResponse = await eventStreamRequest(port, thirdToken, kbPath, eventsController.signal);
		assert.equal(eventsResponse.status, 200);
		const eventsReader = eventsResponse.body?.getReader();
		assert(eventsReader);
		const firstEvent = await eventsReader.read();
		assert.equal(firstEvent.done, false);
		try {
			await running.stop();
		} finally {
			eventsController.abort();
			void eventsReader.cancel().catch(() => undefined);
		}
		running = undefined;
		await assertPortReleased(port);

		const portBlocker = createServer();
		await listen(portBlocker, port);
		let failedStart: Awaited<ReturnType<typeof expectFailedStart>>;
		try {
			failedStart = await expectFailedStart(environment);
		} finally {
			await closeServer(portBlocker);
		}
		assert.notEqual(failedStart.code, 0);
		assert.equal(failedStart.signal, null);
		assert.match(failedStart.output, /EADDRINUSE/);
		await assertPortReleased(port);

		running = await startServer(environment);
		await running.stop();
		running = undefined;
		await assertPortReleased(port);
	},
);

function isolatedEnvironment(
	home: string,
	port: number,
	testBin: string,
	childSandboxProfile: string,
	probe: { deniedReads: string[]; externalProbeUrl: string; outsideMarker: string; probeFile: string },
): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = {
		HOME: home,
		HOST: "0.0.0.0",
		PORT: String(port),
		PATH: `${testBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
		TMPDIR: join(home, "tmp"),
		LANG: "C.UTF-8",
		LLM_WIKI_ISOLATED_WRITE_ROOT: home,
		LLM_WIKI_ISOLATED_DENIED_READS: JSON.stringify(probe.deniedReads),
		LLM_WIKI_ISOLATED_PROBE_NETWORK: probe.externalProbeUrl,
		LLM_WIKI_ISOLATED_PROBE_FILE: probe.probeFile,
		LLM_WIKI_ISOLATED_PROBE_OUTSIDE: probe.outsideMarker,
		LLM_WIKI_ISOLATED_FIRST_GROUP_SIGNAL_NOOP: "1",
		LLM_WIKI_ISOLATED_REJECT_DUPLICATE_SIGNALS: "1",
		NODE_OPTIONS: `--import=${join(import.meta.dirname, "support/isolation-guard.mjs")}`,
	};
	if (process.platform === "darwin") {
		environment.LLM_WIKI_ISOLATED_CHILD_PROFILE = childSandboxProfile;
	}
	if (process.platform === "linux") {
		const uid = process.getuid?.();
		const gid = process.getgid?.();
		if (uid === undefined || gid === undefined || uid === 0) {
			throw new Error("startup isolation check requires a non-root Linux user");
		}
		environment.LLM_WIKI_ISOLATED_LINUX_UID = String(uid);
		environment.LLM_WIKI_ISOLATED_LINUX_GID = String(gid);
	}
	if (process.platform === "win32" && process.env.SystemRoot) {
		environment.SystemRoot = process.env.SystemRoot;
	}
	return environment;
}

async function startServer(environment: NodeJS.ProcessEnv): Promise<RunningServer> {
	await mkdir(environment.TMPDIR!, { recursive: true });
	const spawned = spawnServer(environment);
	const { child, output } = spawned;

	try {
		await waitUntil(
			() => output().includes("listening on http://"),
			START_TIMEOUT_MS,
			() => `server did not start\n${output()}`,
			child,
		);
	} catch (error) {
		signalProcessTree(child, "SIGKILL");
		await waitForExit(child, 1_000, output).catch(() => undefined);
		throw error;
	}

	let stopped = false;
	return {
		child,
		output,
		stop: async () => {
			if (stopped) return;
			stopped = true;
			const exit = waitForExit(child, STOP_TIMEOUT_MS, output);
			signalProcess(child, "SIGTERM");
			const result = await exit;
			assert.equal(result.signal, null, `server was killed instead of shutting down\n${output()}`);
			assert.equal(result.code, 0, `server exited unsuccessfully\n${output()}`);
		},
	};
}

function spawnServer(environment: NodeJS.ProcessEnv): SpawnedServer {
	const child = spawn(process.execPath, [SERVER_ENTRY], {
		cwd: REPO_ROOT,
		detached: process.platform !== "win32",
		env: environment,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		output += chunk;
	});
	child.stderr?.on("data", (chunk: string) => {
		output += chunk;
	});
	return {
		child,
		output: () => output,
	};
}

async function startVite(home: string, apiPort: number): Promise<SpawnedServer> {
	const child = spawn(process.execPath, [VITE_ENTRY, "--host", "127.0.0.1", "--port", "5180", "--strictPort"], {
		cwd: WEB_ROOT,
		detached: process.platform !== "win32",
		env: {
			HOME: home,
			LANG: "C.UTF-8",
			LLM_WIKI_AGENT_API_ORIGIN: `http://127.0.0.1:${apiPort}`,
			LLM_WIKI_AGENT_DISABLE_HMR: "1",
			PATH: process.env.PATH ?? "/usr/bin:/bin",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let captured = "";
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		captured += chunk;
	});
	child.stderr?.on("data", (chunk: string) => {
		captured += chunk;
	});
	const spawned = { child, output: () => captured };
	await waitUntil(
		() => captured.includes("Local:"),
		START_TIMEOUT_MS,
		() => `Vite did not start\n${captured}`,
		child,
	);
	return spawned;
}

async function stopSpawnedProcess(spawned: SpawnedServer): Promise<void> {
	const exit = waitForExit(spawned.child, STOP_TIMEOUT_MS, spawned.output);
	signalProcessTree(spawned.child, "SIGTERM");
	await exit;
}

async function expectFailedStart(
	environment: NodeJS.ProcessEnv,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }> {
	const { child, output } = spawnServer(environment);
	const result = await waitForExit(child, START_TIMEOUT_MS, output);
	return { ...result, output: output() };
}

async function apiRequest(port: number, token: string, origin: string): Promise<Response> {
	return fetch(`http://127.0.0.1:${port}/api/knowledge-base`, {
		headers: {
			[TOKEN_HEADER]: token,
			origin,
			"sec-fetch-site": origin === TRUSTED_ORIGIN ? "same-origin" : "cross-site",
		},
		signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
	});
}

async function eventStreamRequest(
	port: number,
	token: string,
	kbPath: string,
	signal: AbortSignal,
): Promise<Response> {
	return fetch(`http://127.0.0.1:${port}/api/events?kb=${encodeURIComponent(kbPath)}`, {
		headers: {
			[TOKEN_HEADER]: token,
			origin: TRUSTED_ORIGIN,
			"sec-fetch-site": "same-origin",
		},
		signal,
	});
}

async function frontendApiRequest(): Promise<Response> {
	return fetch("http://127.0.0.1:5180/api/knowledge-base", {
		headers: {
			origin: TRUSTED_ORIGIN,
			"sec-fetch-site": "same-origin",
		},
		signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
	});
}

async function graphRebuildRequest(port: number, token: string, kbPath: string): Promise<Response> {
	return fetch(`http://127.0.0.1:${port}/api/graph/rebuild?kb=${encodeURIComponent(kbPath)}`, {
		method: "POST",
		headers: {
			[TOKEN_HEADER]: token,
			origin: TRUSTED_ORIGIN,
			"sec-fetch-site": "same-origin",
		},
		signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
	});
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		try {
			await stat(path);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		if (Date.now() >= deadline) throw new Error(`file did not appear: ${path}`);
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
	}
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function macOsChildSandboxProfile(home: string, deniedReads: string[]): string {
	const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
	return [
		"(version 1)",
		"(deny default)",
		"(allow process*)",
		"(allow sysctl-read)",
		"(allow mach-lookup)",
		"(allow file-read*)",
		...deniedReads.map((path) => `(deny file-read* (literal ${quote(path)}))`),
		`(allow file-write* (subpath ${quote(home)}))`,
		"",
	].join("\n");
}

async function availablePort(): Promise<number> {
	const server = createServer();
	await listen(server, 0);
	const address = server.address();
	assert(address && typeof address === "object");
	const port = address.port;
	await closeServer(server);
	return port;
}

async function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
	return listenOnHost(server, port, "127.0.0.1");
}

async function listenOnHost(
	server: ReturnType<typeof createServer>,
	port: number,
	host: string,
): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		server.once("error", reject);
		server.listen(port, host, resolvePromise);
	});
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		server.close((error) => (error ? reject(error) : resolvePromise()));
	});
}

async function assertPortReleased(port: number): Promise<void> {
	await assert.rejects(
		fetch(`http://127.0.0.1:${port}/api/health`, {
			signal: AbortSignal.timeout(500),
		}),
	);
}

async function waitUntil(
	predicate: () => boolean,
	timeoutMs: number,
	errorMessage: () => string,
	child: ChildProcess,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(`server exited before readiness\n${errorMessage()}`);
		}
		if (Date.now() >= deadline) throw new Error(errorMessage());
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
	}
}

async function waitForExit(
	child: ChildProcess,
	timeoutMs: number,
	output: () => string,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return { code: child.exitCode, signal: child.signalCode };
	}
	return new Promise((resolvePromise, reject) => {
		const timer = setTimeout(() => {
			signalProcessTree(child, "SIGKILL");
			reject(new Error(`server did not stop within ${timeoutMs}ms\n${output()}`));
		}, timeoutMs);
		child.once("exit", (code, signal) => {
			clearTimeout(timer);
			resolvePromise({ code, signal });
		});
	});
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	try {
		if (process.platform === "win32") child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals): void {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	try {
		child.kill(signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

function nonLoopbackIpv4(): string {
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === "IPv4" && !address.internal) return address.address;
		}
	}
	throw new Error("startup isolation check requires a non-loopback IPv4 interface");
}

async function existingSensitivePathOrSentinel(
	candidate: string,
	sentinel: string,
): Promise<string> {
	try {
		const info = await stat(candidate);
		if (info.isFile()) return candidate;
	} catch {
		// A missing or unreadable real file still needs an existing denied-read target.
	}
	await writeFile(sentinel, "test-only-sensitive-placeholder");
	return sentinel;
}

async function snapshotTree(root: string): Promise<Record<string, string>> {
	const snapshot: Record<string, string> = {};
	async function visit(current: string): Promise<void> {
		const entries = await readdir(current, { withFileTypes: true });
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const absolutePath = join(current, entry.name);
			const relativePath = absolutePath.slice(root.length + 1);
			if (entry.isDirectory()) {
				snapshot[`${relativePath}/`] = "directory";
				await visit(absolutePath);
			} else if (entry.isFile()) {
				const content = await readFile(absolutePath);
				const mode = (await stat(absolutePath)).mode & 0o777;
				snapshot[relativePath] = `${mode.toString(8)}:${createHash("sha256").update(content).digest("hex")}`;
			}
		}
	}
	await visit(root);
	return snapshot;
}
