/**
 * useStartupCoordinator — React hook that drives the StartupCoordinator
 * state machine with side effects.
 *
 * This hook bridges the pure state machine (startup-coordinator.ts) to
 * the React world. It:
 * 1. Uses useReducer with the coordinator's startupReducer
 * 2. Runs side effects in useEffect based on the current phase
 * 3. Dispatches events as async operations complete
 * 4. Exposes the coordinator state + legacy bridge for AppContext
 *
 * The hook is designed to be wired into AppProviderInner alongside the
 * existing startup effect, with toLegacyStartupPhase() bridging to the
 * existing lifecycle state. Once validated, the old effect can be removed.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AgentStatus } from "../api";
import { client } from "../api";
import { isElectrobunRuntime } from "../bridge/electrobun-runtime";
import {
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
} from "../bridge/electrobun-rpc";
import {
  detectExistingOnboardingConnection,
  resolveStartupWithoutRestoredConnection,
} from "./onboarding-bootstrap";
import {
  loadPersistedConnectionMode,
  loadPersistedOnboardingComplete,
  savePersistedConnectionMode,
} from "./persistence";
import {
  INITIAL_STARTUP_STATE,
  connectionModeToTarget,
  createDesktopPolicy,
  createMobilePolicy,
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
import type { StartupErrorState, StartupPhase } from "./types";

// ── Platform detection ───────────────────────────────────────────────

function detectPlatformPolicy(): PlatformPolicy {
  if (isElectrobunRuntime()) return createDesktopPolicy();
  // Future: detect Capacitor native for mobile policy
  return createWebPolicy();
}

// ── Lifecycle bridge deps ────────────────────────────────────────────

export interface StartupCoordinatorDeps {
  setConnected: (v: boolean) => void;
  setStartupPhase: (v: StartupPhase) => void;
  setStartupError: (v: StartupErrorState | null) => void;
  setAuthRequired: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingLoading: (v: boolean) => void;
  setAgentStatus: (v: AgentStatus | null) => void;
  setPairingEnabled: (v: boolean) => void;
  setPairingExpiresAt: (v: number | null) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export interface StartupCoordinatorHandle {
  /** Current coordinator state. */
  state: StartupState;
  /** Dispatch an event to the coordinator. */
  dispatch: (event: StartupEvent) => void;
  /** Retry from error or any stuck state. */
  retry: () => void;
  /** Notify that pairing succeeded. */
  pairingSuccess: () => void;
  /** Notify that onboarding completed. */
  onboardingComplete: () => void;
  /** Current platform policy. */
  policy: PlatformPolicy;
  /** Legacy bridge: maps coordinator phase to the 3-value StartupPhase. */
  legacyPhase: "starting-backend" | "initializing-agent" | "ready";
  /** True while startup is in a loading/polling phase. */
  loading: boolean;
  /** True when startup has reached ready or error. */
  terminal: boolean;
  /** The resolved runtime target, if known. */
  target: RuntimeTarget | null;
}

