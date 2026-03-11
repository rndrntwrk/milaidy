import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { client, type ContentBlock, type VoiceConfig } from "../api-client.js";
import { useApp } from "../AppContext.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";
import { ProStreamerStageComposition } from "./ProStreamerStageComposition.js";
import { OperatorActionPill } from "./shared/OperatorActionPill.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { ScrollArea } from "./ui/ScrollArea.js";
import { resolveAgentDisplayName } from "./shared/agentDisplayName.js";
import { buildPublicActionEntries } from "./shared/publicActionEntries.js";
import {
  AgentIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MicIcon,
  OperatorIcon,
  SendIcon,
  StopIcon,
  SystemIcon,
  ThreadsIcon,
} from "./ui/Icons.js";

type OperatorActionBlock = Extract<ContentBlock, { type: "action-pill" }>;

type TimelineMessageEntry = {
  id: string;
  type: "message";
  timestampMs: number;
  role: "user" | "assistant";
  text: string;
  blocks?: ContentBlock[];
  source?: string;
};

type TimelineSystemEntry = {
  id: string;
  type: "system";
  timestampMs: number;
  title: string;
  detail: string;
  variant: "accent" | "success" | "warning" | "danger" | "outline";
  timestamp: string;
};

type TimelineEntry = TimelineMessageEntry | TimelineSystemEntry;

type StageEntryRole = "operator" | "assistant" | "system";
type StageEntryKind = "bubble" | "action-pill" | "action-chip" | "system-event";

const STAGE_ENTRY_MAX_WIDTH_CLASS =
  "max-w-[82%] sm:max-w-[64%] lg:max-w-[38%] xl:max-w-[32%]";

function getActionPillBlock(
  blocks?: ContentBlock[],
): OperatorActionBlock | undefined {
  return blocks?.find(
    (block): block is OperatorActionBlock => block.type === "action-pill",
  );
}

function formatStageBubbleText(text: string) {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : "...";
}

function getLegacyOperatorActionPreview(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const nonEmptyLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const label = nonEmptyLines[0] ?? "Operator action";

  return {
    label,
    rawText: normalized.length > 0 ? normalized : label,
    hasHiddenDetail: nonEmptyLines.length > 1,
  };
}

function classifyStageEntry(entry: TimelineEntry): {
  role: StageEntryRole;
  kind: StageEntryKind;
  actionBlock?: OperatorActionBlock;
  legacyAction?: ReturnType<typeof getLegacyOperatorActionPreview>;
} {
  if (entry.type === "system") {
    return {
      role: "system",
      kind: "system-event",
    };
  }

  const actionBlock = entry.role === "user" ? getActionPillBlock(entry.blocks) : undefined;
  if (actionBlock) {
    return {
      role: "operator",
      kind: "action-pill",
      actionBlock,
    };
  }

  if (entry.role === "user" && entry.source === "operator_action") {
    return {
      role: "operator",
      kind: "action-chip",
      legacyAction: getLegacyOperatorActionPreview(entry.text),
    };
  }

  return {
    role: entry.role === "user" ? "operator" : "assistant",
    kind: "bubble",
  };
}

