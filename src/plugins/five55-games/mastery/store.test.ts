import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMasteryLog,
  listMasteryRuns,
  readMasteryLogs,
  writeMasteryRun,
} from "./index.js";
import type { Five55MasteryRun } from "./types.js";

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
});
