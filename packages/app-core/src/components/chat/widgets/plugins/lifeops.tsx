import type {
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsConnectorMode,
  LifeOpsGmailMessageSummary,
  LifeOpsGmailTriageFeed,
  LifeOpsGoogleCapability,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import { Badge, Button } from "@miladyai/ui";
import { CalendarDays, Mail, Plug2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../../../../api";
import { openExternalUrl } from "../../../../utils";
import { WidgetSection } from "../shared";
import type {
  ChatSidebarWidgetDefinition,
  ChatSidebarWidgetProps,
} from "../types";

const GOOGLE_WIDGET_REFRESH_INTERVAL_MS = 15_000;
const GOOGLE_WIDGET_EVENT_LIMIT = 3;
const GOOGLE_WIDGET_MESSAGE_LIMIT = 3;

function capabilitySet(
  status: LifeOpsGoogleConnectorStatus | null,
): Set<LifeOpsGoogleCapability> {
  return new Set(status?.grantedCapabilities ?? []);
}

function modeLabel(mode: LifeOpsConnectorMode): string {
  switch (mode) {
    case "cloud_managed":
      return "Cloud";
    case "remote":
      return "Remote";
    default:
      return "Local";
  }
}

function readIdentityLabel(identity: Record<string, unknown> | null): {
  primary: string;
  secondary: string | null;
} {
  if (!identity) {
    return { primary: "Disconnected", secondary: null };
  }
  const name =
    typeof identity.name === "string" && identity.name.trim().length > 0
      ? identity.name.trim()
      : null;
  const email =
    typeof identity.email === "string" && identity.email.trim().length > 0
      ? identity.email.trim()
      : null;
  return {
    primary: name ?? email ?? "Google connected",
    secondary: name && email ? email : null,
  };
}

function formatEventTime(
  event: LifeOpsCalendarEvent,
  timeZone: string,
): string | null {
  const start = Date.parse(event.startAt);
  if (!Number.isFinite(start)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(start));
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(start));
  }
}

function formatReceivedAt(value: string): string | null {
  const receivedAt = Date.parse(value);
  if (!Number.isFinite(receivedAt)) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(receivedAt));
}

function SectionHeading({
  icon,
  title,
  count,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="text-muted">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </span>
      {typeof count === "number" ? (
        <Badge variant="secondary" className="text-[9px]">
          {count}
        </Badge>
      ) : null}
    </div>
  );
}

function CalendarRow({
  event,
  timeZone,
}: {
  event: LifeOpsCalendarEvent;
  timeZone: string;
}) {
  const timeLabel = formatEventTime(event, timeZone);
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {event.title}
        </span>
        {timeLabel ? (
          <Badge variant="secondary" className="text-[9px]">
            {timeLabel}
          </Badge>
        ) : null}
      </div>
      {event.location.trim().length > 0 ? (
        <div className="mt-1 truncate text-[11px] text-muted">
          {event.location}
        </div>
      ) : null}
    </div>
  );
}

