import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GRAPH_MINIMAP_VIEWBOX,
  GRAPH_WORLD_SIZE,
  layerDeltaToWorldDelta,
  layerPointToWorldPoint,
  minimapPointToWorldPoint,
  rootClientPointToScreenPoint,
  screenPointToWorldPoint,
  sideExitWorldAnchor,
  svgPointToWorldPoint,
  visibleWorldRectForViewport,
  visibleWorldRectToMinimapRect,
  worldBoundsForPoints,
  worldDeltaToLayerDelta,
  worldPointDeltaToLayerDelta,
  worldPointToCssPercentPoint,
  worldPointToLayerPoint,
  worldPointToMinimapPoint,
  worldPointToScreenPoint,
  worldPointToSvgPoint
} from "../src/render";
import type { RendererViewport, RendererViewportSize } from "../src/render";

const VIEWPORT_SIZE: RendererViewportSize = { width: 1200, height: 816 };

function assertNear(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message ?? "number"}: expected ${expected}, got ${actual}`);
}

function assertPointNear(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  assertNear(actual.x, expected.x, "x");
  assertNear(actual.y, expected.y, "y");
}

describe("graph geometry projection", () => {
  for (const scale of [0.5, 1, 2.25]) {
    it(`round trips world and screen points at scale ${scale}`, () => {
      const viewport: RendererViewport = { x: -180.5, y: 74.25, scale };
      const worldPoint = { x: 812.34, y: 123.45 };

      const screenPoint = worldPointToScreenPoint(worldPoint, viewport, VIEWPORT_SIZE);
      const roundTrip = screenPointToWorldPoint(screenPoint, viewport, VIEWPORT_SIZE);

      assertPointNear(roundTrip, worldPoint);
    });
  }

  it("projects through viewport pan and zoom", () => {
    const viewport: RendererViewport = { x: 120, y: -80, scale: 1.75 };
    const worldPoint = { x: 500, y: 340 };

    assertPointNear(
      worldPointToScreenPoint(worldPoint, viewport, { width: 1000, height: 680 }),
      { x: 995, y: 515 }
    );
  });

  it("converts root client point to graph screen point", () => {
    const screenPoint = rootClientPointToScreenPoint(
      { x: 940, y: 520 },
      { left: 270, top: 88, width: 1000, height: 680 }
    );

    assert.deepEqual(screenPoint, { x: 670, y: 432 });
  });

  it("does not silently clamp screen to world projection outside the visible root", () => {
    const viewport: RendererViewport = { x: -200, y: -100, scale: 2 };
    const worldPoint = screenPointToWorldPoint({ x: -240, y: 1500 }, viewport, { width: 1000, height: 680 });

    assert.ok(worldPoint.x < 0, `x should remain outside world for drag handling, got ${worldPoint.x}`);
    assert.ok(worldPoint.y > GRAPH_WORLD_SIZE.height, `y should remain outside world for drag handling, got ${worldPoint.y}`);
  });

  it("round trips world and layer points after drawer-style viewport resize", () => {
    const worldPoint = { x: 760, y: 340 };
    const beforeLayer = worldPointToLayerPoint(worldPoint, { width: 1170, height: 856 });
    const afterLayer = worldPointToLayerPoint(worldPoint, { width: 750, height: 856 });

    assert.notEqual(beforeLayer.x, afterLayer.x);
    assertPointNear(layerPointToWorldPoint(afterLayer, { width: 750, height: 856 }), worldPoint);
  });

  it("converts deltas without treating them as absolute points", () => {
    const worldDelta = { x: 50, y: -34 };
    const layerDelta = worldDeltaToLayerDelta(worldDelta, VIEWPORT_SIZE);
    const roundTrip = layerDeltaToWorldDelta(layerDelta, VIEWPORT_SIZE);

    assertPointNear(roundTrip, worldDelta);
    assertPointNear(
      worldPointDeltaToLayerDelta({ x: 220, y: 180 }, { x: 270, y: 146 }, VIEWPORT_SIZE),
      layerDelta
    );
  });

  it("maps out-of-world positions to css percentages without clamping them", () => {
    const cssPoint = worldPointToCssPercentPoint({ x: 1240, y: 816 });

    assertPointNear(cssPoint, { x: 124, y: 120 });
  });

  it("maps expanded world bounds without clamping or drifting coordinates", () => {
    const bounds = { minX: -200, minY: 0, maxX: 1320, maxY: 896, width: 1520, height: 896 };
    const worldPoint = { x: 1240, y: 816 };
    const layerPoint = worldPointToLayerPoint(worldPoint, VIEWPORT_SIZE, bounds);
    const cssPoint = worldPointToCssPercentPoint(worldPoint, bounds);
    const minimapPoint = worldPointToMinimapPoint(worldPoint, undefined, bounds);

    assertPointNear(layerPointToWorldPoint(layerPoint, VIEWPORT_SIZE, bounds), worldPoint);
    assertPointNear(cssPoint, { x: 94.737, y: 91.071 });
    assertPointNear(minimapPointToWorldPoint(minimapPoint, undefined, bounds), worldPoint);
  });

  it("keeps svg point naming explicit even while svg and world share the same domain", () => {
    const worldPoint = { x: 220.5, y: 410.25 };
    const svgPoint = worldPointToSvgPoint(worldPoint);

    assert.deepEqual(svgPoint, worldPoint);
    assert.deepEqual(svgPointToWorldPoint(svgPoint), worldPoint);
  });

  it("maps world and viewport rectangles to minimap coordinates", () => {
    const minimapPoint = worldPointToMinimapPoint({ x: 500, y: 340 });
    const worldPoint = minimapPointToWorldPoint(minimapPoint);
    const viewportRect = visibleWorldRectForViewport(
      { x: -250, y: -170, scale: 2 },
      { width: 1000, height: 680 }
    );
    const minimapRect = visibleWorldRectToMinimapRect(viewportRect);

    assertPointNear(minimapPoint, {
      x: GRAPH_MINIMAP_VIEWBOX.x + GRAPH_MINIMAP_VIEWBOX.width / 2,
      y: GRAPH_MINIMAP_VIEWBOX.y + GRAPH_MINIMAP_VIEWBOX.height / 2
    });
    assertPointNear(worldPoint, { x: 500, y: 340 });
    assert.ok(minimapRect.x > GRAPH_MINIMAP_VIEWBOX.x);
    assert.ok(minimapRect.y > GRAPH_MINIMAP_VIEWBOX.y);
    assert.ok(minimapRect.width > 0);
    assert.ok(minimapRect.height > 0);
  });

  it("derives side anchors for isolated diff motion outside the default world", () => {
    assert.deepEqual(sideExitWorldAnchor({ x: 120, y: 20 }), { x: -80, y: 80 });
    assert.deepEqual(sideExitWorldAnchor({ x: 900, y: 900 }), { x: 1080, y: 600 });
  });
});

describe("worldBoundsForPoints aspect lock", () => {
  // 明显偏高的点云（宽 100、高 3000）；y 远超 GRAPH_WORLD_SIZE.height(680)，
  // 确保紧制 bounds 反映点云形状而非被 minHeight 兜底撑成横向
  const tallCloud = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 3000 }, { x: 100, y: 3000 },
  ];
  it("without aspectRatio returns tight bounds (point-cloud aspect)", () => {
    const b = worldBoundsForPoints(tallCloud);
    assert.ok(b.width / b.height < 1, "tight bounds should be taller than wide");
  });
  it("with aspectRatio expands short axis to match viewport ratio without losing points", () => {
    const aspect = 16 / 9;
    const b = worldBoundsForPoints(tallCloud, { aspectRatio: aspect });
    assert.ok(Math.abs(b.width / b.height - aspect) < 0.01, `aspect locked to ${aspect}`);
    for (const p of tallCloud) {
      assert.ok(p.x >= b.minX && p.x <= b.maxX, `point x=${p.x} inside bounds`);
      assert.ok(p.y >= b.minY && p.y <= b.maxY, `point y=${p.y} inside bounds`);
    }
  });
  it("aspectRatio only expands short axis (wide cloud + narrow ratio keeps all points)", () => {
    const wideCloud = [{ x: 0, y: 0 }, { x: 400, y: 100 }];
    const b = worldBoundsForPoints(wideCloud, { aspectRatio: 0.5 });
    for (const p of wideCloud) {
      assert.ok(p.x >= b.minX && p.x <= b.maxX);
      assert.ok(p.y >= b.minY && p.y <= b.maxY);
    }
  });
  it("aspect-lock preserves center (cx/cy unchanged)", () => {
    const tight = worldBoundsForPoints(tallCloud);
    const locked = worldBoundsForPoints(tallCloud, { aspectRatio: 16 / 9 });
    const tightCx = (tight.minX + tight.maxX) / 2;
    const tightCy = (tight.minY + tight.maxY) / 2;
    const lockedCx = (locked.minX + locked.maxX) / 2;
    const lockedCy = (locked.minY + locked.maxY) / 2;
    assert.ok(Math.abs(tightCx - lockedCx) < 1e-6, "cx preserved across aspect-lock");
    assert.ok(Math.abs(tightCy - lockedCy) < 1e-6, "cy preserved across aspect-lock");
  });
  it("ignores non-finite / zero / negative aspectRatio (no lock, no division error)", () => {
    const baseline = worldBoundsForPoints(tallCloud);
    for (const bad of [NaN, 0, -1, Infinity, -Infinity]) {
      const b = worldBoundsForPoints(tallCloud, { aspectRatio: bad });
      assert.equal(b.width, baseline.width, `aspectRatio=${bad} should not lock width`);
      assert.equal(b.height, baseline.height, `aspectRatio=${bad} should not lock height`);
    }
  });
});
