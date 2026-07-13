import { spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NODE = process.execPath;
const TSC = path.join(REPO_ROOT, "node_modules/typescript/bin/tsc");
const VITE = path.join(REPO_ROOT, "node_modules/vite/bin/vite.js");
const ESLINT = path.join(REPO_ROOT, "node_modules/eslint/bin/eslint.js");
const FAILURE_DIR = path.join(REPO_ROOT, ".tmp/quality-and-tests");
const PROCESS_REGISTRY_HOOK = path.join(REPO_ROOT, "workbench/scripts/register-quality-child.cjs");
const COMMAND_TIMEOUT_MS = 120_000;
const SLOW_TEST_TIMEOUT_MS = 240_000;
const STOP_GRACE_MS = 250;
const STOP_TIMEOUT_MS = 2_000;
const PROCESS_SCAN_INTERVAL_MS = 100;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

export const TOTAL_TIMEOUT_MS = 15 * 60_000;

export function interruptedExitCode(signal) {
	return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}

const command = (args, cwd = REPO_ROOT) => ({ command: NODE, args, cwd });
const nodeTest = (...files) => command(["--import", "tsx", "--test", ...files]);

export const QUALITY_STEPS = [
	{
		id: "build-contracts",
		producesSharedArtifacts: true,
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([TSC, "-p", "packages/workbench-contracts/tsconfig.json"])],
	},
	{
		id: "build-graph",
		producesSharedArtifacts: true,
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [
			command([VITE, "build"], path.join(REPO_ROOT, "packages/graph-engine")),
			command([TSC, "-p", "packages/graph-engine/tsconfig.json", "--emitDeclarationOnly"]),
		],
	},
	{
		id: "build-server",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [
			command(["-e", "require('node:fs').rmSync('workbench/server/dist',{recursive:true,force:true})"]),
			command([TSC, "-p", "workbench/server/tsconfig.build.json"]),
		],
	},
	{
		id: "build-web",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [
			command([TSC, "-b", "workbench/web/tsconfig.json", "--force"]),
			command([VITE, "build"], path.join(REPO_ROOT, "workbench/web")),
		],
	},
	{
		id: "boundary-negative-controls",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [
			nodeTest("workbench/scripts/check-workbench-boundaries.test.mjs"),
			command(["--test", "workbench/scripts/run-quality-and-tests.test.mjs"]),
		],
	},
	{
		id: "boundaries",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command(["--import", "tsx", "workbench/scripts/check-workbench-boundaries.mjs"])],
	},
	{
		id: "contracts",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [nodeTest("packages/workbench-contracts/test/*.test.ts")],
	},
	{
		id: "startup-isolation",
		timeoutMs: SLOW_TEST_TIMEOUT_MS,
		commands: [nodeTest(
			"workbench/server/test/startup-isolation.test.ts",
			"workbench/server/test/linux-child-isolation.test.mjs",
		)],
	},
	{
		id: "route-registry-negative-controls",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [nodeTest("workbench/server/test/route-registry-parity.test.ts")],
	},
	{
		id: "server",
		timeoutMs: SLOW_TEST_TIMEOUT_MS,
		commands: [nodeTest(
			"workbench/server/src/**/*.test.ts",
			"workbench/server/test/runtime-app.test.ts",
		)],
	},
	{
		id: "web-unit",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [nodeTest("workbench/web/test/*.test.ts")],
	},
	{
		id: "web-dom",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([
			"--test-concurrency=1",
			"--import",
			"tsx",
			"--import",
			"./workbench/web/test/setup-dom.ts",
			"--test",
			"workbench/web/test/*.test.tsx",
		])],
	},
	{
		id: "graph",
		timeoutMs: SLOW_TEST_TIMEOUT_MS,
		commands: [nodeTest("packages/graph-engine/test/*.test.ts")],
	},
	{
		id: "types-contracts",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([TSC, "-p", "packages/workbench-contracts/tsconfig.json", "--noEmit"])],
	},
	{
		id: "types-graph",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([TSC, "-p", "packages/graph-engine/tsconfig.json", "--noEmit"])],
	},
	{
		id: "types-server",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([TSC, "-p", "workbench/server/tsconfig.test.json", "--noEmit"])],
	},
	{
		id: "types-web",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [
			command([TSC, "-b", "workbench/web/tsconfig.json", "--noEmit", "--force"]),
			command([TSC, "-p", "workbench/web/tsconfig.browser.json", "--noEmit"]),
		],
	},
	{
		id: "web-lint",
		timeoutMs: COMMAND_TIMEOUT_MS,
		commands: [command([ESLINT, "."], path.join(REPO_ROOT, "workbench/web"))],
	},
];

