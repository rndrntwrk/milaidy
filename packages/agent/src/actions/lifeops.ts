import type {
  Action,
  HandlerOptions,
  Memory,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";
import type {
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  LifeOpsCadence,
  LifeOpsDefinitionRecord,
  LifeOpsDomain,
  LifeOpsGoalRecord,
  LifeOpsReminderStep,
  SnoozeLifeOpsOccurrenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService } from "../lifeops/service.js";

type ManageLifeOpsOperation =
  | "create_definition"
  | "update_definition"
  | "create_goal"
  | "update_goal"
  | "complete_occurrence"
  | "skip_occurrence"
  | "snooze_occurrence"
  | "review_goal";

type ManageLifeOpsParams = {
  operation?: ManageLifeOpsOperation;
  domain?: LifeOpsDomain;
  targetId?: string;
  targetTitle?: string;
  kind?: CreateLifeOpsDefinitionRequest["kind"];
  title?: string;
  description?: string;
  originalIntent?: string;
  cadence?: LifeOpsCadence;
  priority?: number;
  reminderPlan?: {
    steps: LifeOpsReminderStep[];
    mutePolicy?: Record<string, unknown>;
    quietHours?: Record<string, unknown>;
  } | null;
  goalId?: string | null;
  goalTitle?: string | null;
  supportStrategy?: CreateLifeOpsGoalRequest["supportStrategy"];
  successCriteria?: CreateLifeOpsGoalRequest["successCriteria"];
  note?: string;
  snoozePreset?: SnoozeLifeOpsOccurrenceRequest["preset"];
  snoozeMinutes?: number;
};

function messageSource(message: Memory): string | null {
  const source = (message.content as Record<string, unknown> | undefined)?.source;
  return typeof source === "string" ? source : null;
}

function messageText(message: Memory): string {
  const text = (message.content as Record<string, unknown> | undefined)?.text;
  return typeof text === "string" ? text : "";
}

async function hasLifeOpsAccess(
  runtime: Parameters<NonNullable<Action["validate"]>>[0],
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

function requestedOwnership(domain?: LifeOpsDomain) {
  if (domain === "agent_ops") {
    return {
      domain: "agent_ops" as const,
      subjectType: "agent" as const,
    };
  }
  return {
    domain: "user_lifeops" as const,
    subjectType: "owner" as const,
  };
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchByTitle<T extends { definition?: { title: string }; goal?: { title: string } }>(
  entries: T[],
  targetTitle: string,
): T | null {
  const normalizedTarget = normalizeTitle(targetTitle);
  const exactMatch =
    entries.find((entry) =>
      normalizeTitle(entry.definition?.title ?? entry.goal?.title ?? "") ===
      normalizedTarget,
    ) ?? null;
  if (exactMatch) {
    return exactMatch;
  }
  return (
    entries.find((entry) =>
      normalizeTitle(entry.definition?.title ?? entry.goal?.title ?? "").includes(
        normalizedTarget,
      ),
    ) ?? null
  );
}

async function resolveGoalReference(
  service: LifeOpsService,
  goalId: string | null | undefined,
  goalTitle: string | null | undefined,
  domain: LifeOpsDomain | undefined,
): Promise<LifeOpsGoalRecord | null> {
  const goals = (await service.listGoals()).filter((entry) =>
    domain ? entry.goal.domain === domain : true,
  );
  if (goalId) {
    return goals.find((entry) => entry.goal.id === goalId) ?? null;
  }
  if (goalTitle) {
    return matchByTitle(goals, goalTitle);
  }
  return null;
}

async function resolveDefinitionReference(
  service: LifeOpsService,
  targetId: string | undefined,
  targetTitle: string | undefined,
  domain: LifeOpsDomain | undefined,
): Promise<LifeOpsDefinitionRecord | null> {
  const definitions = (await service.listDefinitions()).filter((entry) =>
    domain ? entry.definition.domain === domain : true,
  );
  if (targetId) {
    return definitions.find((entry) => entry.definition.id === targetId) ?? null;
  }
  if (targetTitle) {
    return matchByTitle(definitions, targetTitle);
  }
  return null;
}

async function resolveOccurrenceReference(
  service: LifeOpsService,
  targetId: string | undefined,
  targetTitle: string | undefined,
  domain: LifeOpsDomain | undefined,
) {
  const overview = await service.getOverview();
  const occurrences = [
    ...overview.owner.occurrences,
    ...overview.agentOps.occurrences,
  ].filter((occurrence) => (domain ? occurrence.domain === domain : true));
  if (targetId) {
    return occurrences.find((occurrence) => occurrence.id === targetId) ?? null;
  }
  if (targetTitle) {
    const normalizedTarget = normalizeTitle(targetTitle);
    return (
      occurrences.find(
        (occurrence) => normalizeTitle(occurrence.title) === normalizedTarget,
      ) ??
      occurrences.find((occurrence) =>
        normalizeTitle(occurrence.title).includes(normalizedTarget),
      ) ??
      null
    );
  }
  return null;
}

function summarizeCadence(cadence: LifeOpsCadence): string {
  switch (cadence.kind) {
    case "once":
      return `one-off due ${cadence.dueAt}`;
    case "daily":
      return `daily in ${cadence.windows.join(", ")}`;
    case "times_per_day":
      return `${cadence.slots.length} times per day`;
    case "weekly":
      return `weekly on ${cadence.weekdays.join(", ")}`;
  }
}

export const manageLifeOpsAction: Action = {
  name: "MANAGE_LIFEOPS",
  similes: [
    "CREATE_LIFEOPS_ITEM",
    "UPDATE_LIFEOPS_ITEM",
    "TRACK_LIFEOPS",
    "REVIEW_LIFEOPS_GOAL",
  ],
  description:
    "Owner/admin and agent only. Create, update, complete, snooze, skip, and review LifeOps tasks, routines, habits, goals, and occurrences from conversation. Use this when the user asks for reminders, recurring routines, edits to cadence, goal support, or progress reviews.",
  validate: async (runtime, message) => {
    const source = messageSource(message);
    return (
      (source === "client_chat" || message.entityId === runtime.agentId) &&
      (await hasLifeOpsAccess(runtime, message))
    );
  },
  handler: async (runtime, message, _state, options) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return {
        success: false,
        text: "LifeOps changes are restricted to the owner/admin and the agent.",
      };
    }

    const params = (options as HandlerOptions | undefined)?.parameters as
      | ManageLifeOpsParams
      | undefined;
    const operation = params?.operation;
    if (!operation) {
      return {
        success: false,
        text: "MANAGE_LIFEOPS requires an operation.",
      };
    }

    const service = new LifeOpsService(runtime);
    const ownership = requestedOwnership(params.domain);
    const chatText = messageText(message).trim();

    if (operation === "create_definition") {
      if (!params.kind || !params.title || !params.cadence) {
        return {
          success: false,
          text: "Creating a LifeOps item requires kind, title, and cadence.",
        };
      }
      const resolvedGoal = await resolveGoalReference(
        service,
        params.goalId,
        params.goalTitle ?? undefined,
        ownership.domain,
      );
      const created = await service.createDefinition({
        ownership,
        kind: params.kind,
        title: params.title,
        description: params.description,
        originalIntent: params.originalIntent ?? (chatText || params.title),
        cadence: params.cadence,
        priority: params.priority,
        reminderPlan: params.reminderPlan,
        goalId: resolvedGoal?.goal.id ?? params.goalId ?? null,
        source: "chat",
      });
      return {
        success: true,
        text: `Saved "${created.definition.title}" as ${summarizeCadence(created.definition.cadence)}.`,
        data: created,
      };
    }

    if (operation === "update_definition") {
      const target = await resolveDefinitionReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that LifeOps item to update.",
        };
      }
      const resolvedGoal = await resolveGoalReference(
        service,
        params.goalId,
        params.goalTitle ?? undefined,
        target.definition.domain,
      );
      const request: UpdateLifeOpsDefinitionRequest = {
        ownership,
        title: params.title,
        description: params.description,
        originalIntent: params.originalIntent,
        cadence: params.cadence,
        priority: params.priority,
        reminderPlan: params.reminderPlan,
        goalId:
          resolvedGoal?.goal.id ??
          (params.goalId !== undefined ? params.goalId : undefined),
      };
      const updated = await service.updateDefinition(target.definition.id, request);
      return {
        success: true,
        text: `Updated "${updated.definition.title}".`,
        data: updated,
      };
    }

    if (operation === "create_goal") {
      if (!params.title) {
        return {
          success: false,
          text: "Creating a goal requires a title.",
        };
      }
      const created = await service.createGoal({
        ownership,
        title: params.title,
        description: params.description,
        cadence: params.cadence ? { kind: params.cadence.kind } : undefined,
        supportStrategy: params.supportStrategy,
        successCriteria: params.successCriteria,
        metadata: {
          source: "chat",
          originalIntent: params.originalIntent ?? (chatText || params.title),
        },
      });
      return {
        success: true,
        text: `Saved goal "${created.goal.title}".`,
        data: created,
      };
    }

    if (operation === "update_goal") {
      const target = await resolveGoalReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that goal to update.",
        };
      }
      const request: UpdateLifeOpsGoalRequest = {
        ownership,
        title: params.title,
        description: params.description,
        cadence: params.cadence ? { kind: params.cadence.kind } : undefined,
        supportStrategy: params.supportStrategy,
        successCriteria: params.successCriteria,
      };
      const updated = await service.updateGoal(target.goal.id, request);
      return {
        success: true,
        text: `Updated goal "${updated.goal.title}".`,
        data: updated,
      };
    }

    if (operation === "complete_occurrence") {
      const target = await resolveOccurrenceReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that active LifeOps item to complete.",
        };
      }
      const completed = await service.completeOccurrence(target.id, {
        note: params.note,
      });
      return {
        success: true,
        text: `Marked "${completed.title}" done.`,
        data: completed,
      };
    }

    if (operation === "skip_occurrence") {
      const target = await resolveOccurrenceReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that active LifeOps item to skip.",
        };
      }
      const skipped = await service.skipOccurrence(target.id);
      return {
        success: true,
        text: `Skipped "${skipped.title}".`,
        data: skipped,
      };
    }

    if (operation === "snooze_occurrence") {
      const target = await resolveOccurrenceReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that active LifeOps item to snooze.",
        };
      }
      const snoozed = await service.snoozeOccurrence(target.id, {
        preset: params.snoozePreset,
        minutes: params.snoozeMinutes,
      });
      return {
        success: true,
        text: `Snoozed "${snoozed.title}".`,
        data: snoozed,
      };
    }

    if (operation === "review_goal") {
      const target = await resolveGoalReference(
        service,
        params.targetId,
        params.targetTitle,
        params.domain,
      );
      if (!target) {
        return {
          success: false,
          text: "I could not find that goal to review.",
        };
      }
      const review = await service.reviewGoal(target.goal.id);
      return {
        success: true,
        text: review.summary.explanation,
        data: review,
      };
    }

    return {
      success: false,
      text: `Unsupported LifeOps operation: ${operation}.`,
    };
  },
  parameters: [
    {
      name: "operation",
      description:
        "LifeOps operation to run: create/update a definition, create/update a goal, complete/skip/snooze an occurrence, or review a goal.",
      required: true,
      schema: {
        type: "string" as const,
        enum: [
          "create_definition",
          "update_definition",
          "create_goal",
          "update_goal",
          "complete_occurrence",
          "skip_occurrence",
          "snooze_occurrence",
          "review_goal",
        ],
      },
    },
    {
      name: "domain",
      description:
        "Use user_lifeops for the owner’s private tasks and goals. Use agent_ops only for the agent’s internal work.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["user_lifeops", "agent_ops"],
      },
    },
    {
      name: "targetId",
      description:
        "Existing goal, definition, or occurrence id when editing or updating a specific item.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "targetTitle",
      description:
        "Existing goal or item title when editing or updating by conversational reference instead of id.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "kind",
      description:
        "Definition kind for new life-ops items: task, habit, or routine.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["task", "habit", "routine"],
      },
    },
    {
      name: "title",
      description: "Title for the new or updated life-ops item or goal.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "description",
      description: "Optional longer description for the item or goal.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "originalIntent",
      description:
        "Original conversational phrasing to preserve when creating or updating a life-ops object.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "cadence",
      description:
        "Cadence object. Examples: { kind: 'daily', windows: ['morning'] }, { kind: 'times_per_day', slots: [...] }, { kind: 'weekly', weekdays: [1], windows: ['evening'] }, or { kind: 'once', dueAt: '2026-04-05T09:00:00.000Z' }.",
      required: false,
      schema: { type: "object" as const },
    },
    {
      name: "priority",
      description:
        "Optional priority number for the definition. Lower numbers mean more urgent.",
      required: false,
      schema: { type: "number" as const },
    },
    {
      name: "reminderPlan",
      description:
        "Optional reminder plan object with steps, mutePolicy, and quietHours.",
      required: false,
      schema: { type: "object" as const },
    },
    {
      name: "goalId",
      description:
        "Existing goal id to attach a definition to, or to target during review/update.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "goalTitle",
      description:
        "Existing goal title to attach a definition to when the goal id is not known.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "supportStrategy",
      description: "Optional goal support strategy object.",
      required: false,
      schema: { type: "object" as const },
    },
    {
      name: "successCriteria",
      description: "Optional goal success criteria object.",
      required: false,
      schema: { type: "object" as const },
    },
    {
      name: "note",
      description: "Optional completion note for complete_occurrence.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "snoozePreset",
      description:
        "Preset for snoozing an occurrence, such as 15m, 30m, 1h, tonight, or tomorrow_morning.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["15m", "30m", "1h", "tonight", "tomorrow_morning"],
      },
    },
    {
      name: "snoozeMinutes",
      description:
        "Explicit number of minutes to snooze when a preset is not appropriate.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
