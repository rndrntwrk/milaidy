/**
 * Vitest config for the live/real suite only.
 *
 * This config deliberately avoids the default unit/e2e stub graph and includes
 * only files that are already marked `live` or `real`, plus the mixed
 * cloud-provider integration spec that contains gated live cases.
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
              find: "@miladyai/agent",
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
              find: "@miladyai/app-core",
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
        find: "@miladyai/plugin-selfcontrol",
        replacement: path.join(
          repoRoot,
          "packages",
          "plugin-selfcontrol",
          "src",
          "index.ts",
        ),
      },
      {
        find: /^@miladyai\/shared\/(.*)/,
        replacement: path.join(repoRoot, "packages", "shared", "src", "$1"),
      },
      {
        find: "@miladyai/shared",
        replacement: path.join(
          repoRoot,
          "packages",
          "shared",
          "src",
          "index.ts",
        ),
      },
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
      "packages/agent/test/cloud-providers.e2e.test.ts",
    ],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "apps/app/electrobun/**",
      "apps/chrome-extension/**",
      "cloud/**",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@miladyai/agent",
          "@miladyai/app-core",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
