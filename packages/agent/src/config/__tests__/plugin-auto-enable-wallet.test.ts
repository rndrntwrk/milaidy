/**
 * Tests that wallet private keys trigger auto-enable for
 * plugin-evm and plugin-solana.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Import the AUTH_PROVIDER_PLUGINS map to verify wallet keys are present
// We test the mapping directly since the full applyPluginAutoEnable
// function has complex runtime dependencies.

describe("wallet plugin auto-enable", () => {
  let AUTH_PROVIDER_PLUGINS: Record<string, string>;

  beforeEach(async () => {
    const mod = await import("../plugin-auto-enable");
    // The map is not exported directly — read it from the module internals.
    // If the module structure changes, this test will break and tell us.
    AUTH_PROVIDER_PLUGINS = (mod as Record<string, unknown>)
      .AUTH_PROVIDER_PLUGINS as Record<string, string>;
  });

  it("maps EVM_PRIVATE_KEY to plugin-evm", () => {
    expect(AUTH_PROVIDER_PLUGINS.EVM_PRIVATE_KEY).toBe(
      "@elizaos/plugin-evm",
    );
  });

  it("maps SOLANA_PRIVATE_KEY to plugin-solana", () => {
    expect(AUTH_PROVIDER_PLUGINS.SOLANA_PRIVATE_KEY).toBe(
      "@elizaos/plugin-solana",
    );
  });

  it("still maps existing cloud/ai provider keys", () => {
    expect(AUTH_PROVIDER_PLUGINS.ANTHROPIC_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
    expect(AUTH_PROVIDER_PLUGINS.OPENAI_API_KEY).toBe(
      "@elizaos/plugin-openai",
    );
    expect(AUTH_PROVIDER_PLUGINS.ELIZAOS_CLOUD_API_KEY).toBe(
      "@elizaos/plugin-elizacloud",
    );
  });
});
