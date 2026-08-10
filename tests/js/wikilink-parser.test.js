const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const {
  parseWikilinks,
  renderWikilinkReplacement
} = require("../../scripts/lib/wikilink-parser");

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "graph-path-identity-wiki");
const SOURCE_PATH = "wiki/sources/links.md";
const SOURCE_BUFFER = fs.readFileSync(path.join(FIXTURE_ROOT, SOURCE_PATH));

function findOccurrence(occurrences, rawLink) {
  const occurrence = occurrences.find((item) => item.raw_link === rawLink);
  assert.ok(occurrence, `expected occurrence for ${rawLink}`);
  return occurrence;
}

describe("parseWikilinks", () => {
  it("returns byte-accurate occurrences for every real link", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);

    assert.equal(parsed.source_path, SOURCE_PATH);
    assert.equal(parsed.occurrences.length, 20);

    for (const occurrence of parsed.occurrences) {
      const slice = SOURCE_BUFFER.subarray(occurrence.start_byte, occurrence.end_byte).toString("utf8");
      assert.equal(slice, occurrence.raw_link);
      assert.ok(occurrence.line >= 1);
      assert.ok(occurrence.column >= 1);
    }
  });

  it("keeps alias and anchor metadata separate from the page target", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    const aliasLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo|别名]]");
    const headingLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo#标题]]");
    const blockAliasLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo#^block|别名]]");

    assert.equal(aliasLink.page_target, "wiki/topics/foo");
    assert.equal(aliasLink.display, "别名");
    assert.equal(aliasLink.anchor, null);

    assert.equal(headingLink.page_target, "wiki/topics/foo");
    assert.equal(headingLink.anchor, "标题");

    assert.equal(blockAliasLink.page_target, "wiki/topics/foo");
    assert.equal(blockAliasLink.anchor, "^block");
    assert.equal(blockAliasLink.display, "别名");
  });

  it("treats a table-escaped pipe as the alias separator", () => {
    const source = Buffer.from([
      "| [[wiki/topics/foo\\|别名]] | [[wiki/topics/foo#标题\\|锚点别名]] |",
      "[[keeps\\backslash]]",
      ""
    ].join("\n"), "utf8");

    const parsed = parseWikilinks(source, "wiki/topics/table.md");
    const aliasLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo\\|别名]]");
    const anchorAliasLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo#标题\\|锚点别名]]");
    const literalBackslash = findOccurrence(parsed.occurrences, "[[keeps\\backslash]]");

    assert.equal(aliasLink.page_target, "wiki/topics/foo");
    assert.equal(aliasLink.display, "别名");
    assert.equal(aliasLink.anchor, null);

    assert.equal(anchorAliasLink.page_target, "wiki/topics/foo");
    assert.equal(anchorAliasLink.anchor, "标题");
    assert.equal(anchorAliasLink.display, "锚点别名");

    // A backslash that is not escaping the alias pipe stays part of the target.
    assert.equal(literalBackslash.page_target, "keeps\\backslash");
  });

  it("distinguishes same-page anchors, explicit self links, and embeds", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    const samePage = findOccurrence(parsed.occurrences, "[[#本页]]");
    const selfLink = findOccurrence(parsed.occurrences, "[[wiki/sources/links.md]]");
    const embed = findOccurrence(parsed.occurrences, "![[raw/assets/Figure.png]]");

    assert.equal(samePage.link_kind, "same_page_anchor");
    assert.equal(selfLink.link_kind, "page_wikilink");
    assert.equal(embed.link_kind, "attachment_wikilink");
    assert.equal(embed.embedded, true);
  });

  it("marks only the exact pending wrappers as pending", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    assert.equal(findOccurrence(parsed.occurrences, "[待创建: [[future]]]").pending, true);
    assert.equal(findOccurrence(parsed.occurrences, "[待创建: [[planned-zh]]]").pending, true);
    assert.equal(findOccurrence(parsed.occurrences, "[To create: [[planned-en]]]").pending, true);

    const arbitrary = parseWikilinks(Buffer.from("[待创建? [[fake]]] [To create? [[fake-two]]]\n", "utf8"), "wiki/tmp.md");
    assert.equal(findOccurrence(arbitrary.occurrences, "[[fake]]").pending, false);
    assert.equal(findOccurrence(arbitrary.occurrences, "[[fake-two]]").pending, false);
  });

  it("ignores fenced and inline code examples", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    const plainFooLinks = parsed.occurrences.filter((item) => item.raw_link === "[[foo]]");
    assert.equal(plainFooLinks.length, 1);
  });

  it("requires valid fence closers and equal-length inline code delimiters", () => {
    const source = Buffer.from([
      "```js",
      "[[hidden-in-fence]]",
      "``` trailing prose is not a closer",
      "[[still-hidden-in-fence]]",
      "```",
      "[[visible-after-fence]]",
      "`` code ``` [[still-inline-code]] `` [[visible-after-inline]]",
      "``",
      "[[hidden-in-multiline-inline]]",
      "``",
      "[[visible-after-multiline-inline]]",
      ""
    ].join("\n"), "utf8");

    const parsed = parseWikilinks(source, "wiki/topics/code-boundaries.md");
    assert.deepEqual(parsed.occurrences.map((item) => item.raw_link), [
      "[[visible-after-fence]]",
      "[[visible-after-inline]]",
      "[[visible-after-multiline-inline]]"
    ]);
  });

  it("treats unmatched single and multi-backtick runs as text across lines", () => {
    const source = Buffer.from([
      "unmatched single ` delimiter",
      "[[visible-after-single]]",
      "unmatched double `` delimiter",
      "[[visible-after-double]]",
      ""
    ].join("\n"), "utf8");

    const parsed = parseWikilinks(source, "wiki/topics/unmatched-code.md");
    assert.deepEqual(parsed.occurrences.map((item) => item.raw_link), [
      "[[visible-after-single]]",
      "[[visible-after-double]]"
    ]);
    for (const occurrence of parsed.occurrences) {
      assert.equal(
        source.subarray(occurrence.start_byte, occurrence.end_byte).toString("utf8"),
        occurrence.raw_link
      );
    }
  });

  it("reports linear UTF-8 position progress for a representative link-heavy file", () => {
    const source = Buffer.from("中文🙂 [[target]] tail\n".repeat(2000), "utf8");
    const parsed = parseWikilinks(source, "wiki/topics/performance.md");

    assert.equal(parsed.occurrences.length, 2000);
    assert.equal(parsed.metrics.utf8_bytes_scanned, source.length);
    assert.equal(parsed.metrics.position_bytes_advanced, source.length);
    const last = parsed.occurrences.at(-1);
    assert.equal(source.subarray(last.start_byte, last.end_byte).toString("utf8"), "[[target]]");
  });

  it("tracks distinct byte ranges for two links on one line", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    const lineMatches = parsed.occurrences.filter(
      (item) => item.line === 21
    );
    assert.equal(lineMatches.length, 2);
    assert.equal(lineMatches[0].line, lineMatches[1].line);
    assert.notEqual(lineMatches[0].start_byte, lineMatches[1].start_byte);
    assert.notEqual(lineMatches[0].end_byte, lineMatches[1].end_byte);
  });
});

