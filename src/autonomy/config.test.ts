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
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";

describe("resolveAutonomyConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveAutonomyConfig();
    expect(config.enabled).toBe(false);
    expect(config.trust.writeThreshold).toBe(0.7);
    expect(config.trust.quarantineThreshold).toBe(0.3);
    expect(config.memoryGate.enabled).toBe(true);
    expect(config.driftMonitor.analysisWindowSize).toBe(20);
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
});
