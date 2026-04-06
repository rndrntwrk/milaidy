import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";
import type {
  LifeOpsGmailTriageSummary,
  LifeOpsNextCalendarEventContext,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService } from "../lifeops/service.js";

const INTERNAL_URL = new URL("http://127.0.0.1/");

function formatCount(label: string, count: number): string {
  return `${label}: ${count}`;
}

function summarizeOccurrences(
  title: string,
  occurrences: Array<{ title: string; state: string }>,
): string[] {
  if (occurrences.length === 0) {
    return [];
  }
  return [
    title,
    ...occurrences.slice(0, 3).map((occurrence) => `- ${occurrence.title} (${occurrence.state})`),
  ];
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

function summarizeNextEvent(context: LifeOpsNextCalendarEventContext): string[] {
  if (!context.event) {
    return [];
  }
  const event = context.event;
  const timing = context.startsInMinutes !== null
    ? ` (${formatRelativeMinutes(context.startsInMinutes)})`
    : "";
  const lines = [`Next event: ${event.title}${timing}`];
  if (context.attendeeNames.length > 0) {
    lines.push(`  With: ${context.attendeeNames.slice(0, 3).join(", ")}`);
  }
  if (context.location) {
    lines.push(`  At: ${context.location}`);
  }
  return lines;
}

function summarizeGmailTriage(summary: LifeOpsGmailTriageSummary): string[] {
  const parts: string[] = [];
  if (summary.unreadCount > 0) parts.push(`${summary.unreadCount} unread`);
  if (summary.importantNewCount > 0) parts.push(`${summary.importantNewCount} important`);
  if (summary.likelyReplyNeededCount > 0) parts.push(`${summary.likelyReplyNeededCount} needing reply`);
  if (parts.length === 0) {
    return [];
  }
  return [`Inbox: ${parts.join(", ")}`];
}

async function hasLifeOpsAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

export const lifeOpsProvider: Provider = {
  name: "lifeops",
  description:
    "Owner/admin and agent only. Provides the current LifeOps overview, upcoming calendar event, and email triage summary. Explains how to use MANAGE_LIFEOPS and QUERY_LIFEOPS for conversational capture, editing, completion, snoozing, goal review, and calendar/email queries.",
  dynamic: true,
  position: 12,
  async get(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const source = (message.content as Record<string, unknown> | undefined)?.source;
    if (
      source !== "client_chat" &&
      message.entityId !== runtime.agentId
    ) {
      return { text: "", values: {}, data: {} };
    }
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return { text: "", values: {}, data: {} };
    }

    const service = new LifeOpsService(runtime);
    const overview = await service.getOverview();
    const ownerLines = summarizeOccurrences("Owner active items:", overview.owner.occurrences);
    const agentLines = summarizeOccurrences("Agent ops:", overview.agentOps.occurrences);

    const calendarLines: string[] = [];
    const emailLines: string[] = [];
    let nextEventContext: LifeOpsNextCalendarEventContext | null = null;
    let gmailSummary: LifeOpsGmailTriageSummary | null = null;

    try {
      const status = await service.getGoogleConnectorStatus(INTERNAL_URL);
      if (status.connected) {
        const capabilities = status.grantedCapabilities ?? [];
        const hasCalendar = capabilities.some((c) => c.startsWith("google.calendar"));
        const hasGmail = capabilities.some((c) => c.startsWith("google.gmail"));

        if (hasCalendar) {
          try {
            nextEventContext = await service.getNextCalendarEventContext(INTERNAL_URL);
            calendarLines.push(...summarizeNextEvent(nextEventContext));
          } catch {
            // Calendar fetch failed — skip silently, don't break the provider
          }
        }

        if (hasGmail) {
          try {
            const triage = await service.getGmailTriage(INTERNAL_URL, { maxResults: 5 });
            gmailSummary = triage.summary;
            emailLines.push(...summarizeGmailTriage(triage.summary));
          } catch {
            // Gmail fetch failed — skip silently, don't break the provider
          }
        }
      }
    } catch {
      // Google connector not configured — skip calendar/email context entirely
    }

    return {
      text: [
        "## Life Ops",
        "Use MANAGE_LIFEOPS whenever the user wants to create or edit reminders, routines, recurring tasks, goals, or goal reviews.",
        "Use QUERY_LIFEOPS when the user asks about their calendar, schedule, emails, inbox, or wants a life-ops overview.",
        "Owner life-ops are private to the owner/admin and the agent. Agent ops are internal and should stay separated unless explicitly requested.",
        formatCount("Owner open occurrences", overview.owner.summary.activeOccurrenceCount),
        formatCount("Owner active goals", overview.owner.summary.activeGoalCount),
        formatCount("Owner live reminders", overview.owner.summary.activeReminderCount),
        ...ownerLines,
        ...calendarLines,
        ...emailLines,
        formatCount("Agent open occurrences", overview.agentOps.summary.activeOccurrenceCount),
        formatCount("Agent active goals", overview.agentOps.summary.activeGoalCount),
        ...agentLines,
      ].join("\n"),
      values: {
        ownerOpenOccurrences: overview.owner.summary.activeOccurrenceCount,
        ownerActiveGoals: overview.owner.summary.activeGoalCount,
        agentOpenOccurrences: overview.agentOps.summary.activeOccurrenceCount,
        agentActiveGoals: overview.agentOps.summary.activeGoalCount,
      },
      data: {
        overview,
        nextEventContext,
        gmailSummary,
      },
    };
  },
};
