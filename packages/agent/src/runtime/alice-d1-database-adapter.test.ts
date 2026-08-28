import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Agent, Memory, Room, Task, UUID, World } from "@elizaos/core";

import {
  type AliceElizaStateCommit,
  type AliceElizaStateRecord,
  type AliceElizaStateTransport,
  createAliceD1DatabaseAdapter,
  createAliceFullRuntimeDatabaseAdapter,
} from "./alice-d1-database-adapter";

const OWNER_ID = "alice-owner-production";
const AGENT_ID = "00000000-0000-4000-8000-000000000001" as UUID;
const WORLD_ID = "00000000-0000-4000-8000-000000000002" as UUID;
const ROOM_ID = "00000000-0000-4000-8000-000000000003" as UUID;
const ENTITY_ID = "00000000-0000-4000-8000-000000000004" as UUID;
const MEMORY_ID = "00000000-0000-4000-8000-000000000005" as UUID;
const TASK_ID = "00000000-0000-4000-8000-000000000006" as UUID;

class MemoryTransport implements AliceElizaStateTransport {
  revision = 0;
  commits: AliceElizaStateCommit[] = [];
  records = new Map<string, AliceElizaStateRecord>();
  failNextCommit = false;

  async load(ownerId: string) {
    expect(ownerId).toBe(OWNER_ID);
    return {
      revision: this.revision,
      records: [...this.records.values()].sort((left, right) =>
        `${left.collection}\0${left.key}`.localeCompare(
          `${right.collection}\0${right.key}`,
        ),
      ),
    };
  }

  async commit(input: AliceElizaStateCommit) {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error("STATE_REMOTE_UNAVAILABLE");
    }
    expect(input.ownerId).toBe(OWNER_ID);
    expect(input.expectedRevision).toBe(this.revision);
    for (const mutation of input.mutations) {
      const key = `${mutation.collection}\0${mutation.key}`;
      if (mutation.deleted) this.records.delete(key);
      else {
        this.records.set(key, {
          collection: mutation.collection,
          key: mutation.key,
          value: mutation.value,
        });
      }
    }
    this.revision += 1;
    this.commits.push(structuredClone(input));
    return { revision: this.revision };
  }
}

function agent(): Partial<Agent> {
  return {
    id: AGENT_ID,
    name: "Alice",
    username: "alice",
    bio: ["RNDRNTWRK service agent"],
  };
}

function world(): World {
  return {
    id: WORLD_ID,
    agentId: AGENT_ID,
    name: "Alice owner world",
    serverId: OWNER_ID,
    metadata: {},
  };
}

function room(): Room {
  return {
    id: ROOM_ID,
    agentId: AGENT_ID,
    worldId: WORLD_ID,
    source: "client_chat",
    type: "DM",
  };
}

function memory(): Memory {
  return {
    id: MEMORY_ID,
    agentId: AGENT_ID,
    roomId: ROOM_ID,
    entityId: ENTITY_ID,
    content: { text: "Durable hello from Alice" },
    createdAt: 1_777_000_000_000,
  };
}

function task(): Task {
  return {
    id: TASK_ID,
    name: "durable-canary",
    description: "survive replacement",
    roomId: ROOM_ID,
    worldId: WORLD_ID,
    tags: ["alice"],
    metadata: { status: "pending" },
  };
}

