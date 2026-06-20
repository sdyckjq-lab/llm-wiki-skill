import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BatchDigestPanel, type BatchDigestJob } from "../src/components/BatchDigestPanel";
import { ExportButtons } from "../src/components/ExportButtons";
import { TooltipProvider } from "../src/components/ui/tooltip";
import type { ExportKind } from "../src/lib/api";
import { click, render, screen } from "./render";

describe("Paper export and batch digest surfaces", () => {
	it("renders export actions as a prominent Paper bar and preserves click callbacks", async () => {
		const exports: ExportKind[] = [];
		render(
			<TooltipProvider>
				<ExportButtons disabled={false} disabledReason="disabled" onExport={(kind) => exports.push(kind)} />
			</TooltipProvider>,
		);

		const bar = screen.getByLabelText("导出当前对话");
		assert.match(bar.className, /export-bar/);
		assert.match(bar.textContent ?? "", /把当前对话整理成文件/);

		await click(screen.getByRole("button", { name: "导出为 PDF" }));
		await click(screen.getByRole("button", { name: "导出为 HTML" }));

		assert.deepEqual(exports, ["pdf", "html"]);
	});

	it("renders batch digest progress, file states, and output action", async () => {
		const opened: string[] = [];
		render(
			<BatchDigestPanel
				job={batchJob()}
				onClose={() => opened.push("close")}
				onOpenOutput={(path) => opened.push(path)}
			/>,
		);

		const panel = screen.getByLabelText("批量消化进度");
		assert.match(panel.className, /batch-panel/);
		assert.match(panel.textContent ?? "", /批量消化/);
		assert.match(panel.textContent ?? "", /50%/);
		assert.match(screen.getByLabelText("批量消化进度 50%").className, /batch-progress/);
		assert.match(screen.getByText("source-a.md").closest(".batch-file")?.className ?? "", /batch-file-done/);
		assert.match(screen.getByText("source-b.md").closest(".batch-file")?.className ?? "", /batch-file-running/);

		await click(screen.getByRole("button", { name: "打开结果" }));
		await click(screen.getByRole("button", { name: "关闭" }));

		assert.deepEqual(opened, ["wiki/source-a.md", "close"]);
	});

	it("keeps the Paper styling contract for export and batch digest surfaces", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.export-bar\s*\{/);
		assert.match(css, /\.export-bar[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.export-btn[\s\S]*border-radius:\s*9px/);
		assert.match(css, /\.batch-panel[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.batch-status-running[\s\S]*var\(--app-accent-soft\)/);
		assert.match(css, /\.batch-progress-bar[\s\S]*linear-gradient/);
		assert.match(css, /\.batch-output-btn\s*\{/);
	});
});

function batchJob(): BatchDigestJob {
	return {
		id: "job-1",
		kbPath: "/kb",
		status: "running",
		total: 4,
		completed: 1,
		failed: 1,
		current: "/inputs/source-b.md",
		files: [
			{
				index: 0,
				filePath: "/inputs/source-a.md",
				status: "done",
				chars: 1200,
				outputPath: "wiki/source-a.md",
			},
			{
				index: 1,
				filePath: "/inputs/source-b.md",
				status: "running",
				chars: 400,
			},
			{
				index: 2,
				filePath: "/inputs/source-c.md",
				status: "error",
				error: "读取失败",
			},
		],
		events: [],
	};
}
