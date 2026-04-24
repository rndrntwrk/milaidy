import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs module, no declaration file.
import {
  assertReleaseContractTestsExist,
  cleanupLegacyElectrobunCompatDir,
  ensureLegacyElectrobunCompatDir,
  releaseContractTests,
} from "./run-release-contract-suite.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-release-contract-suite-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("run release contract suite", () => {
  it("creates and cleans the legacy Electrobun compat dir with release-check markers", () => {
    const repoRoot = makeTempRoot();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    fs.mkdirSync(path.join(canonicalDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "electrobun.config.ts"),
      "export default {};\n",
    );
    fs.writeFileSync(
      path.join(canonicalDir, "README.md"),
      "legacy compat smoke asset\n",
    );
    fs.writeFileSync(
      path.join(canonicalDir, "scripts", "smoke-test-windows.ps1"),
      "Write-Host 'smoke'\n",
    );
    fs.writeFileSync(
      path.join(canonicalDir, "scripts", "verify-windows-installer-proof.ps1"),
      "Write-Host 'proof'\n",
    );

    expect(ensureLegacyElectrobunCompatDir({ legacyDir, canonicalDir })).toBe(
      true,
    );

    const wrapper = fs.readFileSync(
      path.join(legacyDir, "electrobun.config.ts"),
      "utf8",
    );
    expect(wrapper).toContain(
      'import canonicalConfig from "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts";',
    );
    expect(wrapper).toContain("release-check legacy marker");

    const smokeScript = fs.readFileSync(
      path.join(legacyDir, "scripts", "smoke-test-windows.ps1"),
      "utf8",
    );
    expect(smokeScript).toContain("release-check legacy marker");

    const installerProofScript = fs.readFileSync(
      path.join(legacyDir, "scripts", "verify-windows-installer-proof.ps1"),
      "utf8",
    );
    expect(installerProofScript).toContain("release-check legacy marker");
    expect(fs.existsSync(path.join(legacyDir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(canonicalDir, "build"))).toBe(true);
    expect(fs.existsSync(path.join(canonicalDir, "artifacts"))).toBe(true);
    expect(fs.lstatSync(path.join(legacyDir, "build")).isSymbolicLink()).toBe(
      true,
    );
    expect(
      fs.lstatSync(path.join(legacyDir, "artifacts")).isSymbolicLink(),
    ).toBe(true);

    cleanupLegacyElectrobunCompatDir(true, legacyDir);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it("cleans generated compat entries without deleting tracked legacy files", () => {
    const repoRoot = makeTempRoot();
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    fs.mkdirSync(path.join(legacyDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(legacyDir, ".gitignore"), "*\n!.gitignore\n");
    fs.writeFileSync(
      path.join(legacyDir, "scripts", "ensure-whisper-model.sh"),
      "#!/usr/bin/env bash\n",
    );
    fs.writeFileSync(
      path.join(legacyDir, "electrobun.config.ts"),
      "generated\n",
    );
    fs.writeFileSync(path.join(legacyDir, "README.md"), "generated\n");
    fs.writeFileSync(
      path.join(legacyDir, "scripts", "generated.sh"),
      "generated\n",
    );

    cleanupLegacyElectrobunCompatDir(true, legacyDir, {
      root: repoRoot,
      trackedRelativePaths: [
        "apps/app/electrobun/.gitignore",
        "apps/app/electrobun/scripts/ensure-whisper-model.sh",
      ],
    });

    expect(fs.existsSync(path.join(legacyDir, ".gitignore"))).toBe(true);
    expect(
      fs.existsSync(path.join(legacyDir, "scripts", "ensure-whisper-model.sh")),
    ).toBe(true);
    expect(fs.existsSync(path.join(legacyDir, "electrobun.config.ts"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(legacyDir, "README.md"))).toBe(false);
    expect(fs.existsSync(path.join(legacyDir, "scripts", "generated.sh"))).toBe(
      false,
    );
  });

  it("skips compat dir creation when the canonical dir is missing", () => {
    const repoRoot = makeTempRoot();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    expect(ensureLegacyElectrobunCompatDir({ legacyDir, canonicalDir })).toBe(
      false,
    );
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it("cleans the legacy compat dir if setup throws midway", () => {
    const repoRoot = makeTempRoot();
    const canonicalDir = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "electrobun",
    );
    const legacyDir = path.join(repoRoot, "apps", "app", "electrobun");

    fs.mkdirSync(path.join(canonicalDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "README.md"),
      "legacy compat smoke asset\n",
    );

    expect(() =>
      ensureLegacyElectrobunCompatDir({
        legacyDir,
        canonicalDir,
        copyEntry: () => {
          throw new Error("boom");
        },
      }),
    ).toThrow("boom");
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it("fails before vitest when a named release contract test is missing", () => {
    const repoRoot = makeTempRoot();
    const existing = path.join(repoRoot, "scripts", "release.test.ts");
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, "import { test } from 'vitest';\n");

    expect(() =>
      assertReleaseContractTestsExist(
        ["scripts/release.test.ts", "scripts/missing.test.ts"],
        repoRoot,
      ),
    ).toThrow("scripts/missing.test.ts");
  });

  it("keeps the release contract suite pointed at existing tests", () => {
    expect(() =>
      assertReleaseContractTestsExist(releaseContractTests),
    ).not.toThrow();
  });
});
