import type { IAgentRuntime } from "@elizaos/core";
import {
  isPiAiEnabledFromEnv as pluginIsPiAiEnabledFromEnv,
  registerPiAiRuntime as pluginRegisterPiAiRuntime,
  type RegisterPiAiRuntimeOptions as PluginRegisterPiAiRuntimeOptions,
} from "@elizaos/plugin-pi-ai";

export type RegisterPiAiRuntimeOptions = PluginRegisterPiAiRuntimeOptions;

export interface PiAiRuntimeRegistration {
  modelSpec: string;
  provider: string;
  id: string;
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function isPiAiEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (pluginIsPiAiEnabledFromEnv(env)) return true;
  return parseBool(env.PI_AI_ENABLED) || parseBool(env.MILAIDY_PI_AI_ENABLED);
}

export async function registerPiAiRuntime(
  runtime: IAgentRuntime,
  options: RegisterPiAiRuntimeOptions = {},
): Promise<PiAiRuntimeRegistration> {
  return pluginRegisterPiAiRuntime(runtime, options);
}
