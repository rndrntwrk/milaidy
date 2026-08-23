import { describe, expect, it } from "vitest";
import { AliceCorpusGraphIndex } from "./graph.js";
import type {
  AliceCorpusGraphEdge,
  AliceCorpusGraphNode,
} from "./manifest.js";

const nodes: AliceCorpusGraphNode[] = [
  {
    node_id: "system:alice",
    node_type: "System",
    label: "Alice",
    visibility: "INTERNAL",
    properties: {
      record_ids: ["decision:alice"],
      description: "canonical agent",
    },
  },
  {
    node_id: "runtime:eliza",
    node_type: "Runtime",
    label: "Eliza runtime",
    visibility: "INTERNAL",
    properties: {},
  },
  {
    node_id: "record:decision:alice",
    node_type: "Record",
    label: "Alice uses Eliza",
    visibility: "INTERNAL",
    properties: { record_ids: ["decision:alice"] },
  },
  {
    node_id: "source:spec",
    node_type: "Source",
    label: "Alice architecture spec",
    visibility: "INTERNAL",
    properties: { source_id: "src:spec" },
  },
  {
    node_id: "gap:wallets",
    node_type: "Gap",
    label: "Wallet register missing",
    visibility: "INTERNAL",
    properties: {},
  },
];

const edges: AliceCorpusGraphEdge[] = [
  {
    edge_id: "edge:1",
    source: "system:alice",
    target: "runtime:eliza",
    edge_type: "USES_RUNTIME",
    visibility: "INTERNAL",
    properties: {},
  },
  {
    edge_id: "edge:2",
    source: "record:decision:alice",
    target: "system:alice",
    edge_type: "ABOUT",
    visibility: "INTERNAL",
    properties: {},
  },
  {
    edge_id: "edge:3",
    source: "record:decision:alice",
    target: "source:spec",
    edge_type: "SOURCED_FROM",
    visibility: "INTERNAL",
    properties: {},
  },
];

function graph() {
  return new AliceCorpusGraphIndex(nodes, edges, {
    version: "1.0.0",
    projection: "internal",
  });
}

describe("AliceCorpusGraphIndex", () => {
  it("searches labels, types and properties with node-type filtering", () => {
    expect(graph().search("canonical")[0]?.node_id).toBe("system:alice");
    expect(
      graph()
        .search("alice", { nodeTypes: ["Source"] })
        .map((node) => node.node_id),
    ).toEqual(["source:spec"]);
  });

  it("returns directional neighbors with edge filtering", () => {
    expect(
      graph()
        .neighbors("system:alice", { direction: "out" })
        .map((result) => result.node.node_id),
    ).toEqual(["runtime:eliza"]);
    expect(
      graph()
        .neighbors("system:alice", {
          direction: "in",
          edgeTypes: ["ABOUT"],
        })
        .map((result) => result.node.node_id),
    ).toEqual(["record:decision:alice"]);
  });

  it("finds a bounded shortest path and preserves the direction used for every traversed edge", () => {
    const result = graph().shortestPath("runtime:eliza", "source:spec", {
      maxDepth: 4,
    });

    expect(result?.nodes.map((node) => node.node_id)).toEqual([
      "runtime:eliza",
      "system:alice",
      "record:decision:alice",
      "source:spec",
    ]);
    expect(result?.steps.map((step) => step.direction)).toEqual([
      "in",
      "in",
      "out",
    ]);
    expect(
      graph().shortestPath("runtime:eliza", "source:spec", {
        maxDepth: 2,
      }),
    ).toBeNull();
  });

  it("applies edge-type filtering before the neighbor fan-out limit", () => {
    const manyNodes: AliceCorpusGraphNode[] = [
      {
        node_id: "source",
        node_type: "System",
        label: "Source",
        visibility: "INTERNAL",
        properties: {},
      },
      {
        node_id: "target",
        node_type: "System",
        label: "Target",
        visibility: "INTERNAL",
        properties: {},
      },
      ...Array.from({ length: 101 }, (_, index) => ({
        node_id: `noise:${index}`,
        node_type: "System",
        label: `Noise ${index}`,
        visibility: "INTERNAL",
        properties: {},
      })),
    ];
    const manyEdges: AliceCorpusGraphEdge[] = [
      ...Array.from({ length: 101 }, (_, index) => ({
        edge_id: `edge:${String(index).padStart(3, "0")}`,
        source: "source",
        target: `noise:${index}`,
        edge_type: "NOISE",
        visibility: "INTERNAL",
        properties: {},
      })),
      {
        edge_id: "edge:999",
        source: "source",
        target: "target",
        edge_type: "SUPPORTS",
        visibility: "INTERNAL",
        properties: {},
      },
    ];
    const index = new AliceCorpusGraphIndex(manyNodes, manyEdges, {
      version: "1.0.0",
      projection: "internal",
    });

    expect(
      index.shortestPath("source", "target", {
        edgeTypes: ["SUPPORTS"],
        maxDepth: 1,
      })?.nodes.map((node) => node.node_id),
    ).toEqual(["source", "target"]);
  });

  it("traces record and source evidence and lists gaps", () => {
    const evidence = graph().findEvidence("system:alice", 3);
    expect(evidence.recordIds).toEqual(["decision:alice"]);
    expect(evidence.sourceNodeIds).toEqual(["source:spec"]);
    expect(graph().listGaps().map((node) => node.node_id)).toEqual([
      "gap:wallets",
    ]);
  });
});
