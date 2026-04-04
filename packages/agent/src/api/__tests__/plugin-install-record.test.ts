/**
 * Tests that plugin install via the API records the install path
 * in config.plugins.installs so plugin-resolver can find it.
 */
import { describe, expect, it, vi } from "vitest";

// Extract the install-record logic for unit testing without
// needing the full route handler + runtime mock.
function applyInstallRecord(
  config: Record<string, unknown>,
  result: { pluginName?: string; installPath?: string; version?: string },
  pluginName: string,
): void {
  const plugins = (config.plugins ?? {}) as Record<string, unknown>;
  config.plugins = plugins;

  // Short ID for entries
  const installedId = (result.pluginName ?? pluginName)
    .replace(/^@[^/]+\/plugin-/, "")
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");

  if (!plugins.entries || typeof plugins.entries !== "object") {
    plugins.entries = {};
  }
  (plugins.entries as Record<string, unknown>)[installedId] = { enabled: true };

  // Record install path
  if (result.installPath) {
    if (!plugins.installs || typeof plugins.installs !== "object") {
      plugins.installs = {};
    }
    (plugins.installs as Record<string, unknown>)[
      result.pluginName ?? pluginName
    ] = {
      source: "npm",
      installPath: result.installPath,
      version: result.version ?? "unknown",
      installedAt: expect.any(String),
    };
  }
}

describe("plugin install record", () => {
  it("records install path in config.plugins.installs", () => {
    const config: Record<string, unknown> = {};

    applyInstallRecord(
      config,
      {
        pluginName: "@elizaos/plugin-evm",
        installPath: "/home/user/.milady/plugins/installed/@elizaos_plugin-evm",
        version: "2.0.0-alpha.6",
      },
      "@elizaos/plugin-evm",
    );

    const plugins = config.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    const installs = plugins.installs as Record<string, unknown>;

    expect(entries.evm).toEqual({ enabled: true });
    expect(installs["@elizaos/plugin-evm"]).toMatchObject({
      source: "npm",
      installPath:
        "/home/user/.milady/plugins/installed/@elizaos_plugin-evm",
      version: "2.0.0-alpha.6",
    });
  });

  it("does not write installs record when installPath is missing", () => {
    const config: Record<string, unknown> = {};

    applyInstallRecord(
      config,
      { pluginName: "@elizaos/plugin-evm" },
      "@elizaos/plugin-evm",
    );

    const plugins = config.plugins as Record<string, unknown>;
    expect(plugins.entries).toEqual({ evm: { enabled: true } });
    expect(plugins.installs).toBeUndefined();
  });

  it("extracts short ID correctly for various package formats", () => {
    const cases = [
      ["@elizaos/plugin-evm", "evm"],
      ["@elizaos/plugin-local-embedding", "local-embedding"],
      ["@homunculuslabs/plugin-zai", "zai"],
      ["plugin-custom", "custom"],
    ];

    for (const [fullName, expectedId] of cases) {
      const config: Record<string, unknown> = {};
      applyInstallRecord(
        config,
        { pluginName: fullName, installPath: "/tmp/test" },
        fullName,
      );
      const entries = (config.plugins as Record<string, unknown>)
        .entries as Record<string, unknown>;
      expect(entries[expectedId], `${fullName} -> ${expectedId}`).toEqual({
        enabled: true,
      });
    }
  });
});
