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
import { ChannelType } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../../test/helpers/real-runtime";
import {
  ACTION_ROLE_OVERRIDES,
  applyPluginRoleGating,
  ROLE_GATED_PLUGINS,
} from "../plugin-role-gating";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;
let gatedRoomId: UUID;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());

  // Create a world + room so role checks resolve a world context.
  const worldId = "b0000000-0000-4000-8000-000000000001" as UUID;
  await runtime.ensureWorldExists({
    id: worldId,
    name: "PluginGatingWorld",
    agentId: runtime.agentId,
    serverId: worldId,
    metadata: { ownership: { ownerId: runtime.agentId } },
  });
  gatedRoomId = "b0000000-0000-4000-8000-000000000002" as UUID;
  await runtime.ensureRoomExists({
    id: gatedRoomId,
    name: "plugin-gating-test",
    source: "test",
    type: ChannelType.GROUP,
    worldId,
  });
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
    const message = { entityId: nonAdminEntityId, roomId: gatedRoomId } as Memory;

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

  it("registers comprehensive plugin gating map", () => {
    // Verify critical plugins are present
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-agent-orchestrator"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["shell"]).toBe("owner");
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-secrets-manager"]).toBe("owner");
    expect(ROLE_GATED_PLUGINS["cron"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["elizaOSCloud"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["scratchpad"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["discord"]).toBe("user");
    expect(ROLE_GATED_PLUGINS["music-player"]).toBe("user");
  });

  it("registers per-action role overrides for dangerous actions", () => {
    // Orchestrator OWNER-level actions
    expect(ACTION_ROLE_OVERRIDES["SPAWN_AGENT"]).toBe("owner");
    expect(ACTION_ROLE_OVERRIDES["PROVISION_WORKSPACE"]).toBe("owner");

    // Cron OWNER-level actions
    expect(ACTION_ROLE_OVERRIDES["CREATE_CRON"]).toBe("owner");
    expect(ACTION_ROLE_OVERRIDES["DELETE_CRON"]).toBe("owner");

    // Cloud OWNER-level actions
    expect(ACTION_ROLE_OVERRIDES["PROVISION_CLOUD_AGENT"]).toBe("owner");

    // Discord admin-level actions
    expect(ACTION_ROLE_OVERRIDES["DELETE_MESSAGE"]).toBe("admin");
    expect(ACTION_ROLE_OVERRIDES["SETUP_CREDENTIALS"]).toBe("owner");
  });

  it("applies per-action override above plugin floor", () => {
    // SPAWN_AGENT should be gated to "owner" even though plugin floor is "admin"
    const action = makeAction("SPAWN_AGENT");
    const original = action.validate;
    const plugin = makePlugin("@elizaos/plugin-agent-orchestrator", [action]);
    applyPluginRoleGating([plugin]);

    expect(action.validate).not.toBe(original);
  });

  it("blocks non-admin for user-floor plugin actions elevated to admin", async () => {
    // DELETE_MESSAGE in Discord plugin: floor=user, override=admin
    const action = makeAction("DELETE_MESSAGE");
    const plugin = makePlugin("discord", [action]);
    applyPluginRoleGating([plugin]);

    const guestEntityId = "guest-gating-001" as UUID;
    const message = { entityId: guestEntityId, roomId: gatedRoomId } as Memory;

    const result = await action.validate?.(runtime, message, {} as State);
    expect(result).toBe(false);
  }, 60_000);
});
