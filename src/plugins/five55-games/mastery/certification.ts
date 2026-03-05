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
  MasteryConsistencyVerdict,
  MasteryEpisodeEvidence,
  MasteryEpisodeOutcomeV2,
  MasteryEvidenceFrame,
  MasteryEvidenceMode,
  MasteryFrameType,
  MasteryGateResult,
  MasteryMetricOperator,
  MasteryPassGate,
  MasteryRuntimeGate,
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

function parseEvidenceMode(value: unknown): MasteryEvidenceMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "off") return "off";
  if (normalized === "basic") return "basic";
  return "strict";
}

function parseStrictMode(
  options: HandlerOptions | undefined,
): MasteryCertificationRequest {
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
  const evidenceMode = parseEvidenceMode(params.evidenceMode);

  return {
    suiteId,
    games: gamesRaw.length > 0 ? gamesRaw : listCanonicalMasteryGameIds(),
    episodesPerGame,
    seedMode,
    maxDurationSec,
    strict: true,
    evidenceMode,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry) => Object.keys(entry).length > 0);
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

type ObservedMetricBundle = {
  numeric: Map<string, number>;
  syntheticSignals: string[];
  lifecycle: string[];
  controlAxes: Set<string>;
};

function isSyntheticKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("synthetic") ||
    normalized.includes("forced") ||
    normalized.includes("simulated")
  );
}

function flattenNumericMetrics(
  input: unknown,
  prefix: string,
  out: Map<string, number>,
  syntheticSignals: string[],
): void {
  if (input == null) return;
  if (typeof input === "number" && Number.isFinite(input)) {
    if (prefix && isSyntheticKey(prefix)) {
      syntheticSignals.push(prefix);
      return;
    }
    out.set(prefix, input);
    return;
  }
  if (typeof input === "boolean") {
    if (prefix && isSyntheticKey(prefix)) {
      syntheticSignals.push(prefix);
      return;
    }
    out.set(prefix, input ? 1 : 0);
    return;
  }
  if (typeof input !== "object" || Array.isArray(input)) return;
  const record = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const safeKey = key.trim();
    if (!safeKey) continue;
    const childPrefix = prefix ? `${prefix}.${safeKey}` : safeKey;
    flattenNumericMetrics(value, childPrefix, out, syntheticSignals);
  }
}

function collectControlAxes(playEnvelope: Record<string, unknown>): Set<string> {
  const axes = new Set<string>();
  const candidates: string[] = [];
  const data = asRecord(playEnvelope.data);
  const trace = asRecord(playEnvelope.trace);
  const controlArrays = [
    playEnvelope.controlsUsed,
    data.controlsUsed,
    data.controlAxes,
    trace.controlsUsed,
    trace.actions,
    playEnvelope.actions,
  ];
  for (const list of controlArrays) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") candidates.push(item);
      else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        for (const value of Object.values(record)) {
          if (typeof value === "string") candidates.push(value);
        }
      }
    }
  }

  for (const raw of candidates) {
    const value = raw.toLowerCase();
    if (
      value.includes("move") ||
      value.includes("left") ||
      value.includes("right") ||
      value.includes("up") ||
      value.includes("down") ||
      value.includes("lane")
    ) {
      axes.add("move");
    }
    if (value.includes("jump")) axes.add("jump");
    if (
      value.includes("attack") ||
      value.includes("combat") ||
      value.includes("fire") ||
      value.includes("shoot") ||
      value.includes("hit")
    ) {
      axes.add("combat");
      if (value.includes("fire") || value.includes("shoot")) axes.add("fire");
    }
    if (value.includes("fly") || value.includes("flight") || value.includes("thrust")) {
      axes.add("flight");
    }
  }

  return axes;
}

function collectObservedMetrics(playEnvelope: Record<string, unknown>): ObservedMetricBundle {
  const numeric = new Map<string, number>();
  const syntheticSignals: string[] = [];
  flattenNumericMetrics(playEnvelope, "", numeric, syntheticSignals);
  const data = asRecord(playEnvelope.data);
  flattenNumericMetrics(data, "", numeric, syntheticSignals);
  flattenNumericMetrics(asRecord(data.metrics), "", numeric, syntheticSignals);
  flattenNumericMetrics(asRecord(data.capture), "", numeric, syntheticSignals);

  const lifecycleCandidates = [
    playEnvelope.status,
    data.status,
    asRecord(data.stateSummary).status,
    asRecord(data.capture).status,
  ];
  const lifecycle = lifecycleCandidates
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);

  return {
    numeric,
    syntheticSignals: [...new Set(syntheticSignals)],
    lifecycle,
    controlAxes: collectControlAxes(playEnvelope),
  };
}

