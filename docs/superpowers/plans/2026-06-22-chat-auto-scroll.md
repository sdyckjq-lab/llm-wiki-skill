# Chat Auto Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat panel automatically follow new replies when the user is near the bottom, pause when the user scrolls up, and provide a themed Codex-like down-arrow button to return to the latest message.

**Architecture:** Keep the behavior local to `ChatPanel`: track whether the scroll container should follow the bottom, react to message height changes, and expose a small icon-only recovery button when auto-follow is paused. Tests drive the behavior through the existing DOM test harness and mocked SSE responses; styling stays in the existing Paper UI CSS.

**Tech Stack:** React 19, TypeScript, lucide-react, Testing Library, Node test runner, JSDOM, existing `streamPrompt`/SSE frontend API.

---

## Spec Source

- Design spec: `docs/spark/2026-06-22-chat-auto-scroll-design.md`
- Worktree: `/Users/kangjiaqi/Desktop/project/llm-wiki-skill/.worktrees/fix-chat-auto-scroll`
- Branch: `codex/fix-chat-auto-scroll`

## Scope Check

This spec covers one subsystem: the chat panel's message scroll behavior. It does not require backend changes, session storage changes, graph changes, export changes, or layout rewrites.

## File Structure

- `workbench/web/src/components/ChatPanel.tsx`
  - Owns chat messages, streaming updates, input handling, and the new scroll-follow state.
  - Will gain a scroll container ref, bottom-distance helpers, auto-follow restoration, and the icon-only down-arrow button.
- `workbench/web/src/index.css`
  - Owns Paper UI styling.
  - Will gain the floating down-arrow button style and make `.chat-input-area` the button's positioning anchor.
- `workbench/web/test/chat-panel-auto-scroll.test.tsx`
  - New DOM tests for auto-follow, layout-effect-safe scroll metrics, user scroll pause, manual bottom restore, button restore, and CSS contract.
  - Uses mocked `/api/commands` and `/api/prompt` fetch responses.

## Implementation Tasks

### Task 1: Auto-Follow Existing and New Messages

**Files:**
- Create: `workbench/web/test/chat-panel-auto-scroll.test.tsx`
- Modify: `workbench/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: Create the failing auto-follow test**

Create `workbench/web/test/chat-panel-auto-scroll.test.tsx` with this content:

```tsx
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { ChatPanel } from "../src/components/ChatPanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { changeText, pressKey, render, screen, waitFor } from "./render";

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
	assert.ok(element instanceof HTMLDivElement);
	return element;
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

