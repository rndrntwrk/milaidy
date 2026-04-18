import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  client: {
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
  },
}));

vi.mock("../bridge", () => ({
  getBackendStartupTimeoutMs: vi.fn(() => 30_000),
  getDesktopRuntimeMode: vi.fn(async () => null),
  inspectExistingElizaInstall: vi.fn(async () => null),
  invokeDesktopBridgeRequest: vi.fn(async () => {}),
  isElectrobunRuntime: vi.fn(() => false),
  isWeb: vi.fn(() => true),
  scanProviderCredentials: vi.fn(async () => []),
}));

vi.mock("./onboarding-bootstrap", () => ({
  detectExistingOnboardingConnection: vi.fn(async () => null),
}));

vi.mock("./persistence", () => ({
  createPersistedActiveServer: vi.fn(({ kind }: { kind: string }) => ({
    id: "local:embedded",
    kind,
    label: "This device",
  })),
  loadPersistedActiveServer: vi.fn(() => null),
  loadPersistedOnboardingComplete: vi.fn(() => false),
}));

import { client } from "../api";
import {
  getDesktopRuntimeMode,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
  isWeb,
} from "../bridge";
import { detectExistingOnboardingConnection } from "./onboarding-bootstrap";
import {
  loadPersistedActiveServer,
  loadPersistedOnboardingComplete,
} from "./persistence";
import {
  applyRestoredConnection,
  runRestoringSession,
} from "./startup-phase-restore";

describe("applyRestoredConnection", () => {
  it("clears stale session state before restoring a local runtime", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "local" });
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };
    const startLocalRuntime = vi.fn(async () => {});

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      clientRef,
      startLocalRuntime,
    });

    expect(clientRef.setToken).toHaveBeenCalledWith(null);
    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(null);
    expect(startLocalRuntime).toHaveBeenCalledTimes(1);
  });

  it("skips embedded runtime start when desktop is already in external api mode", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "external" });
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      clientRef,
      startLocalRuntime: async () => {
        const runtimeMode = await getDesktopRuntimeMode();
        if (runtimeMode?.mode !== "local") {
          return;
        }
        await invokeDesktopBridgeRequest({
          rpcMethod: "agentStart",
          ipcChannel: "agent:start",
        });
      },
    });

    expect(invokeDesktopBridgeRequest).not.toHaveBeenCalled();
  });

  it("clears stale tokens when restoring a remote target without an access token", async () => {
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "remote:https://remote.example/api",
        kind: "remote",
        label: "remote.example",
        apiBase: "https://remote.example/api",
      },
      clientRef,
    });

    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(
      "https://remote.example/api",
    );
    expect(clientRef.setToken).toHaveBeenCalledWith(null);
  });

  it("does not keep a redundant dynamic import for onboarding bootstrap helpers", () => {
    const source = fs.readFileSync(
      new URL("./startup-phase-restore.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain('await import("./onboarding-bootstrap")');
  });
});

