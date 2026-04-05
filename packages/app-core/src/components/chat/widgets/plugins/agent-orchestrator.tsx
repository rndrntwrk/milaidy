import type { CodingAgentSession } from "@miladyai/app-core/api";
import { Badge, Button } from "@miladyai/ui";
import { Activity } from "lucide-react";
import { useMemo } from "react";
import { TERMINAL_STATUSES } from "../../../../coding";
import type { ActivityEvent } from "../../../../hooks/useActivityEvents";
import { useApp } from "../../../../state";
import { PULSE_STATUSES, STATUS_DOT } from "../../../coding/pty-status-dots";
import { EmptyWidgetState, WidgetSection } from "../shared";
import type {
  ChatSidebarWidgetDefinition,
  ChatSidebarWidgetProps,
} from "../types";

function deriveSessionActivity(session: CodingAgentSession): string {
  if (session.status === "tool_running" && session.toolDescription) {
    return `Running ${session.toolDescription}`.slice(0, 60);
  }
  if (session.status === "blocked") return "Waiting for input";
  if (session.status === "error") return "Error";
  return "Running";
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
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

function TaskCard({ session }: { session: CodingAgentSession }) {
  const activity = session.lastActivity ?? deriveSessionActivity(session);

  return (
    <div className="rounded-lg border border-border/50 bg-bg-accent/30 p-3 text-left">
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
    </div>
  );
}

function TaskItemsContent({ sessions }: { sessions: CodingAgentSession[] }) {
  if (sessions.length === 0) {
    return (
      <EmptyWidgetState
        icon={<Activity className="h-8 w-8" />}
        title="No orchestrator work running"
      />
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

function ActivityItemsContent({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyWidgetState
        icon={<Activity className="h-8 w-8" />}
        title="No recent activity"
      />
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

function OrchestratorTasksWidget(_props: ChatSidebarWidgetProps) {
  const { ptySessions, t } = useApp();
  const activeSessions = useMemo(
    () =>
      (ptySessions ?? []).filter(
        (session) => !TERMINAL_STATUSES.has(session.status),
      ),
    [ptySessions],
  );

  return (
    <WidgetSection
      title={t("taskseventspanel.Tasks", { defaultValue: "Tasks" })}
      icon={<Activity className="h-4 w-4" />}
      count={activeSessions.length}
      testId="chat-widget-orchestrator"
    >
      <TaskItemsContent sessions={activeSessions} />
    </WidgetSection>
  );
}

function OrchestratorActivityWidget({
  events,
  clearEvents,
}: ChatSidebarWidgetProps) {
  const { t } = useApp();

  return (
    <WidgetSection
      title={t("taskseventspanel.Activity", { defaultValue: "Activity" })}
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
      <ActivityItemsContent events={events} />
    </WidgetSection>
  );
}

export const AGENT_ORCHESTRATOR_PLUGIN_WIDGETS: ChatSidebarWidgetDefinition[] =
  [
    {
      id: "agent-orchestrator.tasks",
      pluginId: "agent-orchestrator",
      order: 200,
      defaultEnabled: true,
      Component: OrchestratorTasksWidget,
    },
    {
      id: "agent-orchestrator.activity",
      pluginId: "agent-orchestrator",
      order: 300,
      defaultEnabled: true,
      Component: OrchestratorActivityWidget,
    },
  ];
