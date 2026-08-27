import { describe, expect, it } from "vitest";
import {
  injectApiBaseIntoHtml,
  injectBaseHrefIntoHtml,
  isCompanionUiPath,
  isPublicBroadcastUiPath,
  shouldInjectRootBaseHref,
} from "./static-file-server";

describe("isPublicBroadcastUiPath", () => {
  it("recognizes the public broadcast shell route", () => {
    expect(isPublicBroadcastUiPath("/broadcast/alice-cam")).toBe(true);
    expect(isPublicBroadcastUiPath("/broadcast/alice-cam/")).toBe(true);
  });

  it("does not treat unrelated routes as public broadcast", () => {
    expect(isPublicBroadcastUiPath("/")).toBe(false);
    expect(isPublicBroadcastUiPath("/companion")).toBe(false);
    expect(isPublicBroadcastUiPath("/api/broadcast/alice-cam/scene")).toBe(
      false,
    );
  });
});

describe("isCompanionUiPath", () => {
  it("recognizes the companion shell route", () => {
    expect(isCompanionUiPath("/companion")).toBe(true);
    expect(isCompanionUiPath("/companion/")).toBe(true);
  });

  it("does not treat companion assets or unrelated routes as shell HTML", () => {
    expect(isCompanionUiPath("/companion/assets/main.js")).toBe(false);
    expect(isCompanionUiPath("/apps/companion")).toBe(false);
    expect(isCompanionUiPath("/api/companion/stage")).toBe(false);
  });
});

describe("shouldInjectRootBaseHref", () => {
  it("enables root base injection for web sub-route shells", () => {
    expect(shouldInjectRootBaseHref("/broadcast/alice-cam")).toBe(true);
    expect(shouldInjectRootBaseHref("/broadcast/alice-cam/")).toBe(true);
    expect(shouldInjectRootBaseHref("/companion")).toBe(true);
    expect(shouldInjectRootBaseHref("/companion/")).toBe(true);
  });

  it("does not enable root base injection for assets or APIs", () => {
    expect(shouldInjectRootBaseHref("/")).toBe(false);
    expect(shouldInjectRootBaseHref("/assets/main.js")).toBe(false);
    expect(shouldInjectRootBaseHref("/companion/assets/main.js")).toBe(false);
    expect(shouldInjectRootBaseHref("/api/companion/stage")).toBe(false);
  });
});

describe("injectApiBaseIntoHtml", () => {
  it("injects the api token only when explicitly provided", () => {
    const html = Buffer.from("<html><head></head><body></body></html>");
    const injected = injectApiBaseIntoHtml(html, null, { apiToken: "secret" })
      .toString("utf8");
    const withoutToken = injectApiBaseIntoHtml(html, null).toString("utf8");

    expect(injected).toContain("window.__ELIZA_API_TOKEN__");
    expect(withoutToken).not.toContain("window.__ELIZA_API_TOKEN__");
  });

  it("can suppress bearer injection for an authenticated gateway shell", () => {
    const html = Buffer.from("<html><head></head><body></body></html>");
    const out = injectApiBaseIntoHtml(html, null, {
      apiToken: "must-not-reach-browser",
      allowApiToken: false,
    }).toString("utf8");

    expect(out).not.toContain("must-not-reach-browser");
    expect(out).not.toContain("window.__ELIZA_API_TOKEN__");
    expect(out).toContain("window.__MILADY_API_BASE__");
  });

  it("declares same-origin as the API base when no explicit base is provided", () => {
    // Agent-colocated SPA (e.g. alice-bot): /api/* lives at the same origin
    // as the served HTML. The injected marker tells shouldUseCloudOnlyBranding
    // the SPA is not cloud-only, so the startup path calls the same-origin
    // /api/onboarding/status instead of routing fresh visitors to onboarding.
    const html = Buffer.from("<html><head></head><body></body></html>");
    const out = injectApiBaseIntoHtml(html, null).toString("utf8");
    expect(out).toContain("window.__MILADY_API_BASE__");
    expect(out).toContain("window.location.origin");
    // Uses a `||` guard so an already-set value (e.g. from a shell preload)
    // is not clobbered.
    expect(out).toContain("window.__MILADY_API_BASE__||window.location.origin");
  });

  it("pins both namespaces when an explicit base is provided", () => {
    const html = Buffer.from("<html><head></head><body></body></html>");
    const out = injectApiBaseIntoHtml(
      html,
      "https://proxy.example.com/p/42",
    ).toString("utf8");
    expect(out).toContain(
      'window.__ELIZA_API_BASE__="https://proxy.example.com/p/42"',
    );
    expect(out).toContain(
      'window.__MILADY_API_BASE__="https://proxy.example.com/p/42"',
    );
    // Same-origin default does NOT fire when an explicit base is given.
    expect(out).not.toContain("window.location.origin");
  });
});

