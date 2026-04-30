import type { JsonRecord } from "../../intelligence/types.js";
import type {
  Five55MasteryContract,
  MasteryGateV2,
  MasteryPolicyBounds,
} from "../types.js";

export const BASE_POLICY_DEFAULTS: JsonRecord = Object.freeze({
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

export const BASE_POLICY_BOUNDS: Record<string, MasteryPolicyBounds> = Object.freeze({
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

export function createMasteryContract(
  contract: Omit<Five55MasteryContract, "policy" | "contractVersion" | "gateV2"> & {
    policy?: {
      family?: string;
      defaults?: JsonRecord;
      bounds?: Record<string, MasteryPolicyBounds>;
    };
    gateV2?: Partial<MasteryGateV2>;
  },
): Five55MasteryContract {
  const runtimeGates = (contract.gateV2?.runtimeGates ?? contract.passGates).map(
    (gate) => ({
      ...gate,
      required:
        "required" in gate && typeof gate.required === "boolean"
          ? gate.required
          : true,
      source:
        "source" in gate && typeof gate.source === "string"
          ? gate.source
          : "runtime-native",
    }),
  );
  return {
    ...contract,
    contractVersion: 2,
    gateV2: {
      runtimeGates,
      levelRequirement: contract.gateV2?.levelRequirement ?? null,
      qualityRequirement: contract.gateV2?.qualityRequirement ?? null,
      truthChecks: {
        requireFrameTypes: contract.gateV2?.truthChecks?.requireFrameTypes ?? [
          "boot/menu",
          "play-start",
          "progress",
          "terminal",
          "stuck-check",
        ],
        stuckCheckIntervalSec:
          contract.gateV2?.truthChecks?.stuckCheckIntervalSec ?? 5,
        failOnMenuAdvance:
          contract.gateV2?.truthChecks?.failOnMenuAdvance ?? true,
        failOnStaticFramesWithProgress:
          contract.gateV2?.truthChecks?.failOnStaticFramesWithProgress ?? true,
        failOnTelemetryFrameMismatch:
          contract.gateV2?.truthChecks?.failOnTelemetryFrameMismatch ?? true,
        ...(Array.isArray(contract.gateV2?.truthChecks?.requiredControlAxes)
          ? {
              requiredControlAxes:
                contract.gateV2?.truthChecks?.requiredControlAxes,
            }
          : {}),
      },
      disallowedEvidence: contract.gateV2?.disallowedEvidence ?? ["synthetic"],
      status: contract.gateV2?.status ?? "ACTIVE",
    },
    policy: {
      family: contract.policy?.family ?? "generic_observable",
      defaults: {
        ...BASE_POLICY_DEFAULTS,
        ...(contract.policy?.defaults ?? {}),
      },
      bounds: {
        ...BASE_POLICY_BOUNDS,
        ...(contract.policy?.bounds ?? {}),
      },
    },
  };
}
