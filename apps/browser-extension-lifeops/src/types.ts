/**
 * Shared types for the LifeOps browser extension.
 *
 * These types describe the cross-component message protocol and the
 * payload shape shipped to the local agent via WebSocket.
 */

export interface DomainBucket {
  /** Lowercase hostname — not an eTLD+1. `mail.google.com` and `drive.google.com` are distinct buckets. */
  readonly domain: string;
  readonly focusMs: number;
  readonly sessionCount: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
}

export interface TimeReport {
  readonly deviceId: string;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly domains: readonly DomainBucket[];
}

export interface RegisterBrowserSessionPayload {
  readonly deviceId: string;
  readonly userAgent: string;
  readonly extensionVersion: string;
  readonly browserVendor: "chrome" | "safari" | "unknown";
}

export type OutboundMessage =
  | {
      readonly type: "register-session";
      readonly payload: RegisterBrowserSessionPayload;
    }
  | { readonly type: "time-report"; readonly payload: TimeReport };

export type InboundMessage =
  | { readonly type: "ack"; readonly correlationId?: string }
  | { readonly type: "ping" };

export interface ExtensionSettings {
  /** WebSocket URL for the desktop Milady agent endpoint. */
  readonly wsUrl: string;
  /** Flush interval in milliseconds. Clamped to chrome.alarms' 1-minute minimum at runtime. */
  readonly flushIntervalMs: number;
  readonly activityReportingEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  wsUrl: "ws://127.0.0.1:31339/ext",
  flushIntervalMs: 60_000,
  activityReportingEnabled: true,
};

/** Internal messages between content scripts and the background worker. */
export type InternalMessage = {
  readonly kind: "focus-changed";
  readonly payload: {
    readonly domain: string;
    readonly visible: boolean;
    readonly observedAt: number;
  };
};
