import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CommandMenu } from "../src/components/CommandMenu";
import { RefMenu } from "../src/components/RefMenu";
import type { CommandItem, PageRef } from "../src/lib/api";
import { render, screen } from "./render";

describe("Paper popup menus", () => {
	it("renders RefMenu as a Paper listbox with selected page state and empty state", () => {
		const selected: PageRef[] = [];
		render(
			<RefMenu
				open
				query="paper"
				items={[
					{ path: "wiki/paper-ui.md", name: "paper-ui", title: "Paper UI", category: "wiki" },
					{ path: "raw/design.md", name: "design", title: "Design Notes", category: "raw" },
				]}
				selectedIndex={1}
				onSelect={(item) => selected.push(item)}
			/>,
		);

		const menu = screen.getByRole("listbox", { name: "@ 引用页面" });
		assert.match(menu.className, /popup-menu-ref/);
		assert.match(menu.textContent ?? "", /引用页面/);
		assert.equal(screen.getByRole("option", { name: /Design Notes/ }).getAttribute("aria-selected"), "true");
		assert.match(screen.getByText("wiki").className, /popup-item-kind/);

		render(<RefMenu open query="none" items={[]} selectedIndex={0} onSelect={() => {}} />);
		assert.match(screen.getByText("没有匹配页面").className, /popup-item-empty/);
	});

	it("renders CommandMenu groups, command pills, source chips, and selected state", () => {
		render(
			<CommandMenu
				open
				query="dig"
				items={[
					command({ slug: "/digest", name: "消化素材", source: "builtin", skillPath: null }),
					command({ slug: "/llm-wiki", name: "llm-wiki", source: "builtin", skillPath: "/skills/llm-wiki" }),
					command({ slug: "/help", name: "帮助", source: "pi-default", skillPath: null }),
				]}
				selectedIndex={1}
				onSelect={() => {}}
			/>,
		);

		const menu = screen.getByRole("listbox", { name: "/ 调用命令" });
		assert.match(menu.className, /popup-menu-command/);
		assert.match(menu.textContent ?? "", /内置/);
		assert.match(menu.textContent ?? "", /项目 Skill/);
		assert.match(menu.textContent ?? "", /pi 默认/);
		assert.equal(screen.getByRole("option", { name: /llm-wiki/ }).getAttribute("aria-selected"), "true");
		assert.match(screen.getByText("/digest").className, /popup-item-command/);
		assert.match(screen.getByText("项目").className, /popup-source/);
	});

	it("keeps the popup Paper styling contract", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.popup-menu\s*\{/);
		assert.match(css, /\.popup-menu[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.popup-menu-heading\s*\{/);
		assert.match(css, /\.popup-menu-symbol[\s\S]*var\(--app-accent-soft\)/);
		assert.match(css, /\.popup-item-selected[\s\S]*inset 3px 0 0 var\(--app-accent\)/);
		assert.match(css, /\.popup-item-command\s*\{/);
		assert.match(css, /\.popup-item-empty\s*\{/);
	});
});

function command(overrides: Partial<CommandItem>): CommandItem {
	return {
		slug: "/command",
		name: "Command",
		description: "Runs a command",
		source: "builtin",
		skillPath: null,
		...overrides,
	};
}
