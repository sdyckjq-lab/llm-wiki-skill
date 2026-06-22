import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const workbenchUrl = process.env.GRAPH_WORKBENCH_URL || "";
const artifactDir = process.env.GRAPH_WORKBENCH_ARTIFACT_DIR || "";
const executablePath = process.env.GRAPH_WORKBENCH_CHROME_EXECUTABLE || "";
const GLOBAL_NODE_IDS = ["A", "B", "C", "D", "E", "F", "G"];
const T1_NODE_IDS = ["A", "B", "D", "E", "F", "G"];

assert.notEqual(workbenchUrl, "", "GRAPH_WORKBENCH_URL must point at the workbench dev server");

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const desktop = await runPhaseOneChecks(browser, { width: 1440, height: 960 }, "dark");
  const narrow = await runNarrowChecks(browser);
  const evidence = { desktop, narrow };
  if (artifactDir) {
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(path.join(artifactDir, "phase-1-graph-route-regression.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await closeBrowserForRegression(browser);
}

async function runPhaseOneChecks(browser, viewport, theme) {
  const page = await openWorkbenchGraphPage(browser, viewport, theme);
  const evidence = {
    viewport: `${viewport.width}x${viewport.height}`,
    initial: await sigmaGlobalSnapshot(page),
    communitySummary: null,
    focusedCommunity: null,
    returnedGlobal: null,
    statePreservation: null,
    labelClick: null,
    routeCycles: null
  };

  assertSigmaGlobal(evidence.initial, "initial graph view");
  assert.equal(evidence.initial.oldDomGlobalNodeCount, 0, "initial Sigma global should not render old DOM global nodes");
  assert.equal(evidence.initial.communityButtonCount, 0, "initial Sigma global should not render circular community buttons");
  assert.ok(evidence.initial.communityRegionCount >= 1, "initial Sigma global should keep passive community regions");
  assert.ok(evidence.initial.communityLabelCount >= 1 && evidence.initial.communityLabelCount <= 8, "initial Sigma global should show 1-8 passive community labels");
  assert.ok(evidence.initial.edgeCount >= 1, "initial Sigma global should render relationship skeleton");

  evidence.communitySummary = await openCommunitySummaryFromRegion(page, "t1");
  assert.equal(evidence.communitySummary.route.renderer, "sigma-global", "community region selection should stay in Sigma global");
  assert.equal(evidence.communitySummary.drawerTestId, "graph-community-summary", "community region selection should open community summary");

  evidence.labelClick = await clickPassiveCommunityLabel(page);
  assert.equal(evidence.labelClick.drawerTestId, "graph-community-summary", "passive community label area should delegate to map hit handling");
  assert.equal(evidence.labelClick.route.renderer, "sigma-global", "passive label click should not enter a DOM control route");

  await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
  await waitForDomCommunity(page, "t1");
  evidence.focusedCommunity = await domCommunitySnapshot(page);
  assert.deepEqual(evidence.focusedCommunity.visibleNodes, T1_NODE_IDS, "enter community should use DOM/SVG community reading");
  assert.equal(evidence.focusedCommunity.sigmaRendererCount, 0, "community reading route should not keep Sigma global mounted");

  await clickReturnGlobal(page);
  await waitForSigmaGlobal(page);
  evidence.returnedGlobal = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(evidence.returnedGlobal, "return global");
  assert.equal(evidence.returnedGlobal.oldDomGlobalNodeCount, 0, "return global should not show old DOM full graph");
  assert.equal(evidence.returnedGlobal.communityButtonCount, 0, "return global should not reintroduce circular community controls");

  evidence.statePreservation = await runStatePreservationCheck(page);
  evidence.routeCycles = await runRouteCycleAccumulationCheck(page, "t1", 3);

  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, "phase-1-graph-route-desktop.png"), fullPage: true });
  }
  await page.close();
  return evidence;
}

