import { describe, expect, it } from "vitest";
import { BUILTIN_CONTRACTS } from "../../tools/schemas/index.js";
import { registerBuiltinPostConditions } from "./index.js";
import type {
  PostCondition,
  PostConditionVerifierInterface,
  VerificationResult,
  VerifierContext,
} from "../types.js";

class CaptureVerifier implements PostConditionVerifierInterface {
  readonly registered = new Map<string, PostCondition[]>();

  registerConditions(toolName: string, conditions: PostCondition[]): void {
    const existing = this.registered.get(toolName) ?? [];
    this.registered.set(toolName, [...existing, ...conditions]);
  }

  async verify(_ctx: VerifierContext): Promise<VerificationResult> {
    throw new Error("CaptureVerifier does not execute post-conditions");
  }
}

describe("registerBuiltinPostConditions", () => {
  it("registers at least one condition for every built-in contract", () => {
    const verifier = new CaptureVerifier();
    registerBuiltinPostConditions(verifier);

    const missing = BUILTIN_CONTRACTS.map((contract) => contract.name).filter(
      (name) => (verifier.registered.get(name)?.length ?? 0) === 0,
    );

    expect(missing).toEqual([]);
  });

  it("registers unique condition IDs per tool", () => {
    const verifier = new CaptureVerifier();
    registerBuiltinPostConditions(verifier);

    for (const [toolName, conditions] of verifier.registered.entries()) {
      const ids = conditions.map((condition) => condition.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size, `duplicate condition ids for ${toolName}`).toBe(
        ids.length,
      );
    }
  });
});
