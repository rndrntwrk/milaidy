import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  type AgentRuntime,
  type Content,
  getTrajectoryContext,
  ModelType,
  runWithTrajectoryContext,
  trajectoriesPlugin,
  type UUID,
} from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConversation,
  postConversationMessage,
  req,
} from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";
import { DatabaseTrajectoryLogger } from "../src/runtime/trajectory-storage";

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

async function waitForTrajectoryCall(
  db: PGlite,
  expectedUserPrompt: string,
): Promise<{
  trajectoryId: string;
  llmCall: {
    systemPrompt?: string;
    userPrompt?: string;
    response?: string;
  };
}> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await db.query<Record<string, unknown>>(
      "SELECT id, steps_json FROM trajectories ORDER BY updated_at DESC, created_at DESC LIMIT 20",
    );

    for (const trajectory of result.rows) {
      const trajectoryId = String(trajectory.id ?? "");
      if (!trajectoryId) continue;
      const rawSteps = trajectory.steps_json;
      const steps =
        typeof rawSteps === "string"
          ? JSON.parse(rawSteps)
          : Array.isArray(rawSteps)
            ? rawSteps
            : [];
      const llmCalls = Array.isArray(steps)
        ? steps.flatMap((step) =>
            Array.isArray((step as { llmCalls?: unknown }).llmCalls)
              ? ((step as { llmCalls: Array<{
                    systemPrompt?: string;
                    userPrompt?: string;
                    response?: string;
                  }> }).llmCalls)
              : [],
          )
        : [];

      const match = llmCalls.find(
        (call) => String(call.userPrompt ?? "") === expectedUserPrompt,
      );
      if (match) {
        return { trajectoryId, llmCall: match };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for persisted trajectory prompt/response roundtrip");
}

describe("Trajectory logger chat roundtrip", () => {
  let runtime: TestRuntime;
  let trajectoryLogger: DatabaseTrajectoryLogger;
  let db: PGlite;
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    db = new PGlite();

    const memoriesByRoom = new Map<string, Array<Record<string, unknown>>>();
    runtime = {} as TestRuntime;

    runtime.agentId = "trajectory-roundtrip-agent";
    runtime.character = {
      name: "TrajectoryRoundtripAgent",
    } as AgentRuntime["character"];
    runtime.logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as AgentRuntime["logger"];
    runtime.adapter = {
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
    };

    runtime.createMemory = async (memory: Record<string, unknown>) => {
      const roomId = String(memory.roomId ?? "");
      if (!roomId) return;
      const current = memoriesByRoom.get(roomId) ?? [];
      current.push({
        ...memory,
        createdAt:
          typeof memory.createdAt === "number" ? memory.createdAt : Date.now(),
      });
      memoriesByRoom.set(roomId, current);
    };
    runtime.getMemories = async (query: {
      roomId?: string;
      count?: number;
    }) => {
      const roomId = String(query.roomId ?? "");
      const current = memoriesByRoom.get(roomId) ?? [];
      const count = Math.max(1, query.count ?? current.length);
      return current.slice(-count) as Awaited<
        ReturnType<AgentRuntime["getMemories"]>
      >;
    };
    runtime.getMemoriesByRoomIds = async (query: {
      roomIds?: string[];
      limit?: number;
    }) => {
      const roomIds = Array.isArray(query.roomIds) ? query.roomIds : [];
      const limit = Math.max(1, query.limit ?? 200);
      const merged: Array<Record<string, unknown>> = [];
      for (const roomId of roomIds) {
        merged.push(...(memoriesByRoom.get(String(roomId)) ?? []));
      }
      merged.sort(
        (a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0),
      );
      return merged.slice(-limit) as Awaited<
        ReturnType<AgentRuntime["getMemoriesByRoomIds"]>
      >;
    };
    runtime.getService = (serviceType: string) =>
      serviceType === "trajectories" ? trajectoryLogger : null;
    runtime.getServicesByType = (serviceType: string) =>
      serviceType === "trajectories" ? [trajectoryLogger] : [];
    runtime.getSetting = () => undefined;
    runtime.ensureConnection = async () => {};
    runtime.getWorld = async () => null;
    runtime.getRoom = async (roomId: UUID) => ({ id: roomId });
    runtime.getRoomsByWorld = async () => [];
    runtime.updateWorld = async () => {};
    runtime.getCache = async () => null;
    runtime.setCache = async () => {};
    runtime.deleteManyMemories = async () => {};
    runtime.deleteRoom = async () => {};

    runtime.useModel = async function (
      this: AgentRuntime,
      modelType: ModelType,
      params: { prompt?: unknown; system?: unknown; maxTokens?: unknown },
    ) {
      const prompt = String(params?.prompt ?? "");
      const systemPrompt = String(
        params?.system ?? "You are a trajectory logger regression test agent.",
      );
      const response = `Trajectory reply: ${prompt}`;
      const context = getTrajectoryContext();

      if (context?.trajectoryStepId) {
        trajectoryLogger.logLlmCall({
          stepId: context.trajectoryStepId,
          model: String(modelType),
          systemPrompt,
          userPrompt: prompt,
          response,
          temperature: 0,
          maxTokens:
            typeof params?.maxTokens === "number" ? params.maxTokens : 256,
          purpose: "response",
          actionType: "runtime.useModel",
          latencyMs: 5,
          promptTokens: Math.ceil((systemPrompt.length + prompt.length) / 4),
          completionTokens: Math.ceil(response.length / 4),
        });
      }

      return response;
    } as AgentRuntime["useModel"];

    runtime.messageService = {
      handleMessage: async (
        runtimeArg: AgentRuntime,
        message: object,
        onResponse: (content: Content) => Promise<object[]>,
      ) => {
        const prompt = String(
          (
            message as {
              content?: { text?: string };
              metadata?: { trajectoryStepId?: string };
            }
          ).content?.text ?? "",
        );
        const stepId = (
          message as {
            metadata?: { trajectoryStepId?: string };
          }
        ).metadata?.trajectoryStepId;
        const response = await runWithTrajectoryContext(
          stepId ? { trajectoryStepId: stepId } : undefined,
          () =>
            runtimeArg.useModel(ModelType.TEXT_LARGE, {
              system: "You are a trajectory logger regression test agent.",
              prompt,
              maxTokens: 256,
            }),
        );

        await onResponse({ text: response } as Content);

        return {
          didRespond: true,
          responseContent: { text: response },
          responseMessages: [
            {
              id: crypto.randomUUID(),
              entityId: runtimeArg.agentId,
              roomId:
                (message as { roomId?: string }).roomId ?? crypto.randomUUID(),
              createdAt: Date.now(),
              content: { text: response },
            },
          ],
          mode: "power",
        };
      },
    } as AgentRuntime["messageService"];

    runtime.emitEvent = async (
      event: Parameters<AgentRuntime["emitEvent"]>[0],
      payload: Parameters<AgentRuntime["emitEvent"]>[1],
    ) => {
      const eventNames = Array.isArray(event) ? event : [event];
      for (const eventName of eventNames) {
        const handlers =
          trajectoriesPlugin.events?.[
            eventName as keyof typeof trajectoriesPlugin.events
          ] ?? [];
        for (const handler of handlers) {
          await handler({
            ...(payload as Record<string, unknown>),
            runtime,
          } as never);
        }
      }
    };

    trajectoryLogger = new DatabaseTrajectoryLogger(runtime);
    await trajectoryLogger.initialize();

    server = await startApiServer({ port: 0, runtime });
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await db.close();
  });

  it("captures conversation prompt and response through the trajectories API", async () => {
    if (!server) {
      throw new Error("API server did not start");
    }

    const prompt = "show me the exact trajectory prompt and response";
    const expectedResponse = `Trajectory reply: ${prompt}`;

    const { conversationId } = await createConversation(server.port, {
      title: "Trajectory roundtrip",
    });
    const chat = await postConversationMessage(server.port, conversationId, {
      text: prompt,
      mode: "simple",
    });
    expect(chat.status).toBe(200);
    expect(String(chat.data.text ?? "")).toBe(expectedResponse);

    const persisted = await waitForTrajectoryCall(db, prompt);
    expect(persisted.trajectoryId.length).toBeGreaterThan(0);
    expect(persisted.llmCall.systemPrompt).toContain(
      "trajectory logger regression test agent",
    );
    expect(persisted.llmCall.userPrompt).toBe(prompt);
    expect(persisted.llmCall.response).toBe(expectedResponse);

    const hydratedDetail = await req(
      server.port,
      "GET",
      `/api/trajectories/${encodeURIComponent(persisted.trajectoryId)}`,
    );
    expect(hydratedDetail.status).toBe(200);
    const llmCalls = Array.isArray(hydratedDetail.data.llmCalls)
      ? (hydratedDetail.data.llmCalls as Array<{
          systemPrompt?: string;
          userPrompt?: string;
          response?: string;
        }>)
      : [];
    expect(llmCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemPrompt: expect.stringContaining(
            "trajectory logger regression test agent",
          ),
          userPrompt: prompt,
          response: expectedResponse,
        }),
      ]),
    );
    const trajectory = hydratedDetail.data.trajectory as Record<
      string,
      unknown
    >;
    expect(trajectory.id).toBe(persisted.trajectoryId);
    expect(trajectory.source).toBe("chat");
    expect(trajectory.status).toBe("completed");
    expect(typeof trajectory.endTime).toBe("number");
  });
});
