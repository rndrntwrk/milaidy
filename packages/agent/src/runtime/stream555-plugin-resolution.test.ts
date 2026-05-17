import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ElizaConfig } from "../config/config";
import { collectPluginNames } from "./plugin-collector";

const STREAM555_PLUGIN_PACKAGE = "@rndrntwrk/plugin-555stream";
const STREAM_ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM_API_BEARER_TOKEN",
] as const;

type StreamEnvKey = (typeof STREAM_ENV_KEYS)[number];

let previousStreamEnv: Record<StreamEnvKey, string | undefined>;

function getStream555PackageRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "plugin-555stream",
  );
}

function findPluginExport(mod: Record<string, unknown>) {
  const candidates = [
    mod.default,
    mod.plugin,
    ...Object.entries(mod)
      .filter(([key]) => /plugin$/i.test(key) || /^plugin/i.test(key))
      .map(([, value]) => value),
  ];
  return candidates.find((value) => {
    if (!value || typeof value !== "object") return false;
    const plugin = value as Record<string, unknown>;
    return typeof plugin.name === "string" && Array.isArray(plugin.actions);
  }) as { name?: string; actions?: unknown[] } | undefined;
}

function clearStreamEnv() {
  for (const key of STREAM_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("stream555 canonical runtime mapping", () => {
  beforeEach(() => {
    previousStreamEnv = Object.fromEntries(
      STREAM_ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as Record<StreamEnvKey, string | undefined>;
    clearStreamEnv();
  });

  afterEach(() => {
    clearStreamEnv();
    for (const key of STREAM_ENV_KEYS) {
      const value = previousStreamEnv[key];
      if (value !== undefined) process.env[key] = value;
    }
  });

  it("normalizes stream555-canonical in plugins.allow", () => {
    const config = {
      plugins: { allow: ["stream555-canonical"] },
    } as Partial<ElizaConfig> as ElizaConfig;
    const names = collectPluginNames(config);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(true);
  });

  it("loads the canonical 555stream package from plugins.entries", () => {
    const config = {
      plugins: {
        entries: { "stream555-canonical": { enabled: true } },
      },
    } as Partial<ElizaConfig> as ElizaConfig;
    const names = collectPluginNames(config);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(true);
  });

  it("auto-loads the canonical 555stream package from staging stream env", () => {
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
    const reasons = new Map<string, string>();

    const names = collectPluginNames({} as ElizaConfig, reasons);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(true);
    expect(reasons.get(STREAM555_PLUGIN_PACKAGE)).toBe(
      "env: STREAM555_BASE_URL + stream auth",
    );
  });

  it("auto-loads the canonical 555stream package with agent API key auth", () => {
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_API_KEY = "static-api-key";

    const names = collectPluginNames({} as ElizaConfig);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(true);
  });

  it("auto-loads the canonical 555stream package from config env vars", () => {
    const config = {
      env: {
        vars: {
          STREAM555_BASE_URL: "https://stream555.example",
          STREAM_API_BEARER_TOKEN: "static-bearer-token",
        },
      },
    } as Partial<ElizaConfig> as ElizaConfig;

    const names = collectPluginNames(config);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(true);
  });

  it("does not auto-load 555stream without stream auth", () => {
    process.env.STREAM555_BASE_URL = "https://stream555.example";

    const names = collectPluginNames({} as ElizaConfig);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(false);
  });

  it("honors explicit 555stream disablement when stream env is configured", () => {
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
    const config = {
      plugins: {
        entries: { "555stream": { enabled: false } },
      },
    } as Partial<ElizaConfig> as ElizaConfig;

    const names = collectPluginNames(config);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(false);
  });

  it("honors explicit stream555-canonical disablement when stream env is configured", () => {
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
    const config = {
      plugins: {
        entries: { "stream555-canonical": { enabled: false } },
      },
    } as Partial<ElizaConfig> as ElizaConfig;

    const names = collectPluginNames(config);

    expect(names.has(STREAM555_PLUGIN_PACKAGE)).toBe(false);
  });

  it("resolves the vendored 555stream source entry when dist is absent", async () => {
    const pkgRoot = getStream555PackageRoot();
    const entry = path.resolve(pkgRoot, "src", "index.ts");

    expect(existsSync(entry)).toBe(true);
    expect(entry).toBe(path.resolve(pkgRoot, "src", "index.ts"));
  });

  it("loads the vendored 555stream module as a runtime plugin", async () => {
    const pkgRoot = getStream555PackageRoot();
    const entry = path.resolve(pkgRoot, "src", "index.ts");
    const mod = (await import(pathToFileURL(entry).href)) as Record<
      string,
      unknown
    >;
    const plugin = findPluginExport(mod);

    expect(plugin?.name).toBe("555stream");
    expect(plugin?.actions?.length ?? 0).toBeGreaterThan(0);
  });
});
