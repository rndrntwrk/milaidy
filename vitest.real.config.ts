/**
 * Vitest config for REAL integration tests — NO MOCKS, NO STUBS.
 *
 * This config resolves all plugins to their real installed packages (no stubs),
 * uses real LLM providers, real PGLite databases, and real connectors.
 *
 * Run with: MILADY_LIVE_TEST=1 bunx vitest run --config vitest.real.config.ts
 * Or:       bun run test:real
 *
 * Tests that need credentials will skipIf() when env vars are missing,
 * so this config is safe to run without full credentials (tests just skip).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// Force live test mode
process.env.MILADY_LIVE_TEST = "1";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Real tests use LLMs and real databases — need generous timeouts
      testTimeout: 300_000,
      hookTimeout: 300_000,

      // Serial execution: real services don't handle parallel well
      // (rate limits, port conflicts, shared state)
      pool: "forks",
      maxWorkers: 1,
      fileParallelism: false,
      isolate: true,

      sequence: {
        concurrent: false,
        shuffle: false,
      },

      // Increase heap for real runtime initialization
      execArgv: ["--max-old-space-size=4096"],

      // Include ALL test patterns — live, e2e, unit, real
      include: [
        "packages/agent/src/**/*.test.ts",
        "packages/agent/src/**/*.test.tsx",
        "packages/agent/test/**/*.test.ts",
        "packages/agent/test/**/*.test.tsx",
        "packages/agent/test/**/*.e2e.test.ts",
        "packages/agent/test/**/*.live.test.ts",
        "packages/app-core/src/**/*.test.ts",
        "packages/app-core/src/**/*.test.tsx",
        "packages/app-core/test/**/*.test.ts",
        "packages/app-core/test/**/*.test.tsx",
        "packages/app-core/test/**/*.e2e.test.ts",
        "packages/app-core/test/**/*.live.test.ts",
        "packages/app-core/test/**/*.live.e2e.test.ts",
        "packages/app-core/test/**/*.real.e2e.test.ts",
        "packages/shared/src/**/*.test.ts",
        "packages/plugin-selfcontrol/src/**/*.test.ts",
        "packages/plugin-wechat/src/**/*.test.ts",
        "packages/plugin-music-player/src/**/*.test.ts",
        "packages/ui/src/**/*.test.ts",
        "packages/ui/src/**/*.test.tsx",
        "scripts/**/*.test.ts",
        "test/**/*.test.ts",
        "test/**/*.e2e.test.ts",
      ],

      setupFiles: ["test/setup.ts"],

      exclude: [
        "dist/**",
        "**/node_modules/**",
        // Electrobun tests need native platform — run separately
        "apps/app/electrobun/**",
        // Chrome extension tests need browser context
        "apps/chrome-extension/**",
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
  }),
);
