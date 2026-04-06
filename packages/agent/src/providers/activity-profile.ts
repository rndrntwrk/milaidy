/**
 * Activity Profile Provider — injects compact user activity context
 * into every prompt so the LLM knows time-of-day context and user state.
 *
 * Output format (< 200 chars):
 *   "User: active on telegram 5m ago | MORNING | standup in 42m"
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import { resolveCurrentBucket } from "../activity-profile/analyzer.js";
import { getLocalDateKey, getZonedDateParts } from "../lifeops/time.js";
import { readProfileFromMetadata } from "../activity-profile/service.js";
import { PROACTIVE_TASK_TAGS } from "../activity-profile/proactive-worker.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function hasAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const activityProfileProvider: Provider = {
  name: "activity-profile",
  description:
    "Owner/admin and agent only. Compact user activity context: platform, time bucket, recency.",
  dynamic: true,
  position: 13,
  async get(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    // Access control: owner/admin or agent self-talk only
    const source = (message.content as Record<string, unknown> | undefined)?.source;
    if (source !== "client_chat" && message.entityId !== runtime.agentId) {
      if (!(await hasAccess(runtime, message))) {
        return { text: "", values: {}, data: {} };
      }
    }

    const timezone = resolveDefaultTimeZone();
    const now = new Date();
    const bucket = resolveCurrentBucket(timezone, now);

    // Try to read profile from proactive task metadata
    let profileText = "";
    try {
      const tasks = await runtime.getTasks({
        agentIds: [runtime.agentId],
        tags: [...PROACTIVE_TASK_TAGS],
      });
      const task = tasks.find(
        (t) => t.name === "PROACTIVE_AGENT" && isRecord(t.metadata),
      );
      const metadata = isRecord(task?.metadata) ? task.metadata : null;
      const profile = readProfileFromMetadata(metadata);

      if (profile) {
        const parts: string[] = [];
        const localDateKey = getLocalDateKey(getZonedDateParts(now, timezone));

        // Platform + recency
        if (profile.lastSeenPlatform && profile.lastSeenAt > 0) {
          const ago = formatAgo(now.getTime() - profile.lastSeenAt);
          parts.push(
            profile.isCurrentlyActive
              ? `active on ${profile.lastSeenPlatform} ${ago}`
              : `last seen on ${profile.lastSeenPlatform} ${ago}`,
          );
        }

        // Time bucket
        parts.push(bucket);
        if (profile.effectiveDayKey !== localDateKey) {
          parts.push("previous day still open");
        }

        profileText = parts.length > 0 ? `User: ${parts.join(" | ")}` : "";

        return {
          text: profileText,
          values: {
            userIsActive: profile.isCurrentlyActive,
            userPrimaryPlatform: profile.primaryPlatform,
            userTimeBucket: bucket,
            userEffectiveDayKey: profile.effectiveDayKey,
            userHasOpenActivityCycle: profile.hasOpenActivityCycle,
            userTypicalWakeHour: profile.typicalWakeHour,
            userTypicalSleepHour: profile.typicalSleepHour,
          },
          data: {},
        };
      }
    } catch {
      // Profile not available yet
    }

    // Fallback: just time bucket
    return {
      text: `User context: ${bucket}`,
      values: {
        userIsActive: false,
        userPrimaryPlatform: null,
        userTimeBucket: bucket,
      },
      data: {},
    };
  },
};
