import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test } from "node:test";

describe("Electrobun release runtime root contract", () => {
  test("release workflow pins Electrobun copy resolution to the wrapper repo", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/release-electrobun.yml",
      "utf8",
    );

    assert.match(workflow, /name: Validate Electrobun runtime copy contract/);
    assert.match(
      workflow,
      /ELIZA_ELECTROBUN_REPO_ROOT: \$\{\{ github\.workspace \}\}/,
    );
    assert.match(workflow, /expectedRuntimeSource = path\.resolve\("dist"\)/);
    assert.match(workflow, /destination\]\) => destination === "eliza-dist"/);
  });

  test("Electrobun config exposes wrapper-aware repo root resolution", () => {
    const config = fs.readFileSync(
      "eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
      "utf8",
    );

    assert.match(config, /ELIZA_ELECTROBUN_REPO_ROOT/);
    assert.match(config, /hasOuterElizaElectrobunCheckout/);
    assert.match(config, /export function resolveElectrobunRepoRoot/);
  });
});
