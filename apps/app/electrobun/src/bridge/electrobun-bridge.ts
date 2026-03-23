import { Electroview } from "electrobun/view";

// ============================================================================
// Channel → RPC Method Mapping
// ============================================================================

/**
 * Maps legacy colon-separated desktop channel names to camelCase RPC
 * method names. Duplicated from rpc-schema.ts since we can't import
 * server-side code in the renderer context.
 */
const CHANNEL_TO_RPC: Record<string, string> = {
  // Agent
  "agent:start": "agentStart",
  "agent:stop": "agentStop",
  "agent:restart": "agentRestart",
  "agent:restartClearLocalDb": "agentRestartClearLocalDb",
  "agent:status": "agentStatus",

  // Desktop: Tray
  "desktop:createTray": "desktopCreateTray",
  "desktop:updateTray": "desktopUpdateTray",
  "desktop:destroyTray": "desktopDestroyTray",
  "desktop:setTrayMenu": "desktopSetTrayMenu",

  // Desktop: Shortcuts
  "desktop:registerShortcut": "desktopRegisterShortcut",
  "desktop:unregisterShortcut": "desktopUnregisterShortcut",
  "desktop:unregisterAllShortcuts": "desktopUnregisterAllShortcuts",
  "desktop:isShortcutRegistered": "desktopIsShortcutRegistered",

  // Desktop: Auto Launch
  "desktop:setAutoLaunch": "desktopSetAutoLaunch",
  "desktop:getAutoLaunchStatus": "desktopGetAutoLaunchStatus",

  // Desktop: Window
  "desktop:setWindowOptions": "desktopSetWindowOptions",
  "desktop:getWindowBounds": "desktopGetWindowBounds",
  "desktop:setWindowBounds": "desktopSetWindowBounds",
  "desktop:minimizeWindow": "desktopMinimizeWindow",
  "desktop:unminimizeWindow": "desktopUnminimizeWindow",
  "desktop:maximizeWindow": "desktopMaximizeWindow",
  "desktop:unmaximizeWindow": "desktopUnmaximizeWindow",
  "desktop:closeWindow": "desktopCloseWindow",
  "desktop:showWindow": "desktopShowWindow",
  "desktop:hideWindow": "desktopHideWindow",
  "desktop:focusWindow": "desktopFocusWindow",
  "desktop:isWindowMaximized": "desktopIsWindowMaximized",
  "desktop:isWindowMinimized": "desktopIsWindowMinimized",
  "desktop:isWindowVisible": "desktopIsWindowVisible",
  "desktop:isWindowFocused": "desktopIsWindowFocused",
  "desktop:setAlwaysOnTop": "desktopSetAlwaysOnTop",
  "desktop:setFullscreen": "desktopSetFullscreen",
  "desktop:setOpacity": "desktopSetOpacity",

  // Desktop: Notifications
  "desktop:showNotification": "desktopShowNotification",
  "desktop:closeNotification": "desktopCloseNotification",
  "desktop:showBackgroundNotice": "desktopShowBackgroundNotice",

  // Desktop: Power
  "desktop:getPowerState": "desktopGetPowerState",

  // Desktop: App
  "desktop:quit": "desktopQuit",
  "desktop:relaunch": "desktopRelaunch",
  "desktop:checkForUpdates": "desktopCheckForUpdates",
  "desktop:getUpdaterState": "desktopGetUpdaterState",
  "desktop:getVersion": "desktopGetVersion",
  "desktop:getBuildInfo": "desktopGetBuildInfo",
  "desktop:isPackaged": "desktopIsPackaged",
  "desktop:getDockIconVisibility": "desktopGetDockIconVisibility",
  "desktop:setDockIconVisibility": "desktopSetDockIconVisibility",
  "desktop:getPath": "desktopGetPath",
  "desktop:beep": "desktopBeep",
  "desktop:showSelectionContextMenu": "desktopShowSelectionContextMenu",
  "desktop:getSessionSnapshot": "desktopGetSessionSnapshot",
  "desktop:clearSessionData": "desktopClearSessionData",
  "desktop:getWebGpuBrowserStatus": "desktopGetWebGpuBrowserStatus",
  "desktop:openReleaseNotesWindow": "desktopOpenReleaseNotesWindow",
  "desktop:openSettingsWindow": "desktopOpenSettingsWindow",
  "desktop:openSurfaceWindow": "desktopOpenSurfaceWindow",

  // Desktop: Screen
  "desktop:getPrimaryDisplay": "desktopGetPrimaryDisplay",
  "desktop:getAllDisplays": "desktopGetAllDisplays",
  "desktop:getCursorPosition": "desktopGetCursorPosition",

  // Desktop: Message Box
  "desktop:showMessageBox": "desktopShowMessageBox",

  // Desktop: Clipboard
  "desktop:writeToClipboard": "desktopWriteToClipboard",
  "desktop:readFromClipboard": "desktopReadFromClipboard",
  "desktop:clearClipboard": "desktopClearClipboard",
  "desktop:clipboardAvailableFormats": "desktopClipboardAvailableFormats",

  // Desktop: Shell
  "desktop:openExternal": "desktopOpenExternal",
  "desktop:showItemInFolder": "desktopShowItemInFolder",
  "desktop:openPath": "desktopOpenPath",

  // Desktop: File Dialogs
  "desktop:showOpenDialog": "desktopShowOpenDialog",
  "desktop:showSaveDialog": "desktopShowSaveDialog",

  // Gateway
  "gateway:startDiscovery": "gatewayStartDiscovery",
  "gateway:stopDiscovery": "gatewayStopDiscovery",
  "gateway:isDiscovering": "gatewayIsDiscovering",
  "gateway:getDiscoveredGateways": "gatewayGetDiscoveredGateways",

  // Permissions
  "permissions:check": "permissionsCheck",
  "permissions:checkFeature": "permissionsCheckFeature",
  "permissions:request": "permissionsRequest",
  "permissions:getAll": "permissionsGetAll",
  "permissions:getPlatform": "permissionsGetPlatform",
  "permissions:isShellEnabled": "permissionsIsShellEnabled",
  "permissions:setShellEnabled": "permissionsSetShellEnabled",
  "permissions:clearCache": "permissionsClearCache",
  "permissions:openSettings": "permissionsOpenSettings",

  // Location
  "location:getCurrentPosition": "locationGetCurrentPosition",
  "location:watchPosition": "locationWatchPosition",
  "location:clearWatch": "locationClearWatch",
  "location:getLastKnownLocation": "locationGetLastKnownLocation",

  // Camera
  "camera:getDevices": "cameraGetDevices",
  "camera:startPreview": "cameraStartPreview",
  "camera:stopPreview": "cameraStopPreview",
  "camera:switchCamera": "cameraSwitchCamera",
  "camera:capturePhoto": "cameraCapturePhoto",
  "camera:startRecording": "cameraStartRecording",
  "camera:stopRecording": "cameraStopRecording",
  "camera:getRecordingState": "cameraGetRecordingState",
  "camera:checkPermissions": "cameraCheckPermissions",
  "camera:requestPermissions": "cameraRequestPermissions",

  // Canvas
  "canvas:createWindow": "canvasCreateWindow",
  "canvas:destroyWindow": "canvasDestroyWindow",
  "canvas:navigate": "canvasNavigate",
  "canvas:eval": "canvasEval",
  "canvas:snapshot": "canvasSnapshot",
  "canvas:a2uiPush": "canvasA2uiPush",
  "canvas:a2uiReset": "canvasA2uiReset",
  "canvas:show": "canvasShow",
  "canvas:hide": "canvasHide",
  "canvas:resize": "canvasResize",
  "canvas:focus": "canvasFocus",
  "canvas:getBounds": "canvasGetBounds",
  "canvas:setBounds": "canvasSetBounds",
  "canvas:listWindows": "canvasListWindows",

  // Game
  "game:openWindow": "gameOpenWindow",

  // Screencapture
  "screencapture:getSources": "screencaptureGetSources",
  "screencapture:takeScreenshot": "screencaptureTakeScreenshot",
  "screencapture:captureWindow": "screencaptureCaptureWindow",
  "screencapture:startRecording": "screencaptureStartRecording",
  "screencapture:stopRecording": "screencaptureStopRecording",
  "screencapture:pauseRecording": "screencapturePauseRecording",
  "screencapture:resumeRecording": "screencaptureResumeRecording",
  "screencapture:getRecordingState": "screencaptureGetRecordingState",
  "screencapture:startFrameCapture": "screencaptureStartFrameCapture",
  "screencapture:stopFrameCapture": "screencaptureStopFrameCapture",
  "screencapture:isFrameCaptureActive": "screencaptureIsFrameCaptureActive",
  "screencapture:saveScreenshot": "screencaptureSaveScreenshot",
  "screencapture:switchSource": "screencaptureSwitchSource",
  "screencapture:setCaptureTarget": "screencaptureSetCaptureTarget",

  // Swabble
  "swabble:start": "swabbleStart",
  "swabble:stop": "swabbleStop",
  "swabble:isListening": "swabbleIsListening",
  "swabble:getConfig": "swabbleGetConfig",
  "swabble:updateConfig": "swabbleUpdateConfig",
  "swabble:isWhisperAvailable": "swabbleIsWhisperAvailable",
  "swabble:audioChunk": "swabbleAudioChunk",

  // TalkMode
  "talkmode:start": "talkmodeStart",
  "talkmode:stop": "talkmodeStop",
  "talkmode:speak": "talkmodeSpeak",
  "talkmode:stopSpeaking": "talkmodeStopSpeaking",
  "talkmode:getState": "talkmodeGetState",
  "talkmode:isEnabled": "talkmodeIsEnabled",
  "talkmode:isSpeaking": "talkmodeIsSpeaking",
  "talkmode:getWhisperInfo": "talkmodeGetWhisperInfo",
  "talkmode:isWhisperAvailable": "talkmodeIsWhisperAvailable",
  "talkmode:updateConfig": "talkmodeUpdateConfig",
  "talkmode:audioChunk": "talkmodeAudioChunk",

  // Context Menu
  "contextMenu:askAgent": "contextMenuAskAgent",
  "contextMenu:createSkill": "contextMenuCreateSkill",
  "contextMenu:quoteInChat": "contextMenuQuoteInChat",
  "contextMenu:saveAsCommand": "contextMenuSaveAsCommand",
  apiBaseUpdate: "apiBaseUpdate",
  shareTargetReceived: "shareTargetReceived",

  // GPU Window
  "gpuWindow:create": "gpuWindowCreate",
  "gpuWindow:destroy": "gpuWindowDestroy",
  "gpuWindow:show": "gpuWindowShow",
  "gpuWindow:hide": "gpuWindowHide",
  "gpuWindow:setBounds": "gpuWindowSetBounds",
  "gpuWindow:getInfo": "gpuWindowGetInfo",
  "gpuWindow:list": "gpuWindowList",

  // GPU View
  "gpuView:create": "gpuViewCreate",
  "gpuView:destroy": "gpuViewDestroy",
  "gpuView:setFrame": "gpuViewSetFrame",
  "gpuView:setTransparent": "gpuViewSetTransparent",
  "gpuView:setHidden": "gpuViewSetHidden",
  "gpuView:getNativeHandle": "gpuViewGetNativeHandle",
  "gpuView:list": "gpuViewList",
};

