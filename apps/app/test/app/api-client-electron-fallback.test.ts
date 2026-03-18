// @vitest-environment jsdom

import { MiladyClient } from "@milady/app-core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MiladyClient Electron API fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = (window as { __MILADY_API_BASE__?: string })
    .__MILADY_API_BASE__;
  const originalProtocol = window.location.protocol;
  const originalToken = (window as { __MILADY_API_TOKEN__?: string })
    .__MILADY_API_TOKEN__;

  beforeEach(() => {
    // Aggressively clear global state that might leak from other tests
    delete (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__;
    delete (window as { __MILADY_API_TOKEN__?: string }).__MILADY_API_TOKEN__;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    if (originalBase !== undefined) {
      (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
        originalBase;
    } else {
      delete (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__;
    }
    if (originalToken !== undefined) {
      (window as { __MILADY_API_TOKEN__?: string }).__MILADY_API_TOKEN__ =
        originalToken;
    } else {
      delete (window as { __MILADY_API_TOKEN__?: string }).__MILADY_API_TOKEN__;
    }
    Object.defineProperty(window, "location", {
      value: { ...window.location, protocol: originalProtocol },
      writable: true,
    });
  });

  function setProtocol(proto: string) {
    Object.defineProperty(window, "location", {
      value: { ...window.location, protocol: proto },
      writable: true,
    });
  }

  it("does not probe localhost on capacitor-electron protocol before API base is injected", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      undefined;
    setProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "starting",
        agentName: "Milady",
        model: undefined,
        uptime: undefined,
        startedAt: undefined,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    expect(client.apiAvailable).toBe(false);
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers injected API base over fallback", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      "http://localhost:9999";
    setProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          state: "running",
          agentName: "Milady",
          model: "test",
          uptime: 1,
          startedAt: Date.now(),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await client.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9999/api/status",
      expect.any(Object),
    );
  });

  it("starts unavailable on capacitor-electron and switches to injected API base when injected later", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      undefined;
    setProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          state: "running",
          agentName: "Milady",
          model: "test",
          uptime: 1,
          startedAt: Date.now(),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      "http://127.0.0.1:4444";
    await client.getStatus();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:4444/api/status",
      expect.any(Object),
    );
  });

  it("omits credentialed CORS defaults for capacitor-electron requests against an HTTP API base", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      "http://127.0.0.1:4444";
    setProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          required: false,
          pairingEnabled: false,
          expiresAt: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await client.getAuthStatus();

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit & {
      headers: Record<string, string>;
    }];
    expect(requestInit.credentials).toBe("omit");
    expect(requestInit.headers).not.toHaveProperty("X-Milady-Client-Id");
  });

  it("preserves same-origin web defaults for standard browser requests", async () => {
    delete (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__;
    setProtocol("http:");

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          state: "running",
          agentName: "Milady",
          model: "test",
          uptime: 1,
          startedAt: Date.now(),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    await client.getStatus();

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit & {
      headers: Record<string, string>;
    }];
    expect(requestInit.credentials).toBe("include");
    expect(requestInit.headers).toHaveProperty("X-Milady-Client-Id");
  });

  it("preserves explicit request overrides in capacitor-electron mode", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      "http://127.0.0.1:4444";
    setProtocol("capacitor-electron:");

    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 204,
      }),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await (
      client as unknown as {
        rawRequest: (
          path: string,
          init?: RequestInit,
          options?: { allowNonOk?: boolean; timeoutMs?: number },
        ) => Promise<Response>;
      }
    ).rawRequest(
      "/api/status",
      {
        credentials: "include",
        headers: {
          "X-Milady-Client-Id": "manual-client-id",
        },
      },
      { allowNonOk: true },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit & {
      headers: Record<string, string>;
    }];
    expect(requestInit.credentials).toBe("include");
    expect(requestInit.headers["X-Milady-Client-Id"]).toBe("manual-client-id");
  });
});
