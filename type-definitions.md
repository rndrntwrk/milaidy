# Type Definitions

Auto-generated from the repository source files.
Excludes: node_modules, dist, *.d.ts, tests, stories.

## `apps/app/electrobun/scripts/local-adhoc-sign-macos.ts`

```typescript
type ExecFileSyncFn = typeof execFileSync;

type SpawnSyncFn = typeof spawnSync;
```

## `apps/app/electrobun/scripts/postwrap-diagnostics.ts`

```typescript
type BinaryReport = {
  exists: boolean;
  name: string;
  path: string;
  codesign?: string;
  file?: string;
  lipo?: string;
};

type ArchiveReport = {
  containsWgpuDawn: boolean;
  path: string;
  sampleEntries: string[];
};

type WrapperDiagnostics = {
  appName: string;
  arch: string;
  binaryDir: string;
  binaries: BinaryReport[];
  buildDir: string | null;
  generatedAt: string;
  os: string;
  outputPath: string;
  resourcesDir: string;
  resourceArchives: ArchiveReport[];
  wrapperBundlePath: string;
};
```

## `apps/app/electrobun/scripts/postwrap-sign-runtime-macos.ts`

```typescript
type MachOKind = "executable" | "library" | null;

type ExecFileSyncFn = typeof execFileSync;
```

## `apps/app/electrobun/src/__stubs__/bun-ffi.ts`

```typescript
export type Pointer = number;
```

## `apps/app/electrobun/src/agent-ready-state.ts`

```typescript
type AgentReadyListener = (ready: boolean) => void;
```

## `apps/app/electrobun/src/api-base.ts`

```typescript
type ExternalApiBaseEnvKey =
  | "MILADY_DESKTOP_TEST_API_BASE"
  | "MILADY_DESKTOP_API_BASE"
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE";

export type DesktopRuntimeMode = "local" | "external" | "disabled";

type ApiBaseUpdateRpc = {
  send?: {
    apiBaseUpdate?: (payload: { base: string; token?: string }) => void;
  };
};
```

## `apps/app/electrobun/src/application-menu.ts`

```typescript
type ApplicationMenuRole =
  | "about"
  | "services"
  | "hide"
  | "hideOthers"
  | "unhide"
  | "quit"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "reload"
  | "forceReload"
  | "toggleDevTools"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "togglefullscreen"
  | "minimize"
  | "close"
  | "zoom"
  | "front";

export type ApplicationMenuItem = {
  label?: string;
  submenu?: ApplicationMenuItem[];
  role?: ApplicationMenuRole;
  action?: string;
  accelerator?: string;
  type?: "separator";
  enabled?: boolean;
};
```

## `apps/app/electrobun/src/bridge/electrobun-bridge.ts`

```typescript
type IpcListener = (...args: unknown[]) => void;

type RpcMessageListener = (payload: unknown) => void;
```

## `apps/app/electrobun/src/bridge/electrobun-direct-rpc.ts`

```typescript
type RpcMessageListener = (payload: unknown) => void;

type RendererRequestHandler = (params: unknown) => Promise<unknown>;

type RendererBridgeRpc = {
  request: Record<string, RendererRequestHandler>;
};
```

## `apps/app/electrobun/src/cloud-auth-window.ts`

```typescript
type NavigationEventLike =
  | string
  | {
      url?: string;
      data?: { detail?: string };
      preventDefault?: () => void;
    }
  | null
  | undefined;

type HostMessageEventLike =
  | {
      detail?: unknown;
      data?: { detail?: unknown };
    }
  | null
  | undefined;
```

## `apps/app/electrobun/src/cloud-disconnect-from-main.ts`

```typescript
  type FetchLike,
  pickReachableMenuResetApiBase,
} from "./menu-reset-from-main";

export type CloudDisconnectMainResult =
  | { ok: true }
  | { ok: false; error: string };
```

## `apps/app/electrobun/src/index.ts`

```typescript
  type HeartbeatMenuSnapshot,
  parseSettingsWindowAction,
} from "./application-menu";

  type ManagedWindowLike,
  SurfaceWindowManager,
} from "./surface-windows";

type SendToWebview = (message: string, payload?: unknown) => void;

type HeartbeatMenuTriggerSummary = {
  enabled: boolean;
  nextRunAtMs?: number;
  lastRunAtIso?: string;
};

type HeartbeatMenuHealthResponse = {
  activeTriggers?: number;
  totalExecutions?: number;
  totalFailures?: number;
  lastExecutionAt?: number;
};

type RpcSendProxy = Record<string, ((payload: unknown) => void) | undefined>;

type ElectrobunRpcInstance = {
  send?: RpcSendProxy;
  setRequestHandler?: (
    handlers: Record<string, (params: never) => unknown>,
  ) => void;
};
```

## `apps/app/electrobun/src/menu-reset-from-main.ts`

```typescript
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type MainMenuResetPostConfirmDeps = {
  apiBase: string;
  fetchImpl: FetchLike;
  buildHeaders: () => Record<string, string>;
  /** `true` when `resolveDesktopRuntimeMode(env).mode === "local"`. */
  useEmbeddedRestart: boolean;
  restartEmbeddedClearingLocalDb: () => Promise<{ port?: number }>;
  /** Called when embedded restart returns a port (local mode). */
  pushEmbeddedApiBaseToRenderer: (port: number, apiToken: string) => void;
  getLocalApiAuthToken: () => string;
  /** External / non-embedded: POST restart (errors ignored). */
  postExternalAgentRestart: () => Promise<void>;
  resolveApiBaseForStatusPoll: () => string;
  sendMenuResetAppliedToRenderer: (payload: {
    itemId: "menu-reset-milady-applied";
    agentStatus: Record<string, unknown>;
  }) => void;
};
```

## `apps/app/electrobun/src/native/agent.ts`

```typescript
type ExistingElizaInstallSource =
  | "config-path-env"
  | "state-dir-env"
  | "default-state-dir";

type SendToWebview = (message: string, payload?: unknown) => void;

type BunSubprocess = ReturnType<typeof Bun.spawn>;
```

## `apps/app/electrobun/src/native/canvas.ts`

```typescript
type WebviewEvalRpc = {
  requestProxy?: {
    evaluateJavascriptWithResponse?: (params: {
      script: string;
    }) => Promise<unknown>;
  };
};

type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/desktop.ts`

```typescript
  type ApplicationMenuItemConfig,
  BrowserView,
  type BrowserWindow,
  BuildConfig,
  ContextMenu,
  GlobalShortcut,
  type MenuItemConfig,
  Screen,
  Session,
  Tray,
  Updater,
  Utils,
} from "electrobun/bun";

type SendToWebview = (message: string, payload?: unknown) => void;

type ElectrobunEventHandler = (...args: unknown[]) => void;
```

## `apps/app/electrobun/src/native/gateway.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;

type BonjourFactory = () => BonjourModule;

type BonjourModuleProvider = BonjourFactory | { default: BonjourFactory };
```

## `apps/app/electrobun/src/native/gpu-window.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/index.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/location.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/mac-window-effects.ts`

```typescript
type MacEffectsSymbols = {
  enableWindowVibrancy(ptr: Pointer): boolean;
  ensureWindowShadow(ptr: Pointer): boolean;
  setWindowTrafficLightsPosition(ptr: Pointer, x: number, y: number): boolean;
  setNativeWindowDragRegion(ptr: Pointer, x: number, height: number): boolean;
  orderOutWindow(ptr: Pointer): boolean;
  makeKeyAndOrderFrontWindow(ptr: Pointer): boolean;
  isAppActive(): boolean;
  isWindowKey(ptr: Pointer): boolean;
};

type MacEffectsLib = { symbols: MacEffectsSymbols; close(): void } | null;
```

## `apps/app/electrobun/src/native/permissions-darwin.ts`

```typescript
type TccPermissionService =
  | "kTCCServiceAccessibility"
  | "kTCCServiceScreenCapture";
```

## `apps/app/electrobun/src/native/permissions-shared.ts`

```typescript
export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export type Platform = "darwin" | "win32" | "linux";
```

## `apps/app/electrobun/src/native/permissions.ts`

```typescript
type PlatformModule = typeof import("./permissions-darwin");

type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/screencapture.ts`

```typescript
type WebviewEvalRpc = {
  requestProxy?: {
    evaluateJavascriptWithResponse?: (params: {
      script: string;
    }) => Promise<unknown>;
  };
};

type Webview = { rpc?: unknown };

type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/swabble.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/native/talkmode.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;
```

## `apps/app/electrobun/src/preload-validation.ts`

```typescript
type FsLike = Pick<typeof fs, "existsSync" | "readFileSync" | "statSync">;
```

## `apps/app/electrobun/src/rpc-handlers.ts`

```typescript
type SendToWebview = (message: string, payload?: unknown) => void;

type ElectrobunRpcWithHandlers = {
  // biome-ignore lint/suspicious/noExplicitAny: Electrobun doesn't export a typed setRequestHandler interface; individual handlers are typed at call-sites
  setRequestHandler?: (handlers: Record<string, (params: unknown) => unknown>) => void;
};
```

## `apps/app/electrobun/src/rpc-schema.ts`

```typescript
export type DesktopSessionStorageType =
  | "cookies"
  | "localStorage"
  | "sessionStorage"
  | "indexedDB"
  | "webSQL"
  | "cache"
  | "all";

export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export type TalkModeState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export type MiladyRPCSchema = {
  bun: RPCSchema<{
    requests: {
      // ---- Agent ----
      agentStart: { params: undefined; response: EmbeddedAgentStatus };
      agentStop: { params: undefined; response: { ok: true } };
      agentRestart: { params: undefined; response: EmbeddedAgentStatus };
      agentRestartClearLocalDb: {
        params: undefined;
        response: EmbeddedAgentStatus;
      };
      agentStatus: { params: undefined; response: EmbeddedAgentStatus };
      agentInspectExistingInstall: {
        params: undefined;
        response: ExistingElizaInstallInfo;
      };
      agentPostCloudDisconnect: {
        params: { apiBase?: string; bearerToken?: string } | undefined | null;
        response: { ok: boolean; error?: string };
      };
      /** Native confirm + main POST (renderer bridge/fetch can stall after a sheet). */
      agentCloudDisconnectWithConfirm: {
        params: { apiBase?: string; bearerToken?: string } | undefined | null;
        response:
          | { cancelled: true }
          | { ok: true }
          | { ok: false; error: string };
      };

      // ---- Desktop: Tray ----
      desktopCreateTray: { params: TrayOptions; response: undefined };
      desktopUpdateTray: { params: Partial<TrayOptions>; response: undefined };
      desktopDestroyTray: { params: undefined; response: undefined };
      desktopSetTrayMenu: {
        params: { menu: TrayMenuItem[] };
        response: undefined;
      };

      // ---- Desktop: Shortcuts ----
      desktopRegisterShortcut: {
        params: ShortcutOptions;
        response: { success: boolean };
      };
      desktopUnregisterShortcut: {
        params: { id: string };
        response: undefined;
      };
      desktopUnregisterAllShortcuts: { params: undefined; response: undefined };
      desktopIsShortcutRegistered: {
        params: { accelerator: string };
        response: { registered: boolean };
      };

      // ---- Desktop: Auto Launch ----
      desktopSetAutoLaunch: {
        params: { enabled: boolean; openAsHidden?: boolean };
        response: undefined;
      };
      desktopGetAutoLaunchStatus: {
        params: undefined;
        response: { enabled: boolean; openAsHidden: boolean };
      };

      // ---- Desktop: Window ----
      desktopSetWindowOptions: { params: WindowOptions; response: undefined };
      desktopGetWindowBounds: { params: undefined; response: WindowBounds };
      desktopSetWindowBounds: { params: WindowBounds; response: undefined };
      desktopMinimizeWindow: { params: undefined; response: undefined };
      desktopUnminimizeWindow: { params: undefined; response: undefined };
      desktopMaximizeWindow: { params: undefined; response: undefined };
      desktopUnmaximizeWindow: { params: undefined; response: undefined };
      desktopCloseWindow: { params: undefined; response: undefined };
      desktopShowWindow: { params: undefined; response: undefined };
      desktopHideWindow: { params: undefined; response: undefined };
      desktopFocusWindow: { params: undefined; response: undefined };
      desktopIsWindowMaximized: {
        params: undefined;
        response: { maximized: boolean };
      };
      desktopIsWindowMinimized: {
        params: undefined;
        response: { minimized: boolean };
      };
      desktopIsWindowVisible: {
        params: undefined;
        response: { visible: boolean };
      };
      desktopIsWindowFocused: {
        params: undefined;
        response: { focused: boolean };
      };
      desktopSetAlwaysOnTop: {
        params: { flag: boolean; level?: string };
        response: undefined;
      };
      desktopSetFullscreen: { params: { flag: boolean }; response: undefined };
      desktopSetOpacity: { params: { opacity: number }; response: undefined };

      // ---- Desktop: Notifications ----
      desktopShowNotification: {
        params: NotificationOptions;
        response: { id: string };
      };
      desktopCloseNotification: { params: { id: string }; response: undefined };
      desktopShowBackgroundNotice: {
        params: undefined;
        response: { shown: boolean };
      };

      // ---- Desktop: Power ----
      desktopGetPowerState: { params: undefined; response: PowerState };

      // ---- Screen ----
      desktopGetPrimaryDisplay: { params: undefined; response: DisplayInfo };
      desktopGetAllDisplays: {
        params: undefined;
        response: { displays: DisplayInfo[] };
      };
      desktopGetCursorPosition: { params: undefined; response: CursorPosition };

      // ---- Desktop: Message Box ----
      desktopShowMessageBox: {
        params: MessageBoxOptions;
        response: MessageBoxResult;
      };

      // ---- Desktop: App ----
      desktopQuit: { params: undefined; response: undefined };
      desktopRelaunch: { params: undefined; response: undefined };
      desktopApplyUpdate: { params: undefined; response: undefined };
      desktopCheckForUpdates: {
        params: undefined;
        response: DesktopUpdaterSnapshot;
      };
      desktopGetUpdaterState: {
        params: undefined;
        response: DesktopUpdaterSnapshot;
      };
      desktopGetVersion: { params: undefined; response: VersionInfo };
      desktopGetBuildInfo: { params: undefined; response: DesktopBuildInfo };
      desktopIsPackaged: { params: undefined; response: { packaged: boolean } };
      desktopGetDockIconVisibility: {
        params: undefined;
        response: { visible: boolean };
      };
      desktopSetDockIconVisibility: {
        params: { visible: boolean };
        response: { visible: boolean };
      };
      desktopGetPath: {
        params: { name: string };
        response: { path: string };
      };
      desktopBeep: { params: undefined; response: undefined };
      desktopShowSelectionContextMenu: {
        params: { text: string };
        response: { shown: boolean };
      };
      desktopGetSessionSnapshot: {
        params: { partition: string };
        response: DesktopSessionSnapshot;
      };
      desktopClearSessionData: {
        params: {
          partition: string;
          storageTypes?: DesktopSessionStorageType[] | "all";
          clearCookies?: boolean;
        };
        response: DesktopSessionSnapshot;
      };
      desktopGetWebGpuBrowserStatus: {
        params: undefined;
        response: {
          available: boolean;
          reason: string;
          renderer: string;
          chromeBetaPath: string | null;
          downloadUrl: string | null;
        };
      };
      desktopOpenReleaseNotesWindow: {
        params: { url: string; title?: string };
        response: DesktopReleaseNotesWindowInfo;
      };
      desktopOpenSettingsWindow: {
        params: { tabHint?: string } | undefined;
        response: undefined;
      };
      desktopOpenSurfaceWindow: {
        params: {
          surface:
            | "chat"
            | "browser"
            | "release"
            | "triggers"
            | "plugins"
            | "connectors"
            | "cloud";
          browse?: string;
        };
```

## `apps/app/electrobun/src/surface-windows.ts`

```typescript
export type DetachedSurface =
  | "chat"
  | "browser"
  | "release"
  | "triggers"
  | "plugins"
  | "connectors"
  | "cloud";

export type ManagedSurface = DetachedSurface | "settings";
```

## `apps/app/plugins/camera/src/definitions.ts`

```typescript
export type CameraDirection = "front" | "back" | "external";

export type CameraFlashMode = "auto" | "on" | "off" | "torch";

export type CameraFocusMode = "auto" | "continuous" | "manual";

export type CameraExposureMode = "auto" | "continuous" | "manual";

export type MediaType = "photo" | "video";
```

## `apps/app/plugins/camera/src/web.ts`

```typescript
type CameraEventData =
  | CameraFrameEvent
  | CameraErrorEvent
  | VideoRecordingState;

    type MediaTrackCapabilitiesExtended = MediaTrackCapabilities & {
      zoom?: { min: number; max: number };
      width?: { min: number; max: number };
      height?: { min: number; max: number };
      frameRate?: { min: number; max: number };
      torch?: boolean; // Flash/torch capability
    };

    type MediaTrackCapabilitiesExtended = MediaTrackCapabilities & {
      zoom?: { min: number; max: number };
    };

    type ExtendedCaps = MediaTrackCapabilities & { focusMode?: string[] };

    type ExtendedCaps = MediaTrackCapabilities & { exposureMode?: string[] };
```

## `apps/app/plugins/canvas/electrobun/src/index.ts`

```typescript
type EventCallback<T> = (event: T) => void;

type CanvasEvent = CanvasTouchEvent | CanvasRenderEvent;

type CanvasGradient2D = ReturnType<
```

## `apps/app/plugins/canvas/src/definitions.ts`

```typescript
export type CanvasGradient = CanvasLinearGradient | CanvasRadialGradient;

export type CanvasDrawBatchCommand =
  | {
      type: "rect";
      args: {
        rect: CanvasRect;
        fill?: CanvasFillStyle | CanvasGradient;
        stroke?: CanvasStrokeStyle;
        cornerRadius?: number;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "ellipse";
      args: {
        center: CanvasPoint;
        radiusX: number;
        radiusY: number;
        fill?: CanvasFillStyle | CanvasGradient;
        stroke?: CanvasStrokeStyle;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "line";
      args: {
        from: CanvasPoint;
        to: CanvasPoint;
        stroke: CanvasStrokeStyle;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "path";
      args: {
        path: CanvasPath;
        fill?: CanvasFillStyle | CanvasGradient;
        stroke?: CanvasStrokeStyle;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "text";
      args: {
        text: string;
        position: CanvasPoint;
        style: CanvasTextStyle;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "image";
      args: {
        image: CanvasImageData | string;
        destRect: CanvasRect;
        srcRect?: CanvasRect;
        drawOptions?: CanvasDrawOptions;
      };
    }
  | {
      type: "clear";
      args: {
        rect?: CanvasRect;
        layerId?: string;
      };
    };

export type WebViewPlacement = "inline" | "fullscreen" | "popup";

export type SnapshotFormat = "png" | "jpeg" | "webp";
```

## `apps/app/plugins/canvas/src/web.ts`

```typescript
type CanvasEventData =
  | CanvasTouchEvent
  | CanvasRenderEvent
  | WebViewReadyEvent
  | NavigationErrorEvent
  | DeepLinkEvent
  | A2UIActionEvent;

type CanvasGradient2D = globalThis.CanvasGradient;
```

## `apps/app/plugins/desktop/electrobun/src/index.ts`

```typescript
type DesktopEventPayloads = {
  trayClick: TrayClickEvent;
  trayDoubleClick: TrayClickEvent;
  trayRightClick: TrayClickEvent;
  trayMenuClick: TrayMenuClickEvent;
  shortcutPressed: GlobalShortcutEvent;
  notificationClick: NotificationEvent;
  notificationAction: NotificationEvent;
  notificationReply: NotificationEvent;
  windowFocus: undefined;
  windowBlur: undefined;
  windowMaximize: undefined;
  windowUnmaximize: undefined;
  windowMinimize: undefined;
  windowRestore: undefined;
  windowClose: undefined;
  powerSuspend: undefined;
  powerResume: undefined;
  powerOnAC: undefined;
  powerOnBattery: undefined;
};

type DesktopEventName = keyof DesktopEventPayloads;

type DesktopEventData = DesktopEventPayloads[DesktopEventName];

type EventCallback<T = DesktopEventData> = (event: T) => void;

type AlwaysOnTopLevel = Parameters<DesktopPlugin["setAlwaysOnTop"]>[0]["level"];

type DesktopPathName = Parameters<DesktopPlugin["getPath"]>[0]["name"];

type DesktopVersionResult =
  | {
      version: string;
      name: string;
      runtime: string;
    }
  | {
      version: string;
      name: string;
      runtime: string;
      chrome: string;
      node: string;
    };
```

## `apps/app/plugins/desktop/src/definitions.ts`

```typescript
export type TrayMenuItem = TrayMenuItemWithSubmenu;
```

## `apps/app/plugins/desktop/src/web.ts`

```typescript
type DesktopEventData =
  | TrayClickEvent
  | TrayMenuClickEvent
  | GlobalShortcutEvent
  | NotificationEvent
  | undefined;

    type BatteryManager = { level: number; charging: boolean };
```

## `apps/app/plugins/gateway/electrobun/src/index.ts`

```typescript
type EventCallback<T> = (event: T) => void;

type GatewayEventData =
  | GatewayEvent
  | GatewayStateEvent
  | GatewayErrorEvent
  | GatewayDiscoveryEvent;

type GatewayEventName = "gatewayEvent" | "stateChange" | "error" | "discovery";
```

## `apps/app/plugins/gateway/src/definitions.ts`

```typescript
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
```

## `apps/app/plugins/location/electrobun/src/index.ts`

```typescript
type EventCallback<T> = (event: T) => void;

type LocationEventData = LocationResult | LocationErrorEvent;
```

## `apps/app/plugins/location/src/definitions.ts`

```typescript
export type LocationAccuracy = "best" | "high" | "medium" | "low" | "passive";
```

## `apps/app/plugins/screencapture/src/web.ts`

```typescript
type ScreenCaptureEventData = ScreenRecordingState | ScreenCaptureErrorEvent;

type DisplayMediaDevices = MediaDevices & {
  getDisplayMedia(
    constraints?: DisplayMediaStreamOptions,
  ): Promise<MediaStream>;
};
```

## `apps/app/plugins/swabble/electrobun/src/index.ts`

```typescript
type EventCallback<T> = (event: T) => void;

type SwabbleEvent =
  | SwabbleWakeWordEvent
  | SwabbleTranscriptEvent
  | SwabbleStateEvent
  | SwabbleAudioLevelEvent
  | SwabbleErrorEvent;
```

## `apps/app/plugins/swabble/src/web.ts`

```typescript
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type ElectrobunRequestHandler = (params?: unknown) => Promise<unknown>;

type ElectrobunMessageListener = (payload: unknown) => void;

type DesktopBridgeWindow = Window & {
  __ELIZA_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
};
```

## `apps/app/plugins/talkmode/electrobun/src/index.ts`

```typescript
type EventCallback<T> = (event: T) => void;

type TalkModeEvent =
  | TalkModeStateEvent
  | TalkModeTranscriptEvent
  | TTSSpeakingEvent
  | TTSCompleteEvent
  | TalkModeErrorEvent;
```

## `apps/app/plugins/talkmode/src/definitions.ts`

```typescript
export type TalkModeState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";
```

## `apps/app/plugins/talkmode/src/web.ts`

```typescript
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
```

## `apps/homepage/src/components/DownloadIcons.tsx`

```typescript
type InstallMethod = "shell" | "powershell" | "brew";
```

## `apps/homepage/src/components/dashboard/AgentDetail.tsx`

```typescript
type Tab = (typeof TABS)[number];
```

## `apps/homepage/src/components/dashboard/CreateAgent.tsx`

```typescript
type OnboardingStep = "select" | "customize" | "deploying" | "done";
```

## `apps/homepage/src/components/dashboard/CreateAgentForm.tsx`

```typescript
type CreateStep = "form" | "creating" | "provisioning" | "done" | "error";
```

## `apps/homepage/src/components/dashboard/Sidebar.tsx`

```typescript
export type DashboardSection = (typeof SECTIONS)[number]["id"] | "billing";
```

## `apps/homepage/src/components/dashboard/SourceBar.tsx`

```typescript
export type SourceFilter = "all" | "local" | "cloud" | "remote";
```

## `apps/homepage/src/components/dashboard/useCloudLogin.ts`

```typescript
export type CloudLoginState =
  | "checking"
  | "unauthenticated"
  | "polling"
  | "authenticated"
  | "error";
```

## `apps/homepage/src/lib/AgentProvider.tsx`

```typescript
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type AgentSource = "cloud" | "local" | "remote";

export type SourceFilter = "all" | "local" | "cloud" | "remote";
```

## `apps/homepage/src/lib/cloud-api.ts`

```typescript
export type ConnectionType = "local" | "remote" | "cloud";
```

## `deploy/cloudflare/eliza-cloud-proxy/worker.ts`

```typescript
type Env = {
  ELIZA_CLOUD_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
};
```

## `packages/agent/src/actions/send-message.ts`

```typescript
type MessageTransportService = {
  sendDirectMessage?: (
    targetEntityId: string,
    content: Content,
  ) => Promise<void>;
  sendRoomMessage?: (targetRoomId: string, content: Content) => Promise<void>;
};
```

## `packages/agent/src/actions/switch-stream-source.ts`

```typescript
type ValidSourceType = (typeof VALID_SOURCE_TYPES)[number];
```

## `packages/agent/src/api/agent-admin-routes.ts`

```typescript
type AgentStateStatus =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "restarting"
  | "error";
```

## `packages/agent/src/api/agent-lifecycle-routes.ts`

```typescript
type AgentStateStatus =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "restarting"
  | "error";
```

## `packages/agent/src/api/character-routes.ts`

```typescript
type CharacterGenerateField =
  | "bio"
  | "system"
  | "style"
  | "chatExamples"
  | "postExamples";

type CharacterGenerateMode = "append" | "replace";

type CharacterValidationResult =
  | { success: true }
  | { success: false; error: CharacterParseErrorLike };
```

## `packages/agent/src/api/cloud-routes.ts`

```typescript
type CreateTelemetrySpanLike = (meta: {
  boundary: "cloud";
  operation: string;
  timeoutMs?: number;
}) => IntegrationTelemetrySpanLike;
```

## `packages/agent/src/api/compat-utils.ts`

```typescript
export type OpenAiChatRole =
  | "system"
  | "developer"
  | "user"
  | "assistant"
  | "tool"
  | "function";

export type AnthropicRole = "user" | "assistant";
```

## `packages/agent/src/api/connector-health.ts`

```typescript
export type ConnectorStatus = "ok" | "missing" | "unknown";
```

## `packages/agent/src/api/coordinator-types.ts`

```typescript
export type SwarmEvent = Record<string, any>;

export type TaskContext = Record<string, any>;
```

## `packages/agent/src/api/diagnostics-routes.ts`

```typescript
type DiagnosticsSseInit = (res: http.ServerResponse) => void;

type DiagnosticsSseWriteJson = (
  res: http.ServerResponse,
  payload: object,
  event?: string,
) => void;
```

## `packages/agent/src/api/knowledge-routes.ts`

```typescript
  type RequestOptions as HttpRequestOptions,
  type IncomingMessage,
  request as requestHttp,
} from "node:http";

  type KnowledgeServiceLike,
} from "./knowledge-service-loader";

export type KnowledgeRouteHelpers = RouteHelpers;

type ResolvedUrlTarget = {
  parsed: URL;
  hostname: string;
  pinnedAddress: string;
};

type PinnedFetchInput = {
  url: URL;
  init: RequestInit;
  target: ResolvedUrlTarget;
  timeoutMs: number;
};

type PinnedFetchImpl = (input: PinnedFetchInput) => Promise<Response>;

  type KnowledgeUploadDocumentBody = {
    content: string;
    filename: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  };
```

## `packages/agent/src/api/knowledge-service-loader.ts`

```typescript
export type KnowledgeLoadFailReason =
  | "timeout"
  | "runtime_unavailable"
  | "not_registered";
```

## `packages/agent/src/api/memory-routes.ts`

```typescript
  type AgentRuntime,
  ChannelType,
  createMessageMemory,
  type Memory,
  ModelType,
  stringToUuid,
  type UUID,
} from "@elizaos/core";

type MemorySearchHit = {
  id: string;
  text: string;
  createdAt: number;
  score: number;
};

type KnowledgeSearchHit = {
  id: string;
  text: string;
  similarity: number;
  documentId?: string;
  documentTitle?: string;
  position?: number;
};
```

## `packages/agent/src/api/nfa-routes.ts`

```typescript
type NfaPlugin = {
  buildMerkleRoot: (leafHashes: string[]) => string;
  parseLearnings: (markdown: string) => Array<{ hash: string }>;
  sha256: (data: string) => string;
};
```

## `packages/agent/src/api/provider-switch-config.ts`

```typescript
  type OnboardingConnection,
  type OnboardingLocalProviderId,
} from "../contracts/onboarding";

type MutableElizaConfig = Partial<ElizaConfig> & {
  cloud?: Record<string, unknown>;
  models?: Record<string, unknown>;
  wallet?: { rpcProviders?: Record<string, string> };
};
```

## `packages/agent/src/api/server.ts`

```typescript
  type AgentRuntime,
  ChannelType,
  type Content,
  ContentType,
  createMessageMemory,
  logger,
  type Media,
  ModelType,
  stringToUuid,
  type Task,
  type UUID,
} from "@elizaos/core";

  type ElizaConfig,
  loadElizaConfig,
  saveElizaConfig,
} from "../config/config.js";

  type AgentEventPayloadLike,
  type AgentEventServiceLike,
  getAgentEventService,
} from "../runtime/agent-event-service.js";

  type CoreManagerLike,
  type InstallProgressLike,
  isCoreManagerLike,
  isPluginManagerLike,
  type PluginManagerLike,
} from "../services/plugin-manager-types.js";

  type ReadJsonBodyOptions,
  readRequestBody,
  readRequestBodyBuffer,
  sendJson,
  sendJsonError,
} from "./http-helpers.js";

  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";

