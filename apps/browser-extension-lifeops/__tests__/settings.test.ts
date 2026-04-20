import { beforeEach, describe, expect, it } from "vitest";
import {
  InvalidSettingsError,
  isValidWsUrl,
  loadSettings,
  saveSettings,
} from "../src/settings.js";
import { DEFAULT_SETTINGS } from "../src/types.js";

interface FakeStorageArea {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

function makeFakeStorage(): {
  storage: {
    local: FakeStorageArea;
    onChanged: { addListener: () => void; removeListener: () => void };
  };
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>();
  return {
    data,
    storage: {
      local: {
        async get(key: string) {
          const v = data.get(key);
          return v === undefined ? {} : { [key]: v };
        },
        async set(items: Record<string, unknown>) {
          for (const [k, v] of Object.entries(items)) {
            data.set(k, v);
          }
        },
      },
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
  };
}

beforeEach(() => {
  const { storage } = makeFakeStorage();
  (globalThis as unknown as { chrome: unknown }).chrome = { storage };
});

describe("isValidWsUrl", () => {
  it("accepts ws:// and wss:// URLs", () => {
    expect(isValidWsUrl("ws://127.0.0.1:31339/ext")).toBe(true);
    expect(isValidWsUrl("wss://agent.example.com/lifeops")).toBe(true);
  });

  it("rejects http(s), bare strings, garbage", () => {
    expect(isValidWsUrl("http://127.0.0.1/ext")).toBe(false);
    expect(isValidWsUrl("127.0.0.1:31339")).toBe(false);
    expect(isValidWsUrl("")).toBe(false);
    expect(isValidWsUrl(42)).toBe(false);
    expect(isValidWsUrl(null)).toBe(false);
  });
});

describe("saveSettings", () => {
  it("persists a valid settings object", async () => {
    await saveSettings({
      wsUrl: "wss://agent.example.com/lifeops",
      flushIntervalMs: 30_000,
      activityReportingEnabled: true,
    });
    const reloaded = await loadSettings();
    expect(reloaded.wsUrl).toBe("wss://agent.example.com/lifeops");
  });

  it("rejects non-ws URLs", async () => {
    await expect(
      saveSettings({
        ...DEFAULT_SETTINGS,
        wsUrl: "http://127.0.0.1:31339/ext",
      }),
    ).rejects.toBeInstanceOf(InvalidSettingsError);
  });

  it("rejects flushIntervalMs under 1000", async () => {
    await expect(
      saveSettings({ ...DEFAULT_SETTINGS, flushIntervalMs: 500 }),
    ).rejects.toBeInstanceOf(InvalidSettingsError);
  });
});

describe("loadSettings", () => {
  it("falls back to defaults when stored data is absent", async () => {
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("repairs a stored invalid wsUrl on read", async () => {
    const chromeMock = (
      globalThis as unknown as {
        chrome: { storage: { local: FakeStorageArea } };
      }
    ).chrome;
    await chromeMock.storage.local.set({
      "lifeops.extension.settings": {
        wsUrl: "not a valid url",
        flushIntervalMs: 60_000,
        activityReportingEnabled: true,
      },
    });
    const loaded = await loadSettings();
    expect(loaded.wsUrl).toBe(DEFAULT_SETTINGS.wsUrl);
  });
});
