/**
 * Tests for Autonomy Kernel Prometheus metrics.
 */

import { describe, expect, it, beforeEach } from "vitest";

import { metrics } from "../../telemetry/setup.js";
import {
  recordTrustScore,
  recordMemoryGateDecision,
  recordDriftScore,
  recordGoalStatusChange,
  recordApprovalRequest,
  recordApprovalDecision,
  recordApprovalTurnaroundMs,
  recordEventStoreSize,
  recordPipelineLatencyMs,
  recordPipelineOutcome,
  recordStateTransition,
  recordCurrentState,
  recordConsecutiveErrors,
  recordIdentityVersionUpdate,
  recordSafeModeEvent,
  recordInvariantCheck,
  recordKernelUp,
  recordQuarantineSize,
  recordRoleExecution,
  recordRoleLatencyMs,
  recordDriftAlert,
  recordGoalCount,
  recordEventAppended,
  recordTrustSourceRegistered,
} from "./prometheus-metrics.js";

// ---------- Tests ----------

describe("Autonomy Prometheus Metrics", () => {
  it("recordTrustScore records histogram", () => {
    const before = metrics.getSnapshot();
    recordTrustScore("system", 0.85);
    const after = metrics.getSnapshot();

    const key = 'autonomy_trust_score:{"source":"system"}';
    const beforeHist = before.histograms[key];
    const afterHist = after.histograms[key];
    expect(afterHist).toBeDefined();
    expect(afterHist.count).toBe((beforeHist?.count ?? 0) + 1);
  });

  it("recordMemoryGateDecision increments counter", () => {
    const before = metrics.getSnapshot();
    recordMemoryGateDecision("accepted");
    const after = metrics.getSnapshot();

    const key = 'autonomy_memory_gate_decisions_total:{"decision":"accepted"}';
    expect((after.counters[key] ?? 0) - (before.counters[key] ?? 0)).toBe(1);
  });

  it("recordDriftScore records histogram", () => {
    recordDriftScore(0.12);
    const snap = metrics.getSnapshot();
    expect(snap.histograms['autonomy_drift_score:{}']).toBeDefined();
  });

  it("recordGoalStatusChange increments counter", () => {
    recordGoalStatusChange("completed");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_goal_transitions_total:{"status":"completed"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordApprovalRequest increments counter by risk class", () => {
    recordApprovalRequest("irreversible");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_approval_requests_total:{"risk_class":"irreversible"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordApprovalDecision increments counter", () => {
    recordApprovalDecision("approved");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_approval_decisions_total:{"decision":"approved"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordApprovalTurnaroundMs records histogram", () => {
    recordApprovalTurnaroundMs(500);
    const snap = metrics.getSnapshot();
    expect(snap.histograms['autonomy_approval_turnaround_ms:{}']).toBeDefined();
  });

  it("recordEventStoreSize sets gauge", () => {
    recordEventStoreSize(42);
    const snap = metrics.getSnapshot();
    expect(snap.counters["autonomy_event_store_size"]).toBe(42);
  });

  it("recordPipelineLatencyMs records histogram with outcome", () => {
    recordPipelineLatencyMs(150, "success");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_pipeline_latency_ms:{"outcome":"success"}';
    expect(snap.histograms[key]).toBeDefined();
  });

  it("recordPipelineOutcome increments counter", () => {
    recordPipelineOutcome("success");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_pipeline_executions_total:{"outcome":"success"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordStateTransition increments counter", () => {
    recordStateTransition("idle", "executing");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_state_transitions_total:{"from":"idle","to":"executing"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordCurrentState sets gauge", () => {
    recordCurrentState("idle");
    const snap = metrics.getSnapshot();
    expect(snap.counters['autonomy_current_state:{"state":"idle"}']).toBeUndefined;
  });

  it("recordConsecutiveErrors sets gauge", () => {
    recordConsecutiveErrors(3);
    const snap = metrics.getSnapshot();
    expect(snap.counters["autonomy_consecutive_errors"]).toBe(3);
  });

  it("recordIdentityVersionUpdate increments counter and sets version", () => {
    recordIdentityVersionUpdate(5);
    const snap = metrics.getSnapshot();
    expect(snap.counters["autonomy_identity_version"]).toBe(5);
  });

  it("recordSafeModeEvent increments counter", () => {
    recordSafeModeEvent("enter");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_safe_mode_events_total:{"action":"enter"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordInvariantCheck increments counter", () => {
    recordInvariantCheck("pass");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_invariant_checks_total:{"result":"pass"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordKernelUp sets gauge to 1", () => {
    recordKernelUp();
    const snap = metrics.getSnapshot();
    expect(snap.counters["autonomy_kernel_up"]).toBe(1);
  });

  it("recordQuarantineSize sets gauge", () => {
    recordQuarantineSize(10);
    const snap = metrics.getSnapshot();
    expect(snap.counters["autonomy_quarantine_size"]).toBe(10);
  });

  it("recordDriftAlert increments counter", () => {
    recordDriftAlert("warning");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_drift_alerts_total:{"severity":"warning"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordGoalCount sets gauge by status", () => {
    recordGoalCount("active", 3);
    const snap = metrics.getSnapshot();
    // gauges are stored in counters map by the metrics client
    expect(snap.counters["autonomy_goals_count"]).toBeDefined();
  });

  it("recordEventAppended increments counter by type", () => {
    recordEventAppended("tool_validated");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_events_appended_total:{"type":"tool_validated"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordTrustSourceRegistered increments counter", () => {
    recordTrustSourceRegistered("user");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_trust_sources_total:{"source":"user"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordRoleExecution increments role counter", () => {
    recordRoleExecution("planner", "success");
    const snap = metrics.getSnapshot();
    const key = 'autonomy_role_executions_total:{"role":"planner","outcome":"success"}';
    expect(snap.counters[key]).toBeGreaterThan(0);
  });

  it("recordRoleLatencyMs records role histogram", () => {
    recordRoleLatencyMs("orchestrator", 42);
    const snap = metrics.getSnapshot();
    const key = 'autonomy_role_latency_ms:{"role":"orchestrator"}';
    expect(snap.histograms[key]).toBeDefined();
  });
});
