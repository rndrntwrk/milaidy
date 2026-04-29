import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We test createGoogleCalendarEvent and updateGoogleCalendarEvent by mocking
// global `fetch` and inspecting the request body sent to the Google API. The
// main concern: UTC instants must preserve their instant while still carrying
// the intended event timezone.
// ---------------------------------------------------------------------------

import {
  createGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  updateGoogleCalendarEvent,
} from "./google-calendar.js";

// Minimal valid Google Calendar API event response.
function googleEventResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    status: "confirmed",
    summary: "Test Event",
    start: { dateTime: "2026-04-12T09:00:00-07:00" },
    end: { dateTime: "2026-04-12T10:00:00-07:00" },
    ...overrides,
  };
}

describe("google-calendar", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(googleEventResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // createGoogleCalendarEvent
  // -------------------------------------------------------------------------
  describe("createGoogleCalendarEvent", () => {
    it("converts UTC instants into RFC3339 datetimes in the target timezone", async () => {
      await createGoogleCalendarEvent({
        accessToken: "tok",
        title: "Lunch",
        startAt: "2026-04-12T16:00:00.000Z",
        endAt: "2026-04-12T17:00:00.000Z",
        timeZone: "America/Los_Angeles",
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.start.dateTime).toBe("2026-04-12T09:00:00-07:00");
      expect(body.start.timeZone).toBe("America/Los_Angeles");
      expect(body.end.dateTime).toBe("2026-04-12T10:00:00-07:00");
      expect(body.end.timeZone).toBe("America/Los_Angeles");
    });

    it("leaves local datetime values unchanged when timeZone is provided", async () => {
      await createGoogleCalendarEvent({
        accessToken: "tok",
        title: "Lunch",
        startAt: "2026-04-12T16:00:00",
        endAt: "2026-04-12T17:00:00",
        timeZone: "America/Los_Angeles",
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.start.dateTime).toBe("2026-04-12T16:00:00");
      expect(body.end.dateTime).toBe("2026-04-12T17:00:00");
    });
  });

  // -------------------------------------------------------------------------
  // updateGoogleCalendarEvent
  // -------------------------------------------------------------------------
  describe("updateGoogleCalendarEvent", () => {
    it("converts UTC instants into RFC3339 datetimes in the target timezone on PATCH", async () => {
      await updateGoogleCalendarEvent({
        accessToken: "tok",
        eventId: "evt-1",
        startAt: "2026-04-13T18:00:00.000Z",
        endAt: "2026-04-13T19:00:00.000Z",
        timeZone: "America/Chicago",
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.start.dateTime).toBe("2026-04-13T13:00:00-05:00");
      expect(body.start.timeZone).toBe("America/Chicago");
      expect(body.end.dateTime).toBe("2026-04-13T14:00:00-05:00");
      expect(body.end.timeZone).toBe("America/Chicago");
    });

    it("preserves Z suffix on PATCH when no timeZone is provided", async () => {
      await updateGoogleCalendarEvent({
        accessToken: "tok",
        eventId: "evt-1",
        startAt: "2026-04-13T18:00:00.000Z",
        endAt: "2026-04-13T19:00:00.000Z",
        // no timeZone
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.start.dateTime).toBe("2026-04-13T18:00:00.000Z");
      expect(body.end.dateTime).toBe("2026-04-13T19:00:00.000Z");
      expect(body.start.timeZone).toBeUndefined();
    });

    it("omits start/end from PATCH body when not provided", async () => {
      await updateGoogleCalendarEvent({
        accessToken: "tok",
        eventId: "evt-1",
        title: "Renamed Event",
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.summary).toBe("Renamed Event");
      expect(body.start).toBeUndefined();
      expect(body.end).toBeUndefined();
    });
  });

  describe("fetchGoogleCalendarEvents", () => {
    it("normalizes all-day events to local midnight in the feed timezone", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "evt-allday",
                summary: "Offsite",
                status: "confirmed",
                start: { date: "2026-04-05" },
                end: { date: "2026-04-06" },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const events = await fetchGoogleCalendarEvents({
        accessToken: "tok",
        calendarId: "primary",
        timeMin: "2026-04-04T00:00:00.000Z",
        timeMax: "2026-04-07T00:00:00.000Z",
        timeZone: "America/Los_Angeles",
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        externalId: "evt-allday",
        isAllDay: true,
        timezone: "America/Los_Angeles",
        startAt: "2026-04-05T07:00:00.000Z",
        endAt: "2026-04-06T07:00:00.000Z",
      });
    });
  });
});
