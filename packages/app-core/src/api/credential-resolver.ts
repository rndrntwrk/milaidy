/**
 * Server-side credential resolver — scans local credential stores
 * to resolve real API keys when the renderer only has masked hints.
 *
 * This mirrors the Electrobun native credential scanner but runs in
 * the API server process, avoiding the need to pass unmasked keys
 * over IPC.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";

interface CredentialSource {
  providerId: string;
  envVar: string;
  resolve: () => string | null;
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function extractOauthAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const direct = record.accessToken ?? record.access_token;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  for (const v of Object.values(record)) {
    if (v && typeof v === "object") {
      const token = extractOauthAccessToken(v);
      if (token) return token;
    }
  }
  return null;
}

function readKeychainValue(service: string): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const output = execSync(
      `security find-generic-password -s "${service}" -w 2>/dev/null`,
      { encoding: "utf8", timeout: 3000 },
    );
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** Resolve Claude OAuth token from ~/.claude/.credentials.json or macOS Keychain. */
function resolveClaudeOAuthToken(): string | null {
  const home = os.homedir();
  const credPath = path.join(home, ".claude", ".credentials.json");
  const data = readJsonSafe<Record<string, unknown>>(credPath);
  const fileToken = extractOauthAccessToken(data);
  if (fileToken) return fileToken;

  const keychainData = readKeychainValue("Claude Code-credentials");
  if (!keychainData) return null;
  try {
    const parsed = JSON.parse(keychainData) as Record<string, unknown>;
    return extractOauthAccessToken(parsed);
  } catch {
    return keychainData;
  }
}

/** Resolve OpenAI API key from ~/.codex/auth.json. */
function resolveCodexApiKey(): string | null {
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  const data = readJsonSafe<{ OPENAI_API_KEY?: string }>(authPath);
  return data?.OPENAI_API_KEY?.trim() || null;
}

/**
 * All credential sources, ordered by provider.
 * Each source knows how to resolve the real key from the local filesystem.
 */
const CREDENTIAL_SOURCES: CredentialSource[] = [
  {
    providerId: "anthropic-subscription",
    envVar: "ANTHROPIC_API_KEY",
    resolve: resolveClaudeOAuthToken,
  },
  {
    providerId: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    resolve: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
  },
  {
    providerId: "openai",
    envVar: "OPENAI_API_KEY",
    resolve: () => resolveCodexApiKey() || process.env.OPENAI_API_KEY?.trim() || null,
  },
  {
    providerId: "groq",
    envVar: "GROQ_API_KEY",
    resolve: () => process.env.GROQ_API_KEY?.trim() || null,
  },
  {
    providerId: "gemini",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    resolve: () =>
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      null,
  },
  {
    providerId: "openrouter",
    envVar: "OPENROUTER_API_KEY",
    resolve: () => process.env.OPENROUTER_API_KEY?.trim() || null,
  },
  {
    providerId: "grok",
    envVar: "XAI_API_KEY",
    resolve: () => process.env.XAI_API_KEY?.trim() || null,
  },
  {
    providerId: "deepseek",
    envVar: "DEEPSEEK_API_KEY",
    resolve: () => process.env.DEEPSEEK_API_KEY?.trim() || null,
  },
  {
    providerId: "mistral",
    envVar: "MISTRAL_API_KEY",
    resolve: () => process.env.MISTRAL_API_KEY?.trim() || null,
  },
  {
    providerId: "together",
    envVar: "TOGETHER_API_KEY",
    resolve: () => process.env.TOGETHER_API_KEY?.trim() || null,
  },
  {
    providerId: "zai",
    envVar: "ZAI_API_KEY",
    resolve: () => process.env.ZAI_API_KEY?.trim() || null,
  },
];

/**
 * Resolve the real API key for a provider from local credential stores.
 * Used by the onboarding endpoint when the renderer sends a masked key.
 */
export function resolveProviderCredential(
  providerId: string,
): { envVar: string; apiKey: string } | null {
  for (const source of CREDENTIAL_SOURCES) {
    if (source.providerId !== providerId) continue;
    const key = source.resolve();
    if (key) {
      logger.info(
        `[credential-resolver] Resolved ${source.envVar} for ${providerId} (${key.length} chars)`,
      );
      return { envVar: source.envVar, apiKey: key };
    }
  }
  return null;
}

/**
 * Scan all available credential sources and return a summary.
 * Does NOT mask keys — this is server-side only.
 */
export function scanAllCredentials(): Array<{
  providerId: string;
  envVar: string;
  available: boolean;
}> {
  return CREDENTIAL_SOURCES.map((source) => ({
    providerId: source.providerId,
    envVar: source.envVar,
    available: source.resolve() !== null,
  }));
}
