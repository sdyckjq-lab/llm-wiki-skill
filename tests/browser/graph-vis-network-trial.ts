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
import { buildVisNetworkTrialModel } from "../../packages/graph-engine/test/vis-network-trial-adapter";
import {
  memoryGrowthFailureClass,
  memoryGrowthFailureDetail,
  parseRequestedShapes,
  validateTrialResults,
  waitForAfterDrawing,
  waitForAnimationFrames
} from "./graph-renderer-trial-shared";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repoRoot = path.resolve(import.meta.dirname, "../..");
const artifactDir = process.env.GRAPH_VIS_TRIAL_ARTIFACT_DIR || path.join(os.tmpdir(), `llm-wiki-graph-vis-trial-${Date.now()}`);
const executablePath = process.env.GRAPH_VIS_TRIAL_CHROME_EXECUTABLE || "";
const requestedShapes = parseRequestedShapes(process.env.GRAPH_VIS_TRIAL_SHAPES);
const resultPath = path.join(artifactDir, "vis-network-trial-results.json");
const visNetworkVersion = "10.1.0";
const visNetworkScript = path.join(repoRoot, "node_modules/vis-network/standalone/umd/vis-network.min.js");
const visNetworkCss = path.join(repoRoot, "node_modules/vis-network/styles/vis-network.min.css");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await fs.mkdir(artifactDir, { recursive: true });
  const runStartedAt = new Date().toISOString();
  const records: PerformanceRecord[] = [];
  const errors: string[] = [];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

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
      const model = buildVisNetworkTrialModel(fixture.data, {
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
        await writeResult(runStartedAt, records, errors);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await writeResult(runStartedAt, records, errors);
  }

  validateTrialResults({
    renderer: "vis-network",
    requestedShapes,
    records,
    errors,
    resultPath,
    requireSchema: false
  });
  console.log(`Wrote ${records.length} vis-network trial records to ${resultPath}`);
}

