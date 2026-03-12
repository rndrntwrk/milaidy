import { describe, expect, it, vi } from "vitest";

// @ts-expect-error internal dependency path used to lock our patch behavior
import { bootstrapAction } from "../packages/plugin-555stream/dist/actions/bootstrap.js";
// @ts-expect-error internal dependency path used to lock our patch behavior
import { StreamControlService } from "../packages/plugin-555stream/dist/services/StreamControlService.js";

function createService() {
  const service = new StreamControlService() as any;
  service.config = {
    baseUrl: "https://stream.rndrntwrk.com",
    agentToken: "test-token",
    defaultSessionId: undefined,
    requireApprovals: true,
  };
  return service;
}

describe("stream555 HTTP fallback", () => {
  it("treats an HTTP-created session as ready before websocket bind", async () => {
    const service = createService();
    service.httpClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          sessionId: "session-http",
          resumed: false,
          active: true,
          productionState: {},
        },
      }),
    };
    service.wsClient = {
      isReady: vi.fn().mockReturnValue(false),
    };

    const session = await service.createOrResumeSession();

    expect(session.sessionId).toBe("session-http");
    expect(service.getBoundSessionId()).toBe("session-http");
    expect(service.isReady()).toBe(true);
  });

  it("continues bootstrap when websocket bind is unavailable", async () => {
    const service = createService();
    service.httpClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          sessionId: "session-http",
          resumed: false,
          active: true,
          productionState: {},
        },
      }),
    };
    service.wsClient = {
      getState: vi.fn().mockReturnValue("disconnected"),
      connect: vi
        .fn()
        .mockRejectedValue(new Error("Unexpected server response: 404")),
      bind: vi.fn(),
      disconnect: vi.fn(),
      isReady: vi.fn().mockReturnValue(false),
    };

    const callback = vi.fn();
    const ok = await bootstrapAction.handler(
      { getService: () => service } as any,
      { content: {} } as any,
      null,
      {},
      callback,
    );

    expect(ok).toBe(true);
    expect(service.getBoundSessionId()).toBe("session-http");
    expect(service.wsClient.disconnect).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]?.content).toMatchObject({
      success: true,
      data: {
        sessionId: "session-http",
        realtimeConnected: false,
      },
    });
    expect(callback.mock.calls[0]?.[0]?.content?.data?.realtimeError).toContain(
      "404",
    );
  });

  it("reports health as degraded-but-usable when websocket upgrade is unavailable", async () => {
    const service = createService();
    service.httpClient = {
      healthcheck: vi.fn().mockResolvedValue({
        reachable: true,
        latencyMs: 5,
      }),
      get: vi.fn().mockResolvedValue({
        success: true,
      }),
    };
    service.wsClient = {
      connect: vi
        .fn()
        .mockRejectedValue(new Error("Unexpected server response: 404")),
      disconnect: vi.fn(),
    };

    const result = await service.healthcheck();

    expect(result.allPassed).toBe(true);
    expect(result.checks.apiReachable.passed).toBe(true);
    expect(result.checks.authValid.passed).toBe(true);
    expect(result.checks.wsConnectable.passed).toBe(false);
    expect(result.checks.wsConnectable.message).toContain("404");
    expect(service.wsClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
