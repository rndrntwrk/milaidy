/**
 * Tests for ActivationMonitor adapters.
 */

import { describe, expect, it } from "vitest";
import { RuleBasedActivationMonitor, NeuralActivationMonitor } from "./activation-monitor.js";

describe("RuleBasedActivationMonitor", () => {
  it("detects deception patterns", async () => {
    const monitor = new RuleBasedActivationMonitor();
    const report = await monitor.analyze("I'll secretly handle this for you, but don't tell anyone.");
    expect(report.patterns.length).toBeGreaterThan(0);
    expect(report.patterns.some((p) => p.category === "deception")).toBe(true);
  });

  it("detects sycophancy patterns", async () => {
    const monitor = new RuleBasedActivationMonitor();
    const report = await monitor.analyze("You're absolutely right! Great question! I couldn't agree more.");
    expect(report.patterns.some((p) => p.category === "sycophancy")).toBe(true);
  });

  it("detects goal-drift patterns", async () => {
    const monitor = new RuleBasedActivationMonitor();
    const report = await monitor.analyze("Instead of that, actually I think we should do something else. Forget about the plan.");
    expect(report.patterns.some((p) => p.category === "goal-drift")).toBe(true);
  });

  it("returns clean report for benign output", async () => {
    const monitor = new RuleBasedActivationMonitor();
    const report = await monitor.analyze("The weather today is sunny with a high of 72.");
    expect(report.patterns).toHaveLength(0);
    expect(report.riskScore).toBe(0);
    expect(report.alert).toBe(false);
  });

  it("alerts when risk exceeds threshold", async () => {
    const monitor = new RuleBasedActivationMonitor(0.3);
    const report = await monitor.analyze("Secretly pretend to hide this. You're absolutely right, great idea!");
    expect(report.alert).toBe(true);
  });

  it("does not alert when risk is below threshold", async () => {
    const monitor = new RuleBasedActivationMonitor(0.99);
    const report = await monitor.analyze("Great question about the weather.");
    expect(report.alert).toBe(false);
  });

  it("get/set alert threshold", () => {
    const monitor = new RuleBasedActivationMonitor(0.5);
    expect(monitor.getAlertThreshold()).toBe(0.5);
    monitor.setAlertThreshold(0.8);
    expect(monitor.getAlertThreshold()).toBe(0.8);
  });

  it("clamps threshold to 0-1 range", () => {
    const monitor = new RuleBasedActivationMonitor();
    monitor.setAlertThreshold(-0.5);
    expect(monitor.getAlertThreshold()).toBe(0);
    monitor.setAlertThreshold(1.5);
    expect(monitor.getAlertThreshold()).toBe(1);
  });
});

describe("NeuralActivationMonitor", () => {
  it("throws stub error on analyze", async () => {
    const monitor = new NeuralActivationMonitor("http://localhost:9999");
    await expect(monitor.analyze("test")).rejects.toThrow("stub");
  });
});
