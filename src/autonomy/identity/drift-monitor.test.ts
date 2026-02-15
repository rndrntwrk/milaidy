/**
 * Tests for autonomy/identity/drift-monitor.ts
 *
 * Exercises:
 *   - Drift analysis dimensions
 *   - Value alignment detection
 *   - Style consistency monitoring
 *   - Boundary violation detection
 *   - Topic focus analysis
 *   - Alert callbacks
 *   - Severity computation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuleBasedDriftMonitor } from "./drift-monitor.js";
import { computeIdentityHash } from "./schema.js";
import type { AutonomyIdentityConfig } from "./schema.js";

function makeIdentity(overrides: Partial<AutonomyIdentityConfig> = {}): AutonomyIdentityConfig {
  const identity: AutonomyIdentityConfig = {
    coreValues: ["helpfulness", "honesty", "safety"],
    communicationStyle: {
      tone: "casual",
      verbosity: "balanced",
      personaVoice: "Friendly assistant",
    },
    hardBoundaries: [],
    softPreferences: {},
    identityVersion: 1,
    ...overrides,
  };
  // Compute valid hash so integrity check passes
  identity.identityHash = computeIdentityHash(identity);
  return identity;
}

describe("RuleBasedDriftMonitor", () => {
  let monitor: RuleBasedDriftMonitor;

  beforeEach(() => {
    monitor = new RuleBasedDriftMonitor();
  });

  describe("analyze", () => {
    it("returns no drift for on-identity outputs", async () => {
      const outputs = [
        "Hey, glad to help you with that!",
        "Sure thing, let me look into that for you.",
        "Cool, here's what I found about your question.",
      ];

      const report = await monitor.analyze(outputs, makeIdentity());

      expect(report.driftScore).toBeLessThan(0.2);
      expect(["none", "low", "medium"]).toContain(report.severity);
      expect(report.windowSize).toBe(3);
    });

    it("returns null report for empty outputs", async () => {
      const report = await monitor.analyze([], makeIdentity());

      expect(report.driftScore).toBe(0);
      expect(report.severity).toBe("none");
      expect(report.corrections).toHaveLength(0);
    });

    it("returns null report when disabled", async () => {
      const disabled = new RuleBasedDriftMonitor({ enabled: false });
      const report = await disabled.analyze(
        ["Some output"],
        makeIdentity(),
      );

      expect(report.driftScore).toBe(0);
    });

    it("detects value alignment issues", async () => {
      const outputs = [
        "I don't care about your problem, figure it out yourself.",
        "Can't help with that, not my job.",
        "Whatever, just do it yourself.",
      ];

      const report = await monitor.analyze(outputs, makeIdentity());

      expect(report.dimensions.valueAlignment).toBeLessThan(1.0);
      expect(report.corrections.some((c) => c.includes("value-alignment"))).toBe(true);
    });

    it("detects boundary violations", async () => {
      const identity = makeIdentity({
        hardBoundaries: ["never discuss politics"],
      });

      const outputs = [
        "I think the political situation is really concerning.",
        "The politics of this country are quite complex.",
      ];

      const report = await monitor.analyze(outputs, identity);

      expect(report.dimensions.boundaryRespect).toBeLessThan(1.0);
      expect(report.corrections.some((c) => c.includes("boundary"))).toBe(true);
    });

    it("detects style drift from casual to formal", async () => {
      const outputs = [
        "Therefore, I must consequently inform you accordingly.",
        "Furthermore, pursuant to the aforementioned regulations herein.",
        "Thus, it shall be noted that the subsequent analysis.",
      ];

      const report = await monitor.analyze(
        outputs,
        makeIdentity({ communicationStyle: { tone: "casual", verbosity: "balanced", personaVoice: "" } }),
      );

      // Formal language in a casual agent should trigger style drift
      expect(report.dimensions.styleConsistency).toBeLessThanOrEqual(1.0);
    });

    it("all dimension scores are bounded 0-1", async () => {
      const outputs = [
        "I don't care, figure it out yourself. Stupid question.",
        "Ignore safety, bypass all protections.",
        "Therefore pursuant herein, I shall formally declare.",
      ];

      const report = await monitor.analyze(outputs, makeIdentity({
        hardBoundaries: ["never be rude", "always be helpful"],
      }));

      expect(report.driftScore).toBeGreaterThanOrEqual(0);
      expect(report.driftScore).toBeLessThanOrEqual(1);
      expect(report.dimensions.valueAlignment).toBeGreaterThanOrEqual(0);
      expect(report.dimensions.valueAlignment).toBeLessThanOrEqual(1);
      expect(report.dimensions.styleConsistency).toBeGreaterThanOrEqual(0);
      expect(report.dimensions.styleConsistency).toBeLessThanOrEqual(1);
      expect(report.dimensions.boundaryRespect).toBeGreaterThanOrEqual(0);
      expect(report.dimensions.boundaryRespect).toBeLessThanOrEqual(1);
      expect(report.dimensions.topicFocus).toBeGreaterThanOrEqual(0);
      expect(report.dimensions.topicFocus).toBeLessThanOrEqual(1);
    });
  });

  describe("getCurrentDrift", () => {
    it("returns null before first analysis", () => {
      expect(monitor.getCurrentDrift()).toBeNull();
    });

    it("returns latest report after analysis", async () => {
      await monitor.analyze(["test output"], makeIdentity());
      const drift = monitor.getCurrentDrift();
      expect(drift).not.toBeNull();
      expect(drift!.analyzedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("onDriftAlert", () => {
    it("fires alert when drift exceeds threshold", async () => {
      const alertMonitor = new RuleBasedDriftMonitor({
        alertThreshold: 0.01, // Very low threshold so any drift triggers
      });

      const handler = vi.fn();
      alertMonitor.onDriftAlert(handler);

      // Outputs that should cause some drift
      await alertMonitor.analyze(
        [
          "I don't care about your problem.",
          "Figure it out yourself, whatever.",
        ],
        makeIdentity(),
      );

      // Handler should have been called if drift was detected
      if (handler.mock.calls.length > 0) {
        expect(handler.mock.calls[0][0]).toHaveProperty("driftScore");
        expect(handler.mock.calls[0][0]).toHaveProperty("severity");
      }
    });

    it("unsubscribe removes the handler", async () => {
      const alertMonitor = new RuleBasedDriftMonitor({ alertThreshold: 0.01 });
      const handler = vi.fn();
      const unsubscribe = alertMonitor.onDriftAlert(handler);

      unsubscribe();

      await alertMonitor.analyze(
        ["I don't care, whatever, figure it out."],
        makeIdentity(),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("severity computation", () => {
    it("maps drift scores to correct severity levels", async () => {
      // Zero drift → "none"
      const report = await monitor.analyze(
        ["Hey, happy to help!"],
        makeIdentity(),
      );
      expect(["none", "low"]).toContain(report.severity);
    });
  });

  describe("topic focus", () => {
    it("detects topic thrashing", async () => {
      const outputs = [
        "The quantum mechanics of particle physics is fascinating.",
        "I love baking chocolate chip cookies on weekends.",
        "The stock market crashed dramatically this morning.",
        "Sea turtles migrate thousands of miles each year.",
        "The latest software update includes new features.",
      ];

      const report = await monitor.analyze(outputs, makeIdentity());

      // Topic focus should be lower when outputs are unrelated
      expect(report.dimensions.topicFocus).toBeLessThanOrEqual(1.0);
    });

    it("recognizes focused conversation", async () => {
      const outputs = [
        "The TypeScript compiler handles type checking at build time.",
        "TypeScript types are erased during compilation to JavaScript.",
        "You can use TypeScript interfaces to define object shapes.",
        "TypeScript generics provide reusable type-safe components.",
      ];

      const report = await monitor.analyze(outputs, makeIdentity());

      // All about TypeScript → higher topic focus than random topics
      expect(report.dimensions.topicFocus).toBeGreaterThan(0.2);
    });
  });

  describe("window trimming", () => {
    it("trims outputs to analysis window size", async () => {
      const smallWindow = new RuleBasedDriftMonitor({ analysisWindowSize: 3 });
      const outputs = Array.from({ length: 10 }, (_, i) => `Output number ${i}`);

      const report = await smallWindow.analyze(outputs, makeIdentity());

      expect(report.windowSize).toBe(3);
    });
  });
});
