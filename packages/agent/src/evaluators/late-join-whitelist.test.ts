/**
 * Late-join whitelist evaluator — REAL integration tests.
 *
 * Tests the evaluator using a real PGLite-backed runtime with real
 * role resolution and config loading.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { lateJoinWhitelistEvaluator } from "./late-join-whitelist";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

const ENTITY_ID = "entity-late-join-001" as UUID;
const ROOM_ID = "room-late-join-001" as UUID;

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: ENTITY_ID,
    roomId: ROOM_ID,
    content: { text: "hello" },
    ...overrides,
  } as Memory;
}

describe("lateJoinWhitelistEvaluator", () => {
  it("has correct metadata", () => {
    expect(lateJoinWhitelistEvaluator.name).toBe("late_join_whitelist");
    expect(lateJoinWhitelistEvaluator.alwaysRun).toBe(true);
  });

  it("validate returns a boolean", async () => {
    const result = await lateJoinWhitelistEvaluator.validate(
      runtime,
      makeMessage(),
    );
    expect(typeof result).toBe("boolean");
  }, 60_000);

  it("handler executes without throwing", async () => {
    // The handler may or may not set a role depending on config/whitelist state.
    // With a fresh runtime and no configured whitelist, it should be a no-op.
    await expect(
      lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as never,
      ),
    ).resolves.not.toThrow();
  }, 60_000);

  it("processes messages from unknown entities gracefully", async () => {
    const unknownEntityMsg = makeMessage({
      entityId: "unknown-entity-xyz-late-join" as UUID,
    });

    const valid = await lateJoinWhitelistEvaluator.validate(
      runtime,
      unknownEntityMsg,
    );
    expect(typeof valid).toBe("boolean");

    if (valid) {
      await expect(
        lateJoinWhitelistEvaluator.handler(
          runtime,
          unknownEntityMsg,
          {} as never,
        ),
      ).resolves.not.toThrow();
    }
  }, 60_000);
});
