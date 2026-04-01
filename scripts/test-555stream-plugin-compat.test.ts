import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildTemporaryBundle,
  coreFallbackPaths,
  importElizaCore,
} from "./test-555stream-plugin-compat.ts";

describe("test-555stream-plugin-compat", () => {
  it("builds a temporary plugin bundle", async () => {
    const bundlePath = await buildTemporaryBundle();

    expect(bundlePath.endsWith("plugin-555stream-compat-dist/index.js")).toBe(
      true,
    );
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("resolves eliza core from the current checkout or fallback paths", async () => {
    const core = await importElizaCore();

    expect(core).toBeTruthy();
    expect(typeof (core as Record<string, unknown>).AgentRuntime).toBe(
      "function",
    );
    expect(coreFallbackPaths.length).toBeGreaterThan(0);
  });
});
