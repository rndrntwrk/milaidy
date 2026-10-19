/**
 * Tests for emote action — verifies enum is populated from catalog.
 */

import { describe, expect, it } from "vitest";
import { AGENT_EMOTE_CATALOG } from "../emotes/catalog";
import { emoteAction } from "./emote";

describe("emoteAction", () => {
  it("requires the Stream delivery receipt when native Stream is configured", async () => {
    const oldFetch = globalThis.fetch;
    const oldBase = process.env.STREAM555_PUBLIC_BASE_URL;
    const oldMode = process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    const oldProfile = process.env.ALICE_RUNTIME_PROFILE;
    process.env.STREAM555_PUBLIC_BASE_URL = 'https://stream.rndrntwrk.com';
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = 'proposer-only';
    process.env.ALICE_RUNTIME_PROFILE = 'full-gated';
    let sent = false;
    globalThis.fetch = async () => Response.json({ ok: true, broadcast: { sent } });
    const run = () => emoteAction.handler({} as never, {} as never, undefined,
      { parameters: { emote: 'dance-happy' } } as never);
    try {
      expect(await run()).toMatchObject({ success: false });
      sent = true;
      expect(await run()).toMatchObject({ success: true });
      delete process.env.ALICE_RUNTIME_AUTHORITY_MODE;
      sent = false;
      expect(await run()).toMatchObject({ success: true });
    } finally {
      globalThis.fetch = oldFetch;
      if (oldBase === undefined) delete process.env.STREAM555_PUBLIC_BASE_URL;
      else process.env.STREAM555_PUBLIC_BASE_URL = oldBase;
      if (oldMode === undefined) delete process.env.ALICE_RUNTIME_AUTHORITY_MODE;
      else process.env.ALICE_RUNTIME_AUTHORITY_MODE = oldMode;
      if (oldProfile === undefined) delete process.env.ALICE_RUNTIME_PROFILE;
      else process.env.ALICE_RUNTIME_PROFILE = oldProfile;
    }
  });

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
});
