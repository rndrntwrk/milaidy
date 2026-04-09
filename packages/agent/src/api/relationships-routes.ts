import type { IAgentRuntime, UUID } from "@elizaos/core";
import {
  createNativeRelationshipsGraphService,
  type RelationshipsGraphQuery,
  type RelationshipsGraphService,
} from "../services/relationships-graph.js";
import type { RouteRequestContext } from "./route-helpers.js";

type RelationshipsFeatureRuntime = IAgentRuntime & {
  enableRelationships?: () => Promise<void>;
  isRelationshipsEnabled?: () => boolean;
};

export interface RelationshipsRouteContext extends RouteRequestContext {
  runtime?: IAgentRuntime | null;
}

function parseQuery(reqUrl: string | undefined): RelationshipsGraphQuery {
  const url = new URL(reqUrl ?? "/api/relationships/graph", "http://localhost");
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  return {
    search: url.searchParams.get("search"),
    platform: url.searchParams.get("platform"),
    limit: limit ? Number.parseInt(limit, 10) : undefined,
    offset: offset ? Number.parseInt(offset, 10) : undefined,
  };
}

async function getRelationshipsGraphService(
  runtime?: IAgentRuntime | null,
): Promise<RelationshipsGraphService | null> {
  if (!runtime) {
    return null;
  }

  const graphService = runtime.getService(
    "relationships_graph",
  ) as unknown as RelationshipsGraphService | null;
  if (graphService) {
    return graphService;
  }

  const runtimeWithFeatures = runtime as RelationshipsFeatureRuntime;
  if (
    typeof runtimeWithFeatures.isRelationshipsEnabled === "function" &&
    !runtimeWithFeatures.isRelationshipsEnabled() &&
    typeof runtimeWithFeatures.enableRelationships === "function"
  ) {
    await runtimeWithFeatures.enableRelationships();
  }

  const relationshipsService = runtime.getService("relationships");
  if (!relationshipsService) {
    return null;
  }

  return createNativeRelationshipsGraphService(
    runtime,
    relationshipsService as Parameters<
      typeof createNativeRelationshipsGraphService
    >[1],
  );
}

export async function handleRelationshipsRoutes(
  ctx: RelationshipsRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, json, error, runtime } = ctx;

  if (
    pathname !== "/api/relationships/graph" &&
    pathname !== "/api/relationships/people" &&
    !pathname.startsWith("/api/relationships/people/")
  ) {
    return false;
  }

  if (method !== "GET") {
    return false;
  }

  const relationshipsGraph = await getRelationshipsGraphService(runtime);
  if (!relationshipsGraph) {
    error(
      res,
      "Relationships graph service is not available. Make sure the native relationships feature is enabled.",
      503,
    );
    return true;
  }

  if (pathname === "/api/relationships/graph") {
    const snapshot = await relationshipsGraph.getGraphSnapshot(
      parseQuery(req.url),
    );
    json(res, { data: snapshot }, 200);
    return true;
  }

  if (pathname === "/api/relationships/people") {
    const snapshot = await relationshipsGraph.getGraphSnapshot(
      parseQuery(req.url),
    );
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
    pathname.slice("/api/relationships/people/".length),
  );
  if (!primaryEntityId) {
    error(res, "Missing relationships person identifier.", 400);
    return true;
  }

  const detail = await relationshipsGraph.getPersonDetail(
    primaryEntityId as UUID,
  );
  if (!detail) {
    error(res, "Relationships person not found.", 404);
    return true;
  }

  json(res, { data: detail }, 200);
  return true;
}
