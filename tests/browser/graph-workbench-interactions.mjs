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
const T1_NODE_IDS = ["A", "B", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
const COMMUNITY_NODE_IDS = { t1: T1_NODE_IDS };
const NODE_CLICK_CANDIDATE_RATIOS = [
  [0.5, 0.5],
  [0.35, 0.5],
  [0.65, 0.5],
  [0.5, 0.35],
  [0.5, 0.65]
];

assert.notEqual(workbenchUrl, "", "GRAPH_WORKBENCH_URL must point at the workbench dev server");

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const normal = await runLayoutOnlyChecks(browser, { width: 1366, height: 768 }, "light", "normal-laptop");
  const desktop = await runFullVisualAcceptanceChecks(browser, { width: 1440, height: 960 }, "dark");
  const large = await runLayoutOnlyChecks(browser, { width: 1920, height: 1080 }, "light", "large-display");
  const narrow = await runNarrowChecks(browser);
  const reducedMotion = await runReducedMotionChecks(browser);
  const evidence = { normal, desktop, large, narrow, reducedMotion };
  if (artifactDir) {
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(path.join(artifactDir, "issue-138-graph-visual-acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await closeBrowserForRegression(browser);
}

async function runFullVisualAcceptanceChecks(browser, viewport, theme) {
  const page = await openWorkbenchGraphPage(browser, viewport, theme);
  const evidence = {
    viewport: `${viewport.width}x${viewport.height}`,
    initial: await sigmaGlobalSnapshot(page),
    layout: null,
    visualAcceptance: null,
    tuningControls: null,
    darkRelationLegend: null,
    globalHover: null,
    globalSelectedNode: null,
    communitySummary: null,
    selectedCommunityFocusEnhancement: null,
    focusedCommunity: null,
    communityHover: null,
    communityFilter: null,
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
  evidence.layout = await assertGraphLayout(page, `issue-138-${theme}-${viewport.width}x${viewport.height}-default`);
  evidence.visualAcceptance = await assertConservativeVisualAcceptance(page, "global-default");
  evidence.tuningControls = await runTuningControlCheck(page);
  if (theme === "dark") evidence.darkRelationLegend = await runDarkRelationLegendCheck(page);
  evidence.globalHover = await runGlobalHoverCheck(page, "A");
  evidence.globalSelectedNode = await runGlobalSelectedNodeCheck(page, "A");
  await clearGraphSearch(page);

  evidence.communitySummary = await openCommunitySummaryFromRegion(page, "t1");
  assert.equal(evidence.communitySummary.route.renderer, "sigma-global", "community region selection should stay in Sigma global");
  assert.equal(evidence.communitySummary.drawerTestId, "graph-community-summary", "community region selection should open community summary");
  evidence.selectedCommunityFocusEnhancement = await runSelectedCommunityFocusEnhancementCheck(page);

  evidence.labelClick = await clickPassiveCommunityLabel(page, "t1");
  assert.equal(evidence.labelClick.drawerTestId, "graph-community-summary", "passive community label area should delegate to map hit handling");
  assert.equal(evidence.labelClick.route.renderer, "sigma-global", "passive label click should not enter a DOM control route");

  evidence.communitySummary = await openCommunitySummaryFromRegion(page, "t1");
  await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
  await waitForSigmaCommunity(page, "t1");
  evidence.focusedCommunity = await sigmaCommunitySnapshot(page);
  assert.deepEqual(evidence.focusedCommunity.visibleNodes, T1_NODE_IDS, "enter community should use Sigma community reading");
  assert.equal(evidence.focusedCommunity.sigmaRendererCount, 1, "community reading route should keep Sigma mounted");
  assert.equal(evidence.focusedCommunity.oldDomNodeCount, 0, "community reading route should not fall back to DOM/SVG");
  evidence.focusedCommunity.defaultVisual = await edgeVisualSummary(page);
  assertCommunityStructureVisible(evidence.focusedCommunity.defaultVisual, "desktop community default");
  evidence.communityHover = await runCommunityHoverCheck(page, "A", "B");
  evidence.communityFilter = await runCommunityFilterCheck(page, "source", "D");
  evidence.visualAcceptance.community = await assertConservativeVisualAcceptance(page, "community-default");
  evidence.communityMultiSelect = await runCommunityNodeMultiSelectCheck(page);

  await clickReturnGlobal(page);
  await waitForSigmaGlobal(page);
  evidence.returnedGlobal = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(evidence.returnedGlobal, "return global");
  assert.equal(evidence.returnedGlobal.oldDomGlobalNodeCount, 0, "return global should not show old DOM full graph");
  assert.equal(evidence.returnedGlobal.communityButtonCount, 0, "return global should not reintroduce circular community controls");

  evidence.statePreservation = await runStatePreservationCheck(page);
  evidence.routeCycles = await runRouteCycleAccumulationCheck(page, "t1", 3);

  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, "issue-138-graph-visual-acceptance-desktop.png"), fullPage: true });
  }
  await page.close();
  return evidence;
}

async function runNarrowChecks(browser) {
  const page = await openWorkbenchGraphPage(browser, { width: 390, height: 844 }, "light");
  const initial = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(initial, "narrow initial graph view");
  assert.ok(initial.communityLabelCount >= 1 && initial.communityLabelCount <= 8, "narrow Sigma global should keep passive map labels");
  const layout = await assertGraphLayout(page, "narrow-global-default");
  const visualAcceptance = await assertConservativeVisualAcceptance(page, "narrow-global-default");
  const controls = await runNarrowControlLayoutChecks(page);
  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, "issue-138-graph-visual-acceptance-narrow.png"), fullPage: true });
  }
  await page.close();
  return { viewport: "390x844", initial, layout, visualAcceptance, controls };
}

async function runLayoutOnlyChecks(browser, viewport, theme, label) {
  const page = await openWorkbenchGraphPage(browser, viewport, theme);
  const initial = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(initial, `${label} initial graph view`);
  const layout = await assertGraphLayout(page, `${label}-global-default`);
  const visualAcceptance = await assertConservativeVisualAcceptance(page, `${label}-global-default`);
  const interactions = await runViewportInteractionLayoutChecks(page, label);
  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, `issue-138-graph-visual-acceptance-${label}.png`), fullPage: true });
  }
  await page.close();
  return { viewport: `${viewport.width}x${viewport.height}`, theme, initial, layout, visualAcceptance, interactions };
}

async function runViewportInteractionLayoutChecks(page, label) {
  const globalHover = await runGlobalHoverCheck(page, "A");
  const globalSelectedNode = await runGlobalSelectedNodeCheck(page, "A");
  const search = await runGraphSearchLayoutCheck(page, label);
  await clearGraphSearch(page);
  const selectedCommunity = await openCommunitySummaryFromRegion(page, "t1");
  await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
  await waitForSigmaCommunity(page, "t1");
  const communityDefault = await sigmaCommunitySnapshot(page);
  assert.deepEqual(communityDefault.visibleNodes, T1_NODE_IDS, `${label}: community default should show the focused community nodes`);
  const communityDefaultLayout = await assertGraphLayout(page, `${label}-community-default`);
  const communityDefaultVisual = await edgeVisualSummary(page);
  assertCommunityStructureVisible(communityDefaultVisual, `${label}: community default`);
  const communityHover = await runCommunityHoverCheck(page, "A", "B");
  const communityFilter = await runCommunityFilterCheck(page, "source", "D");
  const communityMultiSelect = await runCommunityNodeMultiSelectCheck(page);
  await clickReturnGlobal(page);
  await waitForSigmaGlobal(page);
  const returnedGlobal = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(returnedGlobal, `${label}: return global after community layout checks`);
  return {
    label,
    globalHover,
    globalSelectedNode,
    search,
    selectedCommunity,
    communityDefault,
    communityDefaultLayout,
    communityDefaultVisual,
    communityHover,
    communityFilter,
    communityMultiSelect,
    returnedGlobal
  };
}

async function runNarrowControlLayoutChecks(page) {
  await openEdgeTuningPanel(page);
  const tuningLayout = await assertGraphLayout(page, "narrow-tuning-panel-open");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#graph-edge-tuning-panel", { state: "detached" });
  const search = await runGraphSearchLayoutCheck(page, "narrow");
  await clearGraphSearch(page);
  return { tuningLayout, search };
}

