import crypto from "node:crypto";
import type { HandlerOptions } from "@elizaos/core";
import {
  canonicalizeMasteryGameId,
  listCanonicalMasteryGameIds,
} from "./aliases.js";
import {
  getMasteryContract,
  resolveMasteryGameOrder,
} from "./registry.js";
import {
  appendMasteryEpisode,
  appendMasteryLog,
  readMasteryRun,
  writeMasteryGameSnapshot,
  writeMasteryRun,
} from "./store.js";
import type {
  Five55MasteryEpisode,
  Five55MasteryLog,
  Five55MasteryRun,
  MasteryCertificationRequest,
  MasteryGateResult,
  MasteryVerdict,
} from "./types.js";

const LOCAL_API_URL_ENV = "MILAIDY_API_URL";
const LOCAL_PORT_ENV = "MILAIDY_PORT";

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function resolveLocalApiBase(): string {
  const explicit = trimEnv(LOCAL_API_URL_ENV);
  if (explicit) return explicit;
  const port = trimEnv(LOCAL_PORT_ENV) ?? "2138";
  return `http://127.0.0.1:${port}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseSeedMode(value: unknown): "fixed" | "mixed" | "rolling" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "fixed" || normalized === "rolling") return normalized;
  return "mixed";
}

function parseStrictMode(options: HandlerOptions | undefined): MasteryCertificationRequest {
  const params = options?.parameters ?? {};
  const suiteIdRaw = params.suiteId;
  const suiteId =
    typeof suiteIdRaw === "string" && suiteIdRaw.trim().length > 0
      ? suiteIdRaw.trim()
      : `suite-${Date.now()}`;
  const gamesRaw = parseStringArray(params.games);
  const episodesPerGame = parsePositiveInt(params.episodesPerGame, 60);
  const seedMode = parseSeedMode(params.seedMode);
  const maxDurationSec = parsePositiveInt(params.maxDurationSec, 21_600);
  const strict = parseBoolean(params.strict, false);

  return {
    suiteId,
    games: gamesRaw.length > 0 ? gamesRaw : listCanonicalMasteryGameIds(),
    episodesPerGame,
    seedMode,
    maxDurationSec,
    strict,
  };
}

function buildRunId(suiteId: string): string {
  return `${suiteId}-${new Date().toISOString().replace(/[-:.]/g, "").replace("T", "T").slice(0, 15)}-${crypto.randomBytes(3).toString("hex")}`;
}

function pickSeed(seedMode: "fixed" | "mixed" | "rolling", offset: number): number {
  if (seedMode === "fixed") return 555;
  if (seedMode === "rolling") return Date.now() + offset;
  return Math.floor(Math.random() * 1_000_000_000);
}

function evaluateGate(
  gate: {
    id: string;
    metric: string;
    operator: ">=" | "<=" | "==" | "!=";
    threshold: number;
  },
  observed: number | null,
  strict: boolean,
): MasteryGateResult {
  if (observed == null) {
    return {
      gateId: gate.id,
      metric: gate.metric,
      operator: gate.operator,
      threshold: gate.threshold,
      observed: null,
      passed: !strict,
      reason: strict ? "metric_unavailable_strict_fail" : "metric_unavailable_permissive_pass",
    };
  }

  let passed = false;
  if (gate.operator === ">=") passed = observed >= gate.threshold;
  if (gate.operator === "<=") passed = observed <= gate.threshold;
  if (gate.operator === "==") passed = observed === gate.threshold;
  if (gate.operator === "!=") passed = observed !== gate.threshold;

  return {
    gateId: gate.id,
    metric: gate.metric,
    operator: gate.operator,
    threshold: gate.threshold,
    observed,
    passed,
    reason: passed ? "threshold_met" : "threshold_missed",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseActionEnvelope(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const candidates: unknown[] = [
    record.text,
    asRecord(record.result).text,
    asRecord(record.actionResult).text,
    asRecord(record.response).text,
  ];
  const text = candidates.find((entry) => typeof entry === "string");
  if (typeof text !== "string") return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function flattenNumericMetrics(
  input: unknown,
  prefix: string,
  out: Map<string, number>,
): void {
  if (input == null) return;
  if (typeof input === "number" && Number.isFinite(input)) {
    out.set(prefix, input);
    return;
  }
  if (typeof input === "boolean") {
    out.set(prefix, input ? 1 : 0);
    return;
  }
  if (typeof input !== "object" || Array.isArray(input)) return;
  const record = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const safeKey = key.trim();
    if (!safeKey) continue;
    const childPrefix = prefix ? `${prefix}.${safeKey}` : safeKey;
    flattenNumericMetrics(value, childPrefix, out);
  }
}

function collectObservedMetrics(playEnvelope: Record<string, unknown>): Map<string, number> {
  const metrics = new Map<string, number>();
  flattenNumericMetrics(playEnvelope, "", metrics);
  const data = asRecord(playEnvelope.data);
  flattenNumericMetrics(data, "", metrics);
  flattenNumericMetrics(asRecord(data.metrics), "", metrics);
  flattenNumericMetrics(asRecord(data.capture), "", metrics);
  return metrics;
}

function resolveMetricAlias(metric: string): string[] {
  const aliases = new Set<string>([metric]);
  if (metric.endsWith("Sec")) aliases.add(metric.replace(/Sec$/, "Seconds"));
  if (metric.endsWith("Seconds")) aliases.add(metric.replace(/Seconds$/, "Sec"));
  if (metric.endsWith("Rate")) aliases.add(metric.replace(/Rate$/, "Percent"));
  if (metric.endsWith("Percent")) aliases.add(metric.replace(/Percent$/, "Rate"));
  return [...aliases];
}

function computeObservedMetric(
  metric: string,
  succeeded: boolean,
  observedMetrics: Map<string, number>,
): number | null {
  for (const key of resolveMetricAlias(metric)) {
    const value = observedMetrics.get(key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  if (metric === "launch.successRate") return succeeded ? 1 : 0;
  if (metric === "restart.successRate") return succeeded ? 1 : 0;
  if (/\.successRate$/i.test(metric)) return succeeded ? 1 : 0;
  return null;
}

function buildEpisodeVerdict(input: {
  strict: boolean;
  succeeded: boolean;
  error: string | null;
  gameId: string;
  playEnvelope: Record<string, unknown>;
}): MasteryVerdict {
  const contract = getMasteryContract(input.gameId);
  const observedMetrics = collectObservedMetrics(input.playEnvelope);
  const gateResults = contract.passGates.map((gate) =>
    evaluateGate(
      gate,
      computeObservedMetric(gate.metric, input.succeeded, observedMetrics),
      input.strict,
    ),
  );
  const gatePass = gateResults.every((entry) => entry.passed);
  const passed = input.succeeded && gatePass;

  const reasons: string[] = [];
  if (!input.succeeded) reasons.push(input.error ?? "execute_plan_failed");
  for (const gate of gateResults) {
    if (!gate.passed) reasons.push(`gate_failed:${gate.gateId}`);
  }
  if (reasons.length === 0) reasons.push("all_gates_passed");

  return {
    passed,
    confidence: passed ? 0.82 : input.succeeded ? 0.45 : 0.2,
    reasons,
    gateResults,
  };
}

async function executePlan(baseUrl: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(new URL("/api/agent/autonomy/execute-plan", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw) as unknown;
    parsed = asRecord(value);
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const message =
      (typeof parsed.error === "string" && parsed.error) ||
      raw ||
      `execute-plan failed with status ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

class MasteryCertificationOrchestrator {
  private readonly activeRuns = new Set<string>();
  private readonly logSeqByRun = new Map<string, number>();

  private nextLogSeq(runId: string): number {
    const current = this.logSeqByRun.get(runId) ?? 0;
    const next = current + 1;
    this.logSeqByRun.set(runId, next);
    return next;
  }

  private async log(runId: string, level: Five55MasteryLog["level"], message: string, ctx?: {
    stage?: string;
    gameId?: string;
    episodeId?: string;
  }): Promise<void> {
    const logEntry: Five55MasteryLog = {
      runId,
      seq: this.nextLogSeq(runId),
      ts: nowIso(),
      level,
      message,
      stage: ctx?.stage,
      gameId: ctx?.gameId,
      episodeId: ctx?.episodeId,
    };
    await appendMasteryLog(runId, logEntry);
  }

  async start(options: HandlerOptions | undefined): Promise<Five55MasteryRun> {
    const request = parseStrictMode(options);
    const orderedGames = resolveMasteryGameOrder(request.games);
    const totalEpisodes = orderedGames.length * request.episodesPerGame;

    const run: Five55MasteryRun = {
      runId: buildRunId(request.suiteId),
      suiteId: request.suiteId,
      status: "queued",
      strict: request.strict,
      seedMode: request.seedMode,
      maxDurationSec: request.maxDurationSec,
      episodesPerGame: request.episodesPerGame,
      games: orderedGames,
      startedAt: nowIso(),
      finishedAt: null,
      durationMs: null,
      progress: {
        totalEpisodes,
        completedEpisodes: 0,
        passedEpisodes: 0,
        failedEpisodes: 0,
      },
      summary: {
        passedGames: [],
        failedGames: [],
        gamePassRate: 0,
      },
      error: null,
    };

    await writeMasteryRun(run);
    await this.log(run.runId, "info", `Mastery run queued (${run.runId})`, {
      stage: "queued",
    });

    void this.execute(run, request).catch(async (err) => {
      const error = err instanceof Error ? err.message : String(err);
      const current = await readMasteryRun(run.runId);
      if (!current) return;
      current.status = "failed";
      current.error = error;
      current.finishedAt = nowIso();
      current.durationMs = Date.parse(current.finishedAt) - Date.parse(current.startedAt);
      await writeMasteryRun(current);
      await this.log(current.runId, "error", `Mastery run failed: ${error}`, {
        stage: "failed",
      });
      this.activeRuns.delete(current.runId);
    });

    return run;
  }

  async status(runId: string): Promise<Five55MasteryRun | null> {
    return readMasteryRun(runId);
  }

  private async execute(run: Five55MasteryRun, request: MasteryCertificationRequest): Promise<void> {
    this.activeRuns.add(run.runId);
    const baseUrl = resolveLocalApiBase();
    const startedMs = Date.now();

    run.status = "running";
    run.startedAt = nowIso();
    await writeMasteryRun(run);
    await this.log(run.runId, "info", "Mastery run started", { stage: "running" });

    const perGamePass = new Map<string, { pass: number; fail: number }>();
    for (const gameId of run.games) {
      perGamePass.set(gameId, { pass: 0, fail: 0 });
    }

    let globalEpisodeIndex = 0;
    for (const gameId of run.games) {
      const canonicalGameId = canonicalizeMasteryGameId(gameId);
      const contract = getMasteryContract(canonicalGameId);
      for (let episodeIndex = 1; episodeIndex <= run.episodesPerGame; episodeIndex += 1) {
        globalEpisodeIndex += 1;

        const elapsedSec = (Date.now() - startedMs) / 1000;
        if (elapsedSec > run.maxDurationSec) {
          throw new Error(`maxDurationSec exceeded (${run.maxDurationSec}s)`);
        }

        const episodeId = `${run.runId}-${canonicalGameId}-ep${episodeIndex}`;
        const seed = pickSeed(run.seedMode, globalEpisodeIndex);
        const episodeStart = Date.now();

        await this.log(run.runId, "info", `Episode start ${episodeId}`, {
          stage: "episode_start",
          gameId: canonicalGameId,
          episodeId,
        });

        let actionOk = false;
        let actionError: string | null = null;
        let requestId = `mastery-play-${episodeId}`;
        let playEnvelope: Record<string, unknown> = {};

        try {
          const executeResult = await executePlan(baseUrl, {
            plan: {
              id: `mastery-suite-${run.runId}`,
              steps: [
                {
                  id: `play-${episodeId}`,
                  toolName: "FIVE55_GAMES_PLAY",
                  params: {
                    gameId: canonicalGameId,
                    mode: "agent",
                    masteryProfile: {
                      suiteId: run.suiteId,
                      runId: run.runId,
                      gameId: canonicalGameId,
                      episodeIndex,
                      episodeId,
                      seed,
                      strict: run.strict,
                      contractVersion: 1,
                    },
                  },
                },
              ],
            },
            request: {
              source: "system",
              sourceTrust: 1,
            },
            options: {
              stopOnFailure: true,
            },
          });

          const allSucceeded = executeResult.allSucceeded === true;
          const results = Array.isArray(executeResult.results)
            ? executeResult.results
            : [];
          const firstResult = results[0] ?? null;
          const envelope = parseActionEnvelope(firstResult);
          playEnvelope = envelope;
          const trace = asRecord(envelope.trace);
          requestId =
            typeof trace.actionId === "string"
              ? trace.actionId
              : typeof envelope.actionId === "string"
                ? envelope.actionId
                : requestId;
          actionOk = allSucceeded;
          if (!allSucceeded) {
            actionError =
              (typeof executeResult.error === "string" && executeResult.error) ||
              (typeof envelope.message === "string" && envelope.message) ||
              "execute_plan_step_failed";
          }
        } catch (err) {
          actionOk = false;
          actionError = err instanceof Error ? err.message : String(err);
        }

        const verdict = buildEpisodeVerdict({
          strict: run.strict,
          succeeded: actionOk,
          error: actionError,
          gameId: canonicalGameId,
          playEnvelope,
        });

        const episode: Five55MasteryEpisode = {
          runId: run.runId,
          episodeId,
          gameId: canonicalGameId,
          gameTitle: contract.title,
          episodeIndex,
          seed,
          status: verdict.passed ? "success" : "failed",
          startedAt: new Date(episodeStart).toISOString(),
          finishedAt: nowIso(),
          durationMs: Date.now() - episodeStart,
          actionResult: {
            ok: actionOk,
            requestId,
            error: actionError,
          },
          verdict,
          metadata: {
            objective: contract.objective.summary,
            controls: contract.controls,
            playEnvelope,
          },
        };

        await appendMasteryEpisode(run.runId, episode);
        await this.log(
          run.runId,
          verdict.passed ? "info" : "warn",
          `Episode ${episodeId} ${verdict.passed ? "passed" : "failed"}`,
          {
            stage: "episode_result",
            gameId: canonicalGameId,
            episodeId,
          },
        );

        const gameStats = perGamePass.get(canonicalGameId) ?? { pass: 0, fail: 0 };
        if (verdict.passed) {
          gameStats.pass += 1;
          run.progress.passedEpisodes += 1;
        } else {
          gameStats.fail += 1;
          run.progress.failedEpisodes += 1;
        }
        perGamePass.set(canonicalGameId, gameStats);
        run.progress.completedEpisodes += 1;

        await writeMasteryGameSnapshot({
          gameId: canonicalGameId,
          updatedAt: nowIso(),
          latestRunId: run.runId,
          latestEpisodeId: episode.episodeId,
          latestVerdict: verdict,
          latestStatus: episode.status,
          objective: contract.objective,
          controls: contract.controls,
          riskFlags: verdict.reasons,
        });

        await this.recomputeRunSummary(run, perGamePass);
        await writeMasteryRun(run);

        if (run.strict && !verdict.passed) {
          run.status = "failed";
          run.error = `strict mode stop at ${episodeId}`;
          await this.log(run.runId, "error", run.error, {
            stage: "strict_stop",
            gameId: canonicalGameId,
            episodeId,
          });
          run.finishedAt = nowIso();
          run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
          await writeMasteryRun(run);
          this.activeRuns.delete(run.runId);
          return;
        }
      }
    }

    run.status = run.progress.failedEpisodes > 0 ? "failed" : "success";
    run.finishedAt = nowIso();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    await this.recomputeRunSummary(run, perGamePass);
    await writeMasteryRun(run);
    await this.log(run.runId, run.status === "success" ? "info" : "warn", `Mastery run ${run.status}`, {
      stage: "complete",
    });

    this.activeRuns.delete(run.runId);
  }

  private async recomputeRunSummary(
    run: Five55MasteryRun,
    perGamePass: Map<string, { pass: number; fail: number }>,
  ): Promise<void> {
    const passedGames: string[] = [];
    const failedGames: string[] = [];

    for (const [gameId, stats] of perGamePass.entries()) {
      if (stats.fail === 0 && stats.pass > 0) {
        passedGames.push(gameId);
      } else if (stats.fail > 0) {
        failedGames.push(gameId);
      }
    }

    run.summary = {
      passedGames: passedGames.sort(),
      failedGames: failedGames.sort(),
      gamePassRate:
        run.games.length > 0
          ? Number((passedGames.length / run.games.length).toFixed(4))
          : 0,
    };
  }
}

const globalKey = "__milaidyFive55MasteryOrchestrator";

type GlobalWithOrchestrator = typeof globalThis & {
  [globalKey]?: MasteryCertificationOrchestrator;
};

export function getMasteryCertificationOrchestrator(): MasteryCertificationOrchestrator {
  const g = globalThis as GlobalWithOrchestrator;
  if (!g[globalKey]) {
    g[globalKey] = new MasteryCertificationOrchestrator();
  }
  return g[globalKey] as MasteryCertificationOrchestrator;
}
