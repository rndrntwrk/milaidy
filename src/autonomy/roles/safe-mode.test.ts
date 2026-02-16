import { describe, expect, it } from "vitest";
import { SafeModeControllerImpl } from "./safe-mode.js";

describe("SafeModeControllerImpl", () => {
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
  });

  describe("requestExit()", () => {
    it("succeeds with high-trust user", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("user", 0.9);
      expect(result.allowed).toBe(true);
      expect(ctrl.getStatus().active).toBe(false);
    });

    it("succeeds with high-trust system source", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("system", 0.85);
      expect(result.allowed).toBe(true);
      expect(ctrl.getStatus().active).toBe(false);
    });

    it("rejects low-trust caller", () => {
      const ctrl = new SafeModeControllerImpl();
      ctrl.enter("test");
      const result = ctrl.requestExit("user", 0.5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("below the required floor");
      expect(ctrl.getStatus().active).toBe(true);
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
