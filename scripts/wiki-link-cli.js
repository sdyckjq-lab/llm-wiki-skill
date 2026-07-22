#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  assembleGraphArtifactPair,
  commitGraphArtifactPair,
  prepareOfflineWarningPayload,
  serializeJsonForHtmlScript,
  verifyGraphArtifactPair
} = require("./lib/graph-warning-bundle");
const { normalizeRelativePosixPath } = require("./lib/wiki-file-discovery");
const { scanKnowledgeBaseLinks, validatePortableMarkdownFilename } = require("./lib/wiki-link-index");
const { renderWikilinkReplacement } = require("./lib/wikilink-parser");

function usage() {
  return [
    "Usage:",
    "  node scripts/wiki-link-cli.js graph <kb-root> <output-dir> [--test-mode]",
    "  node scripts/wiki-link-cli.js commit-pair <kb-root> <graph-input> <warning-groups> <candidate-sets> <graph-path>",
    "  node scripts/wiki-link-cli.js warning-embed <kb-root> <graph-path> <warning-path> <output-path>",
    "  node scripts/wiki-link-cli.js check <kb-root> [--strict] [--json]",
    "  node scripts/wiki-link-cli.js rename-scan <kb-root> <source-path> <new-name>"
  ].join("\n");
}

function sanitizeEntries(entries) {
  return entries.map((item) => ({
    path: item.path,
    kind: item.kind,
    editable: item.editable,
    graphType: item.graphType
  }));
}

function sanitizeInventory(inventory) {
  return {
    graphSources: sanitizeEntries(inventory.graphSources),
    lintSources: sanitizeEntries(inventory.lintSources),
    renameEditableSources: sanitizeEntries(inventory.renameEditableSources),
    renameReadOnlySources: sanitizeEntries(inventory.renameReadOnlySources),
    targets: sanitizeEntries(inventory.targets),
    fileSetSha256: inventory.fileSetSha256
  };
}

function hasStrictErrors(report) {
  return report.groups.some((group) => group.severity === "error");
}

