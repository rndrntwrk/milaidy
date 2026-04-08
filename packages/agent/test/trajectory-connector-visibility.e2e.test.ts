import { PGlite } from "@electric-sql/pglite";
import type { AgentRuntime } from "@elizaos/core";
import { TrajectoryLoggerService } from "@elizaos/plugin-trajectory-logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

type TestRuntime = AgentRuntime & {
  adapter: {
    db: {
      execute: (query: SqlQuery) => Promise<{
        rows: Array<Record<string, unknown>>;
        fields: Array<{ name: string }>;
      }>;
    };
  };
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

describe("Connector trajectory visibility", () => {
  let db: PGlite;
  let runtime: TestRuntime;
  let trajectoryLogger: TrajectoryLoggerService;
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    db = new PGlite();

    runtime = {
      agentId: "trajectory-connector-visibility-agent",
      character: {
        name: "TrajectoryConnectorVisibilityAgent",
      } as AgentRuntime["character"],
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      } as AgentRuntime["logger"],
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const result = await db.query<Record<string, unknown>>(
              extractSqlText(query),
            );
            return {
              rows: result.rows,
              fields: (result.fields ?? []).map((field) => ({
                name: field.name,
              })),
            };
          },
        },
      },
      getSetting: () => undefined,
      getAgent: async () => null,
      getRoomsByWorld: async () => [],
      getService: () => null,
      getServicesByType: () => [],
    } as TestRuntime;

    trajectoryLogger = new TrajectoryLoggerService(runtime);
    await trajectoryLogger.initialize();

    runtime.getService = ((serviceType: string) =>
      serviceType === "trajectory_logger" ? trajectoryLogger : null) as AgentRuntime["getService"];
    runtime.getServicesByType = ((serviceType: string) =>
      serviceType === "trajectory_logger"
        ? [trajectoryLogger]
        : []) as AgentRuntime["getServicesByType"];

    server = await startApiServer({ port: 0, runtime });
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await db.close();
  });

  it("lists, hydrates, and deletes connector-sourced trajectories through the API", async () => {
    if (!server) {
      throw new Error("API server did not start");
    }

    const trajectoryId = await trajectoryLogger.startTrajectory(runtime.agentId, {
      source: "discord",
      metadata: {
        roomId: "connector-room",
        entityId: "connector-user",
        messageId: "connector-message",
      },
    });
    const stepId = trajectoryLogger.startStep(trajectoryId, {
      timestamp: Date.now() - 1_000,
      agentBalance: 0,
      agentPoints: 0,
      agentPnL: 0,
      openPositions: 0,
    });
    const prompt = "hello from the discord connector";
    const response = "Hello from connector!";
    const startTime = Date.now() - 900;

    trajectoryLogger.logLlmCall({
      stepId,
      callId: "connector-call-1",
      timestamp: startTime + 20,
      model: "test-model",
      systemPrompt:
        "You are a connector trajectory visibility regression test agent.",
      userPrompt: prompt,
      response,
      temperature: 0,
      maxTokens: 256,
      purpose: "response",
      actionType: "runtime.useModel",
      latencyMs: 5,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(response.length / 4),
    });
    trajectoryLogger.completeStep(trajectoryId, stepId, {
      actionType: "RESPOND",
      actionName: "RESPOND",
      parameters: {},
      success: true,
    });
    await trajectoryLogger.endTrajectory(trajectoryId, "completed");

    const list = await req(server.port, "GET", "/api/trajectories?limit=20");
    expect(list.status).toBe(200);
    expect(
      Array.isArray(list.data.trajectories) &&
        list.data.trajectories.some(
          (item: { id?: string; source?: string; llmCallCount?: number }) =>
            item.id === trajectoryId &&
            item.source === "discord" &&
            Number(item.llmCallCount ?? 0) === 1,
        ),
    ).toBe(true);

    const detail = await req(
      server.port,
      "GET",
      `/api/trajectories/${encodeURIComponent(trajectoryId)}`,
    );
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.data.llmCalls)).toBe(true);
    expect(detail.data.llmCalls[0]?.userPrompt).toBe(prompt);
    expect(detail.data.llmCalls[0]?.response).toBe(response);

    const deleteResponse = await req(
      server.port,
      "DELETE",
      "/api/trajectories",
      {
        trajectoryIds: [trajectoryId],
      },
    );
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.data.deleted).toBe(1);

    const listAfterDelete = await req(
      server.port,
      "GET",
      "/api/trajectories?limit=20",
    );
    expect(
      Array.isArray(listAfterDelete.data.trajectories) &&
        listAfterDelete.data.trajectories.some(
          (item: { id?: string }) => item.id === trajectoryId,
        ),
    ).toBe(false);
  });
});
