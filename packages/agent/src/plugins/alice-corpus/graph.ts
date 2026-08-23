import type {
  AliceCorpusGraphEdge,
  AliceCorpusGraphNode,
} from "./manifest.js";

export interface AliceCorpusGraphSearchOptions {
  nodeTypes?: string[];
  limit?: number;
}

export interface AliceCorpusNeighborOptions {
  direction?: "in" | "out" | "both";
  edgeTypes?: string[];
  limit?: number;
}

export interface AliceCorpusPathOptions {
  edgeTypes?: string[];
  maxDepth?: number;
}

export interface AliceCorpusGraphNeighbor {
  node: AliceCorpusGraphNode;
  edge: AliceCorpusGraphEdge;
  direction: "in" | "out";
}

export interface AliceCorpusGraphPathStep {
  edge: AliceCorpusGraphEdge;
  direction: "in" | "out";
}

export interface AliceCorpusGraphPath {
  nodes: AliceCorpusGraphNode[];
  edges: AliceCorpusGraphEdge[];
  steps: AliceCorpusGraphPathStep[];
}

export interface AliceCorpusGraphEvidenceResult {
  nodeId: string;
  recordIds: string[];
  recordNodeIds: string[];
  sourceNodeIds: string[];
  traversedEdgeIds: string[];
}

export class AliceCorpusGraphIndex {
  readonly version: string;
  readonly projection: string;

  private readonly nodes = new Map<string, AliceCorpusGraphNode>();
  private readonly outgoing = new Map<string, AliceCorpusGraphEdge[]>();
  private readonly incoming = new Map<string, AliceCorpusGraphEdge[]>();

  constructor(
    nodes: readonly AliceCorpusGraphNode[],
    edges: readonly AliceCorpusGraphEdge[],
    metadata: { version: string; projection: string },
  ) {
    this.version = metadata.version;
    this.projection = metadata.projection;

    for (const node of nodes) this.nodes.set(node.node_id, node);
    for (const edge of edges) {
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
        throw new Error(
          `Graph edge ${edge.edge_id} references missing endpoint`,
        );
      }
      const outgoing = this.outgoing.get(edge.source) ?? [];
      outgoing.push(edge);
      this.outgoing.set(edge.source, outgoing);
      const incoming = this.incoming.get(edge.target) ?? [];
      incoming.push(edge);
      this.incoming.set(edge.target, incoming);
    }

