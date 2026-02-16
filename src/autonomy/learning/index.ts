/**
 * Learning infrastructure barrel exports (Phase 4).
 *
 * @module autonomy/learning
 */

// Adversarial scenario generation
export {
  AdversarialScenarioGenerator,
  INJECTION_SEEDS,
  MANIPULATION_SEEDS,
  REWARD_GAMING_SEEDS,
} from "./adversarial.js";
// Hack detection
export {
  createHackDetectionInvariants,
  HackDetector,
} from "./hack-detection.js";
// LLM-judge evaluator
export { LLMJudgeEvaluator } from "./llm-judge-evaluator.js";
// Model providers
export { HttpModelProvider, StubModelProvider } from "./model-provider.js";
// Prompt builder
export { SystemPromptBuilder } from "./prompt-builder.js";
// Reward
export {
  CheckpointReward,
  EpisodeReward,
  RewardAggregator,
  type RewardablePostCondition,
} from "./reward.js";
// Rollout collection & checkpoint management
export { CheckpointManager, RolloutCollector } from "./rollout.js";
// Trace collector & exporter
export { DatasetExporter, TraceCollector } from "./trace-collector.js";
// Types
export type {
  CollectedEpisode,
  CompletionRequest,
  CompletionResponse,
  DatasetStatistics,
  Episode,
  GateResult,
  HackDetectionReport,
  HackSignal,
  HackSignalType,
  ModelProvider,
  ModelProviderConfig,
  PromptOptions,
  PromptTemplate,
  RewardScore,
  RewardSignal,
  ScoringRequest,
  ScoringResponse,
  TaskContext,
  TrainingDataset,
  TrainingExample,
} from "./types.js";
