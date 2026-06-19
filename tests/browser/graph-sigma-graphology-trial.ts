import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildCommunityAggregationMarkers } from "../../packages/graph-engine/src";
import {
  generateLargeGraphFixture,
  type LargeGraphFixtureMetadata
} from "../../packages/graph-engine/test/large-graph-fixtures";
import { buildSigmaGraphologyTrialModel } from "../../packages/graph-engine/test/sigma-trial-adapter";
import {
  FRAME_P95_CEILING_MS,
  FPS_FLOOR,
  NAME_HELPER_INIT_SCRIPT,
  TRIAL_SCHEMA_VERSION,
  actionThresholds,
  DURATION_GATED_ACTIONS,
  durationFailureClass,
  durationLimitMs,
  frameSampleFailureClass,
  memoryGrowthFailureClass,
  memoryGrowthFailureDetail,
  parseRequestedShapes,
  validateTrialResults,
  waitForAnimationFrames
} from "./graph-renderer-trial-shared";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repoRoot = path.resolve(import.meta.dirname, "../..");
const artifactDir = process.env.GRAPH_SIGMA_TRIAL_ARTIFACT_DIR || path.join(os.tmpdir(), `llm-wiki-graph-sigma-trial-${Date.now()}`);
const executablePath = process.env.GRAPH_SIGMA_TRIAL_CHROME_EXECUTABLE || "";
const requestedShapes = parseRequestedShapes(process.env.GRAPH_SIGMA_TRIAL_SHAPES);
const resultPath = path.join(artifactDir, "sigma-graphology-trial-results.json");
const buildCommit = readBuildCommit();
const rendererName = "sigma-graphology-webgl-trial";
const productionPath = false;
let capturedBrowserVersion = "unknown";
const runContext = {
  run_started_at: "",
  run_finished_at: "",
  browser: "unknown",
  build_commit: buildCommit
};
const sigmaVersion = "3.0.3";
const graphologyVersion = "0.26.0";
const sigmaScript = path.join(repoRoot, "node_modules/sigma/dist/sigma.min.js");
const graphologyScript = path.join(repoRoot, "node_modules/graphology/dist/graphology.umd.min.js");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


