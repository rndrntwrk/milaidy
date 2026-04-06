import type { IAgentRuntime, Task, TaskMetadata, UUID } from "@elizaos/core";
import { logger, stringToUuid } from "@elizaos/core";
import { loadOwnerContactsConfig } from "../config/owner-contacts.js";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
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

export const PROACTIVE_TASK_NAME = "PROACTIVE_AGENT" as const;
export const PROACTIVE_TASK_TAGS = ["queue", "repeat", "proactive"] as const;
export const PROACTIVE_TASK_INTERVAL_MS = 60_000;

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

export async function executeProactiveTask(
  runtime: IAgentRuntime,
): Promise<{ nextInterval: number }> {
  const now = new Date();
  const timezone = resolveDefaultTimeZone();

  try {
    const ownerEntityId = await resolveOwnerEntityId(runtime);
    if (!ownerEntityId) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    const tasks = await runtime.getTasks({
      agentIds: [runtime.agentId],
      tags: [...PROACTIVE_TASK_TAGS],
    });
    const task = tasks.find(isProactiveTask);
    if (!task?.id) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    const metadata = isRecord(task.metadata) ? task.metadata : {};
    const currentProfile = readProfileFromMetadata(metadata);
    let profile: ActivityProfile | null;
    if (profileNeedsRebuild(currentProfile, now)) {
      logger.info("[proactive] Building full activity profile");
      profile = await buildActivityProfile(runtime, ownerEntityId, timezone, now);
    } else if (currentProfile) {
      profile = await refreshCurrentState(
        runtime,
        ownerEntityId,
        currentProfile,
        now,
      );
    } else {
      profile = null;
    }

    if (!profile) {
      return { nextInterval: PROACTIVE_TASK_INTERVAL_MS };
    }

    const todayStr = resolveEffectiveDayKey(profile, timezone, now);
    let firedLog = readFiredLogFromMetadata(metadata, todayStr);
    const { occurrences, calendarEvents } = await fetchPlannerContext(
      runtime,
      timezone,
      now,
    );
    const gmAction = planGm(
      profile,
      occurrences,
      calendarEvents,
      firedLog,
      timezone,
      now,
    );
    const gnAction = planGn(profile, firedLog, timezone, now);
    const nudgeActions = planNudges(
      profile,
      occurrences,
      calendarEvents,
      firedLog,
      timezone,
      now,
    );

    const allActions = [gmAction, gnAction, ...nudgeActions].filter(
      (action): action is ProactiveAction =>
        action !== null && action.status === "pending",
    );

    const ownerContacts = loadOwnerContactsConfig({
      boundary: "activity_profile",
      operation: "owner_contacts_config",
      message:
        "[proactive] Failed to load owner contacts config; proactive messages cannot route to owner channels until config is available.",
    });
    for (const action of allActions) {
      if (action.scheduledFor > now.getTime()) {
        continue;
      }

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
        firedLog = recordFiredAction(firedLog, todayStr, action);
        logger.info(`[proactive] Fired ${action.kind} on ${action.targetPlatform}`);
      } catch (err) {
        logger.warn(`[proactive] Failed to send ${action.kind}: ${err}`);
      }
    }

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

async function fetchPlannerContext(
  runtime: IAgentRuntime,
  timezone: string,
  now: Date,
): Promise<{ occurrences: OccurrenceSlim[]; calendarEvents: CalendarEventSlim[] }> {
  const occurrences: OccurrenceSlim[] = [];
  const calendarEvents: CalendarEventSlim[] = [];
  const lifeOpsService = new LifeOpsService(runtime);

  try {
    const overview = await lifeOpsService.getOverview(now);

    for (const occ of overview.occurrences) {
      occurrences.push({
        id: occ.id,
        title: occ.title ?? occ.definitionId ?? "untitled",
        dueAt: occ.dueAt,
        state: occ.state,
      });
    }
  } catch (error) {
    logger.warn(
      {
        boundary: "activity_profile",
        operation: "planner_overview",
        err: error instanceof Error ? error : undefined,
      },
      `[proactive] Failed to read LifeOps overview for planner context: ${String(error)}`,
    );
  }

  try {
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
  } catch (error) {
    if (error instanceof LifeOpsServiceError && error.status === 409) {
      return { occurrences, calendarEvents };
    }
    logger.warn(
      {
        boundary: "activity_profile",
        operation: "planner_calendar_feed",
        err: error instanceof Error ? error : undefined,
      },
      `[proactive] Failed to read calendar context for proactive planning: ${String(error)}`,
    );
  }

  return { occurrences, calendarEvents };
}

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

export function registerProactiveTaskWorker(runtime: IAgentRuntime): void {
  if (runtime.getTaskWorker(PROACTIVE_TASK_NAME)) {
    return;
  }
  runtime.registerTaskWorker({
    name: PROACTIVE_TASK_NAME,
    shouldRun: async () => true,
    execute: (rt) => executeProactiveTask(rt),
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
