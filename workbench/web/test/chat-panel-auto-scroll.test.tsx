import { fireEvent } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import { ChatPanel } from "../src/components/ChatPanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { changeText, click, pressKey, render, screen, waitFor } from "./render";

const originalFetch = globalThis.fetch;
let restoreScrollBox: (() => void) | null = null;

type ChatPanelProps = React.ComponentProps<typeof ChatPanel>;
type StreamEvent = { event: string; data: string };

afterEach(() => {
	restoreScrollBox?.();
	restoreScrollBox = null;
	globalThis.fetch = originalFetch;
});

describe("ChatPanel auto scroll", () => {
	it("scrolls to the bottom on existing messages and after a streamed reply when follow is active", async () => {
		installChatFetch([
			{ event: "text_delta", data: "第一段回复" },
			{ event: "done", data: "{}" },
		]);
		const scrollBox = installChatScrollerLayoutMock({
			clientHeight: 320,
			scrollHeight: 960,
			scrollTop: 0,
		});
		renderChatPanel({
			initialMessages: [
				{ id: "u1", role: "user", content: "第一条", tools: [] },
				{ id: "a1", role: "assistant", content: "第一条回复", tools: [] },
			],
		});

		const scroller = chatScroller();

		await waitFor(() => assert.equal(scroller.scrollTop, 640));

		scrollBox.update({ scrollHeight: 1280 });
		await changeText(screen.getByPlaceholderText(/写下想法/), "继续");
		await pressKey(screen.getByPlaceholderText(/写下想法/), "Enter", { metaKey: true });

		await waitFor(() => assert.equal(scroller.scrollTop, 960));
		assert.ok(scrollBox.calls.length >= 2);
		const assistantBubbles = screen.getAllByLabelText("助手气泡");
		assert.match(assistantBubbles.at(-1)?.textContent ?? "", /第一段回复/);
		assert.equal(screen.queryByRole("button", { name: "回到底部" }), null);
	});

	it("pauses follow when the user scrolls up and restores with the arrow button", async () => {
		const promptStream = createControlledSseStream();
		installChatFetch(promptStream.stream);
		const scrollBox = installChatScrollerLayoutMock({
			clientHeight: 300,
			scrollHeight: 1000,
			scrollTop: 700,
		});
		renderChatPanel({
			initialMessages: [
				{ id: "u1", role: "user", content: "历史问题", tools: [] },
				{ id: "a1", role: "assistant", content: "历史回答", tools: [] },
			],
		});

		const scroller = chatScroller();

		scrollBox.update({ scrollHeight: 1300 });
		await changeText(screen.getByPlaceholderText(/写下想法/), "继续展开");
		await pressKey(screen.getByPlaceholderText(/写下想法/), "Enter", { metaKey: true });
		await waitFor(() => assert.equal(scroller.scrollTop, 1000));

		scroller.scrollTop = 120;
		fireEvent.scroll(scroller);
		const returnButton = await screen.findByRole("button", { name: "回到底部" });
		assert.equal(returnButton.textContent, "");

		scrollBox.update({ scrollHeight: 1500 });
		promptStream.send({ event: "text_delta", data: "新的长回复" });
		promptStream.send({ event: "done", data: "{}" });
		promptStream.close();

		await waitFor(() => {
			const assistantBubbles = screen.getAllByLabelText("助手气泡");
			assert.match(assistantBubbles.at(-1)?.textContent ?? "", /新的长回复/);
		});
		assert.equal(scroller.scrollTop, 120);
		assert.ok(screen.getByRole("button", { name: "回到底部" }));

		await click(screen.getByRole("button", { name: "回到底部" }));

		await waitFor(() => assert.equal(scroller.scrollTop, 1200));
		assert.equal(screen.queryByRole("button", { name: "回到底部" }), null);
	});

	it("restores follow when the user manually scrolls back near the bottom", async () => {
		const promptStream = createControlledSseStream();
		installChatFetch(promptStream.stream);
		const scrollBox = installChatScrollerLayoutMock({
			clientHeight: 300,
			scrollHeight: 1300,
			scrollTop: 1000,
		});
		renderChatPanel({
			initialMessages: [
				{ id: "u1", role: "user", content: "历史问题", tools: [] },
				{ id: "a1", role: "assistant", content: "历史回答", tools: [] },
			],
		});

		const scroller = chatScroller();
		await changeText(screen.getByPlaceholderText(/写下想法/), "继续展开");
		await pressKey(screen.getByPlaceholderText(/写下想法/), "Enter", { metaKey: true });
		await waitFor(() => assert.equal(scroller.scrollTop, 1000));

		scroller.scrollTop = 200;
		fireEvent.scroll(scroller);
		assert.ok(await screen.findByRole("button", { name: "回到底部" }));

		scroller.scrollTop = 960;
		fireEvent.scroll(scroller);
		await waitFor(() => assert.equal(screen.queryByRole("button", { name: "回到底部" }), null));

		scrollBox.update({ scrollHeight: 1600 });
		promptStream.send({ event: "text_delta", data: "继续增长的回复" });
		promptStream.close();

		await waitFor(() => assert.equal(scroller.scrollTop, 1300));
	});

	it("keeps the return-to-bottom control as a themed icon-only button", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.chat-input-area\s*\{[\s\S]*position:\s*relative/);
		assert.match(css, /\.chat-scroll-bottom\s*\{/);
		assert.match(css, /\.chat-scroll-bottom[\s\S]*justify-content:\s*center/);
		assert.match(css, /\.chat-scroll-bottom-btn\s*\{/);
		assert.match(css, /\.chat-scroll-bottom-btn[\s\S]*border-radius:\s*999px/);
		assert.match(css, /\.chat-scroll-bottom-btn[\s\S]*var\(--app-surface\)/);
		assert.match(css, /\.chat-scroll-bottom-btn[\s\S]*box-shadow/);
		assert.match(css, /\.chat-scroll-bottom-btn:hover\s*\{/);
		assert.match(css, /\.chat-scroll-bottom-btn:focus-visible\s*\{/);
	});
});

function renderChatPanel(props: Partial<ChatPanelProps> = {}) {
	return render(
		<TooltipProvider>
			<ChatPanel
				currentKnowledgeBaseName="AI学习知识库"
				currentKnowledgeBasePath="/kb"
				initialMessages={[]}
				{...props}
			/>
		</TooltipProvider>,
	);
}

function chatScroller(): HTMLDivElement {
	const element = document.querySelector(".chat-messages");
	assert.ok(element instanceof HTMLElement);
	return element as HTMLDivElement;
}

function installChatScrollerLayoutMock(
	initialMetrics: { clientHeight: number; scrollHeight: number; scrollTop: number },
) {
	const metrics = { ...initialMetrics };
	const calls: number[] = [];
	const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
	const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
	const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
	const originalScrollTo = HTMLElement.prototype.scrollTo as ((...args: unknown[]) => void) | undefined;
	const isChatScroller = (element: Element) =>
		element instanceof HTMLElement && element.classList.contains("chat-messages");

	Object.defineProperty(HTMLElement.prototype, "clientHeight", {
		configurable: true,
		get() {
			if (isChatScroller(this)) return metrics.clientHeight;
			return originalClientHeight?.get?.call(this) ?? 0;
		},
	});
	Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
		configurable: true,
		get() {
			if (isChatScroller(this)) return metrics.scrollHeight;
			return originalScrollHeight?.get?.call(this) ?? 0;
		},
	});
	Object.defineProperty(HTMLElement.prototype, "scrollTop", {
		configurable: true,
		get() {
			if (isChatScroller(this)) return metrics.scrollTop;
			return originalScrollTop?.get?.call(this) ?? 0;
		},
		set(value: number) {
			if (isChatScroller(this)) {
				metrics.scrollTop = value;
				return;
			}
			originalScrollTop?.set?.call(this, value);
		},
	});
	HTMLElement.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number, y?: number) {
		if (!isChatScroller(this)) {
			originalScrollTo?.call(this, options, y);
			return;
		}
		const top = typeof options === "number" ? y ?? options : options?.top ?? metrics.scrollTop;
		const nextTop = clampScrollTop(Number(top), metrics);
		calls.push(nextTop);
		metrics.scrollTop = nextTop;
	};

	const restore = () => {
		restoreDescriptor(HTMLElement.prototype, "clientHeight", originalClientHeight);
		restoreDescriptor(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
		restoreDescriptor(HTMLElement.prototype, "scrollTop", originalScrollTop);
		if (originalScrollTo) HTMLElement.prototype.scrollTo = originalScrollTo as typeof HTMLElement.prototype.scrollTo;
		else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
	};
	restoreScrollBox = restore;
	return {
		calls,
		metrics,
		restore,
		update(nextMetrics: Partial<typeof metrics>) {
			Object.assign(metrics, nextMetrics);
		},
	};
}

function clampScrollTop(
	top: number,
	metrics: { clientHeight: number; scrollHeight: number; scrollTop: number },
) {
	if (!Number.isFinite(top)) return metrics.scrollTop;
	return Math.max(0, Math.min(top, Math.max(0, metrics.scrollHeight - metrics.clientHeight)));
}

function restoreDescriptor(
	prototype: HTMLElement,
	key: "clientHeight" | "scrollHeight" | "scrollTop",
	descriptor: PropertyDescriptor | undefined,
) {
	if (descriptor) Object.defineProperty(prototype, key, descriptor);
	else Reflect.deleteProperty(prototype, key);
}

function installChatFetch(eventsOrStream: StreamEvent[] | ReadableStream<Uint8Array>) {
	globalThis.fetch = (async (input) => {
		const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
		if (url.includes("/api/commands")) {
			return jsonResponse({ ok: true, items: [] });
		}
		if (url.includes("/api/prompt")) {
			const body = Array.isArray(eventsOrStream) ? sseStream(eventsOrStream) : eventsOrStream;
			return new Response(body, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		}
		return jsonResponse({ ok: true });
	}) as typeof fetch;
}

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function sseStream(events: StreamEvent[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const item of events) {
				controller.enqueue(encoder.encode(`event: ${item.event}\ndata: ${item.data}\n\n`));
			}
			controller.close();
		},
	});
}

function createControlledSseStream() {
	const encoder = new TextEncoder();
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	return {
		stream: new ReadableStream<Uint8Array>({
			start(activeController) {
				controller = activeController;
			},
		}),
		send(item: StreamEvent) {
			assert.ok(controller);
			controller.enqueue(encoder.encode(`event: ${item.event}\ndata: ${item.data}\n\n`));
		},
		close() {
			assert.ok(controller);
			controller.close();
		},
	};
}
