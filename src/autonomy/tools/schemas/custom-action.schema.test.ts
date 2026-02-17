import { describe, expect, it } from "vitest";
import { createCustomActionContract } from "./custom-action.schema.js";

describe("createCustomActionContract", () => {
  it("enforces declared parameter contracts when provided", () => {
    const contract = createCustomActionContract({
      name: "CUSTOM_WEBHOOK",
      description: "Send webhook payload",
      handlerType: "http",
      parameters: [
        { name: "url", required: true },
        { name: "payload", required: false },
      ],
    });

    expect(contract.paramsSchema.safeParse({ url: "https://example.com" }).success).toBe(
      true,
    );
    expect(contract.paramsSchema.safeParse({}).success).toBe(false);
    expect(
      contract.paramsSchema.safeParse({
        url: "https://example.com",
        extra: "field",
      }).success,
    ).toBe(false);
  });

  it("keeps permissive fallback when parameter metadata is absent", () => {
    const contract = createCustomActionContract({
      name: "CUSTOM_LEGACY",
      description: "Legacy custom action",
      handlerType: "code",
    });

    expect(
      contract.paramsSchema.safeParse({
        any: "value",
        nested: { x: 1 },
      }).success,
    ).toBe(true);
  });

  it("sets risk and approval policy from handler type", () => {
    const shell = createCustomActionContract({
      name: "CUSTOM_SHELL",
      description: "Run shell command",
      handlerType: "shell",
      parameters: [{ name: "command", required: true }],
    });

    const http = createCustomActionContract({
      name: "CUSTOM_HTTP",
      description: "Call endpoint",
      handlerType: "http",
      parameters: [{ name: "url", required: true }],
    });

    expect(shell.riskClass).toBe("irreversible");
    expect(shell.requiresApproval).toBe(true);
    expect(http.riskClass).not.toBe("irreversible");
  });
});

