/**
 * Credential storage and token refresh for subscription providers.
 *
 * Now uses secure storage (keychain or encrypted files) instead of plaintext.
 * Automatically migrates legacy plaintext credentials on first access.
 *
 * @module auth/credentials
 */

import { logger } from "@elizaos/core";
import crypto from "node:crypto";
import { refreshAnthropicToken } from "./anthropic.js";
import { migrateCredentials, needsMigration } from "./migration.js";
import { refreshCodexToken } from "./openai-codex.js";
import { getSecureStorage } from "./secure-storage.js";
import type {
  OAuthCredentials,
  StoredCredentials,
  SubscriptionProvider,
} from "./types.js";

/** Buffer before expiry to trigger refresh (5 minutes). */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MIN_REFRESH_LOOP_MS = 30_000;
const DEFAULT_REFRESH_LOOP_MS = 2 * 60 * 1000;
const OPENAI_SCOPE_PROBE_TTL_MS = 15 * 60 * 1000;

/** Whether migration has been attempted this session. */
let _migrationAttempted = false;
let _refreshInterval: ReturnType<typeof setInterval> | null = null;
let _refreshInFlight: Promise<void> | null = null;
let _openAiScopeProbeCache:
  | { tokenHash: string; checkedAt: number; valid: boolean; reason?: string }
  | null = null;

function clearSubscriptionEnv(provider: SubscriptionProvider): void {
  if (provider === "anthropic-subscription") {
    delete process.env.ANTHROPIC_API_KEY;
    return;
  }
  if (provider === "openai-codex") {
    delete process.env.OPENAI_API_KEY;
  }
}

function toOpenAiProbeReason(
  status: number,
  payload: Record<string, unknown> | null,
): string {
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : typeof (payload?.error as { message?: unknown } | undefined)?.message ===
          "string"
        ? ((payload?.error as { message?: string }).message ?? "")
        : "";
  return message || `HTTP ${status}`;
}

function isFatalOpenAiTokenScopeFailure(status: number, reason: string): boolean {
  const lower = reason.toLowerCase();
  if (status === 401) return true;
  return (
    lower.includes("missing scopes: model.request") ||
    lower.includes("insufficient permissions for this operation") ||
    lower.includes("invalid api key")
  );
}

