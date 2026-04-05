import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole } = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: mockCheckSenderRole,
}));

import {
  patchPluginModuleForAdminOnly,
  stripPluginServiceTypes,
  wrapPluginForAdminOnly,
} from "./plugin-access-control.js";

describe("plugin access control", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
  });

  it("blocks wrapped providers and actions for non-admin users", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const providerGet = vi.fn().mockResolvedValue({
      text: "secret",
    });
    const actionValidate = vi.fn().mockResolvedValue(true);
    const actionHandler = vi.fn().mockResolvedValue({
      success: true,
      text: "done",
    });
    const plugin = wrapPluginForAdminOnly("@elizaos/plugin-todo", {
      name: "todo",
      description: "todo",
      providers: [
        {
          name: "todos",
          get: providerGet,
        },
      ],
      actions: [
        {
          name: "CREATE_TODO",
          description: "create",
          validate: actionValidate,
          handler: actionHandler,
        },
      ],
    });

    const runtime = {
      agentId: "agent-1",
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
    };
    const providerResult = await plugin.providers?.[0]?.get(
      runtime as never,
      { entityId: "user-1" } as never,
      {} as never,
    );
    const isValid = await plugin.actions?.[0]?.validate(
      runtime as never,
      { entityId: "user-1" } as never,
      {} as never,
    );
    const actionResult = await plugin.actions?.[0]?.handler(
      runtime as never,
      { entityId: "user-1" } as never,
      {} as never,
    );

    expect(providerGet).not.toHaveBeenCalled();
    expect(actionValidate).not.toHaveBeenCalled();
    expect(actionHandler).not.toHaveBeenCalled();
    expect(providerResult).toEqual({
      text: "",
      values: {},
      data: {},
    });
    expect(isValid).toBe(false);
    expect(actionResult).toMatchObject({
      success: false,
      data: {
        plugin: "@elizaos/plugin-todo",
        action: "CREATE_TODO",
        reason: "admin_only",
      },
    });
  });

  it("keeps access for the agent and strips targeted services", async () => {
    const providerGet = vi.fn().mockResolvedValue({
      text: "visible",
    });
    const actionValidate = vi.fn().mockResolvedValue(true);
    const actionHandler = vi.fn().mockResolvedValue({
      success: true,
    });
    const module = patchPluginModuleForAdminOnly(
      {
        default: {
          name: "todo",
          description: "todo",
          providers: [
            {
              name: "todos",
              get: providerGet,
            },
          ],
          actions: [
            {
              name: "CREATE_TODO",
              description: "create",
              validate: actionValidate,
              handler: actionHandler,
            },
          ],
          services: [
            {
              name: "TodoReminderService",
              serviceType: "TODO_REMINDER",
            },
            {
              name: "TodoIntegrationBridge",
              serviceType: "TODO_INTEGRATION_BRIDGE",
            },
          ] as never,
        },
      },
      "@elizaos/plugin-todo",
      {
        stripServiceTypes: ["TODO_REMINDER"],
      },
    );

    const plugin = stripPluginServiceTypes(module.default!, [
      "DOES_NOT_EXIST",
    ]);
    const runtime = {
      agentId: "agent-1",
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
    };
    const providerResult = await plugin.providers?.[0]?.get(
      runtime as never,
      { entityId: "agent-1" } as never,
      {} as never,
    );
    const actionResult = await plugin.actions?.[0]?.handler(
      runtime as never,
      { entityId: "agent-1" } as never,
      {} as never,
    );

    expect(providerGet).toHaveBeenCalledTimes(1);
    expect(actionValidate).not.toHaveBeenCalled();
    expect(actionHandler).toHaveBeenCalledTimes(1);
    expect(providerResult).toEqual({ text: "visible" });
    expect(actionResult).toEqual({ success: true });
    expect(module.default?.services).toHaveLength(1);
    expect(module.default?.services?.[0]?.serviceType).toBe(
      "TODO_INTEGRATION_BRIDGE",
    );
  });
});