async function runGraphSearchLayoutCheck(page, label) {
  await closeDrawerIfOpen(page);
  await waitForSigmaGlobal(page);
  await openSearch(page);
  await setGraphSearchQuery(page, "节点A");
  try {
    await page.waitForSelector(".sigma-global-node-hit-target[data-node-id='A'][data-search-hit='true']");
  } catch (err) {
    const diagnostics = await searchDiagnostics(page);
    throw new assert.AssertionError({
      message: `${label}: graph search should expose node A as a visible hit: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "node A search hit",
      operator: "strictEqual"
    });
  }
  const layout = await assertGraphLayout(page, `${label}-search-node-a`);
  const diagnostics = await searchDiagnostics(page);
  return { diagnostics, layout };
}

async function runReducedMotionChecks(browser) {
  const page = await openWorkbenchGraphPage(browser, { width: 1366, height: 768 }, "light", {
    reducedMotion: true,
    query: "?graphTest=reduced"
  });
  const initial = await sigmaGlobalSnapshot(page);
  assertSigmaGlobal(initial, "reduced-motion initial graph view");
  const before = await reducedMotionSnapshot(page);
  const beforeVisual = await edgeVisualSummary(page);

  const summary = await openCommunitySummaryFromRegion(page, "t1");
  await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
  await waitForSigmaCommunity(page, "t1");
  const community = await sigmaCommunitySnapshot(page);
  const after = await reducedMotionSnapshot(page);
  const afterVisual = await edgeVisualSummary(page);
  assert.equal(after.prefersReducedMotion, true, "browser should emulate reduced motion");
  assert.equal(after.viewTransition, "", "reduced motion should not leave a visible view transition running");
  assert.equal(community.communityFocusId, "t1", "reduced motion should still land in community reading");
  assert.ok(community.visibleNodes.length >= 2, "reduced motion should preserve the final visible community layer");
  assert.notEqual(afterVisual.edgeCount, beforeVisual.edgeCount, "reduced motion should still apply the final community edge set");
  assertCommunityStructureVisible(afterVisual, "reduced motion community");

  if (artifactDir) {
    await page.screenshot({ path: path.join(artifactDir, "issue-138-graph-visual-acceptance-reduced-motion.png"), fullPage: true });
  }
  await page.close();
  return { viewport: "1366x768", initial, before, beforeVisual, summary: summary.summary, community, after, afterVisual };
}

async function openWorkbenchGraphPage(browser, viewport, theme, options = {}) {
  const page = await browser.newPage({ viewport });
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ theme }) => {
    window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE__ = true;
    window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE_FETCHES__ = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const startedAt = Date.now();
      try {
        const response = await originalFetch(...args);
        const clone = response.clone();
        clone.text().then((text) => {
          const log = window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE_FETCHES__;
          log.push({ url, status: response.status, ok: response.ok, length: text.length, sample: text.slice(0, 120), ms: Date.now() - startedAt });
          if (log.length > 30) log.splice(0, log.length - 30);
        }).catch((error) => {
          const log = window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE_FETCHES__;
          log.push({ url, error: String(error), ms: Date.now() - startedAt });
          if (log.length > 30) log.splice(0, log.length - 30);
        });
        return response;
      } catch (error) {
        const log = window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE_FETCHES__;
        log.push({ url, error: String(error), ms: Date.now() - startedAt });
        if (log.length > 30) log.splice(0, log.length - 30);
        throw error;
      }
    };
    window.localStorage.setItem("llm-wiki-agent-main-view", "graph");
    window.localStorage.setItem("llm-wiki-agent-theme", theme);
  }, { theme });
  await page.goto(`${workbenchUrl}${options.query ?? ""}`);
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

async function assertGraphLayout(page, label) {
  await waitForBrowserLayoutFrame(page, 2);
  const snapshot = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 1000) / 1000,
        top: Math.round(rect.top * 1000) / 1000,
        right: Math.round(rect.right * 1000) / 1000,
        bottom: Math.round(rect.bottom * 1000) / 1000,
        width: Math.round(rect.width * 1000) / 1000,
        height: Math.round(rect.height * 1000) / 1000
      };
    };
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const edgeSummary = (() => {
      const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-visual-summary") || "";
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })();
    const toolbarButtons = [...document.querySelectorAll(".graph-shell-toolbar-button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim() || "",
        left: Math.round(rect.left * 1000) / 1000,
        right: Math.round(rect.right * 1000) / 1000,
        width: Math.round(rect.width * 1000) / 1000
      };
    });
    const graphLabels = [...document.querySelectorAll(".sigma-global-node-hit-target[data-label-visible='true'], .sigma-global-community-label")]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          visibleTextElement: element.classList.contains("sigma-global-community-label"),
          className: element.getAttribute("class") || "",
          text: element.textContent?.trim() || element.getAttribute("data-node-id") || element.getAttribute("data-community-id") || "",
          left: Math.round(rect.left * 1000) / 1000,
          top: Math.round(rect.top * 1000) / 1000,
          right: Math.round(rect.right * 1000) / 1000,
          bottom: Math.round(rect.bottom * 1000) / 1000,
          centerX: Math.round((rect.left + rect.width / 2) * 1000) / 1000,
          centerY: Math.round((rect.top + rect.height / 2) * 1000) / 1000,
          width: Math.round(rect.width * 1000) / 1000,
          height: Math.round(rect.height * 1000) / 1000
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      viewportWidth,
      viewportHeight,
      scrollWidth,
      bodyScrollWidth,
      overflowX: Math.max(scrollWidth, bodyScrollWidth) - viewportWidth,
      appBodyDrawerWidth: getComputedStyle(document.querySelector(".app-body") ?? document.documentElement).getPropertyValue("--drawer-width").trim(),
      mainViewContent: rectFor(".main-view-content"),
      mainViewContentPaddingRight: (() => {
        const element = document.querySelector(".main-view-content");
        return element instanceof HTMLElement ? getComputedStyle(element).paddingRight : "";
      })(),
      graphScreen: rectFor(".graph-screen"),
      toolbar: rectFor(".graph-shell-toolbar"),
      stage: rectFor(".graph-stage"),
      drawer: rectFor(".drawer-panel-open"),
      tuningPanel: rectFor(".graph-edge-tuning-panel"),
      toolbarButtons,
      graphLabels,
      emphasizedLineBounds: edgeSummary?.emphasizedLineBounds ?? null
    };
  });

  assert.ok(snapshot.overflowX <= 2, `${label}: page should not horizontally overflow (${snapshot.overflowX}px)`);
  assert.ok(snapshot.toolbar?.width > 120, `${label}: toolbar should be visible`);
  assert.ok(snapshot.stage?.width > 120 && snapshot.stage?.height > 120, `${label}: graph stage should be visible`);
  assert.ok((snapshot.toolbar?.left ?? 0) >= -1 && (snapshot.toolbar?.right ?? 0) <= snapshot.viewportWidth + 1, `${label}: toolbar should stay inside the viewport`);
  assert.ok((snapshot.stage?.left ?? 0) >= -1 && (snapshot.stage?.right ?? 0) <= snapshot.viewportWidth + 1, `${label}: graph stage should stay inside the viewport`);
  assert.ok(
    (snapshot.toolbar?.bottom ?? 0) <= (snapshot.stage?.top ?? Number.POSITIVE_INFINITY) + 18,
    `${label}: toolbar should not overlap the graph stage`
  );
  for (const button of snapshot.toolbarButtons) {
    assert.ok(button.left >= -1 && button.right <= snapshot.viewportWidth + 1, `${label}: toolbar button ${button.text} should stay inside the viewport`);
  }
  if (snapshot.tuningPanel) {
    assert.ok(snapshot.tuningPanel.left >= -1 && snapshot.tuningPanel.right <= snapshot.viewportWidth + 1, `${label}: tuning panel should stay inside the viewport`);
  }
  let visibleGraphLabelCount = 0;
  for (const graphLabel of snapshot.graphLabels) {
    const visibleGraphLabel = snapshot.stage ? layoutRectIntersection(graphLabel, snapshot.stage) : graphLabel;
    if (!visibleGraphLabel) continue;
    visibleGraphLabelCount += 1;
    assert.ok(visibleGraphLabel.left >= -1 && visibleGraphLabel.right <= snapshot.viewportWidth + 1, `${label}: graph label ${graphLabel.text} should stay horizontally inside the viewport (${JSON.stringify({ graphLabel, visibleGraphLabel })})`);
    assert.ok(visibleGraphLabel.top >= -1 && visibleGraphLabel.bottom <= snapshot.viewportHeight + 1, `${label}: graph label ${graphLabel.text} should stay vertically inside the viewport (${JSON.stringify({ graphLabel, visibleGraphLabel })})`);
    if (snapshot.toolbar) {
      assert.ok(visibleGraphLabel.top >= snapshot.toolbar.bottom - 1, `${label}: graph label ${graphLabel.text} should stay below the graph toolbar (${JSON.stringify({ graphLabel, visibleGraphLabel, toolbar: snapshot.toolbar })})`);
    }
    if (snapshot.stage) {
      assert.ok(visibleGraphLabel.bottom <= snapshot.stage.bottom + 4, `${label}: graph label ${graphLabel.text} should stay above the graph stage bottom (${JSON.stringify({ graphLabel, visibleGraphLabel, stage: snapshot.stage })})`);
    }
    if (snapshot.tuningPanel) {
      assert.equal(layoutRectsOverlap(visibleGraphLabel, snapshot.tuningPanel), false, `${label}: graph label ${graphLabel.text} should not sit under the enhancement panel (${JSON.stringify({ graphLabel, visibleGraphLabel, tuningPanel: snapshot.tuningPanel })})`);
    }
  }
  if (snapshot.graphLabels.length > 0) {
    assert.ok(visibleGraphLabelCount >= 1, `${label}: at least one graph label should remain visibly checkable (${JSON.stringify({ graphLabels: snapshot.graphLabels, stage: snapshot.stage })})`);
  }
  if (snapshot.emphasizedLineBounds) {
    assert.ok(snapshot.emphasizedLineBounds.left >= -1 && snapshot.emphasizedLineBounds.right <= snapshot.viewportWidth + 1, `${label}: highlighted relations should stay horizontally inside the viewport (${JSON.stringify(snapshot.emphasizedLineBounds)})`);
    assert.ok(snapshot.emphasizedLineBounds.top >= -1 && snapshot.emphasizedLineBounds.bottom <= snapshot.viewportHeight + 1, `${label}: highlighted relations should stay vertically inside the viewport (${JSON.stringify(snapshot.emphasizedLineBounds)})`);
  }
  if (snapshot.drawer) {
    assert.ok(snapshot.drawer.left >= -1 && snapshot.drawer.right <= snapshot.viewportWidth + 1, `${label}: drawer should stay inside the viewport`);
    assert.ok(snapshot.drawer.width > 120 && snapshot.drawer.height > 120, `${label}: drawer should remain readable`);
    const sideBySideDrawer = snapshot.stage && snapshot.drawer.left > snapshot.stage.left + 1;
    if (sideBySideDrawer) {
      assert.ok(
        (snapshot.toolbar?.right ?? 0) <= snapshot.drawer.left + 1,
        `${label}: toolbar should leave room for the open drawer (${JSON.stringify({ appBodyDrawerWidth: snapshot.appBodyDrawerWidth, mainViewContent: snapshot.mainViewContent, mainViewContentPaddingRight: snapshot.mainViewContentPaddingRight, graphScreen: snapshot.graphScreen, toolbar: snapshot.toolbar, drawer: snapshot.drawer })})`
      );
      assert.ok(
        (snapshot.stage?.right ?? 0) <= snapshot.drawer.left + 1,
        `${label}: graph stage should leave room for the open drawer (${JSON.stringify({ appBodyDrawerWidth: snapshot.appBodyDrawerWidth, mainViewContent: snapshot.mainViewContent, mainViewContentPaddingRight: snapshot.mainViewContentPaddingRight, graphScreen: snapshot.graphScreen, stage: snapshot.stage, drawer: snapshot.drawer })})`
      );
      for (const button of snapshot.toolbarButtons) {
        assert.ok(button.right <= snapshot.drawer.left + 1, `${label}: toolbar button ${button.text} should not sit under the drawer`);
      }
      for (const graphLabel of snapshot.graphLabels) {
        const visibleGraphLabel = snapshot.stage ? layoutRectIntersection(graphLabel, snapshot.stage) : graphLabel;
        if (!visibleGraphLabel) continue;
        const labelEdge = visibleGraphLabel.right;
        const tolerance = 1;
        assert.ok(labelEdge <= snapshot.drawer.left + tolerance, `${label}: graph label ${graphLabel.text} should not sit under the drawer (${JSON.stringify({ graphLabel, visibleGraphLabel, drawer: snapshot.drawer, tolerance })})`);
      }
      if (snapshot.emphasizedLineBounds) {
        assert.ok(
          snapshot.emphasizedLineBounds.right <= snapshot.drawer.left + 1,
          `${label}: highlighted relations should not sit under the drawer (${JSON.stringify({ emphasizedLineBounds: snapshot.emphasizedLineBounds, drawer: snapshot.drawer })})`
        );
      }
    }
  }
  return snapshot;
}

function layoutRectsOverlap(left, right) {
  if (!left || !right) return false;
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function layoutRectIntersection(left, right) {
  if (!layoutRectsOverlap(left, right)) return null;
  const clipped = {
    ...left,
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom)
  };
  return {
    ...clipped,
    width: Math.max(0, clipped.right - clipped.left),
    height: Math.max(0, clipped.bottom - clipped.top),
    centerX: clipped.left + Math.max(0, clipped.right - clipped.left) / 2,
    centerY: clipped.top + Math.max(0, clipped.bottom - clipped.top) / 2
  };
}

async function runWidenedGraphDrawerLayoutCheck(page, label) {
  const before = await drawerPanelWidth(page);
  const handle = page.getByRole("separator", { name: /调整预览区宽度/ });
  await handle.focus();
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((before) => {
    const drawer = document.querySelector(".drawer-panel-open");
    if (!(drawer instanceof HTMLElement)) return false;
    return drawer.getBoundingClientRect().width >= before + 80;
  }, before);
  const layout = await assertGraphLayout(page, label);
  assert.ok((layout.drawer?.width ?? 0) > before, `${label}: drawer should be widened by the resize control`);
  return layout;
}

async function resetGraphDrawerWidth(page) {
  const handle = page.getByRole("separator", { name: /调整预览区宽度/ });
  await handle.focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(() => {
    const drawer = document.querySelector(".drawer-panel-open");
    if (!(drawer instanceof HTMLElement)) return false;
    return Math.abs(drawer.getBoundingClientRect().width - 420) <= 2;
  });
}

async function drawerPanelWidth(page) {
  return page.locator(".drawer-panel-open").evaluate((drawer) => drawer.getBoundingClientRect().width);
}

async function assertConservativeVisualAcceptance(page, label) {
  const snapshot = await page.evaluate(() => {
    const canvas = document.querySelector(".sigma-global-renderer canvas");
    const canvasRect = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
    const domEdgePaths = [...document.querySelectorAll("path.edge")].map((edge) => edge.getAttribute("d") || "");
    const rootStyle = getComputedStyle(document.documentElement);
    const backgroundColor = (selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement ? getComputedStyle(element).backgroundColor : "";
    };
    return {
      route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
      renderer: document.querySelector(".sigma-global-renderer")?.getAttribute("data-renderer") || "",
      theme: document.querySelector(".sigma-global-renderer")?.getAttribute("data-theme") || "",
      canvasCount: document.querySelectorAll(".sigma-global-renderer canvas").length,
      canvasBox: canvasRect ? {
        width: Math.round(canvasRect.width * 1000) / 1000,
        height: Math.round(canvasRect.height * 1000) / 1000
      } : null,
      domEdgePathCount: domEdgePaths.length,
      curvedDomEdgePathCount: domEdgePaths.filter((path) => /[CQ]/.test(path)).length,
      oldDomNodeCount: document.querySelectorAll(".node").length,
      communityRegionCount: document.querySelectorAll(".sigma-global-community-region").length,
      communityLabelCount: document.querySelectorAll(".sigma-global-community-label").length,
      lightBackgroundCandidates: [
        { name: "--app-bg", color: rootStyle.getPropertyValue("--app-bg").trim() },
        { name: "--app-surface", color: rootStyle.getPropertyValue("--app-surface").trim() },
        { name: "body", color: backgroundColor("body") },
        { name: ".app-shell", color: backgroundColor(".app-shell") },
        { name: ".shell-main", color: backgroundColor(".shell-main") },
        { name: ".graph-screen", color: backgroundColor(".graph-screen") },
        { name: ".graph-stage", color: backgroundColor(".graph-stage") }
      ]
    };
  });
  const visualSummary = await edgeVisualSummary(page);
  assert.equal(snapshot.route, "sigma-global", `${label}: graph should stay on Sigma route`);
  assert.equal(snapshot.renderer, "sigma-global", `${label}: graph should use Sigma renderer`);
  assert.ok(snapshot.canvasCount >= 1, `${label}: Sigma canvas should be present`);
  assert.ok(snapshot.canvasBox?.width > 120 && snapshot.canvasBox?.height > 120, `${label}: Sigma canvas should be visible (${JSON.stringify(snapshot.canvasBox)})`);
  assert.equal(snapshot.oldDomNodeCount, 0, `${label}: old DOM node route should not be present`);
  assert.equal(snapshot.domEdgePathCount, 0, `${label}: browser route should not render old SVG relation marks`);
  assert.equal(snapshot.curvedDomEdgePathCount, 0, `${label}: browser route should not show curved DOM relation marks`);
  assert.ok(visualSummary.edgeCount >= 1, `${label}: Sigma graph should expose actual relation styling`);
  assert.equal(visualSummary.geometry?.edgeShape, "straight", `${label}: Sigma relation display should stay direct`);
  assert.equal(visualSummary.geometry?.curvedEdgeProgram, false, `${label}: Sigma route should not use bent relation rendering`);
  assert.ok((visualSummary.all.maxSize ?? 0) <= 4, `${label}: relation visual weight should stay conservative, not heavy main-route styling`);
  assert.ok((visualSummary.all.maxAlpha ?? 0) <= 0.7, `${label}: relation opacity should stay within the conservative Sigma range`);
  if (snapshot.theme === "shan-shui") {
    const brightestBackground = Math.max(
      ...snapshot.lightBackgroundCandidates
        .map((candidate) => colorLuminance(candidate.color))
        .filter((luminance) => luminance !== null)
    );
    assert.ok(
      brightestBackground >= 0.72,
      `${label}: light graph theme should remain bright (${JSON.stringify(snapshot.lightBackgroundCandidates)})`
    );
  }
  return { ...snapshot, edgeVisualSummary: visualSummary };
}

async function runTuningControlCheck(page) {
  const baselineVisual = await edgeVisualSummary(page);
  await openEdgeTuningPanel(page);
  const openLayout = await assertGraphLayout(page, "tuning-panel-open");
  const panelText = await page.locator("#graph-edge-tuning-panel").textContent();
  assert.match(panelText ?? "", /默认已分清主次/, "tuning panel should describe the readable default state");
  assert.match(panelText ?? "", /语义强调/, "semantic emphasis should stay visible as an enhancement name");
  assert.match(panelText ?? "", /突出对比和矛盾/, "semantic emphasis should be worded as a visible result");
  assert.match(panelText ?? "", /聚焦点亮/, "focus highlight should stay visible as an enhancement name");
  assert.match(panelText ?? "", /点亮当前范围/, "focus highlight should be worded as a visible result");
  assert.doesNotMatch(panelText ?? "", /调参|实现术语/, "tuning panel should avoid implementation-facing wording");

  const semantic = page.getByRole("checkbox", { name: /语义强调/ });
  const focus = page.getByRole("checkbox", { name: /聚焦点亮/ });
  await semantic.check();
  const semanticVisual = await waitForEdgeVisualSummaryStyle(page, { semanticEmphasis: true });
  assertSemanticEnhancementVisible(baselineVisual, semanticVisual);
  await focus.check();
  const enabledVisual = await waitForEdgeVisualSummaryStyle(page, { semanticEmphasis: true, focusHighlight: true });
  const enabled = await page.evaluate(() => ({
    semantic: document.querySelector('input[aria-label^="语义强调"]')?.checked ?? false,
    focus: document.querySelector('input[aria-label^="聚焦点亮"]')?.checked ?? false,
    storage: window.localStorage.getItem("llm-wiki.graph.edge-style")
  }));
  assert.equal(enabled.semantic, true, "semantic emphasis should be enableable");
  assert.equal(enabled.focus, true, "focus highlight should be enableable");
  assert.match(enabled.storage ?? "", /semanticEmphasis/, "global enhancement settings should persist outside community reading");

  await focus.uncheck();
  await semantic.uncheck();
  await page.keyboard.press("Escape");
  await page.waitForSelector("#graph-edge-tuning-panel", { state: "detached" });
  const reset = await page.evaluate(() => window.localStorage.getItem("llm-wiki.graph.edge-style"));
  assert.equal(reset, null, "disabling both enhancement controls should restore the default readable state");
  return { panelText: panelText?.trim() || "", baselineVisual, semanticVisual, enabledVisual, enabled, openLayout };
}

async function runDarkRelationLegendCheck(page) {
  await ensureGraphToolbarPanel(page, "图例", "legend");
  const layout = await assertGraphLayout(page, "dark-relation-legend-open");
  const lineSummary = await edgeVisualSummary(page);
  const colors = await page.evaluate(() => {
    const colorFor = (selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement ? getComputedStyle(element).borderTopColor : "";
    };
    return {
      neutral: colorFor(".graph-edge-legend-relation.relation-dependency .graph-edge-legend-swatch"),
      contrast: colorFor(".graph-edge-legend-relation.relation-contrast .graph-edge-legend-swatch"),
      conflict: colorFor(".graph-edge-legend-relation.relation-conflict .graph-edge-legend-swatch")
    };
  });
  assert.notEqual(colors.neutral, "", "dark legend should expose neutral relation color");
  assert.notEqual(colors.contrast, "", "dark legend should expose contrast relation color");
  assert.notEqual(colors.conflict, "", "dark legend should expose conflict relation color");
  assert.notEqual(colors.neutral, colors.contrast, "dark contrast relation color should not collapse into neutral gray");
  assert.notEqual(colors.neutral, colors.conflict, "dark conflict relation color should not collapse into neutral gray");
  assert.notEqual(colors.contrast, colors.conflict, "dark semantic relation colors should remain distinguishable");
  assertActualRelationLineColorsDistinct(lineSummary, "dark theme");
  await closeGraphToolbarPanel(page);
  return { colors, lineSummary, layout };
}

async function runSelectedCommunityFocusEnhancementCheck(page) {
  const baselineVisual = await edgeVisualSummary(page);
  await openEdgeTuningPanel(page);
  const openLayout = await assertGraphLayout(page, "selected-community-focus-enhancement-open");
  const focus = page.getByRole("checkbox", { name: /聚焦点亮/ });
  await focus.check();
  const focusedVisual = await waitForEdgeVisualSummaryStyle(page, { focusHighlight: true });
  assertFocusEnhancementVisible(baselineVisual, focusedVisual);
  await focus.uncheck();
  const resetVisual = await waitForEdgeVisualSummaryStyle(page, { focusHighlight: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#graph-edge-tuning-panel", { state: "detached" });
  return { baselineVisual, focusedVisual, resetVisual, openLayout };
}

async function runGlobalHoverCheck(page, nodeId) {
  await waitForSigmaGlobal(page);
  const beforeVisual = await edgeVisualSummary(page);
  const point = await sigmaNodeClickPoint(page, nodeId);
  await page.mouse.move(point.x, point.y);
  let focusedNodeVisual;
  let focusedVisual;
  try {
    focusedNodeVisual = await waitForNodeVisualFocusDepth(page, nodeId, "focus");
    focusedVisual = await waitForEdgeFocusDepth(page, "first");
  } catch (error) {
    throw new assert.AssertionError({
      message: `global default hover should focus a real node. Diagnostics: ${JSON.stringify(await globalNodeClickDiagnostics(page, point, nodeId))}`,
      actual: error,
      expected: "focused node visual",
      operator: "strictEqual"
    });
  }
  const snapshot = await page.evaluate((nodeId) => {
    return {
      nodeId,
      drawerTestId: document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "",
      readerOpen: Boolean(document.querySelector(".graph-reader-drawer")),
      searchQuery: document.querySelector(".graph-search-input")?.value || ""
    };
  }, nodeId);
  assert.equal(focusedNodeVisual.id, nodeId, "global default hover should target a real visible node");
  assert.equal(focusedNodeVisual.selected, false, "global hover should not change selection");
  assert.equal(focusedNodeVisual.searchHit, false, "global default hover should not depend on search visibility");
  assert.ok((focusedVisual.focusDepths?.first?.count ?? 0) >= 1, "global hover should visibly strengthen first-order relations");
  assert.ok((focusedVisual.focusDepths?.none?.count ?? 0) >= 1, "global hover should leave unrelated context present instead of hiding the whole graph");
  assert.equal(snapshot.drawerTestId, "", "global hover should not open a drawer");
  assert.equal(snapshot.readerOpen, false, "global hover should not open node reading");
  assert.equal(snapshot.searchQuery, "", "global hover should be verified from the default graph state, not a search-filtered state");
  const layout = await assertGraphLayout(page, `global-hover-${nodeId}`);
  return { point: { x: round(point.x), y: round(point.y) }, snapshot, beforeVisual, focusedVisual, focusedNodeVisual, layout };
}

async function runGlobalSelectedNodeCheck(page, nodeId) {
  await waitForSigmaGlobal(page);
  const point = await clickSigmaNode(page, nodeId);
  try {
    await page.waitForSelector('[data-testid="graph-node-summary"]');
  } catch (error) {
    throw new assert.AssertionError({
      message: `global node click should open node summary. Diagnostics: ${JSON.stringify(await globalNodeClickDiagnostics(page, point, nodeId))}`,
      actual: error,
      expected: "graph-node-summary",
      operator: "strictEqual"
    });
  }
  const snapshot = await page.evaluate((nodeId) => {
    const target = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    return {
      nodeId,
      selected: target?.getAttribute("data-selected") || "",
      drawerTestId: document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "",
      title: document.querySelector(".drawer-panel-open h2")?.textContent || document.querySelector(".drawer-panel-open .drawer-title span")?.textContent || ""
    };
  }, nodeId);
  assert.equal(snapshot.selected, "true", "global node click should fix the selected node");
  assert.equal(snapshot.drawerTestId, "graph-node-summary", "global node click should open the node summary drawer");
  const selectedVisual = await waitForEdgeFocusDepth(page, "first");
  assertSelectedNodeRelationFocusVisible(selectedVisual, `global selected node ${nodeId}`);
  const defaultLayout = await assertGraphLayout(page, `global-selected-node-${nodeId}`);
  const widenedLayout = await runWidenedGraphDrawerLayoutCheck(page, `global-selected-node-${nodeId}-widened-drawer`);
  await resetGraphDrawerWidth(page);
  await closeDrawerIfOpen(page);
  return { point: { x: round(point.x), y: round(point.y) }, snapshot, selectedVisual, layout: { default: defaultLayout, widened: widenedLayout } };
}

async function runCommunityHoverCheck(page, focusNodeId, firstNeighborId) {
  await closeDrawerIfOpen(page);
  const point = await sigmaNodeClickPoint(page, focusNodeId);
  await page.mouse.move(point.x, point.y);
  await page.waitForSelector(`.sigma-global-node-hit-target[data-node-id="${cssString(focusNodeId)}"][data-relation-focus-depth="focus"]`);
  await page.waitForSelector(`.sigma-global-node-hit-target[data-node-id="${cssString(firstNeighborId)}"][data-relation-focus-depth="first"]`);
  const snapshot = await page.evaluate(({ focusNodeId, firstNeighborId }) => {
    const node = (id) => document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(id)}"]`);
    return {
      focusNodeId,
      focusDepth: node(focusNodeId)?.getAttribute("data-relation-focus-depth") || "",
      firstNeighborId,
      firstNeighborDepth: node(firstNeighborId)?.getAttribute("data-relation-focus-depth") || "",
      drawerOpen: Boolean(document.querySelector(".drawer-panel-open"))
    };
  }, { focusNodeId, firstNeighborId });
  assert.equal(snapshot.focusDepth, "focus", "community hover should mark the hovered node as focus");
  assert.equal(snapshot.firstNeighborDepth, "first", "community hover should mark direct neighbors as first-degree");
  assert.equal(snapshot.drawerOpen, false, "community hover should not open a drawer");
  const layout = await assertGraphLayout(page, `community-hover-${focusNodeId}`);
  return { point: { x: round(point.x), y: round(point.y) }, snapshot, layout };
}

