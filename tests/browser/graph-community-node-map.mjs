import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const html = process.env.GRAPH_COMMUNITY_NODE_MAP_HTML || "";
assert.notEqual(html, "", "GRAPH_COMMUNITY_NODE_MAP_HTML must point at generated HTML");

const executablePath = process.env.GRAPH_COMMUNITY_NODE_MAP_CHROME_EXECUTABLE || "";
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(pathToFileURL(html).href);
  await page.waitForSelector('[data-testid="offline-graph-root"]');
  await page.evaluate(() => {
    const engine = window.__LLM_WIKI_GRAPH_ENGINE__;
    if (!engine?.focusCommunity) throw new Error("offline graph engine is missing focusCommunity");
    engine.focusCommunity("t1");
  });
  await page.waitForSelector('[data-community-map-state="lightweight"]');
  await page.waitForSelector('.node[data-id="A"]');

  const initial = await snapshot(page);
  assert.equal(initial.communityMapState, "lightweight");
  assert.equal(initial.relationFocus, "idle");
  assert.equal(initial.fullCardCount, 0, "community map should not render full card nodes");
  assert.ok(initial.visibleLabelCount > 0 && initial.visibleLabelCount <= 12, `default community map should expose only budgeted key labels, got ${initial.visibleLabelCount}`);
  assert.ok(initial.visibleLabelCount < initial.nodeCount, `default community map should not label every node, got ${initial.visibleLabelCount}/${initial.nodeCount}`);
  assert.ok(initial.defaultEdgeOpacity > 0 && initial.defaultEdgeOpacity < 0.35, `default community edges should stay quiet, got ${initial.defaultEdgeOpacity}`);

  const beforeHoverCenter = await nodeCenter(page, "B");
  await page.locator('.node[data-id="A"]').hover();
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus") === "active" &&
    document.querySelector('.node[data-id="B"]')?.getAttribute("data-relation-focus-depth") === "first"
  ));
  const hover = await snapshot(page);
  const afterHoverCenter = await nodeCenter(page, "B");
  assert.equal(hover.relationFocusNode, "A");
  assert.equal(hover.nodeDepths.A, "focus");
  assert.equal(hover.nodeDepths.B, "first");
  assert.equal(hover.nodeDepths.C, "first");
  assert.equal(hover.nodeDepths.D, "second");
  assert.equal(hover.nodeDepths.F, "unrelated");
  assert.equal(hover.edgeDepths.eAB, "first");
  assert.equal(hover.edgeDepths.eBD, "second");
  assert.equal(hover.edgeDepths.eEF, "unrelated");
  assert.ok(hover.firstEdgeOpacity > hover.secondEdgeOpacity, "direct edges should be clearer than second-degree edges");
  assert.ok(hover.secondEdgeOpacity > hover.unrelatedEdgeOpacity, "second-degree edges should remain clearer than unrelated edges");
  assert.ok(Math.abs(beforeHoverCenter.x - afterHoverCenter.x) < 0.5, "hover should not shift node x");
  assert.ok(Math.abs(beforeHoverCenter.y - afterHoverCenter.y) < 0.5, "hover should not shift node y");
  assert.equal(hover.readerOpen, false, "hover should not update/open the reader");

  await page.mouse.move(20, 20);
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus") === "idle"
  ));
  const afterLeave = await snapshot(page);
  assert.equal(afterLeave.relationFocusNode, "");
  assert.equal(afterLeave.nodeDepths.A, "none");

  await page.locator('.node[data-id="A"]').click();
  await page.waitForSelector('.graph-reader[data-state="open"]');
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus-node") === "A"
  ));
  const clicked = await snapshot(page);
  assert.equal(clicked.readerOpen, true);
  assert.equal(clicked.relationFocusNode, "A");
  assert.equal(clicked.nodeDepths.B, "first");

  await page.locator('.node[data-id="D"]').hover();
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus-node") === "D"
  ));
  const override = await snapshot(page);
  assert.equal(override.relationFocusNode, "D");
  assert.equal(override.nodeDepths.A, "second");

  await page.mouse.move(20, 20);
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus-node") === "A"
  ));
  const restored = await snapshot(page);
  assert.equal(restored.relationFocusNode, "A");
  assert.equal(restored.nodeDepths.A, "focus");

  console.log(JSON.stringify({ initial, hover, afterLeave, clicked, override, restored }, null, 2));
} finally {
  await browser.close();
}

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-llm-wiki-graph-root='true']");
    const node = (id) => document.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
    const edge = (id) => document.querySelector(`.edge[data-edge-id="${CSS.escape(id)}"]`);
    const edgeOpacity = (id) => {
      const element = edge(id);
      if (!element) return -1;
      return Number.parseFloat(getComputedStyle(element).opacity || "0");
    };
    return {
      communityMapState: root?.getAttribute("data-community-map-state") || "",
      relationFocus: root?.getAttribute("data-relation-focus") || "",
      relationFocusNode: root?.getAttribute("data-relation-focus-node") || "",
      nodeCount: document.querySelectorAll(".node").length,
      fullCardCount: document.querySelectorAll('.node[data-density-mode="card"]').length,
      visibleLabelCount: Array.from(document.querySelectorAll(".node-name")).filter((element) => getComputedStyle(element).display !== "none").length,
      defaultEdgeOpacity: edgeOpacity("eAB"),
      firstEdgeOpacity: edgeOpacity("eAB"),
      secondEdgeOpacity: edgeOpacity("eBD"),
      unrelatedEdgeOpacity: edgeOpacity("eEF"),
      readerOpen: document.querySelector(".graph-reader")?.getAttribute("data-state") === "open",
      nodeDepths: {
        A: node("A")?.getAttribute("data-relation-focus-depth") || "",
        B: node("B")?.getAttribute("data-relation-focus-depth") || "",
        C: node("C")?.getAttribute("data-relation-focus-depth") || "",
        D: node("D")?.getAttribute("data-relation-focus-depth") || "",
        F: node("F")?.getAttribute("data-relation-focus-depth") || ""
      },
      edgeDepths: {
        eAB: edge("eAB")?.getAttribute("data-relation-focus-depth") || "",
        eBD: edge("eBD")?.getAttribute("data-relation-focus-depth") || "",
        eEF: edge("eEF")?.getAttribute("data-relation-focus-depth") || ""
      }
    };
  });
}

async function nodeCenter(page, id) {
  return page.locator(`.node[data-id="${cssString(id)}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

function cssString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
