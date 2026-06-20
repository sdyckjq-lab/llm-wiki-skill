import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Sidebar V2 source contract", () => {
	it("keeps expanded notebook rows text-first without leading book icons", () => {
		const source = readFileSync(resolve(import.meta.dirname, "../src/components/Sidebar.tsx"), "utf8");
		const kbItemStart = source.indexOf("function KbItem");
		const conversationStart = source.indexOf("function ConversationItem");
		assert.ok(kbItemStart >= 0 && conversationStart > kbItemStart);

		const kbItemSource = source.slice(kbItemStart, conversationStart);
		assert.match(kbItemSource, /className=\{cn\("kb-row"/);
		assert.doesNotMatch(kbItemSource, /<BookOpen\b/);
	});
});
