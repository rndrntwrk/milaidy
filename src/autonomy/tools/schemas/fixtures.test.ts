import { describe, expect, it } from "vitest";
import { BUILTIN_TOOL_FIXTURES } from "./fixtures.js";
import { BUILTIN_CONTRACTS } from "./index.js";

describe("BUILTIN_TOOL_FIXTURES", () => {
  it("covers every built-in contract", () => {
    const fixtureNames = Object.keys(BUILTIN_TOOL_FIXTURES).sort();
    const contractNames = BUILTIN_CONTRACTS.map((contract) => contract.name).sort();
    expect(fixtureNames).toEqual(contractNames);
  });

  it("valid fixtures pass and invalid fixtures fail each contract schema", () => {
    for (const contract of BUILTIN_CONTRACTS) {
      const fixture = BUILTIN_TOOL_FIXTURES[contract.name];
      expect(fixture, `missing fixture for ${contract.name}`).toBeDefined();

      const validResult = contract.paramsSchema.safeParse(fixture.valid);
      expect(
        validResult.success,
        `${contract.name} valid fixture should parse`,
      ).toBe(true);

      for (const sample of fixture.invalid) {
        const invalidResult = contract.paramsSchema.safeParse(sample.params);
        expect(
          invalidResult.success,
          `${contract.name} invalid fixture should fail: ${sample.label}`,
        ).toBe(false);
      }
    }
  });
});

