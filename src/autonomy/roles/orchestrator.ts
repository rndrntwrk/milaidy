/**
 * KernelOrchestrator — RoleOrchestrator implementation.
 *
 * Coordinates all roles through the full lifecycle:
 * plan → execute → verify → write memory → audit.
 *
 * Drives the FSM through planning, memory writing, and auditing
 * phases while delegating execution to the Executor role boundary.
 *
 * @module autonomy/roles/orchestrator
 */

import type { KernelStateMachineInterface } from "../state-machine/types.js";
import {
  recordRoleExecution,
  recordRoleLatencyMs,
} from "../metrics/prometheus-metrics.js";
import type {
  PipelineResult,
} from "../workflow/types.js";
import { LocalWorkflowEngine } from "../adapters/workflow/local-engine.js";
import type { WorkflowDefinition, WorkflowEngine } from "../adapters/workflow/types.js";
import type { ToolCallSource } from "../tools/types.js";
import type {
  AuditorRole,
  ExecutorRole,
  ExecutionPlan,
  MemoryWriteRequest,
  MemoryWriterRole,
  OrchestratedRequest,
  OrchestratedResult,
  PlannerRole,
  RoleOrchestrator,
  SafeModeController,
  VerificationReport,
  VerifierRole,
} from "./types.js";
import {
  parseAuditorAuditRequest,
  parseAuditorAuditResponse,
  parseExecutorExecuteRequest,
  parseExecutorExecuteResponse,
  parseMemoryWriteBatchRequest,
  parseMemoryWriteBatchResponse,
  parseOrchestratedRequest,
  parsePlannerCreatePlanRequest,
  parsePlannerCreatePlanResponse,
  parsePlannerValidatePlanResponse,
  parseVerifierVerifyRequest,
  parseVerifierVerifyResponse,
} from "./schemas.js";

type RoleCallName =
  | "planner"
  | "executor"
  | "verifier"
  | "memory_writer"
  | "auditor";

export interface RoleCallPolicy {
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

const DEFAULT_ROLE_CALL_POLICY: RoleCallPolicy = {
  timeoutMs: 5_000,
  maxRetries: 1,
  backoffMs: 50,
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 30_000,
};

export interface RoleCallAuthzPolicy {
  minSourceTrust: number;
  allowedSources: ToolCallSource[];
}

const ROLE_CALL_SOURCES: ToolCallSource[] = [
  "llm",
  "user",
  "system",
  "plugin",
];

const DEFAULT_ROLE_CALL_AUTHZ_POLICY: RoleCallAuthzPolicy = {
  minSourceTrust: 0,
  allowedSources: ROLE_CALL_SOURCES,
};

interface RoleCircuitState {
  failures: number;
  openUntil: number;
}

export class KernelOrchestrator implements RoleOrchestrator {
  private executionQueue: Promise<void> = Promise.resolve();
  private readonly roleCallPolicy: RoleCallPolicy;
  private readonly roleCallAuthzPolicy: RoleCallAuthzPolicy;
  private readonly roleCircuitState = new Map<RoleCallName, RoleCircuitState>();

  constructor(
    private readonly planner: PlannerRole,
    private readonly executor: ExecutorRole,
    private readonly verifier: VerifierRole,
    private readonly memoryWriter: MemoryWriterRole,
    private readonly auditor: AuditorRole,
    private readonly stateMachine: KernelStateMachineInterface,
    private readonly safeModeController: SafeModeController,
    private readonly workflowEngine?: WorkflowEngine,
    roleCallPolicy?: Partial<RoleCallPolicy>,
    roleCallAuthzPolicy?: Partial<RoleCallAuthzPolicy>,
  ) {
    const mergedPolicy = {
      ...DEFAULT_ROLE_CALL_POLICY,
      ...(roleCallPolicy ?? {}),
    };
    this.roleCallPolicy = {
      timeoutMs: Math.max(1, mergedPolicy.timeoutMs),
      maxRetries: Math.max(0, mergedPolicy.maxRetries),
      backoffMs: Math.max(0, mergedPolicy.backoffMs),
      circuitBreakerThreshold: Math.max(1, mergedPolicy.circuitBreakerThreshold),
      circuitBreakerResetMs: Math.max(1, mergedPolicy.circuitBreakerResetMs),
    };

    const mergedAuthzPolicy = {
      ...DEFAULT_ROLE_CALL_AUTHZ_POLICY,
      ...(roleCallAuthzPolicy ?? {}),
    };
    const allowedSources = Array.from(
      new Set(mergedAuthzPolicy.allowedSources ?? ROLE_CALL_SOURCES),
    ).filter((source): source is ToolCallSource =>
      ROLE_CALL_SOURCES.includes(source),
    );
    this.roleCallAuthzPolicy = {
      minSourceTrust: Math.max(
        0,
        Math.min(1, mergedAuthzPolicy.minSourceTrust),
      ),
      allowedSources:
        allowedSources.length > 0 ? allowedSources : ROLE_CALL_SOURCES,
    };
  }

