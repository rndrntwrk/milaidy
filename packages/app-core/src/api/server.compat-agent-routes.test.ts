import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWorkbenchCompatRoutes } from "./workbench-compat-routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeRequest(pathname: string, token?: string) {
  return {
    method: "GET",
    url: pathname,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: { remoteAddress: "127.0.0.1" },
  } as never;
}

function makeResponse() {
  const response = {
    headersSent: false,
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(key: string, value: string) {
      response.headers[key.toLowerCase()] = value;
    },
    end(chunk?: string) {
      response.headersSent = true;
      response.body += chunk ?? "";
    },
  };
  return response as never;
}

describe("compat-mounted agent routes", () => {
  const previousMiladyToken = process.env.MILADY_API_TOKEN;
  const previousElizaToken = process.env.ELIZA_API_TOKEN;

  afterEach(() => {
    if (previousMiladyToken === undefined) {
      delete process.env.MILADY_API_TOKEN;
    } else {
      process.env.MILADY_API_TOKEN = previousMiladyToken;
    }
    if (previousElizaToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = previousElizaToken;
    }
  });

  it("handles workbench overview in the compat layer with the compat token", async () => {
    process.env.MILADY_API_TOKEN = "compat-token";
    delete process.env.ELIZA_API_TOKEN;

    const runtime = {
      getTasks: vi.fn().mockResolvedValue([
        {
          id: "todo-1",
          name: "Review stream actions",
          description: "Confirm action log bubbles remain visible",
          tags: ["todo"],
          metadata: {
            todo: {
              priority: 2,
              isUrgent: true,
              isCompleted: false,
              type: "qa",
            },
          },
        },
      ]),
    };
    const res = makeResponse();

    const handled = await handleWorkbenchCompatRoutes(
      makeRequest("/api/workbench/overview", "compat-token"),
      res,
      {
        current: runtime,
        kubeReady: true,
        pendingAgentName: null,
        pendingRestartReasons: [],
      } as never,
    );

    expect(handled).toBe(true);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.summary.totalTodos).toBe(1);
    expect(body.todos[0]).toMatchObject({
      id: "todo-1",
      name: "Review stream actions",
      priority: 2,
      isUrgent: true,
      type: "qa",
    });
  });

  it("mounts character routes in app-core compat before upstream fallback", () => {
    const source = fs.readFileSync(path.join(__dirname, "server.ts"), "utf8");
    const characterRoute = source.indexOf('url.pathname.startsWith("/api/character")');
    const fallback = source.indexOf("Promise.resolve(listener(req, res))");

    expect(source).toContain('from "./character-routes"');
    expect(characterRoute).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
    expect(characterRoute).toBeLessThan(fallback);
  });
});
