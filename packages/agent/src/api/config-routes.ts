import type http from "node:http";
import { logger } from "@elizaos/core";
import {
  isMiladySettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@miladyai/shared";
import type { ElizaConfig } from "../config/config.js";
import { saveElizaConfig } from "../config/config.js";
import {
  normalizeDeploymentTargetConfig,
  normalizeLinkedAccountsConfig,
  normalizeServiceRoutingConfig,
} from "../contracts/service-routing.js";
import { runSerializedConfigMutation } from "./config-mutation.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import { applyCanonicalOnboardingConfig } from "./provider-switch-config.js";

const ALICE_CONFIG_TOP_KEYS = new Set([
  "ui",
  "agents",
  "messages",
  "media",
  "connectors",
  "env",
  "linkedAccounts",
  "serviceRouting",
]);
const ALICE_ENV_NAME = /^(?:DISCORD_|TELEGRAM_)/;
const ALICE_ENV_EXACT_NAMES = new Set([
  "CODEX_CLI_SMALL_MODEL",
  "CODEX_CLI_LARGE_MODEL",
  "CODEX_REASONING_EFFORT",
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_DEFAULT_SESSION_ID",
]);
const ALICE_AGENT_ENTRY_KEYS = new Set([
  "id",
  "default",
  "name",
  "username",
  "bio",
  "system",
  "adjectives",
  "topics",
  "style",
  "messageExamples",
  "postExamples",
]);
function aliceConfigPayloadRejection(
  body: Record<string, unknown>,
): string | null {
  if (
    process.env.ALICE_RUNTIME_AUTHORITY_MODE !== "proposer-only" ||
    process.env.ALICE_RUNTIME_PROFILE !== "full-gated"
  ) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALICE_CONFIG_TOP_KEYS.has(key)) {
      return `Unsupported Alice setting: ${key}`;
    }
  }
  const env = body.env;
  if (
    env !== undefined &&
    env !== null &&
    (typeof env !== "object" || Array.isArray(env))
  ) {
    return "Alice env setting must be an object";
  }
  if (
    env !== undefined &&
    env !== null &&
    typeof env === "object" &&
    !Array.isArray(env)
  ) {
    for (const key of Object.keys(env as Record<string, unknown>)) {
      if (key === "shellEnv") return "Unsupported Alice setting: env.shellEnv";
      if (
        key !== "vars" &&
        !ALICE_ENV_NAME.test(key) &&
        !ALICE_ENV_EXACT_NAMES.has(key)
      ) {
        return `Unsupported Alice environment setting: ${key}`;
      }
    }
    const vars = (env as Record<string, unknown>).vars;
    if (
      vars !== undefined &&
      vars !== null &&
      typeof vars === "object" &&
      !Array.isArray(vars)
    ) {
      for (const key of Object.keys(vars as Record<string, unknown>)) {
        if (!ALICE_ENV_NAME.test(key) && !ALICE_ENV_EXACT_NAMES.has(key)) {
          return `Unsupported Alice environment setting: env.vars.${key}`;
        }
      }
    }
  }
  const agents = body.agents;
  if (
    agents !== undefined &&
    agents !== null &&
    (typeof agents !== "object" || Array.isArray(agents))
  ) {
    return "Alice agents setting must be an object";
  }
  if (
    agents !== undefined &&
    agents !== null &&
    typeof agents === "object" &&
    !Array.isArray(agents)
  ) {
    const agentConfig = agents as Record<string, unknown>;
    for (const key of Object.keys(agentConfig)) {
      if (key !== "list" && key !== "defaults")
        return `Unsupported Alice agent setting: agents.${key}`;
    }
    const list = agentConfig.list;
    if (list !== undefined) {
      if (!Array.isArray(list)) return "Alice agents.list must be an array";
      for (const [index, entry] of list.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return `Alice agents.list[${index}] must be an object`;
        }
        for (const key of Object.keys(entry as Record<string, unknown>)) {
          if (!ALICE_AGENT_ENTRY_KEYS.has(key))
            return `Unsupported Alice agent setting: agents.list[].${key}`;
        }
      }
    }
    const defaults = agentConfig.defaults;
    if (defaults !== undefined) {
      if (
        !defaults ||
        typeof defaults !== "object" ||
        Array.isArray(defaults)
      ) {
        return "Alice agents.defaults must be an object";
      }
      for (const key of Object.keys(defaults as Record<string, unknown>)) {
        if (key !== "model" && key !== "subscriptionProvider") {
          return `Unsupported Alice agent setting: agents.defaults.${key}`;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  config: ElizaConfig;
  // Helpers from server.ts
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  // Server.ts internal helpers passed through
  redactConfigSecrets: (
    config: Record<string, unknown>,
  ) => Record<string, unknown>;
  isBlockedObjectKey: (key: string) => boolean;
  stripRedactedPlaceholderValuesDeep: (value: unknown) => void;
  patchTouchesProviderSelection: (filtered: Record<string, unknown>) => boolean;
  BLOCKED_ENV_KEYS: Set<string>;
  CONFIG_WRITE_ALLOWED_TOP_KEYS: Set<string>;
  saveElizaConfig?: (config: ElizaConfig) => void | Promise<void>;
  resolveMcpServersRejection: (
    servers: Record<string, unknown>,
  ) => Promise<string | null>;
  resolveMcpTerminalAuthorizationRejection: (
    req: http.IncomingMessage,
    servers: Record<string, unknown>,
    body: { terminalToken?: string },
  ) => { reason: string; status: number } | null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle configuration routes (GET/PUT /api/config, GET /api/config/schema).
 * Returns `true` if the request was handled.
 */
export async function handleConfigRoutes(
  ctx: ConfigRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    config,
    json,
    error,
    readJsonBody,
    redactConfigSecrets,
    isBlockedObjectKey,
    stripRedactedPlaceholderValuesDeep,
    BLOCKED_ENV_KEYS,
    CONFIG_WRITE_ALLOWED_TOP_KEYS,
    saveElizaConfig: saveConfig = saveElizaConfig,
    resolveMcpServersRejection,
    resolveMcpTerminalAuthorizationRejection,
  } = ctx;

  // ── GET /api/config/schema ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config/schema") {
    const { buildConfigSchema } = await import("../config/schema.js");
    const result = buildConfigSchema();
    json(res, result);
    return true;
  }

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config") {
    if (isMiladySettingsDebugEnabled()) {
      const cfg = config as Record<string, unknown>;
      const cloud = cfg.cloud as Record<string, unknown> | undefined;
      logger.debug(
        `[milady][settings][api] GET /api/config → respond (redacted) topKeys=${Object.keys(cfg).sort().join(",")} cloud=${JSON.stringify(settingsDebugCloudSummary(cloud))}`,
      );
    }
    json(
      res,
      redactConfigSecrets(config as unknown as Record<string, unknown>),
    );
    return true;
  }

  // ── PUT /api/config ─────────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/config") {
    const body = await readJsonBody(req, res);
    if (!body) return true;
    const alicePayloadRejection = aliceConfigPayloadRejection(
      body as Record<string, unknown>,
    );
    if (alicePayloadRejection) {
      error(res, alicePayloadRejection, 400);
      return true;
    }

    if (isMiladySettingsDebugEnabled()) {
      const b = body as Record<string, unknown>;
      const cloudBefore = (config as Record<string, unknown>).cloud as
        | Record<string, unknown>
        | undefined;
      logger.debug(
        `[milady][settings][api] PUT /api/config ← body topKeys=${Object.keys(b).sort().join(",")} snapshot=${JSON.stringify(sanitizeForSettingsDebug(b))}`,
      );
      logger.debug(
        `[milady][settings][api] PUT /api/config state.config.cloud(before)=${JSON.stringify(settingsDebugCloudSummary(cloudBefore))}`,
      );
    }

    // --- Security: validate and safely merge config updates ----------------

    /**
     * Deep-merge `src` into `target`, only touching keys present in `src`.
     * Prevents prototype pollution by rejecting dangerous key names at every
     * level.  Performs a recursive merge for plain objects so that partial
     * updates don't wipe sibling keys.
     */
    function safeMerge(
      target: Record<string, unknown>,
      src: Record<string, unknown>,
    ): void {
      for (const key of Object.keys(src)) {
        if (isBlockedObjectKey(key)) continue;
        const srcVal = src[key];
        const tgtVal = target[key];
        if (
          srcVal !== null &&
          typeof srcVal === "object" &&
          !Array.isArray(srcVal) &&
          tgtVal !== null &&
          typeof tgtVal === "object" &&
          !Array.isArray(tgtVal)
        ) {
          safeMerge(
            tgtVal as Record<string, unknown>,
            srcVal as Record<string, unknown>,
          );
        } else {
          target[key] = srcVal;
        }
      }
    }

    // Filter to allowed top-level keys, then deep-merge.
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (CONFIG_WRITE_ALLOWED_TOP_KEYS.has(key) && !isBlockedObjectKey(key)) {
        filtered[key] = (body as Record<string, unknown>)[key];
      }
    }

    // Security: keep auth/step-up secrets out of API-driven config writes so
    // secret rotation remains an out-of-band operation.
    if (
      filtered.env &&
      typeof filtered.env === "object" &&
      !Array.isArray(filtered.env)
    ) {
      const envPatch = filtered.env as Record<string, unknown>;
      // Defense-in-depth: strip step-up secrets from persisted config before
      // merge, even though BLOCKED_ENV_KEYS also blocks them during process.env
      // sync below. Keeping both guards prevents accidental persistence if one
      // path changes in future refactors.
      delete envPatch.MILADY_API_TOKEN;
      delete envPatch.ELIZA_API_TOKEN;
      delete envPatch.MILADY_WALLET_EXPORT_TOKEN;
      delete envPatch.ELIZA_WALLET_EXPORT_TOKEN;
      delete envPatch.MILADY_TERMINAL_RUN_TOKEN;
      delete envPatch.ELIZA_TERMINAL_RUN_TOKEN;
      delete envPatch.HYPERSCAPE_AUTH_TOKEN;
      delete envPatch.EVM_PRIVATE_KEY;
      delete envPatch.SOLANA_PRIVATE_KEY;
      delete envPatch.GITHUB_TOKEN;
      if (
        envPatch.vars &&
        typeof envPatch.vars === "object" &&
        !Array.isArray(envPatch.vars)
      ) {
        const vars = envPatch.vars as Record<string, unknown>;
        delete vars.MILADY_API_TOKEN;
        delete vars.ELIZA_API_TOKEN;
        delete vars.MILADY_WALLET_EXPORT_TOKEN;
        delete vars.ELIZA_WALLET_EXPORT_TOKEN;
        delete vars.MILADY_TERMINAL_RUN_TOKEN;
        delete vars.ELIZA_TERMINAL_RUN_TOKEN;
        delete vars.HYPERSCAPE_AUTH_TOKEN;
        delete vars.EVM_PRIVATE_KEY;
        delete vars.SOLANA_PRIVATE_KEY;
        delete vars.GITHUB_TOKEN;
      }

      // Defense-in-depth: strip ALL BLOCKED_ENV_KEYS from the env patch
      // before safeMerge.  The explicit deletes above cover known step-up
      // secrets; this loop catches process-level injection keys
      // (NODE_OPTIONS, LD_PRELOAD, etc.) so they never reach
      // saveElizaConfig() and the persistence→restart RCE chain is closed.
      for (const key of Object.keys(envPatch)) {
        if (key === "vars" || key === "shellEnv") continue;
        if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) {
          delete envPatch[key];
        }
      }
      if (
        envPatch.vars &&
        typeof envPatch.vars === "object" &&
        !Array.isArray(envPatch.vars)
      ) {
        const innerVars = envPatch.vars as Record<string, unknown>;
        for (const key of Object.keys(innerVars)) {
          if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) {
            delete innerVars[key];
          }
        }
      }
    }

    if (
      filtered.mcp &&
      typeof filtered.mcp === "object" &&
      !Array.isArray(filtered.mcp)
    ) {
      const mcpPatch = filtered.mcp as Record<string, unknown>;
      if (mcpPatch.servers !== undefined) {
        if (
          !mcpPatch.servers ||
          typeof mcpPatch.servers !== "object" ||
          Array.isArray(mcpPatch.servers)
        ) {
          error(res, "mcp.servers must be a JSON object", 400);
          return true;
        }
        const mcpRejection = await resolveMcpServersRejection(
          mcpPatch.servers as Record<string, unknown>,
        );
        if (mcpRejection) {
          error(res, mcpRejection, 400);
          return true;
        }
        const mcpTerminalRejection = resolveMcpTerminalAuthorizationRejection(
          req,
          mcpPatch.servers as Record<string, unknown>,
          body as { terminalToken?: string },
        );
        if (mcpTerminalRejection) {
          error(
            res,
            `Configuring stdio MCP servers via /api/config requires terminal authorization. ${mcpTerminalRejection.reason}`,
            mcpTerminalRejection.status,
          );
          return true;
        }
      }
    }

    // Strip "[REDACTED]" from the whole patch (GET → PUT round-trips).
    stripRedactedPlaceholderValuesDeep(filtered);

    const explicitConnectionRequested = Object.hasOwn(
      body as Record<string, unknown>,
      "connection",
    );
    const canonicalDeploymentTargetRequested = Object.hasOwn(
      filtered,
      "deploymentTarget",
    );
    const canonicalLinkedAccountsRequested = Object.hasOwn(
      filtered,
      "linkedAccounts",
    );
    const canonicalServiceRoutingRequested = Object.hasOwn(
      filtered,
      "serviceRouting",
    );
    const normalizedDeploymentTarget = canonicalDeploymentTargetRequested
      ? normalizeDeploymentTargetConfig(filtered.deploymentTarget)
      : undefined;
    const normalizedLinkedAccounts = canonicalLinkedAccountsRequested
      ? normalizeLinkedAccountsConfig(filtered.linkedAccounts)
      : undefined;
    const normalizedServiceRouting = canonicalServiceRoutingRequested
      ? normalizeServiceRoutingConfig(filtered.serviceRouting)
      : undefined;
    if (explicitConnectionRequested) {
      error(
        res,
        "connection patches are no longer supported; update deploymentTarget, linkedAccounts, and serviceRouting directly",
        400,
      );
      return true;
    }

    if (isMiladySettingsDebugEnabled()) {
      logger.debug(
        `[milady][settings][api] PUT /api/config filtered topKeys=${Object.keys(filtered).sort().join(",")} snapshot=${JSON.stringify(sanitizeForSettingsDebug(filtered))}`,
      );
    }

    const originalConfigSnapshot = JSON.stringify(config);
    const candidateConfig = structuredClone(config);
    safeMerge(candidateConfig as Record<string, unknown>, filtered);

    if (
      filtered.env &&
      typeof filtered.env === "object" &&
      !Array.isArray(filtered.env)
    ) {
      // Keep config clean: drop empty env.vars entries so we don't persist
      // null/empty-string tombstones forever.
      const cfgEnv = (candidateConfig as Record<string, unknown>).env;
      if (cfgEnv && typeof cfgEnv === "object" && !Array.isArray(cfgEnv)) {
        const cfgVars = (cfgEnv as Record<string, unknown>).vars;
        if (cfgVars && typeof cfgVars === "object" && !Array.isArray(cfgVars)) {
          for (const [k, v] of Object.entries(
            cfgVars as Record<string, unknown>,
          )) {
            if (typeof v !== "string" || !v.trim()) {
              delete (cfgVars as Record<string, unknown>)[k];
            }
          }
        }
      }
    }

    if (
      canonicalDeploymentTargetRequested ||
      canonicalLinkedAccountsRequested ||
      canonicalServiceRoutingRequested
    ) {
      applyCanonicalOnboardingConfig(candidateConfig, {
        deploymentTarget: normalizedDeploymentTarget,
        linkedAccounts: normalizedLinkedAccounts,
        serviceRouting: normalizedServiceRouting,
      });
    }

    try {
      await runSerializedConfigMutation(config as object, async () => {
        if (JSON.stringify(config) !== originalConfigSnapshot) {
          throw new Error("concurrent config update");
        }
        await saveConfig(candidateConfig);
        for (const key of Object.keys(config as Record<string, unknown>)) {
          if (!Object.hasOwn(candidateConfig, key)) {
            delete (config as Record<string, unknown>)[key];
          }
        }
        Object.assign(config, candidateConfig);
        if (
          filtered.env &&
          typeof filtered.env === "object" &&
          !Array.isArray(filtered.env)
        ) {
          const envPatch = filtered.env as Record<string, unknown>;
          const vars = envPatch.vars;
          if (vars && typeof vars === "object" && !Array.isArray(vars)) {
            for (const [k, v] of Object.entries(
              vars as Record<string, unknown>,
            )) {
              if (BLOCKED_ENV_KEYS.has(k.toUpperCase())) continue;
              const str = typeof v === "string" ? v : "";
              if (str.trim()) process.env[k] = str;
              else delete process.env[k];
            }
          }
          for (const [k, v] of Object.entries(envPatch)) {
            if (k === "vars" || k === "shellEnv") continue;
            if (BLOCKED_ENV_KEYS.has(k.toUpperCase())) continue;
            if (typeof v !== "string") continue;
            if (v.trim()) process.env[k] = v;
            else delete process.env[k];
          }
        }
      });
      if (isMiladySettingsDebugEnabled()) {
        const cfg = config as Record<string, unknown>;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        logger.debug(
          `[milady][settings][api] PUT /api/config → saveElizaConfig OK cloud(after)=${JSON.stringify(settingsDebugCloudSummary(cloud))}`,
        );
      }
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
      error(res, "Config save failed", 503);
      return true;
    }
    json(
      res,
      redactConfigSecrets(config as unknown as Record<string, unknown>),
    );
    return true;
  }

  return false;
}
