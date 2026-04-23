const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const GRAPH_WASH_PATH = path.resolve(__dirname, "../../templates/graph-styles/wash/graph-wash.js");
const GRAPH_WASH_SOURCE = fs.readFileSync(GRAPH_WASH_PATH, "utf8");
const GRAPH_WASH_BOOTSTRAP_SOURCE = GRAPH_WASH_SOURCE.match(
  /const helpers = window\.WikiGraphWashHelpers;[\s\S]*?const safeLocalStorage = createSafeStorage\(rawLocalStorage, console\.warn\);/
)[0];

describe("graph-wash bootstrap", () => {
  it("exports helpers to window even when CommonJS exists", () => {
    const helpersSource = fs.readFileSync(path.resolve(__dirname, "../../templates/graph-styles/wash/graph-wash-helpers.js"), "utf8");
    const sandbox = {
      module: { exports: {} },
      exports: {},
      require,
      console,
      Intl,
      window: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(helpersSource, sandbox, { filename: "graph-wash-helpers.js" });

    assert.equal(typeof sandbox.module.exports.truncateLabel, "function");
    assert.equal(typeof sandbox.window.WikiGraphWashHelpers.truncateLabel, "function");
  });

  it("logs and exits when helpers are missing", () => {
    const errors = [];
    const sandbox = {
      window: {},
      console: {
        error: (...args) => errors.push(args.join(" "))
      }
    };

    vm.createContext(sandbox);
    vm.runInContext(GRAPH_WASH_SOURCE, sandbox, { filename: GRAPH_WASH_PATH });

    assert.deepEqual(errors, ["[wiki] graph-wash-helpers.js is missing or failed to load"]);
  });

  it("passes null to createSafeStorage when localStorage getter throws", () => {
    let capturedStorage;
    const sandbox = {
      window: {
        WikiGraphWashHelpers: {
          truncateLabel: () => ({ text: "", truncated: false }),
          cardDims: () => ({ w: 72, h: 36 }),
          createSafeStorage: (storage) => {
            capturedStorage = storage;
            return { get: () => null, set: () => {} };
          },
          defaultLearning: () => ({ version: 1, entry: { recommended_start_node_id: null, recommended_start_reason: null, default_mode: "global" }, views: { path: { enabled: false, start_node_id: null, node_ids: [], degraded: true }, community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true }, global: { enabled: true, node_ids: [], degraded: false } }, communities: [], drawer: { section_order: [] }, degraded: { path_to_community: true, community_to_global: true } }),
          normalizeLearning: () => ({ version: 1, entry: { recommended_start_node_id: null, recommended_start_reason: null, default_mode: "global" }, views: { path: { enabled: false, start_node_id: null, node_ids: [], degraded: true }, community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true }, global: { enabled: true, node_ids: [], degraded: false } }, communities: [], drawer: { section_order: [] }, degraded: { path_to_community: true, community_to_global: true } }),
          resolveInitialMode: () => "global",
          getVisibleNodeIds: () => [],
          getVisibleLinks: () => [],
          shouldAutoOpenDrawer: () => false
        },
        get localStorage() {
          throw new Error("blocked");
        }
      },
      document: {
        getElementById: (id) => {
          if (id === "graph-data") {
            return { textContent: '{"nodes":[],"edges":[],"insights":{}}' };
          }
          return null;
        }
      },
      d3: {
        select: () => ({ node: () => null })
      },
      console: {
        warn: () => {}
      },
      JSON,
      Object
    };

    vm.createContext(sandbox);
    vm.runInContext(`(function () {\n${GRAPH_WASH_BOOTSTRAP_SOURCE}\n})();`, sandbox, { filename: GRAPH_WASH_PATH });

    assert.equal(capturedStorage, null);
  });
});
