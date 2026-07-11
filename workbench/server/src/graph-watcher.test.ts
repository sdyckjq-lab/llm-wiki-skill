import assert from "node:assert/strict";
import test from "node:test";

import {
	graphRebuildFailureMessage,
	GraphRebuildQueue,
	KnowledgeBaseGraphWatcher,
	shouldIgnoreGraphWatchPath,
} from "./graph.js";

test("graph watcher debounces rebuild triggers", async () => {
	const clock = new FakeClock();
	const events = new FakeWatchSource();
	const triggered: string[] = [];
	const watcher = new KnowledgeBaseGraphWatcher({
		createWatcher: (_kbPath, onEvent) => events.create(onEvent),
		triggerRebuild: (kbPath) => {
			triggered.push(kbPath);
			return { ok: true, status: "started" };
		},
		debounceMs: 50,
	});
	using _timers = clock.install();

	watcher.start("/kb");
	events.emit("wiki/a.md");
	events.emit("wiki/b.md");
	assert.deepEqual(triggered, []);
	await clock.advance(49);
	assert.deepEqual(triggered, []);
	await clock.advance(1);
	assert.deepEqual(triggered, ["/kb"]);
	watcher.stop();
});

test("graph watcher ignores external noise and generated graph artifacts", async () => {
	const clock = new FakeClock();
	const events = new FakeWatchSource();
	const triggered: string[] = [];
	const watcher = new KnowledgeBaseGraphWatcher({
		createWatcher: (_kbPath, onEvent) => events.create(onEvent),
		triggerRebuild: (kbPath) => {
			triggered.push(kbPath);
			return { ok: true, status: "started" };
		},
		debounceMs: 10,
	});
	using _timers = clock.install();

	watcher.start("/kb");
	for (const filename of [
		".wiki-tmp/run.json",
		".git/index",
		".obsidian/workspace.json",
		"node_modules/pkg/index.js",
		".DS_Store",
		"wiki/graph-data.json",
		"wiki/knowledge-graph.html",
		"wiki/knowledge-graph-dark.html",
		".wiki-graph-layout.json",
	]) {
		assert.equal(shouldIgnoreGraphWatchPath(filename), true, filename);
		events.emit(filename);
	}
	await clock.advance(20);
	assert.deepEqual(triggered, []);

	events.emit("wiki/topics/new-page.md");
	await clock.advance(10);
	assert.deepEqual(triggered, ["/kb"]);
	watcher.stop();
});

test("graph watcher suspends during batch digest and resumes with one immediate rebuild", async () => {
	const events = new FakeWatchSource();
	const triggered: string[] = [];
	const watcher = new KnowledgeBaseGraphWatcher({
		createWatcher: (_kbPath, onEvent) => events.create(onEvent),
		triggerRebuild: (kbPath) => {
			triggered.push(kbPath);
			return { ok: true, status: "started" };
		},
		debounceMs: 10,
	});

	watcher.start("/kb");
	watcher.suspend("/kb");
	events.emit("wiki/synthesis/sessions/a.md");
	events.emit("wiki/synthesis/sessions/b.md");
	assert.deepEqual(triggered, []);
	watcher.resume("/kb", { trigger: true });
	assert.deepEqual(triggered, ["/kb"]);
	watcher.stop();
});

test("graph rebuild queue merges triggers into one pending rebuild while running", async () => {
	const gates = [deferred<void>(), deferred<void>()];
	const calls: string[] = [];
	let rebuildIndex = 0;
	const queue = new GraphRebuildQueue({
		run: async () => {
			const gate = gates[rebuildIndex++];
			assert.ok(gate);
			calls.push("run");
			await gate.promise;
		},
		onError: (err) => {
			throw err;
		},
	});

	assert.equal(queue.trigger().status, "started");
	assert.equal(queue.trigger().status, "queued");
	assert.equal(queue.trigger().status, "queued");
	await Promise.resolve();
	assert.deepEqual(calls, ["run"]);
	gates[0]?.resolve();
	await waitFor(() => calls.length >= 2);
	assert.deepEqual(calls, ["run", "run"]);
	gates[1]?.resolve();
	await queue.waitForIdle();
	assert.deepEqual(calls, ["run", "run"]);
});

test("graph rebuild failure message is stable and does not expose build paths", () => {
	assert.equal(
		graphRebuildFailureMessage(new Error("spawn failed /Users/private/build.sh")),
		"图谱重建失败",
	);
});
test("graph rebuild queue recovers to started after a failed run", async () => {
	let attempts = 0;
	const errors: unknown[] = [];
	const queue = new GraphRebuildQueue({
		run: async () => {
			attempts++;
			if (attempts === 1) throw new Error("build failed");
		},
		onError: (err) => errors.push(err),
	});

	assert.equal(queue.trigger().status, "started");
	await queue.waitForIdle();
	assert.equal(errors.length, 1);
	assert.equal(queue.trigger().status, "started");
	await queue.waitForIdle();
	assert.equal(attempts, 2);
});

test("graph rebuild queue runs a queued request after failure and then becomes idle", async () => {
	const firstRun = deferred<void>();
	let attempts = 0;
	const errors: unknown[] = [];
	const queue = new GraphRebuildQueue({
		run: async () => {
			attempts++;
			if (attempts === 1) {
				await firstRun.promise;
				throw new Error("first build failed");
			}
		},
		onError: (err) => errors.push(err),
	});

	assert.equal(queue.trigger().status, "started");
	assert.equal(queue.trigger().status, "queued");
	firstRun.resolve();
	await queue.waitForIdle();
	assert.equal(attempts, 2);
	assert.equal(errors.length, 1);
	assert.equal(queue.trigger().status, "started");
	await queue.waitForIdle();
});

class FakeWatchSource {
	private onEvent: ((event: { eventType: string; filename: string | null }) => void) | null = null;

	create(onEvent: (event: { eventType: string; filename: string | null }) => void) {
		this.onEvent = onEvent;
		return {
			close: () => {
				this.onEvent = null;
			},
		};
	}

	emit(filename: string): void {
		this.onEvent?.({ eventType: "rename", filename });
	}
}

class FakeClock {
	private now = 0;
	private nextId = 1;
	private tasks = new Map<number, { due: number; callback: () => void }>();
	private originalSetTimeout = globalThis.setTimeout;
	private originalClearTimeout = globalThis.clearTimeout;

	install() {
		const self = this;
		globalThis.setTimeout = ((callback: () => void, ms?: number) => {
			const id = self.nextId++;
			self.tasks.set(id, { due: self.now + Number(ms ?? 0), callback });
			return id as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
			self.tasks.delete(Number(id));
		}) as typeof clearTimeout;
		return {
			[Symbol.dispose]: () => this.restore(),
		};
	}

	async advance(ms: number): Promise<void> {
		this.now += ms;
		const due = Array.from(this.tasks.entries())
			.filter(([, task]) => task.due <= this.now)
			.sort((a, b) => a[1].due - b[1].due);
		for (const [id, task] of due) {
			if (!this.tasks.delete(id)) continue;
			task.callback();
		}
		await Promise.resolve();
	}

	private restore(): void {
		globalThis.setTimeout = this.originalSetTimeout;
		globalThis.clearTimeout = this.originalClearTimeout;
		this.tasks.clear();
	}
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let i = 0; i < 20; i++) {
		if (predicate()) return;
		await Promise.resolve();
	}
	assert.equal(predicate(), true);
}
