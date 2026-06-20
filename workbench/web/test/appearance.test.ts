import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	DEFAULT_APPEARANCE,
	mergeAppearance,
	normalizeAppearancePrefs,
	readAppearance,
} from "../src/lib/appearance";

describe("appearance preferences", () => {
	it("defaults to light Paper preferences when storage is unavailable", () => {
		assert.deepEqual(readAppearance(), DEFAULT_APPEARANCE);
	});

	it("normalizes known values and ignores invalid stored values", () => {
		assert.deepEqual(normalizeAppearancePrefs({
			theme: "dark",
			paper: "grid",
			accent: "amber",
			userbubble: "solid",
			hand: "off",
			density: "compact",
		}), {
			theme: "dark",
			paper: "grid",
			accent: "amber",
			userbubble: "solid",
			hand: "off",
			density: "compact",
		});

		assert.deepEqual(normalizeAppearancePrefs({
			theme: "system",
			paper: "linen",
			accent: "blue",
			userbubble: "outline",
			hand: "maybe",
			density: "tiny",
		}), DEFAULT_APPEARANCE);
	});

	it("merges partial updates without accepting unknown values", () => {
		assert.deepEqual(mergeAppearance(DEFAULT_APPEARANCE, {
			theme: "dark",
			userbubble: "solid",
			density: "compact",
		}), {
			...DEFAULT_APPEARANCE,
			theme: "dark",
			userbubble: "solid",
			density: "compact",
		});
	});
});
