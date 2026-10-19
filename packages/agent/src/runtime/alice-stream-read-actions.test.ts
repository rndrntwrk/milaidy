import { expect, test } from "bun:test";
import type { Action, IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { chatReadAction, streamStatusAction } from "@rndrntwrk/plugin-555stream";
import { enforceAliceActionExecutionBoundary } from "./alice-high-risk-action-boundary.js";

const agentId = "00000000-0000-4000-8000-000000000001" as UUID;
const ownerId = "00000000-0000-4000-8000-000000000002" as UUID;
const roomId = "00000000-0000-4000-8000-000000000003" as UUID;
const env = { ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only", ALICE_RUNTIME_PROFILE: "full-gated" };
const message = { id: "00000000-0000-4000-8000-000000000004", agentId, entityId: ownerId, roomId,
  content: { text: "How is my stream doing?", source: "discord" },
  metadata: { type: "message", source: "discord", fromBot: false } } as Memory;
function fixture() {
  let reads = 0;
  const runtime = {
    agentId, getSetting: (key: string) => key === "ELIZA_ADMIN_ENTITY_ID" ? ownerId : undefined,
    getEntityById: async () => null, getWorld: async () => null, getRoom: async () => null,
    reportError: () => {},
    getService: () => ({ isReady: () => true, getConfig: () => ({ defaultSessionId: "alice-session" }),
      getBoundSessionId: () => null,
      getStreamStatus: async () => { reads++; return { sessionId: "alice-session", status: "live", active: true, platforms: {} }; },
      getChatMessages: async () => { reads++; return { sessionId: "alice-session", count: 0, messages: [] }; },
    }),
  } as unknown as IAgentRuntime;
  return { runtime, reads: () => reads };
}

test("admits the exact native reads for an owner and rechecks authority at execution", async () => {
  for (const action of [streamStatusAction, chatReadAction]) {
    const { runtime, reads } = fixture();
    const guarded = enforceAliceActionExecutionBoundary(action as unknown as Action, env);
    expect(await guarded.validate(runtime, message)).toBe(true);
    expect(await guarded.handler(runtime, message)).toBe(true);
    expect(reads()).toBe(1);
    const stranger = { ...message, entityId: "00000000-0000-4000-8000-000000000099" as UUID };
    expect(await guarded.validate(runtime, stranger)).toBe(false);
    expect(await guarded.handler(runtime, stranger)).toMatchObject({ success: false, error: "ALICE_OWNER_REQUIRED" });
    expect(reads()).toBe(1);
  }
});

test("rejects same-name handlers, bot messages and incomplete owner context", async () => {
  const { runtime, reads } = fixture();
  const fake = { ...streamStatusAction, handler: async () => { throw new Error("unreviewed handler"); } } as unknown as Action;
  expect(await enforceAliceActionExecutionBoundary(fake, env).validate(runtime, message)).toBe(false);
  const guarded = enforceAliceActionExecutionBoundary(chatReadAction as unknown as Action, env);
  expect(await guarded.validate(runtime, { ...message, metadata: { ...message.metadata, fromBot: true } })).toBe(false);
  expect(await guarded.validate(runtime, { ...message, agentId: undefined } as unknown as Memory)).toBe(false);
  expect(reads()).toBe(0);
});
