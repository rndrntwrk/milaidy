/**
 * Persistent extension settings stored in chrome.storage.local.
 */

import { DEFAULT_SETTINGS, type ExtensionSettings } from "./types.js";

const STORAGE_KEY = "lifeops.extension.settings";

export function isValidWsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === "ws:" || u.protocol === "wss:";
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const record = await chrome.storage.local.get(STORAGE_KEY);
  const stored = record[STORAGE_KEY];
  if (!stored || typeof stored !== "object") {
    return DEFAULT_SETTINGS;
  }
  const s = stored as Partial<ExtensionSettings>;
  return {
    wsUrl: isValidWsUrl(s.wsUrl) ? s.wsUrl : DEFAULT_SETTINGS.wsUrl,
    flushIntervalMs:
      typeof s.flushIntervalMs === "number" && s.flushIntervalMs >= 1_000
        ? s.flushIntervalMs
        : DEFAULT_SETTINGS.flushIntervalMs,
    activityReportingEnabled:
      typeof s.activityReportingEnabled === "boolean"
        ? s.activityReportingEnabled
        : DEFAULT_SETTINGS.activityReportingEnabled,
  };
}

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  if (!isValidWsUrl(settings.wsUrl)) {
    throw new InvalidSettingsError(
      "wsUrl must be a ws:// or wss:// URL",
    );
  }
  if (
    typeof settings.flushIntervalMs !== "number" ||
    !Number.isFinite(settings.flushIntervalMs) ||
    settings.flushIntervalMs < 1_000
  ) {
    throw new InvalidSettingsError(
      "flushIntervalMs must be a number ≥ 1000",
    );
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export function subscribeToSettings(
  onChange: (settings: ExtensionSettings) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ): void => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }
    void loadSettings().then(onChange);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const key = "lifeops.extension.deviceId";
  const existing = await chrome.storage.local.get(key);
  const current = existing[key];
  if (typeof current === "string" && current.length > 0) {
    return current;
  }
  const created = crypto.randomUUID();
  await chrome.storage.local.set({ [key]: created });
  return created;
}