/**
 * Maps legacy desktop push channels to RPC message names.
 * These are messages that flow Bun → webview.
 */
const PUSH_CHANNEL_TO_RPC: Record<string, string> = {
  "agent:status": "agentStatusUpdate",
  "gateway:discovery": "gatewayDiscovery",
  "permissions:changed": "permissionsChanged",
  "desktop:trayMenuClick": "desktopTrayMenuClick",
  "desktop:trayClick": "desktopTrayClick",
  "desktop:shortcutPressed": "desktopShortcutPressed",
  "desktop:windowFocus": "desktopWindowFocus",
  "desktop:windowBlur": "desktopWindowBlur",
  "desktop:windowMaximize": "desktopWindowMaximize",
  "desktop:windowUnmaximize": "desktopWindowUnmaximize",
  "desktop:windowClose": "desktopWindowClose",
  "canvas:windowEvent": "canvasWindowEvent",
  "talkmode:audioChunkPush": "talkmodeAudioChunkPush",
  "talkmode:stateChanged": "talkmodeStateChanged",
  "talkmode:speakComplete": "talkmodeSpeakComplete",
  "talkmode:transcript": "talkmodeTranscript",
  "talkmode:error": "talkmodeError",
  "swabble:wakeWord": "swabbleWakeWord",
  "swabble:stateChange": "swabbleStateChanged",
  "swabble:transcript": "swabbleTranscript",
  "swabble:error": "swabbleError",
  "swabble:audioChunkPush": "swabbleAudioChunkPush",
  "contextMenu:askAgent": "contextMenuAskAgent",
  "contextMenu:createSkill": "contextMenuCreateSkill",
  "contextMenu:quoteInChat": "contextMenuQuoteInChat",
  "contextMenu:saveAsCommand": "contextMenuSaveAsCommand",
  apiBaseUpdate: "apiBaseUpdate",
  shareTargetReceived: "shareTargetReceived",
  "location:update": "locationUpdate",
  "desktop:updateAvailable": "desktopUpdateAvailable",
  "desktop:updateReady": "desktopUpdateReady",

  // GPU Window push events
  "gpuWindow:closed": "gpuWindowClosed",

  // WebGPU browser support
  "webgpu:browserStatus": "webGpuBrowserStatus",
};

