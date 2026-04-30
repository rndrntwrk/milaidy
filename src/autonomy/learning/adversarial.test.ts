import { describe, expect, it } from "vitest";
import {
  AdversarialScenarioGenerator,
  INJECTION_SEEDS,
  MANIPULATION_SEEDS,
  REWARD_GAMING_SEEDS,
} from "./adversarial.js";

describe("AdversarialScenarioGenerator", () => {
  const generator = new AdversarialScenarioGenerator();

  describe("generateInjectionScenarios()", () => {
    it("returns valid EvaluationScenario[]", () => {
      const scenarios = generator.generateInjectionScenarios();
      expect(scenarios.length).toBe(INJECTION_SEEDS.length);
      for (const s of scenarios) {
        expect(s.id).toMatch(/^adversarial-injection-/);
        expect(s.prompts.length).toBeGreaterThan(0);
        expect(s.description).toBeTruthy();
        expect(s.expectedBehavior).toBeTruthy();
        expect(s.turns).toBe(1);
      }
    });

    it("targets memoryPoisoningResistance metric", () => {
      const scenarios = generator.generateInjectionScenarios();
      for (const s of scenarios) {
        expect(s.metric).toBe("memoryPoisoningResistance");
      }
    });

    it("respects count parameter", () => {
      const scenarios = generator.generateInjectionScenarios(3);
      expect(scenarios.length).toBe(3);
    });
  });

  describe("generateManipulationScenarios()", () => {
    it("returns sycophancy/drift scenarios", () => {
      const scenarios = generator.generateManipulationScenarios();
      expect(scenarios.length).toBe(MANIPULATION_SEEDS.length);
      for (const s of scenarios) {
        expect(s.id).toMatch(/^adversarial-manipulation-/);
        expect(s.prompts.length).toBeGreaterThan(0);
        expect(s.expectedBehavior).toBeTruthy();
      }
    });

    it("targets personaDriftScore and sycophancyScore", () => {
      const scenarios = generator.generateManipulationScenarios();
      const metrics = new Set(scenarios.map((s) => s.metric));
      expect(metrics.has("personaDriftScore")).toBe(true);
      expect(metrics.has("sycophancyScore")).toBe(true);
    });

    it("respects count parameter", () => {
      const scenarios = generator.generateManipulationScenarios(4);
      expect(scenarios.length).toBe(4);
    });
  });

  describe("generateRewardGamingScenarios()", () => {
    it("returns reward gaming scenarios", () => {
      const scenarios = generator.generateRewardGamingScenarios();
      expect(scenarios.length).toBe(REWARD_GAMING_SEEDS.length);
      for (const s of scenarios) {
        expect(s.id).toMatch(/^adversarial-reward-gaming-/);
        expect(s.prompts.length).toBeGreaterThan(0);
        expect(s.expectedBehavior).toBeTruthy();
      }
    });

    it("targets instructionCompletionRate metric", () => {
      const scenarios = generator.generateRewardGamingScenarios();
      for (const s of scenarios) {
        expect(s.metric).toBe("instructionCompletionRate");
      }
    });
  });

  describe("all()", () => {
    it("returns combined set without duplicate IDs", () => {
      const all = generator.all();
      const ids = all.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("includes all three categories", () => {
      const all = generator.all();
      const hasInjection = all.some((s) => s.id.includes("injection"));
      const hasManipulation = all.some((s) => s.id.includes("manipulation"));
      const hasRewardGaming = all.some((s) => s.id.includes("reward-gaming"));
      expect(hasInjection).toBe(true);
      expect(hasManipulation).toBe(true);
      expect(hasRewardGaming).toBe(true);
    });

    it("produces reasonable number of scenarios (5-10 per type)", () => {
      const all = generator.all();
      const injection = all.filter((s) => s.id.includes("injection"));
      const manipulation = all.filter((s) => s.id.includes("manipulation"));
      const rewardGaming = all.filter((s) => s.id.includes("reward-gaming"));

      expect(injection.length).toBeGreaterThanOrEqual(5);
      expect(injection.length).toBeLessThanOrEqual(10);
      expect(manipulation.length).toBeGreaterThanOrEqual(5);
      expect(manipulation.length).toBeLessThanOrEqual(10);
      expect(rewardGaming.length).toBeGreaterThanOrEqual(5);
      expect(rewardGaming.length).toBeLessThanOrEqual(10);
    });
  });

  it("generated scenarios have non-empty expectedBehavior", () => {
    const all = generator.all();
    for (const s of all) {
      expect(s.expectedBehavior.length).toBeGreaterThan(10);
    }
  });
});
