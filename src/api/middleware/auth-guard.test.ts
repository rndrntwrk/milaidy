/**
 * Tests for Auth Guard Middleware.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createAuthGuard } from "./auth-guard.js";

// ---------- Helpers ----------

function mockReq(options: {
  url?: string;
  authorization?: string;
} = {}): IncomingMessage {
  return {
    url: options.url ?? "/api/agent/identity",
    headers: {
      authorization: options.authorization,
    },
  } as unknown as IncomingMessage;
}

function mockRes(): ServerResponse & { body: string; statusCode: number } {
  const res = {
    statusCode: 200,
    body: "",
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      res.body = data ?? "";
    }),
  } as unknown as ServerResponse & { body: string; statusCode: number };
  return res;
}

// ---------- Tests ----------

describe("createAuthGuard", () => {
  afterEach(() => {
    delete process.env.AUTONOMY_API_KEY;
  });

  it("passes through when no API key is configured", () => {
    const guard = createAuthGuard({ apiKey: "" });
    const req = mockReq();
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
    expect(result.identity).toBe("anonymous");
  });

  it("allows requests with valid Bearer token", () => {
    const guard = createAuthGuard({ apiKey: "secret-key-123" });
    const req = mockReq({ authorization: "Bearer secret-key-123" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
    expect(result.identity).toBe("api-key");
  });

  it("rejects requests without Authorization header", () => {
    const guard = createAuthGuard({ apiKey: "secret-key-123" });
    const req = mockReq();
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(false);
    expect(result.reason).toBe("missing_token");
    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with invalid token", () => {
    const guard = createAuthGuard({ apiKey: "secret-key-123" });
    const req = mockReq({ authorization: "Bearer wrong-key" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(false);
    expect(result.reason).toBe("invalid_token");
    expect(res.statusCode).toBe(401);
  });

  it("bypasses configured paths", () => {
    const guard = createAuthGuard({ apiKey: "secret-key-123" });
    const req = mockReq({ url: "/metrics" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
    expect(result.identity).toBe("bypass");
  });

  it("bypasses non-autonomy paths", () => {
    const guard = createAuthGuard({ apiKey: "secret-key-123" });
    const req = mockReq({ url: "/api/character" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
    expect(result.identity).toBe("non-autonomy");
  });

  it("reads API key from env var fallback", () => {
    process.env.AUTONOMY_API_KEY = "env-key";
    const guard = createAuthGuard();
    const req = mockReq({ authorization: "Bearer env-key" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
  });

  it("supports custom bypass paths", () => {
    const guard = createAuthGuard({
      apiKey: "key",
      bypassPaths: ["/custom-path"],
    });
    const req = mockReq({ url: "/custom-path" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
    expect(result.identity).toBe("bypass");
  });

  it("strips query params from path for bypass check", () => {
    const guard = createAuthGuard({ apiKey: "key" });
    const req = mockReq({ url: "/metrics?format=text" });
    const res = mockRes();

    const result = guard(req, res);

    expect(result.authenticated).toBe(true);
  });
});
