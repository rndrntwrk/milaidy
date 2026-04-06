import { describe, expect, test, vi } from "vitest";
import type {
  AppManagerLike,
  AppsRouteContext,
  PluginManagerLike,
} from "../../src/api/apps-routes";
import { handleAppsRoutes } from "../../src/api/apps-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildPluginManager(
  overrides: Partial<PluginManagerLike> = {},
): PluginManagerLike {
  return {
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async () => null),
    refreshRegistry: vi.fn(async () => new Map()),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      version: "1.0.0",
      installPath: "/tmp",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      ejectedPath: "/tmp",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      ejectedPath: "/tmp",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      removedPath: "/tmp",
      requiresRestart: false,
    })),
    ...overrides,
  };
}

function buildAppManager(
  overrides: Partial<AppManagerLike> = {},
): AppManagerLike {
  return {
    listAvailable: vi.fn(async () => []),
    search: vi.fn(async () => []),
    listInstalled: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(async () => null),
    attachRun: vi.fn(async () => ({ success: true, message: "attached" })),
    detachRun: vi.fn(async () => ({ success: true, message: "detached" })),
    launch: vi.fn(async () => ({ success: true })),
    stop: vi.fn(async () => ({ success: true })),
    getInfo: vi.fn(async () => null),
    ...overrides,
  };
}

function buildCtx(overrides: Partial<AppsRouteContext> = {}): AppsRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method: "GET", url: "/" }),
    res,
    method: "GET",
    pathname: "/",
    url: new URL("http://localhost:2138/"),
    appManager: buildAppManager(),
    getPluginManager: () => buildPluginManager(),
    parseBoundedLimit: vi.fn((raw, fallback = 20) =>
      raw ? Math.min(Math.max(1, Number(raw)), 100) : fallback,
    ),
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
    runtime: null,
    ...overrides,
  };
}

describe("handleAppsRoutes", () => {
  test("returns false for unrelated path", async () => {
    const ctx = buildCtx({ pathname: "/api/other" });
    const handled = await handleAppsRoutes(ctx);
    expect(handled).toBe(false);
  });

  test("GET /api/apps returns available apps list", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const apps = [{ name: "test-app", version: "1.0.0" }];
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps",
      res,
      appManager: buildAppManager({
        listAvailable: vi.fn(async () => apps),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(apps);
  });

  test("GET /api/apps/search returns empty array for blank query", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/search",
      url: new URL("http://localhost:2138/api/apps/search?q="),
      res,
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual([]);
  });

  test("GET /api/apps/runs returns persisted runs", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const runs = [
      {
        runId: "run-1",
        appName: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
      },
    ];
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs",
      res,
      appManager: buildAppManager({
        listRuns: vi.fn(async () => runs),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(runs);
  });

  test("GET /api/apps/runs/:runId returns 404 when missing", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs/run-404",
      res,
      appManager: buildAppManager({
        getRun: vi.fn(async () => null),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(404);
    expect(getJson()).toEqual({
      error: 'App run "run-404" not found',
    });
  });

  test("GET /api/apps/runs/:runId/health returns the run health payload", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs/run-1/health",
      res,
      appManager: buildAppManager({
        getRun: vi.fn(async () => ({
          runId: "run-1",
          health: {
            state: "healthy",
            message: null,
          },
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      state: "healthy",
      message: null,
    });
  });

  test("POST /api/apps/runs/:runId/attach returns 404 on missing run", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-404/attach",
      res,
      appManager: buildAppManager({
        attachRun: vi.fn(async () => ({
          success: false,
          message: 'App run "run-404" was not found.',
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(404);
    expect(getJson()).toEqual({
      success: false,
      message: 'App run "run-404" was not found.',
    });
  });

  test("POST /api/apps/runs/:runId/detach detaches an active run", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/detach",
      res,
      appManager: buildAppManager({
        detachRun: vi.fn(async () => ({
          success: true,
          message: "Hyperscape detached.",
          run: {
            runId: "run-1",
            viewerAttachment: "detached",
          },
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      success: true,
      message: "Hyperscape detached.",
      run: {
        runId: "run-1",
        viewerAttachment: "detached",
      },
    });
  });

  test("POST /api/apps/runs/:runId/stop delegates to appManager.stop by run id", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const pluginManager = buildPluginManager();
    const stop = vi.fn(async () => ({
      success: true,
      appName: "@elizaos/app-hyperscape",
      runId: "run-1",
      stoppedAt: "2026-04-06T00:00:00.000Z",
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "Hyperscape stopped.",
    }));
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/stop",
      res,
      getPluginManager: () => pluginManager,
      appManager: buildAppManager({
        stop,
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(stop).toHaveBeenCalledWith(pluginManager, "", "run-1");
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      success: true,
      appName: "@elizaos/app-hyperscape",
      runId: "run-1",
      stoppedAt: "2026-04-06T00:00:00.000Z",
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "Hyperscape stopped.",
    });
  });

  test("POST /api/apps/stop rejects requests without name or runId", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/stop",
      res,
      readJsonBody: vi.fn(async () => ({})),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(500);
    expect(getJson()).toEqual({
      error: "name or runId is required",
    });
  });
});
