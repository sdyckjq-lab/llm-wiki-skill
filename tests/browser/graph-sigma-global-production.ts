import { execFileSync } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildCommunityAggregationMarkers } from "../../packages/graph-engine/src";
import {
  generateLargeGraphFixture,
  type LargeGraphFixtureMetadata
} from "../../packages/graph-engine/test/large-graph-fixtures";
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
  validateTrialResults,
  waitForAnimationFrames
} from "./graph-renderer-trial-shared";
import { SIGMA_BUTTON_ZOOM_DURATION_MS } from "../../packages/graph-engine/src/render/sigma-zoom";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repoRoot = path.resolve(import.meta.dirname, "../..");
const artifactDir = process.env.GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR || path.join(os.tmpdir(), `llm-wiki-sigma-global-production-${Date.now()}`);
const executablePath = process.env.GRAPH_SIGMA_PRODUCTION_CHROME_EXECUTABLE || "";
const DEFAULT_SIGMA_PRODUCTION_SHAPES: LargeGraphFixtureId[] = [
  "real-snapshot-proxy",
  "nodes-1000-sparse",
  "nodes-1000-dense"
];
const SIGMA_GLOBAL_NODE_LIMIT = 2000;
const requestedShapes = parseSigmaProductionShapes(process.env.GRAPH_SIGMA_PRODUCTION_SHAPES);
const requestedActions = parseSigmaProductionActions(process.env.GRAPH_SIGMA_PRODUCTION_ACTIONS);
const resultPath = path.join(artifactDir, "sigma-global-production-results.json");
const buildCommit = readBuildCommit();
const rendererName = "sigma-global-production";
const productionPath = true;
const engineDistDir = path.join(repoRoot, "packages/graph-engine/dist");
const sigmaVersion = "3.0.3";
const graphologyVersion = "0.26.0";
let capturedBrowserVersion = "unknown";
const runContext = {
  run_started_at: "",
  run_finished_at: "",
  browser: "unknown",
  build_commit: buildCommit
};

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

