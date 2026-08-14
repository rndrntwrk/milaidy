import { describe, expect, it } from "bun:test";

import { handleAliceEmoteRoutes } from "./alice-emote-routes.js";

function context(overrides: Record<string, unknown> = {}) {
  const responses: Array<{ data: unknown; status?: number }> = [];
  const errors: Array<{ message: string; status?: number }> = [];
  const broadcasts: unknown[] = [];
  const streamEvents: unknown[] = [];
  return {
    responses,
    errors,
    broadcasts,
    streamEvents,
    value: {
      req: {},
      res: {},
      method: "POST",
      pathname: "/api/emote",
      json: (_res: unknown, data: unknown, status?: number) =>
        responses.push({ data, status }),
      error: (_res: unknown, message: string, status?: number) =>
        errors.push({ message, status }),
      readJsonBody: async () => ({ emoteId: "dance-happy" }),
      runtime: {
        getService: (name: string) =>
          name === "stream555"
            ? {
                getBoundSessionId: () => "session-live",
                broadcastEvent: async (...args: unknown[]) => {
                  streamEvents.push(args);
                  return { ok: true };
                },
              }
            : undefined,
      },
      broadcastWs: (event: unknown) => broadcasts.push(event),
      ...overrides,
    },
  };
}

describe("Alice emote routes", () => {
  it("relays a catalog emote to both the VRM websocket and Stream", async () => {
    const fixture = context();

    expect(await handleAliceEmoteRoutes(fixture.value as never)).toBe(true);
    expect(fixture.errors).toEqual([]);
    expect(fixture.broadcasts).toEqual([
      {
        type: "emote",
        emoteId: "dance-happy",
        path: "/animations/emotes/dance-happy.glb.gz",
        duration: 4,
        loop: false,
      },
    ]);
    expect(fixture.streamEvents).toEqual([
      [
        "emote",
        {
          emoteId: "dance-happy",
          path: "/animations/emotes/dance-happy.glb.gz",
          duration: 4,
          loop: false,
        },
      ],
    ]);
    expect(fixture.responses).toEqual([
      {
        data: {
          ok: true,
          broadcast: {
            hasService: true,
            hasBroadcastEvent: true,
            boundSessionId: "session-live",
            sent: true,
            result: { ok: true },
          },
        },
        status: undefined,
      },
    ]);
  });

  it("lists the canonical emote catalog", async () => {
    const fixture = context({ method: "GET", pathname: "/api/emotes" });

    expect(await handleAliceEmoteRoutes(fixture.value as never)).toBe(true);
    const response = fixture.responses[0]?.data as {
      emotes?: Array<{ id?: string }>;
    };
    expect(response.emotes?.some((emote) => emote.id === "dance-happy")).toBe(
      true,
    );
  });
});
