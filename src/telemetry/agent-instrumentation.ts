/**
 * Custom instrumentation for agent operations.
 *
 * Tracks message processing, token usage, action execution,
 * and session lifecycle metrics.
 *
 * @module telemetry/agent-instrumentation
 */

import { metrics } from "./setup.js";

export interface MessageContext {
  agentId: string;
  sessionId?: string;
  channel: string;
  messageLength: number;
}

export interface ResponseContext {
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  durationMs: number;
  model?: string;
}

export interface ActionContext {
  agentId: string;
  action: string;
  params?: Record<string, unknown>;
}

/**
 * Agent operation instrumentation.
 *
 * Provides wrappers for tracing and metrics around agent operations.
 */
export class AgentInstrumentation {
  private activeSessions = new Map<string, number>();

  /**
   * Record a message received event.
   */
  recordMessageReceived(ctx: MessageContext): void {
    metrics.counter("milaidy.messages.received", 1, {
      agent: ctx.agentId,
      channel: ctx.channel,
    });
    metrics.histogram("milaidy.message.length", ctx.messageLength, {
      agent: ctx.agentId,
    });
  }

  /**
   * Record a message sent/response event.
   */
  recordMessageSent(ctx: MessageContext, response: ResponseContext): void {
    metrics.counter("milaidy.messages.sent", 1, {
      agent: ctx.agentId,
      channel: ctx.channel,
    });

    metrics.histogram("milaidy.turn.duration", response.durationMs, {
      agent: ctx.agentId,
      channel: ctx.channel,
    });

    if (response.tokens) {
      metrics.counter("milaidy.tokens.input", response.tokens.input, {
        agent: ctx.agentId,
        model: response.model ?? "unknown",
      });
      metrics.counter("milaidy.tokens.output", response.tokens.output, {
        agent: ctx.agentId,
        model: response.model ?? "unknown",
      });
      metrics.histogram("milaidy.response.tokens", response.tokens.total, {
        agent: ctx.agentId,
      });
    }
  }

  /**
   * Record an action starting.
   */
  recordActionStarted(ctx: ActionContext): () => void {
    const start = Date.now();
    metrics.counter("milaidy.actions.started", 1, {
      agent: ctx.agentId,
      action: ctx.action,
    });

    // Return a function to call when the action completes
    return () => {
      const duration = Date.now() - start;
      metrics.counter("milaidy.actions.completed", 1, {
        agent: ctx.agentId,
        action: ctx.action,
      });
      metrics.histogram("milaidy.action.duration", duration, {
        agent: ctx.agentId,
        action: ctx.action,
      });
    };
  }

  /**
   * Record an action failure.
   */
  recordActionFailed(ctx: ActionContext, error: string): void {
    metrics.counter("milaidy.actions.failed", 1, {
      agent: ctx.agentId,
      action: ctx.action,
      error: error.slice(0, 100),
    });
  }

  /**
   * Record a session created.
   */
  recordSessionCreated(sessionId: string, channel: string): void {
    this.activeSessions.set(sessionId, Date.now());
    metrics.counter("milaidy.sessions.created", 1, { channel });
    metrics.gauge("milaidy.sessions.active", this.activeSessions.size);
  }

  /**
   * Record a session ended.
   */
  recordSessionEnded(sessionId: string, channel: string, messageCount: number): void {
    const startTime = this.activeSessions.get(sessionId);
    this.activeSessions.delete(sessionId);

    metrics.counter("milaidy.sessions.ended", 1, { channel });
    metrics.gauge("milaidy.sessions.active", this.activeSessions.size);
    metrics.histogram("milaidy.session.messages", messageCount, { channel });

    if (startTime) {
      const duration = Date.now() - startTime;
      metrics.histogram("milaidy.session.duration", duration, { channel });
    }
  }

  /**
   * Record a plugin event.
   */
  recordPluginEvent(
    event: "loaded" | "unloaded" | "error",
    name: string,
    details?: Record<string, unknown>,
  ): void {
    metrics.counter(`milaidy.plugins.${event}`, 1, { plugin: name });
    if (event === "error" && details?.error) {
      metrics.counter("milaidy.plugins.errors", 1, {
        plugin: name,
        error: String(details.error).slice(0, 100),
      });
    }
  }

  /**
   * Wrap an async function with timing instrumentation.
   */
  async wrap<T>(
    name: string,
    tags: Record<string, string>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      metrics.histogram(`milaidy.${name}.duration`, Date.now() - start, tags);
      metrics.counter(`milaidy.${name}.success`, 1, tags);
      return result;
    } catch (err) {
      metrics.histogram(`milaidy.${name}.duration`, Date.now() - start, tags);
      metrics.counter(`milaidy.${name}.error`, 1, {
        ...tags,
        error: String(err).slice(0, 100),
      });
      throw err;
    }
  }
}

// Singleton instance
export const agentInstrumentation = new AgentInstrumentation();
