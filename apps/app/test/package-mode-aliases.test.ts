import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

describe("package mode aliases", () => {
  it("stubs unpublished optional app packages", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );

    expect(tsconfig.compilerOptions.paths["@elizaos/app-lifeops/*"]).toEqual([
      "./apps/app/src/optional-eliza-app-stub.tsx",
    ]);
  });

  it("stubs unpublished native plugin packages", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );

    expect(tsconfig.compilerOptions.paths["@elizaos/capacitor-agent"]).toEqual([
      "./apps/app/src/native-plugin-stubs.ts",
    ]);
  });
});
