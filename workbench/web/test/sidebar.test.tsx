import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { Sidebar } from "../src/components/Sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { click, render, screen } from "./render";

describe("Sidebar", () => {
	it("renders V2 expanded sidebar sections and footer actions", async () => {
		const events = makeSidebarEvents();
		renderSidebar(false, events);

		assert.equal(Boolean(screen.queryByTitle("刷新")), false, "expanded sidebar should not render refresh");
		assert.equal(Boolean(screen.queryByLabelText("设置")), false, "expanded sidebar should not render top settings");
		assert.equal(Boolean(screen.queryByText("llm-wiki-agent")), false, "expanded sidebar should not repeat the topbar brand");
		assert.ok(screen.getByLabelText("折叠侧栏"));
		assert.ok(screen.getByText("笔记本"));
		assert.ok(screen.getByText("会话"));
		assert.ok(screen.getByRole("button", { name: "图谱活地图" }));
		assert.ok(screen.getByRole("button", { name: "设置" }));
		assert.ok(screen.getByRole("button", { name: "新建知识库" }));
		assert.equal(Boolean(screen.queryByText("添加现有库")), false, "sidebar should rename add-existing flow");
		assert.equal(Boolean(document.querySelector(".main-view-switch")), false, "expanded sidebar should not render old view switch");

		await click(screen.getByRole("button", { name: "图谱活地图" }));
		await click(screen.getByRole("button", { name: "设置" }));
		await click(screen.getByRole("button", { name: "新建知识库" }));

		assert.deepEqual(events.views, ["graph"]);
		assert.equal(events.settings, 1);
		assert.ok(await screen.findByRole("heading", { name: "新建知识库" }));
	});

	it("renders conversations outside the knowledge-base tree", () => {
		renderSidebar(false);

		const notebookSection = screen.getByText("笔记本").closest(".sidebar-section");
		const conversationSection = screen.getByText("会话").closest(".sidebar-section");
		assert.ok(notebookSection);
		assert.ok(conversationSection);
		assert.equal(notebookSection?.contains(screen.getByText("Transformer vs Mamba")), false);
		assert.equal(conversationSection?.contains(screen.getByText("Transformer vs Mamba")), true);
		assert.equal(Boolean(document.querySelector(".kb-children")), false, "conversations should not be nested under knowledge bases");
	});

	it("keeps the collapsed rail aligned with V2 actions", async () => {
		const events = makeSidebarEvents();
		renderSidebar(true, events);

		assert.ok(screen.getByLabelText("展开侧栏"));
		assert.ok(screen.getByLabelText("当前知识库：AI学习知识库"));
		assert.ok(screen.getByLabelText("对话"));
		assert.ok(screen.getByLabelText("图谱活地图"));
		assert.ok(screen.queryByLabelText("设置"));
		assert.ok(screen.getByLabelText("新建知识库"));
		assert.equal(Boolean(screen.queryByLabelText("刷新")), false, "collapsed rail should not render refresh");
		assert.equal(Boolean(screen.queryByLabelText("添加现有库")), false, "collapsed rail should not render add-existing");

		await click(screen.getByLabelText("新建知识库"));
		assert.ok(await screen.findByRole("heading", { name: "新建知识库" }));
	});
});

function makeSidebarEvents() {
	return {
		views: [] as string[],
		settings: 0,
	};
}

function renderSidebar(collapsed: boolean, events = makeSidebarEvents()) {
	return render(
		<TooltipProvider>
			<Sidebar
				knowledgeBases={[
					{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true },
					{ path: "/external", name: "设计灵感库", origin: "external", valid: true },
				]}
				currentKbPath="/kb"
				conversations={[
					{
						id: "c1",
						path: "/kb/.llm-wiki/conversations/c1.jsonl",
						firstMessage: "Transformer vs Mamba",
						modifiedAt: Date.parse("2026-06-20T10:00:00.000Z"),
					},
				]}
				currentConversationId="c1"
				error={null}
				collapsed={collapsed}
				activeView="chat"
				onSelectKb={noop}
				onSelectConversation={(item) => {
					events.views.push(`conversation:${item.id}`);
				}}
				onSelectView={(view) => events.views.push(view)}
				onNewConversation={noop}
				onOpenSettings={() => {
					events.settings += 1;
				}}
				onToggleCollapsed={noop}
				onAddExternal={asyncNoop}
			/>
		</TooltipProvider>,
	);
}

function noop() {}
async function asyncNoop() {}
