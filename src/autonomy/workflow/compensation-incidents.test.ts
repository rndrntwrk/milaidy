import { describe, expect, it } from "vitest";
import { CompensationIncidentManager } from "./compensation-incidents.js";

describe("CompensationIncidentManager", () => {
  it("opens incidents and keeps them ordered", () => {
    const manager = new CompensationIncidentManager();

    const first = manager.openIncident({
      requestId: "req-1",
      toolName: "CREATE_TASK",
      correlationId: "corr-1",
      reason: "critical_verification_failure",
      compensationAttempted: true,
      compensationSuccess: false,
      compensationDetail: "Manual compensation required",
    });
    const second = manager.openIncident({
      requestId: "req-2",
      toolName: "PHETTA_NOTIFY",
      correlationId: "corr-2",
      reason: "critical_invariant_violation",
      compensationAttempted: false,
      compensationSuccess: false,
    });

    expect(first.id).toBe("comp-incident-1");
    expect(second.id).toBe("comp-incident-2");

    const all = manager.listIncidents();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(first.id);
    expect(all[1].id).toBe(second.id);
  });

  it("supports acknowledge and resolve workflow transitions", () => {
    const manager = new CompensationIncidentManager();
    const incident = manager.openIncident({
      requestId: "req-3",
      toolName: "CREATE_TASK",
      correlationId: "corr-3",
      reason: "critical_verification_failure",
      compensationAttempted: true,
      compensationSuccess: false,
      compensationDetail: "Manual compensation required",
    });

    const acknowledged = manager.acknowledgeIncident(incident.id, "operator-1");
    expect(acknowledged?.status).toBe("acknowledged");
    expect(acknowledged?.acknowledgedBy).toBe("operator-1");

    const openAfterAck = manager.listOpenIncidents();
    expect(openAfterAck).toHaveLength(1);
    expect(openAfterAck[0].status).toBe("acknowledged");

    const resolved = manager.resolveIncident(
      incident.id,
      "operator-2",
      "Rollback completed manually",
    );
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolvedBy).toBe("operator-2");
    expect(resolved?.resolutionNote).toBe("Rollback completed manually");

    expect(manager.listOpenIncidents()).toHaveLength(0);
  });

  it("rejects invalid acknowledge transitions and handles unknown IDs", () => {
    const manager = new CompensationIncidentManager();
    const incident = manager.openIncident({
      requestId: "req-4",
      toolName: "CREATE_TASK",
      correlationId: "corr-4",
      reason: "critical_verification_failure",
      compensationAttempted: true,
      compensationSuccess: false,
    });

    const resolved = manager.resolveIncident(incident.id, "operator");
    expect(resolved?.status).toBe("resolved");

    expect(manager.acknowledgeIncident(incident.id, "operator-2")).toBeUndefined();
    expect(manager.acknowledgeIncident("does-not-exist", "operator")).toBeUndefined();
    expect(manager.resolveIncident("does-not-exist", "operator")).toBeUndefined();
  });
});