describe("injectBaseHrefIntoHtml", () => {
  it("injects <base href> as the first child of <head>", () => {
    const html = Buffer.from(
      '<!doctype html><html><head><meta charset="utf-8" /><script src="./assets/main.js"></script></head><body></body></html>',
    );
    const out = injectBaseHrefIntoHtml(html, "/").toString("utf8");

    // Base tag is present and points at the supplied href.
    expect(out).toContain('<base href="/" />');
    // Base appears before any other element so relative URLs that follow
    // resolve against it (charset meta, script src, etc.).
    const baseIdx = out.indexOf("<base ");
    const charsetIdx = out.indexOf('<meta charset="utf-8"');
    const scriptIdx = out.indexOf('<script src="./assets/main.js"');
    expect(baseIdx).toBeGreaterThan(0);
    expect(baseIdx).toBeLessThan(charsetIdx);
    expect(baseIdx).toBeLessThan(scriptIdx);
  });

  it("works on a head tag with attributes", () => {
    const html = Buffer.from(
      '<html><head lang="en"><title>x</title></head></html>',
    );
    const out = injectBaseHrefIntoHtml(html, "/foo/").toString("utf8");
    expect(out).toContain('<head lang="en">');
    expect(out).toContain('<base href="/foo/" />');
    expect(out.indexOf("<base ")).toBeLessThan(out.indexOf("<title>"));
  });

  it("returns the html unchanged when href is empty or missing", () => {
    const html = Buffer.from("<html><head></head></html>");
    expect(injectBaseHrefIntoHtml(html, "").toString("utf8")).toBe(
      html.toString("utf8"),
    );
    expect(injectBaseHrefIntoHtml(html, "   ").toString("utf8")).toBe(
      html.toString("utf8"),
    );
  });

  it("returns the html unchanged when there is no <head> tag", () => {
    const html = Buffer.from("<html><body>no head here</body></html>");
    expect(injectBaseHrefIntoHtml(html, "/").toString("utf8")).toBe(
      html.toString("utf8"),
    );
  });

  it("html-escapes the href so a hostile value cannot break out of the attribute", () => {
    const html = Buffer.from("<html><head></head></html>");
    const out = injectBaseHrefIntoHtml(html, '" onload="x').toString("utf8");
    // The inner `"` becomes `&quot;`, so the attribute value stays a
    // single token. The literal text "onload=" inside the value is harmless
    // because both surrounding `"` belong to the original attribute.
    expect(out).toContain('<base href="&quot; onload=&quot;x" />');
    // There is exactly one <base ...> tag and it carries only one attribute.
    const matches = out.match(/<base\s[^>]*?\/>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatch(/^<base href="[^"]*" \/>$/);
  });

  it("html-escapes <, >, and & in the href", () => {
    const html = Buffer.from("<html><head></head></html>");
    const out = injectBaseHrefIntoHtml(html, "/?a=b&c<d>e").toString("utf8");
    expect(out).toContain('<base href="/?a=b&amp;c&lt;d&gt;e" />');
  });
});
