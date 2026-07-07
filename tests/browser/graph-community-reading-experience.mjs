import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const workbenchUrl = process.env.GRAPH_COMMUNITY_EXPERIENCE_URL || "";
const artifactDir = process.env.GRAPH_COMMUNITY_EXPERIENCE_ARTIFACT_DIR || "";
const executablePath = process.env.GRAPH_COMMUNITY_EXPERIENCE_CHROME_EXECUTABLE || "";

assert.notEqual(workbenchUrl, "", "GRAPH_COMMUNITY_EXPERIENCE_URL must point at the workbench dev server");
assert.notEqual(artifactDir, "", "GRAPH_COMMUNITY_EXPERIENCE_ARTIFACT_DIR must point at an artifact directory");

const COMMUNITY_CASES = [
  { id: "dense-agent", slug: "dense-agent", label: "AI Agent 对比分析", minNodes: 16, minEdges: 18 },
  { id: "small-chain", slug: "small-chain", label: "小型概念链", minNodes: 3, minEdges: 2 },
  { id: "long-title", slug: "long-title", label: "长标题节点社区", minNodes: 5, minEdges: 4 },
  { id: "edge-dense", slug: "edge-dense", label: "高密关系社区", minNodes: 7, minEdges: 10 },
  { id: "flat-core", slug: "flat-core", label: "无明显核心社区", minNodes: 6, minEdges: 5 }
];

