/**
 * Event projection/rebuild utilities for append-only workflow event logs.
 *
 * @module autonomy/workflow/event-projections
 */

import type { ExecutionEvent } from "./types.js";

export type RequestProjectionStatus =
  | "succeeded"
  | "failed"
  | "in_progress"
  | "unknown";

export interface RequestProjection {
  requestId: string;
  firstSequenceId: number;
  lastSequenceId: number;
  firstTimestamp: number;
  lastTimestamp: number;
  eventCount: number;
  status: RequestProjectionStatus;
  hasCompensation: boolean;
  hasUnresolvedCompensationIncident: boolean;
  hasVerificationFailure: boolean;
  hasCriticalInvariantViolation: boolean;
  correlationIds: string[];
  lastError?: string;
}

/**
 * Rebuild a single request-level projection from its events.
 */
export function rebuildRequestProjection(events: ExecutionEvent[]): RequestProjection {
  if (events.length === 0) {
    return {
      requestId: "",
      firstSequenceId: 0,
      lastSequenceId: 0,
      firstTimestamp: 0,
      lastTimestamp: 0,
      eventCount: 0,
      status: "unknown",
      hasCompensation: false,
      hasUnresolvedCompensationIncident: false,
      hasVerificationFailure: false,
      hasCriticalInvariantViolation: false,
      correlationIds: [],
    };
  }

  const ordered = [...events].sort((a, b) => a.sequenceId - b.sequenceId);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const hasFailedEvent = ordered.some((event) => event.type === "tool:failed");
  const hasVerifiedEvent = ordered.some((event) => event.type === "tool:verified");
  const hasExecutingEvent = ordered.some((event) => event.type === "tool:executing");
  const hasCompensation = ordered.some((event) => event.type === "tool:compensated");
  const hasUnresolvedCompensationIncident = ordered.some(
    (event) => event.type === "tool:compensation:incident:opened",
  );
  const hasVerificationFailure = ordered.some((event) => {
    if (event.type !== "tool:verified") return false;
    return event.payload.hasCriticalFailure === true;
  });
  const hasCriticalInvariantViolation = ordered.some((event) => {
    if (event.type === "tool:invariants:checked") {
      return event.payload.hasCriticalViolation === true;
    }
    if (event.type === "tool:failed") {
      return event.payload.reason === "critical_invariant_violation";
    }
    return false;
  });

  let status: RequestProjectionStatus = "unknown";
  if (hasFailedEvent) {
    status = "failed";
  } else if (hasVerifiedEvent) {
    status = "succeeded";
  } else if (hasExecutingEvent || ordered.length > 0) {
    status = "in_progress";
  }

  const failedEvents = ordered.filter((event) => event.type === "tool:failed");
  const lastFailure = failedEvents[failedEvents.length - 1];
  const lastError =
    lastFailure && typeof lastFailure.payload.error === "string"
      ? lastFailure.payload.error
      : lastFailure && typeof lastFailure.payload.reason === "string"
        ? lastFailure.payload.reason
        : undefined;

  const correlationIds = Array.from(
    new Set(
      ordered
        .map((event) => event.correlationId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  return {
    requestId: first.requestId,
    firstSequenceId: first.sequenceId,
    lastSequenceId: last.sequenceId,
    firstTimestamp: first.timestamp,
    lastTimestamp: last.timestamp,
    eventCount: ordered.length,
    status,
    hasCompensation,
    hasUnresolvedCompensationIncident,
    hasVerificationFailure,
    hasCriticalInvariantViolation,
    correlationIds,
    ...(lastError ? { lastError } : {}),
  };
}

/**
 * Rebuild projections for all request IDs represented in the event set.
 */
export function rebuildAllRequestProjections(
  events: ExecutionEvent[],
): RequestProjection[] {
  const byRequest = new Map<string, ExecutionEvent[]>();
  for (const event of events) {
    const arr = byRequest.get(event.requestId);
    if (arr) {
      arr.push(event);
    } else {
      byRequest.set(event.requestId, [event]);
    }
  }

  return Array.from(byRequest.values())
    .map((requestEvents) => rebuildRequestProjection(requestEvents))
    .sort((a, b) => a.firstSequenceId - b.firstSequenceId);
}
