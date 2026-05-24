import { describe, expect, it } from "vitest";
import { CONFIG_WRITE_ALLOWED_TOP_KEYS } from "./plugin-discovery-helpers";

describe("CONFIG_WRITE_ALLOWED_TOP_KEYS", () => {
  it("allows the streaming root config used by Go Live setup", () => {
    expect(CONFIG_WRITE_ALLOWED_TOP_KEYS.has("streaming")).toBe(true);
  });
});
