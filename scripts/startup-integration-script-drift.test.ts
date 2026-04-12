import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const INTEGRATION_CONFIG_PATH = path.join(ROOT, "vitest.integration.config.ts");
const TEST_PARALLEL_PATH = path.join(
  ROOT,
  "test",
  "scripts",
  "test-parallel.mjs",
);

describe("startup test script contract", () => {
  it("does not keep a dead startup integration suite wired into package scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["test:startup:integration"]).toBeUndefined();
  });

  it("does not exclude nonexistent startup specs from the shared integration config", () => {
    const config = fs.readFileSync(INTEGRATION_CONFIG_PATH, "utf8");

    expect(config).not.toContain(
      '"packages/app-core/test/app/startup-chat.integration.test.ts"',
    );
    expect(config).not.toContain(
      '"packages/app-core/test/app/startup-onboarding.integration.test.ts"',
    );
    expect(config).not.toContain(
      '"packages/app-core/test/app/startup-backend-missing.integration.test.ts"',
    );
    expect(config).not.toContain(
      '"packages/app-core/test/app/startup-token-401.integration.test.ts"',
    );
  });

  it("does not run a removed startup integration lane in the full test wrapper", () => {
    const runner = fs.readFileSync(TEST_PARALLEL_PATH, "utf8");

    expect(runner).not.toContain('name: "startup-integration"');
    expect(runner).not.toContain('args: ["run", "test:startup:integration"]');
  });

  it("invokes the runtime helper through node so root scripts stay Windows-safe", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scriptsUsingRuntimeHelper = Object.entries(pkg.scripts ?? {}).filter(
      ([, script]) => script.includes("scripts/rt.mjs"),
    );

    expect(scriptsUsingRuntimeHelper.length).toBeGreaterThan(0);

    for (const [, script] of scriptsUsingRuntimeHelper) {
      expect(script).toContain("node scripts/rt.mjs");
      expect(script).not.toContain("&& scripts/rt.sh");
      expect(script).not.toMatch(/^scripts\/rt\.sh\b/);
    }
  });

  it("uses Vitest 4 top-level worker options in the shared integration config", () => {
    const config = fs.readFileSync(INTEGRATION_CONFIG_PATH, "utf8");

    expect(config).toContain("isolate: true");
    expect(config).toContain("fileParallelism: false");
    expect(config).toContain('pool: "forks"');
    expect(config).not.toContain("poolOptions:");
    expect(config).toContain("maxWorkers: 1");
    expect(config).toContain('execArgv: ["--max-old-space-size=4096"]');
  });
});