function resolveMetricAlias(metric: string): string[] {
  const aliases = new Set<string>([metric]);
  if (metric.endsWith("Sec")) aliases.add(metric.replace(/Sec$/, "Seconds"));
  if (metric.endsWith("Seconds")) aliases.add(metric.replace(/Seconds$/, "Sec"));
  if (metric.endsWith("Rate")) aliases.add(metric.replace(/Rate$/, "Percent"));
  if (metric.endsWith("Percent")) aliases.add(metric.replace(/Percent$/, "Rate"));

  const withoutDotMax = metric.replace(/\.max$/, "");
  const withoutDotMin = metric.replace(/\.min$/, "");
  aliases.add(withoutDotMax);
  aliases.add(withoutDotMin);

  const lastSegment = metric.split(".").slice(-1)[0];
  aliases.add(lastSegment);

  return [...aliases].filter((entry) => entry.length > 0);
}

function getNumericCandidates(
  observedMetrics: Map<string, number>,
  metric: string,
): number[] {
  const aliases = resolveMetricAlias(metric);
  const out: number[] = [];

  for (const [key, value] of observedMetrics.entries()) {
    if (!Number.isFinite(value)) continue;
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    const lastSegment = normalizedKey.split(".").slice(-1)[0];

    const aliasHit = aliases.some(
      (alias) =>
        normalizedKey === alias ||
        normalizedKey.endsWith(`.${alias}`) ||
        lastSegment === alias,
    );
    if (aliasHit) out.push(value);
  }

  return out;
}

function computeObservedMetric(
  metric: string,
  succeeded: boolean,
  observedMetrics: Map<string, number>,
): number | null {
  const directCandidates = getNumericCandidates(observedMetrics, metric);
  const hasMax = metric.endsWith(".max");
  const hasMin = metric.endsWith(".min");

  if (directCandidates.length > 0) {
    if (hasMax) return Math.max(...directCandidates);
    if (hasMin) return Math.min(...directCandidates);
    return directCandidates[0] ?? null;
  }

  if (metric === "launch.successRate") return succeeded ? 1 : 0;
  if (metric === "restart.successRate") return succeeded ? 1 : 0;
  if (/\.successRate$/i.test(metric)) return succeeded ? 1 : 0;

  return null;
}

function evaluateGate(
  gate: {
    id: string;
    metric: string;
    operator: MasteryMetricOperator;
    threshold: number;
    source?: "runtime-native" | "synthetic" | "derived";
  },
  observed: number | null,
): MasteryGateResult {
  if (observed == null) {
    return {
      gateId: gate.id,
      metric: gate.metric,
      operator: gate.operator,
      threshold: gate.threshold,
      observed: null,
      passed: false,
      reason: "metric_unavailable_strict_fail",
      source: gate.source,
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
    source: gate.source,
  };
}

function buildGateSet(contract: { passGates: MasteryPassGate[]; gateV2: { runtimeGates: MasteryRuntimeGate[] } }): MasteryRuntimeGate[] {
  const runtimeGates =
    Array.isArray(contract.gateV2.runtimeGates) && contract.gateV2.runtimeGates.length > 0
      ? contract.gateV2.runtimeGates
      : contract.passGates;
  return runtimeGates.map((gate) => ({
    ...gate,
    required:
      "required" in gate && typeof gate.required === "boolean"
        ? gate.required
        : true,
    source:
      "source" in gate && typeof gate.source === "string"
        ? gate.source
        : "runtime-native",
  }));
}

function inferFrameType(raw: string | null, index: number, total: number): MasteryFrameType {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized.includes("menu") || normalized.includes("boot") || normalized.includes("title")) {
    return "boot/menu";
  }
  if (normalized.includes("play-start") || normalized.includes("start")) {
    return "play-start";
  }
  if (
    normalized.includes("terminal") ||
    normalized.includes("game_over") ||
    normalized.includes("gameover") ||
    normalized.includes("win") ||
    normalized.includes("timeout")
  ) {
    return "terminal";
  }
  if (normalized.includes("stuck")) {
    return "stuck-check";
  }
  if (normalized.includes("progress") || normalized.includes("checkpoint") || normalized.includes("level") || normalized.includes("sector")) {
    return "progress";
  }
  if (index === 0) return "boot/menu";
  if (index === 1) return "play-start";
  if (index === total - 1) return "terminal";
  return "progress";
}

