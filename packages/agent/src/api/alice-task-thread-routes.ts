import type { IAgentRuntime } from "@elizaos/core";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers.js";

type Context = Pick<RouteRequestMeta, "method" | "pathname" | "res"> &
  Pick<RouteHelpers, "json" | "error"> & {
    runtime: IAgentRuntime | null;
    url: URL;
  };

export async function handleAliceTaskThreadsRead(
  ctx: Context,
): Promise<boolean> {
  if (
    ctx.method !== "GET" ||
    ctx.pathname !== "/api/coding-agents/coordinator/threads"
  ) {
    return false;
  }
  // The current orchestrator owns persistent threads. Polling must never start
  // its execution services through getServiceLoadPromise or a plugin handler.
  const service = ctx.runtime?.getService("ORCHESTRATOR_TASK_SERVICE") as {
    listTasks?: (filter: {
      includeArchived: boolean;
      status?: string;
      search?: string;
      limit: number;
    }) => Promise<object[]>;
  } | null;
  if (typeof service?.listTasks !== "function") {
    ctx.error(ctx.res, "Task thread reader is not available", 503);
    return true;
  }
  const query = ctx.url.searchParams;
  const requestedLimit = Number(query.get("limit") ?? 30);
  try {
    const tasks = await service.listTasks({
      includeArchived: query.get("includeArchived") === "true",
      status: query.get("status") ?? undefined,
      search: query.get("search") ?? undefined,
      limit:
        Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.max(1, Math.min(Math.floor(requestedLimit), 100))
          : 30,
    });
    ctx.json(ctx.res, tasks);
  } catch {
    ctx.error(ctx.res, "Failed to read task threads", 503);
  }
  return true;
}
