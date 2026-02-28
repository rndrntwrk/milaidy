import { describe, expect, it } from "vitest";
import {
  rewriteManagedAppProxyHtml,
  rewriteManagedAppProxyJavaScript,
} from "./server";

describe("managed app proxy path rewriting", () => {
  it("rewrites Next.js public path for non-hyperscape apps", () => {
    const localProxyBase = "/api/apps/local/%40elizaos%2Fapp-babylon";
    const localProxyRoot = `${localProxyBase}/`;
    const input =
      '(()=>{"use strict";var s={};s.p="/_next/";return"/_next/static/chunks/main.js"})()';

    const output = rewriteManagedAppProxyJavaScript(
      "@elizaos/app-babylon",
      input,
      localProxyBase,
      localProxyRoot,
      "/_next/static/chunks/webpack.js",
    );

    expect(output).toContain(`s.p="${localProxyRoot}_next/"`);
    expect(output).toContain(`${localProxyRoot}_next/static/chunks/main.js`);
  });

  it("rewrites root-relative Next assets in proxied HTML", () => {
    const localProxyRoot = "/api/apps/local/%40elizaos%2Fapp-babylon/";
    const input =
      '<script>self.__next_f.push(["\\"/_next/static/chunks/a.js\\""]);</script>';

    const output = rewriteManagedAppProxyHtml(
      "@elizaos/app-babylon",
      input,
      localProxyRoot,
    );

    expect(output).toContain(`\\"${localProxyRoot}_next/static/chunks/a.js\\"`);
  });

  it("disables registerSW.js for proxied apps", () => {
    const output = rewriteManagedAppProxyJavaScript(
      "@elizaos/app-babylon",
      "self.__WB_MANIFEST=[];",
      "/api/apps/local/%40elizaos%2Fapp-babylon",
      "/api/apps/local/%40elizaos%2Fapp-babylon/",
      "/registerSW.js",
    );

    expect(output).toContain("service worker registration disabled");
  });

  it("rewrites service worker and manifest paths for proxied apps", () => {
    const localProxyBase = "/api/apps/local/%40elizaos%2Fapp-babylon";
    const localProxyRoot = `${localProxyBase}/`;
    const input =
      'navigator.serviceWorker.register("/sw.js",{scope:"/"});const m="/manifest.webmanifest";';

    const output = rewriteManagedAppProxyJavaScript(
      "@elizaos/app-babylon",
      input,
      localProxyBase,
      localProxyRoot,
      "/_next/static/chunks/app.js",
    );

    expect(output).toContain(`"${localProxyRoot}sw.js"`);
    expect(output).toContain(`"${localProxyRoot}manifest.webmanifest"`);
  });

  it("rewrites root-relative hyperscape audio paths", () => {
    const localProxyBase = "/api/apps/local/%40elizaos%2Fapp-hyperscape";
    const localProxyRoot = `${localProxyBase}/`;
    const input = 'const track="/audio/music/river.mp3";';

    const output = rewriteManagedAppProxyJavaScript(
      "@elizaos/app-hyperscape",
      input,
      localProxyBase,
      localProxyRoot,
      "/assets/index.js",
    );

    expect(output).toContain(`"${localProxyRoot}audio/music/river.mp3"`);
  });
});
