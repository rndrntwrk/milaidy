/**
 * Workflow engine barrel exports.
 * @module autonomy/workflow
 */

export { CompensationRegistry } from "./compensation-registry.js";
export { registerBuiltinCompensations } from "./compensations/index.js";
export { InMemoryEventStore } from "./event-store.js";
export { ToolExecutionPipeline } from "./execution-pipeline.js";
export type {
  CompensationContext,
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
