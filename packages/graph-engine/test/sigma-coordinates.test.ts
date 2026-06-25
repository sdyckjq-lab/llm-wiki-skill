import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { GRAPH_WORLD_BOUNDS } from "../src/render/geometry";
import { sigmaScreenPointToWorldPoint, sigmaWorldPointToScreenPoint } from "../src/render/sigma-coordinates";
import type { SigmaGlobalSigmaLike } from "../src/render/sigma-global-renderer";

type ProjectionOptions = Parameters<typeof sigmaWorldPointToScreenPoint>[2];

const options = {
  viewportSize: { width: 800, height: 600 },
  adapterData: { renderable: { worldBounds: GRAPH_WORLD_BOUNDS } }
} as unknown as ProjectionOptions;

function sigmaWith(overrides: Partial<SigmaGlobalSigmaLike>): SigmaGlobalSigmaLike {
  return overrides as SigmaGlobalSigmaLike;
}

describe("sigma coordinate transforms", () => {
  it("prefers sigma.graphToViewport for world to screen", () => {
    const sigma = sigmaWith({ graphToViewport: (p) => ({ x: p.x + 10, y: p.y + 20 }) });
    assert.deepEqual(sigmaWorldPointToScreenPoint(sigma, { x: 1, y: 2 }, options), { x: 11, y: 22 });
  });

  it("prefers sigma.viewportToGraph for screen to world", () => {
    const sigma = sigmaWith({ viewportToGraph: (p) => ({ x: p.x - 10, y: p.y - 20 }) });
    assert.deepEqual(sigmaScreenPointToWorldPoint(sigma, { x: 11, y: 22 }, options), { x: 1, y: 2 });
  });

  it("round-trips world -> screen -> world through invertible projection", () => {
    const sigma = sigmaWith({
      graphToViewport: (p) => ({ x: p.x * 2, y: p.y * 2 }),
      viewportToGraph: (p) => ({ x: p.x / 2, y: p.y / 2 })
    });
    const world = { x: 3, y: 7 };
    const screen = sigmaWorldPointToScreenPoint(sigma, world, options);
    assert.deepEqual(sigmaScreenPointToWorldPoint(sigma, screen, options), world);
  });

  it("falls back to world-bounds math when sigma has no projection", () => {
    const screen = sigmaWorldPointToScreenPoint(sigmaWith({}), { x: 0, y: 0 }, options);
    assert.ok(Number.isFinite(screen.x) && Number.isFinite(screen.y));
  });

  it("falls back when the sigma projection returns non-finite values", () => {
    const sigma = sigmaWith({ graphToViewport: () => ({ x: Number.NaN, y: Number.NaN }) });
    const screen = sigmaWorldPointToScreenPoint(sigma, { x: 0, y: 0 }, options);
    assert.ok(Number.isFinite(screen.x) && Number.isFinite(screen.y));
  });
});
