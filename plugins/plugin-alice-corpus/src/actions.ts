import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
} from "@elizaos/core";
import type { AliceCorpusGraphNode } from "./manifest.js";
import { getAliceCorpusRuntimeState } from "./runtime.js";

function runtimeState(runtime: IAgentRuntime) {
  return getAliceCorpusRuntimeState(String(runtime.agentId));
}

function corpusContext(runtime: IAgentRuntime) {
  const state = runtimeState(runtime);
  return state
    ? {
        corpusVersion: state.corpus.manifest.version,
        projection: state.corpus.config.projection,
        inputDigest: state.corpus.inputDigest,
      }
    : null;
}

function unavailable(actionName: string) {
  return {
    text: "Alice corpus graph is not available for this runtime.",
    success: false,
    values: { success: false, error: "ALICE_CORPUS_GRAPH_UNAVAILABLE" },
    data: { actionName },
  };
}

function invalid(actionName: string, message: string) {
  return {
    text: message,
    success: false,
    values: { success: false, error: "INVALID_PARAMETERS" },
    data: { actionName },
  };
}

function parameters(options: unknown): Record<string, unknown> {
  return (
    (options as HandlerOptions | undefined)?.parameters ?? {}
  ) as Record<string, unknown>;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter((item): item is string => typeof item === "string");
  return rows.length > 0 ? rows : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export function formatGraphSearchResults(
  nodes: readonly AliceCorpusGraphNode[],
): string {
  if (nodes.length === 0) return "No projected corpus graph nodes matched.";
  return nodes
    .map(
      (node, index) =>
        `${index + 1}. ${node.label} — ${node.node_type} — ${node.node_id}`,
    )
    .join("\n");
}

export const aliceGraphSearchAction: Action = {
  name: "ALICE_GRAPH_SEARCH",
  similes: ["SEARCH_CORPUS_GRAPH", "FIND_CORPUS_NODE"],
  description:
    "Read-only search over the physically selected Alice corpus graph. Returns stable node identifiers and never broadens runtime authority.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_SEARCH");
    const params = parameters(options);
    const query = typeof params.query === "string" ? params.query.trim() : "";
    if (!query) {
      return invalid("ALICE_GRAPH_SEARCH", "A non-empty query is required.");
    }
    const nodes = state.graph.search(query, {
      nodeTypes: stringArray(params.nodeTypes),
      limit: positiveInteger(params.limit, 20),
    });
    return {
      text: formatGraphSearchResults(nodes),
      success: true,
      values: { success: true, resultCount: nodes.length },
      data: {
        actionName: "ALICE_GRAPH_SEARCH",
        ...corpusContext(runtime),
        nodes,
      },
    };
  },
  parameters: [
    {
      name: "query",
      description: "Text to search across node labels, types and properties.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "nodeTypes",
      description: "Optional exact node-type allow-list.",
      required: false,
      schema: { type: "array" as const, items: { type: "string" as const } },
    },
    {
      name: "limit",
      description: "Maximum results, capped at 50.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};

export const aliceGraphGetNodeAction: Action = {
  name: "ALICE_GRAPH_GET_NODE",
  similes: ["READ_CORPUS_NODE", "GET_CORPUS_NODE"],
  description:
    "Read one node from the selected Alice corpus graph by stable node ID.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_GET_NODE");
    const params = parameters(options);
    const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
    if (!nodeId) {
      return invalid("ALICE_GRAPH_GET_NODE", "A nodeId is required.");
    }
    const node = state.graph.getNode(nodeId);
    return {
      text: node
        ? `${node.label}\nType: ${node.node_type}\nID: ${node.node_id}`
        : `No projected corpus node exists with ID ${nodeId}.`,
      success: true,
      values: { success: true, found: Boolean(node) },
      data: {
        actionName: "ALICE_GRAPH_GET_NODE",
        ...corpusContext(runtime),
        node,
      },
    };
  },
  parameters: [
    {
      name: "nodeId",
      description: "Stable corpus graph node ID.",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export const aliceGraphNeighborsAction: Action = {
  name: "ALICE_GRAPH_NEIGHBORS",
  similes: ["CORPUS_GRAPH_NEIGHBORS", "TRACE_CORPUS_RELATIONSHIPS"],
  description:
    "Read incoming or outgoing relationships for one selected corpus graph node.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_NEIGHBORS");
    const params = parameters(options);
    const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
    if (!nodeId) {
      return invalid("ALICE_GRAPH_NEIGHBORS", "A nodeId is required.");
    }
    const rawDirection =
      typeof params.direction === "string" ? params.direction : "both";
    const direction = ["in", "out", "both"].includes(rawDirection)
      ? (rawDirection as "in" | "out" | "both")
      : "both";
    const neighbors = state.graph.neighbors(nodeId, {
      direction,
      edgeTypes: stringArray(params.edgeTypes),
      limit: positiveInteger(params.limit, 50),
    });
    return {
      text:
        neighbors.length === 0
          ? `No projected relationships found for ${nodeId}.`
          : neighbors
              .map(
                (result) =>
                  `${result.direction} ${result.edge.edge_type}: ${result.node.label} — ${result.node.node_id} — ${result.edge.edge_id}`,
              )
              .join("\n"),
      success: true,
      values: { success: true, resultCount: neighbors.length },
      data: {
        actionName: "ALICE_GRAPH_NEIGHBORS",
        ...corpusContext(runtime),
        nodeId,
        neighbors,
      },
    };
  },
  parameters: [
    {
      name: "nodeId",
      description: "Stable corpus graph node ID.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "direction",
      description: "One of in, out or both.",
      required: false,
      schema: { type: "string" as const, enum: ["in", "out", "both"] },
    },
    {
      name: "edgeTypes",
      description: "Optional exact edge-type allow-list.",
      required: false,
      schema: { type: "array" as const, items: { type: "string" as const } },
    },
    {
      name: "limit",
      description: "Maximum results, capped at 100.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};

export const aliceGraphPathAction: Action = {
  name: "ALICE_GRAPH_PATH",
  similes: ["FIND_CORPUS_PATH", "TRACE_CORPUS_DEPENDENCY"],
  description:
    "Find a bounded read-only path between two nodes in the selected Alice corpus graph.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_PATH");
    const params = parameters(options);
    const source = typeof params.source === "string" ? params.source.trim() : "";
    const target = typeof params.target === "string" ? params.target.trim() : "";
    if (!source || !target) {
      return invalid(
        "ALICE_GRAPH_PATH",
        "Both source and target node IDs are required.",
      );
    }
    const path = state.graph.shortestPath(source, target, {
      edgeTypes: stringArray(params.edgeTypes),
      maxDepth: positiveInteger(params.maxDepth, 6),
    });
    return {
      text: path
        ? path.nodes
            .map((node, index) =>
              index === 0
                ? `${node.label} (${node.node_id})`
                : `→ ${path.edges[index - 1]?.edge_type} → ${node.label} (${node.node_id})`,
            )
            .join("\n")
        : `No projected path found between ${source} and ${target}.`,
      success: true,
      values: { success: true, found: Boolean(path) },
      data: {
        actionName: "ALICE_GRAPH_PATH",
        ...corpusContext(runtime),
        source,
        target,
        path,
      },
    };
  },
  parameters: [
    {
      name: "source",
      description: "Source node ID.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "target",
      description: "Target node ID.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "edgeTypes",
      description: "Optional exact edge-type allow-list.",
      required: false,
      schema: { type: "array" as const, items: { type: "string" as const } },
    },
    {
      name: "maxDepth",
      description: "Maximum path depth, capped at 8.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};

export const aliceGraphFindEvidenceAction: Action = {
  name: "ALICE_GRAPH_FIND_EVIDENCE",
  similes: ["FIND_CORPUS_EVIDENCE", "TRACE_CORPUS_SOURCES"],
  description:
    "Trace record and source evidence around one selected corpus graph node.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_FIND_EVIDENCE");
    const params = parameters(options);
    const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
    if (!nodeId) {
      return invalid("ALICE_GRAPH_FIND_EVIDENCE", "A nodeId is required.");
    }
    const evidence = state.graph.findEvidence(
      nodeId,
      positiveInteger(params.depth, 3),
    );
    return {
      text: [
        `Node: ${nodeId}`,
        `Record IDs: ${evidence.recordIds.join(", ") || "none"}`,
        `Source nodes: ${evidence.sourceNodeIds.join(", ") || "none"}`,
      ].join("\n"),
      success: true,
      values: {
        success: true,
        recordCount: evidence.recordIds.length,
        sourceCount: evidence.sourceNodeIds.length,
      },
      data: {
        actionName: "ALICE_GRAPH_FIND_EVIDENCE",
        ...corpusContext(runtime),
        evidence,
      },
    };
  },
  parameters: [
    {
      name: "nodeId",
      description: "Stable corpus graph node ID.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "depth",
      description: "Evidence traversal depth.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};

export const aliceGraphListGapsAction: Action = {
  name: "ALICE_GRAPH_LIST_GAPS",
  similes: ["LIST_CORPUS_GAPS", "SHOW_EVIDENCE_GAPS"],
  description:
    "List unresolved gap nodes from the selected Alice corpus graph. Read-only.",
  validate: async (runtime) => Boolean(runtimeState(runtime)?.graph),
  handler: async (runtime, _message, _state, options) => {
    const state = runtimeState(runtime);
    if (!state?.graph) return unavailable("ALICE_GRAPH_LIST_GAPS");
    const params = parameters(options);
    const gaps = state.graph.listGaps(positiveInteger(params.limit, 50));
    return {
      text: formatGraphSearchResults(gaps),
      success: true,
      values: { success: true, resultCount: gaps.length },
      data: {
        actionName: "ALICE_GRAPH_LIST_GAPS",
        ...corpusContext(runtime),
        gaps,
      },
    };
  },
  parameters: [
    {
      name: "limit",
      description: "Maximum gap nodes, capped at 100.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};

export const aliceCorpusGraphActions: Action[] = [
  aliceGraphSearchAction,
  aliceGraphGetNodeAction,
  aliceGraphNeighborsAction,
  aliceGraphPathAction,
  aliceGraphFindEvidenceAction,
  aliceGraphListGapsAction,
];