describe("renderWikilinkReplacement", () => {
  it("changes only the page target segment", () => {
    const parsed = parseWikilinks(SOURCE_BUFFER, SOURCE_PATH);
    const blockAliasLink = findOccurrence(parsed.occurrences, "[[wiki/topics/foo#^block|别名]]");
    const pendingLink = findOccurrence(parsed.occurrences, "[待创建: [[planned-zh]]]");
    const embedLink = findOccurrence(parsed.occurrences, "![[raw/assets/Figure.png]]");
    const spaced = parseWikilinks(Buffer.from("[[  wiki/topics/foo  | 别名 ]]\n", "utf8"), "wiki/tmp.md").occurrences[0];

    assert.equal(
      renderWikilinkReplacement(blockAliasLink, "wiki/topics/foo-renamed.md"),
      "[[wiki/topics/foo-renamed.md#^block|别名]]"
    );
    assert.equal(
      renderWikilinkReplacement(pendingLink, "planned-zh-renamed"),
      "[待创建: [[planned-zh-renamed]]]"
    );
    assert.equal(
      renderWikilinkReplacement(embedLink, "raw/assets/Figure-2.png"),
      "![[raw/assets/Figure-2.png]]"
    );
    assert.equal(
      renderWikilinkReplacement(spaced, "wiki/topics/bar"),
      "[[  wiki/topics/bar  | 别名 ]]"
    );

    // Renaming a table-escaped link must keep the `\|` escape intact,
    // otherwise the rewritten link breaks the surrounding markdown table.
    const tableAlias = parseWikilinks(
      Buffer.from("[[wiki/topics/foo\\|别名]]\n", "utf8"),
      "wiki/tmp.md"
    ).occurrences[0];
    assert.equal(
      renderWikilinkReplacement(tableAlias, "wiki/topics/bar"),
      "[[wiki/topics/bar\\|别名]]"
    );
  });
});
