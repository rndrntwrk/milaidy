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

export type AliceReactionKind = "progress" | "hazard" | "watching";

const REACTION_EMOTE_IDS: Readonly<Record<AliceReactionKind, string>> = {
  progress: "dance-happy",
  hazard: "jump",
  watching: "looking-around",
};

function resolveAliceVrmEmote(kind: AliceReactionKind): AliceVrmEmote {
  const emoteId = REACTION_EMOTE_IDS[kind];
  const emote = EMOTE_BY_ID.get(emoteId);
  if (!emote) {
    throw new Error(`Alice reaction catalog is missing ${emoteId}`);
  }
  if (!/^\/animations\/emotes\/(?:dance-happy|jump|looking-around)\.glb(?:\.gz)?$/.test(emote.path)) {
    throw new Error(`Alice reaction catalog has an invalid asset for ${emoteId}`);
  }
  return {
    emoteId: emote.id,
    path: emote.path,
    duration: emote.duration,
    loop: emote.loop,
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
  ): Promise<{ ok: boolean; sent: boolean }>;
}

export class AliceReactionBridge {
  constructor(
    private readonly ports: {
      persistence: AliceReactionPersistencePort;
      streamControl: StreamControlBroadcastPort;
    },
  ) {}

  async persistThenBroadcast(
    sessionId: string,
    decision: AliceReactionDecision,
  ): Promise<void> {
    const emote = resolveAliceVrmEmote(decision.reactionKind);
    await this.ports.persistence.persistReaction(decision, emote);
    const result = await this.ports.streamControl.broadcastEvent(
      "emote",
      emote,
      sessionId,
    );
    if (!result.ok || !result.sent) {
      throw new Error("Alice VRM emote broadcast was not sent");
    }
  }
}
