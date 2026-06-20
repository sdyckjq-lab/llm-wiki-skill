import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { Sidebar } from "../src/components/Sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { render, screen } from "./render";

describe("Sidebar", () => {
	it("keeps graph and settings entries without a night-mode item", () => {
		renderSidebar(false);

		assert.equal(screen.queryByText(/夜灯/), null);
		assert.ok(screen.getAllByText("图谱").length > 0);
		assert.notEqual(screen.queryByLabelText("设置"), null);
	});

	it("keeps the collapsed rail focused on navigation and settings", () => {
		renderSidebar(true);

		assert.equal(screen.queryByLabelText(/夜灯/), null);
		assert.notEqual(screen.queryByLabelText("图谱"), null);
		assert.notEqual(screen.queryByLabelText("设置"), null);
	});
});

function renderSidebar(collapsed: boolean) {
	return render(
		<TooltipProvider>
			<Sidebar
				knowledgeBases={[{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true }]}
				currentKbPath="/kb"
				conversations={[]}
				currentConversationId={null}
				loading={false}
				error={null}
				collapsed={collapsed}
				activeView="chat"
				onSelectKb={noop}
				onSelectConversation={noop}
				onSelectView={noop}
				onNewConversation={noop}
				onRefresh={noop}
				onOpenSettings={noop}
				onToggleCollapsed={noop}
				onAddExternal={asyncNoop}
				onCreateWiki={asyncNoop}
			/>
		</TooltipProvider>,
	);
}

function noop() {}
async function asyncNoop() {}
