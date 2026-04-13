import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getInstalledPackageEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const elizaCoreRolesSource = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
  "src",
  "roles.ts",
);
const elizaCoreRolesEntry = fs.existsSync(elizaCoreRolesSource)
  ? elizaCoreRolesSource
  : path.join(repoRoot, "scripts", "lib", "elizaos-core-roles-shim.js");
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const pluginPersonalityEntry =
  getInstalledPackageEntry("@elizaos/plugin-personality", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-personality",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginSignalEntry =
  getInstalledPackageEntry("@elizaos/plugin-signal", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-signal",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginSqlEntry =
  getInstalledPackageEntry("@elizaos/plugin-sql", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "plugins", "plugin-sql", "typescript", "index.node"),
  );
const pluginWhatsappEntry =
  getInstalledPackageEntry("@elizaos/plugin-whatsapp", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-whatsapp",
      "typescript",
      "src",
      "index",
    ),
  );

const liveTest = process.env.MILADY_LIVE_TEST === "1";
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
      {
        find: "@elizaos/core/roles",
        replacement: elizaCoreRolesEntry,
      },
      ...(elizaCoreEntry
        ? [
            {
              find: "@elizaos/core",
              replacement: elizaCoreEntry,
            },
          ]
        : []),
      ...(autonomousSourceRoot
        ? [
            {
              find: /^@elizaos\/agent\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/agent\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: "@elizaos/agent",
              replacement: resolveModuleEntry(
                path.join(autonomousSourceRoot, "index"),
              ),
            },
          ]
        : []),
      ...(appCoreSourceRoot
        ? [
            {
              find: /^@elizaos\/app-core\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/app-core\/src\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/app-core\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(
                path.join(appCoreSourceRoot, "index"),
              ),
            },
          ]
        : []),
      {
        find: /^@miladyai\/plugin-selfcontrol\/(.*)/,
        replacement: path.join(
          repoRoot,
          "packages",
          "plugin-selfcontrol",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/plugin-selfcontrol",
        replacement: path.join(
          repoRoot,
          "packages",
          "plugin-selfcontrol",
          "src",
          "index.ts",
        ),
      },
            ...(fs.existsSync(pluginPersonalityEntry)
        ? [
            {
              find: "@elizaos/plugin-personality",
              replacement: pluginPersonalityEntry,
            },
          ]
        : []),
                                          ...(fs.existsSync(pluginSignalEntry)
        ? [
            {
              find: "@elizaos/plugin-signal",
              replacement: pluginSignalEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginSqlEntry)
        ? [
            {
              find: "@elizaos/plugin-sql",
              replacement: pluginSqlEntry,
            },
          ]
        : []),
                  ...(!liveTest
        ? [
                                                          ]
        : []),
                  ...(fs.existsSync(pluginWhatsappEntry)
        ? [
            {
              find: "@elizaos/plugin-whatsapp",
              replacement: pluginWhatsappEntry,
            },
          ]
        : []),
          ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ["test/e2e-global-setup.ts"],
    // Integration files frequently replace globals and module-level mocks.
    // Shared module state causes cross-file bleed, which is more expensive to
    // debug than the small cost of per-file isolation.
    isolate: true,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // Match the unit test worker heap to avoid late jsdom OOM crashes during
    // serial runs, where one fork accumulates dozens of suites.
    execArgv: ["--max-old-space-size=4096"],
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    include: [
      "test/**/*.integration.test.ts",
      "packages/agent/test/**/*.integration.test.ts",
      "packages/app-core/test/**/*.integration.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "**/*-live.test.ts",
      "**/*-live.test.tsx",
      "**/*.live.test.ts",
      "**/*.live.test.tsx",
      "**/*-live.e2e.test.ts",
      "**/*-live.e2e.test.tsx",
      "**/*.live.e2e.test.ts",
      "**/*.live.e2e.test.tsx",
      "**/*.real.e2e.test.ts",
      "**/*.real.e2e.test.tsx",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@elizaos/agent",
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
