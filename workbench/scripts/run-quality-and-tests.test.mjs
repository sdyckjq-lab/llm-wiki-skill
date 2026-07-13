import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { glob, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	createMinimalEnvironment,
	interruptedExitCode,
	QUALITY_STEPS,
	readProcessTable,
	runInvocation,
	sanitizeOutput,
	TOTAL_TIMEOUT_MS,
} from "./run-quality-and-tests.mjs";

const REQUIRED_STEPS = [
	"build-contracts",
	"build-graph",
	"build-server",
	"build-web",
	"boundary-negative-controls",
	"boundaries",
	"contracts",
	"startup-isolation",
	"route-registry-negative-controls",
	"server",
	"web-unit",
	"web-dom",
	"graph",
	"types-contracts",
	"types-graph",
	"types-server",
	"types-web",
	"web-lint",
];

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("quality entrypoint covers every required check in a stable sequence", () => {
	assert.deepEqual(QUALITY_STEPS.map((step) => step.id), REQUIRED_STEPS);
	assert.ok(TOTAL_TIMEOUT_MS > 0);
	assert.ok(QUALITY_STEPS.every((step) => step.timeoutMs > 0));
	assert.deepEqual(
		QUALITY_STEPS.filter((step) => step.producesSharedArtifacts).map((step) => step.id),
		["build-contracts", "build-graph"],
	);
	assert.ok(QUALITY_STEPS.flatMap((step) => step.commands).every((item) =>
		item.command !== "npm" && item.command !== "npm.cmd"
	));
	for (const stepId of ["build-web", "types-web"]) {
		const step = QUALITY_STEPS.find((candidate) => candidate.id === stepId);
		assert.ok(step.commands.some((item) => item.args.includes("--force")));
	}
	const startup = QUALITY_STEPS.find((step) => step.id === "startup-isolation");
	assert.ok(startup.commands[0].args.includes("workbench/server/test/startup-isolation.test.ts"));
	assert.ok(startup.commands[0].args.includes("workbench/server/test/linux-child-isolation.test.mjs"));
});

test("quality entrypoint covers every backend test file exactly once", async () => {
	const expected = await collectMatches([
		"workbench/server/src/**/*.test.ts",
		"workbench/server/test/**/*.test.ts",
		"workbench/server/test/**/*.test.mjs",
	]);
	const declaredPatterns = QUALITY_STEPS.flatMap((step) => step.commands)
		.flatMap((item) => item.args)
		.filter((arg) => arg.startsWith("workbench/server/") && /\.test\.(?:ts|mjs)$/.test(arg));
	const actual = await collectMatches(declaredPatterns);

	assert.deepEqual(actual, expected);
	assert.equal(new Set(actual).size, actual.length);
});

test("quality children receive only the allowlisted environment", () => {
	const environment = createMinimalEnvironment({
		HOME: "/real/home",
		PATH: "/bin",
		TMPDIR: "/tmp",
		CI: "true",
		OPENAI_API_KEY: "secret",
		ANTHROPIC_API_KEY: "secret",
		XDG_CONFIG_HOME: "/real/config",
		NPM_TOKEN: "secret",
	}, "/tmp/quality-home");

	assert.equal(environment.HOME, "/tmp/quality-home");
	assert.equal(environment.XDG_CONFIG_HOME, "/tmp/quality-home/.config");
	assert.equal(environment.PATH, "/bin");
	assert.equal(environment.CI, "true");
	assert.equal(environment.OPENAI_API_KEY, undefined);
	assert.equal(environment.ANTHROPIC_API_KEY, undefined);
	assert.equal(environment.NPM_TOKEN, undefined);
	assert.deepEqual(Object.keys(environment).sort(), [
		"CI",
		"HOME",
		"LANG",
		"PATH",
		"TMPDIR",
		"XDG_CONFIG_HOME",
	]);
});

test("interrupt signals preserve conventional exit codes", () => {
	assert.equal(interruptedExitCode("SIGINT"), 130);
	assert.equal(interruptedExitCode("SIGTERM"), 143);
	assert.equal(interruptedExitCode(undefined), 1);
});