function readBuildCommit(): string {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
async function main(): Promise<void> {
  await fs.mkdir(artifactDir, { recursive: true });
  const records: PerformanceRecord[] = [];
  const errors: string[] = [];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  runContext.run_started_at = new Date().toISOString();
  try {
    capturedBrowserVersion = await browser.version();
    runContext.browser = capturedBrowserVersion;
  } catch {
    runContext.browser = capturedBrowserVersion;
  }

  try {
    for (const shape of requestedShapes) {
      const fixture = generateLargeGraphFixture(shape);
      const searchResultIds = fixture.data.nodes.filter((node) => node.label.includes("needle")).map((node) => node.id);
      const selectedNodeIds = fixture.data.nodes.slice(0, Math.min(8, fixture.data.nodes.length)).map((node) => node.id);
      const aggregationMarkers = buildCommunityAggregationMarkers(fixture.data, {
        pins: fixture.pins,
        searchResultIds,
        selectedNodeIds,
        minCommunitySize: 80
      });
      const model = buildSigmaGraphologyTrialModel(fixture.data, {
        pins: fixture.pins,
        searchResultIds,
        selection: selectedNodeIds[0] ? { kind: "node", id: selectedNodeIds[0] } : null,
        aggregationMarkers
      });
      const html = await writeTrialHtml(shape, model);
      try {
        const shapeRecords = await measureShape(browser, fixture.metadata, html);
        records.push(...shapeRecords);
      } catch (error) {
        errors.push(`${shape}: ${errorDetail(error)}`);
        records.push(failedRecord(fixture.metadata, {
          action: "fixture_load_or_action",
          failure_class: classifyError(error),
          failure_detail: errorDetail(error),
          artifact_path: resultPath
        }));
      } finally {
        await writeResult(records, errors);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  // Stamp the run-finish timestamp once the whole run is done, then write the
  // final artifact and validate. Records are built during measurement when the
  // finish time is unknown, so we backfill it before persisting.
  runContext.run_finished_at = new Date().toISOString();
  for (const record of records) record.run_finished_at = runContext.run_finished_at;
  await writeResult(records, errors);

  validateTrialResults({
    renderer: "Sigma/Graphology",
    requestedShapes,
    records,
    errors,
    resultPath
  });
  console.log(`Wrote ${records.length} Sigma/Graphology trial records to ${resultPath}`);
}

async function writeResult(records: PerformanceRecord[], errors: string[]): Promise<void> {
  runContext.run_finished_at = new Date().toISOString();
  await fs.writeFile(resultPath, `${JSON.stringify({
    schema_version: TRIAL_SCHEMA_VERSION,
    run_started_at: runContext.run_started_at,
    run_finished_at: runContext.run_finished_at,
    renderer: rendererName,
    production_path: productionPath,
    browser: runContext.browser,
    build_commit: runContext.build_commit,
    candidate: {
      sigma: sigmaVersion,
      graphology: graphologyVersion,
      production_path_switched: false
    },
    artifact_dir: artifactDir,
    shapes: requestedShapes,
    records,
    errors
  }, null, 2)}\n`);
}

async function writeTrialHtml(shape: string, model: unknown): Promise<string> {
  const file = path.join(artifactDir, `${shape}.html`);
  await fs.writeFile(file, `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sigma Graphology Trial ${escapeHtml(shape)}</title>
  <style>
    html, body, #stage { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: #f8fafc; font-family: system-ui, sans-serif; }
    #stage { position: relative; }
    #drawer { position: absolute; right: 0; top: 0; width: 320px; height: 100%; background: white; border-left: 1px solid #e5e7eb; padding: 16px; box-sizing: border-box; display: none; }

    #drawer[data-open="true"] { display: block; }
    .summary-card { display: flex; flex-direction: column; gap: 8px; }
    .summary-kicker { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-title { font-size: 18px; margin: 0; }
    .summary-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .summary-fact { display: flex; justify-content: space-between; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; padding: 2px 0; }
    .summary-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .summary-item { font-size: 13px; color: #1e293b; padding: 4px 6px; background: #f8fafc; border-radius: 4px; }
  </style>
  <script src="${pathToFileURL(graphologyScript).href}"></script>
  <script src="${pathToFileURL(sigmaScript).href}"></script>
</head>
<body>
  <div id="stage"></div>
  <aside id="drawer"></aside>
  <script>
    const model = ${JSON.stringify(model)};
    const GraphClass = globalThis.graphology?.Graph || globalThis.graphology?.default || globalThis.graphology;
    const SigmaClass = globalThis.Sigma?.default || globalThis.Sigma;
    const graph = new GraphClass({ multi: true, type: "undirected", allowSelfLoops: false });
    const communityById = new Map(model.communities.map((community) => [community.id, community]));
    const aggregationById = new Map(model.aggregations.map((aggregation) => [aggregation.id, aggregation]));
    for (const node of model.nodes) {
      graph.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: node.size,
        color: node.color,
        communityId: node.communityId,
        searchHit: node.searchHit,
        selected: node.selected,
        pinned: node.pinned,
        aggregationIds: node.aggregationIds
      });
    }
    for (const edge of model.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
          color: edge.color,
          size: edge.size,
          relationType: edge.relationType
        });
      }
    }
    const renderer = new SigmaClass(graph, document.getElementById("stage"), {
      renderEdgeLabels: false,
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelRenderedSizeThreshold: 14,
      minCameraRatio: 0.02,
      maxCameraRatio: 50
    });
    let selectedNodeId = model.nodes.find((node) => node.selected)?.id || null;
    let selectedContainerId = null;
    function cameraState() {
      const camera = renderer.getCamera();
      return camera && typeof camera.getState === "function" ? camera.getState() : {};
    }
    function refresh() {
      if (typeof renderer.refresh === "function") renderer.refresh();
    }
    function setNodeVisual(id, patch) {
      if (!graph.hasNode(id)) return;
      for (const [key, value] of Object.entries(patch)) graph.setNodeAttribute(id, key, value);
    }
    function searchHighlight(query) {
      const normalized = String(query || "").toLowerCase();
      let hits = 0;
      for (const node of model.nodes) {
        const hit = normalized && node.label.toLowerCase().includes(normalized);
        if (hit) hits += 1;
        setNodeVisual(node.id, {
          searchHit: Boolean(hit),
          color: hit ? "#f59e0b" : node.selected ? "#ef4444" : node.color,
          size: hit ? Math.max(node.size, 4) : node.size
        });
      }
      refresh();
      return { hits };
    }
    function pointSelect(id) {
      if (!graph.hasNode(id)) return { selectedNodeId: null };
      if (selectedNodeId && graph.hasNode(selectedNodeId)) {
        const original = model.nodes.find((node) => node.id === selectedNodeId);
        setNodeVisual(selectedNodeId, { selected: false, color: original?.color || "#64748b" });
      }
      selectedNodeId = id;
      setNodeVisual(id, { selected: true, color: "#ef4444", size: Math.max(graph.getNodeAttribute(id, "size") || 2, 5) });
      refresh();
      return { selectedNodeId: id };
    }
    function containerSelect(id) {
      const aggregation = aggregationById.get(id);
      const community = communityById.get(id);
      const nodeIds = aggregation?.nodeIds || community?.nodeIds || [];
      selectedContainerId = id;
      for (const nodeId of nodeIds.slice(0, 250)) {
        if (graph.hasNode(nodeId)) setNodeVisual(nodeId, { color: "#7c3aed", size: Math.max(graph.getNodeAttribute(nodeId, "size") || 2, 3) });
      }
      refresh();
      return { selectedContainerId: id, nodeCount: nodeIds.length };
    }
    function resolveDrawerPayload() {
      if (selectedContainerId) {
        return model.drawer.communities[selectedContainerId] || model.drawer.global;
      }
      if (selectedNodeId && model.drawer.nodes[selectedNodeId]) {
        return model.drawer.nodes[selectedNodeId];
      }
      return model.drawer.global;
    }
    function openDrawer() {
      const drawer = document.getElementById("drawer");
      const payload = resolveDrawerPayload();
      // Render a representative summary card (kicker + title + fact grid + list)
      // so the drawer DOM cost mirrors the production GraphSummaryDrawer instead
      // of a single text node.
      drawer.innerHTML = "";
      const card = document.createElement("article");
      card.className = "summary-card";
      const kicker = document.createElement("div");
      kicker.className = "summary-kicker";
      kicker.textContent = payload.kicker;
      const title = document.createElement("h2");
      title.className = "summary-title";
      title.textContent = payload.title;
      const facts = document.createElement("div");
      facts.className = "summary-facts";
      for (const fact of payload.facts) {
        const row = document.createElement("div");
        row.className = "summary-fact";
        const lab = document.createElement("span");
        lab.className = "summary-fact-label";
        lab.textContent = fact.label;
        const val = document.createElement("span");
        val.className = "summary-fact-value";
        val.textContent = fact.value;
        row.appendChild(lab);
        row.appendChild(val);
        facts.appendChild(row);
      }
      card.appendChild(kicker);
      card.appendChild(title);
      card.appendChild(facts);
      if (payload.items.length) {
        const list = document.createElement("ul");
        list.className = "summary-list";
        for (const item of payload.items) {
          const li = document.createElement("li");
          li.className = "summary-item";
          li.textContent = item.label;
          list.appendChild(li);
        }
        card.appendChild(list);
      }
      drawer.appendChild(card);
      drawer.dataset.open = "true";
      return { open: true, kind: payload.kind, itemCount: payload.items.length, factCount: payload.facts.length };
    }
    function enterCommunity(id) {
      return containerSelect(id);
    }
    function returnGlobal() {
      selectedContainerId = null;
      const camera = renderer.getCamera();
      if (camera && typeof camera.setState === "function") camera.setState({ x: 0.5, y: 0.5, ratio: 1 });
      refresh();
      return { camera: cameraState() };
    }
    window.__sigmaTrial = {
      ready: false,
      graph,
      renderer,
      model,
      cameraState,
      searchHighlight,
      pointSelect,
      containerSelect,
      openDrawer,
      enterCommunity,
      returnGlobal,
      firstNodeId: model.nodes[0]?.id || null,
      firstCommunityId: model.communities[0]?.id || null,
      firstContainerId: model.aggregations[0]?.id || model.communities[0]?.id || null,
      counts() {
        return {
          nodes: graph.order,
          edges: graph.size,
          communities: model.communities.length,
          aggregations: model.aggregations.length,
          selectedNodeId,
          selectedContainerId,
          camera: cameraState()
        };
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__sigmaTrial.ready = true;
    }));
  </script>
</body>
</html>
`);
  return file;
}

async function measureShape(browser: BrowserLike, metadata: LargeGraphFixtureMetadata, html: string): Promise<PerformanceRecord[]> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(timeoutFor(metadata));
  page.setDefaultNavigationTimeout(45_000);
  // esbuild (tsx, keepNames:true) injects a __name helper into serialized fns.
  // Define it as a no-op on every document so page.evaluate arrow fns resolve.
  await page.addInitScript(NAME_HELPER_INIT_SCRIPT);
  const records: PerformanceRecord[] = [];
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded", timeout: navigationTimeoutFor(metadata) });
    // Record the graph-engine first-paint mark the page stamps when Sigma
    // begins its first draw, so we measure rendering, not page navigation.
    const renderStarted = await page.evaluate(() => performance.now());
    await page.waitForFunction(() => Boolean((window as any).__sigmaTrial?.ready));
    const renderFinished = await page.evaluate(() => performance.now());
    records.push(await recordFromPage(page, metadata, {
      action: "initial_render",
      duration_ms: renderFinished - renderStarted,
      pass: true,
      artifact_path: resultPath
    }));
    for (const action of [
      () => measureWheelZoom(page, metadata),
      () => measureDrag(page, metadata),
      () => measureSearch(page, metadata),
      () => measurePointSelect(page, metadata),
      () => measureContainerSelect(page, metadata),
      () => measureDrawerOpen(page, metadata),
      () => measureEnterCommunity(page, metadata),
      () => measureReturnGlobal(page, metadata)
    ]) {
      records.push(await safeMeasure(page, metadata, action));
    }
    records.push(await safeMeasure(page, metadata, () => measureRepeatedCycles(page, metadata)));
  } finally {
    await page.close().catch(() => undefined);
  }
  return records;
}

async function safeMeasure(page: PageLike, metadata: LargeGraphFixtureMetadata, action: () => Promise<PerformanceRecord>): Promise<PerformanceRecord> {
  try {
    return await action();
  } catch (error) {
    return failedRecord(metadata, {
      action: inferActionName(error),
      failure_class: classifyError(error),
      failure_detail: errorDetail(error),
      artifact_path: resultPath
    });
  }
}

async function measureWheelZoom(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const before = await cameraState(page);
  // Warmup so the first frames (layout/shader compile) are not scored.
  await driveWheel(page, 500);
  const runs: { fps: number; p95: number; durationMs: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const samplePromise = sampleAnimationFrames(page, 900);
    await driveWheel(page, 900);
    runs.push(await samplePromise);
  }
  const after = await cameraState(page);
  return frameSampleRecord(page, metadata, {
    action: "wheel_zoom",
    changed: JSON.stringify(after) !== JSON.stringify(before),
    runs
  });
}

async function measureDrag(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const before = await cameraState(page);
  await driveDrag(page, 500);
  const runs: { fps: number; p95: number; durationMs: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const samplePromise = sampleAnimationFrames(page, 900);
    await driveDrag(page, 900);
    runs.push(await samplePromise);
  }
  const after = await cameraState(page);
  return frameSampleRecord(page, metadata, {
    action: "drag",
    changed: JSON.stringify(after) !== JSON.stringify(before),
    runs
  });
}

async function measureSearch(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => (window as any).__sigmaTrial.searchHighlight("needle"));
  await waitForAnimationFrames(page);
  const hits = (result as { hits: number }).hits;
  return recordFromPage(page, metadata, {
    action: "search_highlight",
    duration_ms: performance.now() - started,
    pass: hits === metadata.search_hits,
    failure_class: hits === metadata.search_hits ? null : "search_hit_mismatch",
    failure_detail: hits === metadata.search_hits ? null : `expected=${metadata.search_hits}; actual=${hits}`,
    artifact_path: resultPath
  });
}

async function measurePointSelect(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => {
    const trial = (window as any).__sigmaTrial;
    return trial.pointSelect(trial.firstNodeId);
  });
  await waitForAnimationFrames(page);
  const counts = await page.evaluate(() => (window as any).__sigmaTrial.counts());
  const expected = (result as { selectedNodeId: string | null }).selectedNodeId;
  const actual = (counts as { selectedNodeId: string | null }).selectedNodeId;
  return recordFromPage(page, metadata, {
    action: "point_select",
    duration_ms: performance.now() - started,
    pass: Boolean(expected) && actual === expected,
    failure_class: Boolean(expected) && actual === expected ? null : "selected_node_mismatch",
    failure_detail: Boolean(expected) && actual === expected ? null : `expected=${expected ?? "null"}; actual=${actual ?? "null"}`,
    artifact_path: resultPath
  });
}