const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  await fs.mkdir(artifactDir, { recursive: true });
  const desktop = await runViewport({ width: 1440, height: 900 }, "desktop", { fullPath: true });
  const wide = await runViewport({ width: 1920, height: 1080 }, "wide", { fullPath: false });
  const narrow = await runViewport({ width: 390, height: 844 }, "narrow", { fullPath: false });
  const report = {
    checkedAt: new Date().toISOString(),
    workbenchUrl,
    visualReviewCriteria: [
      "global ordinary",
      "global selected community",
      "Sigma community reading",
      "color continuity",
      "node-shape continuity",
      "community centering/readability",
      "quiet unselected community labels"
    ],
    desktop,
    wide,
    narrow
  };
  await fs.writeFile(path.join(artifactDir, "community-reading-experience-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closeBrowserForRegression(browser);
}

async function runViewport(viewport, label, options) {
  const page = await openWorkbenchGraphPage(viewport);
  const visualCases = [];
  let fullPath = null;
  try {
    for (const community of COMMUNITY_CASES) {
      await resetToPlainGlobal(page);
      const global = await captureState(page, `${label}-${community.slug}-01-global.png`);

      const selected = await openCommunitySummary(page, community);
      const selectedShot = await captureState(page, `${label}-${community.slug}-02-selected.png`);
      assert.equal(selected.summary.hasEnterCommunity, true, `${community.label}: summary should expose enter-community`);
      assert.ok(selected.selected.dimmedLabelCount > 0, `${community.label}: unselected community labels should remain as quiet landmarks`);

      await page.locator('[data-testid="graph-community-summary"] button', { hasText: "进入社区" }).click();
      await waitForSigmaCommunityOrDump(page, community, label);
      await page.waitForSelector('[data-testid="graph-community-summary"]', { state: "detached", timeout: 5_000 });
      await waitForCommunityCentered(page, community, label);
      await page.waitForTimeout(520);
      await waitForCommunityCentered(page, community, label);
      const readingShot = await captureState(page, `${label}-${community.slug}-03-community.png`);
      const reading = await communityReadingSnapshot(page, community);
      assertCommunityReading(community, reading);
      const visualReview = reviewVisualContinuity(community, selected.selected, reading);
      assertVisualReview(visualReview);

      const record = { community, global, selected: selectedShot, reading: readingShot, readingState: reading, visualReview };
      visualCases.push(record);

      if (options.fullPath && community.id === "dense-agent") {
        fullPath = await runFullDesktopPath(page, community);
      }

      await clickReturnGlobal(page);
      await waitForSigmaGlobalUnfocused(page);
    }
  } finally {
    await page.close();
  }
  return { viewport: `${viewport.width}x${viewport.height}`, visualCases, fullPath };
}

async function runFullDesktopPath(page, community) {
  const beforeSearch = await communityReadingSnapshot(page, community);
  const hoverFocus = await hoverRelationFocus(page, "dense-overview", "dense-source-1");
  const nearNodeBlankClick = await clickNearNodeBlankClosesReader(page);

  await setGraphSearchQuery(page, "实践案例");
  await page.waitForFunction(() => document.querySelector(".graph-search-status")?.textContent?.includes("1 个结果"));
  assert.equal(await drawerTestId(page), "", "typing a community search query should not auto-open node content");
  await page.locator('.graph-search-result-item[data-node-id="dense-source-1"]').click();
  await page.waitForSelector(".graph-reader-drawer");
  await page.waitForSelector('.sigma-global-node-hit-target[data-node-id="dense-source-1"][data-selected="true"]');
  const afterSearchActivation = await interactionSnapshot(page, "dense-source-1");
  assert.equal(afterSearchActivation.searchQuery, "实践案例", "search query should stay after result activation");
  assert.equal(afterSearchActivation.drawerTestId, "graph-reader", "activating a search result should open node content");

  await setTypeFilter(page, "source", false);
  await page.waitForSelector('.sigma-community-hidden-node-hint[data-state="visible"]');
  await page.waitForSelector(".graph-reader-hidden-badge");
  await page.waitForFunction(() => {
    const status = document.querySelector(".graph-search-status")?.textContent || "";
    return status.includes("0 个结果");
  });
  assert.equal(await page.locator('.graph-search-result-item[data-node-id="dense-source-1"]').count(), 0, "type filter should remove hidden nodes from community search results");
  const hiddenByFilter = await interactionSnapshot(page, "dense-source-1");
  assert.equal(hiddenByFilter.hiddenReadingNode, "true", "filtering out the reading node should keep logical focus with a visible hint");
  assert.equal(hiddenByFilter.drawerHiddenBadge, true, "reader title should explain the node is filtered hidden");

  await setTypeFilter(page, "source", true);
  await page.waitForFunction(() => {
    return document.querySelector('.sigma-community-hidden-node-hint')?.getAttribute("data-state") === "hidden";
  });
  await page.waitForSelector('.sigma-global-node-hit-target[data-node-id="dense-source-1"][data-selected="true"]');

  const beforeDrag = await nodeBox(page, "dense-source-1");
  const drag = await dragSigmaNode(page, "dense-source-1", { dx: 72, dy: 28 });
  await page.waitForSelector('.sigma-global-node-hit-target[data-node-id="dense-source-1"][data-pinned="true"]');
  const afterDrag = await nodeBox(page, "dense-source-1");
  assertPointShifted(afterDrag, beforeDrag, "dragging inside community reading should move the selected node");

  await page.getByRole("button", { name: /重置布局/ }).click();
  await page.waitForFunction(() => document.querySelector('.sigma-global-node-hit-target[data-node-id="dense-source-1"]')?.getAttribute("data-pinned") !== "true");
  const afterReset = await interactionSnapshot(page, "dense-source-1");
  assert.equal(afterReset.nodePinned, "false", "reset layout should clear the community drag pin");

  const multiSelect = await shiftSelectCommunityNodes(page, community, ["dense-overview", "dense-source-1"]);

  await clickReturnGlobal(page);
  await waitForSigmaGlobalUnfocused(page);
  await waitForSelectedCommunity(page, community.id);
  const returned = await sigmaSnapshot(page);
  assert.equal(returned.communitySummaryOpen, false, "returning global should not reopen the community summary drawer");
  assert.equal(returned.sourceCommunityId, community.id, "returning global should keep source community context");
  assert.equal(returned.searchQuery, "", "returning global should clear community-local search");
  assert.equal(returned.typeFiltersActive, false, "returning global should clear community-local type filters");

  return { beforeSearch, hoverFocus, nearNodeBlankClick, afterSearchActivation, hiddenByFilter, drag, afterDrag, afterReset, multiSelect, returned };
}

async function openWorkbenchGraphPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.__graphDiagnostics = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    pushGraphDiagnostic(page, {
      kind: "console",
      type: message.type(),
      text: message.text()
    });
  });
  page.on("pageerror", (error) => {
    pushGraphDiagnostic(page, {
      kind: "pageerror",
      message: error.message
    });
  });
  page.on("requestfailed", (request) => {
    if (!request.url().includes("/api/")) return;
    pushGraphDiagnostic(page, {
      kind: "requestfailed",
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || ""
    });
  });
  page.on("response", async (response) => {
    if (!response.url().includes("/api/")) return;
    const contentType = response.headers()["content-type"] || "";
    let bodyPreview = "";
    if (!contentType.includes("text/event-stream")) {
      bodyPreview = await response.text().catch((error) => `<<body unavailable: ${error.message}>>`);
    }
    pushGraphDiagnostic(page, {
      kind: "response",
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
      contentType,
      bodyLength: bodyPreview.length,
      bodyPreview: bodyPreview.slice(0, 220)
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("llm-wiki-agent-main-view", "graph");
    window.localStorage.setItem("llm-wiki-agent-theme", "light");
    window.localStorage.setItem("llm-wiki-agent-drawer-width", "320");
    window.localStorage.setItem("llm-wiki-agent-sidebar-collapsed", "true");
    window.localStorage.setItem("llm-wiki:graph:toolbar:panel", "closed");
  });
  await page.goto(workbenchUrl);
  await page.waitForSelector(".app-shell");
  const kbButton = page.getByRole("button", { name: /Sigma Community Experience|sigma-community-experience/ });
  if (await kbButton.count() && await kbButton.first().isVisible()) await kbButton.first().click();
  const graphButton = page.getByRole("button", { name: /图谱/ });
  if (await graphButton.count() && await graphButton.first().isVisible() && await graphButton.first().isEnabled()) {
    await graphButton.first().click();
  }
  await waitForSigmaGlobal(page);
  return page;
}

function pushGraphDiagnostic(page, entry) {
  const diagnostics = page.__graphDiagnostics || [];
  diagnostics.push({ at: new Date().toISOString(), ...entry });
  page.__graphDiagnostics = diagnostics.slice(-80);
}

async function captureState(page, filename) {
  const screenshotPath = path.join(artifactDir, filename);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  return { screenshotPath, snapshot: await sigmaSnapshot(page) };
}

async function resetToPlainGlobal(page) {
  await closeDrawerIfOpen(page);
  await clickReturnGlobal(page);
  await waitForSigmaGlobalUnfocused(page);
  await closeGraphToolbarPanel(page);
  await page.waitForTimeout(520);
  await clickGlobalBlank(page);
  await waitForPlainGlobal(page);
  await clickReturnGlobal(page);
  await waitForPlainGlobal(page);
  await page.waitForTimeout(450);
}

async function closeGraphToolbarPanel(page) {
  const toolbar = page.locator(".graph-toolbar").first();
  const open = await toolbar.evaluate((element) => element.getAttribute("data-panel") !== "closed").catch(() => false);
  if (!open) return;
  const panel = await toolbar.evaluate((element) => element.getAttribute("data-panel")).catch(() => "");
  const buttonName = panel === "legend" ? "图例" : "筛选";
  await toolbar.evaluate((element, buttonName) => {
    const button = [...element.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === buttonName);
    button?.click();
  }, buttonName);
  await page.waitForFunction(() => document.querySelector(".graph-toolbar")?.getAttribute("data-panel") === "closed", undefined, { timeout: 2_000 })
    .catch(async (error) => {
      const current = await toolbar.evaluate((element) => element.getAttribute("data-panel")).catch(() => "closed");
      if (current !== "closed") throw error;
    });
}

async function openCommunitySummaryFromRegion(page, communityId) {
  await closeDrawerIfOpen(page);
  await clickCommunityRegion(page, communityId);
  try {
    await page.waitForSelector('[data-testid="graph-community-summary"]');
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `summary-open-timeout-${communityId}.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => undefined);
    const diagnostics = await communityRegionDiagnostics(page, communityId).catch((diagnosticError) => ({ error: String(diagnosticError) }));
    throw new assert.AssertionError({
      message: `${communityId}: community summary did not open. Diagnostics: ${JSON.stringify({ screenshotPath, diagnostics })}`,
      actual: error,
      expected: "community summary drawer",
      operator: "strictEqual"
    });
  }
  return {
    selected: await selectedCommunitySnapshot(page, communityId),
    summary: await communitySummarySnapshot(page)
  };
}

async function openCommunitySummary(page, community) {
  const selected = await openCommunitySummaryFromRegion(page, community.id);
  assertSelectedCommunity(community, selected);
  return selected;
}

async function openCommunitySummaryFromToolbar(page, communityId) {
  await closeDrawerIfOpen(page);
  await ensureFilterPanelOpen(page);
  const legend = page.locator(".community-legend");
  await legend.waitFor();
  const collapsed = await legend.evaluate((element) => element.getAttribute("data-state") === "collapsed");
  if (collapsed) {
    await page.locator(".community-legend-toggle").click({ force: true });
  }
  await page.locator(`.community-legend-row[data-community-id="${cssString(communityId)}"]`).click({ force: true });
  await page.waitForSelector('[data-testid="graph-community-summary"]');
  await closeGraphToolbarPanel(page);
  return {
    selected: await selectedCommunitySnapshot(page, communityId),
    summary: await communitySummarySnapshot(page)
  };
}

function assertSelectedCommunity(community, selected) {
  assert.deepEqual(
    selected.selected.selectedRegions,
    [community.id],
    `${community.label}: global selected state should target the requested community`
  );
  assert.deepEqual(
    selected.selected.selectedLabels,
    [community.id],
    `${community.label}: global selected label should target the requested community`
  );
}

async function communityRegionDiagnostics(page, communityId) {
  return page.evaluate((communityId) => {
    const region = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(communityId)}"]`);
    const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    const rect = region?.getBoundingClientRect();
    if (!rect) return { missing: true };
    const candidates = [
      [0.5, 0.5],
      [0.5, 0.34],
      [0.34, 0.5],
      [0.66, 0.5],
      [0.5, 0.66],
      [0.25, 0.25],
      [0.75, 0.75]
    ];
    return {
      rect: rectOf(rect),
      candidates: candidates.map(([rx, ry]) => {
        const x = rect.left + rect.width * rx;
        const y = rect.top + rect.height * ry;
        const hit = document.elementFromPoint(x, y);
        return {
          rx,
          ry,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          tag: hit?.tagName || "",
          className: String(hit?.getAttribute?.("class") || ""),
          nodeId: hit?.closest?.(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "",
          regionId: hit?.closest?.(".sigma-global-community-region")?.getAttribute("data-community-id") || "",
          labelId: hit?.closest?.(".sigma-global-community-label")?.getAttribute("data-community-id") || ""
        };
      })
    };

    function rectOf(value) {
      return {
        left: Math.round(value.left * 1000) / 1000,
        top: Math.round(value.top * 1000) / 1000,
        width: Math.round(value.width * 1000) / 1000,
        height: Math.round(value.height * 1000) / 1000,
        right: Math.round(value.right * 1000) / 1000,
        bottom: Math.round(value.bottom * 1000) / 1000
      };
    }
  }, communityId);
}

