import { describe, expect, it } from "vitest";
import {
  rebuildAllRequestProjections,
  rebuildRequestProjection,
} from "./event-projections.js";
import type { ExecutionEvent } from "./types.js";

function makeEvent(overrides: Partial<ExecutionEvent>): ExecutionEvent {
  return {
    sequenceId: 1,
    requestId: "req-1",
    type: "tool:proposed",
    payload: {},
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe("event projections", () => {
  it("rebuilds a succeeded projection from verified events", () => {
    const projection = rebuildRequestProjection([
      makeEvent({ sequenceId: 1, type: "tool:proposed" }),
      makeEvent({ sequenceId: 2, type: "tool:validated" }),
      makeEvent({ sequenceId: 3, type: "tool:executed" }),
      makeEvent({ sequenceId: 4, type: "tool:verified" }),
    ]);

    expect(projection.requestId).toBe("req-1");
    expect(projection.status).toBe("succeeded");
    expect(projection.eventCount).toBe(4);
    expect(projection.lastError).toBeUndefined();
  });

  it("rebuilds failed projection and extracts last error", () => {
    const projection = rebuildRequestProjection([
      makeEvent({ sequenceId: 1, type: "tool:proposed" }),
      makeEvent({
        sequenceId: 2,
        type: "tool:failed",
        payload: { reason: "validation_failed" },
      }),
      makeEvent({
        sequenceId: 3,
        type: "tool:failed",
        payload: { error: "execution exploded" },
      }),
    ]);

    expect(projection.status).toBe("failed");
    expect(projection.lastError).toBe("execution exploded");
  });

  it("marks projection with critical invariant violation", () => {
    const projection = rebuildRequestProjection([
      makeEvent({ sequenceId: 1, type: "tool:proposed", correlationId: "corr-1" }),
      makeEvent({
        sequenceId: 2,
        type: "tool:invariants:checked",
        payload: { hasCriticalViolation: true },
        correlationId: "corr-1",
      }),
      makeEvent({
        sequenceId: 3,
        type: "tool:failed",
        payload: { reason: "critical_invariant_violation" },
        correlationId: "corr-1",
      }),
    ]);

    expect(projection.hasCriticalInvariantViolation).toBe(true);
    expect(projection.status).toBe("failed");
    expect(projection.correlationIds).toEqual(["corr-1"]);
  });

  it("rebuilds projections for multiple requests", () => {
    const projections = rebuildAllRequestProjections([
      makeEvent({ sequenceId: 1, requestId: "req-a", type: "tool:proposed" }),
      makeEvent({ sequenceId: 2, requestId: "req-b", type: "tool:proposed" }),
      makeEvent({ sequenceId: 3, requestId: "req-a", type: "tool:verified" }),
      makeEvent({
        sequenceId: 4,
        requestId: "req-b",
        type: "tool:failed",
        payload: { reason: "boom" },
      }),
    ]);

    expect(projections).toHaveLength(2);
    expect(projections[0].requestId).toBe("req-a");
    expect(projections[0].status).toBe("succeeded");
    expect(projections[1].requestId).toBe("req-b");
    expect(projections[1].status).toBe("failed");
  });
});
