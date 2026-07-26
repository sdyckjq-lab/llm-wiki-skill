import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	BROWSER_CI_STAGES,
	createPlaywrightCacheIdentity,
	runBrowserCiStage,
} from "./run-browser-main-flows-ci.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BROWSER_CI_RUNNER = path.join(REPO_ROOT, "workbench/scripts/run-browser-main-flows-ci.mjs");
const BROWSER_CI_EVIDENCE_DIR = path.join(REPO_ROOT, ".tmp/browser-main-flows-ci");
const BROWSER_RUNNER = path.join(REPO_ROOT, "workbench/web/test/browser/run-browser-main-flows.mjs");
const BROWSER_FAILURE_DIR = path.join(REPO_ROOT, ".tmp/browser-main-flows");

test("Playwright cache identity follows the locked version and installed Chromium content", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-cache-identity-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const lockPath = path.join(directory, "package-lock.json");
	const packagePath = path.join(directory, "playwright-package.json");
	const browsersPath = path.join(directory, "browsers.json");
	await writeFile(lockPath, JSON.stringify({
		packages: { "node_modules/playwright": { version: "1.61.0" } },
	}));
	await writeFile(packagePath, JSON.stringify({ version: "1.61.0" }));
	await writeFile(browsersPath, JSON.stringify({ browsers: [
		{ name: "chromium", revision: "1228", browserVersion: "149.0.7827.55" },
		{ name: "chromium-headless-shell", revision: "1228", browserVersion: "149.0.7827.55" },
		{ name: "ffmpeg", revision: "1011" },
		{ name: "firefox", revision: "9999" },
	] }));

	const initial = await createPlaywrightCacheIdentity({ lockPath, packagePath, browsersPath });
	const repeated = await createPlaywrightCacheIdentity({ lockPath, packagePath, browsersPath });
	assert.equal(initial.key, repeated.key);
	assert.match(initial.key, /^playwright-1\.61\.0-chromium-[a-f0-9]{16}$/);
	assert.deepEqual(initial.browserRevisions, {
		chromium: "1228",
		"chromium-headless-shell": "1228",
		ffmpeg: "1011",
	});

	await writeFile(browsersPath, JSON.stringify({ browsers: [
		{ name: "chromium", revision: "1229", browserVersion: "149.0.7827.56" },
		{ name: "chromium-headless-shell", revision: "1229", browserVersion: "149.0.7827.56" },
		{ name: "ffmpeg", revision: "1011" },
	] }));
	const changed = await createPlaywrightCacheIdentity({ lockPath, packagePath, browsersPath });
	assert.notEqual(changed.key, initial.key);

	await writeFile(packagePath, JSON.stringify({ version: "1.62.0" }));
	await assert.rejects(
		createPlaywrightCacheIdentity({ lockPath, packagePath, browsersPath }),
		/does not match package-lock/,
	);
});

test("cache-key publishes the generated identity for the workflow cache step", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-cache-output-"));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true });
		await rm(BROWSER_CI_EVIDENCE_DIR, { recursive: true, force: true });
	});
	const githubOutput = path.join(directory, "github-output");
	const child = spawn(process.execPath, [BROWSER_CI_RUNNER, "cache-key"], {
		cwd: REPO_ROOT,
		env: { ...minimalEnvironment(directory), GITHUB_OUTPUT: githubOutput },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const result = await waitForChildExit(child);
	assert.equal(result.code, 0);
	const identity = JSON.parse(
		await readFile(path.join(BROWSER_CI_EVIDENCE_DIR, "playwright-cache-identity.json"), "utf8"),
	);
	assert.equal(await readFile(githubOutput, "utf8"), `key=${identity.key}\n`);
});

for (const stageId of ["system-dependencies", "browser-install"]) {
	test(`${stageId} records success and explicit command failure`, async (t) => {
		const directory = await mkdtemp(path.join(tmpdir(), `browser-ci-${stageId}-`));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const environment = minimalEnvironment(directory);
		const success = await runBrowserCiStage(stageId, {
			evidenceDir: directory,
			environment,
			invocation: nodeInvocation("process.stdout.write('prepared\\n')"),
			timeoutMs: 1_000,
		});
		assert.equal(success.status, "passed");
		assert.equal(success.exitCode, 0);
		assert.equal(success.timedOut, false);

		const failure = await runBrowserCiStage(stageId, {
			evidenceDir: directory,
			environment,
			invocation: nodeInvocation("process.stderr.write('install failed\\n'); process.exit(17)"),
			timeoutMs: 1_000,
		});
		assert.equal(failure.status, "failed");
		assert.equal(failure.exitCode, 17);
		assert.equal(failure.timedOut, false);
		const saved = JSON.parse(await readFile(path.join(directory, `${stageId}.json`), "utf8"));
		assert.equal(saved.status, "failed");
		assert.equal(saved.exitCode, 17);
		assert.ok(saved.durationMs >= 0);
	});
}

