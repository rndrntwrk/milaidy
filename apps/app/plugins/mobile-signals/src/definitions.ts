import type { PluginListenerHandle } from "@capacitor/core";

export type MobileSignalsPlatform = "android" | "ios" | "web";

export type MobileSignalsState = "active" | "idle" | "background" | "locked";

export interface MobileSignalsSnapshot {
  source: "mobile_device";
  platform: MobileSignalsPlatform;
  state: MobileSignalsState;
  observedAt: number;
  idleState: "active" | "idle" | "locked" | "unknown" | null;
  idleTimeSeconds: number | null;
  onBattery: boolean | null;
  metadata: Record<string, unknown>;
}

export interface MobileSignalsStartOptions {
  emitInitial?: boolean;
}

export interface MobileSignalsStartResult {
  enabled: boolean;
  supported: boolean;
  platform: MobileSignalsPlatform;
  snapshot: MobileSignalsSnapshot | null;
}

export interface MobileSignalsStopResult {
  stopped: boolean;
}

export interface MobileSignalsSnapshotResult {
  supported: boolean;
  snapshot: MobileSignalsSnapshot | null;
}

export interface MobileSignalsPlugin {
  startMonitoring(
    options?: MobileSignalsStartOptions,
  ): Promise<MobileSignalsStartResult>;
  stopMonitoring(): Promise<MobileSignalsStopResult>;
  getSnapshot(): Promise<MobileSignalsSnapshotResult>;
  addListener(
    eventName: "signal",
    listenerFunc: (event: MobileSignalsSnapshot) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
