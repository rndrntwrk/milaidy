/**
 * Electrobun Renderer Bridge
 *
 * Exposes the direct Milady Electrobun RPC surface in the webview context.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses `Electroview.defineRPC()` + `new Electroview()` to connect to
 * the Bun main process via the Electrobun WebSocket RPC channel.
 *
 * `window.__MILADY_ELECTROBUN_RPC__` is the only public desktop bridge exposed
 * to renderer code. The internal legacy channel mapping remains here only to
 * adapt the existing native event names onto that direct RPC surface.
 */

import { Electroview } from "electrobun/view";
import type { RpcMessageListener } from "../types.js";

// ============================================================================
// Listener Registry (for ipcRenderer.on / ipcRenderer.removeListener)
// ============================================================================

type IpcListener = (...args: unknown[]) => void;

// Listeners keyed by RPC message name (camelCase, e.g. "agentStatusUpdate")
const listenersByRpcMessage: Record<string, Set<IpcListener>> = {};
// Listeners keyed by legacy channel name (for removeListener lookup)
const listenersByChannel: Record<string, Set<IpcListener>> = {};

// ============================================================================
// Electrobun RPC Setup
// ============================================================================

// Electrobun's native layer sets these globals before preloads run.
// __electrobun must exist before Electroview.init() tries to write to it.
// If the built-in preload hasn't fired yet (rare edge case), stub it.
if (typeof window.__electrobun === "undefined") {
  (
    window as {
      __electrobun: {
        receiveMessageFromBun: (m: unknown) => void;
        receiveInternalMessageFromBun: (m: unknown) => void;
      };
    }
  ).__electrobun = {
    receiveMessageFromBun: (_m: unknown) => {},
    receiveInternalMessageFromBun: (_m: unknown) => {},
  };
}

// Use Electroview.defineRPC to create the webview-side RPC.
// The schema types are defined in the Bun-side rpc-schema.ts and are not
// imported into the browser bundle, so message payloads stay opaque here.
function dispatchMessage(messageName: string, payload: unknown): void {
  // apiBaseUpdate is handled separately for __MILADY_API_BASE__
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

  // Dispatch to all registered ipcRenderer.on() listeners
  const listeners = listenersByRpcMessage[messageName];
  if (listeners) {
    for (const listener of Array.from(listeners)) {
      try {
        // Legacy desktop listeners receive (event, ...args) — we use null for the event
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
const rpc = Electroview.defineRPC<any>({
  maxRequestTime: 600_000,
  handlers: {
    requests: {},
    messages: {
      "*": ((messageName: unknown, payload: unknown) => {
        if (typeof messageName === "string") {
          dispatchMessage(messageName, payload);
        }
        // biome-ignore lint/suspicious/noExplicitAny: required for Electroview wildcard signature
      }) as any,
    },
  },
});

// Connect the RPC to Bun via Electroview (opens WebSocket to Bun's RPC server)
new Electroview({ rpc });

// ============================================================================
// window.electrobun Bridge Surface
// ============================================================================

// The RPC `request` proxy is dynamically typed — we cast to `any` here
// since the full schema is only available on the Bun side at build time.
// biome-ignore lint/suspicious/noExplicitAny: request proxy is dynamically typed, schema only available on Bun side
const rpcRequest = (rpc as any).request as Record<
  string,
  (params: unknown) => Promise<unknown>
>;

const electrobunAPI = {
  ipcRenderer: {
    /**
     * invoke() — maps to rpc.request[method](params)
     */
    invoke: async (rpcMethod: string, ...args: unknown[]): Promise<unknown> => {
      // Legacy desktop invoke passes args as separate params.
      // Our RPC expects a single params object (or void).
      const params =
        args.length === 0 ? undefined : args.length === 1 ? args[0] : args;

      try {
        return await rpcRequest[rpcMethod](params);
      } catch (err) {
        console.error(`[ElectrobunBridge] RPC error for ${rpcMethod}:`, err);
        throw err;
      }
    },

    /**
     * send() — fire-and-forget, same as invoke but discards result
     */
    send: (channel: string, ...args: unknown[]): void => {
      electrobunAPI.ipcRenderer.invoke(channel, ...args).catch(() => {});
    },

    /**
     * on() — subscribe to push events from the Bun side
     */
    on: (rpcMessage: string, listener: IpcListener): void => {
      if (!listenersByRpcMessage[rpcMessage]) {
        listenersByRpcMessage[rpcMessage] = new Set();
      }
      listenersByRpcMessage[rpcMessage].add(listener);

      // Also store by channel name for removeListener
      if (!listenersByChannel[rpcMessage]) {
        listenersByChannel[rpcMessage] = new Set();
      }
      listenersByChannel[rpcMessage].add(listener);
    },

    /**
     * once() — subscribe to a single push event
     */
    once: (channel: string, listener: IpcListener): void => {
      const wrappedListener: IpcListener = (...args) => {
        electrobunAPI.ipcRenderer.removeListener(channel, wrappedListener);
        listener(...args);
      };
      electrobunAPI.ipcRenderer.on(channel, wrappedListener);
    },

    /**
     * removeListener() — unsubscribe from push events
     */
    removeListener: (rpcMessage: string, listener: IpcListener): void => {
      listenersByRpcMessage[rpcMessage]?.delete(listener);
      listenersByChannel[rpcMessage]?.delete(listener);
    },

    /**
     * removeAllListeners() — unsubscribe all listeners for a channel
     */
    removeAllListeners: (rpcMessage: string): void => {
      delete listenersByRpcMessage[rpcMessage];
      delete listenersByChannel[rpcMessage];
    },
  },

  /**
   * Desktop Capturer — proxies to screencapture:getSources RPC
   */
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

  /**
   * Platform information — detected from user agent and environment
   */
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

// ============================================================================
// Expose to Window
// ============================================================================

// Augment the Window interface for bridge globals
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