test("a recognized stage command failure makes the CI runner exit nonzero", { skip: process.platform === "win32" }, async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-stage-failure-"));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true });
		await rm(BROWSER_CI_EVIDENCE_DIR, { recursive: true, force: true });
	});
	const { bin, pidFile } = await createFakeNpm(directory, { hang: false });
	const child = spawn(process.execPath, [BROWSER_CI_RUNNER, "npm-dependencies"], {
		cwd: REPO_ROOT,
		env: {
			...minimalEnvironment(directory),
			PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	const result = await waitForChildExit(child);
	assert.equal(result.code, 1);
	const record = JSON.parse(
		await readFile(path.join(BROWSER_CI_EVIDENCE_DIR, "npm-dependencies.json"), "utf8"),
	);
	assert.equal(record.status, "failed");
	assert.equal(record.exitCode, 17);
	const output = await readFile(path.join(BROWSER_CI_EVIDENCE_DIR, "npm-dependencies.log"), "utf8");
	assert.doesNotMatch(output, new RegExp(escapeRegExp(directory)));
	assert.doesNotMatch(output, /sk-abcdefghijklmnop/);
	assert.match(output, /<home>|<redacted-token>/);
	await assertProcessStops(Number(await readFile(pidFile, "utf8")));
});

test("the CI runner preserves SIGTERM after cleaning the active stage", { skip: process.platform === "win32" }, async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-stage-sigterm-"));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true });
		await rm(BROWSER_CI_EVIDENCE_DIR, { recursive: true, force: true });
	});
	const { bin, pidFile } = await createFakeNpm(directory, { hang: true });
	const child = spawn(process.execPath, [BROWSER_CI_RUNNER, "npm-dependencies"], {
		cwd: REPO_ROOT,
		env: {
			...minimalEnvironment(directory),
			PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	await waitForFile(pidFile);
	const exit = waitForChildExit(child);
	child.kill("SIGTERM");
	const result = await exit;
	assert.equal(result.code, 143);
	await assertProcessStops(Number(await readFile(pidFile, "utf8")));
	const record = JSON.parse(
		await readFile(path.join(BROWSER_CI_EVIDENCE_DIR, "npm-dependencies.json"), "utf8"),
	);
	assert.equal(record.status, "interrupted");
	assert.equal(record.aborted, true);
});

test("a hanging browser installation stops at its boundary and cleans descendants", { skip: process.platform === "win32" }, async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-install-hang-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const script = [
		'import { spawn } from "node:child_process";',
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });",
		"console.log(child.pid);",
		"setInterval(() => {}, 1000);",
	].join("\n");
	const startedAt = Date.now();
	const result = await runBrowserCiStage("browser-install", {
		evidenceDir: directory,
		environment: minimalEnvironment(directory),
		invocation: nodeInvocation(script),
		timeoutMs: 100,
	});
	assert.equal(result.status, "timed-out");
	assert.equal(result.timedOut, true);
	assert.ok(Date.now() - startedAt < 5_000, "controlled timeout exceeded its cleanup boundary");
	const output = await readFile(path.join(directory, "browser-install.log"), "utf8");
	const descendantPid = Number(output.match(/^\d+$/m)?.[0]);
	assert.ok(Number.isInteger(descendantPid));
	await assertProcessStops(descendantPid);
});

test("browser installation records download and installed-content milestones", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-install-milestones-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const result = await runBrowserCiStage("browser-install", {
		evidenceDir: directory,
		environment: minimalEnvironment(directory),
		invocation: nodeInvocation([
			'console.log("Downloading Chrome for Testing 149 (playwright chromium v1228)");',
			'console.log("Chrome for Testing 149 (playwright chromium v1228) downloaded to /tmp/chromium-1228");',
			'console.log("Downloading FFmpeg (playwright ffmpeg v1011)");',
			'console.log("FFmpeg (playwright ffmpeg v1011) downloaded to /tmp/ffmpeg-1011");',
		].join("\n")),
		timeoutMs: 1_000,
	});
	assert.deepEqual(result.milestones.map(({ event, component }) => ({ event, component })), [
		{ event: "download-started", component: "Chrome for Testing" },
		{ event: "content-installed", component: "Chrome for Testing" },
		{ event: "download-started", component: "FFmpeg" },
		{ event: "content-installed", component: "FFmpeg" },
	]);
	assert.ok(result.milestones.every(({ elapsedMs }) => elapsedMs >= 0));
});

