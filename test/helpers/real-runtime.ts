/**
 * Real runtime helper for integration tests.
 *
 * Extends pglite-runtime.ts with optional real LLM and connector plugins.
 * This is the primary helper for converting mocked tests to real integration tests.
 *
 * Usage:
 *   import { createRealTestRuntime } from "../../test/helpers/real-runtime";
 *
 *   let runtime: AgentRuntime;
 *   let cleanup: () => Promise<void>;
 *
 *   beforeAll(async () => {
 *     ({ runtime, cleanup } = await createRealTestRuntime({ withLLM: true }));
 *   }, 180_000);
 *
 *   afterAll(async () => { await cleanup(); });
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "@elizaos/core";
import { AgentRuntime, createCharacter, logger } from "@elizaos/core";
import {
  selectLiveProvider,
  type LiveProviderConfig,
  type LiveProviderName,
} from "./live-provider";

export interface RealTestRuntimeOptions {
  /** Name for the test agent character. Defaults to "TestAgent". */
  characterName?: string;
  /** Additional plugins to register. */
  plugins?: Plugin[];
  /** Register a real LLM plugin based on available API keys. Default: false. */
  withLLM?: boolean;
  /** Preferred LLM provider (e.g., "groq" for cheapest). */
  preferredProvider?: LiveProviderName;
  /** Register Discord plugin if DISCORD_BOT_TOKEN is available. Default: false. */
  withDiscord?: boolean;
  /** Register Telegram plugin if TELEGRAM_BOT_TOKEN is available. Default: false. */
  withTelegram?: boolean;
  /** Reuse an existing PGLite data directory. */
  pgliteDir?: string;
  /** Remove PGLite dir on cleanup. Defaults to true when dir is auto-created. */
  removePgliteDirOnCleanup?: boolean;
}

export interface RealTestRuntimeResult {
  runtime: AgentRuntime;
  pgliteDir: string;
  /** Which LLM provider was registered (null if withLLM was false or none available). */
  providerName: LiveProviderName | null;
  /** The full provider config if an LLM was registered. */
  providerConfig: LiveProviderConfig | null;
  /** Stops the runtime and removes the temp PGLite directory. */
  cleanup: () => Promise<void>;
}

/**
 * Create a real AgentRuntime with PGLite database and optional real LLM/connectors.
 *
 * This is the go-to helper for integration tests. It creates a fully initialized
 * runtime backed by a real in-process PGLite database, with optional real LLM
 * inference and connector plugins.
 */
export async function createRealTestRuntime(
  options?: RealTestRuntimeOptions,
): Promise<RealTestRuntimeResult> {
  const pgliteDir =
    options?.pgliteDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "eliza-real-test-"));
  const removePgliteDirOnCleanup =
    options?.removePgliteDirOnCleanup ?? options?.pgliteDir === undefined;

  const prevPgliteDir = process.env.PGLITE_DATA_DIR;
  process.env.PGLITE_DATA_DIR = pgliteDir;

  // Apply local embedding defaults so PGLite vector search works
  if (!process.env.LOCAL_EMBEDDING_DIMENSIONS?.trim()) {
    process.env.LOCAL_EMBEDDING_DIMENSIONS = "384";
  }
  if (!process.env.EMBEDDING_DIMENSION?.trim()) {
    process.env.EMBEDDING_DIMENSION = "384";
  }

  const character = createCharacter({
    name: options?.characterName ?? "TestAgent",
  });

  const runtime = new AgentRuntime({
    character,
    plugins: [],
    logLevel: "warn",
    enableAutonomy: false,
  });

  // Always register plugin-sql for PGLite database
  const { default: pluginSql } = await import("@elizaos/plugin-sql");
  await runtime.registerPlugin(pluginSql);

  // Register LLM plugin if requested
  let providerName: LiveProviderName | null = null;
  let providerConfig: LiveProviderConfig | null = null;

  if (options?.withLLM) {
    providerConfig = selectLiveProvider(options.preferredProvider);
    if (providerConfig) {
      providerName = providerConfig.name;
      // Set provider env vars so the plugin picks them up
      for (const [key, value] of Object.entries(providerConfig.env)) {
        process.env[key] = value;
      }
      try {
        const pluginModule = await import(providerConfig.pluginPackage);
        const plugin = pluginModule.default ?? pluginModule.elizaPlugin;
        if (plugin) {
          await runtime.registerPlugin(plugin);
          logger.info(
            `[real-runtime] Registered LLM plugin: ${providerConfig.pluginPackage} (${providerName})`,
          );
        }
      } catch (err) {
        logger.warn(
          `[real-runtime] Failed to register LLM plugin ${providerConfig.pluginPackage}: ${err}`,
        );
        providerName = null;
        providerConfig = null;
      }
    }
  }

  // Register Discord plugin if requested and token available
  if (options?.withDiscord && process.env.DISCORD_BOT_TOKEN?.trim()) {
    try {
      const discordModule = await import("@elizaos/plugin-discord");
      const plugin = discordModule.default ?? discordModule.elizaPlugin;
      if (plugin) {
        await runtime.registerPlugin(plugin);
        logger.info("[real-runtime] Registered Discord plugin");
      }
    } catch (err) {
      logger.warn(`[real-runtime] Failed to register Discord plugin: ${err}`);
    }
  }

  // Register Telegram plugin if requested and token available
  if (options?.withTelegram && process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    try {
      const telegramModule = await import("@elizaos/plugin-telegram");
      const plugin = telegramModule.default ?? telegramModule.elizaPlugin;
      if (plugin) {
        await runtime.registerPlugin(plugin);
        logger.info("[real-runtime] Registered Telegram plugin");
      }
    } catch (err) {
      logger.warn(`[real-runtime] Failed to register Telegram plugin: ${err}`);
    }
  }

  // Register any additional plugins
  for (const plugin of options?.plugins ?? []) {
    await runtime.registerPlugin(plugin);
  }

  await runtime.initialize();

  const cleanup = async () => {
    try {
      await runtime.stop();
    } catch (err) {
      logger.debug(`[real-runtime] runtime.stop() error: ${err}`);
    }
    // Restore previous env
    if (prevPgliteDir !== undefined) {
      process.env.PGLITE_DATA_DIR = prevPgliteDir;
    } else {
      delete process.env.PGLITE_DATA_DIR;
    }
    if (removePgliteDirOnCleanup) {
      try {
        fs.rmSync(pgliteDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  };

  return { runtime, pgliteDir, providerName, providerConfig, cleanup };
}
