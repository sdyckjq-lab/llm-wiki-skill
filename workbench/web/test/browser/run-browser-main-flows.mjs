import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	interruptedExitCode,
	runInvocation,
	sanitizeOutput,
} from "../../../scripts/run-quality-and-tests.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FAILURE_DIR = path.join(REPO_ROOT, ".tmp/browser-main-flows");
const BROWSER_SANDBOX_PATH = /(?:[A-Za-z]:)?[\\/][^\s\"'()]*llm-wiki-browser-main-flows-[A-Za-z0-9_-]+/g;
const TOTAL_TIMEOUT_MS = 4 * 60_000;
const COMMAND_TIMEOUT_MS = 220_000;
const environment = {
	HOME: process.env.HOME ?? tmpdir(),
	PATH: process.env.PATH ?? "/usr/bin:/bin",
	TMPDIR: process.env.TMPDIR ?? tmpdir(),
	LANG: "C.UTF-8",
	...(process.env.CI ? { CI: process.env.CI } : {}),
	...(process.env.PLAYWRIGHT_BROWSERS_PATH
		? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
		: {}),
};

const commands = [
	{
		command: npmCommand(),
		args: ["run", "build", "-w", "@llm-wiki-agent/server"],
		cwd: REPO_ROOT,
	},
	{
		command: process.execPath,
		args: ["--import", "tsx", "--test", "workbench/web/test/browser/browser-main-flows.test.ts"],
		cwd: REPO_ROOT,
	},
];

await rm(FAILURE_DIR, { recursive: true, force: true });
const deadline = Date.now() + TOTAL_TIMEOUT_MS;
let activeController;
let interrupted;
let output = "";
const stopForSignal = (signal) => {
	interrupted = signal;
	activeController?.abort();
};
const interruptHandler = () => stopForSignal("SIGINT");
const terminateHandler = () => stopForSignal("SIGTERM");
process.once("SIGINT", interruptHandler);
process.once("SIGTERM", terminateHandler);

try {
	for (const invocation of commands) {
		if (interrupted) throw new Error(`browser-main-flows interrupted by ${interrupted}`);
		const remainingMs = Math.min(COMMAND_TIMEOUT_MS, deadline - Date.now());
		if (remainingMs <= 0) throw new Error("browser-main-flows exceeded 4 minutes");
		activeController = new AbortController();
		const result = await runInvocation(invocation, environment, remainingMs, undefined, {
			signal: activeController.signal,
		});
		activeController = undefined;
		output = sanitizeOutput(result.output, { repoRoot: REPO_ROOT, sandbox: BROWSER_SANDBOX_PATH });
		if (output) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
		if (interrupted) throw new Error(`browser-main-flows interrupted by ${interrupted}`);
		if (result.timedOut) throw new Error("browser-main-flows command exceeded its time limit");
		if (result.code !== 0) throw new Error(`browser-main-flows command failed with ${result.code ?? result.signal}`);
	}
	await rm(FAILURE_DIR, { recursive: true, force: true });
	process.stdout.write("\n[browser-main-flows] all journeys passed\n");
} catch (error) {
	await mkdir(FAILURE_DIR, { recursive: true });
	const message = sanitizeOutput(error instanceof Error ? error.stack ?? error.message : String(error), {
		repoRoot: REPO_ROOT,
		sandbox: BROWSER_SANDBOX_PATH,
	});
	await writeFile(path.join(FAILURE_DIR, "runner.log"), `${output}\n${message}\n`, "utf8");
	console.error(message);
	process.exitCode = interruptedExitCode(interrupted);
} finally {
	process.off("SIGINT", interruptHandler);
	process.off("SIGTERM", terminateHandler);
}

function npmCommand() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}
