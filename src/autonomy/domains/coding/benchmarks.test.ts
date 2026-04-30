import { describe, expect, it } from "vitest";
import {
  CODING_BENCHMARKS,
  CODING_QUALITY_BENCHMARK,
  CODING_SAFETY_BENCHMARK,
  CODING_SCENARIOS,
  CODE_FILE_SAFETY,
  CODE_GIT_SAFETY,
  CODE_OUTPUT_QUALITY,
  CODE_SECRET_PROTECTION,
  CODE_SHELL_SAFETY,
  CODE_TEST_COVERAGE,
} from "./benchmarks.js";

describe("Coding benchmarks", () => {
  it("exports exactly 6 scenarios", () => {
    expect(CODING_SCENARIOS).toHaveLength(6);
  });

  it("all scenarios have unique ids", () => {
    const ids = CODING_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios have non-empty prompts", () => {
    for (const scenario of CODING_SCENARIOS) {
      expect(scenario.prompts.length).toBeGreaterThan(0);
      expect(scenario.turns).toBeGreaterThan(0);
    }
  });

  it("safety benchmark has 4 scenarios with 0.95 threshold", () => {
    expect(CODING_SAFETY_BENCHMARK.scenarios).toHaveLength(4);
    expect(CODING_SAFETY_BENCHMARK.passThreshold).toBe(0.95);
    expect(CODING_SAFETY_BENCHMARK.id).toBe("coding:safety");

    const scenarioIds = CODING_SAFETY_BENCHMARK.scenarios.map((s) => s.id);
    expect(scenarioIds).toContain(CODE_FILE_SAFETY.id);
    expect(scenarioIds).toContain(CODE_SHELL_SAFETY.id);
    expect(scenarioIds).toContain(CODE_GIT_SAFETY.id);
    expect(scenarioIds).toContain(CODE_SECRET_PROTECTION.id);
  });

  it("quality benchmark has 2 scenarios with 0.90 threshold", () => {
    expect(CODING_QUALITY_BENCHMARK.scenarios).toHaveLength(2);
    expect(CODING_QUALITY_BENCHMARK.passThreshold).toBe(0.9);
    expect(CODING_QUALITY_BENCHMARK.id).toBe("coding:quality");

    const scenarioIds = CODING_QUALITY_BENCHMARK.scenarios.map((s) => s.id);
    expect(scenarioIds).toContain(CODE_TEST_COVERAGE.id);
    expect(scenarioIds).toContain(CODE_OUTPUT_QUALITY.id);
  });

  it("exports exactly 2 benchmarks", () => {
    expect(CODING_BENCHMARKS).toHaveLength(2);
  });

  it("scenarios reference valid metric keys", () => {
    const validMetrics = [
      "preferenceFollowingAccuracy",
      "instructionCompletionRate",
      "personaDriftScore",
      "memoryPoisoningResistance",
      "compoundingErrorRate",
      "sycophancyScore",
    ];
    for (const scenario of CODING_SCENARIOS) {
      expect(validMetrics).toContain(scenario.metric);
    }
  });
});
