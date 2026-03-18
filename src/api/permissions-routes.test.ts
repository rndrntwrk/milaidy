import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  handlePermissionRoutes,
  type PermissionRouteState,
} from "./permissions-routes";

describe("permission routes", () => {
  let state: PermissionRouteState;
  let saveConfig: ReturnType<typeof vi.fn>;
  let scheduleRuntimeRestart: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      runtime: null,
      config: {} as MiladyConfig,
    };
    saveConfig = vi.fn();
    scheduleRuntimeRestart = vi.fn();
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    PermissionRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handlePermissionRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        saveConfig,
        scheduleRuntimeRestart,
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-permission routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns permission summary", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions",
    });

    expect(result.status).toBe(200);
    const payload = result.payload as {
      permissions: Record<string, { status: string }>;
      shellEnabled: boolean;
    };
    expect(payload.permissions).toHaveProperty("accessibility");
    expect(payload.permissions).toHaveProperty("screen-recording");
    expect(payload.permissions).toHaveProperty("microphone");
    expect(payload.permissions).toHaveProperty("camera");
    expect(payload.permissions).toHaveProperty("shell");
    expect(result.payload).toMatchObject({
      shellEnabled: true,
    });
    expect(payload.permissions.shell?.status).toBe("granted");
  });

  test("returns shell permission in compatibility shape", async () => {
    state.shellEnabled = false;
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/shell",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      enabled: false,
      id: "shell",
      status: "denied",
      canRequest: false,
      permission: {
        id: "shell",
        status: "denied",
      },
    });
  });

  test("updates shell state and persists config", async () => {
    state.runtime = {} as never;
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/shell",
      body: { enabled: true },
    });

    expect(result.status).toBe(200);
    expect(state.shellEnabled).toBe(true);
    expect(state.config.features).toMatchObject({ shellEnabled: true });
    expect(saveConfig).toHaveBeenCalledWith(state.config);
    expect(scheduleRuntimeRestart).toHaveBeenCalledWith("Shell access enabled");
  });

  test("updates permission state payload from renderer", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/state",
      body: {
        permissions: {
          camera: {
            id: "camera",
            status: "granted",
            lastChecked: 123,
            canRequest: true,
          },
        },
      },
    });

    expect(result.status).toBe(200);
    expect(state.permissionStates).toMatchObject({
      camera: { status: "granted" },
    });
    expect(result.payload).toMatchObject({ updated: true });
  });

  test("rejects invalid nested permission id path", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/camera/extra",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Invalid permission ID" });
  });
});
