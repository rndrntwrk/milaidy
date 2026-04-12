import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckRateLimit,
  mockGetGoogleConnectorStatus,
  mockCreateGmailReplyDraft,
} = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockGetGoogleConnectorStatus: vi.fn(),
  mockCreateGmailReplyDraft: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  stringToUuid: (value: string) => value,
}));

vi.mock("../src/api/rate-limiter", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("../src/diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: () => ({
    success: vi.fn(),
    failure: vi.fn(),
  }),
}));

vi.mock("../src/lifeops/service", () => {
  class MockLifeOpsServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "LifeOpsServiceError";
      this.status = status;
    }
  }

  class MockLifeOpsService {
    async getGoogleConnectorStatus(...args: unknown[]) {
      return mockGetGoogleConnectorStatus(...args);
    }

    async createGmailReplyDraft(...args: unknown[]) {
      return mockCreateGmailReplyDraft(...args);
    }
  }

  return {
    LifeOpsService: MockLifeOpsService,
    LifeOpsServiceError: MockLifeOpsServiceError,
  };
});

import { handleLifeOpsRoutes } from "../src/api/lifeops-routes";

function createContext(
  overrides: Partial<Parameters<typeof handleLifeOpsRoutes>[0]> = {},
) {
  const res = {
    statusCode: 200,
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  return {
    req: { headers: {} } as IncomingMessage,
    res,
    method: "GET",
    pathname: "/api/lifeops/connectors/google/status",
    url: new URL("http://localhost/api/lifeops/connectors/google/status"),
    state: {
      runtime: { agentId: "agent-rate-limit" } as never,
      adminEntityId: null,
    },
    json: vi.fn(),
    error: vi.fn(),
    readJsonBody: vi.fn(async () => null),
    decodePathComponent: vi.fn((raw: string) => raw),
    ...overrides,
  };
}

describe("life-ops route rate limits", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockReset().mockReturnValue({
      allowed: false,
      retryAfterMs: 1_250,
    });
    mockGetGoogleConnectorStatus.mockReset();
    mockCreateGmailReplyDraft.mockReset();
  });

  it("rejects rate-limited Google connector reads before hitting the service", async () => {
    const ctx = createContext();

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "agent-rate-limit:google_api_read",
      expect.objectContaining({ maxRequests: 120 }),
    );
    expect(
      ctx.res.writeHead as unknown as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(429, { "Retry-After": "2" });
    expect(
      ctx.res.end as unknown as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith(
      JSON.stringify({ error: "Rate limit exceeded", retryAfterMs: 1_250 }),
    );
    expect(mockGetGoogleConnectorStatus).not.toHaveBeenCalled();
  });

  it("rejects rate-limited Gmail draft creation before reading the body", async () => {
    const readJsonBody = vi.fn(async () => ({ threadId: "t-1" }));
    const ctx = createContext({
      method: "POST",
      pathname: "/api/lifeops/gmail/reply-drafts",
      url: new URL("http://localhost/api/lifeops/gmail/reply-drafts"),
      readJsonBody,
    });

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "agent-rate-limit:gmail_draft",
      expect.objectContaining({ maxRequests: 20 }),
    );
    expect(readJsonBody).not.toHaveBeenCalled();
    expect(mockCreateGmailReplyDraft).not.toHaveBeenCalled();
  });
});
