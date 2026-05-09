import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

type NativePlugin = Record<string, unknown>;

/** Window may have Capacitor injected at runtime (Electron/native shells). */
interface WindowWithCapacitor extends Window {
  Capacitor?: { Plugins?: Record<string, unknown> };
}

function getCapacitorPlugins(): Record<string, unknown> {
  const capacitor = Capacitor as { Plugins?: Record<string, unknown> };
  if (capacitor.Plugins) {
    return capacitor.Plugins;
  }
  if (typeof window !== "undefined") {
    const windowCapacitor = (window as WindowWithCapacitor).Capacitor;
    return windowCapacitor?.Plugins ?? {};
  }
  return {};
}

export function getNativePlugin<T extends NativePlugin>(name: string): T {
  return (getCapacitorPlugins()[name] ?? {}) as T;
}

export interface SwabbleConfig {
  triggers: string[];
  minPostTriggerGap?: number;
  minCommandLength?: number;
  locale?: string;
  sampleRate?: number;
  modelSize?: "tiny" | "base" | "small" | "medium" | "large";
}

export interface SwabbleAudioLevelEvent {
  level: number;
  peak?: number;
}

export interface SwabblePluginLike extends NativePlugin {
  getConfig(): Promise<{ config: SwabbleConfig | null }>;
  isListening(): Promise<{ listening: boolean }>;
  updateConfig(options: { config: Partial<SwabbleConfig> }): Promise<void>;
  start(options: { config: SwabbleConfig }): Promise<{ started: boolean }>;
  stop(): Promise<void>;
  addListener(
    eventName: "audioLevel",
    listenerFunc: (event: SwabbleAudioLevelEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export interface TalkModeTranscriptEvent {
  transcript?: string;
  isFinal?: boolean;
}

export interface TalkModeErrorEvent {
  code?: string;
  message?: string;
}

export interface TalkModeStateEvent {
  state?: string;
}

export interface TalkModeSpeakingEvent {
  text?: string;
  isSystemTts?: boolean;
}

export interface TalkModeSpeakCompleteEvent {
  completed?: boolean;
  interruptedAt?: number;
}

export interface TalkModeSpeechLevelEvent {
  level?: number;
}

export interface TalkModePermissionStatus {
  microphone?: "granted" | "denied" | "prompt";
  speechRecognition?: "granted" | "denied" | "prompt" | "not_supported";
}

export interface MobileSignalsSleepSnapshot {
  available: boolean;
  isSleeping: boolean;
  asleepAt: number | null;
  awakeAt: number | null;
  durationMinutes: number | null;
  stage?: string | null;
}

export interface MobileSignalsBiometricSnapshot {
  sampleAt: number | null;
  heartRateBpm: number | null;
  restingHeartRateBpm: number | null;
  heartRateVariabilityMs: number | null;
  respiratoryRate: number | null;
  bloodOxygenPercent: number | null;
}

export interface MobileSignalsPermissionSnapshot {
  sleep?: boolean;
  biometrics?: boolean;
}

export interface MobileSignalsSignal {
  source: string;
  platform: string;
  state: string;
  observedAt: number;
  idleState?: string | null;
  idleTimeSeconds?: number | null;
  onBattery?: boolean | null;
  metadata?: Record<string, unknown>;
  healthSource?: string;
  permissions?: MobileSignalsPermissionSnapshot;
  sleep?: MobileSignalsSleepSnapshot;
  biometrics?: MobileSignalsBiometricSnapshot;
  warnings?: string[];
}

export type MobileSignalsSnapshot = MobileSignalsSignal;
export type MobileSignalsHealthSnapshot = MobileSignalsSignal;

export interface MobileSignalsPermissionStatus {
  status: "granted" | "denied" | "prompt";
  canRequest: boolean;
  permissions?: MobileSignalsPermissionSnapshot;
}

export interface MobileSignalsSnapshotResult {
  supported: boolean;
  snapshot: MobileSignalsSnapshot | null;
  healthSnapshot: MobileSignalsHealthSnapshot | null;
}

export interface MobileSignalsStartResult extends MobileSignalsSnapshotResult {
  enabled: boolean;
  platform?: string;
}

export interface MobileSignalsPluginLike extends NativePlugin {
  checkPermissions(): Promise<MobileSignalsPermissionStatus>;
  requestPermissions(): Promise<MobileSignalsPermissionStatus>;
  addListener(
    eventName: "signal",
    listenerFunc: (signal: MobileSignalsSignal) => void,
  ): Promise<PluginListenerHandle>;
  getSnapshot(): Promise<MobileSignalsSnapshotResult>;
  startMonitoring(options?: {
    emitInitial?: boolean;
  }): Promise<MobileSignalsStartResult>;
  stopMonitoring(): Promise<unknown>;
}

export type AppBlockerPermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "not-applicable";

export interface AppBlockerPermissionResult {
  status: AppBlockerPermissionStatus;
  canRequest: boolean;
  reason?: string;
}

export interface InstalledApp {
  packageName: string;
  displayName: string;
  tokenData?: string;
}

export interface SelectAppsResult {
  apps: InstalledApp[];
  cancelled: boolean;
}

export interface BlockAppsOptions {
  appTokens?: string[];
  packageNames?: string[];
  durationMinutes?: number | null;
}

export interface BlockAppsResult {
  success: boolean;
  endsAt: string | null;
  error?: string;
  blockedCount: number;
}

export interface UnblockAppsResult {
  success: boolean;
  error?: string;
}

export interface AppBlockerStatus {
  available: boolean;
  active: boolean;
  platform: string;
  engine: "family-controls" | "usage-stats-overlay" | "none";
  blockedCount: number;
  blockedPackageNames: string[];
  endsAt: string | null;
  permissionStatus: AppBlockerPermissionStatus;
  reason?: string;
}

export interface AppBlockerPluginLike extends NativePlugin {
  checkPermissions(): Promise<AppBlockerPermissionResult>;
  requestPermissions(): Promise<AppBlockerPermissionResult>;
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  selectApps(): Promise<SelectAppsResult>;
  blockApps(options: BlockAppsOptions): Promise<BlockAppsResult>;
  unblockApps(): Promise<UnblockAppsResult>;
  getStatus(): Promise<AppBlockerStatus>;
}

export interface TalkModePluginLike extends NativePlugin {
  addListener(
    eventName: "transcript",
    listenerFunc: (event: TalkModeTranscriptEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "error",
    listenerFunc: (event: TalkModeErrorEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "stateChange",
    listenerFunc: (event: TalkModeStateEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speaking",
    listenerFunc: (event: TalkModeSpeakingEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speakComplete",
    listenerFunc: (event: TalkModeSpeakCompleteEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speechLevel",
    listenerFunc: (event: TalkModeSpeechLevelEvent) => void,
  ): Promise<PluginListenerHandle>;
  checkPermissions(): Promise<TalkModePermissionStatus>;
  requestPermissions(): Promise<TalkModePermissionStatus>;
  start(options?: {
    config?: {
      stt?: {
        engine?: "whisper" | "web";
        modelSize?: "tiny" | "base" | "small" | "medium" | "large";
        language?: string;
        sampleRate?: number;
      };
      silenceWindowMs?: number;
      interruptOnSpeech?: boolean;
    };
  }): Promise<{ started: boolean; error?: string }>;
  stop(): Promise<void>;
}

export type GenericNativePlugin = NativePlugin;

export function getGatewayPlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("Gateway");
}

export function getSwabblePlugin(): SwabblePluginLike {
  return getNativePlugin<SwabblePluginLike>("Swabble");
}

export function getTalkModePlugin(): TalkModePluginLike {
  return getNativePlugin<TalkModePluginLike>("TalkMode");
}

export function getMobileSignalsPlugin(): MobileSignalsPluginLike {
  return getNativePlugin<MobileSignalsPluginLike>("MobileSignals");
}

export function getAppBlockerPlugin(): AppBlockerPluginLike {
  const plugins = getCapacitorPlugins();
  return (plugins.ElizaAppBlocker ??
    plugins.AppBlocker ??
    {}) as AppBlockerPluginLike;
}

export function getCameraPlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("Camera");
}

export function getLocationPlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("Location");
}

export function getScreenCapturePlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("ScreenCapture");
}

export function getCanvasPlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("Canvas");
}

export function getDesktopPlugin(): GenericNativePlugin {
  return getNativePlugin<GenericNativePlugin>("Desktop");
}