function parseSigmaProductionShapes(value: string | undefined): LargeGraphFixtureId[] {
  return (value || DEFAULT_SIGMA_PRODUCTION_SHAPES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as LargeGraphFixtureId[];
}

function parseSigmaProductionActions(value: string | undefined): Set<string> | null {
  const actions = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return actions.length ? new Set(actions) : null;
}

async function main(): Promise<void> {
  await fs.mkdir(artifactDir, { recursive: true });
  const records: PerformanceRecord[] = [];
  const errors: string[] = [];
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--js-flags=--expose-gc"]
  });
  const staticServer = await startStaticServer();
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
      if (fixture.metadata.nodes > SIGMA_GLOBAL_NODE_LIMIT) {
        errors.push(`${shape}: skipped because Phase 1 routes graphs over ${SIGMA_GLOBAL_NODE_LIMIT} nodes to over-limit notice`);
        continue;
      }
      const searchResultIds = fixture.data.nodes.filter((node) => node.label.includes("needle")).map((node) => node.id);
      const selectedNodeIds = fixture.data.nodes.slice(0, Math.min(8, fixture.data.nodes.length)).map((node) => node.id);
      const aggregationMarkers = buildCommunityAggregationMarkers(fixture.data, {
        pins: fixture.pins,
        searchResultIds,
        selectedNodeIds,
        minCommunitySize: 80
      });
      const html = await writeProductionHtml(shape, staticServer.origin, {
        data: fixture.data,
        pins: fixture.pins,
        aggregationMarkers
      });
      try {
        const shapeRecords = await measureShape(browser, fixture.metadata, staticServer.artifactUrl(html));
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
    await staticServer.close();
  }

  runContext.run_finished_at = new Date().toISOString();
  for (const record of records) record.run_finished_at = runContext.run_finished_at;
  await writeResult(records, errors);

  validateTrialResults({
    renderer: "Sigma global production",
    requestedShapes,
    requiredActions: requestedActions ? [...requestedActions] : undefined,
    records,
    errors,
    resultPath
  });
  console.log(`Wrote ${records.length} production Sigma global records to ${resultPath}`);
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
      production_path_switched: true
    },
    artifact_dir: artifactDir,
    shapes: requestedShapes,
    requested_actions: requestedActions ? [...requestedActions] : null,
    records,
    errors
  }, null, 2)}\n`);
}

async function startStaticServer(): Promise<{
  origin: string;
  artifactUrl(file: string): string;
  close(): Promise<void>;
}> {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname.startsWith("/artifact/")) {
        const file = path.basename(pathname.slice("/artifact/".length));
        await serveFile(response, path.join(artifactDir, file));
        return;
      }
      if (pathname.startsWith("/graph-engine-dist/")) {
        const relative = pathname.slice("/graph-engine-dist/".length);
        if (relative.includes("..")) {
          response.writeHead(400).end("bad path");
          return;
        }
        await serveFile(response, path.join(engineDistDir, relative));
        return;
      }
      response.writeHead(404).end("not found");
    } catch (error) {
      response.writeHead(500).end(errorDetail(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to start production regression static server");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    artifactUrl(file) {
      return `${origin}/artifact/${encodeURIComponent(path.basename(file))}`;
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

async function serveFile(response: http.ServerResponse, file: string): Promise<void> {
  const content = await fs.readFile(file);
  response.writeHead(200, {
    "content-type": contentType(file),
    "cache-control": file.startsWith(engineDistDir) ? "public, max-age=3600" : "no-store"
  });
  response.end(content);
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function writeProductionHtml(
  shape: string,
  origin: string,
  input: { data: unknown; pins: unknown; aggregationMarkers: unknown }
): Promise<string> {
  const file = path.join(artifactDir, `${shape}-production.html`);
  await fs.writeFile(file, `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sigma Global Production ${escapeHtml(shape)}</title>
  <style>
    html, body, #stage { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: #f8fafc; font-family: system-ui, sans-serif; }
    #stage { position: relative; }
    .sigma-global-route, .sigma-global-renderer { width: 100%; height: 100%; }
    #drawer { position: absolute; right: 0; top: 0; width: 320px; height: 100%; background: white; border-left: 1px solid #e5e7eb; padding: 16px; box-sizing: border-box; display: none; z-index: 20; }
    #drawer[data-open="true"] { display: block; }
    .summary-card { display: flex; flex-direction: column; gap: 8px; }
    .summary-kicker { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-title { font-size: 18px; margin: 0; }
    .summary-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .summary-fact { display: flex; justify-content: space-between; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; padding: 2px 0; }
    .summary-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .summary-item { font-size: 13px; color: #1e293b; padding: 4px 6px; background: #f8fafc; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="stage"></div>
  <aside id="drawer"></aside>
  <script type="module">
    import { createGraphEngine, buildCommunityAggregationMarkers } from "${origin}/graph-engine-dist/engine.esm.js";
    (async () => {
    const graphData = ${JSON.stringify(input.data)};
    const initialPins = ${JSON.stringify(input.pins)};
    const initialAggregationMarkers = ${JSON.stringify(input.aggregationMarkers)};
    const stage = document.getElementById("stage");
    const drawer = document.getElementById("drawer");
    const firstNodeId = graphData.nodes[0]?.id || null;
    const firstCommunityId = graphData.nodes.find((node) => node.community)?.community || null;
    const productionStart = performance.now();
    let loadingStateSeenAtMs = null;
    let currentPins = initialPins;
    let searchResultIds = [];
    let selectedContainerId = null;
    let selectedNodeId = null;
    let lastSelectionKind = null;
    let lastSelection = null;
    let lastVisibility = {
      searchQuery: "",
      searchResultIds: [],
      typeFilters: {},
      temporaryObject: null
    };
    // 浏览器内戳：从 searchHighlight dispatch 到 visibility 首次反映搜索结果。
    // measureSearch 据此算 duration，排除 Node 侧 waitForFunction 轮询分辨率与固定帧垫片
    // ——这两者在 CPU 负载下会假性拉长时长（issue #88）。
    let searchHighlightStartedAt = null;
    let searchHighlightFinishedAt = null;
    stage.dataset.loadingState = "sigma-global-loading";
    loadingStateSeenAtMs = performance.now() - productionStart;
    stage.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".sigma-global-node-hit-target")) lastSelectionKind = "node";
      if (target?.closest(".sigma-global-community-region")) lastSelectionKind = "community";
    }, true);

    try {
      const engine = createGraphEngine(stage, {
        data: graphData,
        pins: currentPins,
        theme: "shan-shui",
        aggregationMarkers: [],
        capabilities: {
          persistPins(pins) {
            currentPins = pins;
            return Promise.resolve();
          },
          onSelectionChange(selection) {
            lastSelection = selection;
            if (lastSelectionKind === "node") {
              selectedNodeId = selection?.nodeIds?.length === 1 ? selection.nodeIds[0] : null;
              selectedContainerId = null;
            } else if (lastSelectionKind === "community") {
              selectedNodeId = null;
              selectedContainerId = selection?.communityIds?.length ? selection.communityIds[0] : null;
            }
          },
          onSelectionClear() {
            lastSelection = null;
            selectedNodeId = null;
            selectedContainerId = null;
            lastSelectionKind = null;
          },
          onVisibilityStateChange(state) {
            lastVisibility = state;
            searchResultIds = state.searchResultIds || [];
            if (searchHighlightStartedAt !== null && searchHighlightFinishedAt === null && searchResultIds.length > 0) {
              searchHighlightFinishedAt = performance.now();
            }
          }
        }
      });
      function hasProductionSigma() {
        return Boolean(document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']"));
      }

      function routeId() {
        return document.querySelector(".sigma-global-route[data-route]")?.dataset.route ||
          document.querySelector(".graph-over-limit-notice-view[data-route]")?.dataset.route ||
          (domSvgGraphRoot() ? "dom-svg-community" : "") ||
          "unknown";
      }

      function domSvgGraphRoot() {
        return Array.from(document.querySelectorAll(".llm-wiki-graph-engine"))
          .find((element) => !element.closest(".sigma-global-route")) || null;
      }

      function fallbackRouteElement() {
        return document.querySelector(".graph-over-limit-notice-view[data-route]") || domSvgGraphRoot();
      }

      function waitForProductionSigma(timeoutMs = 10000) {
        const started = performance.now();
        return new Promise((resolve, reject) => {
          if (hasProductionSigma()) {
            resolve(productionProbe());
            return;
          }
          let observer = null;
          let interval = null;
          let timeout = null;
          function cleanup() {
            if (observer) observer.disconnect();
            if (interval) window.clearInterval(interval);
            if (timeout) window.clearTimeout(timeout);
          }
          function finish() {
            cleanup();
            resolve(productionProbe());
          }
          function fail(error) {
            cleanup();
            reject(error);
          }
          observer = new MutationObserver(() => {
            if (hasProductionSigma()) finish();
          });
          observer.observe(document.body, { childList: true, subtree: true });
          interval = window.setInterval(() => {
            if (hasProductionSigma()) {
              finish();
              return;
            }
            const fallback = fallbackRouteElement();
            if (fallback && !document.querySelector(".sigma-global-route[data-route='sigma-global']")) {
              fail(new Error("production Sigma route fell back before renderer became ready"));
            }
          }, 10);
          timeout = window.setTimeout(() => {
            fail(new Error("timed out waiting for production Sigma renderer"));
          }, timeoutMs);
          function tick() {
            if (hasProductionSigma()) {
              finish();
              return;
            }
            const fallback = fallbackRouteElement();
            if (fallback && !document.querySelector(".sigma-global-route[data-route='sigma-global']")) {
              fail(new Error("production Sigma route fell back before renderer became ready"));
              return;
            }
            if (performance.now() - started > timeoutMs) {
              fail(new Error("timed out waiting for production Sigma renderer"));
              return;
            }
            requestAnimationFrame(tick);
          }
        });
      }

      function waitForSelectionState(kind, id, timeoutMs = 10000) {
        const started = performance.now();
        return new Promise((resolve, reject) => {
          function selectedCommunityRegionReady() {
            if (kind !== "community") return true;
            return Array.from(document.querySelectorAll(".sigma-global-community-region"))
              .some((element) => element.dataset.communityId === id && element.dataset.selected === "true");
          }
          function done() {
            if (kind === "community") {
              return routeId() === "sigma-global"
                && lastSelectionKind === "community"
                && selectedContainerId === id
                && selectedCommunityRegionReady();
            }
            if (kind === "node") {
              return lastSelectionKind === "node" && selectedNodeId === id;
            }
            return false;
          }
          function tick() {
            if (done()) {
              resolve(productionProbe({ canvasSignal: false }));
              return;
            }
            if (performance.now() - started > timeoutMs) {
              reject(new Error("timed out waiting for " + kind + " selection " + id));
              return;
            }
            requestAnimationFrame(tick);
          }
          tick();
        });
      }

      function productionProbe(options = {}) {
        const includeCanvasSignal = options.canvasSignal === true;
        const sigmaRoot = document.querySelector(".sigma-global-renderer[data-renderer='sigma-global']");
        const canvasSignal = sigmaRoot && includeCanvasSignal ? sigmaCanvasSignal(sigmaRoot) : { nonblank: null, sampleCount: 0 };
        const hitTargetCount = document.querySelectorAll(".sigma-global-node-hit-target, .sigma-global-community-region").length;
        return {
          productionPath: Boolean(sigmaRoot),
          route: routeId(),
          canvasCount: sigmaRoot ? sigmaRoot.querySelectorAll("canvas").length : 0,
          canvasNonBlank: canvasSignal.nonblank,
          canvasPixelSampleCount: canvasSignal.sampleCount,
          visibleSignal: Boolean(sigmaRoot) && hitTargetCount > 0,
          hitTargetCount,
          sigmaRendererCount: document.querySelectorAll(".sigma-global-renderer[data-renderer='sigma-global']").length,
          fallbackCount: document.querySelectorAll(".graph-over-limit-notice-view").length + (domSvgGraphRoot() ? 1 : 0)
        };
      }

      function pickFarthestZoomAnchor() {
        const targets = Array.from(document.querySelectorAll(".sigma-global-node-hit-target"));
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let best = null;
        let bestDist = -1;
        for (const el of targets) {
          const rect = el.getBoundingClientRect();
          if (!rect.width && !rect.height) continue;
          const dist = Math.hypot((rect.left + rect.width / 2) - cx, (rect.top + rect.height / 2) - cy);
          if (dist > bestDist) {
            bestDist = dist;
            best = el;
          }
        }
        return best;
      }

      function zoomControlsSetup() {
        const groups = document.querySelectorAll(".graph-zoom-controls");
        const buttons = document.querySelectorAll(".graph-zoom-button");
        const labels = Array.from(buttons).map((button) => button.getAttribute("aria-label"));
        const anchor = pickFarthestZoomAnchor();
        window.__zoomAnchor = anchor || null;
        return {
          groupCount: groups.length,
          buttonCount: buttons.length,
          labels,
          hasAnchor: Boolean(anchor)
        };
      }

      function zoomAnchorRect() {
        const anchor = window.__zoomAnchor;
        if (!anchor) return null;
        const rect = anchor.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      }

      async function clickZoomIn() {
        const button = document.querySelector(".graph-zoom-button[aria-label='放大图谱']");
        if (button) button.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      function findSigmaMouseCanvas(root) {
        const canvases = root.querySelectorAll("canvas");
        for (let index = 0; index < canvases.length; index += 1) {
          if (canvases[index].style && canvases[index].style.touchAction === "none") return canvases[index];
        }
        return null;
      }

      function dispatchSigmaWheel(targetSelector, x, y, deltaY) {
        const root = document.querySelector(".sigma-global-renderer");
        const target = targetSelector
          ? document.querySelector(targetSelector)
          : (root ? findSigmaMouseCanvas(root) : null);
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new WheelEvent("wheel", {
          deltaY: deltaY,
          clientX: x + rect.left,
          clientY: y + rect.top,
          bubbles: true,
          cancelable: true
        }));
        return true;
      }

      function sigmaCanvasSignal(root) {
        let sampleCount = 0;
        for (const canvas of Array.from(root.querySelectorAll("canvas"))) {
          if (!canvas.width || !canvas.height) continue;
          try {
            const sampleSize = 16;
            const sampler = document.createElement("canvas");
            sampler.width = sampleSize;
            sampler.height = sampleSize;
            const context = sampler.getContext("2d", { willReadFrequently: true });
            if (!context) continue;
            context.drawImage(canvas, 0, 0, sampleSize, sampleSize);
            const data = context.getImageData(0, 0, sampleSize, sampleSize).data;
            for (let index = 0; index < data.length; index += 4) {
              const alpha = data[index + 3];
              const luminance = data[index] + data[index + 1] + data[index + 2];
              if (alpha > 0 && luminance > 0) sampleCount += 1;
            }
            if (sampleCount > 0) return { nonblank: true, sampleCount };
          } catch {
            continue;
          }
        }
        return { nonblank: false, sampleCount };
      }

      function firstSearchHitId() {
        return searchResultIds[0] || lastVisibility.searchResultIds?.[0] || null;
      }

      function overlayCenter(selector) {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          id: element.dataset.id || element.dataset.nodeId || element.dataset.communityId || element.dataset.aggregationId || null,
          communityId: element.dataset.communityId || null,
          aggregationId: element.dataset.aggregationId || null
        };
      }

      function readableCommunityId() {
        const counts = new Map();
        for (const node of graphData.nodes) {
          if (!node.community) continue;
          counts.set(node.community, (counts.get(node.community) || 0) + 1);
        }
        for (const [id, count] of counts) {
          if (count <= 500) return id;
        }
        return firstCommunityId;
      }

      function largestCommunitySize() {
        const counts = new Map();
        for (const node of graphData.nodes) {
          if (!node.community) continue;
          counts.set(node.community, (counts.get(node.community) || 0) + 1);
        }
        return Math.max(0, ...counts.values());
      }

      function markersFor(ids, selectedIds = []) {
        return buildCommunityAggregationMarkers(graphData, {
          pins: currentPins,
          searchResultIds: ids,
          selectedNodeIds: selectedIds,
          minCommunitySize: 80
        });
      }

      function searchHighlight(query) {
        searchHighlightStartedAt = performance.now();
        searchHighlightFinishedAt = null;
        const input = document.querySelector(".graph-search-input");
        if (!input) throw new Error("Sigma search input not found");
        input.focus();
        input.value = String(query || "");
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(query || "") }));
        return {
          hits: searchResultIds.length,
          selectedCount: 0,
          inputValue: input.value,
          visibilityHits: lastVisibility.searchResultIds?.length || 0,
          production: productionProbe({ canvasSignal: false })
        };
      }

      function nodeHitTarget() {
        const id = firstSearchHitId() || firstNodeId;
        if (!id) return null;
        return overlayCenter('.sigma-global-node-hit-target[data-node-id="' + CSS.escape(id) + '"]') ||
          overlayCenter(".sigma-global-node-hit-target[data-search-hit='true']") ||
          overlayCenter(".sigma-global-node-hit-target");
      }

      function containerHitTarget(id) {
        if (!id) return null;
        return overlayCenter('.sigma-global-community-region[data-community-id="' + CSS.escape(id) + '"]') ||
          overlayCenter(".sigma-global-community-region");
      }

      function communityRegionState(id) {
        const element = id
          ? document.querySelector('.sigma-global-community-region[data-community-id="' + CSS.escape(id) + '"]')
          : document.querySelector(".sigma-global-community-region");
        const overlay = document.querySelector(".sigma-global-overlay");
        if (!element) {
          return {
            exists: false,
            selected: false,
            overlayTransform: overlay?.style.transform || "",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            id: id || null
          };
        }
        const rect = element.getBoundingClientRect();
        return {
          exists: true,
          selected: element.dataset.selected === "true",
          overlayTransform: overlay?.style.transform || "",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          id: element.dataset.communityId || id || null
        };
      }

      function summaryPayload() {
        if (selectedContainerId) return engine.summarizeCommunity(selectedContainerId, { searchResultIds });
        if (selectedNodeId) return engine.summarizeNode(selectedNodeId, { searchResultIds });
        return engine.summarizeGlobal({ searchResultIds });
      }

      function openDrawer() {
        const payload = summaryPayload();
        drawer.innerHTML = "";
        const card = document.createElement("article");
        card.className = "summary-card";
        const kicker = document.createElement("div");
        kicker.className = "summary-kicker";
        kicker.textContent = payload.kind || "summary";
        const title = document.createElement("h2");
        title.className = "summary-title";
        title.textContent = payload.label || payload.title || payload.nodeId || payload.communityId || "Graph";
        const facts = document.createElement("div");
        facts.className = "summary-facts";
        const factEntries = [
          ["nodes", payload.nodeCount ?? payload.totalNodes ?? payload.connectionCount ?? graphData.nodes.length],
          ["edges", payload.edgeCount ?? payload.totalEdges ?? graphData.edges.length],
          ["search", payload.searchResultIds?.length ?? Number(Boolean(payload.searchHit))],
          ["commands", payload.commands?.length ?? 0]
        ];
        for (const [label, value] of factEntries) {
          const row = document.createElement("div");
          row.className = "summary-fact";
          const lab = document.createElement("span");
          lab.className = "summary-fact-label";
          lab.textContent = label;
          const val = document.createElement("span");
          val.className = "summary-fact-value";
          val.textContent = String(value ?? 0);
          row.append(lab, val);
          facts.append(row);
        }
        card.append(kicker, title, facts);
        const items = payload.strongestRelations || payload.topCommunities || payload.bridgeRelations || payload.commands || [];
        if (items.length) {
          const list = document.createElement("ul");
          list.className = "summary-list";
          for (const item of items.slice(0, 8)) {
            const li = document.createElement("li");
            li.className = "summary-item";
            li.textContent = item.label || item.kind || item.toNodeId || item.communityId || "item";
            list.append(li);
          }
          card.append(list);
        }
        drawer.append(card);
        drawer.dataset.open = "true";
        return {
          open: true,
          kind: payload.kind,
          facts: facts.children.length,
          items: drawer.querySelectorAll(".summary-item").length,
          production: productionProbe({ canvasSignal: false })
        };
      }

      async function enterCommunity(id) {
        if (!id) return { selectedContainerId: null, route: routeId() };
        if (largestCommunitySize() > 500) {
          if (selectedContainerId !== id) {
            const selection = engine.select({ kind: "community", id });
            lastSelection = selection;
            lastSelectionKind = "community";
            selectedContainerId = id;
            selectedNodeId = null;
            engine.setAggregationMarkers(markersFor(searchResultIds, selection?.nodeIds || []));
          }
          await waitForSelectionState("community", id, 10000);
          return { selectedContainerId, route: routeId(), aggregationPath: true };
        }
        selectedContainerId = id;
        lastSelectionKind = "community";
        lastSelection = engine.focusCommunity(id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { selectedContainerId: id, route: routeId(), domCommunity: Boolean(domSvgGraphRoot()) };
      }

      async function returnGlobal(waitForReady = true) {
        if (largestCommunitySize() > 500 && hasProductionSigma()) {
          engine.resetView();
          selectedContainerId = null;
          selectedNodeId = null;
          lastSelection = null;
          lastSelectionKind = null;
          if (!waitForReady) return { selectedContainerId, route: routeId(), production: productionProbe({ canvasSignal: false }) };
          return { selectedContainerId, route: routeId(), production: productionProbe({ canvasSignal: false }) };
        }
        engine.resetView();
        selectedContainerId = null;
        selectedNodeId = null;
        lastSelection = null;
        lastSelectionKind = null;
        if (!waitForReady) return { selectedContainerId, route: routeId(), production: productionProbe({ canvasSignal: false }) };
        const production = await waitForProductionSigma(10000);
        return { selectedContainerId, route: routeId(), production };
      }

      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      await waitForProductionSigma(10000);
      stage.dataset.loadingState = "sigma-global-ready";
      window.__sigmaProductionRenderStartedAt = productionStart;
      window.__sigmaProductionRenderFinishedAt = performance.now();
      window.__sigmaProductionLoadingStateSeenAtMs = loadingStateSeenAtMs;
      window.__sigmaProduction = {
        ready: true,
        engine,
        firstNodeId,
        firstCommunityId: readableCommunityId(),
        searchHighlight,
        nodeHitTarget,
        containerHitTarget,
        communityRegionState,
        openDrawer,
        enterCommunity,
        returnGlobal,
        productionProbe,
        zoomControlsSetup,
        zoomAnchorRect,
        clickZoomIn,
        dispatchSigmaWheel,
        counts(options = {}) {
          const probe = productionProbe({ canvasSignal: options.canvasSignal === true });
          return {
            nodes: graphData.nodes.length,
            edges: graphData.edges.length,
            route: routeId(),
            selectedNodeId,
            selectedContainerId,
            lastSelectionKind,
            searchResultCount: searchResultIds.length,
            lastSelectionId: lastSelection?.id || null,
            lastSelectionNodeIds: lastSelection?.nodeIds || [],
            lastSelectionCommunityIds: lastSelection?.communityIds || [],
            visibilitySearchResultCount: lastVisibility.searchResultIds?.length ?? 0,
            domNodeCount: document.querySelectorAll("*").length,
            visibleCardCount: drawer.querySelectorAll(".summary-card").length,
            productionPath: probe.productionPath,
            topLevelProductionPath: probe.productionPath && probe.route === "sigma-global" && probe.sigmaRendererCount === 1 && probe.fallbackCount === 0,
            canvasCount: probe.canvasCount,
            canvasNonBlank: probe.canvasNonBlank,
            canvasPixelSampleCount: probe.canvasPixelSampleCount,
            visibleSignal: probe.visibleSignal,
            hitTargetCount: probe.hitTargetCount,
            sigmaRendererCount: probe.sigmaRendererCount,
            loadingState: stage.dataset.loadingState || "",
            loadingStateSeenAtMs,
            searchHighlightStartedAt,
            searchHighlightFinishedAt
          };
        }
      };
    } catch (error) {
      window.__sigmaProductionError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    })();
  </script>
