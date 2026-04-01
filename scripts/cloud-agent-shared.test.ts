import { describe, expect, it, vi } from "vitest";

import {
  loadCloudAgentPlugins,
  shouldEnableStream555Plugin,
} from "../deploy/cloud-agent-shared.ts";

describe("cloud agent plugin loading", () => {
  it("loads the 555stream plugin when the control-plane env is present", async () => {
    const cloudPlugin = { name: "cloud" };
    const sqlPlugin = { name: "sql" };
    const streamPlugin = { name: "555stream" };
    const loadPlugin = vi.fn(
      async (specifier: string): Promise<Record<string, unknown>> => {
        switch (specifier) {
          case "@elizaos/plugin-elizacloud":
            return { default: cloudPlugin };
          case "@elizaos/plugin-sql":
            return { sqlPlugin };
          case "@rndrntwrk/plugin-555stream":
            return { stream555Plugin: streamPlugin };
          default:
            throw new Error(`Unexpected plugin request: ${specifier}`);
        }
      },
    );

    const plugins = await loadCloudAgentPlugins(
      { STREAM555_BASE_URL: "https://control.example.test" },
      loadPlugin,
    );

    expect(plugins).toEqual([cloudPlugin, sqlPlugin, streamPlugin]);
    expect(loadPlugin).toHaveBeenCalledWith("@rndrntwrk/plugin-555stream");
  });

  it("skips the 555stream plugin when the control-plane env is absent", async () => {
    const loadPlugin = vi.fn(
      async (specifier: string): Promise<Record<string, unknown>> => {
        switch (specifier) {
          case "@elizaos/plugin-elizacloud":
            return { elizaOSCloudPlugin: { name: "cloud" } };
          case "@elizaos/plugin-sql":
            return { default: { name: "sql" } };
          case "@rndrntwrk/plugin-555stream":
            return { stream555Plugin: { name: "555stream" } };
          default:
            throw new Error(`Unexpected plugin request: ${specifier}`);
        }
      },
    );

    const plugins = await loadCloudAgentPlugins({}, loadPlugin);

    expect(plugins).toEqual([{ name: "cloud" }, { name: "sql" }]);
    expect(loadPlugin).not.toHaveBeenCalledWith("@rndrntwrk/plugin-555stream");
  });

  it("treats blank control-plane values as disabled", () => {
    expect(shouldEnableStream555Plugin({ STREAM555_BASE_URL: "   " })).toBe(
      false,
    );
    expect(
      shouldEnableStream555Plugin({
        STREAM555_BASE_URL: "https://control.example.test",
      }),
    ).toBe(true);
  });
});
