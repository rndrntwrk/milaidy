import type { ElizaConfig } from "../config/config.js";

export const DEFAULT_CLOUD_API_BASE_URL = "https://elizacloud.ai/api/v1";

export type CloudApiKeyRuntimeLike = {
  getSetting?: (key: string) => unknown;
  character?: {
    secrets?: Record<string, unknown>;
  } | null;
} | null;

export function normalizeCloudSecret(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveRuntimeCloudApiKey(
  runtime?: CloudApiKeyRuntimeLike,
): string | null {
  const fromSetting = runtime?.getSetting?.("ELIZAOS_CLOUD_API_KEY");
  if (typeof fromSetting === "string") {
    return normalizeCloudSecret(fromSetting);
  }

  const fromSecrets = runtime?.character?.secrets?.ELIZAOS_CLOUD_API_KEY;
  return typeof fromSecrets === "string"
    ? normalizeCloudSecret(fromSecrets)
    : null;
}

export function resolveCloudApiBaseUrl(
  rawBaseUrl?: string | null,
): string | null {
  const candidate =
    normalizeCloudSecret(rawBaseUrl ?? process.env.ELIZAOS_CLOUD_BASE_URL) ??
    DEFAULT_CLOUD_API_BASE_URL;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    parsed.search = "";
    const normalizedBase = parsed.toString().replace(/\/+$/, "");
    return normalizedBase.endsWith("/api/v1")
      ? normalizedBase
      : `${normalizedBase}/api/v1`;
  } catch {
    return null;
  }
}

export function resolveCloudApiKey(
  config?: Pick<ElizaConfig, "cloud"> | null,
  runtime?: CloudApiKeyRuntimeLike,
): string | null {
  return normalizeCloudSecret(
    config?.cloud?.apiKey ??
      resolveRuntimeCloudApiKey(runtime) ??
      process.env.ELIZAOS_CLOUD_API_KEY,
  );
}
