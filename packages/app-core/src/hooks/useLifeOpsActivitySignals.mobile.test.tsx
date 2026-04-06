// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mobileListeners = new Set<(signal: Record<string, unknown>) => void>();

const mocks = vi.hoisted(() => {
  const captureLifeOpsActivitySignal = vi.fn(async (request) => ({
    signal: {
      id: "signal-1",
      agentId: "agent-1",
      createdAt: "2026-04-06T00:00:00.000Z",
      observedAt: request.observedAt ?? "2026-04-06T00:00:00.000Z",
      idleState: request.idleState ?? null,
      idleTimeSeconds: request.idleTimeSeconds ?? null,
      onBattery: request.onBattery ?? null,
      metadata: request.metadata ?? {},
      platform: request.platform ?? "ios",
      source: request.source,
      state: request.state,
    },
  }));
  return {
    captureLifeOpsActivitySignal,
    getMobileSignalsPlugin: vi.fn(() => ({
      addListener: vi.fn(async (_eventName, listener) => {
        mobileListeners.add(listener);
        return {
          remove: vi.fn(async () => {
            mobileListeners.delete(listener);
          }),
        };
      }),
      getSnapshot: vi.fn(async () => ({
        supported: true,
        snapshot: {
          source: "mobile_device",
          platform: "ios",
          state: "active",
          observedAt: Date.now(),
          idleState: "active",
          idleTimeSeconds: null,
          onBattery: false,
          metadata: { reason: "snapshot" },
        },
      })),
      startMonitoring: vi.fn(async () => {
        const snapshot = {
          source: "mobile_device",
          platform: "ios",
          state: "active",
          observedAt: Date.now(),
          idleState: "active",
          idleTimeSeconds: null,
          onBattery: false,
          metadata: { reason: "start" },
        } as const;
        for (const listener of mobileListeners) {
          listener(snapshot);
        }
        return {
          enabled: true,
          supported: true,
          platform: "ios",
          snapshot,
        };
      }),
      stopMonitoring: vi.fn(async () => ({ stopped: true })),
    })),
    isElectrobunRuntime: vi.fn(() => false),
    loadDesktopWorkspaceSnapshot: vi.fn(async () => ({
      supported: false,
      version: null,
      packaged: null,
      autoLaunch: null,
      window: {
        bounds: null,
        maximized: false,
        minimized: false,
        visible: false,
        focused: false,
      },
      power: null,
      primaryDisplay: null,
      displays: [],
      cursor: null,
      clipboard: null,
      paths: {},
    })),
  };
});

vi.mock("../api", () => ({
  client: {
    captureLifeOpsActivitySignal: mocks.captureLifeOpsActivitySignal,
  },
}));

vi.mock("../bridge/electrobun-runtime", () => ({
  isElectrobunRuntime: mocks.isElectrobunRuntime,
}));

vi.mock("../bridge/native-plugins", () => ({
  getMobileSignalsPlugin: mocks.getMobileSignalsPlugin,
}));

vi.mock("../platform", () => ({
  isNative: true,
}));

vi.mock("../utils/desktop-workspace", () => ({
  loadDesktopWorkspaceSnapshot: mocks.loadDesktopWorkspaceSnapshot,
}));

import { useLifeOpsActivitySignals } from "./useLifeOpsActivitySignals";

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

let latestTree: TestRenderer.ReactTestRenderer | null = null;

function Harness() {
  useLifeOpsActivitySignals();
  return null;
}

describe("useLifeOpsActivitySignals mobile bridge", () => {
  beforeEach(() => {
    latestTree = null;
    mobileListeners.clear();
    mocks.captureLifeOpsActivitySignal.mockClear();
    mocks.getMobileSignalsPlugin.mockClear();
    mocks.isElectrobunRuntime.mockReset().mockReturnValue(false);
    mocks.loadDesktopWorkspaceSnapshot.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T16:00:00.000Z"));
    setVisibilityState("visible");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    latestTree?.unmount();
    latestTree = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("forwards native mobile lifecycle signals into LifeOps", async () => {
    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getMobileSignalsPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mobile_device",
        platform: "ios",
        state: "active",
      }),
    );

    await act(async () => {
      for (const listener of mobileListeners) {
        listener({
          source: "mobile_device",
          platform: "ios",
          state: "locked",
          observedAt: Date.now() + 1_000,
          idleState: "locked",
          idleTimeSeconds: null,
          onBattery: true,
          metadata: {
            reason: "screen_off",
            isProtectedDataAvailable: false,
          },
        });
      }
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mobile_device",
        platform: "ios",
        state: "locked",
        idleState: "locked",
        onBattery: true,
        metadata: expect.objectContaining({
          reason: "screen_off",
        }),
      }),
    );
  });
});