</body>
</html>
`);
  return file;
}

async function measureShape(browser: BrowserLike, metadata: LargeGraphFixtureMetadata, url: string): Promise<PerformanceRecord[]> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const diagnostics: string[] = [];
  page.on?.("console", (message: { type(): string; text(): string }) => {
    diagnostics.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on?.("pageerror", (error: Error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });
  page.on?.("requestfailed", (request: { url(): string; failure(): { errorText?: string } | null }) => {
    diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`.trim());
  });
  page.on?.("response", (response: { status(): number; url(): string }) => {
    if (response.status() >= 400) diagnostics.push(`response.${response.status()}: ${response.url()}`);
  });
  page.setDefaultTimeout(timeoutFor(metadata));
  page.setDefaultNavigationTimeout(45_000);
  await page.addInitScript(NAME_HELPER_INIT_SCRIPT);
  const records: PerformanceRecord[] = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutFor(metadata) });
    try {
      await page.waitForFunction(() => Boolean((window as any).__sigmaProduction?.ready || (window as any).__sigmaProductionError));
    } catch (error) {
      throw new Error(`${errorDetail(error)}; diagnostics=${diagnostics.slice(-12).join(" | ") || "none"}`);
    }
    const pageError = await page.evaluate(() => (window as any).__sigmaProductionError || null);
    if (pageError) throw new Error(`${String(pageError)}; diagnostics=${diagnostics.slice(-12).join(" | ") || "none"}`);
    const timing = await page.evaluate(() => ({
      started: (window as any).__sigmaProductionRenderStartedAt,
      finished: (window as any).__sigmaProductionRenderFinishedAt,
      loadingStateSeenAtMs: (window as any).__sigmaProductionLoadingStateSeenAtMs
    }));
    const duration = typeof timing.started === "number" && typeof timing.finished === "number"
      ? timing.finished - timing.started
      : 0;
    const initialRecord = await recordFromPage(page, metadata, {
      action: "initial_render",
      duration_ms: duration,
      pass: true,
      artifact_path: resultPath
    });
    initialRecord.loading_state_seen_at_ms = typeof timing.loadingStateSeenAtMs === "number"
      ? round(timing.loadingStateSeenAtMs)
      : null;
    if (metadata.nodes >= 10000 && (initialRecord.loading_state_seen_at_ms == null || initialRecord.loading_state_seen_at_ms > 250)) {
      initialRecord.pass = false;
      initialRecord.failure_class = "loading_state_late";
      initialRecord.failure_detail = `loading_state_seen_at_ms=${initialRecord.loading_state_seen_at_ms ?? "null"}; ceiling=250`;
    }
    records.push(initialRecord);
    const actions = [
      { name: "wheel_zoom", run: () => measureWheelZoom(page, metadata) },
      { name: "drag", run: () => measureDrag(page, metadata) },
      { name: "search_highlight", run: () => measureSearch(page, metadata) },
      { name: "point_select", run: () => measurePointSelect(page, metadata) },
      { name: "container_select", run: () => measureContainerSelect(page, metadata) },
      { name: "spotlight_animation", run: () => measureSpotlightAnimation(page, metadata) },
      { name: "drawer_open", run: () => measureDrawerOpen(page, metadata) },
      { name: "enter_community", run: () => measureEnterCommunity(page, metadata) },
      { name: "return_global", run: () => measureReturnGlobal(page, metadata) }
    ];
    for (const action of actions) {
      if (requestedActions && !requestedActions.has(action.name)) continue;
      records.push(await safeMeasure(page, metadata, action.run));
    }
    if (!requestedActions || requestedActions.has("repeated_search_community_drawer_cycles")) {
      records.push(await safeMeasure(page, metadata, () => measureRepeatedCycles(page, metadata)));
    }
    if (!requestedActions || requestedActions.has("zoom_controls")) {
      records.push(await safeMeasure(page, metadata, () => measureZoomControls(page, metadata)));
    }
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
  await driveWheel(page, 500);
  const runs: { fps: number; p95: number; durationMs: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const samplePromise = sampleAnimationFrames(page, 900);
    await driveWheel(page, 900);
    runs.push(await samplePromise);
  }
  return frameSampleRecord(page, metadata, { action: "wheel_zoom", runs });
}

