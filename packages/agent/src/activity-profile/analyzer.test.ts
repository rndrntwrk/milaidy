import { describe, expect, it } from "vitest";
import {
  analyzeMessages,
  classifyTimeBucket,
  enrichWithCalendar,
  resolveCurrentBucket,
  type CalendarEventRecord,
  type MessageRecord,
} from "./analyzer";

// ── classifyTimeBucket ──────────────────────────────────

describe("classifyTimeBucket", () => {
  it.each([
    [0, "LATE_NIGHT"],
    [1, "LATE_NIGHT"],
    [3, "LATE_NIGHT"],
    [4, "LATE_NIGHT"],
    [5, "EARLY_MORNING"],
    [6, "EARLY_MORNING"],
    [7, "MORNING"],
    [9, "MORNING"],
    [10, "MIDDAY"],
    [13, "MIDDAY"],
    [14, "AFTERNOON"],
    [16, "AFTERNOON"],
    [17, "EVENING"],
    [20, "EVENING"],
    [21, "NIGHT"],
    [23, "NIGHT"],
  ] as const)("hour %d → %s", (hour, expected) => {
    expect(classifyTimeBucket(hour)).toBe(expected);
  });
});

// ── resolveCurrentBucket ────────────────────────────────

describe("resolveCurrentBucket", () => {
  it("classifies a known UTC time into the correct bucket", () => {
    // 2026-04-05 08:30 UTC → MORNING in UTC
    const result = resolveCurrentBucket("UTC", new Date("2026-04-05T08:30:00Z"));
    expect(result).toBe("MORNING");
  });

  it("respects timezone offset", () => {
    // 2026-04-05 08:30 UTC → 04:30 in America/New_York (EDT = UTC-4)
    const result = resolveCurrentBucket("America/New_York", new Date("2026-04-05T08:30:00Z"));
    expect(result).toBe("LATE_NIGHT");
  });
});

// ── analyzeMessages ─────────────────────────────────────

function makeMessages(entries: Array<{ hour: number; day?: number; source?: string }>): {
  messages: MessageRecord[];
  roomSourceMap: Map<string, string>;
} {
  const roomSourceMap = new Map<string, string>();
  const messages: MessageRecord[] = [];

  for (const entry of entries) {
    const source = entry.source ?? "telegram";
    const roomId = `room-${source}`;
    roomSourceMap.set(roomId, source);

    const day = entry.day ?? 0;
    const date = new Date("2026-04-05T00:00:00Z");
    date.setDate(date.getDate() - day);
    date.setUTCHours(entry.hour, 0, 0, 0);

    messages.push({
      entityId: "owner-1",
      roomId,
      createdAt: date.getTime(),
    });
  }

  return { messages, roomSourceMap };
}

const NOW = new Date("2026-04-05T12:00:00Z");

describe("analyzeMessages", () => {
  it("counts messages per platform and bucket", () => {
    const { messages, roomSourceMap } = makeMessages([
      { hour: 8 }, // MORNING, telegram
      { hour: 9 }, // MORNING, telegram
      { hour: 14, day: 1, source: "discord" }, // AFTERNOON, discord (yesterday)
    ]);

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);

    expect(profile.totalMessages).toBe(3);
    expect(profile.primaryPlatform).toBe("telegram");
    expect(profile.secondaryPlatform).toBe("discord");
    expect(profile.platforms).toHaveLength(2);
    expect(profile.bucketCounts.MORNING).toBe(2);
    expect(profile.bucketCounts.AFTERNOON).toBe(1);
  });

  it("sorts platforms by message count descending", () => {
    const { messages, roomSourceMap } = makeMessages([
      { hour: 8, source: "discord" },
      { hour: 9, source: "discord" },
      { hour: 10, source: "discord" },
      { hour: 11, source: "telegram" },
    ]);

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profile.primaryPlatform).toBe("discord");
    expect(profile.secondaryPlatform).toBe("telegram");
  });

  it("filters to owner messages only", () => {
    const roomSourceMap = new Map([["room-tg", "telegram"]]);
    const messages: MessageRecord[] = [
      { entityId: "owner-1", roomId: "room-tg", createdAt: NOW.getTime() - 1000 },
      { entityId: "other-user", roomId: "room-tg", createdAt: NOW.getTime() - 2000 },
    ];

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profile.totalMessages).toBe(1);
  });

  it("filters to analysis window", () => {
    const { messages, roomSourceMap } = makeMessages([
      { hour: 8, day: 0 }, // today, in window
      { hour: 8, day: 10 }, // 10 days ago, outside 7-day window
    ]);

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profile.totalMessages).toBe(1);
  });

  it("detects currently active user", () => {
    const recentTime = NOW.getTime() - 5 * 60 * 1000; // 5 min ago
    const roomSourceMap = new Map([["room-tg", "telegram"]]);
    const messages: MessageRecord[] = [
      { entityId: "owner-1", roomId: "room-tg", createdAt: recentTime },
    ];

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profile.isCurrentlyActive).toBe(true);
    expect(profile.lastSeenPlatform).toBe("telegram");
  });

  it("detects inactive user", () => {
    const oldTime = NOW.getTime() - 2 * 60 * 60 * 1000; // 2 hours ago
    const roomSourceMap = new Map([["room-tg", "telegram"]]);
    const messages: MessageRecord[] = [
      { entityId: "owner-1", roomId: "room-tg", createdAt: oldTime },
    ];

    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profile.isCurrentlyActive).toBe(false);
  });

  it("derives typical active hours from histogram", () => {
    // Create messages concentrated in MORNING and EVENING buckets
    const entries: Array<{ hour: number; day?: number }> = [];
    for (let i = 0; i < 20; i++) entries.push({ hour: 8, day: 1 }); // MORNING (yesterday)
    for (let i = 0; i < 15; i++) entries.push({ hour: 19, day: 1 }); // EVENING (yesterday)
    // 2 messages in AFTERNOON (below 10% of 37 = 3.7)
    entries.push({ hour: 15, day: 1 });
    entries.push({ hour: 15, day: 1 });

    const { messages, roomSourceMap } = makeMessages(entries);
    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);

    expect(profile.typicalFirstActiveHour).toBe(8); // MORNING midpoint
    expect(profile.typicalLastActiveHour).toBe(19); // EVENING midpoint
  });

  it("handles empty messages gracefully", () => {
    const profile = analyzeMessages([], new Map(), "owner-1", "UTC", 7, NOW);

    expect(profile.totalMessages).toBe(0);
    expect(profile.primaryPlatform).toBeNull();
    expect(profile.secondaryPlatform).toBeNull();
    expect(profile.typicalFirstActiveHour).toBeNull();
    expect(profile.isCurrentlyActive).toBe(false);
    expect(profile.platforms).toHaveLength(0);
  });

  it("computes averageMessagesPerDay correctly", () => {
    const entries: Array<{ hour: number }> = [];
    for (let i = 0; i < 14; i++) entries.push({ hour: 10 });

    const { messages, roomSourceMap } = makeMessages(entries);
    const profile = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);

    expect(profile.platforms[0].averageMessagesPerDay).toBe(2);
  });

  it("respects timezone for bucket classification", () => {
    // 23:00 UTC on Apr 4 = 19:00 EDT (America/New_York in April = UTC-4)
    const roomSourceMap = new Map([["room-tg", "telegram"]]);
    const date = new Date("2026-04-04T23:00:00Z");
    const messages: MessageRecord[] = [
      { entityId: "owner-1", roomId: "room-tg", createdAt: date.getTime() },
    ];

    const profileUTC = analyzeMessages(messages, roomSourceMap, "owner-1", "UTC", 7, NOW);
    expect(profileUTC.bucketCounts.NIGHT).toBe(1);

    const profileNY = analyzeMessages(messages, roomSourceMap, "owner-1", "America/New_York", 7, NOW);
    expect(profileNY.bucketCounts.EVENING).toBe(1);
  });
});

