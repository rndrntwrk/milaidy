/**
 * Local type aliases for @elizaos/core interfaces.
 *
 * The source code targets the simplified type shapes used by
 * @rndrntwrk/plugin-555stream (synchronous callback, string provider return).
 * Rather than import directly from @elizaos/core — whose 1.7.x types have
 * diverged (async HandlerCallback, ProviderResult return type, etc.) — we
 * define a compatible local subset here.
 *
 * When a future @elizaos/core version aligns with this project's conventions,
 * these can be replaced with a direct re-export from the upstream package.
 */

export interface IAgentRuntime {
  getService<T = unknown>(name: string): T | null | undefined;
  [key: string]: unknown;
}

export interface Memory {
  content?: {
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface State {
  [key: string]: unknown;
}

/**
 * Synchronous callback used inside action handlers to emit a response.
 * Maps to the streaming/callback pattern used by the 555 plugin suite.
 */
export interface HandlerCallback {
  (response: { text: string; action?: string; content?: unknown }): void;
}

export interface ActionExample {
  user: string;
  content: {
    text: string;
    action?: string;
  };
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  validate: (
    runtime: IAgentRuntime,
    message?: Memory,
    state?: State
  ) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ) => Promise<void>;
  examples?: ActionExample[][];
}

export interface ProviderResult {
  text?: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface Provider {
  name?: string;
  description?: string;
  get: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ) => Promise<string | ProviderResult>;
}

export interface Service {
  serviceType: string;
  initialize(runtime: IAgentRuntime): Promise<void>;
  stop?(): Promise<void>;
}

export interface Plugin {
  name: string;
  description: string;
  init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>;
  services?: Service[];
  providers?: Provider[];
  actions?: Action[];
  routes?: unknown[];
  [key: string]: unknown;
}