async function measureContainerSelect(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => {
    const trial = (window as any).__sigmaTrial;
    return trial.containerSelect(trial.firstContainerId);
  });
  await waitForAnimationFrames(page);
  const counts = await page.evaluate(() => (window as any).__sigmaTrial.counts());
  const expected = (result as { selectedContainerId: string | null }).selectedContainerId;
  const actual = (counts as { selectedContainerId: string | null }).selectedContainerId;
  return recordFromPage(page, metadata, {
    action: "container_select",
    duration_ms: performance.now() - started,
    pass: Boolean(expected) && actual === expected,
    failure_class: Boolean(expected) && actual === expected ? null : "selected_container_mismatch",
    failure_detail: Boolean(expected) && actual === expected ? null : `expected=${expected ?? "null"}; actual=${actual ?? "null"}`,
    artifact_path: resultPath
  });
}

async function measureDrawerOpen(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => (window as any).__sigmaTrial.openDrawer());
  await waitForAnimationFrames(page);
  const card = await page.evaluate(() => {
    const drawer = document.getElementById("drawer");
    return {
      open: drawer?.dataset.open === "true",
      cards: drawer?.querySelectorAll(".summary-card").length ?? 0,
      facts: drawer?.querySelectorAll(".summary-fact").length ?? 0,
      items: drawer?.querySelectorAll(".summary-item").length ?? 0
    };
  });
  const opened = Boolean((result as { open: boolean }).open) && Boolean(card.open);
  const rendered = opened && (card.cards ?? 0) > 0 && (card.facts ?? 0) > 0;
  return recordFromPage(page, metadata, {
    action: "drawer_open",
    duration_ms: performance.now() - started,
    pass: rendered,
    failure_class: rendered ? null : "drawer_not_opened",
    failure_detail: rendered ? null : `cards=${card.cards}; facts=${card.facts}; items=${card.items}`,
    artifact_path: resultPath
  });
}

