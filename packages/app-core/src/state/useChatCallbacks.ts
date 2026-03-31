/**
 * Chat callbacks — extracted from AppContext.
 *
 * Contains all conversation / chat send / lifecycle / reset / greeting
 * callbacks that were in the "Chat" section of AppProvider (lines 2024-4181).
 */

import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import {
  type AgentStatus,
  type ConversationChannelType,
  type ConversationMessage,
  type ConversationMode,
  type CustomActionDef,
  type ImageAttachment,
  type StreamEventEnvelope,
  client,
} from "../api";
import {
  expandSavedCustomCommand,
  loadSavedCustomCommands,
  normalizeSlashCommandName,
} from "../chat";
import {
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
} from "../bridge";
import {
  alertDesktopMessage,
  confirmDesktopAction,
} from "../utils";
import type { AppState } from "./internal";
import {
  clearAvatarIndex,
  clearPersistedConnectionMode,
  formatSearchBullet,
  LIFECYCLE_MESSAGES,
  type LoadConversationMessagesResult,
  loadActiveConversationId,
  mergeStreamingText,
  normalizeCustomActionName,
  parseAgentStatusFromMainMenuResetPayload,
  parseCustomActionParams,
  parseSlashCommandInput,
  shouldApplyFinalStreamText,
} from "./internal";
import { completeResetLocalStateAfterServerWipe as runCompleteResetLocalStateAfterServerWipe } from "./complete-reset-local-state-after-wipe";
import { handleResetAppliedFromMainCore } from "./handle-reset-applied-from-main";

// ── Helpers (file-local) ────────────────────────────────────────────

function shouldKeepConversationMessage(message: ConversationMessage): boolean {
  if (message.role !== "assistant") return true;
  if (message.text.trim().length > 0) return true;
  return Boolean(message.blocks?.length);
}

function filterRenderableConversationMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  return messages.filter((message) => shouldKeepConversationMessage(message));
}

function hasConversationBootstrapMessage(
  messages: ConversationMessage[],
): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" && shouldKeepConversationMessage(message),
  );
}

/** Enable with `MILADY_TTS_DEBUG=1` or `localStorage.setItem("milady:debug:greeting", "1")`. */
function miladyGreetingDebugEnabled(): boolean {
  if (isMiladyTtsDebugEnabled()) return true;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("milady:debug:greeting") === "1"
    );
  } catch {
    return false;
  }
}