async function runNarrowChecks(browser) {
  const page = await openWorkbenchGraphPage(browser, { width: 390, height: 844 }, "light");
  const initial = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(initial, "narrow initial graph view");
  assert.ok(initial.communityLabelCount >= 1 && initial.communityLabelCount <= 8, "narrow Sigma global should keep passive map labels");
  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, "phase-1-graph-route-narrow.png"), fullPage: true });
  }
  await page.close();
  return { viewport: "390x844", initial };
}

async function openWorkbenchGraphPage(browser, viewport, theme) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(({ theme }) => {
    window.localStorage.setItem("llm-wiki-agent-main-view", "graph");
    window.localStorage.setItem("llm-wiki-agent-theme", theme);
  }, { theme });
  await page.goto(workbenchUrl);
  await page.waitForSelector(".app-shell");
  const kbButton = page.getByRole("button", { name: /Phase 6 Workbench Test|phase-6-workbench/ });
  if (await kbButton.count() && await kbButton.first().isVisible()) await kbButton.first().click();
  const graphButton = page.getByRole("button", { name: /图谱/ });
  if (await graphButton.count() && await graphButton.first().isVisible() && await graphButton.first().isEnabled()) {
    await graphButton.first().click();
  }
  await page.waitForSelector(".graph-host");
  await waitForSigmaGlobal(page);
  const expectedGraphTheme = theme === "dark" ? "mo-ye" : "shan-shui";
  await page.waitForFunction((expectedGraphTheme) => {
    return document.querySelector(".graph-screen")?.dataset.graphTheme === expectedGraphTheme
      && document.querySelector(".sigma-global-renderer")?.dataset.theme === expectedGraphTheme;
  }, expectedGraphTheme);
  return page;
}

async function waitForSigmaGlobal(page) {
  await page.waitForSelector(".sigma-global-route[data-route='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer[data-renderer='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer canvas");
  await page.waitForSelector(".sigma-global-community-region");
  await page.waitForSelector(".sigma-global-community-label");
}

async function waitForDomCommunity(page, communityId) {
  await page.waitForSelector("[data-llm-wiki-graph-root='true']");
  await page.waitForFunction((communityId) => {
    return document.querySelector(".graph-host")?.dataset.llmWikiGraphFocus === `community:${communityId}`
      && document.querySelectorAll(".node").length > 0
      && !document.querySelector(".sigma-global-renderer");
  }, communityId);
  await waitForVisibleDomNodeIds(page, T1_NODE_IDS);
}