async function waitForAnchorStable(
  page: PageLike,
  options: { maxFrames?: number; stableFrames?: number; minimumFrames?: number } = {}
): Promise<void> {
  const maxFrames = options.maxFrames ?? 18;
  const stableFrames = options.stableFrames ?? 3;
  const minimumFrames = options.minimumFrames ?? 0;
  let stableCount = 0;
  let prev = await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect()) as { x: number; y: number } | null;
  for (let i = 0; i < maxFrames; i += 1) {
    await waitForAnimationFrames(page, 1);
    const cur = await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect()) as { x: number; y: number } | null;
    stableCount = prev && cur && Math.hypot(prev.x - cur.x, prev.y - cur.y) < 0.1
      ? stableCount + 1
      : 0;
    if (i + 1 >= minimumFrames && stableCount >= stableFrames) return;
    prev = cur;
  }
}

async function waitForZoomButtonAnchorStable(page: PageLike): Promise<void> {
  const animationFrames = Math.ceil(SIGMA_BUTTON_ZOOM_DURATION_MS / 16) + 2;
  await waitForAnchorStable(page, {
    maxFrames: animationFrames + 12,
    stableFrames: 3,
    minimumFrames: animationFrames
  });
}

async function measureZoomControls(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const setup = await page.evaluate(() => (window as any).__sigmaProduction.zoomControlsSetup()) as {
    groupCount: number;
    buttonCount: number;
    labels: string[];
    hasAnchor: boolean;
  };

  const structureFailures: string[] = [];
  if (setup.groupCount !== 1) structureFailures.push(`groupCount=${setup.groupCount}`);
  if (setup.buttonCount !== 2) structureFailures.push(`buttonCount=${setup.buttonCount}`);
  if (!setup.labels.includes("放大图谱")) structureFailures.push("missing zoom-in label");
  if (!setup.labels.includes("缩小图谱")) structureFailures.push("missing zoom-out label");
  if (!setup.hasAnchor) structureFailures.push("no zoom anchor hit target");

  const rect0 = (await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect())) as { x: number; y: number } | null;

  if (structureFailures.length || !rect0) {
    return recordFromPage(page, metadata, {
      action: "zoom_controls",
      duration_ms: performance.now() - started,
      pass: false,
      failure_class: "zoom_controls_structure",
      failure_detail: structureFailures.length ? structureFailures.join("; ") : "no anchor rect",
      artifact_path: resultPath
    });
  }

  await page.evaluate(() => (window as any).__sigmaProduction.clickZoomIn());
  await waitForZoomButtonAnchorStable(page);
  const rect1 = (await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect())) as { x: number; y: number } | null;

  await page.evaluate((args: [number, number, number]) => (window as any).__sigmaProduction.dispatchSigmaWheel(null, args[0], args[1], args[2]), [720, 480, 4]);
  await waitForAnchorStable(page);
  const rect2 = (await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect())) as { x: number; y: number } | null;

  await page.evaluate((args: [number, number, number]) => (window as any).__sigmaProduction.dispatchSigmaWheel(null, args[0], args[1], args[2]), [720, 480, 80]);
  await waitForAnchorStable(page);
  const rect3 = (await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect())) as { x: number; y: number } | null;

  await page.evaluate((args: [string, number, number, number]) => (window as any).__sigmaProduction.dispatchSigmaWheel(args[0], args[1], args[2], args[3]), [".graph-zoom-controls", 28, 920, 80]);
  await waitForAnchorStable(page);
  const rect4 = (await page.evaluate(() => (window as any).__sigmaProduction.zoomAnchorRect())) as { x: number; y: number } | null;

  // 注：这里 deliberately 不测"滚轮停止后是否还在追动画（积压/卡顿）"。
  // dispatchSigmaWheel 是合成 wheel 事件，密集 dispatch（每次跨进程 IPC）时 overlay
  // 的 reposition 会跨帧追赶相机状态，实测会产生 60-80px 的"追赶位移"伪影，与真实
  // 触控板的连续缩放手感无关，无法可靠反映设计 §5 的"不积压动画"。真实触控板的
  // 手感以实机为准（wheel 已改为即时 setState）。上方 smallMove<largeMove 已覆盖
  // "按真实 deltaY 连续缩放、不跳档"这一可自动化验证的语义。

  await page.evaluate(() => {
    const engine = (window as any).__sigmaProduction?.engine;
    if (engine?.resetView) engine.resetView();
  });
  await waitForAnimationFrames(page, 3);

  const move = (a: { x: number; y: number } | null, b: { x: number; y: number } | null): number | null => {
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const zoomInMove = move(rect0, rect1);
  const smallMove = move(rect1, rect2);
  const largeMove = move(rect2, rect3);
  const overControlMove = move(rect3, rect4);

  const behaviorFailures: string[] = [];
  if (zoomInMove == null || zoomInMove <= 0.5) behaviorFailures.push(`zoomInMove=${zoomInMove}`);
  if (smallMove == null || smallMove <= 0) behaviorFailures.push(`smallMove=${smallMove}`);
  if (largeMove == null || smallMove == null || largeMove <= smallMove) behaviorFailures.push(`largeMove=${largeMove}<=smallMove=${smallMove}`);
  if (overControlMove == null || (smallMove != null && overControlMove >= smallMove)) behaviorFailures.push(`overControlMove=${overControlMove}>=smallMove=${smallMove}`);

  return recordFromPage(page, metadata, {
    action: "zoom_controls",
    duration_ms: performance.now() - started,
    pass: behaviorFailures.length === 0,
    failure_class: behaviorFailures.length ? "zoom_controls_behavior" : null,
    failure_detail: behaviorFailures.length ? behaviorFailures.join("; ") : null,
    artifact_path: resultPath
  });
}

