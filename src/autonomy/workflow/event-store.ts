/**
 * In-Memory Event Store — append-only bounded execution log.
 *
 * Records execution events with monotonically increasing sequence IDs
 * and provides fast lookup by request ID via a secondary index.
 * Uses FIFO eviction when the store exceeds maxEvents.
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
  ): number {
    const sequenceId = this.nextSequenceId++;
    const event: ExecutionEvent = {
      sequenceId,
      requestId,
      type,
      payload,
      timestamp: Date.now(),
    };

    this.events.push(event);

    // Update secondary index
    const indices = this.requestIndex.get(requestId);
    if (indices) {
      indices.push(this.events.length - 1);
    } else {
      this.requestIndex.set(requestId, [this.events.length - 1]);
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

  getRecent(n: number): ExecutionEvent[] {
    if (n <= 0) return [];
    const start = Math.max(0, this.events.length - n);
    return this.events.slice(start);
  }

  clear(): void {
    this.events = [];
    this.requestIndex.clear();
    this.nextSequenceId = 1;
  }

  private evict(): void {
    while (this.events.length > this.maxEvents) {
      const evicted = this.events.shift();
      if (!evicted) break;
      // Remove evicted event's index entry
      const indices = this.requestIndex.get(evicted.requestId);
      if (indices) {
        indices.shift();
        if (indices.length === 0) {
          this.requestIndex.delete(evicted.requestId);
        }
      }
      // Adjust all indices down by 1 since we removed from the front
      for (const [, arr] of this.requestIndex) {
        for (let i = 0; i < arr.length; i++) {
          arr[i]--;
        }
      }
    }
  }
}