async function runCommunityFilterCheck(page, type, hiddenNodeId) {
  const beforeVisual = await edgeVisualSummary(page);
  await setGraphTypeFilter(page, type, false);
  await page.waitForFunction((hiddenNodeId) => {
    return !document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(hiddenNodeId)}"]`);
  }, hiddenNodeId);
  const hidden = await page.evaluate((hiddenNodeId) => ({
    hiddenNodeId,
    targetExists: Boolean(document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(hiddenNodeId)}"]`)),
    visibleNodes: [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((node) => node.getAttribute("data-node-id") || "")
      .filter(Boolean)
      .sort()
  }), hiddenNodeId);
  assert.equal(hidden.targetExists, false, "type filter should hide matching community nodes from the Sigma hit layer");
  const filteredVisual = await edgeVisualSummary(page);
  assert.ok(filteredVisual.edgeCount < beforeVisual.edgeCount, "type filter should hide relations attached to hidden nodes");
  const filteredLayout = await assertGraphLayout(page, `community-filter-${type}-hidden`);

  await setGraphTypeFilter(page, type, true);
  await page.waitForSelector(`.sigma-global-node-hit-target[data-node-id="${cssString(hiddenNodeId)}"]`);
  const restored = await page.evaluate((hiddenNodeId) => ({
    hiddenNodeId,
    targetExists: Boolean(document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(hiddenNodeId)}"]`))
  }), hiddenNodeId);
  assert.equal(restored.targetExists, true, "type filter reset should restore the hidden community node");
  const restoredLayout = await assertGraphLayout(page, `community-filter-${type}-restored`);
  await closeGraphToolbarPanel(page);
  return { type, hidden, restored, visual: { before: beforeVisual, filtered: filteredVisual }, layout: { filtered: filteredLayout, restored: restoredLayout } };
}