// Reverse mapping: RPC message name → legacy desktop push channel
const RPC_TO_PUSH_CHANNEL: Record<string, string> = {};
for (const [channel, rpcName] of Object.entries(PUSH_CHANNEL_TO_RPC)) {
  RPC_TO_PUSH_CHANNEL[rpcName] = channel;
}

// ============================================================================
// Listener Registry (for ipcRenderer.on / ipcRenderer.removeListener)

type IpcListener = (...args: unknown[]) => void;

const listenersByRpcMessage: Record<string, Set<IpcListener>> = {};
const listenersByChannel: Record<string, Set<IpcListener>> = {};

// ============================================================================
// Electrobun RPC Setup
// ============================================================================

// Electrobun's native layer sets these globals before preloads run.
// __electrobun must exist before Electroview.init() tries to write to it.
// If the built-in preload hasn't fired yet (rare edge case), stub it.
ensureElectrobunGlobal();

function dispatchMessage(messageName: string, payload: unknown): void {
  if (messageName === "apiBaseUpdate") {
    const p = payload as { base: string; token?: string };
    window.__MILADY_API_BASE__ = p.base;
    if (p.token)
      Object.defineProperty(window, "__MILADY_API_TOKEN__", {
        value: p.token,
        writable: true,
        enumerable: false,
        configurable: true,
      });
  }

  const listeners = listenersByRpcMessage[messageName];
  if (listeners) {
    for (const listener of Array.from(listeners)) {
      try {
        listener(null, payload);
      } catch (err) {
        console.error(
          `[ElectrobunBridge] Listener error for ${messageName}:`,
          err,
        );
      }
    }
  }
}