async function selectedCommunitySnapshot(page, communityId) {
  return page.evaluate((communityId) => {
    const selectedRegion = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(communityId)}"]`);
    const selectedShape = selectedRegion?.querySelector("svg *");
    return {
      selectedRegions: Array.from(document.querySelectorAll(".sigma-global-community-region[data-selected='true']"))
        .map((region) => region.getAttribute("data-community-id") || "")
        .filter(Boolean)
        .sort(),
      selectedLabels: Array.from(document.querySelectorAll(".sigma-global-community-label[data-selected='true']"))
        .map((label) => label.getAttribute("data-community-id") || "")
        .filter(Boolean)
        .sort(),
      dimmedLabelCount: Array.from(document.querySelectorAll(".sigma-global-community-label[data-dim='true']")).length,
      regionFill: selectedShape ? getComputedStyle(selectedShape).fill : "",
      region: selectedRegion ? rectOf(selectedRegion.getBoundingClientRect()) : null,
      nodeLabelNoiseCount: Array.from(document.querySelectorAll(".sigma-global-node-hit-target[data-community-dimmed='true']")).filter((node) => {
        const label = node.getAttribute("aria-label") || "";
        const id = node.getAttribute("data-node-id") || "";
        return label && label !== id;
      }).length
    };

    function rectOf(rect) {
      return {
        width: round(rect.width),
        height: round(rect.height)
      };
    }
    function round(value) {
      return Math.round(value * 1000) / 1000;
    }
  }, communityId);
}

async function communitySummarySnapshot(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="graph-community-summary"]');
    return {
      title: drawer?.querySelector("h2")?.textContent || "",
      hasEnterCommunity: [...(drawer?.querySelectorAll("button") || [])].some((button) => button.textContent?.includes("进入社区"))
    };
  });
}

