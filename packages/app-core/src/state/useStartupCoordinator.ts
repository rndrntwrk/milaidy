/**
 * useStartupCoordinator — React hook that drives the StartupCoordinator
 * state machine with side effects.
 *
 * This hook is the SOLE startup authority. It:
 * 1. Uses useReducer with the coordinator's startupReducer
 * 2. Runs side effects in useEffect based on the current phase
 * 3. Dispatches events as async operations complete
 * 4. Syncs coordinator state to the legacy lifecycle setters
 *
 * Architecture: Each phase has its own useEffect. One-time hydration work runs
 * in the "hydrating" effect. Persistent WS bindings and navigation listeners
 * are set up in a separate "ready" effect that only cleans up on unmount (not
 * on phase transitions).
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
  type CodingAgentSession,
  type Conversation,
  type ConversationMessage,
  type OnboardingOptions,
  type StreamEventEnvelope,
  client,
} from "../api";
import {
  getBackendStartupTimeoutMs,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
  scanProviderCredentials,
} from "../bridge";
import { mapServerTasksToSessions } from "../coding";
import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import {
  type AppEmoteEventDetail,
  dispatchAppEmoteEvent,
} from "../events";
import {
  asApiLikeError,
  clearPersistedOnboardingStep,
  deriveOnboardingResumeConnection,
  deriveOnboardingResumeFields,
  formatStartupErrorDetail,
  inferOnboardingResumeStep,
  loadAvatarIndex,
  loadPersistedOnboardingStep,
  normalizeAvatarIndex,
  parseAgentStatusEvent,
  parseProactiveMessageEvent,
  parseStreamEventEnvelopeEvent,
  type StartupErrorState,
} from "./internal";
import {
  detectExistingOnboardingConnection,
  deriveDetectedProviderPrefill,
  resolveStartupWithoutRestoredConnection,
} from "./onboarding-bootstrap";
import {
  loadPersistedConnectionMode,
  loadPersistedOnboardingComplete,
  savePersistedConnectionMode,
} from "./persistence";
import {
  computeAgentDeadlineExtensions,
  getAgentReadyTimeoutMs,
} from "./agent-startup-timing";
import { resolveApiUrl } from "../utils";
import {
  COMPANION_ENABLED,
  isRouteRootPath,
  tabFromPath,
  type Tab,
} from "../navigation";
import { shouldStartAtCharacterSelectOnLaunch } from "./shell-routing";
import {
  INITIAL_STARTUP_STATE,
  connectionModeToTarget,
  createDesktopPolicy,
  createWebPolicy,
  isStartupLoading,
  isStartupTerminal,
  startupReducer,
  toLegacyStartupPhase,
  type PlatformPolicy,
  type RuntimeTarget,
  type StartupEvent,
  type StartupState,
} from "./startup-coordinator";
import type { UiLanguage } from "../i18n";
import type { OnboardingMode, OnboardingStep } from "./types";

// ── Local helpers ────────────────────────────────────────────────────

function normalizeAppEmoteEvent(
  data: Record<string, unknown>,
): AppEmoteEventDetail | null {
  const emoteId = typeof data.emoteId === "string" ? data.emoteId : null;
  const path =
    typeof data.path === "string"
      ? data.path
      : typeof data.glbPath === "string"
        ? data.glbPath
        : null;
  if (!emoteId || !path) return null;
  return {
    emoteId,
    path,
    duration:
      typeof data.duration === "number" && Number.isFinite(data.duration)
        ? data.duration
        : 3,
    loop: data.loop === true,
    showOverlay: data.showOverlay !== false,
  };
}

function detectPlatformPolicy(): PlatformPolicy {
  if (isElectrobunRuntime()) return createDesktopPolicy();
  return createWebPolicy();
}

const DEFAULT_LANDING_TAB: Tab = COMPANION_ENABLED ? "companion" : "chat";

function getNavigationPathFromWindow(): string {
  if (typeof window === "undefined") return "/";
  if (window.location.protocol === "file:") {
    return window.location.hash.replace(/^#/, "") || "/";
  }
  return window.location.pathname || "/";
}

// ── Deps interface ──────────────────────────────────────────────────

export interface StartupCoordinatorDeps {
  setConnected: (v: boolean) => void;
  setAgentStatus: (v: AgentStatus | null) => void;
  setAgentStatusIfChanged: (v: AgentStatus) => void;
  setStartupPhase: (v: "starting-backend" | "initializing-agent" | "ready") => void;
  setStartupError: (v: StartupErrorState | null) => void;
  setAuthRequired: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingLoading: (v: boolean) => void;
  setPendingRestart: (v: boolean | ((prev: boolean) => boolean)) => void;
  setPendingRestartReasons: (v: string[] | ((prev: string[]) => string[])) => void;
  setSystemWarnings: (v: string[] | ((prev: string[]) => string[])) => void;
  showRestartBanner: () => void;
  setPairingEnabled: (v: boolean) => void;
  setPairingExpiresAt: (v: number | null) => void;
  setOnboardingOptions: (v: OnboardingOptions) => void;
  setOnboardingExistingInstallDetected: (v: boolean) => void;
  setOnboardingStep: (v: OnboardingStep) => void;
  setOnboardingRunMode: (v: "local" | "cloud" | "") => void;
  setOnboardingCloudProvider: (v: string) => void;
  setOnboardingProvider: (v: string) => void;
  setOnboardingVoiceProvider: (v: string) => void;
  setOnboardingApiKey: (v: string) => void;
  setOnboardingPrimaryModel: (v: string) => void;
  setOnboardingOpenRouterModel: (v: string) => void;
  setOnboardingRemoteConnected: (v: boolean) => void;
  setOnboardingRemoteApiBase: (v: string) => void;
  setOnboardingRemoteToken: (v: string) => void;
  setOnboardingSmallModel: (v: string) => void;
  setOnboardingLargeModel: (v: string) => void;
  applyDetectedProviders: (detected: Awaited<ReturnType<typeof scanProviderCredentials>>) => void;
  hydrateInitialConversationState: () => Promise<string | null>;
  loadWorkbench: () => Promise<void>;
  loadPlugins: () => Promise<void>;
  loadSkills: () => Promise<void>;
  loadCharacter: () => Promise<void>;
  loadWalletConfig: () => Promise<void>;
  loadInventory: () => Promise<void>;
  loadUpdateStatus: (force?: boolean) => Promise<void>;
  checkExtensionStatus: () => Promise<void>;
  pollCloudCredits: () => void;
  fetchAutonomyReplay: () => Promise<void>;
  appendAutonomousEvent: (event: StreamEventEnvelope) => void;
  notifyHeartbeatEvent: (event: StreamEventEnvelope) => void;
  setSelectedVrmIndex: (v: number) => void;
  setCustomVrmUrl: (v: string) => void;
  setCustomBackgroundUrl: (v: string) => void;
  // biome-ignore lint/suspicious/noExplicitAny: WalletAddresses type from agent contracts
  setWalletAddresses: (v: any) => void;
  setPtySessions: (v: CodingAgentSession[] | ((prev: CodingAgentSession[]) => CodingAgentSession[])) => void;
  setTab: (t: Tab) => void;
  setTabRaw: (t: Tab) => void;
  setConversationMessages: (v: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void;
  setUnreadConversations: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setConversations: (v: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  requestGreetingWhenRunningRef: React.RefObject<(convId: string) => Promise<void>>;
  onboardingResumeConnectionRef: React.MutableRefObject<ReturnType<typeof deriveOnboardingResumeConnection> | null>;
  onboardingCompletionCommittedRef: React.MutableRefObject<boolean>;
  forceLocalBootstrapRef: React.MutableRefObject<boolean>;
  initialTabSetRef: React.MutableRefObject<boolean>;
  activeConversationIdRef: React.RefObject<string | null>;
  // biome-ignore lint/suspicious/noExplicitAny: interval ref typing varies by runtime
  elizaCloudPollInterval: React.MutableRefObject<any>;
  // biome-ignore lint/suspicious/noExplicitAny: interval ref typing varies by runtime
  elizaCloudLoginPollTimer: React.MutableRefObject<any>;
  uiLanguage: UiLanguage;
  onboardingMode: OnboardingMode;
}

// ── Handle ──────────────────────────────────────────────────────────

export interface StartupCoordinatorHandle {
  state: StartupState;
  dispatch: (event: StartupEvent) => void;
  retry: () => void;
  pairingSuccess: () => void;
  onboardingComplete: () => void;
  policy: PlatformPolicy;
  legacyPhase: "starting-backend" | "initializing-agent" | "ready";
  loading: boolean;
  terminal: boolean;
  target: RuntimeTarget | null;
  phase: StartupState["phase"];
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStartupCoordinator(
  deps?: StartupCoordinatorDeps,
): StartupCoordinatorHandle {
  const [state, dispatch] = useReducer(startupReducer, INITIAL_STARTUP_STATE);
  const policy = useRef(detectPlatformPolicy()).current;
  const effectRunRef = useRef(0);

  // Deps ref — effects always access latest deps without re-triggering
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const depsReady = deps != null;

  // Session context carried between restoring-session and polling-backend
  // biome-ignore lint/suspicious/noExplicitAny: mixed connection types from legacy code
  const _ctx = useRef<{
    persistedConnection: ReturnType<typeof loadPersistedConnectionMode>;
    restoredConnection: any;
    shouldPreserveCompletedOnboarding: boolean;
    hadPriorOnboarding: boolean;
  } | null>(null);

  // Track whether the ready-phase WS bindings have been set up
  const wsBindingsActiveRef = useRef(false);

  // ── Phase: restoring-session ────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "restoring-session" || !depsReady) return;
    const d = depsRef.current!;
    effectRunRef.current += 1;
    const runId = effectRunRef.current;
    let cancelled = false;

    d.setStartupError(null);
    d.setStartupPhase("starting-backend");
    d.setAuthRequired(false);
    d.setConnected(false);
    d.setOnboardingExistingInstallDetected(false);

    (async () => {
      const d = depsRef.current!;
      const forceLocal = d.forceLocalBootstrapRef.current;
      d.forceLocalBootstrapRef.current = false;
      const persisted = loadPersistedConnectionMode();
      const hadPrior = loadPersistedOnboardingComplete();
      if (cancelled) return;

      const desktopInstall =
        !persisted && isElectrobunRuntime()
          ? await inspectExistingElizaInstall().catch(() => null)
          : null;
      if (cancelled) return;

      // Determine if there's real evidence of a prior install — persisted
      // onboarding completion OR desktop install inspection found something.
      // Without evidence, this is a fresh install and must show onboarding.
      const isDesktop = forceLocal || isElectrobunRuntime();
      const hasExistingEvidence = hadPrior || Boolean(desktopInstall?.detected);

      // Only probe the API when we have evidence of a prior install but no
      // persisted connection mode. A fresh install (no config, no prior
      // onboarding) skips the probe entirely — the running API with default
      // config is NOT evidence of a completed setup.
      const probed =
        !persisted && hasExistingEvidence
          ? await detectExistingOnboardingConnection({
              client,
              timeoutMs: isDesktop
                ? Math.min(getBackendStartupTimeoutMs(), 30_000)
                : Math.min(getBackendStartupTimeoutMs(), 3_500),
            })
          : null;
      if (cancelled) return;

      const restored = persisted ?? probed?.connection ?? null;
      const preserveCompleted = hadPrior && !d.onboardingCompletionCommittedRef.current;

      d.setOnboardingExistingInstallDetected(
        Boolean(hadPrior || desktopInstall?.detected || probed?.detectedExistingInstall),
      );

      if (!restored) {
        const result = resolveStartupWithoutRestoredConnection({ hadPersistedOnboardingCompletion: hadPrior });
        if (result.kind === "startup-error") {
          d.setOnboardingComplete(true);
          d.setStartupError(result.error);
          d.setOnboardingLoading(false);
          dispatch({ type: "NO_SESSION", hadPriorOnboarding: true });
          return;
        }
        d.setOnboardingOptions({
          names: [], styles: getStylePresets(d.uiLanguage),
          providers: [...ONBOARDING_PROVIDER_CATALOG] as OnboardingOptions["providers"],
          cloudProviders: [], models: { small: [], large: [] }, inventoryProviders: [], sharedStyleRules: "",
        });
        try { const det = await scanProviderCredentials(); if (!cancelled) d.applyDetectedProviders(det); } catch {}
        d.setStartupPhase("ready");
        d.setOnboardingComplete(false);
        d.setOnboardingLoading(false);
        dispatch({ type: "NO_SESSION", hadPriorOnboarding: false });
        return;
      }

      // Configure client for restored connection
      if (restored.runMode === "cloud" && restored.cloudApiBase) {
        client.setBaseUrl(restored.cloudApiBase);
        if (restored.cloudAuthToken) client.setToken(restored.cloudAuthToken);
      } else if (restored.runMode === "remote" && restored.remoteApiBase) {
        client.setBaseUrl(restored.remoteApiBase);
        if (restored.remoteAccessToken) client.setToken(restored.remoteAccessToken);
      } else if (restored.runMode === "local") {
        try { await invokeDesktopBridgeRequest({ rpcMethod: "agentStart", ipcChannel: "agent:start" }); } catch {}
      }

      _ctx.current = { persistedConnection: persisted, restoredConnection: restored, shouldPreserveCompletedOnboarding: preserveCompleted, hadPriorOnboarding: hadPrior };
      dispatch({ type: "SESSION_RESTORED", target: connectionModeToTarget(restored.runMode) });
    })();

    return () => { cancelled = true; };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Phase: resolving-target (auto-advance) ──────────────────────
  useEffect(() => {
    if (state.phase !== "resolving-target") return;
    dispatch({ type: "BACKEND_POLL_RETRY" });
  }, [state.phase]);

  // ── Phase: polling-backend ──────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "polling-backend" || !depsReady) return;
    const runId = effectRunRef.current;
    let cancelled = false;
    let tid: ReturnType<typeof setTimeout> | null = null;
    const ctx = _ctx.current;

    const describeBackendFailure = (err: unknown, timedOut: boolean): StartupErrorState => {
      const apiErr = asApiLikeError(err);
      if (apiErr?.kind === "http" && apiErr.status === 404)
        return { reason: "backend-unreachable", phase: "starting-backend", message: "Backend API routes are unavailable on this origin (received 404).", detail: formatStartupErrorDetail(err), status: apiErr.status, path: apiErr.path };
      if (timedOut || apiErr?.kind === "timeout")
        return { reason: "backend-timeout", phase: "starting-backend", message: `Backend did not become reachable within ${Math.round(getBackendStartupTimeoutMs() / 1000)}s.`, detail: formatStartupErrorDetail(err), status: apiErr?.status, path: apiErr?.path };
      return { reason: "backend-unreachable", phase: "starting-backend", message: "Failed to reach backend during startup.", detail: formatStartupErrorDetail(err), status: apiErr?.status, path: apiErr?.path };
    };

    (async () => {
      const deadline = Date.now() + policy.backendTimeoutMs;
      let attempts = 0;
      let lastErr: unknown = null;
      let latestAuth = { required: false, pairingEnabled: false, expiresAt: null as number | null };

      while (!cancelled && effectRunRef.current === runId) {
        const d = depsRef.current!;
        if (Date.now() >= deadline) { d.setStartupError(describeBackendFailure(lastErr, true)); d.setOnboardingLoading(false); dispatch({ type: "BACKEND_TIMEOUT" }); return; }
        try {
          const auth = await client.getAuthStatus();
          latestAuth = auth;
          if (cancelled) return;
          if (auth.required && !client.hasToken()) {
            d.setAuthRequired(true); d.setPairingEnabled(auth.pairingEnabled); d.setPairingExpiresAt(auth.expiresAt);
            d.setStartupPhase("ready"); d.setOnboardingLoading(false);
            dispatch({ type: "BACKEND_AUTH_REQUIRED" }); return;
          }
          const { complete } = await client.getOnboardingStatus();
          if (cancelled) return;
          let sessionComplete = complete || d.onboardingCompletionCommittedRef.current || (ctx?.shouldPreserveCompletedOnboarding ?? false);

          // If the backend says onboarding is "complete" but there's no
          // persisted connection mode AND no cloud auth, force re-onboarding.
          // This catches the case where the upstream runtime auto-creates a
          // default agent (onboarding: complete) but the user never actually
          // went through the setup flow.
          if (sessionComplete && !ctx?.persistedConnection && !ctx?.hadPriorOnboarding) {
            try {
              const cloudStatus = await client.getCloudStatus();
              if (!cloudStatus.connected && !cloudStatus.hasApiKey) {
                console.log("[milady][startup] Backend reports complete but no cloud auth — requiring cloud login");
                d.setOnboardingLoading(false);
                dispatch({ type: "CLOUD_LOGIN_REQUIRED" });
                return;
              }
            } catch {
              d.setOnboardingLoading(false);
              dispatch({ type: "CLOUD_LOGIN_REQUIRED" });
              return;
            }
          }

          if (complete && sessionComplete) { clearPersistedOnboardingStep(); d.onboardingResumeConnectionRef.current = null; }
          if (sessionComplete && !ctx?.persistedConnection && ctx?.restoredConnection)
            savePersistedConnectionMode(ctx.restoredConnection);
          if (!complete && ctx?.shouldPreserveCompletedOnboarding)
            console.warn("[milady][startup:init] Preserving completed onboarding despite incomplete backend onboarding status.");
          d.setOnboardingComplete(sessionComplete);

          if (!sessionComplete) {
            // Fetch onboarding options
            const optDeadline = Date.now() + getBackendStartupTimeoutMs();
            let optErr: unknown = null;
            while (!cancelled && effectRunRef.current === runId) {
              if (Date.now() >= optDeadline) {
                d.setStartupError(describeBackendFailure(optErr, true)); d.setOnboardingLoading(false);
                dispatch({ type: "BACKEND_TIMEOUT" }); return;
              }
              try {
                const [options, config] = await Promise.all([client.getOnboardingOptions(), client.getConfig().catch(() => null)]);
                if (d.onboardingCompletionCommittedRef.current) {
                  d.setStartupPhase("ready"); d.setOnboardingLoading(false); dispatch({ type: "ONBOARDING_COMPLETE" }); return;
                }
                const rc = deriveOnboardingResumeConnection(config);
                const rf = deriveOnboardingResumeFields(rc);
                d.onboardingResumeConnectionRef.current = rc;
                d.setOnboardingOptions({ ...options, styles: options.styles.length > 0 ? options.styles : getStylePresets(d.uiLanguage) });
                if (!rc) { try { const det = await scanProviderCredentials(); if (det.length > 0) d.applyDetectedProviders(det); } catch {} }
                if (rf.onboardingRunMode !== undefined) d.setOnboardingRunMode(rf.onboardingRunMode as "local" | "cloud" | "");
                if (rf.onboardingCloudProvider !== undefined) d.setOnboardingCloudProvider(rf.onboardingCloudProvider);
                if (rf.onboardingProvider !== undefined) d.setOnboardingProvider(rf.onboardingProvider);
                if (rf.onboardingVoiceProvider !== undefined) d.setOnboardingVoiceProvider(rf.onboardingVoiceProvider);
                if (rf.onboardingApiKey !== undefined) d.setOnboardingApiKey(rf.onboardingApiKey);
                if (rf.onboardingPrimaryModel !== undefined) d.setOnboardingPrimaryModel(rf.onboardingPrimaryModel);
                if (rf.onboardingOpenRouterModel !== undefined) d.setOnboardingOpenRouterModel(rf.onboardingOpenRouterModel);
                if (rf.onboardingRemoteConnected !== undefined) d.setOnboardingRemoteConnected(rf.onboardingRemoteConnected);
                if (rf.onboardingRemoteApiBase !== undefined) d.setOnboardingRemoteApiBase(rf.onboardingRemoteApiBase);
                if (rf.onboardingRemoteToken !== undefined) d.setOnboardingRemoteToken(rf.onboardingRemoteToken);
                if (rf.onboardingSmallModel !== undefined) d.setOnboardingSmallModel(rf.onboardingSmallModel);
                if (rf.onboardingLargeModel !== undefined) d.setOnboardingLargeModel(rf.onboardingLargeModel);
                d.setOnboardingStep(inferOnboardingResumeStep({ persistedStep: loadPersistedOnboardingStep(), config }));
                d.setStartupPhase("ready"); d.setOnboardingLoading(false);
                dispatch({ type: "BACKEND_REACHED", onboardingComplete: false }); return;
              } catch (err) {
                const ae = asApiLikeError(err);
                if (ae?.status === 401 && client.hasToken()) { client.setToken(null); d.setAuthRequired(true); d.setPairingEnabled(latestAuth.pairingEnabled); d.setPairingExpiresAt(latestAuth.expiresAt); d.setStartupPhase("ready"); d.setOnboardingLoading(false); dispatch({ type: "BACKEND_AUTH_REQUIRED" }); return; }
                if (ae?.status === 404) { d.setStartupError(describeBackendFailure(err, false)); d.setOnboardingLoading(false); dispatch({ type: "BACKEND_NOT_FOUND" }); return; }
                optErr = err;
                await new Promise<void>(r => { tid = setTimeout(r, 500); });
              }
            }
            return;
          }
          dispatch({ type: "BACKEND_REACHED", onboardingComplete: true }); return;
        } catch (err) {
          const ae = asApiLikeError(err);
          if (ae?.status === 401 && client.hasToken()) { client.setToken(null); depsRef.current!.setAuthRequired(true); depsRef.current!.setPairingEnabled(latestAuth.pairingEnabled); depsRef.current!.setPairingExpiresAt(latestAuth.expiresAt); depsRef.current!.setStartupPhase("ready"); depsRef.current!.setOnboardingLoading(false); dispatch({ type: "BACKEND_AUTH_REQUIRED" }); return; }
          if (ae?.status === 404) { depsRef.current!.setStartupError(describeBackendFailure(err, false)); depsRef.current!.setOnboardingLoading(false); dispatch({ type: "BACKEND_NOT_FOUND" }); return; }
          lastErr = err; attempts++;
          const delay = Math.min(250 * 2 ** Math.min(attempts, 2), 1000);
          await new Promise<void>(r => { tid = setTimeout(r, delay); });
        }
      }
    })();

    return () => { cancelled = true; if (tid) clearTimeout(tid); };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, policy.backendTimeoutMs, depsReady]);

  // ── Phase: starting-runtime ─────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "starting-runtime" || !depsReady) return;
    const runId = effectRunRef.current;
    let cancelled = false;
    let tid: ReturnType<typeof setTimeout> | null = null;
    depsRef.current!.setStartupPhase("initializing-agent");

    const describeAgentFailure = (err: unknown, timedOut: boolean, diag?: AgentStartupDiagnostics): StartupErrorState => {
      const detail = diag?.lastError || formatStartupErrorDetail(err) || "Agent runtime did not report a reason.";
      if (!timedOut && /required companion assets could not be loaded|bundled avatar .* could not be loaded/i.test(detail))
        return { reason: "asset-missing", phase: "initializing-agent", message: "Required companion assets could not be loaded.", detail };
      if (timedOut) {
        const hint = "First-time startup often downloads a local embedding model (GGUF, hundreds of MB). That can take many minutes on a slow network.\n\nIf logs still show a download in progress, wait for it to finish, then tap Retry. On desktop, the app keeps extending the wait while the agent stays in \"starting\" (up to 15 minutes total).";
        const emb = diag?.embeddingDetail ?? (diag?.embeddingPhase === "downloading" ? "Embedding model download in progress." : undefined);
        return { reason: "agent-timeout", phase: "initializing-agent", message: "The agent did not become ready in time. This is common while a large embedding model (GGUF) is still downloading on first run.", detail: [detail, emb, hint].filter((b): b is string => typeof b === "string" && b.trim().length > 0).join("\n\n") };
      }
      return { reason: "agent-error", phase: "initializing-agent", message: "Agent runtime reported a startup error.", detail };
    };

    (async () => {
      const started = Date.now();
      let deadline = started + getAgentReadyTimeoutMs();
      let lastErr: unknown = null;
      let lastDiag: AgentStartupDiagnostics | undefined;

      while (!cancelled && effectRunRef.current === runId) {
        const d = depsRef.current!;
        if (Date.now() >= deadline) { d.setStartupError(describeAgentFailure(lastErr, true, lastDiag)); d.setOnboardingLoading(false); dispatch({ type: "AGENT_TIMEOUT" }); return; }
        try {
          let status = await client.getStatus();
          d.setAgentStatus(status); d.setConnected(true); lastDiag = status.startup;
          deadline = computeAgentDeadlineExtensions({ agentWaitStartedAt: started, agentDeadlineAt: deadline, state: status.state });
          if (status.pendingRestart) { d.setPendingRestart(true); d.setPendingRestartReasons(status.pendingRestartReasons ?? []); }
          if (status.state === "not_started" || status.state === "stopped") {
            try { status = await client.startAgent(); d.setAgentStatus(status); lastDiag = status.startup; } catch (e) { lastErr = e; }
          }
          if (status.state === "running") { dispatch({ type: "AGENT_RUNNING" }); return; }
          if (status.state === "error") { d.setStartupError(describeAgentFailure(lastErr, false, status.startup)); d.setOnboardingLoading(false); dispatch({ type: "AGENT_ERROR", message: status.startup?.lastError ?? "Agent failed to start" }); return; }
        } catch (err) {
          const ae = asApiLikeError(err);
          if (ae?.status === 401 && client.hasToken()) { client.setToken(null); depsRef.current!.setAuthRequired(true); depsRef.current!.setOnboardingLoading(false); dispatch({ type: "BACKEND_AUTH_REQUIRED" }); return; }
          lastErr = err; depsRef.current!.setConnected(false);
        }
        await new Promise<void>(r => { tid = setTimeout(r, 500); });
      }
    })();

    return () => { cancelled = true; if (tid) clearTimeout(tid); };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Phase: hydrating — one-time data load, then HYDRATION_COMPLETE ─
  useEffect(() => {
    if (state.phase !== "hydrating" || !depsReady) return;
    let cancelled = false;
    const warn = (scope: string, err: unknown) => console.warn(`[milady][startup:init] ${scope}`, err);

    (async () => {
      const d = depsRef.current!;
      d.setStartupError(null);
      const greetConvId = await d.hydrateInitialConversationState();
      d.setStartupPhase("ready");
      d.setOnboardingLoading(false);
      if (greetConvId) void d.requestGreetingWhenRunningRef.current(greetConvId);

      void d.loadWorkbench();
      void d.loadPlugins();
      void d.loadCharacter();

      // Wallet addresses
      try { d.setWalletAddresses(await client.getWalletAddresses()); } catch (e) { warn("wallet addresses", e); }

      // Avatar / VRM selection
      let resolvedIdx = loadAvatarIndex();
      try {
        const stream = await client.getStreamSettings();
        const si = stream.settings?.avatarIndex;
        if (typeof si === "number" && Number.isFinite(si)) { resolvedIdx = normalizeAvatarIndex(si); d.setSelectedVrmIndex(resolvedIdx); }
      } catch (e) { warn("stream settings avatar", e); }
      if (resolvedIdx === 0) {
        if (await client.hasCustomVrm()) d.setCustomVrmUrl(resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`));
        else d.setSelectedVrmIndex(1);
        if (await client.hasCustomBackground()) d.setCustomBackgroundUrl(resolveApiUrl(`/api/avatar/background?t=${Date.now()}`));
      }

      void d.pollCloudCredits();
      await d.fetchAutonomyReplay();

      // Tab routing
      const navPath = getNavigationPathFromWindow();
      const urlTab = tabFromPath(navPath);
      const isRoot = isRouteRootPath(navPath);
      const shouldCharSelect = d.onboardingCompletionCommittedRef.current || shouldStartAtCharacterSelectOnLaunch({ onboardingNeedsOptions: false, onboardingMode: d.onboardingMode, navPath, urlTab });
      if (!d.initialTabSetRef.current) {
        d.initialTabSetRef.current = true;
        if (shouldCharSelect) { d.onboardingCompletionCommittedRef.current = false; d.setTab("character-select"); void d.loadCharacter(); }
        else if (isRoot) d.setTab(DEFAULT_LANDING_TAB);
      }
      if (urlTab && urlTab !== "chat" && urlTab !== "companion") {
        d.setTabRaw(urlTab);
        if (urlTab === "plugins" || urlTab === "connectors") { void d.loadPlugins(); if (urlTab === "plugins") void d.loadSkills(); }
        if (urlTab === "settings") { void d.checkExtensionStatus(); void d.loadWalletConfig(); void d.loadCharacter(); void d.loadUpdateStatus(); void d.loadPlugins(); }
        if (urlTab === "character" || urlTab === "character-select") void d.loadCharacter();
        if (urlTab === "wallets") void d.loadInventory();
      }

      if (!cancelled) dispatch({ type: "HYDRATION_COMPLETE" });
    })();

    return () => { cancelled = true; };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Ready phase — persistent WS bindings + nav listener ─────────
  // This effect runs once when the coordinator reaches "ready" and stays
  // active until the component unmounts. It does NOT depend on state.phase
  // after the guard, so phase transitions won't clean up WS bindings.
  const readyPhaseReached = state.phase === "ready";

  useEffect(() => {
    if (!readyPhaseReached || !depsReady) return;
    if (wsBindingsActiveRef.current) return; // Already bound
    wsBindingsActiveRef.current = true;

    let ptyPollInterval: ReturnType<typeof setInterval> | null = null;
    let handleVis: (() => void) | null = null;

    const hydratePty = () => {
      client.getCodingAgentStatus().then(s => { if (s?.tasks) depsRef.current?.setPtySessions(mapServerTasksToSessions(s.tasks)); }).catch(() => {});
    };
    hydratePty();
    let ptyHydratedViaWs = false;
    ptyPollInterval = setInterval(hydratePty, 5_000);

    client.connectWs();

    const unbindEmotes = client.onWsEvent("emote", (data: Record<string, unknown>) => { const e = normalizeAppEmoteEvent(data); if (e) dispatchAppEmoteEvent(e); });
    const unbindWsReconnect = client.onWsEvent("ws-reconnected", () => hydratePty());
    const unbindSysWarn = client.onWsEvent("system-warning", (data: Record<string, unknown>) => {
      const msg = typeof data.message === "string" ? data.message : "";
      if (msg) depsRef.current?.setSystemWarnings((prev: string[]) => { if (prev.includes(msg)) return prev; const n = [...prev, msg]; if (n.length > 50) n.splice(0, n.length - 50); return n; });
    });

    handleVis = () => { if (document.visibilityState === "visible") hydratePty(); };
    document.addEventListener("visibilitychange", handleVis);

    const unbindStatus = client.onWsEvent("status", (data: Record<string, unknown>) => {
      const d = depsRef.current; if (!d) return;
      const ns = parseAgentStatusEvent(data);
      if (ns) {
        d.setAgentStatusIfChanged(ns);
        if (data.restarted) { d.setPendingRestart(false); d.setPendingRestartReasons([]); void d.loadPlugins(); void d.pollCloudCredits(); hydratePty(); ptyHydratedViaWs = true; }
      }
      if (!ptyHydratedViaWs) { ptyHydratedViaWs = true; hydratePty(); }
      if (typeof data.pendingRestart === "boolean") d.setPendingRestart((p: boolean) => p === data.pendingRestart ? p : data.pendingRestart as boolean);
      if (Array.isArray(data.pendingRestartReasons)) {
        const nr = data.pendingRestartReasons.filter((e): e is string => typeof e === "string");
        d.setPendingRestartReasons((p: string[]) => p.length === nr.length && p.every((r, i) => r === nr[i]) ? p : nr);
      }
    });

    const unbindRestart = client.onWsEvent("restart-required", (data: Record<string, unknown>) => {
      if (Array.isArray(data.reasons)) { depsRef.current?.setPendingRestartReasons(data.reasons.filter((e): e is string => typeof e === "string")); depsRef.current?.setPendingRestart(true); depsRef.current?.showRestartBanner(); }
    });

    const unbindAgent = client.onWsEvent("agent_event", (data: Record<string, unknown>) => { const e = parseStreamEventEnvelopeEvent(data); if (e) depsRef.current?.appendAutonomousEvent(e); });
    const unbindHb = client.onWsEvent("heartbeat_event", (data: Record<string, unknown>) => { const e = parseStreamEventEnvelopeEvent(data); if (e) { depsRef.current?.appendAutonomousEvent(e); depsRef.current?.notifyHeartbeatEvent(e); } });

    const unbindProactive = client.onWsEvent("proactive-message", (data: Record<string, unknown>) => {
      const parsed = parseProactiveMessageEvent(data); if (!parsed) return;
      const { conversationId: cid, message: msg } = parsed;
      const d = depsRef.current; if (!d) return;
      if (cid === d.activeConversationIdRef.current) d.setConversationMessages((prev: ConversationMessage[]) => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      else d.setUnreadConversations((prev: Set<string>) => new Set([...prev, cid]));
      if (msg.source && msg.source !== "client_chat" && msg.role === "user")
        d.appendAutonomousEvent({ type: "agent_event", version: 1, eventId: `synth-${msg.id}`, ts: msg.timestamp, stream: "message", payload: { text: msg.text, from: msg.from, source: msg.source, direction: "inbound", channel: msg.source } });
      d.setConversations((prev: Conversation[]) => {
        const u = prev.map(c => c.id === cid ? { ...c, updatedAt: new Date().toISOString() } : c);
        return u.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    const unbindConvUp = client.onWsEvent("conversation-updated", (data: Record<string, unknown>) => {
      const conv = data.conversation as Conversation;
      if (conv?.id) depsRef.current?.setConversations((prev: Conversation[]) => {
        const u = prev.map(c => c.id === conv.id ? conv : c);
        return u.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    const unbindPty = client.onWsEvent("pty-session-event", (data: Record<string, unknown>) => {
      const eventType = (data.eventType ?? data.type) as string;
      const sid = data.sessionId as string;
      if (!sid) return;
      if (eventType === "task_registered") {
        const dd = data.data as Record<string, unknown> | undefined;
        depsRef.current?.setPtySessions((prev: CodingAgentSession[]) => [...prev.filter(s => s.sessionId !== sid), { sessionId: sid, agentType: (dd?.agentType as string) ?? "claude", label: (dd?.label as string) ?? sid, originalTask: (dd?.originalTask as string) ?? "", workdir: (dd?.workdir as string) ?? "", status: "active", decisionCount: 0, autoResolvedCount: 0, lastActivity: "Starting" }]);
      } else if (eventType === "task_complete" || eventType === "stopped") {
        depsRef.current?.setPtySessions((prev: CodingAgentSession[]) => prev.filter(s => s.sessionId !== sid));
      } else {
        let needsHydrate = false;
        depsRef.current?.setPtySessions((prev: CodingAgentSession[]) => {
          const known = prev.some(s => s.sessionId === sid);
          if (!known) { needsHydrate = true; return prev; }
          const dd = data.data as Record<string, unknown> | undefined;
          if (eventType === "blocked" || eventType === "escalation") return prev.map(s => s.sessionId === sid ? { ...s, status: "blocked" as const, lastActivity: eventType === "escalation" ? "Escalated — needs attention" : "Waiting for input" } : s);
          if (eventType === "tool_running") { const td = (dd?.description as string) ?? (dd?.toolName as string) ?? "external tool"; return prev.map(s => s.sessionId === sid ? { ...s, status: "tool_running" as const, toolDescription: td, lastActivity: `Running ${td}`.slice(0, 60) } : s); }
          if (eventType === "blocked_auto_resolved") { const p = (dd?.prompt as string) ?? (dd?.reasoning as string) ?? ""; return prev.map(s => s.sessionId === sid ? { ...s, status: "active" as const, toolDescription: undefined, lastActivity: p ? `Approved: ${p}`.slice(0, 60) : "Approved" } : s); }
          if (eventType === "coordination_decision") { const r = (dd?.reasoning as string) ?? (dd?.action as string) ?? ""; const esc = (dd?.action as string) === "escalate"; return prev.map(s => s.sessionId === sid ? { ...s, status: "active" as const, toolDescription: undefined, lastActivity: (esc ? `Escalated: ${r}` : r ? `Responded: ${r}` : "Responded").slice(0, 60) } : s); }
          if (eventType === "ready") return prev.map(s => s.sessionId === sid ? { ...s, status: "active" as const, toolDescription: undefined, lastActivity: "Running" } : s);
          if (eventType === "error") { const em = (dd?.message as string) ?? "Unknown error"; return prev.map(s => s.sessionId === sid ? { ...s, status: "error" as const, lastActivity: `Error: ${em}`.slice(0, 60) } : s); }
          return prev;
        });
        if (needsHydrate) hydratePty();
      }
    });

    // Navigation listener
    const isFile = typeof window !== "undefined" && window.location.protocol === "file:";
    const navEvt = isFile ? "hashchange" : "popstate";
    const handleNav = () => { const t = tabFromPath(getNavigationPathFromWindow()); if (t) depsRef.current?.setTabRaw(t); };
    if (typeof window !== "undefined") window.addEventListener(navEvt, handleNav);

    return () => {
      wsBindingsActiveRef.current = false;
      if (typeof window !== "undefined") window.removeEventListener(navEvt, handleNav);
      if (depsRef.current?.elizaCloudPollInterval.current) { clearInterval(depsRef.current.elizaCloudPollInterval.current); depsRef.current.elizaCloudPollInterval.current = null; }
      if (depsRef.current?.elizaCloudLoginPollTimer.current) { clearInterval(depsRef.current.elizaCloudLoginPollTimer.current); depsRef.current.elizaCloudLoginPollTimer.current = null; }
      unbindStatus(); unbindAgent(); unbindHb(); unbindEmotes(); unbindProactive();
      unbindWsReconnect(); unbindSysWarn(); unbindRestart(); unbindConvUp(); unbindPty();
      if (ptyPollInterval) clearInterval(ptyPollInterval);
      if (handleVis) document.removeEventListener("visibilitychange", handleVis);
      client.disconnectWs();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on ready, deps via ref
  }, [readyPhaseReached, depsReady]);

  // ── Public interface ─────────────────────────────────────────────

  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);
  const pairingSuccess = useCallback(() => dispatch({ type: "PAIRING_SUCCESS" }), []);
  const onboardingCompleteFn = useCallback(() => dispatch({ type: "ONBOARDING_COMPLETE" }), []);

  let target: RuntimeTarget | null = null;
  if (state.phase === "resolving-target") target = state.target;
  else if (state.phase === "polling-backend") target = state.target;

  return {
    state,
    dispatch,
    retry,
    pairingSuccess,
    onboardingComplete: onboardingCompleteFn,
    policy,
    legacyPhase: toLegacyStartupPhase(state),
    loading: isStartupLoading(state),
    terminal: isStartupTerminal(state),
    target,
    phase: state.phase,
  };
}
