import { describe, expect, it } from "vitest";
import {
  ALICE_PRODUCTION_PLUGIN_ALLOWLIST,
  enforceAliceProductionPluginPolicy,
} from "./alice-production-plugin-policy";

describe("Alice production plugin policy", () => {
  it("admits only the exact reviewed runtime closure", () => {
    expect([...ALICE_PRODUCTION_PLUGIN_ALLOWLIST]).toEqual([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
    ]);
    const plugins = new Set([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-evm",
      "@acme/custom-plugin",
    ]);
    expect(
      enforceAliceProductionPluginPolicy(plugins, {
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
      }),
    ).toEqual(["@elizaos/plugin-evm", "@acme/custom-plugin"]);
    expect([...plugins]).toEqual([...ALICE_PRODUCTION_PLUGIN_ALLOWLIST]);
  });

  it("does not alter ordinary Milady plugin resolution", () => {
    const plugins = new Set(["@acme/custom-plugin"]);
    expect(enforceAliceProductionPluginPolicy(plugins, {})).toEqual([]);
    expect([...plugins]).toEqual(["@acme/custom-plugin"]);
  });
});
