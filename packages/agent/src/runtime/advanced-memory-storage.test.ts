import {
  AgentRuntime,
  type Character,
  type IAgentRuntime,
  type Plugin,
  Service,
  type UUID,
} from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import { AdvancedMemoryStorageService } from "./advanced-memory-storage";

type RuntimeMemoryService = {
  storeLongTermMemory: (memory: {
    agentId: UUID;
    entityId: UUID;
    category: "episodic" | "semantic" | "procedural";
    content: string;
    confidence?: number;
    source?: string;
    metadata?: Record<string, unknown>;
    embedding?: number[];
  }) => Promise<{
    id: UUID;
    entityId: UUID;
    content: string;
    confidence?: number;
  }>;
  getLongTermMemories: (
    entityId: UUID,
    category?: "episodic" | "semantic" | "procedural",
    limit?: number,
  ) => Promise<
    Array<{ id: UUID; entityId: UUID; content: string; confidence?: number }>
  >;
  updateLongTermMemory: (
    id: UUID,
    entityId: UUID,
    updates: {
      content?: string;
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
  deleteLongTermMemory: (id: UUID, entityId: UUID) => Promise<void>;
  storeSessionSummary: (summary: {
    agentId: UUID;
    roomId: UUID;
    entityId?: UUID;
    summary: string;
    messageCount: number;
    lastMessageOffset: number;
    startTime: Date;
    endTime: Date;
    topics?: string[];
    metadata?: Record<string, unknown>;
    embedding?: number[];
  }) => Promise<{ id: UUID; summary: string; messageCount: number }>;
  getCurrentSessionSummary: (roomId: UUID) => Promise<{
    id: UUID;
    summary: string;
    messageCount: number;
    topics?: string[];
  } | null>;
  updateSessionSummary: (
    id: UUID,
    roomId: UUID,
    updates: {
      summary?: string;
      messageCount?: number;
      lastMessageOffset?: number;
      endTime?: Date;
      topics?: string[];
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
  getSessionSummaries: (
    roomId: UUID,
    limit?: number,
  ) => Promise<
    Array<{
      id: UUID;
      summary: string;
      messageCount: number;
      topics?: string[];
    }>
  >;
};

class StubEntityResolutionService extends Service {
  static serviceType = "entity_resolution" as const;
  static links = new Map<UUID, UUID[]>();
  capabilityDescription =
    "Stub entity-resolution service for advanced-memory tests";
  private initialized = false;

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new StubEntityResolutionService(runtime);
    await service.initialize(runtime);
    return service;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;
    this.initialized = true;
  }

  async stop(): Promise<void> {
    this.initialized = false;
  }

  async getConfirmedLinks(
    entityId: UUID,
  ): Promise<Array<{ entityA: UUID; entityB: UUID; status: "confirmed" }>> {
    return (StubEntityResolutionService.links.get(entityId) ?? []).map(
      (other) => ({
        entityA: entityId,
        entityB: other,
        status: "confirmed" as const,
      }),
    );
  }
}

/**
 * Core starts services without awaiting order; MemoryService may capture a null
 * memoryStorage at init. Re-bind when storage appears so integration tests match
 * production when the storage plugin wins the race.
 */
async function ensureMemoryServiceHasStorage(runtime: IAgentRuntime): Promise<void> {
  const storage = await runtime.getServiceLoadPromise("memoryStorage");
  const memory = await runtime.getServiceLoadPromise("memory");
  const memoryLike = memory as { storage?: unknown };
  if (storage && memoryLike.storage == null) {
    memoryLike.storage = storage;
  }
}

function createRuntimeWithAdvancedMemory(
  extraServices: NonNullable<Plugin["services"]> = [],
): AgentRuntime {
  const integrationPlugin: Plugin = {
    name: "advanced-memory-storage-test",
    description: "Advanced memory storage test plugin",
    services: [AdvancedMemoryStorageService, ...extraServices],
  };

  const character: Character = {
    name: "Milady",
    bio: ["Test"],
    templates: {},
    messageExamples: [],
    postExamples: [],
    topics: [],
    adjectives: [],
    knowledge: [],
    advancedMemory: true,
    secrets: {},
  };

  return new AgentRuntime({ character, plugins: [integrationPlugin] });
}

describe("AdvancedMemoryStorageService", () => {
  const runtimes: AgentRuntime[] = [];

  afterEach(async () => {
    StubEntityResolutionService.links.clear();
    await Promise.all(
      runtimes.splice(0).map(async (runtime) => {
        await runtime.stop();
      }),
    );
  });

  it("boots the built-in advanced-memory plugin against Milady's storage backend", async () => {
    const runtime = createRuntimeWithAdvancedMemory();
    runtimes.push(runtime);

    await runtime.initialize({ allowNoDatabase: true, skipMigrations: true });

    const memoryStorage = await runtime.getServiceLoadPromise("memoryStorage");
    const memory = await runtime.getServiceLoadPromise("memory");

    expect(memoryStorage).toBeTruthy();
    expect(memory).toBeTruthy();
    expect(
      runtime.providers.some(
        (provider) => provider.name === "LONG_TERM_MEMORY",
      ),
    ).toBe(true);
    expect(
      runtime.providers.some(
        (provider) => provider.name === "SUMMARIZED_CONTEXT",
      ),
    ).toBe(true);
    expect(
      runtime.evaluators.some(
        (evaluator) => evaluator.name === "MEMORY_SUMMARIZATION",
      ),
    ).toBe(true);
    expect(
      runtime.evaluators.some(
        (evaluator) => evaluator.name === "LONG_TERM_MEMORY_EXTRACTION",
      ),
    ).toBe(true);
  });

  it("stores long-term memories once and retrieves them across confirmed identity links", async () => {
    const runtime = createRuntimeWithAdvancedMemory([
      StubEntityResolutionService,
    ]);
    runtimes.push(runtime);

    await runtime.initialize({ allowNoDatabase: true, skipMigrations: true });
    await ensureMemoryServiceHasStorage(runtime);

    const entityA = "11111111-1111-1111-1111-111111111111" as UUID;
    const entityB = "22222222-2222-2222-2222-222222222222" as UUID;
    StubEntityResolutionService.links.set(entityA, [entityB]);
    StubEntityResolutionService.links.set(entityB, [entityA]);

    const memoryService = (await runtime.getServiceLoadPromise(
      "memory",
    )) as unknown as RuntimeMemoryService;

    const stored = await memoryService.storeLongTermMemory({
      agentId: runtime.agentId,
      entityId: entityA,
      category: "semantic",
      content: "Chris prefers short emails and fast follow-ups.",
      confidence: 0.93,
      source: "conversation",
      metadata: { channel: "discord" },
    });

    expect(stored.entityId).toBe(entityA);

    const viaLinkedIdentity = await memoryService.getLongTermMemories(
      entityB,
      undefined,
      10,
    );
    expect(viaLinkedIdentity).toHaveLength(1);
    expect(viaLinkedIdentity[0]?.content).toContain("short emails");

    await memoryService.updateLongTermMemory(stored.id, entityB, {
      content:
        "Chris prefers short emails, concise subjects, and fast follow-ups.",
      confidence: 0.97,
      metadata: { channel: "telegram" },
    });

    const updated = await memoryService.getLongTermMemories(
      entityA,
      undefined,
      10,
    );
    expect(updated[0]?.content).toContain("concise subjects");
    expect(updated[0]?.confidence).toBe(0.97);

    await memoryService.deleteLongTermMemory(stored.id, entityA);
    const afterDelete = await memoryService.getLongTermMemories(
      entityB,
      undefined,
      10,
    );
    expect(afterDelete).toEqual([]);
  });

  it("stores and updates per-room session summaries through the same storage adapter", async () => {
    const runtime = createRuntimeWithAdvancedMemory();
    runtimes.push(runtime);

    await runtime.initialize({ allowNoDatabase: true, skipMigrations: true });
    await ensureMemoryServiceHasStorage(runtime);

    const roomId = "33333333-3333-3333-3333-333333333333" as UUID;
    const entityId = "44444444-4444-4444-4444-444444444444" as UUID;
    const memoryService = (await runtime.getServiceLoadPromise(
      "memory",
    )) as unknown as RuntimeMemoryService;

    const stored = await memoryService.storeSessionSummary({
      agentId: runtime.agentId,
      roomId,
      entityId,
      summary: "Chris asked for a rollout update and the latest benchmarks.",
      messageCount: 12,
      lastMessageOffset: 12,
      startTime: new Date("2026-04-08T10:00:00.000Z"),
      endTime: new Date("2026-04-08T10:20:00.000Z"),
      topics: ["rollout", "benchmarks"],
      metadata: { keyPoints: ["needs ETA"] },
    });

    expect(stored.summary).toContain("rollout update");

    const current = await memoryService.getCurrentSessionSummary(roomId);
    expect(current?.summary).toContain("rollout update");
    expect(current?.topics).toEqual(["rollout", "benchmarks"]);

    await memoryService.updateSessionSummary(stored.id, roomId, {
      summary:
        "Chris asked for a rollout update, the latest benchmarks, and the deployment ETA.",
      messageCount: 14,
      lastMessageOffset: 14,
      endTime: new Date("2026-04-08T10:28:00.000Z"),
      topics: ["rollout", "benchmarks", "deployment"],
      metadata: { keyPoints: ["needs ETA", "wants deploy window"] },
    });

    const refreshed = await memoryService.getCurrentSessionSummary(roomId);
    expect(refreshed?.summary).toContain("deployment ETA");
    expect(refreshed?.messageCount).toBe(14);

    const summaries = await memoryService.getSessionSummaries(roomId, 5);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.topics).toEqual([
      "rollout",
      "benchmarks",
      "deployment",
    ]);
  });
});
