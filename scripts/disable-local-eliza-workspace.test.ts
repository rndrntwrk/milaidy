import { describe, expect, it, vi } from "vitest";
import {
  collectWorkspaceProtocolDependencyNames,
  PINNED_VERSION_SOURCE_OVERRIDE,
  PINNED_VERSION_SOURCE_TEMPLATE,
  PINNED_VERSION_SOURCE_WORKSPACE,
  resolvePublishSafePinnedVersions,
} from "./disable-local-eliza-workspace.mjs";

describe("disable-local-eliza-workspace", () => {
  it("falls back unpublished workspace-derived versions to the latest published alpha", () => {
    const pinnedVersions = new Map([
      ["@elizaos/core", "2.0.0-alpha.153"],
      ["@elizaos/agent", "2.0.0-alpha.153"],
      ["@elizaos/plugin-openrouter", "2.0.0-alpha.13"],
    ]);
    const versionSources = new Map([
      ["@elizaos/core", PINNED_VERSION_SOURCE_WORKSPACE],
      ["@elizaos/agent", PINNED_VERSION_SOURCE_TEMPLATE],
      ["@elizaos/plugin-openrouter", PINNED_VERSION_SOURCE_OVERRIDE],
    ]);
    const dependencyNames = new Set([
      "@elizaos/core",
      "@elizaos/agent",
      "@elizaos/plugin-openrouter",
    ]);
    const readRegistryInfo = vi.fn((packageName: string) => {
      if (packageName === "@elizaos/core" || packageName === "@elizaos/agent") {
        return {
          versions: ["2.0.0-alpha.152"],
          "dist-tags": {
            alpha: "2.0.0-alpha.152",
            latest: "0.25.9",
          },
          version: "0.25.9",
        };
      }

      throw new Error(`unexpected registry read for ${packageName}`);
    });

    const resolved = resolvePublishSafePinnedVersions(pinnedVersions, {
      dependencyNames,
      versionSources,
      readRegistryInfo,
      log: () => {},
      warn: () => {},
    });

    expect(resolved).toEqual(
      new Map([
        ["@elizaos/core", "2.0.0-alpha.152"],
        ["@elizaos/agent", "2.0.0-alpha.152"],
        ["@elizaos/plugin-openrouter", "2.0.0-alpha.13"],
      ]),
    );
    expect(readRegistryInfo).toHaveBeenCalledTimes(2);
  });

  it("collects workspace protocol dependencies and excludes local-only packages", () => {
    const dependencyNames = collectWorkspaceProtocolDependencyNames(
      {
        dependencies: {
          "@elizaos/core": "workspace:*",
          "@elizaos/shared": "workspace:*",
          react: "^19.2.4",
        },
        overrides: {
          "@elizaos/agent": "workspace:*",
        },
      },
      {
        localOnlyPackages: new Set(["@elizaos/shared"]),
      },
    );

    expect(dependencyNames).toEqual(
      new Set(["@elizaos/core", "@elizaos/agent"]),
    );
  });
});
