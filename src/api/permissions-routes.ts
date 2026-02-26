import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export interface PermissionState {
  id: string;
  status: string;
  lastChecked: number;
  canRequest: boolean;
}

export interface PermissionRouteState {
  runtime: AgentRuntime | null;
  config: MiladyConfig;
  permissionStates?: Record<string, PermissionState>;
  shellEnabled?: boolean;
}

export interface PermissionRouteContext extends RouteRequestContext {
  state: PermissionRouteState;
  saveConfig: (config: MiladyConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
}

const SYSTEM_PERMISSION_IDS = [
  "accessibility",
  "screen-recording",
  "microphone",
  "camera",
  "shell",
] as const;

type SystemPermissionId = (typeof SYSTEM_PERMISSION_IDS)[number];

function getDefaultPermissionStatus(
  permissionId: SystemPermissionId,
  shellEnabled: boolean,
): string {
  if (permissionId === "shell") {
    return shellEnabled ? "granted" : "denied";
  }
  return process.platform === "darwin" ? "not-determined" : "not-applicable";
}

function getDefaultCanRequest(permissionId: SystemPermissionId): boolean {
  if (permissionId === "shell") return false;
  return process.platform === "darwin";
}

function buildPermissionStateMap(
  rawStates: Record<string, PermissionState> | undefined,
  shellEnabled: boolean,
): Record<string, PermissionState> {
  const now = Date.now();
  const next: Record<string, PermissionState> = {};

  for (const permissionId of SYSTEM_PERMISSION_IDS) {
    const existing = rawStates?.[permissionId];
    const status =
      permissionId === "shell"
        ? shellEnabled
          ? "granted"
          : "denied"
        : typeof existing?.status === "string" && existing.status.trim().length
          ? existing.status
          : getDefaultPermissionStatus(permissionId, shellEnabled);

    next[permissionId] = {
      id: permissionId,
      status,
      lastChecked: existing?.lastChecked ?? now,
      canRequest:
        permissionId === "shell"
          ? false
          : typeof existing?.canRequest === "boolean"
            ? existing.canRequest
            : getDefaultCanRequest(permissionId),
    };
  }

  return next;
}

export async function handlePermissionRoutes(
  ctx: PermissionRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    state,
    readJsonBody,
    json,
    error,
    saveConfig,
    scheduleRuntimeRestart,
  } = ctx;

  if (!pathname.startsWith("/api/permissions")) return false;

  // ── GET /api/permissions ───────────────────────────────────────────────
  // Returns all system permission states
  if (method === "GET" && pathname === "/api/permissions") {
    const shellEnabled = state.shellEnabled ?? true;
    const permStates = buildPermissionStateMap(
      state.permissionStates,
      shellEnabled,
    );
    state.permissionStates = permStates;

    json(res, {
      permissions: permStates,
      platform: process.platform,
      shellEnabled,
    });
    return true;
  }

  // ── GET /api/permissions/shell ─────────────────────────────────────────
  // Return shell toggle status in a stable shape for UI clients.
  if (method === "GET" && pathname === "/api/permissions/shell") {
    const enabled = state.shellEnabled ?? true;
    state.permissionStates = buildPermissionStateMap(
      state.permissionStates,
      enabled,
    );
    const permission = state.permissionStates.shell;

    // Keep the legacy top-level permission fields for compatibility with
    // callers that previously treated /api/permissions/shell as a generic
    // /api/permissions/:id response.
    json(res, {
      enabled,
      ...permission,
      permission,
    });
    return true;
  }

  // ── GET /api/permissions/:id ───────────────────────────────────────────
  // Returns a single permission state
  if (method === "GET" && pathname.startsWith("/api/permissions/")) {
    const permId = pathname.slice("/api/permissions/".length);
    if (!permId || permId.includes("/")) {
      error(res, "Invalid permission ID", 400);
      return true;
    }
    const permStates = buildPermissionStateMap(
      state.permissionStates,
      state.shellEnabled ?? true,
    );
    state.permissionStates = permStates;

    const permState = permStates[permId];
    if (!permState) {
      json(res, {
        id: permId,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      });
      return true;
    }
    json(res, permState);
    return true;
  }

  // ── POST /api/permissions/refresh ──────────────────────────────────────
  // Force refresh all permission states (clears cache)
  if (method === "POST" && pathname === "/api/permissions/refresh") {
    // Signal to the client that they should refresh permissions via IPC
    // The actual permission checking happens in the Electron main process
    json(res, {
      message: "Permission refresh requested",
      action: "ipc:permissions:refresh",
    });
    return true;
  }

  // ── POST /api/permissions/:id/request ──────────────────────────────────
  // Request a specific permission (triggers system prompt or opens settings)
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/request$/)
  ) {
    const permId = pathname.split("/")[3];
    json(res, {
      message: `Permission request for ${permId}`,
      action: `ipc:permissions:request:${permId}`,
    });
    return true;
  }

  // ── POST /api/permissions/:id/open-settings ────────────────────────────
  // Open system settings for a specific permission
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/open-settings$/)
  ) {
    const permId = pathname.split("/")[3];
    json(res, {
      message: `Opening settings for ${permId}`,
      action: `ipc:permissions:openSettings:${permId}`,
    });
    return true;
  }

  // ── PUT /api/permissions/shell ─────────────────────────────────────────
  // Toggle shell access enabled/disabled
  if (method === "PUT" && pathname === "/api/permissions/shell") {
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return true;
    const enabled = body.enabled === true;
    state.shellEnabled = enabled;
    state.permissionStates = buildPermissionStateMap(
      state.permissionStates,
      enabled,
    );

    // Save to config
    if (!state.config.features) {
      state.config.features = {};
    }
    state.config.features.shellEnabled = enabled;
    saveConfig(state.config);

    // If a runtime is active, restart so plugin loading honors the new
    // shellEnabled flag and shell tools are loaded/unloaded consistently.
    if (state.runtime) {
      scheduleRuntimeRestart(
        `Shell access ${enabled ? "enabled" : "disabled"}`,
      );
    }

    json(res, {
      shellEnabled: enabled,
      permission: state.permissionStates.shell,
    });
    return true;
  }

  // ── PUT /api/permissions/state ─────────────────────────────────────────
  // Update permission states from Electron (called by renderer after IPC)
  if (method === "PUT" && pathname === "/api/permissions/state") {
    const body = await readJsonBody<{
      permissions?: Record<string, PermissionState>;
    }>(req, res);
    if (!body) return true;
    if (body.permissions && typeof body.permissions === "object") {
      state.permissionStates = buildPermissionStateMap(
        {
          ...(state.permissionStates ?? {}),
          ...body.permissions,
        },
        state.shellEnabled ?? true,
      );
    } else {
      state.permissionStates = buildPermissionStateMap(
        state.permissionStates,
        state.shellEnabled ?? true,
      );
    }
    json(res, { updated: true, permissions: state.permissionStates });
    return true;
  }

  return false;
}