type PiAiPluginModule = typeof import("@elizaos/plugin-pi-ai");

type ConnectorRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
) => Promise<boolean>;

type StreamEventType = "agent_event" | "heartbeat_event" | "training_event";

type ResponseBlock =
  | { type: "text"; text: string }
  | { type: "ui-spec"; spec: Record<string, unknown>; raw: string }
  | {
      type: "config-form";
      pluginId: string;
      pluginName?: string;
      schema: Record<string, unknown>;
      hints?: Record<string, unknown>;
      values?: Record<string, unknown>;
    };

type SkillPreferencesMap = Record<string, boolean>;

type SkillAcknowledgmentMap = Record<

type StreamableServerResponse = Pick<

  type StreamSource = "unset" | "callback" | "onStreamChunk";

type MessageMemory = ReturnType<typeof createMessageMemory>;

type ModelCategory = "chat" | "embedding" | "image" | "tts" | "stt" | "other";

export type TradePermissionMode =
  | "user-sign-only"
  | "manual-local-key"
  | "agent-auto";

type AgentAutomationMode = "connectors-only" | "full";

type TrainingServiceLike = TrainingServiceWithRuntime;

type TrainingServiceCtor = new (options: {
  getRuntime: () => AgentRuntime | null;
  getConfig: () => ElizaConfig;
  setConfig: (nextConfig: ElizaConfig) => void;
}) => TrainingServiceLike;

type ConversationRoomTitleRef = Pick<

  type ScratchStatus = "pending_decision" | "kept" | "promoted";

  type ScratchTerminalEvent = "stopped" | "task_complete" | "error";

  type ScratchRecord = {
    sessionId: string;
    label: string;
    path: string;
    status: ScratchStatus;
    createdAt: number;
    terminalAt: number;
    terminalEvent: ScratchTerminalEvent;
    expiresAt?: number;
  };

  type AgentPreflightRecord = {
    adapter?: string;
    installed?: boolean;
    installCommand?: string;
    docsUrl?: string;
  };

  type CodeTaskService = {
    getTasks?: () => Promise<
      Array<{
        id?: string;
        name?: string;
        description?: string;
        metadata?: {
          status?: string;
          providerId?: string;
          providerLabel?: string;
          workingDirectory?: string;
          progress?: number;
          steps?: Array<{ status?: string }>;
        };
      }>
    >;
    getAgentPreflight?: () => Promise<unknown>;
    listAgentPreflight?: () => Promise<unknown>;
    preflightCodingAgents?: () => Promise<unknown>;
    preflight?: () => Promise<unknown>;
    listScratchWorkspaces?: () => Promise<unknown>;
    getScratchWorkspaces?: () => Promise<unknown>;
    listScratch?: () => Promise<unknown>;
    keepScratchWorkspace?: (sessionId: string) => Promise<unknown>;
    keepScratch?: (sessionId: string) => Promise<unknown>;
    deleteScratchWorkspace?: (sessionId: string) => Promise<unknown>;
    deleteScratch?: (sessionId: string) => Promise<unknown>;
    promoteScratchWorkspace?: (
      sessionId: string,
      name?: string,
    ) => Promise<unknown>;
    promoteScratch?: (sessionId: string, name?: string) => Promise<unknown>;
  };
```

## `packages/agent/src/api/signal-routes.ts`

```typescript
export type SignalPairingEventLike = SignalPairingEvent;
```

## `packages/agent/src/api/streaming-text.ts`

```typescript
export type StreamingUpdateKind = "noop" | "append" | "replace";
```

## `packages/agent/src/api/subscription-routes.ts`

```typescript
type AuthModule = typeof import("../auth/index");

export type SubscriptionAuthApi = Pick<
```

## `packages/agent/src/api/training-routes.ts`

```typescript
export type TrainingRouteHelpers = RouteHelpers;
```

## `packages/agent/src/api/trajectory-routes.ts`

```typescript
type TrajectoryStatus = "active" | "completed" | "error" | "timeout";

type TrajectoryExportFormat = "json" | "csv" | "art";

type TrajectoryZipExportOptions = {
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
  scenarioId?: string;
  batchId?: string;
};

type TrajectoryZipExportResult = {
  filename: string;
  entries: Array<{ name: string; data: string }>;
};

type TrajectoryLoggerRuntimeLike = AgentRuntime & {
  getServicesByType?: (serviceType: string) => unknown;
  getService?: (serviceType: string) => unknown;
  getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
  getServiceRegistrationStatus?: (
    serviceType: string,
  ) => "pending" | "registering" | "registered" | "failed" | "unknown";
};
```

## `packages/agent/src/api/trigger-routes.ts`

```typescript
  type AgentRuntime,
  stringToUuid,
  type Task,
  type UUID,
} from "@elizaos/core";

export type TriggerRouteHelpers = RouteHelpers;

type TriggerTaskMetadataLike = Record<string, unknown> & {
  triggerRuns?: unknown[];
};

type TriggerSummaryLike = Partial<TriggerSummary>;

type TriggerDraftLike = {
  displayName: string;
  instructions: string;
  triggerType: string;
  wakeMode: string;
  enabled: boolean;
  createdBy: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  maxRuns?: number;
};
```

## `packages/agent/src/api/wallet-evm-balance.ts`

```typescript
  type DexTokenMeta,
  fetchDexPrices,
  WRAPPED_NATIVE,
} from "./wallet-dex-prices";

type EvmChainProvider = "alchemy" | "ankr";
```

## `packages/agent/src/api/wallet-rpc.ts`

```typescript
  type WalletConfigUpdateRequest,
  type WalletRpcChain,
  type WalletRpcCredentialKey,
  type WalletRpcSelections,
} from "../contracts/wallet";

type WalletCapableConfig = Pick<ElizaConfig, "cloud" | "env"> & {
  wallet?: {
    rpcProviders?: Partial<Record<keyof WalletRpcSelections, string>>;
  };
};

type SupportedCloudEvmRpcChain = "mainnet" | "base" | "bsc" | "avalanche";
```

## `packages/agent/src/api/whatsapp-routes.ts`

```typescript
export type WhatsAppPairingEventLike = WhatsAppPairingEvent;
```

## `packages/agent/src/auth/types.ts`

```typescript
export type SubscriptionProvider = "anthropic-subscription" | "openai-codex";
```

## `packages/agent/src/cli/parse-duration.ts`

```typescript
export type DurationMsParseOptions = {
  defaultUnit?: "ms" | "s" | "m" | "h" | "d";
};
```

## `packages/agent/src/cloud/bridge-client.ts`

```typescript
export type ChatChannelType =
  | "DM"
  | "GROUP"
  | "VOICE_DM"
  | "VOICE_GROUP"
  | "API";
```

## `packages/agent/src/cloud/cloud-manager.ts`

```typescript
export type CloudConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";
```

## `packages/agent/src/config/includes.ts`

```typescript
export type IncludeResolver = {
  readFile: (path: string) => string;
  parseJson: (raw: string) => unknown;
};
```

## `packages/agent/src/config/schema.ts`

```typescript
export type ShowIfCondition = {
  field: string;
  op: "eq" | "neq" | "in" | "truthy" | "falsy";
  value?: unknown;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
  /** Explicit field type override (must match a catalog field name). */
  type?: string;
  /** Icon name for the field label. */
  icon?: string;
  /** Whether the field is read-only. */
  readonly?: boolean;
  /** Hide this field from the UI entirely. */
  hidden?: boolean;
  /** Layout width hint. */
  width?: "full" | "half" | "third";
  /** Regex pattern for string validation. */
  pattern?: string;
  /** Error message when pattern doesn't match. */
  patternError?: string;
  /** Legacy conditional visibility. */
  showIf?: ShowIfCondition;
  /** Enhanced options for select/radio/multiselect fields. */
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
  }>;
  /** Minimum value (for number fields). */
  min?: number;
  /** Maximum value (for number fields). */
  max?: number;
  /** Step increment (for number fields). */
  step?: number;
  /** Display unit label (e.g., "ms", "tokens", "%"). */
  unit?: string;
  /** Schema for array item fields. */
  itemSchema?: ConfigUiHint;
  /** Minimum items (for array fields). */
  minItems?: number;
  /** Maximum items (for array fields). */
  maxItems?: number;
  /** Plugin-provided custom React component name. */
  component?: string;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchema = ReturnType<typeof ElizaSchema.toJSONSchema>;

type JsonSchemaNode = Record<string, unknown>;

export type ConfigSchemaResponse = {
  schema: ConfigSchema;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PluginUiMetadata = {
  id: string;
  name?: string;
  description?: string;
  configUiHints?: Record<
    string,
    Pick<
      ConfigUiHint,
      | "label"
      | "help"
      | "advanced"
      | "sensitive"
      | "placeholder"
      | "type"
      | "icon"
      | "readonly"
      | "hidden"
      | "width"
      | "pattern"
      | "patternError"
      | "showIf"
      | "options"
      | "min"
      | "max"
      | "step"
      | "unit"
    >
  >;
  configSchema?: JsonSchemaNode;
};

export type ConnectorUiMetadata = {
  id: string;
  label?: string;
  description?: string;
  configSchema?: JsonSchemaNode;
  configUiHints?: Record<string, ConfigUiHint>;
};

type JsonSchemaObject = JsonSchemaNode & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: JsonSchemaObject | boolean;
};
```

## `packages/agent/src/config/telegram-custom-commands.ts`

```typescript
export type TelegramCustomCommandInput = {
  command?: string | null;
  description?: string | null;
};

export type TelegramCustomCommandIssue = {
  index: number;
  field: "command" | "description";
  message: string;
};
```

## `packages/agent/src/config/types.agent-defaults.ts`

```typescript
export type SandboxDockerSettings = {
  /** Docker image to use for sandbox containers. */
  image?: string;
  /** Prefix for sandbox container names. */
  containerPrefix?: string;
  /** Container workdir mount path (default: /workspace). */
  workdir?: string;
  /** Run container rootfs read-only. */
  readOnlyRoot?: boolean;
  /** Extra tmpfs mounts for read-only containers. */
  tmpfs?: string[];
  /** Container network mode (bridge|none|custom). */
  network?: string;
  /** Container user (uid:gid). */
  user?: string;
  /** Drop Linux capabilities. */
  capDrop?: string[];
  /** Extra environment variables for sandbox exec. */
  env?: Record<string, string>;
  /** Optional setup command run once after container creation. */
  setupCommand?: string;
  /** Limit container PIDs (0 = Docker default). */
  pidsLimit?: number;
  /** Limit container memory (e.g. 512m, 2g, or bytes as number). */
  memory?: string | number;
  /** Limit container memory swap (same format as memory). */
  memorySwap?: string | number;
  /** Limit container CPU shares (e.g. 0.5, 1, 2). */
  cpus?: number;
  /**
   * Set ulimit values by name (e.g. nofile, nproc).
   * Use "soft:hard" string, a number, or { soft, hard }.
   */
  ulimits?: Record<string, string | number | { soft?: number; hard?: number }>;
  /** Seccomp profile (path or profile name). */
  seccompProfile?: string;
  /** AppArmor profile name. */
  apparmorProfile?: string;
  /** DNS servers (e.g. ["1.1.1.1", "8.8.8.8"]). */
  dns?: string[];
  /** Extra host mappings (e.g. ["api.local:10.0.0.2"]). */
  extraHosts?: string[];
  /** Additional bind mounts (host:container:mode format, e.g. ["/host/path:/container/path:rw"]). */
  binds?: string[];
};

export type SandboxBrowserSettings = {
  enabled?: boolean;
  image?: string;
  containerPrefix?: string;
  cdpPort?: number;
  vncPort?: number;
  noVncPort?: number;
  headless?: boolean;
  enableNoVnc?: boolean;
  /**
   * Allow sandboxed sessions to target the host browser control server.
   * Default: false.
   */
  allowHostControl?: boolean;
  /**
   * When true (default), sandboxed browser control will try to start/reattach to
   * the sandbox browser container when a tool call needs it.
   */
  autoStart?: boolean;
  /** Max time to wait for CDP to become reachable after auto-start (ms). */
  autoStartTimeoutMs?: number;
};

export type SandboxPruneSettings = {
  /** Prune if idle for more than N hours (0 disables). */
  idleHours?: number;
  /** Prune if older than N days (0 disables). */
  maxAgeDays?: number;
};

export type AgentModelEntryConfig = {
  alias?: string;
  /** Provider-specific API parameters (e.g., GLM-4.7 thinking mode). */
  params?: Record<string, unknown>;
};

export type AgentModelListConfig = {
  primary?: string;
  fallbacks?: string[];
};

export type AgentContextPruningConfig = {
  mode?: "off" | "cache-ttl";
  /** TTL to consider cache expired (duration string, default unit: minutes). */
  ttl?: string;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  hardClearRatio?: number;
  minPrunableToolChars?: number;
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  softTrim?: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
  };
  hardClear?: {
    enabled?: boolean;
    placeholder?: string;
  };
};

export type CliBackendConfig = {
  /** CLI command to execute (absolute path or on PATH). */
  command: string;
  /** Base args applied to every invocation. */
  args?: string[];
  /** Output parsing mode (default: json). */
  output?: "json" | "text" | "jsonl";
  /** Output parsing mode when resuming a CLI session. */
  resumeOutput?: "json" | "text" | "jsonl";
  /** Prompt input mode (default: arg). */
  input?: "arg" | "stdin";
  /** Max prompt length for arg mode (if exceeded, stdin is used). */
  maxPromptArgChars?: number;
  /** Extra env vars injected for this CLI. */
  env?: Record<string, string>;
  /** Env vars to remove before launching this CLI. */
  clearEnv?: string[];
  /** Flag used to pass model id (e.g. --model). */
  modelArg?: string;
  /** Model aliases mapping (config model id → CLI model id). */
  modelAliases?: Record<string, string>;
  /** Flag used to pass session id (e.g. --session-id). */
  sessionArg?: string;
  /** Extra args used when resuming a session (use {sessionId} placeholder). */
  sessionArgs?: string[];
  /** Alternate args to use when resuming a session (use {sessionId} placeholder). */
  resumeArgs?: string[];
  /** When to pass session ids. */
  sessionMode?: "always" | "existing" | "none";
  /** JSON fields to read session id from (in order). */
  sessionIdFields?: string[];
  /** Flag used to pass system prompt. */
  systemPromptArg?: string;
  /** System prompt behavior (append vs replace). */
  systemPromptMode?: "append" | "replace";
  /** When to send system prompt. */
  systemPromptWhen?: "first" | "always" | "never";
  /** Flag used to pass image paths. */
  imageArg?: string;
  /** How to pass multiple images. */
  imageMode?: "repeat" | "list";
  /** Serialize runs for this CLI. */
  serialize?: boolean;
};

export type AgentDefaultsConfig = {
  /** Active subscription provider, set automatically by provider switch. */
  subscriptionProvider?: string;
  /** Primary model and fallbacks (provider/model). */
  model?: AgentModelListConfig;
  /** Optional image-capable model and fallbacks (provider/model). */
  imageModel?: AgentModelListConfig;
  /** Model catalog with optional aliases (full provider/model keys). */
  models?: Record<string, AgentModelEntryConfig>;
  /** Agent working directory (preferred). Used as the default cwd for agent runs. */
  workspace?: string;
  /** Stable owner/admin entity id used for control-chat ownership and trust policies. */
  adminEntityId?: string;
  /** Optional repository root for system prompt runtime line (overrides auto-detect). */
  repoRoot?: string;
  /** Skip init (INIT.md creation, etc.) for pre-configured deployments. */
  skipInit?: boolean;
  /** Max chars for injected init files before truncation (default: 20000). */
  initMaxChars?: number;
  /** Enable init providers (attachments, entities, facts). Can consume significant tokens (default: true). */
  enableInitProviders?: boolean;
  /** Optional IANA timezone for the user (used in system prompt; defaults to host timezone). */
  userTimezone?: string;
  /** Time format in system prompt: auto (OS preference), 12-hour, or 24-hour. */
  timeFormat?: "auto" | "12" | "24";
  /**
   * Envelope timestamp timezone: "utc" (default), "local", "user", or an IANA timezone string.
   */
  envelopeTimezone?: string;
  /**
   * Include absolute timestamps in message envelopes ("on" | "off", default: "on").
   */
  envelopeTimestamp?: "on" | "off";
  /**
   * Include elapsed time in message envelopes ("on" | "off", default: "on").
   */
  envelopeElapsed?: "on" | "off";
  /** Optional context window cap (used for runtime estimates + status %). */
  contextTokens?: number;
  /** Optional CLI backends for text-only fallback (claude-cli, etc.). */
  cliBackends?: Record<string, CliBackendConfig>;
  /** Opt-in: prune old tool results from the LLM context to reduce token usage. */
  contextPruning?: AgentContextPruningConfig;
  /** Compaction tuning and pre-compaction memory flush behavior. */
  compaction?: AgentCompactionConfig;
  /** Vector memory search configuration (per-agent overrides supported). */
  memorySearch?: MemorySearchConfig;
  /** Default thinking level when no /think directive is present. */
  thinkingDefault?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Default verbose level when no /verbose directive is present. */
  verboseDefault?: "off" | "on" | "full";
  /** Default elevated level when no /elevated directive is present. */
  elevatedDefault?: "off" | "on" | "ask" | "full";
  /** Default block streaming level when no override is present. */
  blockStreamingDefault?: "off" | "on";
  /**
   * Block streaming boundary:
   * - "text_end": end of each assistant text content block (before tool calls)
   * - "message_end": end of the whole assistant message (may include tool blocks)
   */
  blockStreamingBreak?: "text_end" | "message_end";
  /** Soft block chunking for streamed replies (min/max chars, prefer paragraph/newline). */
  blockStreamingChunk?: BlockStreamingChunkConfig;
  /**
   * Block reply coalescing (merge streamed chunks before send).
   * idleMs: wait time before flushing when idle.
   */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  /** Human-like delay between block replies. */
  humanDelay?: HumanDelayConfig;
  timeoutSeconds?: number;
  /** Max inbound media size in MB for agent-visible attachments (text note or future image attach). */
  mediaMaxMb?: number;
  typingIntervalSeconds?: number;
  /** Typing indicator start mode (never|instant|thinking|message). */
  typingMode?: TypingMode;
  /** Periodic background heartbeat runs. */
  heartbeat?: {
    /** Heartbeat interval (duration string, default unit: minutes; default: 30m). */
    every?: string;
    /** Optional active-hours window (local time); heartbeats run only inside this window. */
    activeHours?: {
      /** Start time (24h, HH:MM). Inclusive. */
      start?: string;
      /** End time (24h, HH:MM). Exclusive. Use "24:00" for end-of-day. */
      end?: string;
      /** Timezone for the window ("user", "local", or IANA TZ id). Default: "user". */
      timezone?: string;
    };
    /** Heartbeat model override (provider/model). */
    model?: string;
    /** Session key for heartbeat runs ("main" or explicit session key). */
    session?: string;
    /** Delivery target ("last", "none", or a channel id). */
    target?: "last" | "none" | string;
    /** Optional delivery override (E.164 for WhatsApp, chat id for Telegram). */
    to?: string;
    /** Override the heartbeat prompt body (default: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."). */
    prompt?: string;
    /** Max chars allowed after HEARTBEAT_OK before delivery (default: 30). */
    ackMaxChars?: number;
    /**
     * When enabled, deliver the model's reasoning payload for heartbeat runs (when available)
     * as a separate message prefixed with `Reasoning:` (same as `/reasoning on`).
     *
     * Default: false (only the final heartbeat payload is delivered).
     */
    includeReasoning?: boolean;
  };
  /** Max concurrent agent runs across all conversations. Default: 1 (sequential). */
  maxConcurrent?: number;
  /** Sub-agent defaults (spawned via sessions_spawn). */
  subagents?: {
    /** Max concurrent sub-agent runs (global lane: "subagent"). Default: 1. */
    maxConcurrent?: number;
    /** Auto-archive sub-agent sessions after N minutes (default: 60). */
    archiveAfterMinutes?: number;
    /** Default model selection for spawned sub-agents (string or {primary,fallbacks}). */
    model?: string | { primary?: string; fallbacks?: string[] };
    /** Default thinking level for spawned sub-agents (e.g. "off", "low", "medium", "high"). */
    thinking?: string;
  };
  /** Optional sandbox settings for non-main sessions. */
  sandbox?: {
    /** Enable sandboxing for sessions. */
    mode?: "off" | "non-main" | "all";
    /**
     * Agent workspace access inside the sandbox.
     * - "none": do not mount the agent workspace into the container; use a sandbox workspace under workspaceRoot
     * - "ro": mount the agent workspace read-only; disables write/edit tools
     * - "rw": mount the agent workspace read/write; enables write/edit tools
     */
    workspaceAccess?: "none" | "ro" | "rw";
    /**
     * Session tools visibility for sandboxed sessions.
     * - "spawned": only allow session tools to target sessions spawned from this session (default)
     * - "all": allow session tools to target any session
     */
    sessionToolsVisibility?: "spawned" | "all";
    /** Container/workspace scope for sandbox isolation. */
    scope?: "session" | "agent" | "shared";
    /** Legacy alias for scope ("session" when true, "shared" when false). */
    perSession?: boolean;
    /** Root directory for sandbox workspaces. */
    workspaceRoot?: string;
    /** Docker-specific sandbox settings. */
    docker?: SandboxDockerSettings;
    /** Optional sandboxed browser settings. */
    browser?: SandboxBrowserSettings;
    /** Auto-prune sandbox containers. */
    prune?: SandboxPruneSettings;
  };
};

