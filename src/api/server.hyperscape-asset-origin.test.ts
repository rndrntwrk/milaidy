import { describe, expect, it } from "vitest";
import { resolveManagedAppUpstreamOrigin } from "./server";

describe("resolveManagedAppUpstreamOrigin", () => {
  it("routes hyperscape audio files to the assets origin", () => {
    const origin = resolveManagedAppUpstreamOrigin(
      "@elizaos/app-hyperscape",
      "/audio/music/river.mp3",
      "https://hyperscape.gg",
    );

    expect(origin).toBe("https://assets.hyperscape.club");
  });

  it("keeps hyperscape application paths on the default origin", () => {
    const origin = resolveManagedAppUpstreamOrigin(
      "@elizaos/app-hyperscape",
      "/_next/static/chunks/app.js",
      "https://hyperscape.gg",
    );

    expect(origin).toBe("https://hyperscape.gg");
  });

  it("does not remap non-hyperscape apps", () => {
    const origin = resolveManagedAppUpstreamOrigin(
      "@elizaos/app-babylon",
      "/audio/music/river.mp3",
      "https://example.test",
    );

    expect(origin).toBe("https://example.test");
  });
});
