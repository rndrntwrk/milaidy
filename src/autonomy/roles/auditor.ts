/**
 * DriftAwareAuditor — AuditorRole implementation.
 *
 * Wraps DriftMonitor and EventStore to provide audit capabilities
 * including drift analysis and event trail inspection.
 *
 * @module autonomy/roles/auditor
 */

import { logger } from "@elizaos/core";

import type {
  DriftReport,
  PersonaDriftMonitor,
} from "../identity/drift-monitor.js";
import {
  recordRoleExecution,
  recordRoleLatencyMs,
} from "../metrics/prometheus-metrics.js";
import type { EventStoreInterface, ExecutionEvent } from "../workflow/types.js";
import type { AuditContext, AuditorRole, AuditReport } from "./types.js";

export const AUDITOR_DRIFT_REPORT_EVENT_TYPE = "identity:drift:report" as const;

export class DriftAwareAuditor implements AuditorRole {
  constructor(
    private readonly driftMonitor: PersonaDriftMonitor,
    private readonly eventStore: EventStoreInterface,
  ) {}

  async audit(context: AuditContext): Promise<AuditReport> {
    const startedAt = Date.now();
    try {
      // 1. Run drift analysis
      const driftReport = await this.driftMonitor.analyze(
        context.recentOutputs,
        context.identityConfig,
      );

      // 2. Query events for this request
      const events = await this.eventStore.getByRequestId(context.requestId);

      // 3. Detect anomalies
      const anomalies: string[] = [];
      const recommendations: string[] = [];

      // Check drift score
      if (driftReport.driftScore > 0.25) {
        anomalies.push(`High drift score: ${driftReport.driftScore.toFixed(3)}`);
      }
      if (driftReport.driftScore > 0.15) {
        recommendations.push("Review recent outputs for persona drift");
      }

      // Check for verification failures in event trail
      for (const event of events) {
        if (event.type === "tool:failed") {
          anomalies.push(
            `Tool failure detected in event trail: ${event.payload.error ?? "unknown"}`,
          );
        }
        if (event.type === "tool:verified" && event.payload.hasCriticalFailure) {
          anomalies.push("Verification critical failure in event trail");
        }
      }

      // Add drift corrections as recommendations
      for (const correction of driftReport.corrections) {
        recommendations.push(correction);
      }

      const report = {
        driftReport,
        eventCount: events.length,
        anomalies,
        recommendations,
        auditedAt: Date.now(),
      };

      await this.persistDriftReport(context, report);

      recordRoleLatencyMs("auditor", Date.now() - startedAt);
      recordRoleExecution("auditor", anomalies.length > 0 ? "failure" : "success");
      return report;
    } catch (error) {
      recordRoleLatencyMs("auditor", Date.now() - startedAt);
      recordRoleExecution("auditor", "failure");
      throw error;
    }
  }

  getDriftReport(): DriftReport | null {
    return this.driftMonitor.getCurrentDrift();
  }

  async queryEvents(requestId: string): Promise<ExecutionEvent[]> {
    return this.eventStore.getByRequestId(requestId);
  }

  private async persistDriftReport(
    context: AuditContext,
    report: AuditReport,
  ): Promise<void> {
    try {
      await this.eventStore.append(
        context.requestId,
        AUDITOR_DRIFT_REPORT_EVENT_TYPE,
        {
          driftScore: report.driftReport.driftScore,
          severity: report.driftReport.severity,
          dimensions: report.driftReport.dimensions,
          windowSize: report.driftReport.windowSize,
          corrections: report.driftReport.corrections,
          analyzedAt: report.driftReport.analyzedAt,
          eventCount: report.eventCount,
          anomalies: report.anomalies,
          recommendations: report.recommendations,
          auditedAt: report.auditedAt,
        },
        context.correlationId,
      );
    } catch (error) {
      logger.warn(
        `[autonomy:auditor] Failed to persist drift report for request ${context.requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
