import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampPointToScreenEllipse,
  clampPointToWorldEllipse,
  convexHull2d,
  sigmaCommunityCloud,
  sigmaCommunityCloudSignature
} from "../src/render/community-cloud-geometry";

function hasPoint(points: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  return points.some((p) => p.x === x && p.y === y);
}

describe("community cloud geometry", () => {
  it("convexHull2d copies inputs shorter than a triangle", () => {
    const single = [{ x: 1, y: 2 }];
    const result = convexHull2d(single);
    assert.deepEqual(result, single);
    assert.notEqual(result, single);
  });

  it("convexHull2d keeps only the outer corners and drops interior points", () => {
    const hull = convexHull2d([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 }
    ]);
    assert.equal(hull.length, 4);
    assert.ok(hasPoint(hull, 0, 0));
    assert.ok(hasPoint(hull, 4, 0));
    assert.ok(hasPoint(hull, 4, 4));
    assert.ok(hasPoint(hull, 0, 4));
    assert.ok(!hasPoint(hull, 2, 2));
  });

  it("clampPointToWorldEllipse leaves interior points untouched", () => {
    const ellipse = { cx: 0, cy: 0, rx: 10, ry: 10 };
    assert.deepEqual(clampPointToWorldEllipse({ x: 5, y: 0 }, ellipse), { x: 5, y: 0 });
  });

  it("clampPointToWorldEllipse projects outside points onto the boundary", () => {
    const ellipse = { cx: 0, cy: 0, rx: 10, ry: 10 };
    assert.deepEqual(clampPointToWorldEllipse({ x: 20, y: 0 }, ellipse), { x: 10, y: 0 });
  });

  it("clampPointToScreenEllipse projects outside points onto the box ellipse", () => {
    const box = { left: 0, top: 0, width: 20, height: 20 };
    assert.deepEqual(clampPointToScreenEllipse({ x: 12, y: 10 }, box), { x: 12, y: 10 });
    assert.deepEqual(clampPointToScreenEllipse({ x: 30, y: 10 }, box), { x: 20, y: 10 });
  });

  it("sigmaCommunityCloudSignature is stable for equal inputs and changes with the wash", () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const wash = { cx: 0, cy: 0, rx: 5, ry: 5 };
    assert.equal(
      sigmaCommunityCloudSignature(points, wash),
      sigmaCommunityCloudSignature(points, wash)
    );
    assert.notEqual(
      sigmaCommunityCloudSignature(points, wash),
      sigmaCommunityCloudSignature(points, { cx: 1, cy: 0, rx: 5, ry: 5 })
    );
    assert.equal(sigmaCommunityCloudSignature([{ x: 1, y: 2 }], undefined), "1,2");
  });

  it("sigmaCommunityCloud falls back to the box when there is no hull", () => {
    const fallback = { left: 1, top: 2, width: 3, height: 4 };
    const cloud = sigmaCommunityCloud([], fallback);
    assert.deepEqual(cloud.box, fallback);
    assert.equal(cloud.localPoints, null);
  });

  it("sigmaCommunityCloud derives local polygon points from a screen hull", () => {
    const cloud = sigmaCommunityCloud(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
      { left: -1000, top: -1000, width: 4000, height: 4000 }
    );
    assert.ok(cloud.localPoints);
    assert.equal(cloud.localPoints?.length, 3);
    assert.ok(cloud.box.width >= 8 && cloud.box.height >= 8);
  });
});