async function communityReadingSnapshot(page, community) {
  return page.evaluate((community) => {
    const stage = document.querySelector(".graph-stage")?.getBoundingClientRect();
    const route = document.querySelector(".sigma-global-route");
    const renderer = document.querySelector(".sigma-global-renderer");
    const region = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(community.id)}"]`);
    const shape = region?.querySelector("svg *");
    const regionRect = region?.getBoundingClientRect();
    const centerDistance = stage && regionRect ? {
      x: round((regionRect.left + regionRect.width / 2) - (stage.left + stage.width / 2)),
      y: round((regionRect.top + regionRect.height / 2) - (stage.top + stage.height / 2)),
      xRatio: round(Math.abs((regionRect.left + regionRect.width / 2) - (stage.left + stage.width / 2)) / Math.max(1, stage.width)),
      yRatio: round(Math.abs((regionRect.top + regionRect.height / 2) - (stage.top + stage.height / 2)) / Math.max(1, stage.height))
    } : null;
    return {
      route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
      renderer: renderer?.getAttribute("data-renderer") || "",
      nodeCount: Number(renderer?.getAttribute("data-node-count") || "0"),
      edgeCount: Number(renderer?.getAttribute("data-edge-count") || "0"),
      communityFocusId: renderer?.getAttribute("data-community-focus-id") || "",
      sourceCommunityId: renderer?.getAttribute("data-source-community-id") || "",
      communityMapLabelLimit: Number(renderer?.getAttribute("data-community-map-label-limit") || "0"),
      communityMapVisibleLabels: Number(renderer?.getAttribute("data-community-map-visible-labels") || "0"),
      hiddenReadingNode: route?.getAttribute("data-hidden-reading-node") || "",
      communitySummaryOpen: Boolean(document.querySelector('[data-testid="graph-community-summary"]')),
      readerOpen: Boolean(document.querySelector(".graph-reader-drawer")),
      regionCount: document.querySelectorAll(".sigma-global-community-region").length,
      labelCount: document.querySelectorAll(".sigma-global-community-label").length,
      regionFill: shape ? getComputedStyle(shape).fill : "",
      stage: stage ? rectOf(stage) : null,
      region: regionRect ? rectOf(regionRect) : null,
      centerDistance
    };

    function rectOf(rect) {
      return {
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
        right: round(rect.right),
        bottom: round(rect.bottom)
      };
    }
    function round(value) {
      return Math.round(value * 1000) / 1000;
    }
  }, community);
}

function assertCommunityReading(community, snapshot) {
  assert.equal(snapshot.route, "sigma-global", `${community.label}: community reading should stay on Sigma route`);
  assert.equal(snapshot.renderer, "sigma-global", `${community.label}: Sigma renderer should remain mounted`);
  assert.equal(snapshot.communityFocusId, community.id, `${community.label}: should focus the requested community`);
  assert.equal(snapshot.sourceCommunityId, community.id, `${community.label}: should keep source community context`);
  assert.equal(snapshot.communitySummaryOpen, false, `${community.label}: community summary drawer should close on entry`);
  assert.equal(snapshot.readerOpen, false, `${community.label}: node reader should not open by default`);
  assert.equal(snapshot.regionCount, 1, `${community.label}: only focused community region should remain`);
  assert.equal(snapshot.labelCount, 1, `${community.label}: only current community location label should remain`);
  assert.ok(snapshot.nodeCount >= community.minNodes, `${community.label}: should show current community nodes`);
  assert.ok(snapshot.edgeCount >= community.minEdges, `${community.label}: should show internal community relationships`);
  assert.ok(snapshot.centerDistance, `${community.label}: should provide centering geometry`);
  assert.ok(snapshot.centerDistance.xRatio <= 0.28, `${community.label}: community should be horizontally centered enough (${snapshot.centerDistance.xRatio})`);
  assert.ok(snapshot.centerDistance.yRatio <= 0.28, `${community.label}: community should be vertically centered enough (${snapshot.centerDistance.yRatio})`);
  assert.ok(
    snapshot.region.width > 40 && snapshot.region.height > 40,
    `${community.label}: community region should be visible and readable. Snapshot: ${JSON.stringify(snapshot)}`
  );
}

function reviewVisualContinuity(community, selected, reading) {
  const selectedAspectRatio = selected.region ? selected.region.width / Math.max(1, selected.region.height) : 0;
  const readingAspectRatio = reading.region ? reading.region.width / Math.max(1, reading.region.height) : 0;
  const aspectDrift = selectedAspectRatio && readingAspectRatio
    ? Math.abs(selectedAspectRatio - readingAspectRatio) / Math.max(selectedAspectRatio, readingAspectRatio)
    : 1;
  const checks = [
    {
      name: "color continuity",
      pass: selected.regionFill === reading.regionFill,
      details: {
        selectedRegionFill: selected.regionFill,
        readingRegionFill: reading.regionFill
      }
    },
    {
      name: "node-shape continuity",
      pass: aspectDrift <= 0.38,
      details: {
        selectedAspectRatio: round(selectedAspectRatio),
        readingAspectRatio: round(readingAspectRatio),
        aspectDrift: round(aspectDrift)
      }
    },
    {
      name: "community centering/readability",
      pass: Boolean(reading.centerDistance)
        && reading.centerDistance.xRatio <= 0.28
        && reading.centerDistance.yRatio <= 0.28
        && reading.region?.width > 40
        && reading.region?.height > 40
        && reading.communityMapVisibleLabels <= reading.communityMapLabelLimit,
      details: {
        centerDistance: reading.centerDistance,
        region: reading.region,
        labelBudget: {
          limit: reading.communityMapLabelLimit,
          visible: reading.communityMapVisibleLabels
        }
      }
    },
    {
      name: "quiet unselected community landmarks",
      pass: selected.dimmedLabelCount > 0
        && selected.nodeLabelNoiseCount === 0
        && reading.regionCount === 1
        && reading.labelCount === 1,
      details: {
        globalDimmedCommunityLabels: selected.dimmedLabelCount,
        globalDimmedNodeLabelNoise: selected.nodeLabelNoiseCount,
        readingRegionCount: reading.regionCount,
        readingLabelCount: reading.labelCount
      }
    }
  ];
  return {
    communityId: community.id,
    communityLabel: community.label,
    pass: checks.every((check) => check.pass),
    checks
  };
}

function assertVisualReview(review) {
  assert.equal(
    review.pass,
    true,
    `${review.communityLabel}: visual review failed ${JSON.stringify(review.checks.filter((check) => !check.pass))}`
  );
}

async function interactionSnapshot(page, nodeId) {
  return page.evaluate((nodeId) => {
    const route = document.querySelector(".sigma-global-route");
    const node = document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(nodeId)}"]`);
    return {
      drawerTestId: document.querySelector(".drawer-panel-open .graph-reader-drawer") ? "graph-reader" : "",
      searchQuery: document.querySelector(".graph-search-input")?.value || "",
      hiddenReadingNode: route?.getAttribute("data-hidden-reading-node") || "",
      hiddenReadingNodeId: route?.getAttribute("data-hidden-reading-node-id") || "",
      drawerHiddenBadge: Boolean(document.querySelector(".graph-reader-hidden-badge")),
      nodeSelected: node?.getAttribute("data-selected") || "",
      nodePinned: node?.getAttribute("data-pinned") || ""
    };
  }, nodeId);
}

