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

describe("registerCustomActionLive", () => {
  it("hot-registers action and syncs custom contract + postconditions", () => {
    const registry = new ToolRegistry();
    const registerConditions = vi.fn();
    const runtime = {
      registerAction: vi.fn(),
      getService: vi.fn((name: string) =>
        name === "AUTONOMY"
          ? {
              getToolRegistry: () => registry,
              getPostConditionVerifier: () => ({
                registerConditions,
              }),
            }
          : null,
      ),
    } as unknown as IAgentRuntime;

    setCustomActionsRuntime(runtime);
    const def = makeDef({
      name: "CUSTOM_LIVE_SYNC",
      handler: { type: "shell", command: "echo {{value}}" },
    });
    const action = registerCustomActionLive(def);

    expect(action).not.toBeNull();
    expect(runtime.registerAction).toHaveBeenCalledTimes(1);
    expect(registry.has("CUSTOM_LIVE_SYNC")).toBe(true);
    const contract = registry.get("CUSTOM_LIVE_SYNC");
    expect(contract?.riskClass).toBe("irreversible");
    expect(contract?.requiredPermissions).toEqual(["process:shell"]);
    expect(registerConditions).toHaveBeenCalledWith(
      "CUSTOM_LIVE_SYNC",
      customActionPostConditions,
    );
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
});

