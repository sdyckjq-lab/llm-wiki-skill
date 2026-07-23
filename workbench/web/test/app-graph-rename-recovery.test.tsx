import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { act, renderHook } from "@testing-library/react";

import { useGraphRenameRecovery } from "../src/lib/use-graph-rename-recovery";
import { subscribeGraphEvents, type EventSourceLike } from "../src/lib/api/events";
import { GraphRenameEvidenceNotice } from "../src/components/GraphRenameEvidenceNotice";
import { click, render, screen, waitFor } from "./render";

const operation = {
	operation_id: "11111111-1111-4111-8111-111111111111",
	state: "conflicted" as const,
	source_path: "wiki/topics/old.md",
	target_path: "wiki/topics/new.md",
	graph_rebuild: "not_started" as const,
	conflicts: [],
	retained_evidence: [],
};

const receipt = {
	operation_id: operation.operation_id,
	retained_evidence: [{
		relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/current.md",
		sha256: "a".repeat(64),
		expires_at: "2026-08-21T00:00:00.000Z",
	}],
};

const newerReceipt = {
	operation_id: "22222222-2222-4222-8222-222222222222",
	retained_evidence: [{
		relative_path: ".wiki-tmp/rename-ops/22222222-2222-4222-8222-222222222222/evidence/current.md",
		sha256: "b".repeat(64),
		expires_at: "2026-08-22T00:00:00.000Z",
	}],
};

