const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  splitLabelGraphemes,
  labelCharWidth,
  measureLabelWidth,
  truncateLabel,
  cardDims,
  createSafeStorage
} = require("../../templates/graph-styles/wash/graph-wash-helpers");

const LABEL_CJK_WIDTH = 15;
const LABEL_LATIN_WIDTH = 8.5;
const LABEL_MIN_WIDTH = 72;
const LABEL_MAX_WIDTH = 180;
const LABEL_ELLIPSIS = "…";
const HELPERS_PATH = path.resolve(__dirname, "../../templates/graph-styles/wash/graph-wash-helpers.js");

function loadHelpersWith(overrides = {}) {
  const source = fs.readFileSync(HELPERS_PATH, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    Intl,
    window: {},
    ...overrides
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: HELPERS_PATH });
  return sandbox;
}

// --- splitLabelGraphemes ---

describe("splitLabelGraphemes", () => {
  it("splits empty string", () => {
    assert.deepEqual(splitLabelGraphemes(""), []);
  });

  it("splits ASCII", () => {
    assert.deepEqual(splitLabelGraphemes("abc"), ["a", "b", "c"]);
  });

  it("splits CJK characters", () => {
    assert.deepEqual(splitLabelGraphemes("中文"), ["中", "文"]);
  });

  it("does not corrupt emoji with surrogate pairs", () => {
    const result = splitLabelGraphemes("a👨‍👩‍👧‍👦b");
    assert.ok(result.includes("👨‍👩‍👧‍👦"), "family emoji kept as single grapheme");
    assert.equal(result[0], "a");
    assert.equal(result[result.length - 1], "b");
  });

  it("does not corrupt surrogate pairs", () => {
    const result = splitLabelGraphemes("𠮷");
    // Whether it's 1 grapheme (with Intl.Segmenter) or split into code points,
    // the result must not contain unmatched surrogate halves
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(result.join("")));
  });

  it("falls back when Intl.Segmenter is unavailable", () => {
    const sandbox = loadHelpersWith({ Intl: {} });
    const fallbackHelpers = sandbox.module.exports;

    assert.deepEqual(Array.from(fallbackHelpers.splitLabelGraphemes("abc")), ["a", "b", "c"]);
    assert.deepEqual(Array.from(fallbackHelpers.splitLabelGraphemes("中文")), ["中", "文"]);
    assert.deepEqual(Array.from(fallbackHelpers.splitLabelGraphemes("👨‍👩‍👧‍👦")), ["👨‍👩‍👧‍👦"]);

    const truncated = fallbackHelpers.truncateLabel("节点A👨‍👩‍👧‍👦AlphaBeta超长标签" + "超".repeat(20), 120);
    assert.equal(truncated.truncated, true);
    assert.ok(truncated.text.endsWith(LABEL_ELLIPSIS));
    assert.ok(
      !/\uD800(?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncated.text),
      "fallback path keeps surrogate pairs intact"
    );

    const emojiBoundary = fallbackHelpers.truncateLabel("节点A👨‍👩‍👧‍👦AlphaBeta超长标签" + "超".repeat(20), 90);
    assert.ok(emojiBoundary.text.endsWith(LABEL_ELLIPSIS));
    assert.ok(
      !emojiBoundary.text.startsWith("‍") && !emojiBoundary.text.includes("‍" + LABEL_ELLIPSIS),
      "fallback path should not cut through a ZWJ sequence"
    );
    assert.ok(
      !emojiBoundary.text.includes("👨‍") || emojiBoundary.text.includes("👨‍👩‍👧‍👦"),
      "fallback path should keep the family emoji intact if it is included"
    );
  });
});

// --- labelCharWidth ---

describe("labelCharWidth", () => {
  it("returns CJK width for CJK character", () => {
    assert.equal(labelCharWidth("中"), LABEL_CJK_WIDTH);
  });

  it("returns Latin width for Latin character", () => {
    assert.equal(labelCharWidth("a"), LABEL_LATIN_WIDTH);
  });

  it("returns Latin width for digit", () => {
    assert.equal(labelCharWidth("5"), LABEL_LATIN_WIDTH);
  });

  it("returns Latin width for punctuation", () => {
    assert.equal(labelCharWidth("-"), LABEL_LATIN_WIDTH);
  });
});

// --- measureLabelWidth ---

describe("measureLabelWidth", () => {
  it("returns 0 for empty array", () => {
    assert.equal(measureLabelWidth([]), 0);
  });

  it("returns correct width for single grapheme", () => {
    assert.equal(measureLabelWidth(["a"]), LABEL_LATIN_WIDTH);
  });

  it("sums mixed CJK and Latin widths", () => {
    const width = measureLabelWidth(["中", "a", "文"]);
    assert.equal(width, LABEL_CJK_WIDTH * 2 + LABEL_LATIN_WIDTH);
  });
});

// --- truncateLabel ---

