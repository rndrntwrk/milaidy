import type {
  EpisodeSummary,
  JsonRecord,
  PolicyProfile,
  ReflectionDecision,
} from "./types.js";

const MAX_FLOAT_STEP = 0.04;
const MAX_INT_STEP = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedFloatAdjust(
  current: number,
  target: number,
  min: number,
  max: number,
): number {
  const desired = clamp(target, min, max);
  const delta = clamp(desired - current, -MAX_FLOAT_STEP, MAX_FLOAT_STEP);
  return Number(clamp(current + delta, min, max).toFixed(3));
}

function boundedIntAdjust(
  current: number,
  target: number,
  min: number,
  max: number,
): number {
  const desired = clamp(target, min, max);
  const delta = clamp(desired - current, -MAX_INT_STEP, MAX_INT_STEP);
  return Math.round(clamp(current + delta, min, max));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readFloat(snapshot: JsonRecord, key: string, fallback: number): number {
  const value = readNumber(snapshot[key]);
  return value == null ? fallback : value;
}

function readInt(snapshot: JsonRecord, key: string, fallback: number): number {
  const value = readNumber(snapshot[key]);
  return value == null ? fallback : Math.round(value);
}

export class OutcomeAnalyzer {
  proposeReflection(
    gameId: string,
    profile: PolicyProfile,
    latestEpisode: EpisodeSummary | null | undefined,
  ): ReflectionDecision {
    if (gameId !== "knighthood" || !latestEpisode) {
      return { applied: false };
    }

    const current = asRecord(profile.policySnapshot);
    const next: JsonRecord = { ...current };
    let changed = false;
    const reasons: string[] = [];

    const cause = String(latestEpisode.causeOfDeath || "").toUpperCase();
    const metrics = asRecord(latestEpisode.metrics);
    const extraneousFlightRatio =
      readNumber(metrics.extraneousFlightRatio) ??
      readNumber(asRecord(metrics.currentRound).extraneousFlightRatio);

    if (cause === "SPIKE") {
      next.spikePrepBonus = boundedIntAdjust(
        readInt(current, "spikePrepBonus", 0),
        readInt(current, "spikePrepBonus", 0) + 2,
        0,
        20,
      );
      next.boostFuelReserve = boundedFloatAdjust(
        readFloat(current, "boostFuelReserve", 0.46),
        readFloat(current, "boostFuelReserve", 0.46) + 0.03,
        0.35,
        0.86,
      );
      reasons.push("spike_death_correction");
      changed = true;
    } else if (cause === "GAP" || cause === "WATER_FALL") {
      next.gapPrepBonus = boundedIntAdjust(
        readInt(current, "gapPrepBonus", 0),
        readInt(current, "gapPrepBonus", 0) + 2,
        0,
        20,
      );
      next.minFuelReserve = boundedFloatAdjust(
        readFloat(current, "minFuelReserve", 0.24),
        readFloat(current, "minFuelReserve", 0.24) + 0.02,
        0.18,
        0.42,
      );
      reasons.push("gap_water_correction");
      changed = true;
    }

    if (extraneousFlightRatio != null && extraneousFlightRatio >= 0.22) {
      next.flightCooldownFrames = boundedIntAdjust(
        readInt(current, "flightCooldownFrames", 8),
        readInt(current, "flightCooldownFrames", 8) + 1,
        4,
        20,
      );
      next.maxContinuousFlyFrames = boundedIntAdjust(
        readInt(current, "maxContinuousFlyFrames", 18),
        readInt(current, "maxContinuousFlyFrames", 18) - 2,
        8,
        30,
      );
      next.gemFuelReserve = boundedFloatAdjust(
        readFloat(current, "gemFuelReserve", 0.72),
        readFloat(current, "gemFuelReserve", 0.72) + 0.03,
        0.6,
        0.92,
      );
      reasons.push("fuel_discipline_correction");
      changed = true;
    }

    if (!changed) {
      return { applied: false };
    }

    return {
      applied: true,
      reason: reasons.join("+"),
      nextProfile: {
        policyVersion: Math.max(1, profile.policyVersion + 1),
        confidence: Number(clamp(profile.confidence + 0.02, 0, 1).toFixed(3)),
        policySnapshot: next,
        source: "reflection_update",
      },
    };
  }
}
