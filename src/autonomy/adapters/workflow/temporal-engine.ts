/**
 * Temporal workflow engine stub — optional external orchestration backend.
 *
 * Requires `@temporalio/client` as an optional peer dependency. If the
 * dependency is not installed, construction throws with a clear message.
 *
 * @module autonomy/adapters/workflow/temporal-engine
 */

import { createRequire } from "node:module";
import type { WorkflowEngine, WorkflowDefinition, WorkflowResult } from "./types.js";

const require = createRequire(import.meta.url);

/** Configuration for Temporal workflow engine. */
export interface TemporalEngineConfig {
  /** Temporal server address. Default: localhost:7233. */
  address?: string;
  /** Temporal namespace. Default: "default". */
  namespace?: string;
  /** Task queue name. Default: "autonomy-tasks". */
  taskQueue?: string;
  /** Prefix for generated workflow IDs. Default: "autonomy". */
  workflowIdPrefix?: string;
}

interface TemporalHandle {
  result: () => Promise<unknown>;
  cancel?: () => Promise<void>;
  workflowId?: string;
  runId?: string;
  firstExecutionRunId?: string;
  execution?: { runId?: string };
}

interface TemporalClient {
  start: (
    workflowType: string,
    options: { taskQueue: string; args: unknown[]; workflowId?: string },
  ) => Promise<TemporalHandle>;
  getHandle: (workflowId: string, runId?: string) => TemporalHandle;
}

interface TemporalClientModule {
  Connection: {
    connect: (opts: { address?: string }) => Promise<unknown>;
  };
  WorkflowClient: new (opts: { connection: unknown; namespace: string }) => TemporalClient;
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
  private readonly results = new Map<string, WorkflowResult>();
  private readonly handles = new Map<string, { workflowId: string; handle: TemporalHandle }>();
  private clientPromise?: Promise<{ client: TemporalClient; connection: unknown }>;
  private temporalModule!: TemporalClientModule;

  constructor(
    config: TemporalEngineConfig = {},
    deps?: { temporalModule?: TemporalClientModule },
  ) {
    this.config = {
      address: config.address ?? "localhost:7233",
      namespace: config.namespace ?? "default",
      taskQueue: config.taskQueue ?? "autonomy-tasks",
      workflowIdPrefix: config.workflowIdPrefix ?? "autonomy",
    };

    if (deps?.temporalModule) {
      this.temporalModule = deps.temporalModule;
      return;
    }

    // Verify dependency is available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const temporal = require("@temporalio/client") as TemporalClientModule;
      this.temporalModule = temporal;
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
    const startTime = Date.now();

    try {
      const { client } = await this.getClient();
      const workflowType = workflow.temporal?.workflowType ?? workflow.id;
      const taskQueue = workflow.temporal?.taskQueue ?? this.config.taskQueue;
      const temporalWorkflowId = workflow.temporal?.workflowId ?? this.buildWorkflowId(workflow.id);

      let handle: TemporalHandle;
      try {
        handle = await client.start(workflowType, {
          taskQueue,
          args: [input],
          workflowId: temporalWorkflowId,
        });
      } catch (err) {
        if (!isAlreadyStartedError(err)) {
          throw err;
        }
        // Idempotency behavior: attach to existing workflow execution.
        handle = client.getHandle(temporalWorkflowId);
      }

      const executionId = this.extractExecutionId(handle, temporalWorkflowId);
      this.handles.set(executionId, { workflowId: temporalWorkflowId, handle });

      const result = await handle.result();
      const workflowResult: WorkflowResult = {
        executionId,
        success: true,
        output: result,
        durationMs: Date.now() - startTime,
      };
      this.results.set(executionId, workflowResult);
      return workflowResult;
    } catch (err) {
      const workflowResult: WorkflowResult = {
        executionId: `temporal-${Date.now()}`,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
      this.results.set(workflowResult.executionId, workflowResult);
      return workflowResult;
    }
  }

  async getStatus(_executionId: string): Promise<WorkflowResult | undefined> {
    return this.results.get(_executionId);
  }

  async cancel(executionId: string): Promise<boolean> {
    const entry = this.handles.get(executionId);
    if (!entry) return false;
    const handle = entry.handle;
    if (typeof handle?.cancel !== "function") return false;
    try {
      await handle.cancel();
      return true;
    } catch {
      return false;
    }
  }

  listWorkflows(): string[] {
    return [...this.workflows.keys()];
  }

  async close(): Promise<void> {
    this.workflows.clear();
    this.results.clear();
    this.handles.clear();
    if (this.clientPromise) {
      try {
        const { connection } = await this.clientPromise;
        if (connection && typeof (connection as { close?: () => Promise<void> }).close === "function") {
          await (connection as { close: () => Promise<void> }).close();
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  private async getClient(): Promise<{ client: TemporalClient; connection: unknown }> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { Connection, WorkflowClient } = this.temporalModule;
        const connection = await Connection.connect({ address: this.config.address });
        const client = new WorkflowClient({ connection, namespace: this.config.namespace });
        return { client, connection };
      })();
    }
    return this.clientPromise;
  }

  private buildWorkflowId(workflowId: string): string {
    return `${this.config.workflowIdPrefix}-${workflowId}-${Date.now()}`;
  }

  private extractExecutionId(handle: TemporalHandle, fallbackWorkflowId: string): string {
    const h = handle;
    const workflowId = h.workflowId ?? fallbackWorkflowId;
    const runId = h.runId ?? h.firstExecutionRunId ?? h.execution?.runId;
    if (runId) return `${workflowId}:${runId}`;
    return workflowId;
  }
}

function isAlreadyStartedError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string };
  const name = String(e?.name ?? "");
  const code = String(e?.code ?? "");
  const message = String(e?.message ?? "");
  if (name === "WorkflowExecutionAlreadyStartedError") return true;
  if (code.toUpperCase().includes("ALREADY_STARTED")) return true;
  return /already started/i.test(message);
}
