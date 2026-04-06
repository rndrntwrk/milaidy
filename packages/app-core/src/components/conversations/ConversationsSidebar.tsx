import {
  ChatSidebar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipProvider,
} from "@miladyai/ui";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { client } from "../../api";
import { useApp } from "../../state";
import { ConversationRenameDialog } from "./ConversationRenameDialog";
import {
  formatRelativeTime,
  getLocalizedConversationTitle,
} from "./conversation-utils";

/**
 * Id namespace for inbox-chat entries merged into the sidebar list.
 * ChatSidebar's onSelect returns a flat string id; we prefix connector
 * chats with this so the select handler can route them to the inbox
 * state slot instead of handleSelectConversation. Dashboard
 * conversation ids stay bare (they're UUIDs, so no collision risk).
 */
const INBOX_ID_PREFIX = "inbox:";

/** How often the inbox chat list refreshes while the sidebar is open. */
const INBOX_CHATS_REFRESH_MS = 5_000;

interface InboxChatRow {
  id: string;
  source: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: number;
}

type ConversationsSidebarVariant = "default" | "game-modal";

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  variant?: ConversationsSidebarVariant;
}

export function ConversationsSidebar({
  mobile = false,
  onClose,
  variant = "default",
}: ConversationsSidebarProps) {
  const {
    conversations,
    activeConversationId,
    activeInboxChat,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    setState,
    t,
  } = useApp();

  // ── Inbox chats (connector threads) ─────────────────────────────────
  //
  // Fetch the list of connector chat threads in parallel with the
  // existing web-chat conversations and merge them into one list. The
  // existing ChatSidebar primitive takes a flat `conversations` prop,
  // so we prefix connector-chat ids with "inbox:" to tell them apart
  // in onSelect. Dashboard conversation ids are raw UUIDs, so there's
  // no collision.
  const [inboxChats, setInboxChats] = useState<InboxChatRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await client.getInboxChats();
        if (cancelled) return;
        setInboxChats(
          response.chats.map((chat) => ({
            id: chat.id,
            source: chat.source,
            title: chat.title,
            lastMessageText: chat.lastMessageText,
            lastMessageAt: chat.lastMessageAt,
          })),
        );
      } catch {
        // Network blips shouldn't blank the list — keep the last
        // successful snapshot and let the next poll refresh it.
      }
    };
    void load();
    const timer = window.setInterval(load, INBOX_CHATS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuConversation, setMenuConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedConversations = useMemo(() => {
    // Normalize dashboard conversations to the sidebar row shape. We
    // tag these with source "milady" so the ChatConversationItem
    // primitive renders a gold Milady chip — giving every row in the
    // unified sidebar a clear channel indicator, so users never have
    // to guess whether a thread is a native dashboard conversation
    // or a connector chat.
    const webChatRows = conversations.map((conversation) => ({
      id: conversation.id,
      title: getLocalizedConversationTitle(conversation.title, t),
      source: "milady",
      updatedAtLabel: formatRelativeTime(conversation.updatedAt, t),
      sortKey: new Date(conversation.updatedAt).getTime(),
    }));

    // Normalize connector chats. The `source` field drives the colored
    // channel chip rendered by ChatConversationItem — no need to embed
    // a [Source] prefix in the title since the primitive now has a
    // real slot for it.
    const inboxRows = inboxChats.map((chat) => {
      const isoDate = new Date(chat.lastMessageAt).toISOString();
      return {
        id: `${INBOX_ID_PREFIX}${chat.id}`,
        title: chat.title,
        source: chat.source,
        updatedAtLabel: formatRelativeTime(isoDate, t),
        sortKey: chat.lastMessageAt,
      };
    });

    // Merge and sort by most-recent-activity across both sources so
    // the sidebar is a single time-ordered feed.
    return [...webChatRows, ...inboxRows]
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ sortKey: _sortKey, ...row }) => row);
  }, [conversations, inboxChats, t]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const visibleConversations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return sortedConversations;
    }

    return sortedConversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, sortedConversations]);

  const openRenameDialog = (conversation: { id: string; title: string }) => {
    setConfirmDeleteId(null);
    setMenuConversation(null);
    setRenameTarget({ id: conversation.id, title: conversation.title });
  };

  const openActionsMenu = (
    event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
    conversation: { id: string; title: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDeleteId(null);
    setMenuConversation(conversation);
    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      setMenuPosition({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
      return;
    }
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleConfirmDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await handleDeleteConversation(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId((current) => (current === id ? null : current));
    }
  };

  return (
    <TooltipProvider delayDuration={280} skipDelayDuration={120}>
      <ConversationRenameDialog
        open={renameTarget !== null}
        conversationId={renameTarget?.id ?? null}
        initialTitle={renameTarget?.title ?? ""}
        onClose={() => setRenameTarget(null)}
      />

      <DropdownMenu
        open={menuConversation !== null}
        onOpenChange={(open) => {
          if (!open) setMenuConversation(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <div
            ref={menuAnchorRef}
            aria-hidden
            className="fixed h-0 w-0 pointer-events-none"
            style={{
              left: menuPosition.x,
              top: menuPosition.y,
            }}
          />
        </DropdownMenuTrigger>
        {menuConversation ? (
          <DropdownMenuContent
            sideOffset={6}
            align="start"
            className="w-40"
            onCloseAutoFocus={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerDownOutside={() => setMenuConversation(null)}
            onInteractOutside={() => setMenuConversation(null)}
            avoidCollisions
            collisionPadding={12}
          >
            <DropdownMenuItem
              data-testid="conv-menu-edit"
              onClick={() => {
                if (!menuConversation) return;
                openRenameDialog(menuConversation);
              }}
            >
              {t("conversations.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="conv-menu-delete"
              className="text-danger focus:text-danger"
              onClick={() => {
                if (!menuConversation) return;
                setRenameTarget(null);
                setConfirmDeleteId(menuConversation.id);
                setMenuConversation(null);
              }}
            >
              {t("conversations.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>

      <ChatSidebar
        conversations={visibleConversations}
        activeConversationId={
          activeInboxChat
            ? `${INBOX_ID_PREFIX}${activeInboxChat.id}`
            : activeConversationId
        }
        confirmDeleteId={confirmDeleteId}
        deletingId={deletingId}
        unreadConversations={unreadConversations}
        mobile={mobile}
        variant={variant}
        labels={{
          chats: t("conversations.chats"),
          clearSearch: t("common.clear", { defaultValue: "Clear" }),
          closePanel: t("conversations.closePanel"),
          delete: t("conversations.delete"),
          deleteConfirm: t("conversations.deleteConfirm"),
          deleteNo: t("conversations.deleteNo"),
          deleteYes: t("conversations.deleteYes"),
          expandChatsPanel: t("aria.expandChatsPanel"),
          newChat: t("conversations.newChat"),
          none: t("conversations.none"),
          noMatchingChats: t("conversations.noMatchingChats", {
            defaultValue: "No matching chats",
          }),
          rename: t("conversations.rename"),
          searchChats: t("conversations.searchChats", {
            defaultValue: "Search chats",
          }),
        }}
        onCreate={() => {
          handleNewConversation();
          onClose?.();
        }}
        onSelect={(id) => {
          setConfirmDeleteId(null);
          setMenuConversation(null);
          // Connector-chat rows carry an "inbox:" prefix on their id.
          // Route them through the activeInboxChat slot so ChatView
          // can swap its main panel out for a read-only inbox view of
          // that room. Dashboard conversations take the existing path.
          if (id.startsWith(INBOX_ID_PREFIX)) {
            const roomId = id.slice(INBOX_ID_PREFIX.length);
            const chat = inboxChats.find((c) => c.id === roomId);
            if (chat) {
              setState("activeInboxChat", {
                id: chat.id,
                source: chat.source,
                title: chat.title,
              });
            }
          } else {
            setState("activeInboxChat", null);
            void handleSelectConversation(id);
          }
          onClose?.();
        }}
        onConfirmDelete={(id) => {
          // Inbox chats are read-only views of connector memory — the
          // sidebar can't delete them. Silently drop the request
          // rather than throwing a 4xx at the server.
          if (id.startsWith(INBOX_ID_PREFIX)) {
            setConfirmDeleteId(null);
            return;
          }
          void handleConfirmDelete(id);
        }}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onRequestDeleteConfirm={(id) => {
          if (id.startsWith(INBOX_ID_PREFIX)) return;
          setMenuConversation(null);
          setRenameTarget(null);
          setConfirmDeleteId(id);
        }}
        onRequestRename={(conversation) => {
          if (conversation.id.startsWith(INBOX_ID_PREFIX)) return;
          openRenameDialog(conversation);
        }}
        onOpenActions={(event, conversation) => {
          if (conversation.id.startsWith(INBOX_ID_PREFIX)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          openActionsMenu(event, conversation);
        }}
        onSearchChange={(event) => setSearchQuery(event.target.value)}
        onSearchClear={() => setSearchQuery("")}
        onClose={onClose}
        searchValue={searchQuery}
      />
    </TooltipProvider>
  );
}
