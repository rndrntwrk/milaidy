import type http from "node:http";
import {
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";
import { ensureCompatApiAuthorized } from "./auth";
import {
  type CompatRuntimeState,
  readCompatJsonBody,
} from "./compat-route-shared";
import {
  sendJsonError as sendJsonErrorResponse,
  sendJson as sendJsonResponse,
} from "./response";

const EMPTY_APPROVAL_SNAPSHOT = {
  mode: "full_control",
  pendingCount: 0,
  pendingApprovals: [],
} as const;

function sanitizeFavoriteApps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const apps: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    apps.push(trimmed);
  }
  return apps;
}

function readFavoriteApps(): string[] {
  const config = loadElizaConfig();
  const ui = (config.ui ?? {}) as Record<string, unknown>;
  return sanitizeFavoriteApps(ui.favoriteApps);
}

function writeFavoriteApps(apps: string[]): string[] {
  const config = loadElizaConfig();
  const ui = (config.ui ?? {}) as Record<string, unknown>;
  const sanitized = sanitizeFavoriteApps(apps);
  ui.favoriteApps = sanitized;
  config.ui = ui as typeof config.ui;
  saveElizaConfig(config);
  return sanitized;
}

type RuntimeRouteLike = {
  type?: string;
  path?: string;
};

function routePathMatches(routePath: string, pathname: string): boolean {
  if (routePath === pathname) return true;
  const routeParts = routePath.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (routeParts.length !== pathParts.length) return false;
  return routeParts.every((part, index) => {
    if (part.startsWith(":")) return true;
    return part === pathParts[index];
  });
}

function runtimeHasRoute(
  state: CompatRuntimeState,
  method: string,
  pathname: string,
): boolean {
  const routes = (state.current as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some((candidate) => {
    const route = candidate as RuntimeRouteLike;
    if (typeof route.path !== "string") return false;
    const routeMethod = String(route.type ?? "GET").toUpperCase();
    return routeMethod === method && routePathMatches(route.path, pathname);
  });
}

async function handleFavoriteAppsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
): Promise<boolean> {
  if (!ensureCompatApiAuthorized(req, res)) return true;

  if (method === "GET") {
    sendJsonResponse(res, 200, { favoriteApps: readFavoriteApps() });
    return true;
  }

  if (method === "PUT") {
    const body = await readCompatJsonBody(req, res);
    if (!body) return true;
    const appName = typeof body.appName === "string" ? body.appName.trim() : "";
    const isFavorite = body.isFavorite === true;
    if (!appName || typeof body.isFavorite !== "boolean") {
      sendJsonErrorResponse(res, 400, "appName and isFavorite are required");
      return true;
    }
    const current = readFavoriteApps().filter((entry) => entry !== appName);
    const next = isFavorite ? [...current, appName] : current;
    sendJsonResponse(res, 200, { favoriteApps: writeFavoriteApps(next) });
    return true;
  }

  return false;
}

async function handleReplaceFavoritesRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  if (!ensureCompatApiAuthorized(req, res)) return true;
  const body = await readCompatJsonBody(req, res);
  if (!body) return true;
  const favoriteAppNames = sanitizeFavoriteApps(body.favoriteAppNames);
  sendJsonResponse(res, 200, {
    favoriteApps: writeFavoriteApps(favoriteAppNames),
  });
  return true;
}

async function handleOverlayPresenceRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  if (!ensureCompatApiAuthorized(req, res)) return true;
  const body = await readCompatJsonBody(req, res);
  if (!body) return true;
  const rawAppName = body.appName;
  if (
    rawAppName !== null &&
    rawAppName !== undefined &&
    typeof rawAppName !== "string"
  ) {
    sendJsonErrorResponse(res, 400, "appName must be a string or null");
    return true;
  }
  const appName =
    typeof rawAppName === "string" && rawAppName.trim()
      ? rawAppName.trim()
      : null;
  sendJsonResponse(res, 200, { ok: true, appName });
  return true;
}

async function handleComputerUseFallbackRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  pathname: string,
  state: CompatRuntimeState,
): Promise<boolean> {
  if (runtimeHasRoute(state, method, pathname)) return false;
  if (!ensureCompatApiAuthorized(req, res)) return true;

  if (method === "GET" && pathname === "/api/computer-use/approvals") {
    sendJsonResponse(res, 200, EMPTY_APPROVAL_SNAPSHOT);
    return true;
  }

  if (method === "GET" && pathname === "/api/computer-use/approvals/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(
      `data: ${JSON.stringify({ type: "snapshot", snapshot: EMPTY_APPROVAL_SNAPSHOT })}\n\n`,
    );
    res.end();
    return true;
  }

  if (method === "POST" && pathname === "/api/computer-use/approval-mode") {
    sendJsonResponse(res, 200, { mode: EMPTY_APPROVAL_SNAPSHOT.mode });
    return true;
  }

  if (
    method === "POST" &&
    /^\/api\/computer-use\/approvals\/[^/]+$/.test(pathname)
  ) {
    sendJsonErrorResponse(res, 404, "Computer-use approval is not pending.");
    return true;
  }

  return false;
}

export async function handleAliceDashboardFallbackRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (pathname === "/api/apps/favorites") {
    return handleFavoriteAppsRoute(req, res, method);
  }

  if (method === "POST" && pathname === "/api/apps/favorites/replace") {
    return handleReplaceFavoritesRoute(req, res);
  }

  if (method === "POST" && pathname === "/api/apps/overlay-presence") {
    return handleOverlayPresenceRoute(req, res);
  }

  if (method === "GET" && pathname === "/api/vincent/status") {
    if (runtimeHasRoute(state, method, pathname)) return false;
    if (!ensureCompatApiAuthorized(req, res)) return true;
    sendJsonResponse(res, 200, { connected: false, connectedAt: null });
    return true;
  }

  if (pathname.startsWith("/api/computer-use/")) {
    return handleComputerUseFallbackRoute(req, res, method, pathname, state);
  }

  return false;
}
