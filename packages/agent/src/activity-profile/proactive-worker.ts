/**
 * Proactive Agent Worker — background task that fires GM/GN/nudges
 * at the right time on the right platform.
 *
 * Follows the same pattern as lifeops/runtime.ts task workers.
 */

import type { IAgentRuntime, Task, TaskMetadata, UUID } from "@elizaos/core";
import { logger, stringToUuid } from "@elizaos/core";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import { loadElizaConfig } from "../config/config.js";
import type { OwnerContactsConfig } from "../config/types.agent-defaults.js";
import { LifeOpsService } from "../lifeops/service.js";
import {
  planGm,
  planGn,
  planNudges,
  type OccurrenceSlim,
  type CalendarEventSlim,
} from "./proactive-planner.js";
import {
  resolveOwnerEntityId,
  buildActivityProfile,
  refreshCurrentState,
  readProfileFromMetadata,
  readFiredLogFromMetadata,
  profileNeedsRebuild,
} from "./service.js";
import { resolveEffectiveDayKey } from "./analyzer.js";
import type { ActivityProfile, FiredActionsLog, ProactiveAction } from "./types.js";

// ── Constants ─────────────────────────────────────────

export const PROACTIVE_TASK_NAME = "PROACTIVE_AGENT" as const;
export const PROACTIVE_TASK_TAGS = ["queue", "repeat", "proactive"] as const;
export const PROACTIVE_TASK_INTERVAL_MS = 60_000;

// ── Task identification ───────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProactiveTask(task: Task): boolean {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const agent = metadata?.proactiveAgent;
  return (
    task.name === PROACTIVE_TASK_NAME &&
    isRecord(agent) &&
    agent.kind === "runtime_runner"
  );
}

function buildProactiveMetadata(
  current: Record<string, unknown> | null = null,
): TaskMetadata {
  return {
    ...(current ?? {}),
    updateInterval: PROACTIVE_TASK_INTERVAL_MS,
    baseInterval: PROACTIVE_TASK_INTERVAL_MS,
    blocking: true,
    proactiveAgent: {
      kind: "runtime_runner",
      version: 1,
    },
  };
}

// ── Config helpers ────────────────────────────────────

function loadOwnerContacts(): OwnerContactsConfig {
  try {
    const cfg = loadElizaConfig();
    return cfg.agents?.defaults?.ownerContacts ?? {};
  } catch {
    return {};
  }
}

// ── Main execution ────────────────────────────────────

export async function executeProactiveTask(
  runtime: IAgentRuntime,
  _options: Record<string, unknown> = {},
): Promise<{ nextInterval: number }> {
  const now = new Date();
  const timezone = resolveDefaultTimeZone();

  try {
    // 1. Resolve owner
    const ownerEntityId = await resolveOwnerEntityId(runtime);
    if (!ownerEntityId) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    // 2. Load existing profile from task metadata
    const tasks = await runtime.getTasks({
      agentIds: [runtime.agentId],
      tags: [...PROACTIVE_TASK_TAGS],
    });
    const task = tasks.find(isProactiveTask);
    if (!task?.id) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    const metadata = isRecord(task.metadata) ? task.metadata : {};
    let profile = readProfileFromMetadata(metadata);

    // 3. Rebuild or refresh profile
    if (profileNeedsRebuild(profile, now)) {
      logger.info("[proactive] Building full activity profile");
      profile = await buildActivityProfile(runtime, ownerEntityId, timezone, now);
    } else if (profile) {
      profile = await refreshCurrentState(runtime, ownerEntityId, profile, now);
    }

    if (!profile) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    const todayStr = resolveEffectiveDayKey(profile, timezone, now);
    let firedLog = readFiredLogFromMetadata(metadata, todayStr);

    // 4. Fetch occurrences and calendar for planning
    const { occurrences, calendarEvents } = await fetchPlannerContext(runtime, timezone, now);

    // 5. Plan actions
    const gmAction = planGm(profile, occurrences, calendarEvents, firedLog, timezone, now);
    const gnAction = planGn(profile, firedLog, timezone, now);
    const nudgeActions = planNudges(profile, occurrences, calendarEvents, firedLog, timezone, now);

    const allActions = [gmAction, gnAction, ...nudgeActions].filter(
      (a): a is ProactiveAction => a !== null && a.status === "pending",
    );

    // 6. Fire due actions
    const ownerContacts = loadOwnerContacts();
    for (const action of allActions) {
      if (action.scheduledFor > now.getTime()) continue;

      const contact = ownerContacts[action.targetPlatform];
      if (!contact) {
        logger.warn(
          `[proactive] No owner contact for platform ${action.targetPlatform}, skipping ${action.kind}`,
        );
        continue;
      }

      try {
        await runtime.sendMessageToTarget(
          { source: action.targetPlatform, entityId: contact.entityId } as Parameters<
            typeof runtime.sendMessageToTarget
          >[0],
          { text: action.contextSummary, source: action.targetPlatform },
        );

        // Record in fired log
        firedLog = recordFiredAction(firedLog, todayStr, action);
        logger.info(`[proactive] Fired ${action.kind} on ${action.targetPlatform}`);
      } catch (err) {
        logger.warn(`[proactive] Failed to send ${action.kind}: ${err}`);
      }
    }

    // 7. Persist updated profile + fired log
    await runtime.updateTask(task.id, {
      metadata: {
        ...metadata,
        activityProfile: profile,
        firedActionsLog: firedLog,
      },
    });
  } catch (err) {
    logger.error(`[proactive] Worker error: ${err}`);
  }

  return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
}

