/**
 * Tests for MemoryGateModel adapters.
 */

import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
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
  it("predicts high/low trust actions using baseline coefficients", async () => {
    const model = new LogisticRegressionGateModel("/tmp/missing-model.json");
    const high = await model.predict(highTrustFeatures);
    const low = await model.predict(lowTrustFeatures);
    const borderline = await model.predict(borderlineFeatures);

    expect(high.action).toBe("allow");
    expect(high.acceptProbability).toBeGreaterThan(0.8);
    expect(low.action).toBe("reject");
    expect(low.acceptProbability).toBeLessThan(0.2);
    expect(borderline.action).toBe("quarantine");
    expect(borderline.acceptProbability).toBeGreaterThan(0.2);
    expect(borderline.acceptProbability).toBeLessThan(0.4);
    expect(high.featureImportances).toBeDefined();
  });

  it("updates model online from allow/reject labels", async () => {
    const model = new LogisticRegressionGateModel("/tmp/missing-model.json");

    const beforeReject = await model.predict(lowTrustFeatures);
    await model.update!(lowTrustFeatures, "reject");
    const afterReject = await model.predict(lowTrustFeatures);
    expect(afterReject.acceptProbability).toBeLessThan(beforeReject.acceptProbability);

    const beforeAllow = await model.predict(highTrustFeatures);
    await model.update!(highTrustFeatures, "allow");
    const afterAllow = await model.predict(highTrustFeatures);
    expect(afterAllow.acceptProbability).toBeGreaterThanOrEqual(beforeAllow.acceptProbability);
  });

  it("loads model coefficients from JSON file when available", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "milaidy-lr-"));
    const modelPath = path.join(tmpDir, "gate-model.json");
    await writeFile(
      modelPath,
      JSON.stringify({
        bias: 2.5,
        learningRate: 0.03,
        weights: {
          trustScore: 0.1,
          sourceVerified: 0.1,
          semanticSimilarity: 0.1,
          hasExternalLinks: -0.1,
          touchesCoreValues: -0.1,
        },
      }),
      "utf8",
    );

    const model = new LogisticRegressionGateModel(modelPath, 0.7, 0.4);
    const prediction = await model.predict(lowTrustFeatures);

    expect(prediction.acceptProbability).toBeGreaterThan(0.7);
    expect(prediction.action).toBe("allow");
  });

  it("tracks rule-based decisions on representative baseline samples", async () => {
    const ruleModel = new RuleBasedGateModel();
    const logisticModel = new LogisticRegressionGateModel("/tmp/missing-model.json");
    const samples = [
      highTrustFeatures,
      lowTrustFeatures,
      borderlineFeatures,
      {
        ...highTrustFeatures,
        hasExternalLinks: true,
        trustScore: 0.75,
        sourceVerified: true,
      },
      {
        ...lowTrustFeatures,
        trustScore: 0.25,
        semanticSimilarity: 0.35,
        touchesCoreValues: false,
      },
    ];

    let matches = 0;
    for (const sample of samples) {
      const rule = await ruleModel.predict(sample);
      const logistic = await logisticModel.predict(sample);
      if (rule.action === logistic.action) matches += 1;
    }

    expect(matches).toBeGreaterThanOrEqual(4);
  });
});