async function openEdgeTuningPanel(page) {
  const button = page.getByRole("button", { name: /增强显示/ });
  await button.click();
  await page.waitForSelector("#graph-edge-tuning-panel");
}

async function setGraphTypeFilter(page, type, enabled) {
  await ensureGraphToolbarPanel(page, "筛选", "filters");
  const selector = `.graph-type-filter-option input[data-type="${cssString(type)}"]`;
  const input = page.locator(selector);
  await input.waitFor();
  const checked = await input.evaluate((element) => element.checked);
  if (checked !== enabled) await input.click({ force: true });
  await page.waitForFunction(({ selector, enabled }) => {
    const input = document.querySelector(selector);
    return input instanceof HTMLInputElement && input.checked === enabled;
  }, { selector, enabled });
}

async function ensureGraphToolbarPanel(page, buttonName, panelState) {
  const current = await page.locator(".graph-toolbar").first().evaluate((element) => element.getAttribute("data-panel")).catch(() => "");
  if (current !== panelState) {
    await page.locator(".graph-toolbar").first().getByRole("button", { name: buttonName }).click({ force: true });
  }
  await page.waitForFunction((panelState) => document.querySelector(".graph-toolbar")?.getAttribute("data-panel") === panelState, panelState);
}

async function closeGraphToolbarPanel(page) {
  const current = await page.locator(".graph-toolbar").first().evaluate((element) => element.getAttribute("data-panel")).catch(() => "closed");
  if (!current || current === "closed") return;
  const buttonName = current === "legend" ? "图例" : "筛选";
  await page.locator(".graph-toolbar").first().getByRole("button", { name: buttonName }).click({ force: true });
  await page.waitForFunction(() => document.querySelector(".graph-toolbar")?.getAttribute("data-panel") === "closed", undefined, { timeout: 3000 });
}