describe("Alice D1-backed Eliza database adapter", () => {
  test("enables the D1 adapter only for the exact full-gated Alice profile", () => {
    const transport = new MemoryTransport();
    expect(
      createAliceFullRuntimeDatabaseAdapter({
        env: {
          ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
          ALICE_RUNTIME_PROFILE: "full-gated",
          ALICE_STATE_OWNER_ID: OWNER_ID,
          ALICE_STATE_PLANE_URL:
            "http://alice-state-plane.internal/v1/eliza-database",
        },
        transport,
      }),
    ).toBeDefined();
    expect(
      createAliceFullRuntimeDatabaseAdapter({
        env: {
          ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
          ALICE_RUNTIME_PROFILE: "response-only",
        },
        transport,
      }),
    ).toBeUndefined();
    expect(() =>
      createAliceFullRuntimeDatabaseAdapter({
        env: {
          ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
          ALICE_RUNTIME_PROFILE: "full-gated",
          ALICE_STATE_OWNER_ID: OWNER_ID,
          ALICE_STATE_PLANE_URL: "https://public.example.invalid/state",
        },
        transport,
      }),
    ).toThrow("ALICE_D1_STATE_URL_INVALID");
  });

  test("wires the durable adapter into both cold start and hot reload", () => {
    const source = readFileSync(new URL("./eliza.ts", import.meta.url), "utf8");
    expect(source).toContain(
      "const aliceD1Adapter = createAliceFullRuntimeDatabaseAdapter",
    );
    expect(source).toContain(
      "...(aliceD1Adapter ? { adapter: aliceD1Adapter } : {})",
    );
    expect(source).toContain(
      "const freshAliceD1Adapter = createAliceFullRuntimeDatabaseAdapter",
    );
    expect(source).toContain("? { adapter: freshAliceD1Adapter }");
  });

  test("persists full adapter state and hydrates it after process replacement", async () => {
    const transport = new MemoryTransport();
    const first = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: (() => {
        let value = 0;
        return () => `operation-${++value}`;
      })(),
    });
    await first.initialize();

    await first.createAgents([agent()]);
    await first.createWorlds([world()]);
    await first.createRooms([room()]);
    await first.createEntities([
      {
        id: ENTITY_ID,
        agentId: AGENT_ID,
        names: ["Owner"],
        metadata: {},
      },
    ]);
    await first.createRoomParticipants([ENTITY_ID], ROOM_ID);
    await first.createMemories([{ memory: memory(), tableName: "messages" }]);
    await first.createTasks([task()]);

    expect(transport.commits.length).toBe(7);
    expect(
      new Set(
        [...transport.records.values()].map((record) => record.collection),
      ),
    ).toEqual(
      new Set([
        "agents",
        "entities",
        "memoriesById",
        "memoriesByRoom",
        "participantsByRoom",
        "rooms",
        "roomsByParticipant",
        "tasks",
        "worlds",
      ]),
    );
    const expectedAfterRestart = {
      agents: await first.getAgentsByIds([AGENT_ID]),
      worlds: await first.getWorldsByIds([WORLD_ID]),
      rooms: await first.getRoomsByIds([ROOM_ID]),
      participants: await first.getParticipantsForRooms([ROOM_ID]),
      memories: await first.getMemoriesByIds([MEMORY_ID]),
      tasks: await first.getTasksByIds([TASK_ID]),
    };
    expect(expectedAfterRestart.memories[0]?.content.text).toBe(
      "Durable hello from Alice",
    );

    const replacement = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "replacement-operation",
    });
    await replacement.initialize();

    expect(await replacement.getAgentsByIds([AGENT_ID])).toEqual(
      expectedAfterRestart.agents,
    );
    expect(await replacement.getWorldsByIds([WORLD_ID])).toEqual(
      expectedAfterRestart.worlds,
    );
    expect(await replacement.getRoomsByIds([ROOM_ID])).toEqual(
      expectedAfterRestart.rooms,
    );
    expect(await replacement.getParticipantsForRooms([ROOM_ID])).toEqual(
      expectedAfterRestart.participants,
    );
    expect(await replacement.getMemoriesByIds([MEMORY_ID])).toEqual(
      expectedAfterRestart.memories,
    );
    expect(await replacement.getTasksByIds([TASK_ID])).toEqual(
      expectedAfterRestart.tasks,
    );
  });

  test("round-trips user objects whose $aliceType key collides with codec tags", async () => {
    const transport = new MemoryTransport();
    const first = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "reserved-tag-write",
    });
    await first.initialize();
    const userValue = {
      $aliceType: "date",
      value: 42,
      nested: { $aliceType: "set", values: ["one", "two"] },
    };
    await first.createMemories([
      {
        memory: {
          ...memory(),
          content: { text: "reserved marker", userValue },
        } as Memory,
        tableName: "messages",
      },
    ]);

    const replacement = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "reserved-tag-replacement",
    });
    await replacement.initialize();
    const restored = await replacement.getMemoriesByIds([MEMORY_ID]);
    expect(restored[0]?.content.userValue).toEqual(userValue);
  });

  test("preserves token usage counters while removing exact credential fields", async () => {
    const transport = new MemoryTransport();
    const adapter = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "usage-sanitization",
    });
    await adapter.initialize();
    await adapter.createMemories([
      {
        memory: {
          ...memory(),
          content: {
            text: "usage record",
            usage: {
              promptTokens: 11,
              completionTokens: 7,
              totalTokens: 18,
              tokenCount: 18,
              apiToken: "must-not-persist",
              authToken: "auth-must-not-persist",
              bearerToken: "bearer-must-not-persist",
              oauthToken: "oauth-must-not-persist",
              secretKey: "key-must-not-persist",
              accessTokenSecret: "compound-must-not-persist",
            },
          },
        } as Memory,
        tableName: "messages",
      },
    ]);

    const serialized = JSON.stringify([...transport.records.values()]);
    expect(serialized).toContain('"promptTokens":11');
    expect(serialized).toContain('"completionTokens":7');
    expect(serialized).toContain('"totalTokens":18');
    expect(serialized).toContain('"tokenCount":18');
    expect(serialized).not.toContain("must-not-persist");
    expect(serialized).not.toContain("apiToken");
    for (const credentialField of [
      "authToken",
      "bearerToken",
      "oauthToken",
      "secretKey",
      "accessTokenSecret",
    ]) {
      expect(serialized).not.toContain(credentialField);
    }

    const replacement = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "usage-sanitization-replacement",
    });
    await replacement.initialize();
    const restored = await replacement.getMemoriesByIds([MEMORY_ID]);
    expect(restored[0]?.content.usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      tokenCount: 18,
    });
  });

  test("rolls the local mutation back when the canonical D1 commit fails", async () => {
    const transport = new MemoryTransport();
    const adapter = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "failed-operation",
    });
    await adapter.initialize();
    await adapter.createAgents([agent()]);

    transport.failNextCommit = true;
    await expect(
      adapter.updateAgents([
        { agentId: AGENT_ID, agent: { name: "Non-canonical name" } },
      ]),
    ).rejects.toThrow("STATE_REMOTE_UNAVAILABLE");
    expect(await adapter.getAgentsByIds([AGENT_ID])).toEqual([agent()]);
  });

  test("does not expose tentative local state before the canonical commit completes", async () => {
    const transport = new MemoryTransport();
    const originalCommit = transport.commit.bind(transport);
    let releaseCommit!: () => void;
    let markCommitStarted!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    transport.commit = async (input) => {
      markCommitStarted();
      await commitGate;
      return originalCommit(input);
    };
    const adapter = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "serialized-read-operation",
    });
    await adapter.initialize();

    const pendingMutation = adapter.createAgents([agent()]);
    await commitStarted;
    let readResolved = false;
    const pendingRead = adapter.getAgentsByIds([AGENT_ID]).then((value) => {
      readResolved = true;
      return value;
    });
    await Promise.resolve();
    expect(readResolved).toBe(false);

    releaseCommit();
    await pendingMutation;
    expect(await pendingRead).toEqual([agent()]);
  });

  test("commits a transaction once and restores the exact pre-transaction state on error", async () => {
    const transport = new MemoryTransport();
    let operation = 0;
    const adapter = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => `transaction-${++operation}`,
    });
    await adapter.initialize();

    await adapter.transaction(async (tx) => {
      await tx.createAgents([agent()]);
      await tx.createWorlds([world()]);
      return true;
    });
    expect(transport.commits).toHaveLength(1);

    await expect(
      adapter.transaction(async (tx) => {
        await tx.createRooms([room()]);
        throw new Error("abort-this-transaction");
      }),
    ).rejects.toThrow("abort-this-transaction");
    expect(await adapter.getRoomsByIds([ROOM_ID])).toEqual([]);
    expect(transport.commits).toHaveLength(1);
  });

  test("never persists raw character secrets even when legacy agent state contains them", async () => {
    const transport = new MemoryTransport();
    const adapter = createAliceD1DatabaseAdapter({
      ownerId: OWNER_ID,
      transport,
      operationId: () => "secret-sanitization",
    });
    await adapter.initialize();

    await adapter.createAgents([
      {
        ...agent(),
        settings: {
          secrets: { DISCORD_API_TOKEN: "must-not-leave-the-container" },
        },
      } as Partial<Agent>,
    ]);

    const serialized = JSON.stringify([...transport.records.values()]);
    expect(serialized).not.toContain("must-not-leave-the-container");
    expect(serialized).not.toContain("DISCORD_API_TOKEN");
  });
});