async function hoverRelationFocus(page, focusNodeId, firstNeighborId) {
  const focusBox = await nodeBox(page, focusNodeId);
  await page.mouse.move(focusBox.centerX, focusBox.centerY);
  await page.waitForSelector(`.sigma-global-node-hit-target[data-node-id="${cssString(focusNodeId)}"][data-relation-focus-depth="focus"]`);
  await page.waitForSelector(`.sigma-global-node-hit-target[data-node-id="${cssString(firstNeighborId)}"][data-relation-focus-depth="first"]`);
  return page.evaluate(({ focusNodeId, firstNeighborId }) => {
    const node = (id) => document.querySelector(`.sigma-global-node-hit-target[data-node-id="${CSS.escape(id)}"]`);
    return {
      focusNodeId,
      focusDepth: node(focusNodeId)?.getAttribute("data-relation-focus-depth") || "",
      firstNeighborId,
      firstNeighborDepth: node(firstNeighborId)?.getAttribute("data-relation-focus-depth") || ""
    };
  }, { focusNodeId, firstNeighborId });
}

async function clickNearNodeBlankClosesReader(page) {
  const point = await nearNodeBlankPoint(page);
  await page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(point.nodeId)}"]`).click({ force: true });
  await page.waitForSelector(".graph-reader-drawer");

  await page.mouse.click(point.blank.x, point.blank.y);
  await page.waitForFunction(() => !document.querySelector(".graph-reader-drawer"));
  const hit = await lastSigmaHit(page);

  assert.notEqual(hit.kind, "node", "clicking just outside a visible node target should not reopen node reading");
  return { nodeId: point.nodeId, blank: point.blank, hit };
}

async function shiftSelectCommunityNodes(page, community, nodeIds) {
  await closeDrawerIfOpen(page);
  await setGraphSearchQuery(page, "");
  await closeGraphToolbarPanel(page);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".graph-reader-drawer", { state: "detached", timeout: 3_000 }).catch(() => undefined);
  await installCommunityClickLog(page);

  await page.keyboard.down("Shift");
  const clickSteps = [];
  try {
    for (let index = 0; index < nodeIds.length; index += 1) {
      const nodeId = nodeIds[index];
      const point = await nodeClickPoint(page, nodeId);
      clickSteps.push({
        nodeId,
        point,
        selectedBeforeClick: await selectedNodeIds(page)
      });
      assert.equal(point.hitNodeId, nodeId, `community multi-select click point should hit ${nodeId}`);
      await page.mouse.click(point.x, point.y);
      const expected = nodeIds.slice(0, index + 1);
      await waitForExactSelectedNodes(page, expected, `after Shift-clicking ${nodeId}`, point);
      clickSteps[clickSteps.length - 1].selectedAfterClick = await selectedNodeIds(page);
    }
  } finally {
    await page.keyboard.up("Shift");
  }

  try {
    await page.waitForSelector('[data-testid="graph-selection-drawer"]');
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `${community.slug}-multiselect-timeout.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => undefined);
    const diagnostics = {
      screenshotPath,
      hit: await lastSigmaHit(page).catch((hitError) => ({ hitError: String(hitError) })),
      snapshot: await sigmaSnapshot(page).catch((snapshotError) => ({ snapshotError: String(snapshotError) })),
      clickSteps,
      selected: await page.evaluate(() => [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
        .map((node) => node.getAttribute("data-node-id") || "")
        .filter(Boolean)).catch((selectedError) => ({ selectedError: String(selectedError) }))
    };
    throw new assert.AssertionError({
      message: `Community multi-select drawer did not open. Diagnostics: ${JSON.stringify(diagnostics)}`,
      actual: error,
      expected: "graph-selection-drawer",
      operator: "strictEqual"
    });
  }
  const snapshot = await page.evaluate(({ communityId, nodeIds }) => {
    const renderer = document.querySelector(".sigma-global-renderer");
    const drawer = document.querySelector('[data-testid="graph-selection-drawer"]');
    const selectedNodeIds = [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
      .map((node) => node.getAttribute("data-node-id") || "")
      .filter(Boolean);
    return {
      route: document.querySelector(".graph-host")?.getAttribute("data-llm-wiki-graph-route") || "",
      communityFocusId: renderer?.getAttribute("data-community-focus-id") || "",
      sourceCommunityId: renderer?.getAttribute("data-source-community-id") || "",
      selectedNodeIds,
      expectedNodeIds: nodeIds,
      selectionDrawerOpen: Boolean(drawer),
      selectionDrawerTitle: drawer?.querySelector("h2")?.textContent || "",
      selectionDrawerHasEnterCommunity: [...(drawer?.querySelectorAll("button") || [])]
        .some((button) => button.textContent?.includes("进入社区")),
      communitySummaryOpen: Boolean(document.querySelector('[data-testid="graph-community-summary"]')),
      readerOpen: Boolean(document.querySelector(".graph-reader-drawer"))
    };
  }, { communityId: community.id, nodeIds });

  assert.equal(snapshot.route, "sigma-global", "community multi-select should stay on the Sigma route");
  assert.equal(snapshot.communityFocusId, community.id, "community multi-select should keep the current community focus");
  assert.equal(snapshot.sourceCommunityId, community.id, "community multi-select should keep source community context");
  assert.equal(snapshot.selectionDrawerOpen, true, "Shift-selecting community nodes should open the selection drawer");
  assert.equal(snapshot.selectionDrawerHasEnterCommunity, false, "community selection drawer should not offer a nested enter-community action");
  assert.equal(snapshot.communitySummaryOpen, false, "community multi-select should not reopen the old community summary drawer");
  assert.equal(snapshot.readerOpen, false, "community multi-select should switch away from node reading");
  assert.deepEqual(
    [...snapshot.selectedNodeIds].sort(),
    [...nodeIds].sort(),
    "Shift-selecting two community nodes should keep an exact node selection without widening or duplicates"
  );
  assert.equal(snapshot.selectedNodeIds.length, nodeIds.length, "community multi-select should not duplicate selected nodes");
  assert.match(snapshot.selectionDrawerTitle, new RegExp(`选中 ${nodeIds.length} 个节点`), "community multi-select drawer should describe the exact node count");
  return snapshot;
}

async function nodeClickPoint(page, nodeId) {
  return page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`).evaluate((node, nodeId) => {
    const rect = node.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.35, 0.5],
      [0.65, 0.5],
      [0.5, 0.35],
      [0.5, 0.65]
    ];
    for (const [rx, ry] of candidates) {
      const x = rect.left + rect.width * rx;
      const y = rect.top + rect.height * ry;
      const hit = document.elementFromPoint(x, y);
      const hitNodeId = hit?.closest?.(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "";
      if (hitNodeId === nodeId) return { x, y, rect: rectOf(rect), hitNodeId };
    }
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      x: centerX,
      y: centerY,
      rect: rectOf(rect),
      hitNodeId: hit?.closest?.(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "",
      hitClass: String(hit?.getAttribute?.("class") || "")
    };

    function rectOf(value) {
      return {
        left: Math.round(value.left * 1000) / 1000,
        top: Math.round(value.top * 1000) / 1000,
        width: Math.round(value.width * 1000) / 1000,
        height: Math.round(value.height * 1000) / 1000,
        right: Math.round(value.right * 1000) / 1000,
        bottom: Math.round(value.bottom * 1000) / 1000
      };
    }
  }, nodeId);
}