async function clearGraphSearch(page) {
  const input = await page.locator(".graph-search-input").count();
  if (!input) return;
  await openSearch(page);
  await setGraphSearchQuery(page, "");
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function reducedMotionSnapshot(page) {
  return page.evaluate(() => ({
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    viewTransition: document.querySelector(".sigma-global-renderer")?.getAttribute("data-view-transition") || "",
    route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
    communityFocusId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-community-focus-id") || "",
    graphAnimation: document.querySelector(".graph-screen")?.getAttribute("data-graph-animation") || "",
    diffState: document.querySelector("[data-diff-state]")?.getAttribute("data-diff-state") || "",
    diffReducedMotion: document.querySelector("[data-diff-reduced-motion]")?.getAttribute("data-diff-reduced-motion") || ""
  }));
}

async function waitForEdgeVisualSummaryStyle(page, expectedStyle) {
  await page.waitForFunction((expectedStyle) => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-visual-summary") || "";
    if (!raw) return false;
    let summary = null;
    try {
      summary = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!summary || summary.edgeCount < 1) return false;
    return Object.entries(expectedStyle).every(([key, value]) => summary.style?.[key] === value);
  }, expectedStyle);
  return edgeVisualSummary(page);
}

async function edgeVisualSummary(page) {
  const summary = await page.evaluate(() => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-visual-summary") || "";
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  assert.ok(summary, "Sigma renderer should expose final edge visual summary");
  assert.ok(summary.edgeCount >= 1, "edge visual summary should include rendered edges");
  return summary;
}

async function nodeVisualSummary(page) {
  const summary = await page.evaluate(() => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-node-visual-summary") || "";
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  assert.ok(summary, "Sigma renderer should expose final node visual summary");
  assert.ok(summary.nodeCount >= 1, "node visual summary should include rendered nodes");
  return summary;
}

async function sigmaNodeVisualPoint(page, nodeId) {
  const summary = await nodeVisualSummary(page);
  const node = summary.nodes.find((candidate) => candidate.id === nodeId);
  assert.ok(node, `node visual summary should include ${nodeId}`);
  assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `node visual summary should expose a finite point for ${nodeId}`);
  return node;
}

async function waitForNodeVisualFocusDepth(page, nodeId, depth) {
  await page.waitForFunction(({ nodeId, depth }) => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-node-visual-summary") || "";
    if (!raw) return false;
    try {
      const summary = JSON.parse(raw);
      return summary.nodes?.some((node) => node.id === nodeId && node.relationFocusDepth === depth);
    } catch {
      return false;
    }
  }, { nodeId, depth });
  const summary = await nodeVisualSummary(page);
  const node = summary.nodes.find((node) => node.id === nodeId);
  assert.ok(node, `node visual summary should still include ${nodeId} after hover`);
  return node;
}

async function waitForEdgeFocusDepth(page, depth) {
  await page.waitForFunction((depth) => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-visual-summary") || "";
    if (!raw) return false;
    try {
      const summary = JSON.parse(raw);
      return (summary.focusDepths?.[depth]?.count ?? 0) >= 1;
    } catch {
      return false;
    }
  }, depth);
  return edgeVisualSummary(page);
}

async function waitForSelectedRelationVisual(page, expectedCount) {
  await page.waitForFunction((expectedCount) => {
    const raw = document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-visual-summary") || "";
    if (!raw) return false;
    try {
      const summary = JSON.parse(raw);
      return (summary.selectedRelations?.count ?? 0) === expectedCount;
    } catch {
      return false;
    }
  }, expectedCount);
  return edgeVisualSummary(page);
}

function assertSemanticEnhancementVisible(before, after) {
  const beforeSemanticSize = maxRelationValue(before, ["relation-contrast", "relation-conflict"], "maxSize");
  const afterSemanticSize = maxRelationValue(after, ["relation-contrast", "relation-conflict"], "maxSize");
  const beforeNeutralAlpha = maxRelationValue(before, ["relation-dependency"], "maxAlpha");
  const afterNeutralAlpha = maxRelationValue(after, ["relation-dependency"], "maxAlpha");
  assert.ok(afterSemanticSize > beforeSemanticSize, "semantic emphasis should visibly strengthen contrast/conflict relations");
  assert.ok(afterNeutralAlpha < beforeNeutralAlpha, "semantic emphasis should quiet ordinary relations");
}

function assertFocusEnhancementVisible(before, after) {
  const beforeMaxSize = before.all?.maxSize ?? 0;
  const afterMaxSize = after.all?.maxSize ?? 0;
  const beforeMinAlpha = before.all?.minAlpha ?? 1;
  const afterMinAlpha = after.all?.minAlpha ?? 1;
  assert.ok(
    afterMaxSize > beforeMaxSize || afterMinAlpha < beforeMinAlpha,
    "focus highlight should visibly change the selected community edge emphasis"
  );
}

