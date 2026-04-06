/**
 * Pure analysis functions for building user activity profiles from message
 * history, in-app interaction signals, desktop screen hints, and calendar data. No runtime
 * dependencies — fully unit-testable.
 */

import { getLocalDateKey, getZonedDateParts } from "../lifeops/time.js";
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

export const SUSTAINED_INACTIVITY_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours
const ACTIVE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const SIGNIFICANT_BUCKET_SHARE = 0.10; // 10% of total messages
const SCREEN_ACTIVE_FOCUS = new Set(["work", "leisure", "transition"]);
const SCREEN_ACTIVITY_CONFIDENCE_FLOOR = 0.35;

type ActivitySession = {
  startAt: number;
  endAt: number;
  startHour: number;
  normalizedEndHour: number;
  startDayKey: string;
};

type InteractionSnapshot = {
  lastSeenAt: number;
  lastSeenPlatform: string | null;
};

function localDateKeyForTimestamp(timestamp: number, timezone: string): string {
  return getLocalDateKey(getZonedDateParts(new Date(timestamp), timezone));
}

function buildActivitySession(
  startAt: number,
  endAt: number,
  timezone: string,
): ActivitySession {
  const startParts = getZonedDateParts(new Date(startAt), timezone);
  const endParts = getZonedDateParts(new Date(endAt), timezone);
  const startDayKey = getLocalDateKey(startParts);
  const startDayOrdinal = Math.floor(
    Date.UTC(startParts.year, startParts.month - 1, startParts.day) /
      86_400_000,
  );
  const endDayOrdinal = Math.floor(
    Date.UTC(endParts.year, endParts.month - 1, endParts.day) / 86_400_000,
  );

  return {
    startAt,
    endAt,
    startHour: startParts.hour,
    normalizedEndHour: endParts.hour + (endDayOrdinal - startDayOrdinal) * 24,
    startDayKey,
  };
}

function buildActivitySessions(
  messages: MessageRecord[],
  timezone: string,
): ActivitySession[] {
  if (messages.length === 0) {
    return [];
  }

  const sorted = [...messages].sort((left, right) => left.createdAt - right.createdAt);
  const sessions: ActivitySession[] = [];
  let sessionStartAt = sorted[0].createdAt;
  let sessionEndAt = sorted[0].createdAt;

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.createdAt - sessionEndAt > SUSTAINED_INACTIVITY_GAP_MS) {
      sessions.push(buildActivitySession(sessionStartAt, sessionEndAt, timezone));
      sessionStartAt = current.createdAt;
    }
    sessionEndAt = current.createdAt;
  }

  sessions.push(buildActivitySession(sessionStartAt, sessionEndAt, timezone));
  return sessions;
}

function resolveLatestInteractionSnapshot(
  messages: MessageRecord[],
  ownerEntityId: string,
  roomSourceMap: Map<string, string>,
  currentTime: Date,
): InteractionSnapshot {
  let latestOwnerSeenAt = 0;
  let latestOwnerPlatform: string | null = null;
  let latestClientChatSeenAt = 0;

  for (const msg of messages) {
    if (msg.createdAt > currentTime.getTime()) {
      continue;
    }

    const source = roomSourceMap.get(msg.roomId) ?? "unknown";
    if (source === "client_chat" && msg.createdAt > latestClientChatSeenAt) {
      latestClientChatSeenAt = msg.createdAt;
    }
    if (msg.entityId === ownerEntityId && msg.createdAt > latestOwnerSeenAt) {
      latestOwnerSeenAt = msg.createdAt;
      latestOwnerPlatform = source;
    }
  }

  if (latestClientChatSeenAt > latestOwnerSeenAt) {
    return {
      lastSeenAt: latestClientChatSeenAt,
      lastSeenPlatform: "client_chat",
    };
  }

  return {
    lastSeenAt: latestOwnerSeenAt,
    lastSeenPlatform: latestOwnerPlatform,
  };
}

function resolveScreenHeartbeatAt(
  profile: Pick<
    ActivityProfile,
    | "screenContextAvailable"
    | "screenContextStale"
    | "screenContextFocus"
    | "screenContextSampledAt"
    | "screenContextConfidence"
  >,
): number {
  if (!profile.screenContextAvailable || profile.screenContextStale) {
    return 0;
  }
  if (!profile.screenContextSampledAt || profile.screenContextSampledAt <= 0) {
    return 0;
  }
  if (!SCREEN_ACTIVE_FOCUS.has(profile.screenContextFocus ?? "unknown")) {
    return 0;
  }
  if (
    profile.screenContextConfidence !== null &&
    profile.screenContextConfidence < SCREEN_ACTIVITY_CONFIDENCE_FLOOR
  ) {
    return 0;
  }
  return profile.screenContextSampledAt;
}

