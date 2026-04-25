(function (root) {
  "use strict";

  var LABEL_CJK_WIDTH = 15;
  var LABEL_LATIN_WIDTH = 8.5;
  var LABEL_PADDING = 22;
  var LABEL_MIN_WIDTH = 72;
  var LABEL_MAX_WIDTH = 180;
  var LABEL_ELLIPSIS = "…";
  var LABEL_ELLIPSIS_WIDTH = 8;

  var labelSegmenter =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter("zh", { granularity: "grapheme" })
      : null;

  function isVariationSelector(grapheme) {
    var code = grapheme.codePointAt(0);
    return code >= 0xFE00 && code <= 0xFE0F;
  }

  function isCombiningMark(grapheme) {
    var code = grapheme.codePointAt(0);
    return (code >= 0x0300 && code <= 0x036F)
      || (code >= 0x1AB0 && code <= 0x1AFF)
      || (code >= 0x1DC0 && code <= 0x1DFF)
      || (code >= 0x20D0 && code <= 0x20FF)
      || (code >= 0xFE20 && code <= 0xFE2F);
  }

  function isEmojiModifier(grapheme) {
    var code = grapheme.codePointAt(0);
    return code >= 0x1F3FB && code <= 0x1F3FF;
  }

  function splitLabelGraphemes(label) {
    if (labelSegmenter) {
      return Array.from(labelSegmenter.segment(label), function (s) {
        return s.segment;
      });
    }

    var parts = Array.from(label);
    if (!parts.length) return [];

    var graphemes = [parts[0]];
    for (var i = 1; i < parts.length; i++) {
      var current = parts[i];
      var previous = parts[i - 1];
      if (
        current === "‍"
        || previous === "‍"
        || isVariationSelector(current)
        || isCombiningMark(current)
        || isEmojiModifier(current)
      ) {
        graphemes[graphemes.length - 1] += current;
      } else {
        graphemes.push(current);
      }
    }

    return graphemes;
  }

  function labelCharWidth(grapheme) {
    return /[一-鿿]/.test(grapheme) ? LABEL_CJK_WIDTH : LABEL_LATIN_WIDTH;
  }

  function measureLabelWidth(graphemes) {
    var width = 0;
    for (var i = 0; i < graphemes.length; i++) {
      width += labelCharWidth(graphemes[i]);
    }
    return width;
  }

  function truncateLabel(label, maxWidth) {
    if (!label || typeof label !== "string") {
      return { text: "", truncated: false };
    }

    var graphemes = splitLabelGraphemes(label);
    var totalWidth = measureLabelWidth(graphemes);
    if (totalWidth + LABEL_PADDING <= maxWidth) {
      return { text: label, truncated: false };
    }

    var out = "";
    var width = 0;
    for (var i = 0; i < graphemes.length; i++) {
      var gw = labelCharWidth(graphemes[i]);
      if (width + gw + LABEL_ELLIPSIS_WIDTH + LABEL_PADDING > maxWidth) break;
      out += graphemes[i];
      width += gw;
    }
    return { text: out + LABEL_ELLIPSIS, truncated: true };
  }

  function cardDims(n) {
    var label = n.label || n.id;
    var widthByLabel = measureLabelWidth(splitLabelGraphemes(label));
    var width = Math.max(LABEL_MIN_WIDTH, Math.min(LABEL_MAX_WIDTH, widthByLabel + LABEL_PADDING));
    var height = 36;
    if (n.type === "topic") { height = 40; width += 6; }
    if (n.type === "source") { height = 32; }
    return { w: width, h: height };
  }

  function createSafeStorage(storage, logger) {
    return {
      get: function (key) {
        try { return storage.getItem(key); }
        catch (err) { if (logger) logger("[wiki] storage.get failed:", key, err); return null; }
      },
      set: function (key, value) {
        try { storage.setItem(key, value); }
        catch (err) { if (logger) logger("[wiki] storage.set failed:", key, err); }
      }
    };
  }

  function normalizeStorageSegment(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function hashString(value) {
    var input = String(value == null ? "" : value);
    var hash = 0;
    for (var i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  }

  function getWikiStorageNamespace(meta, pathname) {
    var title = normalizeStorageSegment(meta && meta.wiki_title ? meta.wiki_title : "");
    var basis = typeof pathname === "string" && pathname
      ? pathname
      : (meta && meta.wiki_title) || title || "default";
    return "llm-wiki:" + (title || "default") + ":" + hashString(basis);
  }

  function defaultQueue() {
    return {
      version: 1,
      favorites: [],
      notes: [],
      recentNoteIds: []
    };
  }

  function normalizeQueue(raw) {
    if (!raw || typeof raw !== "object") return defaultQueue();
    var d = defaultQueue();
    var favorites = Array.isArray(raw.favorites) ? raw.favorites : d.favorites;
    var notes = Array.isArray(raw.notes) ? raw.notes : d.notes;
    var recentNoteIds = Array.isArray(raw.recentNoteIds) ? raw.recentNoteIds : d.recentNoteIds;
    var seenFavorites = {};
    var normalizedFavorites = favorites
      .map(function (nodeId) {
        return nodeId == null ? null : String(nodeId);
      })
      .filter(function (nodeId) {
        if (!nodeId || seenFavorites[nodeId]) return false;
        seenFavorites[nodeId] = true;
        return true;
      });
    var normalizedNotes = notes
      .map(function (note) {
        if (!note || typeof note !== "object" || note.id == null || note.node_id == null) return null;
        return {
          id: String(note.id),
          node_id: String(note.node_id),
          label: note.label == null ? String(note.node_id) : String(note.label),
          text: note.text == null ? "" : String(note.text),
          created_at: note.created_at == null ? null : String(note.created_at)
        };
      })
      .filter(function (note) {
        return !!note;
      });
    var noteIdSet = {};
    for (var i = 0; i < normalizedNotes.length; i++) {
      noteIdSet[normalizedNotes[i].id] = true;
    }
    var seenRecent = {};
    var normalizedRecentNoteIds = recentNoteIds
      .map(function (noteId) {
        return noteId == null ? null : String(noteId);
      })
      .filter(function (noteId) {
        if (!noteId || !noteIdSet[noteId] || seenRecent[noteId]) return false;
        seenRecent[noteId] = true;
        return true;
      });
    if (!normalizedRecentNoteIds.length && normalizedNotes.length) {
      normalizedRecentNoteIds = normalizedNotes.map(function (note) {
        return note.id;
      });
    }
    return {
      version: d.version,
      favorites: normalizedFavorites,
      notes: normalizedNotes,
      recentNoteIds: normalizedRecentNoteIds
    };
  }

  function toggleQueueFavorite(queue, nodeId) {
    var safe = normalizeQueue(queue);
    var favoriteNodeId = nodeId == null ? "" : String(nodeId);
    if (!favoriteNodeId) return safe;
    var favorites = safe.favorites.slice();
    var existingIndex = favorites.indexOf(favoriteNodeId);
    if (existingIndex === -1) {
      favorites.unshift(favoriteNodeId);
    } else {
      favorites.splice(existingIndex, 1);
    }
    return {
      version: safe.version,
      favorites: favorites,
      notes: safe.notes.slice(),
      recentNoteIds: safe.recentNoteIds.slice()
    };
  }

  function appendQueueNote(queue, note, limit) {
    var safe = normalizeQueue(queue);
    if (!note || typeof note !== "object" || note.id == null || note.node_id == null) return safe;
    var noteLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 50;
    var normalizedNote = {
      id: String(note.id),
      node_id: String(note.node_id),
      label: note.label == null ? String(note.node_id) : String(note.label),
      text: note.text == null ? "" : String(note.text),
      created_at: note.created_at == null ? null : String(note.created_at)
    };
    var notes = [normalizedNote].concat(safe.notes.filter(function (item) {
      return item.id !== normalizedNote.id;
    })).slice(0, noteLimit);
    var recentNoteIds = [normalizedNote.id].concat(safe.recentNoteIds.filter(function (noteId) {
      return noteId !== normalizedNote.id;
    })).slice(0, Math.min(noteLimit, 12));
    return {
      version: safe.version,
      favorites: safe.favorites.slice(),
      notes: notes,
      recentNoteIds: recentNoteIds
    };
  }

  function summarizeQueue(queue, nodesById, limit) {
    var safe = normalizeQueue(queue);
    var maxItems = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 4;
    var byId = nodesById && typeof nodesById === "object" ? nodesById : {};
    var notesById = {};
    var recentItems = [];
    var i;

    for (i = 0; i < safe.notes.length; i++) {
      notesById[safe.notes[i].id] = safe.notes[i];
    }

    for (i = 0; i < safe.recentNoteIds.length && recentItems.length < maxItems; i++) {
      var note = notesById[safe.recentNoteIds[i]];
      if (!note) continue;
      var noteNode = byId[note.node_id];
      recentItems.push({
        kind: "note",
        node_id: note.node_id,
        label: note.label || (noteNode && (noteNode.label || noteNode.id)) || note.node_id,
        text: note.text || ""
      });
    }

    for (i = 0; i < safe.favorites.length && recentItems.length < maxItems; i++) {
      var favoriteNodeId = safe.favorites[i];
      var favoriteNode = byId[favoriteNodeId];
      recentItems.push({
        kind: "favorite",
        node_id: favoriteNodeId,
        label: favoriteNode && (favoriteNode.label || favoriteNode.id) ? (favoriteNode.label || favoriteNode.id) : favoriteNodeId,
        text: ""
      });
    }

    return {
      favorite_count: safe.favorites.length,
      note_count: safe.notes.length,
      recent_items: recentItems
    };
  }

  function defaultLearning() {
    return {
      version: 1,
      entry: { recommended_start_node_id: null, recommended_start_reason: null, default_mode: "global" },
      views: {
        path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
        community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
        global: { enabled: true, node_ids: [], degraded: false }
      },
      communities: [],
      degraded: { path_to_community: true, community_to_global: true }
    };
  }

  function normalizeLearning(raw) {
    if (!raw || typeof raw !== "object") return defaultLearning();
    var d = defaultLearning();
    function pick(obj, key, fallback) {
      return obj && obj[key] != null ? obj[key] : fallback;
    }
    return {
      version: pick(raw, "version", d.version),
      entry: {
        recommended_start_node_id: pick(raw.entry, "recommended_start_node_id", d.entry.recommended_start_node_id),
        recommended_start_reason: pick(raw.entry, "recommended_start_reason", d.entry.recommended_start_reason),
        default_mode: pick(raw.entry, "default_mode", d.entry.default_mode)
      },
      views: {
        path: {
          enabled: pick(raw.views && raw.views.path, "enabled", d.views.path.enabled),
          start_node_id: pick(raw.views && raw.views.path, "start_node_id", d.views.path.start_node_id),
          node_ids: Array.isArray(raw.views && raw.views.path && raw.views.path.node_ids) ? raw.views.path.node_ids : d.views.path.node_ids,
          degraded: pick(raw.views && raw.views.path, "degraded", d.views.path.degraded)
        },
        community: {
          enabled: pick(raw.views && raw.views.community, "enabled", d.views.community.enabled),
          community_id: pick(raw.views && raw.views.community, "community_id", d.views.community.community_id),
          label: pick(raw.views && raw.views.community, "label", d.views.community.label),
          node_ids: Array.isArray(raw.views && raw.views.community && raw.views.community.node_ids) ? raw.views.community.node_ids : d.views.community.node_ids,
          is_weak: pick(raw.views && raw.views.community, "is_weak", d.views.community.is_weak),
          degraded: pick(raw.views && raw.views.community, "degraded", d.views.community.degraded)
        },
        global: {
          enabled: pick(raw.views && raw.views.global, "enabled", d.views.global.enabled),
          node_ids: Array.isArray(raw.views && raw.views.global && raw.views.global.node_ids) ? raw.views.global.node_ids : d.views.global.node_ids,
          degraded: pick(raw.views && raw.views.global, "degraded", d.views.global.degraded)
        }
      },
      communities: Array.isArray(raw.communities) ? raw.communities : d.communities,
      degraded: {
        path_to_community: pick(raw.degraded, "path_to_community", d.degraded.path_to_community),
        community_to_global: pick(raw.degraded, "community_to_global", d.degraded.community_to_global)
      }
    };
  }

  function resolveInitialMode(learning) {
    return "global";
  }

  function getCommunityNodeIds(nodes, communityId) {
    if (!Array.isArray(nodes) || !communityId) return [];
    return nodes
      .filter(function (node) {
        return node && node.community != null && String(node.community) === String(communityId);
      })
      .map(function (node) {
        return node.id;
      })
      .sort();
  }

  function getVisibleNodeIds(learning, mode) {
    if (!learning || !learning.views) return [];
    var view = learning.views[mode];
    if (!view || !view.enabled) return [];
    return Array.isArray(view.node_ids) ? view.node_ids : [];
  }

  function getVisibleLinks(allLinks, visibleIds) {
    if (!visibleIds || !visibleIds.length) return allLinks;
    var idSet = {};
    for (var i = 0; i < visibleIds.length; i++) idSet[visibleIds[i]] = true;
    return allLinks.filter(function (l) {
      var s = l.source.id || l.source;
      var t = l.target.id || l.target;
      return idSet[s] && idSet[t];
    });
  }

  function buildSearchHaystack(node) {
    return ((node && (node.label || node.id || "")) + "\n" + (((node && node.content) || "").slice(0, 500))).toLowerCase();
  }

  function buildSearchIndex(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map(function (node) {
      return { node: node, haystack: buildSearchHaystack(node) };
    });
  }

  function filterLinksByTypes(allLinks, filters) {
    if (!Array.isArray(allLinks)) return [];
    if (!filters || typeof filters !== "object") return allLinks.slice();
    return allLinks.filter(function (link) {
      var type = link && link.type ? link.type : "EXTRACTED";
      return filters[type] !== false;
    });
  }

  function applySearchToNodeIds(searchIndex, query) {
    if (!Array.isArray(searchIndex)) return [];
    var normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";
    var matches = !normalizedQuery
      ? searchIndex
      : searchIndex.filter(function (entry) {
          return entry && typeof entry.haystack === "string" && entry.haystack.indexOf(normalizedQuery) !== -1;
        });
    return matches
      .map(function (entry) {
        return entry && entry.node ? entry.node.id : null;
      })
      .filter(function (id) {
        return id != null;
      });
  }

  function getLinkEndpointIds(link) {
    return {
      sourceId: link && link.source && link.source.id ? link.source.id : link && link.source,
      targetId: link && link.target && link.target.id ? link.target.id : link && link.target
    };
  }

  function sortNodeIdsByScore(nodeIds, scores, nodesById) {
    return nodeIds.slice().sort(function (left, right) {
      var scoreDiff = (scores[right] || 0) - (scores[left] || 0);
      if (scoreDiff) return scoreDiff;
      var leftDegree = nodesById[left] && Number.isFinite(Number(nodesById[left].degree)) ? Number(nodesById[left].degree) : 0;
      var rightDegree = nodesById[right] && Number.isFinite(Number(nodesById[right].degree)) ? Number(nodesById[right].degree) : 0;
      if (rightDegree !== leftDegree) return rightDegree - leftDegree;
      return String(left).localeCompare(String(right));
    });
  }

  function applyFocusMode(options) {
    var safe = options && typeof options === "object" ? options : {};
    var nodes = Array.isArray(safe.nodes) ? safe.nodes : [];
    var links = Array.isArray(safe.links) ? safe.links : [];
    var nodeIds = Array.isArray(safe.nodeIds) ? safe.nodeIds.slice() : [];
    var mode = safe.mode || "all";
    var anchorNodeId = safe.anchorNodeId != null ? String(safe.anchorNodeId) : null;
    var highConfidenceThreshold = Number.isFinite(Number(safe.highConfidenceThreshold)) ? Number(safe.highConfidenceThreshold) : 0.75;
    var nodesById = {};
    var idSet = {};
    var i;

    for (i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].id != null) nodesById[nodes[i].id] = nodes[i];
    }
    for (i = 0; i < nodeIds.length; i++) idSet[nodeIds[i]] = true;

    if (!nodeIds.length) return { node_ids: [], links: [] };

    var scopedLinks = getVisibleLinks(links, nodeIds);
    if (mode === "all") return { node_ids: nodeIds.slice(), links: scopedLinks };

    if (mode === "high_confidence") {
      var strongLinks = scopedLinks.filter(function (link) {
        var weight = Number(link && link.weight);
        return Number.isFinite(weight) && weight >= highConfidenceThreshold;
      });
      var strongIdSet = {};
      for (i = 0; i < strongLinks.length; i++) {
        var strongEdge = getLinkEndpointIds(strongLinks[i]);
        if (idSet[strongEdge.sourceId]) strongIdSet[strongEdge.sourceId] = true;
        if (idSet[strongEdge.targetId]) strongIdSet[strongEdge.targetId] = true;
      }
      if (anchorNodeId && idSet[anchorNodeId]) strongIdSet[anchorNodeId] = true;
      var strongNodeIds = nodeIds.filter(function (id) {
        return !!strongIdSet[id];
      });
      return { node_ids: strongNodeIds, links: getVisibleLinks(strongLinks, strongNodeIds) };
    }

    if (mode === "one_hop") {
      var hopAnchorNodeId = anchorNodeId && idSet[anchorNodeId] ? anchorNodeId : nodeIds[0] || null;
      if (!hopAnchorNodeId) return { node_ids: [], links: [] };
      var hopIdSet = {};
      hopIdSet[hopAnchorNodeId] = true;
      for (i = 0; i < scopedLinks.length; i++) {
        var hopEdge = getLinkEndpointIds(scopedLinks[i]);
        if (hopEdge.sourceId === hopAnchorNodeId && idSet[hopEdge.targetId]) hopIdSet[hopEdge.targetId] = true;
        if (hopEdge.targetId === hopAnchorNodeId && idSet[hopEdge.sourceId]) hopIdSet[hopEdge.sourceId] = true;
      }
      var hopNodeIds = nodeIds.filter(function (id) {
        return !!hopIdSet[id];
      });
      return { node_ids: hopNodeIds, links: getVisibleLinks(scopedLinks, hopNodeIds) };
    }

    if (mode === "core") {
      if (nodeIds.length <= 3) return { node_ids: nodeIds.slice(), links: scopedLinks };
      var scores = {};
      for (i = 0; i < nodeIds.length; i++) scores[nodeIds[i]] = 0;
      for (i = 0; i < scopedLinks.length; i++) {
        var coreEdge = getLinkEndpointIds(scopedLinks[i]);
        var weight = Number(scopedLinks[i] && scopedLinks[i].weight);
        var score = Number.isFinite(weight) ? 1 + weight : 1.5;
        if (scores[coreEdge.sourceId] != null) scores[coreEdge.sourceId] += score;
        if (scores[coreEdge.targetId] != null) scores[coreEdge.targetId] += score;
      }
      var coreLimit = Number.isFinite(Number(safe.coreLimit)) ? Number(safe.coreLimit) : Math.max(3, Math.min(8, Math.round(nodeIds.length * 0.5)));
      coreLimit = Math.max(1, Math.min(nodeIds.length, Math.round(coreLimit)));
      var coreNodeIds = sortNodeIdsByScore(nodeIds, scores, nodesById).slice(0, coreLimit);
      return { node_ids: coreNodeIds, links: getVisibleLinks(scopedLinks, coreNodeIds) };
    }

    return { node_ids: nodeIds.slice(), links: scopedLinks };
  }

  function resolveVisibleSnapshot(options) {
    var safe = options && typeof options === "object" ? options : {};
    var nodes = Array.isArray(safe.nodes) ? safe.nodes : [];
    var links = Array.isArray(safe.links) ? safe.links : [];
    var baseNodeIds = Array.isArray(safe.baseNodeIds) && safe.baseNodeIds.length
      ? safe.baseNodeIds.slice()
      : nodes.map(function (node) { return node.id; });
    var filteredLinks = filterLinksByTypes(links, safe.filters);
    var scopedLinks = getVisibleLinks(filteredLinks, baseNodeIds);
    var focusResult = applyFocusMode({
      mode: safe.focusMode,
      nodes: nodes,
      links: scopedLinks,
      nodeIds: baseNodeIds,
      anchorNodeId: safe.anchorNodeId,
      highConfidenceThreshold: safe.highConfidenceThreshold,
      coreLimit: safe.coreLimit
    });
    var focusNodeIds = focusResult.node_ids || [];
    if (!focusNodeIds.length && safe.focusMode && safe.focusMode !== "all") {
        return { node_ids: [], nodes: [], links: [], searchIndex: [] };
    }
    if (!focusNodeIds.length) focusNodeIds = baseNodeIds;
    var focusNodes = nodes.filter(function (node) {
      return focusNodeIds.indexOf(node.id) !== -1;
    });
    var searchIndex = buildSearchIndex(focusNodes);
    var query = typeof safe.searchQuery === "string" ? safe.searchQuery.trim() : "";
    var finalNodeIds = query ? applySearchToNodeIds(searchIndex, query) : focusNodeIds;
    var idSet = {};
    for (var i = 0; i < finalNodeIds.length; i++) idSet[finalNodeIds[i]] = true;
    return {
      node_ids: finalNodeIds,
      nodes: nodes.filter(function (node) {
        return !!idSet[node.id];
      }),
      links: finalNodeIds.length
        ? getVisibleLinks(focusResult.links && focusResult.links.length ? focusResult.links : scopedLinks, finalNodeIds)
        : [],
      searchIndex: searchIndex
    };
  }

  function shouldAutoOpenDrawer(mode) {
    return mode === "path";
  }

  var helpers = {
    splitLabelGraphemes: splitLabelGraphemes,
    labelCharWidth: labelCharWidth,
    measureLabelWidth: measureLabelWidth,
    truncateLabel: truncateLabel,
    cardDims: cardDims,
    createSafeStorage: createSafeStorage,
    getWikiStorageNamespace: getWikiStorageNamespace,
    defaultQueue: defaultQueue,
    normalizeQueue: normalizeQueue,
    toggleQueueFavorite: toggleQueueFavorite,
    appendQueueNote: appendQueueNote,
    summarizeQueue: summarizeQueue,
    defaultLearning: defaultLearning,
    normalizeLearning: normalizeLearning,
    resolveInitialMode: resolveInitialMode,
    getCommunityNodeIds: getCommunityNodeIds,
    getVisibleNodeIds: getVisibleNodeIds,
    getVisibleLinks: getVisibleLinks,
    buildSearchHaystack: buildSearchHaystack,
    buildSearchIndex: buildSearchIndex,
    filterLinksByTypes: filterLinksByTypes,
    applySearchToNodeIds: applySearchToNodeIds,
    applyFocusMode: applyFocusMode,
    resolveVisibleSnapshot: resolveVisibleSnapshot,
    shouldAutoOpenDrawer: shouldAutoOpenDrawer
  };

  root.WikiGraphWashHelpers = helpers;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = helpers;
  }
})(typeof window !== "undefined" ? window : this);