function assertActualRelationLineColorsDistinct(summary, label) {
  const dependency = relationColor(summary, "relation-dependency");
  const contrast = relationColor(summary, "relation-contrast");
  const conflict = relationColor(summary, "relation-conflict");
  assert.notEqual(edgeRgbSignature(dependency), edgeRgbSignature(contrast), `${label}: actual contrast relations should not collapse into dependency color`);
  assert.notEqual(edgeRgbSignature(dependency), edgeRgbSignature(conflict), `${label}: actual conflict relations should not collapse into dependency color`);
  assert.notEqual(edgeRgbSignature(contrast), edgeRgbSignature(conflict), `${label}: actual contrast and conflict relations should remain distinct`);
}

function assertCommunityStructureVisible(summary, label) {
  const skeleton = summary.layers?.skeleton;
  assert.ok(skeleton?.count >= 1, `${label}: community reading should preserve visible structure relations`);
  const background = summary.layers?.background;
  assert.ok(background?.count >= 1, `${label}: community reading should preserve quiet background relations`);
  assert.ok((skeleton.maxSize ?? 0) > (background.maxSize ?? 0), `${label}: structure relations should read stronger than background relations`);
  assert.ok((skeleton.maxAlpha ?? 0) > (background.maxAlpha ?? 0), `${label}: structure relations should stay brighter than background relations`);
}

function assertSelectedNodeRelationFocusVisible(summary, label) {
  const first = summary.focusDepths?.first;
  assert.ok(first?.count >= 1, `${label}: selected node should keep first-order real relations highlighted`);
  assert.ok((first.maxAlpha ?? 0) > 0, `${label}: selected node first-order relations should remain visible`);
  assert.ok(
    (first.maxSize ?? 0) >= (summary.focusDepths?.unrelated?.maxSize ?? 0),
    `${label}: selected node first-order relations should not be weaker than unrelated context`
  );
  assert.ok(summary.emphasizedLineBounds?.count >= 1, `${label}: selected node should expose highlighted relation area for layout acceptance`);
}

function assertShiftMultiSelectRelationVisible(before, after, selectedNodeIds) {
  assert.equal(after.selectedRelations?.count ?? 0, 1, `Shift multi-select for ${selectedNodeIds.join(" + ")} should highlight exactly the one real relation between the selected nodes`);
  assert.ok((after.selectedRelations?.maxAlpha ?? 0) > 0, "Shift multi-select selected relation should be visible");
  assert.ok(
    (after.selectedRelations?.maxSize ?? 0) >= (before.selectedRelations?.maxSize ?? 0),
    "Shift multi-select should strengthen the selected real relation instead of leaving it unchanged"
  );
}

function maxRelationValue(summary, relationKeys, field) {
  const values = relationKeys
    .map((key) => summary.relations?.[key]?.[field])
    .filter((value) => typeof value === "number");
  assert.ok(values.length >= 1, `edge visual summary should include ${relationKeys.join(" or ")}`);
  return Math.max(...values);
}

function relationColor(summary, relationKey) {
  const color = summary.relations?.[relationKey]?.colors?.[0] || "";
  assert.notEqual(color, "", `edge visual summary should include ${relationKey} relation colors`);
  return color;
}

function edgeRgbSignature(color) {
  const rgba = color.match(/rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgba) return `${rgba[1]},${rgba[2]},${rgba[3]}`;
  const srgb = color.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (srgb) return `${srgb[1]},${srgb[2]},${srgb[3]}`;
  return color;
}

