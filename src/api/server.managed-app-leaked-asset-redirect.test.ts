import { describe, expect, it } from "vitest";
import { resolveManagedAppLeakedAssetRedirect } from "./server";

describe("resolveManagedAppLeakedAssetRedirect", () => {
  it("redirects leaked Next chunk paths to the managed app proxy base", () => {
    const location = resolveManagedAppLeakedAssetRedirect(
      "/_next/static/chunks/main.js",
      "?dpl=test",
      "https://alice.rndrntwrk.com/api/apps/local/%40elizaos%2Fapp-babylon/",
    );

    expect(location).toBe(
      "/api/apps/local/%40elizaos%2Fapp-babylon/_next/static/chunks/main.js?dpl=test",
    );
  });

  it("redirects leaked root script paths to the managed app proxy base", () => {
    const location = resolveManagedAppLeakedAssetRedirect(
      "/script.js",
      "",
      "https://alice.rndrntwrk.com/api/apps/local/%40elizaos%2Fapp-babylon/play",
    );

    expect(location).toBe(
      "/api/apps/local/%40elizaos%2Fapp-babylon/script.js",
    );
  });

  it("returns null when the request path is not a known leaked asset path", () => {
    const location = resolveManagedAppLeakedAssetRedirect(
      "/favicon.ico",
      "",
      "https://alice.rndrntwrk.com/api/apps/local/%40elizaos%2Fapp-babylon/",
    );

    expect(location).toBeNull();
  });

  it("returns null when referer is absent", () => {
    const location = resolveManagedAppLeakedAssetRedirect(
      "/_next/static/chunks/main.js",
      "",
      undefined,
    );

    expect(location).toBeNull();
  });

  it("returns null when referer is not a managed app route", () => {
    const location = resolveManagedAppLeakedAssetRedirect(
      "/_next/static/chunks/main.js",
      "",
      "https://alice.rndrntwrk.com/",
    );

    expect(location).toBeNull();
  });
});
