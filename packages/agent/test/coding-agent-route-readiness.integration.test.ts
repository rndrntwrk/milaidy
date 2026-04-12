/**
 * E2E regression coverage for coding-agent startup polling routes.
 *
 * Uses the real API server and real route ordering. The runtime is intentionally
 * minimal so the server reaches the "runtime exists but coding-agent services do
 * not" state that previously returned plugin-driven 503 responses.
 */
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { canBindLoopback } from "../../../test/helpers/loopback";
import { startApiServer } from "../src/api/server";

const describeLoopback = describe.skipIf(!(await canBindLoopback()));

function createRuntimeWithoutCodingAgentServices(): AgentRuntime {
  return {
    agentId: "00000000-0000-0000-0000-000000000001",
    character: { name: "Test Agent" },
    plugins: [],
    getService: () => null,
    hasService: () => false,
    getServiceLoadPromise: async () => null,
    getSetting: () => undefined,
  } as unknown as AgentRuntime;
}

describeLoopback("Coding agent route readiness", () => {
  let server: {
    port: number;
    close: () => Promise<void>;
  } | null = null;

  beforeAll(async () => {
    server = await startApiServer({
      port: 0,
      runtime: createRuntimeWithoutCodingAgentServices(),
    });
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("returns 503 when the coordinator is unavailable", async () => {
    const response = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/coordinator/status",
    );

    expect(response.status).toBe(503);
    expect(response.data).toMatchObject({
      error: "Coding agent coordinator unavailable",
    });
  });

  it("returns 503 when PTY service is unavailable", async () => {
    const response = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/preflight",
    );

    expect(response.status).toBe(503);
    expect(response.data).toMatchObject({
      error: "Coding agent preflight unavailable",
    });
  });

  it("returns 503 for task and session polling before services exist", async () => {
    const tasks = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/tasks",
    );
    const sessions = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/sessions",
    );

    expect(tasks.status).toBe(503);
    expect(tasks.data).toMatchObject({
      error: "Coding agent task service unavailable",
    });
    expect(sessions.status).toBe(503);
    expect(sessions.data).toMatchObject({
      error: "Coding agent session service unavailable",
    });
  });

  it("returns 503 for task and session detail polling before services exist", async () => {
    const task = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/tasks/nonexistent-task",
    );
    const session = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/sessions/nonexistent-session",
    );

    expect(task.status).toBe(503);
    expect(task.data).toMatchObject({
      error: "Coding agent task service unavailable",
    });
    expect(session.status).toBe(503);
    expect(session.data).toMatchObject({
      error: "Coding agent session service unavailable",
    });
  });
});
