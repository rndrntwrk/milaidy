/**
 * Tests for events/event-bus.ts
 *
 * Exercises:
 *   - Event emission and subscription
 *   - Type safety
 *   - Async handlers
 *   - waitFor with timeout and predicate
 *   - Unsubscribe functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emit,
  getEventBus,
  on,
  resetEventBus,
  TypedEventBus,
  type MilaidyEvents,
} from "./event-bus.js";

describe("TypedEventBus", () => {
  let bus: TypedEventBus;

  beforeEach(() => {
    bus = new TypedEventBus();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  describe("emit and on", () => {
    it("emits and receives events", () => {
      const handler = vi.fn();
      bus.on("system:startup", handler);

      bus.emit("system:startup", {
        version: "1.0.0",
        startedAt: Date.now(),
        nodeVersion: "22.0.0",
        platform: "darwin",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ version: "1.0.0" }),
      );
    });

    it("handles multiple subscribers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on("agent:state:changed", handler1);
      bus.on("agent:state:changed", handler2);

      bus.emit("agent:state:changed", {
        agentId: "test",
        from: "stopped",
        to: "running",
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("does not call handler for different events", () => {
      const handler = vi.fn();
      bus.on("system:startup", handler);

      bus.emit("system:shutdown", {
        reason: "test",
        code: 0,
        uptime: 1000,
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("returns unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = bus.on("system:startup", handler);

      unsubscribe();

      bus.emit("system:startup", {
        version: "1.0.0",
        startedAt: Date.now(),
        nodeVersion: "22.0.0",
        platform: "darwin",
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("only unsubscribes the specific handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = bus.on("agent:state:changed", handler1);
      bus.on("agent:state:changed", handler2);

      unsub1();

      bus.emit("agent:state:changed", {
        agentId: "test",
        from: "stopped",
        to: "running",
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe("once", () => {
    it("only fires handler once", () => {
      const handler = vi.fn();
      bus.once("plugin:loaded", handler);

      const payload = {
        name: "test-plugin",
        version: "1.0.0",
        permissions: [],
        loadTimeMs: 100,
      };

      bus.emit("plugin:loaded", payload);
      bus.emit("plugin:loaded", payload);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("emitAsync", () => {
    it("waits for all handlers to complete", async () => {
      const order: number[] = [];

      bus.on("session:created", async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });

      bus.on("session:created", async () => {
        order.push(2);
      });

      await bus.emitAsync("session:created", {
        sessionId: "test",
        channel: "web",
      });

      expect(order).toContain(1);
      expect(order).toContain(2);
    });

    it("continues even if one handler throws", async () => {
      const handler2 = vi.fn();

      bus.on("session:created", async () => {
        throw new Error("Handler 1 failed");
      });

      bus.on("session:created", handler2);

      await bus.emitAsync("session:created", {
        sessionId: "test",
        channel: "web",
      });

      expect(handler2).toHaveBeenCalled();
    });
  });

  describe("waitFor", () => {
    it("resolves when event is emitted", async () => {
      const promise = bus.waitFor("agent:state:changed");

      // Emit after a short delay
      setTimeout(() => {
        bus.emit("agent:state:changed", {
          agentId: "test",
          from: "stopped",
          to: "running",
        });
      }, 10);

      const result = await promise;
      expect(result.to).toBe("running");
    });

    it("rejects on timeout", async () => {
      await expect(
        bus.waitFor("agent:state:changed", { timeoutMs: 50 }),
      ).rejects.toThrow("Timeout");
    });

    it("filters with predicate", async () => {
      const promise = bus.waitFor("agent:state:changed", {
        predicate: (p) => p.to === "running",
      });

      // Emit non-matching event first
      setTimeout(() => {
        bus.emit("agent:state:changed", {
          agentId: "test",
          from: "stopped",
          to: "starting",
        });
      }, 5);

      // Then emit matching event
      setTimeout(() => {
        bus.emit("agent:state:changed", {
          agentId: "test",
          from: "starting",
          to: "running",
        });
      }, 15);

      const result = await promise;
      expect(result.to).toBe("running");
    });
  });

  describe("removeAllListeners", () => {
    it("removes all listeners for specific event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on("system:startup", handler1);
      bus.on("system:shutdown", handler2);

      bus.removeAllListeners("system:startup");

      bus.emit("system:startup", {
        version: "1.0.0",
        startedAt: Date.now(),
        nodeVersion: "22.0.0",
        platform: "darwin",
      });

      bus.emit("system:shutdown", {
        reason: "test",
        code: 0,
        uptime: 1000,
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it("removes all listeners when no event specified", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on("system:startup", handler1);
      bus.on("system:shutdown", handler2);

      bus.removeAllListeners();

      bus.emit("system:startup", {
        version: "1.0.0",
        startedAt: Date.now(),
        nodeVersion: "22.0.0",
        platform: "darwin",
      });

      bus.emit("system:shutdown", {
        reason: "test",
        code: 0,
        uptime: 1000,
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe("listenerCount and eventNames", () => {
    it("returns correct listener count", () => {
      bus.on("system:startup", () => {});
      bus.on("system:startup", () => {});

      expect(bus.listenerCount("system:startup")).toBe(2);
      expect(bus.listenerCount("system:shutdown")).toBe(0);
    });

    it("returns registered event names", () => {
      bus.on("system:startup", () => {});
      bus.on("plugin:loaded", () => {});

      const names = bus.eventNames();
      expect(names).toContain("system:startup");
      expect(names).toContain("plugin:loaded");
    });
  });
});

describe("global event bus", () => {
  afterEach(() => {
    resetEventBus();
  });

  it("getEventBus returns singleton", () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it("resetEventBus clears the singleton", () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });

  it("emit and on work with global bus", () => {
    const handler = vi.fn();
    const unsub = on("security:auth:success", handler);

    emit("security:auth:success", {
      ip: "127.0.0.1",
      method: "token",
    });

    expect(handler).toHaveBeenCalled();
    unsub();
  });
});
