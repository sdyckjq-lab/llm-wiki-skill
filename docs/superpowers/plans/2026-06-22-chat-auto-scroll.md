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
  - New DOM tests for auto-follow, user scroll pause, button restore, and CSS contract.
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

type ChatPanelProps = React.ComponentProps<typeof ChatPanel>;
type StreamEvent = { event: string; data: string };

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ChatPanel auto scroll", () => {
	it("scrolls to the bottom on existing messages and after a streamed reply when follow is active", async () => {
		installChatFetch([
			{ event: "text_delta", data: "第一段回复" },
			{ event: "done", data: "{}" },
		]);
		renderChatPanel({
			initialMessages: [
				{ id: "u1", role: "user", content: "第一条", tools: [] },
				{ id: "a1", role: "assistant", content: "第一条回复", tools: [] },
			],
		});

		const scroller = chatScroller();
		const scrollCalls = setScrollBox(scroller, {
			clientHeight: 320,
			scrollHeight: 960,
			scrollTop: 0,
		});

		await waitFor(() => assert.equal(scroller.scrollTop, 960));

		Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1280 });
		await changeText(screen.getByPlaceholderText(/写下想法/), "继续");
		await pressKey(screen.getByPlaceholderText(/写下想法/), "Enter", { metaKey: true });

		await waitFor(() => assert.equal(scroller.scrollTop, 1280));
		assert.ok(scrollCalls.length >= 2);
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

function setScrollBox(
	element: HTMLDivElement,
	metrics: { clientHeight: number; scrollHeight: number; scrollTop: number },
) {
	Object.defineProperty(element, "clientHeight", { configurable: true, value: metrics.clientHeight });
	Object.defineProperty(element, "scrollHeight", { configurable: true, value: metrics.scrollHeight });
	element.scrollTop = metrics.scrollTop;
	const calls: number[] = [];
	element.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
		const top = typeof options === "number" ? y ?? options : options?.top ?? element.scrollTop;
		const numericTop = Number(top);
		calls.push(numericTop);
		element.scrollTop = numericTop;
	}) as typeof element.scrollTo;
	return calls;
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

Expected: FAIL. The important assertion failure is that `.chat-messages.scrollTop` stays `0` instead of becoming `960`, because `ChatPanel` does not yet own a scroll ref or auto-follow effect.

- [ ] **Step 3: Add the minimal auto-follow plumbing**

Modify the React import in `workbench/web/src/components/ChatPanel.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```

Add this constant near `type ToolMark`:

```tsx
const CHAT_BOTTOM_THRESHOLD_PX = 100;
```

Inside `ChatPanel`, immediately after the existing `sendPromptRef` declaration, add these refs and callbacks:

```tsx
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const followBottomRef = useRef(true);
	const scrollFrameRef = useRef<number | null>(null);

	const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const element = messagesRef.current;
		if (!element) return;
		if (typeof element.scrollTo === "function") {
			element.scrollTo({ top: element.scrollHeight, behavior });
		} else {
			element.scrollTop = element.scrollHeight;
		}
	}, []);

	const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
		scrollFrameRef.current = window.requestAnimationFrame(() => {
			scrollFrameRef.current = null;
			scrollMessagesToBottom(behavior);
		});
	}, [scrollMessagesToBottom]);
```

In the existing cleanup effect that aborts the stream and clears tool timers, add the animation-frame cleanup before `onStatusChange?.(DEFAULT_CHAT_STATUS);`:

```tsx
			if (scrollFrameRef.current !== null) {
				window.cancelAnimationFrame(scrollFrameRef.current);
				scrollFrameRef.current = null;
			}
```

Add this effect after the status summary effect:

```tsx
	useEffect(() => {
		if (messages.length === 0) {
			followBottomRef.current = true;
			return;
		}
		if (followBottomRef.current) scheduleScrollToBottom("auto");
	}, [messages, scheduleScrollToBottom]);
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
		renderChatPanel({
			initialMessages: [
				{ id: "u1", role: "user", content: "历史问题", tools: [] },
				{ id: "a1", role: "assistant", content: "历史回答", tools: [] },
			],
		});

		const scroller = chatScroller();
		setScrollBox(scroller, {
			clientHeight: 300,
			scrollHeight: 1000,
			scrollTop: 700,
		});

		await changeText(screen.getByPlaceholderText(/写下想法/), "继续展开");
		await pressKey(screen.getByPlaceholderText(/写下想法/), "Enter", { metaKey: true });
		await waitFor(() => assert.equal(scroller.scrollTop, 1000));

		scroller.scrollTop = 120;
		fireEvent.scroll(scroller);
		const returnButton = await screen.findByRole("button", { name: "回到底部" });
		assert.equal(returnButton.textContent, "");

		Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1500 });
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

		await waitFor(() => assert.equal(scroller.scrollTop, 1500));
		assert.equal(screen.queryByRole("button", { name: "回到底部" }), null);
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

After `scheduleScrollToBottom`, add these callbacks:

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
		scheduleScrollToBottom("smooth");
	}, [scheduleScrollToBottom]);
```

Update the auto-follow effect from Task 1 so empty chats hide the button and followed chats clear it:

```tsx
	useEffect(() => {
		if (messages.length === 0) {
			followBottomRef.current = true;
			setShowScrollToBottom(false);
			return;
		}
		if (followBottomRef.current) {
			setShowScrollToBottom(false);
			scheduleScrollToBottom("auto");
		}
	}, [messages, scheduleScrollToBottom]);
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

Expected: PASS for both auto-scroll tests.

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

- [ ] **Step 5: Start the app for manual verification**

Run:

```bash
npm run dev
```

Expected: the server starts on `localhost:8787` and the web app starts on `localhost:5180`.

- [ ] **Step 6: Verify normal auto-follow in the browser**

Open `http://localhost:5180/` and use an existing knowledge base conversation.

Manual checks:

```text
1. Send a normal message.
2. Confirm the view moves to the new user message and the assistant reply area.
3. Ask for a long answer.
4. Confirm the visible area keeps following the reply as it grows.
5. Confirm no down-arrow button appears while the view is already at the latest reply.
```

- [ ] **Step 7: Verify paused follow and restore in the browser**

Manual checks:

```text
1. While a long answer is generating, scroll up into earlier messages.
2. Confirm the view stays where the user placed it.
3. Confirm a small themed down-arrow button appears above the composer.
4. Confirm the button has no visible text label.
5. Click the down-arrow button.
6. Confirm the view jumps back to the latest reply.
7. Confirm the button disappears.
8. Continue the same reply or send another message and confirm auto-follow is restored.
```

- [ ] **Step 8: Verify final git state**

Run:

```bash
git status --short
```

Expected: clean working tree.

## Plan Self-Review

- Spec coverage: Task 1 covers initial bottom positioning and streaming follow. Task 2 covers user scroll pause, no forced return, restore by click, and restore by bottom state. Task 3 covers Codex-like icon-only themed button and accessible name. Task 4 covers focused tests, broad checks, and manual browser verification.
- Scope: All implementation steps stay inside `ChatPanel`, `index.css`, and one new DOM test file.
- Type consistency: The plan uses one threshold constant, one `messagesRef`, one `followBottomRef`, one `showScrollToBottom` state, one `handleMessagesScroll` callback, and one `restoreAutoFollow` callback throughout.
