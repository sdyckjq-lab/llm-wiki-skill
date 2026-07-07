import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RightDrawer } from "../src/components/RightDrawer";
import { graphCommunitySummaryDrawer, type DrawerState } from "../src/lib/drawer-state";
import { render, waitFor } from "./render";
import type { GraphCommunitySummaryPayload } from "@llm-wiki/graph-engine";

describe("RightDrawer community enter exit", () => {
	it("keeps the drawer mounted under data-drawer-exiting and drops the open width class so the canvas can grow", () => {
		const html = renderStatic({ exiting: true });

		assert.match(html, /data-drawer-exiting="true"/);
		assert.doesNotMatch(html, /drawer-panel-open/);
		// 内容仍在：抽屉是退场，不是瞬间消失。
		assert.match(html, /data-testid="graph-community-summary"/);
	});

	it("keeps the open width class and skips the exiting marker when not exiting", () => {
		const html = renderStatic({ exiting: false });

		assert.match(html, /drawer-panel-open/);
		assert.doesNotMatch(html, /data-drawer-exiting/);
	});

	it("calls onExitComplete once after the exit duration elapses", async () => {
		let completed = 0;
		render(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting
				exitDurationMs={10}
				onExitComplete={() => { completed += 1; }}
			/>,
		);

		assert.equal(completed, 0, "exit must not complete synchronously on mount");
		await waitFor(() => assert.equal(completed, 1));
		// 不重复触发：推进远超 duration 后仍只一次。
		await new Promise((resolve) => setTimeout(resolve, 40));
		assert.equal(completed, 1, "onExitComplete must fire at most once");
	});

	it("uses the latest onExitComplete callback while an exit timer is active", async () => {
		let firstCompleted = 0;
		let latestCompleted = 0;
		const { rerender } = render(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting
				exitDurationMs={10}
				onExitComplete={() => { firstCompleted += 1; }}
			/>,
		);

		rerender(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting
				exitDurationMs={10}
				onExitComplete={() => { latestCompleted += 1; }}
			/>,
		);

		await waitFor(() => assert.equal(latestCompleted, 1));
		assert.equal(firstCompleted, 0, "stale exit completion callback must not fire");
	});

	it("cancels the exit timer when unmounted before the duration elapses", async () => {
		let completed = 0;
		const { unmount } = render(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting
				exitDurationMs={30}
				onExitComplete={() => { completed += 1; }}
			/>,
		);
		unmount();
		await new Promise((resolve) => setTimeout(resolve, 80));
		assert.equal(completed, 0, "timer must be cleared on unmount so onExitComplete never fires");
	});

	it("keeps fullscreen open and skips the exiting marker when fullscreen and exiting combine", () => {
		const html = renderToStaticMarkup(
			React.createElement(RightDrawer, {
				...baseProps(),
				drawer: communityDrawer(),
				fullscreen: true,
				exiting: true,
				exitDurationMs: 320,
				onExitComplete: noop,
			}),
		);
		assert.match(html, /drawer-panel-open/);
		assert.match(html, /drawer-panel-fullscreen/);
		assert.doesNotMatch(html, /data-drawer-exiting/);
	});

	it("completes immediately when the exit duration is zero (reduced motion)", async () => {
		let completed = 0;
		render(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting
				exitDurationMs={0}
				onExitComplete={() => { completed += 1; }}
			/>,
		);

		await waitFor(() => assert.equal(completed, 1));
	});

	it("does not call onExitComplete while the drawer is not exiting", () => {
		let completed = 0;
		render(
			<RightDrawer
				{...baseProps()}
				drawer={communityDrawer()}
				exiting={false}
				exitDurationMs={10}
				onExitComplete={() => { completed += 1; }}
			/>,
		);

		assert.equal(completed, 0);
	});

	it("keeps the CSS exit transition contract for spatial continuity and reduced motion", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		// 退场期间画布平滑扩展：抽屉宽度过渡到 0，而非瞬间坍缩。
		assert.match(css, /\.drawer-panel\[data-drawer-exiting="true"\][\s\S]*?width:\s*0/);
		assert.match(css, /\.drawer-panel\[data-drawer-exiting="true"\][\s\S]*?transition:\s*width/);
		// 内容退场（淡化），不是硬切。
		assert.match(css, /\.drawer-panel\[data-drawer-exiting="true"\][\s\S]*?\.drawer-content[\s\S]*?opacity:\s*0/);
		// 减少动态效果下取消这段过渡。
		assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?drawer-panel\[data-drawer-exiting="true"\][\s\S]*?transition:\s*none/);
	});
});

function renderStatic({ exiting }: { exiting: boolean }): string {
	return renderToStaticMarkup(
		React.createElement(RightDrawer, {
			...baseProps(),
			drawer: communityDrawer(),
			exiting,
			exitDurationMs: 320,
			onExitComplete: noop,
		}),
	);
}

function baseProps() {
	return {
		drawer: communityDrawer(),
		fullscreen: false,
		width: 420,
		defaultWidth: 420,
		onSelectArtifact: noopString,
		onOpenPage: noopString,
		onWikiLinkSeen: noopString,
		onGraphReaderAction: noopString,
		onGraphSummaryCommand: noopCommand,
		onGraphSummaryNodePreview: noopPreview,
		onGraphSelectionTextChange: noopString,
		onGraphSelectionAsk: noopAsk,
		onGraphCommunityTextChange: noopString,
		onGraphCommunityAsk: noopAsk,
		onResize: noopNumber,
		onToggleFullscreen: noop,
		onClose: noopClose,
	};
}

function communityDrawer(): DrawerState {
	return graphCommunitySummaryDrawer(communitySummaryFixture());
}

function communitySummaryFixture(overrides: Partial<GraphCommunitySummaryPayload> = {}): GraphCommunitySummaryPayload {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "alpha" },
		communityId: "alpha",
		label: "Alpha community",
		nodeCount: 4,
		facts: { pageCount: 4, internalLinkCount: 2, communityCount: 1, isolatedCount: 0 },
		structureState: "clear",
		description: "围绕同一主题的一组页面。",
		canEnterCommunity: true,
		coreNodeIds: ["alpha", "beta"],
		coreNodes: [
			{ nodeId: "alpha", label: "Alpha", type: "topic", role: "核心" },
			{ nodeId: "beta", label: "Beta", type: "entity", role: "相关" },
		],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: { kind: "community", id: "alpha" },
			selectionId: "community:alpha",
			selectedNodeIds: ["alpha", "beta"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [{ kind: "enter-community", communityId: "alpha", label: "进入社区" }],
		...overrides,
	};
}

function noop() {}
function noopString() {}
function noopNumber() {}
function noopCommand() {}
function noopPreview() {}
function noopAsk() {}
function noopClose() {}