test("browser CI stages have separate commands and measured failure boundaries", () => {
	assert.deepEqual(
		Object.fromEntries(Object.entries(BROWSER_CI_STAGES).map(([id, stage]) => [id, stage.timeoutMs])),
		{
			"npm-dependencies": 90_000,
			"system-dependencies": 8 * 60_000,
			"browser-install": 3 * 60_000,
			"browser-verify": 45_000,
			"browser-tests": 270_000,
		},
	);
	assert.deepEqual(BROWSER_CI_STAGES["npm-dependencies"].invocation.args, ["ci"]);
	assert.deepEqual(BROWSER_CI_STAGES["system-dependencies"].invocation.args.slice(-2), ["install-deps", "chromium"]);
	assert.deepEqual(BROWSER_CI_STAGES["browser-install"].invocation.args.slice(-2), ["install", "chromium"]);
	assert.match(BROWSER_CI_STAGES["browser-verify"].invocation.args.at(-1), /chromium\.launch/);
	assert.deepEqual(BROWSER_CI_STAGES["browser-tests"].invocations.map((item) => item.args), [
		["run", "test:browser:main-flows", "-w", "@llm-wiki-agent/web"],
		["tests/graph-offline-warnings.regression-1.sh"],
	]);
	assert.equal(
		Object.values(BROWSER_CI_STAGES).flatMap((stage) => stage.invocations ?? [stage.invocation])
			.some((invocation) => path.basename(invocation.command) === "npx"),
		false,
	);
});

