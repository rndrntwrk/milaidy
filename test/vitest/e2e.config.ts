import fs from "node:fs";
import path from "node:path";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getInstalledPackageEntry,
  getSharedSourceRoot,
  getUiSourceRoot,
  resolveModuleEntry,
} from "../../eliza/packages/app-core/test/eliza-package-paths";
import { repoRoot } from "./repo-root";

const elizaCoreEntry = getElizaCoreEntry(repoRoot);
// See test/vitest/default.config.ts for the rationale — the shim is the canonical
// runtime resolution for `@elizaos/core/roles` when the repo-local eliza
// checkout is absent (CI published-only mode).
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
  : path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "scripts",
      "lib",
      "elizaos-core-roles-shim.js",
    );
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const sharedSourceRoot = getSharedSourceRoot(repoRoot);
const uiSourceRoot = getUiSourceRoot(repoRoot);
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
const pluginAgentOrchestratorEntry =
  getInstalledPackageEntry("@elizaos/core/agent-orchestrator", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "eliza",
      "packages",
      "typescript",
      "src",
      "agent-orchestrator",
      "index",
    ),
  );
const pluginTelegramEntry =
  getInstalledPackageEntry("@elizaos/plugin-telegram", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-telegram",
      "typescript",
      "src",
      "index",
    ),
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

export default {
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
      ...(uiSourceRoot
        ? [
            {
              find: /^@elizaos\/ui\/(.*)/,
              replacement: path.join(uiSourceRoot, "$1"),
            },
          ]
        : []),
      {
        find: /^@elizaos\/app-lifeops\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-lifeops",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-lifeops",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-lifeops",
          "src",
          "index.ts",
        ),
      },
      ...(sharedSourceRoot
        ? [
            {
              find: /^@elizaos\/shared\/(.*)/,
              replacement: path.join(sharedSourceRoot, "$1"),
            },
            {
              find: "@elizaos/shared",
              replacement: path.join(sharedSourceRoot, "index.ts"),
            },
            {
              find: /^@miladyai\/shared\/(.*)/,
              replacement: path.join(sharedSourceRoot, "$1"),
            },
            {
              find: "@elizaos/shared",
              replacement: path.join(sharedSourceRoot, "index.ts"),
            },
          ]
        : []),
      ...(fs.existsSync(pluginPersonalityEntry)
        ? [
            {
              find: "@elizaos/plugin-personality",
              replacement: pluginPersonalityEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginAgentOrchestratorEntry)
        ? [
            {
              find: "@elizaos/core/agent-orchestrator",
              replacement: pluginAgentOrchestratorEntry,
            },
            {
              find: "@elizaos/plugin-agent-orchestrator",
              replacement: pluginAgentOrchestratorEntry,
            },
            {
              find: "@elizaos/plugin-coding-agent",
              replacement: pluginAgentOrchestratorEntry,
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
      ...(fs.existsSync(pluginTelegramEntry)
        ? [
            {
              find: "@elizaos/plugin-telegram",
              replacement: pluginTelegramEntry,
            },
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
    globalSetup: ["eliza/packages/app-core/test/e2e-global-setup.ts"],
    isolate: true,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    passWithNoTests: true,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    include: [
      "eliza/packages/agent/test/**/*.e2e.test.ts",
      "eliza/packages/app-core/test/**/*.e2e.test.ts",
    ],
    setupFiles: ["eliza/packages/app-core/test/setup.ts"],
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
};
