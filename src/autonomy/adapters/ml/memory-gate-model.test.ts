/**
 * Tests for MemoryGateModel adapters.
 */

import { describe, expect, it } from "vitest";
import { RuleBasedGateModel, LogisticRegressionGateModel } from "./memory-gate-model.js";
import type { MemoryFeatures } from "./memory-gate-model.js";

const highTrustFeatures: MemoryFeatures = {
  trustScore: 0.9,
  contentLength: 100,
  sourceVerified: true,
  sourceAgeDays: 365,
  priorInteractions: 100,
  semanticSimilarity: 0.8,
  hasExternalLinks: false,
  touchesCoreValues: false,
};

const lowTrustFeatures: MemoryFeatures = {
  trustScore: 0.1,
  contentLength: 5000,
  sourceVerified: false,
  sourceAgeDays: 0,
  priorInteractions: 0,
  semanticSimilarity: 0.1,
  hasExternalLinks: true,
  touchesCoreValues: true,
};

const borderlineFeatures: MemoryFeatures = {
  trustScore: 0.3,
  contentLength: 200,
  sourceVerified: false,
  sourceAgeDays: 30,
  priorInteractions: 10,
  semanticSimilarity: 0.5,
  hasExternalLinks: false,
  touchesCoreValues: false,
};

describe("RuleBasedGateModel", () => {
  it("allows high-trust memories", async () => {
    const model = new RuleBasedGateModel();
    const prediction = await model.predict(highTrustFeatures);
    expect(prediction.action).toBe("allow");
    expect(prediction.acceptProbability).toBeGreaterThan(0.5);
  });

  it("rejects low-trust memories", async () => {
    const model = new RuleBasedGateModel();
    const prediction = await model.predict(lowTrustFeatures);
    expect(prediction.action).toBe("reject");
    expect(prediction.acceptProbability).toBeLessThan(0.2);
  });

  it("quarantines borderline memories", async () => {
    const model = new RuleBasedGateModel();
    const prediction = await model.predict(borderlineFeatures);
    expect(prediction.action).toBe("quarantine");
  });

  it("returns feature importances", async () => {
    const model = new RuleBasedGateModel();
    const prediction = await model.predict(highTrustFeatures);
    expect(prediction.featureImportances).toBeDefined();
    expect(prediction.featureImportances!.trustScore).toBe(0.35);
  });

  it("respects custom thresholds", async () => {
    const model = new RuleBasedGateModel(0.8, 0.6);
    const prediction = await model.predict(highTrustFeatures);
    // With very high thresholds, even good features might quarantine
    expect(["allow", "quarantine"]).toContain(prediction.action);
  });
});

describe("LogisticRegressionGateModel", () => {
  it("throws stub error on predict", async () => {
    const model = new LogisticRegressionGateModel("/path/to/model.onnx");
    await expect(model.predict(highTrustFeatures)).rejects.toThrow("stub");
  });

  it("throws stub error on update", async () => {
    const model = new LogisticRegressionGateModel("/path/to/model.onnx");
    await expect(model.update!(highTrustFeatures, "allow")).rejects.toThrow("stub");
  });
});
