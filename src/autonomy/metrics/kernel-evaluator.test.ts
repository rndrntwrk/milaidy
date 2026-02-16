/**
 * Tests for KernelScenarioEvaluator.
 *
 * Uses real kernel component instances to verify that each metric type
 * produces a valid score between 0 and 1.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryGoalManager } from "../goals/manager.js";
import { RuleBasedDriftMonitor } from "../identity/drift-monitor.js";
import { MemoryGateImpl } from "../memory/gate.js";
import { RuleBasedTrustScorer } from "../trust/scorer.js";
import type { KernelComponents } from "./evaluator-types.js";
import { KernelScenarioEvaluator } from "./kernel-evaluator.js";
import {
  COMPOUND_ERROR_RECOVERY,
  COMPOUND_SEQUENTIAL_ERRORS,
  DRIFT_ADVERSARIAL_PROMPT,
  DRIFT_BASELINE_STABILITY,
  DRIFT_LONG_SESSION,
  INSTR_GOAL_COMPLETION,
  INSTR_MULTI_STEP,
  POISON_HIGH_VOLUME,
  POISON_LOW_TRUST_INJECTION,
  POISON_SOURCE_SPOOF,
  PREF_IDENTITY_ALIGNMENT,
  PREF_STYLE_COMPLIANCE,
  SYCO_AGREE_WITH_WRONG,
  SYCO_PUSHBACK_ON_BAD,
} from "./scenarios.js";
import type { EvaluationScenario } from "./types.js";

// ---------- Helpers ----------

function createComponents(): KernelComponents {
  const trustScorer = new RuleBasedTrustScorer();
  const memoryGate = new MemoryGateImpl(trustScorer);
  const driftMonitor = new RuleBasedDriftMonitor();
  const goalManager = new InMemoryGoalManager();
  return { trustScorer, memoryGate, driftMonitor, goalManager };
}

// ---------- Tests ----------

describe("KernelScenarioEvaluator", () => {
  const evaluator = new KernelScenarioEvaluator();
  let components: KernelComponents;

  afterEach(() => {
    (components.memoryGate as MemoryGateImpl).dispose();
  });

  describe("preferenceFollowingAccuracy", () => {
    it("returns high score for identity-aligned outputs", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(PREF_IDENTITY_ALIGNMENT, components);

      expect(result.scenarioId).toBe("pref:identity-alignment");
      expect(result.metric).toBe("preferenceFollowingAccuracy");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Normal outputs should have high preference following
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.details).toBeDefined();
    });

    it("evaluates style compliance", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(PREF_STYLE_COMPLIANCE, components);

      expect(result.scenarioId).toBe("pref:style-compliance");
      expect(result.metric).toBe("preferenceFollowingAccuracy");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("instructionCompletionRate", () => {
    it("completes goals with done criteria", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(INSTR_GOAL_COMPLETION, components);

      expect(result.scenarioId).toBe("instr:goal-completion");
      expect(result.metric).toBe("instructionCompletionRate");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Goals with "done" in criteria should be completed
      expect(result.score).toBeGreaterThan(0);
    });

    it("evaluates multi-step goal hierarchies", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(INSTR_MULTI_STEP, components);

      expect(result.scenarioId).toBe("instr:multi-step");
      expect(result.metric).toBe("instructionCompletionRate");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("personaDriftScore", () => {
    it("returns low drift for stable outputs", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(DRIFT_BASELINE_STABILITY, components);

      expect(result.scenarioId).toBe("drift:baseline-stability");
      expect(result.metric).toBe("personaDriftScore");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Stable, benign outputs should have low drift
      expect(result.score).toBeLessThanOrEqual(0.5);
    });

    it("detects drift from adversarial prompts", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(DRIFT_ADVERSARIAL_PROMPT, components);

      expect(result.scenarioId).toBe("drift:adversarial-prompt");
      expect(result.metric).toBe("personaDriftScore");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("monitors drift across long sessions", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(DRIFT_LONG_SESSION, components);

      expect(result.scenarioId).toBe("drift:long-session");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("memoryPoisoningResistance", () => {
    it("rejects low-trust injection attempts", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(POISON_LOW_TRUST_INJECTION, components);

      expect(result.scenarioId).toBe("poison:low-trust-injection");
      expect(result.metric).toBe("memoryPoisoningResistance");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Should block most/all injection attempts
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });

    it("resists high-volume poisoning", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(POISON_HIGH_VOLUME, components);

      expect(result.scenarioId).toBe("poison:high-volume");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("detects source spoofing", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(POISON_SOURCE_SPOOF, components);

      expect(result.scenarioId).toBe("poison:source-spoof");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("compoundingErrorRate", () => {
    it("measures sequential error rate", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(COMPOUND_SEQUENTIAL_ERRORS, components);

      expect(result.scenarioId).toBe("compound:sequential-errors");
      expect(result.metric).toBe("compoundingErrorRate");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("measures error recovery", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(COMPOUND_ERROR_RECOVERY, components);

      expect(result.scenarioId).toBe("compound:error-recovery");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("sycophancyScore", () => {
    it("rejects unauthorized operations", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(SYCO_AGREE_WITH_WRONG, components);

      expect(result.scenarioId).toBe("syco:agree-with-wrong");
      expect(result.metric).toBe("sycophancyScore");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Should reject all low-trust agent goals → sycophancy rate = 0
      expect(result.score).toBe(0);
    });

    it("pushes back on low-trust goal creation", async () => {
      components = createComponents();
      const result = await evaluator.evaluate(SYCO_PUSHBACK_ON_BAD, components);

      expect(result.scenarioId).toBe("syco:pushback-on-bad");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Should reject all → sycophancy rate = 0
      expect(result.score).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for unknown metric type", async () => {
      components = createComponents();
      const unknownScenario: EvaluationScenario = {
        id: "unknown:test",
        metric: "nonExistentMetric" as EvaluationScenario["metric"],
        description: "Unknown metric scenario",
        prompts: ["test"],
        expectedBehavior: "Should return 0",
        turns: 1,
      };

      const result = await evaluator.evaluate(unknownScenario, components);

      expect(result.scenarioId).toBe("unknown:test");
      expect(result.score).toBe(0);
      expect(result.details).toContain("Unknown metric");
    });

    it("includes scenarioId and metric in all results", async () => {
      components = createComponents();
      const allScenarios = [
        PREF_IDENTITY_ALIGNMENT,
        INSTR_GOAL_COMPLETION,
        DRIFT_BASELINE_STABILITY,
        POISON_LOW_TRUST_INJECTION,
        COMPOUND_SEQUENTIAL_ERRORS,
        SYCO_AGREE_WITH_WRONG,
      ];

      for (const scenario of allScenarios) {
        const result = await evaluator.evaluate(scenario, components);
        expect(result.scenarioId).toBe(scenario.id);
        expect(result.metric).toBe(scenario.metric);
      }
    });
  });
});
