/**
 * Pure analysis functions for building user activity profiles from message
 * history and calendar data. No runtime dependencies — fully unit-testable.
 */

import { getZonedDateParts } from "../lifeops/time.js";
import {
  type ActivityProfile,
  type PlatformActivity,
  type TimeBucket,
  ALL_TIME_BUCKETS,
  emptyBucketCounts,
} from "./types.js";

// ── Time bucket classification ─────────────────────────

const BUCKET_RANGES: Array<{ bucket: TimeBucket; start: number; end: number }> = [
  { bucket: "EARLY_MORNING", start: 5, end: 7 },
  { bucket: "MORNING", start: 7, end: 10 },
  { bucket: "MIDDAY", start: 10, end: 14 },
  { bucket: "AFTERNOON", start: 14, end: 17 },
  { bucket: "EVENING", start: 17, end: 21 },
  { bucket: "NIGHT", start: 21, end: 24 },
  // LATE_NIGHT wraps: 0-5
];

export function classifyTimeBucket(hour: number): TimeBucket {
  if (hour >= 0 && hour < 5) return "LATE_NIGHT";
  for (const { bucket, start, end } of BUCKET_RANGES) {
    if (hour >= start && hour < end) return bucket;
  }
  // hour === 24 shouldn't happen but treat as LATE_NIGHT
  return "LATE_NIGHT";
}

export function resolveCurrentBucket(timezone: string, now?: Date): TimeBucket {
  const date = now ?? new Date();
  const parts = getZonedDateParts(date, timezone);
  return classifyTimeBucket(parts.hour);
}

// ── Message analysis ───────────────────────────────────

export interface MessageRecord {
  entityId: string;
  roomId: string;
  createdAt: number; // epoch ms
}

export interface CalendarEventRecord {
  startAt: string; // ISO datetime
  endAt: string;
  isAllDay: boolean;
}

const ACTIVE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const SIGNIFICANT_BUCKET_SHARE = 0.10; // 10% of total messages

export function analyzeMessages(
  messages: MessageRecord[],
  roomSourceMap: Map<string, string>,
  ownerEntityId: string,
  timezone: string,
  windowDays: number,
  now?: Date,
): Omit<ActivityProfile, "hasCalendarData" | "typicalFirstEventHour" | "typicalLastEventHour" | "avgWeekdayMeetings"> {
  const currentTime = now ?? new Date();
  const windowStart = currentTime.getTime() - windowDays * 24 * 60 * 60 * 1000;

  // Filter to owner messages within window
  const ownerMessages = messages.filter(
    (m) => m.entityId === ownerEntityId && m.createdAt >= windowStart && m.createdAt <= currentTime.getTime(),
  );

  // Group by platform
  const platformMap = new Map<string, {
    count: number;
    buckets: Record<TimeBucket, number>;
    lastAt: number;
  }>();

  const aggregateBuckets = emptyBucketCounts();

  for (const msg of ownerMessages) {
    const source = roomSourceMap.get(msg.roomId) ?? "unknown";
    let entry = platformMap.get(source);
    if (!entry) {
      entry = { count: 0, buckets: emptyBucketCounts(), lastAt: 0 };
      platformMap.set(source, entry);
    }

    entry.count++;
    if (msg.createdAt > entry.lastAt) entry.lastAt = msg.createdAt;

    const parts = getZonedDateParts(new Date(msg.createdAt), timezone);
    const bucket = classifyTimeBucket(parts.hour);
    entry.buckets[bucket]++;
    aggregateBuckets[bucket]++;
  }

  // Build sorted platform list
  const platforms: PlatformActivity[] = Array.from(platformMap.entries())
    .map(([source, data]) => ({
      source,
      messageCount: data.count,
      bucketCounts: data.buckets,
      lastMessageAt: data.lastAt,
      averageMessagesPerDay: windowDays > 0 ? data.count / windowDays : 0,
    }))
    .sort((a, b) => b.messageCount - a.messageCount);

  // Derive typical active hours from aggregate histogram
  const totalMessages = ownerMessages.length;
  const threshold = totalMessages > 0 ? Math.max(totalMessages * SIGNIFICANT_BUCKET_SHARE, 1) : Infinity;

  let typicalFirstActiveHour: number | null = null;
  let typicalLastActiveHour: number | null = null;

  // Walk buckets in chronological order (EARLY_MORNING first)
  for (const bucket of ALL_TIME_BUCKETS) {
    if (aggregateBuckets[bucket] >= threshold) {
      const midHour = bucketMidpointHour(bucket);
      if (typicalFirstActiveHour === null) typicalFirstActiveHour = midHour;
      typicalLastActiveHour = midHour;
    }
  }

  // Current state
  let lastSeenAt = 0;
  let lastSeenPlatform: string | null = null;
  for (const p of platforms) {
    if (p.lastMessageAt > lastSeenAt) {
      lastSeenAt = p.lastMessageAt;
      lastSeenPlatform = p.source;
    }
  }

  return {
    ownerEntityId,
    analyzedAt: currentTime.getTime(),
    analysisWindowDays: windowDays,
    timezone,
    totalMessages,
    platforms,
    primaryPlatform: platforms[0]?.source ?? null,
    secondaryPlatform: platforms[1]?.source ?? null,
    bucketCounts: aggregateBuckets,
    typicalFirstActiveHour,
    typicalLastActiveHour,
    lastSeenAt,
    lastSeenPlatform,
    isCurrentlyActive: currentTime.getTime() - lastSeenAt < ACTIVE_THRESHOLD_MS,
  };
}

