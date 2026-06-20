export const DEFAULT_DRAWER_WIDTH = 420;
export const MIN_DRAWER_WIDTH = 320;
export const MIN_COMPOSER_WIDTH = 420;
export const CHAT_INPUT_HORIZONTAL_PADDING = 32;
export const MAX_DRAWER_RATIO = 0.7;
export const DRAWER_OVERLAY_BREAKPOINT = 900;
export const FULL_SIDEBAR_WIDTH = 252;
export const COMPACT_SIDEBAR_WIDTH = 252;
export const COLLAPSED_SIDEBAR_WIDTH = 52;
export const COMPACT_BREAKPOINT = 1024;

export function sidebarLayoutWidth(collapsed: boolean, viewportWidth: number): number {
	if (collapsed) return COLLAPSED_SIDEBAR_WIDTH;
	return viewportWidth <= COMPACT_BREAKPOINT ? COMPACT_SIDEBAR_WIDTH : FULL_SIDEBAR_WIDTH;
}

export function clampDrawerWidthForViewport(
	width: number,
	layout: {
		viewportWidth: number;
		sidebarWidth: number;
	},
): number {
	const viewportWidth = Math.max(0, layout.viewportWidth);
	const maxByViewport = Math.max(0, viewportWidth);
	if (viewportWidth <= DRAWER_OVERLAY_BREAKPOINT) {
		return clamp(width, Math.min(MIN_DRAWER_WIDTH, maxByViewport), maxByViewport);
	}

	const maxByRatio = Math.floor(viewportWidth * MAX_DRAWER_RATIO);
	const reservedMainWidth = MIN_COMPOSER_WIDTH + CHAT_INPUT_HORIZONTAL_PADDING;
	const maxByComposer = Math.max(0, viewportWidth - layout.sidebarWidth - reservedMainWidth);
	const maxWidth = Math.max(0, Math.min(maxByRatio, maxByComposer));
	const minWidth = Math.min(MIN_DRAWER_WIDTH, maxWidth);
	return clamp(width, minWidth, maxWidth);
}

function clamp(value: number, min: number, max: number): number {
	if (max <= min) return max;
	return Math.min(Math.max(value, min), max);
}