function GmailRow({ message }: { message: LifeOpsGmailMessageSummary }) {
  const receivedLabel = formatReceivedAt(message.receivedAt);
  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {message.subject}
        </span>
        {message.likelyReplyNeeded ? (
          <Badge variant="secondary" className="text-[9px]">
            Reply
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 truncate text-[11px] text-muted">{message.from}</div>
      {message.snippet.trim().length > 0 ? (
        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
          {message.snippet}
        </div>
      ) : null}
      {receivedLabel ? (
        <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-muted/80">
          {receivedLabel}
        </div>
      ) : null}
    </div>
  );
}

export function GoogleSidebarWidget(_props: ChatSidebarWidgetProps) {
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const [status, setStatus] = useState<LifeOpsGoogleConnectorStatus | null>(
    null,
  );
  const [calendarFeed, setCalendarFeed] = useState<LifeOpsCalendarFeed | null>(
    null,
  );
  const [gmailFeed, setGmailFeed] = useState<LifeOpsGmailTriageFeed | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWidget = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const nextStatus = await client.getGoogleLifeOpsConnectorStatus();
        setStatus(nextStatus);

        const nextCapabilities = capabilitySet(nextStatus);
        if (!nextStatus.connected) {
          setCalendarFeed(null);
          setGmailFeed(null);
          setError(null);
          return;
        }

        const [calendarResult, gmailResult] = await Promise.all([
          nextCapabilities.has("google.calendar.read") ||
          nextCapabilities.has("google.calendar.write")
            ? client.getLifeOpsCalendarFeed({
                mode: nextStatus.mode,
                timeZone,
              })
            : Promise.resolve<LifeOpsCalendarFeed | null>(null),
          nextCapabilities.has("google.gmail.triage")
            ? client.getLifeOpsGmailTriage({
                mode: nextStatus.mode,
                maxResults: GOOGLE_WIDGET_MESSAGE_LIMIT,
              })
            : Promise.resolve<LifeOpsGmailTriageFeed | null>(null),
        ]);

        setCalendarFeed(calendarResult);
        setGmailFeed(gmailResult);
        setError(null);
      } catch (cause) {
        const message =
          cause instanceof Error && cause.message.trim().length > 0
            ? cause.message.trim()
            : "Google widget failed to refresh.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [timeZone],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadWidget();
    })();
    const intervalId = window.setInterval(() => {
      if (!active) {
        return;
      }
      void loadWidget(true);
    }, GOOGLE_WIDGET_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadWidget]);

  const onConnect = useCallback(async () => {
    try {
      setActionPending(true);
      const result = await client.startGoogleLifeOpsConnector({
        mode: status?.defaultMode,
      });
      await openExternalUrl(result.authUrl);
    } finally {
      setActionPending(false);
    }
  }, [status?.defaultMode]);

  const onDisconnect = useCallback(async () => {
    if (!status) {
      return;
    }
    try {
      setActionPending(true);
      const nextStatus = await client.disconnectGoogleLifeOpsConnector({
        mode: status.mode,
      });
      setStatus(nextStatus);
      setCalendarFeed(null);
      setGmailFeed(null);
      setError(null);
    } finally {
      setActionPending(false);
    }
  }, [status]);

  const capabilities = useMemo(() => capabilitySet(status), [status]);
  const identityLabel = readIdentityLabel(status?.identity ?? null);
  const showCalendar =
    status?.connected === true &&
    (capabilities.has("google.calendar.read") ||
      capabilities.has("google.calendar.write"));
  const showInbox =
    status?.connected === true && capabilities.has("google.gmail.triage");
  const calendarEvents = calendarFeed?.events ?? [];
  const gmailMessages = gmailFeed?.messages ?? [];

  return (
    <WidgetSection
      title="Google"
      icon={<Plug2 className="h-4 w-4" />}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || actionPending}
            onClick={() => void loadWidget()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={status?.connected ? "outline" : "default"}
            disabled={loading || actionPending}
            onClick={() =>
              void (status?.connected ? onDisconnect() : onConnect())
            }
          >
            {status?.connected
              ? "Disconnect"
              : status?.reason === "needs_reauth"
                ? "Reconnect"
                : "Connect"}
          </Button>
        </div>
      }
      testId="chat-widget-google"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
              {identityLabel.primary}
            </span>
            {status ? (
              <Badge variant="secondary" className="text-[9px]">
                {modeLabel(status.mode)}
              </Badge>
            ) : null}
            {status?.connected ? (
              <Badge variant="secondary" className="text-[9px]">
                Connected
              </Badge>
            ) : null}
          </div>
          {identityLabel.secondary ? (
            <div className="mt-1 truncate text-[11px] text-muted">
              {identityLabel.secondary}
            </div>
          ) : null}
          {status?.connected ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(capabilities.has("google.calendar.read") ||
                capabilities.has("google.calendar.write")) && (
                <Badge variant="secondary" className="text-[9px]">
                  Calendar
                </Badge>
              )}
              {capabilities.has("google.gmail.triage") ? (
                <Badge variant="secondary" className="text-[9px]">
                  Gmail
                </Badge>
              ) : null}
              {capabilities.has("google.gmail.send") ? (
                <Badge variant="secondary" className="text-[9px]">
                  Send
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-muted">
              {loading ? "Loading" : "Disconnected"}
            </div>
          )}
        </div>

        {showCalendar ? (
          <div className="flex flex-col gap-2">
            <SectionHeading
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              title="Calendar"
              count={calendarEvents.length}
            />
            {calendarEvents.length === 0 ? (
              <div className="px-0.5 text-[11px] text-muted">
                No upcoming events
              </div>
            ) : (
              calendarEvents
                .slice(0, GOOGLE_WIDGET_EVENT_LIMIT)
                .map((event) => (
                  <CalendarRow
                    key={event.id}
                    event={event}
                    timeZone={timeZone}
                  />
                ))
            )}
          </div>
        ) : null}

        {showInbox ? (
          <div className="flex flex-col gap-2">
            <SectionHeading
              icon={<Mail className="h-3.5 w-3.5" />}
              title="Inbox"
              count={
                gmailFeed?.summary.likelyReplyNeededCount ??
                gmailMessages.length
              }
            />
            {gmailMessages.length === 0 ? (
              <div className="px-0.5 text-[11px] text-muted">
                No priority mail
              </div>
            ) : (
              gmailMessages
                .slice(0, GOOGLE_WIDGET_MESSAGE_LIMIT)
                .map((message) => (
                  <GmailRow key={message.id} message={message} />
                ))
            )}
          </div>
        ) : null}

        {error ? <div className="text-[11px] text-danger">{error}</div> : null}
      </div>
    </WidgetSection>
  );
}

export const LIFEOPS_WIDGETS: ChatSidebarWidgetDefinition[] = [
  {
    id: "lifeops.google",
    pluginId: "lifeops",
    order: 150,
    defaultEnabled: true,
    Component: GoogleSidebarWidget,
  },
];
