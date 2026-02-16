/**
 * DriftAwareAuditor — AuditorRole implementation.
 *
 * Wraps DriftMonitor and EventStore to provide audit capabilities
 * including drift analysis and event trail inspection.
 *
 * @module autonomy/roles/auditor
 */

import type {
  DriftReport,
  PersonaDriftMonitor,
} from "../identity/drift-monitor.js";
import type { EventStoreInterface, ExecutionEvent } from "../workflow/types.js";
import type { AuditContext, AuditorRole, AuditReport } from "./types.js";

export class DriftAwareAuditor implements AuditorRole {
  constructor(
    private readonly driftMonitor: PersonaDriftMonitor,
    private readonly eventStore: EventStoreInterface,
  ) {}

  async audit(context: AuditContext): Promise<AuditReport> {
    // 1. Run drift analysis
    const driftReport = await this.driftMonitor.analyze(
      context.recentOutputs,
      context.identityConfig,
    );

    // 2. Query events for this request
    const events = this.eventStore.getByRequestId(context.requestId);

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

    return {
      driftReport,
      eventCount: events.length,
      anomalies,
      recommendations,
      auditedAt: Date.now(),
    };
  }

  getDriftReport(): DriftReport | null {
    return this.driftMonitor.getCurrentDrift();
  }

  queryEvents(requestId: string): ExecutionEvent[] {
    return this.eventStore.getByRequestId(requestId);
  }
}