async function writeResult(runStartedAt: string, records: PerformanceRecord[], errors: string[]): Promise<void> {
  await fs.writeFile(resultPath, `${JSON.stringify({
    run_started_at: runStartedAt,
    run_finished_at: new Date().toISOString(),
    renderer: "vis-network-canvas-trial",
    candidate: {
      vis_network: visNetworkVersion,
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
  <title>vis-network Trial ${escapeHtml(shape)}</title>
  <link rel="stylesheet" href="${pathToFileURL(visNetworkCss).href}" />
  <style>
    html, body, #stage { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: #f8fafc; font-family: system-ui, sans-serif; }
    #stage { position: relative; }
    #drawer { position: absolute; right: 0; top: 0; width: 320px; height: 100%; background: white; border-left: 1px solid #e5e7eb; padding: 16px; box-sizing: border-box; display: none; }
    #drawer[data-open="true"] { display: block; }
  </style>
  <script src="${pathToFileURL(visNetworkScript).href}"></script>
</head>
<body>
  <div id="stage"></div>
  <aside id="drawer"></aside>
  <script>
    const model = ${JSON.stringify(model)};
    const vis = globalThis.vis;
    const communityById = new Map(model.communities.map((community) => [community.id, community]));
    const aggregationById = new Map(model.aggregations.map((aggregation) => [aggregation.id, aggregation]));
    const originalNodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const nodes = new vis.DataSet(model.nodes.map((node) => ({
      id: node.id,
      label: "",
      title: node.label,
      x: node.x,
      y: node.y,
      value: node.size,
      color: node.color,
      communityId: node.communityId,
      searchHit: node.searchHit,
      selected: node.selected,
      pinned: node.pinned,
      aggregationIds: node.aggregationIds,
      fixed: false
    })));
    const edges = new vis.DataSet(model.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      color: { color: edge.color, opacity: 0.48 },
      width: edge.width,
      relationType: edge.relationType
    })));
    const network = new vis.Network(document.getElementById("stage"), { nodes, edges }, {
      autoResize: true,
      physics: false,
      interaction: {
        dragNodes: false,
        hover: false,
        multiselect: false,
        navigationButtons: false,
        tooltipDelay: 200
      },
      nodes: {
        shape: "dot",
        scaling: { min: 1, max: 12 },
        borderWidth: 0
      },
      edges: {
        smooth: false,
        selectionWidth: 1,
        hoverWidth: 0
      }
    });
    let drawCount = 0;
    network.on("afterDrawing", () => {
      drawCount += 1;
    });
    let selectedNodeId = model.nodes.find((node) => node.selected)?.id || null;
    let selectedContainerId = null;
    function cameraState() {
      const scale = network.getScale();
      const position = network.getViewPosition();
      return { x: position.x, y: position.y, scale };
    }
    function refresh() {
      network.redraw();
    }
    function setNodeVisual(id, patch) {
      const original = originalNodeById.get(id);
      if (!original) return;
      const update = { id };
      if ("color" in patch) update.color = patch.color;
      if ("size" in patch) update.value = patch.size;
      if ("searchHit" in patch) update.searchHit = patch.searchHit;
      if ("selected" in patch) update.selected = patch.selected;
      nodes.update(update);
    }
    function searchHighlight(query) {
      const normalized = String(query || "").toLowerCase();
      let hits = 0;
      const updates = [];
      for (const node of model.nodes) {
        const hit = normalized && node.label.toLowerCase().includes(normalized);
        if (hit) hits += 1;
        updates.push({
          id: node.id,
          searchHit: Boolean(hit),
          color: hit ? "#f59e0b" : node.selected ? "#ef4444" : node.color,
          value: hit ? Math.max(node.size, 7) : node.size
        });
      }
      nodes.update(updates);
      refresh();
      return { hits };
    }
    function pointSelect(id) {
      if (!originalNodeById.has(id)) return { selectedNodeId: null };
      if (selectedNodeId && originalNodeById.has(selectedNodeId)) {
        const original = originalNodeById.get(selectedNodeId);
        setNodeVisual(selectedNodeId, { selected: false, color: original.color, size: original.size });
      }
      selectedNodeId = id;
      const current = originalNodeById.get(id);
      setNodeVisual(id, { selected: true, color: "#ef4444", size: Math.max(current?.size || 4, 8) });
      network.selectNodes([id], false);
      refresh();
      return { selectedNodeId: id };
    }
    function containerSelect(id) {
      const aggregation = aggregationById.get(id);
      const community = communityById.get(id);
      const nodeIds = aggregation?.nodeIds || community?.nodeIds || [];
      selectedContainerId = id;
      const updates = [];
      for (const nodeId of nodeIds.slice(0, 250)) {
        const current = originalNodeById.get(nodeId);
        if (current) updates.push({ id: nodeId, color: "#7c3aed", value: Math.max(current.size, 5) });
      }
      nodes.update(updates);
      refresh();
      return { selectedContainerId: id, nodeCount: nodeIds.length };
    }
    function openDrawer() {
      const drawer = document.getElementById("drawer");
      drawer.dataset.open = "true";
      drawer.textContent = selectedContainerId
        ? "container:" + selectedContainerId
        : selectedNodeId
          ? "node:" + selectedNodeId
          : "global";
      return { open: true, text: drawer.textContent };
    }
    function enterCommunity(id) {
      return containerSelect(id);
    }
    function returnGlobal() {
      selectedContainerId = null;
      network.fit({ animation: false });
      refresh();
      return { camera: cameraState() };
    }
    window.__visTrial = {
      ready: false,
      nodes,
      edges,
      network,
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
      drawCount() {
        return drawCount;
      },
      counts() {
        return {
          nodes: nodes.length,
          edges: edges.length,
          communities: model.communities.length,
          aggregations: model.aggregations.length,
          selectedNodeId,
          selectedContainerId,
          camera: cameraState()
        };
      }
    };
    network.once("afterDrawing", () => requestAnimationFrame(() => {
      window.__visTrial.ready = true;
    }));
    network.redraw();
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
  const records: PerformanceRecord[] = [];
  try {
    const renderStarted = performance.now();
    await page.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded", timeout: navigationTimeoutFor(metadata) });
    await page.waitForFunction(() => Boolean((window as any).__visTrial?.ready));
    records.push(await recordFromPage(page, metadata, {
      action: "initial_render",
      duration_ms: performance.now() - renderStarted,
      pass: true,
      artifact_path: resultPath
    }));
    for (const action of [
      () => measureWheelZoom(page, metadata),
      () => measurePan(page, metadata),
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
  const samplePromise = sampleAnimationFrames(page, 1000);
  const started = performance.now();
  while (performance.now() - started < 1000) {
    await page.mouse.move(720, 480);
    await page.mouse.wheel(0, -280);
    await page.waitForTimeout(50);
  }
  const sample = await samplePromise;
  const after = await cameraState(page);
  const changed = JSON.stringify(after) !== JSON.stringify(before);
  return recordFromPage(page, metadata, {
    action: "wheel_zoom",
    duration_ms: sample.durationMs,
    fps: sample.fps,
    frame_p95_ms: sample.p95,
    pass: changed && sample.fps >= 10,
    failure_class: changed ? (sample.fps < 10 ? "fps_below_floor" : null) : "camera_unchanged",
    artifact_path: resultPath
  });
}

async function measurePan(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const before = await cameraState(page);
  const started = performance.now();
  await page.mouse.move(720, 480);
  await page.mouse.down();
  await page.mouse.move(900, 620, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await cameraState(page);
  return recordFromPage(page, metadata, {
    action: "pan",
    duration_ms: performance.now() - started,
    pass: JSON.stringify(after) !== JSON.stringify(before),
    failure_class: JSON.stringify(after) === JSON.stringify(before) ? "camera_unchanged" : null,
    artifact_path: resultPath
  });
}

async function measureSearch(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => (window as any).__visTrial.searchHighlight("needle"));
  await waitForAfterDrawing(page);
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
    const trial = (window as any).__visTrial;
    return trial.pointSelect(trial.firstNodeId);
  });
  await waitForAfterDrawing(page);
  const counts = await page.evaluate(() => (window as any).__visTrial.counts());
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
    const trial = (window as any).__visTrial;
    return trial.containerSelect(trial.firstContainerId);
  });
  await waitForAfterDrawing(page);
  const counts = await page.evaluate(() => (window as any).__visTrial.counts());
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
  const result = await page.evaluate(() => (window as any).__visTrial.openDrawer());
  await waitForAnimationFrames(page);
  const opened = Boolean((result as { open: boolean; text?: string }).open);
  const text = (result as { open: boolean; text?: string }).text || "";
  return recordFromPage(page, metadata, {
    action: "drawer_open",
    duration_ms: performance.now() - started,
    pass: opened && /^(container|node|global)/.test(text),
    failure_class: opened && /^(container|node|global)/.test(text) ? null : "drawer_not_opened",
    failure_detail: opened && /^(container|node|global)/.test(text) ? null : `text=${text || "empty"}`,
    artifact_path: resultPath
  });
}

async function measureEnterCommunity(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => {
    const trial = (window as any).__visTrial;
    return trial.enterCommunity(trial.firstCommunityId);
  });
  await waitForAfterDrawing(page);
  const counts = await page.evaluate(() => (window as any).__visTrial.counts());
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
  await page.evaluate(() => (window as any).__visTrial.returnGlobal());
  await waitForAfterDrawing(page);
  const counts = await page.evaluate(() => (window as any).__visTrial.counts());
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
  const before = await memoryMb(page);
  const started = performance.now();
  for (let index = 0; index < 2; index += 1) {
    await page.evaluate(() => {
      const trial = (window as any).__visTrial;
      trial.searchHighlight("needle");
      trial.pointSelect(trial.firstNodeId);
      trial.containerSelect(trial.firstContainerId);
      trial.openDrawer();
      trial.returnGlobal();
    });
    await waitForAfterDrawing(page);
  }
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
    const trial = (window as any).__visTrial;
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
    phase: "phase-6",
    task: "6.2",
    renderer: "vis-network-canvas-trial",
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
    pass: false,
    failure_class: null,
    failure_detail: null,
    artifact_path: artifactPath,
    measured_at: new Date().toISOString()
  };
}

async function cameraState(page: PageLike): Promise<unknown> {
  return page.evaluate(() => (window as any).__visTrial.cameraState());
}

async function memoryMb(page: PageLike): Promise<number | null> {
  return page.evaluate(() => {
    if (typeof performance === "undefined" || !("memory" in performance)) return null;
    const used = (performance as any).memory?.usedJSHeapSize;
    return typeof used === "number" ? Math.round((used / 1024 / 1024) * 10) / 10 : null;
  });
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
  if (/Canvas|canvas/i.test(message)) return "canvas_unavailable";
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
  phase: string;
  task: string;
  renderer: string;
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
  pass: boolean;
  failure_class: string | null;
  failure_detail?: string | null;
  artifact_path: string;
  measured_at: string;
}
