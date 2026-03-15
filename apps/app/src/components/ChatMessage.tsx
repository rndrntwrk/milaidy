/**
 * Enhanced chat message component with actions and better UX.
 */

import type { ConversationMessage } from "@milady/app-core/api";
import { useTimeout } from "@milady/app-core/hooks";
import { useApp } from "@milady/app-core/state";
import { Button } from "@milady/ui";
import { Check, Copy, Pencil, RefreshCw, Trash2, Volume2 } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MessageContent } from "./MessageContent";

interface ChatMessageProps {
  message: ConversationMessage;
  isGrouped?: boolean;
  agentName?: string;
  agentAvatarSrc?: string | null;
  onCopy?: (text: string) => void;
  onSpeak?: (messageId: string, text: string) => void;
  onEdit?: (messageId: string, text: string) => Promise<boolean> | boolean;
  onRetry?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

export function ChatMessage({
  message,
  isGrouped = false,
  agentName = "Agent",
  onCopy,
  onSpeak,
  onEdit,
  onRetry,
  onDelete,
}: ChatMessageProps) {
  const { setTimeout } = useTimeout();

  const { copyToClipboard, t } = useApp();
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);
  const [savingEdit, setSavingEdit] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isUser = message.role === "user";
  const canEdit =
    isUser &&
    typeof onEdit === "function" &&
    message.source !== "local_command" &&
    !message.id.startsWith("temp-");
  const canPlay = !isUser && typeof onSpeak === "function" && message.text.trim();

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy(message.text);
    } else {
      void copyToClipboard(message.text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyToClipboard, message.text, onCopy, setTimeout]);

  const handleStartEditing = useCallback(() => {
    if (!canEdit || savingEdit) return;
    setDraftText(message.text);
    setIsEditing(true);
  }, [canEdit, message.text, savingEdit]);

  const handleCancelEditing = useCallback(() => {
    if (savingEdit) return;
    setDraftText(message.text);
    setIsEditing(false);
  }, [message.text, savingEdit]);

  const handleSaveEdit = useCallback(async () => {
    if (!onEdit) return;
    const nextText = draftText.trim();
    if (!nextText) return;
    if (nextText === message.text.trim()) {
      setDraftText(message.text);
      setIsEditing(false);
      return;
    }

    setSavingEdit(true);
    const saved = await onEdit(message.id, nextText);
    setSavingEdit(false);
    if (saved !== false) {
      setIsEditing(false);
    }
  }, [draftText, message.id, message.text, onEdit]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelEditing();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSaveEdit();
      }
    },
    [handleCancelEditing, handleSaveEdit],
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftText(message.text);
      return;
    }
    const textarea = editTextareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing, message.text]);

  return (
    <article
      className={`flex items-start gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"} ${isGrouped ? "mt-1" : "mt-4"}`}
      data-testid="chat-message"
      data-role={message.role}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      aria-label={`${isUser ? "Your" : agentName} message`}
    >
      {/* Message Bubble */}
      <div
        className={`max-w-[88%] sm:max-w-[80%] min-w-0 ${isUser ? "mr-1" : ""}`}
      >
        {/* Message Content */}
        <div
          className={`relative group px-4 py-2.5 text-[15px] leading-[1.7] whitespace-pre-wrap break-words rounded-2xl ${
            isUser
              ? "bg-accent text-accent-fg rounded-br-md"
              : "bg-bg-accent border border-border text-txt rounded-bl-md"
          }`}
          style={{ fontFamily: "var(--font-chat)" }}
        >
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                ref={editTextareaRef}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full min-h-[110px] rounded-xl border border-white/20 bg-black/10 px-3 py-2 text-[15px] leading-[1.7] text-inherit outline-none focus:border-white/40"
                style={{ fontFamily: "var(--font-chat)" }}
                aria-label="Edit message"
                disabled={savingEdit}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditing}
                  disabled={savingEdit}
                  className="h-8 px-3 text-xs text-inherit/80 hover:bg-black/10"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveEdit()}
                  disabled={
                    savingEdit ||
                    !draftText.trim() ||
                    draftText.trim() === message.text.trim()
                  }
                  className="h-8 px-3 text-xs border-white/25 bg-black/10 hover:bg-black/15"
                >
                  {savingEdit ? "Saving..." : "Save and resend"}
                </Button>
              </div>
            </div>
          ) : (
            <MessageContent message={message} />
          )}

          {/* Stream interruption indicator */}
          {!isUser && message.interrupted && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-danger/30">
              <span className="text-xs text-danger">
                {t("chatmessage.ResponseInterrupte")}
              </span>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(message.id)}
                  className="flex items-center gap-1 px-2 py-0.5 h-6 text-xs text-danger border-danger/40 rounded hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />

                  {t("common.retry")}
                </Button>
              )}
            </div>
          )}

          {/* Message Actions (on hover) */}
          {!isEditing && (
            <div
              className={`absolute ${isUser ? "left-0 -translate-x-full" : "right-0 translate-x-full"} top-0 flex items-center gap-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${showActions ? "opacity-100" : ""}`}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="w-7 h-7 rounded-md text-muted hover:text-txt hover:bg-bg-hover transition-colors"
                title={copied ? "Copied!" : "Copy message"}
                aria-label={copied ? "Copied to clipboard" : "Copy message"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-ok" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>

              {canPlay && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSpeak?.(message.id, message.text)}
                  className="w-7 h-7 rounded-md text-muted hover:text-txt hover:bg-bg-hover transition-colors"
                  title="Play message"
                  aria-label="Play message"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </Button>
              )}

              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartEditing}
                  className="w-7 h-7 rounded-md text-muted hover:text-txt hover:bg-bg-hover transition-colors"
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}

              {!isUser && onRetry && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRetry(message.id)}
                  className="w-7 h-7 rounded-md text-muted hover:text-txt hover:bg-bg-hover transition-colors"
                  title={t("chatmessage.RetryMessage")}
                  aria-label="Retry message"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}

              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(message.id)}
                  className="w-7 h-7 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  title={t("chatmessage.DeleteMessage")}
                  aria-label="Delete message"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Typing Indicator ────────────────────────────────────────────────── */