// ── Calendar enrichment ────────────────────────────────

export function enrichWithCalendar(
  profile: Omit<ActivityProfile, "hasCalendarData" | "typicalFirstEventHour" | "typicalLastEventHour" | "avgWeekdayMeetings">,
  calendarEvents: CalendarEventRecord[],
  timezone: string,
): ActivityProfile {
  if (calendarEvents.length === 0) {
    return {
      ...profile,
      hasCalendarData: false,
      typicalFirstEventHour: null,
      typicalLastEventHour: null,
      avgWeekdayMeetings: null,
    };
  }

  // Filter to non-all-day events and extract local hours
  const eventHours: { startHour: number; endHour: number; dayOfWeek: number }[] = [];

  for (const event of calendarEvents) {
    if (event.isAllDay) continue;
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const startParts = getZonedDateParts(start, timezone);
    const endParts = getZonedDateParts(end, timezone);
    const date = new Date(start);
    eventHours.push({
      startHour: startParts.hour,
      endHour: endParts.hour,
      dayOfWeek: date.getDay(), // 0=Sun, 1=Mon, ...
    });
  }

  if (eventHours.length === 0) {
    return {
      ...profile,
      hasCalendarData: true,
      typicalFirstEventHour: null,
      typicalLastEventHour: null,
      avgWeekdayMeetings: null,
    };
  }

  // Weekday events only (Mon-Fri)
  const weekdayEvents = eventHours.filter((e) => e.dayOfWeek >= 1 && e.dayOfWeek <= 5);

  // Compute median first event hour on weekdays
  const firstHours = weekdayEvents.map((e) => e.startHour).sort((a, b) => a - b);
  const lastHours = weekdayEvents.map((e) => e.endHour).sort((a, b) => a - b);

  const typicalFirstEventHour = firstHours.length > 0 ? median(firstHours) : null;
  const typicalLastEventHour = lastHours.length > 0 ? median(lastHours) : null;

  // Average weekday meetings: count unique weekdays, divide total by that
  const weekdaySet = new Set(weekdayEvents.map((e) => e.dayOfWeek));
  const avgWeekdayMeetings = weekdaySet.size > 0
    ? Math.round((weekdayEvents.length / weekdaySet.size) * 10) / 10
    : null;

  return {
    ...profile,
    hasCalendarData: true,
    typicalFirstEventHour,
    typicalLastEventHour,
    avgWeekdayMeetings,
  };
}

// ── Helpers ────────────────────────────────────────────

function bucketMidpointHour(bucket: TimeBucket): number {
  switch (bucket) {
    case "EARLY_MORNING": return 6;
    case "MORNING": return 8;
    case "MIDDAY": return 12;
    case "AFTERNOON": return 15;
    case "EVENING": return 19;
    case "NIGHT": return 22;
    case "LATE_NIGHT": return 3;
  }
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
