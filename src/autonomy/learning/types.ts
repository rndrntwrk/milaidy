/**
 * Phase 4 — Reliability-Oriented Learning & Reward Shaping types.
 *
 * Defines training data, reward signals, prompt templates, and model
 * provider interfaces for the learning infrastructure layer.
 *
 * @module autonomy/learning/types
 */

import type { ToolCallSource } from "../tools/types.js";
import type { RewardDimension } from "../types.js";

// ---------- Reward Signal ----------

/**
 * A composite reward signal with per-dimension breakdown.
 */
export interface RewardSignal {
  /** Overall reward (0-1). */
  total: number;
  /** Per-dimension reward breakdown. */
  breakdown: Record<string, number>;
  /** Which dimensions were measured. */
  dimensions: RewardDimension[];
  /** When the reward was computed. */
  computedAt: number;
}

/**
 * Score from a single rewardable post-condition.
 */
export interface RewardScore {
  /** Whether the condition passed (binary). */
  passed: boolean;
  /** Scalar reward (0-1). */
  reward: number;
  /** Human-readable explanation. */
  explanation: string;
}

// ---------- Training Example ----------

/**
 * A single tool call training example with input, output, and reward.
 */
export interface TrainingExample {
  /** Unique example ID. */
  id: string;
  /** The tool that was executed. */
  toolName: string;
  /** Input to the tool. */
  input: {
    params: Record<string, unknown>;
    source: ToolCallSource;
  };
  /** Output from the tool. */
  output: {
    result: unknown;
    durationMs: number;
  };
  /** Verification results. */
  verification: {
    passed: boolean;
    checks: Array<{ id: string; passed: boolean; severity: string }>;
  };
  /** Computed reward signal. */
  reward: RewardSignal;
  /** Tracing metadata. */
  metadata: {
    agentId: string;
    requestId: string;
    timestamp: number;
  };
}

// ---------- Episode ----------

/**
 * A full orchestrated lifecycle — one plan→execute→verify→audit cycle.
 */
export interface Episode {
  /** Unique episode ID. */
  id: string;
  /** Human-readable description of the request. */
  description: string;
  /** Individual tool call steps. */
  steps: TrainingExample[];
  /** Number of steps in the original plan. */
  planSteps: number;
  /** Aggregate reward for the entire episode. */
  totalReward: RewardSignal;
  /** Drift score from the audit report (0-1, lower is better). */
  driftScore: number;
  /** Anomalies detected during the audit. */
  auditAnomalies: string[];
  /** Total episode duration in milliseconds. */
  durationMs: number;
  /** Whether the orchestrated request succeeded. */
  success: boolean;
  /** When the episode completed. */
  completedAt: number;
}

// ---------- Dataset ----------

/**
 * A collection of episodes labeled for training.
 */
export interface TrainingDataset {
  /** Dataset format version. */
  version: string;
  /** Label for this dataset (e.g., "pre-sft", "post-rlvr-v1"). */
  label: string;
  /** The episodes in this dataset. */
  episodes: Episode[];
  /** Aggregate statistics. */
  statistics: DatasetStatistics;
  /** When the dataset was created. */
  createdAt: number;
}

/**
 * Aggregate statistics for a training dataset.
 */
export interface DatasetStatistics {
  /** Total number of episodes. */
  episodeCount: number;
  /** Total number of individual tool call steps. */
  totalSteps: number;
  /** Mean episode reward. */
  meanReward: number;
  /** Mean drift score across episodes. */
  meanDrift: number;
  /** Fraction of episodes that succeeded. */
  successRate: number;
  /** Mean episode duration in milliseconds. */
  meanDurationMs: number;
}

// ---------- Prompt Template ----------

/**
 * A reusable prompt template with variable interpolation.
 */
export interface PromptTemplate {
  /** Unique template ID. */
  id: string;
  /** The system prompt text. */
  systemPrompt: string;
  /** User message template with {{variable}} placeholders. */
  userTemplate: string;
  /** List of expected variables for interpolation. */
  variables: string[];
  /** Whether chain-of-thought reasoning is enabled. */
  cotEnabled: boolean;
  /** Template version for tracking changes. */
  version: number;
}

// ---------- Prompt Builder Options ----------

/**
 * Options for system prompt construction.
 */
