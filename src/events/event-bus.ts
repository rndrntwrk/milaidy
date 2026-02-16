/**
 * Typed Event Bus — centralized event-driven communication.
 *
 * Provides type-safe event emission and subscription with:
 * - Compile-time type checking for event payloads
 * - Local EventEmitter-based dispatch
 * - Optional Redis pub/sub for distributed deployments
 * - Subscription tracking and cleanup
 * - waitFor() with timeout support
 *
 * @module events/event-bus
 */

import { EventEmitter } from "node:events";
import { logger } from "@elizaos/core";

// ---------- Event Type Definitions ----------

/**
 * Agent lifecycle states.
 */
export type AgentState =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

/**
 * All Milaidy event types with their payloads.
 */
export interface MilaidyEvents {
  // ── System Lifecycle ──────────────────────────────────────────────────
  "system:startup": {
    version: string;
    startedAt: number;
    nodeVersion: string;
    platform: string;
  };
  "system:shutdown": {
    reason: string;
    code: number;
    uptime: number;
  };
  "system:config:changed": {
    path: string;
    oldValue: unknown;
    newValue: unknown;
  };
  "system:config:reloaded": {
    changedPaths: string[];
    timestamp: number;
  };
  "system:error": {
    error: Error;
    context: string;
    recoverable: boolean;
  };

  // ── Agent Events ──────────────────────────────────────────────────────
  "agent:message:received": {
    agentId: string;
    messageId: string;
    channel: string;
    content: string;
    userId?: string;
    metadata: Record<string, unknown>;
  };
  "agent:message:sent": {
    agentId: string;
    messageId: string;
    channel: string;
    content: string;
    tokens: { input: number; output: number };
    durationMs: number;
  };
  "agent:action:started": {
    agentId: string;
    action: string;
    params: unknown;
    requestId: string;
  };
  "agent:action:completed": {
    agentId: string;
    action: string;
    result: unknown;
    durationMs: number;
    requestId: string;
  };
  "agent:action:failed": {
    agentId: string;
    action: string;
    error: string;
    requestId: string;
  };
  "agent:state:changed": {
    agentId: string;
    from: AgentState;
    to: AgentState;
    reason?: string;
  };

  // ── Plugin Events ─────────────────────────────────────────────────────
  "plugin:loaded": {
    name: string;
    version: string;
    permissions: string[];
    loadTimeMs: number;
  };
  "plugin:unloaded": {
    name: string;
    reason: string;
  };
  "plugin:error": {
    name: string;
    error: Error;
    recoverable: boolean;
  };
  "plugin:permission:requested": {
    name: string;
    permission: string;
    reason: string;
  };
  "plugin:permission:granted": {
    name: string;
    permission: string;
  };
  "plugin:permission:denied": {
    name: string;
    permission: string;
    reason: string;
  };

  // ── Session Events ────────────────────────────────────────────────────
  "session:created": {
    sessionId: string;
    channel: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  };
  "session:message": {
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    messageId: string;
  };
  "session:ended": {
    sessionId: string;
    reason: string;
    messageCount: number;
    durationMs: number;
  };

  // ── Security Events ───────────────────────────────────────────────────
  "security:auth:success": {
    ip: string;
    method: string;
    userId?: string;
  };
  "security:auth:failure": {
    ip: string;
    reason: string;
    attemptCount: number;
  };
  "security:rate:exceeded": {
    ip: string;
    endpoint: string;
    limit: number;
    windowMs: number;
  };
  "security:permission:denied": {
    plugin: string;
    permission: string;
    operation: string;
  };
  "security:pairing:started": {
    sessionId: string;
    ip: string;
  };
  "security:pairing:completed": {
    sessionId: string;
    ip: string;
    deviceFingerprint?: string;
  };
  "security:pairing:failed": {
    sessionId: string;
    ip: string;
    reason: string;
  };

