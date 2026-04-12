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
// See vitest.config.ts for the rationale — `@elizaos/core/roles` falls
// back to the committed shim when the local eliza checkout is absent
// (CI published-only mode).
const elizaCoreRolesSourceFile = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
  "src",
  "roles.ts",
);
const elizaCoreRolesEntry = fs.existsSync(elizaCoreRolesSourceFile)
  ? elizaCoreRolesSourceFile
  : path.join(repoRoot, "scripts", "lib", "elizaos-core-roles-shim.js");
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);

const liveTest = process.env.MILADY_LIVE_TEST === "1";
// Startup e2e tests require module isolation so that vi.mock() registrations
// from one test file do not bleed into another.  The shared e2e config uses
// isolate:false for speed, but the startup tests mock the same modules
// (e.g. @miladyai/app-core/state) with incompatible factories, causing
// cross-file interference when run together without isolation.
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
                                                ...(!liveTest
        ? [
                                                                      ]
        : []),
                      ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ["test/e2e-global-setup.ts"],
    // isolate: true so each startup test file gets its own module registry.
    // This prevents vi.mock() factories from different files from interfering.
    isolate: true,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // Startup E2E also runs serial jsdom suites in a single fork.
    execArgv: ["--max-old-space-size=4096"],
    sequence: {
      concurrent: false,
      shuffle: false,
    },
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
          "@miladyai/agent",
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
