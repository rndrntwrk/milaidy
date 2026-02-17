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

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomString(rand: () => number, length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(rand() * chars.length)];
  }
  return out;
}

function randomPrimitive(rand: () => number): unknown {
  const pick = randomInt(rand, 0, 5);
  if (pick === 0) return null;
  if (pick === 1) return rand() < 0.5;
  if (pick === 2) return randomInt(rand, -1000, 1000);
  if (pick === 3) return randomString(rand, randomInt(rand, 0, 20));
  if (pick === 4) return [];
  return {};
}

function randomValue(rand: () => number, depth: number): unknown {
  if (depth <= 0 || rand() < 0.6) return randomPrimitive(rand);
  if (rand() < 0.5) {
    const arr: unknown[] = [];
    const length = randomInt(rand, 0, 6);
    for (let i = 0; i < length; i++) {
      arr.push(randomValue(rand, depth - 1));
    }
    return arr;
  }
  return randomParams(rand, depth - 1);
}

function randomParams(rand: () => number, depth = 2): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const count = randomInt(rand, 0, 6);
  for (let i = 0; i < count; i++) {
    obj[randomString(rand, randomInt(rand, 1, 12))] = randomValue(rand, depth);
  }
  return obj;
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

  it("handles randomized malformed payloads without throwing", () => {
    const { validator } = setup();
    const rand = makeSeededRandom(0x5eed1234);
    const knownTools = [
      "RUN_IN_TERMINAL",
      "GENERATE_IMAGE",
      "PLAY_EMOTE",
      "INSTALL_PLUGIN",
      "ANALYZE_IMAGE",
    ];
    const allowedCodes = new Set([
      "missing_field",
      "type_mismatch",
      "invalid_value",
      "out_of_range",
      "unknown_field",
    ]);

    for (let i = 0; i < 250; i++) {
      const knownTool = rand() < 0.8;
      const tool = knownTool
        ? knownTools[randomInt(rand, 0, knownTools.length - 1)]
        : `UNKNOWN_${randomString(rand, 6).toUpperCase()}`;
      const params = randomParams(rand);

      let result:
        | ReturnType<SchemaValidator["validate"]>
        | undefined;
      expect(() => {
        result = validator.validate(
          makeCall({
            requestId: `fuzz-${i}`,
            tool,
            params,
          }),
        );
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(typeof result!.valid).toBe("boolean");
      expect(Array.isArray(result!.errors)).toBe(true);
      if (!result!.valid) {
        expect(result!.validatedParams).toBeUndefined();
      }
      for (const err of result!.errors) {
        expect(allowedCodes.has(err.code)).toBe(true);
        expect(typeof err.field).toBe("string");
        expect(typeof err.message).toBe("string");
      }
    }
  });
});
