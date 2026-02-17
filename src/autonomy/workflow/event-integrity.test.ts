import { describe, expect, it } from "vitest";
import { computeEventHash, verifyEventChain } from "./event-integrity.js";
import type { ExecutionEvent } from "./types.js";

function withHash(event: Omit<ExecutionEvent, "eventHash">): ExecutionEvent {
  const eventHash = computeEventHash({
    requestId: event.requestId,
    type: event.type,
    payload: event.payload,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
    prevHash: event.prevHash,
  });
  return { ...event, eventHash };
}

describe("event integrity", () => {
  it("produces stable hashes for identical input", () => {
    const input = {
      requestId: "req-1",
      type: "tool:proposed",
      payload: { a: 1 },
      timestamp: 1000,
      correlationId: "corr-1",
      prevHash: "abc",
    };
    expect(computeEventHash(input)).toBe(computeEventHash(input));
  });

  it("normalizes payload key ordering before hashing", () => {
    const base = {
      requestId: "req-1",
      type: "tool:proposed",
      timestamp: 1000,
      correlationId: "corr-1",
      prevHash: "abc",
    };
    const hashA = computeEventHash({
      ...base,
      payload: { z: true, nested: { b: 2, a: 1 }, a: 1 },
    });
    const hashB = computeEventHash({
      ...base,
      payload: { a: 1, nested: { a: 1, b: 2 }, z: true },
    });
    expect(hashA).toBe(hashB);
  });

  it("verifies a valid hash chain", () => {
    const first = withHash({
      sequenceId: 1,
      requestId: "req-1",
      type: "tool:proposed",
      payload: {},
      timestamp: 1000,
      prevHash: undefined,
    });
    const second = withHash({
      sequenceId: 2,
      requestId: "req-1",
      type: "tool:validated",
      payload: { valid: true },
      timestamp: 1010,
      prevHash: first.eventHash,
    });

    expect(verifyEventChain([first, second])).toEqual({
      valid: true,
      checkedEvents: 2,
    });
  });

  it("detects hash tampering", () => {
    const first = withHash({
      sequenceId: 1,
      requestId: "req-1",
      type: "tool:proposed",
      payload: {},
      timestamp: 1000,
      prevHash: undefined,
    });
    const second = withHash({
      sequenceId: 2,
      requestId: "req-1",
      type: "tool:validated",
      payload: { valid: true },
      timestamp: 1010,
      prevHash: first.eventHash,
    });

    const tampered: ExecutionEvent = {
      ...second,
      payload: { valid: false },
    };

    const result = verifyEventChain([first, tampered]);
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequenceId).toBe(2);
    expect(result.reason).toBe("event_hash_mismatch");
  });
});