function traceMiladyGreeting(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!miladyGreetingDebugEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[milady][greeting] ${phase}`, detail);
  } else {
    console.info(`[milady][greeting] ${phase}`);
  }
}

const RESET_LOG_PREFIX = "[milady][reset]";

function logResetDebug(
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.debug(`${RESET_LOG_PREFIX} ${message}`, detail);
  } else {
    console.debug(`${RESET_LOG_PREFIX} ${message}`);
  }
}

function logResetInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.info(`${RESET_LOG_PREFIX} ${message}`, detail);
  } else {
    console.info(`${RESET_LOG_PREFIX} ${message}`);
  }
}

function logResetWarn(message: string, detail?: unknown): void {
  console.warn(`${RESET_LOG_PREFIX} ${message}`, detail);
}

import { isRoutineCodingAgentMessage } from "../chat";

const COMPANION_STALE_THREAD_MAX_AGE_MS = 30 * 60 * 1000;
const COMPANION_STALE_THREAD_VISIBLE_MESSAGE_LIMIT = 2;

function isPersistedGreetingMessage(message: ConversationMessage): boolean {
  return (
    message.role === "assistant" &&
    message.source === "agent_greeting" &&
    message.text.trim().length > 0
  );
}

function shouldStartFreshCompanionConversation(
  messages: ConversationMessage[],
  now = Date.now(),
): boolean {
  const visibleMessages = messages
    .filter((message) => shouldKeepConversationMessage(message))
    .filter((message) => !isRoutineCodingAgentMessage(message))
    .slice(-COMPANION_STALE_THREAD_VISIBLE_MESSAGE_LIMIT);

  if (visibleMessages.length === 0) {
    return false;
  }

  if (
    visibleMessages.length === 1 &&
    isPersistedGreetingMessage(visibleMessages[0])
  ) {
    return false;
  }

  return visibleMessages.every((message) => {
    if (!Number.isFinite(message.timestamp)) {
      return false;
    }
    return now - message.timestamp > COMPANION_STALE_THREAD_MAX_AGE_MS;
  });
}

interface QueuedChatSend {
  rawInput: string;
  channelType: ConversationChannelType;
  conversationId?: string | null;
  images?: ImageAttachment[];
  metadata?: Record<string, unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Publish server cloud snapshot for chat TTS (`useVoiceChat` + `loadVoiceConfig`). */
function publishElizaCloudVoiceSnapshot(
  setHasPersistedKey: (value: boolean) => void,
  snapshot: {
    apiConnected: boolean;
    enabled: boolean;
    hasPersistedApiKey: boolean;
  },
): void {
  setHasPersistedKey(snapshot.hasPersistedApiKey);
  dispatchElizaCloudStatusUpdated({
    connected: snapshot.apiConnected,
    enabled: snapshot.enabled,
    hasPersistedApiKey: snapshot.hasPersistedApiKey,
    cloudVoiceProxyAvailable:
      snapshot.hasPersistedApiKey || snapshot.enabled || snapshot.apiConnected,
  });
}

// ── Deps interface ──────────────────────────────────────────────────

import type { Conversation, OnboardingOptions } from "../api";
import type { LifecycleAction, UiShellMode } from "./internal";
import type { Tab } from "../navigation";
import type { CodingAgentSession } from "../api";
import { dispatchElizaCloudStatusUpdated } from "../events";
import { isMiladyTtsDebugEnabled } from "../utils/milady-tts-debug";
import type { OnboardingMode, OnboardingStep } from "./types";

export interface UseChatCallbacksDeps {
  // Translation
  t: (key: string) => string;

  // UI state
  uiLanguage: string;
  uiShellMode: UiShellMode;
  tab: Tab;

  // Agent status
  agentStatus: AgentStatus | null;

  // Chat state from useChatState
  chatInput: string;
  chatMode: ConversationMode;
  conversations: Conversation[];
  activeConversationId: string | null;
  companionMessageCutoffTs: number;
  conversationMessages: ConversationMessage[];
  ptySessions: CodingAgentSession[];

  // Setters from useChatState
  setChatInput: (v: string) => void;
  setChatSending: (v: boolean) => void;
  setChatFirstTokenReceived: (v: boolean) => void;
  setChatLastUsage: (v: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string | undefined;
    updatedAt: number;
  }) => void;
  setChatPendingImages: (v: ImageAttachment[]) => void;
  setConversations: (v: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  setActiveConversationId: (v: string | null) => void;
  setCompanionMessageCutoffTs: (v: number) => void;
  setConversationMessages: (v: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void;
  setUnreadConversations: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  resetConversationDraftState: () => void;

  // Refs from useChatState
  activeConversationIdRef: MutableRefObject<string | null>;
  chatInputRef: MutableRefObject<string>;
  chatPendingImagesRef: MutableRefObject<ImageAttachment[]>;
  conversationMessagesRef: MutableRefObject<ConversationMessage[]>;
  conversationHydrationEpochRef: MutableRefObject<number>;
  chatAbortRef: MutableRefObject<AbortController | null>;
  chatSendBusyRef: MutableRefObject<boolean>;
  chatSendNonceRef: MutableRefObject<number>;
  greetingFiredRef: MutableRefObject<boolean>;
  greetingInFlightConversationRef: MutableRefObject<string | null>;
  companionStaleConversationRefreshRef: MutableRefObject<string | null>;

  // Lifecycle
  lifecycleAction: LifecycleAction | null;
  beginLifecycleAction: (action: LifecycleAction) => boolean;
  finishLifecycleAction: () => void;
  lifecycleBusyRef: MutableRefObject<boolean>;
  lifecycleActionRef: MutableRefObject<LifecycleAction | null>;
  setAgentStatus: (s: AgentStatus | null) => void;
  setActionNotice: (text: string, tone: "success" | "error" | "info", ttlMs?: number, once?: boolean, busy?: boolean) => void;

  // Pending restart
  pendingRestart: boolean;
  pendingRestartReasons: string[];
  setPendingRestart: (v: boolean) => void;
  setPendingRestartReasons: (v: string[] | ((prev: string[]) => string[])) => void;

  // Backend connection
  setBackendDisconnectedBannerDismissed: (v: boolean) => void;
  resetBackendConnection: () => void;

  // Loaders
  loadConversations: () => Promise<Conversation[] | null>;
  loadConversationMessages: (convId: string) => Promise<LoadConversationMessagesResult>;
  loadPlugins: () => Promise<unknown>;

  // Cloud state
  elizaCloudEnabled: boolean;
  elizaCloudConnected: boolean;
  pollCloudCredits: () => Promise<boolean>;
  elizaCloudPreferDisconnectedUntilLoginRef: MutableRefObject<boolean>;
  setElizaCloudEnabled: (v: boolean) => void;
  setElizaCloudConnected: (v: boolean) => void;
  setElizaCloudHasPersistedKey: (v: boolean) => void;
  setElizaCloudCredits: (v: number | null) => void;
  setElizaCloudCreditsLow: (v: boolean) => void;
  setElizaCloudCreditsCritical: (v: boolean) => void;
  setElizaCloudAuthRejected: (v: boolean) => void;
  setElizaCloudCreditsError: (v: string | null) => void;
  setElizaCloudTopUpUrl: (v: string) => void;
  setElizaCloudUserId: (v: string | null) => void;
  setElizaCloudStatusReason: (v: string | null) => void;
  setElizaCloudLoginError: (v: string | null) => void;

  // Onboarding setters (used by completeResetLocalStateAfterServerWipe)
  onboardingCompletionCommittedRef: MutableRefObject<boolean>;
  onboardingResumeConnectionRef: MutableRefObject<unknown>;
  setOnboardingUiRevealNonce: (fn: (n: number) => number) => void;
  setOnboardingLoading: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingStep: (v: OnboardingStep) => void;
  setOnboardingMode: (v: OnboardingMode) => void;
  setOnboardingActiveGuide: (v: string | null) => void;
  setOnboardingDeferredTasks: (v: string[]) => void;
  setPostOnboardingChecklistDismissed: (v: boolean) => void;
  setOnboardingName: (v: string) => void;
  setOnboardingStyle: (v: string) => void;
  setOnboardingRunMode: (v: "local" | "cloud" | "") => void;
  setOnboardingCloudProvider: (v: string) => void;
  setOnboardingProvider: (v: string) => void;
  setOnboardingApiKey: (v: string) => void;
  setOnboardingVoiceProvider: (v: string) => void;
  setOnboardingVoiceApiKey: (v: string) => void;
  setOnboardingPrimaryModel: (v: string) => void;
  setOnboardingOpenRouterModel: (v: string) => void;
  setOnboardingRemoteConnected: (v: boolean) => void;
  setOnboardingRemoteApiBase: (v: string) => void;
  setOnboardingRemoteToken: (v: string) => void;
  setOnboardingSmallModel: (v: string) => void;
  setOnboardingLargeModel: (v: string) => void;
  setOnboardingOptions: (v: OnboardingOptions | null) => void;

  // Character / avatar
  setSelectedVrmIndex: (v: number) => void;
  setCustomVrmUrl: (v: string) => void;
  setCustomBackgroundUrl: (v: string) => void;

  // Plugins / skills / logs
  setPlugins: (v: never[]) => void;
  setSkills: (v: never[]) => void;
  setLogs: (v: never[]) => void;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useChatCallbacks(deps: UseChatCallbacksDeps) {
  const {
    t,
    uiLanguage,
    uiShellMode,
    tab,
    agentStatus,
    chatMode,
    conversations,
    activeConversationId,
    companionMessageCutoffTs,
    conversationMessages,
    ptySessions,
    setChatInput,
    setChatSending,
    setChatFirstTokenReceived,
    setChatLastUsage,
    setChatPendingImages,
    setConversations,
    setActiveConversationId,
    setCompanionMessageCutoffTs,
    setConversationMessages,
    setUnreadConversations,
    resetConversationDraftState,
    activeConversationIdRef,
    chatInputRef,
    chatPendingImagesRef,
    conversationMessagesRef,
    conversationHydrationEpochRef,
    chatAbortRef,
    chatSendBusyRef,
    chatSendNonceRef,
    greetingFiredRef,
    greetingInFlightConversationRef,
    companionStaleConversationRefreshRef,
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    lifecycleBusyRef,
    lifecycleActionRef,
    setAgentStatus,
    setActionNotice,
    pendingRestart,
    pendingRestartReasons,
    setPendingRestart,
    setPendingRestartReasons,
    setBackendDisconnectedBannerDismissed,
    resetBackendConnection,
    loadConversations,
    loadConversationMessages,
    loadPlugins,
    elizaCloudEnabled,
    elizaCloudConnected,
    pollCloudCredits,
    elizaCloudPreferDisconnectedUntilLoginRef,
    setElizaCloudEnabled,
    setElizaCloudConnected,
    setElizaCloudHasPersistedKey,
    setElizaCloudCredits,
    setElizaCloudCreditsLow,
    setElizaCloudCreditsCritical,
    setElizaCloudAuthRejected,
    setElizaCloudCreditsError,
    setElizaCloudTopUpUrl,
    setElizaCloudUserId,
    setElizaCloudStatusReason,
    setElizaCloudLoginError,
    onboardingCompletionCommittedRef,
    onboardingResumeConnectionRef,
    setOnboardingUiRevealNonce,
    setOnboardingLoading,
    setOnboardingComplete,
    setOnboardingStep,
    setOnboardingMode,
    setOnboardingActiveGuide,
    setOnboardingDeferredTasks,
    setPostOnboardingChecklistDismissed,
    setOnboardingName,
    setOnboardingStyle,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingVoiceProvider,
    setOnboardingVoiceApiKey,
    setOnboardingPrimaryModel,
    setOnboardingOpenRouterModel,
    setOnboardingRemoteConnected,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingSmallModel,
    setOnboardingLargeModel,
    setOnboardingOptions,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    setPlugins,
    setSkills,
    setLogs,
  } = deps;

  const chatSendQueueRef = useRef<QueuedChatSend[]>([]);
  const heartbeatNotificationKeyRef = useRef<string | null>(null);
  const restartNotificationSignatureRef = useRef<string | null>(null);

  const resolveQueuedChatSends = useCallback(() => {
    const queued = chatSendQueueRef.current.splice(0);
    for (const turn of queued) {
      turn.resolve();
    }
  }, []);

  const interruptActiveChatPipeline = useCallback(() => {
    resolveQueuedChatSends();
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatFirstTokenReceived(false);
  }, [
    chatAbortRef,
    resolveQueuedChatSends,
    setChatFirstTokenReceived,
    setChatSending,
  ]);

  // ── Chat ───────────────────────────────────────────────────────────

  /** Request an agent greeting for a conversation and add it to messages. */
  const fetchGreeting = useCallback(
    async (convId: string): Promise<boolean> => {
      if (greetingInFlightConversationRef.current === convId) {
        traceMiladyGreeting("fetchGreeting:skip_duplicate_in_flight", {
          convId,
        });
        return false;
      }
      greetingInFlightConversationRef.current = convId;
      traceMiladyGreeting("fetchGreeting:request", { convId });
      try {
        const data = await client.requestGreeting(convId, uiLanguage);
        if (data.text) {
          const stillActive = activeConversationIdRef.current === convId;
          traceMiladyGreeting("fetchGreeting:response", {
            convId,
            stillActive,
            textLength: data.text.length,
            persisted: data.persisted === true,
          });
          if (stillActive) {
            setConversationMessages((prev: ConversationMessage[]) => {
              if (
                prev.some(
                  (message) =>
                    message.role === "assistant" &&
                    message.source === "agent_greeting" &&
                    message.text === data.text,
                )
              ) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: `greeting-${Date.now()}`,
                  role: "assistant",
                  text: data.text,
                  timestamp: Date.now(),
                  source: "agent_greeting",
                },
              ];
            });
            greetingFiredRef.current = true;
          }
          return stillActive;
        }
        traceMiladyGreeting("fetchGreeting:empty_or_whitespace", { convId });
        greetingFiredRef.current = false;
      } catch (err) {
        traceMiladyGreeting("fetchGreeting:request_failed", {
          convId,
          error: err instanceof Error ? err.message : String(err),
        });
        greetingFiredRef.current = false;
        /* greeting failed silently — user can still chat */
      } finally {
        if (greetingInFlightConversationRef.current === convId) {
          greetingInFlightConversationRef.current = null;
        }
      }
      return false;
    },
    [
      uiLanguage,
      activeConversationIdRef,
      greetingFiredRef,
      greetingInFlightConversationRef,
      setConversationMessages,
    ],
  );

  const requestGreetingWhenRunning = useCallback(
    async (convId: string | null): Promise<void> => {
      if (!convId || greetingFiredRef.current) {
        traceMiladyGreeting("requestGreetingWhenRunning:skip", {
          convId: convId ?? null,
          greetingFired: greetingFiredRef.current,
        });
        return;
      }
      try {
        const status = await client.getStatus();
        traceMiladyGreeting("requestGreetingWhenRunning:status", {
          convId,
          state: status.state,
        });
        if (status.state === "running" && !greetingFiredRef.current) {
          await fetchGreeting(convId);
        }
      } catch (err) {
        console.warn(
          "[milady][chat:init] failed to confirm runtime state for greeting",
          err,
        );
      }
    },
    [fetchGreeting],
  );


  const hydrateInitialConversationState = useCallback(async (): Promise<
    string | null
  > => {
    const hydrationEpoch = ++conversationHydrationEpochRef.current;
    const isCurrentHydration = () =>
      conversationHydrationEpochRef.current === hydrationEpoch;

    try {
      const { conversations: c } = await client.listConversations();
      traceMiladyGreeting("hydrate:listConversations", { count: c.length });
      if (!isCurrentHydration()) {
        return null;
      }
      setConversations(c);
      if (c.length > 0) {
        const savedConversationId = loadActiveConversationId();
        const restoredConversation =
          c.find((conversation) => conversation.id === savedConversationId) ??
          c[0];
        if (!isCurrentHydration()) {
          return null;
        }
        setActiveConversationId(restoredConversation.id);
        activeConversationIdRef.current = restoredConversation.id;
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: restoredConversation.id,
        });
        try {
          const { messages } = await client.getConversationMessages(
            restoredConversation.id,
          );
          if (!isCurrentHydration()) {
            return null;
          }
          const nextMessages = filterRenderableConversationMessages(messages);
          greetingFiredRef.current =
            hasConversationBootstrapMessage(nextMessages);
          conversationMessagesRef.current = nextMessages;
          setConversationMessages(nextMessages);
          return nextMessages.length === 0 ? restoredConversation.id : null;
        } catch (err) {
          if (!isCurrentHydration()) {
            return null;
          }
          console.warn(
            "[milady][chat:init] failed to load restored conversation messages",
            err,
          );
          greetingFiredRef.current = false;
          conversationMessagesRef.current = [];
          setConversationMessages([]);
          return restoredConversation.id;
        }
      }

      if (!isCurrentHydration()) {
        return null;
      }
      traceMiladyGreeting("hydrate:no_conversations_on_server");
      greetingFiredRef.current = false;
      conversationMessagesRef.current = [];
      setConversationMessages([]);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      return null;
    } catch (err) {
      console.warn("[milady][chat:init] failed to hydrate conversations", err);
      return null;
    }
  }, [
    activeConversationIdRef,
    conversationHydrationEpochRef,
    conversationMessagesRef,
    greetingFiredRef,
    setActiveConversationId,
    setConversationMessages,
    setConversations,
  ]);

  // resetConversationDraftState now comes from useChatState (aliased above)

  const handleStartDraftConversation = useCallback(async () => {
    interruptActiveChatPipeline();
    resetConversationDraftState();
  }, [interruptActiveChatPipeline, resetConversationDraftState]);

  const handleStart = useCallback(async () => {
    if (!beginLifecycleAction("start")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.start.progress,
      "info",
      300_000,
      false,
      true,
    );
    try {
      const s = await client.startAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.start.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.start.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    setAgentStatus,
  ]);

  const handleStop = useCallback(async () => {
    if (!beginLifecycleAction("stop")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.stop.progress,
      "info",
      120_000,
      false,
      true,
    );
    try {
      const s = await client.stopAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.stop.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.stop.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    setAgentStatus,
  ]);

  const handleRestart = useCallback(async () => {
    if (!beginLifecycleAction("restart")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.restart.progress,
      "info",
      300_000,
      false,
      true,
    );
    try {
      setAgentStatus({
        ...(agentStatus ?? {
          agentName: "Milady",
          model: undefined,
          uptime: undefined,
          startedAt: undefined,
        }),
        state: "restarting",
      });
      // Server restart clears in-memory conversations — reset client state
      setActiveConversationId(null);
      setConversationMessages([]);
      setConversations([]);
      const s = await client.restartAgent();
      setAgentStatus(s);
      const greetConvId = await hydrateInitialConversationState();
      await requestGreetingWhenRunning(greetConvId);
      setPendingRestart(false);
      setPendingRestartReasons([]);
      void loadPlugins();
      setActionNotice(LIFECYCLE_MESSAGES.restart.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.restart.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      setTimeout(async () => {
        try {
          setAgentStatus(await client.getStatus());
        } catch {
          /* ignore */
        }
      }, 3000);
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    hydrateInitialConversationState,
    loadPlugins,
    requestGreetingWhenRunning,
    setActiveConversationId,
    setAgentStatus,
    setConversationMessages,
    setConversations,
    setPendingRestart,
    setPendingRestartReasons,
  ]);

  // dismissRestartBanner, showRestartBanner are now provided by useLifecycleState
  // dismissBackendDisconnectedBanner, dismissSystemWarning are now provided by useLifecycleState

  const triggerRestart = useCallback(async () => {
    await handleRestart();
  }, [handleRestart]);

  const retryBackendConnection = useCallback(() => {
    setBackendDisconnectedBannerDismissed(false);
    client.resetConnection();
  }, [setBackendDisconnectedBannerDismissed]);

  const restartBackend = useCallback(async () => {
    const restarted = await invokeDesktopBridgeRequest({
      rpcMethod: "agentRestart",
      ipcChannel: "agent:restart",
    });
    if (restarted === null) {
      await client.restart();
    }
    resetBackendConnection();
  }, [resetBackendConnection]);

  const relaunchDesktop = useCallback(async () => {
    const relaunched = await invokeDesktopBridgeRequest<void>({
      rpcMethod: "desktopRelaunch",
      ipcChannel: "desktop:relaunch",
    });
    if (relaunched === null) {
      await handleRestart();
    }
  }, [handleRestart]);

  const showDesktopNotification = useCallback(
    async (options: {
      title: string;
      body?: string;
      urgency?: "normal" | "critical" | "low";
      silent?: boolean;
    }) => {
      try {
        await invokeDesktopBridgeRequest<{ id: string }>({
          rpcMethod: "desktopShowNotification",
          ipcChannel: "desktop:showNotification",
          params: options,
        });
      } catch {
        /* ignore desktop notification failures */
      }
    },
    [],
  );

  const notifyHeartbeatEvent = useCallback(
    (event: StreamEventEnvelope) => {
      // biome-ignore lint/suspicious/noExplicitAny: heartbeat payloads are loosely typed
      const payload = event.payload as any;
      const status =
        typeof payload.status === "string"
          ? payload.status.trim().toLowerCase()
          : "ok";
      const silent = payload.silent === true;
      const isFailure = status === "error" || status === "failed";
      const isSkipped = status === "skipped";
      if (!isFailure && !isSkipped && silent) {
        return;
      }

      const eventTs =
        typeof payload.ts === "number"
          ? payload.ts
          : typeof event.ts === "number"
            ? event.ts
            : Date.now();
      const target =
        [
          typeof payload.channel === "string" ? payload.channel.trim() : "",
          typeof payload.to === "string" ? payload.to.trim() : "",
        ]
          .filter(Boolean)
          .join(" · ") || "background trigger";
      const notificationKey = `${eventTs}:${status}:${target}`;

      if (heartbeatNotificationKeyRef.current === notificationKey) {
        return;
      }
      heartbeatNotificationKeyRef.current = notificationKey;

      const preview =
        typeof payload.preview === "string" ? payload.preview.trim() : "";
      const reason =
        typeof payload.reason === "string" ? payload.reason.trim() : "";
      const duration =
        typeof payload.durationMs === "number"
          ? `Duration: ${Math.round(payload.durationMs)}ms`
          : "";

      const body = [target, preview, reason !== preview ? reason : "", duration]
        .filter(Boolean)
        .join("\n");

      void showDesktopNotification({
        title: isFailure
          ? "Heartbeat failed"
          : isSkipped
            ? "Heartbeat skipped"
            : "Heartbeat ran",
        body,
        urgency: isFailure ? "critical" : isSkipped ? "normal" : "low",
        silent: false,
      });
    },
    [showDesktopNotification],
  );

  useEffect(() => {
    if (!pendingRestart) {
      restartNotificationSignatureRef.current = null;
      return;
    }

    const signature =
      pendingRestartReasons.length > 0
        ? pendingRestartReasons.join("\n")
        : "restart-required";
    if (restartNotificationSignatureRef.current === signature) {
      return;
    }
    restartNotificationSignatureRef.current = signature;

    const summary =
      pendingRestartReasons.length === 1
        ? pendingRestartReasons[0]
        : pendingRestartReasons.length > 1
          ? `${pendingRestartReasons.length} changes are waiting for restart.`
          : "Restart required to apply changes.";

    void showDesktopNotification({
      title: "Restart required",
      body: `${summary}\nUse Restart Now from the banner or Milady > Restart Agent. Use Milady > Relaunch Milady when the desktop shell itself needs a full relaunch.`,
      urgency: "normal",
      silent: false,
    });
  }, [pendingRestart, pendingRestartReasons, showDesktopNotification]);

  // retryStartup provided by useLifecycleState (dispatches RETRY_STARTUP)

  const completeResetLocalStateAfterServerWipe = useCallback(
    async (postResetAgentStatus: AgentStatus | null): Promise<void> => {
      await runCompleteResetLocalStateAfterServerWipe(postResetAgentStatus, {
        setAgentStatus,
        resetClientConnection: () => client.resetConnection(),
        clearPersistedConnectionMode,
        clearPersistedAvatarIndex: clearAvatarIndex,
        setClientBaseUrl: (url) => client.setBaseUrl(url),
        setClientToken: (token) => client.setToken(token),
        clearElizaCloudSessionUi: () => {
          elizaCloudPreferDisconnectedUntilLoginRef.current = false;
          setElizaCloudEnabled(false);
          setElizaCloudConnected(false);
          publishElizaCloudVoiceSnapshot(setElizaCloudHasPersistedKey, {
            apiConnected: false,
            enabled: false,
            hasPersistedApiKey: false,
          });
          setElizaCloudCredits(null);
          setElizaCloudCreditsLow(false);
          setElizaCloudCreditsCritical(false);
          setElizaCloudAuthRejected(false);
          setElizaCloudCreditsError(null);
          setElizaCloudTopUpUrl("/cloud/billing");
          setElizaCloudUserId(null);
          setElizaCloudStatusReason(null);
          setElizaCloudLoginError(null);
        },
        markOnboardingReset: () => {
          onboardingCompletionCommittedRef.current = false;
          setOnboardingUiRevealNonce((n) => n + 1);
          setOnboardingLoading(false);
          setOnboardingComplete(false);
          onboardingResumeConnectionRef.current = null;
          setOnboardingStep("identity");
          setOnboardingMode("basic");
          setOnboardingActiveGuide(null);
          setOnboardingDeferredTasks([]);
          setPostOnboardingChecklistDismissed(false);
          setOnboardingName("Chen");
          setOnboardingStyle("chen");
          setOnboardingRunMode("");
          setOnboardingCloudProvider("");
          setOnboardingProvider("");
          setOnboardingApiKey("");
          setOnboardingVoiceProvider("");
          setOnboardingVoiceApiKey("");
          setOnboardingPrimaryModel("");
          setOnboardingOpenRouterModel("");
          setOnboardingRemoteConnected(false);
          setOnboardingRemoteApiBase("");
          setOnboardingRemoteToken("");
          setOnboardingSmallModel("");
          setOnboardingLargeModel("");
        },
        resetAvatarSelection: () => {
          setSelectedVrmIndex(1);
          setCustomVrmUrl("");
          setCustomBackgroundUrl("");
        },
        clearConversationLists: () => {
          setConversationMessages([]);
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversations([]);
          setPlugins([]);
          setSkills([]);
          setLogs([]);
        },
        fetchOnboardingOptions: () => client.getOnboardingOptions(),
        setOnboardingOptions,
        logResetDebug,
        logResetWarn,
      });
    },
    [
      setAgentStatus,
      setOnboardingComplete,
      setOnboardingLoading,
      setOnboardingOptions,
      setOnboardingStep,
      setOnboardingMode,
      setOnboardingActiveGuide,
      setOnboardingDeferredTasks,
      setPostOnboardingChecklistDismissed,
      setOnboardingName,
      setOnboardingStyle,
      setOnboardingRunMode,
      setOnboardingCloudProvider,
      setOnboardingProvider,
      setOnboardingApiKey,
      setOnboardingPrimaryModel,
      setOnboardingOpenRouterModel,
      setOnboardingRemoteConnected,
      setOnboardingRemoteApiBase,
      setOnboardingRemoteToken,
      setOnboardingSmallModel,
      setOnboardingLargeModel,
      setOnboardingUiRevealNonce,
      setConversationMessages,
      setActiveConversationId,
      setConversations,
      activeConversationIdRef,
      onboardingCompletionCommittedRef,
      onboardingResumeConnectionRef,
      setSelectedVrmIndex,
    ],
  );

  const handleResetAppliedFromMain = useCallback(
    async (payload: unknown) => {
      await handleResetAppliedFromMainCore(payload, {
        performanceNow: () => performance.now(),
        isLifecycleBusy: () => lifecycleBusyRef.current,
        getActiveLifecycleAction: () =>
          lifecycleActionRef.current ?? lifecycleAction ?? "reset",
        beginLifecycleAction,
        finishLifecycleAction,
        setActionNotice,
        parseTrayResetPayload: parseAgentStatusFromMainMenuResetPayload,
        completeResetLocalState: completeResetLocalStateAfterServerWipe,
        alertDesktopMessage,
        logResetInfo,
        logResetWarn,
      });
    },
    [
      lifecycleAction,
      beginLifecycleAction,
      finishLifecycleAction,
      setActionNotice,
      completeResetLocalStateAfterServerWipe,
      lifecycleActionRef.current,
      lifecycleBusyRef.current,
    ],
  );

  const handleReset = useCallback(async () => {
    logResetInfo("handleReset: invoked");
    if (lifecycleBusyRef.current) {
      const activeAction =
        lifecycleActionRef.current ?? lifecycleAction ?? "reset";
      logResetInfo("handleReset: skipped — lifecycle busy", {
        activeAction,
      });
      setActionNotice(
        `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
        "info",
        2800,
      );
      return;
    }
    logResetInfo("handleReset: showing confirm dialog");
    const confirmed = await confirmDesktopAction({
      title: "Reset Agent",
      message:
        "This will reset the agent: config, cloud keys, and local agent database (conversations / memory).",
      detail:
        "Downloaded GGUF embedding models are kept. You will return to the onboarding wizard.",
      confirmLabel: "Reset",
      cancelLabel: "Cancel",
      type: "warning",
    });
    if (!confirmed) {
      logResetInfo("handleReset: cancelled by user");
      return;
    }
    // Native message boxes (Electrobun/macOS) can return without letting the webview
    // process network/RPC on the same turn — `fetch` and bridge requests then appear
    // to "never run" until something else wakes the loop. Yield once before reset work.
    logResetInfo(
      "handleReset: confirmed — scheduling reset on next event-loop turn (native dialog)",
    );
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 0);
    });

    if (!beginLifecycleAction("reset")) {
      logResetInfo(
        "handleReset: aborted — could not begin lifecycle (race with another action)",
      );
      setActionNotice(
        "Another agent operation is still running. Wait for it to finish, then try Reset again.",
        "info",
        4200,
      );
      return;
    }
    setActionNotice(
      LIFECYCLE_MESSAGES.reset.progress,
      "info",
      120_000,
      false,
      true,
    );
    const resetStartedAt = performance.now();
    logResetInfo(
      "handleReset: starting (POST /api/agent/reset + restart path)",
      {
        electrobun: isElectrobunRuntime(),
        apiBase:
          client.getBaseUrl() || "(empty — will resolve after reconnect)",
      },
    );
    logResetInfo(
      "handleReset: tip — reset logs also appear in this window (filter [milady][reset]); API terminal only shows server-side routes",
    );
    try {
      logResetDebug("handleReset: calling client.resetAgent()");
      await client.resetAgent();
      logResetDebug("handleReset: client.resetAgent() completed");

      let postResetAgentStatus: AgentStatus | null = null;
      logResetDebug(
        "handleReset: invoking desktop bridge agentRestartClearLocalDb",
      );
      const BRIDGE_RESTART_MS = 150_000;
      try {
        postResetAgentStatus = await Promise.race([
          invokeDesktopBridgeRequest<AgentStatus>({
            rpcMethod: "agentRestartClearLocalDb",
            ipcChannel: "agent:restartClearLocalDb",
          }),
          new Promise<AgentStatus | null>((_, reject) => {
            window.setTimeout(() => {
              reject(
                Object.assign(
                  new Error(
                    `agentRestartClearLocalDb exceeded ${BRIDGE_RESTART_MS / 1000}s`,
                  ),
                  { name: "ResetBridgeTimeout" },
                ),
              );
            }, BRIDGE_RESTART_MS);
          }),
        ]);
        logResetDebug("handleReset: bridge agentRestartClearLocalDb settled", {
          hasResult: postResetAgentStatus != null,
          state: postResetAgentStatus?.state ?? null,
          port: postResetAgentStatus?.port ?? null,
        });
        if (postResetAgentStatus == null && isElectrobunRuntime()) {
          logResetWarn(
            "handleReset: agentRestartClearLocalDb RPC returned null — bridge request missing; will rely on HTTP restart path",
          );
        }
      } catch (bridgeErr) {
        postResetAgentStatus = null;
        if (
          bridgeErr instanceof Error &&
          bridgeErr.name === "ResetBridgeTimeout"
        ) {
          logResetWarn(
            "handleReset: agentRestartClearLocalDb timed out — falling back to HTTP restart",
            bridgeErr,
          );
        } else {
          logResetWarn(
            "handleReset: bridge agentRestartClearLocalDb threw (will try HTTP restart)",
            bridgeErr,
          );
        }
      }

      const embeddedRestartedOk =
        postResetAgentStatus != null &&
        (postResetAgentStatus.state === "running" ||
          postResetAgentStatus.state === "starting");

      logResetDebug("handleReset: embedded restart decision", {
        embeddedRestartedOk,
        bridgeState: postResetAgentStatus?.state ?? null,
      });

      if (!embeddedRestartedOk) {
        logResetInfo(
          "handleReset: calling client.restartAndWait(120s) — external API or bridge no-op",
        );
        try {
          postResetAgentStatus = await client.restartAndWait(120_000);
          logResetDebug("handleReset: restartAndWait completed", {
            state: postResetAgentStatus.state,
            port: postResetAgentStatus.port,
          });
        } catch (httpErr) {
          postResetAgentStatus = null;
          logResetWarn(
            "handleReset: client.restartAndWait failed — UI may be stale until manual restart",
            httpErr,
          );
        }
      }

      await completeResetLocalStateAfterServerWipe(postResetAgentStatus);
      const elapsedMs = Math.round(performance.now() - resetStartedAt);
      logResetInfo(
        "handleReset: success — local UI reset; see server logs for API",
        {
          elapsedMs,
          finalAgentState: postResetAgentStatus?.state ?? null,
        },
      );
      setActionNotice(LIFECYCLE_MESSAGES.reset.success, "success", 3200);
    } catch (err) {
      logResetWarn("handleReset: failed before local UI could reset", err);
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.reset.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      await alertDesktopMessage({
        title: "Reset Failed",
        message: "Reset failed. Check the console for details.",
        type: "error",
      });
    } finally {
      finishLifecycleAction();
    }
  }, [
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    completeResetLocalStateAfterServerWipe,
    lifecycleActionRef.current,
    lifecycleBusyRef.current,
  ]);

  const handleNewConversation = useCallback(
    async (title?: string) => {
      const previousConversationId = activeConversationIdRef.current;
      const previousMessages = conversationMessagesRef.current;
      const previousCutoffTs = companionMessageCutoffTs;

      interruptActiveChatPipeline();
      resetConversationDraftState();

      try {
        const { conversation, greeting: inlineGreeting } =
          await client.createConversation(title, {
            bootstrapGreeting: true,
            lang: uiLanguage,
          });
        const nextCutoffTs = Date.now();
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversationId(conversation.id);
        activeConversationIdRef.current = conversation.id;
        setCompanionMessageCutoffTs(nextCutoffTs);
        // Try inline greeting first; fall back to dedicated greeting endpoint
        let greetingText = inlineGreeting?.text?.trim() || "";
        if (!greetingText) {
          try {
            const resp = await client.requestGreeting(
              conversation.id,
              uiLanguage,
            );
            greetingText = resp.text?.trim() || "";
          } catch {
            // Greeting generation failed — continue without greeting
          }
        }

        if (greetingText) {
          greetingFiredRef.current = true;
          const initMessages: ConversationMessage[] = [
            {
              id: `greeting-${Date.now()}`,
              role: "assistant",
              text: greetingText,
              timestamp: Date.now(),
              source: "agent_greeting",
            },
          ];
          conversationMessagesRef.current = initMessages;
          setConversationMessages(initMessages);
        } else {
          greetingFiredRef.current = false;
          conversationMessagesRef.current = [];
          setConversationMessages([]);
          // Fallback: if inline greeting wasn't returned (e.g. old server),
          // request one via the dedicated /greeting endpoint.
          void fetchGreeting(conversation.id);
        }
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: conversation.id,
        });
      } catch {
        setActiveConversationId(previousConversationId);
        activeConversationIdRef.current = previousConversationId;
        setConversationMessages(previousMessages);
        setCompanionMessageCutoffTs(previousCutoffTs);
        greetingFiredRef.current =
          hasConversationBootstrapMessage(previousMessages);
        if (previousConversationId) {
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: previousConversationId,
          });
        }
      }
    },
    [
      companionMessageCutoffTs,
      fetchGreeting,
      resetConversationDraftState,
      uiLanguage,
      activeConversationIdRef,
      conversationMessagesRef,
      greetingFiredRef,
      interruptActiveChatPipeline,
      setActiveConversationId,
      setCompanionMessageCutoffTs,
      setConversationMessages,
      setConversations,
    ],
  );


  useEffect(() => {
    if (uiShellMode !== "companion" || tab !== "companion") {
      companionStaleConversationRefreshRef.current = null;
      return;
    }

    if (!activeConversationId) {
      return;
    }

    if (!shouldStartFreshCompanionConversation(conversationMessages)) {
      companionStaleConversationRefreshRef.current = null;
      return;
    }

    if (companionStaleConversationRefreshRef.current === activeConversationId) {
      return;
    }

    companionStaleConversationRefreshRef.current = activeConversationId;
    void handleNewConversation();
  }, [
    activeConversationId,
    conversationMessages,
    handleNewConversation,
    tab,
    uiShellMode,
    companionStaleConversationRefreshRef,
  ]);

  const appendLocalCommandTurn = useCallback(
    (userText: string, assistantText: string) => {
      const now = Date.now();
      const nonce = Math.random().toString(36).slice(2, 8);
      setConversationMessages((prev: ConversationMessage[]) => [
        ...prev,
        {
          id: `local-user-${now}-${nonce}`,
          role: "user",
          text: userText,
          timestamp: now,
        },
        {
          id: `local-assistant-${now}-${nonce}`,
          role: "assistant",
          text: assistantText,
          timestamp: now,
          source: "local_command",
        },
      ]);
    },
    [setConversationMessages],
  );

  const tryHandlePrefixedChatCommand = useCallback(
    async (
      rawText: string,
    ): Promise<{ handled: boolean; rewrittenText?: string }> => {
      const slash = parseSlashCommandInput(rawText);
      if (slash) {
        const savedCommand = loadSavedCustomCommands().find(
          (command) => normalizeSlashCommandName(command.name) === slash.name,
        );
        if (savedCommand) {
          const rewrittenText = expandSavedCustomCommand(
            savedCommand.text,
            slash.argsRaw,
          );
          if (!rewrittenText.trim()) {
            appendLocalCommandTurn(
              rawText,
              `Saved command "/${slash.name}" is empty.`,
            );
            return { handled: true };
          }
          return { handled: false, rewrittenText };
        }

        if (slash.name === "commands") {
          const customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
          const customCommandNames = customActions
            .map((action) => `/${action.name.toLowerCase()}`)
            .sort();
          const savedCommandNames = loadSavedCustomCommands()
            .map((command) => `/${normalizeSlashCommandName(command.name)}`)
            .sort();
          const lines = [
            formatSearchBullet("Saved / commands", savedCommandNames),
            formatSearchBullet("Custom action / commands", customCommandNames),
            "Use #remember ... to save memory notes. Use #memory or #knowledge to target retrieval.",
            "Use $query for a quick, non-persistent context answer.",
          ];
          appendLocalCommandTurn(rawText, lines.join("\n\n"));
          return { handled: true };
        }

        let customActions: CustomActionDef[] = [];
        try {
          customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
        } catch {
          // If custom actions can't be loaded, fall back to normal slash routing.
          return { handled: false };
        }

        const customAction = customActions.find(
          (action) =>
            `/${normalizeCustomActionName(action.name).toLowerCase()}` ===
            slash.name,
        );
        if (customAction) {
          const { params, missingRequired } = parseCustomActionParams(
            customAction,
            slash.argsRaw,
          );
          if (missingRequired.length > 0) {
            appendLocalCommandTurn(
              rawText,
              `Missing required parameter(s): ${missingRequired.join(", ")}`,
            );
            return { handled: true };
          }

          const result = await client.testCustomAction(customAction.id, params);
          if (!result.ok) {
            appendLocalCommandTurn(
              rawText,
              `Custom action "${customAction.name}" failed: ${
                result.error ?? "unknown error"
              }`,
            );
            return { handled: true };
          }

          appendLocalCommandTurn(
            rawText,
            result.output?.trim() || `(no output from ${customAction.name})`,
          );
          return { handled: true };
        }
      }

      if (rawText.startsWith("#")) {
        const commandBody = rawText.slice(1).trim();
        if (!commandBody) {
          appendLocalCommandTurn(
            rawText,
            "Usage: #remember <text>, #memory <query>, #knowledge <query>, or #<query>.",
          );
          return { handled: true };
        }

        const lower = commandBody.toLowerCase();
        if (
          lower.startsWith("remember ") ||
          lower.startsWith("remmeber ") ||
          lower.startsWith("save ")
        ) {
          const memoryText = commandBody
            .replace(/^(remember|remmeber|save)\s+/i, "")
            .trim();
          if (!memoryText) {
            appendLocalCommandTurn(rawText, "Nothing to remember.");
            return { handled: true };
          }
          await client.rememberMemory(memoryText);
          appendLocalCommandTurn(rawText, `Saved memory note: "${memoryText}"`);
          return { handled: true };
        }

        let scope: "memory" | "knowledge" | "all" = "all";
        let query = commandBody;
        if (lower.startsWith("memory ")) {
          scope = "memory";
          query = commandBody.slice("memory ".length).trim();
        } else if (lower.startsWith("knowledge ")) {
          scope = "knowledge";
          query = commandBody.slice("knowledge ".length).trim();
        } else if (lower.startsWith("all ")) {
          scope = "all";
          query = commandBody.slice("all ".length).trim();
        }

        if (!query) {
          appendLocalCommandTurn(rawText, "Search query cannot be empty.");
          return { handled: true };
        }

        const [memoryResult, knowledgeResult] = await Promise.all([
          scope === "knowledge"
            ? Promise.resolve(null)
            : client.searchMemory(query, { limit: 6 }),
          scope === "memory"
            ? Promise.resolve(null)
            : client.searchKnowledge(query, { threshold: 0.2, limit: 6 }),
        ]);

        const memoryLines =
          memoryResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
          ) ?? [];
        const knowledgeLines =
          knowledgeResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
          ) ?? [];

        appendLocalCommandTurn(
          rawText,
          [
            scope === "memory"
              ? "Memory search"
              : scope === "knowledge"
                ? "Knowledge search"
                : "Memory + knowledge search",
            "",
            scope === "knowledge"
              ? ""
              : formatSearchBullet("Memories", memoryLines),
            scope === "memory"
              ? ""
              : formatSearchBullet("Knowledge", knowledgeLines),
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
        return { handled: true };
      }

      if (rawText.startsWith("$")) {
        const queryRaw = rawText.slice(1).trim();
        if (queryRaw) {
          appendLocalCommandTurn(
            rawText,
            "Use bare `$` only. `$ <text>` is not supported.",
          );
          return { handled: true };
        }
        const query =
          "What is most relevant from memory and knowledge right now?";

        const quick = await client.quickContext(query, { limit: 6 });
        const memoryLines = quick.memories.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
        );
        const knowledgeLines = quick.knowledge.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
        );
        appendLocalCommandTurn(
          rawText,
          [
            quick.answer,
            "",
            formatSearchBullet("Memories used", memoryLines),
            formatSearchBullet("Knowledge used", knowledgeLines),
          ].join("\n"),
        );
        return { handled: true };
      }

      return { handled: false };
    },
    [appendLocalCommandTurn],
  );

  const runQueuedChatSend = useCallback(
    async (turn: Omit<QueuedChatSend, "resolve" | "reject">) => {
      const hasAttachedImages = Boolean(turn.images?.length);
      const rawText = turn.rawInput.trim();
      if (!rawText && !hasAttachedImages) return;

      const channelType = turn.channelType;
      const conversationMode: ConversationMode =
        channelType === "VOICE_DM" || channelType === "VOICE_GROUP"
          ? "simple"
          : chatMode;
      const imagesToSend = turn.images;
      let controller: AbortController | null = null;

      let text = hasAttachedImages
        ? rawText || "Please review the attached image."
        : rawText;
      if (rawText) {
        let commandResult: { handled: boolean; rewrittenText?: string };
        try {
          commandResult = await tryHandlePrefixedChatCommand(rawText);
        } catch (err) {
          appendLocalCommandTurn(
            rawText,
            `Command failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
          return;
        }
        if (commandResult.handled) {
          return;
        }
        if (
          typeof commandResult.rewrittenText === "string" &&
          commandResult.rewrittenText.trim()
        ) {
          text = commandResult.rewrittenText.trim();
        }
      }

      let convId: string =
        turn.conversationId ?? activeConversationIdRef.current ?? "";
      if (!convId) {
        try {
          const { conversation } = await client.createConversation(undefined, {
            lang: uiLanguage,
          });
          const nextCutoffTs = Date.now();
          setConversations((prev) => [conversation, ...prev]);
          setActiveConversationId(conversation.id);
          activeConversationIdRef.current = conversation.id;
          setCompanionMessageCutoffTs(nextCutoffTs);
          convId = conversation.id;
        } catch {
          return;
        }
      }

      client.sendWsMessage({
        type: "active-conversation",
        conversationId: convId,
      });

      const activeConv = conversations.find((c) => c.id === convId);
      if (
        activeConv &&
        (!activeConv.title ||
          activeConv.title === "New Chat" ||
          activeConv.title === "companion.newChat" ||
          activeConv.title === "conversations.newChatTitle")
      ) {
        const fallbackTitle =
          text.length > 15 ? `${text.slice(0, 15)}...` : text;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, title: fallbackTitle } : c,
          ),
        );
      }

      const now = Date.now();
      const userMsgId = `temp-${now}`;
      const assistantMsgId = `temp-resp-${now}`;

      setCompanionMessageCutoffTs(now);
      setConversationMessages((prev: ConversationMessage[]) => [
        ...prev,
        { id: userMsgId, role: "user", text, timestamp: now },
        { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
      ]);
      setChatFirstTokenReceived(false);

      controller = new AbortController();
      chatAbortRef.current = controller;
      let streamedAssistantText = "";

      try {
        const data = await client.sendConversationMessageStream(
          convId,
          text,
          (token, accumulatedText) => {
            const nextText =
              typeof accumulatedText === "string"
                ? accumulatedText
                : mergeStreamingText(streamedAssistantText, token);
            if (nextText === streamedAssistantText) return;
            streamedAssistantText = nextText;
            setChatFirstTokenReceived(true);
            setConversationMessages((prev) =>
              prev.map((message) =>
                message.id !== assistantMsgId
                  ? message
                  : message.text === nextText
                    ? message
                    : { ...message, text: nextText },
              ),
            );
          },
          channelType,
          controller.signal,
          imagesToSend,
          conversationMode,
          turn.metadata,
        );

        if (!data.text.trim()) {
          setConversationMessages((prev) =>
            prev.filter((message) => message.id !== assistantMsgId),
          );
        } else if (
          shouldApplyFinalStreamText(streamedAssistantText, data.text)
        ) {
          setConversationMessages((prev) => {
            let changed = false;
            const next = prev.map((message) => {
              if (message.id !== assistantMsgId) return message;
              if (message.text === data.text) return message;
              changed = true;
              return { ...message, text: data.text };
            });
            return changed ? next : prev;
          });
        }
        if (data.usage) {
          setChatLastUsage({
            promptTokens: data.usage.promptTokens,
            completionTokens: data.usage.completionTokens,
            totalTokens: data.usage.totalTokens,
            model: data.usage.model,
            updatedAt: Date.now(),
          });
        }

        if (!data.completed && streamedAssistantText.trim()) {
          setConversationMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId
                ? { ...message, interrupted: true }
                : message,
            ),
          );
        }

        // Action callbacks can persist additional assistant turns that are not
        // mirrored by the optimistic streaming placeholder in local state.
        if (activeConversationIdRef.current === convId) {
          await loadConversationMessages(convId);
        }

        const userMessageCount = conversationMessagesRef.current.filter(
          (message) =>
            message.role === "user" && !message.id.startsWith("temp-"),
        ).length;

        if (userMessageCount === 1) {
          void client
            .renameConversation(convId, "", { generate: true })
            .then(() => {
              void loadConversations();
            });
        } else {
          void loadConversations();
        }

        if (elizaCloudEnabled || elizaCloudConnected) {
          void pollCloudCredits();
        }
      } catch (err) {
        const abortError = err as Error;
        if (abortError.name === "AbortError") {
          setConversationMessages((prev) =>
            prev.filter(
              (message) =>
                !(message.id === assistantMsgId && !message.text.trim()),
            ),
          );
          return;
        }

        const status = (err as { status?: number }).status;
        if (status === 404) {
          try {
            const { conversation } = await client.createConversation();
            const nextCutoffTs = Date.now();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            setCompanionMessageCutoffTs(nextCutoffTs);
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: conversation.id,
            });

            const retryData = await client.sendConversationMessage(
              conversation.id,
              text,
              channelType,
              imagesToSend,
              conversationMode,
            );
            setConversationMessages(
              filterRenderableConversationMessages([
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  text,
                  timestamp: Date.now(),
                },
                {
                  id: `temp-resp-${Date.now()}`,
                  role: "assistant",
                  text: retryData.text,
                  timestamp: Date.now(),
                },
              ]),
            );
          } catch {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
          }
        } else {
          await loadConversationMessages(convId);
        }
      } finally {
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
      }
    },
    [
      appendLocalCommandTurn,
      chatMode,
      loadConversationMessages,
      loadConversations,
      tryHandlePrefixedChatCommand,
      activeConversationIdRef,
      chatAbortRef,
      conversationMessagesRef.current.filter,
      conversations.find,
      setActiveConversationId,
      setChatFirstTokenReceived,
      setChatLastUsage,
      setCompanionMessageCutoffTs,
      setConversationMessages,
      setConversations,
      uiLanguage,
      elizaCloudEnabled,
      elizaCloudConnected,
      pollCloudCredits,
    ],
  );

  const flushQueuedChatSends = useCallback(async () => {
    if (chatSendBusyRef.current) return;
    chatSendBusyRef.current = true;
    setChatSending(true);

    try {
      while (chatSendQueueRef.current.length > 0) {
        const nextTurn = chatSendQueueRef.current.shift();
        if (!nextTurn) break;
        try {
          await runQueuedChatSend(nextTurn);
          nextTurn.resolve();
        } catch (err) {
          nextTurn.reject(err);
        }
      }
    } finally {
      chatSendBusyRef.current = false;
      setChatSending(false);
      setChatFirstTokenReceived(false);
    }
  }, [
    chatSendBusyRef,
    runQueuedChatSend,
    setChatFirstTokenReceived,
    setChatSending,
  ]);

  const sendChatText = useCallback(
    async (
      rawInput: string,
      options?: {
        channelType?: ConversationChannelType;
        conversationId?: string | null;
        images?: ImageAttachment[];
        metadata?: Record<string, unknown>;
      },
    ) => {
      const hasAttachedImages = Boolean(options?.images?.length);
      if (!rawInput.trim() && !hasAttachedImages) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        chatSendQueueRef.current.push({
          rawInput,
          channelType: options?.channelType ?? "DM",
          conversationId: options?.conversationId,
          images: options?.images,
          metadata: options?.metadata,
          resolve,
          reject,
        });
        setChatSending(true);
        void flushQueuedChatSends();
      });
    },
    [flushQueuedChatSends, setChatSending],
  );

  const handleChatSend = useCallback(
    async (channelType: ConversationChannelType = "DM") => {
      const claimedInput = chatInputRef.current;
      const imagesToSend = chatPendingImagesRef.current.length
        ? [...chatPendingImagesRef.current]
        : undefined;

      if (!claimedInput.trim() && !imagesToSend?.length) {
        return;
      }

      chatInputRef.current = "";
      chatPendingImagesRef.current = [];
      setChatInput("");
      setChatPendingImages([]);

      await sendChatText(claimedInput, {
        channelType,
        conversationId: activeConversationIdRef.current,
        images: imagesToSend,
      });
    },
    [
      activeConversationIdRef,
      chatInputRef,
      chatPendingImagesRef,
      sendChatText,
      setChatInput,
      setChatPendingImages,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: conversations omitted to limit rerenders
  const sendActionMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (chatSendBusyRef.current) return;
      chatSendBusyRef.current = true;
      const sendNonce = ++chatSendNonceRef.current;
      const conversationMode: ConversationMode = chatMode;
      let controller: AbortController | null = null;

      try {
        let convId: string = activeConversationId ?? "";
        if (!convId) {
          try {
            const actionTitle =
              trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
            const { conversation } = await client.createConversation(
              actionTitle || t("companion.newChat"),
            );
            const nextCutoffTs = Date.now();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            setCompanionMessageCutoffTs(nextCutoffTs);
            convId = conversation.id;
          } catch {
            return;
          }
        }

        client.sendWsMessage({
          type: "active-conversation",
          conversationId: convId,
        });

        // Eagerly rename "New Chat" using a snippet of the first message
        const activeConv = conversations.find((c) => c.id === convId);
        if (
          activeConv &&
          (!activeConv.title ||
            activeConv.title === "New Chat" ||
            activeConv.title === "companion.newChat" ||
            activeConv.title === "conversations.newChatTitle")
        ) {
          const fallbackTitle =
            trimmed.length > 15 ? `${trimmed.slice(0, 15)}...` : trimmed;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, title: fallbackTitle } : c,
            ),
          );
        }

        const now = Date.now();
        const userMsgId = `temp-action-${now}`;
        const assistantMsgId = `temp-action-resp-${now}`;

        setCompanionMessageCutoffTs(now);
        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          { id: userMsgId, role: "user", text: trimmed, timestamp: now },
          { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
        ]);
        setChatSending(true);
        setChatFirstTokenReceived(false);

        controller = new AbortController();
        chatAbortRef.current = controller;
        let streamedAssistantText = "";

        try {
          const data = await client.sendConversationMessageStream(
            convId,
            trimmed,
            (token, accumulatedText) => {
              const nextText =
                typeof accumulatedText === "string"
                  ? accumulatedText
                  : mergeStreamingText(streamedAssistantText, token);
              if (nextText === streamedAssistantText) return;
              streamedAssistantText = nextText;
              setChatFirstTokenReceived(true);
              setConversationMessages((prev) =>
                prev.map((message) =>
                  message.id !== assistantMsgId
                    ? message
                    : message.text === nextText
                      ? message
                      : { ...message, text: nextText },
                ),
              );
            },
            "DM",
            controller.signal,
            undefined,
            conversationMode,
          );

          if (!data.text.trim()) {
            setConversationMessages((prev) =>
              prev.filter((message) => message.id !== assistantMsgId),
            );
          } else if (
            shouldApplyFinalStreamText(streamedAssistantText, data.text)
          ) {
            setConversationMessages((prev) => {
              let changed = false;
              const next = prev.map((message) => {
                if (message.id !== assistantMsgId) return message;
                if (message.text === data.text) return message;
                changed = true;
                return { ...message, text: data.text };
              });
              return changed ? next : prev;
            });
          }

          if (!data.completed && streamedAssistantText.trim()) {
            setConversationMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMsgId
                  ? { ...message, interrupted: true }
                  : message,
              ),
            );
          }

          // Keep the visible thread authoritative when the server stores
          // additional action-generated messages during a successful send.
          if (activeConversationIdRef.current === convId) {
            await loadConversationMessages(convId);
          }

          void loadConversations();
          if (elizaCloudEnabled || elizaCloudConnected) {
            void pollCloudCredits();
          }
        } catch (err) {
          const abortError = err as Error;
          if (abortError.name === "AbortError") {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
            return;
          }
          await loadConversationMessages(convId);
        } finally {
          if (chatAbortRef.current === controller) {
            chatAbortRef.current = null;
          }
          if (chatSendNonceRef.current === sendNonce) {
            chatSendBusyRef.current = false;
            setChatSending(false);
            setChatFirstTokenReceived(false);
            if (chatSendQueueRef.current.length > 0) {
              void flushQueuedChatSends();
            }
          }
        }
      } finally {
        if (controller == null && chatSendNonceRef.current === sendNonce) {
          chatSendBusyRef.current = false;
          if (chatSendQueueRef.current.length > 0) {
            void flushQueuedChatSends();
          }
        }
      }
    },
    [
      chatMode,
      activeConversationId,
      chatSendQueueRef,
      elizaCloudEnabled,
      elizaCloudConnected,
      flushQueuedChatSends,
      loadConversationMessages,
      loadConversations,
      pollCloudCredits,
      uiLanguage,
    ],
  );

  const handleChatStop = useCallback(() => {
    interruptActiveChatPipeline();

    // Also stop any active PTY sessions — the user wants everything to halt
    for (const session of ptySessions) {
      client.stopCodingAgent(session.sessionId).catch(() => {});
    }
  }, [interruptActiveChatPipeline, ptySessions]);

  const handleChatRetry = useCallback(
    (assistantMsgId: string) => {
      let retryText: string | null = null;
      setConversationMessages((prev) => {
        // Find the interrupted assistant message
        const assistantIdx = prev.findIndex(
          (m) => m.id === assistantMsgId && m.role === "assistant",
        );
        if (assistantIdx < 0) return prev;

        // Find the preceding user message
        let userMsg: ConversationMessage | null = null;
        for (let i = assistantIdx - 1; i >= 0; i--) {
          if (prev[i].role === "user") {
            userMsg = prev[i];
            break;
          }
        }
        if (!userMsg) return prev;

        // Remove the interrupted assistant message
        const next = prev.filter((m) => m.id !== assistantMsgId);

        retryText = userMsg.text;

        return next;
      });
      if (retryText) {
        void sendChatText(retryText);
      }
    },
    [sendChatText, setConversationMessages],
  );

  const handleChatEdit = useCallback(
    async (messageId: string, text: string): Promise<boolean> => {
      const convId = activeConversationIdRef.current;
      const nextText = text.trim();
      if (!convId || !nextText) {
        return false;
      }

      let currentMessages = conversationMessagesRef.current;
      let messageIndex = currentMessages.findIndex(
        (message) => message.id === messageId && message.role === "user",
      );
      if (messageIndex < 0) {
        const loaded = await loadConversationMessages(convId);
        if (!loaded.ok) {
          return false;
        }
        currentMessages = conversationMessagesRef.current;
        messageIndex = currentMessages.findIndex(
          (message) => message.id === messageId && message.role === "user",
        );
      }
      if (messageIndex < 0) {
        return false;
      }

      const targetMessage = currentMessages[messageIndex];
      if (
        targetMessage.source === "local_command" ||
        targetMessage.id.startsWith("temp-")
      ) {
        return false;
      }

      interruptActiveChatPipeline();
      setChatInput("");

      const preservedMessages = currentMessages.slice(0, messageIndex);
      conversationMessagesRef.current = preservedMessages;
      setConversationMessages(preservedMessages);

      try {
        await client.truncateConversationMessages(convId, messageId, {
          inclusive: true,
        });
        await sendChatText(nextText, { conversationId: convId });
        return true;
      } catch (err) {
        await loadConversationMessages(convId);
        setActionNotice(
          `Failed to edit message: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
        return false;
      }
    },
    [
      loadConversationMessages,
      sendChatText,
      setActionNotice,
      activeConversationIdRef.current,
      conversationMessagesRef,
      interruptActiveChatPipeline,
      setChatInput,
      setConversationMessages,
    ],
  );

  const handleChatClear = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId) {
      setActionNotice("No active conversation to clear.", "info", 2200);
      return;
    }
    interruptActiveChatPipeline();
    try {
      await client.deleteConversation(convId);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversationMessages([]);
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
      await loadConversations();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setConversationMessages([]);
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
        await loadConversations();
        setActionNotice("Conversation was already cleared.", "info", 2600);
        return;
      }
      setActionNotice(
        `Failed to clear conversation: ${err instanceof Error ? err.message : "network error"}`,
        "error",
        4200,
      );
    }
  }, [
    activeConversationId,
    interruptActiveChatPipeline,
    loadConversations,
    setActionNotice,
    activeConversationIdRef,
    setActiveConversationId,
    setConversationMessages,
    setUnreadConversations,
  ]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      conversationHydrationEpochRef.current += 1;
      if (
        id === activeConversationId &&
        conversationMessagesRef.current.length > 0
      )
        return;

      interruptActiveChatPipeline();

      // Clean up empty conversations: if the previous conversation has only
      // system/greeting messages and no user messages, delete it silently.
      const prevId = activeConversationId;
      if (prevId && prevId !== id) {
        const prevMessages = conversationMessagesRef.current;
        const hasUserMessage = prevMessages.some((m) => m.role === "user");
        if (!hasUserMessage && prevMessages.length <= 1) {
          void client.deleteConversation(prevId).catch(() => {});
          setConversations((prev) => prev.filter((c) => c.id !== prevId));
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(prevId);
            return next;
          });
        }
      }

      const previousActive = activeConversationId;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      client.sendWsMessage({ type: "active-conversation", conversationId: id });
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const loaded = await loadConversationMessages(id);
      if (loaded.ok) return;

      if (loaded.status === 404) {
        const refreshed = await loadConversations();
        const fallbackId = refreshed?.[0]?.id ?? null;
        if (fallbackId) {
          setActiveConversationId(fallbackId);
          activeConversationIdRef.current = fallbackId;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: fallbackId,
          });
          const fallbackLoaded = await loadConversationMessages(fallbackId);
          if (!fallbackLoaded.ok) {
            setActionNotice(
              `Failed to load fallback conversation: ${fallbackLoaded.message}`,
              "error",
              4200,
            );
          }
        } else {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        setActionNotice(
          "Conversation was not found. Refreshed the conversation list.",
          "info",
          3200,
        );
        return;
      }

      setActiveConversationId(previousActive);
      activeConversationIdRef.current = previousActive;
      if (previousActive) {
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: previousActive,
        });
        const restored = await loadConversationMessages(previousActive);
        if (!restored.ok) {
          setActionNotice(
            `Failed to restore previous conversation: ${restored.message}`,
            "error",
            4200,
          );
        }
      } else {
        setConversationMessages([]);
      }
      setActionNotice(
        `Failed to load conversation: ${loaded.message}`,
        "error",
        4200,
      );
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
      activeConversationIdRef,
      conversationHydrationEpochRef,
      conversationMessagesRef.current,
      interruptActiveChatPipeline,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
      setUnreadConversations,
    ],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const deletingActive = activeConversationId === id;
      if (deletingActive) {
        interruptActiveChatPipeline();
      }
      try {
        await client.deleteConversation(id);
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== id),
        );
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (deletingActive) {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        const refreshed = await loadConversations();
        if (deletingActive) {
          const fallbackId = refreshed?.[0]?.id ?? null;
          if (fallbackId) {
            setActiveConversationId(fallbackId);
            activeConversationIdRef.current = fallbackId;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: fallbackId,
            });
            const fallbackLoaded = await loadConversationMessages(fallbackId);
            if (!fallbackLoaded.ok) {
              setActionNotice(
                `Failed to load fallback conversation: ${fallbackLoaded.message}`,
                "error",
                4200,
              );
            }
          }
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          setConversations((prev) =>
            prev.filter((conversation) => conversation.id !== id),
          );
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (deletingActive) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
            setConversationMessages([]);
          }
          await loadConversations();
          setActionNotice(
            "Conversation was already deleted. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to delete conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [
      activeConversationId,
      interruptActiveChatPipeline,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
      activeConversationIdRef,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
      setUnreadConversations,
    ],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        setActionNotice("Conversation title cannot be empty.", "error", 2800);
        return;
      }
      try {
        const { conversation } = await client.renameConversation(id, trimmed);
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to rename conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [loadConversations, setActionNotice, setConversations],
  );

  const suggestConversationTitle = useCallback(
    async (id: string) => {
      try {
        const { conversation } = await client.renameConversation(id, "", {
          generate: true,
        });
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
        const next = conversation.title?.trim();
        return next && next.length > 0 ? next : null;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return null;
        }
        setActionNotice(
          `Failed to suggest conversation title: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
        return null;
      }
    },
    [loadConversations, setActionNotice, setConversations],
  );

  return {
    fetchGreeting,
    requestGreetingWhenRunning,
    hydrateInitialConversationState,
    handleStartDraftConversation,
    handleStart,
    handleStop,
    handleRestart,
    triggerRestart,
    retryBackendConnection,
    restartBackend,
    relaunchDesktop,
    showDesktopNotification,
    notifyHeartbeatEvent,
    completeResetLocalStateAfterServerWipe,
    handleResetAppliedFromMain,
    handleReset,
    handleNewConversation,
    appendLocalCommandTurn,
    tryHandlePrefixedChatCommand,
    sendChatText,
    handleChatSend,
    sendActionMessage,
    handleChatStop,
    handleChatRetry,
    handleChatEdit,
    handleChatClear,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    suggestConversationTitle,
  };
}
