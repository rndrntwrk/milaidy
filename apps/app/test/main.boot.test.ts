import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("renderer boot guard", () => {
  it("keeps React root and platform boot initialization idempotent", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "../src/main.tsx"),
      "utf-8",
    );

    expect(source).toContain("__MILADY_REACT_ROOT__?: Root");
    expect(source).toContain("__MILADY_APP_BOOT_PROMISE__?: Promise<void>");
    expect(source).toContain("window.__MILADY_REACT_ROOT__ ?? createRoot(rootEl)");
    expect(source).toContain("if (window.__MILADY_APP_BOOT_PROMISE__)");
  });

  it("defers the eager Agent status probe while browser auth is required", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "../src/main.tsx"),
      "utf-8",
    );

    expect(source).toContain("const auth = await client.getAuthStatus()");
    expect(source).toContain(
      "if (auth?.required && !auth.localAccess && !auth.authenticated)",
    );
    expect(source.indexOf("client.getAuthStatus")).toBeLessThan(
      source.indexOf("Agent.getStatus()"),
    );
  });

  it("keeps the milaidy App and provider on the same React context", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "../src/main.tsx"),
      "utf-8",
    );

    expect(source).toContain('import { App } from "@miladyai/app-core/App"');
    expect(source).toMatch(
      /AppProvider[\s\S]*useApp[\s\S]*from "@miladyai\/app-core\/state"/,
    );
    expect(source).not.toMatch(
      /import\s*{[^}]*\bAppProvider\b[^}]*}\s*from "@elizaos\/app-core"/,
    );
    expect(source).not.toMatch(
      /import\s*{[^}]*\buseApp\b[^}]*}\s*from "@elizaos\/app-core"/,
    );
  });

  it("keeps upstream mobile runtime helpers on the UI onboarding subpaths", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "../src/main.tsx"),
      "utf-8",
    );

    expect(source).toMatch(
      /MOBILE_RUNTIME_MODE_STORAGE_KEY[\s\S]*normalizeMobileRuntimeMode[\s\S]*from "@elizaos\/ui\/onboarding\/mobile-runtime-mode"/,
    );
    expect(source).toContain(
      'import { preSeedAndroidLocalRuntimeIfFresh } from "@elizaos/ui/onboarding/pre-seed-local-runtime"',
    );
    expect(source).not.toMatch(
      /MOBILE_RUNTIME_MODE_STORAGE_KEY[\s\S]*from "@miladyai\/app-core\/config"/,
    );
    expect(source).not.toMatch(
      /preSeedAndroidLocalRuntimeIfFresh[\s\S]*from "@miladyai\/app-core\/config"/,
    );
  });

  it("exports the direct launch connection helper from the milaidy platform barrel", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const platformDir = path.resolve(
      testDir,
      "../../../packages/app-core/src/platform",
    );
    const browserLaunch = fs.readFileSync(
      path.join(platformDir, "browser-launch.ts"),
      "utf-8",
    );
    const platformIndex = fs.readFileSync(
      path.join(platformDir, "index.ts"),
      "utf-8",
    );

    expect(browserLaunch).toContain("export function applyLaunchConnection");
    expect(platformIndex).toMatch(
      /applyLaunchConnection[\s\S]*applyLaunchConnectionFromUrl[\s\S]*from "\.\/browser-launch"/,
    );
  });

  it("keeps app-window navigation helpers available through the milaidy platform barrel", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const appCoreDir = path.resolve(testDir, "../../../packages/app-core/src");
    const navigation = fs.readFileSync(
      path.join(appCoreDir, "navigation/index.ts"),
      "utf-8",
    );
    const platformIndex = fs.readFileSync(
      path.join(appCoreDir, "platform/index.ts"),
      "utf-8",
    );

    expect(navigation).toContain("export function isAppWindowRoute");
    expect(navigation).toContain("export function getWindowNavigationPath");
    expect(platformIndex).toMatch(
      /getWindowNavigationPath[\s\S]*isAppWindowRoute[\s\S]*from "\.\.\/navigation"/,
    );
  });

  it("keeps mobile runtime mode change events exported from milaidy app-core events", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const events = fs.readFileSync(
      path.resolve(testDir, "../../../packages/app-core/src/events/index.ts"),
      "utf-8",
    );

    expect(events).toContain(
      "export const MOBILE_RUNTIME_MODE_CHANGED_EVENT",
    );
    expect(events).toMatch(
      /ElizaDocumentEventName[\s\S]*typeof MOBILE_RUNTIME_MODE_CHANGED_EVENT/,
    );
  });
});