function extractEvidenceFrames(input: {
  runId: string;
  episodeId: string;
  playEnvelope: Record<string, unknown>;
}): MasteryEvidenceFrame[] {
  const data = asRecord(input.playEnvelope.data);
  const capture = asRecord(data.capture);
  const candidateLists: Record<string, unknown>[] = [
    ...asRecordArray(input.playEnvelope.frames),
    ...asRecordArray(data.frames),
    ...asRecordArray(capture.frames),
    ...asRecordArray(data.screenshots),
    ...asRecordArray(capture.screenshots),
  ];

  const unique = new Map<string, Record<string, unknown>>();
  for (const entry of candidateLists) {
    const key =
      (typeof entry.path === "string" && entry.path) ||
      (typeof entry.url === "string" && entry.url) ||
      `${entry.ts ?? ""}:${entry.type ?? ""}:${unique.size}`;
    if (!unique.has(key)) unique.set(key, entry);
  }

  const values = [...unique.values()];
  return values.map((entry, index) => {
    const ts =
      typeof entry.ts === "string" && entry.ts.trim().length > 0
        ? entry.ts
        : nowIso();
    const path =
      typeof entry.path === "string" && entry.path.trim().length > 0
        ? entry.path
        : typeof entry.url === "string" && entry.url.trim().length > 0
          ? entry.url
          : undefined;
    const frameType = inferFrameType(
      typeof entry.frameType === "string"
        ? entry.frameType
        : typeof entry.type === "string"
          ? entry.type
          : null,
      index,
      values.length,
    );

    const ocrLines = Array.isArray(entry.ocr)
      ? entry.ocr
          .map((line) => (typeof line === "string" ? line.trim() : ""))
          .filter((line) => line.length > 0)
      : [];
    if (ocrLines.length === 0 && typeof entry.ocr === "string") {
      const line = entry.ocr.trim();
      if (line) ocrLines.push(line);
    }

    const telemetrySnapshot = asRecord(
      entry.telemetry ?? entry.snapshot ?? entry.state,
    );
    const hashSeed = `${path ?? ""}:${ts}:${JSON.stringify(telemetrySnapshot)}`;

    return {
      runId: input.runId,
      episodeId: input.episodeId,
      seq: index + 1,
      frameType,
      ts,
      hash:
        typeof entry.hash === "string" && entry.hash.trim().length > 0
          ? entry.hash
          : crypto.createHash("sha1").update(hashSeed).digest("hex"),
      ...(path ? { path } : {}),
      ocr: ocrLines,
      telemetrySnapshot,
    };
  });
}

function containsProgressMetric(observedMetrics: Map<string, number>): boolean {
  const progressSignals = [
    "score",
    "level",
    "sector",
    "segment",
    "distance",
    "worldAge",
    "checkpoint",
    "floor",
  ];

  for (const [key, value] of observedMetrics.entries()) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const normalized = key.toLowerCase();
    if (progressSignals.some((signal) => normalized.includes(signal))) {
      return true;
    }
  }

  return false;
}

