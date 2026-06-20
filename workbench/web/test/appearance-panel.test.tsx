import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { AppearancePanel } from "../src/components/AppearancePanel";
import {
	APPEARANCE_STORAGE_PREFIX,
	DEFAULT_APPEARANCE,
	THEME_STORAGE_KEY,
	applyAppearance,
	mergeAppearance,
	writeAppearance,
	type AppearancePrefs,
} from "../src/lib/appearance";
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

	it("applies clicked segments and swatches to page data attributes and stored preferences", async () => {
		render(<AppliedAppearanceHarness />);

		await click(screen.getByRole("button", { name: "夜灯" }));
		await click(screen.getByRole("button", { name: "网格" }));
		await click(screen.getByRole("button", { name: "配色：玫瑰" }));
		await click(screen.getByRole("button", { name: "实色" }));
		await click(screen.getByRole("button", { name: "关闭" }));
		await click(screen.getByRole("button", { name: "紧凑" }));

		assert.equal(document.documentElement.dataset.theme, "dark");
		assert.equal(document.documentElement.dataset.paper, "grid");
		assert.equal(document.documentElement.dataset.accent, "rose");
		assert.equal(document.documentElement.dataset.userbubble, "solid");
		assert.equal(document.documentElement.dataset.hand, "off");
		assert.equal(document.documentElement.dataset.density, "compact");
		assert.equal(document.documentElement.classList.contains("dark"), true);

		assert.equal(window.localStorage.getItem(THEME_STORAGE_KEY), "dark");
		assert.equal(window.localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}paper`), "grid");
		assert.equal(window.localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}accent`), "rose");
		assert.equal(window.localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}userbubble`), "solid");
		assert.equal(window.localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}hand`), "off");
		assert.equal(window.localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}density`), "compact");
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

function AppliedAppearanceHarness() {
	const [appearance, setAppearance] = React.useState<AppearancePrefs>(DEFAULT_APPEARANCE);

	React.useEffect(() => {
		applyAppearance(appearance);
		writeAppearance(appearance);
	}, [appearance]);

	return (
		<AppearancePanel
			open
			value={appearance}
			onChange={(patch) => setAppearance((current) => mergeAppearance(current, patch))}
			onClose={noop}
		/>
	);
}
