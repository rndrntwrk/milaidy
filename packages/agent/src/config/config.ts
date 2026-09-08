import fs from "node:fs";
import path from "node:path";
import {
  isMiladySettingsDebugEnabled,
  migrateLegacyRuntimeConfig,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@miladyai/shared";
import JSON5 from "json5";
import { isAliceFullRuntimeProfile } from "../runtime/alice-runtime-profile.js";
import { createAliceRuntimeSql } from "../runtime/alice-runtime-sql.js";
import { syncSolanaPublicKeyEnv } from "../api/wallet.js";
import { createAliceConfigStore } from "./alice-config-store.js";
import { collectConfigEnvVars, collectConnectorEnvVars } from "./env-vars.js";
import { resolveConfigIncludes } from "./includes.js";
import { resolveConfigPath, resolveStateDir, resolveUserPath } from "./paths.js";
import type { ElizaConfig } from "./types.js";

export * from "./types.js";

let aliceStore: ReturnType<typeof createAliceConfigStore> | undefined;
let aliceConfig: ElizaConfig | null = null;
let aliceConfigLoaded = false;
let aliceInitialization: Promise<void> | undefined;
let aliceWriteTail = Promise.resolve();

/** Hydrate before either the API server or runtime reads startup settings. */
export async function initializeAliceConfigPersistence(): Promise<void> {
  if (!isAliceFullRuntimeProfile()) return;
  aliceInitialization ??= (async () => {
    aliceStore = createAliceConfigStore({
      db: createAliceRuntimeSql({ ownerId: process.env.ALICE_STATE_OWNER_ID ?? "" }),
      passphrase: process.env.ELIZA_VAULT_PASSPHRASE ?? "",
    });
    aliceConfig = await aliceStore.read() as ElizaConfig | null;
    aliceConfigLoaded = true;
  })();
  await aliceInitialization;
}

function resolveConfigWritePath(env: NodeJS.ProcessEnv = process.env): string {
  const persistPath =
    env.MILADY_PERSIST_CONFIG_PATH?.trim() ??
    env.ELIZA_PERSIST_CONFIG_PATH?.trim();
  return persistPath ? resolveUserPath(persistPath) : resolveConfigPath();
}

function applyConfigEnvToProcessEnv(entries: Record<string, string>): void {
  for (const [key, value] of Object.entries(entries)) {
    process.env[key] = value;
  }
}

function getConfigEnvString(
  config: ElizaConfig,
  key: string,
): string | undefined {
  const envConfig = config.env as
    | (Record<string, unknown> & { vars?: Record<string, unknown> })
    | undefined;
  const nestedVars =
    envConfig?.vars && typeof envConfig.vars === "object" && !Array.isArray(envConfig.vars)
      ? (envConfig.vars as Record<string, unknown>)
      : undefined;
  const value = nestedVars?.[key] ?? envConfig?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function mergeConfigRecords(
  base: unknown,
  overlay: unknown,
): unknown {
  if (overlay === undefined) {
    return base;
  }

  if (Array.isArray(overlay)) {
    return overlay.slice();
  }

  if (isPlainObject(base) && isPlainObject(overlay)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      merged[key] = mergeConfigRecords(base[key], value);
    }
    return merged;
  }

  return overlay;
}

function readConfigFile(configPath: string): ElizaConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  const parsed = JSON5.parse(raw) as Record<string, unknown>;
  return resolveConfigIncludes(parsed, configPath) as ElizaConfig;
}

