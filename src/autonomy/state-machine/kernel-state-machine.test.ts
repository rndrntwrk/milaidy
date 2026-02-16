import { afterEach, describe, expect, it, vi } from "vitest";
import { KernelStateMachine } from "./kernel-state-machine.js";

describe("KernelStateMachine", () => {
  let sm: KernelStateMachine;

  afterEach(() => {
    vi.clearAllMocks();
  });

  function create(): KernelStateMachine {
    sm = new KernelStateMachine();
    return sm;
  }

  describe("initial state", () => {
    it("starts in idle state", () => {
      create();
      expect(sm.currentState).toBe("idle");
    });

    it("starts with zero consecutive errors", () => {
      create();
      expect(sm.consecutiveErrors).toBe(0);
    });
  });

  describe("transition()", () => {
    it("transitions idle → executing via tool_validated", () => {
      create();
      const result = sm.transition("tool_validated");
      expect(result.accepted).toBe(true);
      expect(result.from).toBe("idle");
      expect(result.to).toBe("executing");
      expect(sm.currentState).toBe("executing");
    });

    it("transitions idle → awaiting_approval via approval_required", () => {
      create();
      const result = sm.transition("approval_required");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("awaiting_approval");
    });

    it("transitions awaiting_approval → executing via approval_granted", () => {
      create();
      sm.transition("approval_required");
      const result = sm.transition("approval_granted");
      expect(result.accepted).toBe(true);
      expect(result.from).toBe("awaiting_approval");
      expect(result.to).toBe("executing");
    });

    it("transitions awaiting_approval → idle via approval_denied", () => {
      create();
      sm.transition("approval_required");
      const result = sm.transition("approval_denied");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("idle");
    });

    it("transitions awaiting_approval → idle via approval_expired", () => {
      create();
      sm.transition("approval_required");
      const result = sm.transition("approval_expired");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("idle");
    });

    it("transitions executing → verifying via execution_complete", () => {
      create();
      sm.transition("tool_validated");
      const result = sm.transition("execution_complete");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("verifying");
    });

    it("transitions verifying → idle via verification_passed", () => {
      create();
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      const result = sm.transition("verification_passed");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("idle");
    });

    it("transitions verifying → error via verification_failed", () => {
      create();
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      const result = sm.transition("verification_failed");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("error");
    });

    it("transitions error → idle via recover", () => {
      create();
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      const result = sm.transition("recover");
      expect(result.accepted).toBe(true);
      expect(result.from).toBe("error");
      expect(result.to).toBe("idle");
    });

    it("allows fatal_error from any state (wildcard)", () => {
      create();
      sm.transition("tool_validated"); // now executing
      const result = sm.transition("fatal_error");
      expect(result.accepted).toBe(true);
      expect(result.from).toBe("executing");
      expect(result.to).toBe("error");
    });

    it("allows escalate_safe_mode from any state (wildcard)", () => {
      create();
      const result = sm.transition("escalate_safe_mode");
      expect(result.accepted).toBe(true);
      expect(result.to).toBe("safe_mode");
    });

    it("rejects invalid transitions with reason", () => {
      create();
      const result = sm.transition("approval_granted"); // idle → can't grant approval
      expect(result.accepted).toBe(false);
      expect(result.from).toBe("idle");
      expect(result.to).toBe("idle"); // stays in current state
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain("approval_granted");
      expect(result.reason).toContain("idle");
    });

    it("rejects recover from non-error state", () => {
      create();
      const result = sm.transition("recover");
      expect(result.accepted).toBe(false);
    });

    it("never throws on invalid transition", () => {
      create();
      expect(() => sm.transition("recover")).not.toThrow();
      expect(() => sm.transition("verification_passed")).not.toThrow();
    });
  });

  describe("consecutive errors and safe mode escalation", () => {
    it("increments consecutiveErrors on entering error state", () => {
      create();
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      expect(sm.consecutiveErrors).toBe(1);
    });

    it("does not reset consecutiveErrors on recover (resets on verification_passed)", () => {
      create();
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      expect(sm.consecutiveErrors).toBe(1);
      sm.transition("recover");
      // Count persists until a successful verification cycle
      expect(sm.consecutiveErrors).toBe(1);
    });

    it("resets consecutiveErrors on verification_passed", () => {
      create();
      // Trigger an error first
      sm.transition("fatal_error");
      expect(sm.consecutiveErrors).toBe(1);
      sm.transition("recover");
      // Now complete a successful cycle
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_passed");
      expect(sm.consecutiveErrors).toBe(0);
    });

    it("escalates to safe_mode after 3 consecutive errors", () => {
      create();
      // Error 1
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      expect(sm.currentState).toBe("error");
      expect(sm.consecutiveErrors).toBe(1);

      // Error 2
      sm.transition("recover");
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      expect(sm.currentState).toBe("error");
      expect(sm.consecutiveErrors).toBe(2);

      // Error 3 — should escalate to safe_mode
      sm.transition("recover");
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed");
      expect(sm.currentState).toBe("safe_mode");
      expect(sm.consecutiveErrors).toBe(3);
    });

    it("counts fatal_error toward consecutive errors", () => {
      create();
      sm.transition("fatal_error");
      expect(sm.consecutiveErrors).toBe(1);
      sm.transition("recover"); // error → idle
      // Count persists until verification_passed
      expect(sm.consecutiveErrors).toBe(1);
    });
  });

  describe("onStateChange()", () => {
    it("calls listener on successful transition", () => {
      create();
      const listener = vi.fn();
      sm.onStateChange(listener);
      sm.transition("tool_validated");
      expect(listener).toHaveBeenCalledWith(
        "idle",
        "executing",
        "tool_validated",
      );
    });

    it("does not call listener on rejected transition", () => {
      create();
      const listener = vi.fn();
      sm.onStateChange(listener);
      sm.transition("approval_granted"); // invalid from idle
      expect(listener).not.toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      create();
      const listener = vi.fn();
      const unsubscribe = sm.onStateChange(listener);
      unsubscribe();
      sm.transition("tool_validated");
      expect(listener).not.toHaveBeenCalled();
    });

    it("handles listener errors gracefully", () => {
      create();
      const badListener = vi.fn(() => {
        throw new Error("listener boom");
      });
      const goodListener = vi.fn();
      sm.onStateChange(badListener);
      sm.onStateChange(goodListener);
      sm.transition("tool_validated");
      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe("reset()", () => {
    it("resets state to idle", () => {
      create();
      sm.transition("tool_validated");
      expect(sm.currentState).toBe("executing");
      sm.reset();
      expect(sm.currentState).toBe("idle");
    });

    it("resets consecutive error count", () => {
      create();
      sm.transition("fatal_error");
      expect(sm.consecutiveErrors).toBe(1);
      sm.reset();
      expect(sm.consecutiveErrors).toBe(0);
    });
  });

  describe("full execution cycle", () => {
    it("completes happy path: idle → executing → verifying → idle", () => {
      create();
      const transitions: Array<[string, string, string]> = [];
      sm.onStateChange((from, to, trigger) => {
        transitions.push([from, to, trigger]);
      });

      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_passed");

      expect(sm.currentState).toBe("idle");
      expect(transitions).toEqual([
        ["idle", "executing", "tool_validated"],
        ["executing", "verifying", "execution_complete"],
        ["verifying", "idle", "verification_passed"],
      ]);
    });

    it("completes approval path: idle → awaiting → executing → verifying → idle", () => {
      create();
      sm.transition("approval_required");
      sm.transition("approval_granted");
      sm.transition("execution_complete");
      sm.transition("verification_passed");
      expect(sm.currentState).toBe("idle");
    });
  });
});
