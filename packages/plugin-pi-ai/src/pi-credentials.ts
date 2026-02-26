import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import {
  getEnvApiKey,
  getModels,
  getOAuthApiKey,
  getProviders,
  type OAuthCredentials,
} from "@mariozechner/pi-ai";

type SubscriptionProvider = "openai-codex" | "anthropic-subscription";

interface MilaidyAuthCredentialsModule {
  loadCredentials: (
    provider: SubscriptionProvider,
  ) => Promise<OAuthCredentials | null>;
  getAccessToken: (provider: SubscriptionProvider) => Promise<string | undefined>;
}

let cachedMilaidyAuthModule: Promise<MilaidyAuthCredentialsModule | null> | null =
  null;

async function loadMilaidyAuthModule(): Promise<MilaidyAuthCredentialsModule | null> {
  if (cachedMilaidyAuthModule) {
    return cachedMilaidyAuthModule;
  }
  cachedMilaidyAuthModule = (async () => {
    try {
      const module = await import("../../../src/auth/credentials.js");
      if (
        module &&
        typeof module.loadCredentials === "function" &&
        typeof module.getAccessToken === "function"
      ) {
        return module as MilaidyAuthCredentialsModule;
      }
    } catch (error) {
      logger.debug(
        `pi-ai: secure credential bridge unavailable (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    return null;
  })();
  return cachedMilaidyAuthModule;
}

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

function resolvePiAgentDir(overrideDir?: string): string {
  const normalizedOverride = overrideDir?.trim();
  if (normalizedOverride) {
    return normalizedOverride;
  }

  return (
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent")
  );
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      return null;
    }

    logger.warn(
      `pi-ai: failed to parse ${path.basename(filePath)} (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

export interface PiCredentialProvider {
  hasCredentials(provider: string): boolean;
  getApiKey(provider: string): Promise<string | undefined>;
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
  const authModule = await loadMilaidyAuthModule();

  const auth = (await readJsonFile<PiAuthFile>(authPath)) ?? {};
  const settings = (await readJsonFile<PiSettingsFile>(settingsPath)) ?? {};
  const secureProviderByPiProvider = new Map<string, SubscriptionProvider>([
    ["openai-codex", "openai-codex"],
    ["anthropic", "anthropic-subscription"],
  ]);
  const secureProvidersAvailable = new Set<string>();

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
        if (!authModule) return;
        try {
          const stored = await authModule.loadCredentials(subscriptionProvider);
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
      if (!subscriptionProvider || !authModule) return undefined;
      try {
        const token = await authModule.getAccessToken(subscriptionProvider);
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

export async function listPiAiModelOptions(overrideAgentDir?: string): Promise<{
  defaultModelSpec: string | undefined;
  models: PiAiModelOption[];
}> {
  const provider = await createPiCredentialProvider(overrideAgentDir);
  const defaultModelSpec = await provider.getDefaultModelSpec();

  const models: PiAiModelOption[] = [];

  for (const providerId of getProviders()) {
    if (!provider.hasCredentials(providerId)) continue;

    for (const model of getModels(providerId)) {
      const modelSpec = `${providerId}/${model.id}`;
      models.push({
        id: modelSpec,
        name: model.name,
        provider: providerId,
        isDefault: modelSpec === defaultModelSpec,
      });
    }
  }

  models.sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.name.localeCompare(b.name);
  });

  return { defaultModelSpec, models };
}