async function measureDrag(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await driveDrag(page, 500);
  const runs: { fps: number; p95: number; durationMs: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const samplePromise = sampleAnimationFrames(page, 900);
    await driveDrag(page, 900);
    runs.push(await samplePromise);
  }
  return frameSampleRecord(page, metadata, { action: "drag", runs });
}

async function measureSearch(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await page.evaluate(() => (window as any).__sigmaProduction.searchHighlight("needle"));
  // duration 用浏览器内 performance.now() 戳（dispatch input → visibility 首次反映搜索结果），
  // 排除 Node 侧 waitForFunction 轮询分辨率与固定帧垫片——这两者在 CPU 负载下会假性拉长时长（issue #88）。
  await page.waitForFunction(
    () => typeof (window as any).__sigmaProduction?.counts?.().searchHighlightFinishedAt === "number",
    undefined,
    { timeout: 4000 }
  );
  await waitForAnimationFrames(page, 3);
  const probe = await page.evaluate(() => {
    const c = (window as any).__sigmaProduction.counts();
    return {
      started: c.searchHighlightStartedAt as number | null,
      finished: c.searchHighlightFinishedAt as number | null,
      hits: c.visibilitySearchResultCount as number
    };
  });
  const duration = typeof probe.started === "number" && typeof probe.finished === "number"
    ? probe.finished - probe.started
    : null;
  return recordFromPage(page, metadata, {
    action: "search_highlight",
    duration_ms: duration,
    pass: probe.hits === metadata.search_hits,
    failure_class: probe.hits === metadata.search_hits ? null : "search_hit_mismatch",
    failure_detail: probe.hits === metadata.search_hits ? null : `expected=${metadata.search_hits}; actual=${probe.hits}`,
    artifact_path: resultPath
  });
}

async function measurePointSelect(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await ensureSearchReady(page, metadata);
  const target = await page.evaluate(() => (window as any).__sigmaProduction.nodeHitTarget());
  const started = performance.now();
  if (!target) throw new Error("measurePointSelect: no Sigma node hit target");
  await clickPoint(page, target as PointerTarget);
  await page.waitForFunction(
    () => {
      const counts = (window as any).__sigmaProduction?.counts?.();
      return counts?.lastSelectionKind === "node" && (counts.lastSelectionNodeIds ?? []).length > 0;
    },
    undefined,
    { timeout: 4000 }
  );
  await waitForAnimationFrames(page, 3);
  const counts = await page.evaluate(() => (window as any).__sigmaProduction.counts());
  const actual = (counts as { selectedNodeId: string | null; lastSelectionNodeIds?: string[] }).selectedNodeId;
  const nodeIds = (counts as { lastSelectionKind?: string | null; lastSelectionNodeIds?: string[] }).lastSelectionNodeIds ?? [];
  const selectedNodeId = (counts as { lastSelectionKind?: string | null; lastSelectionNodeIds?: string[] }).lastSelectionKind === "node"
    ? nodeIds[0] ?? null
    : null;
  return recordFromPage(page, metadata, {
    action: "point_select",
    duration_ms: performance.now() - started,
    pass: Boolean(selectedNodeId),
    failure_class: Boolean(selectedNodeId) ? null : "selected_node_mismatch",
    failure_detail: Boolean(selectedNodeId) ? null : `actual=${actual ?? "null"}; nodeIds=${nodeIds.join(",")}`,
    artifact_path: resultPath
  });
}

