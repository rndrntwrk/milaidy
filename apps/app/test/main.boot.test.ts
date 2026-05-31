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
});
