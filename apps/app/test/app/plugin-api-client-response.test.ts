import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, MiladyClient } from "../../src/api-client";

describe("MiladyClient plugin API response handling", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
  });

  it("parses structured non-OK JSON plugin test responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          ok: false,
          code: "plugin_disabled",
          pluginId: "555arcade",
          error: "Plugin is installed but disabled. Enable it before testing.",
          durationMs: 17,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const client = new MiladyClient("http://localhost:2138");
    await expect(client.testPluginConnection("555arcade")).resolves.toMatchObject(
      {
        success: false,
        code: "plugin_disabled",
        pluginId: "555arcade",
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.credentials).toBe("include");
    expect(requestInit.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  it("surfaces a clear auth message when plugin test returns Cloudflare Access HTML", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        "<!DOCTYPE html><html><body>https://rndrntwrk.cloudflareaccess.com/cdn-cgi/access/login</body></html>",
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
    );

    const client = new MiladyClient("http://localhost:2138");
    const request = client.testPluginConnection("555arcade");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      kind: "http",
      path: "/api/plugins/555arcade/test",
      message: expect.stringContaining("Cloudflare Access"),
    });
  });

  it("surfaces a clear auth message when plugin UI state returns Cloudflare Access HTML", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        "<!DOCTYPE html><html><body>https://rndrntwrk.cloudflareaccess.com/cdn-cgi/access/login</body></html>",
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
    );

    const client = new MiladyClient("http://localhost:2138");
    const request = client.getPluginUiState("555arcade");

    await expect(request).rejects.toMatchObject({
      kind: "http",
      path: "/api/plugins/555arcade/ui-state",
      message: expect.stringContaining("Cloudflare Access"),
    });
  });
});
