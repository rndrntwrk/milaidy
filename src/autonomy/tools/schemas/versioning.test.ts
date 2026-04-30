import { describe, expect, it } from "vitest";
import { createRuntimeActionContract } from "../runtime-contracts.js";
import { BUILTIN_CONTRACTS } from "./index.js";
import { createCustomActionContract } from "./custom-action.schema.js";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

describe("tool contract versioning", () => {
  it("uses semver versions for all built-in contracts", () => {
    for (const contract of BUILTIN_CONTRACTS) {
      expect(
        SEMVER_RE.test(contract.version),
        `${contract.name} has non-semver version: ${contract.version}`,
      ).toBe(true);
    }
  });

  it("uses semver versions for synthesized runtime contracts", () => {
    const runtimeContract = createRuntimeActionContract({
      name: "CUSTOM_SYNTH_RUNTIME",
      parameters: [{ name: "value", required: true, schema: { type: "string" } }],
    });
    expect(runtimeContract).not.toBeNull();
    expect(SEMVER_RE.test(runtimeContract!.version)).toBe(true);
  });

  it("uses semver versions for explicit custom-action contracts", () => {
    const customContract = createCustomActionContract({
      name: "CUSTOM_EXPLICIT",
      description: "custom explicit action",
      handlerType: "http",
      parameters: [{ name: "url", required: true }],
    });
    expect(SEMVER_RE.test(customContract.version)).toBe(true);
  });

  it("has unique tool names across built-in contracts", () => {
    const names = BUILTIN_CONTRACTS.map((contract) => contract.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