export function createMinimalEnvironment(source, sandboxHome) {
	const environment = {
		HOME: sandboxHome,
		XDG_CONFIG_HOME: path.join(sandboxHome, ".config"),
		PATH: source.PATH ?? "/usr/bin:/bin",
		TMPDIR: source.TMPDIR ?? tmpdir(),
		LANG: "C.UTF-8",
	};
	if (source.CI) environment.CI = source.CI;
	if (process.platform === "win32") {
		for (const name of ["SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
			if (source[name]) environment[name] = source[name];
		}
	}
	return environment;
}

export async function runInvocation(
	invocation,
	environment,
	timeoutMs,
	onSpawn = () => undefined,
	{ signal, readProcesses = readProcessTable } = {},
) {
	const processRegistry = path.join(tmpdir(), `llm-wiki-quality-processes-${process.pid}-${randomUUID()}.jsonl`);
	const child = spawn(invocation.command, invocation.args, {
		cwd: invocation.cwd,
		detached: process.platform !== "win32",
		env: {
			...environment,
			LLM_WIKI_QUALITY_PROCESS_REGISTRY: processRegistry,
			NODE_OPTIONS: `--require=${PROCESS_REGISTRY_HOOK}`,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	onSpawn(child);
	let processTree;
	try {
		processTree = trackProcessTree(child.pid, processRegistry, readProcesses);
	} catch (error) {
		await stopUntrackedChild(child, processRegistry);
		rmSync(processRegistry, { force: true });
		throw error;
	}
	let output = "";
	const append = (chunk) => {
		output = `${output}${chunk}`.slice(-MAX_CAPTURE_BYTES);
	};
	child.stdout?.on("data", append);
	child.stderr?.on("data", append);
	let timedOut = false;
	let aborted = signal?.aborted ?? false;
	let termination;
	const stopForAbort = () => {
		aborted = true;
		termination ??= terminateProcessTree(child, processTree);
	};
	signal?.addEventListener("abort", stopForAbort, { once: true });
	if (aborted) stopForAbort();
	const timer = setTimeout(() => {
		timedOut = true;
		termination ??= terminateProcessTree(child, processTree);
	}, timeoutMs);
	let result;
	try {
		result = await waitForExit(child);
	} catch (error) {
		await terminateProcessTree(child, processTree);
		throw error;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", stopForAbort);
	}
	if (timedOut || aborted) await termination;
	else if (result.code !== 0) await terminateProcessTree(child, processTree);
	else await stopRemainingDescendants(child, processTree);
	return { ...result, timedOut, aborted, output };
}

export function sanitizeOutput(value, { repoRoot = REPO_ROOT, sandbox, home = homedir() }) {
	const sandboxCleaned = sandbox instanceof RegExp
		? value.replace(sandbox, "<sandbox>")
		: sandbox
			? value.replaceAll(sandbox, "<sandbox>")
			: value;
	return sandboxCleaned
		.replaceAll(repoRoot, "<repo>")
		.replaceAll(home, "<home>")
		.replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_\-]{12,}\b/g, "<redacted-token>");
}

export async function main({ qualitySteps = QUALITY_STEPS, failureDir = FAILURE_DIR } = {}) {
	await rm(failureDir, { recursive: true, force: true });
	const sandbox = await mkdtemp(path.join(tmpdir(), "llm-wiki-quality-"));
	const sandboxHome = path.join(sandbox, "home");
	await mkdir(path.join(sandboxHome, ".config"), { recursive: true });
	const environment = createMinimalEnvironment(process.env, sandboxHome);
	const deadline = Date.now() + TOTAL_TIMEOUT_MS;
	const completed = [];
	let failureOutput = "";
	let activeController;
	let interrupted;
	const stopForSignal = (signal) => {
		interrupted = signal;
		activeController?.abort();
	};
	const interruptHandler = () => stopForSignal("SIGINT");
	const terminateHandler = () => stopForSignal("SIGTERM");
	process.once("SIGINT", interruptHandler);
	process.once("SIGTERM", terminateHandler);

	try {
		for (const step of qualitySteps) {
			const stepDeadline = Math.min(deadline, Date.now() + step.timeoutMs);
			process.stdout.write(`\n[quality-and-tests] ${step.id}\n`);
			for (const invocation of step.commands) {
				if (interrupted) throw new Error(`quality-and-tests interrupted by ${interrupted}`);
				const remainingMs = stepDeadline - Date.now();
				if (remainingMs <= 0) throw new Error(`${step.id} exceeded its time limit`);
				activeController = new AbortController();
				const result = await runInvocation(
					invocation,
					environment,
					remainingMs,
					undefined,
					{ signal: activeController.signal },
				);
				activeController = undefined;
				failureOutput = sanitizeOutput(result.output, { sandbox });
				if (failureOutput) process.stdout.write(failureOutput.endsWith("\n") ? failureOutput : `${failureOutput}\n`);
				if (interrupted) throw new Error(`quality-and-tests interrupted by ${interrupted}`);
				if (result.timedOut) throw new Error(`${step.id} exceeded its time limit`);
				if (result.code !== 0) throw new Error(`${step.id} failed with exit code ${result.code ?? result.signal}`);
			}
			completed.push(step.id);
			failureOutput = "";
		}
		process.stdout.write("\n[quality-and-tests] all checks passed\n");
	} catch (error) {
		const message = sanitizeOutput(error instanceof Error ? error.stack ?? error.message : String(error), { sandbox });
		await mkdir(failureDir, { recursive: true });
		await writeFile(
			path.join(failureDir, "failure.log"),
			`passed: ${completed.join(", ")}\n\n${failureOutput}\n${message}\n`,
			"utf8",
		);
		console.error(message);
		process.exitCode = interruptedExitCode(interrupted);
	} finally {
		process.off("SIGINT", interruptHandler);
		process.off("SIGTERM", terminateHandler);
		await rm(sandbox, { recursive: true, force: true });
	}
}

async function terminateProcessTree(child, processTree) {
	let cleanupError;
	try {
		processTree.refresh();
		signalTrackedProcesses(processTree, "SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS));
		processTree.refresh();
		signalTrackedProcesses(processTree, "SIGKILL");
		await waitForTrackedProcesses(processTree);
	} catch (error) {
		cleanupError = error;
		await stopUntrackedChild(child, processTree.processRegistry);
	} finally {
		processTree.stop();
	}
	if (child.exitCode === null && child.signalCode === null) await waitForExit(child);
	if (cleanupError) throw cleanupError;
}

async function stopUntrackedChild(child, processRegistry) {
	signalRegisteredProcesses(child, processRegistry, "SIGTERM");
	await new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS));
	const registeredPids = readRegisteredProcesses(processRegistry).map(({ pid }) => pid);
	signalRegisteredProcesses(child, processRegistry, "SIGKILL");
	if (child.exitCode === null && child.signalCode === null) await waitForExit(child);
	await waitForPidsToStop(registeredPids);
}

async function stopRemainingDescendants(child, processTree) {
	let descendants;
	try {
		processTree.refresh();
		descendants = processTree.livePids().filter((pid) => pid !== child.pid);
	} catch {
		return terminateProcessTree(child, processTree);
	}
	if (descendants.length > 0) return terminateProcessTree(child, processTree);
	processTree.stop();
}

function waitForExit(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
	}
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

function signalTrackedProcesses(processTree, signal) {
	try {
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/PID", String(processTree.rootPid), "/T", "/F"], { stdio: "ignore" });
		} else {
			for (const processGroup of processTree.processGroups()) signalProcess(-processGroup, signal);
			for (const pid of processTree.ungroupedPids()) signalProcess(pid, signal);
		}
	} catch (error) {
		if (error?.code !== "ESRCH") throw error;
	}
}