describe("runRestoringSession", () => {
  it("restores an existing backend-configured install even without prior local onboarding evidence", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "local" });
    vi.mocked(loadPersistedActiveServer).mockReturnValue(null);
    vi.mocked(loadPersistedOnboardingComplete).mockReturnValue(false);
    vi.mocked(inspectExistingElizaInstall).mockResolvedValue(null);
    vi.mocked(detectExistingOnboardingConnection).mockResolvedValue({
      activeServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      detectedExistingInstall: true,
    });

    const dispatch = vi.fn();
    const ctxRef = { current: null };
    const deps = {
      setStartupError: vi.fn(),
      setAuthRequired: vi.fn(),
      setConnected: vi.fn(),
      setOnboardingExistingInstallDetected: vi.fn(),
      setOnboardingOptions: vi.fn(),
      setOnboardingComplete: vi.fn(),
      setOnboardingLoading: vi.fn(),
      applyDetectedProviders: vi.fn(),
      forceLocalBootstrapRef: { current: false },
      onboardingCompletionCommittedRef: { current: false },
      uiLanguage: "en",
    };

    await runRestoringSession(deps, dispatch, ctxRef, { current: false });

    expect(detectExistingOnboardingConnection).toHaveBeenCalledOnce();
    expect(deps.setOnboardingExistingInstallDetected).toHaveBeenCalledWith(
      true,
    );
    expect(client.setToken).toHaveBeenCalledWith(null);
    expect(client.setBaseUrl).toHaveBeenCalledWith(null);
    expect(invokeDesktopBridgeRequest).toHaveBeenCalledOnce();
    expect(ctxRef.current).toMatchObject({
      persistedActiveServer: null,
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
      },
      hadPriorOnboarding: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SESSION_RESTORED",
      target: "embedded-local",
    });
  });

  it("falls through to polling-backend on web when probe returns null", async () => {
    // Simulate fresh web browser: no Electrobun runtime, no persisted server,
    // no prior onboarding evidence, and the onboarding probe fails/returns
    // null (e.g. CF cold-start timed out the 3.5s budget).
    vi.mocked(isElectrobunRuntime).mockReturnValue(false);
    vi.mocked(isWeb).mockReturnValue(true);
    vi.mocked(loadPersistedActiveServer).mockReturnValue(null);
    vi.mocked(loadPersistedOnboardingComplete).mockReturnValue(false);
    vi.mocked(inspectExistingElizaInstall).mockResolvedValue(null);
    vi.mocked(detectExistingOnboardingConnection).mockResolvedValue(null);

    const dispatch = vi.fn();
    const ctxRef = { current: null };
    const deps = {
      setStartupError: vi.fn(),
      setAuthRequired: vi.fn(),
      setConnected: vi.fn(),
      setOnboardingExistingInstallDetected: vi.fn(),
      setOnboardingOptions: vi.fn(),
      setOnboardingComplete: vi.fn(),
      setOnboardingLoading: vi.fn(),
      applyDetectedProviders: vi.fn(),
      forceLocalBootstrapRef: { current: false },
      onboardingCompletionCommittedRef: { current: false },
      uiLanguage: "en",
    };

    await runRestoringSession(deps, dispatch, ctxRef, { current: false });

    // We must NOT show the onboarding wizard — the backend authoritative
    // check happens in polling-backend which has a generous budget.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "NO_SESSION" }),
    );
    expect(deps.setOnboardingOptions).not.toHaveBeenCalled();
    expect(deps.setOnboardingComplete).not.toHaveBeenCalled();

    // Instead we should restore a default local target and proceed.
    expect(ctxRef.current).toMatchObject({
      persistedActiveServer: null,
      restoredActiveServer: { kind: "local" },
      hadPriorOnboarding: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SESSION_RESTORED",
      target: "embedded-local",
    });
  });

  it("keeps the desktop onboarding fallback when no install is detected", async () => {
    vi.mocked(isElectrobunRuntime).mockReturnValue(true);
    vi.mocked(isWeb).mockReturnValue(false);
    vi.mocked(loadPersistedActiveServer).mockReturnValue(null);
    vi.mocked(loadPersistedOnboardingComplete).mockReturnValue(false);
    vi.mocked(inspectExistingElizaInstall).mockResolvedValue(null);
    vi.mocked(detectExistingOnboardingConnection).mockResolvedValue(null);

    const dispatch = vi.fn();
    const ctxRef = { current: null };
    const deps = {
      setStartupError: vi.fn(),
      setAuthRequired: vi.fn(),
      setConnected: vi.fn(),
      setOnboardingExistingInstallDetected: vi.fn(),
      setOnboardingOptions: vi.fn(),
      setOnboardingComplete: vi.fn(),
      setOnboardingLoading: vi.fn(),
      applyDetectedProviders: vi.fn(),
      forceLocalBootstrapRef: { current: false },
      onboardingCompletionCommittedRef: { current: false },
      uiLanguage: "en",
    };

    await runRestoringSession(deps, dispatch, ctxRef, { current: false });

    expect(deps.setOnboardingOptions).toHaveBeenCalledOnce();
    expect(deps.setOnboardingComplete).toHaveBeenCalledWith(false);
    expect(dispatch).toHaveBeenCalledWith({
      type: "NO_SESSION",
      hadPriorOnboarding: false,
    });
  });

  it("keeps the onboarding fallback on native cloud-only runtimes (iOS/Android)", async () => {
    // Native Capacitor apps report platform !== "web" and are not Electrobun.
    // They are cloud-only — there is no embedded-local runtime to fall back
    // to. The web short-circuit must not fire here; the original NO_SESSION
    // path should take over so the onboarding/connection wizard renders.
    vi.mocked(isElectrobunRuntime).mockReturnValue(false);
    vi.mocked(isWeb).mockReturnValue(false);
    vi.mocked(loadPersistedActiveServer).mockReturnValue(null);
    vi.mocked(loadPersistedOnboardingComplete).mockReturnValue(false);
    vi.mocked(inspectExistingElizaInstall).mockResolvedValue(null);
    vi.mocked(detectExistingOnboardingConnection).mockResolvedValue(null);

    const dispatch = vi.fn();
    const ctxRef = { current: null };
    const deps = {
      setStartupError: vi.fn(),
      setAuthRequired: vi.fn(),
      setConnected: vi.fn(),
      setOnboardingExistingInstallDetected: vi.fn(),
      setOnboardingOptions: vi.fn(),
      setOnboardingComplete: vi.fn(),
      setOnboardingLoading: vi.fn(),
      applyDetectedProviders: vi.fn(),
      forceLocalBootstrapRef: { current: false },
      onboardingCompletionCommittedRef: { current: false },
      uiLanguage: "en",
    };

    await runRestoringSession(deps, dispatch, ctxRef, { current: false });

    // Must not synthesize a local target the native runtime cannot satisfy.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SESSION_RESTORED" }),
    );
    expect(deps.setOnboardingOptions).toHaveBeenCalledOnce();
    expect(deps.setOnboardingComplete).toHaveBeenCalledWith(false);
    expect(dispatch).toHaveBeenCalledWith({
      type: "NO_SESSION",
      hadPriorOnboarding: false,
    });
  });
});
