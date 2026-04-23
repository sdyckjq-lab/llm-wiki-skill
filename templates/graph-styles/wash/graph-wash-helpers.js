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
      drawer: { section_order: ["what_this_is", "why_now", "next_steps", "raw_content", "neighbors"] },
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
      drawer: {
        section_order: Array.isArray(raw.drawer && raw.drawer.section_order)
          ? raw.drawer.section_order : d.drawer.section_order
      },
      degraded: {
        path_to_community: pick(raw.degraded, "path_to_community", d.degraded.path_to_community),
        community_to_global: pick(raw.degraded, "community_to_global", d.degraded.community_to_global)
      }
    };
  }

  function resolveInitialMode(learning) {
    if (!learning) return "global";
    var mode = learning.entry && learning.entry.default_mode;
    if (mode === "path" && learning.views && learning.views.path && !learning.views.path.degraded) return "path";
    if (mode === "community" && learning.views && learning.views.community && !learning.views.community.degraded) return "community";
    if (mode === "path" && learning.views && learning.views.community && !learning.views.community.degraded) return "community";
    return "global";
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
    defaultLearning: defaultLearning,
    normalizeLearning: normalizeLearning,
    resolveInitialMode: resolveInitialMode,
    getVisibleNodeIds: getVisibleNodeIds,
    getVisibleLinks: getVisibleLinks,
    shouldAutoOpenDrawer: shouldAutoOpenDrawer
  };

  root.WikiGraphWashHelpers = helpers;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = helpers;
  }
})(typeof window !== "undefined" ? window : this);
