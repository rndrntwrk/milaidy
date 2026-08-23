/**
 * Plugin name collection and validation.
 *
 * Determines which plugin packages should be loaded based on config,
 * environment variables, feature flags, and provider precedence rules.
 *
 * When callers pass a {@link PluginLoadReasons} map, the first source that
 * added each package is recorded so `resolvePlugins` (`plugin-resolver.ts`)
 * can explain optional load failures (config vs env vs feature flag).
 *
 * Extracted from eliza.ts to reduce file size.
 *
 * @module plugin-collector
 */
import {
  type ResolvedElizaCloudTopology,
  resolveElizaCloudTopology,
} from "@miladyai/shared/contracts";
import {
  hasExplicitCanonicalRuntimeConfig,
  migrateLegacyRuntimeConfig,
} from "@miladyai/shared/contracts/onboarding";
import type { ElizaConfig } from "../config/config.js";
import { CORE_PLUGINS } from "./core-plugins.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PI_AI_PLUGIN_PACKAGE = "@elizaos/plugin-pi-ai";
const STREAM555_PLUGIN_PACKAGE = "@rndrntwrk/plugin-555stream";
const FIVE55_GAMES_PLUGIN_PACKAGE = "@miladyai/agent/plugins/five55-games";
const ALICE_CORPUS_PLUGIN_PACKAGE = "@miladyai/agent/plugins/alice-corpus";

type ConfigEnvRecord = Record<string, unknown> & {
  vars?: Record<string, unknown>;
};

function isPiAiEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ELIZA_USE_PI_AI ?? env.MILADY_USE_PI_AI;
  if (!raw) return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isTruthyCloudEnvValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readStringConfigEnvValue(
  configEnv: ConfigEnvRecord | undefined,
  key: string,
): string | undefined {
  const fromVars =
    configEnv?.vars &&
    typeof configEnv.vars === "object" &&
    !Array.isArray(configEnv.vars)
      ? configEnv.vars[key]
      : undefined;
  const value = fromVars ?? configEnv?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasStream555RuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
  configEnv?: ConfigEnvRecord,
): boolean {
  const readValue = (key: string): string | undefined =>
    env[key]?.trim() || readStringConfigEnvValue(configEnv, key);
  const baseUrl = readValue("STREAM555_BASE_URL");
  const auth =
    readValue("STREAM555_AGENT_API_KEY") ||
    readValue("STREAM555_AGENT_TOKEN") ||
    readValue("STREAM_API_BEARER_TOKEN");
  return Boolean(baseUrl && auth);
}

/** Maps Eliza channel names to plugin package names. */
export const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  bluebubbles: "@elizaos/plugin-bluebubbles",
  discord: "@elizaos/plugin-discord",
  discordLocal: "@miladyai/plugin-discord-local",
  telegram: "@elizaos/plugin-telegram",
  telegramAccount: "@elizaos-plugins/client-telegram-account",
  slack: "@elizaos/plugin-slack",
  twitter: "@elizaos/plugin-twitter",
  whatsapp: "@elizaos/plugin-whatsapp",
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  farcaster: "@elizaos/plugin-farcaster",
  lens: "@elizaos/plugin-lens",
  msteams: "@elizaos/plugin-msteams",
  feishu: "@elizaos/plugin-feishu",
  matrix: "@elizaos/plugin-matrix",
  nostr: "@elizaos/plugin-nostr",
  blooio: "@elizaos/plugin-blooio",
  twitch: "@elizaos/plugin-twitch",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
};

