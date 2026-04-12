import { describe, expect, it } from "vitest";
import { syncPluginAction } from "../sync-plugin";

describe("syncPluginAction", () => {
  it("requires a pluginId parameter", async () => {
    const result = await syncPluginAction.handler?.(
      {} as never,
      {} as never,
      {} as never,
      { parameters: {} } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: "I need a plugin ID to sync.",
    });
  });
});
