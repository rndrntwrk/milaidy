/**
 * Chat workspace widget bar.
 *
 * Desktop: persistent right rail alongside /chat.
 * Mobile: sheet content toggled from the chat header.
 *
 * Shows open todos, ongoing orchestrator sessions, and recent activity.
 */

import type {
  CodingAgentSession,
  LifeOpsCalendarFeed,
  LifeOpsCalendarEvent,
  LifeOpsGmailTriageFeed,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOccurrenceView,
  LifeOpsOverview,
  WorkbenchTodo,
} from "@miladyai/app-core/api";
import { Badge, Button } from "@miladyai/ui";
import {
  Activity,
  BellRing,
  CalendarDays,
  Check,
  ExternalLink,
  ListTodo,
  Mail,
  SkipForward,
  Target,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../../api";
import { TERMINAL_STATUSES } from "../../coding";
import type { ActivityEvent } from "../../hooks/useActivityEvents";
import { useApp } from "../../state";
import { openExternalUrl } from "../../utils";
import { PULSE_STATUSES, STATUS_DOT } from "../coding/pty-status-dots";

interface TasksEventsPanelProps {
  open: boolean;
  /** Activity events from the parent — kept alive even when the panel unmounts. */
  events: ActivityEvent[];
  clearEvents: () => void;
  /** When true, renders as full-width content (inside a mobile DrawerSheet). */
  mobile?: boolean;
}

const TODO_REFRESH_INTERVAL_MS = 15_000;
const LIFEOPS_REFRESH_INTERVAL_MS = 15_000;
const MAX_VISIBLE_TODOS = 8;
const GOOGLE_CONNECTOR_POLL_ATTEMPTS = 20;
const GOOGLE_CONNECTOR_POLL_MS = 1_500;

/** Derive activity text for a coding agent session. */
function deriveSessionActivity(s: CodingAgentSession): string {
  if (s.status === "tool_running" && s.toolDescription) {
    return `Running ${s.toolDescription}`.slice(0, 60);
  }
  if (s.status === "blocked") return "Waiting for input";
  if (s.status === "error") return "Error";
  return "Running";
}

/** Format a timestamp as a relative string (e.g. "2m ago"). */
function relativeTime(ts: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function relativeIsoTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return relativeTime(parsed.getTime());
}

function formatIsoTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCalendarEventTime(event: LifeOpsCalendarEvent): string {
  if (event.isAllDay) {
    return "All day";
  }
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "—";
  }
  return `${start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function describeCalendarEventMeta(event: LifeOpsCalendarEvent): string {
  const details = [
    event.location.trim(),
    event.attendees.length > 0
      ? `${event.attendees.length} attendee${event.attendees.length === 1 ? "" : "s"}`
      : "",
  ].filter((value) => value.length > 0);
  return details.join(" · ");
}

function describeGoogleCapability(capability: string): string {
  return capability
    .replace("google.", "")
    .replace(/\./g, " ")
    .trim();
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  task_registered: "bg-ok/20 text-ok",
  task_complete: "bg-ok/20 text-ok",
  stopped: "bg-muted/20 text-muted",
  tool_running: "bg-accent/20 text-accent",
  blocked: "bg-warn/20 text-warn",
  blocked_auto_resolved: "bg-ok/20 text-ok",
  escalation: "bg-warn/20 text-warn",
  error: "bg-danger/20 text-danger",
  "proactive-message": "bg-accent/20 text-accent",
};

function sortTodosForWidget(todos: WorkbenchTodo[]): WorkbenchTodo[] {
  return [...todos].sort((left, right) => {
    if (left.isCompleted !== right.isCompleted) {
      return left.isCompleted ? 1 : -1;
    }
    if (left.isUrgent !== right.isUrgent) {
      return left.isUrgent ? -1 : 1;
    }
    const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.name.localeCompare(right.name);
  });
}

function dedupeTodos(todos: WorkbenchTodo[]): WorkbenchTodo[] {
  const byId = new Map<string, WorkbenchTodo>();
  for (const todo of todos) {
    byId.set(todo.id, todo);
  }
  return sortTodosForWidget([...byId.values()]);
}

function WidgetSection({
  title,
  icon,
  count,
  action,
  children,
  testId,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-border/60 bg-bg-accent/25"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-hover text-muted">
            {icon}
          </span>
          <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {title}
          </span>
          {typeof count === "number" ? (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {count}
            </Badge>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function TaskCard({
  session,
  onSessionClick,
}: {
  session: CodingAgentSession;
  onSessionClick?: (sessionId: string) => void;
}) {
  const activity = session.lastActivity ?? deriveSessionActivity(session);

  return (
    <button
      type="button"
      onClick={() => onSessionClick?.(session.sessionId)}
      className="w-full cursor-pointer rounded-lg border border-border/50 bg-bg-accent/30 p-3 text-left transition-colors hover:bg-bg-hover"
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            STATUS_DOT[session.status] ?? "bg-muted"
          }${PULSE_STATUSES.has(session.status) ? " animate-pulse" : ""}`}
        />
        <span className="flex-1 truncate text-xs font-semibold text-txt">
          {session.label}
        </span>
      </div>
      {session.originalTask ? (
        <p className="mb-1 line-clamp-2 text-[11px] text-muted">
          {session.originalTask}
        </p>
      ) : null}
      <p
        className={`truncate text-[11px] ${
          session.status === "error"
            ? "text-danger"
            : session.status === "blocked"
              ? "text-warn"
              : "text-muted"
        }`}
      >
        {activity}
      </p>
    </button>
  );
}