async function waitForExactSelectedNodes(page, expectedNodeIds, label, point) {
  try {
    await page.waitForFunction((expectedNodeIds) => {
      const selected = [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
        .map((node) => node.getAttribute("data-node-id") || "")
        .filter(Boolean);
      return exactMembers(selected, expectedNodeIds);

      function exactMembers(left, right) {
        return left.length === right.length && left.slice().sort().join("\u0000") === right.slice().sort().join("\u0000");
      }
    }, expectedNodeIds, { timeout: 2_000 });
  } catch (error) {
    const selected = await selectedNodeIds(page).catch((selectedError) => ({ selectedError: String(selectedError) }));
    const hit = await lastSigmaHit(page).catch((hitError) => ({ hitError: String(hitError) }));
    const pointStack = point ? await elementsFromPointDiagnostics(page, point.x, point.y).catch((stackError) => ({ stackError: String(stackError) })) : null;
    const clickLog = await communityClickLog(page).catch((logError) => ({ logError: String(logError) }));
    throw new assert.AssertionError({
      message: `Unexpected community multi-select state ${label}. Diagnostics: ${JSON.stringify({ expectedNodeIds, selected, hit, point, pointStack, clickLog })}`,
      actual: error,
      expected: expectedNodeIds,
      operator: "deepStrictEqual"
    });
  }
}

async function installCommunityClickLog(page) {
  await page.evaluate(() => {
    window.__llmWikiCommunityClickLog = [];
    const record = (event) => {
      const target = event.target;
      const closestNode = target?.closest?.(".sigma-global-node-hit-target");
      window.__llmWikiCommunityClickLog.push({
        type: event.type,
        phase: event.eventPhase,
        shiftKey: event.shiftKey,
        clientX: event.clientX,
        clientY: event.clientY,
        targetClass: String(target?.getAttribute?.("class") || ""),
        targetNodeId: closestNode?.getAttribute("data-node-id") || "",
        rootHitKind: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-kind") || "",
        rootHitId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-last-hit-id") || ""
      });
      window.__llmWikiCommunityClickLog = window.__llmWikiCommunityClickLog.slice(-24);
    };
    document.addEventListener("pointerdown", record, true);
    document.addEventListener("click", record, true);
    document.addEventListener("click", record, false);
  });
}

async function communityClickLog(page) {
  return page.evaluate(() => window.__llmWikiCommunityClickLog || []);
}

async function elementsFromPointDiagnostics(page, x, y) {
  return page.evaluate(({ x, y }) => {
    return document.elementsFromPoint(x, y).slice(0, 8).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        className: String(element.getAttribute("class") || ""),
        nodeId: element.closest(".sigma-global-node-hit-target")?.getAttribute("data-node-id") || "",
        communityId: element.closest(".sigma-global-community-region")?.getAttribute("data-community-id") || "",
        testId: element.closest("[data-testid]")?.getAttribute("data-testid") || "",
        rect: {
          left: Math.round(rect.left * 1000) / 1000,
          top: Math.round(rect.top * 1000) / 1000,
          width: Math.round(rect.width * 1000) / 1000,
          height: Math.round(rect.height * 1000) / 1000
        }
      };
    });
  }, { x, y });
}

async function selectedNodeIds(page) {
  return page.evaluate(() => [...document.querySelectorAll(".sigma-global-node-hit-target[data-selected='true']")]
    .map((node) => node.getAttribute("data-node-id") || "")
    .filter(Boolean));
}

async function nearNodeBlankPoint(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          rect,
          nodeId: element.getAttribute("data-node-id") || ""
        };
      })
      .filter(({ rect, nodeId }) => nodeId && rect.width > 0 && rect.height > 0 && rect.width <= 24 && rect.height <= 24);

    for (const { rect, nodeId } of candidates) {
      const centerY = rect.top + rect.height / 2;
      const points = [
        { x: rect.right + 2, y: centerY },
        { x: rect.left - 2, y: centerY },
        { x: rect.left + rect.width / 2, y: rect.bottom + 2 },
        { x: rect.left + rect.width / 2, y: rect.top - 2 }
      ];
      for (const point of points) {
        const hit = document.elementFromPoint(point.x, point.y);
        if (!hit || hit.closest?.(".sigma-global-node-hit-target, .graph-toolbar, .graph-search, .drawer-panel-open")) continue;
        return {
          nodeId,
          blank: {
            x: point.x,
            y: point.y,
            hitTag: hit.tagName || "",
            hitClass: typeof hit.className === "string" ? hit.className : String(hit.className || "")
          }
        };
      }
    }
    throw new Error("Could not find a near-node blank point beside a compact community node");
  });
}