function buildConsistencyVerdict(input: {
  mode: MasteryEvidenceMode;
  contract: ReturnType<typeof getMasteryContract>;
  frames: MasteryEvidenceFrame[];
  observedMetrics: Map<string, number>;
  syntheticSignals: string[];
  controlAxes: Set<string>;
}): MasteryConsistencyVerdict {
  const reasons: string[] = [];
  const mismatchDetails: string[] = [];
  const truthChecks = input.contract.gateV2.truthChecks;

  if (input.mode === "off") {
    return {
      status: "insufficient",
      checkedAt: nowIso(),
      reasons: ["evidence_mode_off"],
      mismatchDetails: [],
    };
  }

  const requiredTypes = new Set(truthChecks.requireFrameTypes);
  const presentTypes = new Set(input.frames.map((frame) => frame.frameType));
  for (const frameType of requiredTypes) {
    if (!presentTypes.has(frameType)) {
      reasons.push("missing_required_frame_type");
      mismatchDetails.push(`frame_type_missing:${frameType}`);
    }
  }

  if (input.frames.length === 0) {
    reasons.push("missing_evidence_frames");
    mismatchDetails.push("frames:0");
  }

  if (truthChecks.failOnStaticFramesWithProgress) {
    const uniqueHashes = new Set(input.frames.map((frame) => frame.hash));
    if (uniqueHashes.size <= 1 && containsProgressMetric(input.observedMetrics)) {
      reasons.push("static_frames_with_progress");
      mismatchDetails.push("hash_variance<=1_with_progress_metrics");
    }
  }

  if (truthChecks.failOnMenuAdvance) {
    const statuses = input.frames
      .map((frame) => {
        const status = frame.telemetrySnapshot.status;
        return typeof status === "string" ? status.trim().toUpperCase() : "";
      })
      .filter((entry) => entry.length > 0);
    const allMenuOrPaused =
      statuses.length > 0 &&
      statuses.every((entry) => entry === "MENU" || entry === "PAUSED" || entry === "LOADING");
    if (allMenuOrPaused && containsProgressMetric(input.observedMetrics)) {
      reasons.push("menu_or_pause_persisted_during_progress");
      mismatchDetails.push(`status_sequence:${statuses.join(",")}`);
    }
  }

  if (truthChecks.failOnTelemetryFrameMismatch) {
    const progressFrames = input.frames.filter((frame) => frame.frameType === "progress");
    if (progressFrames.length === 0 && containsProgressMetric(input.observedMetrics)) {
      reasons.push("telemetry_progress_without_progress_frames");
      mismatchDetails.push("no_progress_frames_but_progress_metrics");
    }
  }

  const requiredAxes = truthChecks.requiredControlAxes ?? [];
  for (const axis of requiredAxes) {
    if (!input.controlAxes.has(axis)) {
      reasons.push("missing_required_control_axis");
      mismatchDetails.push(`control_axis_missing:${axis}`);
    }
  }

  if (
    input.contract.gateV2.disallowedEvidence.includes("synthetic") &&
    input.syntheticSignals.length > 0
  ) {
    reasons.push("synthetic_evidence_detected");
    mismatchDetails.push(...input.syntheticSignals.map((entry) => `synthetic:${entry}`));
  }

  if (reasons.length === 0) {
    return {
      status: "pass",
      checkedAt: nowIso(),
      reasons: ["consistency_passed"],
      mismatchDetails: [],
    };
  }

  return {
    status: "fail",
    checkedAt: nowIso(),
    reasons,
    mismatchDetails,
  };
}

function evaluateLevelRequirement(
  contract: ReturnType<typeof getMasteryContract>,
  observedMetrics: Map<string, number>,
): MasteryGateResult | null {
  const requirement = contract.gateV2.levelRequirement;
  if (!requirement) return null;

  const observed = computeObservedMetric(requirement.metric, true, observedMetrics);
  const op: MasteryMetricOperator = requirement.mode === "at_most" ? "<=" : ">=";
  const threshold = requirement.requiredLevel;
  const result = evaluateGate(
    {
      id: "level_requirement",
      metric: requirement.metric,
      operator: op,
      threshold,
      source: "runtime-native",
    },
    observed,
  );
  return result;
}

function evaluateQualityRequirements(
  contract: ReturnType<typeof getMasteryContract>,
  observedMetrics: Map<string, number>,
): MasteryGateResult[] {
  const requirement = contract.gateV2.qualityRequirement;
  if (!requirement) return [];
  const out: MasteryGateResult[] = [];

  if (
    requirement.medianClearTimeMetric &&
    Number.isFinite(requirement.goldenLevelTimeMs) &&
    Number.isFinite(requirement.maxMedianClearTimeFactor)
  ) {
    const threshold =
      (requirement.goldenLevelTimeMs as number) *
      (requirement.maxMedianClearTimeFactor as number);
    out.push(
      evaluateGate(
        {
          id: "quality_median_clear_time",
          metric: requirement.medianClearTimeMetric,
          operator: "<=",
          threshold,
          source: "runtime-native",
        },
        computeObservedMetric(requirement.medianClearTimeMetric, true, observedMetrics),
      ),
    );
  }

  if (
    requirement.medianScoreMetric &&
    Number.isFinite(requirement.goldenLevelScore) &&
    Number.isFinite(requirement.minMedianScoreFactor)
  ) {
    const threshold =
      (requirement.goldenLevelScore as number) *
      (requirement.minMedianScoreFactor as number);
    out.push(
      evaluateGate(
        {
          id: "quality_median_score",
          metric: requirement.medianScoreMetric,
          operator: ">=",
          threshold,
          source: "runtime-native",
        },
        computeObservedMetric(requirement.medianScoreMetric, true, observedMetrics),
      ),
    );
  }

  return out;
}