  // ── API Events ────────────────────────────────────────────────────────
  "api:request:started": {
    requestId: string;
    method: string;
    path: string;
    ip: string;
  };
  "api:request:completed": {
    requestId: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  };
  "api:websocket:connected": {
    clientId: string;
    ip: string;
  };
  "api:websocket:disconnected": {
    clientId: string;
    reason: string;
  };

  // ── Autonomy Kernel Events ─────────────────────────────────────────
  "autonomy:trust:scored": {
    sourceId: string;
    contentHash: string;
    score: number;
    dimensions: Record<string, number>;
  };
  "autonomy:memory:gated": {
    memoryId: string;
    decision: "allow" | "quarantine" | "reject";
    trustScore: number;
    reason: string;
  };
  "autonomy:memory:quarantine:reviewed": {
    memoryId: string;
    decision: "approve" | "reject";
    reviewedBy: string;
  };
  "autonomy:identity:drift": {
    agentId: string;
    driftScore: number;
    severity: string;
    corrections: string[];
  };
  "autonomy:goal:created": {
    goalId: string;
    description: string;
    priority: string;
    source: string;
  };
  "autonomy:goal:completed": {
    goalId: string;
    evidence: string[];
  };
  "autonomy:kernel:initialized": {
    enabled: boolean;
    configIssues: number;
  };
  "autonomy:kernel:shutdown": {
    reason: string;
  };

  // ── Autonomy Tool Contract Events ──────────────────────────────────
  "autonomy:tool:validated": {
    toolName: string;
    valid: boolean;
    errorCount: number;
    riskClass: string | undefined;
    requestId: string;
  };
  "autonomy:tool:postcondition:checked": {
    toolName: string;
    status: "passed" | "failed" | "partial";
    criticalFailure: boolean;
    checkCount: number;
    requestId: string;
  };

  // ── Autonomy Workflow Engine Events ─────────────────────────────────
  "autonomy:state:transition": {
    from: string;
    to: string;
    trigger: string;
    requestId?: string;
  };
  "autonomy:approval:requested": {
    requestId: string;
    toolName: string;
    riskClass: string;
    expiresAt: number;
  };
  "autonomy:approval:resolved": {
    requestId: string;
    toolName: string;
    decision: string;
    decidedBy?: string;
  };
  "autonomy:pipeline:started": {
    requestId: string;
    toolName: string;
    source: string;
  };
  "autonomy:pipeline:completed": {
    requestId: string;
    toolName: string;
    success: boolean;
    durationMs: number;
    compensationAttempted?: boolean;
  };
  "autonomy:event:appended": {
    sequenceId: number;
    requestId: string;
    type: string;
  };
  "autonomy:compensation:attempted": {
    requestId: string;
    toolName: string;
    success: boolean;
    detail?: string;
  };
}

// ---------- Event Names Type ----------

export type EventName = keyof MilaidyEvents;

// ---------- Event Handler Type ----------

export type EventHandler<K extends EventName> = (
  payload: MilaidyEvents[K],
) => void | Promise<void>;

// ---------- Event Envelope ----------

export interface EventEnvelope<K extends EventName = EventName> {
  event: K;
  payload: MilaidyEvents[K];
  timestamp: number;
  source: number; // process.pid
}

// ---------- Typed Event Bus ----------

export interface TypedEventBusOptions {
  /** Maximum listeners per event (default: 100). */
  maxListeners?: number;
  /** Enable debug logging of all events. */
  debug?: boolean;
  /** Redis URL for distributed pub/sub (optional). */
  redisUrl?: string;
}

/**
 * Type-safe event bus for Milaidy.
 */
export class TypedEventBus {
  private emitter = new EventEmitter();
  private subscriptions = new Map<string, Set<EventHandler<EventName>>>();
  private debug: boolean;

  constructor(options: TypedEventBusOptions = {}) {
    this.emitter.setMaxListeners(options.maxListeners ?? 100);
    this.debug = options.debug ?? false;

    // Redis support would be added here if redisUrl is provided
    if (options.redisUrl) {
      logger.info("[event-bus] Redis pub/sub support not yet implemented");
    }
  }

