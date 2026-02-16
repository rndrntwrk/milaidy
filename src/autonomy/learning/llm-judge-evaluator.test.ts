import { describe, expect, it } from "vitest";
import type {
  KernelComponents,
  ScenarioResult,
} from "../metrics/evaluator-types.js";
import type { EvaluationScenario } from "../metrics/types.js";
import { LLMJudgeEvaluator } from "./llm-judge-evaluator.js";
import { StubModelProvider } from "./model-provider.js";
import type { ModelProvider, ScoringRequest, ScoringResponse } from "./types.js";

// ---------- Helpers ----------

function makeScenario(
  overrides?: Partial<EvaluationScenario>,
): EvaluationScenario {
  return {
    id: "test-scenario-1",
    metric: "preferenceFollowingAccuracy",
    description: "Test preference following",
    prompts: ["Follow user preferences carefully"],
    expectedBehavior: "Should align with user preferences",
    turns: 1,
    ...overrides,
  };
}

/** Minimal KernelComponents stub. */
function makeComponents(): KernelComponents {
  return {
    trustScorer: {
      score: async () => ({
        overall: 0.8,
        dimensions: {
          reliability: 0.8,
          contentIntegrity: 0.8,
          sourceReputation: 0.8,
          behavioralConsistency: 0.8,
        },
        source: { id: "test", type: "system" as const, reliability: 0.8 },
        timestamp: Date.now(),
      }),
    },
    memoryGate: {
      evaluate: async () => ({
        action: "reject" as const,
        reason: "test",
        trustScore: 0.1,
      }),
    },
    driftMonitor: {
      analyze: async () => ({
        driftScore: 0.1,
        severity: "none" as const,
        dimensions: {
          valueAlignment: 0.9,
          styleConsistency: 0.85,
          boundaryAdherence: 0.95,
          responsePatterns: 0.88,
        },
        windowSize: 1,
        threshold: 0.3,
        recommendation: "none" as const,
      }),
    },
    goalManager: {
      addGoal: async (input: Record<string, unknown>) => ({
        id: "goal-1",
        description: input.description as string,
        priority: "medium" as const,
        status: "active" as const,
        successCriteria: [],
        source: "system" as const,
        sourceTrust: 1.0,
        createdAt: Date.now(),
      }),
      evaluateGoal: async () => ({
        goalId: "goal-1",
        met: true,
        criteriaResults: [],
        evaluatedAt: Date.now(),
      }),
    },
  } as unknown as KernelComponents;
}

// ---------- Tests ----------

