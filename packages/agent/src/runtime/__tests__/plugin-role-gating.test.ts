/**
 * Plugin role gating — REAL integration tests.
 *
 * Tests applyPluginRoleGating using a real PGLite-backed runtime
 * with real role checking.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  Action,
  AgentRuntime,
  Memory,
  Plugin,
  State,
  UUID,
} from "@elizaos/core";
import { createRealTestRuntime } from "../../../../../test/helpers/real-runtime";
import {
  applyPluginRoleGating,
  ROLE_GATED_PLUGINS,
} from "../plugin-role-gating";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeAction(name: string, validate?: Action["validate"]): Action {
  return {
    name,
    description: `Test action ${name}`,
    similes: [],
    examples: [],
    validate: validate ?? (async () => true),
    handler: async () => ({ success: true }),
  };
}

function makePlugin(name: string, actions: Action[]): Plugin {
  return { name, description: `Test plugin ${name}`, actions };
}

describe("plugin-role-gating", () => {
  it("gates EVM and Solana plugins", () => {
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-evm"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-solana"]).toBe("admin");
  });

  it("wraps validate for gated plugin actions", () => {
    const action = makeAction("SEND_TOKEN");
    const original = action.validate;
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);

    applyPluginRoleGating([plugin]);

    expect(action.validate).not.toBe(original);
  });

  it("does not wrap validate for ungated plugins", () => {
    const action = makeAction("CHAT");
    const original = action.validate;
    const plugin = makePlugin("@elizaos/plugin-chat", [action]);

    applyPluginRoleGating([plugin]);

    expect(action.validate).toBe(original);
  });

  it("blocks non-admin users for gated actions", async () => {
    const action = makeAction("SEND_TOKEN");
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);
    applyPluginRoleGating([plugin]);

    const nonAdminEntityId = "non-admin-gating-001" as UUID;
    const message = { entityId: nonAdminEntityId } as Memory;

    const result = await action.validate?.(
      runtime,
      message,
      {} as State,
    );

    // Non-admin should be blocked by the gated validate wrapper
    expect(result).toBe(false);
  }, 60_000);

  it("preserves original validate for ungated plugins", async () => {
    let validateCalled = false;
    const action = makeAction("CHAT", async () => {
      validateCalled = true;
      return true;
    });
    const plugin = makePlugin("@elizaos/plugin-chat", [action]);
    applyPluginRoleGating([plugin]);

    const message = { entityId: runtime.agentId } as Memory;
    await action.validate?.(runtime, message, {} as State);

    expect(validateCalled).toBe(true);
  }, 60_000);
});
