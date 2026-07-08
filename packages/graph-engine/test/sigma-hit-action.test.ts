import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  selectionInputForSigmaHit,
  sigmaCommunityReadingHitActionForSigmaHit,
  sigmaGlobalHitActionForSigmaHit,
} from "../src/graph-routes/sigma-global-route";
import type { GraphGestureTarget } from "../src/render";
import type { GraphData } from "../src/types";

// #119：固化社区阅读里 Shift 多选 / 非 Shift 单击的命中分发边界。
// 这条边界已经存在，这些测试用来防止后续改动无意中把 Shift 多选并进节点阅读路径，
// 或反过来让普通单击走多选。
describe("sigma shift multi-select hit action boundary", () => {
  it("routes a non-shift node click to open-node (reading) in community reading", () => {
    const action = sigmaCommunityReadingHitActionForSigmaHit(
      fixtureGraph(),
      null,
      nodeTarget("a"),
      { additive: false },
    );

    assert.equal(action.kind, "open-node");
    assert.deepEqual(action.kind === "open-node" ? action.selection : null, { kind: "node", id: "a" });
  });

  it("routes a shift node click to multi-select without any camera op in community reading", () => {
    const action = sigmaCommunityReadingHitActionForSigmaHit(
      fixtureGraph(),
      null,
      nodeTarget("a"),
      { additive: true },
    );

    // Shift 命中走 select 多选；社区阅读的 select 分支不带 resetCamera（不动镜头）。
    assert.equal(action.kind, "select");
    assert.equal("resetCamera" in action, false);
    // #136: multi-select must not pin single-node relation focus to the clicked
    // node (no first-degree fan-out). Emphasis comes from between-selected real
    // edges instead, so the action carries a null relationFocusNodeId.
    assert.equal(action.kind === "select" ? action.relationFocusNodeId : "unexpected", null);
  });

  it("grows the selection through toggle on successive shift node hits", () => {
    const data = fixtureGraph();

    const first = selectionInputForSigmaHit(data, null, nodeTarget("a"), { additive: true });
    assert.deepEqual(first, { kind: "node", id: "a" });

    const second = selectionInputForSigmaHit(data, first, nodeTarget("b"), { additive: true });
    assert.deepEqual(second, { kind: "nodes", ids: ["a", "b"] });
  });

  it("keeps a non-shift node click as single-node reading even from an existing multi-selection", () => {
    // 非 Shift 永远是"读这一个节点"，不应在已有选区上累积，也不会保留旧的 multi 选区。
    const single = selectionInputForSigmaHit(
      fixtureGraph(),
      { kind: "nodes", ids: ["a", "b"] },
      nodeTarget("a"),
      { additive: false },
    );

    assert.deepEqual(single, { kind: "node", id: "a" });
  });

  it("does not attach camera reset to global select actions for node targets", () => {
    // 全局路径只有 clear 分支会带 resetCamera；节点 select 不动相机。
    const action = sigmaGlobalHitActionForSigmaHit(
      fixtureGraph(),
      null,
      nodeTarget("a"),
      { additive: true },
      null,
    );

    assert.equal(action.kind, "select");
    assert.equal("resetCamera" in action, false);
  });
});

function nodeTarget(id: string): GraphGestureTarget {
  return { kind: "node", id } as GraphGestureTarget;
}

function fixtureGraph(): GraphData {
  return {
    meta: {
      build_date: "2026-07-06",
      wiki_title: "Shift multi-select fixture",
      total_nodes: 2,
      total_edges: 1,
    },
    nodes: [
      { id: "a", label: "Alpha", type: "topic", community: "c1", source_path: "wiki/a.md" },
      { id: "b", label: "Beta", type: "source", community: "c1", source_path: "wiki/b.md" },
    ],
    edges: [
      { id: "a-b", from: "a", to: "b", type: "EXTRACTED", weight: 1 },
    ],
  };
}