async function measureEnterCommunity(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => {
    const trial = (window as any).__sigmaTrial;
    return trial.enterCommunity(trial.firstCommunityId);
  });
  await waitForAnimationFrames(page);
  const counts = await page.evaluate(() => (window as any).__sigmaTrial.counts());
  const expected = (result as { selectedContainerId: string | null }).selectedContainerId;
  const actual = (counts as { selectedContainerId: string | null }).selectedContainerId;
  return recordFromPage(page, metadata, {
    action: "enter_community",
    duration_ms: performance.now() - started,
    pass: Boolean(expected) && actual === expected,
    failure_class: Boolean(expected) && actual === expected ? null : "community_selection_mismatch",
    failure_detail: Boolean(expected) && actual === expected ? null : `expected=${expected ?? "null"}; actual=${actual ?? "null"}`,
    artifact_path: resultPath
  });
}

async function measureReturnGlobal(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  await page.evaluate(() => (window as any).__sigmaTrial.returnGlobal());
  await waitForAnimationFrames(page);
  const counts = await page.evaluate(() => (window as any).__sigmaTrial.counts());
  const selectedContainerId = (counts as { selectedContainerId: string | null }).selectedContainerId;
  return recordFromPage(page, metadata, {
    action: "return_global",
    duration_ms: performance.now() - started,
    pass: selectedContainerId == null,
    failure_class: selectedContainerId == null ? null : "global_return_incomplete",
    failure_detail: selectedContainerId == null ? null : `selectedContainerId=${selectedContainerId}`,
    artifact_path: resultPath
  });
}

