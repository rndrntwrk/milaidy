/**
 * Tool Execution Pipeline — orchestrates validation, approval, execution,
 * verification, invariant checking, and compensation into a single flow.
 *
 * @module autonomy/workflow/execution-pipeline
 */

import type { ApprovalGateInterface } from "../approval/types.js";
import type { KernelStateMachineInterface } from "../state-machine/types.js";
import type {
  ProposedToolCall,
  SchemaValidatorInterface,
  ToolCallSource,
} from "../tools/types.js";
import type {
  InvariantCheckerInterface,
  InvariantContext,
  InvariantResult,
} from "../verification/invariants/types.js";
import type {
  PostConditionVerifierInterface,
  VerifierContext,
} from "../verification/types.js";
import type {
  CompensationRegistryInterface,
  EventStoreInterface,
  PipelineConfig,
  PipelineResult,
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "./types.js";

/** Default pipeline configuration. */
const DEFAULT_CONFIG: PipelineConfig = {
  enabled: true,
  maxConcurrent: 1,
  defaultTimeoutMs: 30_000,
  approvalTimeoutMs: 300_000,
  autoApproveReadOnly: true,
  autoApproveSources: [],
  eventStoreMaxEvents: 10_000,
};

export class ToolExecutionPipeline implements ToolExecutionPipelineInterface {
  private config: PipelineConfig;
  private schemaValidator: SchemaValidatorInterface;
  private approvalGate: ApprovalGateInterface;
  private postConditionVerifier: PostConditionVerifierInterface;
  private compensationRegistry: CompensationRegistryInterface;
  private stateMachine: KernelStateMachineInterface;
  private eventStore: EventStoreInterface;
  private invariantChecker?: InvariantCheckerInterface;
  private eventBus?: {
    emit: (event: string, payload: unknown) => void;
  };

  constructor(deps: {
    schemaValidator: SchemaValidatorInterface;
    approvalGate: ApprovalGateInterface;
    postConditionVerifier: PostConditionVerifierInterface;
    compensationRegistry: CompensationRegistryInterface;
    stateMachine: KernelStateMachineInterface;
    eventStore: EventStoreInterface;
    invariantChecker?: InvariantCheckerInterface;
    config?: Partial<PipelineConfig>;
    eventBus?: { emit: (event: string, payload: unknown) => void };
  }) {
    this.schemaValidator = deps.schemaValidator;
    this.approvalGate = deps.approvalGate;
    this.postConditionVerifier = deps.postConditionVerifier;
    this.compensationRegistry = deps.compensationRegistry;
    this.stateMachine = deps.stateMachine;
    this.eventStore = deps.eventStore;
    this.invariantChecker = deps.invariantChecker;
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
    this.eventBus = deps.eventBus;
  }

  async execute(
    call: ProposedToolCall,
    actionHandler: ToolActionHandler,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const { requestId, tool: toolName } = call;
    const correlationId = `corr-${requestId}-${Date.now()}`;

    // 1. Record proposed event
    await this.eventStore.append(requestId, "tool:proposed", {
      toolName,
      source: call.source,
      params: call.params,
    }, correlationId);
    this.eventBus?.emit("autonomy:pipeline:started", {
      requestId,
      toolName,
      source: call.source,
      correlationId,
    });

    // 2. Schema validation
    const validation = this.schemaValidator.validate(call);
    await this.eventStore.append(requestId, "tool:validated", {
      valid: validation.valid,
      errorCount: validation.errors.length,
      errors: validation.errors.map((e) => ({
        field: e.field,
        message: e.message,
      })),
      riskClass: validation.riskClass,
    }, correlationId);

    if (!validation.valid) {
      await this.eventStore.append(requestId, "tool:failed", {
        reason: "validation_failed",
        errors: validation.errors,
      }, correlationId);

      return {
        requestId,
        toolName,
        success: false,
        validation: {
          valid: false,
          errors: validation.errors.map((e) => ({
            field: e.field,
            message: e.message,
          })),
        },
        correlationId,
        durationMs: Date.now() - startTime,
        error: "Validation failed",
      };
    }

    // 3. Approval check
    let approvalInfo: PipelineResult["approval"];
    const needsApproval = this.shouldRequireApproval(
      validation.requiresApproval,
      validation.riskClass,
      call.source,
    );

    if (needsApproval) {
      const smResult = this.stateMachine.transition("approval_required");
      if (!smResult.accepted) {
        return this.failResult(
          requestId,
          toolName,
          validation,
          startTime,
          correlationId,
          `State machine rejected approval_required: ${smResult.reason}`,
        );
      }

      await this.eventStore.append(requestId, "tool:approval:requested", {
        riskClass: validation.riskClass,
        source: call.source,
        toolName,
      }, correlationId);

      const approvalResult = await this.approvalGate.requestApproval(
        call,
        validation.riskClass ?? "irreversible",
      );

      await this.eventStore.append(requestId, "tool:approval:resolved", {
        decision: approvalResult.decision,
        decidedBy: approvalResult.decidedBy,
      }, correlationId);

      approvalInfo = {
        required: true,
        decision: approvalResult.decision,
        decidedBy: approvalResult.decidedBy,
      };

      if (approvalResult.decision === "denied") {
        this.stateMachine.transition("approval_denied");
        return {
          requestId,
          toolName,
          success: false,
          validation: { valid: true, errors: [] },
          approval: approvalInfo,
          correlationId,
          durationMs: Date.now() - startTime,
          error: "Approval denied",
        };
      }

      if (approvalResult.decision === "expired") {
        this.stateMachine.transition("approval_expired");
        return {
          requestId,
          toolName,
          success: false,
          validation: { valid: true, errors: [] },
          approval: approvalInfo,
          correlationId,
          durationMs: Date.now() - startTime,
          error: "Approval expired",
        };
      }

      // Approved
      this.stateMachine.transition("approval_granted");
    } else {
      // No approval needed — transition directly to executing
      const smResult = this.stateMachine.transition("tool_validated");
      if (!smResult.accepted) {
        return this.failResult(
          requestId,
          toolName,
          validation,
          startTime,
          correlationId,
          `State machine rejected tool_validated: ${smResult.reason}`,
        );
      }
    }

    // 4. Execute the action
    await this.eventStore.append(requestId, "tool:executing", { toolName }, correlationId);

    let execResult: { result: unknown; durationMs: number };
    try {
      execResult = await actionHandler(
        toolName,
        validation.validatedParams,
        requestId,
      );
    } catch (err) {
      await this.eventStore.append(requestId, "tool:failed", {
        reason: "execution_error",
        error: err instanceof Error ? err.message : String(err),
      }, correlationId);
      this.stateMachine.transition("fatal_error");

      return {
        requestId,
        toolName,
        success: false,
        validation: { valid: true, errors: [] },
        approval: approvalInfo,
        correlationId,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    await this.eventStore.append(requestId, "tool:executed", {
      durationMs: execResult.durationMs,
    }, correlationId);

    // 5. Verification
    this.stateMachine.transition("execution_complete");

    const verifierCtx: VerifierContext = {
      toolName,
      params: call.params,
      result: execResult.result,
      durationMs: execResult.durationMs,
      agentId: call.source,
      requestId,
    };

    const verification = await this.postConditionVerifier.verify(verifierCtx);
    await this.eventStore.append(requestId, "tool:verified", {
      status: verification.status,
      hasCriticalFailure: verification.hasCriticalFailure,
      checks: verification.checks,
    }, correlationId);

    // 6. Handle critical verification failure → compensation
    if (verification.hasCriticalFailure) {
      this.stateMachine.transition("verification_failed");

      let compensationInfo: PipelineResult["compensation"];
      if (this.compensationRegistry.has(toolName)) {
        const compResult = await this.compensationRegistry.compensate({
          toolName,
          params: call.params,
          result: execResult.result,
          requestId,
        });

        await this.eventStore.append(requestId, "tool:compensated", {
          success: compResult.success,
          detail: compResult.detail,
        }, correlationId);

        this.eventBus?.emit("autonomy:compensation:attempted", {
          requestId,
          toolName,
          success: compResult.success,
          detail: compResult.detail,
          correlationId,
        });

        compensationInfo = {
          attempted: true,
          success: compResult.success,
          detail: compResult.detail,
        };
      } else {
        compensationInfo = { attempted: false, success: false };
      }

      // Attempt recovery
      this.stateMachine.transition("recover");

      // Run invariants on failure path
      const invariantInfo = await this.runInvariants(
        requestId,
        toolName,
        false,
        correlationId,
      );

      this.eventBus?.emit("autonomy:pipeline:completed", {
        requestId,
        toolName,
        success: false,
        durationMs: Date.now() - startTime,
        compensationAttempted: compensationInfo?.attempted ?? false,
        correlationId,
      });

      return {
        requestId,
        toolName,
        success: false,
        result: execResult.result,
        validation: { valid: true, errors: [] },
        approval: approvalInfo,
        verification: {
          status: verification.status,
          hasCriticalFailure: true,
        },
        compensation: compensationInfo,
        invariants: invariantInfo,
        correlationId,
        durationMs: Date.now() - startTime,
        error: "Critical verification failure",
      };
    }

    // 7. Success
    this.stateMachine.transition("verification_passed");

    // Run invariants on success path
    const invariantInfo = await this.runInvariants(
      requestId,
      toolName,
      true,
      correlationId,
    );

    if (invariantInfo?.hasCriticalViolation) {
      await this.eventStore.append(requestId, "tool:failed", {
        reason: "critical_invariant_violation",
      }, correlationId);
      this.stateMachine.transition("fatal_error");
      this.stateMachine.transition("recover");

      this.eventBus?.emit("autonomy:pipeline:completed", {
        requestId,
        toolName,
        success: false,
        durationMs: Date.now() - startTime,
        correlationId,
      });

      return {
        requestId,
        toolName,
        success: false,
        result: execResult.result,
        validation: { valid: true, errors: [] },
        approval: approvalInfo,
        verification: {
          status: verification.status,
          hasCriticalFailure: false,
        },
        invariants: invariantInfo,
        correlationId,
        durationMs: Date.now() - startTime,
        error: "Critical invariant violation",
      };
    }

    this.eventBus?.emit("autonomy:pipeline:completed", {
      requestId,
      toolName,
      success: true,
      durationMs: Date.now() - startTime,
      correlationId,
    });

    return {
      requestId,
      toolName,
      success: true,
      result: execResult.result,
      validation: { valid: true, errors: [] },
      approval: approvalInfo,
      verification: {
        status: verification.status,
        hasCriticalFailure: false,
      },
      invariants: invariantInfo,
      correlationId,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Run cross-system invariants if a checker is configured.
   */
  private async runInvariants(
    requestId: string,
    toolName: string,
    executionSucceeded: boolean,
    correlationId: string,
  ): Promise<PipelineResult["invariants"]> {
    if (!this.invariantChecker) return undefined;

    const pipelineResult: PipelineResult = {
      requestId,
      toolName,
      success: executionSucceeded,
      validation: { valid: true, errors: [] },
      durationMs: 0,
    };

    const invariantCtx: InvariantContext = {
      requestId,
      toolName,
      executionSucceeded,
      currentState: this.stateMachine.currentState,
      pendingApprovalCount: this.approvalGate.getPending().length,
      eventCount: (await this.eventStore.getByRequestId(requestId)).length,
      pipelineResult,
    };

    const invariantResult: InvariantResult =
      await this.invariantChecker.check(invariantCtx);

    await this.eventStore.append(requestId, "tool:invariants:checked", {
      status: invariantResult.status,
      hasCriticalViolation: invariantResult.hasCriticalViolation,
      checkCount: invariantResult.checks.length,
    }, correlationId);

    this.eventBus?.emit("autonomy:invariants:checked", {
      requestId,
      status: invariantResult.status,
      hasCriticalViolation: invariantResult.hasCriticalViolation,
      checkCount: invariantResult.checks.length,
      correlationId,
    });

    return {
      status: invariantResult.status,
      hasCriticalViolation: invariantResult.hasCriticalViolation,
    };
  }

  private shouldRequireApproval(
    contractRequiresApproval: boolean,
    riskClass: string | undefined,
    source: ToolCallSource,
  ): boolean {
    if (!contractRequiresApproval) return false;

    // Auto-approve read-only tools
    if (this.config.autoApproveReadOnly && riskClass === "read-only") {
      return false;
    }

    // Auto-approve trusted sources
    if (this.config.autoApproveSources.includes(source)) {
      return false;
    }

    return true;
  }

  private async failResult(
    requestId: string,
    toolName: string,
    validation: {
      valid: boolean;
      errors: Array<{ field: string; message: string }>;
    },
    startTime: number,
    correlationId: string,
    error: string,
  ): Promise<PipelineResult> {
    await this.eventStore.append(requestId, "tool:failed", { reason: error }, correlationId);

    return {
      requestId,
      toolName,
      success: false,
      validation: {
        valid: validation.valid,
        errors: validation.errors.map((e) => ({
          field: e.field,
          message: e.message,
        })),
      },
      correlationId,
      durationMs: Date.now() - startTime,
      error,
    };
  }
}
