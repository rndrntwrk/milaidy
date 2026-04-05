import type * as React from "react";

import { cn } from "../../../lib/utils";

export type ChatBubbleTone = "assistant" | "user";

export interface ChatBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: ChatBubbleTone;
  /**
   * Source channel the message came from (e.g. "imessage", "telegram",
   * "discord", "whatsapp"). When set, the bubble renders a distinctive
   * left-edge accent and a small source label so cross-channel messages
   * in a unified chat feed are visually distinct from the agent's own
   * dashboard turns. Unknown sources fall back to a neutral accent.
   */
  source?: string;
}

const CHAT_BUBBLE_BASE_CLASSNAME =
  "relative border whitespace-pre-wrap break-words";
const CHAT_BUBBLE_ASSISTANT_CLASSNAME =
  "border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] text-txt shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(15,23,42,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_28px_-24px_rgba(0,0,0,0.22)]";
const CHAT_BUBBLE_USER_CLASSNAME =
  "border border-accent/24 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.14),rgba(var(--accent-rgb),0.05))] text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_26px_-24px_rgba(var(--accent-rgb),0.18)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_28px_-24px_rgba(0,0,0,0.22)]";

/**
 * Per-source accent colors for cross-channel messages. These override the
 * default border and surface a label above the bubble so a unified chat
 * feed can mix dashboard turns with iMessage/Telegram/Discord/WhatsApp
 * messages without ambiguity about where each message came from.
 *
 * `label` is the short chip shown above the bubble. `borderClass` is the
 * Tailwind border color that replaces the default tone border when the
 * source is set.
 */
const SOURCE_STYLES: Record<
  string,
  { label: string; borderClass: string }
> = {
  imessage: { label: "iMessage", borderClass: "border-[#34c759]/60" },
  telegram: { label: "Telegram", borderClass: "border-[#229ED9]/60" },
  discord: { label: "Discord", borderClass: "border-[#5865F2]/60" },
  whatsapp: { label: "WhatsApp", borderClass: "border-[#25D366]/60" },
  wechat: { label: "WeChat", borderClass: "border-[#07C160]/60" },
};

/**
 * Resolve display metadata for a source tag. Unknown sources get a
 * neutral label (titlecased) and the default accent border — so a new
 * connector surfacing messages works without touching this file, it
 * just won't have a brand color until an entry is added above.
 */
function resolveSourceStyle(
  source: string,
): { label: string; borderClass: string } {
  const known = SOURCE_STYLES[source.toLowerCase()];
  if (known) return known;
  return {
    label: source.charAt(0).toUpperCase() + source.slice(1),
    borderClass: "border-accent/40",
  };
}

export function ChatBubble({
  tone = "assistant",
  source,
  className,
  ...props
}: ChatBubbleProps) {
  const sourceStyle = source ? resolveSourceStyle(source) : null;
  return (
    <div
      className={cn(
        CHAT_BUBBLE_BASE_CLASSNAME,
        tone === "user"
          ? CHAT_BUBBLE_USER_CLASSNAME
          : CHAT_BUBBLE_ASSISTANT_CLASSNAME,
        // Source border overrides the tone border — use border-2 so it's
        // visually distinct from the default 1px tone border.
        sourceStyle ? `border-2 ${sourceStyle.borderClass}` : null,
        className,
      )}
      data-chat-source={source ?? undefined}
      {...props}
    />
  );
}

/**
 * Small label chip shown above a bubble to name the source channel.
 * Rendered as a sibling of ChatBubble rather than inside it so it
 * composes cleanly with the absolute-positioned action tray inside the
 * bubble body.
 */
export function ChatBubbleSourceLabel({ source }: { source: string }) {
  const style = resolveSourceStyle(source);
  return (
    <div
      className={cn(
        "mb-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-strong",
        style.borderClass,
      )}
      data-testid="chat-bubble-source-label"
    >
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full", style.borderClass.replace("border-", "bg-"))}
        aria-hidden="true"
      />
      {style.label}
    </div>
  );
}
