import type {
  LifeOpsActiveReminderView,
  LifeOpsGoalDefinition,
  LifeOpsOccurrenceView,
  LifeOpsOverview,
  LifeOpsOverviewSection,
} from "@miladyai/app-core/api";
import { Badge } from "@miladyai/ui";
import { BellRing, ListTodo, Shield, Target } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { client } from "../../../../api";
import { useApp } from "../../../../state";
import { EmptyWidgetState, WidgetSection } from "../shared";
import type {
  ChatSidebarWidgetDefinition,
  ChatSidebarWidgetProps,
} from "../types";

const LIFEOPS_REFRESH_INTERVAL_MS = 15_000;
const MAX_SECTION_ITEMS = 5;

const EMPTY_SUMMARY = {
  activeOccurrenceCount: 0,
  overdueOccurrenceCount: 0,
  snoozedOccurrenceCount: 0,
  activeReminderCount: 0,
  activeGoalCount: 0,
};

const EMPTY_SECTION: LifeOpsOverviewSection = {
  occurrences: [],
  goals: [],
  reminders: [],
  summary: EMPTY_SUMMARY,
};

function cadenceLabel(occurrence: LifeOpsOccurrenceView): string {
  switch (occurrence.cadence.kind) {
    case "once":
      return "One-off";
    case "daily":
      return occurrence.definitionKind === "routine" ? "Daily routine" : "Daily";
    case "weekly":
      return occurrence.cadence.weekdays.length === 1 ? "Weekly" : "Occasional";
    case "times_per_day":
      if (occurrence.cadence.slots.length === 2) {
        return "Twice daily";
      }
      if (occurrence.cadence.slots.length === 1) {
        return "Once daily";
      }
      return `${occurrence.cadence.slots.length}x daily`;
    default:
      return "Ongoing";
  }
}

function formatRelativeTime(
  value: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!value) {
    return null;
  }
  const target = Date.parse(value);
  if (!Number.isFinite(target)) {
    return null;
  }
  const deltaMinutes = Math.round((target - now) / 60_000);
  if (Math.abs(deltaMinutes) < 1) {
    return "now";
  }
  if (deltaMinutes < 0) {
    const overdue = Math.abs(deltaMinutes);
    return `-${overdue}m`;
  }
  if (deltaMinutes < 60) {
    return `+${deltaMinutes}m`;
  }
  const hours = Math.round((deltaMinutes / 60) * 10) / 10;
  return `+${hours}h`;
}

function normalizeOverviewSection(
  overview: LifeOpsOverview | null | undefined,
  key: "owner" | "agentOps",
): LifeOpsOverviewSection {
  if (!overview) {
    return EMPTY_SECTION;
  }
  if (key === "owner" && overview.owner) {
    return overview.owner;
  }
  if (key === "agentOps" && overview.agentOps) {
    return overview.agentOps;
  }
  if (key === "owner") {
    return {
      occurrences: overview.occurrences ?? [],
      goals: overview.goals ?? [],
      reminders: overview.reminders ?? [],
      summary: overview.summary ?? EMPTY_SUMMARY,
    };
  }
  return EMPTY_SECTION;
}

function OccurrenceRow({ occurrence }: { occurrence: LifeOpsOccurrenceView }) {
  const dueLabel = formatRelativeTime(
    occurrence.dueAt ?? occurrence.scheduledAt ?? occurrence.relevanceStartAt,
  );
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {occurrence.title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {cadenceLabel(occurrence)}
        </Badge>
        {occurrence.state === "snoozed" ? (
          <Badge variant="secondary" className="text-[9px]">
            Snoozed
          </Badge>
        ) : null}
        {dueLabel ? (
          <Badge variant="secondary" className="text-[9px]">
            {dueLabel}
          </Badge>
        ) : null}
      </div>
      {occurrence.description.trim().length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
          {occurrence.description}
        </p>
      ) : null}
    </div>
  );
}

function GoalRow({ goal }: { goal: LifeOpsGoalDefinition }) {
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {goal.title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {goal.reviewState.replaceAll("_", " ")}
        </Badge>
      </div>
      {goal.description.trim().length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
          {goal.description}
        </p>
      ) : null}
    </div>
  );
}

