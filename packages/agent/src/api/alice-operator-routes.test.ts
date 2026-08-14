import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { handleAliceOperatorRoutes } from "./alice-operator-routes.js";

describe("handleAliceOperatorRoutes", () => {
  it("executes the bounded Alice 555Drive product rehearsal through the operator bridge", async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      text: JSON.stringify({
        ok: true,
        message: "Alice 555Drive product rehearsal completed",
        data: { decisionId: "decision-1" },
      }),
    });
    const runtime = {
      agentId: "alice-agent",
      actions: [
        {
          name: "FIVE55_GAMES_DRIVE555_REHEARSE",
          validate: vi.fn().mockResolvedValue(true),
          handler,
        },
      ],
    } as unknown as AgentRuntime;
    const json = vi.fn();
    const error = vi.fn();

    const handled = await handleAliceOperatorRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "POST",
      pathname: "/api/alice/operator/execute",
      runtime,
      json,
      error,
      readJsonBody: vi.fn().mockResolvedValue({
        steps: [
          {
            id: "alice-drive555-product-proof",
            action: "FIVE55_GAMES_DRIVE555_REHEARSE",
            params: {
              sessionId: "session-1",
              gameRunId: "run-1",
              adId: "sponsor-1",
              adDurationMs: "12000",
            },
          },
        ],
      }),
    });

    expect(handled).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith(expect.anything(), {
      ok: true,
      allSucceeded: true,
      results: [
        {
          id: "alice-drive555-product-proof",
          action: "FIVE55_GAMES_DRIVE555_REHEARSE",
          success: true,
          message: "Alice 555Drive product rehearsal completed",
          data: { decisionId: "decision-1" },
        },
      ],
    });
  });
});