test("either browser test command failure fails the browser-tests stage", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-multi-command-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const marker = path.join(directory, "second-ran");
	const firstFailure = await runBrowserCiStage("browser-tests", {
		evidenceDir: directory,
		environment: minimalEnvironment(directory),
		invocations: [
			nodeInvocation("process.exit(17)"),
			nodeInvocation(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`),
		],
		timeoutMs: 1_000,
	});
	assert.equal(firstFailure.status, "failed");
	assert.equal(firstFailure.exitCode, 17);
	await assert.rejects(readFile(marker), /ENOENT/);

	const secondFailure = await runBrowserCiStage("browser-tests", {
		evidenceDir: directory,
		environment: minimalEnvironment(directory),
		invocations: [nodeInvocation("process.exit(0)"), nodeInvocation("process.exit(23)")],
		timeoutMs: 1_000,
	});
	assert.equal(secondFailure.status, "failed");
	assert.equal(secondFailure.exitCode, 23);
});

test("GitHub browser workflow reserves formal tests and diagnostic upload after bounded preparation", async () => {
	const workflow = await readFile(new URL("../../.github/workflows/browser-main-flows.yml", import.meta.url), "utf8");
	const jobTimeout = Number(workflow.match(/^    timeout-minutes: (\d+)$/m)?.[1]);
	const stepTimeouts = [...workflow.matchAll(/^        timeout-minutes: (\d+)$/gm)]
		.map((match) => Number(match[1]));
	assert.equal(jobTimeout, 32);
	assert.deepEqual(stepTimeouts, [1, 1, 2, 1, 2, 9, 4, 1, 5, 2]);
	assert.equal(jobTimeout - stepTimeouts.reduce((sum, value) => sum + value, 0), 4);
	for (const name of [
		"Install npm dependencies",
		"Resolve Playwright cache identity",
		"Restore Playwright browser cache",
		"Install Playwright system dependencies",
		"Download and install Playwright Chromium",
		"Verify Playwright Chromium installation",
		"Run browser main flows",
		"Upload browser diagnostics",
	]) {
		assert.match(workflow, new RegExp(`name: ${name}`));
	}
	assert.match(workflow, /uses: actions\/cache@v4/);
	assert.match(workflow, /key: \$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.playwright-cache-key\.outputs\.key \}\}/);
	assert.doesNotMatch(workflow, /restore-keys:/);
	assert.match(
		workflowStep(workflow, "Download and install Playwright Chromium"),
		/steps\.playwright-browser-cache\.outputs\.cache-hit != 'true'/,
	);
	assert.doesNotMatch(workflowStep(workflow, "Install Playwright system dependencies"), /^\s*if:/m);
	assert.doesNotMatch(workflowStep(workflow, "Verify Playwright Chromium installation"), /^\s*if:/m);
	assert.match(workflow, /run: node workbench\/scripts\/run-browser-main-flows-ci\.mjs browser-tests/);
	assert.match(workflow, /if: always\(\) && !cancelled\(\)/);
	assert.match(workflow, /\.tmp\/browser-main-flows-ci\//);
	assert.match(workflow, /\.tmp\/browser-main-flows\//);
	assert.ok(workflow.indexOf("name: Upload browser diagnostics") > workflow.indexOf("name: Run browser main flows"));
	assert.doesNotMatch(workflow, /playwright install --with-deps/);
	assert.doesNotMatch(workflow, /continue-on-error|retry|sleep/);
});

test("browser runner writes sanitized failure evidence only after descendant cleanup", { skip: process.platform === "win32" }, async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-runner-failure-"));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true });
		await rm(BROWSER_FAILURE_DIR, { recursive: true, force: true });
	});
	await rm(BROWSER_FAILURE_DIR, { recursive: true, force: true });
	const { bin, pidFile } = await createFakeNpm(directory, { hang: false });
	const runner = spawnBrowserRunner(directory, bin);
	const result = await waitForChildExit(runner);
	assert.equal(result.code, 1);
	const descendantPid = Number(await readFile(pidFile, "utf8"));
	const evidence = await readFile(path.join(BROWSER_FAILURE_DIR, "runner.log"), "utf8");
	await assertProcessStops(descendantPid);
	assert.doesNotMatch(evidence, new RegExp(escapeRegExp(directory)));
	assert.doesNotMatch(evidence, /sk-abcdefghijklmnop/);
	assert.match(evidence, /<home>|<redacted-token>/);
});

test("browser runner preserves SIGTERM exit status after cleanup and evidence", { skip: process.platform === "win32" }, async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-runner-sigterm-"));
	t.after(async () => {
		await rm(directory, { recursive: true, force: true });
		await rm(BROWSER_FAILURE_DIR, { recursive: true, force: true });
	});
	await rm(BROWSER_FAILURE_DIR, { recursive: true, force: true });
	const { bin, pidFile } = await createFakeNpm(directory, { hang: true });
	const runner = spawnBrowserRunner(directory, bin);
	await waitForFile(pidFile);
	const exit = waitForChildExit(runner);
	runner.kill("SIGTERM");
	const result = await exit;
	assert.equal(result.code, 143);
	const descendantPid = Number(await readFile(pidFile, "utf8"));
	await assertProcessStops(descendantPid);
	const evidence = await readFile(path.join(BROWSER_FAILURE_DIR, "runner.log"), "utf8");
	assert.match(evidence, /interrupted by SIGTERM/);
});

test("browser CI command failures do not print repository or home paths", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "browser-ci-command-error-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const child = spawn(process.execPath, [BROWSER_CI_RUNNER, "missing-stage"], {
		cwd: REPO_ROOT,
		env: minimalEnvironment(directory),
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => { output += chunk; });
	child.stderr.on("data", (chunk) => { output += chunk; });
	const result = await waitForChildExit(child);
	assert.equal(result.code, 1);
	assert.doesNotMatch(output, new RegExp(escapeRegExp(REPO_ROOT)));
	assert.doesNotMatch(output, new RegExp(escapeRegExp(directory)));
	assert.match(output, /unknown browser CI stage/);
});

function nodeInvocation(script) {
	return {
		command: process.execPath,
		args: ["--input-type=module", "-e", script],
		cwd: process.cwd(),
	};
}

function minimalEnvironment(home) {
	return {
		HOME: home,
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		TMPDIR: tmpdir(),
		LANG: "C.UTF-8",
	};
}

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
	try {
		process.kill(pid, "SIGKILL");
	} catch (error) {
		if (error?.code !== "ESRCH") throw error;
	}
	assert.fail(`process ${pid} survived the browser preparation timeout`);
}

async function createFakeNpm(directory, { hang }) {
	const bin = path.join(directory, "bin");
	const pidFile = path.join(directory, "descendant.pid");
	await mkdir(bin, { recursive: true });
	const source = [
		"#!/usr/bin/env node",
		'const { spawn } = require("node:child_process");',
		'const { writeFileSync } = require("node:fs");',
		"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });",
		`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
		`console.error(${JSON.stringify(path.join(directory, "private.txt"))});`,
		'console.error("sk-abcdefghijklmnop");',
		hang ? "setInterval(() => {}, 1000);" : "setImmediate(() => process.exit(17));",
	].join("\n");
	const command = path.join(bin, "npm");
	await writeFile(command, `${source}\n`, "utf8");
	await chmod(command, 0o755);
	return { bin, pidFile };
}

function spawnBrowserRunner(home, bin) {
	return spawn(process.execPath, [BROWSER_RUNNER], {
		cwd: REPO_ROOT,
		env: {
			HOME: home,
			PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
			TMPDIR: tmpdir(),
			LANG: "C.UTF-8",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function waitForChildExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

async function waitForFile(file) {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		try {
			await readFile(file);
			return;
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail(`file did not appear: ${path.basename(file)}`);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function workflowStep(workflow, name) {
	const start = workflow.indexOf(`      - name: ${name}`);
	assert.notEqual(start, -1, `missing workflow step ${name}`);
	const next = workflow.indexOf("\n      - name:", start + 1);
	return workflow.slice(start, next === -1 ? undefined : next);
}
