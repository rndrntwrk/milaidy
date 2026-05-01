import type http from "node:http";
import type { ElizaConfig } from "../config/types.eliza.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import {
  type AliceCodingActionRequest,
  resolveAliceCodingActionDecision,
  resolveAliceOperationalDefaults,
} from "./alice-coding-policy.js";

export interface AliceCodingPolicyRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  config: Pick<ElizaConfig, "alice">;
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
}

function isActionRequest(value: unknown): value is AliceCodingActionRequest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.action === "string";
}

export async function handleAliceCodingPolicyRoutes(
  ctx: AliceCodingPolicyRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, config, json, error, readJsonBody } = ctx;

  if (
    pathname !== "/api/alice/coding/policy" &&
    pathname !== "/api/alice/coding/decision"
  ) {
    return false;
  }

  const policy = resolveAliceOperationalDefaults(config);

  if (method === "GET" && pathname === "/api/alice/coding/policy") {
    json(res, { ok: true, policy });
    return true;
  }

  if (method === "POST" && pathname === "/api/alice/coding/decision") {
    const body = await readJsonBody<Record<string, unknown>>(req, res, {
      maxBytes: 64 * 1024,
    });
    if (!body) return true;
    if (!isActionRequest(body)) {
      error(res, "Invalid Alice coding action request", 400);
      return true;
    }
    json(res, {
      ok: true,
      policy,
      decision: resolveAliceCodingActionDecision(policy, body),
    });
    return true;
  }

  error(res, "Method not allowed", 405);
  return true;
}