export type AgentCompactionMode = "default" | "safeguard";

export type AgentCompactionConfig = {
  /** Compaction summarization mode. */
  mode?: AgentCompactionMode;
  /** Minimum reserve tokens enforced for Pi compaction (0 disables the floor). */
  reserveTokensFloor?: number;
  /** Max share of context window for history during safeguard pruning (0.1–0.9, default 0.5). */
  maxHistoryShare?: number;
  /** Pre-compaction memory flush (agentic turn). Default: enabled. */
  memoryFlush?: AgentCompactionMemoryFlushConfig;
};

export type AgentCompactionMemoryFlushConfig = {
  /** Enable the pre-compaction memory flush (default: true). */
  enabled?: boolean;
  /** Run the memory flush when context is within this many tokens of the compaction threshold. */
  softThresholdTokens?: number;
  /** User prompt used for the memory flush turn (NO_REPLY is enforced if missing). */
  prompt?: string;
  /** System prompt appended for the memory flush turn. */
  systemPrompt?: string;
};
```

## `packages/agent/src/config/types.agents.ts`

```typescript
export type AgentModelConfig =
  | string
  | {
      /** Primary model (provider/model). */
      primary?: string;
      /** Per-agent model fallbacks (provider/model). */
      fallbacks?: string[];
    };

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  username?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** Optional allowlist of skills for this agent (omit = all skills; empty = none). */
  skills?: string[];
  memorySearch?: MemorySearchConfig;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;

  // ── Personality fields (set during onboarding from style presets) ──────
  /** Agent bio lines. Set during onboarding from the chosen style preset. */
  bio?: string[];
  /** System prompt. Set during onboarding from the chosen style preset. */
  system?: string;
  /** Communication style rules. Set during onboarding from the chosen style preset. */
  style?: { all?: string[]; chat?: string[]; post?: string[] };
  /** Personality adjectives. Set during onboarding from the chosen style preset. */
  adjectives?: string[];
  /** Conversation topics the agent is knowledgeable about. */
  topics?: string[];
  /** Example social media posts demonstrating the agent's voice. */
  postExamples?: string[];
  /** Example social media posts in Chinese (zh-CN) demonstrating the agent's voice. */
  postExamples_zhCN?: string[];
  messageExamples?: Array<Array<{ user: string; content: { text: string } }>>;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
    /** Per-agent default model for spawned sub-agents (string or {primary,fallbacks}). */
    model?: string | { primary?: string; fallbacks?: string[] };
  };
  sandbox?: {
    mode?: "off" | "non-main" | "all";
    /** Agent workspace access inside the sandbox. */
    workspaceAccess?: "none" | "ro" | "rw";
    /**
     * Session tools visibility for sandboxed sessions.
     * - "spawned": only allow session tools to target sessions spawned from this session (default)
     * - "all": allow session tools to target any session
     */
    sessionToolsVisibility?: "spawned" | "all";
    /** Container/workspace scope for sandbox isolation. */
    scope?: "session" | "agent" | "shared";
    /** Legacy alias for scope ("session" when true, "shared" when false). */
    perSession?: boolean;
    workspaceRoot?: string;
    /** Docker-specific sandbox overrides for this agent. */
    docker?: SandboxDockerSettings;
    /** Optional sandboxed browser overrides for this agent. */
    browser?: SandboxBrowserSettings;
    /** Auto-prune overrides for this agent. */
    prune?: SandboxPruneSettings;
  };
  tools?: AgentToolsConfig;

  /** Cloud deployment info (set when agent runs in Eliza Cloud). */
  cloud?: {
    /** Eliza Cloud agent record ID. */
    cloudAgentId?: string;
    /** Last known sandbox status. */
    lastStatus?: string;
    /** ISO timestamp when the agent was last provisioned. */
    lastProvisionedAt?: string;
  };
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};

export type AgentBinding = {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: "dm" | "group" | "channel"; id: string };
    guildId?: string;
    teamId?: string;
  };
};
```

## `packages/agent/src/config/types.eliza.ts`

```typescript
export type AuthProfileConfig = {
  provider: string;
  /**
   * Credential type expected in auth-profiles.json for this profile id.
   * - api_key: static provider API key
   * - oauth: refreshable OAuth credentials (access+refresh+expires)
   * - token: static bearer-style token (optionally expiring; no refresh)
   */
  mode: "api_key" | "oauth" | "token";
  email?: string;
};

export type AuthConfig = {
  profiles?: Record<string, AuthProfileConfig>;
  order?: Record<string, string[]>;
  cooldowns?: {
    /** Default billing backoff (hours). Default: 5. */
    billingBackoffHours?: number;
    /** Optional per-provider billing backoff (hours). */
    billingBackoffHoursByProvider?: Record<string, number>;
    /** Billing backoff cap (hours). Default: 24. */
    billingMaxHours?: number;
    /**
     * Failure window for backoff counters (hours). If no failures occur within
     * this window, counters reset. Default: 24.
     */
    failureWindowHours?: number;
  };
};

export type BrowserProfileConfig = {
  /** CDP port for this profile. Allocated once at creation, persisted permanently. */
  cdpPort?: number;
  /** CDP URL for this profile (use for remote Chrome). */
  cdpUrl?: string;
  /** Profile driver (default: eliza). */
  driver?: "eliza" | "extension";
  /** Profile color (hex). Auto-assigned at creation. */
  color: string;
};

export type BrowserSnapshotDefaults = {
  /** Default snapshot mode (applies when mode is not provided). */
  mode?: "efficient";
};

export type BrowserConfig = {
  enabled?: boolean;
  /** If false, disable browser act:evaluate (arbitrary JS). Default: true */
  evaluateEnabled?: boolean;
  /** Base URL of the CDP endpoint (for remote browsers). Default: loopback CDP on the derived port. */
  cdpUrl?: string;
  /** Remote CDP HTTP timeout (ms). Default: 1500. */
  remoteCdpTimeoutMs?: number;
  /** Remote CDP WebSocket handshake timeout (ms). Default: max(remoteCdpTimeoutMs * 2, 2000). */
  remoteCdpHandshakeTimeoutMs?: number;
  /** Accent color for the eliza browser profile (hex). Default: #FF4500 */
  color?: string;
  /** Override the browser executable path (all platforms). */
  executablePath?: string;
  /** Start Chrome headless (best-effort). Default: false */
  headless?: boolean;
  /** Pass --no-sandbox to Chrome (Linux containers). Default: false */
  noSandbox?: boolean;
  /** If true: never launch; only attach to an existing browser. Default: false */
  attachOnly?: boolean;
  /** Default profile to use when profile param is omitted. Default: "chrome" */
  defaultProfile?: string;
  /** Named browser profiles with explicit CDP ports or URLs. */
  profiles?: Record<string, BrowserProfileConfig>;
  /** Default snapshot options (applied by the browser tool/CLI when unset). */
  snapshotDefaults?: BrowserSnapshotDefaults;
};

export type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
};

export type SkillsLoadConfig = {
  /**
   * Additional skill folders to scan (lowest precedence).
   * Each directory should contain skill subfolders with `SKILL.md`.
   */
  extraDirs?: string[];
  /** Watch skill folders for changes and refresh the skills snapshot. */
  watch?: boolean;
  /** Debounce for the skills watcher (ms). */
  watchDebounceMs?: number;
};

export type SkillsInstallConfig = {
  preferBrew?: boolean;
  nodeManager?: "npm" | "yarn" | "bun";
};

export type SkillsConfig = {
  /** Optional bundled-skill allowlist (only these bundled skills load). */
  allowBundled?: string[];
  /** Skills to explicitly deny/block from loading (takes priority over allow). */
  denyBundled?: string[];
  load?: SkillsLoadConfig;
  install?: SkillsInstallConfig;
  /** Per-skill configuration. Set `enabled: false` to disable a skill. */
  entries?: Record<string, SkillConfig>;
};

export type KnowledgeConfig = {
  /** Enable contextual knowledge enrichment for document ingestion. */
  contextualEnrichment?: boolean;
  /** Docs directory path used for enrichment context. */
  docsPath?: string;
};

export type ModelApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "bedrock-converse-stream";

export type ModelCompatConfig = {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
};

export type ModelProviderAuthMode = "api-key" | "aws-sdk" | "oauth" | "token";

export type ModelDefinitionConfig = {
  id: string;
  name: string;
  api?: ModelApi;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: ModelCompatConfig;
};

export type ModelProviderConfig = {
  baseUrl: string;
  apiKey?: string;
  auth?: ModelProviderAuthMode;
  api?: ModelApi;
  headers?: Record<string, string>;
  authHeader?: boolean;
  models: ModelDefinitionConfig[];
};

export type BedrockDiscoveryConfig = {
  enabled?: boolean;
  region?: string;
  providerFilter?: string[];
  refreshInterval?: number;
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
};

export type ModelsConfig = {
  mode?: "merge" | "replace";
  providers?: Record<string, ModelProviderConfig>;
  bedrockDiscovery?: BedrockDiscoveryConfig;
  /** Selected small model ID for fast tasks (e.g. "claude-haiku"). Set during onboarding. */
  small?: string;
  /** Selected large model ID for complex reasoning (e.g. "claude-sonnet-4-5"). Set during onboarding. */
  large?: string;
};

export type CronConfig = {
  enabled?: boolean;
  store?: string;
  maxConcurrentRuns?: number;
};

export type NodeHostBrowserProxyConfig = {
  /** Enable the browser proxy on the node host (default: true). */
  enabled?: boolean;
  /** Optional allowlist of profile names exposed via the proxy. */
  allowProfiles?: string[];
};

export type NodeHostConfig = {
  /** Browser proxy settings for node hosts. */
  browserProxy?: NodeHostBrowserProxyConfig;
};

export type ExecApprovalForwardingMode = "session" | "targets" | "both";

export type ExecApprovalForwardTarget = {
  /** Channel id (e.g. "discord", "slack", or plugin channel id). */
  channel: string;
  /** Destination id (channel id, user id, etc. depending on channel). */
  to: string;
  /** Optional account id for multi-account channels. */
  accountId?: string;
  /** Optional thread id to reply inside a thread. */
  threadId?: string | number;
};

export type ExecApprovalForwardingConfig = {
  /** Enable forwarding exec approvals to chat channels. Default: false. */
  enabled?: boolean;
  /** Delivery mode (session=origin chat, targets=config targets, both=both). Default: session. */
  mode?: ExecApprovalForwardingMode;
  /** Only forward approvals for these agent IDs. Omit = all agents. */
  agentFilter?: string[];
  /** Only forward approvals matching these session key patterns (substring or regex). */
  sessionFilter?: string[];
  /** Explicit delivery targets (used when mode includes targets). */
  targets?: ExecApprovalForwardTarget[];
};

export type ApprovalsConfig = {
  exec?: ExecApprovalForwardingConfig;
};

export type LoggingConfig = {
  level?: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  file?: string;
  consoleLevel?:
    | "silent"
    | "fatal"
    | "error"
    | "warn"
    | "info"
    | "debug"
    | "trace";
  consoleStyle?: "pretty" | "compact" | "json";
  /** Redact sensitive tokens in tool summaries. Default: "tools". */
  redactSensitive?: "off" | "tools";
  /** Regex patterns used to redact sensitive tokens (defaults apply when unset). */
  redactPatterns?: string[];
};

export type DiagnosticsOtelConfig = {
  enabled?: boolean;
  endpoint?: string;
  protocol?: "http/protobuf" | "grpc";
  headers?: Record<string, string>;
  serviceName?: string;
  traces?: boolean;
  metrics?: boolean;
  logs?: boolean;
  /** Trace sample rate (0.0 - 1.0). */
  sampleRate?: number;
  /** Metric export interval (ms). */
  flushIntervalMs?: number;
};

export type DiagnosticsCacheTraceConfig = {
  enabled?: boolean;
  filePath?: string;
  includeMessages?: boolean;
  includePrompt?: boolean;
  includeSystem?: boolean;
};

export type DiagnosticsConfig = {
  enabled?: boolean;
  /** Optional ad-hoc diagnostics flags (e.g. "telegram.http"). */
  flags?: string[];
  otel?: DiagnosticsOtelConfig;
  cacheTrace?: DiagnosticsCacheTraceConfig;
};

export type WebReconnectConfig = {
  initialMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: number;
  maxAttempts?: number; // 0 = unlimited
};

export type WebConfig = {
  /** If false, do not start the WhatsApp web provider. Default: true. */
  enabled?: boolean;
  heartbeatSeconds?: number;
  reconnect?: WebReconnectConfig;
};

export type MemoryBackend = "builtin" | "qmd";

export type MemoryCitationsMode = "auto" | "on" | "off";

export type MemoryConfig = {
  backend?: MemoryBackend;
  citations?: MemoryCitationsMode;
  qmd?: MemoryQmdConfig;
};

export type MemoryQmdConfig = {
  command?: string;
  includeDefaultMemory?: boolean;
  paths?: MemoryQmdIndexPath[];
  sessions?: MemoryQmdSessionConfig;
  update?: MemoryQmdUpdateConfig;
  limits?: MemoryQmdLimitsConfig;
  scope?: SessionSendPolicyConfig;
};

export type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

export type MemoryQmdSessionConfig = {
  enabled?: boolean;
  exportDir?: string;
  retentionDays?: number;
};

export type MemoryQmdUpdateConfig = {
  interval?: string;
  debounceMs?: number;
  onBoot?: boolean;
  embedInterval?: string;
};

export type MemoryQmdLimitsConfig = {
  maxResults?: number;
  maxSnippetChars?: number;
  maxInjectedChars?: number;
  timeoutMs?: number;
};

export type PgliteConfig = {
  /** Custom PGLite data directory. Default: ~/.eliza/workspace/.eliza/.elizadb */
  dataDir?: string;
};

export type PostgresCredentials = {
  /** Full PostgreSQL connection string. Takes precedence over individual fields. */
  connectionString?: string;
  /** PostgreSQL host. Default: localhost */
  host?: string;
  /** PostgreSQL port. Default: 5432 */
  port?: number;
  /** Database name. */
  database?: string;
  /** Database user. */
  user?: string;
  /** Database password. */
  password?: string;
  /** Enable SSL connection. Default: false */
  ssl?: boolean;
};

export type DatabaseConfig = {
  /** Active database provider. Default: "pglite". */
  provider?: DatabaseProviderType;
  /** PGLite (local embedded Postgres) configuration. */
  pglite?: PgliteConfig;
  /** Remote PostgreSQL configuration. */
  postgres?: PostgresCredentials;
};

export type PluginEntryConfig = {
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type PluginSlotsConfig = {
  /** Select which plugin owns the memory slot ("none" disables memory plugins). */
  memory?: string;
};

export type PluginsLoadConfig = {
  /** Additional plugin/extension paths to load. */
  paths?: string[];
};

export type PluginInstallRecord = {
  source: "npm" | "archive" | "path";
  spec?: string;
  sourcePath?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
};

export type RegistryEndpoint = {
  /** Human-friendly label shown in UI. */
  label: string;
  /** Endpoint URL returning registry JSON payload. */
  url: string;
  /** Whether this endpoint is enabled for fetch/merge. */
  enabled?: boolean;
};

export type PluginsConfig = {
  /** Enable or disable plugin loading. */
  enabled?: boolean;
  /** Optional plugin allowlist (plugin ids). */
  allow?: string[];
  /** Optional plugin denylist (plugin ids). */
  deny?: string[];
  load?: PluginsLoadConfig;
  slots?: PluginSlotsConfig;
  entries?: Record<string, PluginEntryConfig>;
  installs?: Record<string, PluginInstallRecord>;
  /** Additional plugin registry endpoints. */
  registryEndpoints?: RegistryEndpoint[];
};

export type CloudInferenceMode = "cloud" | "byok" | "local";

export type CloudBridgeConfig = {
  /** Reconnection interval base (ms). Default: 3000. */
  reconnectIntervalMs?: number;
  /** Max reconnection attempts. Default: 20. */
  maxReconnectAttempts?: number;
  /** Heartbeat interval (ms). Default: 30000. */
  heartbeatIntervalMs?: number;
};

export type CloudBackupConfig = {
  /** Auto-backup interval (ms). Default: 3600000 (1 hour). */
  autoBackupIntervalMs?: number;
  /** Maximum auto-snapshots to retain. Default: 10. */
  maxSnapshots?: number;
};

export type CloudContainerDefaults = {
  /** Default ECR image URI for agent containers. */
  defaultImage?: string;
  /** Default CPU architecture. Default: arm64. */
  defaultArchitecture?: "arm64" | "x86_64";
  /** Default CPU units. Default: 1792. */
  defaultCpu?: number;
  /** Default memory (MB). Default: 1792. */
  defaultMemory?: number;
  /** Default container port. Default: 2138. */
  defaultPort?: number;
};

export type CloudServiceToggles = {
  /** Use Eliza Cloud for model inference. Default: true. */
  inference?: boolean;
  /** Use Eliza Cloud for blockchain RPC. Default: true. */
  rpc?: boolean;
  /** Use Eliza Cloud for media generation (image/video/audio/vision). Default: true. */
  media?: boolean;
  /** Use Eliza Cloud for TTS (text-to-speech). Default: true. */
  tts?: boolean;
  /** Use Eliza Cloud for embeddings. Default: true. */
  embeddings?: boolean;
};

export type CloudConfig = {
  /** Enable Eliza Cloud integration. Default: false. */
  enabled?: boolean;
  /** Selected cloud provider ID (e.g. "elizacloud"). Set during onboarding. */
  provider?: string;
  /** Eliza Cloud API base URL. Default: https://elizacloud.ai/api/v1 */
  baseUrl?: string;
  /** Cached API key (stored encrypted via gateway auth). */
  apiKey?: string;
  /** ID of the cloud agent created during onboarding. */
  agentId?: string;
  /** Inference mode: cloud (proxied), byok (user keys), local (no cloud). */
  inferenceMode?: CloudInferenceMode;
  /** Granular service toggles — pick which cloud services to use. */
  services?: CloudServiceToggles;
  /** Runtime mode chosen during onboarding: "cloud" or "local". */
  runtime?: "cloud" | "local";
  /** Auto-deploy agents to cloud on creation. Default: false. */
  autoProvision?: boolean;
  /** Bridge settings for WebSocket communication with cloud agents. */
  bridge?: CloudBridgeConfig;
  /** Backup settings for agent state snapshots. */
  backup?: CloudBackupConfig;
  /** Default container settings for new cloud deployments. */
  container?: CloudContainerDefaults;
};

export type CuaConfig = {
  /** Enable the CUA plugin. Default: false. */
  enabled?: boolean;
  /** Local mode: host:port of the CUA computer server (e.g. "localhost:8002"). Skips cloud API. */
  host?: string;
  /** Cloud mode: CUA API key for cloud sandbox access. */
  apiKey?: string;
  /** Cloud mode: Name of the CUA cloud sandbox. */
  sandboxName?: string;
  /** OS type for the sandbox: linux, windows, macos, android. Default: linux. */
  osType?: "linux" | "windows" | "macos" | "android";
  /** Custom CUA API base URL. */
  apiBase?: string;
  /** OpenAI model for computer-use (default: computer-use-preview). */
  computerUseModel?: string;
  /** Maximum steps per run (default: 30). */
  maxSteps?: number;
  /** Auto-acknowledge safety checks (default: false). */
  autoAckSafetyChecks?: boolean;
  /** Connect to sandbox on plugin start (default: false). */
  connectOnStart?: boolean;
  /** Disconnect from sandbox after each run (default: true). */
  disconnectAfterRun?: boolean;
};

export type X402Config = {
  enabled?: boolean;
  privateKey?: string;
  network?: string;
  payTo?: string;
  facilitatorUrl?: string;
  maxPaymentUsd?: number;
  maxTotalUsd?: number;
  dbPath?: string;
};

export type EmbeddingConfig = {
  /** GGUF model filename (e.g. "nomic-embed-text-v1.5.Q5_K_M.gguf"). */
  model?: string;
  /** Optional Hugging Face repo/source for model resolution. */
  modelRepo?: string;
  /** Embedding vector dimension (default: 768). */
  dimensions?: number;
  /** Embedding context window size (must match the model; default: model hint). */
  contextSize?: number;
  /** GPU layers for model loading: "auto", "max", or a number. */
  gpuLayers?: number | "auto" | "max";
  /** Minutes of inactivity before unloading model from memory (default: 30, 0 = never). */
  idleTimeoutMinutes?: number;
};

export type UpdateConfig = {
  channel?: ReleaseChannel;
  /** Default: true. */
  checkOnStart?: boolean;
  lastCheckAt?: string;
  lastCheckVersion?: string;
  /** Seconds between automatic checks. Default: 14400 (4 hours). */
  checkIntervalSeconds?: number;
};

export type ConnectorFieldValue =
  | string
  | number
  | boolean
  | string[]
  | { [key: string]: ConnectorFieldValue | undefined }
  | undefined;

export type ConnectorConfig = { [key: string]: ConnectorFieldValue };

export type ElizaConfig = {
  meta?: {
    /** Explicit onboarding completion marker. Reset clears the entire state dir. */
    onboardingComplete?: boolean;
    /** Last Eliza version that wrote this config. */
    lastTouchedVersion?: string;
    /** ISO timestamp when this config was last written. */
    lastTouchedAt?: string;
  };
  auth?: AuthConfig;
  env?: {
    /** Opt-in: import missing secrets from a login shell environment (exec `$SHELL -l -c 'env -0'`). */
    shellEnv?: {
      enabled?: boolean;
      /** Timeout for the login shell exec (ms). Default: 15000. */
      timeoutMs?: number;
    };
    /** Inline env vars to apply when not already present in the process env. */
    vars?: Record<string, string>;
    /** Sugar: allow env vars directly under env (string values only). */
    [key: string]:
      | string
      | Record<string, string>
      | { enabled?: boolean; timeoutMs?: number }
      | undefined;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommit?: string;
    lastRunCommand?: string;
    lastRunMode?: "local" | "remote";
  };
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  update?: UpdateConfig;
  browser?: BrowserConfig;
  ui?: {
    /** Accent color for Eliza UI chrome (hex). */
    seamColor?: string;
    /** User's preferred UI theme. Set during onboarding. */
    theme?:
      | "eliza"
      | "eliza"
      | "qt314"
      | "web2000"
      | "programmer"
      | "haxor"
      | "psycho";
    assistant?: {
      /** Assistant display name for UI surfaces. */
      name?: string;
      /** Assistant avatar (emoji, short text, or image URL/data URI). */
      avatar?: string;
    };
  };
  knowledge?: KnowledgeConfig;
  skills?: SkillsConfig;
  plugins?: PluginsConfig;
  models?: ModelsConfig;
  nodeHost?: NodeHostConfig;
  agents?: AgentsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  broadcast?: BroadcastConfig;
  audio?: AudioConfig;
  messages?: MessagesConfig;
  commands?: CommandsConfig;
  approvals?: ApprovalsConfig;
  session?: SessionConfig;
  web?: WebConfig;

  cron?: CronConfig;
  hooks?: HooksConfig;
  discovery?: DiscoveryConfig;
  talk?: TalkConfig;
  gateway?: GatewayConfig;
  memory?: MemoryConfig;
  /** Local embedding model configuration (Metal GPU, idle unloading, model selection). */
  embedding?: EmbeddingConfig;
  /** Database provider and connection configuration (local-only feature). */
  database?: DatabaseConfig;
  /** Eliza Cloud integration for remote agent provisioning and inference. */
  cloud?: CloudConfig;
  /** CUA (Computer Use Agent) cloud sandbox configuration. */
  cua?: CuaConfig;
  x402?: X402Config;
  /** Media generation configuration (image, video, audio, vision providers). */
  media?: MediaConfig;
  /** Messaging connector configuration (Telegram, Discord, Slack, etc.). */
  connectors?: Record<string, ConnectorConfig>;
  /** MCP server configuration. */
  mcp?: {
    servers?: Record<
      string,
      {
        type: string;
        command?: string;
        args?: string[];
        url?: string;
        env?: Record<string, string>;
        headers?: Record<string, string>;
        cwd?: string;
        timeoutInMillis?: number;
      }
    >;
  };
  /** ERC-8004 agent registry and ElizaMaker NFT collection configuration. */
  registry?: {
    /** Ethereum mainnet (or local Anvil) RPC URL. */
    mainnetRpc?: string;
    /** ElizaAgentRegistry contract address. */
    registryAddress?: string;
    /** ElizaMaker collection contract address. */
    collectionAddress?: string;
  };
  /** Feature flags for plugin auto-enable. */
  features?: Record<
    string,
    boolean | { enabled?: boolean; [k: string]: unknown }
  >;
  /** User-defined custom actions for the agent. */
  customActions?: CustomActionDef[];
};

export type ConfigValidationIssue = {
  path: string;
  message: string;
};

export type ConfigFileSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;
  parsed: unknown;
  valid: boolean;
  config: ElizaConfig;
  hash?: string;
  issues: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
};
```

## `packages/agent/src/config/types.gateway.ts`

```typescript
export type GatewayBindMode =
  | "auto"
  | "lan"
  | "loopback"
  | "custom"
  | "tailnet";

