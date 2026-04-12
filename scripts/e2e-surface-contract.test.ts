import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const ACTIVE_E2E_ROOTS = [
  path.join(ROOT, "packages", "agent", "test"),
  path.join(ROOT, "packages", "app-core", "test"),
  path.join(ROOT, "test"),
  path.join(ROOT, "apps", "app", "test"),
];
const E2E_FILE_PATTERN = /e2e\.(?:test|spec)\.[cm]?[jt]sx?$/;
const LIVE_E2E_FILE_PATTERN =
  /(?:^|[-.])(?:live|real)\.e2e\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DISALLOWED_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "vi.mock", regex: /\bvi\.mock\(/ },
  { label: "vi.stubGlobal", regex: /\bvi\.stubGlobal\(/ },
  { label: "vi.spyOn", regex: /\bvi\.spyOn\(/ },
  { label: "jsdom e2e", regex: /@vitest-environment\s+jsdom/ },
  { label: "hard skip", regex: /\b(?:it|test|describe)\.skip\(/ },
  { label: "conditional describe", regex: /\bdescribeIf\(/ },
  { label: "conditional it", regex: /\bitIf\(/ },
  { label: "conditional skip", regex: /\bskipIf\(/ },
  { label: "unit-level label", regex: /unit-level/i },
  { label: "contract label", regex: /e2e contract/i },
];

function isDefaultE2eFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    E2E_FILE_PATTERN.test(path.basename(normalized)) &&
    !LIVE_E2E_FILE_PATTERN.test(path.basename(normalized))
  );
}

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (isDefaultE2eFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

describe("E2E surface contract", () => {
  it("keeps the main e2e Vitest config free of test stubs", () => {
    const config = fs.readFileSync(
      path.join(ROOT, "vitest.e2e.config.ts"),
      "utf8",
    );
    expect(config).not.toContain("test/stubs");
  });

  it("keeps the main e2e Vitest config scoped away from live/real suites", () => {
    const config = fs.readFileSync(
      path.join(ROOT, "vitest.e2e.config.ts"),
      "utf8",
    );
    expect(config).toContain("**/*.live.e2e.test.ts");
    expect(config).toContain("**/*.real.e2e.test.ts");
  });

  it("keeps active default e2e files free of mocks, gates, jsdom harnesses, and skips", () => {
    const violations: string[] = [];

    for (const root of ACTIVE_E2E_ROOTS) {
      if (!fs.existsSync(root)) {
        continue;
      }

      for (const file of collectFiles(root)) {
        const source = fs.readFileSync(file, "utf8");

        for (const { label, regex } of DISALLOWED_PATTERNS) {
          if (regex.test(source)) {
            violations.push(`${path.relative(ROOT, file)} -> ${label}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
