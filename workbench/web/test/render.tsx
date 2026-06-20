import React from "react";
import {
	fireEvent,
	render as renderWithTestingLibrary,
	screen,
	waitFor,
	within,
	type RenderOptions,
} from "@testing-library/react";

export { screen, waitFor, within };

export function render(ui: React.ReactElement, options?: RenderOptions) {
	return renderWithTestingLibrary(ui, options);
}

export async function click(element: Element) {
	fireEvent.pointerDown(element);
	fireEvent.mouseDown(element);
	fireEvent.pointerUp(element);
	fireEvent.mouseUp(element);
	fireEvent.click(element);
	await flushMicrotasks();
}

export async function pressKey(element: Element | Document, key: string, init: KeyboardEventInit = {}) {
	fireEvent.keyDown(element, { key, code: init.code ?? key, ...init });
	await flushMicrotasks();
}

export async function changeText(element: HTMLElement, value: string) {
	fireEvent.change(element, { target: { value } });
	await flushMicrotasks();
}

export async function flushMicrotasks() {
	await Promise.resolve();
}
