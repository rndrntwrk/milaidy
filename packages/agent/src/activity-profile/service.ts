/**
 * ActivityProfileService — orchestrates data fetching, analysis, and
 * persistence for the user activity profile. Uses task metadata for storage.
 */

import type { IAgentRuntime, UUID } from "@elizaos/core";
import { LifeOpsService } from "../lifeops/service.js";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import {
  analyzeMessages,
  enrichWithCalendar,
  type CalendarEventRecord,
  type MessageRecord,
} from "./analyzer.js";
import type { ActivityProfile, FiredActionsLog } from "./types.js";

// ── Constants ─────────────────────────────────────────

const PROFILE_MAX_AGE_MS = 60 * 60 * 1000; // 60 min full rebuild threshold
const MESSAGES_WINDOW_DAYS = 7;
const MESSAGES_LIMIT = 500;
const MAX_ROOMS = 50;

// ── Owner resolution ──────────────────────────────────

type WorldMetadataShape = {
  ownership?: { ownerId?: string };
};

export async function resolveOwnerEntityId(
  runtime: IAgentRuntime,
): Promise<string | null> {
  // Try all worlds the agent participates in
  try {
    const worlds = await runtime.getWorlds();
    for (const world of worlds) {
      const metadata = (world?.metadata ?? {}) as WorldMetadataShape;
      if (metadata.ownership?.ownerId) {
        return metadata.ownership.ownerId;
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

// ── Profile building ──────────────────────────────────

export async function buildActivityProfile(
  runtime: IAgentRuntime,
  ownerEntityId: string,
  timezone?: string,
  now?: Date,
): Promise<ActivityProfile> {
  const tz = timezone ?? resolveDefaultTimeZone();
  const currentTime = now ?? new Date();

  // 1. Get all rooms the owner participates in
  const roomIds = await runtime.getRoomsForParticipant(ownerEntityId as UUID);
  const limitedRoomIds = roomIds.slice(0, MAX_ROOMS);

  // 2. Build room → source map
  const roomSourceMap = new Map<string, string>();
  await Promise.all(
    limitedRoomIds.map(async (roomId) => {
      try {
        const room = await runtime.getRoom(roomId);
        if (room?.source) {
          roomSourceMap.set(roomId, room.source);
        }
      } catch {
        // Skip rooms we can't read
      }
    }),
  );

  // 3. Fetch messages
  const messages: MessageRecord[] = [];
  if (limitedRoomIds.length > 0) {
    const memories = await runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: limitedRoomIds,
      limit: MESSAGES_LIMIT,
    });
    for (const mem of memories) {
      messages.push({
        entityId: mem.entityId,
        roomId: mem.roomId,
        createdAt: mem.createdAt ?? 0,
      });
    }
  }

  // 4. Analyze messages
  const baseProfile = analyzeMessages(
    messages,
    roomSourceMap,
    ownerEntityId,
    tz,
    MESSAGES_WINDOW_DAYS,
    currentTime,
  );

  // 5. Enrich with calendar if available
  let calendarEvents: CalendarEventRecord[] = [];
  try {
    const lifeOpsService = new LifeOpsService(runtime);
    const feed = await lifeOpsService.getCalendarFeed(
      new URL("http://localhost/api/lifeops/calendar"),
      {},
      currentTime,
    );
    calendarEvents = feed.events.map((e) => ({
      startAt: e.startAt ?? e.start?.dateTime ?? "",
      endAt: e.endAt ?? e.end?.dateTime ?? "",
      isAllDay: e.isAllDay ?? (e.start?.date != null && !e.start?.dateTime),
    }));
  } catch {
    // Calendar not connected — that's fine
  }

  return enrichWithCalendar(baseProfile, calendarEvents, tz);
}

// ── Lightweight current-state refresh ─────────────────

export async function refreshCurrentState(
  runtime: IAgentRuntime,
  ownerEntityId: string,
  profile: ActivityProfile,
  now?: Date,
): Promise<ActivityProfile> {
  const currentTime = now ?? new Date();
  const roomIds = await runtime.getRoomsForParticipant(ownerEntityId as UUID);
  const limitedRoomIds = roomIds.slice(0, MAX_ROOMS);

  if (limitedRoomIds.length === 0) {
    return { ...profile, isCurrentlyActive: false };
  }

  const memories = await runtime.getMemoriesByRoomIds({
    tableName: "messages",
    roomIds: limitedRoomIds,
    limit: 10,
  });

  const ownerMessages = memories
    .filter((m) => m.entityId === ownerEntityId)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  if (ownerMessages.length === 0) {
    return { ...profile, isCurrentlyActive: false };
  }

  const latest = ownerMessages[0];
  const lastSeenAt = latest.createdAt ?? 0;

  let lastSeenPlatform = profile.lastSeenPlatform;
  try {
    const room = await runtime.getRoom(latest.roomId);
    if (room?.source) lastSeenPlatform = room.source;
  } catch {
    // Keep existing
  }

  return {
    ...profile,
    lastSeenAt,
    lastSeenPlatform,
    isCurrentlyActive: currentTime.getTime() - lastSeenAt < 15 * 60 * 1000,
  };
}

// ── Metadata persistence helpers ──────────────────────

export interface ProactiveTaskMetadata {
  activityProfile?: ActivityProfile;
  firedActionsLog?: FiredActionsLog;
  proactiveAgent: {
    kind: "runtime_runner";
    version: number;
  };
  updateInterval: number;
  baseInterval: number;
}

export function readProfileFromMetadata(
  metadata: Record<string, unknown> | null,
): ActivityProfile | null {
  if (!metadata?.activityProfile) return null;
  return metadata.activityProfile as ActivityProfile;
}

export function readFiredLogFromMetadata(
  metadata: Record<string, unknown> | null,
  todayDateStr: string,
): FiredActionsLog | null {
  const log = metadata?.firedActionsLog as FiredActionsLog | undefined;
  if (!log || log.date !== todayDateStr) return null;
  return log;
}

export function profileNeedsRebuild(
  profile: ActivityProfile | null,
  now: Date,
): boolean {
  if (!profile) return true;
  return now.getTime() - profile.analyzedAt > PROFILE_MAX_AGE_MS;
}