// ── Planner context fetching ──────────────────────────

async function fetchPlannerContext(
  runtime: IAgentRuntime,
  timezone: string,
  now: Date,
): Promise<{ occurrences: OccurrenceSlim[]; calendarEvents: CalendarEventSlim[] }> {
  const occurrences: OccurrenceSlim[] = [];
  const calendarEvents: CalendarEventSlim[] = [];

  try {
    const lifeOpsService = new LifeOpsService(runtime);
    const overview = await lifeOpsService.getOverview(now);

    for (const occ of overview.occurrences) {
      occurrences.push({
        id: occ.id,
        title: occ.title ?? occ.definitionId ?? "untitled",
        dueAt: occ.dueAt,
        state: occ.state,
      });
    }
  } catch {
    // LifeOps not available
  }

  try {
    const lifeOpsService = new LifeOpsService(runtime);
    const feed = await lifeOpsService.getCalendarFeed(
      new URL("http://localhost/api/lifeops/calendar"),
      {},
      now,
    );
    for (const event of feed.events) {
      calendarEvents.push({
        id: event.id,
        summary: event.title ?? "",
        startAt: event.startAt,
        endAt: event.endAt,
        isAllDay: event.isAllDay,
      });
    }
  } catch {
    // Calendar not connected
  }

  return { occurrences, calendarEvents };
}

// ── Fired action recording ────────────────────────────

function recordFiredAction(
  log: FiredActionsLog | null,
  todayStr: string,
  action: ProactiveAction,
): FiredActionsLog {
  const current: FiredActionsLog = log ?? {
    date: todayStr,
    nudgedOccurrenceIds: [],
    nudgedCalendarEventIds: [],
  };

  if (action.kind === "gm") {
    current.gmFiredAt = Date.now();
  } else if (action.kind === "gn") {
    current.gnFiredAt = Date.now();
  } else if (action.kind === "pre_activity_nudge" && action.occurrenceId) {
    current.nudgedOccurrenceIds.push(action.occurrenceId);
  }

  return current;
}

// ── Registration ──────────────────────────────────────

export function registerProactiveTaskWorker(runtime: IAgentRuntime): void {
  if (runtime.getTaskWorker(PROACTIVE_TASK_NAME)) {
    return;
  }
  runtime.registerTaskWorker({
    name: PROACTIVE_TASK_NAME,
    shouldRun: async () => true,
    execute: async (rt, options) =>
      executeProactiveTask(rt, isRecord(options) ? options : {}),
  });
}

type AutonomyServiceLike = {
  getAutonomousRoomId?: () => UUID;
};

export async function ensureProactiveAgentTask(
  runtime: IAgentRuntime,
): Promise<UUID> {
  const tasks = await runtime.getTasks({
    agentIds: [runtime.agentId],
    tags: [...PROACTIVE_TASK_TAGS],
  });
  const existing = tasks.find(isProactiveTask);
  const metadata = buildProactiveMetadata(
    isRecord(existing?.metadata) ? existing.metadata : null,
  );
  if (existing?.id) {
    await runtime.updateTask(existing.id, {
      description: "Proactive agent: GM/GN/nudges based on activity profile",
      metadata,
    });
    return existing.id;
  }

  const autonomy = runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
  const roomId =
    autonomy?.getAutonomousRoomId?.() ??
    stringToUuid(`proactive-agent-room-${runtime.agentId}`);

  return runtime.createTask({
    name: PROACTIVE_TASK_NAME,
    description: "Proactive agent: GM/GN/nudges based on activity profile",
    roomId,
    tags: [...PROACTIVE_TASK_TAGS],
    metadata,
    dueAt: Date.now(),
  });
}
