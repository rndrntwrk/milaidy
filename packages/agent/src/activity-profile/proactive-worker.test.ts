import { ModelType, type IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  classifyCalendarEventsForProactivePlanning,
  resolveProactiveDeliverySource,
  resolveProactiveOwnerContact,
} from "./proactive-worker.js";

describe("proactive worker routing", () => {
  it("maps app activity platforms back to client_chat delivery", () => {
    expect(resolveProactiveDeliverySource("web_app")).toBe("client_chat");
    expect(resolveProactiveDeliverySource("desktop_app")).toBe("client_chat");
    expect(resolveProactiveDeliverySource("mobile_app")).toBe("client_chat");
  });

  it("falls back to the owner entity for in-app proactive delivery", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "web_app",
        ownerEntityId: "owner-entity-1",
        ownerContacts: {},
      }),
    ).toEqual({
      source: "client_chat",
      contact: { entityId: "owner-entity-1" },
    });
  });

  it("reuses configured owner contacts for external channels", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "telegram",
        ownerEntityId: "owner-entity-1",
        ownerContacts: {
          telegram: {
            entityId: "owner-telegram-entity",
            channelId: "12345",
          },
        },
      }),
    ).toEqual({
      source: "telegram",
      contact: {
        entityId: "owner-telegram-entity",
        channelId: "12345",
      },
    });
  });

  it("falls back to the owner entity for discord proactive delivery", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "discord",
        ownerEntityId: "owner-discord-uuid",
        ownerContacts: {},
      }),
    ).toEqual({
      source: "discord",
      contact: { entityId: "owner-discord-uuid" },
    });
  });
});

describe("calendar proactive classification", () => {
  it("uses TEXT_LARGE and honors LLM-selected actionable events", async () => {
    const useModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        events: [
          {
            id: "event-meeting",
            shouldCheckIn: true,
            reason: "short meeting with another person",
          },
          {
            id: "event-hotel",
            shouldCheckIn: false,
            reason: "passive hotel stay",
          },
        ],
      }),
    );
    const runtime = {
      useModel,
    } as unknown as IAgentRuntime;

    const decisions = await classifyCalendarEventsForProactivePlanning(
      runtime,
      [
        {
          id: "event-meeting",
          summary: "Meeting with Sam",
          startAt: "2026-04-06T09:00:00Z",
          endAt: "2026-04-06T09:30:00Z",
          isAllDay: false,
        },
        {
          id: "event-hotel",
          summary: "Stay at Fairfield Inn in Boulder",
          startAt: "2026-04-06T18:00:00Z",
          endAt: "2026-04-07T10:00:00Z",
          isAllDay: false,
        },
      ],
      "UTC",
      new Date("2026-04-06T07:00:00Z"),
    );

    expect(useModel).toHaveBeenCalledWith(
      ModelType.TEXT_LARGE,
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Decide which calendar events deserve a proactive check-in or reminder from the assistant.",
        ),
      }),
    );
    expect(decisions?.get("event-meeting")).toMatchObject({
      shouldCheckIn: true,
    });
    expect(decisions?.get("event-hotel")).toMatchObject({
      shouldCheckIn: false,
    });
  });

  it("returns null on malformed model output", async () => {
    const runtime = {
      useModel: vi.fn().mockResolvedValue("<response></response>"),
    } as unknown as IAgentRuntime;

    const decisions = await classifyCalendarEventsForProactivePlanning(
      runtime,
      [
        {
          id: "event-meeting",
          summary: "Meeting with Sam",
          startAt: "2026-04-06T09:00:00Z",
          endAt: "2026-04-06T09:30:00Z",
          isAllDay: false,
        },
      ],
      "UTC",
      new Date("2026-04-06T07:00:00Z"),
    );

    expect(decisions).toBeNull();
  });
});
