/**
 * Temporal workflow engine stub — optional external orchestration backend.
 *
 * Requires `@temporalio/client` as an optional peer dependency. If the
 * dependency is not installed, construction throws with a clear message.
 *
 * @module autonomy/adapters/workflow/temporal-engine
 */

import type { WorkflowEngine, WorkflowDefinition, WorkflowResult } from "./types.js";

/** Configuration for Temporal workflow engine. */
export interface TemporalEngineConfig {
  /** Temporal server address. Default: localhost:7233. */
  address?: string;
  /** Temporal namespace. Default: "default". */
  namespace?: string;
  /** Task queue name. Default: "autonomy-tasks". */
  taskQueue?: string;
}

/**
 * Temporal-backed workflow engine stub.
 *
 * This is a structural stub — it defines the contract and will delegate
 * to @temporalio/client when fully implemented. Production usage requires
 * installing @temporalio/client and a running Temporal server.
 */
export class TemporalWorkflowEngine implements WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly config: Required<TemporalEngineConfig>;

  constructor(config: TemporalEngineConfig = {}) {
    this.config = {
      address: config.address ?? "localhost:7233",
      namespace: config.namespace ?? "default",
      taskQueue: config.taskQueue ?? "autonomy-tasks",
    };
    // Verify dependency is available
    try {
      require.resolve("@temporalio/client");
    } catch {
      throw new Error(
        "TemporalWorkflowEngine requires '@temporalio/client'. Install it with: npm install @temporalio/client",
      );
    }
  }

  register(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
  }

  async execute(workflowId: string, input: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return {
        executionId: `temporal-unregistered-${Date.now()}`,
        success: false,
        error: `Workflow '${workflowId}' not registered`,
        durationMs: 0,
      };
    }

    // Stub: In a real implementation, this would create a Temporal
    // workflow execution using the client Connection and WorkflowClient.
    //
    // const connection = await Connection.connect({ address: this.config.address });
    // const client = new WorkflowClient({ connection, namespace: this.config.namespace });
    // const handle = await client.start(workflowId, {
    //   taskQueue: this.config.taskQueue,
    //   args: [input],
    // });
    // const result = await handle.result();

    throw new Error(
      `TemporalWorkflowEngine.execute() is a stub. ` +
      `Configure a running Temporal server at ${this.config.address} and implement the client calls.`,
    );
  }

  async getStatus(_executionId: string): Promise<WorkflowResult | undefined> {
    throw new Error("TemporalWorkflowEngine.getStatus() is a stub.");
  }

  listWorkflows(): string[] {
    return [...this.workflows.keys()];
  }

  async close(): Promise<void> {
    this.workflows.clear();
  }
}