test("failure output removes local paths and token-shaped values", () => {
	const cleaned = sanitizeOutput(
		"/repo/private /sandbox/data /home/person sk-abcdefghijklmnop github_pat_abcdefghijklmnop",
		{ repoRoot: "/repo", sandbox: "/sandbox", home: "/home/person" },
	);
	assert.equal(cleaned, "<repo>/private <sandbox>/data <home> <redacted-token> <redacted-token>");
});

test("failure output can remove dynamically named browser sandboxes", () => {
	const cleaned = sanitizeOutput(
		"failed at /tmp/llm-wiki-browser-main-flows-Ab_C12/home/private.txt",
		{ repoRoot: "/repo", sandbox: /\/[^\s\"'()]*llm-wiki-browser-main-flows-[A-Za-z0-9_-]+/g, home: "/home/person" },
	);
	assert.equal(cleaned, "failed at <sandbox>/home/private.txt");
});

test("timed out commands terminate their process group", { skip: process.platform === "win32" }, async () => {
	const script = [
		'import { spawn } from "node:child_process";',
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
		"console.log(child.pid);",
		"setInterval(() => {}, 1000);",
	].join("\n");
	const result = await runInvocation(
		{ command: process.execPath, args: ["--input-type=module", "-e", script], cwd: process.cwd() },
		createMinimalEnvironment(process.env, path.join(tmpdir(), "quality-timeout-home")),
		3_000,
	);
	assert.equal(result.timedOut, true);
	const childPid = Number(result.output.trim());
	assert.ok(Number.isInteger(childPid));
	await assertProcessStops(childPid);
});

test("timed out commands terminate detached descendants", { skip: process.platform === "win32" }, async () => {
	const result = await runInvocation(
		detachedDescendantInvocation("setInterval(() => {}, 1000)"),
		createMinimalEnvironment(process.env, path.join(tmpdir(), "quality-detached-timeout-home")),
		3_000,
	);
	assert.equal(result.timedOut, true);
	await assertProcessStopsWithCleanup(Number(result.output.trim()));
});

test("failed commands terminate detached descendants", { skip: process.platform === "win32" }, async () => {
	const result = await runInvocation(
		detachedDescendantInvocation("setTimeout(() => process.exit(7), 600)"),
		createMinimalEnvironment(process.env, path.join(tmpdir(), "quality-detached-failure-home")),
		2_000,
	);
	assert.equal(result.code, 7);
	assert.equal(result.timedOut, false);
	await assertProcessStopsWithCleanup(Number(result.output.trim()));
});

test("failed commands do not lose descendants that detach immediately", { skip: process.platform === "win32" }, async () => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const result = await runInvocation(
			detachedDescendantInvocation("process.exit(7)"),
			createMinimalEnvironment(process.env, path.join(tmpdir(), `quality-immediate-detach-home-${attempt}`)),
			2_000,
		);
		assert.equal(result.code, 7);
		await assertProcessStopsWithCleanup(Number(result.output.trim()));
	}
});

test("aborted commands terminate detached descendants", { skip: process.platform === "win32" }, async () => {
	const controller = new AbortController();
	const result = await runInvocation(
		detachedDescendantInvocation("setInterval(() => {}, 1000)"),
		createMinimalEnvironment(process.env, path.join(tmpdir(), "quality-detached-abort-home")),
		5_000,
		(child) => child.stdout.once("data", () => setTimeout(() => controller.abort(), 100)),
		{ signal: controller.signal },
	);
	assert.equal(result.aborted, true);
	assert.equal(result.timedOut, false);
	await assertProcessStopsWithCleanup(Number(result.output.trim()));
});