export type GatewayTlsConfig = {
  /** Enable TLS for the gateway server. */
  enabled?: boolean;
  /** Auto-generate a self-signed cert if cert/key are missing (default: true). */
  autoGenerate?: boolean;
  /** PEM certificate path for the gateway server. */
  certPath?: string;
  /** PEM private key path for the gateway server. */
  keyPath?: string;
  /** Optional PEM CA bundle for TLS clients (mTLS or custom roots). */
  caPath?: string;
};

export type WideAreaDiscoveryConfig = {
  enabled?: boolean;
  /** Optional unicast DNS-SD domain (e.g. "eliza.internal"). */
  domain?: string;
};

export type MdnsDiscoveryMode = "off" | "minimal" | "full";

export type MdnsDiscoveryConfig = {
  /**
   * mDNS/Bonjour discovery broadcast mode (default: minimal).
   * - off: disable mDNS entirely
   * - minimal: omit cliPath/sshPort from TXT records
   * - full: include cliPath/sshPort in TXT records
   */
  mode?: MdnsDiscoveryMode;
};

export type DiscoveryConfig = {
  wideArea?: WideAreaDiscoveryConfig;
  mdns?: MdnsDiscoveryConfig;
};

export type TalkConfig = {
  /** Default ElevenLabs voice ID for Talk mode. */
  voiceId?: string;
  /** Optional voice name -> ElevenLabs voice ID map. */
  voiceAliases?: Record<string, string>;
  /** Default ElevenLabs model ID for Talk mode. */
  modelId?: string;
  /** Default ElevenLabs output format (e.g. mp3_44100_128). */
  outputFormat?: string;
  /** ElevenLabs API key (optional; falls back to ELEVENLABS_API_KEY). */
  apiKey?: string;
  /** Stop speaking when user starts talking (default: true). */
  interruptOnSpeech?: boolean;
};

export type GatewayControlUiConfig = {
  /** If false, the Gateway will not serve the Control UI (default /). */
  enabled?: boolean;
  /** Optional base path prefix for the Control UI (e.g. "/eliza"). */
  basePath?: string;
  /** Optional filesystem root for Control UI assets (defaults to dist/control-ui). */
  root?: string;
  /** Allowed browser origins for Control UI/WebChat websocket connections. */
  allowedOrigins?: string[];
  /** Allow token-only auth over insecure HTTP (default: false). */
  allowInsecureAuth?: boolean;
  /** DANGEROUS: Disable device identity checks for the Control UI (default: false). */
  dangerouslyDisableDeviceAuth?: boolean;
};

export type GatewayAuthMode = "token" | "password";

export type GatewayAuthConfig = {
  /** Authentication mode for Gateway connections. Defaults to token when set. */
  mode?: GatewayAuthMode;
  /** Shared token for token mode (stored locally for CLI auth). */
  token?: string;
  /** Shared password for password mode (consider env instead). */
  password?: string;
  /** Allow Tailscale identity headers when serve mode is enabled. */
  allowTailscale?: boolean;
};

export type GatewayTailscaleMode = "off" | "serve" | "funnel";

export type GatewayTailscaleConfig = {
  /** Tailscale exposure mode for the Gateway control UI. */
  mode?: GatewayTailscaleMode;
  /** Reset serve/funnel configuration on shutdown. */
  resetOnExit?: boolean;
};

export type GatewayRemoteConfig = {
  /** Remote Gateway WebSocket URL (ws:// or wss://). */
  url?: string;
  /** Transport for macOS remote connections (ssh tunnel or direct WS). */
  transport?: "ssh" | "direct";
  /** Token for remote auth (when the gateway requires token auth). */
  token?: string;
  /** Password for remote auth (when the gateway requires password auth). */
  password?: string;
  /** Expected TLS certificate fingerprint (sha256) for remote gateways. */
  tlsFingerprint?: string;
  /** SSH target for tunneling remote Gateway (user@host). */
  sshTarget?: string;
  /** SSH identity file path for tunneling remote Gateway. */
  sshIdentity?: string;
};

export type GatewayReloadMode = "off" | "restart" | "hot" | "hybrid";

export type GatewayReloadConfig = {
  /** Reload strategy for config changes (default: hybrid). */
  mode?: GatewayReloadMode;
  /** Debounce window for config reloads (ms). Default: 300. */
  debounceMs?: number;
};

export type GatewayHttpChatCompletionsConfig = {
  /**
   * If false, the Gateway will not serve `POST /v1/chat/completions`.
   * Default: false when absent.
   */
  enabled?: boolean;
};

export type GatewayHttpResponsesConfig = {
  /**
   * If false, the Gateway will not serve `POST /v1/responses` (OpenResponses API).
   * Default: false when absent.
   */
  enabled?: boolean;
  /**
   * Max request body size in bytes for `/v1/responses`.
   * Default: 20MB.
   */
  maxBodyBytes?: number;
  /** File inputs (input_file). */
  files?: GatewayHttpResponsesFilesConfig;
  /** Image inputs (input_image). */
  images?: GatewayHttpResponsesImagesConfig;
};

export type GatewayHttpResponsesFilesConfig = {
  /** Allow URL fetches for input_file. Default: true. */
  allowUrl?: boolean;
  /** Allowed MIME types (case-insensitive). */
  allowedMimes?: string[];
  /** Max bytes per file. Default: 5MB. */
  maxBytes?: number;
  /** Max decoded characters per file. Default: 200k. */
  maxChars?: number;
  /** Max redirects when fetching a URL. Default: 3. */
  maxRedirects?: number;
  /** Fetch timeout in ms. Default: 10s. */
  timeoutMs?: number;
  /** PDF handling (application/pdf). */
  pdf?: GatewayHttpResponsesPdfConfig;
};

export type GatewayHttpResponsesPdfConfig = {
  /** Max pages to parse/render. Default: 4. */
  maxPages?: number;
  /** Max pixels per rendered page. Default: 4M. */
  maxPixels?: number;
  /** Minimum extracted text length to skip rasterization. Default: 200 chars. */
  minTextChars?: number;
};

export type GatewayHttpResponsesImagesConfig = {
  /** Allow URL fetches for input_image. Default: true. */
  allowUrl?: boolean;
  /** Allowed MIME types (case-insensitive). */
  allowedMimes?: string[];
  /** Max bytes per image. Default: 10MB. */
  maxBytes?: number;
  /** Max redirects when fetching a URL. Default: 3. */
  maxRedirects?: number;
  /** Fetch timeout in ms. Default: 10s. */
  timeoutMs?: number;
};

export type GatewayHttpEndpointsConfig = {
  chatCompletions?: GatewayHttpChatCompletionsConfig;
  responses?: GatewayHttpResponsesConfig;
};

export type GatewayHttpConfig = {
  endpoints?: GatewayHttpEndpointsConfig;
};

export type GatewayNodesConfig = {
  /** Browser routing policy for node-hosted browser proxies. */
  browser?: {
    /** Routing mode (default: auto). */
    mode?: "auto" | "manual" | "off";
    /** Pin to a specific node id/name (optional). */
    node?: string;
  };
  /** Additional node.invoke commands to allow on the gateway. */
  allowCommands?: string[];
  /** Commands to deny even if they appear in the defaults or node claims. */
  denyCommands?: string[];
};

export type GatewayConfig = {
  /** Single multiplexed port for Gateway WS + HTTP (default: 18789). */
  port?: number;
  /**
   * Explicit gateway mode. When set to "remote", local gateway start is disabled.
   * When set to "local", the CLI may start the gateway locally.
   */
  mode?: "local" | "remote";
  /**
   * Bind address policy for the Gateway WebSocket + Control UI HTTP server.
   * - auto: Loopback (127.0.0.1) if available, else 0.0.0.0 (fallback to all interfaces)
   * - lan: 0.0.0.0 (all interfaces, no fallback)
   * - loopback: 127.0.0.1 (local-only)
   * - tailnet: Tailnet IPv4 if available (100.64.0.0/10), else loopback
   * - custom: User-specified IP, fallback to 0.0.0.0 if unavailable (requires customBindHost)
   * Default: loopback (127.0.0.1).
   */
  bind?: GatewayBindMode;
  /** Custom IP address for bind="custom" mode. Fallback: 0.0.0.0. */
  customBindHost?: string;
  controlUi?: GatewayControlUiConfig;
  auth?: GatewayAuthConfig;
  tailscale?: GatewayTailscaleConfig;
  remote?: GatewayRemoteConfig;
  reload?: GatewayReloadConfig;
  tls?: GatewayTlsConfig;
  http?: GatewayHttpConfig;
  nodes?: GatewayNodesConfig;
  /**
   * IPs of trusted reverse proxies (e.g. Traefik, nginx). When a connection
   * arrives from one of these IPs, the Gateway trusts `x-forwarded-for` (or
   * `x-real-ip`) to determine the client IP for local pairing and HTTP checks.
   */
  trustedProxies?: string[];
};
```

## `packages/agent/src/config/types.hooks.ts`

```typescript
export type HookMappingMatch = {
  path?: string;
  source?: string;
};

export type HookMappingTransform = {
  module: string;
  export?: string;
};

export type HookMappingConfig = {
  id?: string;
  match?: HookMappingMatch;
  action?: "wake" | "agent";
  wakeMode?: "now" | "next-heartbeat";
  name?: string;
  sessionKey?: string;
  messageTemplate?: string;
  textTemplate?: string;
  deliver?: boolean;
  /** DANGEROUS: Disable external content safety wrapping for this hook. */
  allowUnsafeExternalContent?: boolean;
  channel?:
    | "last"
    | "whatsapp"
    | "telegram"
    | "discord"
    | "googlechat"
    | "slack"
    | "signal"
    | "imessage"
    | "msteams";
  to?: string;
  /** Override model for this hook (provider/model or alias). */
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  transform?: HookMappingTransform;
};

export type HooksGmailTailscaleMode = "off" | "serve" | "funnel";

export type HooksGmailConfig = {
  account?: string;
  label?: string;
  topic?: string;
  subscription?: string;
  pushToken?: string;
  hookUrl?: string;
  includeBody?: boolean;
  maxBytes?: number;
  renewEveryMinutes?: number;
  /** DANGEROUS: Disable external content safety wrapping for Gmail hooks. */
  allowUnsafeExternalContent?: boolean;
  serve?: {
    bind?: string;
    port?: number;
    path?: string;
  };
  tailscale?: {
    mode?: HooksGmailTailscaleMode;
    path?: string;
    /** Optional tailscale serve/funnel target (port, host:port, or full URL). */
    target?: string;
  };
  /** Optional model override for Gmail hook processing (provider/model or alias). */
  model?: string;
  /** Optional thinking level override for Gmail hook processing. */
  thinking?: "off" | "minimal" | "low" | "medium" | "high";
};

export type InternalHookHandlerConfig = {
  /** Event key to listen for (e.g., 'command:new', 'session:start') */
  event: string;
  /** Path to handler module (absolute or relative to cwd) */
  module: string;
  /** Export name from module (default: 'default') */
  export?: string;
};

export type HookConfig = {
  enabled?: boolean;
  env?: Record<string, string>;
  [key: string]: unknown;
};

export type HookInstallRecord = {
  source: "npm" | "archive" | "path";
  spec?: string;
  sourcePath?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  hooks?: string[];
};

export type InternalHooksConfig = {
  /** Enable hooks system */
  enabled?: boolean;
  /** Legacy: List of internal hook handlers to register (still supported) */
  handlers?: InternalHookHandlerConfig[];
  /** Per-hook configuration overrides */
  entries?: Record<string, HookConfig>;
  /** Load configuration */
  load?: {
    /** Additional hook directories to scan */
    extraDirs?: string[];
  };
  /** Install records for hook packs or hooks */
  installs?: Record<string, HookInstallRecord>;
};

export type HooksConfig = {
  enabled?: boolean;
  path?: string;
  token?: string;
  maxBodyBytes?: number;
  presets?: string[];
  transformsDir?: string;
  mappings?: HookMappingConfig[];
  gmail?: HooksGmailConfig;
  /** Internal agent event hooks */
  internal?: InternalHooksConfig;
};
```

## `packages/agent/src/config/types.messages.ts`

```typescript
export type QueueMode =
  | "steer"
  | "followup"
  | "collect"
  | "steer-backlog"
  | "steer+backlog"
  | "queue"
  | "interrupt";

export type QueueDropPolicy = "old" | "new" | "summarize";

export type QueueModeByProvider = {
  whatsapp?: QueueMode;
  telegram?: QueueMode;
  discord?: QueueMode;
  googlechat?: QueueMode;
  slack?: QueueMode;
  signal?: QueueMode;
  imessage?: QueueMode;
  msteams?: QueueMode;
  webchat?: QueueMode;
};

export type TtsProvider = "elevenlabs" | "openai" | "edge";

export type TtsMode = "final" | "all";

export type TtsAutoMode = "off" | "always" | "inbound" | "tagged";

export type TtsModelOverrideConfig = {
  /** Enable model-provided overrides for TTS. */
  enabled?: boolean;
  /** Allow model-provided TTS text blocks. */
  allowText?: boolean;
  /** Allow model-provided provider override. */
  allowProvider?: boolean;
  /** Allow model-provided voice/voiceId override. */
  allowVoice?: boolean;
  /** Allow model-provided modelId override. */
  allowModelId?: boolean;
  /** Allow model-provided voice settings override. */
  allowVoiceSettings?: boolean;
  /** Allow model-provided normalization or language overrides. */
  allowNormalization?: boolean;
  /** Allow model-provided seed override. */
  allowSeed?: boolean;
};

export type TtsConfig = {
  /** Auto-TTS mode (preferred). */
  auto?: TtsAutoMode;
  /** Legacy: enable auto-TTS when `auto` is not set. */
  enabled?: boolean;
  /** Apply TTS to final replies only or to all replies (tool/block/final). */
  mode?: TtsMode;
  /** Primary TTS provider (fallbacks are automatic). */
  provider?: TtsProvider;
  /** Optional model override for TTS auto-summary (provider/model or alias). */
  summaryModel?: string;
  /** Allow the model to override TTS parameters. */
  modelOverrides?: TtsModelOverrideConfig;
  /** ElevenLabs configuration. */
  elevenlabs?: {
    apiKey?: string;
    baseUrl?: string;
    voiceId?: string;
    modelId?: string;
    seed?: number;
    applyTextNormalization?: "auto" | "on" | "off";
    languageCode?: string;
    voiceSettings?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      useSpeakerBoost?: boolean;
      speed?: number;
    };
  };
  /** OpenAI configuration. */
  openai?: {
    apiKey?: string;
    model?: string;
    voice?: string;
  };
  /** Microsoft Edge (node-edge-tts) configuration. */
  edge?: {
    /** Explicitly allow Edge TTS usage (no API key required). */
    enabled?: boolean;
    voice?: string;
    lang?: string;
    outputFormat?: string;
    pitch?: string;
    rate?: string;
    volume?: string;
    saveSubtitles?: boolean;
    proxy?: string;
    timeoutMs?: number;
  };
  /** Optional path for local TTS user preferences JSON. */
  prefsPath?: string;
  /** Hard cap for text sent to TTS (chars). */
  maxTextLength?: number;
  /** API request timeout (ms). */
  timeoutMs?: number;
};

export type QueueConfig = {
  mode?: QueueMode;
  byChannel?: QueueModeByProvider;
  debounceMs?: number;
  /** Per-channel debounce overrides (ms). */
  debounceMsByChannel?: InboundDebounceByProvider;
  cap?: number;
  drop?: QueueDropPolicy;
};

export type InboundDebounceByProvider = Record<string, number>;

export type InboundDebounceConfig = {
  debounceMs?: number;
  byChannel?: InboundDebounceByProvider;
};

export type BroadcastStrategy = "parallel" | "sequential";

export type BroadcastConfig = {
  /** Default processing strategy for broadcast peers. */
  strategy?: BroadcastStrategy;
  /**
   * Map peer IDs to arrays of agent IDs that should ALL process messages.
   *
   * Note: the index signature includes `undefined` so `strategy?: ...` remains type-safe.
   */
  [peerId: string]: string[] | BroadcastStrategy | undefined;
};

export type MessagesConfig = {
  /**
   * Prefix auto-added to all outbound replies.
   *
   * - string: explicit prefix (may include template variables)
   * - special value: `"auto"` derives `[{agents.list[].identity.name}]` for the routed agent (when set)
   *
   * Supported template variables (case-insensitive):
   * - `{model}` - short model name (e.g., `claude-opus-4-5`, `gpt-5`)
   * - `{modelFull}` - full model identifier (e.g., `anthropic/claude-opus-4-5`)
   * - `{provider}` - provider name (e.g., `anthropic`, `openai`)
   * - `{thinkingLevel}` or `{think}` - current thinking level (`high`, `low`, `off`)
   * - `{identity.name}` or `{identityName}` - agent identity name
   *
   * Example: `"[{model} | think:{thinkingLevel}]"` → `"[claude-opus-4-5 | think:high]"`
   *
   * Unresolved variables remain as literal text (e.g., `{model}` if context unavailable).
   *
   * Default: none
   */
  responsePrefix?: string;
  groupChat?: GroupChatConfig;
  queue?: QueueConfig;
  /** Debounce rapid inbound messages per sender (global + per-channel overrides). */
  inbound?: InboundDebounceConfig;
  /** Emoji reaction used to acknowledge inbound messages (empty disables). */
  ackReaction?: string;
  /** When to send ack reactions. Default: "group-mentions". */
  ackReactionScope?: "group-mentions" | "group-all" | "direct" | "all";
  /** Remove ack reaction after reply is sent (default: false). */
  removeAckAfterReply?: boolean;
  /** Text-to-speech settings for outbound replies. */
  tts?: TtsConfig;
};

export type AudioConfig = {
  [key: string]: unknown;
};

export type CommandsConfig = {
  /** Enable native command registration when supported (default: "auto"). */
  native?: NativeCommandsSetting;
  /** Enable native skill command registration when supported (default: "auto"). */
  nativeSkills?: NativeCommandsSetting;
  /** Enable text command parsing (default: true). */
  text?: boolean;
  /** Allow bash chat command (`!`; `/bash` alias) (default: false). */
  bash?: boolean;
  /** How long bash waits before backgrounding (default: 2000; 0 backgrounds immediately). */
  bashForegroundMs?: number;
  /** Allow /config command (default: false). */
  config?: boolean;
  /** Allow /debug command (default: false). */
  debug?: boolean;
  /** Allow restart commands/tools (default: false). */
  restart?: boolean;
  /** Enforce access-group allowlists/policies for commands (default: true). */
  useAccessGroups?: boolean;
};
```

## `packages/agent/src/config/types.tools.ts`

```typescript
export type MediaUnderstandingScopeMatch = {
  channel?: string;
  chatType?: NormalizedChatType;
  keyPrefix?: string;
};

export type MediaUnderstandingScopeRule = {
  action: SessionSendPolicyAction;
  match?: MediaUnderstandingScopeMatch;
};

export type MediaUnderstandingScopeConfig = {
  default?: SessionSendPolicyAction;
  rules?: MediaUnderstandingScopeRule[];
};

export type MediaUnderstandingCapability = "image" | "audio" | "video";

export type MediaUnderstandingAttachmentsConfig = {
  /** Select the first matching attachment or process multiple. */
  mode?: "first" | "all";
  /** Max number of attachments to process (default: 1). */
  maxAttachments?: number;
  /** Attachment ordering preference. */
  prefer?: "first" | "last" | "path" | "url";
};

export type MediaUnderstandingModelConfig = {
  /** provider API id (e.g. openai, google). */
  provider?: string;
  /** Model id for provider-based understanding. */
  model?: string;
  /** Optional capability tags for shared model lists. */
  capabilities?: MediaUnderstandingCapability[];
  /** Use a CLI command instead of provider API. */
  type?: "provider" | "cli";
  /** CLI binary (required when type=cli). */
  command?: string;
  /** CLI args (template-enabled). */
  args?: string[];
  /** Optional prompt override for this model entry. */
  prompt?: string;
  /** Optional max output characters for this model entry. */
  maxChars?: number;
  /** Optional max bytes for this model entry. */
  maxBytes?: number;
  /** Optional timeout override (seconds) for this model entry. */
  timeoutSeconds?: number;
  /** Optional language hint for audio transcription. */
  language?: string;
  /** Optional provider-specific query params (merged into requests). */
  providerOptions?: Record<string, Record<string, string | number | boolean>>;
  /** Optional base URL override for provider requests. */
  baseUrl?: string;
  /** Optional headers merged into provider requests. */
  headers?: Record<string, string>;
  /** Auth profile id to use for this provider. */
  profile?: string;
  /** Preferred profile id if multiple are available. */
  preferredProfile?: string;
};

export type MediaUnderstandingConfig = {
  /** Enable media understanding when models are configured. */
  enabled?: boolean;
  /** Optional scope gating for understanding. */
  scope?: MediaUnderstandingScopeConfig;
  /** Default max bytes to send. */
  maxBytes?: number;
  /** Default max output characters. */
  maxChars?: number;
  /** Default prompt. */
  prompt?: string;
  /** Default timeout (seconds). */
  timeoutSeconds?: number;
  /** Default language hint (audio). */
  language?: string;
  /** Optional provider-specific query params (merged into requests). */
  providerOptions?: Record<string, Record<string, string | number | boolean>>;
  /** Optional base URL override for provider requests. */
  baseUrl?: string;
  /** Optional headers merged into provider requests. */
  headers?: Record<string, string>;
  /** Attachment selection policy. */
  attachments?: MediaUnderstandingAttachmentsConfig;
  /** Ordered model list (fallbacks in order). */
  models?: MediaUnderstandingModelConfig[];
};

export type LinkModelConfig = {
  /** Use a CLI command for link processing. */
  type?: "cli";
  /** CLI binary (required when type=cli). */
  command: string;
  /** CLI args (template-enabled). */
  args?: string[];
  /** Optional timeout override (seconds) for this model entry. */
  timeoutSeconds?: number;
};

export type LinkToolsConfig = {
  /** Enable link understanding when models are configured. */
  enabled?: boolean;
  /** Optional scope gating for understanding. */
  scope?: MediaUnderstandingScopeConfig;
  /** Max number of links to process per message. */
  maxLinks?: number;
  /** Default timeout (seconds). */
  timeoutSeconds?: number;
  /** Ordered model list (fallbacks in order). */
  models?: LinkModelConfig[];
};

export type MediaToolsConfig = {
  /** Shared model list applied across image/audio/video. */
  models?: MediaUnderstandingModelConfig[];
  /** Max concurrent media understanding runs. */
  concurrency?: number;
  image?: MediaUnderstandingConfig;
  audio?: MediaUnderstandingConfig;
  video?: MediaUnderstandingConfig;
};

export type ExecToolConfig = {
  /** Exec host routing (default: sandbox). */
  host?: "sandbox" | "gateway" | "node";
  /** Exec security mode (default: deny). */
  security?: "deny" | "allowlist" | "full";
  /** Exec ask mode (default: on-miss). */
  ask?: "off" | "on-miss" | "always";
  /** Default node binding for exec.host=node (node id/name). */
  node?: string;
  /** Directories to prepend to PATH when running exec (gateway/sandbox). */
  pathPrepend?: string[];
  /** Safe stdin-only binaries that can run without allowlist entries. */
  safeBins?: string[];
  /** Default time (ms) before an exec command auto-backgrounds. */
  backgroundMs?: number;
  /** Default timeout (seconds) before auto-killing exec commands. */
  timeoutSec?: number;
  /** Emit a running notice (ms) when approval-backed exec runs long (default: 10000, 0 = off). */
  approvalRunningNoticeMs?: number;
  /** How long to keep finished sessions in memory (ms). */
  cleanupMs?: number;
  /** Emit a system event and heartbeat when a backgrounded exec exits. */
  notifyOnExit?: boolean;
  /** apply_patch subtool configuration (experimental). */
  applyPatch?: {
    /** Enable apply_patch for OpenAI models (default: false). */
    enabled?: boolean;
    /**
     * Optional allowlist of model ids that can use apply_patch.
     * Accepts either raw ids (e.g. "gpt-5.2") or full ids (e.g. "openai/gpt-5.2").
     */
    allowModels?: string[];
  };
};

export type AgentToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  /** Per-agent elevated exec gate (can only further restrict global tools.elevated). */
  elevated?: {
    /** Enable or disable elevated mode for this agent (default: true). */
    enabled?: boolean;
    /** Approved senders for /elevated (per-provider allowlists). */
    allowFrom?: AgentElevatedAllowFromConfig;
  };
  /** Exec tool defaults for this agent. */
  exec?: ExecToolConfig;
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
};

