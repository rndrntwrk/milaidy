import { EMOTE_BY_ID } from "../../emotes/catalog.js";

export interface AliceVrmEmote {
  emoteId: string;
  path: string;
  duration: number;
  loop: boolean;
}

export interface AliceReactionDecision {
  decisionId: string;
  gameRunId: string;
  sourceObservationSequence: number;
  rawObservationDigest: string;
  reason: string;
  reactionKind: AliceReactionKind;
}

export type AliceReactionKind = "progress" | "hazard" | "watching" | "loss";

const REACTION_EMOTE_IDS: Readonly<Record<AliceReactionKind, string>> = {
  progress: "dance-happy",
  hazard: "looking-around",
  watching: "looking-around",
  loss: "sorrow",
};

function resolveAliceVrmEmote(kind: AliceReactionKind): AliceVrmEmote {
  const emoteId = REACTION_EMOTE_IDS[kind];
  const emote = EMOTE_BY_ID.get(emoteId);
  if (!emote) {
    throw new Error(`Alice reaction catalog is missing ${emoteId}`);
  }
  if (
    !/^\/animations\/emotes\/(?:dance-happy|looking-around|sorrow)\.glb(?:\.gz)?$/.test(
      emote.path,
    )
  ) {
    throw new Error(
      `Alice reaction catalog has an invalid asset for ${emoteId}`,
    );
  }
  return {
    emoteId: emote.id,
    path: emote.path,
    duration: emote.duration,
    loop: false,
  };
}

export interface AliceReactionPersistencePort {
  persistReaction(
    decision: AliceReactionDecision,
    emote: AliceVrmEmote,
  ): Promise<void>;
}

export interface StreamControlBroadcastPort {
  broadcastEvent(
    topic: "emote",
    payload: AliceVrmEmote,
    sessionId: string,
    expectedDispatchId?: string,
  ): Promise<AliceReactionDelivery>;
}

export interface AliceReactionDelivery {
  ok: boolean;
  sent: boolean;
  eventId?: string;
  createdAt?: number;
}

export class AliceReactionBridge {
  constructor(
    private readonly ports: {
      persistence: AliceReactionPersistencePort;
      streamControl: StreamControlBroadcastPort;
      broadcastWs?: (payload: Record<string, unknown>) => void;
    },
  ) {}

  persistThenBroadcast(
    sessionId: string,
    decision: AliceReactionDecision,
  ): Promise<void>;
  persistThenBroadcast(
    sessionId: string,
    decision: AliceReactionDecision,
    expectedDispatchId: string,
    accepted?: (delivery: AliceReactionDelivery) => Promise<void>,
  ): Promise<AliceReactionDelivery>;
  async persistThenBroadcast(
    sessionId: string,
    decision: AliceReactionDecision,
    expectedDispatchId?: string,
    accepted?: (delivery: AliceReactionDelivery) => Promise<void>,
  ): Promise<AliceReactionDelivery | void> {
    const emote = resolveAliceVrmEmote(decision.reactionKind);
    await this.ports.persistence.persistReaction(decision, emote);
    const result = await this.ports.streamControl.broadcastEvent(
      "emote",
      emote,
      sessionId,
      expectedDispatchId,
    );
    if (!result.ok || !result.sent) {
      throw new Error("Alice VRM emote broadcast was not sent");
    }
    await accepted?.(result);
    this.ports.broadcastWs?.({ type: "emote", ...emote });
    return result;
  }
}
