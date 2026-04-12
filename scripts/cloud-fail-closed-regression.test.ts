import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicChatPageSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "cloud",
    "app",
    "chat",
    "[characterId]",
    "page.tsx",
  ),
  "utf-8",
);
const dashboardChatPageSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "cloud",
    "app",
    "dashboard",
    "(chat-build)",
    "chat",
    "page.tsx",
  ),
  "utf-8",
);
const trackViewRouteSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "cloud",
    "app",
    "api",
    "my-agents",
    "characters",
    "[id]",
    "track-view",
    "route.ts",
  ),
  "utf-8",
);
const trackInteractionRouteSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "cloud",
    "app",
    "api",
    "my-agents",
    "characters",
    "[id]",
    "track-interaction",
    "route.ts",
  ),
  "utf-8",
);

describe("cloud fail-closed regressions", () => {
  it("does not resolve substitute data on chat lookup timeouts", () => {
    expect(publicChatPageSource).not.toContain("withFallbackTimeout");
    expect(publicChatPageSource).not.toContain("resolve(fallback)");
    expect(publicChatPageSource).toContain("withLookupTimeout");

    expect(dashboardChatPageSource).not.toContain("withFallbackTimeout");
    expect(dashboardChatPageSource).not.toContain("resolve(fallback)");
    expect(dashboardChatPageSource).toContain("character_unavailable");
  });

  it("marks removed marketplace tracking routes as gone instead of returning fake success", () => {
    expect(trackViewRouteSource).toContain("{ status: 410 }");
    expect(trackViewRouteSource).toContain(
      "Character view tracking was removed with the marketplace service",
    );
    expect(trackViewRouteSource).not.toContain(
      'data: { message: "View tracked" }',
    );

    expect(trackInteractionRouteSource).toContain("{ status: 410 }");
    expect(trackInteractionRouteSource).toContain(
      "Character interaction tracking was removed with the marketplace service",
    );
    expect(trackInteractionRouteSource).not.toContain(
      'data: { message: "Interaction tracked" }',
    );
  });
});