export function TypingIndicator({
  agentName,
  agentAvatarSrc,
}: {
  agentName: string;
  agentAvatarSrc?: string | null;
}) {
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="flex items-start gap-2 sm:gap-3 mt-4">
      <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover shadow-sm">
        {agentAvatarSrc ? (
          <img
            src={agentAvatarSrc}
            alt={`${agentName} avatar`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-txt bg-accent-subtle">
            {agentInitial}
          </div>
        )}
      </div>

      <div className="max-w-[88%] sm:max-w-[80%] min-w-0">
        <div className="text-[12px] font-semibold text-txt mb-1">
          {agentName}
        </div>
        <div className="px-4 py-3 bg-bg-accent border border-border rounded-2xl rounded-bl-md">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────────────── */

export function ChatEmptyState({ agentName }: { agentName: string }) {
  const { t } = useApp();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-accent-subtle flex items-center justify-center mb-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-txt"
          aria-label="Chat icon"
        >
          <title>{t("nav.chat")}</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-txt-strong mb-2">
        {t("chatmessage.StartAConversation")}
      </h3>
      <p
        className="text-sm text-muted max-w-sm mb-6"
        style={{ fontFamily: "var(--font-chat)" }}
      >
        {t("chatmessage.SendAMessageTo")} {agentName}{" "}
        {t("chatmessage.toBeginChattingY")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {["Hello!", "How are you?", "Tell me a joke", "Help me with..."].map(
          (suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="px-3 py-1.5 h-7 text-xs rounded-full text-muted border-border bg-bg hover:border-accent hover:text-txt transition-colors"
            >
              {suggestion}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}