function signalRegisteredProcesses(child, processRegistry, signal) {
	if (process.platform === "win32") {
		for (const pid of new Set([child.pid, ...readRegisteredProcesses(processRegistry).map(({ pid }) => pid)])) {
			if (pid) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
		}
		return;
	}
	const registered = readRegisteredProcesses(processRegistry);
	const processGroups = new Set([
		child.pid,
		...registered.map(({ processGroup }) => processGroup),
	].filter((value) => Number.isInteger(value) && value > 1));
	for (const processGroup of processGroups) signalProcess(-processGroup, signal);
	for (const { pid, processGroup } of registered) {
		if ((!processGroup || !processGroups.has(processGroup)) && pid > 1) signalProcess(pid, signal);
	}
}

function signalProcess(pid, signal) {
	try {
		process.kill(pid, signal);
	} catch (error) {
		if (error?.code !== "ESRCH") throw error;
	}
}

function trackProcessTree(rootPid, processRegistry, readProcesses) {
	const trackedProcesses = new Map();
	let stopped = false;
	let monitorError;
	const scan = () => {
		if (stopped || process.platform === "win32") return;
		const processes = readProcesses();
		if (trackedProcesses.size === 0 && rootPid) {
			const root = processes.find((entry) => entry.pid === rootPid);
			if (root) trackedProcesses.set(root.pid, root);
		}
		for (const identity of readRegisteredProcesses(processRegistry)) {
			trackedProcesses.set(identity.pid, identity);
		}
		let added;
		do {
			added = false;
			for (const entry of processes) {
				if (!trackedProcesses.has(entry.pid) && trackedProcesses.has(entry.parentPid)) {
					trackedProcesses.set(entry.pid, entry);
					added = true;
				}
			}
		} while (added);
	};
	const refresh = () => {
		if (monitorError) throw monitorError;
		scan();
	};
	refresh();
	const timer = setInterval(() => {
		try {
			scan();
		} catch (error) {
			monitorError = error;
			clearInterval(timer);
		}
	}, PROCESS_SCAN_INTERVAL_MS);
	timer.unref();
	const liveProcesses = () => {
		if (monitorError) throw monitorError;
		const currentByPid = new Map(readProcesses().map((entry) => [entry.pid, entry]));
		return [...trackedProcesses.values()].filter((identity) =>
			currentByPid.get(identity.pid)?.startedAt === identity.startedAt
			&& currentByPid.get(identity.pid)?.processGroup === identity.processGroup
		);
	};
	return {
		rootPid,
		processRegistry,
		refresh,
		stop() {
			stopped = true;
			clearInterval(timer);
			rmSync(processRegistry, { force: true });
		},
		livePids: () => liveProcesses().map(({ pid }) => pid),
		processGroups: () => [...new Set(
			liveProcesses()
				.map(({ processGroup }) => processGroup)
				.filter(Boolean),
		)],
		ungroupedPids: () => liveProcesses()
			.filter(({ processGroup }) => !processGroup)
			.map(({ pid }) => pid),
	};
}

