import { describe, expect, it } from "vitest";
import { CORE_PLUGINS } from "./core-plugins.js";

describe("Alice corpus core-plugin admission", () => {
  it("loads the corpus plugin exactly once", () => {
    expect(
      CORE_PLUGINS.filter(
        (name) => name === "@miladyai/agent/plugins/alice-corpus",
      ),
    ).toHaveLength(1);
  });
});
