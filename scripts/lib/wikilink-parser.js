#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function countCodePoints(value) {
  return Array.from(value).length;
}

function extractLineAnnotations(lineText) {
  const confidenceMatch = lineText.match(/<!--\s*confidence:\s*([A-Z]+)\s*-->/);
  const relationTypeMatch = lineText.match(/<!--\s*relation(?:_type)?:\s*([^>]+?)\s*-->/);

  return {
    confidence: confidenceMatch ? confidenceMatch[1] : null,
    relation_type: relationTypeMatch ? relationTypeMatch[1].trim() : null
  };
}

function parseFenceCandidate(lineText) {
  const match = lineText.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  return {
    marker: match[2][0],
    length: match[2].length,
    rest: match[3]
  };
}

function collectInlineBacktickRuns(text) {
  const positionsByLength = new Map();
  let fence = null;
  let lineStartIndex = 0;

  while (lineStartIndex <= text.length) {
    const nextNewlineIndex = text.indexOf("\n", lineStartIndex);
    const lineEndIndex = nextNewlineIndex === -1 ? text.length : nextNewlineIndex;
    const lineText = text.slice(lineStartIndex, lineEndIndex);
    const fenceCandidate = parseFenceCandidate(lineText);
    let handledAsFence = false;

    if (fence) {
      handledAsFence = true;
      if (
        fenceCandidate
        && fence.marker === fenceCandidate.marker
        && fenceCandidate.length >= fence.length
        && /^[ \t]*$/.test(fenceCandidate.rest)
      ) {
        fence = null;
      }
    } else if (
      fenceCandidate
      && !(fenceCandidate.marker === "`" && fenceCandidate.rest.includes("`"))
    ) {
      fence = { marker: fenceCandidate.marker, length: fenceCandidate.length };
      handledAsFence = true;
    }

    if (!handledAsFence) {
      for (let index = 0; index < lineText.length;) {
        if (lineText[index] !== "`") {
          index += String.fromCodePoint(lineText.codePointAt(index)).length;
          continue;
        }

        let runLength = 1;
        while (lineText[index + runLength] === "`") {
          runLength += 1;
        }
        const positions = positionsByLength.get(runLength) || [];
        positions.push(lineStartIndex + index);
        positionsByLength.set(runLength, positions);
        index += runLength;
      }
    }

    if (nextNewlineIndex === -1) break;
    lineStartIndex = nextNewlineIndex + 1;
  }

  return { positionsByLength, cursorsByLength: new Map() };
}

function consumeInlineBacktickRun(runIndex, runLength, absoluteIndex) {
  const positions = runIndex.positionsByLength.get(runLength) || [];
  let cursor = runIndex.cursorsByLength.get(runLength) || 0;
  while (cursor < positions.length && positions[cursor] <= absoluteIndex) {
    cursor += 1;
  }
  runIndex.cursorsByLength.set(runLength, cursor);
  return cursor < positions.length;
}

function parseOccurrence(rawLink, sourcePath, fileSha256, line, column, startByte, annotations) {
  let innerStart = 0;
  let innerEnd = rawLink.length;
  let embedded = false;
  let pending = false;

  if (rawLink.startsWith("[待创建: [[")) {
    innerStart = "[待创建: [[".length;
    innerEnd = rawLink.length - "]]]".length;
    pending = true;
  } else if (rawLink.startsWith("[To create: [[")) {
    innerStart = "[To create: [[".length;
    innerEnd = rawLink.length - "]]]".length;
    pending = true;
  } else if (rawLink.startsWith("![[")) {
    innerStart = "![[".length;
    innerEnd = rawLink.length - "]]".length;
    embedded = true;
  } else {
    innerStart = "[[".length;
    innerEnd = rawLink.length - "]]".length;
  }

  const inner = rawLink.slice(innerStart, innerEnd);
  // Markdown tables require the alias pipe to be escaped (`[[Page\|alias]]`).
  // The backslash belongs to the separator, not to the page name, so fold it
  // into the separator before splitting; this keeps the target byte range clean
  // and lets renames preserve the escape.
  let pipeIndex = inner.indexOf("|");
  let aliasEscapeLength = 0;
  if (pipeIndex > 0 && inner[pipeIndex - 1] === "\\") {
    aliasEscapeLength = 1;
    pipeIndex -= 1;
  }
  const targetAndAnchorRaw = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner;
  const displayRaw = pipeIndex >= 0 ? inner.slice(pipeIndex + 1 + aliasEscapeLength) : null;
  const anchorIndex = targetAndAnchorRaw.indexOf("#");
  const targetRaw = anchorIndex >= 0 ? targetAndAnchorRaw.slice(0, anchorIndex) : targetAndAnchorRaw;
  const anchor = anchorIndex >= 0 ? targetAndAnchorRaw.slice(anchorIndex + 1).trim() : null;
  const display = displayRaw === null ? null : displayRaw.trim();

  const leadingWhitespace = (targetRaw.match(/^\s*/) || [""])[0].length;
  const trailingWhitespace = (targetRaw.match(/\s*$/) || [""])[0].length;
  const targetStartInRaw = innerStart + leadingWhitespace;
  const targetEndInRaw = innerStart + targetRaw.length - trailingWhitespace;
  const pageTarget = targetRaw.trim();
  const extension = path.posix.extname(pageTarget);

  let linkKind = "page_wikilink";
  if (pageTarget === "" && anchor) {
    linkKind = "same_page_anchor";
  } else if (extension && extension.toLowerCase() !== ".md") {
    linkKind = "attachment_wikilink";
  }

  return {
    occurrence_id: `${sourcePath}\0${fileSha256}\0${startByte}\0${startByte + Buffer.byteLength(rawLink, "utf8")}\0${rawLink}`,
    source_path: sourcePath,
    file_sha256: fileSha256,
    raw_link: rawLink,
    line,
    column,
    start_byte: startByte,
    end_byte: startByte + Buffer.byteLength(rawLink, "utf8"),
    link_kind: linkKind,
    embedded,
    pending,
    page_target: pageTarget,
    anchor,
    display,
    confidence: annotations.confidence,
    relation_type: annotations.relation_type,
    target_start_in_raw: targetStartInRaw,
    target_end_in_raw: targetEndInRaw
  };
}

