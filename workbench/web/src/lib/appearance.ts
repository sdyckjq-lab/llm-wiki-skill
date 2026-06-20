export type ThemeMode = "light" | "dark";
export type PaperMode = "clean" | "grid" | "laid";
export type AccentMode = "terracotta" | "clay" | "amber" | "rose";
export type UserBubbleMode = "soft" | "solid";
export type HandMode = "on" | "off";
export type DensityMode = "cozy" | "compact";

export interface AppearancePrefs {
	theme: ThemeMode;
	paper: PaperMode;
	accent: AccentMode;
	userbubble: UserBubbleMode;
	hand: HandMode;
	density: DensityMode;
}

export const THEME_STORAGE_KEY = "llm-wiki-agent-theme";
export const APPEARANCE_STORAGE_PREFIX = "llm-wiki-agent-appearance-";

export const DEFAULT_APPEARANCE: AppearancePrefs = {
	theme: "light",
	paper: "clean",
	accent: "terracotta",
	userbubble: "soft",
	hand: "on",
	density: "cozy",
};

const fieldOptions = {
	theme: ["light", "dark"],
	paper: ["clean", "grid", "laid"],
	accent: ["terracotta", "clay", "amber", "rose"],
	userbubble: ["soft", "solid"],
	hand: ["on", "off"],
	density: ["cozy", "compact"],
} satisfies Record<keyof AppearancePrefs, readonly string[]>;

const appearanceStorageKeys = {
	paper: `${APPEARANCE_STORAGE_PREFIX}paper`,
	accent: `${APPEARANCE_STORAGE_PREFIX}accent`,
	userbubble: `${APPEARANCE_STORAGE_PREFIX}userbubble`,
	hand: `${APPEARANCE_STORAGE_PREFIX}hand`,
	density: `${APPEARANCE_STORAGE_PREFIX}density`,
} satisfies Record<Exclude<keyof AppearancePrefs, "theme">, string>;

function isAppearanceValue<Key extends keyof AppearancePrefs>(
	key: Key,
	value: string | null | undefined,
): value is AppearancePrefs[Key] {
	return typeof value === "string" && fieldOptions[key].includes(value);
}

function readStorageValue(key: keyof AppearancePrefs, value: string | null | undefined): string | undefined {
	return isAppearanceValue(key, value) ? value : undefined;
}

function getLocalStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function normalizeAppearancePrefs(input: Partial<Record<keyof AppearancePrefs, string | null | undefined>>): AppearancePrefs {
	return {
		theme: (readStorageValue("theme", input.theme) as ThemeMode | undefined) ?? DEFAULT_APPEARANCE.theme,
		paper: (readStorageValue("paper", input.paper) as PaperMode | undefined) ?? DEFAULT_APPEARANCE.paper,
		accent: (readStorageValue("accent", input.accent) as AccentMode | undefined) ?? DEFAULT_APPEARANCE.accent,
		userbubble: (readStorageValue("userbubble", input.userbubble) as UserBubbleMode | undefined) ?? DEFAULT_APPEARANCE.userbubble,
		hand: (readStorageValue("hand", input.hand) as HandMode | undefined) ?? DEFAULT_APPEARANCE.hand,
		density: (readStorageValue("density", input.density) as DensityMode | undefined) ?? DEFAULT_APPEARANCE.density,
	};
}

export function readAppearance(): AppearancePrefs {
	const storage = getLocalStorage();
	if (!storage) return DEFAULT_APPEARANCE;
	return normalizeAppearancePrefs({
		theme: storage.getItem(THEME_STORAGE_KEY),
		paper: storage.getItem(appearanceStorageKeys.paper),
		accent: storage.getItem(appearanceStorageKeys.accent),
		userbubble: storage.getItem(appearanceStorageKeys.userbubble),
		hand: storage.getItem(appearanceStorageKeys.hand),
		density: storage.getItem(appearanceStorageKeys.density),
	});
}

export function writeAppearance(prefs: AppearancePrefs): void {
	const storage = getLocalStorage();
	if (!storage) return;
	storage.setItem(THEME_STORAGE_KEY, prefs.theme);
	storage.setItem(appearanceStorageKeys.paper, prefs.paper);
	storage.setItem(appearanceStorageKeys.accent, prefs.accent);
	storage.setItem(appearanceStorageKeys.userbubble, prefs.userbubble);
	storage.setItem(appearanceStorageKeys.hand, prefs.hand);
	storage.setItem(appearanceStorageKeys.density, prefs.density);
}

export function applyAppearance(prefs: AppearancePrefs, root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement): void {
	if (!root) return;
	root.dataset.theme = prefs.theme;
	root.dataset.paper = prefs.paper;
	root.dataset.accent = prefs.accent;
	root.dataset.userbubble = prefs.userbubble;
	root.dataset.hand = prefs.hand;
	root.dataset.density = prefs.density;
	root.classList.toggle("dark", prefs.theme === "dark");
}

export function mergeAppearance(base: AppearancePrefs, patch: Partial<AppearancePrefs>): AppearancePrefs {
	return normalizeAppearancePrefs({ ...base, ...patch });
}
