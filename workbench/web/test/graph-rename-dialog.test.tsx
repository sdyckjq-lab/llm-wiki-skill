import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { fireEvent } from "@testing-library/react";

import { GraphRenameDialog } from "../src/components/GraphRenameDialog";
import { changeText, click, pressKey, render, screen, waitFor } from "./render";

const previewFixture = {
	operation_id: "11111111-1111-4111-8111-111111111111",
	expires_at: "2026-08-21T00:00:00.000Z",
	preview_digest: "a".repeat(64),
	source_path: "wiki/topics/同名.md",
	target_path: "wiki/topics/新 页面.md",
	equivalent_portable_name: false,
	file_set_sha256: "b".repeat(64),
	editable_files: [{
		source_path: "wiki/synthesis/总览.md",
		file_sha256: "c".repeat(64),
		read_only: false,
		occurrences: [{
			occurrence_id: "editable-1",
			source_path: "wiki/synthesis/总览.md",
			file_sha256: "c".repeat(64),
			start_byte: 8,
			end_byte: 20,
			raw_link: "[[同名]]",
			replacement_raw_link: "[[wiki/topics/新 页面.md]]",
			resolution_kind: "unique_basename" as const,
		}],
	}],
	read_only_references: [{
		occurrence_id: "readonly-1",
		source_path: "raw/外部摘录.md",
		file_sha256: "d".repeat(64),
		start_byte: 1,
		end_byte: 9,
		raw_link: "[[同名]]",
		resolution_kind: "ambiguous" as const,
	}],
	ambiguous_choices: [{
		occurrence_id: "ambiguous-1",
		source_path: "wiki/entities/引用.md",
		candidates: [{
			target_path: "wiki/topics/同名.md",
			replacement_raw_link: "[[wiki/topics/新 页面.md]]",
		}, {
			target_path: "wiki/entities/同名.md",
			replacement_raw_link: "[[wiki/entities/同名.md]]",
		}],
	}],
	layout_change: {
		from_key: "wiki/topics/同名.md",
		to_key: "wiki/topics/新 页面.md",
		present: true,
	},
	summary: {
		editable_files: 2,
		editable_occurrences: 3,
		read_only_occurrences: 1,
		ambiguous_occurrences: 1,
	},
};

const conflictedOperation = {
	operation_id: previewFixture.operation_id,
	state: "conflicted" as const,
	source_path: previewFixture.source_path,
	target_path: previewFixture.target_path,
	graph_rebuild: "not_started" as const,
	conflicts: [{
		source_path: "wiki/synthesis/当前冲突.md",
		current_state: "present" as const,
		current_sha256: "e".repeat(64),
		preserved_variants: [{
			kind: "current" as const,
			relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/current-1.md",
			sha256: "e".repeat(64),
		}, {
			kind: "original" as const,
			relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/original-1.md",
			sha256: "f".repeat(64),
		}, {
			kind: "intended" as const,
			relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/intended-1.md",
			sha256: "1".repeat(64),
		}],
	}, {
		source_path: "wiki/synthesis/已删除.md",
		current_state: "missing" as const,
		preserved_variants: [],
	}],
	retained_evidence: [],
};

const requiredRecovery = {
	status: "required" as const,
	operation: conflictedOperation,
	retained_evidence_receipts: [],
};

const kbPath = "/registered/knowledge-base";

const unusedApi = {
	previewGraphRename: async () => assert.fail("preview must not run"),
	applyGraphRename: async () => assert.fail("apply must not run"),
	getGraphRenameRecovery: async () => assert.fail("recovery must not run"),
	resolveGraphRenameRecovery: async () => assert.fail("resolution must not run"),
};

