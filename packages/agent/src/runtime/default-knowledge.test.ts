import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOWLEDGE_DOCUMENTS,
  type DefaultKnowledgeDocumentDefinition,
  seedBundledKnowledge,
} from "./default-knowledge";

type MemoryTable = "documents" | "knowledge";

function cloneMemory(memory: Memory): Memory {
  return {
    ...memory,
    content: { ...(memory.content ?? {}) },
    metadata:
      memory.metadata && typeof memory.metadata === "object"
        ? { ...(memory.metadata as Record<string, unknown>) }
        : memory.metadata,
    embedding: Array.isArray(memory.embedding)
      ? [...memory.embedding]
      : undefined,
  };
}

function createRuntimeHarness(
  options: { embeddingDimensions?: number | undefined } = {},
) {
  const agentId = stringToUuid("seed-bundled-knowledge-agent");
  const tableById = new Map<string, MemoryTable>();
  const memoriesById = new Map<string, Memory>();
  let addEmbeddingCalls = 0;

  const runtime = {
    agentId,
    getSetting(key: string) {
      if (key !== "EMBEDDING_DIMENSION") return null;
      return options.embeddingDimensions ?? null;
    },
    async getMemoryById(id: UUID) {
      const memory = memoriesById.get(id);
      return memory ? cloneMemory(memory) : null;
    },
    async createMemory(memory: Memory, tableName: MemoryTable) {
      tableById.set(memory.id as UUID, tableName);
      memoriesById.set(memory.id as UUID, cloneMemory(memory));
      return memory.id as UUID;
    },
    async updateMemory(memory: Memory) {
      const tableName = tableById.get(memory.id as UUID);
      if (!tableName) {
        throw new Error(`Missing table for memory ${memory.id}`);
      }
      memoriesById.set(memory.id as UUID, cloneMemory(memory));
      return true;
    },
    async deleteMemory(memoryId: UUID) {
      tableById.delete(memoryId);
      memoriesById.delete(memoryId);
      return true;
    },
    async getMemories(params: {
      tableName: MemoryTable;
      roomId?: UUID;
      count?: number;
      start?: number;
    }) {
      const start = params.start ?? 0;
      const count = params.count ?? Number.MAX_SAFE_INTEGER;
      return [...memoriesById.entries()]
        .filter(([id, memory]) => {
          return (
            tableById.get(id) === params.tableName &&
            (params.roomId ? memory.roomId === params.roomId : true)
          );
        })
        .map(([, memory]) => cloneMemory(memory))
        .slice(start, start + count);
    },
    async addEmbeddingToMemory(memory: Memory) {
      addEmbeddingCalls += 1;
      memory.embedding = [
        memory.content.text.length,
        memory.content.text.length / 2,
        1,
      ];
      return memory;
    },
  };

  return {
    runtime,
    getAddEmbeddingCalls: () => addEmbeddingCalls,
    listMemories(tableName: MemoryTable): Memory[] {
      return [...memoriesById.entries()]
        .filter(([id]) => tableById.get(id) === tableName)
        .map(([, memory]) => cloneMemory(memory));
    },
  };
}

describe("seedBundledKnowledge", () => {
  it("seeds the default knowledge document as a single fragment", async () => {
    const harness = createRuntimeHarness({ embeddingDimensions: 3 });

    await seedBundledKnowledge(harness.runtime as unknown as AgentRuntime);

    const documents = harness.listMemories("documents");
    const fragments = harness.listMemories("knowledge");

    expect(documents).toHaveLength(1);
    expect(fragments).toHaveLength(1);

    expect(documents[0].content.text).toBe("this is a test");
    expect(documents[0].metadata).toMatchObject({
      type: "document",
      filename: "milady-default-knowledge.txt",
      source: "milady-default-knowledge",
    });

    expect(fragments[0].content.text).toBe("this is a test");
    expect(fragments[0].metadata).toMatchObject({
      type: "fragment",
      position: 0,
      source: "milady-default-knowledge",
    });
    expect(fragments[0].embedding).toEqual([14, 7, 1]);
    expect(harness.getAddEmbeddingCalls()).toBe(1);
  });

  it("reuses persisted embeddings on subsequent startups", async () => {
    const harness = createRuntimeHarness({ embeddingDimensions: 3 });

    await seedBundledKnowledge(harness.runtime as unknown as AgentRuntime);
    expect(harness.getAddEmbeddingCalls()).toBe(1);

    await seedBundledKnowledge(harness.runtime as unknown as AgentRuntime);

    expect(harness.listMemories("documents")).toHaveLength(1);
    expect(harness.listMemories("knowledge")).toHaveLength(1);
    expect(harness.getAddEmbeddingCalls()).toBe(1);
  });

  it("accepts precomputed fragment embeddings when dimensions match", async () => {
    const harness = createRuntimeHarness({ embeddingDimensions: 3 });
    const documents: readonly DefaultKnowledgeDocumentDefinition[] = [
      {
        key: "precomputed-test",
        version: 1,
        filename: "precomputed.txt",
        contentType: "text/plain",
        text: "this is a test",
        fragments: [{ text: "this is a test", embedding: [0.1, 0.2, 0.3] }],
      },
    ];

    await seedBundledKnowledge(
      harness.runtime as unknown as AgentRuntime,
      documents,
    );

    expect(harness.getAddEmbeddingCalls()).toBe(0);
    expect(harness.listMemories("documents")).toHaveLength(1);
    expect(harness.listMemories("knowledge")).toHaveLength(1);
    expect(harness.listMemories("knowledge")[0].embedding).toEqual([
      0.1, 0.2, 0.3,
    ]);
  });

  it("keeps the shipped default document definition stable", () => {
    expect(DEFAULT_KNOWLEDGE_DOCUMENTS).toEqual([
      {
        key: "default-test",
        version: 1,
        filename: "milady-default-knowledge.txt",
        contentType: "text/plain",
        text: "this is a test",
        fragments: [{ text: "this is a test" }],
      },
    ]);
  });
});