function ReminderRow({ reminder }: { reminder: LifeOpsActiveReminderView }) {
  const timeLabel = formatRelativeTime(reminder.scheduledFor);
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {reminder.title}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {reminder.channel}
        </Badge>
        {timeLabel ? (
          <Badge variant="secondary" className="text-[9px]">
            {timeLabel}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] leading-5 text-muted">
        {reminder.stepLabel}
      </p>
    </div>
  );
}

function SectionBucket({
  title,
  emptyLabel,
  occurrences,
  goals,
  reminders,
  icon,
}: {
  title: string;
  emptyLabel: string;
  occurrences: LifeOpsOccurrenceView[];
  goals: LifeOpsGoalDefinition[];
  reminders: LifeOpsActiveReminderView[];
  icon: ReactNode;
}) {
  const hasItems =
    occurrences.length > 0 || goals.length > 0 || reminders.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-muted">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {title}
        </span>
      </div>
      {!hasItems ? (
        <p className="px-1 text-[11px] text-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {occurrences.slice(0, MAX_SECTION_ITEMS).map((occurrence) => (
            <OccurrenceRow key={occurrence.id} occurrence={occurrence} />
          ))}
          {goals.slice(0, MAX_SECTION_ITEMS).map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
          {reminders.slice(0, MAX_SECTION_ITEMS).map((reminder) => (
            <ReminderRow
              key={`${reminder.ownerId}:${reminder.stepIndex}:${reminder.channel}`}
              reminder={reminder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LifeOpsSidebarWidget(_props: ChatSidebarWidgetProps) {
  const { workbench, t } = useApp();
  const [overview, setOverview] = useState<LifeOpsOverview | null>(
    workbench?.lifeops ?? null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOverview(workbench?.lifeops ?? null);
  }, [workbench?.lifeops]);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        setOverview(await client.getLifeOpsOverview());
      } catch {
        if (workbench?.lifeops) {
          setOverview(workbench.lifeops);
        }
      } finally {
        setLoading(false);
      }
    },
    [workbench?.lifeops],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadOverview(Boolean(workbench?.lifeops));
      if (!active) {
        return;
      }
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

  const ownerSection = useMemo(
    () => normalizeOverviewSection(overview, "owner"),
    [overview],
  );
  const agentSection = useMemo(
    () => normalizeOverviewSection(overview, "agentOps"),
    [overview],
  );
  const hasItems =
    ownerSection.occurrences.length > 0 ||
    ownerSection.goals.length > 0 ||
    ownerSection.reminders.length > 0 ||
    agentSection.occurrences.length > 0 ||
    agentSection.goals.length > 0 ||
    agentSection.reminders.length > 0;

  return (
    <WidgetSection
      title={t("taskseventspanel.LifeOps", { defaultValue: "Life Ops" })}
      icon={<ListTodo className="h-4 w-4" />}
      count={ownerSection.summary.activeOccurrenceCount}
      testId="chat-widget-lifeops"
    >
      {!hasItems && !loading ? (
        <EmptyWidgetState
          icon={<ListTodo className="h-8 w-8" />}
          title="No life ops yet"
          description="Daily routines, one-offs, reminders, and goals will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SectionBucket
            title="Mine"
            emptyLabel="No owner life ops are active."
            occurrences={ownerSection.occurrences}
            goals={ownerSection.goals}
            reminders={ownerSection.reminders}
            icon={<Target className="h-4 w-4" />}
          />
          <SectionBucket
            title="Agent Ops"
            emptyLabel="No private agent ops are active."
            occurrences={agentSection.occurrences}
            goals={agentSection.goals}
            reminders={agentSection.reminders}
            icon={<Shield className="h-4 w-4" />}
          />
          {loading ? (
            <div className="px-1 text-[11px] text-muted">Refreshing life ops…</div>
          ) : null}
          {(ownerSection.reminders.length > 0 || agentSection.reminders.length > 0) ? (
            <div className="flex items-center gap-2 px-1 text-[11px] text-muted">
              <BellRing className="h-3.5 w-3.5" />
              Reminders are driven from LifeOps, not the legacy todo reminder loop.
            </div>
          ) : null}
        </div>
      )}
    </WidgetSection>
  );
}

export const LIFEOPS_WIDGETS: ChatSidebarWidgetDefinition[] = [
  {
    id: "lifeops.overview",
    pluginId: "lifeops",
    order: 90,
    defaultEnabled: true,
    Component: LifeOpsSidebarWidget,
  },
];