export type CurrentActivityState = Pick<
  ActivityProfile,
  | "lastSeenAt"
  | "lastSeenPlatform"
  | "isCurrentlyActive"
  | "hasOpenActivityCycle"
  | "currentActivityCycleStartedAt"
  | "currentActivityCycleLocalDate"
  | "effectiveDayKey"
>;

export function resolveCurrentActivityState(
  profile: Pick<
    ActivityProfile,
    | "timezone"
    | "lastSeenAt"
    | "lastSeenPlatform"
    | "hasOpenActivityCycle"
    | "sustainedInactivityThresholdMinutes"
    | "currentActivityCycleStartedAt"
    | "currentActivityCycleLocalDate"
    | "screenContextAvailable"
    | "screenContextStale"
    | "screenContextFocus"
    | "screenContextSampledAt"
    | "screenContextConfidence"
  >,
  now: Date,
): CurrentActivityState {
  const currentTime = now.getTime();
  const thresholdMs = profile.sustainedInactivityThresholdMinutes * 60 * 1000;
  const screenHeartbeatAt = resolveScreenHeartbeatAt(profile);
  const mostRecentActivityAt = Math.max(profile.lastSeenAt, screenHeartbeatAt);
  const hasOpenActivityCycle =
    mostRecentActivityAt > 0 && currentTime - mostRecentActivityAt <= thresholdMs;
  const cycleStart =
    profile.currentActivityCycleStartedAt &&
    (profile.hasOpenActivityCycle ||
      mostRecentActivityAt - profile.currentActivityCycleStartedAt <= thresholdMs)
      ? profile.currentActivityCycleStartedAt
      : hasOpenActivityCycle
        ? mostRecentActivityAt
        : profile.currentActivityCycleStartedAt;
  const currentActivityCycleLocalDate = cycleStart
    ? localDateKeyForTimestamp(cycleStart, profile.timezone)
    : profile.currentActivityCycleLocalDate;
  const effectiveDayKey = hasOpenActivityCycle
    ? currentActivityCycleLocalDate ??
      localDateKeyForTimestamp(currentTime, profile.timezone)
    : localDateKeyForTimestamp(currentTime, profile.timezone);

  return {
    lastSeenAt: mostRecentActivityAt,
    lastSeenPlatform: profile.lastSeenPlatform,
    isCurrentlyActive:
      mostRecentActivityAt > 0 &&
      currentTime - mostRecentActivityAt < ACTIVE_THRESHOLD_MS,
    hasOpenActivityCycle,
    currentActivityCycleStartedAt: cycleStart ?? null,
    currentActivityCycleLocalDate,
    effectiveDayKey,
  };
}

export function resolveEffectiveDayKey(
  profile: Pick<
    ActivityProfile,
    | "hasOpenActivityCycle"
    | "currentActivityCycleStartedAt"
    | "currentActivityCycleLocalDate"
    | "lastSeenAt"
    | "lastSeenPlatform"
    | "sustainedInactivityThresholdMinutes"
    | "screenContextAvailable"
    | "screenContextStale"
    | "screenContextFocus"
    | "screenContextSampledAt"
    | "screenContextConfidence"
  >,
  timezone: string,
  now: Date,
): string {
  return resolveCurrentActivityState(
    {
      ...profile,
      timezone,
    },
    now,
  ).effectiveDayKey;
}