  /**
   * Emit an event with payload.
   */
  emit<K extends EventName>(event: K, payload: MilaidyEvents[K]): void {
    if (this.debug) {
      logger.debug(`[event-bus] Emitting: ${event}`, { payload });
    }

    this.emitter.emit(event, payload);
  }

  /**
   * Emit an event asynchronously and wait for all handlers.
   */
  async emitAsync<K extends EventName>(
    event: K,
    payload: MilaidyEvents[K],
  ): Promise<void> {
    if (this.debug) {
      logger.debug(`[event-bus] Emitting async: ${event}`, { payload });
    }

    const handlers = this.subscriptions.get(event);
    if (!handlers || handlers.size === 0) return;

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(
          `[event-bus] Handler error for ${event}: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    await Promise.all(promises);
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const wrappedHandler = async (payload: MilaidyEvents[K]) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(
          `[event-bus] Handler error for ${event}: ${err instanceof Error ? err.message : err}`,
        );
      }
    };

    this.emitter.on(event, wrappedHandler);

    // Track subscription for cleanup
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(wrappedHandler as EventHandler<EventName>);

    // Return unsubscribe function
    return () => {
      this.emitter.off(event, wrappedHandler);
      this.subscriptions.get(event)?.delete(wrappedHandler as EventHandler<EventName>);
    };
  }

  /**
   * Subscribe to an event once.
   */
  once<K extends EventName>(event: K, handler: EventHandler<K>): void {
    const wrappedHandler = async (payload: MilaidyEvents[K]) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(
          `[event-bus] Handler error for ${event}: ${err instanceof Error ? err.message : err}`,
        );
      }
    };

    this.emitter.once(event, wrappedHandler);
  }

  /**
   * Wait for an event with optional timeout and predicate.
   */
  waitFor<K extends EventName>(
    event: K,
    options: {
      timeoutMs?: number;
      predicate?: (payload: MilaidyEvents[K]) => boolean;
    } = {},
  ): Promise<MilaidyEvents[K]> {
    const { timeoutMs = 30_000, predicate } = options;

    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (unsubscribe) unsubscribe();
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);

      unsubscribe = this.on(event, (payload) => {
        if (!predicate || predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      });
    });
  }

  /**
   * Remove all listeners for an event.
   */
  removeAllListeners(event?: EventName): void {
    if (event) {
      this.emitter.removeAllListeners(event);
      this.subscriptions.delete(event);
    } else {
      this.emitter.removeAllListeners();
      this.subscriptions.clear();
    }
  }

  /**
   * Get listener count for an event.
   */
  listenerCount(event: EventName): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Get all registered event names.
   */
  eventNames(): EventName[] {
    return this.emitter.eventNames() as EventName[];
  }
}

// ---------- Global Singleton ----------

let _eventBus: TypedEventBus | null = null;

/**
 * Get the global event bus instance.
 */
export function getEventBus(): TypedEventBus {
  if (!_eventBus) {
    _eventBus = new TypedEventBus({
      debug: process.env.DEBUG_EVENTS === "1",
      redisUrl: process.env.REDIS_URL,
    });
  }
  return _eventBus;
}

/**
 * Reset the global event bus (for testing).
 */
export function resetEventBus(): void {
  if (_eventBus) {
    _eventBus.removeAllListeners();
    _eventBus = null;
  }
}

/**
 * Convenience function to emit an event on the global bus.
 */
export function emit<K extends EventName>(
  event: K,
  payload: MilaidyEvents[K],
): void {
  getEventBus().emit(event, payload);
}

/**
 * Convenience function to subscribe to an event on the global bus.
 */
export function on<K extends EventName>(
  event: K,
  handler: EventHandler<K>,
): () => void {
  return getEventBus().on(event, handler);
}
