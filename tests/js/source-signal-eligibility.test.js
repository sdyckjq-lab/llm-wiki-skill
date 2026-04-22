const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SCAN_KINDS,
  extractFrontmatter,
  evaluateSourceSignalEligibility,
  parseSourcesFrontmatter
} = require("../../scripts/lib/source-signal-eligibility");

describe("extractFrontmatter", () => {
  it("returns hasFrontmatter:false when no frontmatter", () => {
    const result = extractFrontmatter("just body text");
    assert.equal(result.hasFrontmatter, false);
    assert.equal(result.frontmatter, "");
    assert.equal(result.body, "just body text");
  });

  it("extracts frontmatter from valid document", () => {
    const result = extractFrontmatter("---\ntitle: Test\n---\nbody");
    assert.equal(result.hasFrontmatter, true);
    assert.equal(result.frontmatter, "title: Test");
    assert.equal(result.body, "body");
  });

  it("returns hasFrontmatter:false for broken frontmatter", () => {
    const result = extractFrontmatter("---\ntitle: Test\nno closing");
    assert.equal(result.hasFrontmatter, false);
  });
});

describe("parseSourcesFrontmatter", () => {
  it("returns hasField:false for empty input", () => {
    const result = parseSourcesFrontmatter("");
    assert.equal(result.hasField, false);
    assert.equal(result.parsed, false);
    assert.deepEqual(result.sources, []);
  });

  it("returns hasField:false when no sources key", () => {
    const result = parseSourcesFrontmatter("title: Test\nauthor: me");
    assert.equal(result.hasField, false);
  });

  it("parses single string source", () => {
    const result = parseSourcesFrontmatter('sources: "paper.md"');
    assert.equal(result.hasField, true);
    assert.equal(result.parsed, true);
    assert.deepEqual(result.sources, ["paper.md"]);
    assert.equal(result.signalAvailable, true);
  });

  it("parses inline array", () => {
    const result = parseSourcesFrontmatter('sources: ["a.md", "b.md"]');
    assert.equal(result.hasField, true);
    assert.deepEqual(result.sources, ["a.md", "b.md"]);
  });

  it("parses multiline list", () => {
    const result = parseSourcesFrontmatter("sources:\n  - paper.md\n  - note.md");
    assert.equal(result.hasField, true);
    assert.deepEqual(result.sources, ["note.md", "paper.md"]);
  });

  it("returns empty_sources for empty array", () => {
    const result = parseSourcesFrontmatter("sources: []");
    assert.equal(result.hasField, true);
    assert.equal(result.parsed, true);
    assert.deepEqual(result.sources, []);
    assert.equal(result.signalAvailable, false);
  });

  it("returns empty_sources for whitespace-only token", () => {
    const result = parseSourcesFrontmatter('sources:\n  - ""');
    assert.equal(result.hasField, true);
    assert.deepEqual(result.sources, []);
  });

  it("returns parsed:false for broken inline array", () => {
    const result = parseSourcesFrontmatter("sources: [");
    assert.equal(result.hasField, true);
    assert.equal(result.parsed, false);
    assert.deepEqual(result.sources, []);
  });

  it("returns parsed:false for invalid multiline content", () => {
    const result = parseSourcesFrontmatter("sources:\n  foo: bar");
    assert.equal(result.hasField, true);
    assert.equal(result.parsed, false);
  });

  it("handles numeric sources by stringifying", () => {
    const result = parseSourcesFrontmatter("sources: [1, 2]");
    assert.equal(result.hasField, true);
    assert.equal(result.parsed, true);
    assert.deepEqual(result.sources, ["1", "2"]);
  });
});

describe("evaluateSourceSignalEligibility", () => {
  it("returns not_applicable for synthesis", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "synthesis",
      frontmatter: "title: Test"
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "not_applicable");
  });

  it("returns not_applicable for query", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "query",
      frontmatter: "sources: [a.md]"
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "not_applicable");
  });

  it("returns not_applicable for unknown page type", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "unknown",
      frontmatter: "sources: [a.md]"
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "not_applicable");
  });

  it("returns ok for entity with valid sources", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "entity",
      frontmatter: "sources:\n  - paper.md\n  - note.md"
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "ok");
    assert.deepEqual(result.sources, ["note.md", "paper.md"]);
  });

  it("returns ok for topic with single source", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "topic",
      frontmatter: 'sources: "paper.md"'
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "ok");
  });

  it("returns missing_sources when no frontmatter", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "entity",
      frontmatter: ""
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "missing_sources");
  });

  it("returns missing_sources when no sources field", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "entity",
      frontmatter: "title: Test"
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "missing_sources");
  });

  it("returns empty_sources for empty array", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "entity",
      frontmatter: "sources: []"
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "empty_sources");
  });

  it("returns invalid_sources for broken syntax", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "entity",
      frontmatter: "sources: ["
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "invalid_sources");
  });

  it("treats comparison as applicable", () => {
    const result = evaluateSourceSignalEligibility({
      pageType: "comparison",
      frontmatter: 'sources: "a.md"'
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "ok");
  });
});

describe("SCAN_KINDS", () => {
  it("includes all 6 page types", () => {
    const types = SCAN_KINDS.map((k) => k.pageType).sort();
    assert.deepEqual(types, ["comparison", "entity", "query", "source", "synthesis", "topic"]);
  });

  it("marks entity/topic/source/comparison as applicable", () => {
    const applicable = SCAN_KINDS.filter((k) => k.applicable).map((k) => k.pageType).sort();
    assert.deepEqual(applicable, ["comparison", "entity", "source", "topic"]);
  });
});
