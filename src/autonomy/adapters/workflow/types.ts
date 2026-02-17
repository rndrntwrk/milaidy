/**
 * Workflow engine adapter interface — abstracts orchestration backend.
 *
 * @module autonomy/adapters/workflow/types
 */

/** Result of a workflow execution. */
export interface WorkflowResult {
  /** Unique ID for the workflow execution. */
  executionId: string;
  /** Whether the workflow completed successfully. */
  success: boolean;
  /** Output data if successful. */
  output?: unknown;
  /** Error message if failed. */
  error?: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/** Workflow definition. */
export interface WorkflowDefinition {
  /** Unique workflow ID. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Steps to execute (opaque to the adapter). */
  steps: unknown[];
  /** Optional backend-specific hints. */
  temporal?: {
    /** Override workflow type for Temporal (defaults to `id`). */
    workflowType?: string;
    /** Override task queue for Temporal (defaults to engine config). */
    taskQueue?: string;
    /** Override workflow ID for Temporal (defaults to generated ID). */
    workflowId?: string;
  };
}

/** Workflow engine adapter interface. */
export interface WorkflowEngine {
  /** Execute a workflow with the given input. */
  execute(workflowId: string, input: Record<string, unknown>): Promise<WorkflowResult>;
  /** Register a workflow definition. */
  register(definition: WorkflowDefinition): void;
  /** Get the status of a running or completed workflow. */
  getStatus(executionId: string): Promise<WorkflowResult | undefined>;
  /** Cancel a running workflow (if supported by the backend). */
  cancel?(executionId: string): Promise<boolean>;
  /** List registered workflow IDs. */
  listWorkflows(): string[];
  /** Shutdown the engine and release resources. */
  close(): Promise<void>;
}