function installChatFetch(events: StreamEvent[]) {
	globalThis.fetch = (async (input) => {
		const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
		if (url.includes("/api/commands")) {
			return jsonResponse({ ok: true, items: [] });
		}
		if (url.includes("/api/prompt")) {
			return new Response(sseStream(events), {
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run from the repository root:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: FAIL. The important assertion failure is that `.chat-messages.scrollTop` stays `0` instead of becoming `640`, because `ChatPanel` does not yet own a scroll ref or auto-follow effect. The test expects the browser-real maximum scroll position (`scrollHeight - clientHeight`), not the raw `scrollHeight`.

- [ ] **Step 3: Add the minimal auto-follow plumbing**

Modify the React import in `workbench/web/src/components/ChatPanel.tsx`:

```tsx
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
```

Add this constant near `type ToolMark`:

```tsx
const CHAT_BOTTOM_THRESHOLD_PX = 100;
```

Inside `ChatPanel`, immediately after the existing `sendPromptRef` declaration, add these refs and callbacks:

```tsx
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const followBottomRef = useRef(true);

	const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const element = messagesRef.current;
		if (!element) return;
		if (typeof element.scrollTo === "function") {
			element.scrollTo({ top: element.scrollHeight, behavior });
		} else {
			element.scrollTop = element.scrollHeight;
		}
	}, []);
```

Add this layout effect after the status summary effect. Use `useLayoutEffect` so the scroll position is corrected after React commits the new message DOM and before the browser paints it to the user:


```tsx
	useLayoutEffect(() => {
		if (messages.length === 0) {
			followBottomRef.current = true;
			return;
		}
		if (followBottomRef.current) scrollMessagesToBottom("auto");
	}, [messages, scrollMessagesToBottom]);
```

In `sendPrompt`, immediately before `setMessages((prev) => [...prev, userMsg, assistantMsg]);`, add:

```tsx
		followBottomRef.current = true;
```

Attach the ref to the scroll container:

```tsx
			<div className="chat-messages" ref={messagesRef}>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: PASS for `scrolls to the bottom on existing messages and after a streamed reply when follow is active`.

- [ ] **Step 5: Commit Task 1**

Run from the repository root:

```bash
git add workbench/web/src/components/ChatPanel.tsx workbench/web/test/chat-panel-auto-scroll.test.tsx
git commit -m "feat: auto-follow chat replies"
```

### Task 2: Pause Auto-Follow on User Scroll and Restore with Arrow Button

**Files:**
- Modify: `workbench/web/test/chat-panel-auto-scroll.test.tsx`
- Modify: `workbench/web/src/components/ChatPanel.tsx`

- [ ] **Step 1: Add the failing pause-and-restore test**

In `workbench/web/test/chat-panel-auto-scroll.test.tsx`, update the imports:

```tsx
import { fireEvent } from "@testing-library/react";
import { changeText, click, pressKey, render, screen, waitFor } from "./render";
```

Add this test inside the existing ChatPanel auto scroll `describe` block after the first test:

```tsx
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
```

Also update the fetch helpers at the bottom of the same test file.

Replace the existing `installChatFetch` function from Task 1 with this function:

```tsx
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
```

Add this controlled stream helper after `sseStream`:

```tsx
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: FAIL with Testing Library unable to find a button named `回到底部`, because no pause state or arrow button exists yet.

- [ ] **Step 3: Implement pause state, bottom detection, and restore button**

Modify the lucide import in `workbench/web/src/components/ChatPanel.tsx`:

```tsx
import { ArrowDown, Files, Send, Square, X } from "lucide-react";
```

Inside `ChatPanel`, add this state next to the other `useState` calls:

```tsx
	const [showScrollToBottom, setShowScrollToBottom] = useState(false);
```

After `scrollMessagesToBottom`, add these callbacks:

```tsx
	const isMessagesNearBottom = useCallback(() => {
		const element = messagesRef.current;
		if (!element) return true;
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		return distance <= CHAT_BOTTOM_THRESHOLD_PX;
	}, []);

	const handleMessagesScroll = useCallback(() => {
		const nearBottom = isMessagesNearBottom();
		followBottomRef.current = nearBottom;
		setShowScrollToBottom(messages.length > 0 && !nearBottom);
	}, [isMessagesNearBottom, messages.length]);

	const restoreAutoFollow = useCallback(() => {
		followBottomRef.current = true;
		setShowScrollToBottom(false);
		scrollMessagesToBottom("smooth");
	}, [scrollMessagesToBottom]);
```

Update the auto-follow effect from Task 1 so empty chats hide the button and followed chats clear it:

```tsx
	useLayoutEffect(() => {
		if (messages.length === 0) {
			followBottomRef.current = true;
			setShowScrollToBottom(false);
			return;
		}
		if (followBottomRef.current) {
			setShowScrollToBottom(false);
			scrollMessagesToBottom("auto");
		}
	}, [messages, scrollMessagesToBottom]);
```

In `sendPrompt`, immediately after `followBottomRef.current = true;`, add:

```tsx
		setShowScrollToBottom(false);
```

Update the scroll container:

```tsx
			<div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
```

Inside the existing `<div className="chat-input-area">` block, render the button before the artifact hints:

```tsx
				{showScrollToBottom && (
					<div className="chat-scroll-bottom">
						<button
							type="button"
							className="chat-scroll-bottom-btn"
							aria-label="回到底部"
							title="回到底部"
							onClick={restoreAutoFollow}
						>
							<ArrowDown className="size-4" aria-hidden="true" />
						</button>
					</div>
				)}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: PASS for the auto-follow test, the pause/button restore test, and the manual bottom-restore test.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add workbench/web/src/components/ChatPanel.tsx workbench/web/test/chat-panel-auto-scroll.test.tsx
git commit -m "feat: pause chat auto-follow on user scroll"
```

### Task 3: Style the Codex-Like Down Arrow Control

**Files:**
- Modify: `workbench/web/test/chat-panel-auto-scroll.test.tsx`
- Modify: `workbench/web/src/index.css`

- [ ] **Step 1: Add the failing CSS contract test**

Update imports in `workbench/web/test/chat-panel-auto-scroll.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

Add this test inside the same `describe` block:

```tsx
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: FAIL because `.chat-scroll-bottom` and `.chat-scroll-bottom-btn` do not exist in `index.css`.

- [ ] **Step 3: Add the button styles**

In `workbench/web/src/index.css`, update `.chat-input-area` by adding `position: relative;`:

```css
  .chat-input-area {
    position: relative;
    padding: 13px 16px 15px;
    border-top: 1px solid var(--app-border);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 82%, transparent), color-mix(in srgb, var(--app-surface) 74%, var(--app-bg))),
      var(--paper-grain);
  }
```

Add these styles immediately after `.chat-input-area`:

```css
  .chat-scroll-bottom {
    position: absolute;
    z-index: 20;
    top: -52px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .chat-scroll-bottom-btn {
    pointer-events: auto;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--app-surface) 94%, var(--app-bg));
    color: var(--app-muted);
    box-shadow:
      0 1px 2px rgba(70, 55, 40, 0.08),
      0 10px 24px rgba(70, 55, 40, 0.12);
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
  }

  .chat-scroll-bottom-btn:hover {
    border-color: color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
    background: color-mix(in srgb, var(--app-surface) 80%, var(--app-accent-soft));
    color: var(--app-fg);
    transform: translateY(-1px);
    box-shadow:
      0 1px 2px rgba(70, 55, 40, 0.08),
      0 12px 28px rgba(70, 55, 40, 0.14);
  }

  .chat-scroll-bottom-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--app-accent) 62%, transparent);
    outline-offset: 3px;
  }

  [data-density="compact"] .chat-scroll-bottom {
    top: -46px;
  }
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: PASS for all tests in `chat-panel-auto-scroll.test.tsx`.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add workbench/web/src/index.css workbench/web/test/chat-panel-auto-scroll.test.tsx
git commit -m "style: add chat return-to-bottom control"
```

### Task 4: Regression Checks and Browser Verification

**Files:**
- Verify: `workbench/web/src/components/ChatPanel.tsx`
- Verify: `workbench/web/src/index.css`
- Verify: `workbench/web/test/chat-panel-auto-scroll.test.tsx`

- [ ] **Step 1: Run the focused DOM tests**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-auto-scroll.test.tsx
```

Expected: PASS for all tests in `chat-panel-auto-scroll.test.tsx`.

- [ ] **Step 2: Run existing chat panel DOM tests**

Run:

```bash
cd workbench/web
node --test-concurrency=1 --import tsx --import ./test/setup-dom.ts --test test/chat-panel-bubbles.test.tsx test/chat-panel-composer.test.tsx test/chat-panel-tool-status.test.tsx
```

Expected: PASS for chat bubbles, composer, and tool-status rendering.

- [ ] **Step 3: Run the full frontend DOM test suite**

Run:

```bash
npm run test:dom --workspace=@llm-wiki-agent/web
```

Expected: PASS. If failures mention unrelated graph tests, run the focused chat commands from Step 1 and Step 2 again and inspect whether the failure reproduces outside this feature.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS across workspaces.

- [ ] **Step 5: Run Paper UI visual capture**

Run:

```bash
npm run visual:paper --workspace=@llm-wiki-agent/web
```

Expected: PASS or generated screenshots that show no unrelated layout regressions. If the command writes updated screenshots, inspect the chat/composer captures and confirm the new return-to-bottom control does not overlap the composer, tool status, error banner, artifact hint, batch digest chip, or ingest chip.

- [ ] **Step 6: Start the app for manual verification**

Run:

```bash
npm run dev
```

Expected: the server starts on `localhost:8787` and the web app starts on `localhost:5180`.

- [ ] **Step 7: Verify normal auto-follow in the browser**

Open `http://localhost:5180/` and use a conversation with enough existing messages to make `.chat-messages` scrollable. If the current data is too short, paste a long local prompt that asks for a multi-section Markdown answer with a table and code block.

Manual checks:

```text
1. Send a normal message.
2. Confirm the view moves to the new user message and the assistant reply area.
3. Ask for a long answer.
4. Confirm the visible area keeps following the reply as it grows.
5. Confirm no down-arrow button appears while the view is already at the latest reply.
6. Confirm a long Markdown answer, table, code block, and tool-status updates remain visible without visible jitter.
```

- [ ] **Step 8: Verify paused follow and restore in the browser**

Manual checks:

```text
1. While a long answer is generating, scroll up into earlier messages.
2. Confirm the view stays where the user placed it.
3. Confirm a small themed down-arrow button appears above the composer.
4. Confirm the button has no visible text label.
5. Scroll manually back near the bottom without clicking the button.
6. Confirm the button disappears and the same reply resumes auto-follow.
7. Scroll up again, then click the down-arrow button.
8. Confirm the view jumps back to the latest reply.
9. Confirm the button disappears.
10. Continue the same reply or send another message and confirm auto-follow is restored.
```

- [ ] **Step 9: Verify button placement, themes, and session reset**

Manual checks:

```text
1. Trigger each composer-adjacent state: artifact hint, batch digest chip, ingest chip, and error banner if practical.
2. Confirm the down-arrow does not cover readable message content, the composer, or any chip.
3. Toggle dark/light theme and compact/default density.
4. Confirm the button remains icon-only, centered, clickable, and visually consistent.
5. Switch to another long conversation or knowledge base.
6. Confirm the new chat view defaults to the latest message and does not inherit the previous paused state or button visibility.
```

- [ ] **Step 10: Verify final git state**

Run:

```bash
git status --short
```

Expected: clean working tree.

## Plan Self-Review

- Spec coverage: Task 1 covers initial bottom positioning and streaming follow. Task 2 covers user scroll pause, no forced return, restore by click, and restore by bottom state. Task 3 covers Codex-like icon-only themed button and accessible name. Task 4 covers focused tests, broad checks, and manual browser verification.
- Scope: All implementation steps stay inside `ChatPanel`, `index.css`, and one new DOM test file.
- Type consistency: The plan uses one threshold constant, one `messagesRef`, one `followBottomRef`, one `showScrollToBottom` state, one `handleMessagesScroll` callback, one `scrollMessagesToBottom` callback, and one `restoreAutoFollow` callback throughout.

## Plan Engineering Review

Status: reviewed and hardened on 2026-06-22. Accepted decisions from the review are folded into the implementation tasks above.

### Step 0 Scope Challenge

- Existing code already solves most of the plumbing: `ChatPanel` owns message state, streaming updates, composer state, tool status rendering, and the `.chat-messages` scroll container. The plan reuses those instead of adding a backend protocol, global scroll manager, or session storage change.
- Minimum viable change is still three files: `ChatPanel.tsx`, `index.css`, and one DOM test file. That is under the complexity threshold and does not introduce new services/classes.
- Deferred work does not block the core objective: unread counts, virtualized history, search jumps, scroll anchors per message, and backend conversation changes are separate products.
- Search check: this uses React's built-in `useLayoutEffect`, refs, and DOM scroll events. Layer 1 choice; no custom observer framework or third-party scroll library needed.
- `TODOS.md` does not exist in this worktree. No deferred blocker found.
- Distribution check: no new artifact type is introduced.

### Architecture Review

No unresolved architecture issues after review changes.

Key state machine:

```text
MESSAGE COMMIT
  |
  v
useLayoutEffect(messages)
  |
  +-- messages empty ---------------> follow=true, hide button
  |
  +-- follow=true ------------------> scroll to latest, hide button
  |
  +-- follow=false -----------------> leave user's scroll position alone

USER SCROLL
  |
  v
distance = scrollHeight - scrollTop - clientHeight
  |
  +-- distance <= threshold --------> follow=true, hide button
  |
  +-- distance > threshold ---------> follow=false, show button

BUTTON CLICK
  |
  v
follow=true -> hide button -> smooth scroll to latest
```

Findings folded into the plan:

1. `[P2] (confidence: 9/10) docs/superpowers/plans/2026-06-22-chat-auto-scroll.md:213` — The original timing plan used post-paint scrolling, which could leave a visible one-frame lag after streaming updates. Decision D1 accepted: use `useLayoutEffect` so the scroll correction happens before paint.
2. `[P2] (confidence: 9/10) docs/superpowers/plans/2026-06-22-chat-auto-scroll.md:74` — Tests originally installed scroll metrics after render, which is too late for `useLayoutEffect`. Decision D2 accepted: install the scroll layout mock before render.
3. `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-22-chat-auto-scroll.md:392` — The design promised manual restoration when the user scrolls back to the bottom, but the first test plan only covered button restoration. The plan now includes a dedicated manual-bottom restore test.
4. `[P2] (confidence: 8/10) docs/superpowers/plans/2026-06-22-chat-auto-scroll.md:88` — The first test expected `scrollTop === scrollHeight`, which does not match browser scroll bounds. The mock now clamps to `scrollHeight - clientHeight`.

Outside voice tension resolved: Codex suggested not auto-following on send if the user was reading history. This review keeps the product decision from the spec: an explicit send starts a new turn and should bring the user to the new message/reply. That matches the original bug report and is still the right default for this chat surface.

### Code Quality Review

No remaining code quality blockers.

- The state is right-sized: one threshold constant, one scroll container ref, one follow ref, one visible-button state, and three named callbacks.
- No DRY problem after review: bottom-distance logic is centralized in `isMessagesNearBottom`; scroll execution is centralized in `scrollMessagesToBottom`.
- No inline ASCII comment is required in `ChatPanel.tsx`; the state machine is small and the plan diagram is enough.
- The CSS change is local to the chat input area and new return-to-bottom button classes.

### Test Review

Test framework detected: Node test runner + Testing Library + JSDOM for DOM tests; Playwright-based `visual:paper` exists for visual captures.

Coverage diagram:

```text
CODE PATHS                                                USER FLOWS
[+] ChatPanel scroll ownership                            [+] Existing long conversation opens
  ├── [★★★] messages mount with follow=true                 └── [★★★] Starts at latest message
  ├── [★★★] streamed text grows latest reply              [+] Send while at latest reply
  │   └── useLayoutEffect scrolls before paint              ├── [★★★] User sees sent message immediately
  ├── [★★★] user scrolls above threshold                    └── [★★★] Reply keeps following while it grows
  │   └── follow=false, button visible                    [+] Read history during streaming
  ├── [★★★] user clicks return button                       ├── [★★★] User scroll position is preserved
  │   └── follow=true, button hidden, scroll latest          └── [★★★] Return button appears
  ├── [★★★] user manually scrolls near bottom             [+] Restore without clicking
  │   └── follow=true, button hidden                        └── [★★★] Manual bottom scroll resumes follow
  ├── [★★★] empty conversation                              [+] Restore by clicking
  │   └── follow=true, no button                            └── [★★★] Button jumps to latest and disappears
  ├── [★★★] bounded scroll math                             [+] Visual placement
  │   └── mock clamps to scrollHeight-clientHeight           └── [★★] Browser/visual check for no overlap
  └── [★★] CSS classes and accessible label                [+] Session/knowledge-base switch
      └── DOM + visual checks                               └── [★★] Browser check for reset behavior

COVERAGE: 10/10 planned behavior paths covered
QUALITY: ★★★:8 ★★:2 ★:0
GAPS: 0 blocking gaps; browser visual placement remains a manual/visual verification item
```

Regression tests required by this review:

- `chat-panel-auto-scroll.test.tsx` must fail before implementation and pass after implementation for initial bottom follow.
- `chat-panel-auto-scroll.test.tsx` must fail before implementation and pass after implementation for pause + button restore.
- `chat-panel-auto-scroll.test.tsx` must fail before implementation and pass after implementation for manual scroll-back restore.
- `visual:paper` or manual browser verification must confirm the button does not overlap composer-adjacent UI.

### Performance Review

No blocking performance issue for this scoped fix.

- The plan intentionally keeps scroll work local to `.chat-messages`.
- A long streamed reply can call `scrollTo` frequently; this is acceptable for this branch if browser verification shows no visible jitter. If jitter appears, throttle or coalesce scrolling in a follow-up implementation pass.
- No database, network fanout, cache, or N+1 path is touched.

### NOT in scope

- Unread message counts: useful later, but not needed to solve “reply is hidden below the fold.”
- Message virtualization: valuable only for very long histories; it would expand this fix into a rendering architecture change.
- Per-message jump/search: separate navigation feature.
- Backend streaming protocol changes: existing SSE stream already emits enough signal.
- Session persistence of scroll position: switching conversations should default to latest, not preserve a stale paused position.
- Global page scroll redesign: the chat panel already has a dedicated scroll container.

### What already exists

- `.chat-messages` already provides the scroll container; the plan reuses it.
- `sendPrompt` already creates user and assistant messages before streaming; the plan hooks into that flow.
- Existing message updates already flow through `setMessages`; `useLayoutEffect` reacts to the resulting committed DOM.
- Existing DOM tests already use `TooltipProvider`, Testing Library, mocked fetch, and JSDOM; the plan follows that pattern.
- Existing Paper UI visual tests already inspect chat/composer geometry; the plan adds this path to verification rather than creating a separate visual stack.

### Failure Modes

| Codepath | Realistic failure | Test/verification | User result |
|----------|-------------------|-------------------|-------------|
| Initial mount with existing messages | Layout effect runs before test/browser has dimensions | Prototype-level layout mock before render; browser check | Latest message visible |
| Streamed reply growth | Frequent updates cause scroll lag or jitter | DOM test + browser long-answer check | If bad, user sees stutter; no silent data loss |
| User scrolls up | App keeps forcing bottom and steals reading position | Pause test | User can read history safely |
| Manual scroll back down | Button remains stuck and follow never resumes | Manual-bottom restore test | User regains automatic follow |
| Button click | Button hides but scroll does not move | Button restore test | User returns to latest reply |
| Empty chat | Button appears with nothing to return to | Empty branch in layout effect | No confusing control |
| Error/tool status appears | New status area grows but latest content is hidden | Browser/manual verification | Error/tool status remains visible |
| Button CSS placement | Button overlaps chips, composer, or last message | `visual:paper` + manual theme/density checks | No visual obstruction |

Critical silent gaps: 0 after review updates.

### Worktree Parallelization Strategy

Sequential implementation, no parallelization opportunity. All meaningful work touches the same primary component and adjacent CSS/test files, so parallel worktrees would create avoidable merge friction.

Dependency table:

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Auto-follow state | `workbench/web/src/components`, `workbench/web/test` | — |
| Pause/restore behavior | `workbench/web/src/components`, `workbench/web/test` | Auto-follow state |
| Button styling | `workbench/web/src`, `workbench/web/test` | Pause/restore behavior |
| Browser verification | `workbench/web` | All implementation steps |

Lane A: auto-follow -> pause/restore -> styling -> verification.

### Implementation Tasks Synthesized From Review

These are already folded into the main task list above.

- [ ] **T1 (P2, human: ~30m / CC: ~5m)** — ChatPanel — Use `useLayoutEffect` for message-follow scrolling
  - Surfaced by: Architecture Review finding 1.
  - Files: `workbench/web/src/components/ChatPanel.tsx`
  - Verify: focused auto-scroll DOM test.
- [ ] **T2 (P2, human: ~45m / CC: ~10m)** — Tests — Install scroll metrics before render and clamp browser scroll positions
  - Surfaced by: Architecture Review findings 2 and 4.
  - Files: `workbench/web/test/chat-panel-auto-scroll.test.tsx`
  - Verify: focused auto-scroll DOM test.
- [ ] **T3 (P2, human: ~30m / CC: ~5m)** — Tests — Cover manual scroll-back restoration
  - Surfaced by: Architecture Review finding 3.
  - Files: `workbench/web/test/chat-panel-auto-scroll.test.tsx`
  - Verify: focused auto-scroll DOM test.
- [ ] **T4 (P2, human: ~45m / CC: ~10m)** — Visual QA — Verify the floating arrow does not overlap chat/composer states
  - Surfaced by: Test Review and outside voice.
  - Files: `workbench/web/src/index.css`, `workbench/web/test/visual/paper-ui.ts` if visual fixtures need extension.
  - Verify: `npm run visual:paper --workspace=@llm-wiki-agent/web` and browser manual checks.

### Completion Summary

- Step 0: Scope Challenge — scope accepted as-is.
- Architecture Review: 4 issues found, all folded into the plan.
- Code Quality Review: 0 unresolved issues.
- Test Review: diagram produced, 0 blocking gaps after updates.
- Performance Review: 0 blocking issues.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed; no follow-up TODO is more appropriate than folding the gaps into this plan.
- Failure modes: 0 critical gaps flagged.
- Outside voice: ran via Codex; useful findings folded where aligned with the confirmed design.
- Parallelization: 1 lane, sequential.
- Lake Score: 4/4 recommendations chose the complete option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not needed for this scoped bug fix |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues found | 10 outside-voice notes; useful test/visual risks folded into this plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 4 issues, 0 critical gaps, all folded into the plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Manual/browser visual checks added instead |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not needed |

- **CODEX:** Outside voice found test realism, manual restore, placement, session reset, and performance verification gaps; aligned items were folded into the plan.
- **CROSS-MODEL:** Both reviews agree the implementation should stay local to `ChatPanel` and needs stronger scroll/visual verification. Codex disagreed on send-triggered auto-follow; the confirmed product direction keeps auto-follow on explicit send.
- **VERDICT:** ENG CLEARED — ready to implement in the isolated worktree.
NO UNRESOLVED DECISIONS
