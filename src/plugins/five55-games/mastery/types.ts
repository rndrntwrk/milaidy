import type { JsonRecord } from "../intelligence/types.js";

export type MasteryLifecycleState =
  | "LOADING"
  | "MENU"
  | "PLAYING"
  | "PAUSED"
  | "GAME_OVER"
  | "WIN"
  | "UNKNOWN";

export type MasteryRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "canceled";

export type MasteryEpisodeStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "canceled";

export type MasteryMetricOperator = ">=" | "<=" | "==" | "!=";

export type MasteryLogLevel = "info" | "warn" | "error";

export interface MasteryObjective {
  summary: string;
  winCondition: string;
  masteryDefinition: string;
}

export interface MasteryControl {
  action: string;
  input: string;
  note?: string;
}

export interface MasteryProgressionNode {
  id: string;
  label: string;
  description: string;
  successSignal: string;
  failureSignals: string[];
}

export interface MasteryRisk {
  id: string;
  label: string;
  symptom: string;
  mitigation: string;
}

export interface MasteryPassGate {
  id: string;
  metric: string;
  operator: MasteryMetricOperator;
  threshold: number;
  description: string;
}

export interface MasteryGateResult {
  gateId: string;
  metric: string;
  operator: MasteryMetricOperator;
  threshold: number;
  observed: number | null;
  passed: boolean;
  reason: string;
}

export interface MasteryVerdict {
  passed: boolean;
  confidence: number;
  reasons: string[];
  gateResults: MasteryGateResult[];
}

export interface MasteryRecoveryPolicy {
  menu: string;
  paused: string;
  gameOver: string;
  stuck: string;
}

export interface MasteryPolicyBounds {
  min: number;
  max: number;
  kind: "float" | "int";
}

export interface MasteryPolicyProfile {
  family: string;
  defaults: JsonRecord;
  bounds: Record<string, MasteryPolicyBounds>;
}

export interface Five55MasteryContract {
  gameId: string;
  aliases: string[];
  title: string;
  objective: MasteryObjective;
  controls: MasteryControl[];
  progression: MasteryProgressionNode[];
  risks: MasteryRisk[];
  passGates: MasteryPassGate[];
  recovery: MasteryRecoveryPolicy;
  policy: MasteryPolicyProfile;
  notes?: string[];
}

export interface MasteryProfileEnvelope {
  suiteId: string;
  runId: string;
  gameId: string;
  episodeIndex: number;
  episodeId: string;
  seed: number;
  strict: boolean;
  contractVersion: number;
}

export interface Five55MasteryRun {
  runId: string;
  suiteId: string;
  status: MasteryRunStatus;
  strict: boolean;
  seedMode: "fixed" | "mixed" | "rolling";
  maxDurationSec: number;
  episodesPerGame: number;
  games: string[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  progress: {
    totalEpisodes: number;
    completedEpisodes: number;
    passedEpisodes: number;
    failedEpisodes: number;
  };
  summary: {
    passedGames: string[];
    failedGames: string[];
    gamePassRate: number;
  };
  error: string | null;
}

export interface Five55MasteryEpisode {
  runId: string;
  episodeId: string;
  gameId: string;
  gameTitle: string;
  episodeIndex: number;
  seed: number;
  status: MasteryEpisodeStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  actionResult: {
    ok: boolean;
    requestId: string;
    error: string | null;
  };
  verdict: MasteryVerdict;
  metadata: JsonRecord;
}

export interface Five55MasteryLog {
  runId: string;
  seq: number;
  ts: string;
  level: MasteryLogLevel;
  message: string;
  stage?: string;
  gameId?: string;
  episodeId?: string;
}

export interface Five55MasteryGameSnapshot {
  gameId: string;
  updatedAt: string;
  latestRunId: string;
  latestEpisodeId: string;
  latestVerdict: MasteryVerdict;
  latestStatus: MasteryEpisodeStatus;
  objective: MasteryObjective;
  controls: MasteryControl[];
  riskFlags: string[];
}

export interface Five55MasteryRunsPage {
  runs: Five55MasteryRun[];
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  total: number;
}

export interface MasteryCertificationRequest {
  suiteId: string;
  games: string[];
  episodesPerGame: number;
  seedMode: "fixed" | "mixed" | "rolling";
  maxDurationSec: number;
  strict: boolean;
}
