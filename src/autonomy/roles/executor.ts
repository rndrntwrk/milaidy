/**
 * PipelineExecutor — ExecutorRole implementation.
 *
 * Provides an explicit role boundary for execution while delegating
 * execution semantics to the workflow pipeline.
 *
 * @module autonomy/roles/executor
 */

import type { ProposedToolCall } from "../tools/types.js";
import {
  recordRoleExecution,
  recordRoleLatencyMs,
} from "../metrics/prometheus-metrics.js";
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

  async execute(
    call: ProposedToolCall,
    actionHandler: ToolActionHandler,
  ): Promise<PipelineResult> {
    const startedAt = Date.now();
    try {
      const result = await this.pipeline.execute(call, actionHandler);
      recordRoleLatencyMs("executor", Date.now() - startedAt);
      recordRoleExecution("executor", result.success ? "success" : "failure");
      return result;
    } catch (error) {
      recordRoleLatencyMs("executor", Date.now() - startedAt);
      recordRoleExecution("executor", "failure");
      throw error;
    }
  }
}