async function measureRepeatedCycles(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  // Larger graphs run more repeated search/community/drawer/return cycles so the
  // recorded memory growth is meaningful and the field is never "not run".
  const cycleCount = metadata.nodes >= 10000 ? 6 : metadata.nodes >= 5000 ? 5 : 3;
  await settleMemory(page);
  const before = await memoryMb(page);
  const started = performance.now();
  for (let index = 0; index < cycleCount; index += 1) {
    await page.evaluate(() => {
      const trial = (window as any).__sigmaTrial;
      trial.searchHighlight("needle");
      trial.pointSelect(trial.firstNodeId);
      trial.containerSelect(trial.firstContainerId);
      trial.openDrawer();
      trial.returnGlobal();
    });
    await waitForAnimationFrames(page, 2);
  }
  await settleMemory(page);
  const after = await memoryMb(page);
  const memoryGrowth = before == null || after == null ? null : round(after - before);
  const failureClass = memoryGrowthFailureClass(memoryGrowth, metadata);
  const record = await recordFromPage(page, metadata, {
    action: "repeated_search_community_drawer_cycles",
    duration_ms: performance.now() - started,
    pass: failureClass == null,
    failure_class: failureClass,
    failure_detail: memoryGrowthFailureDetail(memoryGrowth, metadata),
    artifact_path: resultPath
  });
  record.memory_after_cycles_mb = after;
  record.memory_growth_mb = memoryGrowth;
  return record;
}

