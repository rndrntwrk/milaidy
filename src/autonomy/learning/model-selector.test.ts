/**
 * Tests for ModelSelector.
 */

import { describe, expect, it } from "vitest";
import { ModelSelector } from "./model-selector.js";
import type { ModelProvider, TrainingDataset } from "./types.js";

const mockProvider = (name: string): ModelProvider => ({
  async complete(req) {
    return { text: `${name}: ${req.userPrompt}`, tokenCount: 5, durationMs: 1, model: name };
  },
  async score(req) {
    return { overallScore: 0.5, dimensionScores: {}, explanation: name, model: name };
  },
});

const dataset: TrainingDataset = {
  id: "ds1",
  label: "eval",
  examples: [],
  createdAt: Date.now(),
};

describe("ModelSelector", () => {
  it("selects the highest-scoring model", async () => {
    const selector = new ModelSelector();
    selector.addCandidate({ id: "model-a", provider: mockProvider("a") });
    selector.addCandidate({ id: "model-b", provider: mockProvider("b") });
    selector.addCandidate({ id: "model-c", provider: mockProvider("c") });

    const result = await selector.select(dataset, async (_provider, _ds) => {
      const id = selector.getCandidates().find((c) => c.provider === _provider)?.id;
      const scores: Record<string, number> = { "model-a": 0.7, "model-b": 0.9, "model-c": 0.6 };
      return { score: scores[id!] ?? 0, metricScores: {} };
    });

    expect(result.selectedModelId).toBe("model-b");
    expect(result.evaluations).toHaveLength(3);
  });

  it("throws when no candidates registered", async () => {
    const selector = new ModelSelector();
    await expect(selector.select(dataset, async () => ({ score: 0, metricScores: {} })))
      .rejects.toThrow("No model candidates");
  });

  it("returns evaluations sorted by score", async () => {
    const selector = new ModelSelector();
    selector.addCandidate({ id: "low", provider: mockProvider("low") });
    selector.addCandidate({ id: "high", provider: mockProvider("high") });

    const result = await selector.select(dataset, async (_provider) => {
      const id = selector.getCandidates().find((c) => c.provider === _provider)?.id;
      return { score: id === "high" ? 0.9 : 0.1, metricScores: {} };
    });

    expect(result.evaluations[0].modelId).toBe("high");
    expect(result.evaluations[1].modelId).toBe("low");
  });

  it("getCandidates returns registered candidates", () => {
    const selector = new ModelSelector();
    selector.addCandidate({ id: "a", provider: mockProvider("a") });
    selector.addCandidate({ id: "b", provider: mockProvider("b") });
    expect(selector.getCandidates()).toHaveLength(2);
  });
});
