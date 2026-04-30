import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __testOnlyHandleRequest } from "../server.js";
import {
  appendMasteryEpisode,
  appendMasteryLog,
  writeMasteryRun,
} from "../../plugins/five55-games/mastery/index.js";
import type {
  Five55MasteryEpisode,
  Five55MasteryLog,
  Five55MasteryRun,
} from "../../plugins/five55-games/mastery/types.js";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createMockReq(method: string, url: string, body?: unknown) {
  const payload = body ? JSON.stringify(body) : "";
  const req = new Readable({
    read() {},
  }) as unknown as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json" };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: "127.0.0.1",
  };

  const emitBody = () => {
    if (payload) req.push(Buffer.from(payload));
    req.push(null);
  };

  return { req, emitBody };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string | number) {
      this.headers[name] = String(value);
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
    },
  };
  return res as unknown as ServerResponse & typeof res;
}

function createState() {
  return {
    runtime: null,
    config: {},
    agentState: "running",
    agentName: "TestAgent",
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

function buildRun(runId: string): Five55MasteryRun {
  return {
    runId,
    suiteId: "suite-routes",
    status: "success",
    strict: true,
    verificationStatus: "verified",
    seedMode: "fixed",
    maxDurationSec: 60,
    episodesPerGame: 1,
    games: ["knighthood"],
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    durationMs: 1,
    progress: {
      totalEpisodes: 1,
      completedEpisodes: 1,
      passedEpisodes: 1,
      failedEpisodes: 0,
    },
    summary: {
      passedGames: ["knighthood"],
      failedGames: [],
      deferredGames: [],
      evaluatedGames: 1,
      denominatorGames: 1,
      gamePassRate: 1,
    },
    error: null,
  };
}

function buildEpisode(runId: string): Five55MasteryEpisode {
  return {
    runId,
    episodeId: `${runId}-knighthood-ep1`,
    gameId: "knighthood",
    gameTitle: "Knighthood",
    episodeIndex: 1,
    seed: 555,
    status: "success",
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    durationMs: 1,
    actionResult: {
      ok: true,
      requestId: "action-1",
      error: null,
    },
    verdict: {
      passed: true,
      confidence: 0.9,
      reasons: ["all_gates_passed"],
      gateResults: [],
      outcome: {
        runtimeQualified: true,
        visualQualified: true,
        finalQualified: true,
        failureCode: null,
      },
      consistency: {
        status: "pass",
        checkedAt: new Date(1).toISOString(),
        reasons: ["consistency_passed"],
        mismatchDetails: [],
      },
    },
    evidence: {
      frames: [],
      consistency: {
        status: "pass",
        checkedAt: new Date(1).toISOString(),
        reasons: ["consistency_passed"],
        mismatchDetails: [],
      },
      syntheticSignals: [],
    },
    metadata: {},
  };
}

function buildLog(runId: string, seq: number): Five55MasteryLog {
  return {
    runId,
    seq,
    ts: new Date(seq).toISOString(),
    level: "info",
    message: `log-${seq}`,
    stage: "episode_result",
  };
}

describe("/api/five55/mastery/* routes", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-mastery-routes-"));
    process.env.MILAIDY_STATE_DIR = stateDir;
  });

  afterEach(async () => {
    restoreEnv();
    if (stateDir) {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });

  it("returns mastery catalog", async () => {
    const state = createState();
    const { req, emitBody } = createMockReq("GET", "/api/five55/mastery/catalog");
    const res = createMockRes();
    const pending = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await pending;

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as { total: number; contracts: unknown[] };
    expect(payload.total).toBeGreaterThanOrEqual(16);
    expect(payload.contracts.length).toBe(payload.total);
  });

  it("lists persisted runs and run subresources", async () => {
    const runId = "run-routes-1";
    await writeMasteryRun(buildRun(runId));
    await appendMasteryEpisode(runId, buildEpisode(runId));
    await appendMasteryLog(runId, buildLog(runId, 1));
    await appendMasteryLog(runId, buildLog(runId, 2));

    const state = createState();

    {
      const { req, emitBody } = createMockReq("GET", "/api/five55/mastery/runs?limit=5");
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as { runs: Array<{ runId: string }> };
      expect(payload.runs[0]?.runId).toBe(runId);
    }

    {
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as { run: { runId: string } };
      expect(payload.run.runId).toBe(runId);
    }

    {
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}/episodes`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        total: number;
        episodes: Array<{ episodeId: string }>;
      };
      expect(payload.total).toBe(1);
      expect(payload.episodes[0]?.episodeId).toContain("ep1");
    }

    {
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}/logs?afterSeq=1&limit=1`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        count: number;
        logs: Array<{ seq: number }>;
        nextAfterSeq: number;
      };
      expect(payload.count).toBe(1);
      expect(payload.logs[0]?.seq).toBe(2);
      expect(payload.nextAfterSeq).toBe(2);
    }

    {
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}/evidence`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        runId: string;
        total: number;
      };
      expect(payload.runId).toBe(runId);
      expect(payload.total).toBe(1);
    }

    {
      const episodeId = `${runId}-knighthood-ep1`;
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}/episodes/${encodeURIComponent(episodeId)}/frames`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as { total: number };
      expect(payload.total).toBe(0);
    }

    {
      const episodeId = `${runId}-knighthood-ep1`;
      const { req, emitBody } = createMockReq(
        "GET",
        `/api/five55/mastery/runs/${encodeURIComponent(runId)}/episodes/${encodeURIComponent(episodeId)}/consistency`,
      );
      const res = createMockRes();
      const pending = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await pending;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        consistency: { status: string };
      };
      expect(payload.consistency.status).toBe("pass");
    }
  });

  it("rejects mastery run start when runtime is unavailable", async () => {
    const state = createState();
    const { req, emitBody } = createMockReq("POST", "/api/five55/mastery/runs", {
      games: ["knighthood"],
      episodesPerGame: 1,
    });
    const res = createMockRes();
    const pending = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await pending;

    expect(res.statusCode).toBe(503);
    const payload = JSON.parse(res.body) as { error: string };
    expect(payload.error).toContain("runtime");
  });

  it("rejects mastery run start when strict=false is requested", async () => {
    const state = createState();
    const { req, emitBody } = createMockReq("POST", "/api/five55/mastery/runs", {
      games: ["knighthood"],
      episodesPerGame: 1,
      strict: false,
    });
    const res = createMockRes();
    const pending = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await pending;

    expect(res.statusCode).toBe(400);
    const payload = JSON.parse(res.body) as { error: string };
    expect(payload.error).toContain("strict=false");
  });
});
