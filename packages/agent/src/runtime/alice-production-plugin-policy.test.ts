import { describe, expect, it } from "vitest";
import {
  ALICE_PRODUCTION_PLUGIN_ALLOWLIST,
  constrainAliceProductionPluginSurface,
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

  it("does not collapse the exact full-gated Alice composition", () => {
    const plugins = new Set([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-discord",
    ]);
    expect(
      enforceAliceProductionPluginPolicy(plugins, {
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: "full-gated",
      }),
    ).toEqual([]);
    expect([...plugins]).toEqual([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-discord",
    ]);
  });

  it("removes SQL service and route surfaces before Alice registration", () => {
    const sqlPlugin = {
      name: "@elizaos/plugin-sql",
      description: "fixture",
      services: [{ serviceType: "memoryStorage" }],
      routes: [{ path: "/identity/person-link" }],
      dispose: () => undefined,
      schema: { memories: {} },
      init: () => undefined,
    };

    const constrained = constrainAliceProductionPluginSurface(
      "@elizaos/plugin-sql",
      sqlPlugin,
      { ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only" },
    );

    expect(constrained).not.toBe(sqlPlugin);
    expect(constrained.services).toEqual([]);
    expect(constrained.routes).toEqual([]);
    expect(constrained.dispose).toBeUndefined();
    expect(constrained.schema).toBe(sqlPlugin.schema);
    expect(constrained.init).toBe(sqlPlugin.init);
  });

  it("does not rewrite ordinary Milady or the bounded OpenAI model plugin", () => {
    const sqlPlugin = {
      name: "@elizaos/plugin-sql",
      services: [{ serviceType: "memoryStorage" }],
    };
    expect(
      constrainAliceProductionPluginSurface("@elizaos/plugin-sql", sqlPlugin, {}),
    ).toBe(sqlPlugin);

    const openaiPlugin = {
      name: "openai",
      models: { TEXT_LARGE: () => "ok" },
    };
    expect(
      constrainAliceProductionPluginSurface(
        "@elizaos/plugin-openai",
        openaiPlugin,
        { ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only" },
      ),
    ).toBe(openaiPlugin);
  });
});
