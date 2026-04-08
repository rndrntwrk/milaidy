import { existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";
import { DatabaseTrajectoryLogger } from "../src/runtime/trajectory-storage";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
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

const testUtilsPath = path.resolve(
  process.cwd(),
  "eliza/packages/typescript/src/__tests__/test-utils.ts",
);
const hasElizaTestUtils = existsSync(testUtilsPath);

const { cleanupTestRuntime, createTestDatabaseAdapter, createTestRuntime } =
  hasElizaTestUtils
    ? await import(
        "../../../eliza/packages/typescript/src/__tests__/test-utils"
      )
    : {
        cleanupTestRuntime: undefined,
        createTestDatabaseAdapter: undefined,
        createTestRuntime: undefined,
      };

const describeIfEliza = hasElizaTestUtils ? describe : describe.skip;

describeIfEliza("Connector trajectory visibility", () => {
  let db: PGlite;
  let runtime: AgentRuntime;
  let trajectoryLogger: DatabaseTrajectoryLogger;
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    db = new PGlite();

    const adapter = createTestDatabaseAdapter() as ReturnType<
      typeof createTestDatabaseAdapter
    > & {
      db: {
        execute: (query: SqlQuery) => Promise<{
          rows: Array<Record<string, unknown>>;
          fields: Array<{ name: string }>;
        }>;
      };
    };
    adapter.db.execute = async (query: SqlQuery) => {
      const result = await db.query<Record<string, unknown>>(
        extractSqlText(query),
      );
      return {
        rows: result.rows,
        fields: (result.fields ?? []).map((field) => ({
          name: field.name,
        })),
      };
    };

    runtime = (await createTestRuntime({
      adapter,
    })) as AgentRuntime;

    trajectoryLogger = new DatabaseTrajectoryLogger(runtime);
    await trajectoryLogger.initialize();

    const originalGetService = runtime.getService.bind(runtime);
    const originalGetServicesByType =
      typeof runtime.getServicesByType === "function"
        ? runtime.getServicesByType.bind(runtime)
        : undefined;

    runtime.getService = ((serviceType: string) =>
      serviceType === "trajectory_logger"
        ? (trajectoryLogger as object)
        : originalGetService(serviceType)) as AgentRuntime["getService"];
    runtime.getServicesByType = ((serviceType: string) =>
      serviceType === "trajectory_logger"
        ? [trajectoryLogger]
        : (originalGetServicesByType?.(serviceType) ?? [])) as AgentRuntime["getServicesByType"];

    server = await startApiServer({ port: 0, runtime });
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await cleanupTestRuntime(runtime);
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
    const prompt = "hello from the discord connector";
    const response = "Hello from connector!";
    const startTime = Date.now() - 1_000;
    trajectoryLogger.logLlmCall({
      stepId: trajectoryId,
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
