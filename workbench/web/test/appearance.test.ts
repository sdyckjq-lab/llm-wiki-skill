import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	DEFAULT_APPEARANCE,
	mergeAppearance,
	normalizeAppearancePrefs,
	readAppearance,
} from "../src/lib/appearance";

const CSS = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");
const THEME_SELECTOR_LIGHT = ':root,\\s*\\[data-theme="light"\\]';
const THEME_SELECTOR_DARK = '\\.dark,\\s*\\[data-theme="dark"\\]';

const PAPER_THEME_TOKEN_NAMES = [
	"--app-bg",
	"--app-surface",
	"--app-raised",
	"--app-fg",
	"--app-muted",
	"--app-faint",
	"--app-border",
	"--app-border-strong",
	"--app-accent",
	"--app-accent-deep",
	"--app-user",
	"--app-accent-soft",
	"--app-hover",
	"--app-success",
	"--app-warn",
	"--app-danger",
	"--comm-attn",
	"--comm-seq",
	"--comm-ssm",
] as const;

const PAPER_LIGHT_TOKENS = {
	"--app-bg": "#fdfaf2",
	"--app-surface": "#fffdf7",
	"--app-raised": "#f4ede0",
	"--app-fg": "#3a3530",
	"--app-muted": "#8a8175",
	"--app-faint": "#b3a48c",
	"--app-border": "#ece3d2",
	"--app-border-strong": "#f0e6d4",
	"--app-accent": "#e07a5f",
	"--app-accent-deep": "#c0573f",
	"--app-user": "var(--app-accent)",
	"--app-accent-soft": "#fff1ef",
	"--app-hover": "rgba(224, 122, 95, 0.06)",
	"--app-success": "#7ea868",
	"--app-warn": "#c98e3a",
	"--app-danger": "#c0573f",
	"--comm-attn": "#e9b9a6",
	"--comm-seq": "#bcd0a8",
	"--comm-ssm": "#c7c0a0",
};

const PAPER_DARK_TOKENS = {
	"--app-bg": "#211c16",
	"--app-surface": "#2a241d",
	"--app-raised": "#332a22",
	"--app-fg": "#ece4d4",
	"--app-muted": "#a89a82",
	"--app-faint": "#7d7060",
	"--app-border": "#3a3026",
	"--app-border-strong": "#4a3d30",
	"--app-accent": "#e8826a",
	"--app-accent-deep": "#f09680",
	"--app-user": "var(--app-accent)",
	"--app-accent-soft": "rgba(224, 122, 95, 0.16)",
	"--app-hover": "rgba(224, 122, 95, 0.1)",
	"--app-success": "#8eb074",
	"--app-warn": "#d9a857",
	"--app-danger": "#d4634a",
	"--comm-attn": "rgba(233, 185, 166, 0.24)",
	"--comm-seq": "rgba(188, 208, 168, 0.24)",
	"--comm-ssm": "rgba(199, 192, 160, 0.24)",
};

const PAPER_ACCENT_NAMES = ["terracotta", "clay", "amber", "rose"] as const;
type PaperAccentName = typeof PAPER_ACCENT_NAMES[number];

const PAPER_ACCENT_VALUES: Record<PaperAccentName, { accent: string; deep: string }> = {
	terracotta: { accent: "#e07a5f", deep: "#c0573f" },
	clay: { accent: "#cf6a48", deep: "#a8492c" },
	amber: { accent: "#d6913f", deep: "#b06c20" },
	rose: { accent: "#d36f72", deep: "#b14a4d" },
};

const PAPER_ACCENT_TOKENS = Object.fromEntries(
	PAPER_ACCENT_NAMES.map((name) => {
		const accent = PAPER_ACCENT_VALUES[name];
		return [name, accentExpectation(accent.accent, accent.deep)];
	}),
);

