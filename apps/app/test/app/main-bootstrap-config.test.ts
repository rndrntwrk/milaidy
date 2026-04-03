import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MAIN_ENTRY_PATH = path.resolve(import.meta.dirname, "../../src/main.tsx");

describe("app main bootstrap config", () => {
  it("seeds boot config from injected desktop api globals", () => {
    const source = fs.readFileSync(MAIN_ENTRY_PATH, "utf8");

    expect(source).toContain("function readInjectedMiladyApiBase()");
    expect(source).toContain("function readInjectedMiladyApiToken()");
    expect(source).toContain("apiBase: readInjectedMiladyApiBase()");
    expect(source).toContain("apiToken: readInjectedMiladyApiToken()");
  });

  it("subscribes to apiBaseUpdate messages to keep boot config aligned", () => {
    const source = fs.readFileSync(MAIN_ENTRY_PATH, "utf8");

    expect(source).toContain("function installElectrobunApiBaseSync(): void");
    expect(source).toContain('rpcMessage: "apiBaseUpdate"');
    expect(source).toContain("syncBootConfigFromInjectedApiState(update)");
    expect(source).toContain("installElectrobunApiBaseSync();");
  });

  it("treats the desktop runtime as non-cloud-only even before the api-base sync lands", () => {
    const source = fs.readFileSync(MAIN_ENTRY_PATH, "utf8");

    expect(source).toContain("desktopRuntime: isElectrobunRuntime()");
  });
});