export function useStartupCoordinator(
  deps?: StartupCoordinatorDeps,
): StartupCoordinatorHandle {
  const [state, dispatch] = useReducer(startupReducer, INITIAL_STARTUP_STATE);
  const policy = useRef(detectPlatformPolicy()).current;
  const cancelledRef = useRef(false);
  const effectRunRef = useRef(0);

  // ── Phase-driven side effects ────────────────────────────────────

  // Phase: booting → restoring-session (immediate transition)
  useEffect(() => {
    if (state.phase !== "booting") return;
    // Reset cancellation for new run
    cancelledRef.current = false;
    effectRunRef.current += 1;

    // Transition to restoring-session is driven by the effect
    // dispatching session events after probing storage + backend.
    const runId = effectRunRef.current;

    async function restoreSession() {
      // 1. Check persisted connection mode
      const persistedConnection = loadPersistedConnectionMode();
      const hadPriorOnboarding = loadPersistedOnboardingComplete();

      if (cancelledRef.current || effectRunRef.current !== runId) return;

      // 2. If we have a persisted connection, use it
      if (persistedConnection) {
        const target = connectionModeToTarget(persistedConnection.runMode);

        // Configure client base URL based on connection mode
        if (
          persistedConnection.runMode === "cloud" &&
          persistedConnection.cloudApiBase
        ) {
          client.setBaseUrl(persistedConnection.cloudApiBase);
          if (persistedConnection.cloudAuthToken) {
            client.setToken(persistedConnection.cloudAuthToken);
          }
        } else if (
          persistedConnection.runMode === "remote" &&
          persistedConnection.remoteApiBase
        ) {
          client.setBaseUrl(persistedConnection.remoteApiBase);
          if (persistedConnection.remoteAccessToken) {
            client.setToken(persistedConnection.remoteAccessToken);
          }
        } else if (persistedConnection.runMode === "local") {
          // Nudge the native process to start the agent
          invokeDesktopBridgeRequest({
            rpcMethod: "agentStart",
            ipcChannel: "agent:start",
          }).catch(() => {});
        }

        dispatch({ type: "SESSION_RESTORED", target });
        return;
      }

      // 3. No persisted connection — probe for existing install
      if (policy.probeForExistingInstall) {
        try {
          const existingInstall = await inspectExistingElizaInstall();
          if (cancelledRef.current || effectRunRef.current !== runId) return;
          if (existingInstall?.detected) {
            dispatch({
              type: "EXISTING_INSTALL_DETECTED",
              target: "embedded-local",
            });
            return;
          }
        } catch {
          // Probe failed — continue
        }
      }

      // 4. Try to detect existing onboarding connection via API probe
      const shouldPreferLocal =
        policy.supportsLocalRuntime || isElectrobunRuntime();
      const probeTimeout = shouldPreferLocal
        ? Math.min(policy.backendTimeoutMs, 30_000)
        : Math.min(policy.backendTimeoutMs, 3_500);

      try {
        const probed = await Promise.race([
          detectExistingOnboardingConnection({
            client,
            timeoutMs: probeTimeout,
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), probeTimeout),
          ),
        ]);
        if (cancelledRef.current || effectRunRef.current !== runId) return;

        if (probed?.connection) {
          const target = connectionModeToTarget(probed.connection.runMode);
          // Persist for next launch
          savePersistedConnectionMode(probed.connection);
          dispatch({ type: "SESSION_RESTORED", target });
          return;
        }
      } catch {
        // Probe failed
      }

      if (cancelledRef.current || effectRunRef.current !== runId) return;

      // 5. Desktop fallback: prefer local
      if (shouldPreferLocal) {
        invokeDesktopBridgeRequest({
          rpcMethod: "agentStart",
          ipcChannel: "agent:start",
        }).catch(() => {});
        dispatch({
          type: "EXISTING_INSTALL_DETECTED",
          target: "embedded-local",
        });
        return;
      }

      // 6. No connection found
      dispatch({
        type: "NO_SESSION",
        hadPriorOnboarding: hadPriorOnboarding,
      });
    }

    void restoreSession();

    return () => {
      cancelledRef.current = true;
    };
  }, [state.phase, policy]);

  // Phase: resolving-target → polling-backend (auto-advance)
  // The reducer handles this transition when it sees any event in resolving-target.
  // We need to kick it forward since resolving-target is a transient state.
  useEffect(() => {
    if (state.phase !== "resolving-target") return;
    // Auto-advance by dispatching a poll retry to enter polling-backend
    dispatch({ type: "BACKEND_POLL_RETRY" });
  }, [state.phase]);

  // Phase: polling-backend — poll auth + onboarding status
  useEffect(() => {
    if (state.phase !== "polling-backend") return;
    const runId = effectRunRef.current;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function pollBackend() {
      const deadline = Date.now() + policy.backendTimeoutMs;
      const baseDelay = 250;
      let attempts = 0;

      while (!cancelled && effectRunRef.current === runId) {
        if (Date.now() >= deadline) {
          dispatch({ type: "BACKEND_TIMEOUT" });
          return;
        }

        try {
          const auth = await client.getAuthStatus();
          if (cancelled) return;

          if (auth.required && !client.hasToken()) {
            dispatch({ type: "BACKEND_AUTH_REQUIRED" });
            return;
          }

          const onboarding = await client.getOnboardingStatus();
          if (cancelled) return;

          dispatch({
            type: "BACKEND_REACHED",
            onboardingComplete: onboarding.complete,
          });
          return;
        } catch (err) {
          const apiErr = err as { status?: number; kind?: string };
          if (apiErr.status === 401 && client.hasToken()) {
            client.setToken(null);
            dispatch({ type: "BACKEND_AUTH_REQUIRED" });
            return;
          }
          if (apiErr.status === 404) {
            dispatch({ type: "BACKEND_NOT_FOUND" });
            return;
          }
          // Transient error — retry with backoff
          attempts++;
          dispatch({ type: "BACKEND_POLL_RETRY" });
          const delay = Math.min(baseDelay * 2 ** Math.min(attempts, 2), 1000);
          await new Promise<void>((r) => {
            timeoutId = setTimeout(r, delay);
          });
        }
      }
    }

    void pollBackend();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state.phase, policy.backendTimeoutMs]);

  // Phase: starting-runtime — poll agent status until running
  useEffect(() => {
    if (state.phase !== "starting-runtime") return;
    const runId = effectRunRef.current;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function pollAgent() {
      const startedAt = Date.now();
      let deadline = startedAt + policy.agentReadyTimeoutMs;
      const absoluteMax = startedAt + 900_000; // 15 min hard cap
      let attempts = 0;

      while (!cancelled && effectRunRef.current === runId) {
        if (Date.now() >= deadline) {
          dispatch({ type: "AGENT_TIMEOUT" });
          return;
        }

        try {
          let status = await client.getStatus();
          if (cancelled) return;

          // Slide deadline while agent is starting (embedding download)
          if (status.state === "starting" && Date.now() - startedAt > 15_000) {
            const extended = Date.now() + 180_000;
            deadline = Math.min(extended, absoluteMax);
          }

          if (status.state === "not_started" || status.state === "stopped") {
            status = await client.startAgent();
            if (cancelled) return;
          }

          if (status.state === "running") {
            dispatch({ type: "AGENT_RUNNING" });
            return;
          }

          if (status.state === "error") {
            const msg = status.startup?.lastError ?? "Agent failed to start";
            dispatch({ type: "AGENT_ERROR", message: msg });
            return;
          }

          attempts++;
          dispatch({ type: "AGENT_POLL_RETRY" });
        } catch (err) {
          const apiErr = err as { status?: number };
          if (apiErr.status === 401) {
            dispatch({ type: "BACKEND_AUTH_REQUIRED" });
            return;
          }
          attempts++;
          dispatch({ type: "AGENT_POLL_RETRY" });
        }

        await new Promise<void>((r) => {
          timeoutId = setTimeout(r, 500);
        });
      }
    }

    void pollAgent();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state.phase, policy.agentReadyTimeoutMs]);

  // Phase: hydrating — load initial data, connect WS
  useEffect(() => {
    if (state.phase !== "hydrating") return;
    let cancelled = false;

    async function hydrate() {
      try {
        // These are best-effort — failure shouldn't block ready
        await Promise.allSettled([
          client.listConversations().catch(() => null),
          client.getPlugins().catch(() => null),
          client.getCharacter().catch(() => null),
        ]);
      } catch {
        // Non-fatal
      }

      if (cancelled) return;

      client.connectWs();
      dispatch({ type: "HYDRATION_COMPLETE" });
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  // ── Lifecycle bridge — sync coordinator state to legacy setters ──

  const prevPhaseRef = useRef<string>(state.phase);
  useEffect(() => {
    if (!deps) return;
    const prev = prevPhaseRef.current;
    const cur = state.phase;
    prevPhaseRef.current = cur;

    // Only fire on actual phase transitions (or first mount)
    if (prev === cur && prev !== "booting") return;

    switch (cur) {
      case "booting":
      case "restoring-session":
      case "resolving-target":
        // Early phases — no legacy setters needed beyond initial state
        break;

      case "polling-backend":
        deps.setStartupPhase("starting-backend");
        deps.setConnected(false);
        break;

      case "pairing-required":
        deps.setAuthRequired(true);
        deps.setStartupPhase("ready");
        break;

      case "onboarding-required":
        deps.setOnboardingComplete(false);
        deps.setOnboardingLoading(false);
        deps.setStartupPhase("ready");
        break;

      case "starting-runtime":
        deps.setStartupPhase("initializing-agent");
        deps.setConnected(true);
        break;

      case "hydrating":
        // Agent is running — bridge to legacy
        deps.setAgentStatus({ state: "running" } as AgentStatus);
        break;

      case "ready":
        deps.setStartupPhase("ready");
        deps.setOnboardingLoading(false);
        deps.setConnected(true);
        break;

      case "error": {
        const errState = state as Extract<StartupState, { phase: "error" }>;
        deps.setStartupError({
          reason: errState.reason,
          message: errState.message,
          phase: toLegacyStartupPhase(state),
        });
        break;
      }
    }
  }, [state, deps]);

  // ── Public interface ─────────────────────────────────────────────

  const retry = useCallback(() => {
    dispatch({ type: "RETRY" });
  }, []);

  const pairingSuccess = useCallback(() => {
    dispatch({ type: "PAIRING_SUCCESS" });
  }, []);

  const onboardingComplete = useCallback(() => {
    dispatch({ type: "ONBOARDING_COMPLETE" });
  }, []);

  // Extract target from state phases that carry it
  let target: RuntimeTarget | null = null;
  if (state.phase === "resolving-target") target = state.target;
  else if (state.phase === "polling-backend") target = state.target;

  return {
    state,
    dispatch,
    retry,
    pairingSuccess,
    onboardingComplete,
    policy,
    legacyPhase: toLegacyStartupPhase(state),
    loading: isStartupLoading(state),
    terminal: isStartupTerminal(state),
    target,
  };
}
