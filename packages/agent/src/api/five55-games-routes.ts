import type { RouteRequestContext } from "./route-helpers";
import {
  createAgentRequestId,
  isAgentAuthConfigured,
} from "../plugins/five55-shared/agent-auth.js";
import {
  extractGamesUpstreamError,
  requestGamesAgentJson,
} from "../plugins/five55-games/agent-client.js";

export async function handleFive55GamesRoutes(
  ctx: RouteRequestContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error } = ctx;
  const match = /^\/api\/agent\/v1\/sessions\/([^/]+)\/games\/(catalog|play|switch|stop)$/.exec(
    pathname,
  );
  if (!match) return false;
  if (method !== "POST") {
    error(res, "Method not allowed", 405);
    return true;
  }

  let sessionId: string;
  try {
    sessionId = decodeURIComponent(match[1] ?? "").trim();
  } catch {
    error(res, "Invalid session id", 400);
    return true;
  }
  if (!sessionId) {
    error(res, "sessionId is required", 400);
    return true;
  }

  const operation = match[2];
  const upstreamBase = process.env.STREAM555_BASE_URL?.trim();
  if (!upstreamBase) {
    error(res, "STREAM555_BASE_URL is not configured", 503);
    return true;
  }
  if (!isAgentAuthConfigured()) {
    error(res, "STREAM555 agent auth is not configured", 503);
    return true;
  }

  const body = (await readJsonBody<Record<string, unknown>>(req, res)) ?? {};
  const requestId = createAgentRequestId(`api-five55-games-${operation}`);
  const endpoint = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/${operation}`;
  const upstream = await requestGamesAgentJson(
    upstreamBase,
    requestId,
    "POST",
    endpoint,
    body,
  );

  if (!upstream.ok) {
    const message = extractGamesUpstreamError(upstream.data, upstream.rawBody);
    error(
      res,
      `${message} [requestId: ${upstream.requestId}]`,
      upstream.status || 502,
    );
    return true;
  }

  json(
    res,
    upstream.data ?? {
      ok: true,
      requestId: upstream.requestId,
    },
    upstream.status || 200,
  );
  return true;
}
