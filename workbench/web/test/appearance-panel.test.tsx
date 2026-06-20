import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { AppearancePanel } from "../src/components/AppearancePanel";
import { DEFAULT_APPEARANCE, type AppearancePrefs } from "../src/lib/appearance";
import { click, render, screen } from "./render";

describe("AppearancePanel", () => {
	it("stays hidden until opened", () => {
		render(
			<AppearancePanel
				open={false}
				value={DEFAULT_APPEARANCE}
				onChange={noopChange}
				onClose={noop}
			/>,
		);

		assert.equal(screen.queryByLabelText("外观偏好"), null);
	});

	it("emits controlled preference patches from segments and swatches", async () => {
		const patches: Array<Partial<AppearancePrefs>> = [];
		render(
			<AppearancePanel
				open
				value={DEFAULT_APPEARANCE}
				onChange={(patch) => patches.push(patch)}
				onClose={noop}
			/>,
		);

		await click(screen.getByRole("button", { name: "夜灯" }));
		await click(screen.getByRole("button", { name: "网格" }));
		await click(screen.getByRole("button", { name: "配色：玫瑰" }));
		await click(screen.getByRole("button", { name: "实色" }));
		await click(screen.getByRole("button", { name: "关闭" }));
		await click(screen.getByRole("button", { name: "紧凑" }));

		assert.deepEqual(patches, [
			{ theme: "dark" },
			{ paper: "grid" },
			{ accent: "rose" },
			{ userbubble: "solid" },
			{ hand: "off" },
			{ density: "compact" },
		]);
	});

	it("emits close when the close button is clicked", async () => {
		const calls: string[] = [];
		render(
			<AppearancePanel
				open
				value={DEFAULT_APPEARANCE}
				onChange={noopChange}
				onClose={() => calls.push("close")}
			/>,
		);

		await click(screen.getByRole("button", { name: "关闭外观面板" }));

		assert.deepEqual(calls, ["close"]);
	});
});

function noop() {}
function noopChange() {}
