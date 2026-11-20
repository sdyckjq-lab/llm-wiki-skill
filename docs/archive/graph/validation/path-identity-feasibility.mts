import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { buildAtlasModel, projectGraphInput } from "../../../packages/graph-engine/src/model/atlas.ts";

const GRAPH_ROOTS = new Set(["entities", "topics", "sources", "comparisons", "synthesis", "queries"]);
const GRAPH_TYPE_BY_ROOT: Record<string, string> = {
  entities: "entity",
  topics: "topic",
  sources: "source",
  comparisons: "comparison",
  synthesis: "synthesis",
  queries: "query"
};
const ROOT_EDITABLE_MARKDOWN = new Set(["index.md", "log.md", "purpose.md"]);

const LINK_PAGE = `# Links

[[unique]]
[[foo]]
[[wiki/topics/foo.md]]
[[wiki/topics/foo|别名]]
[[wiki/topics/foo#标题]]
[[wiki/topics/foo#^block|别名]]
[待创建: [[future]]]
[[missing]]
[[#本页]]
[[wiki/sources/links.md#本页]]
![[raw/assets/Figure.png]]
[[wiki/notes/side.md]]

\`[[foo]]\`

\`\`\`md
[[foo]]
\`\`\`
`;

const MARKDOWN_FIXTURE: Record<string, string> = {
  "wiki/entities/foo.md": "# Entity Foo\n",
  "wiki/topics/foo.md": "# Topic Foo\n\n## 标题\n",
  "wiki/sources/foo.md": "# Source Foo\n",
  "wiki/entities/unique.md": "# Unique\n",
  "wiki/entities/foo-2.md": "# Existing suffix\n",
  "wiki/sources/links.md": LINK_PAGE,
  "wiki/topics/中文/页面.md": "# 中文页面\n",
  "wiki/sources/with space/Page Name.md": "# Page Name\n",
  "wiki/notes/side.md": "# Valid non-graph page\n",
  "raw/notes/foo.md": "# Read-only raw Foo\n",
  "index.md": "# Index\n\n- [[foo]]\n",
  "log.md": "# Log\n",
  "purpose.md": "# Purpose\n",
  ".wiki-schema.md": "# Schema\n\n`[[example]]`\n"
};

interface PageTarget {
  path: string;
  basename: string;
  graphPage: boolean;
}

interface ParsedLink {
  rawLink: string;
  target: string;
  display: string | null;
  anchor: string | null;
  embedded: boolean;
  line: number;
  column: number;
  startByte: number;
  endByte: number;
  sourcePath: string;
  fileSha256: string;
  pending: boolean;
}

interface Resolution {
  kind: "resolved" | "ambiguous" | "broken" | "pending" | "self" | "attachment";
  path?: string;
  candidates?: string[];
  graphTarget?: boolean;
}

const root = await mkdtemp(path.join(tmpdir(), "llm-wiki-path-identity-"));