// Electrobun defaults outgoing RPC timeout to 1s; native dialogs need much longer.
// biome-ignore lint/suspicious/noExplicitAny: schema types live on the Bun side and can't be imported in a browser bundle
const rpc = Electroview.defineRPC<unknown>({
  maxRequestTime: 600_000,
  handlers: {
    requests: {},
    messages: {
      "*": ((messageName: unknown, payload: unknown) => {
        if (typeof messageName === "string") {
          dispatchMessage(messageName, payload);
        }
        // biome-ignore lint/suspicious/noExplicitAny: required for Electroview wildcard signature
      }) as unknown,
    },
  },
});

new Electroview({ rpc });

// biome-ignore lint/suspicious/noExplicitAny: request proxy is dynamically typed, schema only available on Bun side
const rpcRequest = (rpc as Record<string, unknown>).request as Record<
  string,
  (params: unknown) => Promise<unknown>
>;

const electrobunAPI = {
  ipcRenderer: {
    invoke: async (rpcMethod: string, ...args: unknown[]): Promise<unknown> => {
      const params =
        args.length === 0 ? undefined : args.length === 1 ? args[0] : args;

      try {
        return await rpcRequest[rpcMethod](params);
      } catch (err) {
        console.error(`[ElectrobunBridge] RPC error for ${rpcMethod}:`, err);
        throw err;
      }
    },

    send: (channel: string, ...args: unknown[]): void => {
      electrobunAPI.ipcRenderer.invoke(channel, ...args).catch(() => {});
    },

    on: (rpcMessage: string, listener: IpcListener): void => {
      if (!listenersByRpcMessage[rpcMessage]) {
        listenersByRpcMessage[rpcMessage] = new Set();
      }
      listenersByRpcMessage[rpcMessage].add(listener);

      listenersByChannel[rpcMessage].add(listener);
    },

    once: (channel: string, listener: IpcListener): void => {
      const wrappedListener: IpcListener = (...args) => {
        electrobunAPI.ipcRenderer.removeListener(channel, wrappedListener);
        listener(...args);
      };
      electrobunAPI.ipcRenderer.on(channel, wrappedListener);
    },

    removeListener: (rpcMessage: string, listener: IpcListener): void => {
      listenersByRpcMessage[rpcMessage]?.delete(listener);
      listenersByChannel[rpcMessage]?.delete(listener);
    },

    removeAllListeners: (rpcMessage: string): void => {
      delete listenersByRpcMessage[rpcMessage];
      delete listenersByChannel[rpcMessage];
    },
  },

  desktopCapturer: {
    getSources: async (_options: {
      types: string[];
      thumbnailSize?: { width: number; height: number };
    }) => {
      const result = await electrobunAPI.ipcRenderer.invoke(
        "screencaptureGetSources",
      );
      return (result as { sources?: unknown[] })?.sources ?? [];
    },
  },

  platform: {
    isMac: /Mac/.test(navigator.userAgent),
    isWindows: /Win/.test(navigator.userAgent),
    isLinux: /Linux/.test(navigator.userAgent),
    arch: /arm|aarch64/i.test(navigator.userAgent) ? "arm64" : "x64",
    version: "",
  },
};