async function probeOpenAiTokenForModelRequest(
  token: string,
): Promise<{ valid: boolean; reason?: string }> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  if (
    _openAiScopeProbeCache &&
    _openAiScopeProbeCache.tokenHash === tokenHash &&
    now - _openAiScopeProbeCache.checkedAt < OPENAI_SCOPE_PROBE_TTL_MS
  ) {
    return {
      valid: _openAiScopeProbeCache.valid,
      reason: _openAiScopeProbeCache.reason,
    };
  }

  const model = process.env.MILAIDY_OPENAI_SCOPE_CHECK_MODEL?.trim() || "gpt-5";
  let result: { valid: boolean; reason?: string } = { valid: true };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "healthcheck" }],
        max_completion_tokens: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      const reason = toOpenAiProbeReason(response.status, payload);
      if (isFatalOpenAiTokenScopeFailure(response.status, reason)) {
        result = { valid: false, reason };
      } else {
        logger.warn(
          `[auth] OpenAI Codex scope probe returned non-fatal status ${response.status}; treating token as usable (${reason})`,
        );
      }
    }
  } catch (err) {
    logger.warn(
      `[auth] OpenAI Codex scope probe request failed; treating token as usable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  _openAiScopeProbeCache = {
    tokenHash,
    checkedAt: now,
    valid: result.valid,
    reason: result.reason,
  };

  return result;
}

/**
 * Ensure migration has been attempted.
 * Called lazily on first credential access.
 */
async function ensureMigrated(): Promise<void> {
  if (_migrationAttempted) return;
  _migrationAttempted = true;

  if (needsMigration()) {
    logger.info("[auth] Migrating credentials to secure storage...");
    const result = await migrateCredentials();

    if (result.migrated.length > 0) {
      logger.info(
        `[auth] Migration complete: ${result.migrated.join(", ")}`,
      );
    }
  }
}

/**
 * Get the storage key for a provider's credentials.
 */
function storageKey(provider: SubscriptionProvider): string {
  return `credentials:${provider}`;
}

/**
 * Save credentials for a provider to secure storage.
 */
export async function saveCredentials(
  provider: SubscriptionProvider,
  credentials: OAuthCredentials,
): Promise<void> {
  await ensureMigrated();

  const stored: StoredCredentials = {
    provider,
    credentials,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const storage = await getSecureStorage();
  await storage.set(storageKey(provider), JSON.stringify(stored));

  logger.info(`[auth] Saved ${provider} credentials (${storage.name} backend)`);
}

/**
 * Load stored credentials for a provider.
 */
export async function loadCredentials(
  provider: SubscriptionProvider,
): Promise<StoredCredentials | null> {
  await ensureMigrated();

  const storage = await getSecureStorage();
  const data = await storage.get(storageKey(provider));

  if (!data) return null;

  try {
    return JSON.parse(data) as StoredCredentials;
  } catch {
    logger.error(`[auth] Failed to parse credentials for ${provider}`);
    return null;
  }
}

/**
 * Delete stored credentials for a provider.
 */
export async function deleteCredentials(
  provider: SubscriptionProvider,
): Promise<void> {
  await ensureMigrated();

  const storage = await getSecureStorage();
  await storage.delete(storageKey(provider));

  logger.info(`[auth] Deleted ${provider} credentials`);
}

/**
 * Check if credentials exist and are not expired.
 */
export async function hasValidCredentials(
  provider: SubscriptionProvider,
): Promise<boolean> {
  const stored = await loadCredentials(provider);
  if (!stored) return false;
  return stored.credentials.expires > Date.now();
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if no credentials stored or refresh fails.
 */
export async function getAccessToken(
  provider: SubscriptionProvider,
): Promise<string | null> {
  const stored = await loadCredentials(provider);
  if (!stored) return null;

  const { credentials } = stored;

  // Token still valid
  if (credentials.expires > Date.now() + REFRESH_BUFFER_MS) {
    return credentials.access;
  }

  // Need to refresh
  logger.info(`[auth] Refreshing ${provider} token...`);

  try {
    let refreshed: OAuthCredentials;

    if (provider === "anthropic-subscription") {
      refreshed = await refreshAnthropicToken(credentials.refresh);
    } else if (provider === "openai-codex") {
      refreshed = await refreshCodexToken(credentials.refresh);
    } else {
      logger.error(`[auth] Unknown provider: ${provider}`);
      return null;
    }

    // Save refreshed credentials
    await saveCredentials(provider, refreshed);
    return refreshed.access;
  } catch (err) {
    logger.error(`[auth] Failed to refresh ${provider} token: ${err}`);
    return null;
  }
}

/**
 * Get all configured subscription providers and their status.
 */
export async function getSubscriptionStatus(): Promise<
  Array<{
    provider: SubscriptionProvider;
    configured: boolean;
    valid: boolean;
    expiresAt: number | null;
  }>
> {
  const providers: SubscriptionProvider[] = [
    "anthropic-subscription",
    "openai-codex",
  ];

  const results = await Promise.all(
    providers.map(async (provider) => {
      const stored = await loadCredentials(provider);
      if (!stored) {
        return {
          provider,
          configured: false,
          valid: false,
          expiresAt: null,
        };
      }

      const token = await getAccessToken(provider);
      const latest = await loadCredentials(provider);
      const expiresAt = latest?.credentials.expires ?? stored.credentials.expires;
      return {
        provider,
        configured: true,
        valid: Boolean(token) && expiresAt > Date.now(),
        expiresAt,
      };
    }),
  );

  return results;
}

export async function validateOpenAiCodexAccess(): Promise<{
  valid: boolean;
  reason?: string;
}> {
  const token = await getAccessToken("openai-codex");
  if (!token) {
    return { valid: false, reason: "No OpenAI Codex token available" };
  }
  return probeOpenAiTokenForModelRequest(token);
}

/**
 * Apply subscription credentials to the environment.
 * Called at startup to make credentials available to ElizaOS plugins.
 */
export async function applySubscriptionCredentials(): Promise<void> {
  // Ensure migration has happened
  await ensureMigrated();

  // Anthropic subscription → set ANTHROPIC_API_KEY
  const anthropicToken = await getAccessToken("anthropic-subscription");
  if (anthropicToken) {
    process.env.ANTHROPIC_API_KEY = anthropicToken;
    logger.info(
      "[auth] Applied Anthropic subscription credentials to environment",
    );
  } else {
    clearSubscriptionEnv("anthropic-subscription");
  }

  // OpenAI Codex subscription → set OPENAI_API_KEY
  const codexToken = await getAccessToken("openai-codex");
  if (codexToken) {
    const validation = await probeOpenAiTokenForModelRequest(codexToken);
    if (validation.valid) {
      process.env.OPENAI_API_KEY = codexToken;
      logger.info(
        "[auth] Applied OpenAI Codex subscription credentials to environment",
      );
    } else {
      clearSubscriptionEnv("openai-codex");
      logger.warn(
        `[auth] OpenAI Codex token lacks required API scope; not applying OPENAI_API_KEY (${validation.reason ?? "unknown reason"})`,
      );
    }
  } else {
    clearSubscriptionEnv("openai-codex");
  }
}

async function runRefreshPass(reason: string): Promise<void> {
  if (_refreshInFlight) {
    return _refreshInFlight;
  }

  _refreshInFlight = (async () => {
    try {
      await applySubscriptionCredentials();
      logger.debug(`[auth] Subscription refresh pass complete (${reason})`);
    } catch (err) {
      logger.warn(
        `[auth] Subscription refresh pass failed (${reason}): ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

export async function startSubscriptionCredentialRefreshLoop(
  intervalMs = DEFAULT_REFRESH_LOOP_MS,
): Promise<void> {
  const normalizedInterval = Number.isFinite(intervalMs)
    ? Math.max(intervalMs, MIN_REFRESH_LOOP_MS)
    : DEFAULT_REFRESH_LOOP_MS;

  stopSubscriptionCredentialRefreshLoop();
  await runRefreshPass("start");

  _refreshInterval = setInterval(() => {
    void runRefreshPass("interval");
  }, normalizedInterval);

  if (typeof _refreshInterval.unref === "function") {
    _refreshInterval.unref();
  }

  logger.info(
    `[auth] Subscription refresh loop active (${Math.round(normalizedInterval / 1000)}s interval)`,
  );
}

export function stopSubscriptionCredentialRefreshLoop(): void {
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
    logger.info("[auth] Subscription refresh loop stopped");
  }
}

// ---------- Synchronous shims for backwards compatibility ----------
// These wrap async functions for code that can't easily be made async.
// Prefer using the async versions above.

/** @deprecated Use async loadCredentials instead. */
export function loadCredentialsSync(
  provider: SubscriptionProvider,
): StoredCredentials | null {
  logger.warn(
    "[auth] loadCredentialsSync is deprecated, use async loadCredentials",
  );
  // Return null - caller should migrate to async
  return null;
}

/** @deprecated Use async hasValidCredentials instead. */
export function hasValidCredentialsSync(
  _provider: SubscriptionProvider,
): boolean {
  logger.warn(
    "[auth] hasValidCredentialsSync is deprecated, use async hasValidCredentials",
  );
  return false;
}
