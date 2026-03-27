import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(
  import.meta.dirname,
  "build-patched-electrobun-cli.mjs",
);

describe("build-patched-electrobun-cli", () => {
  it("builds a patched upstream Windows CLI that resolves rcedit from the workspace install", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("https://github.com/blackboardsh/electrobun.git");
    expect(script).toContain('"sparse-checkout", "set", "package"');
    expect(script).toContain("ELECTROBUN_RCEDIT_PACKAGE_JSON");
    expect(script).toContain('"templates"');
    expect(script).toContain('"embedded.ts"');
    expect(script).toContain("async function importRcedit()");
    expect(script).toContain('overrideRequire.resolve("rcedit")');
    expect(script).toContain("--target=bun-windows-x64-baseline");
    expect(script).toContain('path.join(installedElectrobunDir, "bin", "electrobun.exe")');
    expect(script).toContain("const installedCachePath = path.join(");
    expect(script).toContain('  installedElectrobunDir,');
    expect(script).toContain('  ".cache",');
    expect(script).toContain('  "electrobun.exe",');
  });
});
