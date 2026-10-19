import { createHash, randomUUID } from "node:crypto";
import type { Memory } from "@elizaos/core";
import type {
  AliceReactionPersistencePort,
  AliceReactionDecision,
  AliceVrmEmote,
} from "./alice-reaction-bridge.js";
import type {
  AliceGameplayMasteryPort,
  AliceGameplayReflectionPort,
} from "./drive555-rehearsal-supervisor.js";

export interface AliceGameplayMemoryRuntime {
  agentId: Memory["entityId"];
  createMemory(memory: Memory, table: "messages"): Promise<unknown>;
  getMemoryById?(id: Memory["id"]): Promise<Memory | null>;
  updateMemory?(memory: Memory): Promise<unknown>;
}

/**
 * Alice's durable local learning boundary. It records authority-backed control
 * outcomes and reaction decisions in her runtime memory; transport services do
 * not become the source of Alice's mastery state.
 */
export class AliceGameplayMemoryPersistence
  implements
    AliceGameplayReflectionPort,
    AliceGameplayMasteryPort,
    AliceReactionPersistencePort
{
  constructor(
    private readonly runtime: AliceGameplayMemoryRuntime,
    private readonly roomId: Memory["roomId"],
  ) {}

  async persistControlReflection(
    value: Parameters<
      AliceGameplayReflectionPort["persistControlReflection"]
    >[0],
  ): Promise<void> {
    await this.persist(
      "alice.gameplay.control_reflection.v1",
      `Alice verified gameplay control ${value.decisionId} at observation ${value.sourceObservationSequence}.`,
      value,
    );
  }

  async persistVerifiedMasteryOutcome(
    value: Parameters<
      AliceGameplayMasteryPort["persistVerifiedMasteryOutcome"]
    >[0],
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
    const id = this.observationMemoryId(`reaction:${decision.decisionId}`);
    if (this.runtime.getMemoryById && (await this.runtime.getMemoryById(id)))
      return;
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
      id,
    );
  }

  observationMemoryId(key: string): Memory["id"] {
    const hex = createHash("sha256")
      .update(`${this.runtime.agentId}:alice-observation:${key}`)
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}` as Memory["id"];
  }

  async readObservationState(
    key: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.runtime.getMemoryById || !this.runtime.updateMemory)
      throw new Error("Alice durable observation persistence unavailable");
    const memory = await this.runtime.getMemoryById(
      this.observationMemoryId(key),
    );
    return (
      (memory?.content.metadata as Record<string, unknown> | undefined) ?? null
    );
  }

  async writeObservationState(
    key: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.readObservationState(key);
    const memory = {
      id: this.observationMemoryId(key),
      entityId: this.runtime.agentId,
      roomId: this.roomId,
      content: {
        text: "Alice observed gameplay; no applied control or mastery is claimed.",
        source: "alice-gameplay",
        type: "system",
        metadata,
      },
    } as Memory;
    if (existing) await this.runtime.updateMemory!(memory);
    else await this.runtime.createMemory(memory, "messages");
  }

  private async persist(
    kind: string,
    text: string,
    metadata: Record<string, unknown>,
    id: Memory["id"] = randomUUID() as Memory["id"],
  ): Promise<void> {
    await this.runtime.createMemory(
      {
        id,
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
