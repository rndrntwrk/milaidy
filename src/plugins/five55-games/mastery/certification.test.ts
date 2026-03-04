import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerOptions } from "@elizaos/core";
import {
  getMasteryCertificationOrchestrator,
  readMasteryEpisodes,
  readMasteryRun,
} from "./index.js";

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

async function waitForRunTerminal(
  runId: string,
  timeoutMs = 4_000,
): Promise<import("./types.js").Five55MasteryRun> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await readMasteryRun(runId);
    if (run && (run.status === "success" || run.status === "failed" || run.status === "canceled")) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for run terminal state: ${runId}`);
}

function buildExecutePlanResponse(actionId: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      allSucceeded: true,
      results: [
        {
          success: true,
          result: {
            success: true,
            text: JSON.stringify({
              ok: true,
              trace: { actionId },
              data: {
                status: "started",
              },
            }),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("five55 mastery certification orchestrator", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-mastery-"));
    process.env.MILAIDY_STATE_DIR = stateDir;
    process.env.MILAIDY_API_URL = "http://127.0.0.1:2138";
    vi.stubGlobal("fetch", vi.fn(async () => buildExecutePlanResponse("action-1")));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    restoreEnv();
    if (stateDir) {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });

  it("defaults strict to false and parses nested action envelope text", async () => {
    const orchestrator = getMasteryCertificationOrchestrator();
    const run = await orchestrator.start({
      parameters: {
        suiteId: "suite-default-strict",
        games: ["knighthood"],
        episodesPerGame: 1,
        seedMode: "fixed",
        maxDurationSec: 60,
      },
    } as HandlerOptions);

    const final = await waitForRunTerminal(run.runId);
    expect(final.status).toBe("success");
    expect(final.strict).toBe(false);

    const episodes = await readMasteryEpisodes(run.runId);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].actionResult.requestId).toBe("action-1");
    expect(episodes[0].verdict.passed).toBe(true);
  });

  it("fails fast in strict mode when required metrics are unavailable", async () => {
    const orchestrator = getMasteryCertificationOrchestrator();
    const run = await orchestrator.start({
      parameters: {
        suiteId: "suite-strict-fail",
        games: ["knighthood"],
        episodesPerGame: 1,
        seedMode: "fixed",
        maxDurationSec: 60,
        strict: true,
      },
    } as HandlerOptions);

    const final = await waitForRunTerminal(run.runId);
    expect(final.status).toBe("failed");
    expect(final.strict).toBe(true);
    expect(final.error).toContain("strict mode stop");
  });
});