export interface PromptOptions {
  /** Enable chain-of-thought instructions (default: true). */
  cotEnabled?: boolean;
  /** Include tool reasoning instructions (default: true). */
  includeToolInstructions?: boolean;
  /** Add truthfulness reminder to mitigate sycophancy (default: true). */
  truthfulnessReminder?: boolean;
  /** Prompt-constraint variant used for A/B testing. */
  variant?: "baseline" | "truth-first" | "tool-safety-first";
  /** Maximum prompt length in characters. */
  maxLength?: number;
}

/**
 * Runtime context injected into prompts.
 */
export interface TaskContext {
  /** Currently active goals. */
  currentGoals?: string[];
  /** Recent tool execution results. */
  recentToolResults?: Array<{ tool: string; success: boolean }>;
  /** Drift warning message if drift is detected. */
  driftWarning?: string;
  /** Whether the kernel is in safe mode. */
  safeMode?: boolean;
}

// ---------- Model Provider ----------

/**
 * Interface for LLM model providers (completion + scoring).
 */
export interface ModelProvider {
  /** Generate a completion from a prompt. */
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  /** Score a response against a rubric. */
  score(request: ScoringRequest): Promise<ScoringResponse>;
}

/**
 * Request for a text completion.
 */
export interface CompletionRequest {
  /** System prompt setting context. */
  systemPrompt: string;
  /** User prompt with the actual request. */
  userPrompt: string;
  /** Sampling temperature (0-2, default: 0.7). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Stop sequences to halt generation. */
  stopSequences?: string[];
}

/**
 * Response from a text completion.
 */
export interface CompletionResponse {
  /** Generated text. */
  text: string;
  /** Number of tokens in the response. */
  tokenCount: number;
  /** Time taken for the completion in milliseconds. */
  durationMs: number;
  /** Model identifier used. */
  model: string;
}

/**
 * Request to score a response against a rubric.
 */
export interface ScoringRequest {
  /** The original prompt that produced the response. */
  prompt: string;
  /** The response to evaluate. */
  response: string;
  /** Evaluation rubric describing expected behavior. */
  rubric: string;
  /** Dimensions to score on. */
  dimensions: string[];
}

/**
 * Response from scoring a completion.
 */
export interface ScoringResponse {
  /** Overall score (0-1). */
  overallScore: number;
  /** Per-dimension scores (0-1 each). */
  dimensionScores: Record<string, number>;
  /** Explanation of the scoring. */
  explanation: string;
  /** Model identifier used for scoring. */
  model: string;
}

// ---------- Model Provider Config ----------

/**
 * Configuration for an HTTP-based model provider.
 */
export interface ModelProviderConfig {
  /** Base URL of the model API. */
  baseUrl: string;
  /** API key for authentication. */
  apiKey?: string;
  /** Model identifier to use. */
  model: string;
  /** Default sampling temperature. */
  defaultTemperature?: number;
  /** Default maximum tokens. */
  defaultMaxTokens?: number;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

// ---------- Hack Detection ----------

/**
 * Types of reward hacking signals.
 */
export type HackSignalType =
  | "superficial_pass"
  | "step_inflation"
  | "trust_gaming"
  | "verification_aware";

/**
 * A single detected reward hacking signal.
 */
export interface HackSignal {
  /** Type of hack detected. */
  type: HackSignalType;
  /** How severe the signal is. */
  severity: "low" | "medium" | "high";
  /** Evidence supporting the detection. */
  evidence: string;
}

/**
 * Report from reward hacking analysis of an episode.
 */
export interface HackDetectionReport {
  /** The episode that was analyzed. */
  episodeId: string;
  /** Detected hacking signals. */
  signals: HackSignal[];
  /** Overall hack likelihood (0-1). */
  hackLikelihood: number;
  /** Human-readable detail strings. */
  details: string[];
}

// ---------- Rollout Collection ----------

/**
 * A collected episode with hack analysis.
 */
export interface CollectedEpisode {
  /** The collected episode. */
  episode: Episode;
  /** Hack detection report. */
  hackReport: HackDetectionReport;
  /** Whether this episode is suitable for training. */
  usableForTraining: boolean;
}

/**
 * Result of a checkpoint quality gate evaluation.
 */
export interface GateResult {
  /** Whether the gate passed. */
  passed: boolean;
  /** Metrics that improved. */
  improvements: string[];
  /** Metrics that regressed. */
  regressions: string[];
  /** Full delta details. */
  details: import("../metrics/types.js").MetricsDelta;
}
