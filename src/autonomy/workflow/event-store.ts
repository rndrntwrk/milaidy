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

/** Default maximum number of events to retain. */
const DEFAULT_MAX_EVENTS = 10_000;

export class InMemoryEventStore implements EventStoreInterface {
  private events: ExecutionEvent[] = [];
  private requestIndex = new Map<string, number[]>();
  private correlationIndex = new Map<string, number[]>();
  private nextSequenceId = 1;
  private maxEvents: number;

  constructor(maxEvents = DEFAULT_MAX_EVENTS) {
    this.maxEvents = Math.max(maxEvents, 1);
  }

  get size(): number {
    return this.events.length;
  }

  append(
    requestId: string,
    type: ExecutionEventType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): number {
    const sequenceId = this.nextSequenceId++;
    const event: ExecutionEvent = {
      sequenceId,
      requestId,
      type,
      payload,
      timestamp: Date.now(),
      ...(correlationId !== undefined ? { correlationId } : {}),
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

    // FIFO eviction
    this.evict();

    return sequenceId;
  }

  getByRequestId(requestId: string): ExecutionEvent[] {
    const indices = this.requestIndex.get(requestId);
    if (!indices) return [];
    return indices
      .filter((i) => i < this.events.length)
      .map((i) => this.events[i]);
  }

  getByCorrelationId(correlationId: string): ExecutionEvent[] {
    const indices = this.correlationIndex.get(correlationId);
    if (!indices) return [];
    return indices
      .filter((i) => i < this.events.length)
      .map((i) => this.events[i]);
  }

  getRecent(n: number): ExecutionEvent[] {
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

  private evict(): void {
    while (this.events.length > this.maxEvents) {
      const evicted = this.events.shift();
      if (!evicted) break;

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
}
