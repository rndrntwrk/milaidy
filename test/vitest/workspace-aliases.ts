import { existsSync } from "node:fs";
import path from "node:path";
import { resolveModuleEntry } from "../eliza-package-paths";

export function getElizaCoreRolesEntry(repoRoot: string): string {
  const elizaCoreRolesSource = path.join(
    repoRoot,
    "eliza",
    "packages",
    "typescript",
    "src",
    "roles.ts",
  );

  return existsSync(elizaCoreRolesSource)
    ? elizaCoreRolesSource
    : path.join(
        repoRoot,
        "eliza",
        "packages",
        "app-core",
        "scripts",
        "lib",
        "elizaos-core-roles-shim.js",
      );
}

export function getAppCoreBridgeStubPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "test",
    "stubs",
    "app-core-bridge.ts",
  );
}

export function getAppCorePluginFallbackPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "test",
    "stubs",
    "plugin-fallback-module.mjs",
  );
}

export function getAppCoreModuleFallbackPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "test",
    "stubs",
    "module-fallback.mjs",
  );
}

export function getOptionalPluginSdkAliases(repoRoot: string) {
  const pluginSdkEntry = path.join(repoRoot, "src", "plugin-sdk", "index.ts");

  return existsSync(pluginSdkEntry)
    ? [{ find: "milady/plugin-sdk", replacement: pluginSdkEntry }]
    : [];
}

export function getAgentSourceAliases(
  sourceRoot: string | undefined,
  options: {
    fallbackReplacement?: string;
    includeMiladyAlias?: boolean;
  } = {},
) {
  if (sourceRoot) {
    return [
      {
        find: /^@elizaos\/agent\/(.*)/,
        replacement: path.join(sourceRoot, "$1"),
      },
      ...(options.includeMiladyAlias
        ? [
            {
              find: /^@miladyai\/agent\/(.*)/,
              replacement: path.join(sourceRoot, "$1"),
            },
          ]
        : []),
      {
        find: "@elizaos/agent",
        replacement: resolveModuleEntry(path.join(sourceRoot, "index")),
      },
    ];
  }

  return options.fallbackReplacement
    ? [
        {
          find: /^@elizaos\/agent(\/.*)?$/,
          replacement: options.fallbackReplacement,
        },
      ]
    : [];
}

export function getAppCoreSourceAliases(
  sourceRoot: string | undefined,
  options: {
    bridgeReplacement?: string;
    fallbackReplacement?: string;
    stubRootSpecifier?: boolean;
  } = {},
) {
  if (sourceRoot) {
    return [
      ...(options.bridgeReplacement
        ? [
            {
              find: "@elizaos/app-core/electrobun-rpc.js",
              replacement: options.bridgeReplacement,
            },
            {
              find: "@elizaos/app-core/electrobun-rpc",
              replacement: options.bridgeReplacement,
            },
            {
              find: "@elizaos/app-core/electrobun-runtime",
              replacement: options.bridgeReplacement,
            },
            ...(options.stubRootSpecifier
              ? [
                  {
                    find: /^@elizaos\/app-core$/,
                    replacement: options.bridgeReplacement,
                  },
                ]
              : []),
          ]
        : []),
      {
        find: /^@elizaos\/app-core\/(.*)/,
        replacement: path.join(sourceRoot, "$1"),
      },
      {
        find: /^@miladyai\/app-core\/src\/(.*)/,
        replacement: path.join(sourceRoot, "$1"),
      },
      {
        find: /^@miladyai\/app-core\/(.*)/,
        replacement: path.join(sourceRoot, "$1"),
      },
      ...(!options.stubRootSpecifier
        ? [
            {
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(path.join(sourceRoot, "index")),
            },
          ]
        : []),
    ];
  }

  return options.fallbackReplacement
    ? [
        {
          find: /^@elizaos\/app-core(\/.*)?$/,
          replacement: options.fallbackReplacement,
        },
      ]
    : [];
}

export function getSharedSourceAliases(
  sourceRoot: string | undefined,
  options: {
    includeConfigAlias?: boolean;
    includeMiladyAlias?: boolean;
  } = {},
) {
  if (!sourceRoot) {
    return [];
  }

  return [
    ...(options.includeConfigAlias
      ? [
          {
            find: "@elizaos/shared/config",
            replacement: path.join(sourceRoot, "config", "types.ts"),
          },
        ]
      : []),
    {
      find: /^@elizaos\/shared\/(.*)/,
      replacement: path.join(sourceRoot, "$1"),
    },
    {
      find: "@elizaos/shared",
      replacement: path.join(sourceRoot, "index.ts"),
    },
    ...(options.includeMiladyAlias
      ? [
          {
            find: /^@miladyai\/shared\/(.*)/,
            replacement: path.join(sourceRoot, "$1"),
          },
        ]
      : []),
  ];
}

export function getUiSourceAliases(sourceRoot: string | undefined) {
  if (!sourceRoot) {
    return [];
  }

  return [
    {
      find: /^@elizaos\/ui\/(.*)/,
      replacement: path.join(sourceRoot, "$1"),
    },
    {
      find: "@elizaos/ui",
      replacement: resolveModuleEntry(path.join(sourceRoot, "index")),
    },
  ];
}

export function getWorkspaceAppAliases(repoRoot: string, appNames: string[]) {
  return appNames.flatMap((appName) => {
    const appSourceRoot = path.join(repoRoot, "eliza", "apps", appName, "src");
    const appEntry = path.join(appSourceRoot, "index.ts");

    if (!existsSync(appEntry)) {
      return [];
    }

    const packageName = `@elizaos/${appName}`;

    return [
      {
        find: new RegExp(`^${packageName}/(.*)`),
        replacement: path.join(appSourceRoot, "$1"),
      },
      {
        find: packageName,
        replacement: appEntry,
      },
    ];
  });
}
