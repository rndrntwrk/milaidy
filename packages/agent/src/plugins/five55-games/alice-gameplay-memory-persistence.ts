import { randomUUID } from "node:crypto";
import type { Memory } from "@elizaos/core";
import type { AliceReactionPersistencePort, AliceReactionDecision, AliceVrmEmote } from "./alice-reaction-bridge.js";
import type {
  AliceGameplayMasteryPort,
  AliceGameplayReflectionPort,
} from "./drive555-rehearsal-supervisor.js";

export interface AliceGameplayMemoryRuntime {
  agentId: Memory["entityId"];
  createMemory(memory: Memory, table: "messages"): Promise<unknown>;
}

/**
 * Alice's durable local learning boundary. It records authority-backed control
 * outcomes and reaction decisions in her runtime memory; transport services do
 * not become the source of Alice's mastery state.
 */
export class AliceGameplayMemoryPersistence
  implements AliceGameplayReflectionPort, AliceGameplayMasteryPort, AliceReactionPersistencePort
{
  constructor(
    private readonly runtime: AliceGameplayMemoryRuntime,
    private readonly roomId: Memory["roomId"],
  ) {}

  async persistControlReflection(
    value: Parameters<AliceGameplayReflectionPort["persistControlReflection"]>[0],
  ): Promise<void> {
    await this.persist(
      "alice.gameplay.control_reflection.v1",
      `Alice verified gameplay control ${value.decisionId} at observation ${value.sourceObservationSequence}.`,
      value,
    );
  }

  async persistVerifiedMasteryOutcome(
    value: Parameters<AliceGameplayMasteryPort["persistVerifiedMasteryOutcome"]>[0],
  ): Promise<void> {
    await this.persist(
      "alice.gameplay.mastery_outcome.v1",
      `Alice verified ${value.strategyFamily} policy ${value.gameplayPolicyId}@${value.gameplayPolicyVersion} after control decision ${value.decisionId}.`,
      value,
    );
  }

  async persistReaction(
    decision: AliceReactionDecision,
    emote: AliceVrmEmote,
  ): Promise<void> {
    await this.persist(
      "alice.gameplay.reaction_decision.v1",
      `Alice selected ${decision.reactionKind} reaction ${emote.emoteId} for gameplay observation ${decision.sourceObservationSequence}.`,
      {
        ...decision,
        emoteId: emote.emoteId,
        emotePath: emote.path,
        emoteDuration: emote.duration,
        emoteLoop: emote.loop,
      },
    );
  }

  private async persist(
    kind: string,
    text: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.runtime.createMemory(
      {
        id: randomUUID() as Memory["id"],
        entityId: this.runtime.agentId,
        roomId: this.roomId,
        content: {
          text,
          source: "alice-gameplay",
          type: "system",
          metadata: { kind, ...metadata },
        },
      } as Memory,
      "messages",
    );
  }
}
