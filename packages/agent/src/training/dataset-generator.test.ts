import http from "node:http";
import type { AddressInfo } from "node:net";
import type { IAgentRuntime } from "@elizaos/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for dataset generator teacher models.
 *
 * Uses local HTTP servers to simulate OpenAI and Anthropic API endpoints
 * instead of mocking globalThis.fetch. Trajectory logging is still mocked
 * since it requires a full runtime context.
 */

const { mockWithStandaloneTrajectory, mockLogActiveTrajectoryLlmCall } =
  vi.hoisted(() => ({
    mockWithStandaloneTrajectory: vi.fn(
      async (
        _runtime: IAgentRuntime | undefined,
        _options: Record<string, unknown>,
        callback: () => Promise<unknown>,
      ) => await callback(),
    ),
    mockLogActiveTrajectoryLlmCall: vi.fn(),
  }));

vi.mock("@elizaos/core", () => ({
  withStandaloneTrajectory: mockWithStandaloneTrajectory,
  logActiveTrajectoryLlmCall: mockLogActiveTrajectoryLlmCall,
}));

import {
  createAnthropicTeacher,
  createOpenAITeacher,
} from "./dataset-generator";

// ---------------------------------------------------------------------------
// Local HTTP servers simulating OpenAI and Anthropic APIs
// ---------------------------------------------------------------------------

let openaiServer: http.Server;
let openaiPort: number;
let anthropicServer: http.Server;
let anthropicPort: number;
let openaiShouldFail = false;
let anthropicShouldFail = false;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

beforeAll(async () => {
  // OpenAI mock server
  openaiServer = http.createServer(async (req, res) => {
    await readBody(req);
    if (openaiShouldFail) {
      res.writeHead(429, { "Content-Type": "text/plain" });
      res.end("rate limited");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      model: "gpt-5-2026-04-01",
      choices: [{ message: { content: "teacher response" } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    }));
  });

  await new Promise<void>((resolve) => {
    openaiServer.listen(0, "127.0.0.1", () => resolve());
  });
  openaiPort = (openaiServer.address() as AddressInfo).port;

  // Anthropic mock server
  anthropicServer = http.createServer(async (req, res) => {
    await readBody(req);
    if (anthropicShouldFail) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      content: [{ type: "text", text: "anthropic response" }],
      usage: { input_tokens: 14, output_tokens: 6 },
    }));
  });

  await new Promise<void>((resolve) => {
    anthropicServer.listen(0, "127.0.0.1", () => resolve());
  });
  anthropicPort = (anthropicServer.address() as AddressInfo).port;
});

afterEach(() => {
  openaiShouldFail = false;
  anthropicShouldFail = false;
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      openaiServer.close((err) => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      anthropicServer.close((err) => (err ? reject(err) : resolve()));
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Patch the teacher functions to use local servers.
// The teacher functions hardcode the URL, so we intercept fetch to rewrite URLs.
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;

function patchedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url.includes("api.openai.com")) {
    const localUrl = url.replace("https://api.openai.com", `http://127.0.0.1:${openaiPort}`);
    return realFetch(localUrl, init);
  }
  if (url.includes("api.anthropic.com")) {
    const localUrl = url.replace("https://api.anthropic.com", `http://127.0.0.1:${anthropicPort}`);
    return realFetch(localUrl, init);
  }
  return realFetch(input, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = patchedFetch as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dataset generator teacher trajectory logging", () => {
  const runtime = {
    agentId: "agent-1",
  } as IAgentRuntime;

  it("logs openai teacher calls inside a standalone training trajectory", async () => {
    const teacher = createOpenAITeacher("test-key", runtime);
    const text = await teacher.generate("system prompt", "user prompt");

    expect(text).toBe("teacher response");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledWith(
      runtime,
      {
        source: "training",
        metadata: {
          provider: "openai",
          model: "gpt-5.4",
          purpose: "teacher",
        },
      },
      expect.any(Function),
    );
    expect(mockLogActiveTrajectoryLlmCall).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        model: "openai/gpt-5.4",
        modelVersion: "gpt-5-2026-04-01",
        systemPrompt: "system prompt",
        userPrompt: "user prompt",
        response: "teacher response",
        purpose: "training.teacher",
        actionType: "training.teacher.openai.generate",
        promptTokens: 20,
        completionTokens: 8,
      }),
    );
  });

  it("logs anthropic teacher calls inside a standalone training trajectory", async () => {
    const teacher = createAnthropicTeacher("test-key", runtime);
    const text = await teacher.generate("system prompt", "user prompt");

    expect(text).toBe("anthropic response");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledWith(
      runtime,
      {
        source: "training",
        metadata: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          purpose: "teacher",
        },
      },
      expect.any(Function),
    );
    expect(mockLogActiveTrajectoryLlmCall).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4",
        modelVersion: "claude-sonnet-4-20250514",
        systemPrompt: "system prompt",
        userPrompt: "user prompt",
        response: "anthropic response",
        purpose: "training.teacher",
        actionType: "training.teacher.anthropic.generate",
        promptTokens: 14,
        completionTokens: 6,
      }),
    );
  });

  it("surfaces OpenAI API failures without logging a successful teacher call", async () => {
    openaiShouldFail = true;

    const teacher = createOpenAITeacher("test-key", runtime);

    await expect(
      teacher.generate("system prompt", "user prompt"),
    ).rejects.toThrow("OpenAI API error: 429 rate limited");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledTimes(1);
    expect(mockLogActiveTrajectoryLlmCall).not.toHaveBeenCalled();
  });

  it("surfaces Anthropic API failures without logging a successful teacher call", async () => {
    anthropicShouldFail = true;

    const teacher = createAnthropicTeacher("test-key", runtime);

    await expect(
      teacher.generate("system prompt", "user prompt"),
    ).rejects.toThrow("Anthropic API error: 500 internal error");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledTimes(1);
    expect(mockLogActiveTrajectoryLlmCall).not.toHaveBeenCalled();
  });
});
