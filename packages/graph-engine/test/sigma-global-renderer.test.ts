import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  createSigmaGlobalRenderer
} from "../src/render";

describe("Sigma global renderer production boundary", () => {
  it("records route ownership and graph-engine bundle boundary", () => {
    assert.equal(SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER, "facade");
    assert.deepEqual(SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY, {
      sigma: "runtime-loaded-by-sigma-global-renderer",
      graphology: "runtime-loaded-by-sigma-global-renderer",
      workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
      offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
    });
  });

  it("keeps Sigma and Graphology in runtime dependencies", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.dependencies.sigma, "^3.0.3");
    assert.equal(manifest.dependencies.graphology, "^0.26.0");
    assert.equal(manifest.devDependencies.sigma, undefined);
    assert.equal(manifest.devDependencies.graphology, undefined);
  });

  it("does not silently activate the production lifecycle before later tasks land", () => {
    assert.throws(
      () => createSigmaGlobalRenderer({} as never),
      /Task 3\.4/
    );
  });
});