async function recordFromPage(
  page: PageLike,
  metadata: LargeGraphFixtureMetadata,
  input: Partial<PerformanceRecord> & { action: string; artifact_path: string }
): Promise<PerformanceRecord> {
  const counts = await page.evaluate(() => {
    const trial = (window as any).__sigmaTrial;
    const trialCounts = trial?.counts?.() ?? {};
    return {
      dom_node_count: document.querySelectorAll("*").length,
      visible_node_count: trialCounts.nodes ?? null,
      visible_edge_count: trialCounts.edges ?? null,
      visible_label_count: 0,
      visible_card_count: 0,
      memory_peak_mb: typeof performance !== "undefined" && "memory" in performance
        ? Math.round((((performance as any).memory?.usedJSHeapSize || 0) / 1024 / 1024) * 10) / 10
        : null,
      long_task_count: performance.getEntriesByType ? performance.getEntriesByType("longtask").length : null,
      interaction_mode: "candidate-global",
      interaction_updated_objects: trialCounts.nodes ?? null,
      interaction_hidden_objects: 0,
      interaction_preserved_nodes: trialCounts.nodes ?? null,
      interaction_max_updates: trialCounts.nodes ?? null
    };
  });
  return {
    ...baseRecord(metadata, input.action, input.artifact_path),
    ...counts,
    duration_ms: round(input.duration_ms ?? 0),
    fps: input.fps == null ? null : round(input.fps),
    frame_p95_ms: input.frame_p95_ms == null ? null : round(input.frame_p95_ms),
    pass: input.pass ?? true,
    failure_class: input.failure_class ?? null,
    failure_detail: input.failure_detail ?? null
  };
  return applyDurationGate(metadata, record);

  function applyDurationGate(meta: LargeGraphFixtureMetadata, record: PerformanceRecord): PerformanceRecord {
    if (!DURATION_GATED_ACTIONS.has(record.action)) return record;
    if (record.failure_class) return record;
    const probe = { duration_ms: record.duration_ms };
    const metadataForGate = { nodes: meta.nodes };
    const failure = durationFailureClass(probe, metadataForGate, record.action);
    if (!failure) return record;
    const limit = durationLimitMs(metadataForGate, record.action);
    record.pass = false;
    record.failure_class = failure;
    record.failure_detail = `duration_ms=${record.duration_ms}; ceiling=${limit}`;
    return record;
  }
}

function failedRecord(
  metadata: LargeGraphFixtureMetadata,
  input: { action: string; failure_class: string; failure_detail?: string; artifact_path: string }
): PerformanceRecord {
  return {
    ...baseRecord(metadata, input.action, input.artifact_path),
    failure_class: input.failure_class,
    failure_detail: input.failure_detail ?? null
  };
}

