/**
 * API Client for E2E tests.
 *
 * Provides a typed interface for interacting with the Milaidy API.
 *
 * @module test/e2e/framework/api-client
 */

export interface ApiClient {
  baseUrl: string;

  // Status
  getStatus(): Promise<StatusResponse>;

  // Chat
  chat(message: ChatRequest): Promise<ChatResponse>;

  // Conversations
  getConversations(): Promise<ConversationsResponse>;
  createConversation(): Promise<ConversationResponse>;
  getMessages(conversationId: string): Promise<MessagesResponse>;
  sendMessage(conversationId: string, text: string): Promise<MessageResponse>;

  // Plugins
  getPlugins(): Promise<PluginsResponse>;

  // Config
  getConfig(): Promise<ConfigResponse>;

  // Health
  getHealth(detailed?: boolean): Promise<HealthResponse>;

  // Raw request
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

// Response types
export interface StatusResponse {
  state: "idle" | "running" | "paused" | "stopped" | "error";
  agentName?: string;
  uptime?: number;
  version?: string;
}

export interface ChatRequest {
  text: string;
  sessionId?: string;
  stream?: boolean;
}

export interface ChatResponse {
  text: string;
  sessionId: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ConversationsResponse {
  conversations: Array<{
    id: string;
    createdAt: string;
    messageCount: number;
  }>;
}

export interface ConversationResponse {
  id: string;
  createdAt: string;
}

export interface MessagesResponse {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
}

export interface MessageResponse {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
  }>;
}

export interface PluginsResponse {
  plugins: Array<{
    name: string;
    version: string;
    enabled: boolean;
    status: "loaded" | "disabled" | "error";
  }>;
}

export interface ConfigResponse {
  [key: string]: unknown;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  checks: Array<{
    name: string;
    healthy: boolean;
    critical: boolean;
    message?: string;
    durationMs: number;
  }>;
}

/**
 * Create an API client for the given base URL.
 */
export function createApiClient(baseUrl: string): ApiClient {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    baseUrl,

    async getStatus() {
      return request<StatusResponse>("GET", "/api/status");
    },

    async chat(message) {
      return request<ChatResponse>("POST", "/api/chat", message);
    },

    async getConversations() {
      return request<ConversationsResponse>("GET", "/api/conversations");
    },

    async createConversation() {
      return request<ConversationResponse>("POST", "/api/conversations");
    },

    async getMessages(conversationId) {
      return request<MessagesResponse>(
        "GET",
        `/api/conversations/${conversationId}/messages`,
      );
    },

    async sendMessage(conversationId, text) {
      return request<MessageResponse>(
        "POST",
        `/api/conversations/${conversationId}/messages`,
        { text },
      );
    },

    async getPlugins() {
      return request<PluginsResponse>("GET", "/api/plugins");
    },

    async getConfig() {
      return request<ConfigResponse>("GET", "/api/config");
    },

    async getHealth(detailed = false) {
      const query = detailed ? "?detailed=true" : "";
      return request<HealthResponse>("GET", `/health${query}`);
    },

    request,
  };
}

/**
 * Retry a request until it succeeds or times out.
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 30000;

  const start = Date.now();
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    if (Date.now() - start > timeoutMs) {
      break;
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}