async function sigmaGlobalSnapshot(page) {
  return page.evaluate(() => {
    const sigma = document.querySelector(".sigma-global-renderer");
    const canvas = sigma?.querySelector("canvas");
    const graph = document.querySelector(".sigma-global-route");
    const labels = [...document.querySelectorAll(".sigma-global-community-label")];
    const regions = [...document.querySelectorAll(".sigma-global-community-region")];
    const nodeIds = [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((node) => node.getAttribute("data-node-id") || "")
      .filter(Boolean)
      .sort();
    const regionIds = regions.map((region) => region.getAttribute("data-community-id") || "").filter(Boolean).sort();
    const labelIds = labels.map((label) => label.getAttribute("data-community-id") || "").filter(Boolean).sort();
    return {
      route: graph?.getAttribute("data-route") || "",
      renderer: sigma?.getAttribute("data-renderer") || "",
      canvasCount: sigma?.querySelectorAll("canvas").length || 0,
      canvasBox: canvas ? (() => {
        const rect = canvas.getBoundingClientRect();
        const round = (value) => Math.round(value * 1000) / 1000;
        return {
          left: round(rect.left),
          top: round(rect.top),
          width: round(rect.width),
          height: round(rect.height)
        };
      })() : null,
      nodeHitTargetCount: document.querySelectorAll(".sigma-global-node-hit-target").length,
      nodeHitTargetIds: nodeIds,
      sigmaRouteCount: document.querySelectorAll(".sigma-global-route[data-route='sigma-global']").length,
      sigmaRendererCount: document.querySelectorAll(".sigma-global-renderer[data-renderer='sigma-global']").length,
      edgeCount: document.querySelectorAll("canvas").length,
      communityRegionCount: regions.length,
      communityRegionIds: regionIds,
      communityLabelCount: labels.length,
      communityLabelIds: labelIds,
      communityButtonCount: document.querySelectorAll(".sigma-global-community-wash, button.sigma-global-community-label, [role='button'].sigma-global-community-label").length,
      aggregationButtonCount: document.querySelectorAll(".sigma-global-aggregation-container").length,
      oldDomGlobalNodeCount: document.querySelectorAll(".node").length,
      labels: labels.map((label) => ({
        communityId: label.getAttribute("data-community-id") || "",
        ariaHidden: label.getAttribute("aria-hidden") || "",
        tabIndex: label instanceof HTMLElement ? label.tabIndex : null,
        pointerEvents: label instanceof HTMLElement ? getComputedStyle(label).pointerEvents : "",
        text: label.textContent || ""
      }))
    };
  });
}

async function domCommunitySnapshot(page) {
  return page.evaluate(() => ({
    focus: document.querySelector(".graph-host")?.dataset.llmWikiGraphFocus || "",
    sigmaRendererCount: document.querySelectorAll(".sigma-global-renderer").length,
    visibleNodes: [...document.querySelectorAll(".node")]
      .filter((node) => node.getAttribute("data-filter-state") !== "hidden")
      .map((node) => node.getAttribute("data-id"))
      .filter(Boolean)
      .sort(),
    toolbarReturnCount: [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("回全图")).length
  }));
}

async function runRouteCycleAccumulationCheck(page, communityId, cycles) {
  await closeDrawerIfOpen(page);
  await waitForSigmaGlobal(page);
  await openSearch(page);
  await setGraphSearchQuery(page, "");
  await page.waitForFunction(() => document.querySelectorAll(".sigma-global-node-hit-target").length > 1);
  const baseline = await sigmaGlobalSnapshot(page);
  const snapshots = [];

  for (let index = 0; index < cycles; index += 1) {
    const summary = await openCommunitySummaryFromRegion(page, communityId);
    assert.equal(summary.route.sigmaRouteCount, 1, `cycle ${index + 1}: should have one Sigma route before entering community`);
    await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
    await waitForDomCommunity(page, communityId);
    const focused = await domCommunitySnapshot(page);
    assert.equal(focused.sigmaRendererCount, 0, `cycle ${index + 1}: community route should not retain Sigma renderer`);
    assert.equal(focused.toolbarReturnCount, 1, `cycle ${index + 1}: community route should expose one return-global control`);

    await clickReturnGlobal(page);
    await waitForSigmaGlobal(page);
    const returned = await sigmaGlobalSnapshot(page);
    assertSigmaGlobal(returned, `cycle ${index + 1} return global`);
    assert.equal(returned.sigmaRouteCount, 1, `cycle ${index + 1}: should have one Sigma route after return`);
    assert.equal(returned.sigmaRendererCount, 1, `cycle ${index + 1}: should have one Sigma renderer after return`);
    assert.equal(returned.oldDomGlobalNodeCount, 0, `cycle ${index + 1}: should not accumulate old DOM global nodes`);
    assert.equal(returned.communityButtonCount, 0, `cycle ${index + 1}: should not reintroduce circular community controls`);
    assert.equal(returned.aggregationButtonCount, 0, `cycle ${index + 1}: should not show aggregation controls`);
    assert.deepEqual(returned.nodeHitTargetIds, baseline.nodeHitTargetIds, `cycle ${index + 1}: node hit targets should match the baseline set`);
    assert.deepEqual(returned.communityRegionIds, baseline.communityRegionIds, `cycle ${index + 1}: community regions should match the baseline set`);
    assert.deepEqual(returned.communityLabelIds, baseline.communityLabelIds, `cycle ${index + 1}: community labels should match the baseline set`);
    snapshots.push({ summary: summary.route, focused, returned });
  }

  return { cycles, baseline, snapshots };
}

async function openCommunitySummaryFromRegion(page, communityId) {
  await closeDrawerIfOpen(page);
  const point = await clickCommunityRegion(page, communityId);
  try {
    await page.waitForSelector('[data-testid="graph-community-summary"]');
  } catch (err) {
    const diagnostics = await communityClickDiagnostics(page, point, communityId);
    throw new assert.AssertionError({
      message: `community region click should open community summary: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "graph-community-summary",
      operator: "strictEqual"
    });
  }
  return {
    route: await sigmaGlobalSnapshot(page),
    drawerTestId: await drawerTestId(page)
  };
}

async function clickPassiveCommunityLabel(page) {
  const point = await page.locator(".sigma-global-community-label").first().evaluate((label) => {
    const rect = label.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('[data-testid="graph-community-summary"]');
  return {
    point: { x: round(point.x), y: round(point.y) },
    route: await sigmaGlobalSnapshot(page),
    drawerTestId: await drawerTestId(page)
  };
}

async function clickCommunityRegion(page, communityId) {
  const point = await findCommunityRegionPoint(page, communityId);
  await page.evaluate(() => {
    window.__llmWikiRegionClickProbe = [];
    for (const region of document.querySelectorAll(".sigma-global-community-region")) {
      region.addEventListener("click", (event) => {
        window.__llmWikiRegionClickProbe.push({
          communityId: region.getAttribute("data-community-id") || "",
          clientX: event.clientX,
          clientY: event.clientY
        });
      }, { once: true });
    }
  });
  await page.mouse.click(point.x, point.y);
  return point;
}

async function findCommunityRegionPoint(page, communityId) {
  return page.evaluate((communityId) => {
    const region = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(communityId)}"]`)
      || document.querySelector(".sigma-global-community-region");
    if (!region) throw new Error(`Missing Sigma community region ${communityId}`);
    const rect = region.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.5, 0.32],
      [0.32, 0.5],
      [0.68, 0.5],
      [0.5, 0.68]
    ];
    for (const [rx, ry] of candidates) {
      const x = rect.left + rect.width * rx;
      const y = rect.top + rect.height * ry;
      const hit = document.elementFromPoint(x, y);
      if (!hit?.closest?.(".sigma-global-node-hit-target")) return { x, y };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, communityId);
}

async function communityClickDiagnostics(page, point, communityId) {
  return page.evaluate(({ point, communityId }) => {
    const hit = document.elementFromPoint(point.x, point.y);
    const regions = [...document.querySelectorAll(".sigma-global-community-region")].map((region) => {
      const rect = region.getBoundingClientRect();
      return {
        communityId: region.getAttribute("data-community-id") || "",
        selected: region.getAttribute("data-selected") || "",
        pointerEvents: region instanceof HTMLElement ? getComputedStyle(region).pointerEvents : "",
        inlinePointerEvents: region instanceof HTMLElement ? region.style.pointerEvents : "",
        rect: {
          left: Math.round(rect.left * 1000) / 1000,
          top: Math.round(rect.top * 1000) / 1000,
          width: Math.round(rect.width * 1000) / 1000,
          height: Math.round(rect.height * 1000) / 1000
        }
      };
    });
    return {
      expectedCommunityId: communityId,
      point,
      hitTag: hit?.tagName || "",
      hitClass: hit instanceof Element ? hit.className : "",
      hitCommunityId: hit instanceof Element ? hit.closest(".sigma-global-community-region")?.getAttribute("data-community-id") || "" : "",
      probe: window.__llmWikiRegionClickProbe || [],
      drawerTestId: document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "",
      route: document.querySelector(".sigma-global-route")?.getAttribute("data-route") || "",
      renderer: document.querySelector(".sigma-global-renderer")?.getAttribute("data-renderer") || "",
      regions
    };
  }, { point, communityId });
}

async function runStatePreservationCheck(page) {
  await closeDrawerIfOpen(page);
  await waitForSigmaGlobal(page);

  await openSearch(page);
  await setGraphSearchQuery(page, "节点A");
  try {
    await page.waitForFunction(() => document.querySelector(".graph-search-status")?.textContent?.includes("1 个结果"));
  } catch (err) {
    const diagnostics = await searchDiagnostics(page);
    throw new assert.AssertionError({
      message: `graph search should find node A: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "1 个结果",
      operator: "strictEqual"
    });
  }
  await page.waitForSelector(".sigma-global-node-hit-target[data-node-id='A'][data-search-hit='true']");
  await clickNodeHitTarget(page, "A");
  await page.waitForSelector('[data-testid="graph-node-summary"]');
  const beforeDrag = await sigmaStateSnapshot(page);
  const drag = await dragSigmaGlobalNode(page, "A", { dx: 56, dy: 32 });
  try {
    await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-pinned") === "true");
  } catch (err) {
    const diagnostics = await dragDiagnostics(page, "A", drag);
    throw new assert.AssertionError({
      message: `dragging Sigma global node should pin node A: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "data-pinned=true",
      operator: "strictEqual"
    });
  }
  const afterDrag = await sigmaStateSnapshot(page);
  assertPointShifted(afterDrag.nodeABox, beforeDrag.nodeABox, "drag should move node A before it is treated as fixed");
  await waitForPersistedGraphPin(page, "wiki/entities/A.md");

  await page.locator('[data-testid="graph-node-summary"] button', { hasText: "打开详情" }).click();
  await page.waitForSelector(".graph-reader-drawer");
  await waitForDomCommunity(page, "t1");
  const focused = await domCommunitySnapshot(page);

  await clickReturnGlobal(page);
  await waitForSigmaGlobal(page);
  await page.waitForSelector('[data-testid="graph-node-summary"]');
  await page.waitForFunction(() => document.querySelector(".graph-search-input")?.value === "节点A");
  await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-pinned") === "true");
  await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-selected") === "true");
  const returned = await sigmaStateSnapshot(page);

  assert.equal(returned.drawerTestId, "graph-node-summary", "node summary should survive community return");
  assert.equal(returned.searchQuery, "节点A", "search query should survive community return");
  assert.equal(returned.nodeASelected, "true", "selected node should survive community return");
  assert.equal(returned.nodeAPinned, "true", "fixed node should survive community return");
  assertPointStable(returned.nodeABox, afterDrag.nodeABox, "dragged fixed node should remain at the released global position after community return");
  assert.equal(returned.oldDomGlobalNodeCount, 0, "state-preserving return should still use Sigma, not old DOM global");

  await page.reload();
  await waitForSigmaGlobal(page);
  const reloadedGlobal = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(reloadedGlobal, "reloaded graph view");
  assert.equal(reloadedGlobal.communityButtonCount, 0, "reload should not reintroduce circular community controls");
  assert.equal(reloadedGlobal.aggregationButtonCount, 0, "reload should not show aggregation UI");
  assert.equal(reloadedGlobal.oldDomGlobalNodeCount, 0, "reload should stay on Sigma, not old DOM global");
  await openSearch(page);
  await setGraphSearchQuery(page, "节点A");
  try {
    await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-pinned") === "true");
  } catch (err) {
    const diagnostics = await reloadPinDiagnostics(page, "A");
    throw new assert.AssertionError({
      message: `fixed node should survive reload: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "data-pinned=true",
      operator: "strictEqual"
    });
  }
  const reloaded = await sigmaStateSnapshot(page);
  assert.equal(reloaded.nodeAPinned, "true", "fixed node should survive a page reload");
  assertPointShifted(reloaded.nodeABox, beforeDrag.nodeABox, "reloaded fixed node should not fall back to its pre-drag position");

  return { drag, beforeDrag, afterDrag, focused, returned, reloadedGlobal, reloaded };
}

async function sigmaStateSnapshot(page) {
  return page.evaluate(() => {
    const nodeA = document.querySelector(".sigma-global-node-hit-target[data-node-id='A']");
    const nodeABox = nodeA ? (() => {
      const rect = nodeA.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 1000) / 1000,
        top: Math.round(rect.top * 1000) / 1000,
        width: Math.round(rect.width * 1000) / 1000,
        height: Math.round(rect.height * 1000) / 1000,
        centerX: Math.round((rect.left + rect.width / 2) * 1000) / 1000,
        centerY: Math.round((rect.top + rect.height / 2) * 1000) / 1000
      };
    })() : null;
    return {
      route: document.querySelector(".sigma-global-route")?.getAttribute("data-route") || "",
      renderer: document.querySelector(".sigma-global-renderer")?.getAttribute("data-renderer") || "",
      drawerTestId: document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "",
      searchQuery: document.querySelector(".graph-search-input")?.value || "",
      nodeASelected: nodeA?.getAttribute("data-selected") || "",
      nodeAPinned: nodeA?.getAttribute("data-pinned") || "",
      nodeABox,
      oldDomGlobalNodeCount: document.querySelectorAll(".node").length
    };
  });
}

async function searchDiagnostics(page) {
  return page.evaluate(() => ({
    searchState: document.querySelector(".graph-search")?.getAttribute("data-state") || "",
    searchOpen: document.querySelector(".sigma-global-route")?.getAttribute("data-search-open") || "",
    inputValue: document.querySelector(".graph-search-input")?.value || "",
    statusText: document.querySelector(".graph-search-status")?.textContent || "",
    nodeTargets: [...document.querySelectorAll(".sigma-global-node-hit-target")].map((target) => ({
      nodeId: target.getAttribute("data-node-id") || "",
      searchHit: target.getAttribute("data-search-hit") || "",
      selected: target.getAttribute("data-selected") || "",
      pinned: target.getAttribute("data-pinned") || ""
    }))
  }));
}

async function clickNodeHitTarget(page, nodeId) {
  const locator = page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`);
  await locator.waitFor();
  await locator.click({ force: true });
}

async function dragSigmaGlobalNode(page, nodeId, delta) {
  const locator = page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`);
  await locator.waitFor();
  await waitForStableNodeHitTarget(page, nodeId);
  const start = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  const end = { x: start.x + delta.dx, y: start.y + delta.dy };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.dx / 2, start.y + delta.dy / 2, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  return {
    start: { x: round(start.x), y: round(start.y) },
    end: { x: round(end.x), y: round(end.y) },
    delta
  };
}

async function waitForStableNodeHitTarget(page, nodeId) {
  await page.waitForFunction(async (nodeId) => {
    const target = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    if (!(target instanceof HTMLElement)) return false;
    const snapshot = () => {
      const rect = target.getBoundingClientRect();
      return {
        centerX: Math.round((rect.left + rect.width / 2) * 1000) / 1000,
        centerY: Math.round((rect.top + rect.height / 2) * 1000) / 1000
      };
    };
    const first = snapshot();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const second = snapshot();
    const hit = document.elementFromPoint(second.centerX, second.centerY);
    const hitNodeId = hit instanceof Element
      ? hit.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || ""
      : "";
    return hitNodeId === nodeId &&
      Math.abs(first.centerX - second.centerX) < 1 &&
      Math.abs(first.centerY - second.centerY) < 1;
  }, nodeId, { timeout: 5000 });
}

async function dragDiagnostics(page, nodeId, drag) {
  return page.evaluate(({ nodeId, drag }) => {
    const roundInPage = (value) => Math.round(value * 1000) / 1000;
    const target = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    const hit = document.elementFromPoint(drag.start.x, drag.start.y);
    return {
      drag,
      hitTag: hit?.tagName || "",
      hitClass: hit instanceof Element ? hit.className : "",
      hitNodeId: hit instanceof Element ? hit.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "" : "",
      targetPinned: target?.getAttribute("data-pinned") || "",
      targetSelected: target?.getAttribute("data-selected") || "",
      targetSearchHit: target?.getAttribute("data-search-hit") || "",
      targetBox: target instanceof HTMLElement ? (() => {
        const rect = target.getBoundingClientRect();
        return {
          left: roundInPage(rect.left),
          top: roundInPage(rect.top),
          width: roundInPage(rect.width),
          height: roundInPage(rect.height),
          centerX: roundInPage(rect.left + rect.width / 2),
          centerY: roundInPage(rect.top + rect.height / 2),
          pointerEvents: getComputedStyle(target).pointerEvents,
          touchAction: getComputedStyle(target).touchAction,
          userSelect: getComputedStyle(target).userSelect
        };
      })() : null,
      route: document.querySelector(".sigma-global-route")?.getAttribute("data-route") || "",
      renderer: document.querySelector(".sigma-global-renderer")?.getAttribute("data-renderer") || "",
      draggingNodeId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-dragging-node-id") || ""
    };
  }, { nodeId, drag });
}

async function reloadPinDiagnostics(page, nodeId) {
  return page.evaluate(async (nodeId) => {
    const currentGraphLayoutUrl = async () => {
      const response = await fetch("/api/knowledge-base");
      const payload = await response.json();
      const kbPath = payload?.active?.kb?.path || "";
      return kbPath ? `/api/graph/layout?kb=${encodeURIComponent(kbPath)}` : "/api/graph/layout";
    };
    const target = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    const layoutUrl = await currentGraphLayoutUrl();
    const layoutResponse = await fetch(layoutUrl);
    const layoutPayload = await layoutResponse.json().catch(() => null);
    return {
      nodeId,
      targetExists: Boolean(target),
      targetPinned: target?.getAttribute("data-pinned") || "",
      targetSelected: target?.getAttribute("data-selected") || "",
      targetSearchHit: target?.getAttribute("data-search-hit") || "",
      searchQuery: document.querySelector(".graph-search-input")?.value || "",
      statusText: document.querySelector(".graph-search-status")?.textContent || "",
      route: document.querySelector(".sigma-global-route")?.getAttribute("data-route") || "",
      renderer: document.querySelector(".sigma-global-renderer")?.getAttribute("data-renderer") || "",
      layoutUrl,
      layoutPins: layoutPayload?.layout?.pins || null,
      allTargets: [...document.querySelectorAll(".sigma-global-node-hit-target")].map((node) => ({
        id: node.getAttribute("data-node-id") || "",
        pinned: node.getAttribute("data-pinned") || "",
        selected: node.getAttribute("data-selected") || "",
        searchHit: node.getAttribute("data-search-hit") || ""
      }))
    };
  }, nodeId);
}

async function waitForPersistedGraphPin(page, pinKey) {
  try {
    await page.waitForFunction(async (pinKey) => {
      const currentGraphLayoutUrl = async () => {
        const response = await fetch("/api/knowledge-base");
        const payload = await response.json();
        const kbPath = payload?.active?.kb?.path || "";
        return kbPath ? `/api/graph/layout?kb=${encodeURIComponent(kbPath)}` : "/api/graph/layout";
      };
      const layoutUrl = await currentGraphLayoutUrl();
      const response = await fetch(layoutUrl);
      if (!response.ok) return false;
      const payload = await response.json();
      return Boolean(payload?.layout?.pins?.[pinKey]);
    }, pinKey, { timeout: 5000 });
  } catch (err) {
    const diagnostics = await page.evaluate(async (pinKey) => {
      const currentGraphLayoutUrl = async () => {
        const response = await fetch("/api/knowledge-base");
        const payload = await response.json();
        const kbPath = payload?.active?.kb?.path || "";
        return kbPath ? `/api/graph/layout?kb=${encodeURIComponent(kbPath)}` : "/api/graph/layout";
      };
      const layoutUrl = await currentGraphLayoutUrl();
      const response = await fetch(layoutUrl);
      const text = await response.text();
      return {
        pinKey,
        layoutUrl,
        ok: response.ok,
        status: response.status,
        body: text.slice(0, 500)
      };
    }, pinKey);
    throw new assert.AssertionError({
      message: `graph pin should be persisted before reload: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: `layout.pins[${pinKey}]`,
      operator: "strictEqual"
    });
  }
}

