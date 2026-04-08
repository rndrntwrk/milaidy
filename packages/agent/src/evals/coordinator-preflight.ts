import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CoordinatorEvalChannel } from "./coordinator-scenarios.js";
import {
  CoordinatorEvalClient,
  resolveCoordinatorEvalBaseUrl,
} from "./coordinator-eval-client.js";

type PreflightStatus = "pass" | "warn" | "fail";

export interface CoordinatorPreflightCheck {
  id: string;
  status: PreflightStatus;
  summary: string;
  details?: Record<string, unknown>;
}

export interface CoordinatorPreflightResult {
  ok: boolean;
  baseUrl: string;
  configPath: string;
  availableChannels: CoordinatorEvalChannel[];
  supportedConnectors: CoordinatorEvalChannel[];
  shareCapabilities: string[];
  checks: CoordinatorPreflightCheck[];
}

type FrameworkAvailability = {
  id?: string;
  installed?: boolean;
  authReady?: boolean;
  subscriptionReady?: boolean;
  reason?: string;
};

const SUPPORTED_CONNECTOR_CHANNELS: CoordinatorEvalChannel[] = [
  "discord",
  "telegram",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "wechat",
];

function getHomeDir(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function resolveMiladyConfigPath(): string {
  const explicit =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    process.env.ELIZA_CONFIG_PATH?.trim();
  if (explicit) return explicit;

  const stateDir =
    process.env.MILADY_STATE_DIR?.trim() ||
    process.env.ELIZA_STATE_DIR?.trim() ||
    path.join(getHomeDir(), ".milady");
  const namespace = process.env.ELIZA_NAMESPACE?.trim();
  const filename =
    !namespace || namespace === "milady" ? "milady.json" : `${namespace}.json`;
  return path.join(stateDir, filename);
}

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
      timeout: 3_000,
    });
    return true;
  } catch {
    return false;
  }
}

function detectShareCapabilities(
  config: Record<string, unknown> | null,
): string[] {
  const capabilities: string[] = [];
  const gateway =
    config && typeof config.gateway === "object" && config.gateway
      ? (config.gateway as Record<string, unknown>)
      : null;
  const gatewayTailscale =
    gateway && typeof gateway.tailscale === "object" && gateway.tailscale
      ? (gateway.tailscale as Record<string, unknown>)
      : null;
  const gatewayRemote =
    gateway && typeof gateway.remote === "object" && gateway.remote
      ? (gateway.remote as Record<string, unknown>)
      : null;

  const tailscaleMode =
    typeof gatewayTailscale?.mode === "string" ? gatewayTailscale.mode : null;
  if (tailscaleMode && tailscaleMode !== "off") {
    capabilities.push(`tailscale:${tailscaleMode}`);
  }
  if (typeof gatewayRemote?.url === "string" && gatewayRemote.url.trim()) {
    capabilities.push("gateway-remote-url");
  }
  if (
    typeof gatewayRemote?.sshTarget === "string" &&
    gatewayRemote.sshTarget.trim()
  ) {
    capabilities.push("gateway-remote-ssh");
  }
  if (typeof gateway?.mode === "string" && gateway.mode === "remote") {
    capabilities.push("gateway-remote-mode");
  }

  return capabilities;
}

function normalizeConnectors(
  connectors: Record<string, unknown>,
): CoordinatorEvalChannel[] {
  const configured = new Set<CoordinatorEvalChannel>(["app_chat"]);
  for (const connectorName of Object.keys(connectors)) {
    const normalized = connectorName.trim().toLowerCase();
    if (normalized === "telegramaccount") {
      configured.add("telegram");
      continue;
    }
    if (
      SUPPORTED_CONNECTOR_CHANNELS.includes(
        normalized as CoordinatorEvalChannel,
      )
    ) {
      configured.add(normalized as CoordinatorEvalChannel);
    }
  }
  return Array.from(configured);
}

