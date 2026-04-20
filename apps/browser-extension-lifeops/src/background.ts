/**
 * Background service worker.
 *
 * Responsibilities:
 *   1. Maintain the WebSocket channel to the local agent.
 *   2. Listen to focus signals (tab/window/visibility) and feed them into
 *      the TimeAggregator.
 *   3. Flush per-hostname focus time to the agent every `flushIntervalMs`.
 *   4. Stay idle when `activityReportingEnabled` is false.
 *
 * NOTE (unwired backend): the default wsUrl `ws://127.0.0.1:31339/ext` is a
 * placeholder. No agent-side WebSocket handler exists for this extension
 * yet — the existing companion extension at
 * `eliza/apps/app-lifeops/extensions/lifeops-browser/` uses REST at
 * `/api/lifeops/browser/companions/sync` instead. Until a server is wired
 * the channel will reconnect-loop and telemetry is buffered in-memory only.
 */

import { createLogger } from "./logger.js";
import { AgentChannel } from "./messaging/native-messaging.js";
import {
  getOrCreateDeviceId,
  loadSettings,
  subscribeToSettings,
} from "./settings.js";
import { installFocusTracker } from "./tracker/focus-tracker.js";
import { TimeAggregator } from "./tracker/time-on-site.js";
import type {
  ExtensionSettings,
  InternalMessage,
  OutboundMessage,
} from "./types.js";

const log = createLogger("background");
const FLUSH_ALARM = "lifeops.flush";

interface RuntimeState {
  readonly aggregator: TimeAggregator;
  readonly channel: AgentChannel;
  deviceId: string;
  settings: ExtensionSettings;
}

let state: RuntimeState | null = null;
let bootstrapPromise: Promise<RuntimeState> | null = null;

async function bootstrap(): Promise<RuntimeState> {
  if (state) return state;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const settings = await loadSettings();
    const deviceId = await getOrCreateDeviceId();
    const aggregator = new TimeAggregator(Date.now());
    const channel = new AgentChannel({ url: settings.wsUrl });

    installFocusTracker({ aggregator, now: () => Date.now() });
    channel.start();

    const vendor = detectBrowserVendor();
    const manifest = chrome.runtime.getManifest();
    const registration: OutboundMessage = {
      type: "register-session",
      payload: {
        deviceId,
        userAgent: navigator.userAgent,
        extensionVersion: manifest.version,
        browserVendor: vendor,
      },
    };
    channel.send(registration);

    await ensureFlushAlarm(settings.flushIntervalMs);
    subscribeToSettings(handleSettingsUpdate);

    const next: RuntimeState = { aggregator, channel, deviceId, settings };
    state = next;
    log.info("bootstrapped", { deviceId, wsUrl: settings.wsUrl });
    return next;
  })();

  return bootstrapPromise;
}

async function handleSettingsUpdate(
  settings: ExtensionSettings,
): Promise<void> {
  if (!state) return;
  const urlChanged = state.settings.wsUrl !== settings.wsUrl;
  state.settings = settings;
  if (urlChanged) {
    state.channel.setUrl(settings.wsUrl);
  }
  await ensureFlushAlarm(settings.flushIntervalMs);
}

async function ensureFlushAlarm(flushIntervalMs: number): Promise<void> {
  // chrome.alarms enforces a 1-minute minimum period.
  const periodInMinutes = Math.max(1, Math.round(flushIntervalMs / 60_000));
  await chrome.alarms.clear(FLUSH_ALARM);
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes });
}

function detectBrowserVendor(): "chrome" | "safari" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "safari";
  }
  if (ua.includes("chrome")) {
    return "chrome";
  }
  return "unknown";
}

async function flush(): Promise<void> {
  if (!state) return;
  if (!state.settings.activityReportingEnabled) {
    log.debug("flush skipped: reporting disabled");
    return;
  }
  const report = state.aggregator.flush(state.deviceId, Date.now());
  state.channel.send({ type: "time-report", payload: report });
  log.debug("flushed", { domains: report.domains.length });
}

function handleInternalMessage(msg: InternalMessage): void {
  if (!state) return;
  if (msg.kind === "focus-changed") {
    const domain = msg.payload.visible ? msg.payload.domain : "";
    state.aggregator.recordFocusChange(
      domain,
      msg.payload.visible,
      msg.payload.observedAt,
    );
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isInternalMessage(message)) {
      handleInternalMessage(message);
      sendResponse({ ok: true });
    }
    return false;
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    void flush();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

// Service workers may be evicted and re-instantiated; bootstrap on first
// tick too. The idempotent promise cache prevents duplicate listeners.
void bootstrap();

function isInternalMessage(value: unknown): value is InternalMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return kind === "focus-changed";
}
