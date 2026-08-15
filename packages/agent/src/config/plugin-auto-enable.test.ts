import { describe, expect, it } from "vitest";

import { applyPluginAutoEnable } from "./plugin-auto-enable.js";

describe("Solana plugin auto-enable", () => {
  it("does not load the legacy Solana plugin from wallet custody alone", () => {
    const result = applyPluginAutoEnable({
      config: {},
      env: { SOLANA_PRIVATE_KEY: "production-wallet-key" },
    });

    expect(result.config.plugins?.allow).not.toContain("solana");
    expect(result.config.plugins?.allow).not.toContain(
      "@elizaos/plugin-solana",
    );
    expect(result.changes).not.toContain(
      "Auto-enabled plugin: @elizaos/plugin-solana (env: SOLANA_PRIVATE_KEY)",
    );
  });

  it("loads the Solana plugin only when the wallet and explicit opt-in are present", () => {
    const result = applyPluginAutoEnable({
      config: {},
      env: {
        SOLANA_PRIVATE_KEY: "production-wallet-key",
        ENABLE_SOLANA_PLUGIN: "1",
      },
    });

    expect(result.config.plugins?.allow).toContain("solana");
    expect(result.config.plugins?.allow).toContain("@elizaos/plugin-solana");
    expect(result.changes).toContain(
      "Auto-enabled plugin: @elizaos/plugin-solana (explicit Solana plugin opt-in)",
    );
  });
});
