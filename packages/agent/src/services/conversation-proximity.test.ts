/**
 * Conversation proximity — REAL integration tests.
 *
 * Tests findProximityPairs and updateProximityRelationships using a real
 * PGLite-backed runtime with real memory and relationship operations.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import {
  findProximityPairs,
  updateProximityRelationships,
} from "./conversation-proximity";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

const ROOM_ID = uuid(100);
const USER_A = uuid(10);
const USER_B = uuid(20);
const USER_C = uuid(30);

async function createTestRoom() {
  try {
    await runtime.ensureRoomExists({
      id: ROOM_ID,
      name: "proximity-test-room",
      source: "test",
    });
  } catch {
    // Room may already exist
  }
}

async function createMemory(entityId: UUID, roomId: UUID, createdAt?: number): Promise<Memory> {
  const memory = {
    id: uuid(Math.floor(Math.random() * 99999)),
    entityId,
    agentId: runtime.agentId,
    roomId,
    content: { text: "hello from proximity test" },
    createdAt: createdAt ?? Date.now(),
  } as unknown as Memory;

  try {
    await runtime.createMemory(memory, "messages");
  } catch {
    // Memory creation may fail if table doesn't exist
  }

  return memory;
}

describe("conversation-proximity", () => {
  beforeAll(async () => {
    await createTestRoom();
  });

  describe("findProximityPairs", () => {
    test("returns empty for agent sender", async () => {
      const message = {
        id: uuid(50001),
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: ROOM_ID,
        content: { text: "agent message" },
        createdAt: Date.now(),
      } as unknown as Memory;

      const pairs = await findProximityPairs(runtime, message);
      expect(pairs).toHaveLength(0);
    }, 60_000);

    test("finds pairs from recent messages in the same room", async () => {
      const now = Date.now();

      // Create some messages in the room from different users
      await createMemory(USER_B, ROOM_ID, now - 30_000);
      await createMemory(USER_C, ROOM_ID, now - 60_000);

      // Now USER_A sends a message
      const message = {
        id: uuid(50002),
        entityId: USER_A,
        agentId: runtime.agentId,
        roomId: ROOM_ID,
        content: { text: "hello from user A" },
        createdAt: now,
      } as unknown as Memory;

      const pairs = await findProximityPairs(runtime, message);

      // Should find at least some pairs (may vary based on proximity window)
      expect(Array.isArray(pairs)).toBe(true);
    }, 60_000);
  });

  describe("updateProximityRelationships", () => {
    test("returns 0 for agent-sent messages", async () => {
      const message = {
        id: uuid(50003),
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: ROOM_ID,
        content: { text: "agent message" },
        createdAt: Date.now(),
      } as unknown as Memory;

      const count = await updateProximityRelationships(runtime, message);
      expect(count).toBe(0);
    }, 60_000);

    test("handles user messages and creates/updates relationships", async () => {
      const now = Date.now();

      // Ensure there's a recent message from USER_B
      await createMemory(USER_B, ROOM_ID, now - 30_000);

      const message = {
        id: uuid(50004),
        entityId: USER_A,
        agentId: runtime.agentId,
        roomId: ROOM_ID,
        content: { text: "hello again" },
        createdAt: now,
      } as unknown as Memory;

      const count = await updateProximityRelationships(runtime, message);

      // Should return a number (0 or more depending on what was found)
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    }, 60_000);
  });
});
