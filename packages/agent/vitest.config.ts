import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaRoot = path.resolve(packageRoot, "../../eliza");
const elizaPath = (...segments: string[]) => path.join(elizaRoot, ...segments);

export default defineConfig({
  resolve: {
    // The pinned Eliza workspaces expose source entries under this condition.
    // Vite still validates linked package main/module entries before applying
    // custom conditions in some workspace graphs, so mirror Eliza's own root
    // test aliases for the runtime packages loaded by AgentRuntime.
    conditions: ["eliza-source"],
    alias: [
      {
        find: /^@elizaos\/core\/atomic-json$/,
        replacement: elizaPath("packages/core/src/utils/atomic-json.ts"),
      },
      {
        find: /^@elizaos\/core\/node$/,
        replacement: elizaPath("packages/core/src/index.node.ts"),
      },
      {
        find: /^@elizaos\/core$/,
        replacement: elizaPath("packages/core/src/index.node.ts"),
      },
      {
        find: /^@elizaos\/core\/(.+)$/,
        replacement: elizaPath("packages/core/src/$1"),
      },
      {
        find: /^@elizaos\/logger$/,
        replacement: elizaPath("packages/logger/src/index.ts"),
      },
      {
        find: /^@elizaos\/shared$/,
        replacement: elizaPath("packages/shared/src/index.ts"),
      },
      {
        find: /^@elizaos\/shared\/(.+)$/,
        replacement: elizaPath("packages/shared/src/$1"),
      },
      {
        find: /^@elizaos\/auth$/,
        replacement: elizaPath("packages/auth/src/index.ts"),
      },
      {
        find: /^@elizaos\/auth\/(.+)$/,
        replacement: elizaPath("packages/auth/src/$1"),
      },
      {
        find: /^@elizaos\/vault$/,
        replacement: elizaPath("packages/vault/src/index.ts"),
      },
      {
        find: /^@elizaos\/vault\/(.+)$/,
        replacement: elizaPath("packages/vault/src/$1"),
      },
      {
        find: /^@elizaos\/cloud-sdk$/,
        replacement: elizaPath("packages/cloud/sdk/src/index.ts"),
      },
      {
        find: /^@elizaos\/cloud-sdk\/(.+)$/,
        replacement: elizaPath("packages/cloud/sdk/src/$1"),
      },
      {
        find: /^@elizaos\/cloud-routing$/,
        replacement: elizaPath("packages/cloud/routing/src/index.ts"),
      },
      {
        find: /^@elizaos\/cloud-routing\/(.+)$/,
        replacement: elizaPath("packages/cloud/routing/src/$1"),
      },
    ],
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