test("process scan failures still clean registered detached descendants", { skip: process.platform === "win32" }, async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "quality-scan-failure-"));
	const pidFile = path.join(directory, "descendant.pid");
	const script = [
		'import { spawn } from "node:child_process";',
		'import { writeFileSync } from "node:fs";',
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });",
		`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
		"setInterval(() => {}, 1000);",
	].join("\n");
	let failScan = false;
	const controller = new AbortController();
	const invocation = runInvocation(
		{ command: process.execPath, args: ["--input-type=module", "-e", script], cwd: process.cwd() },
		createMinimalEnvironment(process.env, path.join(directory, "home")),
		5_000,
		() => undefined,
		{
			signal: controller.signal,
			readProcesses: () => {
				if (failScan) throw new Error("injected process scan failure");
				return readProcessTable();
			},
		},
	);
	const rejection = assert.rejects(invocation, /injected process scan failure/);
	await waitForFile(pidFile);
	failScan = true;
	await new Promise((resolve) => setTimeout(resolve, 150));
	controller.abort();
	await rejection;
	await assertProcessStopsWithCleanup(Number(await readFile(pidFile, "utf8")));
	await rm(directory, { recursive: true, force: true });
});

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
	test(`quality entrypoint handles ${signal} after cleanup and writes evidence`, { skip: process.platform === "win32" }, async () => {
		const failureDir = await mkdtemp(path.join(tmpdir(), `quality-${signal.toLowerCase()}-`));
		const script = [
			`import { main } from ${JSON.stringify(new URL("./run-quality-and-tests.mjs", import.meta.url).href)};`,
			'const childScript = \'const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: ["ignore", "ignore", "ignore"] }); console.log(child.pid); setInterval(() => {}, 1000);\';',
			"await main({ failureDir: process.env.FAILURE_DIR, qualitySteps: [{ id: 'signal-probe', timeoutMs: 10_000, commands: [{ command: process.execPath, args: ['-e', childScript], cwd: process.cwd() }] }] });",
		].join("\n");
		const runner = spawn(process.execPath, ["--input-type=module", "-e", script], {
			cwd: REPO_ROOT,
			env: { ...process.env, FAILURE_DIR: failureDir },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		runner.stdout.on("data", (chunk) => { output += chunk; });
		runner.stderr.on("data", (chunk) => { output += chunk; });
		await waitForOutput(() => output.includes("[quality-and-tests] signal-probe"));
		await new Promise((resolve) => setTimeout(resolve, 500));
		const exit = waitForChildExit(runner);
		runner.kill(signal);
		const result = await exit;
		assert.equal(result.code, exitCode);
		const descendantPid = Number(output.match(/^\d+$/m)?.[0]);
		await assertProcessStopsWithCleanup(descendantPid);
		const evidence = await readFile(path.join(failureDir, "failure.log"), "utf8");
		assert.match(evidence, new RegExp(`interrupted by ${signal}`));
		await rm(failureDir, { recursive: true, force: true });
	});
}

test("GitHub quality check calls the shared entrypoint with minimal permissions", async () => {
	const workflow = await readFile(new URL("../../.github/workflows/quality-and-tests.yml", import.meta.url), "utf8");
	assert.match(workflow, /pull_request:/);
	assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
	assert.doesNotMatch(workflow, /paths(?:-ignore)?:/);
	assert.match(workflow, /permissions:\s*\n\s*contents: read/);
	assert.match(workflow, /quality-and-tests:\s*\n/);
	assert.match(workflow, /timeout-minutes:/);
	assert.match(workflow, /run: npm ci/);
	assert.match(workflow, /run: npm run quality-and-tests/);
	assert.match(workflow, /if: failure\(\)/);
	assert.match(workflow, /retention-days: 7/);
});

async function assertProcessStops(pid) {
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch (error) {
			if (error?.code === "ESRCH") return;
			throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail(`process ${pid} survived quality timeout in ${path.basename(process.cwd())}`);
}

async function assertProcessStopsWithCleanup(pid) {
	assert.ok(Number.isInteger(pid) && pid > 1);
	try {
		await assertProcessStops(pid);
	} catch (assertionError) {
		try {
			process.kill(pid, "SIGKILL");
		} catch (error) {
			if (error?.code !== "ESRCH") throw error;
		}
		throw assertionError;
	}
}

async function waitForOutput(predicate) {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail("quality subprocess did not start in time");
}

async function waitForFile(file) {
	await waitForOutput(async () => {
		try {
			await readFile(file);
			return true;
		} catch (error) {
			if (error?.code === "ENOENT") return false;
			throw error;
		}
	});
}

function waitForChildExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

function detachedDescendantInvocation(exitStatement) {
	const script = [
		'import { spawn } from "node:child_process";',
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });",
		"console.log(child.pid);",
		exitStatement,
	].join("\n");
	return { command: process.execPath, args: ["--input-type=module", "-e", script], cwd: process.cwd() };
}

async function collectMatches(patterns) {
	const matches = [];
	for (const pattern of patterns) {
		for await (const file of glob(pattern, { cwd: REPO_ROOT })) matches.push(file);
	}
	return matches.sort();
}
