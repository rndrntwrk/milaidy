import { afterEach, describe, expect, it, vi } from "vitest";
import { metrics } from "../../telemetry/setup.js";
import { SafeModeControllerImpl } from "./safe-mode.js";

describe("SafeModeControllerImpl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("shouldTrigger()", () => {
    it("returns false when below threshold", () => {
      const ctrl = new SafeModeControllerImpl();
      expect(ctrl.shouldTrigger(0)).toBe(false);
      expect(ctrl.shouldTrigger(1)).toBe(false);
      expect(ctrl.shouldTrigger(2)).toBe(false);
    });

    it("returns true at threshold (default 3)", () => {
      const ctrl = new SafeModeControllerImpl();
      expect(ctrl.shouldTrigger(3)).toBe(true);
    });

    it("returns true above threshold", () => {
      const ctrl = new SafeModeControllerImpl();
      expect(ctrl.shouldTrigger(5)).toBe(true);
    });

    it("uses configurable threshold", () => {
      const ctrl = new SafeModeControllerImpl({ errorThreshold: 5 });
      expect(ctrl.shouldTrigger(4)).toBe(false);
      expect(ctrl.shouldTrigger(5)).toBe(true);
    });
  });

  describe("enter()", () => {
    it("records reason and timestamp", () => {
      const ctrl = new SafeModeControllerImpl();
      const before = Date.now();
      ctrl.enter("Too many errors");
      const status = ctrl.getStatus();

      expect(status.active).toBe(true);
      expect(status.reason).toBe("Too many errors");
      expect(status.enteredAt).toBeGreaterThanOrEqual(before);
      expect(status.enteredAt).toBeLessThanOrEqual(Date.now());
    });

    it("emits safe-mode entry event and records metric", () => {
      const mockEmit = vi.fn();
      const ctrl = new SafeModeControllerImpl({
        eventBus: { emit: mockEmit },
      });
      const before = metrics.getSnapshot();

      ctrl.shouldTrigger(3);
      ctrl.enter("Too many errors");

      expect(mockEmit).toHaveBeenCalledWith("autonomy:safe-mode:entered", {
        enteredAt: expect.any(Number),
        reason: "Too many errors",
        consecutiveErrors: 3,
      });
      const after = metrics.getSnapshot();
      const key = 'autonomy_safe_mode_events_total:{"action":"enter"}';
      expect((after.counters[key] ?? 0) - (before.counters[key] ?? 0)).toBe(1);
    });
  });

  describe("requestExit()", () => {
    it("succeeds with high-trust user", () => {
      const mockEmit = vi.fn();
      const ctrl = new SafeModeControllerImpl({
        eventBus: { emit: mockEmit },
      });
      const before = metrics.getSnapshot();
      ctrl.enter("test");
      const result = ctrl.requestExit("user", 0.9);
      expect(result.allowed).toBe(true);
      expect(ctrl.getStatus().active).toBe(false);
      expect(mockEmit).toHaveBeenCalledWith("autonomy:safe-mode:exited", {
        exitedAt: expect.any(Number),
        enteredAt: expect.any(Number),
        reason: "test",
        consecutiveErrors: 0,
        approverSource: "user",
        approverTrust: 0.9,
      });
      const after = metrics.getSnapshot();
      const key = 'autonomy_safe_mode_events_total:{"action":"exit"}';
      expect((after.counters[key] ?? 0) - (before.counters[key] ?? 0)).toBe(1);
    });

    it("succeeds with high-trust system source", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("system", 0.85);
      expect(result.allowed).toBe(true);
      expect(ctrl.getStatus().active).toBe(false);
    });

    it("rejects low-trust caller", () => {
      const mockEmit = vi.fn();
      const ctrl = new SafeModeControllerImpl({
        eventBus: { emit: mockEmit },
      });
      ctrl.enter("test");
      const result = ctrl.requestExit("user", 0.5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("below the required floor");
      expect(ctrl.getStatus().active).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith(
        "autonomy:safe-mode:exit-denied",
        expect.objectContaining({
          reason: expect.stringContaining("below the required floor"),
          approverSource: "user",
          approverTrust: 0.5,
          active: true,
        }),
      );
    });

    it("rejects agent source (only user/system)", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("llm", 0.95);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not authorized");
      expect(ctrl.getStatus().active).toBe(true);
    });

    it("rejects plugin source", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("plugin", 0.95);
      expect(result.allowed).toBe(false);
    });

    it("allows exit when not in safe mode", () => {
      const ctrl = new SafeModeControllerImpl();
      const result = ctrl.requestExit("user", 0.9);
      expect(result.allowed).toBe(true);
    });

    it("uses configurable exit trust floor", () => {
      const ctrl = new SafeModeControllerImpl({ exitTrustFloor: 0.95 });
      ctrl.enter("test");

      const fail = ctrl.requestExit("user", 0.9);
      expect(fail.allowed).toBe(false);

      const pass = ctrl.requestExit("user", 0.95);
      expect(pass.allowed).toBe(true);
    });
  });

  describe("getStatus()", () => {
    it("reflects inactive state by default", () => {
      const ctrl = new SafeModeControllerImpl();
      const status = ctrl.getStatus();
      expect(status.active).toBe(false);
      expect(status.enteredAt).toBeUndefined();
      expect(status.reason).toBeUndefined();
      expect(status.consecutiveErrors).toBe(0);
    });

    it("reflects active state after enter()", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("error threshold exceeded");
      const status = ctrl.getStatus();
      expect(status.active).toBe(true);
      expect(status.reason).toBe("error threshold exceeded");
    });

    it("reflects consecutiveErrors after shouldTrigger()", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.shouldTrigger(5);
      expect(ctrl.getStatus().consecutiveErrors).toBe(5);
    });
  });
});