function buildCheckReport(kbRoot, policy) {
  const scan = scanKnowledgeBaseLinks(kbRoot, policy);
  return {
    policy,
    inventory: sanitizeInventory(scan.inventory),
    edges: scan.edges,
    candidate_sets: scan.candidate_sets,
    groups: scan.groups,
    occurrences: scan.occurrences,
    source_metadata: scan.source_documents.map(({ _content, ...document }) => document),
    stale_pending_wrappers: scan.stale_pending_wrappers,
    metrics: scan.metrics
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeGraphScanFiles(kbRoot, outputDir) {
  const scan = scanKnowledgeBaseLinks(kbRoot, "graph");
  fs.mkdirSync(outputDir, { recursive: true });
  const nodes = scan.source_documents
    .filter((document) => document.graph_type)
    .map((document) => ({
      id: document.source_path,
      label: document.label,
      type: document.graph_type,
      source_path: document.source_path,
      _content: document._content,
      _signals: document._signals
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const edges = scan.edges.map((edge, index) => ({
    id: `e${index + 1}`,
    from: edge.from,
    to: edge.to,
    type: edge.confidence,
    confidence: edge.confidence,
    relation_type: edge.relation_type
  }));
  writeJson(path.join(outputDir, "nodes.json"), nodes);
  writeJson(path.join(outputDir, "edges.json"), edges);
  writeJson(path.join(outputDir, "warning-groups.json"), scan.groups);
  writeJson(path.join(outputDir, "candidate-sets.json"), scan.candidate_sets);
  writeJson(path.join(outputDir, "scan-metrics.json"), scan.metrics);
  return { nodes, edges, scan };
}

async function commitPair(args) {
  const graphData = JSON.parse(fs.readFileSync(args.graphInput, "utf8"));
  const groups = JSON.parse(fs.readFileSync(args.warningGroups, "utf8"));
  const candidateSets = JSON.parse(fs.readFileSync(args.candidateSets, "utf8"));
  const kbRootReal = fs.realpathSync.native(args.kbRoot);
  const requestedGraphPath = path.resolve(args.graphPath);
  const graphPath = path.join(
    fs.realpathSync.native(path.dirname(requestedGraphPath)),
    path.basename(requestedGraphPath)
  );
  const warningPath = path.join(path.dirname(graphPath), "graph-warnings.json");
  const detailsRef = path.relative(kbRootReal, warningPath).split(path.sep).join("/");
  const pair = assembleGraphArtifactPair({ graphData, groups, candidateSets, detailsRef });
  await commitGraphArtifactPair({
    kbRoot: kbRootReal,
    graphPath,
    warningPath,
    pair
  });
}

async function writeWarningEmbed(args) {
  const verified = await verifyGraphArtifactPair({
    kbRoot: args.kbRoot,
    graphPath: args.graphPath,
    warningPath: args.warningPath
  });
  let payload;
  let scriptBytes;
  if (verified.status === "available") {
    const prepared = prepareOfflineWarningPayload({
      summary: verified.graphData.meta.warning_summary,
      bundle: verified.warningBundle
    });
    payload = prepared.payload;
    scriptBytes = prepared.scriptBytes;
  } else {
    payload = {
      summary: sanitizeUnavailableSummary(verified.summary),
      details_status: "unavailable",
      details_unavailable_reason: verified.reason,
      warning_details_truncated: false,
      omitted_group_count: 0,
      omitted_candidate_set_count: 0
    };
    scriptBytes = serializeJsonForHtmlScript(payload);
  }
  fs.writeFileSync(args.outputPath, scriptBytes);
}

function sanitizeUnavailableSummary(summary) {
  if (!summary || typeof summary !== "object") return {};
  const safe = {};
  for (const key of ["build_id", "details_sha256"]) {
    if (typeof summary[key] === "string" && /^[a-f0-9]{64}$/.test(summary[key])) {
      safe[key] = summary[key];
    }
  }
  for (const key of ["total_groups", "total_occurrences", "error_occurrences", "warning_occurrences"]) {
    if (Number.isSafeInteger(summary[key]) && summary[key] >= 0) safe[key] = summary[key];
  }
  if (summary.by_code && typeof summary.by_code === "object" && !Array.isArray(summary.by_code)) {
    safe.by_code = Object.fromEntries(
      Object.entries(summary.by_code)
        .filter(([, count]) => Number.isSafeInteger(count) && count >= 0),
    );
  }
  if (typeof summary.details_ref === "string") {
    try {
      const normalized = normalizeRelativePosixPath(summary.details_ref);
      if (normalized === summary.details_ref && path.posix.basename(normalized) === "graph-warnings.json") {
        safe.details_ref = normalized;
      }
    } catch (_) {
      // Never copy an invalid or machine-local path into an offline artifact.
    }
  }
  return safe;
}

function replacementTargetForOccurrence(occurrence, targetPath) {
  return targetPath;
}

function buildRenameScanReport(kbRoot, sourcePath, newName) {
  const scan = scanKnowledgeBaseLinks(kbRoot, "rename");
  const candidateSets = new Map(scan.candidate_sets.map((item) => [item.candidate_set_id, item.candidates]));
  const sourceEntry = scan.inventory.graphSources.find((item) => item.path === sourcePath);
  if (!sourceEntry) {
    throw new Error(`Source is not a formal graph page: ${sourcePath}`);
  }

  const validation = validatePortableMarkdownFilename(sourcePath, newName, scan.inventory.targets);
  if (!validation.ok) {
    throw new Error(`Invalid target name (${validation.reason}): ${newName}`);
  }

  const renameTargetPath = validation.target_path;
  const editable = [];
  const readOnly = [];
  const ambiguous = [];

  for (const occurrence of scan.occurrences) {
    const destination = occurrence.read_only ? readOnly : editable;
    const resolution = occurrence.resolution;

    if (resolution.status === "resolved" && resolution.target_path === sourcePath) {
      destination.push({
        source_path: occurrence.source_path,
        file_sha256: occurrence.file_sha256,
        start_byte: occurrence.start_byte,
        end_byte: occurrence.end_byte,
        raw_link: occurrence.raw_link,
        replacement: renderWikilinkReplacement(
          occurrence,
          replacementTargetForOccurrence(occurrence, renameTargetPath)
        )
      });
      continue;
    }

    const candidatePaths = candidateSets.get(resolution.candidate_set_id) || [];
    if (resolution.status === "ambiguous" && candidatePaths.includes(sourcePath)) {
      const rendered_candidates = candidatePaths.map((candidatePath) => ({
        candidate_path: candidatePath,
        replacement: renderWikilinkReplacement(
          occurrence,
          candidatePath === sourcePath
            ? replacementTargetForOccurrence(occurrence, renameTargetPath)
            : candidatePath
        )
      }));
      ambiguous.push({
        source_path: occurrence.source_path,
        classification: occurrence.read_only ? "read_only" : "editable",
        read_only: occurrence.read_only,
        file_sha256: occurrence.file_sha256,
        start_byte: occurrence.start_byte,
        end_byte: occurrence.end_byte,
        raw_link: occurrence.raw_link,
        candidate_paths: candidatePaths,
        rendered_candidates
      });
    }
  }

  return {
    file_set_sha256: scan.inventory.fileSetSha256,
    source_path: sourcePath,
    target_path: renameTargetPath,
    validation,
    editable_occurrences: editable,
    read_only_occurrences: readOnly,
    ambiguous_occurrences: ambiguous,
    metrics: scan.metrics
  };
}

function assertExactFlags(flags, allowedFlags) {
  const seen = new Set();
  for (const flag of flags) {
    if (!allowedFlags.has(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (seen.has(flag)) {
      throw new Error(`Duplicate argument: ${flag}`);
    }
    seen.add(flag);
  }
  return seen;
}

function parseArguments(command, rest) {
  if (command === "graph") {
    if (rest.length < 2 || rest.length > 3 || rest[0].startsWith("--") || rest[1].startsWith("--")) {
      throw new Error("graph requires <kb-root> <output-dir> [--test-mode]");
    }
    const flags = assertExactFlags(rest.slice(2), new Set(["--test-mode"]));
    return { kbRoot: rest[0], outputDir: rest[1], testMode: flags.has("--test-mode") };
  }

  if (command === "check") {
    if (rest.length < 1 || rest[0].startsWith("--")) {
      throw new Error("check requires <kb-root> [--strict] [--json]");
    }
    const flags = assertExactFlags(rest.slice(1), new Set(["--strict", "--json"]));
    return { kbRoot: rest[0], strict: flags.has("--strict"), json: flags.has("--json") };
  }

  if (command === "commit-pair") {
    if (rest.length !== 5 || rest.some((value) => value.startsWith("--"))) {
      throw new Error("commit-pair requires <kb-root> <graph-input> <warning-groups> <candidate-sets> <graph-path>");
    }
    return {
      kbRoot: rest[0],
      graphInput: rest[1],
      warningGroups: rest[2],
      candidateSets: rest[3],
      graphPath: rest[4]
    };
  }

  if (command === "warning-embed") {
    if (rest.length !== 4 || rest.some((value) => value.startsWith("--"))) {
      throw new Error("warning-embed requires <kb-root> <graph-path> <warning-path> <output-path>");
    }
    return { kbRoot: rest[0], graphPath: rest[1], warningPath: rest[2], outputPath: rest[3] };
  }

  if (command === "rename-scan") {
    if (rest.length !== 3 || rest.some((value) => value.startsWith("--"))) {
      throw new Error("rename-scan requires <kb-root> <source-path> <new-name>");
    }
    return { kbRoot: rest[0], sourcePath: rest[1], newName: rest[2] };
  }

  throw new Error(`Unknown command: ${command}`);
}

async function main(argv) {
  const [command, ...rest] = argv;

  if (!command) {
    console.error(usage());
    return 1;
  }

  try {
    const args = parseArguments(command, rest);
    if (command === "graph") {
      const result = writeGraphScanFiles(args.kbRoot, args.outputDir);
      process.stdout.write(`Graph scan wrote ${result.nodes.length} nodes and ${result.edges.length} edges to ${args.outputDir}\n`);
      return 0;
    }

    if (command === "commit-pair") {
      await commitPair(args);
      process.stdout.write(`Graph artifact pair committed: ${args.graphPath}\n`);
      return 0;
    }

    if (command === "warning-embed") {
      await writeWarningEmbed(args);
      return 0;
    }

    if (command === "check") {
      const report = buildCheckReport(args.kbRoot, "lint");

      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return args.strict && hasStrictErrors(report) ? 2 : 0;
    }

    if (command === "rename-scan") {
      const report = buildRenameScanReport(args.kbRoot, args.sourcePath, args.newName);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return 0;
    }
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  }
);