function baseRecord(metadata: LargeGraphFixtureMetadata, action: string, artifactPath: string): PerformanceRecord {
  return {
    schema_version: TRIAL_SCHEMA_VERSION,
    renderer: rendererName,
    production_path: productionPath,
    graph_shape: metadata.id,
    nodes: metadata.nodes,
    edges: metadata.edges,
    communities: metadata.communities,
    largest_community: metadata.largest_community,
    largest_connected_density: metadata.largest_connected_density,
    search_hits: metadata.search_hits,
    pin_count: metadata.pin_count,
    oversized_community: metadata.oversized_community,
    action,
    duration_ms: null,
    fps: null,
    frame_p95_ms: null,
    long_task_count: null,
    dom_node_count: null,
    visible_node_count: null,
    visible_edge_count: null,
    visible_label_count: null,
    visible_card_count: null,
    interaction_mode: null,
    interaction_updated_objects: null,
    interaction_hidden_objects: null,
    interaction_preserved_nodes: null,
    interaction_max_updates: null,
    memory_peak_mb: null,
    memory_after_cycles_mb: null,
    memory_growth_mb: null,
    thresholds: actionThresholds(metadata, action),
    browser: runContext.browser,
    build_commit: runContext.build_commit,
    run_started_at: runContext.run_started_at,
    run_finished_at: runContext.run_finished_at,
    pass: false,
    failure_class: null,
    failure_detail: null,
    artifact_path: artifactPath,
    measured_at: new Date().toISOString()
  };
}

async function cameraState(page: PageLike): Promise<unknown> {
  return page.evaluate(() => (window as any).__sigmaTrial.cameraState());
}

// Best-effort GC + idle settle so memory deltas reflect retained growth
// rather than transient allocations from the just-finished interaction burst.
async function settleMemory(page: PageLike): Promise<void> {
  try {
    await page.evaluate("() => { if (typeof gc === 'function') gc(); }");
  } catch {
    // gc is not exposed unless --js-flags=--expose-gc; fall through to rAF settle.
  }
  await page.evaluate("() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))");
}

async function memoryMb(page: PageLike): Promise<number | null> {
  return page.evaluate(() => {
    if (typeof performance === "undefined" || !("memory" in performance)) return null;
    const used = (performance as any).memory?.usedJSHeapSize;
    return typeof used === "number" ? Math.round((used / 1024 / 1024) * 10) / 10 : null;
  });
}

// Drive a wheel-zoom burst for the given window with a coarse step so the host
// is not polling on every frame and starving the page requestAnimationFrame loop.
async function driveWheel(page: PageLike, durationMs: number): Promise<void> {
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    await page.mouse.move(720, 480);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
}

// Drive a continuous canvas drag for the given window.
async function driveDrag(page: PageLike, durationMs: number): Promise<void> {
  await page.mouse.move(640, 400);
  await page.mouse.down();
  const end = performance.now() + durationMs;
  let dx = 640;
  let dy = 400;
  while (performance.now() < end) {
    dx += 16;
    dy += 12;
    if (dx > 1260) dx = 580;
    if (dy > 820) dy = 380;
    await page.mouse.move(dx, dy);
    await page.waitForTimeout(55);
  }
  await page.mouse.up();
}

// Reduce warmup-then-3-run frame samples to a single record: the scored metrics
// are the MEDIAN fps and median frame p95 (the plan's median-must-pass rule),
// while the worst run is preserved on the record for auditability.
async function frameSampleRecord(
  page: PageLike,
  metadata: LargeGraphFixtureMetadata,
  input: { action: "wheel_zoom" | "drag"; changed: boolean; runs: { fps: number; p95: number; durationMs: number }[] }
): Promise<PerformanceRecord> {
  const byFps = [...input.runs].sort((a, b) => a.fps - b.fps);
  const byP95 = [...input.runs].sort((a, b) => a.p95 - b.p95);
  const median = (arr: { fps: number; p95: number }[], key: "fps" | "p95") => {
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid][key] : (arr[mid - 1][key] + arr[mid][key]) / 2;
  };
  const fps = median(byFps, "fps");
  const p95 = median(byP95, "p95");
  const worst = byFps[0];
  const probe = { fps, frame_p95_ms: p95 };
  const frameFailure = frameSampleFailureClass(probe);
  const failureClass = !input.changed ? "camera_unchanged" : frameFailure;
  const record = await recordFromPage(page, metadata, {
    action: input.action,
    duration_ms: input.runs.reduce((sum, run) => sum + run.durationMs, 0),
    fps,
    frame_p95_ms: p95,
    pass: input.changed && failureClass == null,
    failure_class: failureClass,
    failure_detail: failureClass ? `median_fps=${fps}; median_frame_p95_ms=${p95}; floor=${FPS_FLOOR}; ceiling=${FRAME_P95_CEILING_MS}` : null,
    artifact_path: resultPath
  });
  record.warmup_runs = input.runs.length;
  record.median_fps = fps;
  record.worst_run_fps = worst ? worst.fps : null;
  record.worst_run_frame_p95_ms = worst ? worst.p95 : null;
  return record;
}

