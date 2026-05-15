import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MiladyClient } from "./client";

describe("MiladyClient getConfig auth gate", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("skips protected config fetch when the browser is not authenticated", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/auth/status")) {
        return new Response(
          JSON.stringify({
            required: true,
            authenticated: false,
            localAccess: false,
            pairingEnabled: true,
            expiresAt: 123,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/config")) {
        throw new Error("config should not be requested before auth");
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    const client = new MiladyClient("https://staging-alice.example");

    await expect(client.getConfig()).resolves.toEqual({});
    expect(calls).toEqual(["https://staging-alice.example/api/auth/status"]);
  });

  it("fetches config after the browser is authenticated", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/auth/status")) {
        return new Response(
          JSON.stringify({
            required: true,
            authenticated: true,
            localAccess: false,
            pairingEnabled: true,
            expiresAt: 123,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/config")) {
        return new Response(JSON.stringify({ ui: { avatarIndex: 2 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    const client = new MiladyClient("https://staging-alice.example");

    await expect(client.getConfig()).resolves.toEqual({
      ui: { avatarIndex: 2 },
    });
    expect(calls).toEqual([
      "https://staging-alice.example/api/auth/status",
      "https://staging-alice.example/api/config",
    ]);
  });

  it("keeps the split client-agent implementation on the same auth gate", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "client-agent.ts"),
      "utf8",
    );

    expect(source).toContain("auth?.required === true");
    expect(source).toContain("auth.authenticated === false");
    expect(source).toContain("auth.localAccess !== true");
    expect(source.indexOf("this.getAuthStatus().catch")).toBeLessThan(
      source.indexOf('this.fetch("/api/config")'),
    );
  });
});
