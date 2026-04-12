import { describe, expect, it } from "vitest";
import { buildLifeOpsBrowserReleaseManifestForVersion } from "./lifeops-browser-packaging.js";

describe("lifeops browser packaging", () => {
  it("builds a portable GitHub release manifest from the current version", () => {
    const manifest =
      buildLifeOpsBrowserReleaseManifestForVersion("2.0.0-alpha.116");

    expect(manifest).toMatchObject({
      schema: "lifeops_browser_release_v2",
      releaseTag: "v2.0.0-alpha.116",
      releaseVersion: "2.0.0-alpha.116",
      repository: "milady-ai/milady",
      chromeVersion: "2.0.0.30116",
      chromeVersionName: "2.0.0-alpha.116",
      safariMarketingVersion: "2.0.0",
      safariBuildVersion: "200006116",
      chrome: {
        installKind: "github_release",
        installUrl:
          "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.116/lifeops-browser-chrome-v2.0.0-alpha.116.zip",
        storeListingUrl: null,
        asset: {
          fileName: "lifeops-browser-chrome-v2.0.0-alpha.116.zip",
        },
      },
      safari: {
        installKind: "github_release",
        installUrl:
          "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.116/lifeops-browser-safari-v2.0.0-alpha.116.zip",
        storeListingUrl: null,
        asset: {
          fileName: "lifeops-browser-safari-v2.0.0-alpha.116.zip",
        },
      },
    });
    expect(manifest?.releasePageUrl).toBe(
      "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.116",
    );
    expect(manifest?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("switches to store installs when store URLs are configured", () => {
    const manifest = buildLifeOpsBrowserReleaseManifestForVersion("2.0.0", {
      GITHUB_REPOSITORY: "milady-ai/milady",
      MILADY_LIFEOPS_BROWSER_CHROME_STORE_URL:
        "https://chromewebstore.google.com/detail/lifeops-browser/example",
      MILADY_LIFEOPS_BROWSER_SAFARI_STORE_URL:
        "https://apps.apple.com/us/app/lifeops-browser/id1234567890",
    });

    expect(manifest?.chrome.installKind).toBe("chrome_web_store");
    expect(manifest?.chrome.installUrl).toBe(
      "https://chromewebstore.google.com/detail/lifeops-browser/example",
    );
    expect(manifest?.safari.installKind).toBe("apple_app_store");
    expect(manifest?.safari.installUrl).toBe(
      "https://apps.apple.com/us/app/lifeops-browser/id1234567890",
    );
  });
});