function colorLuminance(color) {
  const normalized = color.trim();
  if (normalized === "" || normalized === "transparent") return null;
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split("").map((char) => `${char}${char}`).join("")
      : hex[1];
    const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
    return relativeLuminance(channels);
  }
  const rgba = color.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?/i);
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha === 0) return null;
    return relativeLuminance([Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255]);
  }
  const srgb = color.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (srgb) return relativeLuminance([Number(srgb[1]), Number(srgb[2]), Number(srgb[3])]);
  return null;
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((value) => {
    const channel = Math.min(1, Math.max(0, value));
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function waitForSigmaGlobal(page) {
  await page.waitForSelector(".sigma-global-route[data-route='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer[data-renderer='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer canvas");
  await page.waitForSelector(".sigma-global-community-region");
  await page.waitForSelector(".sigma-global-community-label");
  await page.waitForFunction(() => {
    const screen = document.querySelector(".graph-screen");
    const host = document.querySelector(".graph-host");
    const renderer = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    const rawSummary = renderer?.getAttribute("data-node-visual-summary") || "";
    let nodeCount = 0;
    try {
      nodeCount = JSON.parse(rawSummary)?.nodes?.length ?? 0;
    } catch {
      nodeCount = 0;
    }
    return screen?.getAttribute("data-graph-status") === "ready"
      && host instanceof HTMLElement
      && !host.classList.contains("graph-host-empty")
      && document.querySelector(".graph-host[data-llm-wiki-graph-route='sigma-global']")
      && nodeCount > 0;
  });
}

async function waitForSigmaCommunity(page, communityId) {
  await page.waitForSelector(".sigma-global-route[data-route='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer[data-renderer='sigma-global']");
  await page.waitForFunction((communityId) => {
    const renderer = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    return document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") === "sigma-global"
      && renderer?.getAttribute("data-community-focus-id") === communityId
      && renderer?.getAttribute("data-source-community-id") === communityId
      && document.querySelectorAll(".sigma-global-node-hit-target").length > 0
      && !document.querySelector(".node");
  }, communityId);
  await waitForVisibleSigmaNodeIds(page, T1_NODE_IDS);
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
    const selectedNodeIds = [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
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
      communityFocusId: sigma?.getAttribute("data-community-focus-id") || "",
      sourceCommunityId: sigma?.getAttribute("data-source-community-id") || "",
      nodeHitTargetCount: document.querySelectorAll(".sigma-global-node-hit-target").length,
      nodeHitTargetIds: nodeIds,
      selectedNodeHitTargetIds: selectedNodeIds,
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

async function sigmaCommunitySnapshot(page) {
  return page.evaluate(() => ({
    route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
    communityFocusId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-community-focus-id") || "",
    sourceCommunityId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-source-community-id") || "",
    sigmaRendererCount: document.querySelectorAll(".sigma-global-renderer").length,
    oldDomNodeCount: document.querySelectorAll(".node").length,
    visibleNodes: [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((node) => node.getAttribute("data-node-id"))
      .filter(Boolean)
      .sort(),
    communityRegionCount: document.querySelectorAll(".sigma-global-community-region").length,
    communityLabelCount: document.querySelectorAll(".sigma-global-community-label").length,
    readerOpen: Boolean(document.querySelector(".graph-reader-drawer")),
    toolbarReturnCount: [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("回全图")).length
  }));
}

async function runCommunityNodeMultiSelectCheck(page) {
  const firstPoint = await clickSigmaNode(page, "A");
  try {
    await page.waitForSelector(".graph-reader-drawer");
  } catch (error) {
    throw new assert.AssertionError({
      message: `community node click should open node reading. Diagnostics: ${JSON.stringify(await globalNodeClickDiagnostics(page, firstPoint, "A"))}`,
      actual: error,
      expected: "graph-reader-drawer",
      operator: "strictEqual"
    });
  }
  const single = await drawerSelectionSnapshot(page);
  assert.equal(single.drawerTestId, "graph-reader", "community node click should open node reading");
  assert.equal(single.title, "节点A", "community node click should open node content");
  const singleVisual = await waitForEdgeFocusDepth(page, "first");
  assertSelectedNodeRelationFocusVisible(singleVisual, "community selected node A");
  const singleLayout = await assertGraphLayout(page, "community-selected-node-drawer");

  await page.keyboard.down("Shift");
  try {
    const secondPoint = await stableSigmaNodeClickPoint(page, ["A"]);
    const secondNodeId = secondPoint.nodeId;
    assert.notEqual(secondNodeId, "A", `Shift+click should choose a second node: ${JSON.stringify(secondPoint)}`);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForSelector('[data-testid="graph-selection-drawer"]');
    const multi = await drawerSelectionSnapshot(page);
    assert.equal(multi.drawerTestId, "graph-selection-drawer", "Shift+click should show an exact multi-node selection");
    assert.match(multi.title, /选中 2 个节点/, "Shift+click should not widen the selection to the whole community");
    assert.equal(multi.hasEnterCommunity, false, "manual multi-node selection should not show the community enter action");
    const multiVisual = await waitForSelectedRelationVisual(page, 1);
    assertShiftMultiSelectRelationVisible(singleVisual, multiVisual, ["A", secondNodeId]);
    const multiLayout = await assertGraphLayout(page, "community-shift-multi-select-drawer");
    return { single, multi, secondNodeId, visual: { single: singleVisual, multi: multiVisual }, layout: { single: singleLayout, multi: multiLayout } };
  } catch (error) {
    throw new assert.AssertionError({
      message: `Shift+click should open multi-node selection drawer. Diagnostics: ${JSON.stringify(await communityMultiSelectDiagnostics(page))}`,
      actual: error,
      expected: "graph-selection-drawer",
      operator: "strictEqual"
    });
  } finally {
    await page.keyboard.up("Shift");
  }
}

async function clickSigmaNode(page, nodeId) {
  const point = await stableSigmaNodeClickPoint(page, [], nodeId);
  await page.mouse.down();
  await page.mouse.up();
  return point;
}

async function stableSigmaNodeClickPoint(page, excludedNodeIds = [], targetNodeId = "") {
  const dynamicExcludedNodeIds = new Set(excludedNodeIds);
  let point = targetNodeId
    ? await sigmaNodeClickPoint(page, targetNodeId)
    : await firstClickableSigmaNodePoint(page, [...dynamicExcludedNodeIds]);
  const attempts = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const expectedNodeId = targetNodeId || point.nodeId;
    if (point.hitNodeId !== expectedNodeId) {
      throw new assert.AssertionError({
        message: `Sigma node click point should hit ${expectedNodeId}. Diagnostics: ${JSON.stringify(await sigmaNodeTargetDiagnostics(page, expectedNodeId, point))}`,
        actual: point.hitNodeId,
        expected: expectedNodeId,
        operator: "strictEqual"
      });
    }
    await page.mouse.move(point.x, point.y);
    await waitForPointerSettle(page);
    const hit = await sigmaHitAtPoint(page, point);
    attempts.push({ attempt, point, hit });
    if (hit.hitNodeId === expectedNodeId) {
      return { ...point, stableHitNodeId: hit.hitNodeId };
    }
    if (!targetNodeId) dynamicExcludedNodeIds.add(expectedNodeId);
    point = targetNodeId
      ? await sigmaNodeClickPoint(page, targetNodeId)
      : await firstClickableSigmaNodePoint(page, [...dynamicExcludedNodeIds]);
  }
  throw new assert.AssertionError({
    message: `Sigma node click point did not stay stable after pointer movement: ${JSON.stringify(attempts)}`,
    actual: attempts.at(-1)?.hit,
    expected: targetNodeId || "clickable sigma node",
    operator: "strictEqual"
  });
}

async function sigmaNodeTargetDiagnostics(page, targetNodeId, point) {
  return page.evaluate(({ targetNodeId, point, ratios }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const targets = [...document.querySelectorAll(".sigma-global-node-hit-target")].map((node) => {
      const rect = node.getBoundingClientRect();
      const nodeId = node.getAttribute("data-node-id") || "";
      const hits = ratios.map(([rx, ry]) => {
        const x = rect.left + rect.width * rx;
        const y = rect.top + rect.height * ry;
        const hit = document.elementFromPoint(x, y);
        return {
          rx,
          ry,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          hitClass: hit instanceof Element ? hit.getAttribute("class") || "" : "",
          hitNodeId: hit instanceof Element ? hit.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "" : ""
        };
      });
      return {
        nodeId,
        selected: node.getAttribute("data-selected") || "",
        relationFocusDepth: node.getAttribute("data-relation-focus-depth") || "",
        rect: {
          left: Math.round(rect.left * 1000) / 1000,
          top: Math.round(rect.top * 1000) / 1000,
          width: Math.round(rect.width * 1000) / 1000,
          height: Math.round(rect.height * 1000) / 1000
        },
        hits
      };
    });
    return {
      targetNodeId,
      point,
      viewport,
      route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
      communityFocusId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-community-focus-id") || "",
      toolbarPanel: document.querySelector(".graph-toolbar")?.getAttribute("data-panel") || "",
      drawerOpen: Boolean(document.querySelector(".drawer-panel-open")),
      targetCount: targets.length,
      targets
    };
  }, { targetNodeId, point, ratios: NODE_CLICK_CANDIDATE_RATIOS });
}

async function waitForPointerSettle(page) {
  await waitForBrowserLayoutFrame(page, 2);
}

async function waitForBrowserLayoutFrame(page, frames = 1) {
  await page.evaluate((frames) => new Promise((resolve) => {
    let remaining = Math.max(1, frames);
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }), frames);
}

async function sigmaHitAtPoint(page, point) {
  return page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return {
      hitClass: hit instanceof Element ? hit.getAttribute("class") || "" : "",
      hitNodeId: hit instanceof Element ? hit.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "" : "",
      lastHitKind: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-kind") || "",
      lastHitId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-id") || ""
    };
  }, point);
}

async function sigmaNodeClickPoint(page, nodeId) {
  const targetCount = await page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`).count();
  if (targetCount > 0) return firstClickableSigmaNodePoint(page, [], nodeId);
  const point = await sigmaNodeVisualPoint(page, nodeId);
  return { nodeId, x: point.x, y: point.y, hitNodeId: nodeId, hitSource: "node-visual-summary" };
}

async function firstClickableSigmaNodePoint(page, excludedNodeIds = [], targetNodeId = "") {
  const point = await page.evaluate((config) => {
    const { excludedNodeIds: excludedNodeIdList, targetNodeId, ratios } = config;
    const excluded = new Set(excludedNodeIdList);
    const nodes = targetNodeId
      ? [document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(targetNodeId)}"]`)]
      : [...document.querySelectorAll(".sigma-global-node-hit-target")];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const nodeId = node.getAttribute("data-node-id") || "";
      if (!nodeId || excluded.has(nodeId)) continue;
      const rect = node.getBoundingClientRect();
      const dotOffset = Math.min(rect.width, rect.height) / 2;
      const candidates = [
        { x: rect.left + dotOffset, y: rect.top + rect.height / 2 },
        { x: rect.right - dotOffset, y: rect.top + rect.height / 2 },
        ...ratios.map(([rx, ry]) => ({ x: rect.left + rect.width * rx, y: rect.top + rect.height * ry }))
      ];
      for (const { x, y } of candidates) {
        const hit = document.elementFromPoint(x, y);
        const hitNodeId = hit?.closest?.(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "";
        if (hitNodeId === nodeId) return { nodeId, x, y, hitNodeId };
      }
      if (targetNodeId) {
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          nodeId,
          x,
          y,
          hitNodeId: hit?.closest?.(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "",
          hitClass: String(hit?.getAttribute?.("class") || "")
        };
      }
    }
    return null;
  }, { excludedNodeIds, targetNodeId, ratios: NODE_CLICK_CANDIDATE_RATIOS });
  assert.ok(point, targetNodeId ? `Sigma should expose a clickable point for ${targetNodeId}` : `Sigma should expose a clickable node outside ${excludedNodeIds.join(", ")}`);
  return point;
}

