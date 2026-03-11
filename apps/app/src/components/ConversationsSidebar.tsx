/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { Badge } from "./ui/Badge.js";
import { CloseIcon, PlusIcon } from "./ui/Icons.js";

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

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

export function ConversationsSidebar({
  mobile = false,
  onClose,
}: ConversationsSidebarProps) {
  const {
    conversations,
    activeConversationId,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  const handleDoubleClick = (conv: { id: string; title: string }) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleEditSubmit = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== conversations.find((c) => c.id === id)?.title) {
      await handleRenameConversation(id, trimmed);
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingTitle("");
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

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleEditSubmit(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  };

  return (
    <aside className="hidden min-w-60 w-60 flex-col overflow-y-auto border-r border-white/10 bg-[#06080d] text-[13px] md:flex" data-testid="conversations-sidebar" role="complementary" aria-label="Conversations">
      <div className="border-b border-white/10 p-3">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="w-full rounded-xl"
          onClick={() => {
            handleNewConversation();
            onClose?.();
          }}
        >
          <PlusIcon className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1" aria-label="Conversation list">
        {sortedConversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-white/42">
            No conversations yet
          </div>
        ) : (
          sortedConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                data-testid="conv-item"
                data-active={isActive || undefined}
                className={`group flex items-center gap-2 border-l-[3px] px-3 py-2 transition-colors ${
                  isActive ? "border-l-accent bg-white/[0.05]" : "border-l-transparent hover:bg-white/[0.03]"
                } group`}
              >
                {isEditing ? (
                  <Input
                    ref={inputRef}
                    className="w-full rounded-xl"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => void handleEditSubmit(conv.id)}
                    onKeyDown={(e) => handleEditKeyDown(e, conv.id)}
                    aria-label="Rename conversation"
                  />
                ) : (
                  <>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent p-0 text-left cursor-pointer"
                      onClick={() => void handleSelectConversation(conv.id)}
                      onDoubleClick={() => handleDoubleClick(conv)}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`${conv.title}${unreadConversations.has(conv.id) ? " (unread)" : ""}`}
                    >
                      {unreadConversations.has(conv.id) && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-white">{conv.title}</div>
                        <div className="mt-0.5 text-[11px] text-white/42">{formatRelativeTime(conv.updatedAt)}</div>
                      </div>
                    </button>
                    {confirmDeleteId === conv.id ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="danger" className="rounded-full px-2 py-0.5 text-[10px]">
                          Delete?
                        </Badge>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="rounded-xl px-2 text-[10px]"
                          onClick={() => void handleConfirmDelete(conv.id)}
                          disabled={deletingId === conv.id}
                        >
                          {deletingId === conv.id ? "..." : "Yes"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl px-2 text-[10px]"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === conv.id}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        data-testid="conv-delete"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(conv.id);
                        }}
                        aria-label={`Delete ${conv.title}`}
                      >
                        <CloseIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
