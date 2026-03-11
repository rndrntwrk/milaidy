import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { DrawerShell } from "./DrawerShell.js";
import { ListItemCard } from "./ListItemCard.js";
import { SectionEmptyState } from "./SectionStates.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Sheet } from "./ui/Sheet.js";
import {
  PlusIcon,
  ThreadsIcon,
  TrashIcon,
} from "./ui/Icons.js";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ThreadsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    conversations,
    activeConversationId,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
  } = useApp();

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [conversations],
  );

  return (
    <Sheet open={open} onClose={onClose} side="left" className="w-[min(32rem,100vw)]">
      <DrawerShell
        icon={<ThreadsIcon className="h-4 w-4" />}
        title="Threads"
        description="Conversation history."
        onClose={onClose}
        contentClassName="space-y-4"
      >
        {sortedConversations.length === 0 ? (
          <SectionEmptyState
            title="No threads yet"
            description="Start a conversation and it will appear here for quick switching."
            className="border-none bg-transparent shadow-none"
          />
        ) : (
          <Card className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-5">
              <div className="min-w-0 space-y-1">
                <h3 className="text-xl font-semibold tracking-[-0.01em] text-white">Recent threads</h3>
                <p className="text-sm text-white/58">Jump back into a conversation or start a new one.</p>
              </div>
              <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/56">
                {sortedConversations.length} total
                {unreadConversations.size > 0 ? ` • ${unreadConversations.size} unread` : ""}
              </div>
            </div>

            <div className="border-b border-white/8 px-5 py-5">
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full justify-start rounded-2xl px-4 text-sm"
                onClick={() => {
                  void handleNewConversation();
                  onClose();
                }}
              >
                <PlusIcon className="h-4 w-4" />
                New Thread
              </Button>
            </div>

            <div className="space-y-3 px-5 py-5">
              <div className="flex items-center justify-between text-sm text-white/46">
                <span>Most recent first</span>
                <span>{unreadConversations.size > 0 ? `${unreadConversations.size} unread` : "All caught up"}</span>
              </div>
              {sortedConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                const unread = unreadConversations.has(conversation.id);
                return (
                  <ListItemCard
                    key={conversation.id}
                    title={conversation.title}
                    meta={formatRelativeTime(conversation.updatedAt)}
                    active={isActive}
                    unread={unread}
                    onClick={() => {
                      void handleSelectConversation(conversation.id);
                      onClose();
                    }}
                    trailing={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${conversation.title}`}
                        className="h-10 w-10 rounded-full text-white/56 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`Delete thread "${conversation.title}"?`)) {
                            void handleDeleteConversation(conversation.id);
                          }
                        }}
                        title="Delete thread"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    }
                  />
                );
              })}
            </div>
          </Card>
        )}
      </DrawerShell>
    </Sheet>
  );
}
