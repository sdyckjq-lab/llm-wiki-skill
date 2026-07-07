import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderHook, act } from "@testing-library/react";

import { useDrawerExitRail } from "../src/lib/use-drawer-exit-rail";
import { wikiDrawer } from "../src/lib/drawer-state";

describe("useDrawerExitRail", () => {
	it("stages an exit snapshot and reports exiting only while the drawer reference matches", () => {
		const drawer = wikiDrawer("wiki/a.md");
		const { result } = renderHook(() => useDrawerExitRail());

		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(result.current.exitSnapshot, null);
		assert.equal(result.current.isExiting, false);

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.stage(drawer));
		assert.equal(result.current.drawer, drawer);
		assert.equal(result.current.exitSnapshot, drawer);
		assert.equal(result.current.isExiting, true);
		assert.equal(result.current.isProtected(drawer), true);

		act(() => result.current.stage(null));
		assert.equal(result.current.exitSnapshot, null);
		assert.equal(result.current.isExiting, false);
	});

	it("clears the snapshot in the same state update when the drawer changes", () => {
		const drawerA = wikiDrawer("wiki/a.md");
		const drawerB = wikiDrawer("wiki/b.md");
		const { result } = renderHook(() => useDrawerExitRail());

		act(() => result.current.setDrawer(drawerA));
		act(() => result.current.stage(drawerA));
		assert.equal(result.current.isExiting, true);

		act(() => result.current.setDrawer(drawerB));
		assert.equal(result.current.drawer, drawerB);
		assert.equal(result.current.exitSnapshot, null);
		assert.equal(result.current.isExiting, false);
	});

	it("keeps the snapshot when a guarded updater preserves the drawer reference", () => {
		const drawer = wikiDrawer("wiki/a.md");
		const { result } = renderHook(() => useDrawerExitRail());

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.stage(drawer));
		act(() => result.current.setDrawer((current) => (
			result.current.isProtected(current) ? current : wikiDrawer("wiki/b.md")
		)));

		assert.equal(result.current.drawer, drawer);
		assert.equal(result.current.exitSnapshot, drawer);
		assert.equal(result.current.isExiting, true);
	});

	it("keeps the snapshot when staging and preserving the same drawer in one transition", () => {
		const drawer = wikiDrawer("wiki/a.md");
		const { result } = renderHook(() => useDrawerExitRail());

		act(() => result.current.setDrawer(drawer));
		act(() => {
			result.current.stage(drawer);
			result.current.setDrawer(drawer);
		});

		assert.equal(result.current.drawer, drawer);
		assert.equal(result.current.exitSnapshot, drawer);
		assert.equal(result.current.isExiting, true);
	});

	it("complete closes the drawer and clears the snapshot", () => {
		const drawer = wikiDrawer("wiki/a.md");
		const { result } = renderHook(() => useDrawerExitRail());

		act(() => result.current.setDrawer(drawer));
		act(() => result.current.stage(drawer));
		act(() => result.current.complete());

		assert.equal(result.current.drawer.mode, "closed");
		assert.equal(result.current.exitSnapshot, null);
	});
});
