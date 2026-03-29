import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "@elizaos/core";
import type { RouteRequestContext } from "../../src/api/route-helpers";
import { handleAliceOperatorRoutes } from "../../src/api/alice-operator-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildCtx(
  method: string,
  pathname: string,
  overrides: (Partial<RouteRequestContext> & Record<string, unknown>) = {},
) {
  const { res, getStatus, getJson } = createMockHttpResponse();
  const req = createMockIncomingMessage({ method, url: pathname });
  const ctx = {
    req,
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 400) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    runtime: {
      agentId: "agent-1",
      actions: [],
    } as unknown as AgentRuntime,
    ...overrides,
  } as RouteRequestContext & {
    runtime: AgentRuntime;
  };
  return { ctx, getStatus, getJson };
}

describe("alice-operator-routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for unrelated paths", async () => {
    const { ctx } = buildCtx("POST", "/api/other");
    const handled = await handleAliceOperatorRoutes(ctx);
    expect(handled).toBe(false);
  });

  it("rejects disallowed operator actions", async () => {
    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/alice/operator/execute",
      {
        readJsonBody: vi.fn(async () => ({
          steps: [{ action: "NOT_ALLOWED" }],
        })),
      },
    );

    const handled = await handleAliceOperatorRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "NOT_ALLOWED is not allowed through the Alice operator bridge",
    });
  });

  it("executes whitelisted runtime actions with an internal message source", async () => {
    const handler = vi.fn(async (_runtime, message, _state, options, callback) => {
      expect(message.content?.source).toBe("internal");
      expect(options).toEqual({
        parameters: { inputType: "avatar" },
      });
      await callback?.({
        text: "Legacy go-live ready for session session-1.",
        content: {
          success: true,
          data: { sessionId: "session-1" },
        },
      });
      return {
        success: true,
        text: JSON.stringify({
          ok: true,
          message: "Legacy go-live ready for session session-1.",
          data: { sessionId: "session-1" },
          status: 200,
        }),
      };
    });

    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/alice/operator/execute",
      {
        runtime: {
          agentId: "agent-1",
          actions: [
            {
              name: "STREAM555_GO_LIVE",
              validate: vi.fn(async () => true),
              handler,
            },
          ],
        } as unknown as AgentRuntime,
        readJsonBody: vi.fn(async () => ({
          steps: [
            {
              id: "go-live",
              action: "STREAM555_GO_LIVE",
              params: { inputType: "avatar" },
            },
          ],
        })),
      },
    );

    const handled = await handleAliceOperatorRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      allSucceeded: true,
      results: [
        {
          id: "go-live",
          action: "STREAM555_GO_LIVE",
          success: true,
          message: "Legacy go-live ready for session session-1.",
          status: 200,
          data: { sessionId: "session-1" },
        },
      ],
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
