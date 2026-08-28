import { describe, expect, test } from "bun:test";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const exactIntent = {
  intentId: "intent-discord-private-001",
  action: "social.message",
  target: "connector:discord:234567890123456789",
  argumentHash: digest("a"),
  nonce: "nonce-discord-private-001",
  expiresAt: 1_787_400_060_000,
  capabilityId: "cap-discord-private-001",
  programDigest: digest("1"),
  releaseDigest: digest("2"),
  policyHash: digest("3"),
};

describe("Alice connector authorization ingress", () => {
  test("matches only the exact private connector authorization route", async () => {
    const implementation = await import("../src/connector-authorization");
    const matcher = (
      implementation as typeof implementation & {
        isConnectorAuthorizationRoute?: (
          method: string,
          path: string,
        ) => boolean;
      }
    ).isConnectorAuthorizationRoute;
    expect(typeof matcher).toBe("function");
    if (!matcher) return;
    expect(
      matcher("POST", "/control/internal/v1/connectors/authorize"),
    ).toBe(true);
    for (const [method, path] of [
      ["GET", "/control/internal/v1/connectors/authorize"],
      ["POST", "/control/internal/v1/connectors/authorize/"],
      ["POST", "/control/internal/v1/connectors/send"],
      ["POST", "/control/api/v1/connectors/authorize"],
    ]) {
      expect(matcher(method!, path!)).toBe(false);
    }
  });

  test("returns only an exact capability-authorized decision for a private connector target", async () => {
    const implementation = await import("../src/connector-authorization").catch(
      () => null,
    );
    expect(implementation).not.toBeNull();
    if (!implementation) return;

    const seen: unknown[] = [];
    const response = await implementation.handleConnectorAuthorization(
      new Request("https://alice-control.internal/connectors/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(exactIntent),
      }),
      async (intent) => {
        seen.push(structuredClone(intent));
        return {
          response: new Response(null, { status: 200 }),
          value: {
            ok: true,
            decision: {
              allowed: true,
              code: "CAPABILITY_AUTHORIZED",
              risk: "high",
            },
          },
        };
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      allowed: true,
      code: "CAPABILITY_AUTHORIZED",
    });
    expect(seen).toEqual([exactIntent]);
  });

  test("rejects malformed, ambient, and non-connector destinations before durable authority", async () => {
    const { handleConnectorAuthorization } = await import(
      "../src/connector-authorization"
    );
    const calls: unknown[] = [];
    const authorize = async (intent: unknown) => {
      calls.push(intent);
      return {
        response: new Response(null, { status: 200 }),
        value: { decision: { allowed: true, code: "CAPABILITY_AUTHORIZED" } },
      };
    };
    for (const candidate of [
      { ...exactIntent, capabilityId: "" },
      { ...exactIntent, target: "connector:discord:general" },
      { ...exactIntent, target: "https://discord.com/channels/public" },
      { ...exactIntent, action: "social.post" },
      { ...exactIntent, argumentHash: "not-a-digest" },
      { ...exactIntent, nonce: "short" },
      { ...exactIntent, unexpected: true },
    ]) {
      const response = await handleConnectorAuthorization(
        new Request("https://alice-control.internal/connectors/authorize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(candidate),
        }),
        authorize,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        allowed: false,
        code: "CONNECTOR_INTENT_INVALID",
      });
    }
    expect(calls).toHaveLength(0);
  });

  test("preserves exact fail-closed policy decisions for absent, revoked, paused, and mismatched grants", async () => {
    const { handleConnectorAuthorization } = await import(
      "../src/connector-authorization"
    );
    for (const code of [
      "CAPABILITY_REQUIRED",
      "CAPABILITY_REVOKED",
      "PAUSED_ALL",
      "PAUSED_RELEASE",
      "PAUSED_SOCIAL",
      "RELEASE_BINDING_MISMATCH",
      "ACTION_DISABLED",
    ]) {
      const response = await handleConnectorAuthorization(
        new Request("https://alice-control.internal/connectors/authorize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(exactIntent),
        }),
        async () => ({
          response: new Response(null, { status: 200 }),
          value: { ok: true, decision: { allowed: false, code, risk: "high" } },
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        ok: false,
        allowed: false,
        code,
      });
    }
  });

  test("fails closed when durable authority returns a malformed or contradictory decision", async () => {
    const { handleConnectorAuthorization } = await import(
      "../src/connector-authorization"
    );
    for (const value of [
      null,
      {},
      { decision: { allowed: true, code: "ACTION_DISABLED" } },
      { decision: { allowed: false, code: "CAPABILITY_AUTHORIZED" } },
    ]) {
      const response = await handleConnectorAuthorization(
        new Request("https://alice-control.internal/connectors/authorize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(exactIntent),
        }),
        async () => ({
          response: new Response(null, { status: 200 }),
          value,
        }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        ok: false,
        allowed: false,
        code: "CONNECTOR_AUTHORITY_RESPONSE_INVALID",
      });
    }
  });
});