async function sampleAnimationFrames(page: PageLike, durationMs: number): Promise<{ durationMs: number; fps: number; p95: number }> {
  return page.evaluate(`(() => new Promise((resolve) => {
    const durationMs = ${JSON.stringify(durationMs)};
    const started = performance.now();
    const deltas = [];
    let last = started;
    function tick(now) {
      deltas.push(now - last);
      last = now;
      const elapsed = now - started;
      if (elapsed >= durationMs) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] || 0;
        resolve({ durationMs: elapsed, fps: deltas.length / (elapsed / 1000), p95 });
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }))()`) as Promise<{ durationMs: number; fps: number; p95: number }>;
}

function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Timeout/i.test(message)) return "timeout";
  if (/WebGL|webgl/i.test(message)) return "webgl_unavailable";
  if (/Target page|browser has been closed/i.test(message)) return "browser_closed";
  if (/JavaScript heap|out of memory/i.test(message)) return "memory";
  return "exception";
}

function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}

function inferActionName(error: unknown): string {
  const stack = error instanceof Error ? error.stack || error.message : String(error);
  const match = stack.match(/measure[A-Z][A-Za-z0-9_]*/);
  if (!match) return "unknown_action";
  return match[0].replace(/^measure/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function timeoutFor(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 25_000;
  if (metadata.nodes >= 5000) return 18_000;
  return 12_000;
}

function navigationTimeoutFor(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 45_000;
  if (metadata.nodes >= 5000) return 30_000;
  return 20_000;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

interface BrowserLike {
  newPage(options: { viewport: { width: number; height: number } }): Promise<PageLike>;
  close(): Promise<void>;
}

interface PageLike {
  addInitScript(script: string): Promise<void>;
  setDefaultTimeout(timeout: number): void;
  setDefaultNavigationTimeout(timeout: number): void;
  goto(url: string, options?: unknown): Promise<unknown>;
  waitForFunction(fn: Function | string, arg?: unknown, options?: unknown): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
  evaluate<T>(fn: Function | string, arg?: unknown): Promise<T>;
  mouse: {
    move(x: number, y: number, options?: { steps?: number }): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
    wheel(deltaX: number, deltaY: number): Promise<void>;
  };
  close(): Promise<void>;
}

interface PerformanceRecord {
  schema_version: string;
  renderer: string;
  production_path: boolean;
  graph_shape: string;
  nodes: number;
  edges: number;
  communities: number;
  largest_community: number;
  largest_connected_density: number;
  search_hits: number;
  pin_count: number;
  oversized_community: boolean;
  action: string;
  duration_ms: number | null;
  fps: number | null;
  frame_p95_ms: number | null;
  long_task_count: number | null;
  dom_node_count: number | null;
  visible_node_count: number | null;
  visible_edge_count: number | null;
  visible_label_count: number | null;
  visible_card_count: number | null;
  interaction_mode: string | null;
  interaction_updated_objects: number | null;
  interaction_hidden_objects: number | null;
  interaction_preserved_nodes: number | null;
  interaction_max_updates: number | null;
  memory_peak_mb: number | null;
  memory_after_cycles_mb: number | null;
  memory_growth_mb: number | null;
  thresholds: Record<string, number>;
  browser: string;
  build_commit: string;
  run_started_at: string;
  run_finished_at: string;
  warmup_runs?: number;
  median_fps?: number | null;
  worst_run_fps?: number | null;
  worst_run_frame_p95_ms?: number | null;
  pass: boolean;
  failure_class: string | null;
  failure_detail?: string | null;
  artifact_path: string;
  measured_at: string;
}