function LegacyOperatorActionChip({
  preview,
}: {
  preview: ReturnType<typeof getLegacyOperatorActionPreview>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className={`flex flex-col items-end gap-1.5 ${STAGE_ENTRY_MAX_WIDTH_CLASS}`}>
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] px-3 py-1.5 text-[12px] font-medium text-white/90 shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/24 text-white/72">
          <OperatorIcon className="h-3 w-3" />
        </span>
        <span className="truncate">{preview.label}</span>
      </div>
      {preview.hasHiddenDetail ? (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/54 transition hover:border-white/18 hover:text-white"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            {detailsOpen ? "Hide Details" : "Details"}
          </button>
          {detailsOpen ? (
            <div
              className="w-full rounded-[18px] border border-white/10 bg-black/38 px-3 py-2 text-left text-[11px] leading-relaxed text-white/72 backdrop-blur-xl"
              data-stage-entry-detail
            >
              {preview.rawText}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AgentCore() {
  const COMPOSER_BOTTOM_OFFSET_PX = 16;
  const COMPOSER_CLEARANCE_BUFFER_PX = 24;
  const DEFAULT_COMPOSER_CLEARANCE_PX = 256;
  const {
    chatAvatarSpeaking,
    conversationMessages,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    agentStatus,
    chatPendingImages,
    autonomousEvents,
    activeGameDisplayName,
    activeGameSandbox,
    activeGameViewerUrl,
    liveHeroSource,
    liveLayoutMode,
    setState,
    handleChatSend,
    handleChatStop,
  } = useApp();
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [composerClearancePx, setComposerClearancePx] = useState(
    DEFAULT_COMPOSER_CLEARANCE_PX,
  );
  const [chatExpanded, setChatExpanded] = useState(false);

  const agentName = resolveAgentDisplayName(agentStatus?.agentName);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const messageEntries = conversationMessages.slice(-12).map((message) => ({
      id: message.id,
      type: "message" as const,
      timestampMs: message.timestamp,
      role: message.role,
      text: message.text ?? "",
      blocks: message.blocks,
      source: message.source,
    }));

    const actionEntries = buildPublicActionEntries(autonomousEvents)
      .slice(-6)
      .map((entry) => ({
        id: entry.id,
        type: "system" as const,
        timestampMs: entry.timestampMs,
        title: entry.title,
        detail: entry.detail,
        variant: entry.variant,
        timestamp: entry.timestamp,
      }));

    return [...messageEntries, ...actionEntries]
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .slice(-14);
  }, [autonomousEvents, conversationMessages]);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, string>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) setVoiceConfig(tts);
      } catch {
        // Browser voice fallback is acceptable here.
      }
    })();
  }, []);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (chatSending) return;
      setState("chatInput", text);
      setTimeout(() => void handleChatSend(), 50);
    },
    [chatSending, handleChatSend, setState],
  );

  const voice = useVoiceChat({
    onTranscript: handleVoiceTranscript,
    voiceConfig,
  });
  const hasChatDraft = chatInput.trim().length > 0;
  const chatNeedsExpandedState =
    hasChatDraft ||
    chatPendingImages.length > 0 ||
    chatSending ||
    chatFirstTokenReceived ||
    voice.isListening;

  useEffect(() => {
    if (chatNeedsExpandedState) {
      setChatExpanded(true);
    }
  }, [chatNeedsExpandedState]);

  useEffect(() => {
    if (!chatExpanded) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatExpanded]);

  useLayoutEffect(() => {
    const composerNode = composerRef.current;
    if (!composerNode) return;

    const updateComposerClearance = () => {
      const nextClearance = Math.ceil(
        composerNode.getBoundingClientRect().height +
          COMPOSER_BOTTOM_OFFSET_PX +
          COMPOSER_CLEARANCE_BUFFER_PX,
      );
      setComposerClearancePx((current) =>
        Math.abs(current - nextClearance) > 1 ? nextClearance : current,
      );
    };

    updateComposerClearance();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateComposerClearance();
      });
      observer.observe(composerNode);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateComposerClearance);
    return () => window.removeEventListener("resize", updateComposerClearance);
  }, []);

  useEffect(() => {
    const node = timelineScrollRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    chatFirstTokenReceived,
    chatSending,
    composerClearancePx,
    timelineEntries.length,
    timelineEntries[timelineEntries.length - 1]?.id,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.008)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.008)_1px,transparent_1px)] bg-[size:34px_34px] opacity-8" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.024),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.01),rgba(0,0,0,0.05)_70%,rgba(0,0,0,0.1)_100%)]" />
      </div>

      <ProStreamerStageComposition
        agentName={agentName}
        activeGameDisplayName={activeGameDisplayName}
        activeGameSandbox={activeGameSandbox}
        activeGameViewerUrl={activeGameViewerUrl}
        isSpeaking={chatAvatarSpeaking}
        liveHeroSource={liveHeroSource}
        liveLayoutMode={liveLayoutMode}
      />

      <div
        className="absolute inset-x-0 top-[9rem] z-10 sm:top-[7.5rem] lg:top-[5.5rem]"
        data-conversation-viewport
        style={{ bottom: `${composerClearancePx}px` }}
      >
        <ScrollArea ref={timelineScrollRef} className="h-full w-full px-3 sm:px-6 lg:px-10">
          <div
            data-conversation-timeline
            className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col justify-end pb-8"
          >
            <div className="space-y-3">
              {timelineEntries.length === 0 ? (
                <div className="flex w-full justify-center">
                  <div className="rounded-full border border-white/10 bg-black/34 px-5 py-3 text-center text-[11px] uppercase tracking-[0.24em] text-white/58 backdrop-blur-xl">
                    Start the conversation. {agentName} replies on the left, operator messages land on the right.
                  </div>
                </div>
              ) : (
                timelineEntries.map((entry) => {
                  const stageEntry = classifyStageEntry(entry);
                  if (entry.type === "system") {
                    return (
                      <div
                        key={entry.id}
                        className="flex w-full justify-center"
                        data-stage-entry-role={stageEntry.role}
                        data-stage-entry-kind={stageEntry.kind}
                      >
                        <div className="max-w-[min(44rem,88vw)] rounded-full border border-white/10 bg-black/36 px-4 py-2.5 text-center backdrop-blur-xl">
                          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/54">
                            <SystemIcon className="h-4 w-4" />
                            <span>{entry.title}</span>
                            <Badge variant={entry.variant}>{entry.timestamp}</Badge>
                          </div>
                          <div className="mt-1 text-sm leading-relaxed text-white/70">
                            {entry.detail}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const isOperator = stageEntry.role === "operator";
                  return (
                    <div
                      key={entry.id}
                      className={`flex w-full ${isOperator ? "justify-end" : "justify-start"}`}
                      data-stage-entry-role={stageEntry.role}
                      data-stage-entry-kind={stageEntry.kind}
                    >
                      {stageEntry.kind === "action-pill" && stageEntry.actionBlock ? (
                        <div className={`flex flex-col items-end ${STAGE_ENTRY_MAX_WIDTH_CLASS}`}>
                          <OperatorActionPill
                            label={stageEntry.actionBlock.label}
                            kind={stageEntry.actionBlock.kind}
                            detail={stageEntry.actionBlock.detail}
                            compact
                            showEyebrow={false}
                            detailClassName="text-[10px] leading-snug text-white/46"
                          />
                        </div>
                      ) : stageEntry.kind === "action-chip" && stageEntry.legacyAction ? (
                        <LegacyOperatorActionChip preview={stageEntry.legacyAction} />
                      ) : (
                        <div
                          className={`w-fit ${STAGE_ENTRY_MAX_WIDTH_CLASS} rounded-[26px] border px-4 py-3 backdrop-blur-xl ${
                            isOperator
                              ? "border-white/14 bg-white/[0.08] text-white"
                              : "border-white/10 bg-black/40 text-white/88"
                          }`}
                        >
                          <div
                            className={`mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/48 ${
                              isOperator ? "justify-end" : "justify-start"
                            }`}
                          >
                            {isOperator ? (
                              <>
                                <span>Operator</span>
                                <OperatorIcon className="h-4 w-4" />
                              </>
                            ) : (
                              <>
                                <AgentIcon className="h-4 w-4" />
                                <span>{agentName}</span>
                              </>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                            {formatStageBubbleText(entry.text)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <form
        ref={composerRef}
        className="pro-streamer-chat-drawer absolute bottom-4 inset-x-0 z-10 flex justify-center px-4"
        data-composer-shell
        onSubmit={(event) => {
          event.preventDefault();
          if (chatSending) {
            void handleChatStop();
            return;
          }
          if (!chatInput.trim()) return;
          void handleChatSend();
        }}
      >
        <div className="pro-streamer-chat-drawer__shell">
          <button
            type="button"
            className={`pro-streamer-chat-drawer__toggle ${chatExpanded ? "pro-streamer-chat-drawer__toggle--open" : ""}`}
            aria-expanded={chatExpanded}
            aria-controls="pro-streamer-chat-drawer-panel"
            onClick={() => setChatExpanded((current) => !current)}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] text-white/84">
              <ThreadsIcon className="h-3.5 w-3.5" />
            </span>
            <span>Chat</span>
            {chatExpanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5 text-white/68" />
            ) : (
              <ChevronUpIcon className="h-3.5 w-3.5 text-white/68" />
            )}
          </button>

          <div
            id="pro-streamer-chat-drawer-panel"
            className={`pro-streamer-chat-drawer__panel ${chatExpanded ? "pro-streamer-chat-drawer__panel--open" : "pro-streamer-chat-drawer__panel--closed"}`}
            aria-hidden={!chatExpanded}
          >
            <div className="pro-streamer-composer-panel w-full">
              <div className="pro-streamer-composer-panel__body">
                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(event) => setState("chatInput", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (chatSending) {
                        void handleChatStop();
                        return;
                      }
                      if (!chatInput.trim()) return;
                      void handleChatSend();
                    }
                  }}
                  aria-label="Operator conversation input"
                  placeholder={voice.isListening ? "Listening..." : `Reply to ${agentName}...`}
                  className="pro-streamer-composer-panel__textarea"
                />
              </div>

              <div className="pro-streamer-composer-panel__footer">
                <div className="flex min-h-10 items-center gap-2">
                  {chatPendingImages.length > 0 ? (
                    <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] text-white/68">
                      {chatPendingImages.length} queued
                    </Badge>
                  ) : null}
                </div>

                <div className="pro-streamer-composer-panel__actions">
                <Button
                  type="button"
                  variant={voice.isListening ? "secondary" : "outline"}
                  size="icon"
                  className={`h-11 w-11 shrink-0 rounded-full ${voice.isListening ? "border-white/18 bg-white/[0.12] text-white" : "border-white/12 bg-white/[0.04] text-white/82"}`}
                  aria-label={voice.isListening ? "Stop voice input" : "Start voice input"}
                  title={voice.isListening ? "Stop voice input" : "Start voice input"}
                  onClick={voice.toggleListening}
                >
                  <MicIcon className={`h-4 w-4 ${voice.isListening ? "fill-current" : ""}`} />
                </Button>
                <Button
                  type="submit"
                  variant={chatSending ? "outline" : "default"}
                  className={`h-11 shrink-0 rounded-full px-5 ${chatSending ? "border-danger/30 bg-danger/10 text-danger hover:bg-danger/14" : "bg-white/92 text-black hover:bg-white"}`}
                  aria-label={chatSending ? "Stop execution" : "Send reply"}
                >
                  {chatSending ? <StopIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
                  <span>{chatSending ? "Stop" : "Send"}</span>
                </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
