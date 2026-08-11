import { describe, expect, it } from "bun:test";
import {
  AliceReactionBridge,
  type AliceReactionDecision,
} from "./alice-reaction-bridge.js";

const decision: AliceReactionDecision = {
  decisionId: "reaction-1",
  gameRunId: "run-1",
  sourceObservationSequence: 7,
  rawObservationDigest: "a".repeat(64),
  reason: "checkpoint.reached",
  reactionKind: "progress",
};

describe("AliceReactionBridge", () => {
  it("persists Alice's reaction decision before broadcasting the real VRM emote", async () => {
    const events: string[] = [];
    let deliveredPayload: unknown;
    const bridge = new AliceReactionBridge({
      persistence: {
        persistReaction: async (value, emote) => {
          events.push(`persist:${value.decisionId}:${value.reactionKind}:${emote.emoteId}`);
        },
      },
      streamControl: {
        broadcastEvent: async (topic, payload, sessionId) => {
          const emote = payload as { emoteId?: string };
          deliveredPayload = payload;
          events.push(`broadcast:${topic}:${emote.emoteId}:${sessionId}`);
          return { ok: true, sent: true };
        },
      },
    });

    await bridge.persistThenBroadcast("session-1", decision);

    expect(events).toEqual([
      "persist:reaction-1:progress:dance-happy",
      "broadcast:emote:dance-happy:session-1",
    ]);
    expect(deliveredPayload).toEqual({
      emoteId: "dance-happy",
      path: "/animations/emotes/dance-happy.glb.gz",
      duration: 4,
      loop: true,
    });
  });

  it("does not emit a VRM event when Alice cannot persist the decision", async () => {
    let broadcasts = 0;
    const bridge = new AliceReactionBridge({
      persistence: {
        persistReaction: async () => {
          throw new Error("Alice persistence unavailable");
        },
      },
      streamControl: {
        broadcastEvent: async () => {
          broadcasts += 1;
          return { ok: true, sent: true };
        },
      },
    });

    await expect(bridge.persistThenBroadcast("session-1", decision)).rejects.toThrow(
      "Alice persistence unavailable",
    );
    expect(broadcasts).toBe(0);
  });
});
