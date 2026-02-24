/**
 * Tests for platform context injection provider.
 *
 * Exercises:
 *   - Platform detection from room source, metadata, and room ID patterns
 *   - Platform capability lookups
 *   - Context formatting
 *   - Provider integration with mock runtime
 */

import { describe, expect, it, vi } from "vitest";
import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import {
  detectPlatform,
  formatPlatformContext,
  getPlatformCapabilities,
  createPlatformContextProvider,
  type PlatformId,
} from "./platform-context.js";

// ---------- Helpers ----------

function makeMessage(overrides?: Partial<Memory>): Memory {
  return {
    id: "msg-1" as UUID,
    entityId: "entity-1" as UUID,
    roomId: "room-1" as UUID,
    content: { text: "test" },
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}

function createMockRuntime(roomSource?: string): IAgentRuntime {
  return {
    getRoom: vi.fn(async () =>
      roomSource !== undefined
        ? { id: "room-1", source: roomSource }
        : null,
    ),
  } as unknown as IAgentRuntime;
}

// ---------- Tests ----------

describe("detectPlatform()", () => {
  it("detects discord from room source", () => {
    expect(detectPlatform("discord")).toBe("discord");
  });

  it("detects telegram from room source", () => {
    expect(detectPlatform("telegram")).toBe("telegram");
  });

  it("detects web_chat from room source", () => {
    expect(detectPlatform("web_chat")).toBe("web_chat");
    expect(detectPlatform("webchat")).toBe("web_chat");
    expect(detectPlatform("web")).toBe("web_chat");
    expect(detectPlatform("client_chat")).toBe("web_chat");
  });

  it("detects platform from explicit metadata override", () => {
    expect(
      detectPlatform("unknown_source", null, { platform: "discord" }),
    ).toBe("discord");
  });

  it("prefers metadata.platform over room source", () => {
    expect(
      detectPlatform("telegram", null, { platform: "discord" }),
    ).toBe("discord");
  });

  it("detects web_chat from room ID pattern", () => {
    expect(detectPlatform(null, "web-conv-12345")).toBe("web_chat");
    expect(detectPlatform(null, "web-chat-room")).toBe("web_chat");
  });

  it("returns unknown for unrecognized source", () => {
    expect(detectPlatform("some_other_platform")).toBe("unknown");
  });

  it("returns unknown when no signals available", () => {
    expect(detectPlatform(null, null, null)).toBe("unknown");
  });

  it("is case insensitive", () => {
    expect(detectPlatform("Discord")).toBe("discord");
    expect(detectPlatform("TELEGRAM")).toBe("telegram");
    expect(detectPlatform("Web_Chat")).toBe("web_chat");
  });
});

describe("getPlatformCapabilities()", () => {
  const platforms: PlatformId[] = ["discord", "telegram", "web_chat", "unknown"];

  for (const platform of platforms) {
    it(`returns capabilities for ${platform}`, () => {
      const caps = getPlatformCapabilities(platform);
      expect(caps.platform).toBe(platform);
      expect(caps.displayName).toBeTruthy();
      expect(Array.isArray(caps.formatting)).toBe(true);
      expect(caps.formatting.length).toBeGreaterThan(0);
      expect(Array.isArray(caps.features)).toBe(true);
      expect(Array.isArray(caps.unavailable)).toBe(true);
      expect(Array.isArray(caps.rules)).toBe(true);
      expect(caps.rules.length).toBeGreaterThan(0);
    });
  }

  it("discord has thread support but not inline keyboards", () => {
    const caps = getPlatformCapabilities("discord");
    expect(caps.features.some((f) => f.includes("Thread"))).toBe(true);
    expect(caps.unavailable.some((f) => f.includes("Inline keyboards"))).toBe(true);
  });

  it("telegram has reply-to but not threads", () => {
    const caps = getPlatformCapabilities("telegram");
    expect(caps.features.some((f) => f.includes("Reply-to"))).toBe(true);
    expect(caps.unavailable.some((f) => f.includes("Thread"))).toBe(true);
  });

  it("web_chat has full markdown but no reactions", () => {
    const caps = getPlatformCapabilities("web_chat");
    expect(caps.formatting.some((f) => f.includes("Full markdown"))).toBe(true);
    expect(caps.unavailable.some((f) => f.includes("Reactions"))).toBe(true);
  });
});

describe("formatPlatformContext()", () => {
  it("includes platform name in header", () => {
    const caps = getPlatformCapabilities("discord");
    const text = formatPlatformContext(caps);
    expect(text).toContain("## Current Platform: Discord");
  });

  it("includes formatting section", () => {
    const caps = getPlatformCapabilities("telegram");
    const text = formatPlatformContext(caps);
    expect(text).toContain("### Formatting");
    expect(text).toContain("HTML subset");
  });

  it("includes unavailable features section", () => {
    const caps = getPlatformCapabilities("discord");
    const text = formatPlatformContext(caps);
    expect(text).toContain("### NOT Available on This Platform");
  });

  it("includes platform rules", () => {
    const caps = getPlatformCapabilities("web_chat");
    const text = formatPlatformContext(caps);
    expect(text).toContain("### Platform Rules");
    expect(text).toContain("react with an emoji");
  });

  it("includes cross-platform awareness section", () => {
    const caps = getPlatformCapabilities("discord");
    const text = formatPlatformContext(caps);
    expect(text).toContain("### Cross-Platform Awareness");
    expect(text).toContain("agent-scoped");
    expect(text).toContain("room-scoped");
  });
});

describe("createPlatformContextProvider()", () => {
  it("returns provider with correct name and description", () => {
    const provider = createPlatformContextProvider();
    expect(provider.name).toBe("milaidyPlatformContext");
    expect(provider.description).toBeTruthy();
  });

  it("detects discord from room source via runtime", async () => {
    const provider = createPlatformContextProvider();
    const runtime = createMockRuntime("discord");
    const message = makeMessage();

    const result = await provider.get!(runtime, message, {} as any);
    expect(result.values?.currentPlatform).toBe("discord");
    expect(result.values?.platformDisplayName).toBe("Discord");
    expect(result.text).toContain("## Current Platform: Discord");
  });

  it("detects telegram from room source via runtime", async () => {
    const provider = createPlatformContextProvider();
    const runtime = createMockRuntime("telegram");
    const message = makeMessage();

    const result = await provider.get!(runtime, message, {} as any);
    expect(result.values?.currentPlatform).toBe("telegram");
  });

  it("falls back to unknown when room not found", async () => {
    const provider = createPlatformContextProvider();
    const runtime = createMockRuntime(undefined); // getRoom returns null
    const message = makeMessage();

    const result = await provider.get!(runtime, message, {} as any);
    expect(result.values?.currentPlatform).toBe("unknown");
  });

  it("uses message metadata.platform when room source is missing", async () => {
    const provider = createPlatformContextProvider();
    const runtime = createMockRuntime(undefined);
    const message = makeMessage({
      metadata: { type: "message", platform: "telegram" } as any,
    });

    const result = await provider.get!(runtime, message, {} as any);
    expect(result.values?.currentPlatform).toBe("telegram");
  });

  it("handles runtime.getRoom failure gracefully", async () => {
    const provider = createPlatformContextProvider();
    const runtime = {
      getRoom: vi.fn(async () => {
        throw new Error("database down");
      }),
    } as unknown as IAgentRuntime;
    const message = makeMessage();

    // Should not throw
    const result = await provider.get!(runtime, message, {} as any);
    expect(result.values?.currentPlatform).toBe("unknown");
  });

  it("includes data payload with capabilities", async () => {
    const provider = createPlatformContextProvider();
    const runtime = createMockRuntime("discord");
    const message = makeMessage();

    const result = await provider.get!(runtime, message, {} as any);
    const data = result.data as Record<string, unknown>;
    expect(data.platform).toBe("discord");
    expect(data.displayName).toBe("Discord");
    expect(Array.isArray(data.features)).toBe(true);
    expect(Array.isArray(data.unavailable)).toBe(true);
    expect(Array.isArray(data.formatting)).toBe(true);
  });
});
