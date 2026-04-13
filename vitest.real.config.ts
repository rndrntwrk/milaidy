/**
 * Vitest config for the live/real suite only.
 *
 * This config deliberately avoids the default unit/e2e stub graph and includes
 * only files that are already marked `live` or `real`.
 *
 * Browser-driven QA flows remain opt-in inside the test files themselves
 * (`MILADY_LIVE_BROWSER_SUITE=1`) so `bun run test:real` can pass in
 * environments that have provider credentials but not a launched local UI/API
 * stack.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getSharedSourceRoot,
  getUiSourceRoot,
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
const sharedSourceRoot = getSharedSourceRoot(repoRoot);
const uiSourceRoot = getUiSourceRoot(repoRoot);

process.env.MILADY_LIVE_TEST = "1";
process.env.ELIZA_LIVE_TEST = "1";

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
      ...(uiSourceRoot
        ? [
            {
              find: /^@elizaos\/ui\/(.*)/,
              replacement: path.join(uiSourceRoot, "$1"),
            },
            {
              find: "@elizaos/ui",
              replacement: resolveModuleEntry(path.join(uiSourceRoot, "index")),
            },
          ]
        : []),
      {
        find: /^@elizaos\/app-lifeops\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "plugins", "app-lifeops", "src", "$1"),
      },
      {
        find: "@elizaos/app-lifeops",
        replacement: path.join(repoRoot, "eliza", "plugins", "app-lifeops", "src", "index.ts"),
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
    ],
  },
  test: {
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    execArgv: ["--max-old-space-size=4096"],
    setupFiles: ["test/live.setup.ts"],
    include: [
      "**/*.live.test.ts",
      "**/*.live.test.tsx",
      "**/*-live.test.ts",
      "**/*-live.test.tsx",
      "**/*.live.e2e.test.ts",
      "**/*.live.e2e.test.tsx",
      "**/*-live.e2e.test.ts",
      "**/*-live.e2e.test.tsx",
      "**/*.real.test.ts",
      "**/*.real.test.tsx",
      "**/*-real.test.ts",
      "**/*-real.test.tsx",
      "**/*.real.e2e.test.ts",
      "**/*.real.e2e.test.tsx",
      "**/*-real.e2e.test.ts",
      "**/*-real.e2e.test.tsx",
    ],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "apps/app/electrobun/**",
      "apps/chrome-extension/**",
      "eliza/cloud/**",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@elizaos/agent",
          "@elizaos/app-core",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
