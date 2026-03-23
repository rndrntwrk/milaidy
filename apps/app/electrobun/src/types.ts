/**
 * Shared types used across electrobun native modules and bridges.
 */

/** Callback to send a JSON‑serialisable message to the renderer webview. */
export type SendToWebview = (message: string, payload?: unknown) => void;

/**
 * Structural type for accessing evaluateJavascriptWithResponse via requestProxy.
 * `requestProxy` is present at runtime on every createRPC result but is not
 * reflected in the base RPCWithTransport interface exported by electrobun.
 */
export type WebviewEvalRpc = {
  requestProxy?: {
    evaluateJavascriptWithResponse?: (params: {
      script: string;
    }) => Promise<unknown>;
  };
};

/** Listener for incoming RPC messages from the webview. */
export type RpcMessageListener = (payload: unknown) => void;