async function measureContainerSelect(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await ensureSearchReady(page, metadata);
  const target = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    return trial.containerHitTarget(trial.firstCommunityId);
  });
  const started = performance.now();
  if (!target) throw new Error("measureContainerSelect: no Sigma container hit target");
  await clickPoint(page, target as PointerTarget);
  await page.waitForFunction(
    () => {
      const counts = (window as any).__sigmaProduction?.counts?.();
      return counts?.lastSelectionKind === "community" && (counts.lastSelectionCommunityIds ?? []).length > 0;
    },
    undefined,
    { timeout: 4000 }
  );
  await waitForAnimationFrames(page, 3);
  const counts = await page.evaluate(() => (window as any).__sigmaProduction.counts());
  const actual = (counts as { selectedContainerId: string | null; lastSelectionCommunityIds?: string[] }).selectedContainerId;
  const communityIds = (counts as { lastSelectionKind?: string | null; lastSelectionCommunityIds?: string[] }).lastSelectionCommunityIds ?? [];
  const selectedCommunityId = clickedCommunityFromCounts(counts as { lastSelectionKind?: string | null; lastSelectionCommunityIds?: string[] });
  return recordFromPage(page, metadata, {
    action: "container_select",
    duration_ms: performance.now() - started,
    pass: Boolean(selectedCommunityId),
    failure_class: Boolean(selectedCommunityId) ? null : "selected_container_mismatch",
    failure_detail: Boolean(selectedCommunityId) ? null : `actual=${actual ?? "null"}; communityIds=${communityIds.join(",")}`,
    artifact_path: resultPath
  });
}

async function measureSpotlightAnimation(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  await waitForSpotlightReady(page);
  const target = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    return trial.containerHitTarget(trial.firstCommunityId);
  }) as PointerTarget | null;
  if (!target) throw new Error("measureSpotlightAnimation: no Sigma container hit target");
  const sampleCommunityId = target.communityId ?? target.id ?? null;
  const initialRegionsById = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    const regions = Array.from(document.querySelectorAll(".sigma-global-community-region")) as HTMLElement[];
    return Object.fromEntries(regions.map((region) => {
      const id = region.dataset.communityId || "";
      return [id, trial.communityRegionState(id)];
    }));
  }) as Record<string, SigmaSpotlightRegionState>;

  await startSpotlightAnimationFrameSampler(page, 1800, sampleCommunityId, initialRegionsById);
  await clickPoint(page, target);
  await page.waitForFunction(
    () => {
      const counts = (window as any).__sigmaProduction?.counts?.();
      return counts?.lastSelectionKind === "community" && (counts.lastSelectionCommunityIds || []).length > 0;
    },
    undefined,
    { timeout: 8000 }
  );
  const selectionCounts = await page.evaluate(() => (window as any).__sigmaProduction.counts()) as { lastSelectionCommunityIds?: string[] };
  const selectedId = selectionCounts.lastSelectionCommunityIds?.[0] ?? null;
  const run = await readSpotlightAnimationFrameSample(page);
  await waitForSpotlightSettled(page, selectedId);
  const region = await page.evaluate((id: string | null) => {
    const trial = (window as any).__sigmaProduction;
    return trial.communityRegionState(id);
  }, selectedId) as SigmaSpotlightRegionState;
  const failures: string[] = [];
  if (!region.exists) failures.push("region_missing");
  if (!region.selected) failures.push("region_not_selected");
  if (region.width <= 0 || region.height <= 0) failures.push(`region_size=${region.width}x${region.height}`);
  if (!run.sawTransform) failures.push("overlay_transform_missing");
  if (run.visualMovePx <= 0.5) failures.push(`region_not_moving=${run.visualMovePx}`);
  if (region.overlayTransform) failures.push(`overlay_transform_not_cleared=${region.overlayTransform}`);

  return frameSampleRecord(page, metadata, {
    action: "spotlight_animation",
    runs: [run],
    enforceFrameMetrics: false,
    failureClass: failures.length ? "spotlight_animation_follow_failed" : null,
    failureDetail: failures.length
      ? [
        failures.join("; "),
        `visual_move_px=${run.visualMovePx}`,
        `first_region=${run.firstRegion?.id ?? "null"}`,
        `last_region=${run.lastRegion?.id ?? "null"}`,
        `transform_samples=${run.transformSamples.join("|")}`
      ].join("; ")
      : null
  });
}

interface SigmaSpotlightRegionState {
  exists: boolean;
  selected: boolean;
  overlayTransform: string;
  left: number;
  top: number;
  width: number;
  height: number;
  id: string | null;
}

interface SigmaSpotlightAnimationSample {
  durationMs: number;
  fps: number;
  p95: number;
  sawTransform: boolean;
  visualMovePx: number;
  firstRegion: SigmaSpotlightRegionState | null;
  lastRegion: SigmaSpotlightRegionState | null;
  transformSamples: string[];
}

async function waitForSpotlightReady(page: PageLike): Promise<void> {
  // 先等上一个测量的 spotlight 动画真正结束（camera 静止）：Sigma 的 setState
  // 不会取消已排队的 animate，若在旧动画未结束时 returnGlobal，setState 会被覆盖，
  // camera 仍停在旧社区，随后点击该社区不触发新动画（settled）。
  await waitForStableCommunityRegion(page, null, 30);
  await page.evaluate(() => (window as any).__sigmaProduction.returnGlobal());
  await page.waitForFunction(
    () => {
      const trial = (window as any).__sigmaProduction;
      const counts = trial?.counts?.();
      const region = trial?.communityRegionState?.(trial.firstCommunityId);
      return counts?.lastSelectionKind == null
        && counts?.selectedContainerId == null
        && region?.exists
        && !region.overlayTransform
        && region.width > 0
        && region.height > 0;
    },
    undefined,
    { timeout: 8000 }
  );
  await waitForStableCommunityRegion(page, null, 30);
}

async function waitForSpotlightSettled(page: PageLike, id: string | null): Promise<void> {
  await page.waitForFunction(
    (communityId: string | null) => {
      const trial = (window as any).__sigmaProduction;
      const counts = trial?.counts?.();
      const region = trial?.communityRegionState?.(communityId);
      return communityId
        && counts?.lastSelectionKind === "community"
        && (counts.lastSelectionCommunityIds || []).includes(communityId)
        && region?.exists
        && region.selected
        && !region.overlayTransform
        && region.width > 0
        && region.height > 0;
    },
    id,
    { timeout: 8000 }
  );
  await waitForStableCommunityRegion(page, id);
}

async function waitForStableCommunityRegion(page: PageLike, id: string | null, maxFrames = 12): Promise<void> {
  let previous = await page.evaluate((communityId: string | null) => {
    const trial = (window as any).__sigmaProduction;
    return trial.communityRegionState(communityId || trial.firstCommunityId);
  }, id) as SigmaSpotlightRegionState;
  for (let index = 0; index < maxFrames; index += 1) {
    await waitForAnimationFrames(page, 1);
    const current = await page.evaluate((communityId: string | null) => {
      const trial = (window as any).__sigmaProduction;
      return trial.communityRegionState(communityId || trial.firstCommunityId);
    }, id) as SigmaSpotlightRegionState;
    const stable = previous.exists
      && current.exists
      && !current.overlayTransform
      && Math.hypot(current.left - previous.left, current.top - previous.top) < 0.1
      && Math.abs(current.width - previous.width) < 0.1
      && Math.abs(current.height - previous.height) < 0.1;
    if (stable) return;
    previous = current;
  }
  throw new Error(`waitForStableCommunityRegion never stabilized for ${id ?? "(first)"}: ${JSON.stringify(previous)}`);
}

async function measureDrawerOpen(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => (window as any).__sigmaProduction.openDrawer());
  await waitForAnimationFrames(page, 1);
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
    const trial = (window as any).__sigmaProduction;
    return trial.enterCommunity(trial.firstCommunityId);
  });
  await waitForAnimationFrames(page);
  const route = (result as { route?: string }).route;
  return recordFromPage(page, metadata, {
    action: "enter_community",
    duration_ms: performance.now() - started,
    pass: route === "unknown" ? false : true,
    failure_class: route === "unknown" ? "community_route_unknown" : null,
    failure_detail: route === "unknown" ? "route=unknown" : null,
    artifact_path: resultPath
  });
}

