import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const html = process.env.GRAPH_COMMUNITY_NODE_MAP_HTML || "";
assert.notEqual(html, "", "GRAPH_COMMUNITY_NODE_MAP_HTML must point at generated HTML");
const screenshotPath = process.env.GRAPH_COMMUNITY_NODE_MAP_SCREENSHOT || "";

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
  assert.equal(initial.rootPaperToken.toLowerCase(), "#f8f1e6", "community map should expose the approved warm paper token");
  assert.match(initial.rootBackgroundSize, /42px 42px/, "community map should render the paper-grid background size");
  assert.match(initial.rootBackground, /linear-gradient|radial-gradient/, "community map should keep a visible paper-style background treatment");
  assert.ok(initial.sampleNodeStyles.dot, "community map nodes should render a dot-core element");
  assert.ok(initial.sampleNodeStyles.label, "community map labels should still be measurable when visible");
  assert.match(initial.sampleNodeStyles.label.fontFamily, /(Songti|Noto Serif|STSong|serif)/i, "community map labels should use the paper-map serif stack");
  assert.equal(initial.nodeTypes.F, "comparison", "community map should preserve comparison nodes instead of collapsing them to entity");
  assert.notEqual(initial.nodeDotColors.topic, initial.nodeDotColors.entity, "topic and entity dots should use different colors");
  assert.notEqual(initial.nodeDotColors.source, initial.nodeDotColors.entity, "source and entity dots should use different colors");
  assert.notEqual(initial.nodeDotColors.comparison, initial.nodeDotColors.entity, "comparison and entity dots should use different colors");
  assert.equal(initial.edgeDashes.extracted, "none", "extracted confidence should render as a solid edge");
  assert.notEqual(initial.edgeDashes.inferred, "none", "inferred confidence should render as a dashed edge");
  assert.notEqual(initial.edgeDashes.ambiguous, "none", "ambiguous confidence should render as a dashed edge");
  assert.notEqual(initial.edgeDashes.inferred, initial.edgeDashes.ambiguous, "inferred and ambiguous confidence should use distinct dash patterns");

  await page.evaluate(() => {
    window.__LLM_WIKI_GRAPH_ENGINE__?.setTypeFilters?.({ entity: false });
  });
  await page.locator('.node[data-id="A"]').hover();
  await page.waitForFunction(() => document.querySelector('.edge[data-edge-id="eAB"]')?.getAttribute("data-filter-state") === "hidden");
  const hiddenFilter = await snapshot(page);
  const hiddenOpacity = Number.parseFloat(hiddenFilter.sampleNodeStyles.hiddenEdge?.opacity || "1");
  assert.ok(hiddenOpacity <= 0.04, `filtered hidden edge should stay visually hidden, got ${hiddenOpacity}`);
  await page.evaluate(() => {
    window.__LLM_WIKI_GRAPH_ENGINE__?.setTypeFilters?.({ entity: true, source: true, topic: true });
  });
  await page.mouse.move(20, 20);
  await page.waitForFunction(() => document.querySelector('.edge[data-edge-id="eAB"]')?.getAttribute("data-filter-state") === "visible");

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
  assert.ok(hover.nodeDotOpacity.first > hover.nodeDotOpacity.second, "first-degree nodes should be clearer than second-degree nodes");
  assert.ok(hover.nodeDotOpacity.second > hover.nodeDotOpacity.unrelated, "second-degree nodes should be clearer than unrelated nodes");
  assert.ok(Math.abs(beforeHoverCenter.x - afterHoverCenter.x) < 0.5, "hover should not shift node x");
  assert.ok(Math.abs(beforeHoverCenter.y - afterHoverCenter.y) < 0.5, "hover should not shift node y");

  assert.ok(hover.labelSideCount === hover.nodeCount, "each community map node should expose a label-side placement");
  assert.ok(hover.firstDegreeCount >= 10, "fixture should be dense enough to catch first-degree label walls");
  assert.ok(hover.visibleFirstLabels < hover.firstDegreeCount, "first-degree labels should stay sparse instead of labeling every direct neighbor");
  assert.ok(hover.visibleFirstLabels <= hover.visibleLabelCount, "first-degree labels should stay within the visible label budget");

  await page.waitForTimeout(360);
  const hoverAfterPreviewDelay = await snapshot(page);
  assert.notEqual(hoverAfterPreviewDelay.hoverPreviewState, "open", "focused community node hover should not open the old content preview card");

  await page.locator('.node[data-id="B"]').hover();
  await page.waitForFunction(() => (
    document.querySelector("[data-llm-wiki-graph-root='true']")?.getAttribute("data-relation-focus-node") === "B"
  ));
  await page.waitForTimeout(120);
  const hoverB = await snapshot(page);
  assert.equal(hoverB.relationFocusNode, "B", "hover should move directly from A focus to B focus");

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

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
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
    const stylesFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        display: style.display,
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
        border: style.border,
        borderRadius: style.borderRadius,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        left: style.left,
        right: style.right,
        top: style.top,
        bottom: style.bottom,
        opacity: style.opacity,
        strokeDasharray: style.strokeDasharray,
        transform: style.transform,
        width: style.width,
        height: style.height
      };
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
      },
      nodeTypes: {
        A: node("A")?.getAttribute("data-type") || "",
        B: node("B")?.getAttribute("data-type") || "",
        C: node("C")?.getAttribute("data-type") || "",
        F: node("F")?.getAttribute("data-type") || ""
      },
      nodeDotColors: {
        topic: stylesFor('.node[data-id="A"] .dot-core')?.background || "",
        entity: stylesFor('.node[data-id="B"] .dot-core')?.background || "",
        source: stylesFor('.node[data-id="C"] .dot-core')?.background || "",
        comparison: stylesFor('.node[data-id="F"] .dot-core')?.background || ""
      },
      nodeDotOpacity: {
        first: Number.parseFloat(stylesFor('.node[data-id="B"] .dot-core')?.opacity || "0"),
        second: Number.parseFloat(stylesFor('.node[data-id="D"] .dot-core')?.opacity || "0"),
        unrelated: Number.parseFloat(stylesFor('.node[data-id="F"] .dot-core')?.opacity || "0")
      },
      edgeDashes: {
        extracted: stylesFor('.edge[data-edge-id="eAB"]')?.strokeDasharray || "",
        inferred: stylesFor('.edge[data-edge-id="eAC"]')?.strokeDasharray || "",
        ambiguous: stylesFor('.edge[data-edge-id="eEF"]')?.strokeDasharray || ""
      },
      rootBackground: root ? getComputedStyle(root).backgroundImage : "",
      rootBackgroundSize: root ? getComputedStyle(root).backgroundSize : "",
      rootPaperToken: root ? getComputedStyle(root).getPropertyValue("--community-map-paper").trim() : "",
      sampleNodeStyles: {
        node: stylesFor('.node[data-id="A"]'),
        dot: stylesFor('.node[data-id="A"] .dot-core'),
        label: stylesFor('.node[data-id="A"] .node-name'),
        hiddenEdge: stylesFor('.edge[data-edge-id="eAB"][data-filter-state="hidden"]'),
        firstEdge: stylesFor('.edge[data-edge-id="eAB"]')
      },
      hoverPreviewState: document.querySelector(".graph-hover-preview")?.getAttribute("data-state") || "",
      hoverPreviewKind: document.querySelector(".graph-hover-preview")?.getAttribute("data-kind") || "",
      labelSideCount: Array.from(document.querySelectorAll(".node[data-label-side]")).length,
      firstDegreeCount: Array.from(document.querySelectorAll('.node[data-relation-focus-depth="first"]')).length,
      visibleFirstLabels: Array.from(document.querySelectorAll('.node[data-relation-focus-depth="first"] .node-name'))
        .filter((element) => getComputedStyle(element).display !== "none").length
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
