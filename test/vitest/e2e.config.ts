import baseConfig from "./real.config";

export const heavyOnlyE2EPaths = [
  "eliza/packages/agent/test/anvil-contracts.real.e2e.test.ts",
  "eliza/packages/app-core/test/app/memory-relationships.real.e2e.test.ts",
  "eliza/packages/app-core/test/app/onboarding-companion.live.e2e.test.ts",
  "eliza/packages/app-core/test/app/qa-checklist.real.e2e.test.ts",
];

export const checkoutDependentE2EPaths = [
  // These suites reach into plugin source trees that are not present in every
  // checkout of this repo, so keep them out of the default lane until those
  // plugin repos are vendored or the tests switch to package imports.
  "eliza/packages/agent/test/agent-runtime.live.e2e.test.ts",
  "eliza/packages/agent/test/personality-routing.live.e2e.test.ts",
  "eliza/packages/agent/test/quicksort-coding-agent.live.e2e.test.ts",
];

export const defaultE2EInclude = [
  "eliza/apps/**/*.live.e2e.test.ts",
  "eliza/apps/**/*.real.e2e.test.ts",
  "eliza/packages/**/*.live.e2e.test.ts",
  "eliza/packages/**/*.real.e2e.test.ts",
];

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: defaultE2EInclude,
    exclude: [
      ...(baseConfig.test?.exclude ?? []),
      ...heavyOnlyE2EPaths,
      ...checkoutDependentE2EPaths,
    ],
  },
};
