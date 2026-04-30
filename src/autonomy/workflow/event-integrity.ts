/**
 * Event-log integrity helpers for tamper-evident hash chains.
 *
 * @module autonomy/workflow/event-integrity
 */

import { createHash } from "node:crypto";
import type { ExecutionEvent } from "./types.js";

export interface EventHashInput {
  requestId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  prevHash?: string;
}

export interface EventChainVerification {
  valid: boolean;
  checkedEvents: number;
  firstInvalidSequenceId?: number;
  reason?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [key, entry] of entries) {
      out[key] = canonicalizeValue(entry);
    }
    return out;
  }
  return value;
}

/**
 * Compute a deterministic SHA-256 hash for an execution event.
 */
export function computeEventHash(input: EventHashInput): string {
  const canonical = JSON.stringify({
    requestId: input.requestId,
    type: input.type,
    payload: canonicalizeValue(input.payload),
    timestamp: input.timestamp,
    correlationId: input.correlationId ?? null,
    prevHash: input.prevHash ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Verify continuity and content hashes for an event slice.
 *
 * This verification is slice-aware: the first event's `prevHash` can be any
 * value (e.g. when older events are truncated), but each subsequent event must
 * chain to the prior event hash.
 */
export function verifyEventChain(events: ExecutionEvent[]): EventChainVerification {
  if (events.length === 0) {
    return { valid: true, checkedEvents: 0 };
  }

  const ordered = [...events].sort((a, b) => a.sequenceId - b.sequenceId);
  let expectedPrevHash = ordered[0].prevHash;

  for (const event of ordered) {
    if (event.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checkedEvents: ordered.length,
        firstInvalidSequenceId: event.sequenceId,
        reason: "prev_hash_mismatch",
      };
    }

    if (!event.eventHash) {
      return {
        valid: false,
        checkedEvents: ordered.length,
        firstInvalidSequenceId: event.sequenceId,
        reason: "missing_event_hash",
      };
    }

    const computed = computeEventHash({
      requestId: event.requestId,
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      prevHash: event.prevHash,
    });

    if (computed !== event.eventHash) {
      return {
        valid: false,
        checkedEvents: ordered.length,
        firstInvalidSequenceId: event.sequenceId,
        reason: "event_hash_mismatch",
      };
    }

    expectedPrevHash = event.eventHash;
  }

  return { valid: true, checkedEvents: ordered.length };
}