    for (const edgesForNode of [
      ...this.outgoing.values(),
      ...this.incoming.values(),
    ]) {
      edgesForNode.sort((left, right) =>
        left.edge_id.localeCompare(right.edge_id),
      );
    }
  }

  private requireNode(nodeId: string): AliceCorpusGraphNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(
        `Projected corpus graph node missing after admission: ${nodeId}`,
      );
    }
    return node;
  }

  search(
    query: string,
    options: AliceCorpusGraphSearchOptions = {},
  ): AliceCorpusGraphNode[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const allowedTypes = options.nodeTypes?.length
      ? new Set(options.nodeTypes.map((type) => type.toLowerCase()))
      : null;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    return [...this.nodes.values()]
      .filter(
        (node) =>
          !allowedTypes || allowedTypes.has(node.node_type.toLowerCase()),
      )
      .map((node) => {
        const label = node.label.toLowerCase();
        const haystack = `${node.label}\n${node.node_type}\n${JSON.stringify(node.properties)}`.toLowerCase();
        let score = 0;
        if (label === needle) score += 100;
        if (label.includes(needle)) score += 20;
        if (node.node_type.toLowerCase().includes(needle)) score += 5;
        if (haystack.includes(needle)) score += 1;
        return { node, score };
      })
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.node.label.localeCompare(right.node.label),
      )
      .slice(0, limit)
      .map(({ node }) => node);
  }

  getNode(nodeId: string): AliceCorpusGraphNode | null {
    return this.nodes.get(nodeId) ?? null;
  }

  private collectNeighbors(
    nodeId: string,
    options: AliceCorpusNeighborOptions,
    limit: number,
  ): AliceCorpusGraphNeighbor[] {
    if (!this.nodes.has(nodeId)) return [];
    const direction = options.direction ?? "both";
    const allowedEdgeTypes = options.edgeTypes?.length
      ? new Set(options.edgeTypes)
      : null;
    const rows: AliceCorpusGraphNeighbor[] = [];

    if (direction === "out" || direction === "both") {
      for (const edge of this.outgoing.get(nodeId) ?? []) {
        if (!allowedEdgeTypes || allowedEdgeTypes.has(edge.edge_type)) {
          rows.push({
            node: this.requireNode(edge.target),
            edge,
            direction: "out",
          });
        }
      }
    }
    if (direction === "in" || direction === "both") {
      for (const edge of this.incoming.get(nodeId) ?? []) {
        if (!allowedEdgeTypes || allowedEdgeTypes.has(edge.edge_type)) {
          rows.push({
            node: this.requireNode(edge.source),
            edge,
            direction: "in",
          });
        }
      }
    }

    return rows
      .sort((left, right) => left.edge.edge_id.localeCompare(right.edge.edge_id))
      .slice(0, limit);
  }

  neighbors(
    nodeId: string,
    options: AliceCorpusNeighborOptions = {},
  ): AliceCorpusGraphNeighbor[] {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    return this.collectNeighbors(nodeId, options, limit);
  }

  shortestPath(
    source: string,
    target: string,
    options: AliceCorpusPathOptions = {},
  ): AliceCorpusGraphPath | null {
    if (!this.nodes.has(source) || !this.nodes.has(target)) return null;
    if (source === target) {
      return { nodes: [this.requireNode(source)], edges: [], steps: [] };
    }

    const maxDepth = Math.min(Math.max(options.maxDepth ?? 6, 1), 8);
    const queue: Array<[
      string,
      string[],
      AliceCorpusGraphPathStep[],
    ]> = [[source, [source], []]];
    const visited = new Set([source]);

    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      const [current, path, pathSteps] = entry;
      if (pathSteps.length >= maxDepth) continue;

      for (const neighbor of this.collectNeighbors(
        current,
        {
          direction: "both",
          edgeTypes: options.edgeTypes,
        },
        Number.MAX_SAFE_INTEGER,
      )) {
        const next = neighbor.node.node_id;
        if (visited.has(next)) continue;
        const nextPath = [...path, next];
        const nextSteps = [
          ...pathSteps,
          { edge: neighbor.edge, direction: neighbor.direction },
        ];
        if (next === target) {
          return {
            nodes: nextPath.map((nodeId) => this.requireNode(nodeId)),
            edges: nextSteps.map((step) => step.edge),
            steps: nextSteps,
          };
        }
        visited.add(next);
        queue.push([next, nextPath, nextSteps]);
      }
    }

    return null;
  }

  findEvidence(
    nodeId: string,
    depth = 3,
  ): AliceCorpusGraphEvidenceResult {
    const recordIds = new Set<string>();
    const recordNodeIds = new Set<string>();
    const sourceNodeIds = new Set<string>();
    const traversedEdgeIds = new Set<string>();
    if (!this.nodes.has(nodeId)) {
      return {
        nodeId,
        recordIds: [],
        recordNodeIds: [],
        sourceNodeIds: [],
        traversedEdgeIds: [],
      };
    }

    const evidenceEdgeTypes = [
      "ABOUT",
      "SOURCED_FROM",
      "EVIDENCES",
      "SUPPORTS",
    ];
    const queue: Array<[string, number]> = [[nodeId, 0]];
    const visited = new Set([nodeId]);
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      const [current, currentDepth] = entry;
      const node = this.requireNode(current);
      const ids = node.properties?.record_ids;
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") recordIds.add(id);
        }
      }
      if (node.node_type.toLowerCase() === "record") {
        recordNodeIds.add(node.node_id);
      }
      if (node.node_type.toLowerCase() === "source") {
        sourceNodeIds.add(node.node_id);
      }
      if (currentDepth >= depth) continue;

      for (const neighbor of this.collectNeighbors(
        current,
        { direction: "both", edgeTypes: evidenceEdgeTypes },
        Number.MAX_SAFE_INTEGER,
      )) {
        traversedEdgeIds.add(neighbor.edge.edge_id);
        const next = neighbor.node.node_id;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([next, currentDepth + 1]);
        }
      }
    }

    return {
      nodeId,
      recordIds: [...recordIds].sort(),
      recordNodeIds: [...recordNodeIds].sort(),
      sourceNodeIds: [...sourceNodeIds].sort(),
      traversedEdgeIds: [...traversedEdgeIds].sort(),
    };
  }

  listGaps(limit = 50): AliceCorpusGraphNode[] {
    return this.listByTypes(["gap"], limit);
  }

  listConflicts(limit = 50): AliceCorpusGraphNode[] {
    return this.listByTypes(["conflict", "contradiction"], limit);
  }

  private listByTypes(types: string[], limit: number): AliceCorpusGraphNode[] {
    const allowedTypes = new Set(types);
    return [...this.nodes.values()]
      .filter((node) => allowedTypes.has(node.node_type.toLowerCase()))
      .sort((left, right) => left.label.localeCompare(right.label))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }
}