const rpcListenerWrappers: Record<
  string,
  Map<RpcMessageListener, IpcListener>
> = {};

const miladyElectrobunRpc = {
  request: rpcRequest,
  onMessage: (messageName: string, listener: RpcMessageListener): void => {
    if (!rpcListenerWrappers[messageName]) {
      rpcListenerWrappers[messageName] = new Map();
    }
    if (rpcListenerWrappers[messageName].has(listener)) {
      return;
    }

    const wrappedListener: IpcListener = (_event, payload) => {
      listener(payload);
    };
    rpcListenerWrappers[messageName].set(listener, wrappedListener);
    electrobunAPI.ipcRenderer.on(messageName, wrappedListener);
  },
  offMessage: (messageName: string, listener: RpcMessageListener): void => {
    const wrappedListener = rpcListenerWrappers[messageName]?.get(listener);
    if (!wrappedListener) {
      return;
    }

    electrobunAPI.ipcRenderer.removeListener(messageName, wrappedListener);
    rpcListenerWrappers[messageName]?.delete(listener);
    if (rpcListenerWrappers[messageName]?.size === 0) {
      delete rpcListenerWrappers[messageName];
    }
  },
};

// Initialize platform version asynchronously
electrobunAPI.ipcRenderer
  .invoke("desktopGetVersion")
  .then((info) => {
    if (info && typeof info === "object" && "version" in info) {
      electrobunAPI.platform.version = (info as { version: string }).version;
    }
  })
  .catch(() => {});

declare global {
  interface Window {
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    __MILADY_ELECTROBUN_RPC__: typeof miladyElectrobunRpc;
    electrobun: typeof electrobunAPI;
  }
}

window.electrobun = electrobunAPI;
window.__MILADY_ELECTROBUN_RPC__ = miladyElectrobunRpc;
