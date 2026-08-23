import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The pinned Eliza workspaces expose source entries under this condition.
    // Exact admission runs from a clean checkout before those packages have
    // emitted dist/, so tests must resolve the same source contract Eliza uses.
    conditions: ["eliza-source"],
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "test/**/*.e2e.test.ts",
    ],
    server: {
      deps: {
        inline: ["@elizaos/core", "zod"],
      },
    },
  },
});
