/**
 * Tests for agent lifecycle API — state transitions, chat, plugins, onboarding.
 *
 * Uses an in-memory request dispatcher that mirrors the HTTP contract without
 * binding a real local port, so the suite stays deterministic in restricted
 * environments.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type HttpResponse = {
  status: number;
  data: Record<string, unknown>;
  headers: Record<string, string>;
};

type MockServer = {
  close: () => Promise<void>;
  request: (
    method: string,
    path: string,
    body?: Record<string, unknown> | string,
  ) => Promise<HttpResponse>;
};

function readConversationId(data: Record<string, unknown>): string {
  const conversation =
    data.conversation &&
    typeof data.conversation === "object" &&
    !Array.isArray(data.conversation)
      ? (data.conversation as Record<string, unknown>)
      : null;
  const id = typeof conversation?.id === "string" ? conversation.id : "";
  if (!id) {
    throw new Error("Conversation response did not include an id");
  }
  return id;
}

function createTestServer(): Promise<MockServer> {
  const state = {
    agentState: "not_started" as string,
    agentName: "TestAgent",
    model: undefined as string | undefined,
    startedAt: undefined as number | undefined,
    runtime: null as object | null,
    conversations: new Set<string>(),
    conversationSeq: 0,
  };

  const respond = (
    data: Record<string, unknown>,
    status = 200,
  ): HttpResponse => ({
    status,
    data,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });

  const parseBody = (
    body: Record<string, unknown> | string | undefined,
  ): Record<string, unknown> => {
    if (body === undefined) {
      return {};
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body) as Record<string, unknown>;
      } catch {
        return { _raw: body };
      }
    }
    return body;
  };

  const routes: Record<
    string,
    (body: Record<string, unknown>) => Promise<HttpResponse> | HttpResponse
  > = {
    "GET /api/status": () =>
      respond({
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        startedAt: state.startedAt,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
      }),
    "POST /api/agent/start": () => {
      state.agentState = "running";
      state.startedAt = Date.now();
      state.model = "test-model";
      state.runtime = {};
      return respond({
        ok: true,
        status: { state: "running", agentName: state.agentName },
      });
    },
    "POST /api/agent/stop": () => {
      state.agentState = "stopped";
      state.startedAt = undefined;
      state.model = undefined;
      state.runtime = null;
      return respond({
        ok: true,
        status: { state: "stopped", agentName: state.agentName },
      });
    },
    "POST /api/agent/pause": () => {
      state.agentState = "paused";
      return respond({
        ok: true,
        status: { state: "paused", agentName: state.agentName },
      });
    },
    "POST /api/agent/resume": () => {
      state.agentState = "running";
      return respond({
        ok: true,
        status: { state: "running", agentName: state.agentName },
      });
    },
    "POST /api/conversations": async (body) => {
      const id = `conv-${++state.conversationSeq}`;
      state.conversations.add(id);
      return respond({
        conversation: {
          id,
          title:
            typeof body.title === "string" && body.title.trim().length > 0
              ? body.title
              : "New Chat",
        },
      });
    },
    "GET /api/plugins": () => respond({ plugins: [] }),
    "GET /api/skills": () => respond({ skills: [] }),
    "GET /api/logs": () => respond({ entries: [] }),
    "GET /api/onboarding/status": () => respond({ complete: false }),
    "GET /api/onboarding/options": () =>
      respond({
        names: ["Reimu"],
        styles: [{ catchphrase: "uwu~" }],
        providers: [{ id: "anthropic" }],
      }),
  };

  return Promise.resolve({
    close: async () => {},
    request: async (method, path, body) => {
      const parsedBody = parseBody(body);
      if (method === "OPTIONS") {
        return {
          status: 204,
          data: {},
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
          },
        };
      }

      if (
        method === "POST" &&
        /^\/api\/conversations\/[^/]+\/messages$/.test(path)
      ) {
        const conversationId = decodeURIComponent(path.split("/")[3] ?? "");
        if (!state.conversations.has(conversationId)) {
          return respond({ error: "Conversation not found" }, 404);
        }
        if (!parsedBody.text || !String(parsedBody.text).trim()) {
          return respond({ error: "text is required" }, 400);
        }
        if (!state.runtime) {
          return respond({ error: "Agent is not running" }, 503);
        }
        return respond({
          text: `Echo: ${String(parsedBody.text)}`,
          agentName: state.agentName,
        });
      }

      const handler = routes[`${method} ${path}`];
      return handler ? await handler(parsedBody) : respond({ error: "Not found" }, 404);
    },
  });
}

describe("Agent Lifecycle API", () => {
  let server: MockServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  const request = (
    method: string,
    path: string,
    body?: Record<string, unknown> | string,
  ) => server.request(method, path, body);

  const createConversation = async (options?: { title?: string }) => {
    const response = await request("POST", "/api/conversations", options);
    return {
      ...response,
      conversationId: readConversationId(response.data),
    };
  };

  const postConversationMessage = (
    conversationId: string,
    body?: Record<string, unknown> | string,
  ) =>
    request(
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );

  const sendMessage = async (body: Record<string, unknown>) => {
    const { conversationId } = await createConversation({
      title: "Lifecycle chat",
    });
    return postConversationMessage(conversationId, body);
  };

  it("initial status is not_started", async () => {
    const { status, data } = await request("GET", "/api/status");
    expect(status).toBe(200);
    expect(data.state).toBe("not_started");
    expect(data.agentName).toBe("TestAgent");
  });

  it("start transitions to running with model, startedAt, uptime", async () => {
    const { data } = await request("POST", "/api/agent/start");
    expect(data.ok).toBe(true);
    const status = await request("GET", "/api/status");
    expect(status.data.state).toBe("running");
    expect(status.data.model).toBeDefined();
    expect(status.data.startedAt).toBeDefined();
    expect(typeof status.data.uptime).toBe("number");
  });

  describe("chat", () => {
    it("responds when running", async () => {
      const { status, data } = await sendMessage({ text: "Hello" });
      expect(status).toBe(200);
      expect(data.text).toBeDefined();
      expect(data.agentName).toBe("TestAgent");
    });

    it("rejects empty text", async () => {
      expect((await sendMessage({ text: "" })).status).toBe(400);
    });

    it("rejects missing text", async () => {
      expect((await sendMessage({})).status).toBe(400);
    });
  });

  it("pause transitions to paused, chat still works (runtime exists)", async () => {
    expect((await request("POST", "/api/agent/pause")).data.ok).toBe(true);
    expect((await request("GET", "/api/status")).data.state).toBe("paused");
    expect((await sendMessage({ text: "hi" })).status).toBe(200);
  });

  it("resume transitions back to running, chat works", async () => {
    expect((await request("POST", "/api/agent/resume")).data.ok).toBe(true);
    expect((await request("GET", "/api/status")).data.state).toBe("running");
    expect((await sendMessage({ text: "hi" })).status).toBe(200);
  });

  it("stop transitions to stopped, clears model/startedAt", async () => {
    expect((await request("POST", "/api/agent/stop")).data.ok).toBe(true);
    const { data } = await request("GET", "/api/status");
    expect(data.state).toBe("stopped");
    expect(data.model).toBeUndefined();
    expect(data.startedAt).toBeUndefined();
    expect((await sendMessage({ text: "hi" })).status).toBe(503);
  });

  it("full cycle: start → pause → resume → stop → restart", async () => {
    await request("POST", "/api/agent/start");
    expect((await request("GET", "/api/status")).data.state).toBe("running");

    await request("POST", "/api/agent/pause");
    expect((await request("GET", "/api/status")).data.state).toBe("paused");

    await request("POST", "/api/agent/resume");
    expect((await request("GET", "/api/status")).data.state).toBe("running");

    await request("POST", "/api/agent/stop");
    expect((await request("GET", "/api/status")).data.state).toBe("stopped");

    await request("POST", "/api/agent/start");
    expect((await request("GET", "/api/status")).data.state).toBe("running");

    await request("POST", "/api/agent/stop");
  });

  it.each([
    ["GET /api/plugins", "plugins"],
    ["GET /api/skills", "skills"],
    ["GET /api/logs", "entries"],
  ])("%s returns array", async (route, key) => {
    const [method, path] = route.split(" ");
    const { status, data } = await request(method, path);
    expect(status).toBe(200);
    expect(Array.isArray(data[key])).toBe(true);
  });

  it("onboarding status returns complete flag", async () => {
    expect(typeof (await request("GET", "/api/onboarding/status")).data.complete).toBe(
      "boolean",
    );
  });

  it("onboarding options returns names, styles, providers", async () => {
    const { data } = await request("GET", "/api/onboarding/options");
    expect(Array.isArray(data.names)).toBe(true);
    expect(Array.isArray(data.styles)).toBe(true);
    expect(Array.isArray(data.providers)).toBe(true);
  });

  it("unknown route returns 404", async () => {
    expect((await request("GET", "/api/nonexistent")).status).toBe(404);
  });
});