// ── enrichWithCalendar ──────────────────────────────────

describe("enrichWithCalendar", () => {
  const baseProfile = analyzeMessages([], new Map(), "owner-1", "UTC", 7, NOW);

  it("returns hasCalendarData: false when no events", () => {
    const enriched = enrichWithCalendar(baseProfile, [], "UTC");
    expect(enriched.hasCalendarData).toBe(false);
    expect(enriched.typicalFirstEventHour).toBeNull();
  });

  it("computes typical first and last event hours from weekday events", () => {
    const events: CalendarEventRecord[] = [
      // Monday 9 AM - 10 AM
      { startAt: "2026-03-30T09:00:00Z", endAt: "2026-03-30T10:00:00Z", isAllDay: false },
      // Tuesday 8 AM - 9 AM
      { startAt: "2026-03-31T08:00:00Z", endAt: "2026-03-31T09:00:00Z", isAllDay: false },
      // Wednesday 10 AM - 17 PM
      { startAt: "2026-04-01T10:00:00Z", endAt: "2026-04-01T17:00:00Z", isAllDay: false },
    ];

    const enriched = enrichWithCalendar(baseProfile, events, "UTC");
    expect(enriched.hasCalendarData).toBe(true);
    expect(enriched.typicalFirstEventHour).toBe(9); // median of [8, 9, 10]
    expect(enriched.typicalLastEventHour).toBe(10); // median of [9, 10, 17]
  });

  it("ignores all-day events", () => {
    const events: CalendarEventRecord[] = [
      { startAt: "2026-04-01T00:00:00Z", endAt: "2026-04-02T00:00:00Z", isAllDay: true },
    ];

    const enriched = enrichWithCalendar(baseProfile, events, "UTC");
    expect(enriched.hasCalendarData).toBe(true);
    expect(enriched.typicalFirstEventHour).toBeNull();
  });

  it("computes average weekday meetings", () => {
    const events: CalendarEventRecord[] = [
      // 3 meetings on Monday
      { startAt: "2026-03-30T09:00:00Z", endAt: "2026-03-30T10:00:00Z", isAllDay: false },
      { startAt: "2026-03-30T11:00:00Z", endAt: "2026-03-30T12:00:00Z", isAllDay: false },
      { startAt: "2026-03-30T14:00:00Z", endAt: "2026-03-30T15:00:00Z", isAllDay: false },
      // 1 meeting on Tuesday
      { startAt: "2026-03-31T09:00:00Z", endAt: "2026-03-31T10:00:00Z", isAllDay: false },
    ];

    const enriched = enrichWithCalendar(baseProfile, events, "UTC");
    expect(enriched.avgWeekdayMeetings).toBe(2); // 4 meetings / 2 days = 2.0
  });

  it("excludes weekend events from weekday stats", () => {
    const events: CalendarEventRecord[] = [
      // Saturday
      { startAt: "2026-04-04T10:00:00Z", endAt: "2026-04-04T11:00:00Z", isAllDay: false },
      // Sunday
      { startAt: "2026-04-05T10:00:00Z", endAt: "2026-04-05T11:00:00Z", isAllDay: false },
    ];

    const enriched = enrichWithCalendar(baseProfile, events, "UTC");
    expect(enriched.hasCalendarData).toBe(true);
    expect(enriched.avgWeekdayMeetings).toBeNull();
  });
});
