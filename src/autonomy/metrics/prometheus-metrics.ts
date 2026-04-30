/**
 * Autonomy Kernel Prometheus metrics instrumentation.
 *
 * Provides named counters, histograms, and gauges that the Prometheus
 * exporter converts to text exposition format. Uses the singleton
 * `metrics` client from the telemetry module.
 *
 * @module autonomy/metrics/prometheus-metrics
 */

import { metrics } from "../../telemetry/setup.js";

// ---------- Trust ----------

/**
 * Record a trust score evaluation.
 */
export function recordTrustScore(source: string, score: number): void {
  metrics.histogram("autonomy_trust_score", score, { source });
}

/**
 * Record a trust source registration.
 */
export function recordTrustSourceRegistered(source: string): void {
  metrics.counter("autonomy_trust_sources_total", 1, { source });
}

// ---------- Memory Gate ----------

/**
 * Record a memory gate decision.
 */
export function recordMemoryGateDecision(
  decision: "accepted" | "quarantined" | "rejected",
): void {
  metrics.counter("autonomy_memory_gate_decisions_total", 1, { decision });
}

/**
 * Record current quarantine buffer size.
 */
export function recordQuarantineSize(size: number): void {
  metrics.gauge("autonomy_quarantine_size", size);
}

// ---------- Drift Monitoring ----------

/**
 * Record a drift score measurement.
 */
export function recordDriftScore(score: number): void {
  metrics.histogram("autonomy_drift_score", score);
}

/**
 * Record a drift alert event.
 */
export function recordDriftAlert(severity: "warning" | "critical"): void {
  metrics.counter("autonomy_drift_alerts_total", 1, { severity });
}

// ---------- Goal Management ----------

/**
 * Record a goal status change.
 */
export function recordGoalStatusChange(status: string): void {
  metrics.counter("autonomy_goal_transitions_total", 1, { status });
}

/**
 * Record current goal count by status.
 */
export function recordGoalCount(status: string, count: number): void {
  metrics.gauge("autonomy_goals_count", count, { status });
}

// ---------- Approval Gate ----------

/**
 * Record an approval request.
 */
export function recordApprovalRequest(riskClass: string): void {
  metrics.counter("autonomy_approval_requests_total", 1, { risk_class: riskClass });
}

/**
 * Record current approval queue size.
 */
export function recordApprovalQueueSize(size: number): void {
  metrics.gauge("autonomy_approval_queue_size", size);
}

/**
 * Record an approval decision.
 */
export function recordApprovalDecision(
  decision: "approved" | "denied" | "expired" | "auto_approved",
): void {
  metrics.counter("autonomy_approval_decisions_total", 1, { decision });
}

/**
 * Record approval turnaround time (time from request to decision).
 */
export function recordApprovalTurnaroundMs(ms: number): void {
  metrics.histogram("autonomy_approval_turnaround_ms", ms);
}

// ---------- Event Store ----------

/**
 * Record current event store size.
 */
export function recordEventStoreSize(size: number): void {
  metrics.gauge("autonomy_event_store_size", size);
}

/**
 * Record an event appended to the store.
 */
export function recordEventAppended(type: string): void {
  metrics.counter("autonomy_events_appended_total", 1, { type });
}

// ---------- Execution Pipeline ----------

/**
 * Record pipeline execution duration.
 */
export function recordPipelineLatencyMs(ms: number, outcome: string): void {
  metrics.histogram("autonomy_pipeline_latency_ms", ms, { outcome });
}

/**
 * Record a pipeline execution result.
 */
export function recordPipelineOutcome(outcome: string): void {
  metrics.counter("autonomy_pipeline_executions_total", 1, { outcome });
}

// ---------- Role Telemetry ----------

export type AutonomyRoleName =
  | "planner"
  | "executor"
  | "verifier"
  | "memory_writer"
  | "auditor"
  | "orchestrator";

export type RoleExecutionOutcome = "success" | "failure";

/**
 * Record a role execution result.
 */
export function recordRoleExecution(
  role: AutonomyRoleName,
  outcome: RoleExecutionOutcome,
): void {
  metrics.counter("autonomy_role_executions_total", 1, { role, outcome });
}

/**
 * Record role execution latency in milliseconds.
 */
export function recordRoleLatencyMs(
  role: AutonomyRoleName,
  ms: number,
): void {
  metrics.histogram("autonomy_role_latency_ms", ms, { role });
}

// ---------- State Machine ----------

/**
 * Record a state machine transition.
 */
export function recordStateTransition(from: string, to: string): void {
  metrics.counter("autonomy_state_transitions_total", 1, { from, to });
}

/**
 * Record current state.
 */
export function recordCurrentState(state: string): void {
  metrics.gauge("autonomy_current_state", 1, { state });
}

/**
 * Record consecutive error count.
 */
export function recordConsecutiveErrors(count: number): void {
  metrics.gauge("autonomy_consecutive_errors", count);
}

// ---------- Identity ----------

/**
 * Record an identity version update.
 */
export function recordIdentityVersionUpdate(version: number): void {
  metrics.counter("autonomy_identity_updates_total", 1);
  metrics.gauge("autonomy_identity_version", version);
}

// ---------- Safe Mode ----------

/**
 * Record a safe mode entry/exit.
 */
export function recordSafeModeEvent(action: "enter" | "exit"): void {
  metrics.counter("autonomy_safe_mode_events_total", 1, { action });
}

// ---------- Invariants ----------

/**
 * Record an invariant check result.
 */
export function recordInvariantCheck(result: "pass" | "fail" | "error"): void {
  metrics.counter("autonomy_invariant_checks_total", 1, { result });
}

// ---------- Kernel Up ----------

/**
 * Record that the kernel is active. Called once on init.
 */
export function recordKernelUp(): void {
  metrics.gauge("autonomy_kernel_up", 1);
}
