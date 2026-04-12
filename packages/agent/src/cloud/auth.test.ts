/**
 * Tests for cloud/auth.ts — the Eliza Cloud login flow.
 *
 * Uses a real local HTTP server to simulate cloud auth endpoints,
 * exercising the real fetch path without mocks.
 *
 * Exercises:
 *   - Session creation (success, HTTP errors)
 *   - Polling loop (pending -> authenticated, timeout, expiry)
 *   - Browser URL construction
 *   - API key extraction from response
 *   - Edge cases: key already retrieved, 404 mid-poll
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./validate-url", () => {
  return {
    validateCloudBaseUrl: vi.fn().mockResolvedValue(null),
  };
});

import { cloudLogin } from "./auth";

// ---------------------------------------------------------------------------
// Local test server that simulates cloud auth endpoints
// ---------------------------------------------------------------------------

type ServerBehavior = {
  onCreateSession?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void;
  onPollSession?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    sessionId: string,
  ) => void;
};

let server: http.Server;
let serverPort: number;
let behavior: ServerBehavior = {};

function json(res: http.ServerResponse, body: Record<string, unknown>, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1`);

    // POST /api/auth/cli-session — session creation
    if (
      url.pathname === "/api/auth/cli-session" &&
      req.method === "POST"
    ) {
      if (behavior.onCreateSession) {
        behavior.onCreateSession(req, res);
      } else {
        json(res, { sessionId: "test-session", status: "pending" }, 201);
      }
      return;
    }

    // GET /api/auth/cli-session/:id — poll
    const pollMatch = url.pathname.match(/^\/api\/auth\/cli-session\/(.+)$/);
    if (pollMatch) {
      const sessionId = decodeURIComponent(pollMatch[1]);
      if (behavior.onPollSession) {
        behavior.onPollSession(req, res, sessionId);
      } else {
        json(res, { status: "pending" });
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  serverPort = (server.address() as AddressInfo).port;
});

afterEach(() => {
  behavior = {};
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function baseUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cloudLogin", () => {
  it("creates session, polls, and returns API key on success", async () => {
    let pollCount = 0;

    behavior.onPollSession = (_req, res) => {
      pollCount++;
      if (pollCount < 3) {
        json(res, { status: "pending" });
      } else {
        json(res, {
          status: "authenticated",
          apiKey: "eliza_test123",
          keyPrefix: "eliza_test",
          expiresAt: null,
        });
      }
    };

    let browserUrl = "";
    const result = await cloudLogin({
      baseUrl: baseUrl(),
      pollIntervalMs: 10,
      timeoutMs: 5000,
      onBrowserUrl: (url) => {
        browserUrl = url;
      },
    });

    expect(result.apiKey).toBe("eliza_test123");
    expect(result.keyPrefix).toBe("eliza_test");
    expect(result.expiresAt).toBeNull();
    expect(browserUrl).toContain("/auth/cli-login?session=");
    expect(pollCount).toBe(3);
  });

  it("throws on session creation failure", async () => {
    behavior.onCreateSession = (_req, res) => {
      res.writeHead(500);
      res.end("Server Error");
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        pollIntervalMs: 10,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("Failed to create auth session");
  });

  it("throws on timeout when login is never completed", async () => {
    // Poll always returns pending
    behavior.onPollSession = (_req, res) => {
      json(res, { status: "pending" });
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        pollIntervalMs: 10,
        timeoutMs: 100,
      }),
    ).rejects.toThrow("Cloud login timed out");
  });

  it("throws when session creation request times out", async () => {
    behavior.onCreateSession = () => {
      // Never respond — let it time out
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        requestTimeoutMs: 50,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("creating session");
  });

  it("throws when poll request times out", async () => {
    behavior.onPollSession = () => {
      // Never respond — let the poll time out
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        pollIntervalMs: 1,
        timeoutMs: 5000,
        requestTimeoutMs: 50,
      }),
    ).rejects.toThrow("polling");
  });

  it("rejects redirect responses during session creation", async () => {
    behavior.onCreateSession = (_req, res) => {
      res.writeHead(302, { location: "https://evil.example" });
      res.end();
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        requestTimeoutMs: 500,
      }),
    ).rejects.toThrow("redirected");
  });

  it("throws when session becomes 404 mid-poll", async () => {
    let callCount = 0;

    behavior.onPollSession = (_req, res) => {
      callCount++;
      if (callCount >= 2) {
        res.writeHead(404);
        res.end("Not found");
      } else {
        json(res, { status: "pending" });
      }
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        pollIntervalMs: 10,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow("Auth session expired or not found");
  });

  it("throws when authenticated but key already retrieved", async () => {
    behavior.onPollSession = (_req, res) => {
      json(res, {
        status: "authenticated",
        message: "API key already retrieved",
      });
    };

    await expect(
      cloudLogin({
        baseUrl: baseUrl(),
        pollIntervalMs: 10,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow("API key was already retrieved");
  });

  it("calls onPollStatus with each status", async () => {
    let callCount = 0;
    behavior.onPollSession = (_req, res) => {
      callCount++;
      if (callCount < 2) {
        json(res, { status: "pending" });
      } else {
        json(res, {
          status: "authenticated",
          apiKey: "k",
          keyPrefix: "p",
        });
      }
    };

    const statuses: string[] = [];
    await cloudLogin({
      baseUrl: baseUrl(),
      pollIntervalMs: 10,
      timeoutMs: 5000,
      onPollStatus: (s) => statuses.push(s),
    });

    expect(statuses).toContain("pending");
    expect(statuses).toContain("authenticated");
  });
});
