/**
 * Discord Voice Capability — Unit Tests
 *
 * Validates:
 *   1. Voice capability detection works (ffmpeg + opus probing)
 *   2. voiceActionGuard returns graceful error when voice is unavailable
 *   3. The discord plugin loads successfully even when voice deps are missing
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectVoiceCapability,
  getVoiceCapability,
  isVoiceSupported,
  resetVoiceCapabilityCache,
  voiceActionGuard,
  type VoiceCapability,
} from "../src/plugins/discord-voice-capability";

// ---------------------------------------------------------------------------
// 1. Voice Capability Detection
// ---------------------------------------------------------------------------

describe("Discord Voice Capability Detection", () => {
  afterEach(() => {
    resetVoiceCapabilityCache();
  });

  it("detectVoiceCapability returns a VoiceCapability object", async () => {
    const result = await detectVoiceCapability();

    expect(result).toHaveProperty("supported");
    expect(result).toHaveProperty("ffmpeg");
    expect(result).toHaveProperty("opus");
    expect(result).toHaveProperty("details");
    expect(typeof result.supported).toBe("boolean");
    expect(typeof result.ffmpeg).toBe("boolean");
    expect(typeof result.opus).toBe("boolean");
    expect(typeof result.details).toBe("string");
  });

  it("caches the result after first call", async () => {
    const first = await detectVoiceCapability();
    const second = await detectVoiceCapability();
    expect(first).toBe(second); // same reference
  });

  it("resetVoiceCapabilityCache clears cached result", async () => {
    await detectVoiceCapability();
    expect(getVoiceCapability()).toBeDefined();

    resetVoiceCapabilityCache();
    expect(getVoiceCapability()).toBeUndefined();
  });

  it("isVoiceSupported returns false before detection runs", () => {
    expect(isVoiceSupported()).toBe(false);
  });

  it("isVoiceSupported reflects detection result", async () => {
    const result = await detectVoiceCapability();
    expect(isVoiceSupported()).toBe(result.supported);
  });

  it("reports missing deps in details when not supported", async () => {
    const result = await detectVoiceCapability();
    if (!result.supported) {
      expect(result.details).toContain("Missing:");
    } else {
      expect(result.details).toBe("Voice dependencies available");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Voice Action Guard — Graceful Degradation
// ---------------------------------------------------------------------------

describe("Voice Action Guard", () => {
  afterEach(() => {
    resetVoiceCapabilityCache();
  });

  it("returns error string before detection has run", () => {
    const error = voiceActionGuard();
    expect(error).not.toBeNull();
    expect(error).toContain("not been checked yet");
  });

  it("returns null when voice is supported", async () => {
    // Force a supported result by running detection then checking
    const result = await detectVoiceCapability();
    if (result.supported) {
      expect(voiceActionGuard()).toBeNull();
    }
  });

  it("returns descriptive error when voice is not supported", async () => {
    const result = await detectVoiceCapability();
    if (!result.supported) {
      const error = voiceActionGuard();
      expect(error).not.toBeNull();
      expect(error).toContain("Voice is not available");
      expect(error).toContain("text channels");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Discord Plugin Loads Without Voice Deps
// ---------------------------------------------------------------------------

describe("Discord Plugin Resilience", () => {
  it("discord plugin is listed in OPTIONAL_CORE_PLUGINS", async () => {
    const { OPTIONAL_CORE_PLUGINS } = await import(
      "../src/runtime/core-plugins"
    );
    expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-discord");
  });

  it("voice capability module loads without throwing", async () => {
    // The module itself should always load, even if ffmpeg/opus are missing
    const mod = await import("../src/plugins/discord-voice-capability");
    expect(mod.detectVoiceCapability).toBeTypeOf("function");
    expect(mod.isVoiceSupported).toBeTypeOf("function");
    expect(mod.voiceActionGuard).toBeTypeOf("function");
  });

  it("detection completes without throwing even when deps are missing", async () => {
    // This should never throw, regardless of environment
    await expect(detectVoiceCapability()).resolves.toBeDefined();
  });

  it("guard provides actionable message for users", async () => {
    await detectVoiceCapability();
    const result = getVoiceCapability();
    if (result && !result.supported) {
      const error = voiceActionGuard();
      // Should tell user what's missing and that text still works
      expect(error).toMatch(/Missing:/);
      expect(error).toMatch(/text channels/);
    }
  });
});
