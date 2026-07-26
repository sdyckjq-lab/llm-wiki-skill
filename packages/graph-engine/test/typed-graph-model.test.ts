import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAtlasModel, projectGraphInput } from "../src/model/atlas";

describe("typed graph model", () => {
  it("indexes object-prototype community metadata without losing labels or order", () => {
    const communityIds = ["ordinary", "__proto__", "constructor", "toString"] as const;
    const model = buildAtlasModel({
      nodes: communityIds.map((community, index) => ({
        id: `node-${community}`,
        label: `Node ${index + 1}`,
        type: "topic",
        community
      })),
      edges: [],
      learning: {
        communities: communityIds.map((id, index) => ({
          id,
          label: `${String.fromCharCode(65 + index)} Community`,
          node_count: 1,
          is_primary: index === 0
        }))
      }
    });

    assert.deepEqual(model.communities.map((community) => community.id), communityIds);
    for (const [index, communityId] of communityIds.entries()) {
      assert.equal(Object.hasOwn(model.communityById, communityId), true);
      assert.equal(model.communityById[communityId]?.id, communityId);
      assert.equal(
        model.communityById[communityId]?.label,
        `${String.fromCharCode(65 + index)} Community`
      );
    }
  });

  it("derives object-prototype communities from node membership without metadata", () => {
    const communityCases = [
      { id: "ordinary", topicLabel: "Ordinary Topic", sourceCount: 0 },
      { id: "__proto__", topicLabel: "Proto Topic", sourceCount: 1 },
      { id: "constructor", topicLabel: "Constructor Topic", sourceCount: 2 },
      { id: "toString", topicLabel: "ToString Topic", sourceCount: 3 }
    ] as const;
    const model = buildAtlasModel({
      nodes: communityCases.flatMap(({ id, topicLabel, sourceCount }) => [
        { id: `topic-${id}`, label: topicLabel, type: "topic", community: id },
        ...Array.from({ length: sourceCount }, (_, index) => ({
          id: `source-${id}-${index + 1}`,
          label: `Source ${id} ${index + 1}`,
          type: "source",
          community: id
        }))
      ]),
      edges: []
    });

    assert.deepEqual(
      model.communities.map((community) => community.id).sort(),
      communityCases.map(({ id }) => id).sort()
    );
    for (const { id, topicLabel, sourceCount } of communityCases) {
      assert.equal(Object.hasOwn(model.communityById, id), true);
      assert.equal(model.communityById[id]?.id, id);
      assert.equal(model.communityById[id]?.label, topicLabel);
      assert.equal(model.communityById[id]?.node_count, sourceCount + 1);
      assert.equal(model.communityById[id]?.source_count, sourceCount);
    }
  });

  it("preserves sparse node array holes without inventing graph facts", () => {
    const nodes: unknown[] = [];
    nodes.length = 3;
    nodes[2] = { id: "real", label: "Real", community: "c1" };

    const model = buildAtlasModel({ nodes, edges: [] });

    assert.equal(model.nodes.length, 3);
    assert.deepEqual(Object.keys(model.nodes), ["2"]);
    assert.deepEqual(Object.keys(model.byId), ["real"]);
    assert.deepEqual(model.communities.map((community) => community.id), ["c1"]);
    assert.deepEqual(model.starts.map((entry) => entry.node.id), ["real"]);
    assert.equal(model.searchIndex.length, 3);
    assert.deepEqual(Object.keys(model.searchIndex), ["2"]);
  });

  it("normalizes malformed model input with collision-safe generated ids and first-wins duplicates", () => {
    const model = buildAtlasModel({
      meta: { wiki_title: "Compatibility" },
      nodes: [
        { id: undefined, label: "generated", community: "c1", weight: undefined },
        { id: "node-0", label: "first collision", community: "c1", x: NaN, y: Infinity },
        { id: "node-0", label: "last collision", community: "c2", weight: -Infinity },
        { id: Infinity, label: "infinite id", community: null, type: "future-type", confidence: "future-confidence" }
      ],
      edges: [
        { id: undefined, from: "node-0", to: Infinity, weight: NaN },
        { id: "edge-0", from: Infinity, to: "node-0", weight: -Infinity },
        { id: "invalid", from: "missing", to: "node-0", weight: Infinity },
        { id: "duplicate", from: "node-0", to: Infinity, confidence: "future-confidence" },
        { id: "duplicate", from: Infinity, to: "node-0", relation_type: "future-relation" }
      ],
      learning: {
        entry: { recommended_start_node_id: "node-0" },
        communities: [
          { id: "c1", label: "first community", recommended_start_node_id: "node-0" },
          { id: "c1", label: "last community" }
        ]
      }
    });

    assert.deepEqual(model.nodes.map((node) => node.id), ["node-1", "node-0", "Infinity"]);
    assert.equal(model.byId["node-0"]?.label, "first collision");
    assert.deepEqual(model.edges.map((edge) => edge.id), ["edge-1", "edge-0", "duplicate"]);
    assert.deepEqual(model.edges.map((edge) => [edge.source, edge.target]), [
      ["node-0", "Infinity"],
      ["Infinity", "node-0"],
      ["node-0", "Infinity"]
    ]);
    assert.deepEqual(model.nodes.map((node) => node.degree), [0, 3, 3]);
    assert.deepEqual(model.communities.map((community) => community.label), [
      "未分组",
      "first community"
    ]);
    assert.equal(model.communityById.c1?.label, "first community");
    assert.equal(model.starts[0]?.node.label, "first collision");
    assert.equal(model.byId.Infinity?.type, "entity");
    assert.equal(model.byId.Infinity?.confidence, "EXTRACTED");
    assert.equal(model.edges[2]?.confidence, "EXTRACTED");
    assert.equal(model.edges[2]?.relation_type, "依赖");
    assert.deepEqual(model.warnings.map((warning) => warning.code), [
      "generated_id_collision",
      "duplicate_node_id",
      "generated_id_collision",
      "duplicate_edge_id",
      "duplicate_community_id"
    ]);
  });

  it("is total for undefined and non-finite direct inputs", () => {
    assert.deepEqual(buildAtlasModel(undefined).nodes, []);
    assert.deepEqual(buildAtlasModel(NaN).nodes, []);
    assert.deepEqual(buildAtlasModel(Infinity).edges, []);
    assert.deepEqual(buildAtlasModel(-Infinity).communities, []);
  });

  it("normalizes insight numbers and keeps only typed edge signals", () => {
    const model = buildAtlasModel({
      nodes: [{ id: "a", label: "A" }],
      edges: [{
        id: "a-a",
        from: "a",
        to: "a",
        signals: {
          co_citation: "2",
          source_overlap: Infinity,
          verified: true,
          nested: { unsafe: true }
        }
      }],
      insights: {
        isolated_nodes: [{ id: 0, label: false, degree: "7", community: false }],
        meta: {
          degraded: "yes",
          node_count: "2",
          edge_count: Infinity,
          max_insight_nodes: NaN,
          max_insight_edges: "4"
        }
      }
    });

    assert.deepEqual(model.edges[0]?.signals, {
      co_citation: "2",
      source_overlap: Infinity,
      verified: true
    });
    assert.deepEqual(model.insights.isolated_nodes, [{
      id: "0",
      label: "false",
      degree: 7,
      community: "false"
    }]);
    assert.deepEqual(model.insights.meta, {
      degraded: false,
      node_count: 2,
      edge_count: 0,
      max_insight_nodes: 0,
      max_insight_edges: 4
    });
  });

  it("preserves sparse insight array positions without inventing graph IDs", () => {
    const surprisingConnections: unknown[] = new Array(3);
    surprisingConnections[2] = { from: "a", to: "b", weight: 0.5 };
    const connectedCommunities: unknown[] = new Array(2);
    connectedCommunities[1] = "c2";
    const bridgeNodes: unknown[] = new Array(2);
    bridgeNodes[1] = {
      id: "a",
      connected_communities: connectedCommunities
    };
    const members: unknown[] = new Array(3);
    members[2] = "a";
    const sparseCommunities: unknown[] = new Array(3);
    sparseCommunities[2] = { id: "c1", members };

    const input = {
      insights: {
        surprising_connections: surprisingConnections,
        bridge_nodes: bridgeNodes,
        sparse_communities: sparseCommunities
      }
    };
    const models = [
      buildAtlasModel(input),
      buildAtlasModel(projectGraphInput(input).data)
    ];

    for (const model of models) {
      assert.equal(model.insights.surprising_connections.length, 3);
      assert.deepEqual(Object.keys(model.insights.surprising_connections), ["2"]);
      assert.equal(model.insights.bridge_nodes.length, 2);
      assert.deepEqual(Object.keys(model.insights.bridge_nodes), ["1"]);
      assert.equal(model.insights.bridge_nodes[1]?.connected_communities.length, 2);
      assert.deepEqual(Object.keys(model.insights.bridge_nodes[1]?.connected_communities ?? []), ["1"]);
      assert.equal(model.insights.bridge_nodes[1]?.connected_communities[1], "c2");
      assert.equal(model.insights.sparse_communities.length, 3);
      assert.deepEqual(Object.keys(model.insights.sparse_communities), ["2"]);
      assert.equal(model.insights.sparse_communities[2]?.members.length, 3);
      assert.deepEqual(Object.keys(model.insights.sparse_communities[2]?.members ?? []), ["2"]);
      assert.equal(model.insights.sparse_communities[2]?.members[2], "a");
    }
  });
});
