// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();

vi.mock("@miladyai/app-core/hooks", () => ({
  useRenderGuard: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  getDefaultBundledVrmIndex: () => 9,
  getVrmCount: () => 24,
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  useApp: () => mockUseApp(),
  useCompanionSceneConfig: () => ({
    zoom: 1,
    setZoom: vi.fn(),
    position: { x: 0, y: 0 },
    setPosition: vi.fn(),
  }),
  useTranslation: () => ({ t: (k: string) => k }),
  VRM_COUNT: 24,
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (assetPath: string) => assetPath,
}));

vi.mock("./VrmStage", () => ({
  VrmStage: () => React.createElement("div", null, "VrmStage"),
}));

import { CompanionSceneHost } from "./CompanionSceneHost";

const COMPANION_STAGE_ENDPOINT = "/api/companion/stage";

function stageSetCalls(fetchMock: unknown) {
  const mock = fetchMock as { mock?: { calls: unknown[][] } };
  return (
    mock.mock?.calls.filter((callArgs) => {
      const url =
        typeof callArgs[0] === "string"
          ? callArgs[0]
          : callArgs[0] instanceof URL
            ? callArgs[0].toString()
            : "";
      const init = callArgs[1] as { method?: string } | undefined;
      return (
        url.includes(COMPANION_STAGE_ENDPOINT) &&
        (init?.method ?? "GET") === "POST"
      );
    }) ?? []
  );
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    selectedVrmIndex: 1,
    customVrmUrl: "",
    uiTheme: "dark",
    tab: "chat",
    t: (key: string) => key,
    ...overrides,
  };
}

function createCompanionRootMock() {
  const listeners = new Map<string, EventListener>();
  const node = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.set(type, listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (listeners.get(type) === listener) {
          listeners.delete(type);
        }
      },
    ),
  };

  return {
    node,
    getListener(type: string) {
      return listeners.get(type) as ((event: Event) => void) | undefined;
    },
  };
}

describe("CompanionSceneHost scroll guard", () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue(createContext());

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn(async () => ({
        ok: true,
      })),
      configurable: true,
      writable: true,
    });

    Object.defineProperty(window, "innerWidth", {
      value: 1440,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 900,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  function renderSceneHost(
    rootMock: ReturnType<typeof createCompanionRootMock>,
  ): ReactTestRenderer {
    return TestRenderer.create(
      React.createElement(
        CompanionSceneHost,
        { active: true },
        React.createElement("div", { "data-testid": "chat-overlay" }),
      ),
      {
        createNodeMock: (element) =>
          element.props?.["data-testid"] === "companion-root"
            ? rootMock.node
            : null,
      },
    );
  }

  it("ignores wheel zoom from scrollable transcript targets", async () => {
    const rootMock = createCompanionRootMock();
    await act(async () => {
      renderSceneHost(rootMock);
    });

    const wheelListener = rootMock.getListener("wheel");

    const scrollRegion = document.createElement("div");
    scrollRegion.setAttribute("data-no-camera-zoom", "true");
    const nestedTarget = document.createElement("span");
    scrollRegion.appendChild(nestedTarget);
    const preventDefault = vi.fn();

    wheelListener?.({
      ctrlKey: false,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: nestedTarget,
    } as WheelEvent);

    // No POST to the companion-stage endpoint — the wheel event was
    // ignored because it came from inside a `data-no-camera-zoom` region.
    expect(stageSetCalls(globalThis.fetch)).toHaveLength(0);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("persists zoom through the companion stage endpoint when wheel input comes from the scene surface", async () => {
    const rootMock = createCompanionRootMock();
    await act(async () => {
      renderSceneHost(rootMock);
    });

    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    wheelListener?.({
      ctrlKey: false,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: document.createElement("div"),
    } as WheelEvent);

    // The commit goes through `client.setCompanionStageState(...)` which
    // eventually calls `fetch("/api/companion/stage", { method: "POST", ... })`.
    // We don't assert the exact zoom value because it depends on the
    // wheel-to-zoom sensitivity constant — just that a POST fired.
    const calls = stageSetCalls(globalThis.fetch);
    expect(calls.length).toBeGreaterThan(0);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
