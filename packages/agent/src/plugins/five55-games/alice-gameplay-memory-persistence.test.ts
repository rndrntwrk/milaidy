import { describe, expect, it } from "bun:test";
import type { Memory } from "@elizaos/core";
import {
  AliceGameplayMemoryPersistence,
  type AliceGameplayMemoryRuntime,
} from "./alice-gameplay-memory-persistence.js";

interface StoredGameplayMemory {
  entityId: unknown;
  roomId: unknown;
  content: { metadata: Record<string, unknown> };
}

describe("AliceGameplayMemoryPersistence", () => {
  it("persists Alice-owned reflection, mastery, and reaction decisions before downstream broadcast", async () => {
    const writes: Array<{ memory: StoredGameplayMemory; table: "messages" }> = [];
    const runtime: AliceGameplayMemoryRuntime = {
      agentId: "alice-agent" as Memory["entityId"],
      async createMemory(memory, table) {
        writes.push({ memory: memory as unknown as StoredGameplayMemory, table });
      },
    };
    const persistence = new AliceGameplayMemoryPersistence(
      runtime,
      "alice-room",
    );

    await persistence.persistControlReflection({
      gameRunId: "run-1",
      sourceId: "source-1",
      fence: 7,
      decisionId: "decision-1",
      directiveId: "directive-1",
      sourceObservationSequence: 42,
      rawObservationDigest: "a".repeat(64),
      reflectedReceiptId: "receipt-1",
      reflectedObservationSequence: 42,
    });
    await persistence.persistVerifiedMasteryOutcome({
      gameId: "555drive",
      gameRunId: "run-1",
      sourceId: "source-1",
      fence: 7,
      goal: "stay on the racing line",
      strategyFamily: "racing-line",
      gameplayPolicyId: "alice.555drive.racing-line",
      gameplayPolicyVersion: 1,
      gameplayPolicyDigest: "b".repeat(64),
      directiveId: "directive-1",
      directiveDigest: "c".repeat(64),
      controllerId: "racing_line",
      controllerVersion: "1.0.0",
      controllerDigest: "d".repeat(64),
      decisionId: "decision-1",
      baselineSourceObservationSequence: 41,
      reflectedSourceObservationSequence: 42,
      rawObservationDigest: "a".repeat(64),
      reflectedReceiptId: "receipt-1",
    });
    await persistence.persistReaction(
      {
        decisionId: "decision-1",
        gameRunId: "run-1",
        sourceObservationSequence: 42,
        rawObservationDigest: "a".repeat(64),
        reason: "pursue_objective",
        reactionKind: "progress",
      },
      {
        emoteId: "dance-happy",
        path: "/animations/emotes/dance-happy.glb.gz",
        duration: 4,
        loop: true,
      },
    );

    expect(writes).toHaveLength(3);
    expect(writes.map((entry) => entry.table)).toEqual(["messages", "messages", "messages"]);
    expect(writes[0]?.memory.entityId).toBe("alice-agent");
    expect(writes[0]?.memory.roomId).toBe("alice-room");
    expect(writes[0]?.memory.content.metadata).toMatchObject({
      kind: "alice.gameplay.control_reflection.v1",
      decisionId: "decision-1",
      rawObservationDigest: "a".repeat(64),
    });
    expect(writes[1]?.memory.content.metadata).toMatchObject({
      kind: "alice.gameplay.mastery_outcome.v1",
      gameId: "555drive",
      gameplayPolicyId: "alice.555drive.racing-line",
      gameplayPolicyVersion: 1,
      directiveDigest: "c".repeat(64),
      controllerDigest: "d".repeat(64),
      decisionId: "decision-1",
    });
    expect(writes[2]?.memory.content.metadata).toMatchObject({
      kind: "alice.gameplay.reaction_decision.v1",
      reactionKind: "progress",
      emoteId: "dance-happy",
    });
  });
});
