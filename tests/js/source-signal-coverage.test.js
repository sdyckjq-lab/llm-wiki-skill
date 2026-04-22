const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { scanWiki } = require("../../scripts/source-signal-coverage");
const path = require("path");

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "coverage-sample-wiki");

describe("scanWiki", () => {
  it("returns correct summary counts", () => {
    const { summary } = scanWiki(FIXTURE_ROOT);
    assert.equal(summary.ok, 2);
    assert.equal(summary.missing_sources, 1);
    assert.equal(summary.empty_sources, 1);
    assert.equal(summary.invalid_sources, 1);
    assert.equal(summary.not_applicable, 2);
    assert.equal(summary.applicable_total, 5);
  });

  it("returns pages for all scanned files", () => {
    const { pages } = scanWiki(FIXTURE_ROOT);
    assert.equal(pages.length, 7);
  });

  it("marks synthesis as not_applicable", () => {
    const { pages } = scanWiki(FIXTURE_ROOT);
    const crystal = pages.find((p) => p.id === "Crystal");
    assert.equal(crystal.reason, "not_applicable");
  });

  it("marks query as not_applicable", () => {
    const { pages } = scanWiki(FIXTURE_ROOT);
    const query = pages.find((p) => p.pageType === "query");
    assert.equal(query.reason, "not_applicable");
  });

  it("detects ok with correct sourceCount", () => {
    const { pages } = scanWiki(FIXTURE_ROOT);
    const alpha = pages.find((p) => p.id === "Alpha");
    assert.equal(alpha.reason, "ok");
    assert.equal(alpha.sourceCount, 2);
  });

  it("detects invalid_sources", () => {
    const { pages } = scanWiki(FIXTURE_ROOT);
    const delta = pages.find((p) => p.id === "Delta");
    assert.equal(delta.reason, "invalid_sources");
  });
});
