import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../autonomy/tools/registry.js";
import { customActionPostConditions } from "../autonomy/verification/postconditions/custom-action.postcondition.js";
import type { CustomActionDef } from "../config/types.milaidy.js";
import { registerCustomActionLive, setCustomActionsRuntime } from "./custom-actions.js";

function makeDef(overrides: Partial<CustomActionDef> = {}): CustomActionDef {
  return {
    id: "ca-test",
    name: "CUSTOM_ACTION_TEST",
    description: "Test custom action",
    similes: [],
    parameters: [{ name: "value", description: "value", required: true }],
    handler: { type: "code", code: "return params.value;" },
    enabled: true,
    createdAt: "2026-02-17T00:00:00.000Z",
    updatedAt: "2026-02-17T00:00:00.000Z",
    ...overrides,
  };
}

function makeCodeAction(code: string): CustomActionDef {
  return {
    id: "test-code-action",
    name: "TEST_CODE_ACTION",
    description: "test code",
    similes: [],
    parameters: [],
    handler: {
      type: "code",
      code,
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function makeShellAction(command: string): CustomActionDef {
  return {
    id: "test-shell-action",
    name: "TEST_SHELL_ACTION",
    description: "test shell",
    similes: [],
    parameters: [],
    handler: {
      type: "shell",
      command,
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("custom action SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not duplicate postcondition registration for same action", () => {
    const registry = new ToolRegistry();
    const registerConditions = vi.fn();
    const runtime = {
      registerAction: vi.fn(),
      getService: vi.fn(() => ({
        getToolRegistry: () => registry,
        getPostConditionVerifier: () => ({
          registerConditions,
        }),
      })),
    } as unknown as IAgentRuntime;

    setCustomActionsRuntime(runtime);
    const def = makeDef({ name: "CUSTOM_DUP_TEST" });
    registerCustomActionLive(def);
    registerCustomActionLive(def);

    expect(registerConditions).toHaveBeenCalledTimes(1);
    expect(registry.has("CUSTOM_DUP_TEST")).toBe(true);
  });

  it("still registers action when autonomy service is unavailable", () => {
    const runtime = {
      registerAction: vi.fn(),
      getService: vi.fn(() => null),
    } as unknown as IAgentRuntime;

    setCustomActionsRuntime(runtime);
    const action = registerCustomActionLive(
      makeDef({ name: "CUSTOM_NO_AUTONOMY" }),
    );

    expect(action).not.toBeNull();
    expect(runtime.registerAction).toHaveBeenCalledTimes(1);
  });

  it("blocks code handlers from fetching internal addresses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(
      makeCodeAction(`
        await fetch("http://127.0.0.1:9999/private");
        return "unexpected";
      `),
    );

    await expect(handler({})).rejects.toThrow("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows code handlers to fetch public URLs", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ status: 200, text: async () => "ok" } as Response);
    const handler = buildTestHandler(
      makeCodeAction(`
        const response = await fetch("https://example.com/data");
        return await response.text();
      `),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/data",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("blocks redirects for code handlers", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 302,
      headers: new Headers({ location: "http://169.254.169.254/latest" }),
      text: async () => "",
    } as Response);
    const handler = buildTestHandler(
      makeCodeAction(`
        const response = await fetch("https://example.com/redirect");
        return String(response.status);
      `),
    );

    await expect(handler({})).rejects.toThrow(
      "redirects are not allowed for code custom actions",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/redirect",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("includes a scoped clientId for shell terminal runs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);
    const handler = buildTestHandler(makeShellAction("echo hello"));

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:2138/api/terminal/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          command: "echo hello",
          clientId: "runtime-shell-action",
        }),
      }),
    );
  });

  it("attaches API auth token for shell handlers when MILADY_API_TOKEN is set", async () => {
    const originalToken = process.env.MILADY_API_TOKEN;
    process.env.MILADY_API_TOKEN = "test-api-token";

    try {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);
      const handler = buildTestHandler(makeShellAction("echo hello"));

      const result = await handler({});
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:2138/api/terminal/run",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-token",
          }),
        }),
      );
    } finally {
      if (originalToken === undefined) {
        delete process.env.MILADY_API_TOKEN;
      } else {
        process.env.MILADY_API_TOKEN = originalToken;
      }
    }
  });
});

