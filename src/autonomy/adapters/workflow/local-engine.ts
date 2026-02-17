/**
 * Local workflow engine — in-process orchestration using the existing pipeline.
 *
 * @module autonomy/adapters/workflow/local-engine
 */

import type {
  WorkflowDeadLetter,
  WorkflowEngine,
  WorkflowDefinition,
  WorkflowResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_DEAD_LETTER_MAX = 1_000;

/**
 * In-process workflow engine. Executes workflows sequentially as
 * async function calls. This is the default when no external workflow
 * engine (Temporal, etc.) is configured.
 */
export class LocalWorkflowEngine implements WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly results = new Map<string, WorkflowResult>();
  private readonly deadLetters: WorkflowDeadLetter[] = [];
  private readonly defaultTimeoutMs: number;
  private readonly deadLetterMax: number;
  private executionCounter = 0;

  constructor(options?: { defaultTimeoutMs?: number; deadLetterMax?: number }) {
    this.defaultTimeoutMs = Math.max(
      1,
      Math.floor(options?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS),
    );
    this.deadLetterMax = Math.max(
      1,
      Math.floor(options?.deadLetterMax ?? DEFAULT_DEAD_LETTER_MAX),
    );
  }

  register(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
  }

  async execute(workflowId: string, input: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      const result: WorkflowResult = {
        executionId: this.nextId(),
        workflowId,
        success: false,
        status: "failed",
        error: `Workflow '${workflowId}' not registered`,
        durationMs: 0,
      };
      this.results.set(result.executionId, result);
      return result;
    }

    const executionId = this.nextId();
    const start = Date.now();
    const timeoutMs = this.resolveTimeoutMs(input);

    const execution = this.executeSteps(workflow, input);
    const outcome = await this.withTimeout(execution, timeoutMs);

    if (outcome.type === "timeout") {
      const message = `Workflow '${workflowId}' timed out after ${timeoutMs}ms`;
      const result: WorkflowResult = {
        executionId,
        workflowId,
        success: false,
        status: "timed_out",
        error: message,
        deadLettered: true,
        durationMs: Date.now() - start,
      };
      this.pushDeadLetter({
        executionId,
        workflowId,
        reason: "timeout",
        error: message,
        failedAt: Date.now(),
        timeoutMs,
        input,
      });
      this.results.set(executionId, result);
      return result;
    }

    if (outcome.type === "error") {
      const message =
        outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
      const result: WorkflowResult = {
        executionId,
        workflowId,
        success: false,
        status: "failed",
        error: message,
        deadLettered: true,
        durationMs: Date.now() - start,
      };
      this.pushDeadLetter({
        executionId,
        workflowId,
        reason: "execution_error",
        error: message,
        failedAt: Date.now(),
        timeoutMs,
        input,
      });
      this.results.set(executionId, result);
      return result;
    }

    const result: WorkflowResult = {
      executionId,
      workflowId,
      success: true,
      status: "completed",
      output: outcome.output,
      durationMs: Date.now() - start,
    };
    this.results.set(executionId, result);
    return result;
  }

  async getStatus(executionId: string): Promise<WorkflowResult | undefined> {
    return this.results.get(executionId);
  }

  async cancel(_executionId: string): Promise<boolean> {
    return false;
  }

  async getDeadLetters(): Promise<WorkflowDeadLetter[]> {
    return [...this.deadLetters];
  }

  async clearDeadLetters(): Promise<number> {
    const cleared = this.deadLetters.length;
    this.deadLetters.length = 0;
    return cleared;
  }

  listWorkflows(): string[] {
    return [...this.workflows.keys()];
  }

  async close(): Promise<void> {
    this.workflows.clear();
    this.results.clear();
    this.deadLetters.length = 0;
  }

  private nextId(): string {
    return `local-${++this.executionCounter}`;
  }

  private resolveTimeoutMs(input: Record<string, unknown>): number {
    const value = input.timeoutMs;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    return this.defaultTimeoutMs;
  }

  private async executeSteps(
    workflow: WorkflowDefinition,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    // Execute steps sequentially. Each step is expected to be
    // a function or an object with an execute() method.
    let output: unknown = input;
    for (const step of workflow.steps) {
      if (typeof step === "function") {
        output = await step(output);
      } else if (step && typeof step === "object" && "execute" in step) {
        output = await (
          step as { execute: (stepInput: unknown) => Promise<unknown> }
        ).execute(output);
      }
    }
    return output;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<
    | { type: "ok"; output: T }
    | { type: "error"; error: unknown }
    | { type: "timeout" }
  > {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise
          .then((output) => ({ type: "ok", output }) as const)
          .catch((error) => ({ type: "error", error }) as const),
        new Promise<{ type: "timeout" }>((resolve) => {
          timer = setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private pushDeadLetter(record: WorkflowDeadLetter): void {
    this.deadLetters.push(record);
    if (this.deadLetters.length > this.deadLetterMax) {
      this.deadLetters.splice(0, this.deadLetters.length - this.deadLetterMax);
    }
  }
}