function TodoRow({ todo }: { todo: WorkbenchTodo }) {
  const showDescription =
    todo.description.trim().length > 0 && todo.description !== todo.name;
  const showType = todo.type.trim().length > 0 && todo.type !== "task";

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
            todo.isUrgent
              ? "bg-danger"
              : todo.priority != null
                ? "bg-accent"
                : "bg-muted"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-txt">
              {todo.name}
            </span>
            {todo.isUrgent ? (
              <Badge variant="secondary" className="text-[9px] text-danger">
                Urgent
              </Badge>
            ) : null}
            {todo.priority != null ? (
              <Badge variant="secondary" className="text-[9px]">
                P{todo.priority}
              </Badge>
            ) : null}
            {showType ? (
              <Badge variant="secondary" className="text-[9px]">
                {todo.type}
              </Badge>
            ) : null}
          </div>
          {showDescription ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {todo.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TodosSection({
  todos,
  loading,
}: {
  todos: WorkbenchTodo[];
  loading: boolean;
}) {
  const openTodos = todos.filter((todo) => !todo.isCompleted);
  const hiddenCompletedCount = todos.length - openTodos.length;
  const visibleTodos = openTodos.slice(0, MAX_VISIBLE_TODOS);
  const remainingCount = openTodos.length - visibleTodos.length;

  if (loading && todos.length === 0) {
    return <div className="py-3 text-xs text-muted">Refreshing todos…</div>;
  }

  if (openTodos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <ListTodo className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No open todos</p>
        <p className="text-xs text-muted/70">
          Agent-created work items will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleTodos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
      {remainingCount > 0 ? (
        <p className="px-1 text-[11px] text-muted">
          +{remainingCount} more open todo{remainingCount === 1 ? "" : "s"}
        </p>
      ) : null}
      {hiddenCompletedCount > 0 ? (
        <p className="px-1 text-[11px] text-muted">
          {hiddenCompletedCount} completed todo
          {hiddenCompletedCount === 1 ? "" : "s"} hidden
        </p>
      ) : null}
    </div>
  );
}

function reminderToneClass(channel: string): string {
  if (channel === "in_app") return "text-accent";
  if (channel === "sms" || channel === "voice") return "text-warn";
  return "text-muted";
}

function occurrenceToneClass(state: LifeOpsOccurrenceView["state"]): string {
  if (state === "visible") return "text-accent";
  if (state === "snoozed") return "text-warn";
  return "text-muted";
}

function ReminderRow({
  reminder,
}: {
  reminder: LifeOpsOverview["reminders"][number];
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <BellRing className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${reminderToneClass(reminder.channel)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              {reminder.title}
            </span>
            <Badge variant="secondary" className="text-[9px]">
              {reminder.stepLabel}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {formatIsoTime(reminder.scheduledFor)} · {relativeIsoTime(reminder.scheduledFor)}
          </p>
        </div>
      </div>
    </div>
  );
}

function describeGoogleConnectorStatus(
  status: LifeOpsGoogleConnectorStatus | null,
): string {
  if (!status) return "Checking Google connector…";
  if (status.connected) {
    const email =
      typeof status.identity?.email === "string" ? status.identity.email : null;
    return email
      ? `Connected as ${email}`
      : `Google ${status.mode} access is connected`;
  }
  if (status.reason === "config_missing") {
    return "Google OAuth is not configured on this runtime.";
  }
  if (status.reason === "token_missing" || status.reason === "needs_reauth") {
    return "Google access needs to be reconnected.";
  }
  return "Calendar and Gmail actions stay disconnected until you approve Google access.";
}

function GoogleConnectorCard({
  status,
  loading,
  busy,
  pendingAuthUrl,
  onConnect,
  onDisconnect,
  onOpenPending,
}: {
  status: LifeOpsGoogleConnectorStatus | null;
  loading: boolean;
  busy: boolean;
  pendingAuthUrl: string | null;
  onConnect: (capabilities?: Array<"google.calendar.read" | "google.gmail.triage" | "google.gmail.send">) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onOpenPending: () => Promise<void>;
}) {
  const connected = status?.connected ?? false;
  const capabilities = status?.grantedCapabilities ?? [];
  const hasGmailTriage = capabilities.includes("google.gmail.triage");
  const hasGmailSend = capabilities.includes("google.gmail.send");

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              Google
            </span>
            {status ? (
              <Badge variant="secondary" className="text-[9px]">
                {status.mode}
              </Badge>
            ) : null}
            {connected ? (
              <Badge variant="secondary" className="text-[9px] text-ok">
                connected
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            {loading && !status
              ? "Checking Google connector…"
              : describeGoogleConnectorStatus(status)}
          </p>
          {capabilities.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {capabilities.map((capability) => (
                <Badge
                  key={capability}
                  variant="secondary"
                  className="text-[9px]"
                >
                  {describeGoogleCapability(capability)}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {connected ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onDisconnect()}
                className="h-6 px-2 text-[10px]"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || status?.reason === "config_missing"}
                onClick={() => void onConnect(["google.calendar.read"])}
                className="h-6 px-2 text-[10px]"
              >
                Connect Calendar
              </Button>
            )}
            {connected && !hasGmailTriage ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onConnect(["google.gmail.triage"])}
                className="h-6 px-2 text-[10px]"
              >
                Add Gmail
              </Button>
            ) : null}
            {connected && hasGmailTriage && !hasGmailSend ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onConnect(["google.gmail.send"])}
                className="h-6 px-2 text-[10px]"
              >
                Enable Send
              </Button>
            ) : null}
            {pendingAuthUrl ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onOpenPending()}
                className="h-6 px-2 text-[10px]"
              >
                Open Consent
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarEventRow({
  event,
  onOpen,
}: {
  event: LifeOpsCalendarEvent;
  onOpen: (event: LifeOpsCalendarEvent) => Promise<void>;
}) {
  const metadata = describeCalendarEventMeta(event);

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              {event.title}
            </span>
            {event.status.trim().length > 0 && event.status !== "confirmed" ? (
              <Badge variant="secondary" className="text-[9px]">
                {event.status}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {formatCalendarEventTime(event)}
          </p>
          {metadata ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {metadata}
            </p>
          ) : null}
          {event.description.trim().length > 0 ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {event.description}
            </p>
          ) : null}
          {event.htmlLink || event.conferenceLink ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onOpen(event)}
                className="h-6 px-2 text-[10px]"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Open
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GmailMessageRow({
  message,
  onOpen,
}: {
  message: LifeOpsGmailTriageFeed["messages"][number];
  onOpen: (message: LifeOpsGmailTriageFeed["messages"][number]) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              {message.subject}
            </span>
            {message.isImportant ? (
              <Badge variant="secondary" className="text-[9px]">
                important
              </Badge>
            ) : null}
            {message.likelyReplyNeeded ? (
              <Badge variant="secondary" className="text-[9px]">
                reply
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {message.from} · {relativeIsoTime(message.receivedAt)}
          </p>
          {message.snippet.trim().length > 0 ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {message.snippet}
            </p>
          ) : null}
          {message.htmlLink ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onOpen(message)}
                className="h-6 px-2 text-[10px]"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Open
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NextCalendarContextCard({
  context,
}: {
  context: LifeOpsNextCalendarEventContext | null;
}) {
  if (!context?.event) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              Next up: {context.event.title}
            </span>
            {context.startsInMinutes !== null ? (
              <Badge variant="secondary" className="text-[9px]">
                {context.startsInMinutes === 0
                  ? "now"
                  : `${context.startsInMinutes}m`}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {formatCalendarEventTime(context.event)}
            {context.location ? ` · ${context.location}` : ""}
          </p>
          {context.attendeeNames.length > 0 ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {context.attendeeNames.join(", ")}
            </p>
          ) : null}
          {context.preparationChecklist.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {context.preparationChecklist.slice(0, 2).map((item) => (
                <p key={item} className="text-[11px] leading-5 text-muted">
                  {item}
                </p>
              ))}
            </div>
          ) : null}
          {context.linkedMail.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {context.linkedMail.slice(0, 2).map((message) => (
                <p
                  key={message.id}
                  className="line-clamp-2 text-[11px] leading-5 text-muted"
                >
                  Mail: {message.subject} · {message.from}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LifeOpsOccurrenceRow({
  occurrence,
  acting,
  onComplete,
  onSnooze,
  onSkip,
}: {
  occurrence: LifeOpsOccurrenceView;
  acting: boolean;
  onComplete: (occurrenceId: string) => Promise<void>;
  onSnooze: (occurrenceId: string) => Promise<void>;
  onSkip: (occurrenceId: string) => Promise<void>;
}) {
  const actionable =
    occurrence.state === "visible" || occurrence.state === "snoozed";

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <Target className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${occurrenceToneClass(occurrence.state)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-txt">
              {occurrence.title}
            </span>
            <Badge variant="secondary" className="text-[9px]">
              {occurrence.state}
            </Badge>
            {occurrence.windowName ? (
              <Badge variant="secondary" className="text-[9px]">
                {occurrence.windowName}
              </Badge>
            ) : null}
          </div>
          {occurrence.description.trim().length > 0 ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {occurrence.description}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted">
            {formatIsoTime(occurrence.scheduledAt ?? occurrence.relevanceStartAt)} ·{" "}
            {relativeIsoTime(occurrence.scheduledAt ?? occurrence.relevanceStartAt)}
          </p>
          {actionable ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={acting}
                onClick={() => void onComplete(occurrence.id)}
                className="h-6 px-2 text-[10px]"
              >
                <Check className="mr-1 h-3 w-3" />
                Done
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={acting}
                onClick={() => void onSnooze(occurrence.id)}
                className="h-6 px-2 text-[10px]"
              >
                30m
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={acting}
                onClick={() => void onSkip(occurrence.id)}
                className="h-6 px-2 text-[10px]"
              >
                <SkipForward className="mr-1 h-3 w-3" />
                Skip
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LifeOpsSection({
  lifeops,
  loading,
  calendarFeed,
  calendarLoading,
  gmailTriage,
  gmailTriageLoading,
  nextCalendarContext,
  googleConnector,
  googleConnectorLoading,
  googleConnectorBusy,
  pendingGoogleAuthUrl,
  onConnectGoogle,
  onDisconnectGoogle,
  onOpenPendingGoogle,
  onOpenCalendarEvent,
  onOpenGmailMessage,
  actingOccurrenceId,
  onComplete,
  onSnooze,
  onSkip,
}: {
  lifeops: LifeOpsOverview | null;
  loading: boolean;
  calendarFeed: LifeOpsCalendarFeed | null;
  calendarLoading: boolean;
  gmailTriage: LifeOpsGmailTriageFeed | null;
  gmailTriageLoading: boolean;
  nextCalendarContext: LifeOpsNextCalendarEventContext | null;
  googleConnector: LifeOpsGoogleConnectorStatus | null;
  googleConnectorLoading: boolean;
  googleConnectorBusy: boolean;
  pendingGoogleAuthUrl: string | null;
  onConnectGoogle: (
    capabilities?: Array<"google.calendar.read" | "google.gmail.triage" | "google.gmail.send">,
  ) => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onOpenPendingGoogle: () => Promise<void>;
  onOpenCalendarEvent: (event: LifeOpsCalendarEvent) => Promise<void>;
  onOpenGmailMessage: (
    message: LifeOpsGmailTriageFeed["messages"][number],
  ) => Promise<void>;
  actingOccurrenceId: string | null;
  onComplete: (occurrenceId: string) => Promise<void>;
  onSnooze: (occurrenceId: string) => Promise<void>;
  onSkip: (occurrenceId: string) => Promise<void>;
}) {
  const occurrences = lifeops?.occurrences ?? [];
  const reminders = lifeops?.reminders ?? [];
  const gmailMessages = gmailTriage?.messages ?? [];
  const calendarEvents = useMemo(() => {
    const now = Date.now();
    return (calendarFeed?.events ?? []).filter((event) => {
      const endAt = Date.parse(event.endAt);
      return Number.isFinite(endAt) && endAt > now;
    });
  }, [calendarFeed?.events]);

  return (
    <div className="flex flex-col gap-2">
      <GoogleConnectorCard
        status={googleConnector}
        loading={googleConnectorLoading}
        busy={googleConnectorBusy}
        pendingAuthUrl={pendingGoogleAuthUrl}
        onConnect={onConnectGoogle}
        onDisconnect={onDisconnectGoogle}
        onOpenPending={onOpenPendingGoogle}
      />
      {lifeops ? (
        <p className="px-1 text-[11px] text-muted">
          {lifeops.summary.activeGoalCount} goal
          {lifeops.summary.activeGoalCount === 1 ? "" : "s"} active ·{" "}
          {lifeops.summary.activeReminderCount} reminder
          {lifeops.summary.activeReminderCount === 1 ? "" : "s"} firing
        </p>
      ) : null}
      {googleConnector?.connected ? (
        calendarEvents.length > 0 ? (
          <>
            <NextCalendarContextCard context={nextCalendarContext} />
            <p className="px-1 text-[11px] text-muted">
              {calendarEvents.length} upcoming calendar event
              {calendarEvents.length === 1 ? "" : "s"}
              {calendarFeed?.syncedAt
                ? ` · synced ${relativeIsoTime(calendarFeed.syncedAt)}`
                : ""}
            </p>
            {calendarEvents.map((event) => (
              <CalendarEventRow
                key={event.id}
                event={event}
                onOpen={onOpenCalendarEvent}
              />
            ))}
          </>
        ) : (
          <p className="px-1 text-[11px] text-muted">
            {calendarLoading
              ? "Refreshing today’s calendar…"
              : "No more calendar events for this window."}
          </p>
        )
      ) : null}
      {googleConnector?.connected &&
      googleConnector.grantedCapabilities.includes("google.gmail.triage") ? (
        gmailMessages.length > 0 ? (
          <>
            <p className="px-1 text-[11px] text-muted">
              {gmailTriage?.summary.importantNewCount ?? 0} important new mail ·{" "}
              {gmailTriage?.summary.likelyReplyNeededCount ?? 0} likely reply-needed
              {gmailTriage?.syncedAt
                ? ` · synced ${relativeIsoTime(gmailTriage.syncedAt)}`
                : ""}
            </p>
            {gmailMessages.slice(0, 3).map((message) => (
              <GmailMessageRow
                key={message.id}
                message={message}
                onOpen={onOpenGmailMessage}
              />
            ))}
          </>
        ) : (
          <p className="px-1 text-[11px] text-muted">
            {gmailTriageLoading
              ? "Refreshing Gmail triage…"
              : "No high-priority Gmail triage items right now."}
          </p>
        )
      ) : null}
      {loading &&
      calendarLoading &&
      gmailTriageLoading &&
      occurrences.length === 0 &&
      reminders.length === 0 &&
      calendarEvents.length === 0 &&
      gmailMessages.length === 0 ? (
        <div className="py-3 text-xs text-muted">Refreshing life ops…</div>
      ) : null}
      {!loading &&
      !calendarLoading &&
      !gmailTriageLoading &&
      occurrences.length === 0 &&
      reminders.length === 0 &&
      calendarEvents.length === 0 &&
      gmailMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Target className="h-8 w-8 text-muted/50" />
          <p className="text-sm text-muted">No active life ops</p>
          <p className="text-xs text-muted/70">
            Recurring routines and reminders will surface here.
          </p>
        </div>
      ) : null}
      {reminders.map((reminder) => (
        <ReminderRow
          key={`${reminder.ownerType}:${reminder.ownerId}:${reminder.stepIndex}`}
          reminder={reminder}
        />
      ))}
      {occurrences.map((occurrence) => (
        <LifeOpsOccurrenceRow
          key={occurrence.id}
          occurrence={occurrence}
          acting={actingOccurrenceId === occurrence.id}
          onComplete={onComplete}
          onSnooze={onSnooze}
          onSkip={onSkip}
        />
      ))}
    </div>
  );
}

function TasksSection({ sessions }: { sessions: CodingAgentSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Activity className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No orchestrator work running</p>
        <p className="text-xs text-muted/70">
          New coding agent sessions will appear here live.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <TaskCard key={session.sessionId} session={session} />
      ))}
    </div>
  );
}

function EventsSection({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Activity className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No recent events</p>
        <p className="text-xs text-muted/70">
          Activity events will stream here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-bg-hover/50"
        >
          <span className="mt-0.5 w-12 shrink-0 whitespace-nowrap text-[10px] text-muted">
            {relativeTime(event.timestamp)}
          </span>
          <Badge
            variant="secondary"
            className={`h-4 shrink-0 px-1.5 py-0 text-[9px] ${
              EVENT_TYPE_COLORS[event.eventType] ?? ""
            }`}
          >
            {event.eventType.replace(/_/g, " ")}
          </Badge>
          <span className="min-w-0 flex-1 break-words text-[11px] text-txt">
            {event.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TasksEventsPanel({
  open,
  events,
  clearEvents,
  mobile = false,
}: TasksEventsPanelProps) {
  const { ptySessions, setActionNotice, t, workbench } = useApp();
  const [todos, setTodos] = useState<WorkbenchTodo[]>(() =>
    dedupeTodos(workbench?.todos ?? []),
  );
  const [todosLoading, setTodosLoading] = useState(false);
  const [lifeops, setLifeops] = useState<LifeOpsOverview | null>(
    workbench?.lifeops ?? null,
  );
  const [lifeopsLoading, setLifeopsLoading] = useState(false);
  const [calendarFeed, setCalendarFeed] = useState<LifeOpsCalendarFeed | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [gmailTriage, setGmailTriage] = useState<LifeOpsGmailTriageFeed | null>(
    null,
  );
  const [gmailTriageLoading, setGmailTriageLoading] = useState(false);
  const [nextCalendarContext, setNextCalendarContext] =
    useState<LifeOpsNextCalendarEventContext | null>(null);
  const [googleConnector, setGoogleConnector] =
    useState<LifeOpsGoogleConnectorStatus | null>(null);
  const [googleConnectorLoading, setGoogleConnectorLoading] = useState(false);
  const [googleConnectorBusy, setGoogleConnectorBusy] = useState(false);
  const [pendingGoogleAuthUrl, setPendingGoogleAuthUrl] = useState<string | null>(
    null,
  );
  const [actingOccurrenceId, setActingOccurrenceId] = useState<string | null>(
    null,
  );

  const activeSessions = useMemo(
    () =>
      (ptySessions ?? []).filter(
        (session) => !TERMINAL_STATUSES.has(session.status),
      ),
    [ptySessions],
  );
  const openTodoCount = useMemo(
    () => todos.filter((todo) => !todo.isCompleted).length,
    [todos],
  );
  const activeLifeOpsCount = useMemo(
    () =>
      (lifeops?.occurrences ?? []).filter(
        (occurrence) =>
          occurrence.state === "visible" || occurrence.state === "snoozed",
      ).length,
    [lifeops],
  );

  useEffect(() => {
    setTodos(dedupeTodos(workbench?.todos ?? []));
  }, [workbench?.todos]);

  useEffect(() => {
    setLifeops(workbench?.lifeops ?? null);
  }, [workbench?.lifeops]);

  const loadTodos = useCallback(
    async (silent = false) => {
      if (!silent) {
        setTodosLoading(true);
      }

      try {
        const result = await client.listWorkbenchTodos();
        setTodos(dedupeTodos(result.todos));
      } catch {
        if ((workbench?.todos?.length ?? 0) > 0) {
          setTodos(dedupeTodos(workbench?.todos ?? []));
        }
      } finally {
        setTodosLoading(false);
      }
    },
    [workbench?.todos],
  );

  const loadLifeOps = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLifeopsLoading(true);
      }

      try {
        const result = await client.getLifeOpsOverview();
        setLifeops(result);
      } catch {
        if (workbench?.lifeops) {
          setLifeops(workbench.lifeops);
        }
      } finally {
        setLifeopsLoading(false);
      }
    },
    [workbench?.lifeops],
  );

  const loadGoogleConnector = useCallback(
    async (silent = false) => {
      if (!silent) {
        setGoogleConnectorLoading(true);
      }

      try {
        const result = await client.getGoogleLifeOpsConnectorStatus();
        setGoogleConnector(result);
        if (result.connected) {
          setPendingGoogleAuthUrl(null);
        }
        return result;
      } catch {
        return null;
      } finally {
        setGoogleConnectorLoading(false);
      }
    },
    [],
  );

  const loadCalendarFeed = useCallback(
    async (
      connectorStatus: LifeOpsGoogleConnectorStatus | null,
      silent = false,
    ) => {
      if (!connectorStatus?.connected) {
        setCalendarFeed(null);
        setCalendarLoading(false);
        return null;
      }
      if (!silent) {
        setCalendarLoading(true);
      }

      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const result = await client.getLifeOpsCalendarFeed({ timeZone });
        setCalendarFeed(result);
        return result;
      } catch {
        return null;
      } finally {
        setCalendarLoading(false);
      }
    },
    [],
  );

  const loadNextCalendarContext = useCallback(
    async (
      connectorStatus: LifeOpsGoogleConnectorStatus | null,
      silent = false,
    ) => {
      if (!connectorStatus?.connected) {
        setNextCalendarContext(null);
        return null;
      }
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const result = await client.getLifeOpsNextCalendarEventContext({ timeZone });
        setNextCalendarContext(result);
        return result;
      } catch {
        if (!silent) {
          setNextCalendarContext(null);
        }
        return null;
      }
    },
    [],
  );

  const loadGmailTriage = useCallback(
    async (
      connectorStatus: LifeOpsGoogleConnectorStatus | null,
      silent = false,
    ) => {
      if (!connectorStatus?.connected) {
        setGmailTriage(null);
        setGmailTriageLoading(false);
        return null;
      }
      if (!connectorStatus.grantedCapabilities.includes("google.gmail.triage")) {
        setGmailTriage(null);
        setGmailTriageLoading(false);
        return null;
      }
      if (!silent) {
        setGmailTriageLoading(true);
      }
      try {
        const result = await client.getLifeOpsGmailTriage({
          maxResults: 12,
        });
        setGmailTriage(result);
        return result;
      } catch {
        if (!silent) {
          setGmailTriage(null);
        }
        return null;
      } finally {
        setGmailTriageLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    void (async () => {
      await loadTodos(todos.length > 0);
      if (!active) return;
    })();
    const intervalId = window.setInterval(() => {
      if (!active) return;
      void loadTodos(true);
    }, TODO_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadTodos, open, todos.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    void (async () => {
      await loadLifeOps((lifeops?.occurrences.length ?? 0) > 0);
      if (!active) return;
    })();

    void (async () => {
      const connectorStatus = await loadGoogleConnector(googleConnector !== null);
      if (!active) return;
      await loadCalendarFeed(connectorStatus, calendarFeed !== null);
      if (!active) return;
      await loadGmailTriage(connectorStatus, true);
      if (!active) return;
      await loadNextCalendarContext(connectorStatus, true);
      if (!active) return;
      await loadLifeOps(true);
      if (!active) return;
    })();

    const intervalId = window.setInterval(() => {
      if (!active) return;
      void loadLifeOps(true);
      void (async () => {
        const connectorStatus = await loadGoogleConnector(true);
        if (!active) return;
        await loadCalendarFeed(connectorStatus, true);
        if (!active) return;
        await loadGmailTriage(connectorStatus, true);
        if (!active) return;
        await loadNextCalendarContext(connectorStatus, true);
        if (!active) return;
        await loadLifeOps(true);
      })();
    }, LIFEOPS_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    calendarFeed !== null,
    googleConnector !== null,
    lifeops?.occurrences.length,
    loadCalendarFeed,
    loadGmailTriage,
    loadGoogleConnector,
    loadLifeOps,
    loadNextCalendarContext,
    open,
  ]);

  const runOccurrenceAction = useCallback(
    async (
      occurrenceId: string,
      action: () => Promise<void>,
    ) => {
      setActingOccurrenceId(occurrenceId);
      try {
        await action();
        await loadLifeOps(true);
      } finally {
        setActingOccurrenceId(null);
      }
    },
    [loadLifeOps],
  );

  const pollForGoogleConnection = useCallback(
    async () => {
      for (let attempt = 0; attempt < GOOGLE_CONNECTOR_POLL_ATTEMPTS; attempt += 1) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, GOOGLE_CONNECTOR_POLL_MS);
        });
        const status = await loadGoogleConnector(true);
        if (status?.connected) {
          await loadCalendarFeed(status, true);
          await loadGmailTriage(status, true);
          await loadNextCalendarContext(status, true);
          await loadLifeOps(true);
          setActionNotice(
            "Google permissions updated.",
            "success",
            3600,
          );
          return;
        }
      }
    },
    [loadCalendarFeed, loadGmailTriage, loadGoogleConnector, loadLifeOps, loadNextCalendarContext, setActionNotice],
  );

  const handleOpenPendingGoogle = useCallback(async () => {
    if (!pendingGoogleAuthUrl) {
      return;
    }
    await openExternalUrl(pendingGoogleAuthUrl);
  }, [pendingGoogleAuthUrl]);

  const handleConnectGoogle = useCallback(async (
    capabilities?: Array<"google.calendar.read" | "google.gmail.triage" | "google.gmail.send">,
  ) => {
    setGoogleConnectorBusy(true);
    try {
      const result = await client.startGoogleLifeOpsConnector(
        capabilities ? { capabilities } : {},
      );
      setPendingGoogleAuthUrl(result.authUrl);
      await openExternalUrl(result.authUrl);
      setActionNotice(
        "Continue Google consent in your browser.",
        "info",
        3600,
      );
      await pollForGoogleConnection();
    } catch (error) {
      setActionNotice(
        error instanceof Error ? error.message : "Google connection failed.",
        "error",
        4800,
      );
    } finally {
      setGoogleConnectorBusy(false);
    }
  }, [pollForGoogleConnection, setActionNotice]);

  const handleDisconnectGoogle = useCallback(async () => {
    setGoogleConnectorBusy(true);
    try {
      const result = await client.disconnectGoogleLifeOpsConnector();
      setGoogleConnector(result);
      setPendingGoogleAuthUrl(null);
      setCalendarFeed(null);
      setGmailTriage(null);
      setNextCalendarContext(null);
      setActionNotice("Google disconnected.", "info", 3200);
    } catch (error) {
      setActionNotice(
        error instanceof Error ? error.message : "Google disconnect failed.",
        "error",
        4800,
      );
    } finally {
      setGoogleConnectorBusy(false);
    }
  }, [setActionNotice]);

  const handleOpenCalendarEvent = useCallback(
    async (event: LifeOpsCalendarEvent) => {
      const target = event.htmlLink ?? event.conferenceLink;
      if (!target) {
        return;
      }
      await openExternalUrl(target);
    },
    [],
  );

  const handleOpenGmailMessage = useCallback(
    async (message: LifeOpsGmailTriageFeed["messages"][number]) => {
      if (!message.htmlLink) {
        return;
      }
      await openExternalUrl(message.htmlLink);
    },
    [],
  );

  if (!open) return null;

  const rootClassName = mobile
    ? "flex flex-1 min-h-0 flex-col overflow-hidden bg-bg"
    : "flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden border-l border-border bg-bg";

  return (
    <aside className={rootClassName} data-testid="chat-widgets-bar">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <WidgetSection
          title={t("taskseventspanel.LifeOps", { defaultValue: "Life Ops" })}
          icon={<Target className="h-4 w-4" />}
          count={activeLifeOpsCount}
          testId="chat-widget-lifeops"
        >
          <LifeOpsSection
            lifeops={lifeops}
            loading={lifeopsLoading}
            calendarFeed={calendarFeed}
            calendarLoading={calendarLoading}
            gmailTriage={gmailTriage}
            gmailTriageLoading={gmailTriageLoading}
            nextCalendarContext={nextCalendarContext}
            googleConnector={googleConnector}
            googleConnectorLoading={googleConnectorLoading}
            googleConnectorBusy={googleConnectorBusy}
            pendingGoogleAuthUrl={pendingGoogleAuthUrl}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={handleDisconnectGoogle}
            onOpenPendingGoogle={handleOpenPendingGoogle}
            onOpenCalendarEvent={handleOpenCalendarEvent}
            onOpenGmailMessage={handleOpenGmailMessage}
            actingOccurrenceId={actingOccurrenceId}
            onComplete={(occurrenceId) =>
              runOccurrenceAction(occurrenceId, async () => {
                await client.completeLifeOpsOccurrence(occurrenceId, {});
              })
            }
            onSnooze={(occurrenceId) =>
              runOccurrenceAction(occurrenceId, async () => {
                await client.snoozeLifeOpsOccurrence(occurrenceId, {
                  minutes: 30,
                });
              })
            }
            onSkip={(occurrenceId) =>
              runOccurrenceAction(occurrenceId, async () => {
                await client.skipLifeOpsOccurrence(occurrenceId);
              })
            }
          />
        </WidgetSection>

        <WidgetSection
          title={t("taskseventspanel.Todos", { defaultValue: "Todos" })}
          icon={<ListTodo className="h-4 w-4" />}
          count={openTodoCount}
          testId="chat-widget-todos"
        >
          <TodosSection todos={todos} loading={todosLoading} />
        </WidgetSection>

        <WidgetSection
          title={t("taskseventspanel.Tasks", { defaultValue: "Tasks" })}
          icon={<Activity className="h-4 w-4" />}
          count={activeSessions.length}
          testId="chat-widget-orchestrator"
        >
          <TasksSection sessions={activeSessions} />
        </WidgetSection>

        <WidgetSection
          title={t("taskseventspanel.Events", { defaultValue: "Events" })}
          icon={<Activity className="h-4 w-4" />}
          count={events.length}
          action={
            events.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearEvents}
                className="h-6 px-2 text-xs text-muted"
              >
                Clear
              </Button>
            ) : undefined
          }
          testId="chat-widget-events"
        >
          <EventsSection events={events} />
        </WidgetSection>
      </div>
    </aside>
  );
}
