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

  test("falls back to the native relationships service when no graph service is registered", async () => {
    const enableRelationships = vi.fn(async () => undefined);
    const relationshipsService = {
      searchContacts: vi.fn(async () => [
        {
          entityId: "person-1" as UUID,
          categories: ["friend"],
          tags: ["vip"],
          preferences: { preferredCommunicationChannel: "discord" },
        },
      ]),
      getContact: vi.fn(async () => ({
        entityId: "person-1" as UUID,
        categories: ["friend"],
        tags: ["vip"],
        preferences: { preferredCommunicationChannel: "discord" },
        customFields: {
          email: "chris@example.com",
        },
        lastModified: "2026-04-08T12:00:00.000Z",
      })),
    };
    const runtime = {
      agentId: "agent-1",
      getService: vi.fn((serviceType: string) => {
        if (serviceType === "relationships") {
          return relationshipsService;
        }
        return null;
      }),
      isRelationshipsEnabled: vi.fn(() => false),
      enableRelationships,
      getAllWorlds: vi.fn(async () => []),
      getRelationships: vi.fn(async () => []),
      getEntityById: vi.fn(async (entityId: UUID) => ({
        id: entityId,
        names: ["Chris"],
        metadata: {
          platformIdentities: [
            {
              platform: "discord",
              handle: "thatdog72",
            },
          ],
        },
      })),
      getMemories: vi.fn(async () => []),
      getRoomsForParticipants: vi.fn(async () => []),
      getRoomsByIds: vi.fn(async () => []),
      getRoomsByWorlds: vi.fn(async () => []),
      getEntitiesForRoom: vi.fn(async () => []),
    } as unknown as IAgentRuntime;
    const ctx = buildCtx("GET", "/api/relationships/graph", undefined, runtime);

    const handled = await handleRelationshipsRoutes(ctx);

    expect(handled).toBe(true);
    expect(enableRelationships).toHaveBeenCalledTimes(1);
    expect(relationshipsService.searchContacts).toHaveBeenCalledWith({});
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({
      data: {
        people: [],
        relationships: [],
        stats: { totalPeople: 0, totalRelationships: 0, totalIdentities: 0 },
      },
    });
  });

  test("builds person detail from the native relationships fallback", async () => {
    const relationshipsService = {
      searchContacts: vi.fn(async () => [{ entityId: "person-1" as UUID }]),
      getContact: vi.fn(async () => ({
        entityId: "person-1" as UUID,
        customFields: {
          website: "https://example.com",
        },
      })),
    };
    const runtime = {
      agentId: "agent-1",
      getService: vi.fn((serviceType: string) =>
        serviceType === "relationships" ? relationshipsService : null,
      ),
      isRelationshipsEnabled: vi.fn(() => true),
      getAllWorlds: vi.fn(async () => []),
      getRelationships: vi.fn(async () => []),
      getEntityById: vi.fn(async (entityId: UUID) => ({
        id: entityId,
        names: ["Chris"],
        metadata: {
          platformIdentities: [
            {
              platform: "discord",
              handle: "thatdog72",
            },
          ],
        },
      })),
      getMemories: vi.fn(async ({ tableName }: { tableName: string }) =>
        tableName === "facts"
          ? [
              {
                id: "fact-1",
                createdAt: Date.parse("2026-04-08T12:00:00.000Z"),
                content: { text: "Prefers async updates." },
              },
            ]
          : [],
      ),
      getRoomsForParticipants: vi.fn(async () => []),
      getRoomsByIds: vi.fn(async () => []),
      getRoomsByWorlds: vi.fn(async () => []),
      getEntitiesForRoom: vi.fn(async () => []),
    } as unknown as IAgentRuntime;
    const ctx = buildCtx(
      "GET",
      "/api/relationships/people/person-1",
      undefined,
      runtime,
    );

    const handled = await handleRelationshipsRoutes(ctx);

    expect(handled).toBe(true);
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({
      data: {
        primaryEntityId: "person-1",
        displayName: "Chris",
        websites: ["https://example.com"],
      },
    });
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1].data.facts,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Prefers async updates." }),
        expect.objectContaining({
          field: "website",
          value: "https://example.com",
        }),
      ]),
    );
  });

  test("derives conversation edges from room traffic and prunes low-signal people in the native fallback", async () => {
    const relationshipsService = {
      searchContacts: vi.fn(async () => [
        { entityId: "person-1" as UUID },
        { entityId: "person-2" as UUID },
        { entityId: "person-3" as UUID },
        { entityId: "person-4" as UUID },
      ]),
      getContact: vi.fn(async (entityId: UUID) => ({
        entityId,
      })),
    };
    const runtime = {
      agentId: "agent-1",
      getService: vi.fn((serviceType: string) =>
        serviceType === "relationships" ? relationshipsService : null,
      ),
      isRelationshipsEnabled: vi.fn(() => true),
      getAllWorlds: vi.fn(async () => [
        { id: "world-1" as UUID, name: "world" },
      ]),
      getRoomsByWorlds: vi.fn(async () => [
        { id: "room-1" as UUID, name: "Discord", type: "group" },
      ]),
      getEntitiesForRoom: vi.fn(async () => [
        { id: "person-1" as UUID, names: ["Chris"] },
        { id: "person-2" as UUID, names: ["Alice"] },
        { id: "person-3" as UUID, names: ["Bystander"] },
        { id: "person-4" as UUID, names: ["Solo"] },
      ]),
      getRelationships: vi.fn(async () => []),
      getEntityById: vi.fn(async (entityId: UUID) => ({
        id: entityId,
        names:
          entityId === "person-1"
            ? ["Chris"]
            : entityId === "person-2"
              ? ["Alice"]
              : entityId === "person-3"
                ? ["Bystander"]
                : ["Solo"],
        metadata: {
          platformIdentities: [
            {
              platform: "discord",
              handle:
                entityId === "person-1"
                  ? "chris"
                  : entityId === "person-2"
                    ? "alice"
                    : entityId === "person-3"
                      ? "bystander"
                      : "solo",
            },
          ],
        },
      })),
      getMemories: vi.fn(
        async ({ tableName, roomId }: { tableName: string; roomId?: UUID }) =>
          tableName === "messages" && roomId === "room-1"
            ? [
                {
                  id: "msg-1",
                  entityId: "person-1" as UUID,
                  createdAt: 1,
                  content: { text: "hey" },
                },
                {
                  id: "msg-2",
                  entityId: "person-2" as UUID,
                  createdAt: 2,
                  content: { text: "reply", inReplyTo: "msg-1" as UUID },
                },
                {
                  id: "msg-3",
                  entityId: "person-1" as UUID,
                  createdAt: 3,
                  content: { text: "follow up" },
                },
                {
                  id: "msg-4",
                  entityId: "person-4" as UUID,
                  createdAt: 4,
                  content: { text: "monologue" },
                },
              ]
            : [],
      ),
      getRoomsForParticipants: vi.fn(async () => []),
      getRoomsByIds: vi.fn(async () => []),
    } as unknown as IAgentRuntime;
    const ctx = buildCtx("GET", "/api/relationships/graph", undefined, runtime);

    const handled = await handleRelationshipsRoutes(ctx);

    expect(handled).toBe(true);
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1],
    ).toMatchObject({
      data: {
        stats: { totalPeople: 2, totalRelationships: 1 },
        people: [
          expect.objectContaining({ displayName: "Chris" }),
          expect.objectContaining({ displayName: "Alice" }),
        ],
        relationships: [
          {
            sourcePersonName: "Chris",
            targetPersonName: "Alice",
            relationshipTypes: expect.arrayContaining([
              "conversation",
              "shared_room",
            ]),
          },
        ],
      },
    });
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1].data.people,
    ).toHaveLength(2);
    expect(
      (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1].data.people,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "Bystander" }),
        expect.objectContaining({ displayName: "Solo" }),
      ]),
    );
  });
});
