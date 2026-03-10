import { describe, expect, it } from "vitest";
import {
  resolveProStreamerBrandComponent,
  resolveProStreamerBrandIcon,
} from "../src/proStreamerBrandIcons";
import {
  TwitchIcon,
  XBrandIcon,
  YouTubeIcon,
} from "../src/components/ui/Icons";

describe("resolveProStreamerBrandIcon", () => {
  it("resolves provider logos through the shared provider registry", () => {
    const icon = resolveProStreamerBrandIcon(["openai"]);
    expect(icon).toMatchObject({
      kind: "image",
    });
    expect(icon?.kind === "image" ? icon.src : "").toContain(
      "/logos/openai-icon-white.png",
    );
  });

  it("normalizes scoped plugin ids before matching provider logos", () => {
    const icon = resolveProStreamerBrandIcon(["@elizaos/plugin-openrouter"]);
    expect(icon).toMatchObject({
      kind: "image",
    });
    expect(icon?.kind === "image" ? icon.src : "").toContain(
      "/logos/openrouter-icon-white.png",
    );
  });

  it("resolves x/twitter to the x brand icon", () => {
    const icon = resolveProStreamerBrandIcon(["twitter"]);
    expect(icon).toEqual({
      kind: "component",
      Component: XBrandIcon,
    });
  });

  it("resolves social destination components directly", () => {
    expect(resolveProStreamerBrandComponent(["twitch"])).toBe(TwitchIcon);
    expect(resolveProStreamerBrandComponent(["youtube"])).toBe(YouTubeIcon);
  });

  it("returns null for non-brand keys", () => {
    expect(resolveProStreamerBrandIcon(["totally-unknown-plugin"])).toBeNull();
  });
});