describe("App graph rename recovery ownership", () => {
	it("checks initial and selected knowledge bases while ignoring a previous late response", async () => {
		const first = deferred<ReturnType<typeof requiredRecovery>>();
		const second = deferred<ReturnType<typeof clearRecovery>>();
		const calls: string[] = [];
		const getRecovery = (kbPath: string) => {
			calls.push(kbPath);
			return kbPath === "/kb/first" ? first.promise : second.promise;
		};
		const { result, rerender } = renderHook(
			({ kbPath }) => useGraphRenameRecovery({ kbPath, getRecovery }),
			{ initialProps: { kbPath: "/kb/first" as string | null } },
		);
		assert.equal(result.current.renameBlocked, true);

		rerender({ kbPath: "/kb/second" });
		second.resolve(clearRecovery([receipt]));
		await waitFor(() => assert.equal(result.current.status?.status, "clear"));
		assert.deepEqual(calls, ["/kb/first", "/kb/second"]);
		assert.equal(result.current.renameBlocked, false);
		assert.deepEqual(result.current.visibleReceipts, [receipt]);

		first.resolve(requiredRecovery());
		await Promise.resolve();
		assert.equal(result.current.status?.status, "clear");
		assert.deepEqual(result.current.visibleReceipts, [receipt]);
	});

	it("blocks new rename for required, rebuild-required, and blocked states but not retained evidence", async () => {
		const states = [
			requiredRecovery(),
			{ status: "rebuild_required" as const, operation: { ...operation, state: "committed" as const, graph_rebuild: "failed" as const }, retained_evidence_receipts: [receipt] },
			{ status: "blocked" as const, reason: "invalid_journal" as const, operation_id: operation.operation_id, retained_evidence_receipts: [receipt] },
			clearRecovery([receipt]),
		];
		let index = 0;
		const getRecovery = async () => states[Math.min(index++, states.length - 1)]!;
		const { result } = renderHook(() => useGraphRenameRecovery({
			kbPath: "/kb/current",
			getRecovery,
		}));

		await waitFor(() => assert.equal(result.current.status?.status, "required"));
		assert.equal(result.current.renameBlocked, true);
		for (const expected of ["rebuild_required", "blocked", "clear"] as const) {
			await act(async () => { await result.current.recheck(); });
			await waitFor(() => assert.equal(result.current.status?.status, expected));
			assert.equal(result.current.renameBlocked, expected !== "clear");
		}
		assert.deepEqual(result.current.visibleReceipts, [receipt]);
		act(() => result.current.dismissReceipt(receipt.operation_id));
		assert.deepEqual(result.current.visibleReceipts, []);
		await act(async () => { await result.current.refreshAfterMutation(); });
		assert.equal(result.current.renameBlocked, false);
		assert.deepEqual(result.current.visibleReceipts, []);
	});

	it("refreshes from the server instead of letting a late incomplete operation state erase receipts", async () => {
		const states = [
			clearRecovery([receipt]),
			clearRecovery([receipt, newerReceipt]),
			clearRecovery([receipt, newerReceipt]),
		];
		let index = 0;
		const getRecovery = async () => states[Math.min(index++, states.length - 1)]!;
		const { result } = renderHook(() => useGraphRenameRecovery({
			kbPath: "/kb/current",
			getRecovery,
		}));

		await waitFor(() => assert.deepEqual(result.current.visibleReceipts, [receipt]));
		await act(async () => { await result.current.recheck(); });
		assert.deepEqual(result.current.visibleReceipts, [receipt, newerReceipt]);

		await act(async () => {
			await result.current.refreshAfterMutation();
		});
		assert.equal(result.current.status?.status, "clear");
		assert.equal(result.current.renameBlocked, false);
		assert.deepEqual(result.current.visibleReceipts, [receipt, newerReceipt]);
	});

	it("keeps dismissed evidence hidden when a graph event triggers App's recovery recheck", async () => {
		const source = new FakeGraphEventSource();
		let recoveryReads = 0;
		const getRecovery = async () => {
			recoveryReads += 1;
			return clearRecovery([receipt]);
		};
		const { result } = renderHook(() => {
			const recovery = useGraphRenameRecovery({
				kbPath: "/kb/current",
				getRecovery,
			});
			const recheck = recovery.recheck;
			React.useEffect(() => subscribeGraphEvents({
				kbPath: "/kb/current",
				onEvent: () => { void recheck(); },
				eventSourceFactory: () => source,
				connectivityTarget: new EventTarget(),
			}), [recheck]);
			return recovery;
		});

		await waitFor(() => assert.deepEqual(result.current.visibleReceipts, [receipt]));
		act(() => result.current.dismissReceipt(receipt.operation_id));
		assert.deepEqual(result.current.visibleReceipts, []);

		act(() => {
			source.emit({
				schemaVersion: 1,
				streamId: "graph-stream",
				seq: 1,
				type: "graph_stream_ready",
				connectedAt: "2026-08-01T00:00:00.000Z",
			});
			source.emit({
				schemaVersion: 1,
				streamId: "graph-stream",
				seq: 2,
				type: "graph_updated",
				diff: null,
				rebuiltAt: "2026-08-01T00:01:00.000Z",
				stats: { nodeCount: 1, edgeCount: 0 },
				warning_summary: null,
				warning_details_status: "unavailable",
			});
		});

		await waitFor(() => assert.equal(recoveryReads, 2));
		assert.deepEqual(result.current.visibleReceipts, []);
	});

	it("shows retained evidence again after switching knowledge bases and returning", async () => {
		const getRecovery = async () => clearRecovery([receipt]);
		const { result, rerender } = renderHook(
			({ kbPath }) => useGraphRenameRecovery({ kbPath, getRecovery }),
			{ initialProps: { kbPath: "/kb/first" } },
		);

		await waitFor(() => assert.deepEqual(result.current.visibleReceipts, [receipt]));
		act(() => result.current.dismissReceipt(receipt.operation_id));
		assert.deepEqual(result.current.visibleReceipts, []);

		rerender({ kbPath: "/kb/second" });
		await waitFor(() => assert.equal(result.current.status?.status, "clear"));
		rerender({ kbPath: "/kb/first" });
		await waitFor(() => assert.deepEqual(result.current.visibleReceipts, [receipt]));
	});

	it("shows retained evidence again in a new App instance", async () => {
		const getRecovery = async () => clearRecovery([receipt]);
		const first = renderHook(() => useGraphRenameRecovery({ kbPath: "/kb/current", getRecovery }));
		await waitFor(() => assert.deepEqual(first.result.current.visibleReceipts, [receipt]));
		act(() => first.result.current.dismissReceipt(receipt.operation_id));
		assert.deepEqual(first.result.current.visibleReceipts, []);
		first.unmount();

		const restarted = renderHook(() => useGraphRenameRecovery({ kbPath: "/kb/current", getRecovery }));
		await waitFor(() => assert.deepEqual(restarted.result.current.visibleReceipts, [receipt]));
	});

	it("keeps rename blocked through repeated rebuild failures until the server reports clear", async () => {
		const rebuildRequired = {
			status: "rebuild_required" as const,
			operation: { ...operation, state: "committed" as const, graph_rebuild: "failed" as const },
			retained_evidence_receipts: [],
		};
		const states = [rebuildRequired, rebuildRequired, clearRecovery()];
		let index = 0;
		const getRecovery = async () => states[Math.min(index++, states.length - 1)]!;
		const { result } = renderHook(() => useGraphRenameRecovery({
			kbPath: "/kb/current",
			getRecovery,
		}));

		await waitFor(() => assert.equal(result.current.status?.status, "rebuild_required"));
		assert.equal(result.current.renameBlocked, true);
		await act(async () => { await result.current.recheck(); });
		assert.equal(result.current.status?.status, "rebuild_required");
		assert.equal(result.current.renameBlocked, true);
		await act(async () => { await result.current.recheck(); });
		assert.equal(result.current.status?.status, "clear");
		assert.equal(result.current.renameBlocked, false);
	});

	it("shows retained evidence separately with hashes and exact automatic-deletion dates", async () => {
		const dismissed: string[] = [];
		render(<GraphRenameEvidenceNotice receipts={[receipt]} onDismiss={(operationId) => dismissed.push(operationId)} />);

		const notice = screen.getByRole("region", { name: "保留的改名冲突证据" });
		assert.match(notice.textContent ?? "", new RegExp(operation.operation_id));
		assert.match(notice.textContent ?? "", /evidence\/current\.md/);
		assert.match(notice.textContent ?? "", new RegExp("a".repeat(64)));
		assert.match(notice.textContent ?? "", /2026-08-21T00:00:00\.000Z/);
		await click(screen.getByRole("button", { name: "隐藏这条证据提示" }));
		assert.deepEqual(dismissed, [operation.operation_id]);
	});
});

function requiredRecovery() {
	return { status: "required" as const, operation, retained_evidence_receipts: [] };
}

function clearRecovery(retained_evidence_receipts: typeof receipt[] = []) {
	return { status: "clear" as const, retained_evidence_receipts };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

class FakeGraphEventSource implements EventSourceLike {
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	close() {}
	emit(value: unknown) {
		this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>);
	}
}
