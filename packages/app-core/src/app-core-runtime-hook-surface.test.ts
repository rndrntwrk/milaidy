import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for the AppCoreRuntimeModule surface.
 *
 * In the deploy layout the bundled eliza agent loads its runtime hooks via
 * `await import("@elizaos/app-core")`, which the @elizaos->milady remap
 * (docker/Dockerfile, scripts/awsless/runpod-bootstrap-server.mjs) repoints at
 * THIS package (packages/app-core), not eliza/packages/app-core. The agent then
 * destructures a fixed set of names (eliza/packages/agent/src/runtime/eliza.ts
 * AppCoreRuntimeModule). If this barrel stops re-exporting any of them, the
 * destructure yields undefined and runtime-boot crashes post-remap with
 * `TypeError: <name> is not a function` — exactly the regression that the
 * getBuildVariant/isStoreBuild re-export fixed.
 *
 * Asserted statically against the barrel source so the check needs neither a
 * build nor a runtime import of the (server-only) barrel.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const barrel = readFileSync(path.join(here, "index.ts"), "utf8");

const REQUIRED_RUNTIME_HOOK_EXPORTS = [
  "runVaultBootstrap",
  "sharedVault",
  "getDefaultAccountPool",
  "applyAccountPoolApiCredentials",
  "startAccountPoolKeepAlive",
  "hydrateWalletKeysFromNodePlatformSecureStore",
  "getBuildVariant",
  "isStoreBuild",
];

describe("@elizaos/app-core runtime-hook surface (post-remap contract)", () => {
  for (const name of REQUIRED_RUNTIME_HOOK_EXPORTS) {
    it(`re-exports ${name} for the eliza agent's importAppCoreRuntime`, () => {
      // Matches `export { ... name ... } from "..."` or `export { name } ...`.
      const exported = new RegExp(
        `export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`,
      ).test(barrel);
      expect(exported).toBe(true);
    });
  }
});
