import type { ThemeId } from "../types";

export interface ThemeTokens {
  id: ThemeId;
  colorScheme: "light" | "dark";
  vars: Record<string, string>;
  communityColors: string[];
}

function paperMottleDataUri(colorMatrix: string): string {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='620' height='620'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.014' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='${colorMatrix}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E")`;
}

const SHAN_SHUI_ROOT = `
  color-scheme: light;
  --bg: #f4efe4;
  --surface: #fffdf7;
  --surface-2: #f8f1e4;
  --vellum: #e9ddc9;
  --mist: #ece5d8;
  --ink: #241f1a;
  --muted: #6f6559;
  --faint: #9b8f7e;
  --rule: #d8cdbb;
  --line: #cfc4b1;
  --cinnabar: #8b2e24;
  --cinnabar-2: #a23b2a;
  --jade: #4b7564;
  --green: #3e6b4b;
  --night: #315f72;
  --amber: #b7791f;
  --violet: #6f557f;
  --shadow: 0 18px 36px rgba(36, 31, 26, .11);
  --soft-shadow: 0 10px 24px rgba(36, 31, 26, .08);
  --radius: 12px;
  --paper-glow: radial-gradient(140% 95% at 50% -25%, rgba(255, 251, 240, .7), rgba(255, 251, 240, 0) 55%);
  --paper-vignette: radial-gradient(ellipse 105% 92% at 50% 40%, rgba(255, 255, 255, 0) 52%, rgba(120, 98, 70, .05) 100%);
  --paper-mottle: ${paperMottleDataUri("0 0 0 0 0.55 0 0 0 0 0.45 0 0 0 0 0.33 0 0 0 0.13 0")};
  --font-serif: "Noto Serif SC", "Songti SC", "STSong", Georgia, serif;
  --font-ui: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
`;

const MO_YE_ROOT = `
  color-scheme: dark;
  --bg: #0d0f0e;
  --surface: #181a18;
  --surface-2: #21231f;
  --vellum: #2c2d28;
  --mist: #20241f;
  --ink: #f5f0e6;
  --muted: #c6bbab;
  --faint: #8f8677;
  --rule: #3b3932;
  --line: #8e8778;
  --cinnabar: #e45d4a;
  --cinnabar-2: #ff8066;
  --jade: #8ab6a2;
  --green: #8bae78;
  --night: #a9bfcb;
  --amber: #e0b35e;
  --violet: #c1a8d5;
  --shadow: 0 22px 44px rgba(0, 0, 0, .48);
  --soft-shadow: 0 12px 28px rgba(0, 0, 0, .36);
  --radius: 12px;
  --paper-glow: radial-gradient(140% 95% at 50% -25%, rgba(40, 46, 42, .55), rgba(40, 46, 42, 0) 55%);
  --paper-vignette: radial-gradient(ellipse 105% 92% at 50% 40%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, .22) 100%);
  --paper-mottle: ${paperMottleDataUri("0 0 0 0 0.7 0 0 0 0 0.72 0 0 0 0 0.68 0 0 0 0.1 0")};
  --font-serif: "Noto Serif SC", "Songti SC", "STSong", Georgia, serif;
  --font-ui: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
`;

export function parseCssTokens(cssText: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawDeclaration of cssText.split(";")) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 1) continue;
    const key = declaration.slice(0, separatorIndex).trim();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!key.startsWith("--") || !value) continue;
    out[key] = value;
  }
  return out;
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  "shan-shui": {
    id: "shan-shui",
    colorScheme: "light",
    vars: parseCssTokens(SHAN_SHUI_ROOT),
    communityColors: ["#dd9c82", "#8fb0c9", "#a6c187", "#d8b563", "#b9a3cf", "#8ec4b3", "#cda37e", "#d9a0ad", "#bdb389"]
  },
  "mo-ye": {
    id: "mo-ye",
    colorScheme: "dark",
    vars: parseCssTokens(MO_YE_ROOT),
    communityColors: ["#e45d4a", "#a9bfcb", "#8ab6a2", "#e0b35e", "#c1a8d5", "#8bae78", "#d19966", "#aeb8e4"]
  }
};

export function getThemeTokens(theme: ThemeId): ThemeTokens {
  return THEMES[theme] || THEMES["shan-shui"];
}

export function themeTokensToCssVars(theme: ThemeId | ThemeTokens): Record<string, string> {
  const tokens = typeof theme === "string" ? getThemeTokens(theme) : theme;
  return { ...tokens.vars };
}

export function getCommunityColor(theme: ThemeId | ThemeTokens, index: number): string {
  const tokens = typeof theme === "string" ? getThemeTokens(theme) : theme;
  const palette = tokens.communityColors.length ? tokens.communityColors : THEMES["shan-shui"].communityColors;
  return palette[Math.abs(Math.trunc(index)) % palette.length];
}
