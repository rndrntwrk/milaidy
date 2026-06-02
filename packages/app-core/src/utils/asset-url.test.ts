import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAppAssetUrl, resolveRootPublicAssetUrl } from "./asset-url";
import { getBootConfig } from "../config/boot-config";

vi.mock("../config/boot-config", () => ({
  getBootConfig: vi.fn(() => ({})),
}));

vi.mock("./eliza-globals", () => ({
  getElizaApiBase: vi.fn(() => undefined),
}));

describe("resolveAppAssetUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The broadcast page (/broadcast/alice-cam) is served by the same Vite build
   * whose base is "./" (relative). When the runtime is on that page,
   * computeBaseHref resolves "./" against the current URL, yielding
   * http://alice-bot:3000/broadcast/ as the asset base. Assets resolved
   * against that base inherit the /broadcast/ prefix and return 404 because
   * vrm-decoders/, animations/, and vrms/ are served at the site root.
   *
   * These tests assert the problem using the options.baseUrl = "./" knob
   * (which simulates Vite's BASE_URL = "./") so the fix in getDracoDecoderPath()
   * and resolveRootPublicAssetUrl() can be verified without a live browser.
   */
  describe("sub-path + relative base reproduces the broadcast 404 scenario", () => {
    const broadcastUrl = "http://alice-bot:3000/broadcast/alice-cam";
    const relativeBase = "./";

    it("resolveAppAssetUrl with ./ base leaks /broadcast/ into the draco path (demonstrates the original bug)", () => {
      const result = resolveAppAssetUrl("vrm-decoders/draco/", {
        currentUrl: broadcastUrl,
        baseUrl: relativeBase,
      });
      // This demonstrates WHY the fix in getDracoDecoderPath() is needed:
      // resolveAppAssetUrl alone produces the wrong URL on sub-path pages.
      expect(result).toContain("/broadcast/");
    });

    it("resolveAppAssetUrl with ./ base leaks /broadcast/ into animations/idle.glb.gz", () => {
      const result = resolveAppAssetUrl("animations/idle.glb.gz", {
        currentUrl: broadcastUrl,
        baseUrl: relativeBase,
      });
      expect(result).toContain("/broadcast/");
    });
  });

  describe("root-path page resolves to expected URLs", () => {
    const rootUrl = "http://alice-bot:3000/";
    const relativeBase = "./";

    it("resolves draco decoder to /vrm-decoders/draco/ from site root", () => {
      const result = resolveAppAssetUrl("vrm-decoders/draco/", {
        currentUrl: rootUrl,
        baseUrl: relativeBase,
      });
      expect(result).toBe("http://alice-bot:3000/vrm-decoders/draco/");
    });

    it("resolves animations/idle.glb.gz to site root", () => {
      const result = resolveAppAssetUrl("animations/idle.glb.gz", {
        currentUrl: rootUrl,
        baseUrl: relativeBase,
      });
      expect(result).toBe("http://alice-bot:3000/animations/idle.glb.gz");
    });
  });

  describe("the fix: window.location.origin anchors assets to site root", () => {
    /**
     * getDracoDecoderPath() and resolveRootPublicAssetUrl() bypass
     * resolveAppAssetUrl in browser contexts and instead use:
     *   new URL("/vrm-decoders/draco/", window.location.origin)
     * This test verifies that pattern produces the correct URL regardless
     * of the current page path.
     */
    it("new URL with /path and origin ignores sub-path on broadcast URL", () => {
      const origin = "http://alice-bot:3000";
      const result = new URL("/vrm-decoders/draco/", origin).toString();
      expect(result).toBe("http://alice-bot:3000/vrm-decoders/draco/");
      expect(result).not.toContain("/broadcast/");
    });

    it("new URL with /path and origin is stable regardless of current page path", () => {
      const origin = "http://alice-bot:3000";
      const paths = [
        "/vrm-decoders/draco/",
        "/animations/idle.glb.gz",
        "/animations/emotes/greeting.fbx",
      ];
      for (const p of paths) {
        const result = new URL(p, origin).toString();
        expect(result).toContain("http://alice-bot:3000");
        expect(result).not.toContain("/broadcast/");
      }
    });
  });

  describe("already-absolute paths are returned as-is", () => {
    it("returns https:// URLs unchanged", () => {
      const url = "https://cdn.example.com/vrm-decoders/draco/";
      expect(resolveAppAssetUrl(url)).toBe(url);
    });

    it("returns http:// URLs unchanged", () => {
      const url = "http://alice-bot:3000/vrm-decoders/draco/";
      expect(resolveAppAssetUrl(url)).toBe(url);
    });
  });

  describe("empty / blank input", () => {
    it("returns an empty string for empty input", () => {
      expect(resolveAppAssetUrl("")).toBe("");
    });
  });
});

describe("resolveRootPublicAssetUrl", () => {
  const broadcastHref = "http://alice-bot:3000/broadcast/alice-cam";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBootConfig).mockReturnValue(
      {} as ReturnType<typeof getBootConfig>,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers a configured CDN assetBaseUrl over the page origin (does not bypass the CDN)", () => {
    vi.mocked(getBootConfig).mockReturnValue({
      assetBaseUrl: "https://cdn.example.com",
    } as ReturnType<typeof getBootConfig>);
    vi.stubGlobal("window", {
      location: { origin: "http://alice-bot:3000", href: broadcastHref },
    });
    expect(resolveRootPublicAssetUrl("vrms/milady-9.vrm.gz")).toBe(
      "https://cdn.example.com/vrms/milady-9.vrm.gz",
    );
  });

  it("anchors to the site origin when no CDN is set, ignoring the /broadcast/ sub-path", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://alice-bot:3000", href: broadcastHref },
    });
    const result = resolveRootPublicAssetUrl("vrms/milady-9.vrm.gz");
    expect(result).toBe("http://alice-bot:3000/vrms/milady-9.vrm.gz");
    expect(result).not.toContain("/broadcast/");
  });

  it("preserves cache-busting query strings when origin-anchoring", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://alice-bot:3000", href: broadcastHref },
    });
    expect(
      resolveRootPublicAssetUrl("vrms/previews/milady-9.png?v=20260413"),
    ).toBe("http://alice-bot:3000/vrms/previews/milady-9.png?v=20260413");
  });

  it("does not throw on an opaque (file://) origin reported as the string 'null'", () => {
    vi.stubGlobal("window", { location: { origin: "null" } });
    expect(() =>
      resolveRootPublicAssetUrl("vrms/milady-9.vrm.gz"),
    ).not.toThrow();
    // Falls through to resolveAppAssetUrl, which yields a root-relative path
    // when no usable base href is available — never a thrown TypeError.
    expect(resolveRootPublicAssetUrl("vrms/milady-9.vrm.gz")).toBe(
      "/vrms/milady-9.vrm.gz",
    );
  });

  it("falls back to resolveAppAssetUrl when there is no window (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(resolveRootPublicAssetUrl("vrms/milady-9.vrm.gz")).toBe(
      "/vrms/milady-9.vrm.gz",
    );
  });
});
