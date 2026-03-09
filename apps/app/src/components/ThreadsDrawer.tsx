import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { DrawerShell } from "./DrawerShell.js";
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
        description="Full transcript, switching, and thread management stay here instead of on the stage."
        badge={`${sortedConversations.length} threads`}
        onClose={onClose}
        toolbar={
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center rounded-2xl"
            onClick={() => {
              void handleNewConversation();
              onClose();
            }}
          >
            <PlusIcon className="h-4 w-4" />
            New Thread
          </Button>
        }
        summary={
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/48">
            <span>Recent first</span>
            <span>{unreadConversations.size} unread</span>
          </div>
        }
        contentClassName="space-y-3"
      >
        {sortedConversations.length === 0 ? (
          <Card className="rounded-2xl px-4 py-4 text-center text-sm text-white/56">
            No conversations yet.
          </Card>
        ) : (
          sortedConversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            const unread = unreadConversations.has(conversation.id);
            return (
              <Card
                key={conversation.id}
                className={`rounded-2xl p-3 ${isActive ? "border-white/18 bg-white/[0.08]" : "border-white/10 bg-white/[0.04]"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 bg-transparent text-left"
                    onClick={() => {
                      void handleSelectConversation(conversation.id);
                      onClose();
                    }}
                  >
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-white/18"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white/88">
                        {conversation.title}
                      </div>
                      <div className="mt-1 text-xs text-white/48">
                        {formatRelativeTime(conversation.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-2xl text-white/55 hover:text-danger"
                    onClick={() => void handleDeleteConversation(conversation.id)}
                    title="Delete thread"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </DrawerShell>
    </Sheet>
  );
}
