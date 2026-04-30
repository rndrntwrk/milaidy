/**
 * CLI commands for the autonomy kernel.
 *
 * Usage:
 *   milaidy autonomy status    — Show kernel status
 *   milaidy autonomy enable    — Enable the autonomy kernel
 *   milaidy autonomy disable   — Disable the autonomy kernel
 *   milaidy autonomy safe-mode — Show safe mode status
 *   milaidy autonomy baseline  — Run baseline measurement
 *
 * @module cli/commands/autonomy
 */

export interface AutonomyCLIContext {
  /** Base URL for the Milaidy API. */
  apiUrl: string;
  /** API key for authentication. */
  apiKey?: string;
}

async function fetchApi(ctx: AutonomyCLIContext, path: string, options?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx.apiKey) headers["x-api-key"] = ctx.apiKey;

  const response = await fetch(`${ctx.apiUrl}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function autonomyStatus(ctx: AutonomyCLIContext): Promise<void> {
  const config = await fetchApi(ctx, "/api/agent/autonomy") as Record<string, unknown>;
  console.log("Autonomy Kernel Status");
  console.log("\u2500".repeat(40));
  console.log(`  Enabled:  ${config.enabled ?? false}`);
  console.log(`  State:    ${(config as Record<string, unknown>).state ?? "unknown"}`);

  const trust = config.trust as Record<string, unknown> | undefined;
  if (trust) {
    console.log(`  Trust:    default=${trust.defaultScore}, decay=${trust.decayRate}`);
  }

  const safeMode = config.safeMode as Record<string, unknown> | undefined;
  if (safeMode) {
    console.log(`  Safe Mode: maxErrors=${safeMode.maxConsecutiveErrors}`);
  }
}

export async function autonomyEnable(ctx: AutonomyCLIContext): Promise<void> {
  await fetchApi(ctx, "/api/agent/autonomy", {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
  console.log("Autonomy kernel enabled.");
}

export async function autonomyDisable(ctx: AutonomyCLIContext): Promise<void> {
  await fetchApi(ctx, "/api/agent/autonomy", {
    method: "POST",
    body: JSON.stringify({ enabled: false }),
  });
  console.log("Autonomy kernel disabled.");
}

export async function autonomySafeModeStatus(ctx: AutonomyCLIContext): Promise<void> {
  const status = await fetchApi(ctx, "/api/agent/safe-mode") as Record<string, unknown>;
  console.log("Safe Mode Status");
  console.log("\u2500".repeat(40));
  console.log(`  Active: ${status.active ?? false}`);
  console.log(`  State:  ${status.state ?? "unknown"}`);
  console.log(`  Errors: ${status.consecutiveErrors ?? 0}`);
}

export async function autonomyBaseline(ctx: AutonomyCLIContext): Promise<void> {
  console.log("Running baseline measurement...");
  const result = await fetchApi(ctx, "/api/agent/autonomy/baseline", {
    method: "POST",
  }) as Record<string, unknown>;
  console.log("Baseline measurement complete.");
  console.log(JSON.stringify(result, null, 2));
}

/** Map subcommand names to handler functions. */
export const AUTONOMY_COMMANDS: Record<string, (ctx: AutonomyCLIContext) => Promise<void>> = {
  status: autonomyStatus,
  enable: autonomyEnable,
  disable: autonomyDisable,
  "safe-mode": autonomySafeModeStatus,
  baseline: autonomyBaseline,
};

/**
 * Entry point for the `milaidy autonomy <subcommand>` CLI command.
 */
export async function runAutonomyCommand(
  subcommand: string,
  ctx: AutonomyCLIContext,
): Promise<void> {
  const handler = AUTONOMY_COMMANDS[subcommand];
  if (!handler) {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error(`Available: ${Object.keys(AUTONOMY_COMMANDS).join(", ")}`);
    process.exit(1);
  }
  await handler(ctx);
}
