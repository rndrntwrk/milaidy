import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWebSocketUpgradeRejection } from "../../src/api/server";

describe("resolveWebSocketUpgradeRejection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ELIZA_API_TOKEN;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.STEWARD_AGENT_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

  it("still requires post-open websocket auth for steward-managed cloud containers", () => {
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
});
