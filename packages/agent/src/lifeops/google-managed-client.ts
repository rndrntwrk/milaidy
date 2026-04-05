import type {
  CreateLifeOpsCalendarEventRequest,
  LifeOpsGoogleCapability,
  LifeOpsGoogleConnectorReason,
  StartLifeOpsGoogleConnectorResponse,
} from "@miladyai/shared/contracts/lifeops";
import {
  normalizeCloudSiteUrl,
  resolveCloudApiBaseUrl,
} from "../cloud/base-url.js";
import type { SyncedGoogleCalendarEvent } from "./google-calendar.js";
import type { SyncedGoogleGmailMessageSummary } from "./google-gmail.js";

const MANAGED_GOOGLE_REQUEST_TIMEOUT_MS = 20_000;

export class ManagedGoogleClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ManagedGoogleClientError";
  }
}

export interface ResolvedManagedGoogleCloudConfig {
  configured: boolean;
  apiKey: string | null;
  apiBaseUrl: string;
  siteUrl: string;
}

export interface ManagedGoogleConnectorStatusResponse {
  provider: "google";
  mode: "cloud_managed";
  configured: boolean;
  connected: boolean;
  reason: LifeOpsGoogleConnectorReason;
  identity: Record<string, unknown> | null;
  grantedCapabilities: LifeOpsGoogleCapability[];
  grantedScopes: string[];
  expiresAt: string | null;
  hasRefreshToken: boolean;
  connectionId: string | null;
  linkedAt: string | null;
  lastUsedAt: string | null;
}

export interface ManagedGoogleCalendarFeedResponse {
  calendarId: string;
  events: SyncedGoogleCalendarEvent[];
  syncedAt: string;
}

export interface ManagedGoogleCalendarEventResponse {
  event: SyncedGoogleCalendarEvent;
}

export interface ManagedGoogleGmailTriageResponse {
  messages: SyncedGoogleGmailMessageSummary[];
  syncedAt: string;
}

export interface ManagedGoogleReplySendRequest {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
  references?: string | null;
}

function normalizeApiKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    const text = await response.text();
    const trimmed = text.trim();
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (trimmed.length > 0) {
      try {
        if (contentType.includes("text/html") && !/^[{[]/.test(trimmed)) {
          throw new Error("html response");
        }
        const parsed = JSON.parse(trimmed) as {
          error?: string;
          message?: string;
        };
        detail = parsed.message ?? parsed.error ?? trimmed;
      } catch {
        if (!contentType.includes("text/html")) {
          detail = trimmed.slice(0, 200);
        }
      }
    }
    throw new ManagedGoogleClientError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function resolveManagedGoogleCloudConfig(): ResolvedManagedGoogleCloudConfig {
  const apiKey = normalizeApiKey(process.env.ELIZAOS_CLOUD_API_KEY);
  const siteUrl = normalizeCloudSiteUrl(process.env.ELIZAOS_CLOUD_BASE_URL);
  const apiBaseUrl = resolveCloudApiBaseUrl(process.env.ELIZAOS_CLOUD_BASE_URL);

  return {
    configured: Boolean(apiKey),
    apiKey,
    apiBaseUrl,
    siteUrl,
  };
}

export class GoogleManagedClient {
  constructor(private readonly config = resolveManagedGoogleCloudConfig()) {}

  get configured(): boolean {
    return this.config.configured;
  }

  private requireConfig(): ResolvedManagedGoogleCloudConfig & {
    apiKey: string;
  } {
    if (!this.config.apiKey) {
      throw new Error("Eliza Cloud is not connected.");
    }
    return {
      ...this.config,
      apiKey: this.config.apiKey,
    };
  }

  private async request<T>(
    pathname: string,
    init: RequestInit = {},
  ): Promise<T> {
    const config = this.requireConfig();
    const url = new URL(
      pathname.replace(/^\/+/, ""),
      `${config.apiBaseUrl.replace(/\/+$/, "")}/`,
    );
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        ...(init.headers ?? {}),
      },
      signal:
        init.signal ?? buildTimeoutSignal(MANAGED_GOOGLE_REQUEST_TIMEOUT_MS),
    });
    return readJsonResponse<T>(response);
  }

  async getStatus(): Promise<ManagedGoogleConnectorStatusResponse> {
    return this.request<ManagedGoogleConnectorStatusResponse>(
      "milady/google/status",
      {
        method: "GET",
      },
    );
  }

  async startConnector(args: {
    capabilities?: LifeOpsGoogleCapability[];
  }): Promise<StartLifeOpsGoogleConnectorResponse> {
    const redirectUri = new URL(
      "/auth/success?platform=google",
      `${this.requireConfig().siteUrl.replace(/\/+$/, "")}/`,
    ).toString();
    return this.request<StartLifeOpsGoogleConnectorResponse>(
      "milady/google/connect/initiate",
      {
        method: "POST",
        body: JSON.stringify({
          capabilities: args.capabilities,
          redirectUrl: redirectUri,
        }),
      },
    );
  }

  async disconnectConnector(connectionId?: string | null): Promise<void> {
    await this.request<{ ok: true }>("milady/google/disconnect", {
      method: "POST",
      body: JSON.stringify({
        connectionId: connectionId ?? null,
      }),
    });
  }

  async getCalendarFeed(args: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
  }): Promise<ManagedGoogleCalendarFeedResponse> {
    const query = new URLSearchParams({
      calendarId: args.calendarId,
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      timeZone: args.timeZone,
    });
    return this.request<ManagedGoogleCalendarFeedResponse>(
      `milady/google/calendar/feed?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async createCalendarEvent(
    request: Omit<CreateLifeOpsCalendarEventRequest, "mode">,
  ): Promise<ManagedGoogleCalendarEventResponse> {
    return this.request<ManagedGoogleCalendarEventResponse>(
      "milady/google/calendar/events",
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  async getGmailTriage(args: {
    maxResults: number;
  }): Promise<ManagedGoogleGmailTriageResponse> {
    const query = new URLSearchParams({
      maxResults: String(args.maxResults),
    });
    return this.request<ManagedGoogleGmailTriageResponse>(
      `milady/google/gmail/triage?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async sendGmailReply(
    request: ManagedGoogleReplySendRequest,
  ): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("milady/google/gmail/reply-send", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}