describe("GraphRenameDialog", () => {
	it("chooses a warning source first and validates a page-entry filename before preview", async () => {
		const { rerender } = render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				candidatePaths={[
					"wiki/entities/同名.md",
					"wiki/topics/同名.md",
					"wiki/sources/同名.md",
					"wiki/comparisons/同名.md",
				]}
				onOpenChange={() => {}}
				api={unusedApi}
			/>,
		);

		const dialog = screen.getByRole("dialog", { name: "安全改名" });
		assert.match(dialog.textContent ?? "", /先选择要改名的页面/);
		assert.equal(screen.getAllByRole("radio").length, 4);
		assert.equal(screen.getByRole("button", { name: "下一步" }).hasAttribute("disabled"), true);
		await click(screen.getByRole("radio", { name: "wiki/topics/同名.md" }));
		await click(screen.getByRole("button", { name: "下一步" }));
		assert.match(dialog.textContent ?? "", /wiki\/topics\/同名\.md/);

		rerender(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath="wiki/topics/同名.md"
				onOpenChange={() => {}}
				api={unusedApi}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "新文件名" });
		await changeText(input, "CON.txt");
		assert.match(screen.getByRole("alert").textContent ?? "", /不能作为文件名/);
		assert.equal(screen.getByRole("button", { name: "生成预览" }).hasAttribute("disabled"), true);

		await changeText(input, "新的 页面");
		assert.equal(screen.queryByRole("alert"), null);
		assert.equal(screen.getByRole("button", { name: "生成预览" }).hasAttribute("disabled"), false);
	});

	it("shows the complete server preview and requires every ambiguity plus explicit confirmation", async () => {
		const previewCalls: unknown[][] = [];
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath="wiki/topics/同名.md"
				onOpenChange={() => {}}
				api={{
					...unusedApi,
					previewGraphRename: async (...args) => {
						previewCalls.push(args);
						return previewFixture;
					},
				}}
			/>,
		);

		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));

		assert.deepEqual(previewCalls, [[kbPath, "wiki/topics/同名.md", "新 页面"]]);
		const dialog = screen.getByRole("dialog", { name: "安全改名" });
		for (const text of [
			"wiki/topics/同名.md",
			"wiki/topics/新 页面.md",
			"2 个可编辑文件",
			"3 处可编辑引用",
			"raw/外部摘录.md",
			"固定位置将随页面迁移",
			"wiki/entities/引用.md",
		]) assert.match(dialog.textContent ?? "", new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

		const apply = screen.getByRole("button", { name: "确认并改名" });
		assert.equal(apply.hasAttribute("disabled"), true);
		await click(screen.getByRole("radio", { name: "wiki/topics/同名.md" }));
		assert.equal(apply.hasAttribute("disabled"), true);
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		assert.equal(apply.hasAttribute("disabled"), false);
	});

	it("submits one immutable operation when confirmation is clicked twice", async () => {
		const pending = deferred<{
			outcome: "operation";
			operation: {
				operation_id: string;
				state: "committed";
				source_path: string;
				target_path: string;
				graph_rebuild: "succeeded";
				conflicts: [];
				retained_evidence: [];
			};
		}>();
		const applyCalls: unknown[][] = [];
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={previewFixture.source_path}
				onOpenChange={() => {}}
				api={{
					...unusedApi,
					previewGraphRename: async () => previewFixture,
					applyGraphRename: async (...args) => {
						applyCalls.push(args);
						return pending.promise;
					},
				}}
			/>,
		);

		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));
		await click(screen.getByRole("radio", { name: "wiki/topics/同名.md" }));
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		const apply = screen.getByRole("button", { name: "确认并改名" });
		fireEvent.click(apply);
		fireEvent.click(apply);
		await Promise.resolve();

		assert.equal(applyCalls.length, 1);
		assert.deepEqual(applyCalls[0], [kbPath, {
			operation_id: previewFixture.operation_id,
			expires_at: previewFixture.expires_at,
			source_path: previewFixture.source_path,
			new_name: "新 页面",
			preview_digest: previewFixture.preview_digest,
			resolutions: [{ occurrence_id: "ambiguous-1", target_path: "wiki/topics/同名.md" }],
			confirmed: true,
		}]);
		assert.match(screen.getByRole("status").textContent ?? "", /正在安全写入/);

		pending.resolve({
			outcome: "operation",
			operation: {
				operation_id: previewFixture.operation_id,
				state: "committed",
				source_path: previewFixture.source_path,
				target_path: previewFixture.target_path,
				graph_rebuild: "succeeded",
				conflicts: [],
				retained_evidence: [],
			},
		});
		await waitFor(() => assert.notEqual(screen.queryByText("页面已安全改名"), null));
	});

	it("shows a stale preview without optimistic success and offers a fresh preview", async () => {
		let previewCalls = 0;
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={previewFixture.source_path}
				onOpenChange={() => {}}
				api={{
					...unusedApi,
					previewGraphRename: async () => {
						previewCalls++;
						return previewFixture;
					},
					applyGraphRename: async () => ({
						outcome: "preview_stale",
						operation_id: previewFixture.operation_id,
						reason: "文件集合已经变化",
					}),
				}}
			/>,
		);

		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));
		await click(screen.getByRole("radio", { name: "wiki/topics/同名.md" }));
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		await click(screen.getByRole("button", { name: "确认并改名" }));

		await waitFor(() => assert.notEqual(screen.queryByText("预览已失效"), null));
		assert.equal(screen.queryByText("页面已安全改名"), null);
		assert.match(screen.getByRole("alert").textContent ?? "", /文件集合已经变化/);
		await click(screen.getByRole("button", { name: "重新生成预览" }));
		await waitFor(() => assert.equal(previewCalls, 2));
		assert.notEqual(screen.queryByText("确认影响"), null);
	});

	it("keeps committed content when graph rebuild fails and only offers graph retry", async () => {
		let retries = 0;
		const preview = { ...previewFixture, ambiguous_choices: [], summary: { ...previewFixture.summary, ambiguous_occurrences: 0 } };
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={preview.source_path}
				onOpenChange={() => {}}
				onRetryGraph={() => { retries++; }}
				api={{
					...unusedApi,
					previewGraphRename: async () => preview,
					applyGraphRename: async () => ({
						outcome: "operation",
						operation: {
							operation_id: preview.operation_id,
							state: "committed",
							source_path: preview.source_path,
							target_path: preview.target_path,
							graph_rebuild: "failed",
							conflicts: [],
							retained_evidence: [],
						},
					}),
				}}
			/>,
		);

		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		await click(screen.getByRole("button", { name: "确认并改名" }));

		await waitFor(() => assert.notEqual(screen.queryByText("内容已保存，图谱尚未更新"), null));
		assert.equal(screen.queryByRole("button", { name: /恢复原状|完成提交/ }), null);
		await click(screen.getByRole("button", { name: "重试更新图谱" }));
		assert.equal(retries, 1);
	});

	it("keeps the only rebuild retry visible through Escape and backdrop dismissal attempts", async () => {
		const openChanges: boolean[] = [];
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				recovery={{
					status: "rebuild_required",
					operation: {
						...conflictedOperation,
						state: "committed",
						graph_rebuild: "failed",
						conflicts: [],
					},
					retained_evidence_receipts: [],
				}}
				onOpenChange={(open) => openChanges.push(open)}
				api={unusedApi}
			/>,
		);

		assert.notEqual(screen.queryByRole("button", { name: "重试更新图谱" }), null);
		await pressKey(document, "Escape");
		assert.deepEqual(openChanges, []);
		assert.notEqual(screen.queryByRole("button", { name: "重试更新图谱" }), null);

		const overlay = document.querySelector('[data-slot="dialog-overlay"]');
		assert.ok(overlay);
		await click(overlay);
		assert.deepEqual(openChanges, []);
		assert.notEqual(screen.queryByRole("button", { name: "重试更新图谱" }), null);
	});

	it("moves a conflicted apply directly into the complete non-dismissible recovery state", async () => {
		const openChanges: boolean[] = [];
		const preview = { ...previewFixture, ambiguous_choices: [] };
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={preview.source_path}
				onOpenChange={(open) => openChanges.push(open)}
				api={{
					...unusedApi,
					previewGraphRename: async () => preview,
					applyGraphRename: async () => ({ outcome: "operation", operation: conflictedOperation }),
				}}
			/>,
		);

		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		await click(screen.getByRole("button", { name: "确认并改名" }));
		await waitFor(() => assert.notEqual(screen.queryByText("需要处理改名冲突"), null));
		assert.match(screen.getByRole("dialog", { name: "安全改名" }).textContent ?? "", /当前冲突\.md.*已删除\.md/);
		await pressKey(document, "Escape");
		assert.deepEqual(openChanges, []);
	});

	it("refreshes the complete conflict set before resolution and shows retained evidence after success", async () => {
		const refreshed = {
			...requiredRecovery,
			operation: {
				...conflictedOperation,
				conflicts: [{
					source_path: "wiki/synthesis/当前冲突.md",
					current_state: "missing" as const,
					preserved_variants: conflictedOperation.conflicts[0]!.preserved_variants,
				}, {
					source_path: "wiki/topics/新增冲突.md",
					current_state: "present" as const,
					current_sha256: "2".repeat(64),
					preserved_variants: [],
				}],
			},
		};
		const clear = {
			status: "clear" as const,
			retained_evidence_receipts: [{
				operation_id: previewFixture.operation_id,
				retained_evidence: [{
					relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/current-1.md",
					sha256: "e".repeat(64),
					expires_at: "2026-08-21T00:00:00.000Z",
				}],
			}],
		};
		const resolutionCalls: unknown[][] = [];
		let attempt = 0;
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				recovery={requiredRecovery}
				onOpenChange={() => {}}
				api={{
					...unusedApi,
					resolveGraphRenameRecovery: async (...args) => {
						resolutionCalls.push(args);
						return attempt++ === 0 ? refreshed : clear;
					},
				}}
			/>,
		);

		const dialog = screen.getByRole("dialog", { name: "安全改名" });
		assert.match(dialog.textContent ?? "", /当前冲突\.md.*当前文件存在/);
		assert.match(dialog.textContent ?? "", /已删除\.md.*已被外部删除/);
		for (const kind of ["当前版本", "原始版本", "计划版本"]) assert.match(dialog.textContent ?? "", new RegExp(kind));

		await click(screen.getByRole("radio", { name: "恢复原状" }));
		await click(screen.getByRole("button", { name: "确认恢复" }));
		await waitFor(() => assert.match(dialog.textContent ?? "", /新增冲突\.md.*当前文件存在/));
		assert.doesNotMatch(dialog.textContent ?? "", /已删除\.md/);
		assert.match(dialog.textContent ?? "", /冲突集合已变化/);
		assert.deepEqual(resolutionCalls[0], [kbPath, {
			operation_id: previewFixture.operation_id,
			action: "finish_rollback",
			observed_conflicts: [{
				source_path: "wiki/synthesis/当前冲突.md",
				current_state: "present",
				current_sha256: "e".repeat(64),
			}, {
				source_path: "wiki/synthesis/已删除.md",
				current_state: "missing",
			}],
		}]);

		await click(screen.getByRole("radio", { name: "完成提交" }));
		await click(screen.getByRole("button", { name: "确认恢复" }));
		await waitFor(() => assert.notEqual(screen.queryByText("恢复处理完成"), null));
		assert.match(dialog.textContent ?? "", /evidence\/current-1\.md/);
		assert.match(dialog.textContent ?? "", /2026-08-21T00:00:00\.000Z/);
	});

	it("shows unsafe or invalid recovery as blocked with no destructive action", () => {
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				recovery={{
					status: "blocked",
					reason: "unsafe_current_type",
					operation_id: previewFixture.operation_id,
					retained_evidence_receipts: [],
				}}
				onOpenChange={() => {}}
				api={unusedApi}
			/>,
		);

		assert.match(screen.getByRole("alert").textContent ?? "", /不安全的文件类型.*没有改写任何文件/);
		assert.equal(screen.queryByRole("button", { name: /确认并改名|确认恢复|完成提交|恢复原状/ }), null);
	});

	it("allows ordinary cancellation but ignores Escape while an apply is in flight", async () => {
		const openChanges: boolean[] = [];
		const pending = deferred<never>();
		const { unmount } = render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={previewFixture.source_path}
				onOpenChange={(open) => openChanges.push(open)}
				api={unusedApi}
			/>,
		);
		await pressKey(document, "Escape");
		assert.deepEqual(openChanges, [false]);
		unmount();

		openChanges.length = 0;
		render(
			<GraphRenameDialog
				open
				kbPath={kbPath}
				sourcePath={previewFixture.source_path}
				onOpenChange={(open) => openChanges.push(open)}
				api={{
					...unusedApi,
					previewGraphRename: async () => ({ ...previewFixture, ambiguous_choices: [] }),
					applyGraphRename: async () => pending.promise,
				}}
			/>,
		);
		await changeText(screen.getByRole("textbox", { name: "新文件名" }), "新 页面");
		await click(screen.getByRole("button", { name: "生成预览" }));
		await waitFor(() => assert.notEqual(screen.queryByText("确认影响"), null));
		await click(screen.getByRole("checkbox", { name: /我已核对完整预览/ }));
		await click(screen.getByRole("button", { name: "确认并改名" }));
		await pressKey(document, "Escape");
		assert.deepEqual(openChanges, []);
	});

	it("returns focus to the deliberate entry after ordinary cancellation", async () => {
		const openChanges: boolean[] = [];
		const entry = document.createElement("button");
		entry.textContent = "打开安全改名";
		document.body.append(entry);
		entry.focus();
		const { unmount } = render(<GraphRenameDialog
			open
			kbPath={kbPath}
			sourcePath={previewFixture.source_path}
			onOpenChange={(nextOpen) => openChanges.push(nextOpen)}
			api={unusedApi}
		/>);
		assert.notEqual(screen.queryByRole("dialog", { name: "安全改名" }), null);
		await click(screen.getByRole("button", { name: "取消" }));
		assert.deepEqual(openChanges, [false]);
		unmount();
		assert.equal(document.activeElement, entry);
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}
