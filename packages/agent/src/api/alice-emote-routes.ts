import type http from "node:http";
import { logger, type AgentRuntime } from "@elizaos/core";
import { EMOTE_BY_ID, EMOTE_CATALOG } from "../emotes/catalog.js";

interface AliceEmoteRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  json: (res: http.ServerResponse, data: object, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<T | null>;
  runtime?: AgentRuntime | null;
  broadcastWs?: (payload: Record<string, unknown>) => void;
}

type StreamControlService = {
  broadcastEvent?: (
    topic: string,
    payload: unknown,
    sessionId?: string,
  ) => Promise<unknown>;
  getBoundSessionId?: () => string | null;
};

/**
 * Alice-owned VRM routes ported into the exact official Eliza server compiled
 * for cloud releases. They remain separate from generic upstream misc routes
 * so an upstream route filter cannot silently omit the product surface.
 */
export async function handleAliceEmoteRoutes(
  ctx: AliceEmoteRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    json,
    error,
    readJsonBody,
    runtime,
    broadcastWs,
  } = ctx;

  if (method === "GET" && pathname === "/api/emotes") {
    json(res, { emotes: EMOTE_CATALOG });
    return true;
  }

  if (method !== "POST" || pathname !== "/api/emote") {
    return false;
  }

  const body = await readJsonBody<{ emoteId?: string }>(req, res);
  if (!body) return true;
  const emote = body.emoteId ? EMOTE_BY_ID.get(body.emoteId) : undefined;
  if (!emote) {
    error(res, `Unknown emote: ${body.emoteId ?? "(none)"}`);
    return true;
  }

  const emotePayload = {
    emoteId: emote.id,
    path: emote.path,
    duration: emote.duration,
    loop: false,
  };
  broadcastWs?.({ type: "emote", ...emotePayload });

  const streamControl =
    (runtime?.getService?.("stream555") as StreamControlService | undefined) ??
    undefined;
  const broadcast: Record<string, unknown> = {
    hasService: Boolean(streamControl),
    hasBroadcastEvent: typeof streamControl?.broadcastEvent === "function",
    boundSessionId:
      typeof streamControl?.getBoundSessionId === "function"
        ? streamControl.getBoundSessionId()
        : null,
  };

  if (streamControl && typeof streamControl.broadcastEvent === "function") {
    try {
      const result = await streamControl.broadcastEvent("emote", emotePayload);
      broadcast.sent = true;
      broadcast.result = result;
      logger.info?.(
        `[alice-emote-routes] relayed emote ${emotePayload.emoteId} to Stream`,
      );
    } catch (err: unknown) {
      broadcast.sent = false;
      broadcast.error =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      logger.warn?.(
        `[alice-emote-routes] Stream emote relay failed for ${emotePayload.emoteId}: ${String(
          broadcast.error,
        )}`,
      );
    }
  } else {
    broadcast.sent = false;
    broadcast.reason = streamControl
      ? "stream555 service has no broadcastEvent method"
      : "stream555 service not available";
  }

  json(res, { ok: true, broadcast });
  return true;
}
