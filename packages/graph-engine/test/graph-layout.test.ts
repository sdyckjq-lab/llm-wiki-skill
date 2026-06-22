import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeGraphLayoutFile, normalizeGraphPinMap } from "../src";
import * as graphEngine from "../src";

describe("graph layout normalization", () => {
  it("marks unlabelled version 1 pins as legacy percent coordinates", () => {
    assert.deepEqual(normalizeGraphLayoutFile({
      version: 1,
      pins: {
        "wiki/old.md": { x: 80, y: 50 },
        "wiki/world.md": { x: 8, y: -12, coordinateSpace: "world" },
        "../unsafe.md": { x: 1, y: 2 }
      },
      updatedAt: "2026-06-16T00:00:00.000Z"
    }), {
      version: 2,
      pins: {
        "wiki/old.md": { x: 80, y: 50, coordinateSpace: "legacy-percent" },
        "wiki/world.md": { x: 8, y: -12, coordinateSpace: "world" }
      },
      updatedAt: "2026-06-16T00:00:00.000Z"
    });
  });

  it("treats unlabelled current pins as world coordinates", () => {
    assert.deepEqual(normalizeGraphLayoutFile({
      version: 2,
      pins: {
        "wiki/current.md": { x: 8, y: 12 },
        "wiki/bad-space.md": { x: 1, y: 2, coordinateSpace: "screen" },
        "/absolute.md": { x: 3, y: 4 },
        "wiki/invalid.md": { x: "nope", y: 4 }
      }
    }), {
      version: 2,
      pins: {
        "wiki/current.md": { x: 8, y: 12, coordinateSpace: "world" },
        "wiki/bad-space.md": { x: 1, y: 2, coordinateSpace: "world" }
      },
      updatedAt: ""
    });
  });

  it("preserves explicit world pins far outside the current viewport", () => {
    assert.deepEqual(normalizeGraphLayoutFile({
      version: 2,
      pins: {
        "wiki/valid.md": { x: 412.5, y: -88.2, coordinateSpace: "world" },
        "wiki/far-away.md": { x: 284015.9548304589, y: 47155.27885437255, coordinateSpace: "world" },
        "wiki/legacy-percent.md": { x: 80, y: 50, coordinateSpace: "legacy-percent" }
      }
    }), {
      version: 2,
      pins: {
        "wiki/valid.md": { x: 412.5, y: -88.2, coordinateSpace: "world" },
        "wiki/far-away.md": { x: 284015.9548304589, y: 47155.27885437255, coordinateSpace: "world" },
        "wiki/legacy-percent.md": { x: 80, y: 50, coordinateSpace: "legacy-percent" }
      },
      updatedAt: ""
    });
  });

  it("drops implausibly distant explicit world pins only at broken-data scale", () => {
    assert.deepEqual(normalizeGraphLayoutFile({
      version: 2,
      pins: {
        "wiki/valid-world.md": { x: 284015.9548304589, y: 47155.27885437255, coordinateSpace: "world" },
        "wiki/broken-world.md": { x: 1000001, y: 42, coordinateSpace: "world" }
      }
    }), {
      version: 2,
      pins: {
        "wiki/valid-world.md": { x: 284015.9548304589, y: 47155.27885437255, coordinateSpace: "world" }
      },
      updatedAt: ""
    });
  });

  it("drops implausibly distant legacy percent pins before migration", () => {
    assert.deepEqual(normalizeGraphLayoutFile({
      version: 1,
      pins: {
        "wiki/valid-percent.md": { x: 80, y: 50 },
        "wiki/far-percent.md": { x: 284015.9548304589, y: 47155.27885437255 }
      }
    }), {
      version: 2,
      pins: {
        "wiki/valid-percent.md": { x: 80, y: 50, coordinateSpace: "legacy-percent" }
      },
      updatedAt: ""
    });
  });

  it("normalizes stored pins without applying layout-key safety", () => {
    assert.deepEqual(normalizeGraphPinMap({
      "/fake/wiki/entities/A.md": { x: 332.5, y: 240.25 },
      "wiki/legacy.md": { x: 13, y: 50, coordinateSpace: "legacy-percent" }
    }), {
      "/fake/wiki/entities/A.md": { x: 332.5, y: 240.25, coordinateSpace: "world" },
      "wiki/legacy.md": { x: 13, y: 50, coordinateSpace: "legacy-percent" }
    });
  });

  it("does not expose layout key policy as part of the public root API", () => {
    assert.equal("isSafeGraphLayoutPinKey" in graphEngine, false);
  });
});
