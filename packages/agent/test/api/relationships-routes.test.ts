import type { IAgentRuntime, UUID } from "@elizaos/core";
import { describe, expect, test, vi } from "vitest";
import type { RelationshipsRouteContext } from "../../src/api/relationships-routes";
import { handleRelationshipsRoutes } from "../../src/api/relationships-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildCtx(
  method: string,
  pathname: string,
  reqUrl = pathname,
  runtime?: IAgentRuntime,
): RelationshipsRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: reqUrl }),
    res,
    method,
    pathname,
    runtime,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
  };
}

describe("relationships-routes", () => {
  test("GET /api/relationships/graph returns the graph snapshot", async () => {
    const service = {
      getGraphSnapshot: vi.fn(async () => ({
        people: [{ groupId: "group-1", primaryEntityId: "person-1" as UUID }],
        relationships: [],
        stats: { totalPeople: 1, totalRelationships: 0, totalIdentities: 1 },
      })),
    };
    const runtime = {
      getService: vi.fn((serviceType: string) =>
        serviceType === "relationships_graph" ? service : null,
      ),
    } as unknown as IAgentRuntime;
    const ctx = buildCtx(
      "GET",
      "/api/relationships/graph",
      "/api/relationships/graph?search=chris",
      runtime,
    );

    const handled = await handleRelationshipsRoutes(ctx);

    expect(handled).toBe(true);
    expect(service.getGraphSnapshot).toHaveBeenCalledWith({
      search: "chris",
      platform: null,
      limit: undefined,
      offset: undefined,
    });
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({
      data: {
        stats: { totalPeople: 1 },
      },
    });
  });

  test("GET /api/relationships/people/:id returns person detail", async () => {
    const service = {
      getPersonDetail: vi.fn(async () => ({
        groupId: "group-1",
        primaryEntityId: "person-1" as UUID,
        identities: [],
        facts: [],
        recentConversations: [],
        relationships: [],
        identityEdges: [],
      })),
    };
    const runtime = {
      getService: vi.fn((serviceType: string) =>
        serviceType === "relationships_graph" ? service : null,
      ),
    } as unknown as IAgentRuntime;
    const ctx = buildCtx(
      "GET",
      "/api/relationships/people/person-1",
      undefined,
      runtime,
    );

    const handled = await handleRelationshipsRoutes(ctx);

    expect(handled).toBe(true);
    expect(service.getPersonDetail).toHaveBeenCalledWith("person-1");
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({
      data: {
        primaryEntityId: "person-1",
      },
    });
  });
});