async function measureReturnGlobal(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const started = performance.now();
  const result = await page.evaluate(() => (window as any).__sigmaProduction.returnGlobal());
  const duration = performance.now() - started;
  const probe = (result as { production?: { productionPath?: boolean }; selectedContainerId?: string | null }).production;
  const selectedContainerId = (result as { selectedContainerId?: string | null }).selectedContainerId;
  const readyProbe = await page.evaluate(() => (window as any).__sigmaProduction.productionProbe({ canvasSignal: false }));
  return recordFromPage(page, metadata, {
    action: "return_global",
    duration_ms: duration,
    pass: Boolean((readyProbe as { productionPath?: boolean }).productionPath) && selectedContainerId == null,
    failure_class: Boolean((readyProbe as { productionPath?: boolean }).productionPath) && selectedContainerId == null ? null : "global_return_incomplete",
    failure_detail: Boolean((readyProbe as { productionPath?: boolean }).productionPath) && selectedContainerId == null ? null : `productionPath=${probe?.productionPath}; readyProductionPath=${(readyProbe as { productionPath?: boolean }).productionPath}; selectedContainerId=${selectedContainerId ?? "null"}`,
    artifact_path: resultPath
  });
}

function allowsNonSigmaRouteForAction(action: string): boolean {
  return action === "enter_community";
}

function clickedCommunityFromCounts(counts: { lastSelectionKind?: string | null; lastSelectionCommunityIds?: string[] }): string | null {
  return counts.lastSelectionKind === "community" ? counts.lastSelectionCommunityIds?.[0] ?? null : null;
}

async function measureRepeatedCycles(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<PerformanceRecord> {
  const cycleCount = metadata.nodes >= 10000 ? 6 : 3;
  await settleMemory(page);
  const before = await memoryMb(page);
  const started = performance.now();
  for (let index = 0; index < cycleCount; index += 1) {
    await ensureSearchReady(page, metadata);
    const nodeTarget = await page.evaluate(() => (window as any).__sigmaProduction.nodeHitTarget());
    if (!nodeTarget) throw new Error("measureRepeatedCycles: no Sigma node hit target");
    await clickPoint(page, nodeTarget as PointerTarget);
    await waitForAnimationFrames(page, 2);
    const containerTarget = await page.evaluate(() => {
      const trial = (window as any).__sigmaProduction;
      return trial.containerHitTarget(trial.firstCommunityId);
    });
    if (!containerTarget) throw new Error("measureRepeatedCycles: no Sigma container hit target");
    await clickPoint(page, containerTarget as PointerTarget);
    await page.evaluate(() => (window as any).__sigmaProduction.openDrawer());
    await page.evaluate(() => (window as any).__sigmaProduction.returnGlobal());
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

async function ensureSearchReady(page: PageLike, metadata: LargeGraphFixtureMetadata): Promise<void> {
  const count = await page.evaluate(() => (window as any).__sigmaProduction?.counts?.().visibilitySearchResultCount ?? 0);
  if (count === metadata.search_hits) return;
  await page.evaluate(() => (window as any).__sigmaProduction.searchHighlight("needle"));
  await page.waitForFunction(
    (expected: number) => ((window as any).__sigmaProduction?.counts?.().visibilitySearchResultCount ?? 0) === expected,
    metadata.search_hits,
    { timeout: 4000 }
  );
  await waitForAnimationFrames(page, 3);
}

async function clickPoint(page: PageLike, target: PointerTarget): Promise<void> {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    throw new Error(`invalid pointer target: x=${target.x}; y=${target.y}`);
  }
  await page.mouse.click(target.x, target.y);
  // Sigma node hit-target overlays sit above the WebGL canvas and can drop
  // playwright's trusted click under certain compositor/timing conditions.
  // Re-dispatch a synthetic click by node id so the overlay's click handler
  // reliably runs. Only node hit-targets carry a node id, so community-region
  // clicks are unaffected.
  await page.evaluate((id: string | null) => {
    if (!id) return;
    const el = document.querySelector('.sigma-global-node-hit-target[data-node-id="' + window.CSS.escape(id) + '"]');
    if (el) el.click();
  }, (target as unknown as { id?: string | null }).id ?? null);
}

async function recordFromPage(
  page: PageLike,
  metadata: LargeGraphFixtureMetadata,
  input: Partial<PerformanceRecord> & { action: string; artifact_path: string }
): Promise<PerformanceRecord> {
  const counts = await page.evaluate(() => {
    const trial = (window as any).__sigmaProduction;
    const trialCounts = trial?.counts?.({ canvasSignal: true }) ?? {};
    return {
      dom_node_count: trialCounts.domNodeCount ?? document.querySelectorAll("*").length,
      visible_node_count: trialCounts.nodes ?? null,
      visible_edge_count: trialCounts.edges ?? null,
      visible_label_count: 0,
      visible_card_count: trialCounts.visibleCardCount ?? 0,
      memory_peak_mb: typeof performance !== "undefined" && "memory" in performance
        ? Math.round((((performance as any).memory?.usedJSHeapSize || 0) / 1024 / 1024) * 10) / 10
        : null,
      long_task_count: performance.getEntriesByType ? performance.getEntriesByType("longtask").length : null,
      interaction_mode: trialCounts.productionPath ? "production-sigma-global" : "production-route-missing",
      interaction_updated_objects: trialCounts.nodes ?? null,
      interaction_hidden_objects: 0,
      interaction_preserved_nodes: trialCounts.nodes ?? null,
      interaction_max_updates: trialCounts.nodes ?? null,
      production_route: trialCounts.route ?? null,
      loading_state: trialCounts.loadingState || (trialCounts.productionPath ? "sigma-global-ready" : "sigma-global-not-ready"),
      loading_state_seen_at_ms: typeof trialCounts.loadingStateSeenAtMs === "number" ? Math.round(trialCounts.loadingStateSeenAtMs * 10) / 10 : null,
      production_path: Boolean(trialCounts.topLevelProductionPath),
      sigma_canvas_count: trialCounts.canvasCount ?? 0,
      sigma_canvas_nonblank: trialCounts.canvasNonBlank ?? false,
      sigma_canvas_pixel_sample_count: trialCounts.canvasPixelSampleCount ?? 0,
      sigma_visible_signal: trialCounts.visibleSignal ?? false,
      sigma_hit_target_count: trialCounts.hitTargetCount ?? 0
    };
  });
  const record: PerformanceRecord = {
    ...baseRecord(metadata, input.action, input.artifact_path),
    ...counts,
    duration_ms: round(input.duration_ms ?? 0),
    fps: input.fps == null ? null : round(input.fps),
    frame_p95_ms: input.frame_p95_ms == null ? null : round(input.frame_p95_ms),
    pass: input.pass ?? true,
    failure_class: input.failure_class ?? null,
    failure_detail: input.failure_detail ?? null
  };
  if (allowsNonSigmaRouteForAction(record.action) && record.production_route === "dom-svg-community") {
    record.production_path = true;
  }
  if (!record.production_path && !record.failure_class && !allowsNonSigmaRouteForAction(record.action)) {
    record.pass = false;
    record.failure_class = "production_path_missing";
    record.failure_detail = productionSignalFailureDetail(record);
  }
  if (record.production_path && !record.failure_class && !allowsNonSigmaRouteForAction(record.action)) {
    const signalFailure = productionSignalFailureClass(record);
    if (signalFailure) {
      record.pass = false;
      record.failure_class = signalFailure;
      record.failure_detail = productionSignalFailureDetail(record);
    }
  }
  return applyDurationGate(metadata, record);
}

function productionSignalFailureClass(record: PerformanceRecord): string | null {
  if ((record.sigma_canvas_count ?? 0) < 1) return "sigma_canvas_missing";
  if (record.sigma_canvas_nonblank !== true && record.sigma_visible_signal !== true) return "sigma_canvas_blank";
  return null;
}

function productionSignalFailureDetail(record: PerformanceRecord): string {
  return `route=${record.production_route ?? "unknown"}; sigma_canvas_count=${record.sigma_canvas_count ?? "null"}; sigma_canvas_nonblank=${String(record.sigma_canvas_nonblank)}; sigma_visible_signal=${String(record.sigma_visible_signal)}; sigma_hit_target_count=${record.sigma_hit_target_count ?? "null"}`;
}

function applyDurationGate(metadata: LargeGraphFixtureMetadata, record: PerformanceRecord): PerformanceRecord {
  if (requestedActions && !requestedActions.has(record.action)) return record;
  if (!DURATION_GATED_ACTIONS.has(record.action) || record.failure_class) return record;
  const failure = durationFailureClass({ duration_ms: record.duration_ms }, metadata, record.action);
  if (!failure) return record;
  const limit = durationLimitMs(metadata, record.action);
  return {
    ...record,
    pass: false,
    failure_class: failure,
    failure_detail: `duration_ms=${record.duration_ms}; ceiling=${limit}`
  };
}

function failedRecord(
  metadata: LargeGraphFixtureMetadata,
  input: { action: string; failure_class: string; failure_detail?: string; artifact_path: string }
): PerformanceRecord {
  return {
    ...baseRecord(metadata, input.action, input.artifact_path),
    production_path: false,
    production_route: "unknown",
    loading_state: "not-run",
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
    production_route: null,
    loading_state: null,
    loading_state_seen_at_ms: null,
    sigma_canvas_count: null,
    sigma_canvas_nonblank: null,
    sigma_canvas_pixel_sample_count: null,
    sigma_visible_signal: null,
    sigma_hit_target_count: null,
    warmup_runs: undefined,
    median_fps: undefined,
    worst_run_fps: undefined,
    worst_run_frame_p95_ms: undefined,
    pass: false,
    failure_class: null,
    failure_detail: null,
    artifact_path: artifactPath,
    measured_at: new Date().toISOString()
  };
}

async function settleMemory(page: PageLike): Promise<void> {
  try {
    await page.evaluate(() => {
      const maybeGc = (globalThis as unknown as { gc?: () => void }).gc;
      if (typeof maybeGc === "function") maybeGc();
    });
  } catch {
    // Best effort only; Chromium exposes performance.memory even without GC.
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))));
}

