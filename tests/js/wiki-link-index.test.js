const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const { discoverKnowledgeBaseFiles } = require("../../scripts/lib/wiki-file-discovery");
const { parseWikilinks } = require("../../scripts/lib/wikilink-parser");
const {
  buildWikiTargetIndex,
  portablePathKey,
  resolveWikilink,
  scanKnowledgeBaseLinks,
  validatePortableMarkdownFilename
} = require("../../scripts/lib/wiki-link-index");

const FIXTURE = path.join(__dirname, "..", "fixtures", "graph-path-identity-wiki");

function inventoryForFixture() {
  return discoverKnowledgeBaseFiles(FIXTURE);
}

function indexForTargets(targets) {
  return buildWikiTargetIndex(targets);
}

function resolveLiteral(rawLink, { sourcePath = "wiki/sources/links.md", targets } = {}) {
  const inventory = targets || inventoryForFixture().targets;
  const occurrence = parseWikilinks(Buffer.from(`${rawLink}\n`, "utf8"), sourcePath).occurrences[0];
  return resolveWikilink(occurrence, sourcePath, indexForTargets(inventory));
}

describe("resolveWikilink", () => {
  it("applies the V3 unique, ambiguous, pending, broken, noncanonical, self, attachment, and non-graph rules", () => {
    const defaultTargets = inventoryForFixture().targets;
    const withoutFuture = defaultTargets.filter((item) => item.path !== "wiki/synthesis/future.md");

    assert.equal(resolveLiteral("[[unique]]").status, "resolved");
    assert.equal(resolveLiteral("[[foo]]").status, "ambiguous");
    assert.equal(resolveLiteral("[[wiki/topics/foo]]").target_path, "wiki/topics/foo.md");
    assert.equal(resolveLiteral("[[WIKI/TOPICS/FOO.md]]").warning_code, "noncanonical_wikilink");
    assert.equal(resolveLiteral("[待创建: [[future]]]", { targets: withoutFuture }).warning_code, "pending_wikilink");
    assert.equal(resolveLiteral("[[missing]]").warning_code, "broken_wikilink");
    assert.equal(resolveLiteral("[[#本页]]").creates_edge, false);
    assert.equal(resolveLiteral("![[raw/assets/Figure.png]]").creates_edge, false);
    assert.equal(resolveLiteral("![[raw/assets/Fissing.png]]".replace("Fissing", "Missing")).warning_code, null);
    assert.equal(resolveLiteral("[[wiki/notes/side.md]]").creates_edge, false);
  });

  it("does not let frontmatter aliases enter the identity index", () => {
    const inventory = inventoryForFixture();
    const index = indexForTargets(inventory.targets);
    assert.equal(resolveLiteral("[[alias-target]]").warning_code, "broken_wikilink");
    assert.equal(index.portableBasenames.has(portablePathKey("alias-target")), false);
  });
});

describe("buildWikiTargetIndex and scanKnowledgeBaseLinks", () => {
  it("reuses one stable candidate set for every ambiguous foo occurrence and keeps stale pending wrappers non-strict", () => {
    const lintScan = scanKnowledgeBaseLinks(FIXTURE, "lint");

    assert.equal(lintScan.candidate_sets.length, 1);
    assert.deepEqual(lintScan.candidate_sets[0].candidates, [
      "raw/notes/foo.md",
      "wiki/entities/foo.md",
      "wiki/sources/foo.md",
      "wiki/topics/foo.md"
    ]);

    const ambiguousGroup = lintScan.groups.find((group) => group.code === "ambiguous_wikilink");
    assert.ok(ambiguousGroup);
    assert.equal(ambiguousGroup.candidate_set_id, lintScan.candidate_sets[0].candidate_set_id);
    assert.equal(ambiguousGroup.occurrence_count, 2);

    assert.equal(
      lintScan.edges.some((edge) => edge.to === "wiki/synthesis/future.md"),
      true
    );
    assert.equal(
      lintScan.groups.some((group) => group.code === "pending_wikilink" && group.target_key === "future"),
      false
    );
    assert.deepEqual(
      lintScan.stale_pending_wrappers.map((item) => item.raw_link),
      ["[待创建: [[future]]]"]
    );
    assert.equal(
      lintScan.groups.some((group) => group.code === "broken_wikilink" && group.target_key === "raw/assets/Missing.png"),
      false
    );
  });

  it("tracks portable path collisions without merging nodes", () => {
    const syntheticInventory = [
      {
        path: "wiki/topics/Foo.md",
        absolutePath: "/tmp/Foo.md",
        kind: "markdown",
        editable: true,
        graphType: "topic"
      },
      {
        path: "wiki/topics/foo.md",
        absolutePath: "/tmp/foo.md",
        kind: "markdown",
        editable: true,
        graphType: "topic"
      }
    ];

    const index = buildWikiTargetIndex(syntheticInventory);
    assert.equal(index.exactPaths.get("wiki/topics/Foo.md").path, "wiki/topics/Foo.md");
    assert.equal(index.exactPaths.get("wiki/topics/foo.md").path, "wiki/topics/foo.md");
    assert.deepEqual(
      index.portableCollisions[0].candidates,
      ["wiki/topics/Foo.md", "wiki/topics/foo.md"]
    );
    assert.equal(index.portablePaths.get(portablePathKey("wiki/topics/foo.md")).length, 2);
  });

  it("groups equivalent normalized missing targets under one stable warning", () => {
    const tempRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "llm-wiki-groups-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "wiki", "topics"), { recursive: true });
      fs.writeFileSync(
        path.join(tempRoot, "wiki", "topics", "source.md"),
        "[[missing]] and [[./missing]]\n",
        "utf8"
      );

      const scan = scanKnowledgeBaseLinks(tempRoot, "lint");
      const brokenGroups = scan.groups.filter((group) => group.code === "broken_wikilink");
      assert.equal(brokenGroups.length, 1);
      assert.equal(brokenGroups[0].target_key, "missing");
      assert.equal(brokenGroups[0].occurrence_count, 2);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("validatePortableMarkdownFilename", () => {
  it("enforces reserved names, illegal characters, portable collisions, and transit renames while allowing Chinese and spaces", () => {
    const inventory = inventoryForFixture();
    const collisionInventory = inventory.targets.concat([
      {
        path: "wiki/topics/cafe\u0301.md",
        absolutePath: "/tmp/cafe-nfd.md",
        kind: "markdown",
        editable: true,
        graphType: "topic"
      },
      {
        path: "wiki/topics/ALPHA.md",
        absolutePath: "/tmp/alpha-upper.md",
        kind: "markdown",
        editable: true,
        graphType: "topic"
      }
    ]);

    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "CON", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", ".md", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", " leading", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "bad#name", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "bad.", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "bad ", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "café.md", collisionInventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "alpha.md", collisionInventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "中文 页面.md", inventory).ok, true);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "with space.md", inventory).ok, true);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "FOO.md", inventory).requires_transit, true);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "bad\u007fname", inventory).ok, false);
    assert.equal(validatePortableMarkdownFilename("wiki/topics/foo.md", "bad\u0085name", inventory).ok, false);
    assert.equal(
      validatePortableMarkdownFilename("wiki/topics/foo.md", "Bar.MD", inventory).normalized_name,
      "Bar.md"
    );
  });
});