async function communityMultiSelectDiagnostics(page) {
  if (artifactDir) {
    await page.screenshot({ fullPage: true, path: path.join(artifactDir, "workbench-community-multiselect-timeout.png") }).catch(() => undefined);
  }
  return page.evaluate(() => ({
    drawer: document.querySelector(".drawer-panel-open")?.textContent || "",
    lastHitKind: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-kind") || "",
    lastHitId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-id") || "",
    selectedNodeIds: [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
      .map((node) => node.getAttribute("data-node-id") || "")
      .filter(Boolean),
    targets: [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((node) => ({
        nodeId: node.getAttribute("data-node-id") || "",
        selected: node.getAttribute("data-selected") || "",
        pinned: node.getAttribute("data-pinned") || ""
      }))
  }));
}

async function globalNodeClickDiagnostics(page, point, nodeId) {
  if (artifactDir) {
    await page.screenshot({ fullPage: true, path: path.join(artifactDir, "workbench-global-node-click-timeout.png") }).catch(() => undefined);
  }
  return page.evaluate(({ point, nodeId }) => {
    const hit = document.elementFromPoint(point.x, point.y);
    const target = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    return {
      point,
      nodeId,
      hitClass: hit instanceof Element ? hit.getAttribute("class") || "" : "",
      hitNodeId: hit instanceof Element ? hit.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "" : "",
      lastHitKind: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-kind") || "",
      lastHitId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-id") || "",
      drawerText: document.querySelector(".drawer-panel-open")?.textContent || "",
      drawerTestId: document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "",
      graphStatus: document.querySelector(".graph-screen")?.getAttribute("data-graph-status") || "",
      graphStateText: document.querySelector("[data-testid='graph-state']")?.textContent || "",
      activeKnowledgeBaseText: document.querySelector(".topbar-kb")?.textContent || "",
      recentFetches: window.__LLM_WIKI_GRAPH_VISUAL_ACCEPTANCE_FETCHES__ || [],
      selected: target?.getAttribute("data-selected") || "",
      pinned: target?.getAttribute("data-pinned") || "",
      relationFocusDepth: target?.getAttribute("data-relation-focus-depth") || "",
      graphRoute: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || ""
    };
  }, { point, nodeId });
}

async function drawerSelectionSnapshot(page) {
  return page.evaluate(() => {
    const drawerTestId = document.querySelector(".drawer-panel-open .graph-reader-drawer")
      ? "graph-reader"
      : document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "";
    return {
      drawerTestId,
      title: drawerTestId === "graph-selection-drawer"
        ? document.querySelector(".drawer-panel-open h2")?.textContent || ""
        : document.querySelector(".drawer-panel-open .drawer-title span")?.textContent
          || document.querySelector(".drawer-panel-open h2")?.textContent
          || "",
      hasEnterCommunity: [...document.querySelectorAll(".drawer-panel-open button")]
        .some((button) => button.textContent?.includes("进入社区")),
      text: document.querySelector(".drawer-panel-open")?.textContent || ""
    };
  });
}

async function runRouteCycleAccumulationCheck(page, communityId, cycles) {
  await closeDrawerIfOpen(page);
  await waitForSigmaGlobal(page);
  await openSearch(page);
  await setGraphSearchQuery(page, "节点");
  try {
    await page.waitForFunction(() => document.querySelectorAll(".sigma-global-node-hit-target").length > 1);
  } catch (err) {
    const diagnostics = await searchDiagnostics(page);
    throw new assert.AssertionError({
      message: `graph search should expose multiple nodes before route cycles: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: "more than one node hit target",
      operator: "strictEqual"
    });
  }
  await setGraphSearchQuery(page, "");
  await page.waitForFunction(() => document.querySelector(".graph-search-input")?.value === "");
  await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-pinned") === "true");
  const baseline = await sigmaGlobalSnapshot(page);
  const snapshots = [];

  for (let index = 0; index < cycles; index += 1) {
    const summary = await openCommunitySummaryFromRegion(page, communityId);
    assert.equal(summary.route.sigmaRouteCount, 1, `cycle ${index + 1}: should have one Sigma route before entering community`);
    await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
    await waitForSigmaCommunity(page, communityId);
    const focused = await sigmaCommunitySnapshot(page);
    assert.equal(focused.sigmaRendererCount, 1, `cycle ${index + 1}: community route should retain Sigma renderer`);
    assert.equal(focused.oldDomNodeCount, 0, `cycle ${index + 1}: community route should not render DOM/SVG nodes`);
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
    assert.equal(returned.communityFocusId, "", `cycle ${index + 1}: community focus should be clear after return`);
    assert.equal(returned.sourceCommunityId, communityId, `cycle ${index + 1}: source community should remain after return`);
    assert.deepEqual(returned.selectedNodeHitTargetIds, [], `cycle ${index + 1}: source community should not expand into selected nodes`);
    assert.deepEqual(returned.nodeHitTargetIds, sourceContextNodeHitTargetIds(communityId), `cycle ${index + 1}: node hit targets should stay scoped to the source-community context`);
    assert.deepEqual(returned.communityRegionIds, baseline.communityRegionIds, `cycle ${index + 1}: community regions should match the baseline set`);
    assert.deepEqual(returned.communityLabelIds, baseline.communityLabelIds, `cycle ${index + 1}: community labels should match the baseline set`);
    snapshots.push({ summary: summary.route, focused, returned });
  }

  return { cycles, baseline, snapshots };
}

function sourceContextNodeHitTargetIds(communityId) {
  return [...new Set(COMMUNITY_NODE_IDS[communityId] || [])].sort();
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
  const summary = await communitySummaryDrawerSnapshot(page);
  assert.ok(
    summary.hasEnterCommunity,
    `community ${communityId} summary should expose enter-community: ${JSON.stringify({ point, summary })}`
  );
  const layout = await assertGraphLayout(page, `global-selected-community-${communityId}`);
  const route = await sigmaGlobalSnapshot(page);
  const visual = await edgeVisualSummary(page);
  assertGlobalCommunityPreview(route, communityId, visual);
  return {
    route,
    drawerTestId: await drawerTestId(page),
    summary,
    layout,
    visual
  };
}

function assertGlobalCommunityPreview(route, communityId, visual) {
  assert.equal(route.renderer, "sigma-global", `community ${communityId} preview should stay on the Sigma global renderer`);
  assert.equal(route.communityFocusId, "", `community ${communityId} preview should not enter community reading`);
  assert.ok(route.communityRegionCount > 1, `community ${communityId} preview should keep the full global community map visible`);
  assert.ok(route.communityLabelCount > 1, `community ${communityId} preview should keep global community labels visible`);
  assert.ok((visual.selectedCommunityInternalRelations?.count ?? 0) >= 1, `community ${communityId} preview should reveal some real internal community structure`);
  assert.ok((visual.selectedCommunityBridgeRelations?.count ?? 0) >= 1, `community ${communityId} preview should preserve a cross-community bridge relation`);
  assert.ok(visual.emphasizedLineBounds?.count >= 1, `community ${communityId} preview should expose highlighted relation area for layout acceptance`);
}

async function clickPassiveCommunityLabel(page, communityId) {
  const point = await page.locator(`.sigma-global-community-label[data-community-id="${cssString(communityId)}"]`).evaluate((label) => {
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
      const hitRegionId = hit?.closest?.(".sigma-global-community-region")?.getAttribute("data-community-id") || "";
      if (hitRegionId === communityId && !hit?.closest?.(".sigma-global-node-hit-target")) return { x, y };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, communityId);
}

async function communitySummaryDrawerSnapshot(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="graph-community-summary"]');
    return {
      title: drawer?.querySelector("h2")?.textContent || "",
      buttons: [...(drawer?.querySelectorAll("button") || [])].map((button) => button.textContent?.trim() || ""),
      hasEnterCommunity: [...(drawer?.querySelectorAll("button") || [])].some((button) => button.textContent?.includes("进入社区")),
      selectedRegions: [...document.querySelectorAll(".sigma-global-community-region[data-selected='true']")].map((region) => region.getAttribute("data-community-id") || ""),
      selectedLabels: [...document.querySelectorAll(".sigma-global-community-label[data-selected='true']")].map((label) => label.getAttribute("data-community-id") || "")
    };
  });
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
  await waitForSigmaCommunity(page, "t1");
  const focused = await sigmaCommunitySnapshot(page);

  await clickReturnGlobal(page);
  await waitForSigmaGlobal(page);
  await page.waitForSelector('[data-testid="graph-node-summary"]');
  await page.waitForFunction(() => document.querySelector(".graph-search-input")?.value === "");
  await page.waitForFunction(() => document.querySelector(".sigma-global-node-hit-target[data-node-id='A']")?.getAttribute("data-pinned") === "true");
  await page.waitForFunction(() => document.querySelector(".sigma-global-renderer")?.getAttribute("data-source-community-id") === "t1");
  await waitForStableNodeHitTarget(page, "A");
  const returned = await sigmaStateSnapshot(page);

  assert.equal(returned.drawerTestId, "graph-node-summary", "node summary should survive community return");
  assert.equal(returned.searchQuery, "", "returning global should clear community-local search");
  assert.equal(returned.sourceCommunityId, "t1", "returning global should keep source community context");
  assert.equal(returned.nodeASelected, "false", "returning global should exit the community node focus");
  assert.equal(returned.nodeAPinned, "true", "fixed node should survive community return");
  assertPointStable(returned.nodeABox, afterDrag.nodeABox, "dragged fixed node should remain at the released global position after community return", 10);
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
      sourceCommunityId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-source-community-id") || "",
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
      inputType: query ? "insertText" : "deleteContentBackward",
      data: query || null
    }));
  }, query);
  try {
    await page.waitForFunction((query) => {
      const input = document.querySelector(".graph-search-input");
      return input instanceof HTMLInputElement && input.value === query;
    }, query, { timeout: 5000 });
  } catch (err) {
    const diagnostics = await searchDiagnostics(page);
    throw new assert.AssertionError({
      message: `graph search input should settle to ${JSON.stringify(query)}: ${JSON.stringify(diagnostics)}`,
      actual: err,
      expected: query,
      operator: "strictEqual"
    });
  }
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

async function waitForVisibleSigmaNodeIds(page, expected) {
  await page.waitForFunction((expected) => {
    const actual = [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((node) => node.getAttribute("data-node-id"))
      .filter(Boolean)
      .sort();
    return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
  }, expected, { timeout: 5000 });
}

function assertSigmaGlobal(snapshot, label) {
  assert.equal(snapshot.route, "sigma-global", `${label}: route should be Sigma global`);
  assert.equal(snapshot.renderer, "sigma-global", `${label}: renderer should be Sigma global`);
  assert.ok(snapshot.canvasCount >= 1, `${label}: Sigma canvas should exist`);
  assert.ok(
    snapshot.canvasBox?.width > 120 && snapshot.canvasBox?.height > 120,
    `${label}: Sigma canvas should be visible (${JSON.stringify(snapshot.canvasBox)})`
  );
  assert.equal(snapshot.aggregationButtonCount, 0, `${label}: no visible aggregation controls`);
  for (const labelInfo of snapshot.labels) {
    assert.equal(labelInfo.ariaHidden, "true", `${label}: community labels should be aria-hidden`);
    assert.equal(labelInfo.tabIndex, -1, `${label}: community labels should not be tab-focusable`);
    assert.equal(labelInfo.pointerEvents, "none", `${label}: community labels should be passive`);
  }
}

function assertPointStable(actual, expected, message, tolerance = 6) {
  assert.ok(actual, `${message}: missing actual node box`);
  assert.ok(expected, `${message}: missing expected node box`);
  assert.ok(Math.abs(actual.centerX - expected.centerX) <= tolerance, `${message}: x drifted from ${expected.centerX} to ${actual.centerX}`);
  assert.ok(Math.abs(actual.centerY - expected.centerY) <= tolerance, `${message}: y drifted from ${expected.centerY} to ${actual.centerY}`);
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
