/**
 * Local workflow engine — in-process orchestration using the existing pipeline.
 *
 * @module autonomy/adapters/workflow/local-engine
 */

import type { WorkflowEngine, WorkflowDefinition, WorkflowResult } from "./types.js";

/**
 * In-process workflow engine. Executes workflows sequentially as
 * async function calls. This is the default when no external workflow
 * engine (Temporal, etc.) is configured.
 */
export class LocalWorkflowEngine implements WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly results = new Map<string, WorkflowResult>();
  private executionCounter = 0;

  register(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
  }

  async execute(workflowId: string, input: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      const result: WorkflowResult = {
        executionId: this.nextId(),
        success: false,
        error: `Workflow '${workflowId}' not registered`,
        durationMs: 0,
      };
      this.results.set(result.executionId, result);
      return result;
    }

    const executionId = this.nextId();
    const start = Date.now();

    try {
      // Execute steps sequentially. Each step is expected to be
      // a function or an object with an execute() method.
      let output: unknown = input;
      for (const step of workflow.steps) {
        if (typeof step === "function") {
          output = await step(output);
        } else if (step && typeof step === "object" && "execute" in step) {
          output = await (step as { execute: (input: unknown) => Promise<unknown> }).execute(output);
        }
      }

      const result: WorkflowResult = {
        executionId,
        success: true,
        output,
        durationMs: Date.now() - start,
      };
      this.results.set(executionId, result);
      return result;
    } catch (err) {
      const result: WorkflowResult = {
        executionId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      this.results.set(executionId, result);
      return result;
    }
  }

  async getStatus(executionId: string): Promise<WorkflowResult | undefined> {
    return this.results.get(executionId);
  }

  listWorkflows(): string[] {
    return [...this.workflows.keys()];
  }

  async close(): Promise<void> {
    this.workflows.clear();
    this.results.clear();
  }

  private nextId(): string {
    return `local-${++this.executionCounter}`;
  }
}
