/**
 * Compensation incident workflow state manager.
 *
 * Tracks unresolved compensation failures for operator follow-up.
 *
 * @module autonomy/workflow/compensation-incidents
 */

import type {
  CompensationIncident,
  CompensationIncidentManagerInterface,
} from "./types.js";

const INCIDENT_ID_PREFIX = "comp-incident-";

function cloneIncident(incident: CompensationIncident): CompensationIncident {
  return { ...incident };
}

export class CompensationIncidentManager
implements CompensationIncidentManagerInterface {
  private incidents = new Map<string, CompensationIncident>();
  private nextId = 1;

  openIncident(
    input: Parameters<CompensationIncidentManagerInterface["openIncident"]>[0],
  ): CompensationIncident {
    const now = Date.now();
    const id = `${INCIDENT_ID_PREFIX}${this.nextId++}`;
    const incident: CompensationIncident = {
      id,
      requestId: input.requestId,
      toolName: input.toolName,
      correlationId: input.correlationId,
      reason: input.reason,
      compensationAttempted: input.compensationAttempted,
      compensationSuccess: input.compensationSuccess,
      compensationDetail: input.compensationDetail,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };

    this.incidents.set(id, incident);
    return cloneIncident(incident);
  }

  acknowledgeIncident(
    incidentId: string,
    actor: string,
  ): CompensationIncident | undefined {
    const existing = this.incidents.get(incidentId);
    if (!existing || existing.status === "resolved") return undefined;
    if (existing.status === "acknowledged") return cloneIncident(existing);

    const now = Date.now();
    const updated: CompensationIncident = {
      ...existing,
      status: "acknowledged",
      acknowledgedAt: now,
      acknowledgedBy: actor,
      updatedAt: now,
    };
    this.incidents.set(incidentId, updated);
    return cloneIncident(updated);
  }

  resolveIncident(
    incidentId: string,
    actor: string,
    resolutionNote?: string,
  ): CompensationIncident | undefined {
    const existing = this.incidents.get(incidentId);
    if (!existing) return undefined;
    if (existing.status === "resolved") return cloneIncident(existing);

    const now = Date.now();
    const updated: CompensationIncident = {
      ...existing,
      status: "resolved",
      resolvedAt: now,
      resolvedBy: actor,
      updatedAt: now,
      ...(resolutionNote ? { resolutionNote } : {}),
    };
    this.incidents.set(incidentId, updated);
    return cloneIncident(updated);
  }

  getIncidentById(incidentId: string): CompensationIncident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) return undefined;
    return cloneIncident(incident);
  }

  listOpenIncidents(): CompensationIncident[] {
    return this.listByStatus("open", "acknowledged");
  }

  listIncidents(): CompensationIncident[] {
    return Array.from(this.incidents.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(cloneIncident);
  }

  private listByStatus(...statuses: CompensationIncident["status"][]): CompensationIncident[] {
    const allowed = new Set(statuses);
    return Array.from(this.incidents.values())
      .filter((incident) => allowed.has(incident.status))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(cloneIncident);
  }
}
