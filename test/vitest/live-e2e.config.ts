import baseConfig from "./e2e.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "eliza/packages/agent/test/**/*.live.test.ts",
      "eliza/packages/agent/test/**/*.live.test.tsx",
      "eliza/packages/agent/test/**/*-live.test.ts",
      "eliza/packages/agent/test/**/*-live.test.tsx",
      "eliza/packages/agent/test/**/*.live.e2e.test.ts",
      "eliza/packages/agent/test/**/*.live.e2e.test.tsx",
      "eliza/packages/agent/test/**/*.real.e2e.test.ts",
      "eliza/packages/agent/test/**/*.real.e2e.test.tsx",
      "eliza/packages/agent/test/**/*-live.e2e.test.ts",
      "eliza/packages/agent/test/**/*-live.e2e.test.tsx",
      "eliza/packages/app-core/test/**/*.live.test.ts",
      "eliza/packages/app-core/test/**/*.live.test.tsx",
      "eliza/packages/app-core/test/**/*-live.test.ts",
      "eliza/packages/app-core/test/**/*-live.test.tsx",
      "eliza/packages/app-core/test/**/*.live.e2e.test.ts",
      "eliza/packages/app-core/test/**/*.live.e2e.test.tsx",
      "eliza/packages/app-core/test/**/*.real.e2e.test.ts",
      "eliza/packages/app-core/test/**/*.real.e2e.test.tsx",
      "eliza/packages/app-core/test/**/*-live.e2e.test.ts",
      "eliza/packages/app-core/test/**/*-live.e2e.test.tsx",
    ],
    exclude: ["dist/**", "**/node_modules/**"],
  },
};
