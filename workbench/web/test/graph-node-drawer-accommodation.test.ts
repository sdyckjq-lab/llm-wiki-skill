import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	graphDrawerOverlayActive,
	shouldAccommodateNodeDrawer
} from "../src/lib/graph-node-drawer-accommodation";

// #122：社区单击节点打开右侧详情抽屉时的镜头让位策略。只有宽屏并排抽屉（画布变窄）
// 才让位；窄屏覆盖抽屉和全屏阅读面板都不动镜头。reduced motion 由引擎层 moveSigmaCamera
// 处理（直跳保持节点可见），不在这里决策。
describe("graph node drawer camera accommodation policy", () => {
	it("accommodates on a widescreen side-by-side drawer", () => {
		assert.equal(shouldAccommodateNodeDrawer({ overlay: false, drawerFullscreen: false }), true);
	});

	it("does not accommodate when the drawer overlays the canvas (narrow screen)", () => {
		assert.equal(shouldAccommodateNodeDrawer({ overlay: true, drawerFullscreen: false }), false);
	});

	it("does not accommodate when the reader is fullscreen", () => {
		assert.equal(shouldAccommodateNodeDrawer({ overlay: false, drawerFullscreen: true }), false);
	});

	it("does not accommodate when both overlay and fullscreen are active", () => {
		assert.equal(shouldAccommodateNodeDrawer({ overlay: true, drawerFullscreen: true }), false);
	});

	it("reads the narrow-screen overlay breakpoint from matchMedia", () => {
		assert.equal(graphDrawerOverlayActive({
			matchMedia: () => ({ matches: true }) as unknown as MediaQueryList
		} as unknown as Window), true);

		assert.equal(graphDrawerOverlayActive({
			matchMedia: () => ({ matches: false }) as unknown as MediaQueryList
		} as unknown as Window), false);
	});

	it("treats a missing window as widescreen (no overlay)", () => {
		assert.equal(graphDrawerOverlayActive(undefined), false);
	});
});
