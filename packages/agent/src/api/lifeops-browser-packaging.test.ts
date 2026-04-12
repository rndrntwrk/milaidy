import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLifeOpsBrowserReleaseManifestForVersion,
  resolveLifeOpsBrowserReleaseManifest,
} from "./lifeops-browser-packaging.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

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

  it("only synthesizes release install metadata when explicitly allowed", () => {
    expect(
      resolveLifeOpsBrowserReleaseManifest("/definitely-missing-artifacts"),
    ).toBeNull();

    const synthesized = resolveLifeOpsBrowserReleaseManifest(null, {
      allowSynthesis: true,
      version: "2.0.0",
    });
    expect(synthesized?.chrome.installKind).toBe("github_release");
    expect(synthesized?.chrome.installUrl).toBe(
      "https://github.com/milady-ai/milady/releases/download/v2.0.0/lifeops-browser-chrome-v2.0.0.zip",
    );
  });

  it("prefers an on-disk release manifest over synthesized metadata", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifeops-browser-manifest-"),
    );
    tempDirs.push(tempDir);
    const manifestPath = path.join(
      tempDir,
      "lifeops-browser-release-manifest.json",
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: "lifeops_browser_release_v2",
        releaseTag: "v9.9.9",
        releaseVersion: "9.9.9",
        repository: "milady-ai/milady",
        releasePageUrl:
          "https://github.com/milady-ai/milady/releases/tag/v9.9.9",
        chromeVersion: "9.9.9.60000",
        chromeVersionName: "9.9.9",
        safariMarketingVersion: "9.9.9",
        safariBuildVersion: "909099000",
        chrome: {
          installKind: "github_release",
          installUrl: "https://example.com/lifeops-browser-chrome-v9.9.9.zip",
          storeListingUrl: null,
          asset: {
            fileName: "lifeops-browser-chrome-v9.9.9.zip",
            downloadUrl:
              "https://example.com/lifeops-browser-chrome-v9.9.9.zip",
          },
        },
        safari: {
          installKind: "github_release",
          installUrl: "https://example.com/lifeops-browser-safari-v9.9.9.zip",
          storeListingUrl: null,
          asset: {
            fileName: "lifeops-browser-safari-v9.9.9.zip",
            downloadUrl:
              "https://example.com/lifeops-browser-safari-v9.9.9.zip",
          },
        },
        generatedAt: "2026-04-12T00:00:00.000Z",
      }),
    );

    const manifest = resolveLifeOpsBrowserReleaseManifest(tempDir, {
      allowSynthesis: true,
      version: "2.0.0",
    });

    expect(manifest?.releaseVersion).toBe("9.9.9");
    expect(manifest?.chrome.installUrl).toBe(
      "https://example.com/lifeops-browser-chrome-v9.9.9.zip",
    );
  });
});
