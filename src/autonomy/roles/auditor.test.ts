import { describe, expect, it, vi } from "vitest";
import type {
  DriftReport,
  PersonaDriftMonitor,
} from "../identity/drift-monitor.js";
import type { EventStoreInterface, ExecutionEvent } from "../workflow/types.js";
import { DriftAwareAuditor } from "./auditor.js";
import type { AuditContext } from "./types.js";

function makeDriftReport(driftScore = 0.05): DriftReport {
  return {
    driftScore,
    dimensions: {
      valueAlignment: 1 - driftScore,
      styleConsistency: 1 - driftScore,
      boundaryRespect: 1 - driftScore,
      topicFocus: 1 - driftScore,
    },
    windowSize: 5,
    severity:
      driftScore > 0.25 ? "high" : driftScore > 0.15 ? "medium" : "none",
    corrections: driftScore > 0.15 ? ["Reduce drift by aligning outputs"] : [],
    analyzedAt: Date.now(),
  };
}

function createMockDriftMonitor(driftScore = 0.05): PersonaDriftMonitor {
  return {
    analyze: vi.fn(async () => makeDriftReport(driftScore)),
    getCurrentDrift: vi.fn(() => makeDriftReport(driftScore)),
    onDriftAlert: vi.fn(() => () => {}),
  };
}

function createMockEventStore(
  events: Partial<ExecutionEvent>[] = [],
): EventStoreInterface {
  const fullEvents: ExecutionEvent[] = events.map((e, i) => ({
    sequenceId: i + 1,
    requestId: "req-1",
    type: "tool:executed" as const,
    payload: {},
    timestamp: Date.now(),
    ...e,
  }));

  return {
    append: vi.fn(() => 0),
    getByRequestId: vi.fn(() => fullEvents),
    getByCorrelationId: vi.fn(() => []),
    getRecent: vi.fn(() => fullEvents),
    get size() {
      return fullEvents.length;
    },
    clear: vi.fn(),
  };
}

function createAuditContext(overrides?: Partial<AuditContext>): AuditContext {
  return {
    requestId: "req-1",
    correlationId: "corr-1",
    identityConfig: {
      coreValues: ["helpfulness"],
      communicationStyle: {
        tone: "casual",
        verbosity: "balanced",
        personaVoice: "default",
      },
      hardBoundaries: [],
      softPreferences: {},
      identityVersion: 1,
    } as any,
    recentOutputs: ["Hello there", "How can I help?"],
    ...overrides,
  };
}

describe("DriftAwareAuditor", () => {
  describe("audit()", () => {
    it("calls DriftMonitor.analyze()", async () => {
      const dm = createMockDriftMonitor(0.05);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const ctx = createAuditContext();
      await auditor.audit(ctx);

      expect(dm.analyze).toHaveBeenCalledWith(
        ctx.recentOutputs,
        ctx.identityConfig,
      );
    });

    it("queries EventStore for events", async () => {
      const dm = createMockDriftMonitor(0.05);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const ctx = createAuditContext();
      const report = await auditor.audit(ctx);

      expect(es.getByRequestId).toHaveBeenCalledWith("req-1");
      expect(report.eventCount).toBe(0);
    });

    it("detects anomalies from high drift scores", async () => {
      const dm = createMockDriftMonitor(0.3);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const report = await auditor.audit(createAuditContext());

      expect(report.anomalies.some((a) => a.includes("High drift score"))).toBe(
        true,
      );
    });

    it("detects anomalies from verification failures in event trail", async () => {
      const dm = createMockDriftMonitor(0.05);
      const es = createMockEventStore([
        { type: "tool:failed", payload: { error: "timeout" } },
      ]);
      const auditor = new DriftAwareAuditor(dm, es);

      const report = await auditor.audit(createAuditContext());

      expect(report.anomalies.some((a) => a.includes("Tool failure"))).toBe(
        true,
      );
    });

    it("produces recommendations when drift is above threshold", async () => {
      const dm = createMockDriftMonitor(0.2);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const report = await auditor.audit(createAuditContext());

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some((r) => r.includes("drift"))).toBe(
        true,
      );
    });

    it("works with empty event trail", async () => {
      const dm = createMockDriftMonitor(0.05);
      const es = createMockEventStore([]);
      const auditor = new DriftAwareAuditor(dm, es);

      const report = await auditor.audit(createAuditContext());

      expect(report.eventCount).toBe(0);
      expect(report.anomalies).toHaveLength(0);
    });

    it("includes auditedAt timestamp", async () => {
      const dm = createMockDriftMonitor(0.05);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const before = Date.now();
      const report = await auditor.audit(createAuditContext());

      expect(report.auditedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("getDriftReport()", () => {
    it("delegates to DriftMonitor", () => {
      const dm = createMockDriftMonitor(0.1);
      const es = createMockEventStore();
      const auditor = new DriftAwareAuditor(dm, es);

      const report = auditor.getDriftReport();
      expect(dm.getCurrentDrift).toHaveBeenCalled();
      expect(report?.driftScore).toBe(0.1);
    });
  });

  describe("queryEvents()", () => {
    it("delegates to EventStore", () => {
      const dm = createMockDriftMonitor();
      const es = createMockEventStore([
        { requestId: "req-42", type: "tool:executed" },
      ]);
      const auditor = new DriftAwareAuditor(dm, es);

      const events = auditor.queryEvents("req-42");
      expect(es.getByRequestId).toHaveBeenCalledWith("req-42");
    });
  });
});
