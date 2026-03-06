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
// Learning trace dataset schema
export {
  type LearningTraceDataset,
  LearningTraceDatasetSchema,
  type LearningTraceExample,
  LearningTraceExampleSchema,
  parseLearningTraceDataset,
  type TraceLabel,
  TraceLabelSchema,
} from "./dataset-schema.js";
// Dataset splitting pipeline
export {
  type AdversarialSplitOptions,
  type AdversarialSplitResult,
  buildAdversarialSplit,
  buildHeldOutValidationSplit,
  type HeldOutSplitOptions,
  type HeldOutSplitResult,
} from "./dataset-splits.js";
// De-identification pipeline
export {
  type DeidentificationOptions,
  Deidentifier,
  deidentifyEpisodes,
  deidentifyExamples,
} from "./deidentification.js";
// Learning trace dataset extraction from event logs
export {
  type EventLogEntry,
  type ExtractDatasetOptions,
  extractLearningTraceDatasetFromEvents,
} from "./event-log-extractor.js";
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
  type PromptRole,
  type PromptVariant,
  SystemPromptBuilder,
} from "./prompt-builder.js";
// Prompt variant evaluator
export {
  evaluatePromptVariantsOnHeldOutScenarios,
  type HeldOutScenarioOptions,
  type PromptVariantEvaluationOptions,
  type PromptVariantEvaluationResult,
  type PromptVariantScenarioScore,
  type PromptVariantScore,
  selectHeldOutScenarios,
} from "./prompt-variant-evaluator.js";
// Quality filtering pipeline
export {
  applyQualityFilters,
  DEFAULT_QUALITY_FILTER_CONFIG,
  type QualityFilterConfig,
  type QualityFilterDrop,
  type QualityFilterResult,
} from "./quality-filters.js";
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
export {
  FileCheckpointRegistry,
  InMemoryCheckpointRegistry,
  type ModelCheckpoint,
  ModelCheckpointSchema,
  type RollbackPlan,
} from "./training/checkpoint-registry.js";
// RLVR training dataset helpers
export {
  fromLearningTraceDataset,
  parseRLVRTrainingDataset,
  type RLVRTrainingDataset,
  RLVRTrainingDatasetSchema,
  type RLVRTrainingExample,
  RLVRTrainingExampleSchema,
} from "./training/dataset.js";
// Training environment + orchestration
export {
  type BuildTrainingEnvironmentInput,
  buildTrainingEnvironmentManifest,
  computeTrainingEnvironmentFingerprint,
  createTrainingEnvironmentConfig,
  DEFAULT_HYPERPARAM_SPACE,
  DEFAULT_RLVR_CONFIG,
  type TrainingEnvironmentConfig,
} from "./training/environment.js";
// Experiment tracking + checkpoint registry
export {
  type ArtifactKind,
  ArtifactKindSchema,
  type ExperimentArtifact,
  ExperimentArtifactSchema,
  type ExperimentRun,
  ExperimentRunSchema,
  type ExperimentStatus,
  ExperimentStatusSchema,
  FileExperimentRegistry,
  InMemoryExperimentRegistry,
} from "./training/experiment-registry.js";
export {
  GridSearchTuner,
  type HyperparamSpace,
  type ObjectiveFunction,
  type TrialResult,
  type TuningResult,
} from "./training/hyperparam-tuner.js";
export {
  TrainingJobOrchestrator,
  type TrainingJobResult,
} from "./training/job-orchestrator.js";
// RLVR loop + hyperparameter tuning
export {
  ExternalRLVRLoop,
  type RLVRConfig,
  type RLVRLoop,
  StubRLVRLoop,
  type TrainingResult,
} from "./training/rlvr-loop.js";
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
