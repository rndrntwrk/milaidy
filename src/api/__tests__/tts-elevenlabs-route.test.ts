import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __testOnlyHandleRequest } from "../server.js";

function createState(config: Record<string, unknown> = {}) {
  const runtime = {
    agentId: "agent-tts-route",
    character: {
      name: "TtsAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    getService: () => null,
    actions: [],
    getAllActions: () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    messageService: null,
  } as unknown as AgentRuntime;

  return {
    runtime,
    config,
    agentState: "running",
    agentName: "TtsAgent",
    model: "test",
    startedAt: Date.now(),
    plugins: [],
    skills: [],
    logBuffer: [],
    eventBuffer: [],
    nextEventId: 1,
    chatRoomId: null,
    chatUserId: null,
    chatConnectionReady: null,
    chatConnectionPromise: null,
    adminEntityId: null,
    conversations: new Map(),
    cloudManager: null,
    sandboxManager: null,
    appManager: {} as unknown,
    trainingService: null,
    registryService: null,
    dropService: null,
    shareIngestQueue: [],
    broadcastStatus: null,
    broadcastWs: null,
    activeConversationId: null,
    permissionStates: {},
  } as unknown as import("../server.js").ServerState;
}

function createMockReq(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json", ...headers };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: "127.0.0.1",
  };

  const payload = body ? JSON.stringify(body) : "";
  const emitBody = () => {
    setTimeout(() => {
      if (payload) req.emit("data", Buffer.from(payload));
      req.emit("end");
    }, 0);
  };

  return { req, emitBody };
}

function createMockRes() {
  const chunks: Buffer[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    writableEnded: false,
    setHeader(name: string, value: string | number) {
      this.headers[name] = String(value);
    },
    write(chunk: string | Buffer | Uint8Array) {
      chunks.push(
        typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk),
      );
      return true;
    },
    end(chunk?: string | Buffer | Uint8Array) {
      if (chunk) {
        chunks.push(
          typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk),
        );
      }
      this.writableEnded = true;
    },
    body(): Buffer {
      return Buffer.concat(chunks);
    },
    destroy() {
      this.writableEnded = true;
    },
  };
  return res as unknown as ServerResponse & typeof res;
}

describe("POST /api/tts/elevenlabs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MILAIDY_API_TOKEN;
    delete process.env.ELEVENLABS_API_KEY;
  });

  it("proxies ElevenLabs audio requests", async () => {
    process.env.MILAIDY_API_TOKEN = "tts-token";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
      );

    const state = createState({
      messages: {
        tts: {
          elevenlabs: {
            apiKey: "server-elevenlabs-key",
            voiceId: "cfg-voice-id",
          },
        },
      },
    });

    const { req, emitBody } = createMockReq(
      "POST",
      "/api/tts/elevenlabs",
      {
        text: "Hello world",
        voiceId: "request-voice-id",
        modelId: "eleven_flash_v2_5",
        outputFormat: "mp3_22050_32",
      },
      { authorization: "Bearer tts-token" },
    );
    const res = createMockRes();
    const pending = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await pending;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0];
    expect(String(requestUrl)).toContain(
      "/v1/text-to-speech/request-voice-id/stream",
    );
    expect(String(requestUrl)).toContain("output_format=mp3_22050_32");
    expect((requestInit?.headers as Record<string, string>)["xi-api-key"]).toBe(
      "server-elevenlabs-key",
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("audio/mpeg");
    expect(res.body()).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("returns 400 when ElevenLabs key is unavailable", async () => {
    process.env.MILAIDY_API_TOKEN = "tts-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const state = createState();
    const { req, emitBody } = createMockReq(
      "POST",
      "/api/tts/elevenlabs",
      {
        text: "Hello world",
        voiceId: "request-voice-id",
      },
      { authorization: "Bearer tts-token" },
    );
    const res = createMockRes();
    const pending = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await pending;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body().toString("utf8")).error).toContain(
      "ElevenLabs API key is not configured",
    );
  });
});
