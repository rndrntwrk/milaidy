/**
 * In-Memory Event Store — append-only bounded execution log.
 *
 * Records execution events with monotonically increasing sequence IDs
 * and provides fast lookup by request ID and correlation ID via
 * secondary indices. Uses FIFO eviction when the store exceeds maxEvents.
 *
 * @module autonomy/workflow/event-store
 */

import type {
  EventStoreInterface,
  ExecutionEvent,
  ExecutionEventType,
} from "./types.js";
import { computeEventHash } from "./event-integrity.js";

/** Default maximum number of events to retain. */
const DEFAULT_MAX_EVENTS = 10_000;
/** Default retention window (0 = disabled). */
const DEFAULT_RETENTION_MS = 0;

type InMemoryEventStoreOptions =
  | number
  | {
      maxEvents?: number;
      retentionMs?: number;
    };

export class InMemoryEventStore implements EventStoreInterface {
  private events: ExecutionEvent[] = [];
  private requestIndex = new Map<string, number[]>();
  private correlationIndex = new Map<string, number[]>();
  private nextSequenceId = 1;
  private maxEvents: number;
  private retentionMs: number;

  constructor(options: InMemoryEventStoreOptions = DEFAULT_MAX_EVENTS) {
    if (typeof options === "number") {
      this.maxEvents = Math.max(options, 1);
      this.retentionMs = DEFAULT_RETENTION_MS;
      return;
    }
    this.maxEvents = Math.max(options.maxEvents ?? DEFAULT_MAX_EVENTS, 1);
    this.retentionMs = Math.max(options.retentionMs ?? DEFAULT_RETENTION_MS, 0);
  }

  get size(): number {
    return this.events.length;
  }

  async append(
    requestId: string,
    type: ExecutionEventType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<number> {
    const sequenceId = this.nextSequenceId++;
    const timestamp = Date.now();
    const prevHash =
      this.events.length > 0
        ? this.events[this.events.length - 1].eventHash
        : undefined;
    const eventHash = computeEventHash({
      requestId,
      type,
      payload,
      timestamp,
      correlationId,
      prevHash,
    });
    const event: ExecutionEvent = {
      sequenceId,
      requestId,
      type,
      payload,
      timestamp,
      ...(correlationId !== undefined ? { correlationId } : {}),
      ...(prevHash ? { prevHash } : {}),
      eventHash,
    };

    this.events.push(event);
    const idx = this.events.length - 1;

    // Update request index
    const requestIndices = this.requestIndex.get(requestId);
    if (requestIndices) {
      requestIndices.push(idx);
    } else {
      this.requestIndex.set(requestId, [idx]);
    }

    // Update correlation index
    if (correlationId !== undefined) {
      const corrIndices = this.correlationIndex.get(correlationId);
      if (corrIndices) {
        corrIndices.push(idx);
      } else {
        this.correlationIndex.set(correlationId, [idx]);
      }
    }

    // FIFO + time-window eviction
    this.evict(timestamp);

    return sequenceId;
  }

  async getByRequestId(requestId: string): Promise<ExecutionEvent[]> {
    this.evict(Date.now());
    const indices = this.requestIndex.get(requestId);
    if (!indices) return [];
    return indices
      .filter((i) => i < this.events.length)
      .map((i) => this.events[i]);
  }

  async getByCorrelationId(correlationId: string): Promise<ExecutionEvent[]> {
    this.evict(Date.now());
    const indices = this.correlationIndex.get(correlationId);
    if (!indices) return [];
    return indices
      .filter((i) => i < this.events.length)
      .map((i) => this.events[i]);
  }

  async getRecent(n: number): Promise<ExecutionEvent[]> {
    this.evict(Date.now());
    if (n <= 0) return [];
    const start = Math.max(0, this.events.length - n);
    return this.events.slice(start);
  }

  clear(): void {
    this.events = [];
    this.requestIndex.clear();
    this.correlationIndex.clear();
    this.nextSequenceId = 1;
  }

  private evict(now: number): void {
    if (this.retentionMs > 0) {
      const cutoff = now - this.retentionMs;
      while (
        this.events.length > 0 &&
        this.events[0].timestamp < cutoff
      ) {
        this.removeOldest();
      }
    }

    while (this.events.length > this.maxEvents) {
      this.removeOldest();
    }
  }

  private removeOldest(): void {
    const evicted = this.events.shift();
    if (!evicted) return;

    // Remove evicted event's request index entry
    const reqIndices = this.requestIndex.get(evicted.requestId);
    if (reqIndices) {
      reqIndices.shift();
      if (reqIndices.length === 0) {
        this.requestIndex.delete(evicted.requestId);
      }
    }

    // Remove evicted event's correlation index entry
    if (evicted.correlationId) {
      const corrIndices = this.correlationIndex.get(evicted.correlationId);
      if (corrIndices) {
        corrIndices.shift();
        if (corrIndices.length === 0) {
          this.correlationIndex.delete(evicted.correlationId);
        }
      }
    }

    // Adjust all indices down by 1 since we removed from the front
    for (const [, arr] of this.requestIndex) {
      for (let i = 0; i < arr.length; i++) {
        arr[i]--;
      }
    }
    for (const [, arr] of this.correlationIndex) {
      for (let i = 0; i < arr.length; i++) {
        arr[i]--;
      }
    }
  }
}
