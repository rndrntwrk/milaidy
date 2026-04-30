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

export type MasteryEvidenceMode = "strict" | "basic" | "off";

export type MasteryEvidenceProvenance =
  | "runtime-native"
  | "synthetic"
  | "derived";

export type MasteryVerificationStatus = "verified" | "UNVERIFIED_LEGACY";

export type MasteryFrameType =
  | "boot/menu"
  | "play-start"
  | "progress"
  | "terminal"
  | "stuck-check";

export type MasteryConsistencyStatus = "pass" | "fail" | "insufficient";

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

export interface MasteryRuntimeGate extends MasteryPassGate {
  required?: boolean;
  source?: MasteryEvidenceProvenance;
}

export interface MasteryLevelRequirement {
  metric: string;
  totalLevels: number;
  requiredLevel: number;
  indexBase: 0 | 1;
  mode: "at_least" | "at_most";
  clearedLevelsMetric?: string;
  minimumClearedLevels?: number;
  temporaryOverride?: boolean;
  temporaryOverrideReason?: string;
}

export interface MasteryQualityRequirement {
  medianClearTimeMetric?: string;
  goldenLevelTimeMs?: number;
  maxMedianClearTimeFactor?: number;
  medianScoreMetric?: string;
  goldenLevelScore?: number;
  minMedianScoreFactor?: number;
}

export interface MasteryTruthChecks {
  requireFrameTypes: MasteryFrameType[];
  stuckCheckIntervalSec: number;
  failOnMenuAdvance: boolean;
  failOnStaticFramesWithProgress: boolean;
  failOnTelemetryFrameMismatch: boolean;
  requiredControlAxes?: string[];
}

export interface MasteryGateV2 {
  runtimeGates: MasteryRuntimeGate[];
  levelRequirement?: MasteryLevelRequirement | null;
  qualityRequirement?: MasteryQualityRequirement | null;
  truthChecks: MasteryTruthChecks;
  disallowedEvidence: string[];
  status: "ACTIVE" | "DEFERRED_MULTIPLAYER";
}

export interface MasteryGateResult {
  gateId: string;
  metric: string;
  operator: MasteryMetricOperator;
  threshold: number;
  observed: number | null;
  passed: boolean;
  reason: string;
  source?: MasteryEvidenceProvenance;
}

export interface MasteryConsistencyVerdict {
  status: MasteryConsistencyStatus;
  checkedAt: string;
  reasons: string[];
  mismatchDetails: string[];
}

export interface MasteryEpisodeOutcomeV2 {
  runtimeQualified: boolean;
  visualQualified: boolean;
  finalQualified: boolean;
  failureCode?: string | null;
}

export interface MasteryEvidenceFrame {
  runId: string;
  episodeId: string;
  seq: number;
  frameType: MasteryFrameType;
  ts: string;
  hash: string;
  path?: string;
  ocr: string[];
  telemetrySnapshot: JsonRecord;
}

export interface MasteryEpisodeEvidence {
  frames: MasteryEvidenceFrame[];
  consistency: MasteryConsistencyVerdict;
  syntheticSignals: string[];
}

export interface MasteryVerdict {
  passed: boolean;
  confidence: number;
  reasons: string[];
  gateResults: MasteryGateResult[];
  outcome: MasteryEpisodeOutcomeV2;
  consistency: MasteryConsistencyVerdict;
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
  contractVersion: number;
  objective: MasteryObjective;
  controls: MasteryControl[];
  progression: MasteryProgressionNode[];
  risks: MasteryRisk[];
  passGates: MasteryPassGate[];
  gateV2: MasteryGateV2;
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
  evidenceMode?: MasteryEvidenceMode;
  contractVersion: number;
}

export interface Five55MasteryRun {
  runId: string;
  suiteId: string;
  status: MasteryRunStatus;
  strict: boolean;
  verificationStatus: MasteryVerificationStatus;
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
    deferredGames: string[];
    evaluatedGames: number;
    denominatorGames: number;
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
  evidence: MasteryEpisodeEvidence;
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
  latestOutcome?: MasteryEpisodeOutcomeV2;
  latestConsistency?: MasteryConsistencyVerdict;
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
  evidenceMode: MasteryEvidenceMode;
}