const PAPER_SWATCH_BACKGROUNDS = Object.fromEntries(
	PAPER_ACCENT_NAMES.map((name) => [name, PAPER_ACCENT_VALUES[name].accent]),
);

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

	it("keeps the final Paper theme tokens aligned with the Paper v2 prototype", () => {
		assert.equal(countTokenBlocks(CSS, THEME_SELECTOR_LIGHT, "--app-bg"), 1);
		assert.equal(countTokenBlocks(CSS, THEME_SELECTOR_DARK, "--app-bg"), 1);

		const lightTheme = latestBlockFor(CSS, THEME_SELECTOR_LIGHT);
		const darkTheme = latestBlockFor(CSS, THEME_SELECTOR_DARK);

		assert.deepEqual(readLatestTokenValues(lightTheme, PAPER_THEME_TOKEN_NAMES), PAPER_LIGHT_TOKENS);
		assert.deepEqual(readLatestTokenValues(darkTheme, PAPER_THEME_TOKEN_NAMES), PAPER_DARK_TOKENS);
		assert.deepEqual(readLatestScopedAccentTokens(CSS), PAPER_ACCENT_TOKENS);
	});

	it("uses the Paper v2 accent palette throughout visible controls", () => {
		assert.deepEqual(readSwatchBackgrounds(CSS), PAPER_SWATCH_BACKGROUNDS);

		assert.deepEqual(readLatestTokenValues(latestBlockWithTokenFor(CSS, "\\.topbar-text-action", "background"), [
			"border-color",
			"background",
			"color",
		]), {
			"border-color": "transparent",
			"background": "var(--app-accent)",
			"color": "#fff",
		});
		assert.deepEqual(readLatestTokenValues(latestBlockFor(CSS, "\\.topbar-text-action:hover:not\\(:disabled\\)"), [
			"border-color",
			"background",
			"color",
		]), {
			"border-color": "transparent",
			"background": "var(--app-accent-deep)",
			"color": "#fff",
		});

		assert.deepEqual(readLatestTokenValues(latestBlockFor(CSS, "\\.msg-row-user \\.msg-content"), [
			"border-color",
			"background",
			"color",
		]), {
			"border-color": "color-mix(in srgb, var(--app-accent) 28%, transparent)",
			"background": "var(--app-accent-soft)",
			"color": "var(--app-accent-deep)",
		});
		assert.deepEqual(readLatestTokenValues(latestBlockFor(CSS, '\\[data-userbubble="solid"\\] \\.msg-row-user \\.msg-content'), [
			"border-color",
			"background",
			"color",
		]), {
			"border-color": "transparent",
			"background": "var(--app-user)",
			"color": "#fff",
		});
	});
});

function accentExpectation(accent: string, deep: string) {
	return {
		"--app-accent": accent,
		"--app-accent-deep": deep,
		"--app-user": "var(--app-accent)",
		"--app-accent-soft": "color-mix(in srgb, var(--app-accent) 13%, var(--card))",
	};
}

function latestBlockFor(css: string, selectorPattern: string) {
	return blocksFor(css, selectorPattern).at(-1) ?? "";
}

function latestBlockWithTokenFor(css: string, selectorPattern: string, name: string) {
	return blocksFor(css, selectorPattern)
		.filter((block) => block.includes(`${name}:`))
		.at(-1) ?? "";
}

function countTokenBlocks(css: string, selectorPattern: string, name: string) {
	return blocksFor(css, selectorPattern).filter((block) => block.includes(`${name}:`)).length;
}

function blocksFor(css: string, selectorPattern: string) {
	return Array.from(css.matchAll(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`, "g")), (match) => match[1] ?? "");
}

function readLatestTokenValues(css: string, names: readonly string[]) {
	const values: Record<string, string> = {};
	for (const name of names) {
		const matches = Array.from(css.matchAll(new RegExp(`${escapeRegExp(name)}:\\s*([^;]+);`, "g")));
		values[name] = matches.at(-1)?.[1]?.trim() ?? "";
	}
	return values;
}

function readLatestScopedAccentTokens(css: string) {
	const result: Record<string, Record<string, string>> = {};
	for (const accent of PAPER_ACCENT_NAMES) {
		const pattern = new RegExp(`\\[data-accent="${accent}"\\]\\s*\\{([\\s\\S]*?)\\}`, "g");
		const blocks = Array.from(css.matchAll(pattern));
		const block = blocks.at(-1)?.[1] ?? "";
		result[accent] = readLatestTokenValues(block, ["--app-accent", "--app-accent-deep", "--app-user", "--app-accent-soft"]);
	}
	return result;
}

function readSwatchBackgrounds(css: string) {
	const result: Record<string, string> = {};
	for (const accent of PAPER_ACCENT_NAMES) {
		const block = latestBlockFor(css, `\\.appearance-swatch-${accent}`);
		result[accent] = readLatestTokenValues(block, ["background"]).background;
	}
	return result;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
