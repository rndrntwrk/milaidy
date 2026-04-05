import type { Memory } from "@elizaos/core";
import {
  getSelfControlStatus,
  parseSelfControlBlockRequest,
  startSelfControlBlock,
  stopSelfControlBlock,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import type { RouteRequestContext } from "./route-helpers";

type WebsiteBlockerRequestBody = {
  websites?: string[] | string;
  durationMinutes?: number | string | null;
  text?: string;
};

export interface WebsiteBlockerRouteContext extends RouteRequestContext {}

function toSyntheticMessage(text: string | undefined): Memory | undefined {
  if (typeof text !== "string" || text.trim().length === 0) {
    return undefined;
  }

  return {
    content: {
      text,
    },
  } as Memory;
}

function buildBlockRequest(
  body: WebsiteBlockerRequestBody,
): ReturnType<typeof parseSelfControlBlockRequest> {
  const parameters: {
    websites?: string[] | string;
    durationMinutes?: number | string | null;
  } = {};

  if (body.websites !== undefined) {
    parameters.websites = body.websites;
  }
  if (body.durationMinutes !== undefined) {
    parameters.durationMinutes = body.durationMinutes;
  }

  return parseSelfControlBlockRequest(
    {
      parameters,
    },
    toSyntheticMessage(body.text),
  );
}

export async function handleWebsiteBlockerRoutes(
  ctx: WebsiteBlockerRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json } = ctx;

  if (
    pathname !== "/api/website-blocker" &&
    pathname !== "/api/website-blocker/status"
  ) {
    return false;
  }

  if (method === "GET") {
    json(res, await getSelfControlStatus());
    return true;
  }

  if (method === "POST" || method === "PUT") {
    const body = await readJsonBody<WebsiteBlockerRequestBody>(req, res);
    if (!body) return true;

    const parsed = buildBlockRequest(body);
    if (!parsed.request) {
      json(
        res,
        {
          success: false,
          error:
            parsed.error ?? "Could not parse the website block request body.",
        },
        400,
      );
      return true;
    }

    const result = await startSelfControlBlock(parsed.request);
    json(
      res,
      result.success
        ? {
            success: true,
            endsAt: result.endsAt,
            request: parsed.request,
          }
        : {
            success: false,
            error: result.error,
            status: result.status,
          },
      result.success ? 200 : 409,
    );
    return true;
  }

  if (method === "DELETE") {
    const result = await stopSelfControlBlock();
    json(
      res,
      result.success
        ? {
            success: true,
            removed: result.removed,
            status: result.status,
          }
        : {
            success: false,
            error: result.error,
            status: result.status,
          },
      result.success ? 200 : 409,
    );
    return true;
  }

  return false;
}
