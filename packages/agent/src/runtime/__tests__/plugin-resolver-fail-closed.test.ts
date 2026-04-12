import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pluginResolverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "plugin-resolver.ts"),
  "utf-8",
);

describe("plugin resolver fail-closed regressions", () => {
  it("does not synthesize provider error payloads", () => {
    expect(pluginResolverSource).not.toContain("_providerError");
    expect(pluginResolverSource).not.toContain(
      "data: { _providerError: true }",
    );
    expect(pluginResolverSource).toContain("throw err;");
  });
});
