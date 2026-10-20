/**
 * Tests for emote action — verifies enum is populated from catalog.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_EMOTE_CATALOG } from "../emotes/catalog";
import { emoteAction } from "./emote";

vi.mock(
  "@miladyai/shared/runtime-env",
  () => import("../../../shared/src/runtime-env"),
);

describe("emoteAction", () => {
  it("has a parameter with enum populated from the emote catalog", () => {
    const emoteParam = emoteAction.parameters?.find((p) => p.name === "emote");
    expect(emoteParam).toBeDefined();
    expect(emoteParam?.schema).toBeDefined();

    const schema = emoteParam?.schema as { type: string; enum?: string[] };
    expect(schema.enum).toBeDefined();
    expect(schema.enum).toHaveLength(AGENT_EMOTE_CATALOG.length);
  });

  it("enum contains expected emote IDs", () => {
    const emoteParam = emoteAction.parameters?.find((p) => p.name === "emote");
    const schema = emoteParam?.schema as { type: string; enum?: string[] };
    const ids = schema.enum ?? [];

    // Spot-check some known emotes
    expect(ids).toContain("dance-happy");
    expect(ids).toContain("wave");

    // Excluded emotes should not appear
    expect(ids).not.toContain("idle");
    expect(ids).not.toContain("run");
    expect(ids).not.toContain("walk");
  });

  it("includes common mappings in description", () => {
    const emoteParam = emoteAction.parameters?.find((p) => p.name === "emote");
    expect(emoteParam?.description).toContain("dance-happy");
    expect(emoteParam?.description).toContain("wave");
    expect(emoteParam?.description).toContain("fishing");
  });

  describe("authenticated loopback transport", () => {
    beforeEach(() => {
      for (const key of [
        "MILADY_PORT",
        "ELIZA_PORT",
        "MILADY_API_TOKEN",
        "ELIZA_API_TOKEN",
      ]) {
        vi.stubEnv(key, undefined);
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    const playWave = () =>
      emoteAction.handler(
        {} as never,
        { content: { source: "client_chat" } } as never,
        undefined,
        { parameters: { emote: "wave" } },
      );

    it("uses the current configured listener port and token without redirecting credentials", async () => {
      vi.stubEnv("MILADY_PORT", "8080");
      vi.stubEnv("ELIZA_PORT", "9000");
      vi.stubEnv("MILADY_API_TOKEN", "milady-test-token");
      vi.stubEnv("ELIZA_API_TOKEN", "eliza-test-token");
      const result = await playWave();
      expect(fetch).toHaveBeenLastCalledWith(
        "http://127.0.0.1:8080/api/emote",
        {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer milady-test-token",
          },
          body: JSON.stringify({ emoteId: "wave" }),
        },
      );
      expect(result).toMatchObject({
        success: true,
        data: { emoteId: "wave" },
      });
      expect(JSON.stringify(result)).not.toContain("test-token");

      vi.stubEnv("MILADY_PORT", undefined);
      vi.stubEnv("ELIZA_PORT", "8081");
      vi.stubEnv("MILADY_API_TOKEN", undefined);
      await playWave();
      expect(fetch).toHaveBeenLastCalledWith(
        "http://127.0.0.1:8081/api/emote",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer eliza-test-token",
          },
        }),
      );
    });

    it("preserves the development fallback without adding an absent token", async () => {
      await playWave();
      expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:2138/api/emote", {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoteId: "wave" }),
      });
    });
  });
});
