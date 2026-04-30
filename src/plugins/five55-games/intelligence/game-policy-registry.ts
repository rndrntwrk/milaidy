import type { JsonRecord } from "./types.js";
import { getMasteryContractOrNull } from "../mastery/index.js";

type NumericBounds = {
  min: number;
  max: number;
  kind: "float" | "int";
};

type PolicyRegistryEntry = {
  family: string;
  defaults: JsonRecord;
  bounds: Record<string, NumericBounds>;
};

const BASE_POLICY_DEFAULTS: JsonRecord = Object.freeze({
  reactionWindowMs: 180,
  riskTolerance: 0.45,
  recoveryBias: 0.6,
  menuPulseMs: 1400,
  pausePulseMs: 1200,
  recenterBias: 0.5,
  collectibleBias: 0.68,
  enemyEngageRiskMax: 0.36,
  hazardAvoidanceBias: 0.74,
});

const BASE_BOUNDS: Record<string, NumericBounds> = Object.freeze({
  reactionWindowMs: { min: 80, max: 450, kind: "int" },
  riskTolerance: { min: 0.05, max: 0.95, kind: "float" },
  recoveryBias: { min: 0.05, max: 0.95, kind: "float" },
  menuPulseMs: { min: 500, max: 5000, kind: "int" },
  pausePulseMs: { min: 500, max: 5000, kind: "int" },
  recenterBias: { min: 0, max: 1, kind: "float" },
  collectibleBias: { min: 0.2, max: 0.95, kind: "float" },
  enemyEngageRiskMax: { min: 0.12, max: 0.85, kind: "float" },
  hazardAvoidanceBias: { min: 0.2, max: 0.98, kind: "float" },
  minFuelReserve: { min: 0.18, max: 0.42, kind: "float" },
  gemFuelReserve: { min: 0.6, max: 0.92, kind: "float" },
  boostFuelReserve: { min: 0.35, max: 0.86, kind: "float" },
  maxContinuousFlyFrames: { min: 8, max: 30, kind: "int" },
  flightCooldownFrames: { min: 4, max: 20, kind: "int" },
  spikePrepBonus: { min: 0, max: 20, kind: "int" },
  gapPrepBonus: { min: 0, max: 20, kind: "int" },
  spikeNoAttackBuffer: { min: 6, max: 36, kind: "int" },
});

const DEFAULT_ENTRY: PolicyRegistryEntry = Object.freeze({
  family: "generic_observable",
  defaults: BASE_POLICY_DEFAULTS,
  bounds: BASE_BOUNDS,
});

const ENTRIES: Record<string, PolicyRegistryEntry> = Object.freeze({
  knighthood: {
    family: "runner_survival",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      minFuelReserve: 0.24,
      gemFuelReserve: 0.72,
      boostFuelReserve: 0.46,
      maxContinuousFlyFrames: 18,
      flightCooldownFrames: 8,
      spikePrepBonus: 0,
      gapPrepBonus: 0,
      recenterBias: 0.72,
      collectibleBias: 0.76,
      enemyEngageRiskMax: 0.33,
      spikeNoAttackBuffer: 18,
      hazardAvoidanceBias: 0.82,
    },
    bounds: BASE_BOUNDS,
  },
  "sector-13": {
    family: "shooter_evasion",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      riskTolerance: 0.38,
      recoveryBias: 0.72,
    },
    bounds: BASE_BOUNDS,
  },
  ninja: {
    family: "platform_route",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      reactionWindowMs: 165,
      riskTolerance: 0.42,
    },
    bounds: BASE_BOUNDS,
  },
  clawstrike: {
    family: "combat_window",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      reactionWindowMs: 150,
      riskTolerance: 0.46,
      enemyEngageRiskMax: 0.34,
      hazardAvoidanceBias: 0.78,
    },
    bounds: BASE_BOUNDS,
  },
  "555drive": {
    family: "racing_line",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      reactionWindowMs: 190,
      riskTolerance: 0.4,
      recenterBias: 0.8,
    },
    bounds: BASE_BOUNDS,
  },
  chesspursuit: {
    family: "deterministic_planner",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "wolf-and-sheep": {
    family: "pursuit_escape",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  leftandright: {
    family: "reflex_timing",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      collectibleBias: 0.78,
      hazardAvoidanceBias: 0.82,
      recenterBias: 0.62,
      riskTolerance: 0.34,
    },
    bounds: BASE_BOUNDS,
  },
  playback: {
    family: "sequence_retention",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "fighter-planes": {
    family: "target_evasion",
    defaults: {
      ...BASE_POLICY_DEFAULTS,
      enemyEngageRiskMax: 0.3,
      hazardAvoidanceBias: 0.84,
      recenterBias: 0.58,
      riskTolerance: 0.32,
    },
    bounds: BASE_BOUNDS,
  },
  floor13: {
    family: "hazard_objective",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "godai-is-back": {
    family: "combat_spacing",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  peanball: {
    family: "control_stability",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "eat-my-dust": {
    family: "racing_impact_control",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "where-were-going-we-do-need-roads": {
    family: "path_stability",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
  "vedas-run": {
    family: "runner_obstacle_timing",
    defaults: BASE_POLICY_DEFAULTS,
    bounds: BASE_BOUNDS,
  },
});

function normalizeGameId(gameId: string): string {
  return String(gameId || "").trim().toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeNumber(value: unknown, bounds: NumericBounds, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = clamp(numeric, bounds.min, bounds.max);
  if (bounds.kind === "int") return Math.round(clamped);
  return Number(clamped.toFixed(4));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export class GamePolicyRegistry {
  getEntry(gameId: string): PolicyRegistryEntry {
    const normalized = normalizeGameId(gameId);
    const mastery = getMasteryContractOrNull(normalized);
    if (mastery) {
      return {
        family: mastery.policy.family,
        defaults: mastery.policy.defaults,
        bounds: mastery.policy.bounds,
      };
    }
    return ENTRIES[normalized] || DEFAULT_ENTRY;
  }

  getFamily(gameId: string): string {
    return this.getEntry(gameId).family;
  }

  getDefaults(gameId: string): JsonRecord {
    return { ...this.getEntry(gameId).defaults };
  }

  sanitizeSnapshot(gameId: string, snapshot: JsonRecord): JsonRecord {
    const entry = this.getEntry(gameId);
    const merged = {
      ...entry.defaults,
      ...asRecord(snapshot),
    };
    const out: JsonRecord = {};
    for (const [key, value] of Object.entries(merged)) {
      const bounds = entry.bounds[key];
      if (!bounds) {
        out[key] = value;
        continue;
      }
      const fallback = Number(entry.defaults[key]);
      out[key] = sanitizeNumber(value, bounds, Number.isFinite(fallback) ? fallback : bounds.min);
    }
    return out;
  }
}
