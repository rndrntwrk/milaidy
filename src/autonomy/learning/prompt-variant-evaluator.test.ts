import { describe, expect, it } from "vitest";
import type { AutonomyIdentityConfig } from "../identity/schema.js";
import {
  BUILTIN_SCENARIOS,
  SYCO_AGREE_WITH_WRONG,
  SYCO_PUSHBACK_ON_BAD,
  POISON_LOW_TRUST_INJECTION,
  POISON_SOURCE_SPOOF,
} from "../metrics/scenarios.js";
import {
  evaluatePromptVariantsOnHeldOutScenarios,
  selectHeldOutScenarios,
} from "./prompt-variant-evaluator.js";

function makeIdentity(): AutonomyIdentityConfig {
  return {
    name: "autonomy-agent",
    coreValues: ["honesty", "safety"],
    communicationStyle: {
      tone: "technical",
      verbosity: "balanced",
      personaVoice: "pragmatic assistant",
    },
    hardBoundaries: ["perform unauthorized destructive changes"],
    softPreferences: {},
    identityVersion: 1,
  } as AutonomyIdentityConfig;
}

describe("selectHeldOutScenarios", () => {
  it("returns deterministic hold-out selection for a fixed seed", () => {
    const first = selectHeldOutScenarios(BUILTIN_SCENARIOS, {
      ratio: 0.3,
      seed: "fixed-seed",
    }).map((scenario) => scenario.id);
    const second = selectHeldOutScenarios(BUILTIN_SCENARIOS, {
      ratio: 0.3,
      seed: "fixed-seed",
    }).map((scenario) => scenario.id);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});

describe("evaluatePromptVariantsOnHeldOutScenarios", () => {
  it("scores all configured variants and chooses a winner", () => {
    const result = evaluatePromptVariantsOnHeldOutScenarios({
      identity: makeIdentity(),
      scenarios: BUILTIN_SCENARIOS,
      options: { holdoutRatio: 0.4, seed: "ab-main" },
    });

    expect(result.variantScores).toHaveLength(3);
    expect(result.holdOutScenarioIds.length).toBeGreaterThan(0);
    expect(["baseline", "truth-first", "tool-safety-first"]).toContain(
      result.winner,
    );
  });

  it("improves sycophancy-oriented score under truth-first variant", () => {
    const result = evaluatePromptVariantsOnHeldOutScenarios({
      identity: makeIdentity(),
      scenarios: [SYCO_AGREE_WITH_WRONG, SYCO_PUSHBACK_ON_BAD],
      options: {
        holdoutRatio: 1,
        seed: "ab-syco",
        variants: ["baseline", "truth-first"],
      },
    });

    const baseline = result.variantScores.find((entry) => entry.variant === "baseline");
    const truthFirst = result.variantScores.find(
      (entry) => entry.variant === "truth-first",
    );
    expect(baseline).toBeDefined();
    expect(truthFirst).toBeDefined();
    expect(
      truthFirst?.metricScores.sycophancyScore ??
        truthFirst?.overallScore ??
        0,
    ).toBeGreaterThanOrEqual(
      baseline?.metricScores.sycophancyScore ??
        baseline?.overallScore ??
        0,
    );
  });

  it("improves poisoning-resilience score under tool-safety-first variant", () => {
    const result = evaluatePromptVariantsOnHeldOutScenarios({
      identity: makeIdentity(),
      scenarios: [POISON_LOW_TRUST_INJECTION, POISON_SOURCE_SPOOF],
      options: {
        holdoutRatio: 1,
        seed: "ab-poison",
        variants: ["baseline", "tool-safety-first"],
      },
    });

    const baseline = result.variantScores.find((entry) => entry.variant === "baseline");
    const toolSafety = result.variantScores.find(
      (entry) => entry.variant === "tool-safety-first",
    );
    expect(baseline).toBeDefined();
    expect(toolSafety).toBeDefined();
    expect(
      toolSafety?.metricScores.memoryPoisoningResistance ??
        toolSafety?.overallScore ??
        0,
    ).toBeGreaterThanOrEqual(
      baseline?.metricScores.memoryPoisoningResistance ??
        baseline?.overallScore ??
        0,
    );
  });
});
