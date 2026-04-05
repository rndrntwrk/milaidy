/**
 * InboxView — unified cross-channel inbox.
 *
 * Renders every inbound message the agent has received across every
 * connector plugin (iMessage, Telegram, Discord, WhatsApp, WeChat,
 * Slack, Signal, SMS) as a single time-ordered feed, backed by the
 * `/api/inbox/messages` read-side aggregator in
 * packages/agent/src/api/inbox-routes.ts.
 *
 * This view is **read-only by design**. Responding to messages still
 * flows through each connector's own send path — the inbox is for
 * triage and visibility, not for drafting outbound replies from a room
 * that isn't the one they belong to. A future iteration can add a
 * "jump to conversation" affordance that routes to the connector-
 * specific reply surface, but for a first cut "see everything in one
 * place" is already the big unlock.
 *
 * Architecture note: messages are rendered through the same
 * ChatTranscript + ChatMessage primitives the dashboard chat uses, so
 * the source-colored bubble borders added in
 * packages/ui/src/components/composites/chat/chat-bubble.tsx light up
 * automatically — no per-source styling lives in this file.
 */

import type { ConversationMessage } from "@miladyai/app-core/api";
import { client } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { ChatTranscript } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageContent } from "../chat/MessageContent";

/**
 * Inbox message shape returned by the server. Extends the standard
 * ConversationMessage with the roomId (for future jump-to-conversation)
 * and makes `source` required so TypeScript won't let us forget to
 * render the channel label.
 */
type InboxMessage = ConversationMessage & {
  roomId: string;
  source: string;
};

/**
 * How often the inbox refetches while the tab is open. Inbound
 * connector messages are already persisted to memory by the plugin's
 * polling loop; we just need to pick up the new writes. A 5s cadence
 * keeps the feed lively without hammering the API, and is slow enough
 * that the server's cross-room merge (up to 200 rooms) stays cheap.
 */
const INBOX_REFRESH_INTERVAL_MS = 5_000;

/**
 * Upper bound on messages we fetch per poll. The backend caps at 500;
 * 200 is comfortable for "recent activity across all channels" and
 * keeps the transcript DOM bounded.
 */
const INBOX_PAGE_SIZE = 200;

/**
 * Chip list label + filter key for cross-channel source filtering. We
 * keep the set static rather than reading from `/api/inbox/sources`
 * on mount because (a) the server's source set is itself a small
 * hardcoded list in inbox-routes.ts DEFAULT_INBOX_SOURCES, and (b) a
 * static list means the chip row renders at first paint with no
 * extra round-trip and no flash of empty state. When a new connector
 * is added, update both lists.
 */
const SOURCE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "imessage", label: "iMessage" },
  { key: "telegram", label: "Telegram" },
  { key: "discord", label: "Discord" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "wechat", label: "WeChat" },
  { key: "slack", label: "Slack" },
  { key: "signal", label: "Signal" },
  { key: "sms", label: "SMS" },
];

/**
 * Pill-style filter chip. Active chips use the accent border; inactive
 * chips use the neutral border. Click toggles that source in/out of
 * the filter set. An empty filter set means "show everything" (same
 * semantics as omitting the `sources` query param).
 */
function SourceFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border/50 bg-bg-hover text-muted-strong hover:border-border hover:text-txt"
      }`}
      data-active={active}
    >
      {label}
    </button>
  );
}

export function InboxView() {
  const { t } = useApp();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Selected source filter keys. Empty set == no filter (show all).
  const [activeSources, setActiveSources] = useState<Set<string>>(
    () => new Set(),
  );

  /**
   * Fetch the inbox once. Kept as a stable callback so the polling
   * effect can reuse it without re-creating the interval every tick.
   * Errors surface as a small banner but don't clear the existing
   * messages — a transient failure shouldn't blank the feed.
   */
  const loadInbox = useCallback(async () => {
    try {
      const response = await client.getInboxMessages({
        limit: INBOX_PAGE_SIZE,
        sources: activeSources.size > 0 ? Array.from(activeSources) : undefined,
      });
      setMessages(response.messages as InboxMessage[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeSources]);

  // Initial load + refilter whenever the active source set changes.
  useEffect(() => {
    setLoading(true);
    void loadInbox();
  }, [loadInbox]);

  // Background refresh. Only ticks while the tab is mounted; unmounting
  // clears the interval so inactive tabs don't keep polling.
  useEffect(() => {
    const id = window.setInterval(() => {
      void loadInbox();
    }, INBOX_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadInbox]);

  const toggleSource = useCallback((key: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveSources(new Set());
  }, []);

  /**
   * ChatTranscript expects messages ordered oldest→newest (typical
   * conversation layout, newest at the bottom). The server returns
   * newest first for the "most recent across all channels" semantics,
   * so we reverse before rendering.
   */
  const orderedMessages = useMemo(
    () => [...messages].reverse(),
    [messages],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Header: title + filter chip row ───────────────────────── */}
      <div className="border-b border-border/50 bg-card/40 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-txt">
              {t("inboxview.Title", { defaultValue: "Inbox" })}
            </h1>
            <p className="mt-0.5 text-[11px] text-muted">
              {t("inboxview.Subtitle", {
                defaultValue:
                  "Unified feed from every connector the agent is listening on.",
              })}
            </p>
          </div>
          {activeSources.size > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold text-muted-strong hover:text-txt"
            >
              {t("inboxview.ClearFilters", { defaultValue: "Clear filters" })}
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((filter) => (
            <SourceFilterChip
              key={filter.key}
              label={filter.label}
              active={activeSources.has(filter.key)}
              onClick={() => toggleSource(filter.key)}
            />
          ))}
        </div>
      </div>

      {/* ── Body: transcript, loading state, or error ─────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
            {t("inboxview.LoadError", {
              defaultValue: "Failed to load inbox: {{message}}",
              message: error,
            })}
          </div>
        ) : null}

        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            {t("inboxview.Loading", { defaultValue: "Loading inbox..." })}
          </div>
        ) : orderedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="text-sm font-semibold text-txt">
              {t("inboxview.EmptyTitle", {
                defaultValue: "No inbound messages yet",
              })}
            </div>
            <div className="max-w-sm text-[11px] leading-5 text-muted">
              {t("inboxview.EmptyBody", {
                defaultValue:
                  "Enable a connector (iMessage, Telegram, Discord, etc.) and new inbound messages will appear here in real time.",
              })}
            </div>
          </div>
        ) : (
          <ChatTranscript
            messages={orderedMessages}
            renderMessageContent={(message) => (
              <MessageContent message={message as ConversationMessage} />
            )}
          />
        )}
      </div>
    </div>
  );
}