  async execute(request: OrchestratedRequest): Promise<OrchestratedResult> {
    const startedAt = Date.now();
    // Serialize orchestration executions to keep FSM transitions and
    // role outputs consistent under concurrent requests.
    let releaseQueueSlot!: () => void;
    const queueSlot = new Promise<void>((resolve) => {
      releaseQueueSlot = resolve;
    });
    const previous = this.executionQueue;
    this.executionQueue = previous.then(() => queueSlot);

    await previous;
    try {
      const result = await this.executeInternal(request);
      recordRoleLatencyMs("orchestrator", Date.now() - startedAt);
      recordRoleExecution("orchestrator", result.success ? "success" : "failure");
      return result;
    } catch (error) {
      recordRoleLatencyMs("orchestrator", Date.now() - startedAt);
      recordRoleExecution("orchestrator", "failure");
      throw error;
    } finally {
      releaseQueueSlot();
    }
  }

  private async executeInternal(
    request: OrchestratedRequest,
  ): Promise<OrchestratedResult> {
    const startTime = Date.now();
    const executions: PipelineResult[] = [];
    const verificationReports: VerificationReport[] = [];
    let plan: ExecutionPlan | undefined;
    let orchestratedRequest: OrchestratedRequest;

    try {
      orchestratedRequest = parseOrchestratedRequest(request);

      // Phase 1: Planning (idle → planning → idle)
      const planResult = this.stateMachine.transition("plan_requested");
      if (!planResult.accepted) {
        throw new Error(`Cannot start planning: ${planResult.reason}`);
      }

      const planRequest = parsePlannerCreatePlanRequest({
        description: orchestratedRequest.description,
        constraints: orchestratedRequest.constraints,
        source: orchestratedRequest.source,
        sourceTrust: orchestratedRequest.sourceTrust,
      });
      plan = parsePlannerCreatePlanResponse(
        await this.callRoleWithResilience(
          "planner",
          "createPlan",
          () => this.planner.createPlan(planRequest),
          {
            source: orchestratedRequest.source,
            sourceTrust: orchestratedRequest.sourceTrust,
          },
        ),
      );

      const validation = parsePlannerValidatePlanResponse(
        await this.callRoleWithResilience(
          "planner",
          "validatePlan",
          () => this.planner.validatePlan(plan),
          {
            source: orchestratedRequest.source,
            sourceTrust: orchestratedRequest.sourceTrust,
          },
        ),
      );
      if (!validation.valid) {
        plan.status = "rejected";
        this.stateMachine.transition("plan_rejected");
        throw new Error(
          `Plan validation failed: ${validation.issues.join("; ")}`,
        );
      }

      plan.status = "approved";
      this.stateMachine.transition("plan_approved");

      // Phase 2: Execution (pipeline handles its own FSM transitions)
      plan.status = "executing";
      if (this.workflowEngine) {
        const workflowDefinition = this.buildWorkflowDefinition(
          plan,
          orchestratedRequest,
        );
        this.workflowEngine.register(workflowDefinition);
        const workflowResult = await this.workflowEngine.execute(
          workflowDefinition.id,
          {
            plan,
            request: {
              agentId: orchestratedRequest.agentId,
              source: orchestratedRequest.source,
              sourceTrust: orchestratedRequest.sourceTrust,
            },
          },
        );
        if (!workflowResult.success) {
          throw new Error(
            `Workflow execution failed: ${workflowResult.error ?? "unknown error"}`,
          );
        }
        if (Array.isArray(workflowResult.output)) {
          executions.push(
            ...(workflowResult.output as PipelineResult[]),
          );
        } else {
          throw new Error("Workflow execution returned unexpected output");
        }
      } else {
        for (const step of plan.steps) {
          const proposedCall = parseExecutorExecuteRequest({
            tool: step.toolName,
            params: step.params,
            source: orchestratedRequest.source,
            requestId: `${plan.id}-${step.id}`,
          });
          const pipelineResult = parseExecutorExecuteResponse(
            await this.callRoleWithResilience(
              "executor",
              "execute",
              () =>
                this.executor.execute(
                  proposedCall,
                  orchestratedRequest.actionHandler,
                ),
              {
                source: orchestratedRequest.source,
                sourceTrust: orchestratedRequest.sourceTrust,
              },
            ),
          );
          executions.push(pipelineResult);

          if (!pipelineResult.success) {
            // Check if we should enter safe mode
            if (
              this.safeModeController.shouldTrigger(
                this.stateMachine.consecutiveErrors,
              )
            ) {
              this.safeModeController.enter(
                `Consecutive errors during plan execution: ${pipelineResult.error}`,
              );
            }
          }
        }
      }
      verificationReports.push(
        ...(await this.verifyExecutedSteps(
          plan,
          executions,
          orchestratedRequest,
        )),
      );
      plan.status = "complete";

      // Phase 3: Memory Writing (idle → writing_memory → idle)
      const memoryTransition = this.stateMachine.transition("write_memory");
      let memoryReport;
      if (memoryTransition.accepted) {
        try {
          const memoryRequests: MemoryWriteRequest[] = executions
            .filter((e) => e.success && e.result != null)
            .map((e) => ({
              content:
                typeof e.result === "string"
                  ? e.result
                  : JSON.stringify(e.result),
              source: {
                id: orchestratedRequest.agentId,
                type: "agent" as const,
                reliability: orchestratedRequest.sourceTrust,
              },
              agentId: orchestratedRequest.agentId,
              metadata: {
                toolName: e.toolName,
                requestId: e.requestId,
              },
            }));

          memoryReport = parseMemoryWriteBatchResponse(
            await this.callRoleWithResilience(
              "memory_writer",
              "writeBatch",
              () =>
                this.memoryWriter.writeBatch(
                  parseMemoryWriteBatchRequest(memoryRequests),
                ),
              {
                source: orchestratedRequest.source,
                sourceTrust: orchestratedRequest.sourceTrust,
              },
            ),
          );
          this.stateMachine.transition("memory_written");
        } catch (memError) {
          this.stateMachine.transition("memory_write_failed");
          // Recover from error state to continue with audit
          this.stateMachine.transition("recover");
        }
      }

      // Phase 4: Audit (idle → auditing → idle)
      const auditTransition = this.stateMachine.transition("audit_requested");
      let auditReport;
      if (auditTransition.accepted) {
        try {
          const auditRequest = parseAuditorAuditRequest({
            requestId: plan.id,
            correlationId: plan.id,
            plan,
            identityConfig: orchestratedRequest.identityConfig,
            recentOutputs: orchestratedRequest.recentOutputs ?? [],
          });
          auditReport = parseAuditorAuditResponse(
            await this.callRoleWithResilience(
              "auditor",
              "audit",
              () => this.auditor.audit(auditRequest),
              {
                source: orchestratedRequest.source,
                sourceTrust: orchestratedRequest.sourceTrust,
              },
            ),
          );
          this.stateMachine.transition("audit_complete");
        } catch (auditError) {
          this.stateMachine.transition("audit_failed");
          // Recover from error state
          this.stateMachine.transition("recover");
        }
      }

      // Provide a default audit report if audit was skipped
      if (!auditReport) {
        auditReport = {
          driftReport: {
            driftScore: 0,
            dimensions: {
              valueAlignment: 1,
              styleConsistency: 1,
              boundaryRespect: 1,
              topicFocus: 1,
            },
            windowSize: 0,
            severity: "none" as const,
            corrections: [],
            analyzedAt: Date.now(),
          },
          eventCount: 0,
          anomalies: [],
          recommendations: [],
          auditedAt: Date.now(),
        };
      }

      // Check safe mode trigger
      if (
        this.safeModeController.shouldTrigger(
          this.stateMachine.consecutiveErrors,
        )
      ) {
        this.safeModeController.enter(
          "Error threshold exceeded after orchestration",
        );
        this.stateMachine.transition("escalate_safe_mode");
      }

      const allSucceeded = executions.every((e) => e.success);
      const allVerified = verificationReports.every((v) => v.overallPassed);

      return {
        plan,
        executions,
        verificationReports,
        memoryReport,
        auditReport,
        durationMs: Date.now() - startTime,
        success: allSucceeded && allVerified,
      };
    } catch (error) {
      // Handle errors during orchestration
      const currentState = this.stateMachine.currentState;
      if (
        currentState !== "idle" &&
        currentState !== "error" &&
        currentState !== "safe_mode"
      ) {
        this.stateMachine.transition("fatal_error");
        this.stateMachine.transition("recover");
      }

      // Check safe mode trigger
      if (
        this.safeModeController.shouldTrigger(
          this.stateMachine.consecutiveErrors,
        )
      ) {
        this.safeModeController.enter(
          `Orchestration error: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.stateMachine.transition("escalate_safe_mode");
      }

      return {
        plan: plan ?? {
          id: "error-plan",
          goals: [],
          steps: [],
          createdAt: Date.now(),
          status: "rejected",
        },
        executions,
        verificationReports,
        auditReport: {
          driftReport: {
            driftScore: 0,
            dimensions: {
              valueAlignment: 1,
              styleConsistency: 1,
              boundaryRespect: 1,
              topicFocus: 1,
            },
            windowSize: 0,
            severity: "none" as const,
            corrections: [],
            analyzedAt: Date.now(),
          },
          eventCount: 0,
          anomalies: [error instanceof Error ? error.message : String(error)],
          recommendations: [],
          auditedAt: Date.now(),
        },
        durationMs: Date.now() - startTime,
        success: false,
      };
    }
  }

  getCurrentPhase():
    | "idle"
    | "planning"
    | "executing"
    | "verifying"
    | "writing_memory"
    | "auditing" {
    const state = this.stateMachine.currentState;
    switch (state) {
      case "planning":
      case "executing":
      case "verifying":
      case "writing_memory":
      case "auditing":
        return state;
      default:
        return "idle";
    }
  }

  isInSafeMode(): boolean {
    return this.stateMachine.currentState === "safe_mode";
  }

  private buildWorkflowDefinition(
    plan: ExecutionPlan,
    request: OrchestratedRequest,
  ): WorkflowDefinition {
    const usesLocalSteps = this.workflowEngine instanceof LocalWorkflowEngine;
    const steps: WorkflowDefinition["steps"] = usesLocalSteps
      ? [
          async () => {
            const results: PipelineResult[] = [];
            for (const step of plan.steps) {
              const proposedCall = parseExecutorExecuteRequest({
                tool: step.toolName,
                params: step.params,
                source: request.source,
                requestId: `${plan.id}-${step.id}`,
              });
              const pipelineResult = parseExecutorExecuteResponse(
                await this.callRoleWithResilience(
                  "executor",
                  "execute",
                  () =>
                    this.executor.execute(
                      proposedCall,
                      request.actionHandler,
                    ),
                  {
                    source: request.source,
                    sourceTrust: request.sourceTrust,
                  },
                ),
              );
              results.push(pipelineResult);

              if (!pipelineResult.success) {
                if (
                  this.safeModeController.shouldTrigger(
                    this.stateMachine.consecutiveErrors,
                  )
                ) {
                  this.safeModeController.enter(
                    `Consecutive errors during plan execution: ${pipelineResult.error}`,
                  );
                }
              }
            }
            return results;
          },
        ]
      : [];

    if (usesLocalSteps) {
      return {
        id: `plan-${plan.id}`,
        name: `Plan Execution ${plan.id}`,
        steps,
      };
    }

    return {
      id: "plan-execution",
      name: "Plan Execution (Temporal)",
      steps,
      temporal: {
        workflowType: "plan-execution",
        workflowId: plan.id,
      },
    };
  }

  private async verifyExecutedSteps(
    plan: ExecutionPlan,
    executions: PipelineResult[],
    request: OrchestratedRequest,
  ): Promise<VerificationReport[]> {
    const reports: VerificationReport[] = [];
    for (const execution of executions) {
      const step = plan.steps.find(
        (candidate) => `${plan.id}-${candidate.id}` === execution.requestId,
      );
      const verifyRequest = parseVerifierVerifyRequest({
        requestId: execution.requestId,
        toolName: execution.toolName,
        params: step?.params ?? {},
        result: execution.result,
        durationMs: execution.durationMs,
        agentId: request.agentId,
      });
      const report = parseVerifierVerifyResponse(
        await this.callRoleWithResilience(
          "verifier",
          "verify",
          () => this.verifier.verify(verifyRequest),
          {
            source: request.source,
            sourceTrust: request.sourceTrust,
          },
        ),
      );
      reports.push(report);
    }
    return reports;
  }

  private async callRoleWithResilience<T>(
    role: RoleCallName,
    operation: string,
    roleCall: () => Promise<T>,
    authContext: { source: ToolCallSource; sourceTrust: number },
  ): Promise<T> {
    this.assertRoleCallAuthorized(role, operation, authContext);

    const now = Date.now();
    const circuitState = this.roleCircuitState.get(role);
    if (circuitState && circuitState.openUntil > now) {
      throw new Error(
        `Role call blocked: ${role}.${operation} circuit breaker open until ${new Date(circuitState.openUntil).toISOString()}`,
      );
    }
    if (circuitState && circuitState.openUntil > 0 && circuitState.openUntil <= now) {
      this.resetRoleCircuit(role);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.roleCallPolicy.maxRetries; attempt++) {
      try {
        const result = await this.callRoleWithTimeout(role, operation, roleCall);
        this.resetRoleCircuit(role);
        return result;
      } catch (error) {
        lastError = error;
        const openedUntil = this.recordRoleFailure(role);
        if (openedUntil > Date.now()) {
          throw new Error(
            `Role call failed: ${role}.${operation} circuit breaker open until ${new Date(openedUntil).toISOString()} (last error: ${this.describeError(error)})`,
          );
        }

        const retriesRemaining = attempt < this.roleCallPolicy.maxRetries;
        if (!retriesRemaining) {
          throw new Error(
            `Role call failed: ${role}.${operation} after ${attempt + 1} attempt(s): ${this.describeError(error)}`,
          );
        }

        const backoffMs = this.roleCallPolicy.backoffMs * (attempt + 1);
        if (backoffMs > 0) {
          await this.sleep(backoffMs);
        }
      }
    }

    throw new Error(
      `Role call failed: ${role}.${operation}: ${this.describeError(lastError)}`,
    );
  }

  private async callRoleWithTimeout<T>(
    role: RoleCallName,
    operation: string,
    roleCall: () => Promise<T>,
  ): Promise<T> {
    const timeoutMs = this.roleCallPolicy.timeoutMs;
    if (timeoutMs <= 0) {
      return roleCall();
    }

    return await new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Role call timeout: ${role}.${operation} exceeded ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      roleCall().then(
        (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }

  private recordRoleFailure(role: RoleCallName): number {
    const current = this.roleCircuitState.get(role) ?? {
      failures: 0,
      openUntil: 0,
    };
    const failures = current.failures + 1;
    const openUntil =
      failures >= this.roleCallPolicy.circuitBreakerThreshold
        ? Date.now() + this.roleCallPolicy.circuitBreakerResetMs
        : 0;

    this.roleCircuitState.set(role, { failures, openUntil });
    return openUntil;
  }

  private resetRoleCircuit(role: RoleCallName): void {
    if (!this.roleCircuitState.has(role)) {
      return;
    }

    this.roleCircuitState.set(role, { failures: 0, openUntil: 0 });
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private assertRoleCallAuthorized(
    role: RoleCallName,
    operation: string,
    authContext: { source: ToolCallSource; sourceTrust: number },
  ): void {
    if (!this.roleCallAuthzPolicy.allowedSources.includes(authContext.source)) {
      throw new Error(
        `Role call denied: ${role}.${operation} source "${authContext.source}" is not allowed`,
      );
    }
    if (authContext.sourceTrust < this.roleCallAuthzPolicy.minSourceTrust) {
      throw new Error(
        `Role call denied: ${role}.${operation} source trust ${authContext.sourceTrust.toFixed(3)} below floor ${this.roleCallAuthzPolicy.minSourceTrust.toFixed(3)}`,
      );
    }
  }
}
