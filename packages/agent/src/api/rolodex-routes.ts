import type { IAgentRuntime, UUID } from "@elizaos/core";
import type { RouteRequestContext } from "./route-helpers";

type RolodexGraphQuery = {
  search?: string | null;
  platform?: string | null;
  limit?: number;
  offset?: number;
};

type RolodexGraphService = {
  getGraphSnapshot: (query?: RolodexGraphQuery) => Promise<{
    people: unknown[];
    relationships: unknown[];
    stats: {
      totalPeople: number;
      totalRelationships: number;
      totalIdentities: number;
    };
  }>;
  getPersonDetail: (primaryEntityId: UUID) => Promise<unknown | null>;
};

export interface RolodexRouteContext extends RouteRequestContext {
  runtime?: IAgentRuntime | null;
}

function parseQuery(reqUrl: string | undefined): RolodexGraphQuery {
  const url = new URL(reqUrl ?? "/api/rolodex/graph", "http://localhost");
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  return {
    search: url.searchParams.get("search"),
    platform: url.searchParams.get("platform"),
    limit: limit ? Number.parseInt(limit, 10) : undefined,
    offset: offset ? Number.parseInt(offset, 10) : undefined,
  };
}

function getRolodexGraphService(
  runtime?: IAgentRuntime | null,
): RolodexGraphService | null {
  if (!runtime) {
    return null;
  }
  return runtime.getService("rolodex_graph") as RolodexGraphService | null;
}

export async function handleRolodexRoutes(
  ctx: RolodexRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, json, error, runtime } = ctx;

  if (
    pathname !== "/api/rolodex/graph" &&
    pathname !== "/api/rolodex/people" &&
    !pathname.startsWith("/api/rolodex/people/")
  ) {
    return false;
  }

  if (method !== "GET") {
    return false;
  }

  const rolodexGraph = getRolodexGraphService(runtime);
  if (!rolodexGraph) {
    error(
      res,
      "Rolodex graph service is not available. Make sure the rolodex plugin is enabled.",
      503,
    );
    return true;
  }

  if (pathname === "/api/rolodex/graph") {
    const snapshot = await rolodexGraph.getGraphSnapshot(parseQuery(req.url));
    json(res, { data: snapshot }, 200);
    return true;
  }

  if (pathname === "/api/rolodex/people") {
    const snapshot = await rolodexGraph.getGraphSnapshot(parseQuery(req.url));
    json(
      res,
      {
        data: snapshot.people,
        stats: snapshot.stats,
      },
      200,
    );
    return true;
  }

  const primaryEntityId = decodeURIComponent(
    pathname.slice("/api/rolodex/people/".length),
  );
  if (!primaryEntityId) {
    error(res, "Missing rolodex person identifier.", 400);
    return true;
  }

  const detail = await rolodexGraph.getPersonDetail(primaryEntityId as UUID);
  if (!detail) {
    error(res, "Rolodex person not found.", 404);
    return true;
  }

  json(res, { data: detail }, 200);
  return true;
}
