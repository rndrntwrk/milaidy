/**
 * Learning infrastructure barrel exports (Phase 4).
 *
 * @module autonomy/learning
 */

// Types
export type {
  RewardSignal,
  RewardScore,
  TrainingExample,
  Episode,
  TrainingDataset,
  DatasetStatistics,
  PromptTemplate,
  PromptOptions,
  TaskContext,
  ModelProvider,
  CompletionRequest,
  CompletionResponse,
  ScoringRequest,
  ScoringResponse,
  ModelProviderConfig,
  HackSignalType,
  HackSignal,
  HackDetectionReport,
  CollectedEpisode,
  GateResult,
} from "./types.js";

// Reward
export {
  RewardAggregator,
  CheckpointReward,
  EpisodeReward,
  type RewardablePostCondition,
} from "./reward.js";

// Trace collector & exporter
export { TraceCollector, DatasetExporter } from "./trace-collector.js";

// Prompt builder
export { SystemPromptBuilder } from "./prompt-builder.js";

// Model providers
export { StubModelProvider, HttpModelProvider } from "./model-provider.js";

// LLM-judge evaluator
export { LLMJudgeEvaluator } from "./llm-judge-evaluator.js";

// Adversarial scenario generation
export {
  AdversarialScenarioGenerator,
  INJECTION_SEEDS,
  MANIPULATION_SEEDS,
  REWARD_GAMING_SEEDS,
} from "./adversarial.js";

// Hack detection
export {
  HackDetector,
  createHackDetectionInvariants,
} from "./hack-detection.js";

// Rollout collection & checkpoint management
export { RolloutCollector, CheckpointManager } from "./rollout.js";
