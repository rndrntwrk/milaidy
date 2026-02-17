/**
 * Tests for autonomy/config.ts
 *
 * Exercises:
 *   - Config resolution with defaults
 *   - Config validation
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTONOMY_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG,
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";
import { createDefaultAutonomyIdentity } from "./identity/schema.js";

describe("resolveAutonomyConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveAutonomyConfig();
    expect(config.enabled).toBe(false);
    expect(config.trust.writeThreshold).toBe(0.7);
    expect(config.trust.quarantineThreshold).toBe(0.3);
    expect(config.memoryGate.enabled).toBe(true);
    expect(config.driftMonitor.analysisWindowSize).toBe(20);
    expect(config.identity).toBeUndefined();
    expect(config.retrieval.trustWeight).toBe(0.3);
    expect(config.retrieval.maxResults).toBe(20);
    expect(config.workflowEngine?.provider).toBe("local");
    expect(config.workflowEngine?.temporal?.taskQueue).toBe("autonomy-tasks");
    expect(config.workflowEngine?.temporal?.defaultTimeoutMs).toBe(30_000);
    expect(config.workflowEngine?.temporal?.deadLetterMax).toBe(1_000);
  });

  it("merges user values over defaults", () => {
    const config = resolveAutonomyConfig({
      enabled: true,
      trust: { writeThreshold: 0.9 },
    });

    expect(config.enabled).toBe(true);
    expect(config.trust.writeThreshold).toBe(0.9);
    // Other trust fields keep defaults
    expect(config.trust.quarantineThreshold).toBe(0.3);
    expect(config.trust.llmAnalysis).toBe(false);
  });

  it("preserves all user overrides", () => {
    const config = resolveAutonomyConfig({
      enabled: true,
      trust: {
        writeThreshold: 0.8,
        quarantineThreshold: 0.2,
        llmAnalysis: true,
        historyWindow: 50,
      },
      memoryGate: {
        enabled: false,
        quarantineReviewMs: 1000,
        maxQuarantineSize: 500,
      },
      driftMonitor: {
        enabled: false,
        analysisWindowSize: 10,
        alertThreshold: 0.3,
        correctionThreshold: 0.5,
      },
    });

    expect(config.trust.llmAnalysis).toBe(true);
    expect(config.trust.historyWindow).toBe(50);
    expect(config.memoryGate.enabled).toBe(false);
    expect(config.memoryGate.maxQuarantineSize).toBe(500);
    expect(config.driftMonitor.analysisWindowSize).toBe(10);
  });

  it("inherits workflow timeout for temporal engine when not explicitly set", () => {
    const config = resolveAutonomyConfig({
      workflow: { defaultTimeoutMs: 45_000 },
      workflowEngine: { provider: "temporal", temporal: {} },
    });
    expect(config.workflowEngine?.temporal?.defaultTimeoutMs).toBe(45_000);
  });
});

describe("validateAutonomyConfig", () => {
  it("returns empty for valid default config", () => {
    const issues = validateAutonomyConfig(DEFAULT_AUTONOMY_CONFIG);
    expect(issues).toHaveLength(0);
  });

  it("catches writeThreshold out of range", () => {
    const issues = validateAutonomyConfig({
      trust: { writeThreshold: 1.5 },
    });
    expect(issues.some((i) => i.path.includes("writeThreshold"))).toBe(true);
  });

  it("catches negative quarantineThreshold", () => {
    const issues = validateAutonomyConfig({
      trust: { quarantineThreshold: -0.1 },
    });
    expect(issues.some((i) => i.path.includes("quarantineThreshold"))).toBe(true);
  });

  it("catches quarantineThreshold >= writeThreshold", () => {
    const issues = validateAutonomyConfig({
      trust: { writeThreshold: 0.5, quarantineThreshold: 0.6 },
    });
    expect(issues.some((i) => i.message.includes("less than"))).toBe(true);
  });

  it("catches historyWindow < 1", () => {
    const issues = validateAutonomyConfig({
      trust: { historyWindow: 0 },
    });
    expect(issues.some((i) => i.path.includes("historyWindow"))).toBe(true);
  });

  it("catches maxQuarantineSize < 1", () => {
    const issues = validateAutonomyConfig({
      memoryGate: { maxQuarantineSize: 0 },
    });
    expect(issues.some((i) => i.path.includes("maxQuarantineSize"))).toBe(true);
  });

  it("catches analysisWindowSize < 1", () => {
    const issues = validateAutonomyConfig({
      driftMonitor: { analysisWindowSize: 0 },
    });
    expect(issues.some((i) => i.path.includes("analysisWindowSize"))).toBe(true);
  });

  it("catches alertThreshold out of range", () => {
    const issues = validateAutonomyConfig({
      driftMonitor: { alertThreshold: 2.0 },
    });
    expect(issues.some((i) => i.path.includes("alertThreshold"))).toBe(true);
  });

  it("catches retrieval weight out of range", () => {
    const issues = validateAutonomyConfig({
      retrieval: { trustWeight: 1.5 },
    });
    expect(issues.some((i) => i.path.includes("trustWeight"))).toBe(true);
  });

  it("catches retrieval weights that do not sum to ~1.0", () => {
    const issues = validateAutonomyConfig({
      retrieval: { trustWeight: 0.1, recencyWeight: 0.1, relevanceWeight: 0.1, typeWeight: 0.1 },
    });
    expect(issues.some((i) => i.message.includes("sum to"))).toBe(true);
  });

  it("accepts retrieval weights that sum to ~1.0", () => {
    const issues = validateAutonomyConfig({
      retrieval: { trustWeight: 0.3, recencyWeight: 0.25, relevanceWeight: 0.3, typeWeight: 0.15 },
    });
    expect(issues.filter((i) => i.path.includes("retrieval"))).toHaveLength(0);
  });

  it("catches retrieval maxResults < 1", () => {
    const issues = validateAutonomyConfig({
      retrieval: { maxResults: 0 },
    });
    expect(issues.some((i) => i.path.includes("maxResults"))).toBe(true);
  });

  it("catches retrieval minTrustThreshold out of range", () => {
    const issues = validateAutonomyConfig({
      retrieval: { minTrustThreshold: -0.1 },
    });
    expect(issues.some((i) => i.path.includes("minTrustThreshold"))).toBe(true);
  });

  it("validates identity config when present", () => {
    const identity = createDefaultAutonomyIdentity();
    identity.coreValues = []; // invalid — requires at least one
    const issues = validateAutonomyConfig({ identity });
    expect(issues.some((i) => i.path.includes("coreValues"))).toBe(true);
  });

  it("accepts valid identity config", () => {
    const identity = createDefaultAutonomyIdentity();
    const issues = validateAutonomyConfig({ identity });
    expect(issues.filter((i) => i.path.includes("identity"))).toHaveLength(0);
  });

  it("catches invalid workflow engine provider", () => {
    const issues = validateAutonomyConfig({
      workflowEngine: { provider: "invalid" as never },
    });
    expect(
      issues.some((i) => i.path.includes("autonomy.workflowEngine.provider")),
    ).toBe(true);
  });

  it("catches empty temporal taskQueue when temporal provider is selected", () => {
    const issues = validateAutonomyConfig({
      workflowEngine: {
        provider: "temporal",
        temporal: { taskQueue: " " },
      },
    });
    expect(
      issues.some((i) =>
        i.path.includes("autonomy.workflowEngine.temporal.taskQueue"),
      ),
    ).toBe(true);
  });

  it("catches temporal defaultTimeoutMs below minimum", () => {
    const issues = validateAutonomyConfig({
      workflowEngine: {
        provider: "temporal",
        temporal: { defaultTimeoutMs: 500 },
      },
    });
    expect(
      issues.some((i) =>
        i.path.includes("autonomy.workflowEngine.temporal.defaultTimeoutMs"),
      ),
    ).toBe(true);
  });

  it("catches temporal deadLetterMax below minimum", () => {
    const issues = validateAutonomyConfig({
      workflowEngine: {
        provider: "temporal",
        temporal: { deadLetterMax: 0 },
      },
    });
    expect(
      issues.some((i) =>
        i.path.includes("autonomy.workflowEngine.temporal.deadLetterMax"),
      ),
    ).toBe(true);
  });
});

describe("resolveAutonomyConfig — retrieval & identity", () => {
  it("merges user retrieval overrides", () => {
    const config = resolveAutonomyConfig({
      retrieval: { trustWeight: 0.5, maxResults: 10 },
    });
    expect(config.retrieval.trustWeight).toBe(0.5);
    expect(config.retrieval.maxResults).toBe(10);
    // Other fields keep defaults
    expect(config.retrieval.recencyWeight).toBe(DEFAULT_RETRIEVAL_CONFIG.recencyWeight);
  });

  it("passes through identity config", () => {
    const identity = createDefaultAutonomyIdentity();
    const config = resolveAutonomyConfig({ identity });
    expect(config.identity).toBe(identity);
    expect(config.identity!.coreValues).toEqual(["helpfulness", "honesty", "safety"]);
  });
});
