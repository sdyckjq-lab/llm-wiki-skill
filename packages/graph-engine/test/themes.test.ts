import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCommunityColor,
  getThemeTokens,
  parseCssTokens,
  themeTokensToCssVars
} from "../src/themes";

describe("parseCssTokens", () => {
  it("extracts CSS custom properties from a root declaration block", () => {
    const tokens = parseCssTokens(`
      color-scheme: light;
      --bg: #f4efe4;
      --surface: #fffdf7;
      --font-ui: "Noto Sans SC", sans-serif;
      color: black;
    `);

    assert.deepEqual(tokens, {
      "--bg": "#f4efe4",
      "--surface": "#fffdf7",
      "--font-ui": "\"Noto Sans SC\", sans-serif"
    });
  });

  it("ignores malformed and non-token declarations", () => {
    const tokens = parseCssTokens("not-a-token; color: red; --ink: #241f1a;");
    assert.deepEqual(tokens, { "--ink": "#241f1a" });
  });
});

describe("theme tokens", () => {
  it("keeps the shan-shui tokens from header.html", () => {
    const theme = getThemeTokens("shan-shui");
    assert.equal(theme.colorScheme, "light");
    assert.equal(theme.vars["--bg"], "#f4efe4");
    assert.equal(theme.vars["--surface"], "#fffdf7");
    assert.equal(theme.vars["--cinnabar"], "#8b2e24");
    assert.equal(theme.vars["--night"], "#315f72");
    assert.equal(theme.communityColors[0], "#dd9c82");
  });

  it("provides a mo-ye dark theme with the same token surface", () => {
    const shanShui = themeTokensToCssVars("shan-shui");
    const moYe = themeTokensToCssVars("mo-ye");

    assert.equal(getThemeTokens("mo-ye").colorScheme, "dark");
    assert.equal(moYe["--bg"], "#0d0f0e");
    assert.equal(moYe["--ink"], "#f5f0e6");
    assert.equal(moYe["--line"], "#8e8778");
    assert.equal(moYe["--cinnabar"], "#e45d4a");
    assert.equal(moYe["--night"], "#a9bfcb");
    assert.deepEqual(Object.keys(moYe).sort(), Object.keys(shanShui).sort());
  });

  it("cycles community colors deterministically", () => {
    assert.equal(getCommunityColor("shan-shui", 0), "#dd9c82");
    assert.equal(getCommunityColor("shan-shui", 9), "#dd9c82");
    assert.equal(getCommunityColor("mo-ye", 1), "#a9bfcb");
  });
});
