import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getEnvApiKey,
  getOAuthApiKey,
  type OAuthCredentials,
} from "@mariozechner/pi-ai";
import { getAccessToken, loadCredentials } from "../auth/credentials.js";
import type { SubscriptionProvider } from "../auth/types.js";

interface PiAuthApiKeyEntry {
  type: "api_key";
  key: string;
}

interface PiAuthOAuthEntry {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
}

type PiAuthEntry = PiAuthApiKeyEntry | PiAuthOAuthEntry;

type PiAuthFile = Record<string, PiAuthEntry>;

interface PiSettingsFile {
  defaultProvider?: string;
  defaultModel?: string;
}

function resolvePiAgentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent")
  );
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface PiCredentialProvider {
  /** Returns true if we have *some* credentials for this provider (env, api key, or oauth). */
  hasCredentials(provider: string): boolean;
  /** Resolve an API key/token that pi-ai providers accept as StreamOptions.apiKey. */
  getApiKey(provider: string): Promise<string | undefined>;
  /** Default provider/model from pi settings.json, if present. */
  getDefaultModelSpec(): Promise<string | undefined>;
}

/**
 * Best-effort import of pi's provider credentials.
 *
 * - Reads API keys + OAuth creds from: ~/.pi/agent/auth.json (or $PI_CODING_AGENT_DIR/auth.json)
 * - Reads subscription OAuth creds from Milaidy secure storage when available
 * - Reads defaults from: ~/.pi/agent/settings.json
 */
export async function createPiCredentialProvider(): Promise<PiCredentialProvider> {
  const agentDir = resolvePiAgentDir();
  const authPath = path.join(agentDir, "auth.json");
  const settingsPath = path.join(agentDir, "settings.json");

  const auth = (await readJsonFile<PiAuthFile>(authPath)) ?? {};
  const settings = (await readJsonFile<PiSettingsFile>(settingsPath)) ?? {};
  const secureProviderByPiProvider = new Map<string, SubscriptionProvider>([
    ["openai-codex", "openai-codex"],
    ["anthropic", "anthropic-subscription"],
  ]);
  const secureProvidersAvailable = new Set<string>();

  // Keep a mutable OAuth credential map in-memory so refreshes are remembered.
  const oauthCreds: Record<string, OAuthCredentials> = {};

  for (const [provider, entry] of Object.entries(auth)) {
    if (entry.type === "oauth") {
      oauthCreds[provider] = {
        access: entry.access,
        refresh: entry.refresh,
        expires: entry.expires,
      };
    }
  }

  await Promise.all(
    Array.from(secureProviderByPiProvider.entries()).map(
      async ([piProvider, subscriptionProvider]) => {
        try {
          const stored = await loadCredentials(subscriptionProvider);
          if (stored) {
            secureProvidersAvailable.add(piProvider);
          }
        } catch {
          // Ignore secure storage errors here; model calls will surface
          // actionable auth failures when a credential is actually needed.
        }
      },
    ),
  );

  return {
    hasCredentials: (provider: string) => {
      if (getEnvApiKey(provider)) return true;
      if (provider in auth) return true;
      return secureProvidersAvailable.has(provider);
    },

    getApiKey: async (provider: string) => {
      // Environment takes precedence (matches pi-ai behavior).
      const envKey = getEnvApiKey(provider);
      if (envKey) return envKey;

      const entry = auth[provider];
      if (entry) {
        if (entry.type === "api_key") {
          return entry.key;
        }

        // OAuth: refresh if needed using pi-ai oauth helpers.
        try {
          const res = await getOAuthApiKey(provider, oauthCreds);
          if (!res) return undefined;

          // Update in-memory creds so subsequent calls use the refreshed token.
          oauthCreds[provider] = res.newCredentials;
          return res.apiKey;
        } catch {
          // Don't throw here; let the caller show a friendly error on actual model call.
          return entry.access;
        }
      }

      // Fallback: Milaidy secure storage OAuth credentials (subscription flows).
      const subscriptionProvider = secureProviderByPiProvider.get(provider);
      if (!subscriptionProvider) return undefined;
      try {
        const token = await getAccessToken(subscriptionProvider);
        if (token) {
          secureProvidersAvailable.add(provider);
          return token;
        }
      } catch {
        // Don't throw here; caller will surface a model-level auth error.
      }
      return undefined;
    },

    getDefaultModelSpec: async () => {
      const provider = settings.defaultProvider;
      const model = settings.defaultModel;
      if (!provider || !model) return undefined;
      return `${provider}/${model}`;
    },
  };
}
