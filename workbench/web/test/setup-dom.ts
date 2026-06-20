import { afterEach, beforeEach } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
	pretendToBeVisual: true,
	url: "http://localhost:5180/",
});

const { window } = dom;

Object.defineProperties(globalThis, {
	window: { configurable: true, value: window },
	document: { configurable: true, value: window.document },
	navigator: { configurable: true, value: window.navigator },
	localStorage: { configurable: true, value: window.localStorage },
	sessionStorage: { configurable: true, value: window.sessionStorage },
	HTMLElement: { configurable: true, value: window.HTMLElement },
	HTMLButtonElement: { configurable: true, value: window.HTMLButtonElement },
	HTMLInputElement: { configurable: true, value: window.HTMLInputElement },
	HTMLTextAreaElement: { configurable: true, value: window.HTMLTextAreaElement },
	Node: { configurable: true, value: window.Node },
	Event: { configurable: true, value: window.Event },
	KeyboardEvent: { configurable: true, value: window.KeyboardEvent },
	MouseEvent: { configurable: true, value: window.MouseEvent },
	CustomEvent: { configurable: true, value: window.CustomEvent },
	MutationObserver: { configurable: true, value: window.MutationObserver },
	React: { configurable: true, value: React },
	getComputedStyle: { configurable: true, value: window.getComputedStyle.bind(window) },
	requestAnimationFrame: {
		configurable: true,
		value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0),
	},
	cancelAnimationFrame: {
		configurable: true,
		value: (id: number) => window.clearTimeout(id),
	},
});

class TestResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
	configurable: true,
	value: TestResizeObserver,
});

const { cleanup } = await import("@testing-library/react");

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	window.document.body.innerHTML = "";
	const root = window.document.documentElement;
	root.className = "";
	for (const key of Object.keys(root.dataset)) {
		delete root.dataset[key];
	}
});

afterEach(() => {
	cleanup();
});