async function clickReturnGlobal(page) {
  await page.getByRole("button", { name: "回全图" }).click();
}

async function openSearch(page) {
  await page.locator(".graph-search-input").focus();
  await page.waitForFunction(() => document.querySelector(".graph-search")?.getAttribute("data-state") === "open");
}

async function setGraphSearchQuery(page, query) {
  await page.evaluate((query) => {
    const input = document.querySelector(".graph-search[data-state='open'] .graph-search-input");
    if (!(input instanceof HTMLInputElement)) throw new Error("Graph search input is not open");
    input.value = query;
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: query
    }));
  }, query);
}

async function drawerTestId(page) {
  return page.evaluate(() => document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "");
}

async function closeDrawerIfOpen(page) {
  const button = page.locator(".drawer-header button[aria-label='关闭']");
  if (await button.count()) {
    await button.first().click({ force: true });
    await page.waitForSelector(".drawer-panel-open", { state: "detached", timeout: 3000 }).catch(() => undefined);
  }
}

async function waitForVisibleDomNodeIds(page, expected) {
  await page.waitForFunction((expected) => {
    const actual = [...document.querySelectorAll(".node")]
      .filter((node) => node.getAttribute("data-filter-state") !== "hidden")
      .map((node) => node.getAttribute("data-id"))
      .filter(Boolean)
      .sort();
    return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
  }, expected, { timeout: 5000 });
}

