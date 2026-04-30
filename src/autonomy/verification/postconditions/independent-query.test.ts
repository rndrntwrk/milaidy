import { describe, expect, it, vi } from "vitest";
import { installPluginIndependentLookupCondition } from "./install-plugin.postcondition.js";
import { triggerIndependentLookupCondition } from "./trigger.postcondition.js";
import type { VerifierContext } from "../types.js";

function makeCtx(overrides: Partial<VerifierContext> = {}): VerifierContext {
  return {
    toolName: "CREATE_TASK",
    params: {},
    result: {},
    durationMs: 10,
    agentId: "agent-test",
    requestId: "req-test",
    ...overrides,
  };
}

describe("independent verification post-conditions", () => {
  it("install-plugin independent lookup uses query path", async () => {
    const query = vi.fn(async () => true);
    const passed = await installPluginIndependentLookupCondition.check(
      makeCtx({
        toolName: "INSTALL_PLUGIN",
        params: { pluginId: "telegram" },
        query,
      }),
    );

    expect(passed).toBe(true);
    expect(query).toHaveBeenCalledWith({
      query: "plugins:installed",
      payload: { pluginName: "telegram" },
    });
  });

  it("trigger independent lookup verifies trigger/task via query path", async () => {
    const query = vi.fn(async () => true);
    const passed = await triggerIndependentLookupCondition.check(
      makeCtx({
        toolName: "CREATE_TASK",
        result: {
          success: true,
          data: { triggerId: "trigger-1", taskId: "task-1" },
        },
        query,
      }),
    );

    expect(passed).toBe(true);
    expect(query).toHaveBeenCalledWith({
      query: "triggers:exists",
      payload: { triggerId: "trigger-1", taskId: "task-1" },
    });
  });

  it("passes when independent query path is unavailable", async () => {
    const installPassed = await installPluginIndependentLookupCondition.check(
      makeCtx({
        toolName: "INSTALL_PLUGIN",
        params: { pluginId: "telegram" },
      }),
    );
    const triggerPassed = await triggerIndependentLookupCondition.check(
      makeCtx({
        toolName: "CREATE_TASK",
        result: { success: true, data: { triggerId: "trigger-1" } },
      }),
    );

    expect(installPassed).toBe(true);
    expect(triggerPassed).toBe(true);
  });
});

