import type {
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsConnectorMode,
  LifeOpsConnectorSide,
  LifeOpsGmailMessageSummary,
  LifeOpsGmailTriageFeed,
  LifeOpsGoogleCapability,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import { Badge, Button } from "@miladyai/ui";
import { CalendarDays, Mail, Plug2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { client } from "../../../../api";
import { useGoogleLifeOpsConnector } from "../../../../hooks";
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

type GoogleConnectorController = ReturnType<typeof useGoogleLifeOpsConnector>;

function sideLabel(side: LifeOpsConnectorSide): string {
  return side === "owner" ? "Owner" : "Agent";
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

function GoogleAccountCard({
  connector,
  side,
}: {
  connector: GoogleConnectorController;
  side: LifeOpsConnectorSide;
}) {
  const {
    activeMode,
    actionPending,
    connect,
    disconnect,
    loading,
    modeOptions,
    refresh,
    selectMode,
    status,
  } = connector;
  const capabilities = capabilitySet(status);
  const identityLabel = readIdentityLabel(status?.identity ?? null);

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[9px]">
          {sideLabel(side)}
        </Badge>
        {status?.preferredByAgent ? (
          <Badge variant="secondary" className="text-[9px]">
            Default
          </Badge>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">
          {identityLabel.primary}
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {modeLabel(activeMode)}
        </Badge>
      </div>
      {identityLabel.secondary ? (
        <div className="mt-1 truncate text-[11px] text-muted">
          {identityLabel.secondary}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {status?.connected ? (
          <>
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
            {!status.preferredByAgent ? (
              <Button
                size="sm"
                variant="outline"
                disabled={loading || actionPending}
                onClick={() => void selectMode(activeMode)}
                aria-label={`Use ${sideLabel(side)} Google connector by default`}
              >
                Use by default
              </Button>
            ) : null}
          </>
        ) : (
          <div className="text-[11px] text-muted">
            {loading ? "Loading" : "Disconnected"}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {modeOptions.map((mode) => {
          const isActive = activeMode === mode;
          return (
            <Button
              key={mode}
              size="sm"
              variant={isActive ? "default" : "outline"}
              disabled={loading || actionPending}
              onClick={() => void selectMode(mode)}
              aria-label={`${sideLabel(side)} ${modeLabel(mode)} mode`}
            >
              {modeLabel(mode)}
            </Button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || actionPending}
          onClick={() => void refresh()}
          aria-label={`Refresh ${sideLabel(side)} Google connector`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={status?.connected ? "outline" : "default"}
          disabled={loading || actionPending}
          onClick={() => void (status?.connected ? disconnect() : connect())}
          aria-label={`${status?.connected ? "Disconnect" : status?.reason === "needs_reauth" ? "Reconnect" : "Connect"} ${sideLabel(side)} Google connector`}
        >
          {status?.connected
            ? "Disconnect"
            : status?.reason === "needs_reauth"
              ? "Reconnect"
              : "Connect"}
        </Button>
      </div>
    </div>
  );
}

export function GoogleSidebarWidget(_props: ChatSidebarWidgetProps) {
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const ownerConnector = useGoogleLifeOpsConnector({
    side: "owner",
    pollIntervalMs: GOOGLE_WIDGET_REFRESH_INTERVAL_MS,
  });
  const agentConnector = useGoogleLifeOpsConnector({
    side: "agent",
    pollIntervalMs: GOOGLE_WIDGET_REFRESH_INTERVAL_MS,
  });
  const [calendarFeed, setCalendarFeed] = useState<LifeOpsCalendarFeed | null>(
    null,
  );
  const [gmailFeed, setGmailFeed] = useState<LifeOpsGmailTriageFeed | null>(
    null,
  );
  const [feedError, setFeedError] = useState<string | null>(null);
  const dataConnector = useMemo(() => {
    const connectors = [ownerConnector, agentConnector];
    return (
      connectors.find(
        (connector) =>
          connector.status?.connected === true &&
          connector.status.preferredByAgent,
      ) ??
      connectors.find((connector) => connector.status?.connected === true) ??
      null
    );
  }, [agentConnector, ownerConnector]);
  const dataStatus = dataConnector?.status ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!dataStatus?.connected) {
        setCalendarFeed(null);
        setGmailFeed(null);
        setFeedError(null);
        return;
      }

      try {
        const nextCapabilities = capabilitySet(dataStatus);
        const [calendarResult, gmailResult] = await Promise.all([
          nextCapabilities.has("google.calendar.read") ||
          nextCapabilities.has("google.calendar.write")
            ? client.getLifeOpsCalendarFeed({
                mode: dataStatus.mode,
                timeZone,
              })
            : Promise.resolve<LifeOpsCalendarFeed | null>(null),
          nextCapabilities.has("google.gmail.triage")
            ? client.getLifeOpsGmailTriage({
                mode: dataStatus.mode,
                maxResults: GOOGLE_WIDGET_MESSAGE_LIMIT,
              })
            : Promise.resolve<LifeOpsGmailTriageFeed | null>(null),
        ]);
        if (!active) {
          return;
        }
        setCalendarFeed(calendarResult);
        setGmailFeed(gmailResult);
        setFeedError(null);
      } catch (cause) {
        if (!active) {
          return;
        }
        setFeedError(
          cause instanceof Error && cause.message.trim().length > 0
            ? cause.message.trim()
            : "Google widget feeds failed to refresh.",
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [dataStatus, timeZone]);

  const capabilities = useMemo(() => capabilitySet(dataStatus), [dataStatus]);
  const showCalendar =
    dataStatus?.connected === true &&
    (capabilities.has("google.calendar.read") ||
      capabilities.has("google.calendar.write"));
  const showInbox =
    dataStatus?.connected === true && capabilities.has("google.gmail.triage");
  const calendarEvents = calendarFeed?.events ?? [];
  const gmailMessages = gmailFeed?.messages ?? [];
  const connectorError =
    ownerConnector.error ?? agentConnector.error ?? feedError ?? null;

  return (
    <WidgetSection
      title="Google"
      icon={<Plug2 className="h-4 w-4" />}
      testId="chat-widget-google"
    >
      <div className="flex flex-col gap-4">
        <GoogleAccountCard connector={ownerConnector} side="owner" />
        <GoogleAccountCard connector={agentConnector} side="agent" />

        {showCalendar ? (
          <div className="flex flex-col gap-2">
            <SectionHeading
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              title={`Calendar (${sideLabel(dataStatus?.side ?? "owner")})`}
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
              title={`Inbox (${sideLabel(dataStatus?.side ?? "owner")})`}
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

        {connectorError ? (
          <div className="text-[11px] text-danger">{connectorError}</div>
        ) : null}
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
