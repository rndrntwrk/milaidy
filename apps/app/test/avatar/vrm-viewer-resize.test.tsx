// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockVrmEngine, mockLoadVrmFromUrl } = vi.hoisted(() => {
  const loadVrmFromUrl = vi.fn(async () => {});

  class EngineMock {
    static instances: EngineMock[] = [];

    initialized = false;
    resize = vi.fn();
    setup = vi.fn(() => {
      this.initialized = true;
    });
    isInitialized = vi.fn(() => this.initialized);
    setScenePreset = vi.fn(async () => {});
    setSceneMark = vi.fn(async () => {});
    setMouthOpen = vi.fn();
    setSpeaking = vi.fn();
    loadVrmFromUrl = loadVrmFromUrl;
    dispose = vi.fn();
    getState = vi.fn(() => ({
      vrmLoaded: true,
      vrmName: "alice.vrm",
      idlePlaying: true,
      idleTime: 0,
      idleTracks: 0,
    }));

    constructor() {
      EngineMock.instances.push(this);
    }
  }

  return {
    MockVrmEngine: EngineMock,
    mockLoadVrmFromUrl: loadVrmFromUrl,
  };
});

vi.mock("../../src/AppContext", () => ({
  DEFAULT_PRO_STREAMER_VRM_URL: "/vrms/alice.vrm",
}));

vi.mock("../../src/components/avatar/VrmEngine", () => ({
  VrmEngine: MockVrmEngine,
}));

import { VrmViewer } from "../../src/components/avatar/VrmViewer";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let originalCanvasRect: typeof HTMLCanvasElement.prototype.getBoundingClientRect;
let canvasWidth = 1280;
let canvasHeight = 720;
let resizeCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("VrmViewer resize handling", () => {
  beforeEach(() => {
    MockVrmEngine.instances.length = 0;
    mockLoadVrmFromUrl.mockClear();
    canvasWidth = 1280;
    canvasHeight = 720;
    resizeCallback = null;

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    originalCanvasRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        top: 0,
        right: canvasWidth,
        bottom: canvasHeight,
        left: 0,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    HTMLCanvasElement.prototype.getBoundingClientRect = originalCanvasRect;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("recomputes the renderer size when the canvas container resizes", async () => {
    await act(async () => {
      root?.render(
        <div style={{ width: "100%", height: "100%" }}>
          <VrmViewer
            mouthOpen={0}
            isSpeaking={false}
            scenePreset="pro-streamer-stage"
            sceneMark="stage"
          />
        </div>,
      );
    });

    const engine = MockVrmEngine.instances[0];
    expect(engine).toBeDefined();
    expect(engine.resize).toHaveBeenCalledWith(1280, 720);
    expect(resizeCallback).toBeTypeOf("function");

    canvasWidth = 900;
    canvasHeight = 1100;

    await act(async () => {
      resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
    });

    expect(engine.resize).toHaveBeenLastCalledWith(900, 1100);
  });
});
