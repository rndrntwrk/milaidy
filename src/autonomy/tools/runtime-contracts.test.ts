import { describe, expect, it } from "vitest";
import { SchemaValidator } from "../verification/schema-validator.js";
import { ToolRegistry } from "./registry.js";
import {
  createRuntimeActionContract,
  registerRuntimeActionContracts,
} from "./runtime-contracts.js";
import { registerBuiltinToolContracts } from "./schemas/index.js";

describe("runtime action contracts", () => {
  it("registers contracts for missing runtime actions and validates params", () => {
    const registry = new ToolRegistry();
    registerBuiltinToolContracts(registry);

    const registered = registerRuntimeActionContracts(registry, {
      actions: [
        {
          name: "RUN_IN_TERMINAL",
          description: "existing built-in action",
          parameters: [{ name: "command", required: true, schema: { type: "string" } }],
        },
        {
          name: "CUSTOM_HTTP",
          description: "custom runtime action",
          parameters: [
            { name: "url", required: true, schema: { type: "string" } },
            { name: "timeoutMs", required: false, schema: { type: "number" } },
          ],
        },
      ],
    });

    expect(registered).toEqual(["CUSTOM_HTTP"]);
    expect(registry.has("RUN_IN_TERMINAL")).toBe(true);
    expect(registry.has("CUSTOM_HTTP")).toBe(true);

    const validator = new SchemaValidator(registry);
    const valid = validator.validate({
      tool: "CUSTOM_HTTP",
      params: { url: "https://example.com", timeoutMs: 5000 },
      source: "system",
      requestId: "req-valid",
    });
    expect(valid.valid).toBe(true);

    const missingRequired = validator.validate({
      tool: "CUSTOM_HTTP",
      params: {},
      source: "system",
      requestId: "req-missing",
    });
    expect(missingRequired.valid).toBe(false);
    expect(missingRequired.errors.some((e) => e.field === "url")).toBe(true);

    const unknownField = validator.validate({
      tool: "CUSTOM_HTTP",
      params: { url: "https://example.com", extra: true },
      source: "system",
      requestId: "req-extra",
    });
    expect(unknownField.valid).toBe(false);
    expect(unknownField.errors.some((e) => e.code === "unknown_field")).toBe(
      true,
    );
  });

  it("supports enum parameter validation for synthesized contracts", () => {
    const registry = new ToolRegistry();
    registerRuntimeActionContracts(registry, {
      actions: [
        {
          name: "SELECT_MODE",
          parameters: [
            {
              name: "mode",
              required: true,
              schema: { type: "string", enum: ["fast", "safe"] },
            },
          ],
        },
      ],
    });

    const validator = new SchemaValidator(registry);
    const valid = validator.validate({
      tool: "SELECT_MODE",
      params: { mode: "fast" },
      source: "system",
      requestId: "req-fast",
    });
    expect(valid.valid).toBe(true);

    const invalid = validator.validate({
      tool: "SELECT_MODE",
      params: { mode: "turbo" },
      source: "system",
      requestId: "req-invalid",
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((e) => e.field === "mode")).toBe(true);
  });

  it("infers risk/approval policy from action names", () => {
    const readContract = createRuntimeActionContract({
      name: "READ_STATUS",
      parameters: [],
    });
    const destructiveContract = createRuntimeActionContract({
      name: "DELETE_RESOURCE",
      parameters: [],
    });

    expect(readContract?.riskClass).toBe("read-only");
    expect(readContract?.requiresApproval).toBe(false);
    expect(destructiveContract?.riskClass).toBe("irreversible");
    expect(destructiveContract?.requiresApproval).toBe(true);
  });
});

