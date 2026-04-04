import type http from "node:http";
import type { AgentRuntime, UUID } from "@elizaos/core";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import type {
  CompleteLifeOpsOccurrenceRequest,
  CreateLifeOpsCalendarEventRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  DisconnectLifeOpsGoogleConnectorRequest,
  GetLifeOpsCalendarFeedRequest,
  SnoozeLifeOpsOccurrenceRequest,
  StartLifeOpsGoogleConnectorRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "../contracts/lifeops.js";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";

export interface LifeOpsRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  state: {
    runtime: AgentRuntime | null;
    adminEntityId: UUID | null;
  };
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  decodePathComponent: (
    raw: string,
    res: http.ServerResponse,
    label: string,
  ) => string | null;
}

function getService(ctx: LifeOpsRouteContext): LifeOpsService | null {
  if (!ctx.state.runtime) {
    ctx.error(ctx.res, "Agent runtime is not available", 503);
    return null;
  }
  return new LifeOpsService(ctx.state.runtime);
}

async function runRoute(
  ctx: LifeOpsRouteContext,
  fn: (service: LifeOpsService) => Promise<void>,
): Promise<boolean> {
  const service = getService(ctx);
  if (!service) return true;
  try {
    await fn(service);
    return true;
  } catch (error) {
    if (error instanceof LifeOpsServiceError) {
      ctx.error(ctx.res, error.message, error.status);
      return true;
    }
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function writeHtml(
  res: http.ServerResponse,
  status: number,
  title: string,
  message: string,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5f1e8;
        color: #18120d;
        font-family: "IBM Plex Sans", "Helvetica Neue", sans-serif;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 2rem;
        border: 1px solid rgba(24, 18, 13, 0.12);
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 24px 80px rgba(24, 18, 13, 0.08);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.25rem;
      }
      p {
        margin: 0;
        line-height: 1.5;
        color: rgba(24, 18, 13, 0.78);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
    <script>
      window.setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 250);
    </script>
  </body>
</html>`);
}

export async function handleLifeOpsRoutes(
  ctx: LifeOpsRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, url, json, readJsonBody, decodePathComponent } = ctx;

  if (method === "GET" && pathname === "/api/lifeops/connectors/google/status") {
    return runRoute(ctx, async (service) => {
      const rawMode = url.searchParams.get("mode");
      if (rawMode !== null && rawMode !== "local" && rawMode !== "remote") {
        throw new LifeOpsServiceError(400, "mode must be one of: local, remote");
      }
      json(
        res,
        await service.getGoogleConnectorStatus(
          url,
          (rawMode ?? undefined) as "local" | "remote" | undefined,
        ),
      );
    });
  }

  if (method === "GET" && pathname === "/api/lifeops/calendar/feed") {
    return runRoute(ctx, async (service) => {
      const rawMode = url.searchParams.get("mode");
      const rawForceSync = url.searchParams.get("forceSync");
      if (rawMode !== null && rawMode !== "local" && rawMode !== "remote") {
        throw new LifeOpsServiceError(400, "mode must be one of: local, remote");
      }
      if (
        rawForceSync !== null &&
        rawForceSync !== "true" &&
        rawForceSync !== "false" &&
        rawForceSync !== "1" &&
        rawForceSync !== "0"
      ) {
        throw new LifeOpsServiceError(400, "forceSync must be a boolean");
      }
      const request: GetLifeOpsCalendarFeedRequest = {
        mode: (rawMode ?? undefined) as "local" | "remote" | undefined,
        calendarId: url.searchParams.get("calendarId") ?? undefined,
        timeMin: url.searchParams.get("timeMin") ?? undefined,
        timeMax: url.searchParams.get("timeMax") ?? undefined,
        timeZone: url.searchParams.get("timeZone") ?? undefined,
        forceSync:
          rawForceSync === null
            ? undefined
            : rawForceSync === "true" || rawForceSync === "1",
      };
      json(res, await service.getCalendarFeed(url, request));
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/calendar/events") {
    const body = await readJsonBody<CreateLifeOpsCalendarEventRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, { event: await service.createCalendarEvent(url, body) }, 201);
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/connectors/google/start") {
    const body = await readJsonBody<StartLifeOpsGoogleConnectorRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.startGoogleConnector(body, url));
    });
  }

  if (method === "GET" && pathname === "/api/lifeops/connectors/google/callback") {
    const service = getService(ctx);
    if (!service) return true;
    try {
      await service.completeGoogleConnectorCallback(url);
      writeHtml(
        res,
        200,
        "Google Connected",
        "Google access is now available in Milady. You can close this window.",
      );
      return true;
    } catch (error) {
      if (error instanceof LifeOpsServiceError) {
        writeHtml(res, error.status, "Google Connection Failed", error.message);
        return true;
      }
      throw error;
    }
  }

  if (method === "POST" && pathname === "/api/lifeops/connectors/google/disconnect") {
    const body = await readJsonBody<DisconnectLifeOpsGoogleConnectorRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.disconnectGoogleConnector(body, url));
    });
  }

  if (method === "GET" && pathname === "/api/lifeops/overview") {
    return runRoute(ctx, async (service) => {
      json(res, await service.getOverview());
    });
  }

  if (method === "GET" && pathname === "/api/lifeops/definitions") {
    return runRoute(ctx, async (service) => {
      json(res, { definitions: await service.listDefinitions() });
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/definitions") {
    const body = await readJsonBody<CreateLifeOpsDefinitionRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.createDefinition(body), 201);
    });
  }

  const definitionMatch = pathname.match(/^\/api\/lifeops\/definitions\/([^/]+)$/);
  if (definitionMatch) {
    const definitionId = decodePathComponent(definitionMatch[1], res, "definition id");
    if (!definitionId) return true;
    if (method === "GET") {
      return runRoute(ctx, async (service) => {
        json(res, await service.getDefinition(definitionId));
      });
    }
    if (method === "PUT") {
      const body = await readJsonBody<UpdateLifeOpsDefinitionRequest>(req, res);
      if (!body) return true;
      return runRoute(ctx, async (service) => {
        json(res, await service.updateDefinition(definitionId, body));
      });
    }
  }

  if (method === "GET" && pathname === "/api/lifeops/goals") {
    return runRoute(ctx, async (service) => {
      json(res, { goals: await service.listGoals() });
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/goals") {
    const body = await readJsonBody<CreateLifeOpsGoalRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.createGoal(body), 201);
    });
  }

  const goalMatch = pathname.match(/^\/api\/lifeops\/goals\/([^/]+)$/);
  if (goalMatch) {
    const goalId = decodePathComponent(goalMatch[1], res, "goal id");
    if (!goalId) return true;
    if (method === "GET") {
      return runRoute(ctx, async (service) => {
        json(res, await service.getGoal(goalId));
      });
    }
    if (method === "PUT") {
      const body = await readJsonBody<UpdateLifeOpsGoalRequest>(req, res);
      if (!body) return true;
      return runRoute(ctx, async (service) => {
        json(res, await service.updateGoal(goalId, body));
      });
    }
  }

  const completeMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/complete$/);
  if (method === "POST" && completeMatch) {
    const occurrenceId = decodePathComponent(
      completeMatch[1],
      res,
      "occurrence id",
    );
    if (!occurrenceId) return true;
    const body = await readJsonBody<CompleteLifeOpsOccurrenceRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.completeOccurrence(occurrenceId, body),
      });
    });
  }

  const skipMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/skip$/);
  if (method === "POST" && skipMatch) {
    const occurrenceId = decodePathComponent(skipMatch[1], res, "occurrence id");
    if (!occurrenceId) return true;
    const body = await readJsonBody<Record<string, never>>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.skipOccurrence(occurrenceId),
      });
    });
  }

  const snoozeMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/snooze$/);
  if (method === "POST" && snoozeMatch) {
    const occurrenceId = decodePathComponent(
      snoozeMatch[1],
      res,
      "occurrence id",
    );
    if (!occurrenceId) return true;
    const body = await readJsonBody<SnoozeLifeOpsOccurrenceRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.snoozeOccurrence(occurrenceId, body),
      });
    });
  }

  return false;
}