describe("truncateLabel", () => {
  it("handles empty string", () => {
    const r = truncateLabel("", 100);
    assert.equal(r.text, "");
    assert.equal(r.truncated, false);
  });

  it("handles null", () => {
    const r = truncateLabel(null, 100);
    assert.equal(r.text, "");
    assert.equal(r.truncated, false);
  });

  it("handles undefined", () => {
    const r = truncateLabel(undefined, 100);
    assert.equal(r.text, "");
    assert.equal(r.truncated, false);
  });

  it("does not truncate short label", () => {
    const r = truncateLabel("短标签", 120);
    assert.equal(r.truncated, false);
    assert.equal(r.text, "短标签");
  });

  it("truncates long label with ellipsis", () => {
    const longLabel = "超".repeat(30);
    const r = truncateLabel(longLabel, 100);
    assert.equal(r.truncated, true);
    assert.ok(r.text.endsWith(LABEL_ELLIPSIS));
  });

  it("does not corrupt emoji when truncating", () => {
    const r = truncateLabel("节点A👨‍👩‍👧‍👦AlphaBeta超长标签" + "超".repeat(20), 120);
    assert.equal(r.truncated, true);
    assert.ok(!r.text.includes("undefined"));
    assert.ok(
      !/\uD800(?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(r.text),
      "no unmatched surrogate halves"
    );
  });

  it("handles CJK + Latin mix", () => {
    const r = truncateLabel("中文English混合标签" + "超".repeat(20), 120);
    assert.equal(r.truncated, true);
    assert.ok(r.text.endsWith(LABEL_ELLIPSIS));
  });

  it("respects maxWidth exactly at boundary", () => {
    const label = "a".repeat(10);
    const r = truncateLabel(label, 1000);
    assert.equal(r.truncated, false);
    assert.equal(r.text, label);
  });
});

// --- cardDims ---

describe("cardDims", () => {
  it("returns dimensions for short label", () => {
    const r = cardDims({ id: "1", label: "短", type: "entity" });
    assert.ok(r.w >= LABEL_MIN_WIDTH);
    assert.ok(r.w <= LABEL_MAX_WIDTH);
    assert.equal(r.h, 36);
  });

  it("caps width at LABEL_MAX_WIDTH for long label", () => {
    const r = cardDims({ id: "1", label: "超".repeat(30), type: "entity" });
    assert.equal(r.w, LABEL_MAX_WIDTH);
  });

  it("enforces LABEL_MIN_WIDTH for empty label", () => {
    const r = cardDims({ id: "1", label: "", type: "entity" });
    assert.equal(r.w, LABEL_MIN_WIDTH);
  });

  it("taller for topic type", () => {
    const r = cardDims({ id: "1", label: "T", type: "topic" });
    assert.equal(r.h, 40);
  });

  it("shorter for source type", () => {
    const r = cardDims({ id: "1", label: "S", type: "source" });
    assert.equal(r.h, 32);
  });

  it("returns dimensions for generic entity", () => {
    const r = cardDims({ id: "1", label: "X", type: "entity" });
    assert.ok(r.w > 0);
    assert.ok(r.h > 0);
  });
});

// --- browser export ---

describe("browser export", () => {
  it("exports helpers to window when CommonJS is unavailable", () => {
    const source = fs.readFileSync(HELPERS_PATH, "utf8");
    const sandbox = {
      console,
      Intl,
      window: {}
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: HELPERS_PATH });

    assert.equal(typeof sandbox.window.WikiGraphWashHelpers, "object");
    assert.equal(typeof sandbox.window.WikiGraphWashHelpers.truncateLabel, "function");
    assert.equal(typeof sandbox.window.WikiGraphWashHelpers.cardDims, "function");
    assert.equal(typeof sandbox.window.WikiGraphWashHelpers.createSafeStorage, "function");
  });
});

// --- createSafeStorage ---

describe("createSafeStorage", () => {
  it("gets and sets normally", () => {
    const store = {};
    const storage = createSafeStorage({
      getItem: (k) => store[k],
      setItem: (k, v) => { store[k] = v; }
    });
    storage.set("k", "v");
    assert.equal(storage.get("k"), "v");
  });

  it("returns null when get throws", () => {
    const logs = [];
    const storage = createSafeStorage({
      getItem: () => { throw new Error("boom"); },
      setItem: () => {}
    }, (...args) => logs.push(args));
    assert.equal(storage.get("k"), null);
    assert.equal(logs.length, 1);
  });

  it("swallows set errors", () => {
    const logs = [];
    const storage = createSafeStorage({
      getItem: () => null,
      setItem: () => { throw new Error("boom"); }
    }, (...args) => logs.push(args));
    storage.set("k", "v");
    assert.equal(logs.length, 1);
  });

  it("handles null logger", () => {
    const storage = createSafeStorage({
      getItem: () => { throw new Error("boom"); },
      setItem: () => { throw new Error("boom"); }
    }, null);
    assert.equal(storage.get("k"), null);
    storage.set("k", "v");
  });

  it("handles null storage", () => {
    const storage = createSafeStorage(null, null);
    assert.equal(storage.get("k"), null);
    storage.set("k", "v");
  });
});
