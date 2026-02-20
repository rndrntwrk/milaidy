import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  assertTrustedAdminForAction,
  collectMessageSenderIdentifiers,
  matchTrustedAdminAllowlist,
  resolveMessageProvider,
} from "./trusted-admin.js";

function createRuntime(
  settings: Record<string, string> = {},
  agentId = "agent-1",
): IAgentRuntime {
  const runtimeSubset: Pick<IAgentRuntime, "getSetting" | "agentId"> = {
    getSetting: (key: string) => settings[key] ?? null,
    agentId,
  };
  return runtimeSubset as IAgentRuntime;
}

describe("trusted-admin runtime helpers", () => {
  it("resolves provider and sender identifiers from message metadata", () => {
    const message = {
      entityId: "entity-abc",
      content: { source: "telegram" },
      metadata: {
        provider: "telegram",
        sender: { id: "6689469214", username: "gl4sspr1sm" },
      },
    } as Memory;

    expect(resolveMessageProvider(message)).toBe("telegram");
    const ids = collectMessageSenderIdentifiers(message);
    expect(ids).toContain("entity-abc");
    expect(ids).toContain("6689469214");
    expect(ids).toContain("gl4sspr1sm");
  });

  it("matches provider-specific allowlist entries", () => {
    const runtime = createRuntime({
      MILAIDY_TRUSTED_ADMIN_IDS: "telegram:6689469214,discord:1234",
    });
    const message = {
      entityId: "entity-abc",
      metadata: {
        provider: "telegram",
        sender: { id: "6689469214" },
      },
      content: {},
    } as Memory;

    const match = matchTrustedAdminAllowlist(runtime, message);
    expect(match.trusted).toBe(true);
    expect(match.provider).toBe("telegram");
    expect(match.matchedId).toBe("telegram:6689469214");
  });

  it("denies untrusted external callers", () => {
    const runtime = createRuntime();
    const message = {
      entityId: "entity-user-1",
      metadata: {
        provider: "telegram",
        sender: { id: "999" },
      },
      content: { source: "telegram" },
    } as Memory;
    const state = {
      values: { trustedAdmin: false },
      data: {},
    } as State;

    expect(() =>
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_QUESTS_CREATE",
      ),
    ).toThrow(/requires trusted admin caller/);
  });

  it("allows internal autonomous agent actions", () => {
    const runtime = createRuntime({}, "agent-1");
    const message = {
      entityId: "agent-1",
      content: { source: "autonomous" },
      metadata: { provider: "system" },
    } as Memory;
    const state = {
      values: {},
      data: {},
    } as State;

    expect(() =>
      assertTrustedAdminForAction(runtime, message, state, "STREAM_CONTROL"),
    ).not.toThrow();
  });
});