describe("LLMJudgeEvaluator", () => {
  it("returns blended score from LLM and kernel", async () => {
    const provider = new StubModelProvider();
    const evaluator = new LLMJudgeEvaluator(provider);
    const result = await evaluator.evaluate(makeScenario(), makeComponents());

    expect(result.scenarioId).toBe("test-scenario-1");
    expect(result.metric).toBe("preferenceFollowingAccuracy");
    // StubModelProvider returns 0.5 for overallScore
    // Blended: 0.5 * 0.6 + kernelScore * 0.4
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.details).toContain("LLM judge");
    expect(result.details).toContain("Kernel");
  });

  it("calls modelProvider.score with expectedBehavior as rubric", async () => {
    let capturedRequest: ScoringRequest | undefined;
    const mockProvider: ModelProvider = {
      complete: async () => ({
        text: "test",
        tokenCount: 1,
        durationMs: 0,
        model: "mock",
      }),
      score: async (req: ScoringRequest): Promise<ScoringResponse> => {
        capturedRequest = req;
        return {
          overallScore: 0.7,
          dimensionScores: {},
          explanation: "Good alignment",
          model: "mock",
        };
      },
    };

    const scenario = makeScenario({
      expectedBehavior: "Must respect user boundaries",
    });
    const evaluator = new LLMJudgeEvaluator(mockProvider);
    await evaluator.evaluate(scenario, makeComponents());

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.rubric).toBe("Must respect user boundaries");
    expect(capturedRequest!.prompt).toContain(
      "Follow user preferences carefully",
    );
  });

  it("falls back to kernel score on model failure", async () => {
    const failingProvider: ModelProvider = {
      complete: async () => {
        throw new Error("API unavailable");
      },
      score: async () => {
        throw new Error("API unavailable");
      },
    };

    const evaluator = new LLMJudgeEvaluator(failingProvider);
    const result = await evaluator.evaluate(makeScenario(), makeComponents());

    expect(result.scenarioId).toBe("test-scenario-1");
    expect(result.metric).toBe("preferenceFollowingAccuracy");
    expect(result.score).toBeGreaterThan(0);
    expect(result.details).toContain("[LLM fallback]");
  });

  it("maps metric dimensions correctly", async () => {
    let capturedDimensions: string[] = [];
    const mockProvider: ModelProvider = {
      complete: async () => ({
        text: "",
        tokenCount: 0,
        durationMs: 0,
        model: "mock",
      }),
      score: async (req: ScoringRequest): Promise<ScoringResponse> => {
        capturedDimensions = req.dimensions;
        return {
          overallScore: 0.6,
          dimensionScores: {},
          explanation: "test",
          model: "mock",
        };
      },
    };

    const evaluator = new LLMJudgeEvaluator(mockProvider);

    // Test preferenceFollowingAccuracy dimensions
    await evaluator.evaluate(
      makeScenario({ metric: "preferenceFollowingAccuracy" }),
      makeComponents(),
    );
    expect(capturedDimensions).toEqual([
      "preference_alignment",
      "consistency",
    ]);

    // Test sycophancyScore dimensions
    await evaluator.evaluate(
      makeScenario({ metric: "sycophancyScore" }),
      makeComponents(),
    );
    expect(capturedDimensions).toEqual(["truthfulness", "independence"]);

    // Test memoryPoisoningResistance dimensions
    await evaluator.evaluate(
      makeScenario({ metric: "memoryPoisoningResistance" }),
      makeComponents(),
    );
    expect(capturedDimensions).toEqual(["safety", "robustness"]);
  });

  it("handles all 6 metric types", async () => {
    const provider = new StubModelProvider();
    const evaluator = new LLMJudgeEvaluator(provider);
    const components = makeComponents();

    const metrics = [
      "preferenceFollowingAccuracy",
      "instructionCompletionRate",
      "personaDriftScore",
      "memoryPoisoningResistance",
      "compoundingErrorRate",
      "sycophancyScore",
    ] as const;

    for (const metric of metrics) {
      const result = await evaluator.evaluate(
        makeScenario({ metric }),
        components,
      );
      expect(result.metric).toBe(metric);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("preserves scenarioId and metric in result", async () => {
    const provider = new StubModelProvider();
    const evaluator = new LLMJudgeEvaluator(provider);
    const scenario = makeScenario({
      id: "custom-id-42",
      metric: "personaDriftScore",
    });

    const result = await evaluator.evaluate(scenario, makeComponents());
    expect(result.scenarioId).toBe("custom-id-42");
    expect(result.metric).toBe("personaDriftScore");
  });

  it("clamps blended score to 0-1 range", async () => {
    const highScorer: ModelProvider = {
      complete: async () => ({
        text: "",
        tokenCount: 0,
        durationMs: 0,
        model: "mock",
      }),
      score: async (): Promise<ScoringResponse> => ({
        overallScore: 1.5, // Out of range
        dimensionScores: {},
        explanation: "Extremely good",
        model: "mock",
      }),
    };

    const evaluator = new LLMJudgeEvaluator(highScorer);
    const result = await evaluator.evaluate(makeScenario(), makeComponents());

    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("with StubModelProvider returns deterministic results", async () => {
    const provider = new StubModelProvider();
    const evaluator = new LLMJudgeEvaluator(provider);
    const components = makeComponents();
    const scenario = makeScenario();

    const result1 = await evaluator.evaluate(scenario, components);
    const result2 = await evaluator.evaluate(scenario, components);

    expect(result1.score).toBe(result2.score);
    expect(result1.details).toBe(result2.details);
  });
});
