import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createEnvSandbox } from "../test-support/test-helpers.js";
import {
  _resetAuthRateLimiter,
  ensureCompatApiAuthorized,
  ensureCompatSensitiveRouteAuthorized,
  getProvidedApiToken,
  isCompatApiAuthDisabled,
  tokenMatches,
} from "./auth";

function mockReq(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return { headers };
}

function mockSocketReq(
  headers: http.IncomingHttpHeaders = {},
  remoteAddress = "203.0.113.10",
): Pick<http.IncomingMessage, "headers" | "socket"> {
  return {
    headers,
    socket: { remoteAddress } as http.IncomingMessage["socket"],
  };
}

function mockRes(): {
  statusCode: number;
  ended: boolean;
  body: string;
  writeHead: (code: number) => void;
  end: (body?: string) => void;
  setHeader: (k: string, v: string) => void;
} {
  const res = {
    statusCode: 200,
    ended: false,
    body: "",
    writeHead(code: number) {
      res.statusCode = code;
    },
    end(body?: string) {
      res.body = body ?? "";
      res.ended = true;
    },
    setHeader(_k: string, _v: string) {},
  };
  return res;
}

describe("getProvidedApiToken", () => {
  it("accepts the documented x-milady-token header", () => {
    expect(
      getProvidedApiToken(mockReq({ "x-milady-token": "milady-token" })),
    ).toBe("milady-token");
  });

  it("does not accept the undocumented x-milaidy-token typo alias", () => {
    expect(
      getProvidedApiToken(mockReq({ "x-milaidy-token": "typo-token" })),
    ).toBeNull();
  });
});

describe("tokenMatches — timing-safe comparison", () => {
  it("returns true for matching tokens", () => {
    expect(tokenMatches("secret-123", "secret-123")).toBe(true);
  });

  it("returns false for non-matching tokens of same length", () => {
    expect(tokenMatches("secret-123", "secret-456")).toBe(false);
  });

  it("returns false for tokens of different length without leaking length", () => {
    expect(tokenMatches("short", "a-much-longer-token")).toBe(false);
  });
});

describe("ensureCompatApiAuthorized — auth disabled flag", () => {
  const env = createEnvSandbox([
    "MILADY_API_TOKEN",
    "ELIZA_API_TOKEN",
    "MILADY_AUTH_DISABLED",
    "MILAIDY_AUTH_DISABLED",
    "ELIZA_AUTH_DISABLED",
    "API_AUTH_DISABLED",
  ]);

  afterEach(() => {
    _resetAuthRateLimiter();
    env.restore();
  });

  it("allows unauthenticated requests when canonical Milady auth is disabled", () => {
    env.clear();
    process.env.MILADY_API_TOKEN = "secret-token";
    process.env.MILADY_AUTH_DISABLED = "1";

    const res = mockRes();
    const result = ensureCompatApiAuthorized(
      mockSocketReq(),
      res as never,
    );

    expect(isCompatApiAuthDisabled()).toBe(true);
    expect(result).toBe(true);
    expect(res.ended).toBe(false);
  });

  it("allows unauthenticated requests when deployed Milaidy auth is disabled", () => {
    env.clear();
    process.env.MILADY_API_TOKEN = "secret-token";
    process.env.MILAIDY_AUTH_DISABLED = "true";

    const res = mockRes();
    const result = ensureCompatApiAuthorized(
      mockSocketReq(),
      res as never,
    );

    expect(isCompatApiAuthDisabled()).toBe(true);
    expect(result).toBe(true);
    expect(res.ended).toBe(false);
  });

  it("still rejects unauthenticated requests when a token exists and auth is enabled", () => {
    env.clear();
    process.env.MILADY_API_TOKEN = "secret-token";

    const res = mockRes();
    const result = ensureCompatApiAuthorized(
      mockSocketReq(),
      res as never,
    );

    expect(isCompatApiAuthDisabled()).toBe(false);
    expect(result).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe("ensureCompatSensitiveRouteAuthorized — dev mode", () => {
  const env = createEnvSandbox([
    "NODE_ENV",
    "MILADY_API_TOKEN",
    "ELIZA_API_TOKEN",
    "MILADY_AUTH_DISABLED",
    "MILAIDY_AUTH_DISABLED",
    "ELIZA_AUTH_DISABLED",
    "API_AUTH_DISABLED",
    "MILADY_DEV_AUTH_BYPASS",
  ]);

  afterEach(() => {
    env.restore();
  });

  it("rejects unauthenticated requests in dev mode without explicit bypass", () => {
    env.clear();
    process.env.NODE_ENV = "development";
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("allows unauthenticated requests in dev mode with explicit bypass", () => {
    env.clear();
    process.env.NODE_ENV = "development";
    process.env.MILADY_DEV_AUTH_BYPASS = "1";
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(true);
  });

  it("requires token in production regardless of bypass flag", () => {
    env.clear();
    process.env.NODE_ENV = "production";
    process.env.MILADY_DEV_AUTH_BYPASS = "1";
    const res = mockRes();
    const result = ensureCompatSensitiveRouteAuthorized(
      { headers: {} },
      res as never,
    );
    expect(result).toBe(false);
  });
});
