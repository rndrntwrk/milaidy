import { describe, expect, it } from "vitest";
import type { ElizaConfig } from "../config/config";
import { collectPluginNames, findRuntimePluginExport } from "./eliza";

describe("five55-games runtime mapping", () => {
  it("normalizes five55-games in plugins.allow", () => {
    const config = {
      plugins: { allow: ["five55-games"] },
    } as Partial<ElizaConfig> as ElizaConfig;
    const names = collectPluginNames(config);

    expect(names.has("@miladyai/agent/plugins/five55-games")).toBe(true);
  });

  it("auto-loads five55-games when stream agent-v1 env is configured", () => {
    const prev = { ...process.env };
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
    try {
      const names = collectPluginNames({} as ElizaConfig);
      expect(names.has("@miladyai/agent/plugins/five55-games")).toBe(true);
    } finally {
      process.env = prev;
    }
  });

  it("loads the internal five55-games module as a runtime plugin", async () => {
    const mod = (await import("@miladyai/agent/plugins/five55-games")) as Record<
      string,
      unknown
    >;
    const plugin = findRuntimePluginExport(mod);

    expect(plugin?.name).toBe("five55-games");
    expect(plugin?.actions?.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "FIVE55_GAMES_CATALOG",
        "FIVE55_GAMES_PLAY",
        "FIVE55_GAMES_SWITCH",
        "FIVE55_GAMES_STOP",
        "FIVE55_GAMES_GO_LIVE_PLAY",
      ]),
    );
  });
});
