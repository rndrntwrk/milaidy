import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("agent auth routes source regression guard", () => {
  it("reports auth disabled and suppresses pairing when API auth is disabled", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "auth-routes.ts"),
      "utf-8",
    );

    expect(source).toContain(
      'import { getConfiguredApiToken, isApiAuthDisabled } from "./server-auth.js";',
    );
    expect(source).toContain(
      "if (isApiAuthDisabled() || isCloudProvisionedContainer())",
    );
    expect(source).toContain(
      "const enabled = !isApiAuthDisabled() && pairingEnabled();",
    );
  });
});