async function sigmaSnapshot(page) {
  return page.evaluate(() => ({
    nodeCount: Number(document.querySelector(".sigma-global-renderer")?.getAttribute("data-node-count") || "0"),
    edgeCount: Number(document.querySelector(".sigma-global-renderer")?.getAttribute("data-edge-count") || "0"),
    communityCount: Number(document.querySelector(".sigma-global-renderer")?.getAttribute("data-community-count") || "0"),
    communityFocusId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-community-focus-id") || "",
    sourceCommunityId: document.querySelector(".sigma-global-renderer")?.getAttribute("data-source-community-id") || "",
    selectedRegions: Array.from(document.querySelectorAll(".sigma-global-community-region[data-selected='true']"))
      .map((region) => region.getAttribute("data-community-id") || "")
      .filter(Boolean)
      .sort(),
    selectedLabels: Array.from(document.querySelectorAll(".sigma-global-community-label[data-selected='true']"))
      .map((label) => label.getAttribute("data-community-id") || "")
      .filter(Boolean)
      .sort(),
    communitySummaryOpen: Boolean(document.querySelector('[data-testid="graph-community-summary"]')),
    searchQuery: document.querySelector(".graph-search-input")?.value || "",
    typeFiltersActive: document.querySelector(".sigma-global-route")?.getAttribute("data-type-filters-active") === "true"
  }));
}

async function waitForSigmaGlobal(page) {
  await page.waitForSelector(".sigma-global-route[data-route='sigma-global']");
  await page.waitForSelector(".sigma-global-renderer[data-renderer='sigma-global']");
  await page.waitForSelector(".sigma-global-community-region");
  await page.waitForSelector(".sigma-global-community-label");
}

async function waitForSigmaCommunity(page, communityId) {
  await waitForSigmaGlobal(page);
  await page.waitForFunction((communityId) => {
    const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    const visibleRegions = document.querySelectorAll(".sigma-global-community-region");
    const visibleLabels = document.querySelectorAll(".sigma-global-community-label");
    return root?.getAttribute("data-community-focus-id") === communityId
      && root?.getAttribute("data-source-community-id") === communityId
      && visibleRegions.length === 1
      && visibleLabels.length === 1;
  }, communityId);
}

