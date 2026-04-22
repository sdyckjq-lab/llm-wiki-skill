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

  var helpers = {
    splitLabelGraphemes: splitLabelGraphemes,
    labelCharWidth: labelCharWidth,
    measureLabelWidth: measureLabelWidth,
    truncateLabel: truncateLabel,
    cardDims: cardDims,
    createSafeStorage: createSafeStorage
  };

  root.WikiGraphWashHelpers = helpers;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = helpers;
  }
})(typeof window !== "undefined" ? window : this);
