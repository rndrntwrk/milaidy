import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  type AgentRuntime,
  type Memory,
  MemoryType,
  splitChunks,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import { repairAliceCorpusFragment } from "./alice-corpus-v4-fragment-repair";

const EMBEDDING = Array(1024).fill(0.25) as number[];

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function fixture(embeddingAvailable: boolean) {
  const parentId = stringToUuid("alice-corpus-repair-test-parent");
  const agentId = stringToUuid("alice-corpus-repair-test-agent");
  const roomId = stringToUuid("alice-corpus-repair-test-room");
  const entityId = stringToUuid("alice-corpus-repair-test-entity");
  const text = "alpha ".repeat(800);
  const chunks = await splitChunks(text, 500, 100);
  expect(chunks).toHaveLength(4);
  const sourceSha = sha256(text);
  const spec = {
    parentId,
    parentSha256: sourceSha,
    fragmentSha256: chunks.map(sha256) as [string, string, string, string],
  };
  const parent: Memory = {
    id: parentId,
    agentId,
    roomId,
    worldId: roomId,
    entityId,
    content: { text },
    metadata: {
      type: MemoryType.DOCUMENT,
      documentId: parentId,
      content_sha256: sourceSha,
      ingestionAttemptId: "test-attempt",
    },
    createdAt: 100,
  };
  const memories = new Map<string, Memory>([[parentId, parent]]);
  const fragmentIds = new Set<string>();
  for (const position of [0, 2, 3]) {
    const id = stringToUuid(`alice-corpus-repair-test-fragment-${position}`);
    const chunk = chunks[position];
    if (chunk === undefined) throw new Error("TEST_CHUNK_MISSING");
    fragmentIds.add(id);
    memories.set(id, {
      id,
      agentId,
      roomId,
      worldId: roomId,
      entityId,
      content: { text: chunk },
      metadata: {
        ...parent.metadata,
        type: MemoryType.FRAGMENT,
        position,
        timestamp: 100 + position,
      },
      embedding: [...EMBEDDING],
      createdAt: 100 + position,
    });
  }
  let writes = 0;
  let embeddingCalls = 0;
  const runtime = {
    agentId,
    async getMemoryById(id: UUID) {
      return memories.get(id) ?? null;
    },
    async getMemories(params: {
      roomId: UUID;
      metadata: { documentId: UUID };
      count: number;
    }) {
      return [...fragmentIds]
        .map((id) => memories.get(id))
        .filter((memory): memory is Memory => memory !== undefined)
        .filter(
          (memory) =>
            memory.roomId === params.roomId &&
            memory.metadata?.documentId === params.metadata.documentId,
        )
        .slice(0, params.count);
    },
    getModel() {
      return () => EMBEDDING;
    },
    async addEmbeddingToMemory(memory: Memory) {
      embeddingCalls += 1;
      if (embeddingAvailable) memory.embedding = [...EMBEDDING];
      return memory;
    },
    getLastResolvedModelProvider() {
      return embeddingAvailable ? "openai" : undefined;
    },
    async createMemory(memory: Memory, tableName: string) {
      expect(tableName).toBe("document_fragments");
      if (!memory.id) throw new Error("TEST_MEMORY_ID_MISSING");
      writes += 1;
      fragmentIds.add(memory.id);
      memories.set(memory.id, memory);
      return memory.id;
    },
  } as unknown as AgentRuntime;
  return {
    runtime,
    spec,
    getWrites: () => writes,
    getEmbeddingCalls: () => embeddingCalls,
    getFragments: () =>
      [...fragmentIds]
        .map((id) => memories.get(id))
        .filter((memory): memory is Memory => memory !== undefined),
  };
}

describe("Alice corpus v4 fragment repair", () => {
  test("writes only missing position 1 and is a no-op on the next boot", async () => {
    const harness = await fixture(true);
    expect(await repairAliceCorpusFragment(harness.runtime, harness.spec)).toBe(
      "repaired",
    );
    expect(harness.getWrites()).toBe(1);
    expect(
      harness
        .getFragments()
        .map((memory) => memory.metadata?.position)
        .sort(),
    ).toEqual([0, 1, 2, 3]);
    expect(await repairAliceCorpusFragment(harness.runtime, harness.spec)).toBe(
      "complete",
    );
    expect(harness.getWrites()).toBe(1);
    expect(harness.getEmbeddingCalls()).toBe(1);
  });

  test("fails before writing when the embedding provider returns no vector", async () => {
    const harness = await fixture(false);
    await expect(
      repairAliceCorpusFragment(harness.runtime, harness.spec),
    ).rejects.toThrow("ALICE_CORPUS_V4_FRAGMENT_REPAIR_INVALID");
    expect(harness.getWrites()).toBe(0);
    expect(harness.getFragments()).toHaveLength(3);
  });
});
