import type {
  LifeOpsActiveReminderView,
  LifeOpsCadence,
  LifeOpsGoalDefinition,
  LifeOpsOccurrenceView,
  LifeOpsOverview,
  LifeOpsOverviewSection,
} from "@miladyai/shared/contracts/lifeops";
import { Badge, Button } from "@miladyai/ui";
import { BellRing, Bot, CheckCircle2, ListTodo, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../../../../api";
import { useApp } from "../../../../state";
import { EmptyWidgetState, WidgetSection } from "../shared";
import type {
  ChatSidebarWidgetDefinition,
  ChatSidebarWidgetProps,
} from "../types";

const LIFEOPS_REFRESH_INTERVAL_MS = 15_000;
const MAX_SECTION_OCCURRENCES = 4;
const MAX_SECTION_GOALS = 3;
const MAX_SECTION_REMINDERS = 2;

type OccurrenceAction = "complete" | "snooze" | "skip";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function cadenceLabel(cadence: LifeOpsCadence): string {
  switch (cadence.kind) {
    case "once":
      return "One-off";
    case "daily":
      return "Daily";
    case "times_per_day":
      if (cadence.slots.length <= 1) {
        return "Daily";
      }
      if (cadence.slots.length === 2) {
        return "Twice daily";
      }
      return `${cadence.slots.length}x daily`;
    case "weekly":
      return cadence.weekdays.length <= 2 ? "Occasional" : "Weekly";
  }
}

function cadenceDetail(cadence: LifeOpsCadence): string | null {
  switch (cadence.kind) {
    case "once":
      return formatDateTime(cadence.dueAt);
    case "daily":
      return cadence.windows.length > 0 ? cadence.windows.join(", ") : null;
    case "times_per_day":
      return cadence.slots.map((slot) => slot.label).join(" / ");
    case "weekly":
      return cadence.windows.length > 0 ? cadence.windows.join(", ") : null;
  }
}

function reviewStateLabel(reviewState: LifeOpsGoalDefinition["reviewState"]): string {
  switch (reviewState) {
    case "needs_attention":
      return "Needs attention";
    case "on_track":
      return "On track";
    case "at_risk":
      return "At risk";
    default:
      return "Idle";
  }
}

function hasSectionContent(section: LifeOpsOverviewSection): boolean {
  return (
    section.occurrences.length > 0 ||
    section.goals.length > 0 ||
    section.reminders.length > 0
  );
}

function sectionItemCount(section: LifeOpsOverviewSection): number {
  return (
    section.summary.activeOccurrenceCount +
    section.summary.activeGoalCount +
    section.summary.activeReminderCount
  );
}

function descriptionForOccurrence(occurrence: LifeOpsOccurrenceView): string | null {
  const description = occurrence.description.trim();
  return description.length > 0 ? description : null;
}

function sectionSummary(section: LifeOpsOverviewSection): string {
  const parts: string[] = [];
  if (section.summary.activeOccurrenceCount > 0) {
    parts.push(
      `${section.summary.activeOccurrenceCount} open ${section.summary.activeOccurrenceCount === 1 ? "item" : "items"}`,
    );
  }
  if (section.summary.activeGoalCount > 0) {
    parts.push(
      `${section.summary.activeGoalCount} active ${section.summary.activeGoalCount === 1 ? "goal" : "goals"}`,
    );
  }
  if (section.summary.activeReminderCount > 0) {
    parts.push(
      `${section.summary.activeReminderCount} live ${section.summary.activeReminderCount === 1 ? "reminder" : "reminders"}`,
    );
  }
  if (parts.length === 0) {
    return "No active items";
  }
  return parts.join(" • ");
}

function reminderChannelLabel(channel: LifeOpsActiveReminderView["channel"]): string {
  return channel.replace(/_/g, " ");
}

function OccurrenceRow({
  occurrence,
  actionPending,
  onAction,
}: {
  occurrence: LifeOpsOccurrenceView;
  actionPending: boolean;
  onAction: (occurrenceId: string, action: OccurrenceAction) => Promise<void>;
}) {
  const cadence = cadenceLabel(occurrence.cadence);
  const cadenceSecondary = cadenceDetail(occurrence.cadence);
  const dueLabel =
    formatDateTime(occurrence.dueAt) ?? formatDateTime(occurrence.scheduledAt);
  const description = descriptionForOccurrence(occurrence);
  const isClosed =
    occurrence.state === "completed" ||
    occurrence.state === "skipped" ||
    occurrence.state === "expired" ||
    occurrence.state === "muted";

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
            occurrence.priority <= 1 ? "bg-danger" : "bg-accent"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-txt">
              {occurrence.title}
            </span>
            <Badge variant="secondary" className="text-[9px]">
              {cadence}
            </Badge>
            {occurrence.state === "snoozed" ? (
              <Badge variant="secondary" className="text-[9px]">
                Snoozed
              </Badge>
            ) : null}
            {occurrence.subjectType === "agent" ? (
              <Badge variant="secondary" className="text-[9px]">
                Agent
              </Badge>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted/80">
            {dueLabel ? <span>{dueLabel}</span> : null}
            {cadenceSecondary ? <span>{cadenceSecondary}</span> : null}
          </div>
          {!isClosed ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                onClick={() => void onAction(occurrence.id, "complete")}
                className="h-7 px-2 text-[11px]"
              >
                Done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={actionPending}
                onClick={() => void onAction(occurrence.id, "snooze")}
                className="h-7 px-2 text-[11px]"
              >
                Snooze 15m
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={actionPending}
                onClick={() => void onAction(occurrence.id, "skip")}
                className="h-7 px-2 text-[11px]"
              >
                Skip
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoalRow({ goal }: { goal: LifeOpsGoalDefinition }) {
  const cadence = isRecord(goal.cadence) ? goal.cadence : null;
  const cadenceText =
    cadence && typeof cadence.kind === "string" ? cadence.kind : null;
  const description = goal.description.trim();

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {goal.title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {reviewStateLabel(goal.reviewState)}
        </Badge>
      </div>
      {description.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
          {description}
        </p>
      ) : null}
      {cadenceText ? (
        <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-muted/80">
          {cadenceText}
        </div>
      ) : null}
    </div>
  );
}

function ReminderRow({ reminder }: { reminder: LifeOpsActiveReminderView }) {
  const scheduledFor = formatDateTime(reminder.scheduledFor);
  const dueAt = formatDateTime(reminder.dueAt);

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {reminder.title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {reminderChannelLabel(reminder.channel)}
        </Badge>
      </div>
      <div className="mt-1 text-[11px] text-muted">{reminder.stepLabel}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted/80">
        {scheduledFor ? <span>{scheduledFor}</span> : null}
        {dueAt ? <span>Due {dueAt}</span> : null}
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  icon,
  section,
  actionState,
  onOccurrenceAction,
}: {
  title: string;
  icon: JSX.Element;
  section: LifeOpsOverviewSection;
  actionState: string | null;
  onOccurrenceAction: (occurrenceId: string, action: OccurrenceAction) => Promise<void>;
}) {
  if (!hasSectionContent(section)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-muted">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {sectionItemCount(section)}
        </Badge>
      </div>
      <p className="px-0.5 text-[11px] text-muted">{sectionSummary(section)}</p>
      {section.occurrences.slice(0, MAX_SECTION_OCCURRENCES).map((occurrence) => (
        <OccurrenceRow
          key={occurrence.id}
          occurrence={occurrence}
          actionPending={actionState?.endsWith(`:${occurrence.id}`) === true}
          onAction={onOccurrenceAction}
        />
      ))}
      {section.goals.slice(0, MAX_SECTION_GOALS).map((goal) => (
        <GoalRow key={goal.id} goal={goal} />
      ))}
      {section.reminders.slice(0, MAX_SECTION_REMINDERS).map((reminder) => (
        <ReminderRow
          key={`${reminder.ownerId}:${reminder.stepIndex}:${reminder.scheduledFor}`}
          reminder={reminder}
        />
      ))}
    </div>
  );
}

export function LifeOpsOverviewSidebarWidget(_props: ChatSidebarWidgetProps) {
  const { workbench } = useApp();
  const [overview, setOverview] = useState<LifeOpsOverview | null>(
    workbench?.lifeops ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);

  useEffect(() => {
    if (workbench?.lifeops) {
      setOverview(workbench.lifeops);
    }
  }, [workbench?.lifeops]);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const nextOverview = await client.getLifeOpsOverview();
        setOverview(nextOverview);
        setError(null);
      } catch (cause) {
        const message =
          cause instanceof Error && cause.message.trim().length > 0
            ? cause.message.trim()
            : "Life ops failed to refresh.";
        if (!workbench?.lifeops && !overview) {
          setOverview(null);
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [overview, workbench?.lifeops],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      await loadOverview(Boolean(workbench?.lifeops));
    })();

    const intervalId = window.setInterval(() => {
      if (!active) {
        return;
      }
      void loadOverview(true);
    }, LIFEOPS_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadOverview, workbench?.lifeops]);

  const onOccurrenceAction = useCallback(
    async (occurrenceId: string, action: OccurrenceAction) => {
      const token = `${action}:${occurrenceId}`;
      try {
        setActionState(token);
        if (action === "complete") {
          await client.completeLifeOpsOccurrence(occurrenceId, {});
        } else if (action === "snooze") {
          await client.snoozeLifeOpsOccurrence(occurrenceId, {
            preset: "15m",
          });
        } else {
          await client.skipLifeOpsOccurrence(occurrenceId);
        }
        await loadOverview(true);
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message.trim().length > 0
            ? cause.message.trim()
            : "Life ops update failed.",
        );
      } finally {
        setActionState((current) => (current === token ? null : current));
      }
    },
    [loadOverview],
  );

  const count = useMemo(() => {
    if (!overview) {
      return 0;
    }
    return (
      overview.owner.summary.activeOccurrenceCount +
      overview.owner.summary.activeGoalCount +
      overview.owner.summary.activeReminderCount
    );
  }, [overview]);

  const hasAnyContent = overview
    ? hasSectionContent(overview.owner) || hasSectionContent(overview.agentOps)
    : false;

  return (
    <WidgetSection
      title="Life Ops"
      icon={<ListTodo className="h-4 w-4" />}
      count={count}
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={loading || actionState !== null}
          onClick={() => void loadOverview()}
          className="h-7 px-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      }
      testId="chat-widget-lifeops-overview"
    >
      {!hasAnyContent ? (
        <EmptyWidgetState
          icon={<CheckCircle2 className="h-8 w-8" />}
          title={loading ? "Refreshing life ops…" : "No life ops yet"}
          description="Reminders are driven from LifeOps and scheduled by the queue worker."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SectionBlock
            title="My life ops"
            icon={<ListTodo className="h-3.5 w-3.5" />}
            section={overview!.owner}
            actionState={actionState}
            onOccurrenceAction={onOccurrenceAction}
          />
          <SectionBlock
            title="Agent ops"
            icon={<Bot className="h-3.5 w-3.5" />}
            section={overview!.agentOps}
            actionState={actionState}
            onOccurrenceAction={onOccurrenceAction}
          />
          <div className="rounded-lg border border-border/50 bg-bg-accent/30 px-3 py-2 text-[11px] text-muted">
            <div className="flex items-center gap-2">
              <BellRing className="h-3.5 w-3.5" />
              <span>Reminders are driven from LifeOps and scheduled by the queue worker.</span>
            </div>
          </div>
        </div>
      )}
      {error ? <div className="mt-3 text-[11px] text-danger">{error}</div> : null}
    </WidgetSection>
  );
}

export const LIFEOPS_OVERVIEW_WIDGETS: ChatSidebarWidgetDefinition[] = [
  {
    id: "lifeops.overview",
    pluginId: "lifeops",
    order: 90,
    defaultEnabled: true,
    Component: LifeOpsOverviewSidebarWidget,
  },
];