function buildEpisodeVerdict(input: {
  evidenceMode: MasteryEvidenceMode;
  strict: boolean;
  succeeded: boolean;
  error: string | null;
  gameId: string;
  runId: string;
  episodeId: string;
  playEnvelope: Record<string, unknown>;
}): {
  verdict: MasteryVerdict;
  evidence: MasteryEpisodeEvidence;
  observedMetrics: Record<string, number>;
} {
  const contract = getMasteryContract(input.gameId);
  const observedBundle = collectObservedMetrics(input.playEnvelope);
  const runtimeGates = buildGateSet(contract);
  const runtimeGateResults = runtimeGates
    .filter((gate) => gate.required !== false)
    .map((gate) =>
      evaluateGate(
        gate,
        computeObservedMetric(gate.metric, input.succeeded, observedBundle.numeric),
      ),
    );

  const levelResult = evaluateLevelRequirement(contract, observedBundle.numeric);
  const qualityResults = evaluateQualityRequirements(contract, observedBundle.numeric);

  const frames = extractEvidenceFrames({
    runId: input.runId,
    episodeId: input.episodeId,
    playEnvelope: input.playEnvelope,
  });
  const consistency = buildConsistencyVerdict({
    mode: input.evidenceMode,
    contract,
    frames,
    observedMetrics: observedBundle.numeric,
    syntheticSignals: observedBundle.syntheticSignals,
    controlAxes: observedBundle.controlAxes,
  });

  const gateResults = [
    ...runtimeGateResults,
    ...(levelResult ? [levelResult] : []),
    ...qualityResults,
  ];
  const runtimeQualified = input.succeeded && gateResults.every((entry) => entry.passed);
  const visualQualified = consistency.status === "pass";
  const outcome: MasteryEpisodeOutcomeV2 = {
    runtimeQualified,
    visualQualified,
    finalQualified: runtimeQualified && visualQualified,
    failureCode:
      runtimeQualified && visualQualified
        ? null
        : !input.succeeded
          ? "action_execution_failed"
          : !runtimeQualified
            ? "runtime_gate_failed"
            : "visual_consistency_failed",
  };

  const reasons: string[] = [];
  if (!input.succeeded) reasons.push(input.error ?? "execute_plan_failed");
  for (const gate of gateResults) {
    if (!gate.passed) reasons.push(`gate_failed:${gate.gateId}`);
  }
  if (!visualQualified) {
    reasons.push(...consistency.reasons.map((entry) => `consistency:${entry}`));
  }
  if (reasons.length === 0) reasons.push("all_gates_passed");

  const evidence: MasteryEpisodeEvidence = {
    frames,
    consistency,
    syntheticSignals: observedBundle.syntheticSignals,
  };

  const observedMetrics: Record<string, number> = {};
  for (const [key, value] of observedBundle.numeric.entries()) {
    observedMetrics[key] = value;
  }

  const verdict: MasteryVerdict = {
    passed: outcome.finalQualified,
    confidence: outcome.finalQualified ? 0.95 : input.succeeded ? 0.35 : 0.15,
    reasons,
    gateResults,
    outcome,
    consistency,
  };

  return {
    verdict,
    evidence,
    observedMetrics,
  };
}

