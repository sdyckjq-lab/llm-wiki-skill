import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { fireEvent } from "@testing-library/react";

import { RightDrawer } from "../src/components/RightDrawer";
import { SearchPanel } from "../src/components/SearchPanel";
import { artifactDrawer, wikiDrawer, type DrawerState } from "../src/lib/drawer-state";
import type { ArtifactManifest } from "../src/lib/api";
import { click, pressKey, render, screen } from "./render";

describe("RightDrawer interactions", () => {
	it("marks the drawer as open for shell layout", () => {
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }));

		const drawer = document.querySelector(".drawer-panel-open");
		assert.ok(drawer);
		assert.equal(drawer?.getAttribute("data-drawer-open"), "true");
	});

	it("resizes by dragging, keyboard shortcuts, and double click reset", async () => {
		const resizeCalls: number[] = [];
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			width: 420,
			defaultWidth: 480,
			onResize: (width) => resizeCalls.push(width),
		});

		const handle = screen.getByRole("separator", { name: "调整预览区宽度" });
		stubPointerCapture(handle);

		fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
		assert.equal(document.body.classList.contains("drawer-resizing"), true);
		fireEvent.pointerMove(handle, { clientX: 852, pointerId: 1 });
		fireEvent.pointerUp(handle, { pointerId: 1 });
		assert.equal(document.body.classList.contains("drawer-resizing"), false);

		await pressKey(handle, "ArrowLeft");
		await pressKey(handle, "ArrowRight");
		await pressKey(handle, "Home");
		fireEvent.doubleClick(handle);

		assert.deepEqual(resizeCalls, [468, 444, 396, 480, 480]);
	});

	it("hides the resize handle while fullscreen and keeps the fullscreen toggle wired", async () => {
		const fullscreenCalls: string[] = [];
		const { rerender } = renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			fullscreen: false,
			onToggleFullscreen: () => fullscreenCalls.push("toggle"),
		});

		assert.ok(screen.getByRole("separator", { name: "调整预览区宽度" }));
		await click(screen.getByRole("button", { name: "全屏" }));
		assert.deepEqual(fullscreenCalls, ["toggle"]);

		rerender(drawerElement(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			fullscreen: true,
			onToggleFullscreen: () => fullscreenCalls.push("toggle"),
		}));

		assert.equal(document.querySelector(".drawer-panel-fullscreen") !== null, true);
		assert.equal(screen.queryByRole("separator", { name: "调整预览区宽度" }), null);
		await click(screen.getByRole("button", { name: "退出全屏" }));
		assert.deepEqual(fullscreenCalls, ["toggle", "toggle"]);
	});

	it("closes from the header button and Escape key", async () => {
		const closeReasons: string[] = [];
		renderDrawer(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
			onClose: (reason) => closeReasons.push(reason),
		});

		await click(screen.getByRole("button", { name: "关闭" }));
		await pressKey(document, "Escape");

		assert.deepEqual(closeReasons, ["button", "escape"]);
	});

	it("does not close the drawer when Escape closes search above it", async () => {
		const closeReasons: string[] = [];
		const searchCloses: string[] = [];
		render(
			<React.Fragment>
				{drawerElement(wikiDrawer("wiki/paper.md", { content: "Paper body" }), {
					onClose: (reason) => closeReasons.push(reason),
				})}
				<SearchPanel
					open
					refs={[{ path: "wiki/paper.md", name: "paper", title: "Paper", category: "entities" }]}
					knowledgeBaseName="AI学习知识库"
					onOpenPage={noopString}
					onClose={() => searchCloses.push("search")}
				/>
			</React.Fragment>,
		);

		await pressKey(screen.getByLabelText("搜索当前库页面"), "Escape");

		assert.deepEqual(searchCloses, ["search"]);
		assert.deepEqual(closeReasons, []);
	});

	it("switches artifact tabs without losing the active tab class", async () => {
		const selectedIds: string[] = [];
		renderDrawer(artifactDrawer([artifact("art-html", "Paper HTML", "html"), artifact("art-pdf", "Paper PDF", "pdf")], "art-html"), {
			onSelectArtifact: (id) => selectedIds.push(id),
		});

		const first = screen.getByRole("button", { name: /Paper HTML/ });
		const second = screen.getByRole("button", { name: /Paper PDF/ });
		assert.equal(first.classList.contains("drawer-tab-active"), true);
		assert.equal(second.classList.contains("drawer-tab-active"), false);

		await click(second);

		assert.deepEqual(selectedIds, ["art-pdf"]);
	});
});

function renderDrawer(drawer: DrawerState, props: Partial<RightDrawerProps> = {}) {
	return render(drawerElement(drawer, props));
}

function drawerElement(drawer: DrawerState, props: Partial<RightDrawerProps> = {}) {
	return (
		<RightDrawer
			drawer={drawer}
			fullscreen={props.fullscreen ?? false}
			width={props.width ?? 420}
			defaultWidth={props.defaultWidth ?? 420}
			onSelectArtifact={props.onSelectArtifact ?? noopString}
			onOpenPage={noopString}
			onWikiLinkSeen={noopString}
			onGraphReaderAction={noopString}
			onGraphSummaryCommand={() => {}}
			onGraphSummaryNodePreview={noopPreviewNode}
			onGraphSelectionTextChange={noopString}
			onGraphSelectionNeighbors={noop}
			onGraphSelectionAsk={noopSelectionAsk}
			onResize={props.onResize ?? noopNumber}
			onToggleFullscreen={props.onToggleFullscreen ?? noop}
			onClose={props.onClose ?? noopClose}
		/>
	);
}

type RightDrawerProps = React.ComponentProps<typeof RightDrawer>;

function stubPointerCapture(element: Element) {
	Object.defineProperties(element, {
		setPointerCapture: { configurable: true, value: () => {} },
		hasPointerCapture: { configurable: true, value: () => true },
		releasePointerCapture: { configurable: true, value: () => {} },
	});
}

function artifact(id: string, title: string, kind: ArtifactManifest["kind"]): ArtifactManifest {
	const extension = kind === "html" ? "html" : kind;
	return {
		id,
		kind,
		renderer: kind === "html" ? "iframe" : "download-only",
		metadata: {
			title,
			createdAt: "2026-06-20T00:00:00.000Z",
			sourceConversationId: "conversation-1",
			sourceKbPath: "/kb",
			sourceSkill: "paper",
			sizeBytes: 128,
		},
		files: [{ name: `artifact.${extension}`, sizeBytes: 128, mimeType: "text/plain" }],
		primaryFile: `artifact.${extension}`,
	};
}

function noop() {}
function noopString() {}
function noopNumber() {}
function noopClose() {}
function noopPreviewNode() {}
function noopSelectionAsk() {}