export function loadElizaConfig(): ElizaConfig {
  const alice = isAliceFullRuntimeProfile();
  if (alice && !aliceConfigLoaded) throw new Error("ALICE_CONFIG_NOT_INITIALIZED");
  const configPath = resolveConfigPath();
  const persistPath = resolveConfigWritePath();

  const baseConfig = readConfigFile(configPath);
  const persistedConfig =
    alice ? structuredClone(aliceConfig) :
      persistPath !== configPath ? readConfigFile(persistPath) : null;
  const resolved = (
    baseConfig || persistedConfig
      ? mergeConfigRecords(baseConfig ?? {}, persistedConfig ?? {})
      : { logging: { level: "error" } }
  ) as ElizaConfig;
  migrateLegacyRuntimeConfig(resolved as Record<string, unknown>);

  const skillsJsonPath = path.join(resolveStateDir(), "skills.json");

  if (!fs.existsSync(skillsJsonPath)) {
    try {
      const skillsDir = path.dirname(skillsJsonPath);
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      fs.writeFileSync(
        skillsJsonPath,
        JSON.stringify({ extraDirs: [] }, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.warn(
        `[eliza] Failed to auto-create ~/.eliza/skills.json: ${String(err)}`,
      );
    }
  }

  if (fs.existsSync(skillsJsonPath)) {
    try {
      const skillsRaw = fs.readFileSync(skillsJsonPath, "utf-8");
      const skillsConfig = JSON5.parse(skillsRaw) as { extraDirs?: string[] };

      if (
        skillsConfig.extraDirs &&
        Array.isArray(skillsConfig.extraDirs) &&
        skillsConfig.extraDirs.length > 0
      ) {
        if (!resolved.skills) resolved.skills = {};
        if (!resolved.skills.load) resolved.skills.load = {};
        if (!resolved.skills.load.extraDirs) {
          resolved.skills.load.extraDirs = [];
        }

        const existing = new Set(resolved.skills.load.extraDirs);
        for (const dir of skillsConfig.extraDirs) {
          const loadedDir = resolveUserPath(dir);
          if (!existing.has(loadedDir)) {
            resolved.skills.load.extraDirs.push(loadedDir);
            existing.add(loadedDir);
          }
        }
      }
    } catch (err) {
      console.warn(
        `[eliza] Failed to load ~/.eliza/skills.json: ${String(err)}`,
      );
    }
  }

  if (!resolved.logging) {
    resolved.logging = { level: "error" };
  } else if (!resolved.logging.level) {
    resolved.logging.level = "error";
  }

  const envVars = collectConfigEnvVars(resolved);
  const connectorEnvVars = collectConnectorEnvVars(resolved);
  // Saved config is the source of truth for settings edited in the app.
  // If a key is persisted here, it should override any stale value that
  // arrived from .env or the parent shell.
  applyConfigEnvToProcessEnv(envVars);
  applyConfigEnvToProcessEnv(connectorEnvVars);

  const discordToken =
    process.env.DISCORD_API_TOKEN?.trim() ||
    process.env.DISCORD_BOT_TOKEN?.trim();
  if (discordToken) {
    process.env.DISCORD_API_TOKEN = discordToken;
    process.env.DISCORD_BOT_TOKEN = discordToken;
  }

  // Keep public-key aliases available when only the private key is configured.
  syncSolanaPublicKeyEnv(getConfigEnvString(resolved, "SOLANA_PRIVATE_KEY"));

  if (isMiladySettingsDebugEnabled()) {
    const cloud = resolved.cloud as Record<string, unknown> | undefined;
    console.debug("[milady][settings][loadElizaConfig]", {
      path: configPath,
      persistPath: persistPath !== configPath ? persistPath : undefined,
      topLevelKeys: Object.keys(resolved as object).sort(),
      cloud: settingsDebugCloudSummary(cloud),
      envVarKeysHydrated: Object.keys({
        ...envVars,
        ...connectorEnvVars,
      }).sort(),
      snapshot: sanitizeForSettingsDebug(resolved),
    });
  }

  return resolved;
}

function stripIncludeDirectives(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripIncludeDirectives);
  if (typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$include") continue;
    result[key] = stripIncludeDirectives(val);
  }
  return result;
}

function isWalletOsStoreEnabledInConfig(config: ElizaConfig): boolean {
  const envConfig = config.env;
  if (!envConfig || typeof envConfig !== "object" || Array.isArray(envConfig)) {
    return false;
  }

  const raw = envConfig.MILADY_WALLET_OS_STORE;
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "on" ||
    normalized === "yes"
  );
}

