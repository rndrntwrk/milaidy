import { createHash } from "node:crypto";
import { AliceGameplayMemoryPersistence } from "./alice-gameplay-memory-persistence.js";
import {
  AliceReactionBridge,
  type AliceReactionDelivery,
  type AliceReactionDecision,
} from "./alice-reaction-bridge.js";

export interface AliceGameplayObservation {
  version: 1;
  sessionId: string;
  dispatchId: string;
  sourceId: string;
  gameId: "555drive";
  runId: string;
  sequence: number;
  observedAt: number;
  kind: "run_started" | "checkpoint" | "impact" | "won" | "lost" | "run_ended";
  data: Record<string, unknown>;
  digest: string;
}
const id = (v: unknown) =>
  typeof v === "string" &&
  /^[A-Za-z0-9_.:-]{1,128}$/.test(v) &&
  v !== "." &&
  v !== "..";
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
export function validateAliceGameplayObservation(
  value: unknown,
  now = Date.now(),
): AliceGameplayObservation {
  if (
    !plain(value) ||
    Buffer.byteLength(JSON.stringify(value), "utf8") > 4096 ||
    Object.keys(value).sort().join() !==
      "data,digest,dispatchId,gameId,kind,observedAt,runId,sequence,sessionId,sourceId,version" ||
    value.version !== 1 ||
    value.gameId !== "555drive" ||
    ![value.sessionId, value.dispatchId, value.sourceId, value.runId].every(
      id,
    ) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !Number.isSafeInteger(value.observedAt) ||
    Number(value.observedAt) < now - 30000 ||
    Number(value.observedAt) > now + 1000 ||
    typeof value.kind !== "string" ||
    ![
      "run_started",
      "checkpoint",
      "impact",
      "won",
      "lost",
      "run_ended",
    ].includes(value.kind) ||
    !plain(value.data) ||
    Buffer.byteLength(JSON.stringify(value.data), "utf8") > 512
  )
    throw new Error("Invalid gameplay observation");
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(value.data).sort()) {
    const v = value.data[key];
    if (
      !(
        (key === "level" &&
          Number.isInteger(v) &&
          Number(v) >= 0 &&
          Number(v) <= 1000) ||
        (key === "score" &&
          typeof v === "number" &&
          Number.isFinite(v) &&
          v >= 0 &&
          v <= 1e12) ||
        (key === "contact" &&
          typeof v === "string" &&
          ["vehicle", "track"].includes(v)) ||
        (key === "reason" && v === "timeout") ||
        (key === "won" && typeof v === "boolean")
      )
    )
      throw new Error("Invalid gameplay observation data");
    data[key] = v;
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        value.version,
        value.sessionId,
        value.dispatchId,
        value.sourceId,
        value.gameId,
        value.runId,
        value.sequence,
        value.observedAt,
        value.kind,
        data,
      ]),
    )
    .digest("hex");
  if (value.digest !== digest)
    throw new Error("Invalid gameplay observation digest");
  return { ...value, data } as unknown as AliceGameplayObservation;
}

export class AliceGameplayObserver {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly ports: {
      sessionId: string;
      persistence: AliceGameplayMemoryPersistence;
      bridge: AliceReactionBridge;
    },
  ) {}
  observe(value: unknown): Promise<{
    accepted: true;
    duplicate: boolean;
    decisionId: string;
    delivery: AliceReactionDelivery | null;
  }> {
    const next = this.pending.then(() => this.accept(value));
    this.pending = next.catch(() => {});
    return next;
  }
  private async accept(value: unknown) {
    const o = validateAliceGameplayObservation(value);
    if (!id(this.ports.sessionId) || o.sessionId !== this.ports.sessionId)
      throw new Error("Gameplay session mismatch");
    const key = `fence:${o.sessionId}`;
    const prior = await this.ports.persistence.readObservationState(key);
    const duplicate = prior?.digest === o.digest;
    if (!duplicate && prior) {
      const sameRun =
        o.runId === prior.runId &&
        o.dispatchId === prior.dispatchId &&
        o.sourceId === prior.sourceId;
      const older = o.observedAt < Number(prior.observedAt);
      if (sameRun) {
        if (prior.ended || older || o.sequence <= Number(prior.sequence))
          throw new Error("Stale gameplay sequence or ended run");
      } else if (
        o.kind !== "run_started" ||
        older ||
        (o.observedAt === Number(prior.observedAt) &&
          o.sequence <= Number(prior.sequence))
      ) {
        throw new Error("Stale gameplay run");
      }
    }
    if (!duplicate && o.kind !== "run_started" && !prior)
      throw new Error("Gameplay run not started");
    const decisionId = `observation-${o.digest}`;
    if (duplicate && prior.delivered)
      return {
        accepted: true as const,
        duplicate: true,
        decisionId,
        delivery: prior.delivery as AliceReactionDelivery | null,
      };
    const reactionKind =
      o.kind === "checkpoint" || o.kind === "won"
        ? "progress"
        : o.kind === "impact"
          ? "hazard"
          : o.kind === "lost"
            ? "loss"
            : null;
    const state = {
      ...o,
      kind: "alice.gameplay.observation.v1",
      observationKind: o.kind,
      decisionId,
      ended: o.kind === "run_ended",
      delivered: false,
    };
    if (!duplicate)
      await this.ports.persistence.writeObservationState(key, state);
    let delivery: AliceReactionDelivery | null = null;
    if (reactionKind) {
      const decision: AliceReactionDecision = {
        decisionId,
        gameRunId: o.runId,
        sourceObservationSequence: o.sequence,
        rawObservationDigest: o.digest,
        reason: `observed.${o.kind}`,
        reactionKind,
      };
      delivery = await this.ports.bridge.persistThenBroadcast(
        o.sessionId,
        decision,
        o.dispatchId,
        async (accepted) => {
          await this.ports.persistence.writeObservationState(key, {
            ...state,
            delivered: true,
            delivery: accepted,
          });
        },
      );
    } else
      await this.ports.persistence.writeObservationState(key, {
        ...state,
        delivered: true,
        delivery: null,
      });
    return { accepted: true as const, duplicate, decisionId, delivery };
  }
}