function parseWikilinks(buffer, sourcePath) {
  const text = buffer.toString("utf8");
  const fileSha256 = sha256(buffer);
  const occurrences = [];
  const inlineBacktickRuns = collectInlineBacktickRuns(text);

  let fence = null;
  let inlineDelimiter = 0;
  let lineNumber = 1;
  let lineStartIndex = 0;
  let positionBytesAdvanced = 0;

  while (lineStartIndex <= text.length) {
    const nextNewlineIndex = text.indexOf("\n", lineStartIndex);
    const lineEndIndex = nextNewlineIndex === -1 ? text.length : nextNewlineIndex;
    const lineText = text.slice(lineStartIndex, lineEndIndex);
    const annotations = extractLineAnnotations(lineText);
    const fenceCandidate = parseFenceCandidate(lineText);
    let handledAsFence = false;

    if (fence) {
      handledAsFence = true;
      if (
        fenceCandidate
        && fence.marker === fenceCandidate.marker
        && fenceCandidate.length >= fence.length
        && /^[ \t]*$/.test(fenceCandidate.rest)
      ) {
        fence = null;
      }
    } else if (
      inlineDelimiter === 0
      && fenceCandidate
      && !(fenceCandidate.marker === "`" && fenceCandidate.rest.includes("`"))
    ) {
      fence = { marker: fenceCandidate.marker, length: fenceCandidate.length };
      handledAsFence = true;
    }

    if (handledAsFence) {
      positionBytesAdvanced += Buffer.byteLength(lineText, "utf8");
    } else {
      let column = 1;

      for (let index = 0; index < lineText.length;) {
        if (lineText[index] === "`") {
          let runLength = 1;
          while (lineText[index + runLength] === "`") {
            runLength += 1;
          }
          const hasEqualLengthCloser = consumeInlineBacktickRun(
            inlineBacktickRuns,
            runLength,
            lineStartIndex + index
          );
          if (inlineDelimiter === 0) {
            if (hasEqualLengthCloser) {
              inlineDelimiter = runLength;
            }
          } else if (runLength === inlineDelimiter) {
            inlineDelimiter = 0;
          }
          index += runLength;
          column += runLength;
          positionBytesAdvanced += runLength;
          continue;
        }

        if (inlineDelimiter > 0) {
          const symbol = String.fromCodePoint(lineText.codePointAt(index));
          const symbolBytes = Buffer.byteLength(symbol, "utf8");
          index += symbol.length;
          column += 1;
          positionBytesAdvanced += symbolBytes;
          continue;
        }

        let rawLink = null;
        let endIndex = null;

        if (lineText.startsWith("[待创建: [[", index) || lineText.startsWith("[To create: [[", index)) {
          const wrapperPrefix = lineText.startsWith("[待创建: [[", index) ? "[待创建: [[" : "[To create: [[";
          const closeInner = lineText.indexOf("]]]", index + wrapperPrefix.length);
          if (closeInner >= 0) {
            rawLink = lineText.slice(index, closeInner + 3);
            endIndex = closeInner + 3;
          }
        } else if (lineText.startsWith("![[", index) || lineText.startsWith("[[", index)) {
          const closeInner = lineText.indexOf("]]", index + 2);
          if (closeInner >= 0) {
            rawLink = lineText.slice(index, closeInner + 2);
            endIndex = closeInner + 2;
          }
        }

        if (rawLink && endIndex !== null) {
          const startByte = positionBytesAdvanced;
          const rawLinkBytes = Buffer.byteLength(rawLink, "utf8");
          occurrences.push(parseOccurrence(rawLink, sourcePath, fileSha256, lineNumber, column, startByte, annotations));
          index = endIndex;
          column += countCodePoints(rawLink);
          positionBytesAdvanced += rawLinkBytes;
          continue;
        }

        const symbol = String.fromCodePoint(lineText.codePointAt(index));
        const symbolBytes = Buffer.byteLength(symbol, "utf8");
        index += symbol.length;
        column += 1;
        positionBytesAdvanced += symbolBytes;
      }
    }

    if (nextNewlineIndex === -1) {
      break;
    }

    lineStartIndex = nextNewlineIndex + 1;
    positionBytesAdvanced += 1;
    lineNumber += 1;
  }

  return {
    source_path: sourcePath,
    file_sha256: fileSha256,
    occurrences,
    metrics: {
      utf8_bytes_scanned: buffer.length,
      position_bytes_advanced: positionBytesAdvanced
    }
  };
}

function renderWikilinkReplacement(occurrence, replacementTarget) {
  return `${occurrence.raw_link.slice(0, occurrence.target_start_in_raw)}${replacementTarget}${occurrence.raw_link.slice(occurrence.target_end_in_raw)}`;
}

module.exports = { parseWikilinks, renderWikilinkReplacement };