export type MemorySearchConfig = {
  /** Enable vector memory search (default: true). */
  enabled?: boolean;
  /** Sources to index and search (default: ["memory"]). */
  sources?: Array<"memory" | "sessions">;
  /** Extra paths to include in memory search (directories or .md files). */
  extraPaths?: string[];
  /** Experimental memory search settings. */
  experimental?: {
    /** Enable session transcript indexing (experimental, default: false). */
    sessionMemory?: boolean;
  };
  /** Embedding provider mode. */
  provider?: "openai" | "gemini" | "local";
  remote?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batch?: {
      /** Enable batch API for embedding indexing (OpenAI/Gemini; default: true). */
      enabled?: boolean;
      /** Wait for batch completion (default: true). */
      wait?: boolean;
      /** Max concurrent batch jobs (default: 2). */
      concurrency?: number;
      /** Poll interval in ms (default: 5000). */
      pollIntervalMs?: number;
      /** Timeout in minutes (default: 60). */
      timeoutMinutes?: number;
    };
  };
  /** Fallback behavior when embeddings fail. */
  fallback?: "openai" | "gemini" | "local" | "none";
  /** Embedding model id (remote) or alias (local). */
  model?: string;
  /** Local embedding settings (node-llama-cpp). */
  local?: {
    /** GGUF model path or hf: URI. */
    modelPath?: string;
    /** Optional cache directory for local models. */
    modelCacheDir?: string;
  };
  /** Index storage configuration. */
  store?: {
    driver?: "sqlite";
    path?: string;
    vector?: {
      /** Enable sqlite-vec extension for vector search (default: true). */
      enabled?: boolean;
      /** Optional override path to sqlite-vec extension (.dylib/.so/.dll). */
      extensionPath?: string;
    };
    cache?: {
      /** Enable embedding cache (default: true). */
      enabled?: boolean;
      /** Optional max cache entries per provider/model. */
      maxEntries?: number;
    };
  };
  /** Chunking configuration. */
  chunking?: {
    tokens?: number;
    overlap?: number;
  };
  /** Sync behavior. */
  sync?: {
    onSessionStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    watchDebounceMs?: number;
    intervalMinutes?: number;
    sessions?: {
      /** Minimum appended bytes before session transcripts are reindexed. */
      deltaBytes?: number;
      /** Minimum appended JSONL lines before session transcripts are reindexed. */
      deltaMessages?: number;
    };
  };
  /** Query behavior. */
  query?: {
    maxResults?: number;
    minScore?: number;
    hybrid?: {
      /** Enable hybrid BM25 + vector search (default: true). */
      enabled?: boolean;
      /** Weight for vector similarity when merging results (0-1). */
      vectorWeight?: number;
      /** Weight for BM25 text relevance when merging results (0-1). */
      textWeight?: number;
      /** Multiplier for candidate pool size (default: 4). */
      candidateMultiplier?: number;
    };
  };
  /** Index cache behavior. */
  cache?: {
    /** Cache chunk embeddings in SQLite (default: true). */
    enabled?: boolean;
    /** Optional cap on cached embeddings (best-effort). */
    maxEntries?: number;
  };
};

export type ToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  web?: {
    search?: {
      /** Enable web search tool (default: true when API key is present). */
      enabled?: boolean;
      /** Search provider ("brave" or "perplexity"). */
      provider?: "brave" | "perplexity";
      /** Brave Search API key (optional; defaults to BRAVE_API_KEY env var). */
      apiKey?: string;
      /** Default search results count (1-10). */
      maxResults?: number;
      /** Timeout in seconds for search requests. */
      timeoutSeconds?: number;
      /** Cache TTL in minutes for search results. */
      cacheTtlMinutes?: number;
      /** Perplexity-specific configuration (used when provider="perplexity"). */
      perplexity?: {
        /** API key for Perplexity or OpenRouter (defaults to PERPLEXITY_API_KEY or OPENROUTER_API_KEY env var). */
        apiKey?: string;
        /** Base URL for API requests (defaults to OpenRouter: https://openrouter.ai/api/v1). */
        baseUrl?: string;
        /** Model to use (defaults to "perplexity/sonar-pro"). */
        model?: string;
      };
    };
    fetch?: {
      /** Enable web fetch tool (default: true). */
      enabled?: boolean;
      /** Max characters to return from fetched content. */
      maxChars?: number;
      /** Hard cap for maxChars (tool or config), defaults to 50000. */
      maxCharsCap?: number;
      /** Timeout in seconds for fetch requests. */
      timeoutSeconds?: number;
      /** Cache TTL in minutes for fetched content. */
      cacheTtlMinutes?: number;
      /** Maximum number of redirects to follow (default: 3). */
      maxRedirects?: number;
      /** Override User-Agent header for fetch requests. */
      userAgent?: string;
      /** Use Readability to extract main content (default: true). */
      readability?: boolean;
      firecrawl?: {
        /** Enable Firecrawl fallback (default: true when apiKey is set). */
        enabled?: boolean;
        /** Firecrawl API key (optional; defaults to FIRECRAWL_API_KEY env var). */
        apiKey?: string;
        /** Firecrawl base URL (default: https://api.firecrawl.dev). */
        baseUrl?: string;
        /** Whether to keep only main content (default: true). */
        onlyMainContent?: boolean;
        /** Max age (ms) for cached Firecrawl content. */
        maxAgeMs?: number;
        /** Timeout in seconds for Firecrawl requests. */
        timeoutSeconds?: number;
      };
    };
  };
  media?: MediaToolsConfig;
  links?: LinkToolsConfig;
  /** Message tool configuration. */
  message?: {
    crossContext?: {
      /** Allow sends to other channels within the same provider (default: true). */
      allowWithinProvider?: boolean;
      /** Allow sends across different providers (default: false). */
      allowAcrossProviders?: boolean;
      /** Cross-context marker configuration. */
      marker?: {
        /** Enable origin markers for cross-context sends (default: true). */
        enabled?: boolean;
        /** Text prefix template, supports {channel}. */
        prefix?: string;
        /** Text suffix template, supports {channel}. */
        suffix?: string;
      };
    };
    broadcast?: {
      /** Enable broadcast action (default: true). */
      enabled?: boolean;
    };
  };
  agentToAgent?: {
    /** Enable agent-to-agent messaging tools. Default: false. */
    enabled?: boolean;
    /** Allowlist of agent ids or patterns (implementation-defined). */
    allow?: string[];
  };
  /** Elevated exec permissions for the host machine. */
  elevated?: {
    /** Enable or disable elevated mode (default: true). */
    enabled?: boolean;
    /** Approved senders for /elevated (per-provider allowlists). */
    allowFrom?: AgentElevatedAllowFromConfig;
  };
  /** Exec tool defaults. */
  exec?: ExecToolConfig;
  /** Sub-agent tool policy defaults (deny wins). */
  subagents?: {
    /** Default model selection for spawned sub-agents (string or {primary,fallbacks}). */
    model?: string | { primary?: string; fallbacks?: string[] };
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
  /** Sandbox tool policy defaults (deny wins). */
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
};
```

## `packages/agent/src/config/zod-schema.agent-runtime.ts`

```typescript
type ToolPolicyConflictValue = {
  allow?: string[];
  alsoAllow?: string[];
};
```

## `packages/agent/src/config/zod-schema.providers-core.ts`

```typescript
export type TwitterConfig = z.infer<typeof TwitterConfigSchema>;
```

## `packages/agent/src/contracts/awareness.ts`

```typescript
export type AwarenessInvalidationEvent =
  | "permission-changed"
  | "plugin-changed"
  | "wallet-updated"
  | "provider-changed"
  | "config-changed"
  | "runtime-restarted"
  | "opinion-updated";
```

## `packages/agent/src/contracts/config.ts`

```typescript
export type DatabaseProviderType = "pglite" | "postgres";

export type MediaMode = "cloud" | "own-key";

export type ImageProvider = "cloud" | "fal" | "openai" | "google" | "xai";

export type ImageFalConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type ImageOpenaiConfig = {
  apiKey?: string;
  model?: string;
  quality?: "standard" | "hd";
  style?: "natural" | "vivid";
};

export type ImageGoogleConfig = {
  apiKey?: string;
  model?: string;
  aspectRatio?: string;
};

export type ImageXaiConfig = {
  apiKey?: string;
  model?: string;
};

export type ImageConfig = {
  enabled?: boolean;
  mode?: MediaMode;
  provider?: ImageProvider;
  defaultSize?: string;
  fal?: ImageFalConfig;
  openai?: ImageOpenaiConfig;
  google?: ImageGoogleConfig;
  xai?: ImageXaiConfig;
};

export type VideoProvider = "cloud" | "fal" | "openai" | "google";

export type VideoFalConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type VideoOpenaiConfig = {
  apiKey?: string;
  model?: string;
};

export type VideoGoogleConfig = {
  apiKey?: string;
  model?: string;
};

export type VideoConfig = {
  enabled?: boolean;
  mode?: MediaMode;
  provider?: VideoProvider;
  defaultDuration?: number;
  fal?: VideoFalConfig;
  openai?: VideoOpenaiConfig;
  google?: VideoGoogleConfig;
};

export type AudioGenProvider = "cloud" | "suno" | "elevenlabs";

export type AudioSunoConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type AudioElevenlabsSfxConfig = {
  apiKey?: string;
  duration?: number;
};

export type AudioGenConfig = {
  enabled?: boolean;
  mode?: MediaMode;
  provider?: AudioGenProvider;
  suno?: AudioSunoConfig;
  elevenlabs?: AudioElevenlabsSfxConfig;
};

export type VisionProvider =
  | "cloud"
  | "openai"
  | "google"
  | "anthropic"
  | "xai"
  | "ollama";

export type VisionOpenaiConfig = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
};

export type VisionGoogleConfig = {
  apiKey?: string;
  model?: string;
};

export type VisionAnthropicConfig = {
  apiKey?: string;
  model?: string;
};

export type VisionXaiConfig = {
  apiKey?: string;
  model?: string;
};

export type VisionOllamaConfig = {
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  autoDownload?: boolean;
};

export type VisionConfig = {
  enabled?: boolean;
  mode?: MediaMode;
  provider?: VisionProvider;
  openai?: VisionOpenaiConfig;
  google?: VisionGoogleConfig;
  anthropic?: VisionAnthropicConfig;
  xai?: VisionXaiConfig;
  ollama?: VisionOllamaConfig;
};

export type MediaConfig = {
  image?: ImageConfig;
  video?: VideoConfig;
  audio?: AudioGenConfig;
  vision?: VisionConfig;
};

export type ReleaseChannel = "stable" | "beta" | "nightly";

export type CustomActionHandler =
  | {
      type: "http";
      method: string;
      url: string;
      headers?: Record<string, string>;
      bodyTemplate?: string;
    }
  | { type: "shell"; command: string }
  | { type: "code"; code: string };

