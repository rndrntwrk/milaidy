import { existsSync } from "node:fs";
import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";

const hyperscapeWrapperModuleUrl = new URL(
  "../../../../../plugins/app-hyperscape/src/index.ts",
  import.meta.url,
);
const hasHyperscapeWrapperModule = existsSync(hyperscapeWrapperModuleUrl);
const hyperscapeWrapperModule = hasHyperscapeWrapperModule
  ? ((await import(hyperscapeWrapperModuleUrl.href)) as {
      createAppHyperscapePlugin: (runtimePlugin: unknown) => {
        metadataOnlyWrapper?: boolean;
        init?: (config: unknown, runtime: IAgentRuntime) => Promise<unknown>;
      };
    })
  : null;

function requireHyperscapeWrapperModule(): NonNullable<
  typeof hyperscapeWrapperModule
> {
  if (!hyperscapeWrapperModule) {
    throw new Error(
      "Hyperscape app wrapper source is unavailable in this checkout.",
    );
  }

  return hyperscapeWrapperModule;
}

function createRuntimeStub(): IAgentRuntime {
  return {
    getSetting: () => undefined,
  } as unknown as IAgentRuntime;
}

describe.skipIf(!hasHyperscapeWrapperModule)("createAppHyperscapePlugin", () => {
  it("fails loudly when only the metadata wrapper is available", async () => {
    const { createAppHyperscapePlugin } = requireHyperscapeWrapperModule();
    const plugin = createAppHyperscapePlugin(null);

    expect(plugin.metadataOnlyWrapper).toBe(true);
    await expect(plugin.init?.({}, createRuntimeStub())).rejects.toThrow(
      "Hyperscape runtime plugin is unavailable.",
    );
  });
});
