import { describe, expect, it } from "vitest";
import { createElizaPlugin } from "./eliza-plugin";

describe("createElizaPlugin", () => {
  it("registers lifeops provider and conversational action", () => {
    const plugin = createElizaPlugin();

    expect(plugin.providers?.some((provider) => provider.name === "lifeops")).toBe(
      true,
    );
    expect(
      plugin.actions?.some((action) => action.name === "MANAGE_LIFEOPS"),
    ).toBe(true);
  });
});