function stripWalletPrivateKeysFromConfig(config: ElizaConfig): void {
  const envConfig = config.env;
  if (!envConfig || typeof envConfig !== "object" || Array.isArray(envConfig)) {
    return;
  }

  delete envConfig.EVM_PRIVATE_KEY;
  delete envConfig.SOLANA_PRIVATE_KEY;

  const nestedVars =
    envConfig.vars &&
    typeof envConfig.vars === "object" &&
    !Array.isArray(envConfig.vars)
      ? envConfig.vars
      : undefined;
  if (nestedVars) {
    delete nestedVars.EVM_PRIVATE_KEY;
    delete nestedVars.SOLANA_PRIVATE_KEY;
  }
}

export function saveElizaConfig(config: ElizaConfig): void | Promise<void> {
  if (isAliceFullRuntimeProfile()) {
    if (!aliceStore || !aliceConfigLoaded) throw new Error("ALICE_CONFIG_NOT_INITIALIZED");
    const snapshot = stripIncludeDirectives(structuredClone(config)) as ElizaConfig;
    migrateLegacyRuntimeConfig(snapshot as Record<string, unknown>);
    if (isWalletOsStoreEnabledInConfig(snapshot)) stripWalletPrivateKeysFromConfig(snapshot);
    const store = aliceStore;
    const saved = aliceWriteTail.then(async () => {
      await store.write(snapshot as Record<string, unknown>);
      aliceConfig = snapshot;
    });
    aliceWriteTail = saved.catch(() => undefined);
    return saved;
  }
  const configPath = resolveConfigWritePath();
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  migrateLegacyRuntimeConfig(config as Record<string, unknown>);
  if (isWalletOsStoreEnabledInConfig(config)) {
    stripWalletPrivateKeysFromConfig(config);
  }
  const sanitized = stripIncludeDirectives(config);
  if (!sanitized || typeof sanitized !== "object") {
    throw new Error(
      `[eliza-config] stripIncludeDirectives returned invalid result: ${typeof sanitized}`,
    );
  }

  migrateLegacyRuntimeConfig(sanitized as Record<string, unknown>);
  if (isWalletOsStoreEnabledInConfig(sanitized as ElizaConfig)) {
    stripWalletPrivateKeysFromConfig(sanitized as ElizaConfig);
  }

  const content = `${JSON.stringify(sanitized, null, 2)}\n`;

  // Atomic write: write to a temp file then rename. If the process crashes
  // during writeFileSync, only the temp file is corrupted — the original
  // config remains intact. rename() is atomic on POSIX filesystems when
  // source and destination are on the same filesystem.
  //
  // Resolve symlinks so dotfile-managed setups (symlinked config) update
  // the target file instead of replacing the symlink with a regular file.
  const realConfigPath = fs.existsSync(configPath)
    ? fs.realpathSync(configPath)
    : configPath;
  const tmpPath = `${realConfigPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, {
    encoding: "utf-8",
    mode: 0o600,
  });
  fs.renameSync(tmpPath, realConfigPath);

  // Enforce 600 on every write — writeFileSync's mode only applies on
  // creation, so files created by older versions retain their original
  // (potentially world-readable) permissions.
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // chmodSync may fail on some platforms (e.g. Windows). Non-fatal.
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `[eliza-config] Config file missing after write: ${configPath}`,
    );
  }
  const stat = fs.statSync(configPath);
  if (stat.size === 0) {
    throw new Error(
      `[eliza-config] Config file is empty after write: ${configPath}`,
    );
  }

  if (isMiladySettingsDebugEnabled()) {
    const c = sanitized as Record<string, unknown>;
    const cloud = c.cloud as Record<string, unknown> | undefined;
    console.debug("[milady][settings][saveElizaConfig]", {
      path: configPath,
      bytes: stat.size,
      topLevelKeys: Object.keys(c).sort(),
      cloud: settingsDebugCloudSummary(cloud),
      snapshot: sanitizeForSettingsDebug(sanitized),
    });
  }
}

export function configFileExists(): boolean {
  const configPath = resolveConfigPath();
  if (fs.existsSync(configPath)) {
    return true;
  }

  const persistPath = resolveConfigWritePath();
  return persistPath !== configPath && fs.existsSync(persistPath);
}

// Backward-compat aliases for downstream forks using the old name