export async function runCoordinatorPreflight(options?: {
  baseUrl?: string;
}): Promise<CoordinatorPreflightResult> {
  const baseUrl = resolveCoordinatorEvalBaseUrl(options?.baseUrl);
  const client = new CoordinatorEvalClient(baseUrl);
  const configPath = resolveMiladyConfigPath();
  const config = readJsonFile(configPath);
  const checks: CoordinatorPreflightCheck[] = [];

  const addCheck = (
    id: string,
    status: PreflightStatus,
    summary: string,
    details?: Record<string, unknown>,
  ): void => {
    checks.push({ id, status, summary, ...(details ? { details } : {}) });
  };

  addCheck(
    "local-cli-codex",
    commandExists("codex") ? "pass" : "fail",
    commandExists("codex")
      ? "Codex CLI is installed."
      : "Codex CLI is not installed.",
  );
  addCheck(
    "local-cli-claude",
    commandExists("claude") ? "pass" : "fail",
    commandExists("claude")
      ? "Claude Code CLI is installed."
      : "Claude Code CLI is not installed.",
  );
  addCheck(
    "local-auth-files",
    fs.existsSync(path.join(getHomeDir(), ".codex", "auth.json")) ||
      fs.existsSync(path.join(getHomeDir(), ".claude", ".credentials.json"))
      ? "pass"
      : "warn",
    "Local Codex/Claude auth files were inspected.",
    {
      codexAuthFile: fs.existsSync(path.join(getHomeDir(), ".codex", "auth.json")),
      claudeCredentialsFile: fs.existsSync(
        path.join(getHomeDir(), ".claude", ".credentials.json"),
      ),
    },
  );

  const shareCapabilities = detectShareCapabilities(config);
  addCheck(
    "share-capabilities",
    shareCapabilities.length > 0 ? "pass" : "warn",
    shareCapabilities.length > 0
      ? "Share or remote-preview capabilities were discovered in config."
      : "No explicit remote share capability was discovered in config.",
    { shareCapabilities, configPath },
  );

  try {
    await client.requestJson("/api/coding-agents/coordinator/status");
  } catch (error) {
    addCheck(
      "milady-api",
      "fail",
      "Milady API is not reachable at the configured base URL.",
      {
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      ok: false,
      baseUrl,
      configPath,
      availableChannels: [],
      supportedConnectors: SUPPORTED_CONNECTOR_CHANNELS,
      shareCapabilities,
      checks,
    };
  }

  const subscriptionStatus = await client.requestJson<{
    providers?: Array<{
      provider?: string;
      configured?: boolean;
      valid?: boolean;
      expiresAt?: number | null;
    }>;
  }>("/api/subscription/status");
  const providerMap = new Map(
    (subscriptionStatus.providers ?? []).flatMap((provider) =>
      provider.provider ? [[provider.provider, provider]] : [],
    ),
  );
  const codexProvider = providerMap.get("openai-codex");
  const claudeProvider = providerMap.get("anthropic-subscription");
  addCheck(
    "subscription-openai-codex",
    codexProvider?.configured && codexProvider.valid ? "pass" : "fail",
    codexProvider?.configured && codexProvider.valid
      ? "OpenAI Codex subscription is configured and valid."
      : "OpenAI Codex subscription is missing or invalid.",
    codexProvider,
  );
  addCheck(
    "subscription-anthropic",
    claudeProvider?.configured && claudeProvider.valid ? "pass" : "fail",
    claudeProvider?.configured && claudeProvider.valid
      ? "Claude subscription is configured and valid for task-agent use."
      : "Claude subscription is missing or invalid for task-agent use.",
    claudeProvider,
  );

  const coordinatorStatus = await client.requestJson<{
    frameworks?: FrameworkAvailability[];
  }>("/api/coding-agents/coordinator/status");
  const frameworks = Array.isArray(coordinatorStatus.frameworks)
    ? coordinatorStatus.frameworks
    : [];
  const frameworkMap = new Map(
    frameworks.flatMap((framework) =>
      framework.id ? [[framework.id, framework]] : [],
    ),
  );
  for (const id of ["codex", "claude"] as const) {
    const framework = frameworkMap.get(id);
    const ready =
      framework?.installed === true &&
      (framework.authReady === true || framework.subscriptionReady === true);
    addCheck(
      `framework-${id}`,
      ready ? "pass" : "fail",
      ready
        ? `${id} is installed and ready for coordinator task execution.`
        : `${id} is not ready for coordinator task execution.`,
      framework as Record<string, unknown> | undefined,
    );
  }

  const trajectoryConfig = await client.requestJson<{ enabled?: boolean }>(
    "/api/trajectories/config",
  );
  addCheck(
    "trajectory-logging",
    trajectoryConfig.enabled === true ? "pass" : "fail",
    trajectoryConfig.enabled === true
      ? "Trajectory logging is enabled."
      : "Trajectory logging is disabled.",
    trajectoryConfig as Record<string, unknown>,
  );

  const connectorsResponse = await client.requestJson<{
    connectors?: Record<string, unknown>;
  }>("/api/connectors");
  const availableChannels = normalizeConnectors(connectorsResponse.connectors ?? {});
  const configuredConnectorChannels = availableChannels.filter(
    (channel) => channel !== "app_chat",
  );
  addCheck(
    "connectors",
    configuredConnectorChannels.length > 0 ? "pass" : "warn",
    configuredConnectorChannels.length > 0
      ? "At least one external connector is configured."
      : "No external connectors are configured; live eval coverage is limited to app chat.",
    {
      configuredChannels: configuredConnectorChannels,
      supportedConnectorChannels: SUPPORTED_CONNECTOR_CHANNELS,
    },
  );

  return {
    ok: checks.every((check) => check.status !== "fail"),
    baseUrl,
    configPath,
    availableChannels,
    supportedConnectors: SUPPORTED_CONNECTOR_CHANNELS,
    shareCapabilities,
    checks,
  };
}