/** Maps environment variable names to model-provider plugin packages. */
export const PROVIDER_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  GEMINI_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  DEEPSEEK_API_KEY: "@elizaos/plugin-deepseek",
  MISTRAL_API_KEY: "@elizaos/plugin-mistral",
  TOGETHER_API_KEY: "@elizaos/plugin-together",
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ZAI_API_KEY: "@homunculuslabs/plugin-zai",
  ELIZA_USE_PI_AI: PI_AI_PLUGIN_PACKAGE,
  MILADY_USE_PI_AI: PI_AI_PLUGIN_PACKAGE,
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/** Optional feature plugins keyed by feature name. */
export const OPTIONAL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  evm: "@elizaos/plugin-evm",
  solana: "@elizaos/plugin-solana",
  browser: "@elizaos/plugin-browser",
  "milady-browser": "@miladyai/plugin-milady-browser",
  miladyBrowser: "@miladyai/plugin-milady-browser",
  "lifeops-browser": "@miladyai/plugin-lifeops-browser",
  lifeopsBrowser: "@miladyai/plugin-lifeops-browser",
  vision: "@elizaos/plugin-vision",
  elizacloud: "@elizaos/plugin-elizacloud",
  selfcontrol: "@miladyai/plugin-selfcontrol",
  cron: "@elizaos/plugin-cron",
  cua: "@elizaos/plugin-cua",
  computeruse: "@elizaos/plugin-computeruse",
  obsidian: "@elizaos/plugin-obsidian",
  repoprompt: "@elizaos/plugin-repoprompt",
  repoPrompt: "@elizaos/plugin-repoprompt",
  telegramAccount: "@elizaos-plugins/client-telegram-account",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  discordLocal: "@miladyai/plugin-discord-local",
  "pi-ai": PI_AI_PLUGIN_PACKAGE,
  piAi: PI_AI_PLUGIN_PACKAGE,
  x402: "@elizaos/plugin-x402",
  "coding-agent": "@elizaos/plugin-agent-orchestrator",
  "streaming-base": "@elizaos/plugin-streaming-base",
  "twitch-streaming": "@elizaos/plugin-twitch-streaming",
  "youtube-streaming": "@elizaos/plugin-youtube-streaming",
  "custom-rtmp": "@elizaos/plugin-custom-rtmp",
  "pumpfun-streaming": "@elizaos/plugin-pumpfun-streaming",
  "x-streaming": "@elizaos/plugin-x-streaming",
  "stream555-canonical": "@rndrntwrk/plugin-555stream",
  "555stream": "@rndrntwrk/plugin-555stream",
  "five55-games": FIVE55_GAMES_PLUGIN_PACKAGE,
  "stwd-eliza-plugin": "@stwd/eliza-plugin",
};

export type PluginLoadReasons = Map<string, string>;