async function executePlan(
  baseUrl: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
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

  private async log(
    runId: string,
    level: Five55MasteryLog["level"],
    message: string,
    ctx?: {
      stage?: string;
      gameId?: string;
      episodeId?: string;
    },
  ): Promise<void> {
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
    const deferredGames: string[] = [];
    const activeGames: string[] = [];

    for (const gameId of orderedGames) {
      const contract = getMasteryContract(gameId);
      if (contract.gateV2.status === "DEFERRED_MULTIPLAYER") {
        deferredGames.push(gameId);
      } else {
        activeGames.push(gameId);
      }
    }

    const totalEpisodes = activeGames.length * request.episodesPerGame;

    const run: Five55MasteryRun = {
      runId: buildRunId(request.suiteId),
      suiteId: request.suiteId,
      status: "queued",
      strict: true,
      verificationStatus: "verified",
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
        deferredGames,
        evaluatedGames: 0,
        denominatorGames: activeGames.length,
        gamePassRate: 0,
      },
      error: null,
    };

    await writeMasteryRun(run);
    await this.log(run.runId, "info", `Mastery run queued (${run.runId})`, {
      stage: "queued",
    });

    void this.execute(run, request, activeGames, deferredGames).catch(async (err) => {
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
    const run = await readMasteryRun(runId);
    if (!run) return null;
    if (run.verificationStatus !== "verified") {
      return {
        ...run,
        verificationStatus: "UNVERIFIED_LEGACY",
      };
    }
    return run;
  }

  private async execute(
    run: Five55MasteryRun,
    request: MasteryCertificationRequest,
    activeGames: string[],
    deferredGames: string[],
  ): Promise<void> {
    this.activeRuns.add(run.runId);
    const baseUrl = resolveLocalApiBase();
    const startedMs = Date.now();

    run.status = "running";
    run.startedAt = nowIso();
    await writeMasteryRun(run);
    await this.log(run.runId, "info", "Mastery run started", { stage: "running" });

    for (const deferredGame of deferredGames) {
      await this.log(
        run.runId,
        "info",
        `Game deferred from strict denominator: ${deferredGame}`,
        {
          stage: "deferred",
          gameId: deferredGame,
        },
      );
    }

    const perGamePass = new Map<string, { pass: number; fail: number }>();
    for (const gameId of activeGames) {
      perGamePass.set(gameId, { pass: 0, fail: 0 });
    }

    let globalEpisodeIndex = 0;
    for (const gameId of activeGames) {
      const canonicalGameId = canonicalizeMasteryGameId(gameId);
      const contract = getMasteryContract(canonicalGameId);
      for (
        let episodeIndex = 1;
        episodeIndex <= run.episodesPerGame;
        episodeIndex += 1
      ) {
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
                    evidenceMode: request.evidenceMode,
                    masteryProfile: {
                      suiteId: run.suiteId,
                      runId: run.runId,
                      gameId: canonicalGameId,
                      episodeIndex,
                      episodeId,
                      seed,
                      strict: true,
                      evidenceMode: request.evidenceMode,
                      contractVersion: contract.contractVersion,
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

        const assessment = buildEpisodeVerdict({
          evidenceMode: request.evidenceMode,
          strict: true,
          succeeded: actionOk,
          error: actionError,
          gameId: canonicalGameId,
          runId: run.runId,
          episodeId,
          playEnvelope,
        });
        const verdict = assessment.verdict;

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
          evidence: assessment.evidence,
          metadata: {
            objective: contract.objective.summary,
            controls: contract.controls,
            observedMetrics: assessment.observedMetrics,
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
          latestOutcome: verdict.outcome,
          latestConsistency: verdict.consistency,
          objective: contract.objective,
          controls: contract.controls,
          riskFlags: verdict.reasons,
        });

        await this.recomputeRunSummary(run, perGamePass, deferredGames);
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
          await this.recomputeRunSummary(run, perGamePass, deferredGames);
          await writeMasteryRun(run);
          this.activeRuns.delete(run.runId);
          return;
        }
      }
    }

    run.status = run.progress.failedEpisodes > 0 ? "failed" : "success";
    run.finishedAt = nowIso();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    await this.recomputeRunSummary(run, perGamePass, deferredGames);
    await writeMasteryRun(run);
    await this.log(
      run.runId,
      run.status === "success" ? "info" : "warn",
      `Mastery run ${run.status}`,
      {
        stage: "complete",
      },
    );

    this.activeRuns.delete(run.runId);
  }

  private async recomputeRunSummary(
    run: Five55MasteryRun,
    perGamePass: Map<string, { pass: number; fail: number }>,
    deferredGames: string[],
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

    const denominatorGames = Math.max(0, run.games.length - deferredGames.length);

    run.summary = {
      passedGames: passedGames.sort(),
      failedGames: failedGames.sort(),
      deferredGames: [...deferredGames].sort(),
      evaluatedGames: passedGames.length + failedGames.length,
      denominatorGames,
      gamePassRate:
        denominatorGames > 0
          ? Number((passedGames.length / denominatorGames).toFixed(4))
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
