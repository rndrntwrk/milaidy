/**
 * Role backfill provider — REAL integration tests.
 *
 * Tests roleBackfillProvider using a real PGLite-backed runtime
 * with real role resolution instead of mocking roles utilities.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { roleBackfillProvider } from "./role-backfill";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: "entity-role-backfill-001" as UUID,
    roomId: "room-role-backfill-001" as UUID,
    content: { text: "hello" },
    ...overrides,
  } as Memory;
}

describe("roleBackfillProvider", () => {
  it("returns a valid provider result", async () => {
    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("handles messages from unknown entities", async () => {
    const unknownMsg = makeMessage({
      entityId: "unknown-entity-backfill-xyz" as UUID,
    });

    const result = await roleBackfillProvider.get(
      runtime,
      unknownMsg,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("processes messages from different rooms", async () => {
    const differentRoomMsg = makeMessage({
      roomId: "room-role-backfill-002" as UUID,
    });

    const result = await roleBackfillProvider.get(
      runtime,
      differentRoomMsg,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);
});
