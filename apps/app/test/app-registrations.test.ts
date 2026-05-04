import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import appConfig from "../app.config";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

/**
 * Contract tests for app registration wiring.
 *
 * When a new elizaOS app is added to the Milady shell it must be wired in
 * three places: app.config.ts (defaultApps), tsconfig.json (path aliases),
 * and vite.config.ts (route modules). These tests enforce that all three stay
 * in sync so a partially-wired app does not silently fail at runtime.
 */
describe("app registration contracts", () => {
  it("app-workflow-builder is listed in defaultApps", () => {
    expect(appConfig.defaultApps).toContain("@elizaos/app-workflow-builder");
  });

  it("app-workflow-builder has tsconfig path aliases for the source checkout", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );
    const paths: Record<string, string[]> = tsconfig?.compilerOptions?.paths ?? {};
    expect(paths["@elizaos/app-workflow-builder"]).toBeDefined();
    expect(paths["@elizaos/app-workflow-builder/*"]).toBeDefined();
  });

  it("app-workflow-builder route module is included in the vite build", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );
    expect(viteConfigText).toContain(
      "@elizaos/app-workflow-builder/register-routes",
    );
  });

  it("all defaultApps have corresponding tsconfig path aliases", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );
    const paths: Record<string, string[]> = tsconfig?.compilerOptions?.paths ?? {};

    for (const appPkg of appConfig.defaultApps) {
      expect(paths[appPkg], `${appPkg} missing from tsconfig paths`).toBeDefined();
      expect(
        paths[`${appPkg}/*`],
        `${appPkg}/* missing from tsconfig paths`,
      ).toBeDefined();
    }
  });
});
