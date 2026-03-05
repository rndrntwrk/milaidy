import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMasteryEpisode,
  appendMasteryLog,
  listMasteryRuns,
  readMasteryEpisodeConsistency,
  readMasteryEpisodeFrames,
  readMasteryLogs,
  readMasteryRunEvidence,
  writeMasteryRun,
} from "./index.js";
import * as masteryExports from "./index.js";
import type { Five55MasteryEpisode, Five55MasteryRun } from "./types.js";

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

function buildRun(runId: string, status: Five55MasteryRun["status"]): Five55MasteryRun {
  return {
    runId,
    suiteId: `suite-${runId}`,
    status,
    strict: false,
    seedMode: "mixed",
    maxDurationSec: 60,
    episodesPerGame: 1,
    games: ["knighthood"],
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    durationMs: 1,
    progress: {
      totalEpisodes: 1,
      completedEpisodes: 1,
      passedEpisodes: status === "success" ? 1 : 0,
      failedEpisodes: status === "success" ? 0 : 1,
    },
    summary: {
      passedGames: status === "success" ? ["knighthood"] : [],
      failedGames: status === "success" ? [] : ["knighthood"],
      gamePassRate: status === "success" ? 1 : 0,
    },
    error: status === "success" ? null : "failed",
  };
}

function buildEpisode(input: {
  runId: string;
  episodeId: string;
  gameId: string;
  status?: Five55MasteryEpisode["status"];
}): Five55MasteryEpisode {
  return {
    runId: input.runId,
    episodeId: input.episodeId,
    gameId: input.gameId,
    gameTitle: input.gameId,
    episodeIndex: 1,
    seed: 1,
    status: input.status ?? "success",
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    durationMs: 1,
    actionResult: {
      ok: true,
      requestId: "req-1",
      error: null,
    },
    verdict: {
      passed: true,
      confidence: 1,
      reasons: [],
      gateResults: [],
    },
    metadata: {},
  };
}

describe("five55 mastery store", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-mastery-store-"));
    process.env.MILAIDY_STATE_DIR = stateDir;
  });

  afterEach(async () => {
    restoreEnv();
    if (stateDir) {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });

  it("paginates run history with cursor and status filter", async () => {
    await writeMasteryRun(buildRun("run-success-1", "success"));
    await writeMasteryRun(buildRun("run-failed-1", "failed"));
    await writeMasteryRun(buildRun("run-success-2", "success"));

    const firstPage = await listMasteryRuns({ limit: 2 });
    expect(firstPage.runs).toHaveLength(2);
    expect(firstPage.total).toBe(3);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listMasteryRuns({
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.runs).toHaveLength(1);
    expect(secondPage.runs[0]?.runId).toBe("run-success-1");

    const successOnly = await listMasteryRuns({ status: "success", limit: 10 });
    expect(successOnly.runs.map((run) => run.runId)).toEqual([
      "run-success-2",
      "run-success-1",
    ]);
  });

  it("returns incremental logs using afterSeq and limit", async () => {
    const runId = "run-logs-1";
    await appendMasteryLog(runId, {
      runId,
      seq: 1,
      ts: new Date(1).toISOString(),
      level: "info",
      message: "one",
    });
    await appendMasteryLog(runId, {
      runId,
      seq: 2,
      ts: new Date(2).toISOString(),
      level: "warn",
      message: "two",
    });
    await appendMasteryLog(runId, {
      runId,
      seq: 3,
      ts: new Date(3).toISOString(),
      level: "error",
      message: "three",
    });

    const logs = await readMasteryLogs({
      runId,
      afterSeq: 1,
      limit: 1,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.seq).toBe(2);
    expect(logs[0]?.message).toBe("two");
  });

  it("returns fallback frames and consistency for legacy episodes without evidence", async () => {
    const runId = "run-legacy-evidence";
    const episodeId = "episode-legacy";

    await appendMasteryEpisode(
      runId,
      buildEpisode({ runId, episodeId, gameId: "knighthood" }),
    );

    const frames = await readMasteryEpisodeFrames({ runId, episodeId });
    const consistency = await readMasteryEpisodeConsistency({ runId, episodeId });

    expect(frames).toEqual([]);
    expect(consistency).toEqual({
      status: "insufficient",
      checkedAt: new Date(0).toISOString(),
      reasons: ["no_episode_evidence"],
      mismatchDetails: [],
    });
  });

  it("normalizes mixed legacy and evidence-backed episodes in run evidence summaries", async () => {
    const runId = "run-mixed-evidence";
    const legacyEpisodeId = "episode-legacy";
    const evidenceEpisodeId = "episode-evidence";
    const checkedAt = "2026-03-05T00:00:00.000Z";

    await appendMasteryEpisode(
      runId,
      buildEpisode({
        runId,
        episodeId: legacyEpisodeId,
        gameId: "knighthood",
        status: "failed",
      }),
    );

    await appendMasteryEpisode(
      runId,
      {
        ...buildEpisode({
          runId,
          episodeId: evidenceEpisodeId,
          gameId: "sector-13",
          status: "success",
        }),
        evidence: {
          frames: [
            { ts: checkedAt, kind: "state" },
            { ts: checkedAt, kind: "action" },
          ],
          consistency: {
            status: "consistent",
            checkedAt,
            reasons: ["aligned"],
            mismatchDetails: [],
          },
          syntheticSignals: ["stable_run"],
        },
      } as Five55MasteryEpisode,
    );

    const evidence = await readMasteryRunEvidence(runId);
    expect(evidence).toHaveLength(2);

    const legacy = evidence.find((entry) => entry.episodeId === legacyEpisodeId);
    expect(legacy).toBeTruthy();
    expect(legacy?.frameCount).toBe(0);
    expect(legacy?.consistency.status).toBe("insufficient");
    expect(legacy?.syntheticSignals).toEqual([]);

    const modern = evidence.find((entry) => entry.episodeId === evidenceEpisodeId);
    expect(modern).toBeTruthy();
    expect(modern?.frameCount).toBe(2);
    expect(modern?.consistency.status).toBe("consistent");
    expect(modern?.consistency.checkedAt).toBe(checkedAt);
    expect(modern?.syntheticSignals).toEqual(["stable_run"]);
  });

  it("guards mastery index exports against server import drift", async () => {
    const serverPath = path.resolve(process.cwd(), "src/api/server.ts");
    const source = await fs.readFile(serverPath, "utf8");
    const targetImport = 'from "../plugins/five55-games/mastery/index.js";';
    const targetIndex = source.indexOf(targetImport);
    expect(targetIndex).toBeGreaterThanOrEqual(0);

    const beforeTarget = source.slice(0, targetIndex);
    const importStart = beforeTarget.lastIndexOf("import {");
    expect(importStart).toBeGreaterThanOrEqual(0);

    const openBraceIndex = source.indexOf("{", importStart);
    const closeBraceIndex = source.lastIndexOf("}", targetIndex);
    expect(openBraceIndex).toBeGreaterThanOrEqual(0);
    expect(closeBraceIndex).toBeGreaterThan(openBraceIndex);

    const importBlock = source.slice(openBraceIndex + 1, closeBraceIndex);
    const importedSymbols = importBlock
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.replace(/\s+/g, " "))
      .map((entry) => entry.split(" as ")[0]?.trim() ?? "")
      .filter((entry) => entry.length > 0);

    const missing = importedSymbols.filter((symbol) => !(symbol in masteryExports));
    expect(missing).toEqual([]);
  });
});
