/**
 * KernelOrchestrator — RoleOrchestrator implementation.
 *
 * Coordinates all roles through the full lifecycle:
 * plan → execute → verify → write memory → audit.
 *
 * Drives the FSM through planning, memory writing, and auditing
 * phases while the existing pipeline handles its own internal
 * FSM transitions during execution.
 *
 * @module autonomy/roles/orchestrator
 */

import type { KernelStateMachineInterface } from "../state-machine/types.js";
import type {
  PipelineResult,
  ToolExecutionPipelineInterface,
} from "../workflow/types.js";
import type {
  AuditorRole,
  ExecutionPlan,
  MemoryWriteRequest,
  MemoryWriterRole,
  OrchestratedRequest,
  OrchestratedResult,
  PlannerRole,
  RoleOrchestrator,
  SafeModeController,
} from "./types.js";

export class KernelOrchestrator implements RoleOrchestrator {
  constructor(
    private readonly planner: PlannerRole,
    private readonly pipeline: ToolExecutionPipelineInterface,
    private readonly memoryWriter: MemoryWriterRole,
    private readonly auditor: AuditorRole,
    private readonly stateMachine: KernelStateMachineInterface,
    private readonly safeModeController: SafeModeController,
  ) {}

  async execute(request: OrchestratedRequest): Promise<OrchestratedResult> {
    const startTime = Date.now();
    const executions: PipelineResult[] = [];
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
      for (const step of plan.steps) {
        const pipelineResult = await this.pipeline.execute(
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

      return {
        plan,
        executions,
        memoryReport,
        auditReport,
        durationMs: Date.now() - startTime,
        success: allSucceeded,
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
}
