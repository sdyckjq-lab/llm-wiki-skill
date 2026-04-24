const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  getWikiStorageNamespace,
  defaultQueue,
  normalizeQueue,
  toggleQueueFavorite,
  appendQueueNote,
  summarizeQueue
} = require("../../templates/graph-styles/wash/graph-wash-helpers");

describe("getWikiStorageNamespace", () => {
  it("returns a stable namespace for the same wiki", () => {
    const a = getWikiStorageNamespace({ wiki_title: "AI知识图谱Demo" }, "/wiki/graph.html");
    const b = getWikiStorageNamespace({ wiki_title: "AI知识图谱Demo" }, "/wiki/graph.html");
    assert.equal(a, b);
    assert.match(a, /^llm-wiki:/);
  });

  it("changes namespace when pathname changes", () => {
    const a = getWikiStorageNamespace({ wiki_title: "AI知识图谱Demo" }, "/wiki-a/graph.html");
    const b = getWikiStorageNamespace({ wiki_title: "AI知识图谱Demo" }, "/wiki-b/graph.html");
    assert.notEqual(a, b);
  });
});

describe("defaultQueue and normalizeQueue", () => {
  it("returns an empty queue by default", () => {
    assert.deepEqual(defaultQueue(), {
      version: 1,
      favorites: [],
      notes: [],
      recentNoteIds: []
    });
  });

  it("normalizes malformed queue data", () => {
    const queue = normalizeQueue({
      favorites: ["n1", "n1", 2, null],
      notes: [
        { id: "a", node_id: "n1", label: "节点 A", text: "摘录", created_at: "2026-04-24T00:00:00Z" },
        { bad: true }
      ],
      recentNoteIds: ["a", "missing", "a"]
    });

    assert.deepEqual(queue.favorites, ["n1", "2"]);
    assert.equal(queue.notes.length, 1);
    assert.deepEqual(queue.recentNoteIds, ["a"]);
  });
});

describe("toggleQueueFavorite", () => {
  it("adds and removes favorites", () => {
    let queue = defaultQueue();
    queue = toggleQueueFavorite(queue, "n1");
    assert.deepEqual(queue.favorites, ["n1"]);

    queue = toggleQueueFavorite(queue, "n2");
    assert.deepEqual(queue.favorites, ["n2", "n1"]);

    queue = toggleQueueFavorite(queue, "n1");
    assert.deepEqual(queue.favorites, ["n2"]);
  });
});

describe("appendQueueNote", () => {
  it("prepends note and updates recent ids", () => {
    let queue = defaultQueue();
    queue = appendQueueNote(queue, {
      id: "note-1",
      node_id: "n1",
      label: "节点一",
      text: "第一条",
      created_at: "2026-04-24T00:00:00Z"
    });
    queue = appendQueueNote(queue, {
      id: "note-2",
      node_id: "n2",
      label: "节点二",
      text: "第二条",
      created_at: "2026-04-24T00:01:00Z"
    });

    assert.deepEqual(queue.notes.map((note) => note.id), ["note-2", "note-1"]);
    assert.deepEqual(queue.recentNoteIds, ["note-2", "note-1"]);
  });
});

describe("summarizeQueue", () => {
  it("summarizes counts and recent items", () => {
    let queue = defaultQueue();
    queue = toggleQueueFavorite(queue, "n3");
    queue = appendQueueNote(queue, {
      id: "note-1",
      node_id: "n1",
      label: "节点一",
      text: "摘录一",
      created_at: "2026-04-24T00:00:00Z"
    });

    const summary = summarizeQueue(queue, {
      n1: { id: "n1", label: "节点一" },
      n3: { id: "n3", label: "节点三" }
    }, 4);

    assert.equal(summary.favorite_count, 1);
    assert.equal(summary.note_count, 1);
    assert.deepEqual(summary.recent_items, [
      { kind: "note", node_id: "n1", label: "节点一", text: "摘录一" },
      { kind: "favorite", node_id: "n3", label: "节点三", text: "" }
    ]);
  });
});
