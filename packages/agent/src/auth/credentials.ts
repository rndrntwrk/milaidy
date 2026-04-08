/**
 * Credential storage and token refresh for subscription providers.
 *
 * Stores OAuth credentials in ~/.eliza/auth/ as JSON files.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import { refreshAnthropicToken } from "./anthropic.js";
import { refreshCodexToken } from "./openai-codex.js";
import {
  type OAuthCredentials,
  type StoredCredentials,
  SUBSCRIPTION_PROVIDER_MAP,
  type SubscriptionProvider,
} from "./types.js";

import { execSync } from "node:child_process";

const AUTH_DIR = path.join(
  process.env.ELIZA_HOME || path.join(os.homedir(), ".eliza"),
  "auth",
);

/** Buffer before expiry to trigger refresh (5 minutes) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  }
}

function credentialPath(provider: SubscriptionProvider): string {
  return path.join(AUTH_DIR, `${provider}.json`);
}

/**
 * Save credentials for a provider.
 */
export function saveCredentials(
  provider: SubscriptionProvider,
  credentials: OAuthCredentials,
): void {
  ensureAuthDir();
  const stored: StoredCredentials = {
    provider,
    credentials,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(credentialPath(provider), JSON.stringify(stored, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  logger.info(`[auth] Saved ${provider} credentials`);
}

/**
 * Load stored credentials for a provider.
 */
export function loadCredentials(
  provider: SubscriptionProvider,
): StoredCredentials | null {
  const filePath = credentialPath(provider);
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as StoredCredentials;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Delete stored credentials for a provider.
 */
export function deleteCredentials(provider: SubscriptionProvider): void {
  const filePath = credentialPath(provider);
  try {
    fs.unlinkSync(filePath);
    logger.info(`[auth] Deleted ${provider} credentials`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check if credentials exist and are not expired.
 */
export function hasValidCredentials(provider: SubscriptionProvider): boolean {
  const stored = loadCredentials(provider);
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
  const stored = loadCredentials(provider);
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
    saveCredentials(provider, refreshed);
    return refreshed.access;
  } catch (err) {
    logger.error(`[auth] Failed to refresh ${provider} token: ${err}`);
    return null;
  }
}

function readConfiguredAnthropicSetupToken(): string | null {
  const configPath =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    process.env.ELIZA_CONFIG_PATH?.trim() ||
    path.join(
      process.env.MILADY_STATE_DIR?.trim() ||
        process.env.ELIZA_STATE_DIR?.trim() ||
        path.join(os.homedir(), ".milady"),
      (process.env.ELIZA_NAMESPACE?.trim() || "milady") === "milady"
        ? "milady.json"
        : `${process.env.ELIZA_NAMESPACE?.trim()}.json`,
    );
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      env?: Record<string, unknown>;
    };
    const token = parsed.env?.__anthropicSubscriptionToken;
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function hasCodexCliSubscriptionAuth(): boolean {
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  try {
    const data = JSON.parse(fs.readFileSync(authPath, "utf-8")) as {
      auth_mode?: string;
      OPENAI_API_KEY?: string;
    };
    return Boolean(
      data.OPENAI_API_KEY?.trim() &&
        data.auth_mode?.trim() &&
        data.auth_mode.trim().toLowerCase() !== "api-key",
    );
  } catch {
    return false;
  }
}

/**
 * Get all configured subscription providers and their status.
 */
export function getSubscriptionStatus(): Array<{
  provider: SubscriptionProvider;
  configured: boolean;
  valid: boolean;
  expiresAt: number | null;
}> {
  const providers: SubscriptionProvider[] = [
    "anthropic-subscription",
    "openai-codex",
  ];
  return providers.map((provider) => {
    const stored = loadCredentials(provider);
    const importedClaudeAuth =
      provider === "anthropic-subscription"
        ? importClaudeCodeOAuthToken() ?? readConfiguredAnthropicSetupToken()
        : null;
    const importedCodexAuth =
      provider === "openai-codex" && hasCodexCliSubscriptionAuth();
    return {
      provider,
      configured: stored !== null || Boolean(importedClaudeAuth || importedCodexAuth),
      valid: stored
        ? stored.credentials.expires > Date.now()
        : Boolean(importedClaudeAuth || importedCodexAuth),
      expiresAt: stored?.credentials.expires ?? null,
    };
  });
}

/**
 * Try to import an OAuth token from Claude Code's keychain or credentials file.
 * Claude Code stores OAuth tokens that are valid for the Anthropic API when
 * used with the stealth interceptor.
 */
function importClaudeCodeOAuthToken(): string | null {
  // 1. Try ~/.claude/.credentials.json
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      const token =
        data?.claudeAiOauth?.accessToken ??
        data?.claudeAiOauth?.access_token;
      if (typeof token === "string" && token.trim()) {
        logger.info(
          "[auth] Imported OAuth token from Claude Code credentials file",
        );
        return token.trim();
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Try macOS Keychain
  if (process.platform === "darwin") {
    try {
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: "utf8", timeout: 3000 },
      ).trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        const token =
          parsed?.claudeAiOauth?.accessToken ??
          parsed?.claudeAiOauth?.access_token;
        if (typeof token === "string" && token.trim()) {
          logger.info(
            "[auth] Imported OAuth token from Claude Code keychain",
          );
          return token.trim();
        }
      }
    } catch {
      // Keychain not available or no entry
    }
  }

  return null;
}

/**
 * Apply subscription credentials to the environment.
 * Called at startup to make credentials available to elizaOS plugins.
 *
 * **Claude subscription tokens are NOT applied to the runtime environment.**
 * Anthropic's TOS only permits Claude subscription tokens to be used through
 * the Claude Code CLI itself.  Milady honours this by keeping the token
 * available for the task-agent orchestrator (which spawns `claude` CLI
 * subprocesses) but never injecting it into `process.env.ANTHROPIC_API_KEY`
 * or installing the stealth fetch interceptor.
 *
 * Codex / ChatGPT subscription tokens *are* applied to the environment
 * because OpenAI permits direct API usage with those tokens.
 *
 * When a `config` is provided and the active subscription provider has
 * credentials, `model.primary` is auto-set so the user doesn't need to
 * configure it manually — but only for providers whose tokens are applied
 * to the runtime (currently Codex only).
 */
export async function applySubscriptionCredentials(config?: {
  agents?: {
    defaults?: { subscriptionProvider?: string; model?: { primary?: string } };
  };
}): Promise<void> {
  // ── Anthropic subscription ────────────────────────────────────────────
  // We check whether the token exists (for status reporting) but do NOT
  // set it as ANTHROPIC_API_KEY.  The token is only usable through the
  // Claude Code CLI spawned by the task-agent orchestrator.
  let hasAnthropicSubscription = await getAccessToken(
    "anthropic-subscription",
  ).then((t) => t !== null);

  if (!hasAnthropicSubscription) {
    hasAnthropicSubscription = importClaudeCodeOAuthToken() !== null;
  }

  if (hasAnthropicSubscription) {
    logger.info(
      "[auth] Claude subscription detected — available for task agents only (TOS restriction). " +
        "Use Eliza Cloud, a direct Anthropic API key, or another provider for the main agent runtime.",
    );
  }

  // ── OpenAI Codex subscription → set OPENAI_API_KEY ────────────────────
  const codexToken = await getAccessToken("openai-codex");
  if (codexToken) {
    process.env.OPENAI_API_KEY = codexToken;
    logger.info(
      "[auth] Applied OpenAI Codex subscription credentials to environment",
    );
  }

  // Auto-set model.primary from subscription provider when the provider's
  // token is actually applied to the runtime.  Claude subscriptions are
  // excluded because their tokens aren't available for direct API use.
  if (config?.agents?.defaults) {
    const defaults = config.agents.defaults;
    const provider =
      defaults.subscriptionProvider as keyof typeof SUBSCRIPTION_PROVIDER_MAP;

    // Only auto-set for providers whose tokens are applied to the runtime.
    const runtimeApplicableProviders: ReadonlySet<string> = new Set([
      "openai-codex",
    ]);

    if (provider && runtimeApplicableProviders.has(provider)) {
      const modelId = SUBSCRIPTION_PROVIDER_MAP[provider];
      if (modelId) {
        if (!defaults.model) {
          defaults.model = { primary: modelId };
          logger.info(
            `[auth] Auto-set model.primary to "${modelId}" from subscription provider`,
          );
        } else if (!defaults.model.primary) {
          defaults.model.primary = modelId;
          logger.info(
            `[auth] Auto-set model.primary to "${modelId}" from subscription provider`,
          );
        }
      }
    }
  }
}
