// @vitest-environment jsdom

import {
  STREAM_SOURCE_LABELS,
  toggleAlwaysOnTop,
} from "../../src/components/stream/helpers";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

  // No custom globals needed

describe("toggleAlwaysOnTop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as typeof window & { Capacitor?: unknown }).Capacitor;
    vi.restoreAllMocks();
  });

  it("uses the direct Electrobun RPC bridge", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopSetAlwaysOnTop: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    await expect(toggleAlwaysOnTop(true)).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith({
      flag: true,
    });
  });
});

describe("STREAM_SOURCE_LABELS", () => {
  it("exposes labels for every supported stream source type", () => {
    expect(STREAM_SOURCE_LABELS["stream-tab"]).toBe("Stream Tab");
    expect(STREAM_SOURCE_LABELS.game).toBe("Game");
    expect(STREAM_SOURCE_LABELS["custom-url"]).toBe("Custom URL");
  });
});
