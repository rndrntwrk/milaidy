import type { AgentRuntime } from "@elizaos/core";

export interface RegisterPiAiRuntimeOptions {
  modelSpec?: string;
  smallModelSpec?: string;
  largeModelSpec?: string;
}

export interface PiAiRuntimeRegistration {
  modelSpec: string;
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function isPiAiEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseBool(env.PI_AI_ENABLED) || parseBool(env.MILAIDY_PI_AI_ENABLED);
}

export async function registerPiAiRuntime(
  _runtime: AgentRuntime,
  options: RegisterPiAiRuntimeOptions = {},
): Promise<PiAiRuntimeRegistration> {
  const modelSpec =
    options.largeModelSpec?.trim() ||
    options.modelSpec?.trim() ||
    options.smallModelSpec?.trim() ||
    "pi-ai/default";
  return { modelSpec };
}
