import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { MainViewTabs } from "../src/components/MainViewTabs";
import { click, render, screen } from "./render";

describe("MainViewTabs", () => {
	it("renders the V2 main view switcher and changes views from the main area", async () => {
		const selected: string[] = [];
		render(
			<MainViewTabs
				activeView="chat"
				graphHasPendingUpdate
				onSelectView={(view) => selected.push(view)}
			/>,
		);

		const tablist = screen.getByRole("tablist", { name: "主视图切换" });
		const chatTab = screen.getByRole("tab", { name: "对话" });
		const graphTab = screen.getByRole("tab", { name: "图谱" });

		assert.ok(tablist.contains(chatTab));
		assert.ok(tablist.contains(graphTab));
		assert.equal(chatTab.getAttribute("aria-selected"), "true");
		assert.equal(graphTab.getAttribute("aria-selected"), "false");
		assert.ok(graphTab.querySelector(".main-view-tab-dot"), "graph tab should show pending graph updates");

		await click(graphTab);
		await click(chatTab);

		assert.deepEqual(selected, ["graph", "chat"]);
	});
});
