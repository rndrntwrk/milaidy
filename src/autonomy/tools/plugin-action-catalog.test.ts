import { describe, expect, it } from "vitest";
import {
  loadPluginActionCatalog,
  pluginIdFromPackageName,
  resolvePluginImportSpecifier,
} from "./plugin-action-catalog.js";

describe("plugin action catalog", () => {
  it("normalizes plugin IDs from package names", () => {
    expect(pluginIdFromPackageName("@elizaos/plugin-shell")).toBe("shell");
    expect(pluginIdFromPackageName("@milaidy/plugin-telegram-enhanced")).toBe(
      "telegram-enhanced",
    );
    expect(pluginIdFromPackageName("plugin-foo")).toBe("foo");
    expect(pluginIdFromPackageName("@scope/custom-plugin")).toBe(
      "custom-plugin",
    );
  });

  it("resolves local plugin alias for telegram enhanced", () => {
    expect(resolvePluginImportSpecifier("@milaidy/plugin-telegram-enhanced")).toBe(
      "../../plugins/telegram-enhanced/index.js",
    );
    expect(resolvePluginImportSpecifier("@elizaos/plugin-shell")).toBe(
      "@elizaos/plugin-shell",
    );
  });

  it("loads plugin actions from module exports and records failures", async () => {
    const modules: Record<string, Record<string, unknown>> = {
      "@elizaos/plugin-shell": {
        default: {
          name: "shell",
          description: "shell plugin",
          actions: [{ name: "RUN_IN_TERMINAL" }, { name: "RUN_IN_TERMINAL" }],
        },
      },
      "@elizaos/plugin-empty": {
        plugin: {
          name: "empty",
          description: "no action plugin",
          actions: [],
        },
      },
      "@elizaos/plugin-alt": {
        altExport: {
          name: "alt",
          description: "alt plugin",
          actions: [{ name: "ALT_ACTION" }, { nope: true }],
        },
      },
    };

    const result = await loadPluginActionCatalog({
      pluginNames: [
        "@elizaos/plugin-shell",
        "@elizaos/plugin-empty",
        "@elizaos/plugin-alt",
        "@elizaos/plugin-missing",
      ],
      importer: async (specifier) => {
        const mod = modules[specifier];
        if (!mod) throw new Error(`missing module: ${specifier}`);
        return mod;
      },
    });

    expect(result.entries).toHaveLength(3);
    expect(result.actionNames).toEqual(["ALT_ACTION", "RUN_IN_TERMINAL"]);
    const shellEntry = result.entries.find(
      (entry) => entry.pluginName === "@elizaos/plugin-shell",
    );
    expect(shellEntry?.actionNames).toEqual(["RUN_IN_TERMINAL"]);
    expect(result.failures).toEqual([
      {
        pluginName: "@elizaos/plugin-missing",
        reason: "missing module: @elizaos/plugin-missing",
      },
    ]);
  });

  it("reports modules that do not expose a plugin", async () => {
    const result = await loadPluginActionCatalog({
      pluginNames: ["@elizaos/plugin-invalid"],
      importer: async () => ({ default: { not: "plugin" } }),
    });

    expect(result.entries).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("No plugin export");
  });
});