export function collectPluginNames(
  config: ElizaConfig,
  reasons?: PluginLoadReasons,
): Set<string> {
  migrateLegacyRuntimeConfig(config as Record<string, unknown>);
  const shellPluginDisabled = config.features?.shellEnabled === false;
  const localEmbeddingsExplicitlyDisabled = (() => {
    const raw = process.env.ELIZA_DISABLE_LOCAL_EMBEDDINGS;
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  })();
  const cloudTopology = resolveElizaCloudTopology(
    config as Record<string, unknown>,
  );
  const hasCanonicalRuntimeConfig = hasExplicitCanonicalRuntimeConfig(
    config as Record<string, unknown>,
  );
  const isCloudContainer =
    process.env.MILADY_CLOUD_PROVISIONED === "1" ||
    process.env.ELIZA_CLOUD_PROVISIONED === "1";
  const cloudExplicitlyDisabled = config.cloud?.enabled === false;
  const cloudPluginRequestedByEnv =
    !hasCanonicalRuntimeConfig &&
    !cloudExplicitlyDisabled &&
    (Boolean(process.env.ELIZAOS_CLOUD_API_KEY?.trim()) ||
      isTruthyCloudEnvValue(process.env.ELIZAOS_CLOUD_ENABLED));
  const cloudEffectivelyEnabled =
    resolveCloudPluginRequirement(cloudTopology, cloudPluginRequestedByEnv) ||
    isCloudContainer;
  const cloudHandlesInference =
    cloudTopology.services.inference ||
    (isCloudContainer && Boolean(process.env.ELIZAOS_CLOUD_API_KEY?.trim()));
  const configEnv = config.env as ConfigEnvRecord | undefined;
  const configPiAiFlag =
    (configEnv?.vars &&
    typeof configEnv.vars === "object" &&
    !Array.isArray(configEnv.vars)
      ? ((configEnv.vars as Record<string, unknown>).ELIZA_USE_PI_AI ??
        (configEnv.vars as Record<string, unknown>).MILADY_USE_PI_AI)
      : undefined) ??
    configEnv?.ELIZA_USE_PI_AI ??
    configEnv?.MILADY_USE_PI_AI;
  const piAiEnabled =
    isPiAiEnabledFromEnv(process.env) ||
    (typeof configPiAiFlag === "string" &&
      isPiAiEnabledFromEnv({
        ELIZA_USE_PI_AI: configPiAiFlag,
      } as NodeJS.ProcessEnv));

  const pluginEntries = (config.plugins as Record<string, unknown> | undefined)
    ?.entries as Record<string, { enabled?: boolean }> | undefined;

  const isPluginExplicitlyDisabled = (pluginPackageName: string): boolean => {
    const marker = "/plugin-";
    const markerIndex = pluginPackageName.lastIndexOf(marker);
    const pluginId =
      markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    return pluginEntries?.[pluginId]?.enabled === false;
  };

  const isStream555ExplicitlyDisabled = (): boolean =>
    isPluginExplicitlyDisabled(STREAM555_PLUGIN_PACKAGE) ||
    pluginEntries?.["stream555-canonical"]?.enabled === false;

  const providerPluginIdSet = new Set(
    Object.values(PROVIDER_PLUGIN_MAP).map((pluginPackageName) => {
      const marker = "/plugin-";
      const markerIndex = pluginPackageName.lastIndexOf(marker);
      return markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    }),
  );
  const explicitProviderEntries = Object.entries(pluginEntries ?? {}).filter(
    ([pluginId]) => providerPluginIdSet.has(pluginId),
  );
  const hasExplicitEnabledProvider = explicitProviderEntries.some(
    ([, entry]) => entry?.enabled === true,
  );

  const allowList = config.plugins?.allow;
  const pluginsToLoad = new Set<string>(CORE_PLUGINS);
  const track = (name: string, reason: string) => {
    if (reasons && !reasons.has(name)) reasons.set(name, reason);
  };
  for (const core of CORE_PLUGINS) track(core, "CORE_PLUGINS");

  // The corpus lifecycle is regular and awaited, not a timeout-swallowed core
  // pre-registration. It remains loaded without ALICE_CORPUS_ROOT so disabling
  // the corpus can physically purge previously persisted projected knowledge.
  pluginsToLoad.add(ALICE_CORPUS_PLUGIN_PACKAGE);
  track(ALICE_CORPUS_PLUGIN_PACKAGE, "builtin: Alice corpus lifecycle");

  if (localEmbeddingsExplicitlyDisabled) {
    pluginsToLoad.delete("@elizaos/plugin-local-embedding");
  }

  if (allowList && allowList.length > 0) {
    for (const item of allowList) {
      const pluginName =
        CHANNEL_PLUGIN_MAP[item] ??
        OPTIONAL_PLUGIN_MAP[item] ??
        (item.includes("/") ? item : `@elizaos/plugin-${item}`);
      pluginsToLoad.add(pluginName);
      track(pluginName, `plugins.allow[${JSON.stringify(item)}]`);
    }
  }

  if (
    hasStream555RuntimeEnv(process.env, configEnv) &&
    !isStream555ExplicitlyDisabled()
  ) {
    pluginsToLoad.add(STREAM555_PLUGIN_PACKAGE);
    track(STREAM555_PLUGIN_PACKAGE, "env: STREAM555_BASE_URL + stream auth");
    pluginsToLoad.add(FIVE55_GAMES_PLUGIN_PACKAGE);
    track(
      FIVE55_GAMES_PLUGIN_PACKAGE,
      "env: STREAM555_BASE_URL + stream auth",
    );
  }

  const connectors =
    config.connectors ??
    ((config as Record<string, unknown>).channels as Record<string, unknown>) ??
    {};
  for (const [channelName, channelConfig] of Object.entries(connectors)) {
    if (
      !channelConfig ||
      typeof channelConfig !== "object" ||
      Array.isArray(channelConfig)
    ) {
      continue;
    }
    if ((channelConfig as Record<string, unknown>).enabled === false) {
      continue;
    }
    const pluginName = CHANNEL_PLUGIN_MAP[channelName];
    if (pluginName) {
      pluginsToLoad.add(pluginName);
      track(pluginName, `connectors.${channelName}`);
    }
  }

  for (const [envKey, pluginName] of Object.entries(PROVIDER_PLUGIN_MAP)) {
    if (envKey === "ELIZA_USE_PI_AI" || envKey === "MILADY_USE_PI_AI") {
      continue;
    }
    if (
      envKey === "ELIZAOS_CLOUD_API_KEY" ||
      envKey === "ELIZAOS_CLOUD_ENABLED"
    ) {
      continue;
    }
    if (isPluginExplicitlyDisabled(pluginName)) {
      continue;
    }
    if (hasExplicitEnabledProvider) {
      const marker = "/plugin-";
      const markerIndex = pluginName.lastIndexOf(marker);
      const pluginId =
        markerIndex >= 0
          ? pluginName.slice(markerIndex + marker.length)
          : pluginName;
      if (pluginEntries?.[pluginId]?.enabled !== true) {
        continue;
      }
    }
    if (process.env[envKey]?.trim()) {
      pluginsToLoad.add(pluginName);
      track(pluginName, `env: ${envKey}`);
    }
  }

  const shouldEnablePiAi =
    piAiEnabled && pluginEntries?.["pi-ai"]?.enabled !== false;

  const applyProviderPrecedence = (): void => {
    if (cloudEffectivelyEnabled) {
      pluginsToLoad.add("@elizaos/plugin-elizacloud");

      if (cloudHandlesInference) {
        const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
        directProviders.delete("@elizaos/plugin-elizacloud");
        for (const p of directProviders) {
          pluginsToLoad.delete(p);
        }
        return;
      }
      if (shouldEnablePiAi) {
        pluginsToLoad.add(PI_AI_PLUGIN_PACKAGE);
        const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
        directProviders.delete(PI_AI_PLUGIN_PACKAGE);
        directProviders.delete("@elizaos/plugin-elizacloud");
        for (const p of directProviders) {
          pluginsToLoad.delete(p);
        }
      }
      return;
    }

    if (shouldEnablePiAi) {
      pluginsToLoad.add(PI_AI_PLUGIN_PACKAGE);
      const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
      directProviders.delete(PI_AI_PLUGIN_PACKAGE);
      for (const p of directProviders) {
        pluginsToLoad.delete(p);
      }
      pluginsToLoad.delete("@elizaos/plugin-elizacloud");
      return;
    }

    pluginsToLoad.delete("@elizaos/plugin-elizacloud");
  };

  applyProviderPrecedence();

  const pluginsConfig = config.plugins as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (pluginsConfig?.entries) {
    for (const [key, entry] of Object.entries(pluginsConfig.entries)) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).enabled !== false
      ) {
        const pluginName =
          CHANNEL_PLUGIN_MAP[key] ??
          OPTIONAL_PLUGIN_MAP[key] ??
          (key.includes("/") ? key : `@elizaos/plugin-${key}`);
        pluginsToLoad.add(pluginName);
        track(pluginName, `plugins.entries["${key}"]`);
      }
    }
  }

  const features = config.features;
  if (features && typeof features === "object") {
    for (const [featureName, featureValue] of Object.entries(features)) {
      const isEnabled =
        featureValue === true ||
        (typeof featureValue === "object" &&
          featureValue !== null &&
          (featureValue as Record<string, unknown>).enabled !== false);
      if (isEnabled) {
        const pluginName = OPTIONAL_PLUGIN_MAP[featureName];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
          track(pluginName, `features.${featureName}`);
        }
      }
    }
  }

  if (config.x402?.enabled) {
    pluginsToLoad.add("@elizaos/plugin-x402");
    track("@elizaos/plugin-x402", "config.x402.enabled");
  }

  if (process.env.OPINION_API_KEY?.trim()) {
    pluginsToLoad.add("@elizaos/plugin-opinion");
    track("@elizaos/plugin-opinion", "env: OPINION_API_KEY");
  }

  const installs = config.plugins?.installs;
  if (installs && typeof installs === "object") {
    for (const [packageName, record] of Object.entries(installs)) {
      if (record && typeof record === "object") {
        pluginsToLoad.add(packageName);
        track(packageName, "plugins.installs");
      }
    }
  }

  applyProviderPrecedence();

  if (shellPluginDisabled) {
    pluginsToLoad.delete("@elizaos/plugin-shell");
  }
  if (isPluginExplicitlyDisabled("@elizaos/plugin-agent-orchestrator")) {
    pluginsToLoad.delete("@elizaos/plugin-agent-orchestrator");
  }

  return pluginsToLoad;
}

function resolveCloudPluginRequirement(
  topology: ResolvedElizaCloudTopology,
  requestedByEnv: boolean,
): boolean {
  return topology.shouldLoadPlugin || requestedByEnv;
}