async function waitForSigmaCommunityOrDump(page, community, viewportLabel) {
  try {
    await waitForSigmaCommunity(page, community.id);
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `${viewportLabel}-${community.slug}-enter-timeout.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => undefined);
    const snapshot = await sigmaSnapshot(page).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
    const diagnostics = page.__graphDiagnostics || [];
    throw new assert.AssertionError({
      message: `${community.label}: enter-community did not reach Sigma community reading. Diagnostics: ${JSON.stringify({ screenshotPath, snapshot, diagnostics })}`,
      actual: error,
      expected: "focused Sigma community reading",
      operator: "strictEqual"
    });
  }
}

async function waitForCommunityCentered(page, community, viewportLabel) {
  try {
    await page.waitForFunction((community) => {
      const stage = document.querySelector(".graph-stage")?.getBoundingClientRect();
      const region = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(community.id)}"]`)?.getBoundingClientRect();
      if (!stage || !region || region.width <= 0 || region.height <= 0) return false;
      const xRatio = Math.abs((region.left + region.width / 2) - (stage.left + stage.width / 2)) / Math.max(1, stage.width);
      const yRatio = Math.abs((region.top + region.height / 2) - (stage.top + stage.height / 2)) / Math.max(1, stage.height);
      return xRatio <= 0.28 && yRatio <= 0.28;
    }, community, { timeout: 4_000 });
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `${viewportLabel}-${community.slug}-center-timeout.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => undefined);
    const snapshot = await communityReadingSnapshot(page, community).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
    throw new assert.AssertionError({
      message: `${community.label}: community did not settle centered enough. Diagnostics: ${JSON.stringify({ screenshotPath, snapshot })}`,
      actual: error,
      expected: "centered community reading",
      operator: "strictEqual"
    });
  }
}

async function waitForSigmaGlobalUnfocused(page) {
  await waitForSigmaGlobal(page);
  await page.waitForFunction(() => {
    const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    return root?.getAttribute("data-community-focus-id") === ""
      && Number(root?.getAttribute("data-community-count") || "0") > 1;
  });
}

async function waitForSelectedCommunity(page, communityId) {
  await page.waitForFunction((communityId) => {
    return [...document.querySelectorAll(".sigma-global-community-region[data-selected='true']")]
      .map((region) => region.getAttribute("data-community-id") || "")
      .includes(communityId);
  }, communityId);
}

async function waitForNoSelectedCommunity(page) {
  await page.waitForFunction(() => {
    return document.querySelectorAll(".sigma-global-community-region[data-selected='true']").length === 0
      && document.querySelectorAll(".sigma-global-community-label[data-selected='true']").length === 0;
  });
}

async function waitForPlainGlobal(page) {
  try {
    await waitForNoSelectedCommunity(page);
    await page.waitForFunction(() => {
      const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
      return root?.getAttribute("data-community-focus-id") === ""
        && root?.getAttribute("data-source-community-id") === "";
    });
  } catch (error) {
    const snapshot = await sigmaSnapshot(page).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
    const diagnostics = page.__graphDiagnostics || [];
    throw new assert.AssertionError({
      message: `Expected plain global graph. Snapshot: ${JSON.stringify({ snapshot, diagnostics })}`,
      actual: error,
      expected: "plain global graph",
      operator: "strictEqual"
    });
  }
}

async function clickCommunityRegion(page, communityId) {
  const point = await findCommunityRegionPoint(page, communityId);
  await page.mouse.click(point.x, point.y);
}

async function findCommunityRegionPoint(page, communityId) {
  return page.evaluate((communityId) => {
    const region = document.querySelector(`.sigma-global-community-region[data-community-id="${CSS.escape(communityId)}"]`);
    if (!region) throw new Error(`Missing Sigma community region ${communityId}`);
    const rect = region.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.5, 0.34],
      [0.34, 0.5],
      [0.66, 0.5],
      [0.5, 0.66]
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

async function clickGlobalBlank(page) {
  const candidates = await graphBlankCandidates(page);
  for (const point of candidates) {
    pushGraphDiagnostic(page, {
      kind: "blank-click",
      point
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(120);
    const snapshot = await sigmaSnapshot(page);
    const hit = await lastSigmaHit(page);
    pushGraphDiagnostic(page, {
      kind: "blank-click-after",
      hit,
      snapshot
    });
    if (
      snapshot.sourceCommunityId === "" &&
      snapshot.selectedRegions.length === 0 &&
      snapshot.selectedLabels.length === 0
    ) {
      return;
    }
    await closeDrawerIfOpen(page);
  }
  throw new Error(`Could not clear the graph with ${candidates.length} blank candidates`);
}

async function lastSigmaHit(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    return {
      kind: root?.getAttribute("data-last-hit-kind") || "",
      id: root?.getAttribute("data-last-hit-id") || ""
    };
  });
}

async function graphBlankCandidates(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".sigma-global-route") || document.querySelector(".graph-host");
    if (!host) throw new Error("Missing Sigma global route for blank click");
    const rect = host.getBoundingClientRect();
    const nodeRects = [...document.querySelectorAll(".sigma-global-node-hit-target")]
      .map((element) => element.getBoundingClientRect())
      .filter((item) => item.width > 0 && item.height > 0)
      .map((item) => ({
        left: item.left - 24,
        top: item.top - 24,
        right: item.right + 24,
        bottom: item.bottom + 24
      }));
    const candidates = [];
    for (const rx of [0.08, 0.18, 0.28, 0.38, 0.5, 0.62, 0.74, 0.86, 0.94]) {
      for (const ry of [0.1, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9]) {
        candidates.push([rx, ry]);
      }
    }
    const points = [];
    for (const [rx, ry] of candidates) {
      const x = rect.left + rect.width * rx;
      const y = rect.top + rect.height * ry;
      if (nodeRects.some((node) => x >= node.left && x <= node.right && y >= node.top && y <= node.bottom)) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit?.closest?.(".drawer-panel-open, .drawer-panel, .sigma-global-community-region, .sigma-global-node-hit-target, .sigma-global-community-label, .sigma-global-aggregation-container, .graph-toolbar, .graph-search")) {
        points.push({
          x,
          y,
          hitTag: hit?.tagName || "",
          hitClass: typeof hit?.className === "string" ? hit.className : String(hit?.className || "")
        });
      }
    }
    if (points.length) return points.slice(0, 16);
    throw new Error("Could not find a graph blank point outside communities, nodes, labels, and controls");
  });
}

async function clickReturnGlobal(page) {
  await page.getByRole("button", { name: "回全图" }).click({ force: true });
  await page.waitForFunction(() => {
    const root = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
    return root?.getAttribute("data-community-focus-id") === ""
      && Number(root?.getAttribute("data-community-count") || "0") > 1;
  }, undefined, { timeout: 2_000 });
}

async function closeDrawerIfOpen(page) {
  const button = page.locator(".drawer-header button[aria-label='关闭']");
  if (await button.count()) {
    await button.first().click({ force: true });
    await page.waitForSelector(".drawer-panel-open", { state: "detached", timeout: 3_000 }).catch(() => undefined);
  }
}

async function drawerTestId(page) {
  return page.evaluate(() => {
    if (document.querySelector(".drawer-panel-open .graph-reader-drawer")) return "graph-reader";
    return document.querySelector(".drawer-panel-open [data-testid]")?.getAttribute("data-testid") || "";
  });
}

async function setGraphSearchQuery(page, query) {
  const input = page.locator(".graph-search-input");
  await input.waitFor();
  await input.fill(query);
}

async function setTypeFilter(page, type, enabled) {
  await ensureFilterPanelOpen(page);
  const locator = page.locator(`.graph-type-filter input[data-type="${cssString(type)}"]`);
  await locator.waitFor();
  await locator.setChecked(enabled);
}

async function ensureFilterPanelOpen(page) {
  const open = await page.locator('.graph-toolbar[data-panel="filters"]').count();
  if (open) return;
  await page.getByRole("button", { name: "筛选" }).click();
  await page.waitForSelector('.graph-toolbar[data-panel="filters"]');
}

async function nodeBox(page, nodeId) {
  return page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: round(rect.left),
      top: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      centerX: round(rect.left + rect.width / 2),
      centerY: round(rect.top + rect.height / 2)
    };
    function round(value) {
      return Math.round(value * 1000) / 1000;
    }
  });
}

async function dragSigmaNode(page, nodeId, delta) {
  const locator = page.locator(`.sigma-global-node-hit-target[data-node-id="${cssString(nodeId)}"]`);
  await locator.waitFor();
  const start = await nodeBox(page, nodeId);
  const end = { x: start.centerX + delta.dx, y: start.centerY + delta.dy };
  await page.mouse.move(start.centerX, start.centerY);
  await page.mouse.down();
  await page.mouse.move(start.centerX + delta.dx / 2, start.centerY + delta.dy / 2, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  return {
    start: { x: round(start.centerX), y: round(start.centerY) },
    end: { x: round(end.x), y: round(end.y) },
    delta
  };
}

function assertPointShifted(after, before, label) {
  assert.ok(
    Math.abs(after.centerX - before.centerX) >= 12 || Math.abs(after.centerY - before.centerY) >= 12,
    `${label}: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
  );
}

function cssString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function round(value) {
  return Math.round(value * 1000) / 1000;
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
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
  const browserProcess = typeof browser.process === "function" ? browser.process() : null;
  if (!closed) browserProcess?.kill("SIGKILL");
}