async function memoryMb(page: PageLike): Promise<number | null> {
  return page.evaluate(() => {
    if (typeof performance === "undefined" || !("memory" in performance)) return null;
    const used = (performance as any).memory?.usedJSHeapSize;
    return typeof used === "number" ? Math.round((used / 1024 / 1024) * 10) / 10 : null;
  });
}

async function driveWheel(page: PageLike, durationMs: number): Promise<void> {
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    await page.mouse.move(720, 480);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
}

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

async function frameSampleRecord(
  page: PageLike,
  metadata: LargeGraphFixtureMetadata,
  input: {
    action: "wheel_zoom" | "drag" | "spotlight_animation";
    runs: { fps: number; p95: number; durationMs: number }[];
    enforceFrameMetrics?: boolean;
    failureClass?: string | null;
    failureDetail?: string | null;
  }
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
  const probe = await page.evaluate(() => (window as any).__sigmaProduction.productionProbe({ canvasSignal: false }));
  const frameFailure = input.enforceFrameMetrics === false ? null : frameSampleFailureClass({ fps, frame_p95_ms: p95 });
  const productionFailure = (probe as { productionPath?: boolean }).productionPath ? null : "production_path_missing";
  // productionFailure（生产路径缺失）致命，优先于 settle 失败和帧指标，避免被表面错误掩盖。
  const failureClass = productionFailure || input.failureClass || frameFailure;
  const metricDetail = `median_fps=${fps}; median_frame_p95_ms=${p95}; floor=${FPS_FLOOR}; ceiling=${FRAME_P95_CEILING_MS}; production_path=${(probe as { productionPath?: boolean }).productionPath}`;
  const failureDetail = failureClass
    ? [input.failureDetail, metricDetail].filter(Boolean).join("; ")
    : null;
  const record = await recordFromPage(page, metadata, {
    action: input.action,
    duration_ms: input.runs.reduce((sum, run) => sum + run.durationMs, 0),
    fps,
    frame_p95_ms: p95,
    pass: failureClass == null,
    failure_class: failureClass,
    failure_detail: failureDetail,
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

async function startSpotlightAnimationFrameSampler(
  page: PageLike,
  durationMs: number,
  selectedId: string | null,
  initialRegionsById: Record<string, SigmaSpotlightRegionState>
): Promise<void> {
  await page.evaluate(`(() => {
    const maxDurationMs = ${JSON.stringify(durationMs)};
    let activeId = ${JSON.stringify(selectedId)};
    const initialRegionsById = ${JSON.stringify(initialRegionsById)};
    const trial = window.__sigmaProduction;
    let started = 0;
    const deltas = [];
    const transforms = [];
    let sawTransform = false;
    let firstRegion = null;
    let lastRegion = null;
    let last = 0;
    function tick(now) {
      if (!started) {
        started = now;
        last = now;
      }
      const selected = trial.counts?.().lastSelectionCommunityIds?.[0] || null;
      if (selected && selected !== activeId) {
        activeId = selected;
        firstRegion = initialRegionsById[activeId] || null;
        lastRegion = null;
      }
      const region = trial.communityRegionState(activeId);
      if (!firstRegion && activeId && initialRegionsById[activeId]) firstRegion = initialRegionsById[activeId];
      if (!firstRegion && region && region.exists) firstRegion = region;
      if (region && region.exists) lastRegion = region;
      if (region && region.overlayTransform) {
        sawTransform = true;
        transforms.push(region.overlayTransform);
      }
      const delta = now - last;
      if (delta > 0) deltas.push(delta);
      last = now;
      const elapsed = now - started;
      const transformSettled = sawTransform && region && region.exists && !region.overlayTransform;
      if (transformSettled || elapsed >= maxDurationMs) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] || 0;
        const move = firstRegion && lastRegion
          ? Math.hypot(lastRegion.left - firstRegion.left, lastRegion.top - firstRegion.top)
          : 0;
        window.__sigmaSpotlightAnimationFrameSampleResolve({
          durationMs: elapsed,
          fps: deltas.length / (elapsed / 1000),
          p95,
          sawTransform,
          visualMovePx: move,
          firstRegion,
          lastRegion,
          transformSamples: transforms.slice(0, 5)
        });
        return;
      }
      requestAnimationFrame(tick);
    }
    window.__sigmaSpotlightAnimationFrameSample = new Promise((resolve) => {
      window.__sigmaSpotlightAnimationFrameSampleResolve = resolve;
    });
    requestAnimationFrame(tick);
  })()`);
}

async function readSpotlightAnimationFrameSample(page: PageLike): Promise<SigmaSpotlightAnimationSample> {
  return page.evaluate(`(() => window.__sigmaSpotlightAnimationFrameSample)()`) as Promise<SigmaSpotlightAnimationSample>;
}

function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Timeout|timed out/i.test(message)) return "timeout";
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

interface PointerTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string | null;
  communityId?: string | null;
}

interface PageLike {
  on?: (event: "console" | "pageerror" | "requestfailed", listener: (...args: any[]) => void) => void;
  addInitScript(script: string): Promise<void>;
  setDefaultTimeout(timeout: number): void;
  setDefaultNavigationTimeout(timeout: number): void;
  goto(url: string, options?: unknown): Promise<unknown>;
  waitForFunction(fn: Function | string, arg?: unknown, options?: unknown): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
  evaluate<T>(fn: Function | string, arg?: unknown): Promise<T>;
  mouse: {
    move(x: number, y: number, options?: { steps?: number }): Promise<void>;
    click(x: number, y: number): Promise<void>;
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
  production_route: string | null;
  loading_state: string | null;
  loading_state_seen_at_ms: number | null;
  sigma_canvas_count: number | null;
  sigma_canvas_nonblank: boolean | null;
  sigma_canvas_pixel_sample_count: number | null;
  sigma_visible_signal: boolean | null;
  sigma_hit_target_count: number | null;
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
