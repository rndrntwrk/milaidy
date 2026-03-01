import type { JsonRecord, LearningProfile, PolicyProfile } from "./types.js";

const KNIGHTHOOD_DEFAULT_POLICY: JsonRecord = {
  minFuelReserve: 0.24,
  gemFuelReserve: 0.72,
  boostFuelReserve: 0.46,
  maxContinuousFlyFrames: 18,
  flightCooldownFrames: 8,
  spikePrepBonus: 0,
  gapPrepBonus: 0,
};

const KNIGHTHOOD_BOUNDS: Record<
  string,
  { min: number; max: number; type: "float" | "int" }
> = {
  minFuelReserve: { min: 0.18, max: 0.42, type: "float" },
  gemFuelReserve: { min: 0.6, max: 0.92, type: "float" },
  boostFuelReserve: { min: 0.35, max: 0.86, type: "float" },
  maxContinuousFlyFrames: { min: 8, max: 30, type: "int" },
  flightCooldownFrames: { min: 4, max: 20, type: "int" },
  spikePrepBonus: { min: 0, max: 20, type: "int" },
  gapPrepBonus: { min: 0, max: 20, type: "int" },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizePolicySnapshot(gameId: string, value: JsonRecord): JsonRecord {
  if (gameId !== "knighthood") {
    return value;
  }

  const out: JsonRecord = {
    ...KNIGHTHOOD_DEFAULT_POLICY,
    ...value,
  };

  for (const [key, bounds] of Object.entries(KNIGHTHOOD_BOUNDS)) {
    const raw = Number(out[key]);
    if (!Number.isFinite(raw)) {
      out[key] = KNIGHTHOOD_DEFAULT_POLICY[key] as number;
      continue;
    }
    const normalized = clamp(raw, bounds.min, bounds.max);
    out[key] = bounds.type === "int" ? Math.round(normalized) : normalized;
  }

  return out;
}

export class PolicyEngine {
  resolveLaunchProfile(gameId: string, profile: LearningProfile): PolicyProfile {
    const confidence = Number.isFinite(profile.confidence)
      ? clamp(profile.confidence, 0, 1)
      : 0.5;
    const snapshot = sanitizePolicySnapshot(
      gameId,
      profile.policySnapshot || {},
    );
    const policyVersion = Math.max(1, Number(profile.policyVersion) || 1);
    return {
      policyVersion,
      confidence,
      policySnapshot: snapshot,
      source: "learning_profile",
    };
  }
}
