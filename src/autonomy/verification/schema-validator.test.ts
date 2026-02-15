/**
 * Tests for schema-validator.ts
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../tools/registry.js";
import { registerBuiltinToolContracts } from "../tools/schemas/index.js";
import type { ProposedToolCall, ToolContract } from "../tools/types.js";
import { SchemaValidator } from "./schema-validator.js";

function makeCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    tool: "RUN_IN_TERMINAL",
    params: { command: "echo hello" },
    source: "user",
    requestId: "test-1",
    ...overrides,
  };
}

describe("SchemaValidator", () => {
  function setup() {
    const registry = new ToolRegistry();
    registerBuiltinToolContracts(registry);
    const validator = new SchemaValidator(registry);
    return { registry, validator };
  }

  it("validates a correct RUN_IN_TERMINAL call", () => {
    const { validator } = setup();
    const result = validator.validate(makeCall());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.validatedParams).toEqual({ command: "echo hello" });
    expect(result.riskClass).toBe("irreversible");
    expect(result.requiresApproval).toBe(true);
  });

  it("returns missing_field for empty params on RUN_IN_TERMINAL", () => {
    const { validator } = setup();
    const result = validator.validate(makeCall({ params: {} }));

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe("missing_field");
    expect(result.errors[0].field).toBe("command");
  });

  it("returns type_mismatch for wrong param type", () => {
    const { validator } = setup();
    const result = validator.validate(makeCall({ params: { command: 123 } }));

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("type_mismatch");
  });

  it("returns unknown_field for extra params with strict schema", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({ params: { command: "ls", extra: true } }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "unknown_field")).toBe(true);
  });

  it("returns error for unknown tool", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({ tool: "NONEXISTENT_TOOL", params: {} }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("invalid_value");
    expect(result.errors[0].message).toContain("Unknown tool");
    expect(result.riskClass).toBeUndefined();
  });

  it("validates GENERATE_IMAGE with optional params", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({
        tool: "GENERATE_IMAGE",
        params: { prompt: "a cat", quality: "hd", style: "vivid" },
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.validatedParams).toEqual({
      prompt: "a cat",
      quality: "hd",
      style: "vivid",
    });
    expect(result.riskClass).toBe("reversible");
    expect(result.requiresApproval).toBe(false);
  });

  it("validates PLAY_EMOTE as read-only", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({ tool: "PLAY_EMOTE", params: { emote: "wave" } }),
    );

    expect(result.valid).toBe(true);
    expect(result.riskClass).toBe("read-only");
  });

  it("validates ANALYZE_IMAGE requires at least one image source", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({ tool: "ANALYZE_IMAGE", params: {} }),
    );

    expect(result.valid).toBe(false);
  });

  it("validates ANALYZE_IMAGE with imageUrl", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({
        tool: "ANALYZE_IMAGE",
        params: { imageUrl: "https://example.com/cat.jpg" },
      }),
    );

    expect(result.valid).toBe(true);
  });

  it("validates RESTART_AGENT with optional reason", () => {
    const { validator } = setup();

    const withReason = validator.validate(
      makeCall({ tool: "RESTART_AGENT", params: { reason: "update" } }),
    );
    expect(withReason.valid).toBe(true);

    const withoutReason = validator.validate(
      makeCall({ tool: "RESTART_AGENT", params: {} }),
    );
    expect(withoutReason.valid).toBe(true);
  });

  it("validates INSTALL_PLUGIN with empty pluginId", () => {
    const { validator } = setup();
    const result = validator.validate(
      makeCall({ tool: "INSTALL_PLUGIN", params: { pluginId: "" } }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("out_of_range");
  });

  it("works with custom-registered tool", () => {
    const { registry, validator } = setup();
    const customContract: ToolContract = {
      name: "CUSTOM_TOOL",
      description: "A custom tool",
      version: "1.0.0",
      riskClass: "reversible",
      paramsSchema: z.object({ input: z.string() }).strict(),
      requiredPermissions: [],
      sideEffects: [],
      requiresApproval: false,
      timeoutMs: 30_000,
    };
    registry.register(customContract);

    const result = validator.validate(
      makeCall({ tool: "CUSTOM_TOOL", params: { input: "test" } }),
    );
    expect(result.valid).toBe(true);
  });
});
