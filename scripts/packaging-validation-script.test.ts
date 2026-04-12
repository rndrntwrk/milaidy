import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(
  import.meta.dirname,
  "..",
  "packaging",
  "test-packaging.sh",
);

describe("packaging/test-packaging.sh", () => {
  const source = readFileSync(scriptPath, "utf8");

  it("probes for the optional PyYAML dependency before YAML syntax checks", () => {
    expect(source).toContain("python_has_module()");
    expect(source).toContain("if python_has_module yaml; then");
  });

  it("skips YAML validation cleanly when PyYAML is unavailable", () => {
    expect(source).toContain('skip "YAML syntax valid" "pyyaml not installed"');
    expect(source).toContain(
      'skip "Manifest YAML valid" "pyyaml not installed"',
    );
    expect(source).toContain(
      'skip "Workflow YAML valid" "pyyaml not installed"',
    );
  });
});