function readRegisteredProcesses(processRegistry) {
	try {
		return readFileSync(processRegistry, "utf8").trim().split("\n").flatMap((line) => {
			try {
				const identity = JSON.parse(line);
				return Number.isInteger(identity.pid) && typeof identity.startedAt === "string" ? [identity] : [];
			} catch {
				return [];
			}
		});
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
}

export function readProcessTable() {
	const result = spawnSync("ps", ["-A", "-o", "pid=,ppid=,pgid=,lstart="], {
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
	});
	if (result.status !== 0) throw new Error(`could not inspect child processes: ${result.stderr?.trim()}`);
	return result.stdout.trim().split("\n").flatMap((line) => {
		const [pidText, parentPidText, processGroupText, ...startedAtParts] = line.trim().split(/\s+/);
		const [pid, parentPid, processGroup] = [pidText, parentPidText, processGroupText].map(Number);
		return Number.isInteger(pid) && Number.isInteger(parentPid) && Number.isInteger(processGroup)
			? [{ pid, parentPid, processGroup, startedAt: startedAtParts.join(" ") }]
			: [];
	});
}

async function waitForTrackedProcesses(processTree) {
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (processTree.livePids().length === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	const survivors = processTree.livePids();
	if (survivors.length > 0) throw new Error(`could not stop ${survivors.length} quality command processes`);
}

async function waitForPidsToStop(pids) {
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const survivors = pids.filter(isPidAlive);
		if (survivors.length === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	const survivors = pids.filter(isPidAlive);
	if (survivors.length > 0) throw new Error(`could not stop ${survivors.length} registered quality processes`);
}

function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error?.code === "ESRCH") return false;
		throw error;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
