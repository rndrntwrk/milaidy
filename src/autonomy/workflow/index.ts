/**
 * Workflow engine barrel exports.
 * @module autonomy/workflow
 */

export { CompensationIncidentManager } from "./compensation-incidents.js";
export { CompensationRegistry } from "./compensation-registry.js";
export type { CompensationEligibility } from "./compensations/eligibility.js";
export {
  BUILTIN_COMPENSATION_ELIGIBILITY,
  listBuiltinCompensationEligibility,
  listBuiltinCompensationTools,
  registerBuiltinCompensations,
} from "./compensations/index.js";
export type {
  EventChainVerification,
  EventHashInput,
} from "./event-integrity.js";
export { computeEventHash, verifyEventChain } from "./event-integrity.js";
export type {
  RequestProjection,
  RequestProjectionStatus,
} from "./event-projections.js";
export {
  rebuildAllRequestProjections,
  rebuildRequestProjection,
} from "./event-projections.js";
export { InMemoryEventStore } from "./event-store.js";
export { ToolExecutionPipeline } from "./execution-pipeline.js";
export type {
  CompensationContext,
  CompensationFn,
  CompensationIncident,
  CompensationIncidentManagerInterface,
  CompensationIncidentReason,
  CompensationIncidentStatus,
  CompensationRegistryInterface,
  EventStoreInterface,
  ExecutionEvent,
  ExecutionEventType,
  PipelineConfig,
  PipelineResult,
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "./types.js";
