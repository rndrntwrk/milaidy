import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isWebSocketAuthorized,
  resolveWebSocketUpgradeRejection,
} from "../../src/api/server";

describe("resolveWebSocketUpgradeRejection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ELIZA_API_TOKEN;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.STEWARD_AGENT_TOKEN;
    delete process.env.ELIZA_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts only the trusted Access proxy websocket in Alice full-gated mode", () => {
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
    process.env.ALICE_RUNTIME_PROFILE = "full-gated";
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.MILADY_TRUST_CLOUDFLARE_ACCESS = "1";
    process.env.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET = "trusted-origin-proof";
    process.env.ELIZA_API_TOKEN = "runtime-token";
    process.env.ELIZA_ALLOWED_ORIGINS = "https://alice.rndrntwrk.com";
    const request = {
      headers: {
        origin: "https://alice.rndrntwrk.com",
        "cf-access-authenticated-user-email": "alice-owner@rndrntwrk.com",
        "x-milady-cloudflare-access-secret": "trusted-origin-proof",
      },
    } as unknown as http.IncomingMessage;
    const url = new URL("wss://alice.rndrntwrk.com/ws");

    expect(resolveWebSocketUpgradeRejection(request, url)).toBeNull();
    expect(isWebSocketAuthorized(request, url)).toBe(true);

    delete process.env.ALICE_RUNTIME_PROFILE;
    expect(resolveWebSocketUpgradeRejection(request, url)).toEqual({
      status: 403,
      reason: "Alice production WebSocket mutation surface is disabled",
    });
  });

  it("allows websocket upgrades when an API token is configured so clients can auth after open", () => {
    process.env.ELIZA_API_TOKEN = "local-token";

    const request = { headers: {} } as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws"),
    );

    expect(result).toBeNull();
  });

  it("rejects websocket query-string tokens unless explicitly enabled", () => {
    process.env.ELIZA_API_TOKEN = "local-token";

    const request = { headers: {} } as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws?token=local-token"),
    );

    expect(result).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("rejects websocket upgrades for steward-managed cloud containers without a configured token", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-token";

    const request = { headers: {} } as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws"),
    );

    expect(result).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("preserves anonymous websocket upgrades for non-cloud sessions without a configured token", () => {
    const request = { headers: {} } as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws"),
    );

    expect(result).toBeNull();
  });

  it("allows cloud websocket upgrades without handshake auth so clients can authenticate after open", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-token";
    process.env.ELIZA_API_TOKEN = "cloud-token";

    const request = { headers: {} } as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws"),
    );

    expect(result).toBeNull();
  });

  it("rejects invalid websocket handshake auth for steward-managed cloud containers", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-token";
    process.env.ELIZA_API_TOKEN = "cloud-token";

    const request = {
      headers: { authorization: "Bearer wrong-token" },
    } as unknown as http.IncomingMessage;
    const result = resolveWebSocketUpgradeRejection(
      request,
      new URL("ws://127.0.0.1/ws"),
    );

    expect(result).toEqual({ status: 401, reason: "Unauthorized" });
  });
});
