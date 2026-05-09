import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeCloudSecret,
  resolveCloudApiBaseUrl,
  resolveCloudApiKey,
} from "./cloud-api-key.js";

describe("cloud api key helpers", () => {
  const originalEnv = process.env.ELIZAOS_CLOUD_API_KEY;
  const originalBaseUrl = process.env.ELIZAOS_CLOUD_BASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ELIZAOS_CLOUD_API_KEY;
    else process.env.ELIZAOS_CLOUD_API_KEY = originalEnv;
    if (originalBaseUrl === undefined) delete process.env.ELIZAOS_CLOUD_BASE_URL;
    else process.env.ELIZAOS_CLOUD_BASE_URL = originalBaseUrl;
  });

  it("normalizes blank and nonblank cloud secrets", () => {
    expect(normalizeCloudSecret(undefined)).toBeNull();
    expect(normalizeCloudSecret("   ")).toBeNull();
    expect(normalizeCloudSecret(" key ")).toBe("key");
  });

  it("resolves api key from config, runtime, then env", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "env-key";
    const runtime = {
      getSetting: (key: string) =>
        key === "ELIZAOS_CLOUD_API_KEY" ? "runtime-key" : undefined,
      character: { secrets: { ELIZAOS_CLOUD_API_KEY: "secret-key" } },
    };

    expect(resolveCloudApiKey({ cloud: { apiKey: "config-key" } }, runtime)).toBe(
      "config-key",
    );
    expect(resolveCloudApiKey(null, runtime)).toBe("runtime-key");
    expect(resolveCloudApiKey(null, null)).toBe("env-key");
  });

  it("normalizes api base urls to /api/v1", () => {
    expect(resolveCloudApiBaseUrl("https://example.com")).toBe(
      "https://example.com/api/v1",
    );
    expect(resolveCloudApiBaseUrl("https://example.com/api/v1/")).toBe(
      "https://example.com/api/v1",
    );
    expect(resolveCloudApiBaseUrl("notaurl")).toBeNull();
  });
});
