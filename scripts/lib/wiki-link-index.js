#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { loadUnicode17CaseFolder } = require("./unicode-case-folding");
const {
  validateGraphRenameFilenameSyntax
} = require("../../packages/workbench-contracts/src/graph-rename-filename.js");
const {
  discoverKnowledgeBaseFiles,
  normalizeRelativePosixPath
} = require("./wiki-file-discovery");
const { extractFrontmatter, parseSourcesFrontmatter } = require("./source-signal-eligibility");
const { parseWikilinks, renderWikilinkReplacement } = require("./wikilink-parser");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function stableId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 16)}`;
}

function portablePathKey(pathValue, fold = loadUnicode17CaseFolder()) {
  return fold(normalizeRelativePosixPath(pathValue));
}

function buildWikiTargetIndex(inventory) {
  const exactPaths = new Map();
  const portablePaths = new Map();
  const portableBasenames = new Map();

  for (const item of inventory) {
    exactPaths.set(item.path, item);

    const pathKey = portablePathKey(item.path);
    const pathItems = portablePaths.get(pathKey) || [];
    pathItems.push(item);
    portablePaths.set(pathKey, pathItems);

    if (item.kind === "markdown") {
      const basenameKey = portablePathKey(path.posix.basename(item.path, ".md"));
      const basenameItems = portableBasenames.get(basenameKey) || [];
      basenameItems.push(item);
      portableBasenames.set(basenameKey, basenameItems);
    }
  }

  const portableCollisions = Array.from(portablePaths.values())
    .filter((items) => items.length > 1)
    .map((items) => {
      const candidates = items.map((item) => item.path).sort();
      return {
        collision_id: stableId("portable-collision", candidates.join("\n")),
        candidate_set_id: stableId("candidate-set", candidates.join("\n")),
        candidates
      };
    })
    .sort((left, right) => left.candidates.join("\n").localeCompare(right.candidates.join("\n"), "en"));

  return { exactPaths, portablePaths, portableBasenames, portableCollisions };
}

function normalizeExplicitTarget(target) {
  const normalized = normalizeRelativePosixPath(target);
  const extension = path.posix.extname(normalized);
  if (!extension) {
    return `${normalized}.md`;
  }
  return normalized;
}

function warningSeverity(code) {
  if (code === "pending_wikilink" || code === "noncanonical_wikilink") {
    return "warning";
  }
  return "error";
}

function resolveWikilink(occurrence, sourcePath, index) {
  if (occurrence.link_kind === "same_page_anchor") {
    return {
      status: "resolved",
      target_path: sourcePath,
      creates_edge: false,
      warning_code: null,
      candidate_paths: [],
      target_key: sourcePath
    };
  }

  const rawTarget = occurrence.page_target;
  const explicitPath = rawTarget.includes("/") || occurrence.link_kind === "attachment_wikilink" || rawTarget.endsWith(".md");
  const targetKey = rawTarget ? normalizeRelativePosixPath(rawTarget) : sourcePath;

  let candidates = [];
  let warningCode = null;

  if (explicitPath) {
    const normalizedTarget = normalizeExplicitTarget(rawTarget);
    const exactMatch = index.exactPaths.get(normalizedTarget);
    if (exactMatch) {
      candidates = [exactMatch];
    } else {
      candidates = index.portablePaths.get(portablePathKey(normalizedTarget)) || [];
      if (candidates.length === 1) {
        warningCode = "noncanonical_wikilink";
      }
    }
  } else {
    const basename = rawTarget.replace(/\.md$/i, "");
    candidates = index.portableBasenames.get(portablePathKey(basename)) || [];
  }

  if (candidates.length === 0) {
    return {
      status: "missing",
      target_path: null,
      creates_edge: false,
      warning_code: occurrence.pending ? "pending_wikilink" : (occurrence.link_kind === "attachment_wikilink" ? null : "broken_wikilink"),
      candidate_paths: [],
      target_key: targetKey
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      target_path: null,
      creates_edge: false,
      warning_code: "ambiguous_wikilink",
      candidate_paths: candidates.map((item) => item.path).sort(),
      target_key: targetKey
    };
  }

  const [target] = candidates;
  const createsEdge = Boolean(
    target.kind === "markdown"
    && target.graphType
    && target.path !== sourcePath
    && occurrence.link_kind !== "attachment_wikilink"
  );

  return {
    status: "resolved",
    target_path: target.path,
    creates_edge: createsEdge,
    warning_code: warningCode,
    candidate_paths: [],
    target_key: targetKey
  };
}

function warningMessage(code, targetKey) {
  switch (code) {
    case "ambiguous_wikilink":
      return `Ambiguous wikilink: ${targetKey}`;
    case "broken_wikilink":
      return `Broken wikilink: ${targetKey}`;
    case "pending_wikilink":
      return `Pending wikilink: ${targetKey}`;
    case "noncanonical_wikilink":
      return `Noncanonical wikilink: ${targetKey}`;
    case "portable_path_collision":
      return "Portable path collision";
    default:
      return code;
  }
}

function addWarningGroup(groupMap, candidateSetMap, code, resolution, occurrenceRecord) {
  const candidatePaths = resolution.candidate_paths || [];
  const candidateSetId = candidatePaths.length > 0
    ? stableId("candidate-set", candidatePaths.join("\n"))
    : null;

  if (candidateSetId && !candidateSetMap.has(candidateSetId)) {
    candidateSetMap.set(candidateSetId, {
      candidate_set_id: candidateSetId,
      candidate_count: candidatePaths.length,
      candidates: candidatePaths
    });
  }

  const warningKey = `${code}\0${resolution.target_key || ""}\0${candidateSetId || ""}`;
  const warningId = stableId("warning", warningKey);
  if (!groupMap.has(warningId)) {
    groupMap.set(warningId, {
      warning_id: warningId,
      code,
      severity: warningSeverity(code),
      message: warningMessage(code, resolution.target_key || ""),
      target_key: resolution.target_key || undefined,
      candidate_set_id: candidateSetId || undefined,
      occurrence_count: 0,
      occurrences: []
    });
  }

  const group = groupMap.get(warningId);
  group.occurrence_count += 1;
  group.occurrences.push(occurrenceRecord);
}

function scanPolicySources(inventory, policy) {
  if (policy === "graph") return inventory.graphSources;
  if (policy === "lint") return inventory.lintSources;
  if (policy === "rename") {
    return inventory.renameEditableSources.concat(inventory.renameReadOnlySources)
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
  }
  throw new Error(`Unknown scan policy: ${policy}`);
}

function parseImagePaths(frontmatter) {
  if (!frontmatter) return [];
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^image_paths:\s*(.*)$/);
    if (!match) continue;
    const inline = match[1].trim();
    if (inline) {
      if (inline === "[]") return [];
      if (!inline.startsWith("[") || !inline.endsWith("]")) return [];
      return inline.slice(1, -1).split(",")
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
    const values = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (!lines[cursor].trim()) continue;
      const item = lines[cursor].match(/^\s*-\s*(.+?)\s*$/);
      if (!item) break;
      values.push(item[1].trim().replace(/^['"]|['"]$/g, ""));
    }
    return values.filter(Boolean);
  }
  return [];
}

function scanKnowledgeBaseLinks(kbRoot, policy) {
  const inventory = discoverKnowledgeBaseFiles(kbRoot);
  const index = buildWikiTargetIndex(inventory.targets);
  const sources = scanPolicySources(inventory, policy);
  const candidateSetMap = new Map();
  const groupMap = new Map();
  const occurrences = [];
  const edges = [];
  const sourceDocuments = [];
  const stalePendingWrappers = [];
  const edgeByEndpoints = new Map();
  const metrics = {
    inventory_walks: 1,
    target_index_builds: 1,
    source_files_parsed: 0,
    files_read: 0,
    files_parsed: 0,
    graph_source_bytes: 0,
    utf8_bytes_scanned: 0,
    position_bytes_advanced: 0
  };

  for (const collision of index.portableCollisions) {
    candidateSetMap.set(collision.candidate_set_id, {
      candidate_set_id: collision.candidate_set_id,
      candidate_count: collision.candidates.length,
      candidates: collision.candidates
    });
    groupMap.set(collision.collision_id, {
      warning_id: collision.collision_id,
      code: "portable_path_collision",
      severity: "error",
      message: "Portable path collision",
      id: collision.collision_id,
      candidate_set_id: collision.candidate_set_id,
      occurrence_count: 0,
      occurrences: []
    });
  }

  for (const source of sources) {
    const buffer = fs.readFileSync(source.absolutePath);
    const rawContent = buffer.toString("utf8");
    const frontmatter = extractFrontmatter(rawContent);
    const parsedSources = parseSourcesFrontmatter(frontmatter.frontmatter);
    const heading = frontmatter.body.match(/^#\s+(.+?)\s*$/m);
    sourceDocuments.push({
      source_path: source.path,
      graph_type: source.graphType,
      label: heading ? heading[1].trim() : path.posix.basename(source.path, ".md"),
      _content: rawContent,
      _signals: {
        sources: parsedSources.sources,
        sourceSignalAvailable: parsedSources.signalAvailable,
        sourceFieldPresent: parsedSources.hasField,
        sourceFieldParsed: parsedSources.parsed,
        imagePaths: parseImagePaths(frontmatter.frontmatter)
      }
    });
    metrics.files_read += 1;
    metrics.files_parsed += 1;
    metrics.source_files_parsed += 1;
    if (source.graphType) metrics.graph_source_bytes += buffer.length;

    const parsed = parseWikilinks(buffer, source.path);
    metrics.utf8_bytes_scanned += parsed.metrics.utf8_bytes_scanned;
    metrics.position_bytes_advanced += parsed.metrics.position_bytes_advanced;
    for (const occurrence of parsed.occurrences) {
      const resolution = resolveWikilink(occurrence, source.path, index);
      const resolutionCandidateSetId = resolution.candidate_paths.length > 0
        ? stableId("candidate-set", resolution.candidate_paths.join("\n"))
        : null;
      const occurrenceRecord = {
        occurrence_id: stableId(
          "occurrence",
          `${occurrence.source_path}\0${occurrence.file_sha256}\0${occurrence.start_byte}\0${occurrence.end_byte}\0${occurrence.raw_link}`
        ),
        source_path: occurrence.source_path,
        line: occurrence.line,
        column: occurrence.column,
        start_byte: occurrence.start_byte,
        end_byte: occurrence.end_byte,
        raw_link: occurrence.raw_link,
        file_sha256: occurrence.file_sha256,
        link_kind: occurrence.link_kind,
        read_only: source.editable === false
      };

      occurrences.push({
        ...occurrence,
        read_only: source.editable === false,
        resolution: {
          ...resolution,
          candidate_paths: undefined,
          candidate_set_id: resolutionCandidateSetId || undefined
        }
      });

      if (occurrence.pending && resolution.status === "resolved") {
        stalePendingWrappers.push({
          source_path: source.path,
          raw_link: occurrence.raw_link,
          replacement: renderWikilinkReplacement(occurrence, occurrence.page_target)
        });
      } else if (resolution.warning_code) {
        addWarningGroup(groupMap, candidateSetMap, resolution.warning_code, resolution, occurrenceRecord);
      }

      if (resolution.creates_edge && resolution.target_path) {
        const edgeKey = `${source.path}\0${resolution.target_path}`;
        if (!edgeByEndpoints.has(edgeKey)) {
          const edge = {
            from: source.path,
            to: resolution.target_path,
            relation_type: occurrence.relation_type || "依赖",
            confidence: occurrence.confidence || "EXTRACTED",
            _relation_explicit: Boolean(occurrence.relation_type),
            _confidence_explicit: Boolean(occurrence.confidence)
          };
          edgeByEndpoints.set(edgeKey, edge);
          edges.push(edge);
        } else {
          const edge = edgeByEndpoints.get(edgeKey);
          if (!edge._confidence_explicit && occurrence.confidence) {
            edge.confidence = occurrence.confidence;
            edge._confidence_explicit = true;
          }
          if (!edge._relation_explicit && occurrence.relation_type) {
            edge.relation_type = occurrence.relation_type;
            edge._relation_explicit = true;
          }
        }
      }
    }
  }

  const candidate_sets = Array.from(candidateSetMap.values())
    .sort((left, right) => left.candidate_set_id.localeCompare(right.candidate_set_id, "en"));
  const groups = Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      occurrences: group.occurrences.slice().sort((left, right) => {
        if (left.source_path !== right.source_path) {
          return left.source_path.localeCompare(right.source_path, "en");
        }
        return left.start_byte - right.start_byte;
      })
    }))
    .sort((left, right) => left.warning_id.localeCompare(right.warning_id, "en"));

  edges.sort((left, right) => {
    const leftKey = `${left.from}\0${left.to}\0${left.relation_type}`;
    const rightKey = `${right.from}\0${right.to}\0${right.relation_type}`;
    return leftKey.localeCompare(rightKey, "en");
  });
  for (const edge of edges) {
    delete edge._confidence_explicit;
    delete edge._relation_explicit;
  }

  stalePendingWrappers.sort((left, right) => left.source_path.localeCompare(right.source_path, "en"));

  return {
    inventory,
    edges,
    candidate_sets,
    groups,
    occurrences: policy === "graph" ? [] : occurrences,
    source_documents: sourceDocuments,
    stale_pending_wrappers: stalePendingWrappers,
    metrics
  };
}

function validatePortableMarkdownFilename(sourcePath, newName, inventoryOrTargets) {
  const targets = Array.isArray(inventoryOrTargets)
    ? inventoryOrTargets
    : inventoryOrTargets.targets;
  const syntax = validateGraphRenameFilenameSyntax(String(newName ?? ""));
  if (!syntax.ok) return syntax;
  const normalizedName = syntax.normalized_name;

  const sourceDir = path.posix.dirname(sourcePath);
  const targetPath = sourceDir === "." ? normalizedName : `${sourceDir}/${normalizedName}`;
  const targetPortableKey = portablePathKey(targetPath);
  const collisions = targets
    .filter((item) => item.path !== sourcePath && portablePathKey(item.path) === targetPortableKey)
    .map((item) => item.path)
    .sort();

  if (collisions.length > 0) {
    return { ok: false, reason: "portable_path_collision", collision_paths: collisions };
  }

  return {
    ok: true,
    normalized_name: normalizedName,
    target_path: targetPath,
    requires_transit: portablePathKey(sourcePath) === targetPortableKey && sourcePath !== targetPath
  };
}

module.exports = {
  buildWikiTargetIndex,
  portablePathKey,
  resolveWikilink,
  scanKnowledgeBaseLinks,
  validatePortableMarkdownFilename
};
