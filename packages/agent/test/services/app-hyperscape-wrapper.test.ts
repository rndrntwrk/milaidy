import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createAppHyperscapePlugin } from "../../../../../plugins/app-hyperscape/src/index.ts";

function createRuntimeStub(): IAgentRuntime {
  return {
    getSetting: () => undefined,
  } as unknown as IAgentRuntime;
}

describe("createAppHyperscapePlugin", () => {
  it("fails loudly when only the metadata wrapper is available", async () => {
    const plugin = createAppHyperscapePlugin(null);

    expect(plugin.metadataOnlyWrapper).toBe(true);
    await expect(plugin.init?.({}, createRuntimeStub())).rejects.toThrow(
      "Hyperscape runtime plugin is unavailable.",
    );
  });
});
