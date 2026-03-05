import type { IAgentRuntime } from "@elizaos/core";
export interface RegisterPiAiRuntimeOptions {
  modelSpec?: string;
  largeModelSpec?: string;
  smallModelSpec?: string;
  priority?: number;
}

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
  return (
    parseBool(env.PI_AI_ENABLED) ||
    parseBool(env.MILAIDY_PI_AI_ENABLED) ||
    parseBool(env.MILAIDY_USE_PI_AI)
  );
}

export async function registerPiAiRuntime(
  runtime: IAgentRuntime,
  options: RegisterPiAiRuntimeOptions = {},
): Promise<PiAiRuntimeRegistration> {
  try {
    const plugin = (await import("@elizaos/plugin-pi-ai")) as {
      registerPiAiRuntime: (
        rt: IAgentRuntime,
        opts?: RegisterPiAiRuntimeOptions,
      ) => Promise<PiAiRuntimeRegistration>;
    };
    return plugin.registerPiAiRuntime(runtime, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `@elizaos/plugin-pi-ai unavailable (build/link issue): ${message}`,
    );
  }
}