export type CustomActionDef = {
  id: string;
  name: string;
  description: string;
  similes?: string[];
  parameters: Array<{ name: string; description: string; required: boolean }>;
  handler: CustomActionHandler;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

## `packages/agent/src/contracts/onboarding.ts`

```typescript
export type OnboardingProviderFamily =
  | "anthropic"
  | "deepseek"
  | "elizacloud"
  | "gemini"
  | "grok"
  | "groq"
  | "mistral"
  | "ollama"
  | "openai"
  | "openrouter"
  | "pi-ai"
  | "together"
  | "zai";

export type OnboardingProviderId =
  | "anthropic"
  | "anthropic-subscription"
  | "deepseek"
  | "elizacloud"
  | "gemini"
  | "grok"
  | "groq"
  | "mistral"
  | "ollama"
  | "openai"
  | "openai-subscription"
  | "openrouter"
  | "pi-ai"
  | "together"
  | "zai";

export type OnboardingProviderAuthMode =
  | "api-key"
  | "cloud"
  | "credentials"
  | "local"
  | "subscription";

export type OnboardingProviderGroup = "cloud" | "local" | "subscription";

export type SubscriptionProviderSelectionId =
  | "anthropic-subscription"
  | "openai-subscription";

export type StoredSubscriptionProviderId =
  | "anthropic-subscription"
  | "openai-codex";

export type OnboardingLocalProviderId = Exclude<

export type OnboardingConnection =
  | OnboardingCloudManagedConnection
  | OnboardingLocalProviderConnection
  | OnboardingRemoteProviderConnection;
```

## `packages/agent/src/contracts/permissions.ts`

```typescript
export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export type Platform = "darwin" | "win32" | "linux";
```

## `packages/agent/src/contracts/wallet.ts`

```typescript
export type WalletRpcChain = keyof typeof WALLET_RPC_PROVIDER_OPTIONS;

export type EvmWalletRpcProvider =

export type BscWalletRpcProvider =

export type SolanaWalletRpcProvider =

export type WalletRpcCredentialKey =
  | "ALCHEMY_API_KEY"
  | "INFURA_API_KEY"
  | "ANKR_API_KEY"
  | "NODEREAL_BSC_RPC_URL"
  | "QUICKNODE_BSC_RPC_URL"
  | "HELIUS_API_KEY"
  | "BIRDEYE_API_KEY"
  | "ETHEREUM_RPC_URL"
  | "BASE_RPC_URL"
  | "AVALANCHE_RPC_URL"
  | "BSC_RPC_URL"
  | "SOLANA_RPC_URL";

export type TradePermissionMode =
  | "user-sign-only"
  | "manual-local-key"
  | "agent-auto";

export type BscTradeSide = "buy" | "sell";

export type BscTradeTxStatus = "pending" | "success" | "reverted" | "not_found";

export type WalletTradeSource = "agent" | "manual";

export type WalletTradingProfileWindow = "7d" | "30d" | "all";

export type WalletTradingProfileSourceFilter = "all" | WalletTradeSource;

export type WalletChain = "evm" | "solana";
```

## `packages/agent/src/diagnostics/integration-observability.ts`

```typescript
export type IntegrationBoundary = "cloud" | "wallet" | "marketplace" | "mcp";

export type IntegrationOutcome = "success" | "failure";
```

## `packages/agent/src/emotes/catalog.ts`

```typescript
export type EmoteCategory =
  | "greeting"
  | "emotion"
  | "dance"
  | "combat"
  | "idle"
  | "movement"
  | "gesture"
  | "other";
```

## `packages/agent/src/hooks/types.ts`

```typescript
export type HookEventType = "command" | "session" | "agent" | "gateway";

export type HookHandler = (event: HookEvent) => Promise<void> | void;

export type HookSource =
  | "eliza-bundled"
  | "eliza-managed"
  | "eliza-workspace"
  | "eliza-plugin";
```

## `packages/agent/src/providers/admin-trust.ts`

```typescript
type WorldMetadataShape = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
};
```

## `packages/agent/src/providers/session-bridge.ts`

```typescript
type ElizaCoreSessionHelpers = {
  buildAgentMainSessionKey?: (params: {
    agentId: string;
    mainKey: string;
  }) => string;
  ChannelType?: {
    DM: number | string;
    SELF: number | string;
    GROUP: number | string;
  };
  parseAgentSessionKey?: (key: string) =>
    | {
        agentId?: string;
      }
    | undefined;
};
```

## `packages/agent/src/providers/simple-mode.ts`

```typescript
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";

export type ChannelExecutionProfile =
  | "voice_fast"
  | "text_fast"
  | "group_compact"
  | "default_full";
```

## `packages/agent/src/providers/workspace.ts`

```typescript
export type WorkspaceInitFileName =
  | typeof DEFAULT_AGENTS_FILENAME
  | typeof DEFAULT_TOOLS_FILENAME
  | typeof DEFAULT_IDENTITY_FILENAME
  | typeof DEFAULT_USER_FILENAME
  | typeof DEFAULT_HEARTBEAT_FILENAME
  | typeof DEFAULT_INIT_FILENAME
  | typeof DEFAULT_MEMORY_FILENAME
  | typeof DEFAULT_MEMORY_ALT_FILENAME;

export type WorkspaceInitFile = {
  name: WorkspaceInitFileName;
  path: string;
  content?: string;
  missing: boolean;
};

type ElizaCoreWorkspaceHelpers = {
  isSubagentSessionKey?: (key: string) => boolean;
  logger?: {
    warn: (message: string) => void;
  };
};
```

## `packages/agent/src/runtime/agent-event-service.ts`

```typescript
type RuntimeWithServiceGetter = {
  getService: (serviceType: string) => unknown | null;
};
```

## `packages/agent/src/runtime/cloud-onboarding.ts`

```typescript
  type CloudAgentCreateParams,
  ElizaCloudClient,
} from "../cloud/bridge-client";

type ClackModule = typeof import("@clack/prompts");
```

## `packages/agent/src/runtime/custom-actions.ts`

```typescript
  type RequestOptions as HttpRequestOptions,
  type IncomingMessage,
  request as requestHttp,
} from "node:http";

type VmRunner = {
  runInNewContext: (
    code: string,
    contextObject: Record<string, unknown>,
    options?: { filename?: string; timeout?: number },
  ) => unknown;
};

type ResolvedUrlTarget = {
  parsed: URL;
  hostname: string;
  pinnedAddress: string;
};

type PinnedFetchInput = {
  url: URL;
  init: RequestInit;
  target: ResolvedUrlTarget;
  timeoutMs: number;
};

type PinnedFetchImpl = (input: PinnedFetchInput) => Promise<Response>;
```

## `packages/agent/src/runtime/eliza-plugin.ts`

```typescript
export type ElizaPluginConfig = {
  workspaceDir?: string;
  initMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
};
```

## `packages/agent/src/runtime/eliza.ts`

```typescript
type ClackModule = typeof import("@clack/prompts");

  type Character,
  type Component,
  createBasicCapabilitiesPlugin,
  createMessageMemory,
  type Entity,
  type LogEntry,
  logger,
  // loggerScope, // removed

  type Plugin,
  type Provider,
  stringToUuid,
  type TargetInfo,
  type UUID,
} from "@elizaos/core";

  type ElizaConfig,
  loadElizaConfig,
  saveElizaConfig,
} from "../config/config";

  type ApplyPluginAutoEnableParams,
  applyPluginAutoEnable,
} from "../config/plugin-auto-enable";

  type LoadHooksOptions,
  loadHooks,
  triggerHook,
} from "../hooks/index";

type SandboxFetchAuditEvent = {
  direction: "inbound" | "outbound";
  url: string;
  tokenIds: string[];
};

type RuntimeAdapterWithClose = {
  close?: () => Promise<void> | void;
};

type TrajectoryLoggerRegistrationStatus =
  | "pending"
  | "registering"
  | "registered"
  | "failed"
  | "unknown";

type TrajectoryLoggerRuntimeLike = {
  getServicesByType?: (serviceType: string) => unknown;
  getService?: (serviceType: string) => unknown;
  getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
  getServiceRegistrationStatus?: (
    serviceType: string,
  ) => TrajectoryLoggerRegistrationStatus;
};

type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

type PgliteRecoveryAction =
  | "none"
  | "retry-without-reset"
  | "reset-data-dir"
  | "fail-active-lock";

type DbErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  detail?: unknown;
  hint?: unknown;
  constraint?: unknown;
  schema?: unknown;
  table?: unknown;
  column?: unknown;
  where?: unknown;
  cause?: unknown;
};

    type CreateComponentFn = (component: Component) => Promise<boolean>;

    type UpdateComponentFn = (component: Component) => Promise<void>;

    type CreateEntitiesFn = (entities: Entity[]) => Promise<UUID[] | boolean>;

    type GetEntitiesByIdsFn = (entityIds: UUID[]) => Promise<Entity[]>;

    type EnsureEntityExistsFn = (entity: Entity) => Promise<boolean>;
```

## `packages/agent/src/runtime/embedding-presets.ts`

```typescript
export type EmbeddingTier = "fallback" | "standard" | "performance";
```

## `packages/agent/src/runtime/release-plugin-policy.ts`

```typescript
export type RegistryPluginInstallSurface = "runtime" | "app";

export type RegistryPluginReleaseAvailability = "bundled" | "post-release";
```

## `packages/agent/src/runtime/restart.ts`

```typescript
export type RestartHandler = (reason?: string) => void | Promise<void>;
```

## `packages/agent/src/runtime/trajectory-persistence.ts`

```typescript
type TrajectoryStatus = "active" | "completed" | "error" | "timeout";

type TrajectoryExportFormat = "json" | "csv" | "art";

type RuntimeDb = {
  execute: (query: { queryChunks: object[] }) => Promise<unknown>;
};

type TrajectoryLoggerLike = {
  listTrajectories?: unknown;
  getTrajectoryDetail?: unknown;
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  logLlmCall?: (params: Record<string, unknown>) => void;
  logProviderAccess?: (params: Record<string, unknown>) => void;
  getLlmCallLogs?: () => readonly unknown[];
  getProviderAccessLogs?: () => readonly unknown[];
  llmCalls?: unknown[];
  providerAccess?: unknown[];
};

type PersistedLlmCall = {
  callId: string;
  timestamp: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
  actionType: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
};

type PersistedProviderAccess = {
  providerId: string;
  providerName: string;
  timestamp: number;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  purpose: string;
};

type PersistedStep = {
  stepId: string;
  stepNumber: number;
  timestamp: number;
  llmCalls: PersistedLlmCall[];
  providerAccesses: PersistedProviderAccess[];
};

type PersistedTrajectory = {
  id: string;
  source: string;
  status: TrajectoryStatus;
  startTime: number;
  endTime: number | null;
  steps: PersistedStep[];
  metadata: Record<string, unknown>;
  totalReward: number;
  createdAt: string;
  updatedAt: string;
};

type StartStepOptions = {
  runtime: IAgentRuntime;
  stepId: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type CompleteStepOptions = {
  runtime: IAgentRuntime;
  stepId: string;
  status?: TrajectoryStatus;
  source?: string;
  metadata?: Record<string, unknown>;
};

  type VariadicLoggerCall = (...args: unknown[]) => unknown;
```

## `packages/agent/src/security/audit-log.ts`

```typescript
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export type AuditFeedSubscriber = (entry: AuditEntry) => void;
```

## `packages/agent/src/services/app-manager.ts`

```typescript
type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;
```

## `packages/agent/src/services/coding-agent-context.ts`

```typescript
export type FileOperation = z.infer<typeof FileOperationSchema>;

export type CommandResult = z.infer<typeof CommandResultSchema>;

export type CapturedError = z.infer<typeof CapturedErrorSchema>;

export type HumanFeedback = z.infer<typeof HumanFeedbackSchema>;

export type CodingIteration = z.infer<typeof CodingIterationSchema>;

export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

export type InteractionMode = z.infer<typeof InteractionModeSchema>;

export type CodingAgentContext = z.infer<typeof CodingAgentContextSchema>;

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Array<{ path: string; message: string }> };
```

## `packages/agent/src/services/privy-wallets.ts`

```typescript
export type PrivyWalletChain = "ethereum" | "solana";
```

## `packages/agent/src/services/registry-client-endpoints.ts`

```typescript
type ResolvedRegistryEndpoint = {
  parsed: URL;
  hostname: string;
  pinnedAddress: string | null;
};
```

## `packages/agent/src/services/sandbox-engine.ts`

```typescript
export type SandboxEngineType = "docker" | "apple-container" | "auto";

type ExecCommandResult = {
  binary: string;
  args: string[];
  timeoutMs?: number;
  stdin?: string;
};
```

## `packages/agent/src/services/sandbox-manager.ts`

```typescript
  type ISandboxEngine,
  type SandboxEngineType,
} from "./sandbox-engine";

export type SandboxMode = "off" | "light" | "standard" | "max";

export type SandboxState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "degraded"
  | "stopping"
  | "stopped"
  | "recovering";
```

## `packages/agent/src/services/self-updater.ts`

```typescript
export type InstallMethod =
  | "npm-global"
  | "bun-global"
  | "homebrew"
  | "snap"
  | "apt"
  | "flatpak"
  | "local-dev"
  | "unknown";
```

## `packages/agent/src/services/signal-pairing.ts`

```typescript
export type SignalPairingStatus =
  | "idle"
  | "initializing"
  | "waiting_for_qr"
  | "connected"
  | "disconnected"
  | "timeout"
  | "error";
```

## `packages/agent/src/services/signing-policy.ts`

```typescript
export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  requiresHumanConfirmation: boolean;
  matchedRule: string;
};
```

## `packages/agent/src/services/skill-marketplace.ts`

```typescript
type ScanSeverity = "info" | "warn" | "critical";
```

## `packages/agent/src/services/stream-manager.ts`

```typescript
export type AudioSource = "silent" | "system" | "microphone" | "tts";
```

## `packages/agent/src/services/whatsapp-pairing.ts`

```typescript
export type WhatsAppPairingStatus =
  | "idle"
  | "initializing"
  | "waiting_for_qr"
  | "connected"
  | "disconnected"
  | "timeout"
  | "error";
```

## `packages/agent/src/test-support/process-helpers.ts`

```typescript
type MockSpawnOptions = {
  exitCode: number;
  stderrOutput?: string;
  emitError?: Error;
};
```

## `packages/agent/src/test-support/route-test-helpers.ts`

```typescript
export type RouteBody = Record<string, unknown>;

export type RouteInvocationResult<TPayload = unknown> = {
  handled: boolean;
  status: number;
  payload: TPayload;
};

export type RouteInvokeArgs<TBody = RouteBody, TRuntime = unknown> = {
  method: string;
  pathname: string;
  url?: string;
  body?: TBody | null;
  runtimeOverride?: TRuntime;
  headers?: { host?: string };
};

export type RouteRequestContext<TBody, TRuntime> = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  runtime: TRuntime;
  readJsonBody: () => Promise<TBody | null>;
  json: (_res: ServerResponse, data: unknown, status?: number) => void;
  error: (_res: ServerResponse, message: string, status?: number) => void;
};

type RouteInvokerOptions<TRuntime = unknown> =
  | {
      runtime: TRuntime;
      runtimeProvider?: undefined;
    }
  | {
      runtime?: undefined;
      runtimeProvider: () => TRuntime;
    };
```

## `packages/agent/src/test-support/test-helpers.ts`

```typescript
export type MockUpdateCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  channel: string;
  distTag: string;
  cached: boolean;
  error: string | null;
};

export type PluginModuleShape = {
  [key: string]: unknown;
  default?: unknown;
  plugin?: unknown;
};

type MockResponsePayload<T> = {
  res: http.ServerResponse & {
    _status: number;
    _body: string;
    writeHead: (statusCode: number) => void;
  };
  getStatus: () => number;
  getJson: () => T;
};

type MockBodyChunk = string | Buffer;

export type MockRequestOptions = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  bodyChunks?: MockBodyChunk[];
  json?: boolean;
};
```

## `packages/agent/src/triggers/runtime.ts`

```typescript
type AutonomyServiceLike = {
  injectAutonomousInstruction?: (payload: {
    instructions: string;
    source: string;
    wakeMode: TriggerConfig["wakeMode"];
    triggerId: UUID;
    triggerTaskId: UUID;
    taskId?: UUID;
    roomId?: UUID;
  }) => Promise<void> | void;
};

  type TriggerAutonomyService = {
    getAutonomousRoomId?: () => UUID;
    injectAutonomousInstruction?: (payload: {
      instructions: string;
      source: string;
      wakeMode: TriggerConfig["wakeMode"];
      triggerId: UUID;
      triggerTaskId: UUID;
      taskId?: UUID;
      roomId?: UUID;
    }) => Promise<void> | void;
  };
```

## `packages/agent/src/triggers/types.ts`

```typescript
export type TriggerType = "interval" | "once" | "cron";

export type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";

export type TriggerLastStatus = "success" | "error" | "skipped";
```

## `packages/app-core/src/actions/character.ts`

```typescript
type MessageExampleGroup = {
  examples: Array<{ name: string; content: { text: string } }>;
};
```

## `packages/app-core/src/actions/check-balance.ts`

```typescript
type ValidChain = (typeof VALID_CHAINS)[number];
```

## `packages/app-core/src/actions/get-self-status.ts`

```typescript
type ValidModule = (typeof VALID_MODULES)[number];
```

## `packages/app-core/src/actions/lifecycle.ts`

```typescript
export type LifecycleAction = "start" | "stop" | "restart" | "reset";
```

## `packages/app-core/src/api/client.ts`

```typescript
export type AgentState =
  | "not_started"
  | "starting"
  | "running"
  | "stopped"
  | "restarting"
  | "error";

export type AgentAutomationMode = "connectors-only" | "full";

export type TradePermissionMode = WalletTradePermissionMode;

export type WebSocketConnectionState =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed";

export type ApiErrorKind = "timeout" | "network" | "http";

export type TriggerType = "interval" | "once" | "cron";

export type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";

export type TriggerLastStatus = "success" | "error" | "skipped";

export type ContentBlock = TextBlock | ConfigFormBlock | UiSpecBlock;

export type ConversationChannelType =
  | "DM"
  | "GROUP"
  | "VOICE_DM"
  | "VOICE_GROUP"
  | "API";

export type ConversationMode = "simple" | "power";

export type SecurityAuditSeverity = "info" | "warn" | "error" | "critical";

export type SecurityAuditEventType =
  | "sandbox_mode_transition"
  | "secret_token_replacement_outbound"
  | "secret_sanitization_inbound"
  | "privileged_capability_invocation"
  | "policy_decision"
  | "signing_request_submitted"
  | "signing_request_rejected"
  | "signing_request_approved"
  | "plugin_fallback_attempt"
  | "security_kill_switch"
  | "sandbox_lifecycle"
  | "fetch_proxy_error";

export type SecurityAuditStreamEvent =
  | {
      type: "snapshot";
      entries: SecurityAuditEntry[];
      totalBuffered: number;
    }
  | {
      type: "entry";
      entry: SecurityAuditEntry;
    };

export type StreamEventType =
  | "agent_event"
  | "heartbeat_event"
  | "training_event";

export type TrainingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TrainingEventKind =
  | "job_started"
  | "job_progress"
  | "job_log"
  | "job_completed"
  | "job_failed"
  | "job_cancelled"
  | "dataset_built"
  | "model_activated"
  | "model_imported";

export type VoiceProvider = "elevenlabs" | "simple-voice" | "edge";

export type VoiceMode = "cloud" | "own-key";

export type HyperscapeScriptedRole =
  | "combat"
  | "woodcutting"
  | "fishing"
  | "mining"
  | "balanced";

export type HyperscapeEmbeddedAgentControlAction =
  | "start"
  | "stop"
  | "pause"
  | "resume";

export type HyperscapeJsonValue =
  | string
  | number
  | boolean
  | null
  | HyperscapeJsonValue[]
  | { [key: string]: HyperscapeJsonValue };

export type HyperscapePosition =
  | [number, number, number]
  | {
      x: number;
      y: number;
      z: number;
    };

export type TrajectoryExportFormat = "json" | "csv" | "zip";

export type WsEventHandler = (data: Record<string, unknown>) => void;
```

## `packages/app-core/src/api/cloud-connection.ts`

```typescript
type CloudClientLike = {
  get?: (path: string) => Promise<unknown>;
};

export type CloudAuthLike = {
  isAuthenticated?: () => boolean;
  getUserId?: () => string | undefined;
  getOrganizationId?: () => string | undefined;
  getClient?: () => CloudClientLike | null;
} & Partial<

type RuntimeCloudLike = AgentRuntime & {
  agentId: string;
  character: {
    secrets?: Record<string, string | number | boolean>;
    settings?: Record<string, unknown>;
  };
  updateAgent?: (
    agentId: string,
    update: { secrets: Record<string, string | number | boolean> },
  ) => Promise<unknown>;
  setSetting?: (key: string, value: string | null) => unknown;
  getService?: (name: string) => unknown;
};

type CloudManagerLike = {
  disconnect?: () => Promise<void>;
} | null;

export type CloudConnectionSnapshot = {
  apiKey: string | undefined;
  authConnected: boolean;
  cloudAuth: CloudAuthLike | null;
  connected: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  organizationId: string | undefined;
  userId: string | undefined;
};

type CloudCreditsResponse = {
  balance: number | null;
  connected: boolean;
  authRejected?: boolean;
  critical?: boolean;
  error?: string;
  low?: boolean;
  topUpUrl?: string;
};
```

## `packages/app-core/src/api/cloud-routes.ts`

```typescript
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@miladyai/agent/api/cloud-routes";

type CloudRuntimeSecrets = Record<string, string | number | boolean>;

type RuntimeCloudLike = AgentRuntime & {
  agentId: string;
  character: {
    secrets?: CloudRuntimeSecrets;
  };
  updateAgent?: (
    agentId: string,
    update: { secrets: CloudRuntimeSecrets },
  ) => Promise<unknown>;
};

type TelemetrySpan = {
  success: (meta?: Record<string, unknown>) => void;
  failure: (meta?: Record<string, unknown>) => void;
};
```

## `packages/app-core/src/api/dev-console-log.ts`

```typescript
export type ReadDevConsoleLogResult =
  | { ok: true; body: string }
  | { ok: false; error: string };
```

## `packages/app-core/src/api/dev-stack.ts`

```typescript
export type MiladyDevStackPayload = {
  schema: typeof MILADY_DEV_STACK_SCHEMA;
  api: {
    /** Intended listen port (from MILADY_API_PORT / ELIZA_PORT). */
    listenPort: number;
    baseUrl: string;
  };
  desktop: {
    /** Vite or static renderer URL when desktop dev set MILADY_RENDERER_URL. */
    rendererUrl: string | null;
    /** Dashboard UI port when MILADY_PORT is set (desktop / Vite). */
    uiPort: number | null;
    /** Same base the Electrobun shell uses for API calls, when set. */
    desktopApiBase: string | null;
  };
  /**
   * When desktop dev enables MILADY_DESKTOP_SCREENSHOT_SERVER, the API proxies
   * a PNG from Electrobun (`GET …/api/dev/cursor-screenshot`, loopback only).
   */
  cursorScreenshot: {
    available: boolean;
    path: string | null;
  };
  /** Aggregated desktop dev child logs when dev-platform writes MILADY_DESKTOP_DEV_LOG_PATH. */
  desktopDevLog: {
    filePath: string | null;
    apiTailPath: string | null;
  };
  hints: string[];
};
```

## `packages/app-core/src/api/diagnostics-routes.ts`

```typescript
  type DiagnosticsRouteContext as AutonomousDiagnosticsRouteContext,
  handleDiagnosticsRoutes as handleAutonomousDiagnosticsRoutes,
} from "@miladyai/agent/api/diagnostics-routes";

type DiagnosticsRouteContext = Omit<
```

## `packages/app-core/src/api/server-wallet-trade.ts`

```typescript
  type WalletExportRejection as CompatWalletExportRejection,
  createHardenedExportGuard,
} from "./wallet-export-guard";

export type TradePermissionMode =
  | "user-sign-only"
  | "manual-local-key"
  | "agent-auto";
```

## `packages/app-core/src/api/server.ts`

```typescript
type PluginCategory =
  | "ai-provider"
  | "connector"
  | "streaming"
  | "database"
  | "app"
  | "feature";

type WorkbenchTodoResponse = {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
};

type TradePermissionMode = "user-sign-only" | "manual-local-key" | "agent-auto";
```

## `packages/app-core/src/api/steward-bridge.ts`

```typescript
  type PolicyResult,
  type SignTransactionInput,
} from "@stwd/sdk";

export type StewardExecutionResult =
  | StewardPendingApprovalResult
  | StewardSignedTransactionResult;
```

## `packages/app-core/src/api/subscription-routes.ts`

```typescript
  type SubscriptionRouteState as AutonomousSubscriptionRouteState,
  handleSubscriptionRoutes as handleAutonomousSubscriptionRoutes,
} from "@miladyai/agent/api/subscription-routes";

export type SubscriptionRouteState = Omit<
```

## `packages/app-core/src/api/training-routes.ts`

```typescript
export type TrainingRouteHelpers = RouteHelpers;
```

## `packages/app-core/src/api/trigger-routes.ts`

```typescript
  type TriggerRouteContext as AutonomousTriggerRouteContext,
  handleTriggerRoutes as handleAutonomousTriggerRoutes,
} from "@miladyai/agent/api/trigger-routes";

export type TriggerRouteHelpers = RouteHelpers;
```

## `packages/app-core/src/api/wallet-export-guard.ts`

```typescript
type UpstreamRejectionFn = (
  req: http.IncomingMessage,
  body: WalletExportRequestBody,
) => WalletExportRejection | null;
```

## `packages/app-core/src/autonomy/index.ts`

```typescript
export type AutonomyRunHealthStatus =
  | "ok"
  | "gap_detected"
  | "recovered"
  | "partial";

export type AutonomyRunHealthMap = Record<string, AutonomyRunHealth>;
```

## `packages/app-core/src/awareness/contributors/permissions.ts`

```typescript
type AutomationMode = "connectors-only" | "full";
```

## `packages/app-core/src/benchmark/replay-capture.ts`

```typescript
export type ReplayArtifact = z.infer<typeof ReplayArtifactSchema>;
```

## `packages/app-core/src/bridge/capacitor-bridge.ts`

```typescript
  type MiladyPlugins,
  type PluginCapabilities,
} from "./plugin-bridge";

type PluginInstance = Record<string, unknown>;
```

## `packages/app-core/src/bridge/electrobun-rpc.ts`

```typescript
export type ElectrobunRequestHandler = (params?: unknown) => Promise<unknown>;

export type ElectrobunMessageListener = (payload: unknown) => void;

export type DesktopBridgeTimeoutResult<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "timeout" }
  | { status: "rejected"; error: unknown };

  type RaceWinner =
    | { tag: "done"; value: T }
    | { tag: "reject"; error: unknown }
    | { tag: "timeout" };
```

## `packages/app-core/src/bridge/electrobun-runtime.ts`

```typescript
type ElectrobunBrowserWindow = Window & {
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
};
```

## `packages/app-core/src/bridge/native-plugins.ts`

```typescript
type NativePlugin = Record<string, unknown>;

export type GenericNativePlugin = NativePlugin;
```

## `packages/app-core/src/chat/index.ts`

```typescript
export type CommandCategory =
  | "agent"
  | "navigation"
  | "refresh"
  | "utility"
  | "desktop";
```

## `packages/app-core/src/cli/banner.ts`

```typescript
type BannerOptions = {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  commit?: string | null;
  richTty?: boolean;
};
```

## `packages/app-core/src/cli/doctor/checks.ts`

```typescript
export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export type CheckCategory = "system" | "config" | "network" | "storage";
```

## `packages/app-core/src/cli/parse-duration.ts`

```typescript
export type DurationMsParseOptions = {
  defaultUnit?: "ms" | "s" | "m" | "h" | "d";
};
```

## `packages/app-core/src/cli/profile.ts`

```typescript
export type CliProfileParseResult =
  | { ok: true; profile: string | null; argv: string[] }
  | { ok: false; error: string };
```

## `packages/app-core/src/cli/program/register.setup.ts`

```typescript
type PromptFn = (prompt: string) => Promise<string>;

type ProviderWizardOptions = {
  ask?: PromptFn;
  askSecret?: PromptFn;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
};
```

## `packages/app-core/src/cli/program/register.subclis.ts`

```typescript
type SubCliEntry = {
  name: string;
  description: string;
  register: (program: Command) => Promise<void> | void;
};
```

## `packages/app-core/src/components/AdvancedPageView.tsx`

```typescript
type SubTab =
```

## `packages/app-core/src/components/CharacterEditor.tsx`

```typescript
  type MiladyStylePreset,
  STYLE_PRESETS,
} from "../onboarding-presets";

  type VoicePreset,
} from "../voice/types";

  type CharacterRosterEntry,
  resolveRosterEntries,
} from "./CharacterRoster";

  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type OnboardingPreset = MiladyStylePreset;

  type VoiceConfig = Record<

        type TtsConfig = Record<string, Record<string, string> | undefined>;

        type MessagesConfig = { tts?: TtsConfig };
```

## `packages/app-core/src/components/CharacterRoster.tsx`

```typescript
export type CharacterRosterEntry = {
  id: string;
  name: string;
  avatarIndex: number;
  voicePresetId?: string;
  catchphrase?: string;
  greetingAnimation?: string;
  preset: MiladyStylePreset;
};
```

## `packages/app-core/src/components/ChatComposer.tsx`

```typescript
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
} from "react";

type ChatComposerVariant = "default" | "game-modal";
```

## `packages/app-core/src/components/ChatModalView.tsx`

```typescript
type ChatModalLayoutVariant = "full-overlay" | "companion-dock";
```

## `packages/app-core/src/components/ChatView.tsx`

```typescript
  type ConversationChannelType,
  type ConversationMessage,
  client,
  type ImageAttachment,
  type VoiceConfig,
} from "@miladyai/app-core/api";

  type VoiceCaptureMode,
  type VoicePlaybackStartEvent,
} from "@miladyai/app-core/hooks";

  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ChatViewVariant = "default" | "game-modal";
```

## `packages/app-core/src/components/CloudSourceControls.tsx`

```typescript
export type CloudSourceMode = "cloud" | "own-key";
```

## `packages/app-core/src/components/CodingAgentSettingsSection.tsx`

```typescript
type AgentTab = "claude" | "gemini" | "codex" | "aider";

type AiderProvider = "anthropic" | "openai" | "google";

type ApprovalPreset = "readonly" | "standard" | "permissive" | "autonomous";

type AgentSelectionStrategy = "fixed" | "ranked";
```

## `packages/app-core/src/components/CompanionSceneHost.tsx`

```typescript
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

type TouchPoint = {
  x: number;
  y: number;
};
```

## `packages/app-core/src/components/ConfigPageView.tsx`

```typescript
  type WalletRpcSelections,
} from "@miladyai/agent/contracts/wallet";

  type JsonSchemaObject,
} from "../config";

type RpcProviderOption<T extends string> = {
  id: T;
  label: string;
};

type TranslateOptions = Record<string, unknown>;

type TranslateFn = (key: string, options?: TranslateOptions) => string;

type RpcFieldDefinition = {
  configKey: string;
  label: string;
  isSet: boolean;
};

type RpcFieldGroup = ReadonlyArray<RpcFieldDefinition>;

type RpcSectionConfigMap = Record<string, RpcFieldGroup>;

type CloudRpcStatusProps = {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  topUpUrl: string | null;
  loginBusy: boolean;
  onLogin: () => void;
};

type RpcSectionCloudProps = CloudRpcStatusProps;

type RpcSectionProps<T extends string> = {
  title: string;
  description: string;
  options: readonly RpcProviderOption<T>[];
  selectedProvider: T;
  onSelect: (provider: T) => void;
  providerConfigs: RpcSectionConfigMap;
  rpcFieldValues: Record<string, string>;
  onRpcFieldChange: (key: string, value: unknown) => void;
  cloud: RpcSectionCloudProps;
  containerClassName: string;
  t: TranslateFn;
};

type CloudServiceKey = "inference" | "rpc" | "media" | "tts" | "embeddings";
```

## `packages/app-core/src/components/ConversationsSidebar.tsx`

```typescript
type ConversationsSidebarVariant = "default" | "game-modal";
```

## `packages/app-core/src/components/CustomActionEditor.tsx`

```typescript
  type CustomActionDef,
  type CustomActionHandler,
  client,
} from "@miladyai/app-core/api";

type HandlerType = "http" | "shell" | "code";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
```

## `packages/app-core/src/components/DatabaseView.tsx`

```typescript
  type ColumnInfo,
  client,
  type DatabaseStatus,
  type QueryResult,
  type TableInfo,
  type TableRowsResponse,
} from "../api";

type DbView = "tables" | "query";

type SortDir = "asc" | "desc" | null;
```

## `packages/app-core/src/components/ElizaCloudDashboard.tsx`

```typescript
  type CloudBillingCheckoutResponse,
  type CloudBillingSettings,
  type CloudBillingSummary,
  type CloudCompatAgent,
  client,
} from "../api";

type AutoTopUpFormAction =
  | { type: "hydrate"; next: AutoTopUpFormState; force?: boolean }
  | { type: "setAmount"; value: string }
  | { type: "setEnabled"; value: boolean }
  | { type: "setThreshold"; value: string };
```

## `packages/app-core/src/components/FlaminaGuide.tsx`

```typescript
type GuideContent = {
  title: string;
  description: string;
  whenToUse: string;
  skipEffect: string;
  characterImpact: string;
  recommended: string;
};
```

## `packages/app-core/src/components/HeartbeatsView.tsx`

```typescript
type TriggerType = "interval" | "once" | "cron";

type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number | boolean | null | undefined>,
) => string;

type DurationUnit = (typeof DURATION_UNITS)[number]["unit"];
```

## `packages/app-core/src/components/KnowledgeView.tsx`

```typescript
export type KnowledgeUploadFile = File & {
  webkitRelativePath?: string;
};

type KnowledgeUploadOptions = {
  includeImageDescriptions: boolean;
};

        type PreparedUpload = {
          filename: string;
          request: {
            content: string;
            filename: string;
            contentType: string;
            metadata: {
              includeImageDescriptions: boolean;
              relativePath: string | undefined;
            };
          };
          requestBytes: number;
        };
```

## `packages/app-core/src/components/LanguageDropdown.tsx`

```typescript
export type TranslatorFn = (key: string) => string;
```

## `packages/app-core/src/components/MediaGalleryView.tsx`

```typescript
type MediaType = "all" | "image" | "video" | "audio";
```

## `packages/app-core/src/components/MediaSettingsSection.tsx`

```typescript
  type AudioGenProvider,
  client,
  type ImageProvider,
  type MediaConfig,
  type MediaMode,
  type VideoProvider,
  type VisionProvider,
} from "../api";

type MediaCategory = "image" | "video" | "audio" | "vision" | "voice";
```

## `packages/app-core/src/components/MessageContent.tsx`

```typescript
  type JsonSchemaObject,
  type PatchOp,
  UiRenderer,
  type UiSpec,
} from "@miladyai/app-core/config";

type Segment =
  | { kind: "text"; text: string }
  | { kind: "config"; pluginId: string }
  | { kind: "ui-spec"; spec: UiSpec; raw: string };
```

## `packages/app-core/src/components/PermissionsSection.tsx`

```typescript
  type AllPermissionsState,
  client,
  type PermissionState,
  type PermissionStatus,
  type PluginInfo,
  type SystemPermissionId,
} from "../api";

type DesktopMediaPermissionId = Extract<
```

## `packages/app-core/src/components/PluginsView.tsx`

```typescript
  type JsonSchemaObject,
} from "../config";

type StatusFilter = "all" | "enabled" | "disabled";

type PluginsViewMode =
  | "all"
  | "all-social"
  | "connectors"
  | "streaming"
  | "social";

type SubgroupTag = { id: string; label: string; count: number };
```

## `packages/app-core/src/components/RuntimeView.tsx`

```typescript
  type RuntimeDebugSnapshot,
  type RuntimeOrderItem,
  type RuntimeServiceOrderItem,
} from "../api";

type RuntimeSectionKey =
  | "runtime"
  | "actions"
  | "providers"
  | "plugins"
  | "services"
  | "evaluators";
```

## `packages/app-core/src/components/SecretsView.tsx`

```typescript
type GroupedSecrets = {
  category: string;
  label: string;
  secrets: SecretInfo[];
};
```

## `packages/app-core/src/components/SkillsView.tsx`

```typescript
type InstallTab = "search" | "url";
```

## `packages/app-core/src/components/StripeEmbeddedCheckout.tsx`

```typescript
type StripeFactory = (publishableKey: string) => StripeInstance;
```

## `packages/app-core/src/components/ThemeToggle.tsx`

```typescript
export type ThemeTranslatorFn = (key: string) => string;
```

## `packages/app-core/src/components/TrajectoriesView.tsx`

```typescript
  type TrajectoryConfig,
  type TrajectoryListResult,
  type TrajectoryRecord,
  type TrajectoryStats,
} from "@miladyai/app-core/api";

type StatusFilter = "" | "active" | "completed" | "error";
```

## `packages/app-core/src/components/VectorBrowserView.tsx`

```typescript
type ViewMode = "list" | "graph" | "3d";
```

## `packages/app-core/src/components/VrmStage.tsx`

```typescript
  type AppEmoteEventDetail,
  STOP_EMOTE_EVENT,
} from "@miladyai/app-core/events";

type TranslateFn = (key: string) => string;
```

## `packages/app-core/src/components/apps/extensions/types.ts`

```typescript
export type AppDetailExtensionComponent =
```

## `packages/app-core/src/components/avatar/VrmAnimationLoader.ts`

```typescript
export type AnimationLoaderContext = {
  /** Returns `true` if the loading sequence was aborted (engine disposed). */
  isAborted: () => boolean;
  /** Returns `true` if `vrm` is still the active model in the engine. */
  isCurrentVrm: (vrm: VRM) => boolean;
};
```

## `packages/app-core/src/components/avatar/VrmBlinkController.ts`

```typescript
type BlinkPhase = "idle" | "closing" | "closed" | "opening";
```

## `packages/app-core/src/components/avatar/VrmCameraManager.ts`

```typescript
export type CameraProfile = "chat" | "companion";

export type InteractionMode = "free" | "orbitZoom";

export type CameraAnimationConfig = {
  enabled: boolean;
  swayAmplitude: number;
  bobAmplitude: number;
  rotationAmplitude: number;
  speed: number;
};
```

## `packages/app-core/src/components/avatar/VrmEngine.ts`

```typescript
  type VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";

  type AnimationLoaderContext,
  loadEmoteClip,
  loadIdleClip,
} from "./VrmAnimationLoader";

  type CameraAnimationConfig,
  type CameraProfile,
  type InteractionMode,
  VrmCameraManager,
} from "./VrmCameraManager";

export type VrmEngineState = {
  vrmLoaded: boolean;
  vrmName: string | null;
  loadError: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
  revealStarted: boolean;
  loadingProgress?: number;
};

type DebugVector3 = {
  x: number;
  y: number;
  z: number;
};

type DebugBounds = {
  min: DebugVector3;
  max: DebugVector3;
  center: DebugVector3;
  size: DebugVector3;
};

export type VrmEngineDebugInfo = {
  initialized: boolean;
  rendererBackend: RendererBackend;
  cameraProfile: CameraProfile;
  worldUrl: string | null;
  sceneChildren: string[];
  camera: {
    parentName: string | null;
    position: DebugVector3 | null;
    rotation: DebugVector3 | null;
    fov: number | null;
    lookAtTarget: DebugVector3;
  };
  avatar: {
    loaded: boolean;
    ready: boolean;
    parentName: string | null;
    position: DebugVector3 | null;
    scale: DebugVector3 | null;
    bounds: DebugBounds | null;
  };
  world: {
    loaded: boolean;
    parentName: string | null;
    position: DebugVector3 | null;
    scale: DebugVector3 | null;
    bounds: DebugBounds | null;
    rawBounds: DebugBounds | null;
  };
  spark: {
    attached: boolean;
    parentName: string | null;
    renderOrder: number | null;
  };
};

type UpdateCallback = () => void;

type RendererBackend = "webgl" | "webgpu";

type RendererPreference = "auto" | "webgl";

type AnimationMixerFinishedEvent = {
  type: "finished";
  action: THREE.AnimationAction;
  direction: number;
};

type ElectrobunRuntimeWindow = Window & {
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
};

type RendererLike = Pick<

type TeleportFallbackShader = {
  uniforms: {
    uTeleportProgress: { value: number };
  };
};

type WorldRevealController = {
  mesh: SparkSplatMesh;
  progressUniform: { value: number };
  mode: "reveal" | "hide";
  radius: number;
};

type WorldRevealState = {
  controller: WorldRevealController;
  incoming: WorldRevealController;
  outgoing: WorldRevealController | null;
  progress: number;
  duration: number;
  waitingForVrm: boolean;
  syncToTeleport: boolean;
};

type TeleportSparkleParticle = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  baseAngle: number;
  baseRadius: number;
  height: number;
  start: number;
  duration: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  baseSize: number;
};

type TeleportSparkleSystem = {
  group: THREE.Group;
  particles: TeleportSparkleParticle[];
};
```

## `packages/app-core/src/components/avatar/VrmTeleportEffect.ts`

```typescript
type TslNodeLike = {
  add(value: unknown): unknown;
  mul(value: unknown): unknown;
};

type TeleportFallbackShader = {
  uniforms: { uTeleportProgress: { value: number } };
  isOutgoing?: boolean;
};

type TeleportSparkleParticle = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  baseAngle: number;
  baseRadius: number;
  height: number;
  start: number;
  duration: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  baseSize: number;
};

type TeleportSparkleSystem = {
  group: THREE.Group;
  particles: TeleportSparkleParticle[];
};
```

## `packages/app-core/src/components/avatar/VrmViewer.tsx`

```typescript
  type CameraProfile,
  type InteractionMode,
  VrmEngine,
  type VrmEngineDebugInfo,
  type VrmEngineState,
} from "./VrmEngine";

export type VrmViewerProps = {
  /** When false the loaded scene stays resident but the render loop is paused */
  active?: boolean;
  /** Path to the VRM file to load (default: bundled Miwaifus #1) */
  vrmPath?: string;
  mouthOpen: number;
  /** When true the engine generates mouth animation internally */
  isSpeaking?: boolean;
  /** Enable drag-rotate + wheel/pinch zoom camera controls */
  interactive?: boolean;
  /** Camera profile preset (chat default, companion for hero-stage framing) */
  cameraProfile?: CameraProfile;
  /** Interaction behavior for camera controls */
  interactiveMode?: InteractionMode;
  /** Optional Gaussian splat world behind the avatar */
  worldUrl?: string;
  /** User Settings: quality / balanced / efficiency for VRM power policy. */
  companionVrmPowerMode?: CompanionVrmPowerMode;
  /** When to apply ~half display FPS (independent of DPR/shadows/Spark). */
  companionHalfFramerateMode?: CompanionHalfFramerateMode;
  /**
   * When true and the document is hidden, keep the loop running and hide only
   * the splat world + Spark backdrop (see `VrmEngine.setMinimalBackgroundMode`).
   */
  companionAnimateWhenHidden?: boolean;
  /** Enable springy drag/touch camera offset instead of orbit controls */
  pointerParallax?: boolean;
  onEngineState?: (state: VrmEngineState) => void;
  onEngineReady?: (engine: VrmEngine) => void;
  onRevealStart?: () => void;
};

type VrmEngineDebugRegistryEntry = {
  id: string;
  role: "world-stage" | "chat-avatar";
  vrmPath: string;
  worldUrl: string | null;
  engine: VrmEngine;
  getDebugInfo: () => VrmEngineDebugInfo;
};
```

## `packages/app-core/src/components/avatar/vrm-desktop-energy.ts`

```typescript
export type VrmEngineBatteryPolicyTarget = {
  isInitialized(): boolean;
  /** DPR cap + shadow + Spark tuning — independent of frame cadence. */
  setLowPowerRenderMode(enabled: boolean): void;
  /** ~Half display refresh: skip alternate ticks; uses `Clock` accumulation. */
  setHalfFramerateMode(enabled: boolean): void;
};

export type RefreshVrmDesktopBatteryPixelPolicyOptions = {
  /** User Settings: quality / balanced / efficiency (default `balanced`). */
  companionVrmPowerMode?: CompanionVrmPowerMode;
  /**
   * When to apply half-FPS: never, whenever pixel low-power is active, or always.
   * Default `when_saving_power` matches historic “bundled” behavior.
   */
  companionHalfFramerateMode?: CompanionHalfFramerateMode;
};
```

## `packages/app-core/src/components/chainConfig.ts`

```typescript
export type ChainKey =
  | "bsc"
  | "avax"
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon";
```

## `packages/app-core/src/components/companion-shell-styles.ts`

```typescript
export type TabFlags = ReturnType<typeof tabFlags>;
```

## `packages/app-core/src/components/companion/ShellHeaderControls.tsx`

```typescript
  type LucideIcon,
  MessageCirclePlus,
  Monitor,
  PencilLine,
  Smartphone,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";

type ShellHeaderTranslator = (key: string) => string;
```

## `packages/app-core/src/components/companion/resolve-companion-inference-notice.ts`

```typescript
export type CompanionInferenceNotice =
  | { kind: "cloud"; variant: "danger" | "warn"; tooltip: string }
  | { kind: "settings"; variant: "warn"; tooltip: string };
```

## `packages/app-core/src/components/companion/walletUtils.ts`

```typescript
export type TranslatorFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export type WalletPortfolioChainFilter =
  | "all"
  | "bsc"
  | "evm"
  | "solana"
  | "avax"
  | (string & {});

export type WalletTokenRow = {
  key: string;
  symbol: string;
  name: string;
  chain: string;
  chainKey: Exclude<WalletPortfolioChainFilter, "all">;
  assetAddress: string | null;
  isNative: boolean;
  valueUsd: number;
  balance: string;
  logoUrl: string | null;
};

export type WalletCollectibleRow = {
  key: string;
  chain: string;
  chainKey: Exclude<WalletPortfolioChainFilter, "all">;
  name: string;
  collectionName: string;
  imageUrl: string | null;
};

export type WalletRecentTrade = {
  hash: string;
  side: "buy" | "sell";
  tokenAddress: string;
  amount: string;
  inputSymbol: string;
  outputSymbol: string;
  createdAt: number;
  status: BscTradeTxStatusResponse["status"];
  confirmations: number;
  nonce: number | null;
  reason: string | null;
  explorerUrl: string;
};

export type WalletRecentFilter = "all" | BscTradeTxStatusResponse["status"];

export type TokenMetadata = {
  symbol: string;
  name: string;
  logoUrl: string | null;
};

export type DexScreenerTokenRef = {
  address?: string;
  symbol?: string;
  name?: string;
};

export type DexScreenerPair = {
  chainId?: string;
  baseToken?: DexScreenerTokenRef;
  quoteToken?: DexScreenerTokenRef;
  info?: {
    imageUrl?: string;
  };
};

export type DexScreenerTokenResponse = {
  pairs?: DexScreenerPair[];
};
```

## `packages/app-core/src/components/format.ts`

```typescript
type ByteSizeFormatterOptions = {
  /**
   * Fallback string for invalid or negative byte values.
   */
  unknownLabel?: string;
  /**
   * Precision for KB / MB / GB / TB values.
   */
  kbPrecision?: number;
  mbPrecision?: number;
  gbPrecision?: number;
  tbPrecision?: number;
};

type DateFormatOptions = {
  /**
   * Fallback string for empty/invalid dates.
   */
  fallback?: string;
  /**
   * Optional locale override.
   */
  locale?: string;
};

type DurationFormatOptions = {
  /**
   * Fallback string for non-positive/invalid durations.
   */
  fallback?: string;
};
```

## `packages/app-core/src/components/inventory/InventoryToolbar.tsx`

```typescript
type InventoryToolbarStateKey = "inventoryView" | "inventorySort";

type InventorySort = AppState["inventorySort"];

type InventoryView = AppState["inventoryView"];
```

## `packages/app-core/src/components/knowledge-upload-image.ts`

```typescript
export type KnowledgeImageUploadFile = File & {
  webkitRelativePath?: string;
};

export type KnowledgeImageCompressionPlatform = {
  isAvailable: () => boolean;
  loadImageSource: (file: File) => Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
  }>;
  renderBlob: (input: {
    source: CanvasImageSource;
    width: number;
    height: number;
    outputType: string;
    quality: number;
  }) => Promise<Blob>;
};
```

## `packages/app-core/src/components/onboarding/RpcStep.tsx`

```typescript
type RpcMode = "" | "cloud" | "byok";
```

## `packages/app-core/src/components/onboarding/connection/ConnectionUiRoot.tsx`

```typescript
export type ConnectionUiSharedProps = {
  dispatch: (event: ConnectionEvent) => void;
  onTransitionEffect: (effect: ConnectionEffect) => void;
  sortedProviders: ProviderOption[];
  getProviderDisplay: (provider: ProviderOption) => {
    name: string;
    description?: string;
  };
  getCustomLogo: (id: string) =>
    | {
        logoDark?: string;
        logoLight?: string;
      }
    | undefined;
  getDetectedLabel: (providerId: string) => string | null;
};
```

## `packages/app-core/src/components/onboarding/connection/useAdvanceOnboardingWhenElizaCloudOAuthConnected.ts`

```typescript
type ElizaCloudTab = AppState["onboardingElizaCloudTab"];
```

## `packages/app-core/src/components/permissions/StreamingPermissions.tsx`

```typescript
type MediaPermissionState = "granted" | "denied" | "prompt" | "unknown";

type StreamingPermissionMode = "mobile" | "web";
```

## `packages/app-core/src/components/release-center/types.ts`

```typescript
export type AppReleaseStatus = {
  currentVersion?: string;
  latestVersion?: string | null;
  channel?: string | null;
  lastCheckAt?: string | number | null;
  updateAvailable?: boolean;
};

export type DesktopBuildInfo = {
  platform: string;
  arch: string;
  defaultRenderer: "native" | "cef";
  availableRenderers: Array<"native" | "cef">;
  cefVersion?: string;
  bunVersion?: string;
  runtime?: Record<string, unknown>;
};

export type DesktopUpdaterSnapshot = {
  currentVersion: string;
  currentHash?: string;
  channel?: string;
  baseUrl?: string;
  appBundlePath?: string | null;
  canAutoUpdate: boolean;
  autoUpdateDisabledReason?: string | null;
  updateAvailable: boolean;
  updateReady: boolean;
  latestVersion?: string | null;
  latestHash?: string | null;
  error?: string | null;
  lastStatus?: {
    status: string;
    message: string;
    timestamp: number;
  } | null;
};

export type DesktopSessionCookie = {
  name: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  session?: boolean;
  expirationDate?: number;
};

export type DesktopSessionSnapshot = {
  partition: string;
  persistent: boolean;
  cookieCount: number;
  cookies: DesktopSessionCookie[];
};

export type DesktopReleaseNotesWindowInfo = {
  url: string;
  windowId: number | null;
  webviewId: number | null;
};

export type WebGpuBrowserStatus = {
  available: boolean;
  reason: string;
  renderer: string;
  chromeBetaPath: string | null;
  downloadUrl: string | null;
};

export type WgpuTagElement = HTMLElement & {
  runTest?: () => void;
  toggleTransparent?: (transparent?: boolean) => void;
  togglePassthrough?: (enabled?: boolean) => void;
  toggleHidden?: (hidden?: boolean) => void;
  on?: (event: "ready", listener: (event: CustomEvent) => void) => void;
  off?: (event: "ready", listener: (event: CustomEvent) => void) => void;
};
```

## `packages/app-core/src/components/stream/StreamSettings.tsx`

```typescript
type Section = "channel" | "overlays" | "source";
```

## `packages/app-core/src/components/stream/helpers.ts`

```typescript
export type AgentMode = "gaming" | "terminal" | "chatting" | "idle";

export type StreamSourceType = "stream-tab" | "game" | "custom-url";
```

## `packages/app-core/src/components/vector-browser-three.ts`

```typescript
type WebGpuRendererCtor = new (options?: {
  antialias?: boolean;
}) => THREE.WebGLRenderer & { init?: () => Promise<void> };
```

## `packages/app-core/src/config/config-catalog.ts`

```typescript
export type ValidationFunction = (
  value: unknown,
  args?: Record<string, unknown>,
) => boolean;

export type ActionHandler<
  TParams = Record<string, unknown>,
  TResult = unknown,
> = (
  params: TParams,
  state: Record<string, unknown>,
) => Promise<TResult> | TResult;

export type FieldRenderer = (props: FieldRenderProps) => ReactNode;
```

## `packages/app-core/src/config/config-paths.ts`

```typescript
type PathNode = Record<string, unknown>;
```

## `packages/app-core/src/config/runtime-overrides.ts`

```typescript
type OverrideTree = Record<string, unknown>;
```

## `packages/app-core/src/config/telegram-custom-commands.ts`

```typescript
export type TelegramCustomCommandInput = {
  command?: string | null;
  description?: string | null;
};

export type TelegramCustomCommandIssue = {
  index: number;
  field: "command" | "description";
  message: string;
};
```

## `packages/app-core/src/config/ui-renderer.tsx`

```typescript
type ComponentFn = (
  props: Record<string, unknown>,
  children: React.ReactNode,
  ctx: UiRenderContext,
  el: UiElement,
) => React.ReactNode;
```

## `packages/app-core/src/config/ui-spec.ts`

```typescript
export type DynamicProp<T = string> = T | { $path: string };

export type VisibilityOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

export type VisibilityCondition =
  | PathVisibility
  | AuthVisibility
  | AndVisibility
  | OrVisibility
  | NotVisibility;

export type BuiltinValidator =
  | "required"
  | "email"
  | "minLength"
  | "maxLength"
  | "pattern"
  | "min"
  | "max";

export type UiEventBindings = Record<string, UiAction>;

export type UiComponentType =

export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };
```

## `packages/app-core/src/config/zod-schema.agent-runtime.ts`

```typescript
type ToolPolicyConflictValue = {
  allow?: string[];
  alsoAllow?: string[];
};
```

## `packages/app-core/src/config/zod-schema.providers-core.ts`

```typescript
export type TwitterConfig = z.infer<typeof TwitterConfigSchema>;
```

## `packages/app-core/src/diagnostics/integration-observability.ts`

```typescript
export type IntegrationBoundary = "cloud" | "wallet" | "marketplace" | "mcp";

export type IntegrationOutcome = "success" | "failure";
```

## `packages/app-core/src/events/index.ts`

```typescript
export type ElizaDocumentEventName =
  | typeof COMMAND_PALETTE_EVENT
  | typeof EMOTE_PICKER_EVENT
  | typeof STOP_EMOTE_EVENT
  | typeof AGENT_READY_EVENT
  | typeof BRIDGE_READY_EVENT
  | typeof SHARE_TARGET_EVENT
  | typeof TRAY_ACTION_EVENT
  | typeof APP_RESUME_EVENT
  | typeof APP_PAUSE_EVENT
  | typeof CONNECT_EVENT;

export type ElizaWindowEventName =
  | typeof VOICE_CONFIG_UPDATED_EVENT
  | typeof CHAT_AVATAR_VOICE_EVENT
  | typeof APP_EMOTE_EVENT
  | typeof VRM_TELEPORT_COMPLETE_EVENT
  | typeof SELF_STATUS_SYNC_EVENT;

export type ElizaEventName = ElizaDocumentEventName | ElizaWindowEventName;

export type AppDocumentEventName = ElizaDocumentEventName;

export type AppWindowEventName = ElizaWindowEventName;

export type AppEventName = ElizaEventName;
```

## `packages/app-core/src/hooks/useContextMenu.ts`

```typescript
  type SavedCustomCommand,
} from "../chat";

export type CustomCommand = SavedCustomCommand;
```

## `packages/app-core/src/hooks/useVoiceChat.ts`

```typescript
  type TalkModeErrorEvent,
  type TalkModeStateEvent,
  type TalkModeTranscriptEvent,
} from "../bridge/native-plugins";

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechSegmentKind = "full" | "first-sentence" | "remainder";

type SpeechProviderKind = "elevenlabs" | "browser";

export type VoiceCaptureMode = "idle" | "compose" | "push-to-talk";
```

## `packages/app-core/src/hooks/useWhatsAppPairing.ts`

```typescript
export type WhatsAppPairingStatus =
  | "idle"
  | "initializing"
  | "waiting_for_qr"
  | "connected"
  | "disconnected"
  | "timeout"
  | "error";
```

## `packages/app-core/src/i18n/index.ts`

```typescript
  type MessageDict,
  UI_LANGUAGES,
  type UiLanguage,
} from "./messages";

export type TranslationVars = Record<

  type MessageDict,
  UI_LANGUAGES,
  type UiLanguage,
};
```

## `packages/app-core/src/i18n/messages.ts`

```typescript
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export type MessageDict = Record<string, string>;
```

## `packages/app-core/src/navigation/index.ts`

```typescript
export type Tab =
  | "chat"
  | "companion"
  | "stream"
  | "apps"
  | "character"
  | "character-select"
  | "wallets"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "actions"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "lifo"
  | "voice"
  | "runtime"
  | "database"
  | "desktop"
  | "settings"
  | "logs"
  | "security";
```

## `packages/app-core/src/onboarding-presets.ts`

```typescript
export type MiladyStylePreset = StylePreset & {
  name: string;
  avatarIndex: number;
  voicePresetId?: string;
  greetingAnimation?: string;
  topics?: string[];
};

type CharacterPreset = {
  id: string;
  name: string;
  catchphrase: string;
  description: string;
  avatarIndex: number;
  voicePresetId?: string;
};
```

## `packages/app-core/src/onboarding/types.ts`

```typescript
export type ConnectionScreen =
  | "hosting"
  | "remoteBackend"
  | "elizaCloud_preProvider"
  | "providerGrid"
  | "providerDetail";

export type ConnectionFlowSnapshot = Pick<

export type ConnectionStatePatch = Partial<{
  onboardingRunMode: AppState["onboardingRunMode"];
  onboardingCloudProvider: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingPrimaryModel: string;
  onboardingRemoteError: string | null;
  onboardingRemoteConnecting: boolean;
  onboardingSubscriptionTab: AppState["onboardingSubscriptionTab"];
  onboardingElizaCloudTab: AppState["onboardingElizaCloudTab"];
}>;

export type ConnectionEvent =
  | { type: "forceCloudBootstrap" }
  | { type: "selectLocalHosting" }
  | { type: "selectRemoteHosting" }
  | { type: "selectElizaCloudHosting" }

export type ConnectionEffect = "useLocalBackend";

export type ConnectionTransitionResult =
  | { kind: "patch"; patch: ConnectionStatePatch }
  | { kind: "effect"; effect: ConnectionEffect };

export type ConnectionUiSpec = {
  screen: ConnectionScreen;
  effectiveRunMode: "local" | "cloud" | "";
  showProviderSelection: boolean;
  showHostingLocalCard: boolean;
  forceCloud: boolean;
  /** Set when screen is providerDetail */
  providerId: string;
  elizaCloudTab: AppState["onboardingElizaCloudTab"];
  subscriptionTab: AppState["onboardingSubscriptionTab"];
};

export type ConnectionTransitionDocRow = {
  from: ConnectionScreen;
  event: ConnectionEvent["type"];
  to: ConnectionScreen | "effect:useLocalBackend" | "same";
  note?: string;
};
```

## `packages/app-core/src/platform/cloud-preference-patch.ts`

```typescript
type ClientLike = Pick<typeof appClient, "getCloudStatus" | "getConfig"> & {
  getCloudCredits?: typeof appClient.getCloudCredits;
  [key: string | symbol]: unknown;
};

type StorageConfig = Record<string, unknown>;

type PatchState = {
  getConfig: ClientLike["getConfig"];
  getCloudStatus: ClientLike["getCloudStatus"];
  getCloudCredits?: ClientLike["getCloudCredits"];
};
```

## `packages/app-core/src/platform/desktop-permissions-client.ts`

```typescript
type SystemPermissionId = Parameters<typeof appClient.getPermission>[0];

type PermissionState = Awaited<ReturnType<typeof appClient.getPermission>>;

type AllPermissionsState = Awaited<ReturnType<typeof appClient.getPermissions>>;

type ClientLike = Pick<

type PatchState = {
  getPermissions: ClientLike["getPermissions"];
  getPermission: ClientLike["getPermission"];
  requestPermission: ClientLike["requestPermission"];
  openPermissionSettings: ClientLike["openPermissionSettings"];
  refreshPermissions: ClientLike["refreshPermissions"];
  setShellEnabled: ClientLike["setShellEnabled"];
  isShellEnabled: ClientLike["isShellEnabled"];
};
```

## `packages/app-core/src/platform/lifo.ts`

```typescript
type LocationLike = {
  search?: string;
  hash?: string;
};
```

## `packages/app-core/src/platform/onboarding-reset.ts`

```typescript
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type HistoryLike = Pick<History, "replaceState">;

type OnboardingStatus = { complete: boolean } & Record<string, unknown>;

type ClientLike = Pick<

type PatchState = {
  getConfig: ClientLike["getConfig"];
  getOnboardingStatus: ClientLike["getOnboardingStatus"];
  submitOnboarding: ClientLike["submitOnboarding"];
};
```

## `packages/app-core/src/platform/types.ts`

```typescript
export type PermissionsClientLike = Pick<

export type PermissionsPatchState = {
  getPermissions: PermissionsClientLike["getPermissions"];
  getPermission: PermissionsClientLike["getPermission"];
  requestPermission: PermissionsClientLike["requestPermission"];
  openPermissionSettings: PermissionsClientLike["openPermissionSettings"];
  refreshPermissions: PermissionsClientLike["refreshPermissions"];
  setShellEnabled: PermissionsClientLike["setShellEnabled"];
  isShellEnabled: PermissionsClientLike["isShellEnabled"];
};

export type OnboardingClientLike = Pick<

export type OnboardingPatchState = {
  getConfig: OnboardingClientLike["getConfig"];
  getOnboardingStatus: OnboardingClientLike["getOnboardingStatus"];
  submitOnboarding: OnboardingClientLike["submitOnboarding"];
};

export type CloudPreferenceClientLike = Pick<

export type CloudPreferencePatchState = {
  getConfig: CloudPreferenceClientLike["getConfig"];
  getCloudStatus: CloudPreferenceClientLike["getCloudStatus"];
  getCloudCredits?: CloudPreferenceClientLike["getCloudCredits"];
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type HistoryLike = Pick<History, "replaceState">;
```

## `packages/app-core/src/platform/window-shell.ts`

```typescript
export type DetachedSurfaceTab =
  | "chat"
  | "browser"
  | "release"
  | "triggers"
  | "plugins"
  | "connectors"
  | "cloud";

export type WindowShellRoute =
  | { mode: "main" }
  | { mode: "settings"; tab?: string }
  | { mode: "surface"; tab: "browser"; browse?: string }
  | {
      mode: "surface";
      tab: Exclude<DetachedSurfaceTab, "browser">;
    };

type HistoryLike = Pick<History, "replaceState">;
```

## `packages/app-core/src/providers/local-models.ts`

```typescript
export type ModelType = "vision" | "llm" | "tts" | "stt" | "embedding";
```

## `packages/app-core/src/runtime/boot-progress.ts`

```typescript
export type BootPhaseId = (typeof BOOT_PHASES)[number]["id"];
```

## `packages/app-core/src/runtime/eliza.ts`

```typescript
  type AgentRuntime,
  AutonomyService,
  ChannelType,
  logger,
  ModelType,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";

  type BootElizaRuntimeOptions,
  type StartElizaOptions,
  applyCloudConfigToEnv as upstreamApplyCloudConfigToEnv,
  bootElizaRuntime as upstreamBootElizaRuntime,
  buildCharacterFromConfig as upstreamBuildCharacterFromConfig,
  CHANNEL_PLUGIN_MAP as upstreamChannelPluginMap,
  collectPluginNames as upstreamCollectPluginNames,
  configureLocalEmbeddingPlugin as upstreamConfigureLocalEmbeddingPlugin,
  shutdownRuntime as upstreamShutdownRuntime,
  startEliza as upstreamStartEliza,
} from "@miladyai/agent/runtime/eliza";

type TtsModelHandler = (
  runtime: AgentRuntime,
  input: unknown,
) => Promise<unknown>;

type RuntimeWithModelRegistration = AgentRuntime & {
  getModel: (modelType: string | number) => TtsModelHandler | undefined;
  registerModel: (
    modelType: string | number,
    handler: TtsModelHandler,
    provider: string,
    priority?: number,
  ) => void;
};
```

## `packages/app-core/src/runtime/embedding-manager-support.ts`

```typescript
export type EmbeddingProgressCallback = (
  phase: "checking" | "downloading" | "loading" | "ready",
  detail?: string,
) => void;

export type DownloadProgressCallback = (
  downloaded: number,
  total: number | null,
) => void;
```

## `packages/app-core/src/runtime/embedding-manager.ts`

```typescript
  type EmbeddingManagerConfig,
  type EmbeddingManagerStats,
  type EmbeddingProgressCallback,
  ensureModel,
  getErrorMessage,
  getLogger,
  isCorruptedModelLoadError,
  safeUnlink,
} from "./embedding-manager-support.js";

type LlamaInstance = unknown;

type LlamaModelInstance = unknown;

type LlamaEmbeddingContextInstance = unknown;
```

## `packages/app-core/src/runtime/milady-startup-overlay.ts`

```typescript
export type MiladyEmbeddingWarmupPhase =
  | "checking"
  | "downloading"
  | "loading"
  | "ready";
```

## `packages/app-core/src/security/platform-secure-store.ts`

```typescript
export type SecureStoreSecretKind =
  | "wallet.evm_private_key"
  | "wallet.solana_private_key";

export type SecureStoreUnavailableReason =
  | "not_found"
  | "denied"
  | "unavailable"
  | "error";

export type SecureStoreGetResult =
  | { ok: true; value: string }
  | {
      ok: false;
      reason: SecureStoreUnavailableReason;
      message?: string;
    };

export type SecureStoreSetResult =
  | { ok: true }
  | { ok: false; reason: SecureStoreUnavailableReason; message?: string };

export type PlatformSecureStoreBackend =
  | "macos_keychain"
  | "windows_credential_manager"
  | "linux_secret_service"
```

## `packages/app-core/src/security/wallet-os-store-actions.ts`

```typescript
export type MigrateWalletPrivateKeysToOsStoreResult = {
  migrated: string[];
  failed: string[];
  /** True when the backend cannot run on this host (e.g. Linux without secret-tool). */
  unavailable?: boolean;
};
```

## `packages/app-core/src/services/plugin-installer.ts`

```typescript
export type InstallPhase =
  | "resolving"
  | "downloading"
  | "installing-deps"
  | "validating"
  | "configuring"
  | "restarting"
  | "complete"
  | "error";

export type ProgressCallback = (progress: InstallProgress) => void;
```

## `packages/app-core/src/services/registry-client-endpoints.ts`

```typescript
type ResolvedRegistryEndpoint = {
  parsed: URL;
  hostname: string;
  pinnedAddress: string | null;
};
```

## `packages/app-core/src/services/sandbox-manager.ts`

```typescript
  type ISandboxEngine,
  type SandboxEngineType,
} from "./sandbox-engine";

export type SandboxMode = "off" | "light" | "standard" | "max";

export type SandboxState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "degraded"
  | "stopping"
  | "stopped"
  | "recovering";
```

## `packages/app-core/src/shell-params.ts`

```typescript
export type DetachedShellTab =
  | "chat"
  | "release"
  | "triggers"
  | "plugins"
  | "connectors"
  | "cloud";

export type ShellRoute =
  | { mode: "main" }
  | { mode: "settings"; tab?: string }
  | { mode: "surface"; tab: DetachedShellTab };
```

## `packages/app-core/src/state/complete-reset-local-state-after-wipe.ts`

```typescript
export type CompleteResetLocalStateDeps = {
  setAgentStatus: (status: AgentStatus | null) => void;
  resetClientConnection: () => void;
  clearPersistedConnectionMode: () => void;
  setClientBaseUrl: (url: string | null) => void;
  setClientToken: (token: string | null) => void;
  clearElizaCloudSessionUi: () => void;
  markOnboardingReset: () => void;
  clearConversationLists: () => void;
  fetchOnboardingOptions: () => Promise<OnboardingOptions>;
  setOnboardingOptions: (options: OnboardingOptions) => void;
  logResetDebug: (message: string, detail?: Record<string, unknown>) => void;
  logResetWarn: (message: string, detail?: unknown) => void;
};
```

## `packages/app-core/src/state/handle-reset-applied-from-main.ts`

```typescript
export type HandleResetAppliedFromMainDeps = {
  performanceNow: () => number;
  isLifecycleBusy: () => boolean;
  getActiveLifecycleAction: () => LifecycleAction;
  beginLifecycleAction: (action: LifecycleAction) => boolean;
  finishLifecycleAction: () => void;
  setActionNotice: (
    text: string,
    tone: "info" | "success" | "error",
    ttlMs?: number,
    once?: boolean,
    busy?: boolean,
  ) => void;
  parseTrayResetPayload: (payload: unknown) => AgentStatus | null;
  completeResetLocalState: (
    postResetAgentStatus: AgentStatus | null,
  ) => Promise<void>;
  alertDesktopMessage: (args: {
    title: string;
    message: string;
    type: "error";
  }) => Promise<void>;
  logResetInfo: (message: string, detail?: Record<string, unknown>) => void;
  logResetWarn: (message: string, detail?: unknown) => void;
};
```

## `packages/app-core/src/state/types.ts`

```typescript
export type CompanionVrmPowerMode = "quality" | "balanced" | "efficiency";

export type CompanionHalfFramerateMode =
  | "off"
  | "when_saving_power"
  | "always";

export type ShellView = "companion" | "character" | "desktop";

export type OnboardingStep =
  | "welcome"
  | "hosting"
  | "providers"
  | "permissions"
  | "launch";

export type OnboardingMode = "basic" | "advanced" | "elizacloudonly";

export type FlaminaGuideTopic = "provider" | "rpc" | "permissions" | "voice";

export type LifecycleAction = "start" | "stop" | "restart" | "reset";

export type GamePostMessageAuthPayload = AppViewerAuthMessage;

export type SlashCommandInput = {
  name: string;
  argsRaw: string;
};

export type StartupPhase = "starting-backend" | "initializing-agent" | "ready";

export type StartupErrorReason =
  | "backend-timeout"
  | "backend-unreachable"
  | "agent-timeout"
  | "agent-error"
  | "asset-missing";

export type LoadConversationMessagesResult =
  | { ok: true }
  | { ok: false; status?: number; message: string };

export type AppContextValue = AppState & AppActions;
```

## `packages/app-core/src/state/ui-preferences.ts`

```typescript
export type UiTheme = "light" | "dark";

export type UiShellMode = "companion" | "native";
```

## `packages/app-core/src/state/useChatState.ts`

```typescript
type ChatAction =
  | { type: "SET_FIELD"; field: keyof ChatState; value: unknown }
  | { type: "SET_CHAT_INPUT"; value: string }
  | { type: "SET_CHAT_SENDING"; value: boolean }
  | { type: "SET_FIRST_TOKEN_RECEIVED"; value: boolean }
  | { type: "SET_LAST_USAGE"; value: ChatTurnUsage | null }
  | { type: "SET_AVATAR_VISIBLE"; value: boolean }
  | { type: "SET_VOICE_MUTED"; value: boolean }
  | { type: "SET_CHAT_MODE"; value: ConversationMode }
  | { type: "SET_AVATAR_SPEAKING"; value: boolean }
  | { type: "SET_CONVERSATIONS"; value: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION_ID"; value: string | null }
  | { type: "SET_COMPANION_CUTOFF"; value: number }
  | { type: "SET_MESSAGES"; value: ConversationMessage[] }
  | { type: "APPEND_MESSAGE"; message: ConversationMessage }
  | { type: "UPDATE_MESSAGE"; id: string; update: Partial<ConversationMessage> }
  | { type: "SET_AUTONOMOUS_EVENTS"; value: StreamEventEnvelope[] }
  | { type: "SET_AUTONOMOUS_LATEST_EVENT_ID"; value: string | null }
  | { type: "SET_AUTONOMOUS_RUN_HEALTH"; value: Record<string, unknown> }
  | { type: "SET_PTY_SESSIONS"; value: CodingAgentSession[] }
  | { type: "ADD_UNREAD"; conversationId: string }
  | { type: "REMOVE_UNREAD"; conversationId: string }
  | { type: "SET_PENDING_IMAGES"; value: ImageAttachment[] }
  | { type: "RESET_DRAFT" };
```

## `packages/app-core/src/state/useLeafDomainState.ts`

```typescript
type LeafAction<S> =
  | { type: "SET"; field: keyof S; value: unknown }
  | { type: "MERGE"; partial: Partial<S> };
```

## `packages/app-core/src/state/useLifecycleState.ts`

```typescript
type LifecycleAction_ =
  | { type: "SET_CONNECTED"; value: boolean }
  | { type: "SET_AGENT_STATUS"; value: AgentStatus | null }
  | { type: "SET_ONBOARDING_COMPLETE"; value: boolean }
  | { type: "INCREMENT_ONBOARDING_REVEAL_NONCE" }
  | { type: "SET_ONBOARDING_LOADING"; value: boolean }
  | { type: "SET_STARTUP_PHASE"; value: StartupPhase }
  | { type: "SET_STARTUP_ERROR"; value: StartupErrorState | null }
  | { type: "RETRY_STARTUP" }
  | { type: "SET_AUTH_REQUIRED"; value: boolean }
  | { type: "SET_ACTION_NOTICE"; value: ActionNotice | null }
  | { type: "BEGIN_LIFECYCLE"; action: LifecycleAction }
  | { type: "FINISH_LIFECYCLE" }
  | { type: "SET_PENDING_RESTART"; pending: boolean; reasons?: string[] }
  | { type: "DISMISS_RESTART_BANNER" }
  | { type: "SHOW_RESTART_BANNER" }
  | {
      type: "SET_BACKEND_CONNECTION";
      value: Partial<AppState["backendConnection"]>;
    }
  | { type: "DISMISS_BACKEND_BANNER" }
  | { type: "RESET_BACKEND_CONNECTION" }
  | { type: "ADD_SYSTEM_WARNING"; warning: string }
  | { type: "DISMISS_SYSTEM_WARNING"; message: string }
  | { type: "SET_SYSTEM_WARNINGS"; value: string[] };
```

## `packages/app-core/src/state/useOnboardingState.ts`

```typescript
export type ConnectorTokenKey =
  | "telegramToken"
  | "discordToken"
  | "whatsAppSessionPath"
  | "twilioAccountSid"
  | "twilioAuthToken"
  | "twilioPhoneNumber"
  | "blooioApiKey"
  | "blooioPhoneNumber"
  | "githubToken";

type OnboardingAction =
  | { type: "SET_STEP"; step: OnboardingStep }
  | { type: "SET_MODE"; mode: AppState["onboardingMode"] }
  | { type: "SET_ACTIVE_GUIDE"; guide: string | null }
  | { type: "ADD_DEFERRED_TASK"; task: string }
  | { type: "SET_POST_CHECKLIST_DISMISSED"; value: boolean }
  | { type: "SET_OPTIONS"; options: OnboardingOptions | null }
  | { type: "SET_FIELD"; field: string; value: unknown }
  | { type: "SET_CONNECTOR_TOKEN"; key: ConnectorTokenKey; value: string }
  | {
      type: "SET_REMOTE_STATUS";
      status: RemoteConnectionState["status"];
      error?: string | null;
    }
  | { type: "SET_REMOTE_API_BASE"; value: string }
  | { type: "SET_REMOTE_TOKEN"; value: string }
  | {
      type: "SET_DETECTED_PROVIDERS";
      value: AppState["onboardingDetectedProviders"];
    }
  | { type: "RESET_FOR_NEW_ONBOARDING" };
```

## `packages/app-core/src/test-support/process-helpers.ts`

```typescript
type MockSpawnOptions = {
  exitCode: number;
  stderrOutput?: string;
  emitError?: Error;
};
```

## `packages/app-core/src/test-support/route-test-helpers.ts`

```typescript
export type RouteBody = Record<string, unknown>;

export type RouteInvocationResult<TPayload = unknown> = {
  handled: boolean;
  status: number;
  payload: TPayload;
};

export type RouteInvokeArgs<TBody = RouteBody, TRuntime = unknown> = {
  method: string;
  pathname: string;
  url?: string;
  body?: TBody | null;
  runtimeOverride?: TRuntime;
  headers?: { host?: string };
};

export type RouteRequestContext<TBody, TRuntime> = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  runtime: TRuntime;
  readJsonBody: () => Promise<TBody | null>;
  json: (_res: ServerResponse, data: unknown, status?: number) => void;
  error: (_res: ServerResponse, message: string, status?: number) => void;
};

type RouteInvokerOptions<TRuntime = unknown> =
  | {
      runtime: TRuntime;
      runtimeProvider?: undefined;
    }
  | {
      runtime?: undefined;
      runtimeProvider: () => TRuntime;
    };
```

## `packages/app-core/src/test-support/test-helpers.ts`

```typescript
export type MockUpdateCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  channel: string;
  distTag: string;
  cached: boolean;
  error: string | null;
};

export type PluginModuleShape = {
  [key: string]: unknown;
  default?: unknown;
  plugin?: unknown;
};

type MockResponsePayload<T> = {
  res: http.ServerResponse & {
    _status: number;
    _body: string;
    writeHead: (statusCode: number) => void;
  };
  getStatus: () => number;
  getJson: () => T;
};

type MockBodyChunk = string | Buffer;

export type MockRequestOptions = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  bodyChunks?: MockBodyChunk[];
  json?: boolean;
};
```

## `packages/app-core/src/types/index.ts`

```typescript
export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: unknown;
  audit?: unknown;
  application?: unknown;
};

export type WhatsAppSelf = {
  e164?: string | null;
  jid?: string | null;
};

export type WhatsAppDisconnect = {
  at: number;
  status?: number | null;
  error?: string | null;
  loggedOut?: boolean | null;
};

export type WhatsAppStatus = {
  configured: boolean;
  linked: boolean;
  authAgeMs?: number | null;
  self?: WhatsAppSelf | null;
  running: boolean;
  connected: boolean;
  lastConnectedAt?: number | null;
  lastDisconnect?: WhatsAppDisconnect | null;
  reconnectAttempts: number;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
};

export type TelegramBot = {
  id?: number | null;
  username?: string | null;
};

export type TelegramWebhook = {
  url?: string | null;
  hasCustomCert?: boolean | null;
};

export type TelegramProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: TelegramBot | null;
  webhook?: TelegramWebhook | null;
};

export type TelegramStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  mode?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: TelegramProbe | null;
  lastProbeAt?: number | null;
};

export type DiscordBot = {
  id?: string | null;
  username?: string | null;
};

export type DiscordProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: DiscordBot | null;
};

export type DiscordStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: DiscordProbe | null;
  lastProbeAt?: number | null;
};

export type GoogleChatProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
};

export type GoogleChatStatus = {
  configured: boolean;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: GoogleChatProbe | null;
  lastProbeAt?: number | null;
};

export type SlackBot = {
  id?: string | null;
  name?: string | null;
};

export type SlackTeam = {
  id?: string | null;
  name?: string | null;
};

export type SlackProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: SlackBot | null;
  team?: SlackTeam | null;
};

export type SlackStatus = {
  configured: boolean;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SlackProbe | null;
  lastProbeAt?: number | null;
};

export type SignalProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  version?: string | null;
};

export type SignalStatus = {
  configured: boolean;
  baseUrl: string;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SignalProbe | null;
  lastProbeAt?: number | null;
};

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
};

export type IMessageStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  cliPath?: string | null;
  dbPath?: string | null;
  probe?: IMessageProbe | null;
  lastProbeAt?: number | null;
};

export type NostrProfile = {
  name?: string | null;
  displayName?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  website?: string | null;
  nip05?: string | null;
  lud16?: string | null;
};

export type NostrStatus = {
  configured: boolean;
  publicKey?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  profile?: NostrProfile | null;
};

export type MSTeamsProbe = {
  ok: boolean;
  error?: string | null;
  appId?: string | null;
};

export type MSTeamsStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  port?: number | null;
  probe?: MSTeamsProbe | null;
  lastProbeAt?: number | null;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: unknown;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: ConfigSnapshotIssue[] | null;
};

export type ShowIfCondition = {
  field: string;
  op: "eq" | "neq" | "in" | "truthy" | "falsy";
  value?: unknown;
};

export type DynamicValue<T = unknown> = T | { path: string };

export type LogicExpression =
  | { and: LogicExpression[] }
  | { or: LogicExpression[] }
  | { not: LogicExpression }
  | { path: string }
  | { eq: [DynamicValue, DynamicValue] }
  | { neq: [DynamicValue, DynamicValue] }
  | { gt: [DynamicValue<number>, DynamicValue<number>] }
  | { gte: [DynamicValue<number>, DynamicValue<number>] }
  | { lt: [DynamicValue<number>, DynamicValue<number>] }
  | { lte: [DynamicValue<number>, DynamicValue<number>] };

export type VisibilityCondition = boolean | { path: string } | LogicExpression;

export type ValidationCheck = {
  /** Built-in or custom function name (required, email, minLength, etc.) */
  fn: string;
  /** Arguments for the validation function. */
  args?: Record<string, DynamicValue>;
  /** Error message shown when check fails. */
  message: string;
};

export type ValidationConfig = {
  /** Array of checks to run. */
  checks?: ValidationCheck[];
  /** When to run validation: change | blur | submit. */
  validateOn?: "change" | "blur" | "submit";
  /** Condition: only validate when this is true. */
  enabled?: LogicExpression;
};

export type ActionBinding = {
  /** Action name (must be in catalog). */
  action: string;
  /** Parameters to pass to the action handler. */
  params?: Record<string, DynamicValue>;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  /** Default value template for new array items (e.g. `""`, `0`, `{ key: "", value: "" }`). */
  itemTemplate?:
    | string
    | number
    | boolean
    | Record<string, string | number | boolean>;
  /** Explicit field type override (must match a catalog field name). */
  type?: string;
  /** Hide this field from the UI entirely. */
  hidden?: boolean;
  /** Layout width hint. */
  width?: "full" | "half" | "third";
  /** Legacy conditional visibility. */
  showIf?: ShowIfCondition;
  /** Whether the field is read-only. */
  readonly?: boolean;
  /** Regex pattern for string validation. */
  pattern?: string;
  /** Error message when pattern doesn't match. */
  patternError?: string;
  // Phase 2: json-render features
  /** Rich visibility condition. */
  visible?: VisibilityCondition;
  /** Declarative validation checks. */
  validation?: ValidationConfig;
  /** Event bindings — maps event names to action bindings. */
  on?: Record<string, ActionBinding>;
  /** Icon name for the field label. */
  icon?: string;
  /** Enhanced options for select/radio/multiselect fields. */
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
  }>;
  /** Minimum value (for number fields). */
  min?: number;
  /** Maximum value (for number fields). */
  max?: number;
  /** Step increment (for number fields). */
  step?: number;
  /** Display unit label (e.g., "ms", "tokens", "%"). */
  unit?: string;
  /** Schema for array item fields. */
  itemSchema?: ConfigUiHint;
  /** Minimum items (for array fields). */
  minItems?: number;
  /** Maximum items (for array fields). */
  maxItems?: number;
  /** Plugin-provided custom React component name. */
  component?: string;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PresenceEntry = {
  deviceFamily?: string | null;
  host?: string | null;
  instanceId?: string | null;
  ip?: string | null;
  lastInputSeconds?: number | null;
  mode?: string | null;
  modelIdentifier?: string | null;
  platform?: string | null;
  reason?: string | null;
  roles?: Array<string | null> | null;
  scopes?: Array<string | null> | null;
  text?: string | null;
  ts?: number | null;
  version?: string | null;
};

export type GatewaySessionsDefaults = {
  model: string | null;
  contextTokens: number | null;
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
};

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type GatewaySessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
};

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: GatewaySessionsDefaults;
  sessions: GatewaySessionRow[];
};

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: {
    sessionId: string;
    updatedAt?: number;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
  };
};

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronSessionTarget = "main" | "isolated";

export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      thinking?: string;
      timeoutSeconds?: number;
    };

export type CronDelivery = {
  mode: "none" | "announce";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
};

export type SkillsStatusConfigCheck = {
  path: string;
  value: unknown;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled?: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type StatusSummary = Record<string, unknown>;

export type HealthSnapshot = Record<string, unknown>;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};
```

## `packages/app-core/src/types/result.ts`

```typescript
export type Result<T> = ResultOk<T> | ResultErr;
```

## `packages/app-core/src/utils/asset-url.ts`

```typescript
type AssetUrlResolveOptions = {
  currentUrl?: string;
  baseUrl?: string;
};
```

## `packages/app-core/src/utils/character-message-examples.ts`

```typescript
type MessageRecord = {
  content?: Content | string;
  message?: string;
  name?: string;
  role?: string;
  speaker?: string;
  text?: string;
  user?: string;
};
```

## `packages/app-core/src/utils/desktop-dialogs.ts`

```typescript
type DesktopDialogType = "none" | "info" | "error" | "question" | "warning";

type DesktopAlertOptions = {
  title: string;
  message: string;
  detail?: string;
  type?: Exclude<DesktopDialogType, "question">;
};

type DesktopConfirmOptions = {
  title: string;
  message: string;
  detail?: string;
  type?: Extract<DesktopDialogType, "question" | "warning">;
  confirmLabel?: string;
  cancelLabel?: string;
};
```

## `packages/app-core/src/utils/desktop-workspace.ts`

```typescript
export type DesktopClickAuditEntryPoint =
  | "tray"
  | "command-palette"
  | "settings:desktop"
  | "settings:voice"
  | "settings:media"
  | "game";

export type DesktopWorkspaceSurface =
  | "chat"
  | "browser"
  | "release"
  | "triggers"
  | "plugins"
  | "connectors"
  | "cloud";
```

## `packages/app-core/src/utils/eliza-globals.ts`

```typescript
export type ElizaWindow = Window & {
  __ELIZA_API_BASE__?: string;
  __ELIZA_API_TOKEN__?: string;
};
```

## `packages/app-core/src/utils/eliza-root.ts`

```typescript
type ResolveElizaRootOptions = {
  cwd?: string;
  argv1?: string;
  moduleUrl?: string;
};
```

## `packages/app-core/src/utils/streaming-text.ts`

```typescript
export type StreamingUpdateResult = {
  kind: "append" | "replace" | "noop";
  nextText: string;
  emittedText: string;
};
```

## `packages/plugin-wechat/src/runtime-bridge.ts`

```typescript
type ResponseCallback = (content: Content) => Promise<Memory[]>;

type RuntimeLike = {
  agentId?: string;
  ensureConnection?: (details: Record<string, unknown>) => Promise<unknown>;
  elizaOS?: {
    sendMessage?: (
      runtime: unknown,
      message: Memory,
      options?: { onResponse?: ResponseCallback },
    ) => Promise<{ responseContent?: Content } | undefined>;
  };
  messageService?: {
    handleMessage?: (
      runtime: unknown,
      message: Memory,
      onResponse: ResponseCallback,
    ) => Promise<{ responseContent?: Content } | undefined>;
  };
  emitEvent?: (events: string[], payload: unknown) => Promise<unknown>;
  createMemory?: (memory: Memory, tableName: string) => Promise<unknown>;
  logger?: {
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
};
```

## `packages/plugin-wechat/src/types.ts`

```typescript
export type DeviceType = "ipad" | "mac";

export type LoginStatus = "waiting" | "need_verify" | "logged_in";

export type WechatMessageType =
  | "text"
  | "image"
  | "video"
  | "file"
  | "voice"
  | "unknown";
```

## `packages/ui/src/components/ui/confirm-dialog.tsx`

```typescript
export type ConfirmTone = "danger" | "warn" | "default";
```

## `packages/ui/src/components/ui/connection-status.tsx`

```typescript
export type ConnectionState = "connected" | "disconnected" | "error";
```

## `packages/ui/src/components/ui/sonner.tsx`

```typescript
type ToasterProps = React.ComponentProps<typeof Sonner>;
```

## `packages/ui/src/components/ui/status-badge.tsx`

```typescript
export type StatusTone = "success" | "warning" | "danger" | "muted";
```

## `scripts/copy-runtime-node-modules.ts`

```typescript
type Options = {
  scanDir: string;
  targetDist: string;
};

type DependencyEntry = {
  name: string;
  spec: string | null;
};

type QueueEntry = DependencyEntry & {
  requesterDir: string;
  requesterDestDir: string;
};

type ResolvedPackage = {
  packageJsonPath: string;
  sourceDir: string;
};

type PackagePlatformManifest = {
  cpu?: string[];
  libc?: string[];
  os?: string[];
};

type CopyTargetOptions = {
  name: string;
  requesterDestDir: string;
  rootDestDir: string;
  targetNodeModules: string;
  topLevelVersions: ReadonlyMap<string, string | null>;
  resolvedVersion: string | null;
};
```

## `scripts/release-check.ts`

```typescript
type PackFile = { path: string };

type PackResult = { files?: PackFile[] };

type RootPackageJson = {
  bundleDependencies?: string[];
  bundledDependencies?: string[];
  dependencies?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
};

type DependencyPackageJson = {
  scripts?: Record<string, string>;
};
```