function resolveLatestActivityDayKey(
  profile: Pick<
    ActivityProfile,
    | "hasOpenActivityCycle"
    | "currentActivityCycleStartedAt"
    | "currentActivityCycleLocalDate"
    | "lastSeenAt"
    | "lastSeenPlatform"
    | "sustainedInactivityThresholdMinutes"
    | "screenContextAvailable"
    | "screenContextStale"
    | "screenContextFocus"
    | "screenContextSampledAt"
    | "screenContextConfidence"
  >,
  timezone: string,
  now: Date,
): string | null {
  const heartbeatAt = Math.max(
    profile.lastSeenAt,
    resolveScreenHeartbeatAt(profile),
  );
  if (heartbeatAt <= 0) {
    return null;
  }
  const thresholdMs = profile.sustainedInactivityThresholdMinutes * 60 * 1000;
  if (now.getTime() - heartbeatAt <= thresholdMs) {
    if (profile.hasOpenActivityCycle && profile.currentActivityCycleStartedAt) {
      return (
        profile.currentActivityCycleLocalDate ??
        localDateKeyForTimestamp(profile.currentActivityCycleStartedAt, timezone)
      );
    }
    return localDateKeyForTimestamp(heartbeatAt, timezone);
  }
  return localDateKeyForTimestamp(heartbeatAt, timezone);
}

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

  const sessions = buildActivitySessions(ownerMessages, timezone);
  const wakeHours = sessions
    .map((session) => session.startHour)
    .sort((left, right) => left - right);
  const sleepHours = sessions
    .map((session) => session.normalizedEndHour)
    .sort((left, right) => left - right);
  const typicalWakeHour =
    wakeHours.length > 0 ? median(wakeHours) : null;
  const typicalSleepHour =
    sleepHours.length > 0 ? median(sleepHours) : null;

  // Current state
  const latestInteraction = resolveLatestInteractionSnapshot(
    messages,
    ownerEntityId,
    roomSourceMap,
    currentTime,
  );
  let lastSeenAt = latestInteraction.lastSeenAt;
  let lastSeenPlatform = latestInteraction.lastSeenPlatform;
  const hasOpenActivityCycle =
    lastSeenAt > 0 &&
    currentTime.getTime() - lastSeenAt <= SUSTAINED_INACTIVITY_GAP_MS;
  const currentActivityCycle =
    sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const latestInteractionStartsNewCycle =
    lastSeenAt > 0 &&
    (!currentActivityCycle || lastSeenAt > currentActivityCycle.endAt);
  const currentActivityCycleStartedAt = latestInteractionStartsNewCycle
    ? lastSeenAt
    : currentActivityCycle?.startAt ?? lastSeenAt;
  const currentActivityCycleLocalDate = latestInteractionStartsNewCycle
    ? localDateKeyForTimestamp(lastSeenAt, timezone)
    : currentActivityCycle?.startDayKey ?? localDateKeyForTimestamp(lastSeenAt, timezone);

  return {
    ownerEntityId,
    analyzedAt: currentTime.getTime(),
    analysisWindowDays: windowDays,
    timezone,
    totalMessages,
    sustainedInactivityThresholdMinutes:
      SUSTAINED_INACTIVITY_GAP_MS / 60_000,
    platforms,
    primaryPlatform: platforms[0]?.source ?? null,
    secondaryPlatform: platforms[1]?.source ?? null,
    bucketCounts: aggregateBuckets,
    typicalFirstActiveHour,
    typicalLastActiveHour,
    typicalWakeHour,
    typicalSleepHour,
    lastSeenAt,
    lastSeenPlatform,
    isCurrentlyActive: currentTime.getTime() - lastSeenAt < ACTIVE_THRESHOLD_MS,
    hasOpenActivityCycle,
    currentActivityCycleStartedAt,
    currentActivityCycleLocalDate,
    effectiveDayKey: hasOpenActivityCycle
      ? (currentActivityCycleLocalDate ??
        localDateKeyForTimestamp(currentTime.getTime(), timezone))
      : localDateKeyForTimestamp(currentTime.getTime(), timezone),
    screenContextFocus: null,
    screenContextSource: null,
    screenContextSampledAt: null,
    screenContextConfidence: null,
    screenContextBusy: false,
    screenContextAvailable: false,
    screenContextStale: false,
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

export function wasActiveToday(
  profile: Pick<
    ActivityProfile,
    | "hasOpenActivityCycle"
    | "currentActivityCycleStartedAt"
    | "currentActivityCycleLocalDate"
    | "lastSeenAt"
    | "lastSeenPlatform"
    | "sustainedInactivityThresholdMinutes"
    | "screenContextAvailable"
    | "screenContextStale"
    | "screenContextFocus"
    | "screenContextSampledAt"
    | "screenContextConfidence"
  >,
  timezone: string,
  now: Date,
): boolean {
  return (
    resolveLatestActivityDayKey(profile, timezone, now) ===
    resolveEffectiveDayKey(profile, timezone, now)
  );
}
