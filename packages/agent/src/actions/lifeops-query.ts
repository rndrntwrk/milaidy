import type {
  Action,
  HandlerOptions,
  Memory,
  ProviderDataRecord,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";
import type {
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsGmailMessageSummary,
  LifeOpsGmailTriageFeed,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOverview,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService } from "../lifeops/service.js";

type QueryLifeOpsOperation =
  | "calendar_today"
  | "calendar_next"
  | "email_triage"
  | "overview";

type QueryLifeOpsParams = {
  operation?: QueryLifeOpsOperation;
  timeRange?: "today" | "tomorrow" | "this_week";
  limit?: number;
};

const INTERNAL_URL = new URL("http://127.0.0.1/");

function toActionData<T extends object>(data: T): ProviderDataRecord {
  return data as unknown as ProviderDataRecord;
}

function messageSource(message: Memory): string | null {
  const source = (message.content as Record<string, unknown> | undefined)?.source;
  return typeof source === "string" ? source : null;
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

function formatEventTime(event: LifeOpsCalendarEvent): string {
  if (event.isAllDay) {
    return "all day";
  }
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${start.toLocaleTimeString(undefined, timeFormat)} – ${end.toLocaleTimeString(undefined, timeFormat)}`;
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes <= 0) {
    return "now";
  }
  if (minutes < 60) {
    return `in ${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  if (remaining === 0) {
    return `in ${hours}h`;
  }
  return `in ${hours}h ${remaining}m`;
}

function formatCalendarFeed(feed: LifeOpsCalendarFeed, label: string): string {
  if (feed.events.length === 0) {
    return `No events ${label}.`;
  }
  const lines: string[] = [`Events ${label}:`];
  for (const event of feed.events) {
    const time = formatEventTime(event);
    const parts = [`- **${event.title}** (${time})`];
    if (event.location) {
      parts.push(`  Location: ${event.location}`);
    }
    if (event.attendees.length > 0) {
      const names = event.attendees
        .slice(0, 4)
        .map((a) => a.displayName || a.email || "unknown")
        .join(", ");
      const suffix = event.attendees.length > 4 ? ` +${event.attendees.length - 4} more` : "";
      parts.push(`  With: ${names}${suffix}`);
    }
    if (event.conferenceLink) {
      parts.push(`  Video: ${event.conferenceLink}`);
    }
    lines.push(parts.join("\n"));
  }
  return lines.join("\n");
}

function formatNextEventContext(context: LifeOpsNextCalendarEventContext): string {
  if (!context.event) {
    return "No upcoming events on your calendar.";
  }
  const event = context.event;
  const time = formatEventTime(event);
  const lines: string[] = [
    `**Next event: ${event.title}** (${time})`,
  ];
  if (context.startsInMinutes !== null) {
    lines[0] += ` — ${formatRelativeMinutes(context.startsInMinutes)}`;
  }
  if (context.location) {
    lines.push(`Location: ${context.location}`);
  }
  if (context.conferenceLink) {
    lines.push(`Video link: ${context.conferenceLink}`);
  }
  if (context.attendeeNames.length > 0) {
    lines.push(`Attendees: ${context.attendeeNames.join(", ")}`);
  }
  if (context.preparationChecklist.length > 0) {
    lines.push("Preparation:");
    for (const item of context.preparationChecklist) {
      lines.push(`- ${item}`);
    }
  }
  if (context.linkedMail.length > 0) {
    lines.push("Related emails:");
    for (const mail of context.linkedMail.slice(0, 3)) {
      lines.push(`- "${mail.subject}" from ${mail.from} (${mail.snippet?.slice(0, 60) ?? ""})`);
    }
  }
  return lines.join("\n");
}

function formatEmailTriage(feed: LifeOpsGmailTriageFeed): string {
  if (feed.messages.length === 0) {
    return "No important emails right now.";
  }
  const lines: string[] = [];
  const { summary } = feed;
  const headerParts: string[] = [];
  if (summary.unreadCount > 0) {
    headerParts.push(`${summary.unreadCount} unread`);
  }
  if (summary.importantNewCount > 0) {
    headerParts.push(`${summary.importantNewCount} important`);
  }
  if (summary.likelyReplyNeededCount > 0) {
    headerParts.push(`${summary.likelyReplyNeededCount} likely need a reply`);
  }
  lines.push(headerParts.length > 0 ? `Email inbox: ${headerParts.join(", ")}.` : "Email inbox:");

  for (const msg of feed.messages.slice(0, 8)) {
    const badges: string[] = [];
    if (msg.isImportant) badges.push("important");
    if (msg.likelyReplyNeeded) badges.push("reply needed");
    const badgeStr = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
    const from = msg.from || msg.fromEmail || "unknown";
    const time = formatRelativeTime(msg.receivedAt);
    lines.push(`- **${msg.subject}**${badgeStr}`);
    lines.push(`  From: ${from} · ${time}`);
    if (msg.snippet) {
      lines.push(`  ${msg.snippet.slice(0, 100)}`);
    }
  }
  return lines.join("\n");
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - Date.parse(isoDate);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatOverview(overview: LifeOpsOverview): string {
  const lines: string[] = [];
  const s = overview.owner.summary;
  lines.push("Life Ops overview:");
  lines.push(`- ${s.activeOccurrenceCount} active items (${s.overdueOccurrenceCount} overdue, ${s.snoozedOccurrenceCount} snoozed)`);
  lines.push(`- ${s.activeGoalCount} active goals`);
  lines.push(`- ${s.activeReminderCount} pending reminders`);

  if (overview.owner.occurrences.length > 0) {
    lines.push("\nCurrent items:");
    for (const occ of overview.owner.occurrences.slice(0, 5)) {
      const state = occ.state !== "visible" ? ` (${occ.state})` : "";
      lines.push(`- ${occ.title}${state}`);
    }
  }
  if (overview.owner.goals.length > 0) {
    lines.push("\nActive goals:");
    for (const goal of overview.owner.goals.slice(0, 3)) {
      lines.push(`- ${goal.title} (${goal.status})`);
    }
  }
  return lines.join("\n");
}

function dayRange(offset: number): { timeMin: string; timeMax: string } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const start = new Date(base.getTime() + offset * 86_400_000);
  const end = new Date(start.getTime() + 86_400_000);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

function weekRange(): { timeMin: string; timeMax: string } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const end = new Date(base.getTime() + 7 * 86_400_000);
  return {
    timeMin: base.toISOString(),
    timeMax: end.toISOString(),
  };
}

async function isGoogleConnected(service: LifeOpsService): Promise<{
  connected: boolean;
  hasCalendar: boolean;
  hasGmail: boolean;
  status: LifeOpsGoogleConnectorStatus | null;
}> {
  let status: LifeOpsGoogleConnectorStatus;
  try {
    status = await service.getGoogleConnectorStatus(INTERNAL_URL);
  } catch {
    return { connected: false, hasCalendar: false, hasGmail: false, status: null };
  }
  const capabilities = status.grantedCapabilities ?? [];
  return {
    connected: status.connected,
    hasCalendar: capabilities.some((c) => c.startsWith("google.calendar")),
    hasGmail: capabilities.some((c) => c.startsWith("google.gmail")),
    status,
  };
}

export const queryLifeOpsAction: Action = {
  name: "QUERY_LIFEOPS",
  similes: [
    "CHECK_CALENDAR",
    "CHECK_EMAIL",
    "CHECK_INBOX",
    "LIFEOPS_OVERVIEW",
    "WHATS_ON_MY_CALENDAR",
    "IMPORTANT_EMAILS",
  ],
  description:
    "Owner/admin and agent only. Query calendar events, email triage, and life-ops overview. Use when the user asks about their schedule, calendar, upcoming events, emails, inbox, or wants a summary of their active tasks and goals.",
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
        text: "Life Ops queries are restricted to the owner/admin and the agent.",
      };
    }

    const params = (options as HandlerOptions | undefined)?.parameters as
      | QueryLifeOpsParams
      | undefined;
    const operation = params?.operation;
    if (!operation) {
      return {
        success: false,
        text: "QUERY_LIFEOPS requires an operation.",
      };
    }

    const service = new LifeOpsService(runtime);

    if (operation === "calendar_today" || operation === "calendar_next") {
      const google = await isGoogleConnected(service);
      if (!google.connected || !google.hasCalendar) {
        return {
          success: false,
          text: "Google Calendar is not connected. Connect Google in the settings to check your calendar.",
        };
      }
    }

    if (operation === "email_triage") {
      const google = await isGoogleConnected(service);
      if (!google.connected || !google.hasGmail) {
        return {
          success: false,
          text: "Gmail is not connected. Connect Google with Gmail access in the settings to check your email.",
        };
      }
    }

    if (operation === "calendar_today") {
      const range = params.timeRange === "tomorrow"
        ? dayRange(1)
        : params.timeRange === "this_week"
          ? weekRange()
          : dayRange(0);
      const label = params.timeRange === "tomorrow"
        ? "tomorrow"
        : params.timeRange === "this_week"
          ? "this week"
          : "today";
      const feed = await service.getCalendarFeed(INTERNAL_URL, {
        timeMin: range.timeMin,
        timeMax: range.timeMax,
      });
      return {
        success: true,
        text: formatCalendarFeed(feed, label),
        data: toActionData(feed),
      };
    }

    if (operation === "calendar_next") {
      const context = await service.getNextCalendarEventContext(INTERNAL_URL);
      return {
        success: true,
        text: formatNextEventContext(context),
        data: toActionData(context),
      };
    }

    if (operation === "email_triage") {
      const limit = typeof params.limit === "number" && params.limit > 0
        ? params.limit
        : 10;
      const feed = await service.getGmailTriage(INTERNAL_URL, {
        maxResults: limit,
      });
      return {
        success: true,
        text: formatEmailTriage(feed),
        data: toActionData(feed),
      };
    }

    if (operation === "overview") {
      const overview = await service.getOverview();
      return {
        success: true,
        text: formatOverview(overview),
        data: toActionData(overview),
      };
    }

    return {
      success: false,
      text: `Unsupported query operation: ${operation}.`,
    };
  },
  parameters: [
    {
      name: "operation",
      description:
        "Query to run: calendar_today (show today's/tomorrow's/this week's events), calendar_next (next upcoming event with context), email_triage (important and reply-needed emails), or overview (active tasks, goals, reminders summary).",
      required: true,
      schema: {
        type: "string" as const,
        enum: [
          "calendar_today",
          "calendar_next",
          "email_triage",
          "overview",
        ],
      },
    },
    {
      name: "timeRange",
      description:
        "Time range for calendar_today: today, tomorrow, or this_week. Defaults to today.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["today", "tomorrow", "this_week"],
      },
    },
    {
      name: "limit",
      description:
        "Max number of results to return for email_triage. Defaults to 10.",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
