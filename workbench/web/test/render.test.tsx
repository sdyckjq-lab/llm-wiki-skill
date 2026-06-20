import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";

import { click, render, screen } from "./render";

describe("DOM test helpers", () => {
	it("starts each test with a clean browser-like document", () => {
		assert.equal(document.body.innerHTML, "");
		assert.equal(localStorage.length, 0);
		assert.deepEqual({ ...document.documentElement.dataset }, {});
	});

	it("renders React components and dispatches real click events", async () => {
		render(React.createElement(CounterButton));

		const button = screen.getByRole("button", { name: "Count 0" });
		await click(button);

		assert.equal(screen.getByRole("button").textContent, "Count 1");
	});
});

function CounterButton() {
	const [count, setCount] = useState(0);
	return React.createElement("button", {
		type: "button",
		onClick: () => setCount((value) => value + 1),
	}, `Count ${count}`);
}
