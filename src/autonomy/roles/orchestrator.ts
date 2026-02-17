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
import type {
  PipelineResult,
} from "../workflow/types.js";
import { LocalWorkflowEngine } from "../adapters/workflow/local-engine.js";
import type { WorkflowDefinition, WorkflowEngine } from "../adapters/workflow/types.js";
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

export class KernelOrchestrator implements RoleOrchestrator {
  constructor(
    private readonly planner: PlannerRole,
    private readonly executor: ExecutorRole,
    private readonly verifier: VerifierRole,
    private readonly memoryWriter: MemoryWriterRole,
    private readonly auditor: AuditorRole,
    private readonly stateMachine: KernelStateMachineInterface,
    private readonly safeModeController: SafeModeController,
    private readonly workflowEngine?: WorkflowEngine,
  ) {}

  async execute(request: OrchestratedRequest): Promise<OrchestratedResult> {
    const startTime = Date.now();
    const executions: PipelineResult[] = [];
    const verificationReports: VerificationReport[] = [];
    let plan: ExecutionPlan | undefined;

    try {
      // Phase 1: Planning (idle → planning → idle)
      const planResult = this.stateMachine.transition("plan_requested");
      if (!planResult.accepted) {
        throw new Error(`Cannot start planning: ${planResult.reason}`);
      }

      plan = await this.planner.createPlan({
        description: request.description,
        source: request.source,
        sourceTrust: request.sourceTrust,
      });

      const validation = await this.planner.validatePlan(plan);
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
        const workflowDefinition = this.buildWorkflowDefinition(plan, request);
        this.workflowEngine.register(workflowDefinition);
        const workflowResult = await this.workflowEngine.execute(
          workflowDefinition.id,
          {
            plan,
            request: {
              agentId: request.agentId,
              source: request.source,
              sourceTrust: request.sourceTrust,
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
          const pipelineResult = await this.executor.execute(
            {
              tool: step.toolName,
              params: step.params,
              source: request.source,
              requestId: `${plan.id}-${step.id}`,
            },
            request.actionHandler,
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
        ...(await this.verifyExecutedSteps(plan, executions, request)),
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
                id: request.agentId,
                type: "agent" as const,
                reliability: request.sourceTrust,
              },
              agentId: request.agentId,
              metadata: {
                toolName: e.toolName,
                requestId: e.requestId,
              },
            }));

          memoryReport = await this.memoryWriter.writeBatch(memoryRequests);
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
          auditReport = await this.auditor.audit({
            requestId: plan.id,
            correlationId: plan.id,
            plan,
            identityConfig: request.identityConfig,
            recentOutputs: request.recentOutputs ?? [],
          });
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
              const pipelineResult = await this.executor.execute(
                {
                  tool: step.toolName,
                  params: step.params,
                  source: request.source,
                  requestId: `${plan.id}-${step.id}`,
                },
                request.actionHandler,
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
      const report = await this.verifier.verify({
        requestId: execution.requestId,
        toolName: execution.toolName,
        params: step?.params ?? {},
        result: execution.result,
        durationMs: execution.durationMs,
        agentId: request.agentId,
      });
      reports.push(report);
    }
    return reports;
  }
}
