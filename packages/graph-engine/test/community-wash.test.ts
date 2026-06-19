import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X,
  DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y,
  computeCommunityWash
} from "../src/render/community-wash";

function node(x: number, y: number) {
  return { point: { x, y } };
}

describe("community wash geometry", () => {
  it("keeps small communities visibly selectable", () => {
    const wash = computeCommunityWash([node(240, 220), node(262, 236)]);

    assert.ok(wash);
    assert.equal(wash.rx, 57);
    assert.equal(wash.ry, 42);
    assert.equal(wash.opacity, 0.11);
  });

  it("responds to one dragged outlier without chasing it across the canvas", () => {
    const wash = computeCommunityWash([
      node(200, 240),
      node(220, 256),
      node(238, 230),
      node(252, 248),
      node(940, 610)
    ]);

    assert.ok(wash);
    assert.equal(wash.rx, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X);
    assert.equal(wash.ry, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y);
    assert.ok(wash.cx > 300, `wash should move toward the outlier, got cx ${wash.cx}`);
    assert.ok(wash.cx < 430, `wash should remain anchored near the core, got cx ${wash.cx}`);
  });

  it("caps response to outliers in multiple directions", () => {
    const wash = computeCommunityWash([
      node(440, 310),
      node(462, 326),
      node(482, 304),
      node(506, 330),
      node(80, 80),
      node(950, 630)
    ]);

    assert.ok(wash);
    assert.ok(wash.rx <= DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X, `rx should stay capped, got ${wash.rx}`);
    assert.ok(wash.ry <= DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y, `ry should stay capped, got ${wash.ry}`);
    assert.equal(wash.rx, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X);
    assert.equal(wash.ry, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y);
  });

  it("keeps the cap stable for a single extreme dragged outlier", () => {
    const nearOutlier = computeCommunityWash([
      node(200, 240),
      node(220, 256),
      node(238, 230),
      node(252, 248),
      node(1240, 816)
    ]);
    const extremeOutlier = computeCommunityWash([
      node(200, 240),
      node(220, 256),
      node(238, 230),
      node(252, 248),
      node(10000, 5000)
    ]);

    assert.ok(nearOutlier);
    assert.ok(extremeOutlier);
    assert.equal(nearOutlier.rx, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X);
    assert.equal(nearOutlier.ry, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y);
    assert.equal(extremeOutlier.rx, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X);
    assert.equal(extremeOutlier.ry, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y);
    assert.ok(extremeOutlier.cx < 440, `wash should stay visually anchored, got cx ${extremeOutlier.cx}`);
    assert.ok(extremeOutlier.cy < 390, `wash should stay visually anchored, got cy ${extremeOutlier.cy}`);
  });

  it("keeps oversized community wash calculation bounded", () => {
    const nodes = Array.from({ length: 1800 }, (_, index) => node(
      120 + (index % 60) * 9,
      90 + Math.floor(index / 60) * 11
    ));
    const started = performance.now();
    const wash = computeCommunityWash(nodes);
    const duration = performance.now() - started;

    assert.ok(wash);
    assert.ok(wash.rx <= DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X, `rx should stay capped, got ${wash.rx}`);
    assert.ok(wash.ry <= DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y, `ry should stay capped, got ${wash.ry}`);
    assert.ok(duration < 80, `oversized wash should be bounded, took ${duration}ms`);
  });
});
