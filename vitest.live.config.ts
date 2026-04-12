import { defineConfig } from "vitest/config";
import realConfig from "./vitest.real.config";

const config = realConfig as Record<string, unknown> & {
  test?: Record<string, unknown>;
};

export default defineConfig({
  ...config,
  test: {
    ...(config.test ?? {}),
    include: [
      "packages/agent/test/**/*.live.test.ts",
      "packages/app-core/test/**/*.live.test.ts",
      "packages/app-core/test/**/*.live.e2e.test.ts",
    ],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "apps/app/electrobun/**",
      "apps/chrome-extension/**",
    ],
  },
});
