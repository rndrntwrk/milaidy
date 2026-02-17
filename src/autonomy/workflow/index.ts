/**
 * Workflow engine barrel exports.
 * @module autonomy/workflow
 */

export { CompensationRegistry } from "./compensation-registry.js";
export { CompensationIncidentManager } from "./compensation-incidents.js";
export {
  BUILTIN_COMPENSATION_ELIGIBILITY,
  listBuiltinCompensationEligibility,
  listBuiltinCompensationTools,
  registerBuiltinCompensations,
} from "./compensations/index.js";
export { InMemoryEventStore } from "./event-store.js";
export { computeEventHash, verifyEventChain } from "./event-integrity.js";
export {
  rebuildAllRequestProjections,
  rebuildRequestProjection,
} from "./event-projections.js";
export { ToolExecutionPipeline } from "./execution-pipeline.js";
export type {
  CompensationContext,
  CompensationIncident,
  CompensationIncidentManagerInterface,
  CompensationIncidentReason,
  CompensationIncidentStatus,
  CompensationFn,
  CompensationRegistryInterface,
  EventStoreInterface,
  ExecutionEvent,
  ExecutionEventType,
  PipelineConfig,
  PipelineResult,
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "./types.js";
export type {
  EventChainVerification,
  EventHashInput,
} from "./event-integrity.js";
export type { CompensationEligibility } from "./compensations/eligibility.js";
export type {
  RequestProjection,
  RequestProjectionStatus,
} from "./event-projections.js";