function assertSigmaGlobal(snapshot, label) {
  assert.equal(snapshot.route, "sigma-global", `${label}: route should be Sigma global`);
  assert.equal(snapshot.renderer, "sigma-global", `${label}: renderer should be Sigma global`);
  assert.ok(snapshot.canvasCount >= 1, `${label}: Sigma canvas should exist`);
  assert.ok(snapshot.canvasBox?.width > 120 && snapshot.canvasBox?.height > 120, `${label}: Sigma canvas should be visible`);
  assert.equal(snapshot.aggregationButtonCount, 0, `${label}: no visible aggregation controls`);
  for (const labelInfo of snapshot.labels) {
    assert.equal(labelInfo.ariaHidden, "true", `${label}: community labels should be aria-hidden`);
    assert.equal(labelInfo.tabIndex, -1, `${label}: community labels should not be tab-focusable`);
    assert.equal(labelInfo.pointerEvents, "none", `${label}: community labels should be passive`);
  }
}

function assertPointStable(actual, expected, message) {
  assert.ok(actual, `${message}: missing actual node box`);
  assert.ok(expected, `${message}: missing expected node box`);
  assert.ok(Math.abs(actual.centerX - expected.centerX) <= 3, `${message}: x drifted from ${expected.centerX} to ${actual.centerX}`);
  assert.ok(Math.abs(actual.centerY - expected.centerY) <= 3, `${message}: y drifted from ${expected.centerY} to ${actual.centerY}`);
}

function assertPointShifted(actual, expected, message) {
  assert.ok(actual, `${message}: missing actual node box`);
  assert.ok(expected, `${message}: missing expected node box`);
  const dx = Math.abs(actual.centerX - expected.centerX);
  const dy = Math.abs(actual.centerY - expected.centerY);
  assert.ok(dx >= 20 || dy >= 20, `${message}: expected a visible move, got dx=${dx}, dy=${dy}`);
}

async function closeBrowserForRegression(browser) {
  let closed = false;
  const closePromise = browser.close()
    .then(() => {
      closed = true;
    })
    .catch(() => {
      closed = true;
    });
  await Promise.race([
    closePromise,
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
  const browserProcess = typeof browser.process === "function" ? browser.process() : null;
  if (!closed) browserProcess?.kill("SIGKILL");
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
