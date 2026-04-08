import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type RouteLogger = {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  listTrajectories: () => Promise<{
    trajectories: Array<Record<string, unknown>>;
    total: number;
    offset: number;
    limit: number;
  }>;
  getTrajectoryDetail: (trajectoryId: string) => Promise<unknown>;
  getStats: () => Promise<Record<string, unknown>>;
  deleteTrajectories: (trajectoryIds: string[]) => Promise<number>;
  clearAllTrajectories: () => Promise<number>;
  exportTrajectories: () => Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }>;
  exportTrajectoriesZip?: (options: Record<string, unknown>) => Promise<{
    filename: string;
    entries: Array<{ name: string; data: string }>;
  }>;
};

type RuntimeLike = AgentRuntime & {
  adapter?: unknown;
  getServiceRegistrationStatus?: (
    serviceType: string,
  ) => "pending" | "registering" | "registered" | "failed" | "unknown";
  getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
};

function createTrajectoryRuntime(
  overrides: Partial<RuntimeLike> = {},
): RuntimeLike {
  const runtime = {
    agentId: "trajectory-routes-agent",
    character: {
      name: "TrajectoryRoutesAgent",
    } as AgentRuntime["character"],
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as AgentRuntime["logger"],
    adapter: {},
    getSetting: () => undefined,
    getAgent: async () => null,
    getRoomsByWorld: async () => [],
    getService: () => null,
    getServicesByType: () => [],
    ...overrides,
  } as RuntimeLike;

  return runtime;
}

function createCompatibleLogger(
  overrides: Partial<RouteLogger> = {},
): RouteLogger {
  return {
    isEnabled: () => true,
    setEnabled: () => {},
    listTrajectories: async () => ({
      trajectories: [
        {
          id: "trajectory-routes-1",
          agentId: "trajectory-routes-agent",
          source: "client_chat",
          status: "completed",
          startTime: Date.now() - 1_000,
          endTime: Date.now(),
          durationMs: 1_000,
          stepCount: 1,
          llmCallCount: 1,
          providerAccessCount: 0,
          totalPromptTokens: 12,
          totalCompletionTokens: 18,
          totalReward: 0,
          scenarioId: null,
          batchId: null,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    }),
    getTrajectoryDetail: async () => null,
    getStats: async () => ({
      totalTrajectories: 1,
      totalSteps: 1,
      totalLlmCalls: 1,
      totalPromptTokens: 12,
      totalCompletionTokens: 18,
      averageDurationMs: 1_000,
      averageReward: 0,
      bySource: { client_chat: 1 },
      byStatus: { completed: 1 },
      byScenario: {},
    }),
    deleteTrajectories: async () => 0,
    clearAllTrajectories: async () => 0,
    exportTrajectories: async () => ({
      data: "[]",
      filename: "trajectories.json",
      mimeType: "application/json",
    }),
    ...overrides,
  };
}

describe("trajectory routes", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await server.close();
      }
    }
  });

  it("waits for a pending trajectory logger to finish loading before listing trajectories", async () => {
    const coreLogger = {
      logLlmCall: () => {},
    };
    const compatibleLogger = createCompatibleLogger();
    let ready = false;
    let loadRequested = false;

    const runtime = createTrajectoryRuntime({
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectory_logger"
          ? ready
            ? [coreLogger, compatibleLogger]
            : [coreLogger]
          : [],
      getService: (serviceType: string) =>
        serviceType === "trajectory_logger" && ready ? compatibleLogger : null,
      getServiceRegistrationStatus: (serviceType: string) =>
        serviceType === "trajectory_logger" && !ready ? "pending" : "registered",
      getServiceLoadPromise: async (serviceType: string) => {
        expect(serviceType).toBe("trajectory_logger");
        loadRequested = true;
        await new Promise((resolve) => setTimeout(resolve, 25));
        ready = true;
      },
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories?limit=10");

    expect(loadRequested).toBe(true);
    expect(ready).toBe(true);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.trajectories)).toBe(true);
    expect(response.data.trajectories[0]?.id).toBe("trajectory-routes-1");
  });

  it("returns 503 when ZIP export is requested but unavailable in the logger", async () => {
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectory_logger" ? createCompatibleLogger() : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectory_logger" ? [createCompatibleLogger()] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "zip",
    });

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectory ZIP export is unavailable in the active logger",
    );
  });

  it("rejects invalid trajectory export formats", async () => {
    const logger = createCompatibleLogger();
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectory_logger" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectory_logger" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "yaml",
    });

    expect(response.status).toBe(400);
    expect(String(response.data.error)).toContain(
      "Format must be 'json', 'csv', 'art', or 'zip'",
    );
  });

  it("deletes only the requested trajectory ids", async () => {
    const deleteTrajectories = async (trajectoryIds: string[]) => {
      expect(trajectoryIds).toEqual(["trajectory-a", "trajectory-b"]);
      return trajectoryIds.length;
    };
    const logger = createCompatibleLogger({
      deleteTrajectories,
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectory_logger" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectory_logger" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "DELETE", "/api/trajectories", {
      trajectoryIds: ["trajectory-a", "trajectory-b"],
    });

    expect(response.status).toBe(200);
    expect(response.data.deleted).toBe(2);
  });
});
