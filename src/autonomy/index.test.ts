/**
 * Tests for autonomy/index.ts (Kernel entry point)
 *
 * Exercises:
 *   - Kernel initialization and shutdown
 *   - Feature gate behavior
 *   - Config resolution and validation
 *   - Re-initialization guard
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  getAutonomyConfig,
  initAutonomyKernel,
  isAutonomyEnabled,
  resetAutonomyKernel,
  shutdownAutonomyKernel,
} from "./index.js";

describe("Autonomy Kernel", () => {
  afterEach(() => {
    resetAutonomyKernel();
  });

  describe("initAutonomyKernel", () => {
    it("initializes with defaults (disabled)", async () => {
      const result = await initAutonomyKernel();

      expect(result.enabled).toBe(false);
      expect(result.issues).toHaveLength(0);
      expect(isAutonomyEnabled()).toBe(false);
    });

    it("initializes as enabled when configured", async () => {
      const result = await initAutonomyKernel({ enabled: true });

      expect(result.enabled).toBe(true);
      expect(isAutonomyEnabled()).toBe(true);
    });

    it("resolves config with merged defaults", async () => {
      await initAutonomyKernel({
        enabled: true,
        trust: { writeThreshold: 0.8 },
      });

      const config = getAutonomyConfig();
      expect(config).not.toBeNull();
      expect(config!.trust.writeThreshold).toBe(0.8);
      // Other trust fields should have defaults
      expect(config!.trust.quarantineThreshold).toBe(0.3);
      expect(config!.trust.llmAnalysis).toBe(false);
    });

    it("reports validation issues without blocking", async () => {
      const result = await initAutonomyKernel({
        enabled: true,
        trust: {
          writeThreshold: 0.2,
          quarantineThreshold: 0.5, // Higher than write → invalid
        },
      });

      expect(result.enabled).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].path).toContain("trust");
    });

    it("guards against re-initialization", async () => {
      await initAutonomyKernel({ enabled: true });
      const result = await initAutonomyKernel({ enabled: false });

      // Should still be enabled (first init wins)
      expect(isAutonomyEnabled()).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("shutdownAutonomyKernel", () => {
    it("disables the kernel", async () => {
      await initAutonomyKernel({ enabled: true });
      expect(isAutonomyEnabled()).toBe(true);

      await shutdownAutonomyKernel();
      expect(isAutonomyEnabled()).toBe(false);
    });

    it("is safe to call when not initialized", async () => {
      await expect(shutdownAutonomyKernel()).resolves.toBeUndefined();
    });
  });

  describe("getAutonomyConfig", () => {
    it("returns null before initialization", () => {
      expect(getAutonomyConfig()).toBeNull();
    });

    it("returns resolved config after initialization", async () => {
      await initAutonomyKernel({ enabled: true });
      const config = getAutonomyConfig();

      expect(config).not.toBeNull();
      expect(config!.enabled).toBe(true);
      expect(config!.memoryGate).toBeDefined();
      expect(config!.driftMonitor).toBeDefined();
    });
  });

  describe("resetAutonomyKernel", () => {
    it("clears all kernel state", async () => {
      await initAutonomyKernel({ enabled: true });
      resetAutonomyKernel();

      expect(isAutonomyEnabled()).toBe(false);
      expect(getAutonomyConfig()).toBeNull();
    });

    it("allows re-initialization after reset", async () => {
      await initAutonomyKernel({ enabled: true });
      resetAutonomyKernel();
      await initAutonomyKernel({ enabled: false });

      expect(isAutonomyEnabled()).toBe(false);
    });
  });
});