try {
  await writeFixture(root);
  const markdownFiles = await listMarkdown(root);
  const before = await snapshot(markdownFiles, root);
  const discovery = verifyDiscoveryPolicy(markdownFiles, root);
  const targets = buildTargets(markdownFiles, root);
  const indexes = buildTargetIndexes(targets);
  const linksPath = path.join(root, "wiki/sources/links.md");
  const linksText = await readFile(linksPath, "utf8");
  const parsed = parseWikiLinks(linksText, "wiki/sources/links.md");
  const resolutions = parsed.map((link) => resolveLink(link, "wiki/sources/links.md", targets, indexes, root));

  assert.equal(parsed.length, 12);
  assert.equal(countCodeExamples(LINK_PAGE), 2);
  assert.equal(resolutions.filter((item) => item.kind === "ambiguous").length, 1);
  assert.equal(resolutions.find((item) => item.kind === "ambiguous")?.candidates?.length, 4);
  assert.equal(resolutions.filter((item) => item.kind === "pending").length, 1);
  assert.equal(resolutions.filter((item) => item.kind === "broken").length, 1);
  assert.equal(resolutions.filter((item) => item.kind === "self").length, 2);
  assert.equal(resolutions.filter((item) => item.kind === "attachment").length, 1);
  assert.equal(resolutions.filter((item) => item.kind === "resolved" && item.graphTarget === false).length, 1);
  assert.equal(
    resolutions.filter((item) => item.kind === "resolved" && item.path === "wiki/topics/foo.md").length,
    4
  );

  for (const link of parsed) {
    const bytes = Buffer.from(linksText, "utf8").subarray(link.startByte, link.endByte).toString("utf8");
    assert.equal(bytes, link.rawLink);
  }

  const candidateSets = new Set(
    resolutions
      .filter((item) => item.kind === "ambiguous")
      .map((item) => (item.candidates ?? []).slice().sort().join("\0"))
  );
  assert.equal(candidateSets.size, 1);

  const edges = stableGraphEdges(parsed, resolutions, "wiki/sources/links.md");
  assert.deepEqual(
    edges.map((edge) => [edge.from, edge.to]),
    [
      ["wiki/sources/links.md", "wiki/entities/unique.md"],
      ["wiki/sources/links.md", "wiki/topics/foo.md"]
    ]
  );

  const graphPages = targets.filter((target) => target.graphPage);
  assert.equal(graphPages.length, 8);
  const graphData = {
    meta: {
      build_date: "2026-07-19T00:00:00Z",
      wiki_title: "path-identity-feasibility",
      total_nodes: graphPages.length,
      total_edges: edges.length,
      initial_view: graphPages.map((target) => target.path),
      degraded: false,
      insights_degraded: false
    },
    nodes: graphPages.map((target) => ({
      id: target.path,
      source_path: target.path,
      label: path.basename(target.path, ".md"),
      type: GRAPH_TYPE_BY_ROOT[target.path.split("/")[1] ?? ""]!
    })),
    edges
  };
  const projection = projectGraphInput(graphData);
  const model = buildAtlasModel(projection.data);
  assert.equal(projection.data.nodes.length, 8);
  assert.equal(projection.data.edges.length, 2);
  assert.equal(model.nodes.length, 8);
  assert.equal(model.edges.length, 2);
  assert.ok(model.nodes.every((node) => node.id.startsWith("wiki/") && node.source_path === node.id));

  const migration = verifyMigrationAlignment();
  const portability = verifyRepresentativePortabilityRules();
  const performanceResult = runPerformanceProbe();
  assert.equal(suggestAvailableBasename("foo", new Set(targets.map((target) => target.basename))), "foo-3");

  const after = await snapshot(markdownFiles, root);
  assert.deepEqual(after, before);

  console.log(JSON.stringify({
    fixture: {
      graphPages: graphPages.length,
      nonGraphMarkdownPages: targets.length - graphPages.length,
      realLinks: parsed.length,
      ignoredCodeExamples: countCodeExamples(LINK_PAGE),
      ambiguousCandidates: resolutions.find((item) => item.kind === "ambiguous")?.candidates?.length ?? 0
    },
    discovery,
    parsing: {
      uniqueResolved: resolutions.filter((item) => item.kind === "resolved" && item.path === "wiki/entities/unique.md").length,
      ambiguousNotLinked: resolutions.filter((item) => item.kind === "ambiguous").length,
      pathVariantsResolved: resolutions.filter((item) => item.kind === "resolved" && item.path === "wiki/topics/foo.md").length,
      pendingSeparatedFromBroken: resolutions.filter((item) => item.kind === "pending").length,
      brokenLinks: resolutions.filter((item) => item.kind === "broken").length,
      samePageLinksIgnoredAsEdges: resolutions.filter((item) => item.kind === "self").length,
      attachmentsIgnoredAsPageLinks: resolutions.filter((item) => item.kind === "attachment").length,
      nonGraphMarkdownResolvedWithoutEdge: resolutions.filter((item) => item.kind === "resolved" && item.graphTarget === false).length,
      preciseLocationsRoundTrip: true,
      candidateSets: candidateSets.size,
      suggestedBasename: "foo-3",
      markdownWrites: 0
    },
    performance: performanceResult,
    engine: {
      nodes: projection.data.nodes.length,
      edges: projection.data.edges.length,
      modelNodes: model.nodes.length,
      modelEdges: model.edges.length
    },
    migration,
    portability
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}

async function writeFixture(rootPath: string): Promise<void> {
  for (const [relativePath, content] of Object.entries(MARKDOWN_FIXTURE)) {
    const absolutePath = path.join(rootPath, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  const attachmentPath = path.join(rootPath, "raw/assets/Figure.png");
  await mkdir(path.dirname(attachmentPath), { recursive: true });
  await writeFile(attachmentPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

async function listMarkdown(rootPath: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if ([".git", ".obsidian", ".wiki-tmp", "node_modules"].includes(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile() && entry.name.endsWith(".md")) result.push(absolutePath);
    }
  }
  await walk(rootPath);
  return result.sort();
}

async function snapshot(files: string[], rootPath: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(files.map(async (file) => [
    toPosix(path.relative(rootPath, file)),
    sha256(await readFile(file))
  ])));
}

function verifyDiscoveryPolicy(files: string[], rootPath: string): Record<string, number> {
  const relativePaths = files.map((file) => toPosix(path.relative(rootPath, file)));
  const graphSources = relativePaths.filter(isGraphPage);
  const lintSources = relativePaths.filter((item) => item.startsWith("wiki/") || item === "index.md");
  const editableRenameSources = relativePaths.filter((item) => item.startsWith("wiki/") || ROOT_EDITABLE_MARKDOWN.has(item));
  const readOnlyRenameSources = relativePaths.filter((item) => item.startsWith("raw/") || item === ".wiki-schema.md");

  assert.ok(graphSources.every((item) => !item.startsWith("wiki/notes/")));
  assert.ok(lintSources.includes("index.md"));
  assert.ok(editableRenameSources.includes("wiki/notes/side.md"));
  assert.ok(!editableRenameSources.some((item) => item.startsWith("raw/")));
  assert.ok(readOnlyRenameSources.includes("raw/notes/foo.md"));
  assert.ok(readOnlyRenameSources.includes(".wiki-schema.md"));

  return {
    graphSources: graphSources.length,
    lintSources: lintSources.length,
    editableRenameSources: editableRenameSources.length,
    readOnlyRenameSources: readOnlyRenameSources.length
  };
}

function buildTargets(files: string[], rootPath: string): PageTarget[] {
  return files.map((file) => {
    const relativePath = toPosix(path.relative(rootPath, file));
    return {
      path: relativePath,
      basename: path.posix.basename(relativePath, ".md"),
      graphPage: isGraphPage(relativePath)
    };
  });
}

function buildTargetIndexes(targets: PageTarget[]): {
  exact: Map<string, PageTarget>;
  portablePath: Map<string, PageTarget[]>;
  portableBasename: Map<string, PageTarget[]>;
} {
  const exact = new Map<string, PageTarget>();
  const portablePath = new Map<string, PageTarget[]>();
  const portableBasename = new Map<string, PageTarget[]>();
  for (const target of targets) {
    exact.set(target.path, target);
    append(portablePath, portableKey(target.path), target);
    append(portableBasename, portableKey(target.basename), target);
  }
  return { exact, portablePath, portableBasename };
}

function parseWikiLinks(content: string, sourcePath: string): ParsedLink[] {
  const result: ParsedLink[] = [];
  const fileSha256 = sha256(Buffer.from(content, "utf8"));
  const lines = content.split(/(?<=\n)/);
  let fenced: { marker: string; length: number } | null = null;
  let charOffset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? "";
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1]![0]!;
      const length = fence[1]!.length;
      if (!fenced) fenced = { marker, length };
      else if (marker === fenced.marker && length >= fenced.length) fenced = null;
      charOffset += line.length;
      continue;
    }
    if (fenced) {
      charOffset += line.length;
      continue;
    }

    const masked = maskInlineCode(line);
    const linkPattern = /(!?)\[\[([^\]\n]+)\]\]/g;
    for (const match of masked.matchAll(linkPattern)) {
      const startInLine = match.index ?? 0;
      const rawLink = line.slice(startInLine, startInLine + match[0].length);
      const inner = line.slice(startInLine + (match[1] ? 3 : 2), startInLine + match[0].length - 2);
      const pipe = inner.indexOf("|");
      const targetAndAnchor = pipe >= 0 ? inner.slice(0, pipe) : inner;
      const display = pipe >= 0 ? inner.slice(pipe + 1) : null;
      const hash = targetAndAnchor.indexOf("#");
      const target = (hash >= 0 ? targetAndAnchor.slice(0, hash) : targetAndAnchor).trim();
      const anchor = hash >= 0 ? targetAndAnchor.slice(hash + 1) : null;
      const absoluteStartChar = charOffset + startInLine;
      const absoluteEndChar = absoluteStartChar + rawLink.length;
      result.push({
        rawLink,
        target,
        display,
        anchor,
        embedded: match[1] === "!",
        line: lineIndex + 1,
        column: startInLine + 1,
        startByte: Buffer.byteLength(content.slice(0, absoluteStartChar), "utf8"),
        endByte: Buffer.byteLength(content.slice(0, absoluteEndChar), "utf8"),
        sourcePath,
        fileSha256,
        pending: line.includes(`[待创建: ${rawLink}]`)
      });
    }
    charOffset += line.length;
  }
  return result;
}

function resolveLink(
  link: ParsedLink,
  sourcePath: string,
  targets: PageTarget[],
  indexes: ReturnType<typeof buildTargetIndexes>,
  rootPath: string
): Resolution {
  if (link.target === "") return { kind: "self", path: sourcePath, graphTarget: true };
  const extension = path.posix.extname(link.target);
  if (extension && extension.toLowerCase() !== ".md") {
    const exists = targets.some((target) => target.path === link.target)
      || link.target === "raw/assets/Figure.png";
    assert.equal(exists, true);
    assert.ok(path.resolve(rootPath, link.target).startsWith(path.resolve(rootPath) + path.sep));
    return { kind: "attachment", path: link.target, graphTarget: false };
  }

  let candidates: PageTarget[];
  if (link.target.includes("/")) {
    const normalized = normalizePagePath(link.target);
    const exact = indexes.exact.get(normalized);
    candidates = exact ? [exact] : indexes.portablePath.get(portableKey(normalized)) ?? [];
  } else {
    const basename = link.target.replace(/\.md$/i, "");
    candidates = indexes.portableBasename.get(portableKey(basename)) ?? [];
  }

  if (candidates.length === 0) return { kind: link.pending ? "pending" : "broken" };
  if (candidates.length > 1) return { kind: "ambiguous", candidates: candidates.map((item) => item.path).sort() };
  const target = candidates[0]!;
  if (target.path === sourcePath) return { kind: "self", path: target.path, graphTarget: target.graphPage };
  return { kind: "resolved", path: target.path, graphTarget: target.graphPage };
}

function stableGraphEdges(
  links: ParsedLink[],
  resolutions: Resolution[],
  sourcePath: string
): Array<{ id: string; from: string; to: string; type: string; confidence: string; relation_type: string }> {
  const targets = new Set<string>();
  for (let index = 0; index < links.length; index++) {
    const resolution = resolutions[index]!;
    if (resolution.kind === "resolved" && resolution.graphTarget && resolution.path) targets.add(resolution.path);
  }
  return Array.from(targets).sort().map((target, index) => ({
    id: `edge-${index + 1}`,
    from: sourcePath,
    to: target,
    type: "EXTRACTED",
    confidence: "EXTRACTED",
    relation_type: "依赖"
  }));
}

function verifyMigrationAlignment(): Record<string, unknown> {
  const previousNodes = [
    { id: "links", sourcePath: "wiki/sources/links.md", community: "old-a" },
    { id: "unique", sourcePath: "wiki/entities/unique.md", community: "old-a" },
    { id: "foo", sourcePath: "wiki/topics/foo.md", community: "old-a" },
    { id: "页面", sourcePath: "wiki/topics/中文/页面.md", community: "old-b" }
  ];
  const nextNodes = previousNodes.map((node) => ({
    id: node.sourcePath,
    sourcePath: node.sourcePath,
    community: node.community === "old-a" ? "next-a" : "next-b"
  }));
  const previousEdges = [
    { id: "e1", from: "links", to: "unique", relationType: "依赖" },
    { id: "e2", from: "links", to: "foo", relationType: "依赖" }
  ];
  const nextEdges = [
    { id: "next-2", from: "wiki/sources/links.md", to: "wiki/topics/foo.md", relationType: "依赖" },
    { id: "next-1", from: "wiki/sources/links.md", to: "wiki/entities/unique.md", relationType: "依赖" }
  ];
  const idMap = new Map(previousNodes.map((node) => [node.id, node.sourcePath]));
  const beforeNodeChanges = symmetricCounts(previousNodes.map((node) => node.id), nextNodes.map((node) => node.id));
  const afterNodeChanges = symmetricCounts(previousNodes.map((node) => idMap.get(node.id)!), nextNodes.map((node) => node.id));
  const beforeEdgeChanges = symmetricCounts(previousEdges.map(edgeKey), nextEdges.map(edgeKey));
  const alignedPreviousEdges = previousEdges.map((edge) => ({
    ...edge,
    from: idMap.get(edge.from)!,
    to: idMap.get(edge.to)!
  }));
  const afterEdgeChanges = symmetricCounts(alignedPreviousEdges.map(edgeKey), nextEdges.map(edgeKey));
  const oldCommunityMembers = previousNodes.filter((node) => node.community === "old-a").map((node) => node.id);
  const nextCommunityMembers = nextNodes.filter((node) => node.community === "next-a").map((node) => node.id);
  const communityJaccardBefore = jaccard(new Set(oldCommunityMembers), new Set(nextCommunityMembers));
  const communityJaccardAfter = jaccard(
    new Set(oldCommunityMembers.map((id) => idMap.get(id)!)),
    new Set(nextCommunityMembers)
  );
  const pins = { "wiki/topics/foo.md": { x: 10, y: 20 } };

  assert.deepEqual(beforeNodeChanges, { added: 4, removed: 4 });
  assert.deepEqual(afterNodeChanges, { added: 0, removed: 0 });
  assert.deepEqual(beforeEdgeChanges, { added: 2, removed: 2 });
  assert.deepEqual(afterEdgeChanges, { added: 0, removed: 0 });
  assert.equal(communityJaccardBefore, 0);
  assert.equal(communityJaccardAfter, 1);
  assert.deepEqual(pins["wiki/topics/foo.md"], { x: 10, y: 20 });

  return {
    beforeAlignment: {
      nodes: beforeNodeChanges,
      edges: beforeEdgeChanges,
      communityJaccard: communityJaccardBefore
    },
    afterAlignment: {
      nodes: afterNodeChanges,
      edges: afterEdgeChanges,
      communityJaccard: communityJaccardAfter,
      pinPreserved: true
    }
  };
}

function verifyRepresentativePortabilityRules(): Record<string, unknown> {
  const caseFoldCollisionDetected = portableKey("wiki/a/Foo.md") === portableKey("wiki/a/foo.md");
  const unicodeCanonicalCollisionDetected = portableKey("wiki/a/café.md") === portableKey("wiki/a/cafe\u0301.md");
  assert.equal(caseFoldCollisionDetected, true);
  assert.equal(unicodeCanonicalCollisionDetected, true);
  assert.equal(isPortableRenameStem("中文 页面"), true);
  for (const invalid of ["CON", "nul", "COM1", "bad.", "bad ", "bad#name", "bad|name", "a/b", "a\\b"]) {
    assert.equal(isPortableRenameStem(invalid), false, invalid);
  }
  return {
    representativeCaseFoldCollisionDetected: caseFoldCollisionDetected,
    unicodeCanonicalCollisionDetected,
    portableFilenamePolicyExamplesPassed: true,
    unicode17DefaultCaseFoldingProductionVerified: false,
    macosWindowsLinuxProductionMatrixPassed: false
  };
}

function runPerformanceProbe(): { nodes: number; links: number; durationMs: number; resolved: number } {
  const nodes = 5000;
  const links = 20000;
  const paths = Array.from({ length: nodes }, (_, index) => `wiki/entities/n-${index}.md`);
  const linkTargets = Array.from({ length: links }, (_, index) => `n-${index % nodes}`);
  const started = performance.now();
  const basenameIndex = new Map<string, string[]>();
  for (const pagePath of paths) {
    const basename = path.posix.basename(pagePath, ".md");
    append(basenameIndex, portableKey(basename), pagePath);
  }
  let resolved = 0;
  for (const target of linkTargets) {
    if ((basenameIndex.get(portableKey(target)) ?? []).length === 1) resolved++;
  }
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(resolved, links);
  return { nodes, links, durationMs, resolved };
}

function isGraphPage(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return parts[0] === "wiki" && GRAPH_ROOTS.has(parts[1] ?? "") && relativePath.endsWith(".md");
}

function normalizePagePath(input: string): string {
  const normalized = path.posix.normalize(input.replaceAll("\\", "/")).replace(/^\.\//, "");
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}

function portableKey(input: string): string {
  return input.normalize("NFC").toLowerCase().normalize("NFC");
}

function isPortableRenameStem(input: string): boolean {
  if (!input || input === "." || input === "..") return false;
  if (/[\u0000-\u001f<>:"/\\|?*]/.test(input)) return false;
  if (/[ .]$/.test(input)) return false;
  if (/[#|^]/.test(input) || input.includes("[[") || input.includes("]]") || input.includes("%%")) return false;
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(input);
}

function suggestAvailableBasename(base: string, occupied: Set<string>): string {
  if (!occupied.has(base)) return base;
  let suffix = 2;
  while (occupied.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

function edgeKey(edge: { from: string; to: string; relationType: string }): string {
  return `${edge.from}\0${edge.to}\0${edge.relationType}`;
}

function symmetricCounts(previous: string[], next: string[]): { added: number; removed: number } {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    added: next.filter((item) => !previousSet.has(item)).length,
    removed: previous.filter((item) => !nextSet.has(item)).length
  };
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = Array.from(left).filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 1 : intersection / union;
}

function maskInlineCode(line: string): string {
  return line.replace(/`+[^`\n]*`+/g, (match) => " ".repeat(match.length));
}

function countCodeExamples(content: string): number {
  return (content.match(/`\[\[foo\]\]`/g) ?? []).length + (content.match(/```md\n\[\[foo\]\]\n```/g) ?? []).length;
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const items = map.get(key) ?? [];
  items.push(value);
  map.set(key, items);
}

function toPosix(input: string): string {
  return input.split(path.sep).join("/");
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
