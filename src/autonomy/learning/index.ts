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
export {
  SystemPromptBuilder,
  type PromptRole,
  type PromptVariant,
} from "./prompt-builder.js";
// Prompt variant evaluator
export {
  evaluatePromptVariantsOnHeldOutScenarios,
  selectHeldOutScenarios,
  type PromptVariantEvaluationOptions,
  type PromptVariantEvaluationResult,
  type PromptVariantScenarioScore,
  type PromptVariantScore,
  type HeldOutScenarioOptions,
} from "./prompt-variant-evaluator.js";
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
// De-identification pipeline
export {
  Deidentifier,
  deidentifyEpisodes,
  deidentifyExamples,
  type DeidentificationOptions,
} from "./deidentification.js";
// Quality filtering pipeline
export {
  applyQualityFilters,
  DEFAULT_QUALITY_FILTER_CONFIG,
  type QualityFilterConfig,
  type QualityFilterDrop,
  type QualityFilterResult,
} from "./quality-filters.js";
// Dataset splitting pipeline
export {
  buildHeldOutValidationSplit,
  buildAdversarialSplit,
  type HeldOutSplitOptions,
  type HeldOutSplitResult,
  type AdversarialSplitOptions,
  type AdversarialSplitResult,
} from "./dataset-splits.js";
// Learning trace dataset schema
export {
  parseLearningTraceDataset,
  LearningTraceDatasetSchema,
  LearningTraceExampleSchema,
  TraceLabelSchema,
  type LearningTraceDataset,
  type LearningTraceExample,
  type TraceLabel,
} from "./dataset-schema.js";
// Learning trace dataset extraction from event logs
export {
  extractLearningTraceDatasetFromEvents,
  type EventLogEntry,
  type ExtractDatasetOptions,
} from "./event-log-extractor.js";
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
