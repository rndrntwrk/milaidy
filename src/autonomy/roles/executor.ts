/**
 * PipelineExecutor — ExecutorRole implementation.
 *
 * Provides an explicit role boundary for execution while delegating
 * execution semantics to the workflow pipeline.
 *
 * @module autonomy/roles/executor
 */

import type { ProposedToolCall } from "../tools/types.js";
import type {
  PipelineResult,
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "../workflow/types.js";
import type { ExecutorRole } from "./types.js";

export class PipelineExecutor implements ExecutorRole {
  constructor(
    private readonly pipeline: ToolExecutionPipelineInterface,
  ) {}

  execute(
    call: ProposedToolCall,
    actionHandler: ToolActionHandler,
  ): Promise<PipelineResult> {
    return this.pipeline.execute(call, actionHandler);
  }
}
